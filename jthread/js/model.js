/*
 * threadsee - thread dump model.
 *
 * A JavaScript rewrite of the parsing and analysis in TDA - Thread Dump Analyzer
 * (https://github.com/irockel/tda), and like TDA licensed under the
 * Lesser GNU General Public License 2.1 or later.
 *
 * This file knows nothing about any user interface. It turns the text of a log
 * file into ThreadDump objects and offers analyses over them. The same file runs
 * in the browser and under Node (for the tests).
 */
(function (root) {
    'use strict';

    const DUMP_START = 'Full thread dump';
    const WRAPPER_PREFIX = 'INFO   | jvm ';
    const WRAPPER_WIDTH = 42;
    const TIMESTAMP = /(\d{4}-\d\d-\d\d[\sT]\d\d:\d\d:\d\d)/;
    const LOCKED_OBJECT = /<([^>]+)>/;
    const CLASS_NAME = /\(a ([^)]+)\)/;
    const PARK_OWNER = /, owner #(\d+)/;
    const LOCK_ACQUISITION = /(ReentrantLock|ReentrantReadWriteLock|Semaphore)\$(Nonfair|Fair)?Sync$/;

    /** The two text formats a thread dump can arrive in. */
    const DumpFormat = Object.freeze({
        JSTACK: 'jstack',          // "Full thread dump": jstack, jcmd Thread.print, kill -3
        JCMD_TEXT: 'jcmd-text'     // jcmd Thread.dump_to_file (JDK 21 and later)
    });

    /** How a thread relates to a monitor or lock, taken from its "- ..." lines. */
    const LockKind = Object.freeze({
        LOCKED: 'locked',
        WAITING_TO_LOCK: 'waiting to lock',
        WAITING_ON: 'waiting on',
        PARKED_ON_LOCK: 'parked on lock',
        PARKED_FOR_EVENT: 'parked for event',
        OWNS: 'owns synchronizer',
        ELIMINATED: 'eliminated'
    });

    /** Decodes the bytes of a log file, recognising the UTF-16 logs TDA learned to read. */
    class CharsetSniffer {
        decode(bytes) {
            return new TextDecoder(this.encodingOf(bytes)).decode(bytes);
        }

        encodingOf(bytes) {
            if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
                return 'utf-16le';
            }
            if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
                return 'utf-16be';
            }
            if (bytes.length >= 4 && bytes[1] === 0 && bytes[3] === 0) {
                return 'utf-16le';
            }
            if (bytes.length >= 4 && bytes[0] === 0 && bytes[2] === 0) {
                return 'utf-16be';
            }
            return 'utf-8';
        }
    }

    /** One "- ..." line in a thread's stack: a monitor or synchronizer the thread holds or wants. */
    class LockEvent {
        constructor(kind, address, className, line, ownerNumber) {
            this.kind = kind;
            this.address = address;
            this.className = className;
            this.line = line;
            this.ownerNumber = ownerNumber;   // jcmd Thread.dump_to_file prints the owner of a parked-on lock
            Object.freeze(this);
        }

        isBlockingAcquire() {
            return this.kind === LockKind.WAITING_TO_LOCK || this.kind === LockKind.PARKED_ON_LOCK;
        }

        isConditionWait() {
            return this.kind === LockKind.WAITING_ON || this.kind === LockKind.PARKED_FOR_EVENT;
        }

        isHold() {
            return this.kind === LockKind.LOCKED || this.kind === LockKind.OWNS;
        }
    }

    /** Reads a "- ..." line into a LockEvent, or null when the line names no monitor. */
    class LockLineReader {
        read(line, inOwnableSynchronizers) {
            const text = line.trim();
            const object = this.match(LOCKED_OBJECT, text);
            if (object === null) {
                return null;
            }
            const className = this.classNameOf(object, text);
            if (className === undefined) {
                return null;   // e.g. <no object reference available>
            }
            const kind = this.kindOf(text, className, inOwnableSynchronizers);
            return kind === null ? null : new LockEvent(kind, object, className, text, this.match(PARK_OWNER, text));
        }

        /** jstack names an object by address and "(a Class)"; jcmd Thread.dump_to_file by Class@identityHash. */
        classNameOf(object, text) {
            if (/^0x[0-9a-fA-F]+$/.test(object)) {
                return this.match(CLASS_NAME, text);
            }
            const at = object.lastIndexOf('@');
            return at > 0 ? object.substring(0, at) : undefined;
        }

        kindOf(text, className, inOwnableSynchronizers) {
            if (inOwnableSynchronizers) {
                return LockKind.OWNS;
            }
            if (text.startsWith('- locked')) {
                return LockKind.LOCKED;
            }
            if (text.startsWith('- waiting to')) {
                return LockKind.WAITING_TO_LOCK;   // "waiting to lock" and JDK 20+ "waiting to re-lock in wait()"
            }
            if (text.startsWith('- waiting on')) {
                return LockKind.WAITING_ON;
            }
            if (text.startsWith('- parking to wait for')) {
                return this.isSynchronizer(className) ? LockKind.PARKED_ON_LOCK : LockKind.PARKED_FOR_EVENT;
            }
            if (text.startsWith('- eliminated')) {
                return LockKind.ELIMINATED;
            }
            return null;
        }

        /**
         * A thread parked on the Sync of a ReentrantLock, ReentrantReadWriteLock or Semaphore is blocked acquiring it.
         * Parked on anything else (a CountDownLatch, a ConditionObject, a FutureTask) it waits for an event.
         */
        isSynchronizer(className) {
            return className !== null && LOCK_ACQUISITION.test(className);
        }

        match(pattern, text) {
            const found = pattern.exec(text);
            return found === null ? null : found[1];
        }
    }

    /** One thread in one dump, built from its header line and the lines below it. */
    class JavaThread {
        constructor(header, lineNumber, headerReader) {
            this.header = header;
            this.lineNumber = lineNumber;
            this.lines = [header];
            this.frames = [];
            this.locks = [];
            this.threadState = '';
            this.carriedVirtualThread = null;
            this.carrierStuckInApplicationCode = false;
            headerReader.read(header, this);
        }

        /** Adds a line below the header; frame is passed when the format prints frames without "at". */
        add(line, lockEvent, frame) {
            this.lines.push(line);
            const text = line.trim();
            if (frame !== undefined) {
                this.frames.push(frame);
            } else if (text.startsWith('at ')) {
                this.frames.push(text.substring(3));
            } else if (text.startsWith('java.lang.Thread.State:')) {
                this.threadState = text.substring('java.lang.Thread.State:'.length).trim();
            } else if (text.startsWith('Carrying virtual thread')) {
                this.carriedVirtualThread = text.substring('Carrying virtual thread'.length).trim();
                this.carrierStuckInApplicationCode = this.hasApplicationFrame();
            }
            if (lockEvent !== null) {
                this.locks.push(lockEvent);
            }
        }

        /** Port of TDA's check for a carrier thread stuck in application code. */
        hasApplicationFrame() {
            for (const frame of this.frames) {
                if (!/java\.lang\.VirtualThread\.run|java\.util\.concurrent\.ForkJoin|java\.base@|jdk\.internal/.test(frame)) {
                    return true;
                }
            }
            return false;
        }

        finish() {
            while (this.lines.length > 1 && this.lines[this.lines.length - 1].trim() === '') {
                this.lines.pop();
            }
            Object.freeze(this.frames);
            Object.freeze(this.locks);
            Object.freeze(this.lines);
            Object.freeze(this);
        }

        /** Identifies the same thread across dumps of one JVM. */
        identity() {
            return this.name + '|' + (this.tid !== null ? this.tid : '#' + this.number);
        }

        /** The thread's text without the cpu=, elapsed= and timestamp values, which change between dumps. */
        signature() {
            return this.lines.join('\n').replace(/ cpu=[\d.]+ms/, '').replace(/ elapsed=[\d.]+s/, '')
                .replace(/ \d{4}-\d\d-\d\dT[\d:.]+Z/, '');
        }

        type() {
            if (this.isVirtual) {
                return 'Virtual';
            }
            if (this.isDaemon === null) {
                return 'Platform';   // jcmd Thread.dump_to_file does not say whether a thread is a daemon
            }
            return this.isDaemon ? 'Daemon' : 'Task';
        }

        isWaitingForMonitor() {
            return this.locks.some(function (lock) { return lock.isBlockingAcquire(); });
        }

        isSleepingOnMonitor() {
            return this.locks.some(function (lock) { return lock.isConditionWait(); });
        }

        isLockingMonitor() {
            return this.locks.some(function (lock) { return lock.isHold(); });
        }

        isVirtualOrCarrier() {
            return this.isVirtual || this.carriedVirtualThread !== null;
        }

        text() {
            return this.lines.join('\n');
        }
    }

    /** Reads the fields of a HotSpot thread header line (JDK 8 and later) into a JavaThread. */
    class ThreadHeaderReader {
        read(header, thread) {
            const nameEnd = header.lastIndexOf('"');
            const attributes = nameEnd > 0 ? header.substring(nameEnd + 1) : '';
            thread.name = nameEnd > 0 ? header.substring(1, nameEnd) : header;
            thread.number = this.field(/#(\d+)/, attributes);
            thread.isDaemon = /\bdaemon\b/.test(attributes);
            thread.isVirtual = /\bvirtual\b/.test(attributes);
            thread.prio = this.field(/\bprio=(\d+)/, attributes);
            thread.osPrio = this.field(/os_prio=(-?\d+)/, attributes);
            thread.cpuMs = this.number(/cpu=([\d.]+)ms/, attributes);
            thread.elapsedS = this.number(/elapsed=([\d.]+)s/, attributes);
            thread.tid = this.field(/tid=(0x[0-9a-fA-F]+)/, attributes);
            thread.nid = this.field(/nid=(0x[0-9a-fA-F]+|\d+)/, attributes);
            thread.nativeId = this.nativeId(thread.nid);
            thread.addressRange = this.field(/\[(0x[0-9a-fA-F]+)\]\s*$/, attributes);
            thread.headerState = this.headerState(attributes);
        }

        headerState(attributes) {
            const nid = /nid=(0x[0-9a-fA-F]+|\d+)/.exec(attributes);
            if (nid === null) {
                return '';
            }
            return attributes.substring(nid.index + nid[0].length).replace(/\[0x[0-9a-fA-F]+\]\s*$/, '').trim();
        }

        nativeId(nid) {
            if (nid === null) {
                return null;
            }
            return nid.startsWith('0x') ? String(parseInt(nid, 16)) : nid;
        }

        field(pattern, text) {
            const found = pattern.exec(text);
            return found === null ? null : found[1];
        }

        number(pattern, text) {
            const found = pattern.exec(text);
            return found === null ? null : parseFloat(found[1]);
        }
    }

    /** Reads a jcmd Thread.dump_to_file header: #<thread id> "<name>" [virtual] [<state> <timestamp>]. */
    class JcmdThreadHeaderReader {
        read(header, thread) {
            const nameStart = header.indexOf('"');
            const nameEnd = header.lastIndexOf('"');
            const attributes = header.substring(nameEnd + 1);
            thread.name = header.substring(nameStart + 1, nameEnd);
            thread.number = header.substring(1, nameStart).trim();
            thread.isDaemon = null;
            thread.isVirtual = /\bvirtual\b/.test(attributes);
            thread.prio = null;
            thread.osPrio = null;
            thread.cpuMs = null;
            thread.elapsedS = null;
            thread.tid = null;
            thread.nid = null;
            thread.nativeId = null;
            thread.addressRange = null;
            thread.headerState = '';
            const state = /\b(NEW|RUNNABLE|BLOCKED|WAITING|TIMED_WAITING|TERMINATED)\b/.exec(attributes);
            thread.threadState = state === null ? '' : state[1];
        }
    }

    /** A "Found one Java-level deadlock" report: as the JVM printed it, or as threadsee found it in the lock lines. */
    class DeadlockReport {
        constructor(lines, foundBy) {
            this.lines = Object.freeze(lines.slice());
            this.foundBy = foundBy;
            this.threadNames = Object.freeze(this.namesIn(lines));
            Object.freeze(this);
        }

        namesIn(lines) {
            const names = [];
            for (const line of lines) {
                const found = /^"(.*)":\s*$/.exec(line);
                if (found !== null && names.indexOf(found[1]) < 0) {
                    names.push(found[1]);
                }
            }
            return names;
        }

        text() {
            return this.lines.join('\n');
        }
    }

    /** One thread dump found in a file. It is numbered once the series it belongs to is complete. */
    class ThreadDump {
        constructor(source, lineNumber, timestamp, vmInfo, format) {
            this.number = null;
            this.source = source;
            this.sourceShown = false;
            this.format = format;
            this.lineNumber = lineNumber;
            this.timestamp = timestamp === null ? null : timestamp.substring(0, 19);
            this.instant = timestamp;   // full precision, for ordering dumps taken within the same second
            this.vmInfo = vmInfo;
            this.threads = [];
            this.deadlocks = [];
            this.smrLines = [];
            this.heapLines = [];
            this.jniReferences = null;
        }

        title() {
            const when = this.timestamp === null ? '' : ' around ' + this.timestamp;
            const where = this.sourceShown ? ' of ' + this.source : '';
            return 'Dump No. ' + this.number + ' at line ' + this.lineNumber + where + when;
        }

        /** HotSpot before JDK 8 is outside threadsee's supported range; its dumps are parsed on a best-effort basis. */
        isBeforeJdk8() {
            if (/\b1\.[4567]\.\d/.test(this.vmInfo)) {
                return true;
            }
            const express = /\((\d+)\.\d+-b\d+/.exec(this.vmInfo);
            return express !== null && parseInt(express[1], 10) < 25;
        }

        /** Addresses in the "Threads class SMR info" list that match no thread in the dump. */
        unresolvedSmrAddresses() {
            const known = new Set();
            for (const thread of this.threads) {
                if (thread.tid !== null) {
                    known.add(BigInt(thread.tid).toString(16));
                }
            }
            const unresolved = [];
            for (const line of this.smrLines) {
                if (line.indexOf('_java_thread_list=') >= 0) {
                    continue;
                }
                for (const address of line.match(/0x[0-9a-fA-F]+/g) || []) {
                    if (!known.has(BigInt(address).toString(16))) {
                        unresolved.push(address);
                    }
                }
            }
            return unresolved;
        }

        /** Takes the dump's place in its series and freezes it. */
        finish(number, sourceShown) {
            this.number = number;
            this.sourceShown = sourceShown;
            Object.freeze(this.threads);
            Object.freeze(this.deadlocks);
            Object.freeze(this.smrLines);
            Object.freeze(this.heapLines);
            Object.freeze(this);
        }
    }

    /**
     * The dumps read from the files opened together: one series, in timestamp order when every dump
     * has a timestamp, otherwise in the order of the files and of the dumps within them.
     */
    class ThreadDumpLog {
        constructor(sources) {
            this.sources = Object.freeze(sources.slice());
            this.name = sources.map(function (source) { return source.name; }).join(', ');
            this.dumps = [];
            this.filesWithoutDumps = [];
        }

        add(dump) {
            this.dumps.push(dump);
        }

        noDumpIn(source) {
            this.filesWithoutDumps.push(source.name);
        }

        finish() {
            if (this.dumps.every(function (dump) { return dump.instant !== null; })) {
                this.dumps.sort(function (a, b) { return a.instant < b.instant ? -1 : (a.instant > b.instant ? 1 : 0); });
            }
            const sourceShown = this.sources.length > 1;
            this.dumps.forEach(function (dump, index) { dump.finish(index + 1, sourceShown); });
            Object.freeze(this.dumps);
            Object.freeze(this.filesWithoutDumps);
            Object.freeze(this);
        }
    }

    /**
     * Reads the lines that belong to one dump. A dump runs from its "Full thread dump" line
     * to the next one (or the end of the file); sections are recognised by their own lines,
     * not by the name of the last thread, so JDK 21 dumps with GC threads after
     * "VM Periodic Task Thread" keep their deadlock reports.
     */
    class DumpSectionReader {
        constructor(dump) {
            this.dump = dump;
            this.thread = null;
            this.section = 'start';
            this.deadlockLines = null;
            this.inOwnableSynchronizers = false;
            this.lockLines = new LockLineReader();
            this.headerReader = new ThreadHeaderReader();
        }

        read(line, lineNumber) {
            const text = line.trim();
            if (this.startsSection(line, text, lineNumber)) {
                return;
            }
            if (this.section === 'thread') {
                this.addToThread(line, text);
            } else if (this.section === 'smr') {
                this.addToSmr(line, text);
            } else if (this.section === 'deadlock') {
                this.addToDeadlock(line, text);
            } else if (this.section === 'heap') {
                this.addToHeap(line, text);
            }
        }

        startsSection(line, text, lineNumber) {
            if (line.startsWith('"') && this.section !== 'deadlock') {
                this.startThread(line, lineNumber);
            } else if (text.startsWith('Threads class SMR info:')) {
                this.enter('smr');
                this.dump.smrLines.push(text);
            } else if (text.startsWith('JNI global ref')) {
                this.enter('after-threads');
                this.dump.jniReferences = text;
            } else if (text.startsWith('Found one Java-level deadlock')) {
                this.startDeadlock(text);
            } else if (text === 'Heap' && this.section !== 'deadlock') {
                this.enter('heap');
            } else {
                return false;
            }
            return true;
        }

        startThread(line, lineNumber) {
            this.enter('thread');
            this.thread = new JavaThread(line, lineNumber, this.headerReader);
            this.inOwnableSynchronizers = false;
        }

        addToThread(line, text) {
            if (text === '' || /^\s/.test(line)) {
                if (text.startsWith('Locked ownable synchronizers:')) {
                    this.inOwnableSynchronizers = true;
                }
                const lockEvent = text.startsWith('- ') ? this.lockLines.read(text, this.inOwnableSynchronizers) : null;
                this.thread.add(line, lockEvent);
            } else {
                this.enter('noise');   // an unindented line that is not part of the dump, e.g. interleaved logging
            }
        }

        addToSmr(line, text) {
            this.dump.smrLines.push(text);
            if (text === '}') {
                this.enter('threads-pending');
            }
        }

        startDeadlock(text) {
            this.closeDeadlock();
            this.enter('deadlock');
            this.deadlockLines = [text];
        }

        addToDeadlock(line, text) {
            if (/^Found \d+ deadlocks?\.$/.test(text)) {
                this.enter('after-threads');
                return;
            }
            if (!text.startsWith('=====')) {
                this.deadlockLines.push(line);
            }
        }

        closeDeadlock() {
            if (this.deadlockLines !== null) {
                while (this.deadlockLines.length > 0 && this.deadlockLines[this.deadlockLines.length - 1].trim() === '') {
                    this.deadlockLines.pop();
                }
                this.dump.deadlocks.push(new DeadlockReport(this.deadlockLines, 'JVM'));
                this.deadlockLines = null;
            }
        }

        addToHeap(line, text) {
            if (text === '' || !/^\s/.test(line)) {
                this.enter('after-threads');
            } else {
                this.dump.heapLines.push(line);
            }
        }

        enter(section) {
            if (this.section === 'thread') {
                this.closeThread();
            }
            if (this.section === 'deadlock' && section !== 'deadlock') {
                this.closeDeadlock();
            }
            this.section = section;
        }

        closeThread() {
            this.thread.finish();
            this.dump.threads.push(this.thread);
            this.thread = null;
        }

        finish() {
            this.enter('done');
            return this.dump;
        }
    }

    /**
     * Reads the file jcmd <pid> Thread.dump_to_file writes: a pid line, a timestamp, the runtime
     * version, then one block per thread headed #<thread id> "<name>". JDK 21 prints only the frames;
     * later JDKs add the thread state, "at" before each frame and lock lines naming Class@identityHash.
     */
    class JcmdTextDumpReader {
        constructor() {
            this.headerReader = new JcmdThreadHeaderReader();
            this.lockLines = new LockLineReader();
            this.thread = null;
        }

        recognises(lines) {
            return lines.length > 4 && /^-?\d+$/.test(lines[0].trim()) && /^\d{4}-\d\d-\d\dT/.test(lines[1].trim())
                && lines.slice(3, 12).some(function (line) { return /^#\d+ "/.test(line); });
        }

        read(lines, source) {
            const timestamp = /^(\d{4}-\d\d-\d\d)T(\d\d:\d\d:\d\d(\.\d+)?)/.exec(lines[1].trim());
            this.dump = new ThreadDump(source.name, 1, timestamp === null ? null : timestamp[1] + ' ' + timestamp[2],
                lines[2].trim(), DumpFormat.JCMD_TEXT);
            for (let index = 3; index < lines.length; index++) {
                this.readLine(lines[index], index + 1);
            }
            this.closeThread();
            return this;
        }

        readLine(line, lineNumber) {
            if (/^#\d+ "/.test(line)) {
                this.closeThread();
                this.thread = new JavaThread(line, lineNumber, this.headerReader);
            } else if (this.thread !== null && (line.trim() === '' || /^\s/.test(line))) {
                this.addToThread(line);
            } else {
                this.closeThread();
            }
        }

        addToThread(line) {
            const text = line.trim();
            if (text.startsWith('- ')) {
                this.thread.add(line, this.lockLines.read(text, false));
            } else if (text === '' || text.startsWith('at ')) {
                this.thread.add(line, null);
            } else {
                this.thread.add(line, null, text);   // JDK 21 prints frames without "at"
            }
        }

        closeThread() {
            if (this.thread !== null) {
                this.thread.finish();
                this.dump.threads.push(this.thread);
                this.thread = null;
            }
        }

        /** Same contract as DumpSectionReader, so ThreadDumpReader can close either. */
        finish() {
            return this.dump;
        }
    }

    /**
     * Finds the thread dumps in the files opened together and hands each one to the registered
     * listeners. A listener implements dumpRead(dump) and, optionally, logRead(log).
     */
    class ThreadDumpReader {
        constructor() {
            this.listeners = [];
        }

        register(listener) {
            this.listeners.push(listener);
        }

        read(name, text) {
            return this.readFiles([{ name: name, text: text }]);
        }

        /** Reads files opened together, each { name, text }, into one series of dumps. */
        readFiles(sources) {
            const log = new ThreadDumpLog(sources);
            for (const source of sources) {
                const before = log.dumps.length;
                this.readSource(source, log);
                if (log.dumps.length === before) {
                    log.noDumpIn(source);
                }
            }
            log.finish();
            this.announce(log);
            return log;
        }

        readSource(source, log) {
            const lines = source.text.split(/\r?\n/);
            const jcmdText = new JcmdTextDumpReader();
            if (jcmdText.recognises(lines)) {
                this.close(jcmdText.read(lines, source), log);
            } else {
                this.readJstackDumps(lines, log, source);
            }
        }

        readJstackDumps(lines, log, source) {
            let lastTimestamp = null;
            let section = null;
            for (let index = 0; index < lines.length; index++) {
                const line = this.unwrap(lines[index]);
                if (line.indexOf(DUMP_START) >= 0) {
                    this.close(section, log);
                    section = new DumpSectionReader(new ThreadDump(source.name, index + 1, lastTimestamp, this.vmInfo(line), DumpFormat.JSTACK));
                    lastTimestamp = null;
                } else if (section !== null) {
                    section.read(line, index + 1);
                }
                lastTimestamp = this.timestampIn(line, lastTimestamp);
            }
            this.close(section, log);
        }

        /** Lines written through the Tanuki service wrapper carry a 42 character prefix. */
        unwrap(line) {
            return line.startsWith(WRAPPER_PREFIX) ? line.substring(WRAPPER_WIDTH) : line;
        }

        vmInfo(line) {
            return line.substring(line.indexOf(DUMP_START) + DUMP_START.length).replace(/:\s*$/, '').trim();
        }

        timestampIn(line, previous) {
            const found = TIMESTAMP.exec(line);
            return found === null ? previous : found[1].replace('T', ' ');
        }

        close(section, log) {
            if (section !== null) {
                const dump = section.finish();
                if (dump.threads.length > 0) {
                    log.add(dump);
                }
            }
        }

        /** Listeners hear about the dumps once the series is ordered and numbered, then about the log. */
        announce(log) {
            for (const listener of this.listeners) {
                for (const dump of log.dumps) {
                    listener.dumpRead(dump);
                }
                if (typeof listener.logRead === 'function') {
                    listener.logRead(log);
                }
            }
        }
    }

    /** A monitor or java.util.concurrent synchronizer and the threads that hold it, want it or wait on it. */
    class Monitor {
        constructor(address, className) {
            this.address = address;
            this.className = className;
            this.holders = [];
            this.waiters = [];
            this.sleepers = [];
        }

        addOwner(thread) {
            this.addOnce(this.holders, thread);
        }

        add(thread, lock) {
            if (this.className === null && lock.className !== null) {
                this.className = lock.className;
            }
            if (lock.isHold()) {
                this.addOnce(this.holders, thread);
            } else if (lock.isBlockingAcquire()) {
                this.addOnce(this.waiters, thread);
            } else if (lock.isConditionWait()) {
                this.addOnce(this.sleepers, thread);
            }
        }

        addOnce(threads, thread) {
            if (threads.indexOf(thread) < 0) {
                threads.push(thread);
            }
        }

        /** A thread that both holds and waits on the monitor is in Object.wait() and has released it. */
        lockingThreads() {
            const sleepers = this.sleepers;
            return this.holders.filter(function (thread) { return sleepers.indexOf(thread) < 0; });
        }

        hasLockingThread() {
            return this.holders.length > 0;
        }

        /** TDA flags more than five threads waiting on one monitor as high congestion. */
        isCongested() {
            return this.waiters.length > 5;
        }

        label() {
            if (this.className === null || this.address.indexOf('@') > 0) {
                return '<' + this.address + '>';
            }
            return '<' + this.address + '> (a ' + this.className + ')';
        }
    }

    /** The monitors of one dump, keyed by address. */
    class MonitorIndex {
        constructor(dump) {
            this.monitors = new Map();
            for (const thread of dump.threads) {
                for (const lock of thread.locks) {
                    if (lock.kind !== LockKind.ELIMINATED) {
                        this.monitorAt(lock).add(thread, lock);
                    }
                }
            }
            this.addOwnersNamedOnParkingLines(dump);
        }

        /** jcmd Thread.dump_to_file ends a parking line with ", owner #<thread id>" when the lock has an owner. */
        addOwnersNamedOnParkingLines(dump) {
            const byNumber = new Map();
            for (const thread of dump.threads) {
                byNumber.set(thread.number, thread);
            }
            for (const thread of dump.threads) {
                for (const lock of thread.locks) {
                    if (lock.ownerNumber !== null && byNumber.has(lock.ownerNumber)) {
                        this.monitorAt(lock).addOwner(byNumber.get(lock.ownerNumber));
                    }
                }
            }
        }

        monitorAt(lock) {
            let monitor = this.monitors.get(lock.address);
            if (monitor === undefined) {
                monitor = new Monitor(lock.address, lock.className);
                this.monitors.set(lock.address, monitor);
            }
            return monitor;
        }

        all() {
            return Array.from(this.monitors.values());
        }

        withoutLockingThread() {
            return this.all().filter(function (monitor) { return !monitor.hasLockingThread(); });
        }

        find(address) {
            return this.monitors.get(address) || null;
        }
    }

    /**
     * The deadlocks of one dump. When the JVM printed a deadlock report, that report is the answer.
     * Otherwise (jcmd Thread.dump_to_file prints none) threadsee follows each thread that waits to
     * acquire a monitor or lock to the thread holding it, and reports every cycle it finds.
     */
    class Deadlocks {
        constructor(dump, monitors) {
            this.dump = dump;
            this.monitors = monitors;
        }

        list() {
            return this.dump.deadlocks.length > 0 ? this.dump.deadlocks : this.cycles();
        }

        cycles() {
            const waits = this.waitsFor();
            const reports = [];
            const done = new Set();
            for (const start of this.dump.threads) {
                const cycle = this.cycleFrom(start, waits, done);
                if (cycle !== null) {
                    reports.push(this.report(cycle, waits));
                }
            }
            return reports;
        }

        /** Maps each thread blocked acquiring a monitor or lock to { monitor, holder }. */
        waitsFor() {
            const waits = new Map();
            for (const thread of this.dump.threads) {
                for (const lock of thread.locks) {
                    const monitor = lock.isBlockingAcquire() ? this.monitors.find(lock.address) : null;
                    const holder = monitor === null ? null : this.holderOtherThan(monitor, thread);
                    if (holder !== null) {
                        waits.set(thread, { monitor: monitor, holder: holder });
                    }
                }
            }
            return waits;
        }

        holderOtherThan(monitor, thread) {
            const holders = monitor.lockingThreads().filter(function (holder) { return holder !== thread; });
            return holders.length > 0 ? holders[0] : null;
        }

        /** Walks the wait-for chain from start; returns the cycle it closes, ordered as in the dump, or null. */
        cycleFrom(start, waits, done) {
            const path = [];
            let thread = start;
            while (thread !== undefined && !done.has(thread) && path.indexOf(thread) < 0) {
                path.push(thread);
                thread = waits.has(thread) ? waits.get(thread).holder : undefined;
            }
            path.forEach(function (visited) { done.add(visited); });
            if (thread === undefined || path.indexOf(thread) < 0) {
                return null;
            }
            return path.slice(path.indexOf(thread));
        }

        report(cycle, waits) {
            const lines = ['Found one Java-level deadlock (found by JThread: this dump has no deadlock report from the JVM):'];
            for (const thread of cycle) {
                const wait = waits.get(thread);
                lines.push('"' + thread.name + '":');
                lines.push('  - waiting to lock ' + wait.monitor.label() + ',');
                lines.push('  which is held by "' + wait.holder.name + '"');
                lines.push('');
            }
            lines.push('Java stack information for the threads listed above:');
            for (const thread of cycle) {
                lines.push('"' + thread.name + '":');
                thread.lines.slice(1).forEach(function (line) { lines.push(line); });
            }
            return new DeadlockReport(lines, 'threadsee');
        }
    }

    /** What a thread is doing, judged from its frames alone: a dump's thread states cannot be trusted. */
    const Activity = Object.freeze({
        IDLE: 'idle',                 // a JDK thread or pool worker waiting for work
        JVM: 'jvm',                   // a thread with no Java frames: VM, GC, compiler and similar threads
        APPLICATION: 'application'    // everything else, including threads in native I/O
    });

    /**
     * The JDK methods in which a thread waits for work. A thread is idle when one of them is on its
     * stack with only JDK frames above it; frames below (a thread factory's Runnable, say) do not matter.
     */
    const WAIT_FOR_WORK = Object.freeze([
        'java.util.concurrent.ThreadPoolExecutor.getTask',
        'java.util.concurrent.ForkJoinPool.awaitWork',
        'java.util.concurrent.DelayScheduler.loop',
        'java.util.TimerThread.mainLoop',
        'java.lang.ref.Reference$ReferenceHandler.run',
        'java.lang.ref.Finalizer$FinalizerThread.run',
        'jdk.internal.ref.CleanerImpl.run',
        'java.nio.BufferCleaner$CleaningRunnable.run',
        'java.lang.VirtualThread.unblockVirtualThreads'
    ]);
    const JDK_METHOD = /^(java|javax|jdk|sun|com\.sun)\./;

    class ActivityClassifier {
        activityOf(thread) {
            if (thread.frames.length === 0) {
                return Activity.JVM;
            }
            const methods = thread.frames.map(function (frame) { return new FrameMethod(frame).name; });
            for (let index = 0; index < methods.length; index++) {
                if (WAIT_FOR_WORK.indexOf(methods[index]) >= 0) {
                    return methods.slice(0, index).every(function (method) { return JDK_METHOD.test(method); })
                        ? Activity.IDLE : Activity.APPLICATION;
                }
            }
            return Activity.APPLICATION;
        }
    }

    /** The class and method of a frame, without the module or class loader prefix and the source position. */
    class FrameMethod {
        constructor(frame) {
            const call = frame.substring(0, frame.indexOf('(') >= 0 ? frame.indexOf('(') : frame.length);
            this.name = call.substring(call.lastIndexOf('/') + 1);
        }
    }

    /** A category rule that cannot be read, with the character position of the problem. */
    class RuleError extends Error {
        constructor(message, position) {
            super(message);
            this.name = 'RuleError';
            this.position = position;
        }
    }

    /** The parts of a thread a category rule can test with a regular expression. */
    const RULE_PARTS = Object.freeze({
        name: function (thread) { return [thread.name]; },
        frame: function (thread) { return thread.frames; },
        top: function (thread) { return thread.frames.slice(0, 1); },
        lock: function (thread) { return thread.lines.filter(function (line) { return line.trim().startsWith('- '); }); },
        text: function (thread) { return [thread.text()]; }
    });
    const RULE_ACTIVITIES = Object.freeze({ idle: Activity.IDLE, jvm: Activity.JVM, active: Activity.APPLICATION });

    /** part ~ /regex/flags: true when the regular expression finds a match in any value of the part. */
    class RegexTest {
        constructor(part, source, flags) {
            this.kind = 'regex';
            this.part = part;
            this.source = source;
            this.flags = flags;
            this.regex = new RegExp(source, flags);
            Object.freeze(this);
        }

        matches(thread) {
            const regex = this.regex;
            return RULE_PARTS[this.part](thread).some(function (value) { return regex.test(value); });
        }

        text() {
            return this.part + ' ~ /' + this.source + '/' + this.flags;
        }
    }

    /** is idle | is jvm | is active, as classified for Active Threads. */
    class ActivityTest {
        constructor(activity, classifier) {
            this.kind = 'activity';
            this.activity = activity;
            this.classifier = classifier;
            Object.freeze(this);
        }

        matches(thread) {
            return this.classifier.activityOf(thread) === RULE_ACTIVITIES[this.activity];
        }

        text() {
            return 'is ' + this.activity;
        }
    }

    class NotRule {
        constructor(operand) {
            this.kind = 'not';
            this.operand = operand;
            Object.freeze(this);
        }

        matches(thread) {
            return !this.operand.matches(thread);
        }

        text() {
            const inner = this.operand.text();
            return 'not ' + (this.operand.kind === 'and' || this.operand.kind === 'or' ? '(' + inner + ')' : inner);
        }
    }

    /** kind 'and' or 'or' over two or more operands. */
    class JunctionRule {
        constructor(kind, operands) {
            this.kind = kind;
            this.operands = Object.freeze(operands.slice());
            Object.freeze(this);
        }

        matches(thread) {
            if (this.kind === 'and') {
                return this.operands.every(function (operand) { return operand.matches(thread); });
            }
            return this.operands.some(function (operand) { return operand.matches(thread); });
        }

        text() {
            const kind = this.kind;
            return this.operands.map(function (operand) {
                const inner = operand.text();
                return kind === 'and' && operand.kind === 'or' ? '(' + inner + ')' : inner;
            }).join(' ' + kind + ' ');
        }
    }

    /** Splits rule text into tokens: words, ( ) ~ and /regex/flags, each with its position. */
    class RuleTokens {
        constructor(text) {
            this.text = text;
            this.tokens = [];
            let index = 0;
            while (index < text.length) {
                index = this.next(index);
            }
            this.tokens.push({ type: 'end', value: '', position: text.length });
        }

        next(index) {
            const character = this.text[index];
            if (/\s/.test(character)) {
                return index + 1;
            }
            if ('()~'.indexOf(character) >= 0) {
                this.tokens.push({ type: character, value: character, position: index });
                return index + 1;
            }
            if (character === '/') {
                return this.regex(index);
            }
            const word = /^[A-Za-z_]+/.exec(this.text.substring(index));
            if (word === null) {
                throw new RuleError('Unexpected character "' + character + '"', index);
            }
            this.tokens.push({ type: 'word', value: word[0].toLowerCase(), position: index });
            return index + word[0].length;
        }

        /** Reads /source/flags; a slash inside the source is written \/. */
        regex(start) {
            let index = start + 1;
            while (index < this.text.length && this.text[index] !== '/') {
                index += this.text[index] === '\\' ? 2 : 1;
            }
            if (index >= this.text.length) {
                throw new RuleError('Regular expression is not closed with /', start);
            }
            const flags = /^[imsu]*/.exec(this.text.substring(index + 1))[0];
            this.tokens.push({ type: 'regex', source: this.text.substring(start + 1, index), flags: flags, position: start });
            return index + 1 + flags.length;
        }
    }

    /**
     * Reads a category rule:
     *   rule  := term ('or' term)*         term := factor ('and' factor)*
     *   factor := 'not' factor | '(' rule ')' | part '~' /regex/flags | 'is' (idle | jvm | active)
     *   part  := name | frame | top | lock | text
     */
    class CategoryRuleParser {
        constructor() {
            this.classifier = new ActivityClassifier();
        }

        parse(text) {
            this.tokens = new RuleTokens(text).tokens;
            this.index = 0;
            const rule = this.rule();
            if (this.peek().type !== 'end') {
                throw new RuleError('Expected "and", "or" or the end of the rule', this.peek().position);
            }
            return rule;
        }

        peek() {
            return this.tokens[this.index];
        }

        take() {
            return this.tokens[this.index++];
        }

        isWord(value) {
            return this.peek().type === 'word' && this.peek().value === value;
        }

        rule() {
            return this.junction('or', () => this.term());
        }

        term() {
            return this.junction('and', () => this.factor());
        }

        junction(kind, operand) {
            const operands = [operand()];
            while (this.isWord(kind)) {
                this.take();
                operands.push(operand());
            }
            return operands.length === 1 ? operands[0] : new JunctionRule(kind, operands);
        }

        factor() {
            const token = this.peek();
            if (this.isWord('not')) {
                this.take();
                return new NotRule(this.factor());
            }
            if (token.type === '(') {
                this.take();
                const inner = this.rule();
                this.expect(')', 'Expected ")"');
                return inner;
            }
            if (this.isWord('is')) {
                return this.activityTest();
            }
            return this.regexTest();
        }

        activityTest() {
            this.take();
            const token = this.take();
            if (token.type !== 'word' || !Object.prototype.hasOwnProperty.call(RULE_ACTIVITIES, token.value)) {
                throw new RuleError('Expected idle, jvm or active after "is"', token.position);
            }
            return new ActivityTest(token.value, this.classifier);
        }

        regexTest() {
            const part = this.take();
            if (part.type !== 'word' || !Object.prototype.hasOwnProperty.call(RULE_PARTS, part.value)) {
                const found = part.type === 'end' ? 'the end of the rule' : '"' + (part.value || part.type) + '"';
                throw new RuleError('Expected name, frame, top, lock, text, is, not or "(" but found ' + found, part.position);
            }
            this.expect('~', 'Expected "~" after ' + part.value);
            const regex = this.take();
            if (regex.type !== 'regex') {
                throw new RuleError('Expected a regular expression such as /^pool-/', regex.position);
            }
            try {
                return new RegexTest(part.value, regex.source, regex.flags);
            } catch (error) {
                throw new RuleError(error.message, regex.position);
            }
        }

        expect(type, message) {
            const token = this.take();
            if (token.type !== type) {
                throw new RuleError(message, token.position);
            }
            return token;
        }
    }

    /** A category the user defines: a name and a rule. */
    class CustomCategory {
        constructor(name, ruleText) {
            this.name = name;
            this.rule = new CategoryRuleParser().parse(ruleText);
            Object.freeze(this);
        }

        select(threads) {
            const rule = this.rule;
            return threads.filter(function (thread) { return rule.matches(thread); });
        }
    }

    /** The JSON file custom categories are exported to and imported from. */
    class CategoryFile {
        json(categories) {
            return JSON.stringify({
                threadsee: 'categories',
                version: 1,
                categories: categories.map(function (category) { return { name: category.name, rule: category.rule.text() }; })
            }, null, 2);
        }

        categories(json) {
            const content = JSON.parse(json);
            if (content === null || content.threadsee !== 'categories' || !Array.isArray(content.categories)) {
                throw new Error('This is not a threadsee category file.');
            }
            return content.categories.map(function (entry, index) {
                if (typeof entry.name !== 'string' || entry.name.trim() === '' || typeof entry.rule !== 'string') {
                    throw new Error('Category ' + (index + 1) + ' needs a name and a rule.');
                }
                try {
                    return new CustomCategory(entry.name.trim(), entry.rule);
                } catch (error) {
                    throw new Error('Category "' + entry.name + '": ' + error.message
                        + (error instanceof RuleError ? ' (position ' + error.position + ')' : ''));
                }
            });
        }
    }

    /** The thread groupings TDA shows under each dump. */
    class ThreadCategories {
        constructor(dump) {
            this.all = dump.threads;
            this.waiting = dump.threads.filter(function (thread) { return thread.isWaitingForMonitor(); });
            this.sleeping = dump.threads.filter(function (thread) { return thread.isSleepingOnMonitor(); });
            this.locking = dump.threads.filter(function (thread) { return thread.isLockingMonitor(); });
            this.virtual = dump.threads.filter(function (thread) { return thread.isVirtualOrCarrier(); });
            const classifier = new ActivityClassifier();
            this.active = dump.threads.filter(function (thread) { return classifier.activityOf(thread) === Activity.APPLICATION; });
        }

        stateDistribution() {
            const counts = new Map();
            for (const thread of this.all) {
                const state = (thread.threadState.split(' ')[0] || thread.headerState || 'UNKNOWN').toUpperCase();
                counts.set(state, (counts.get(state) || 0) + 1);
            }
            return counts;
        }
    }

    /** The hints TDA's Analyzer gives for one dump, as data. */
    class DumpHints {
        constructor(dump) {
            this.dump = dump;
            this.categories = new ThreadCategories(dump);
            this.monitors = new MonitorIndex(dump);
            this.deadlocks = new Deadlocks(dump, this.monitors).list();
        }

        list() {
            const hints = [];
            this.addWaitingOrDeadlockHint(hints);
            this.addSleepingHint(hints);
            this.addMonitorsWithoutLockingThreadHint(hints);
            this.addUnownedWaitingHint(hints);
            this.addStuckCarrierHint(hints);
            this.addSmrHint(hints);
            return hints;
        }

        percentOfThreads(count) {
            return this.dump.threads.length === 0 ? 0 : (count * 100) / this.dump.threads.length;
        }

        addWaitingOrDeadlockHint(hints) {
            const waiting = this.percentOfThreads(this.categories.waiting.length);
            if (this.deadlocks.length > 0) {
                const finder = this.deadlocks[0].foundBy === 'JVM' ? 'The JVM has detected ' : 'JThread has found ';
                hints.push({ severity: 'critical', target: 'deadlocks',
                    text: finder + this.deadlocks.length + ' deadlock(s) in this thread dump. Check the deadlocks for the threads and monitors involved.' });
            } else if (waiting > 10) {
                hints.push({ severity: 'warning', target: 'waiting',
                    text: Math.floor(waiting) + '% of all threads are waiting to acquire a monitor or lock. This might indicate congestion. Check the threads waiting for monitors and the monitors they wait on.' });
            }
        }

        addSleepingHint(hints) {
            const sleeping = this.percentOfThreads(this.categories.sleeping.length);
            if (sleeping > 25) {
                hints.push({ severity: 'info', target: 'sleeping',
                    text: Math.floor(sleeping) + '% of all threads are waiting on a monitor or condition (Object.wait() or parked). They might be waiting for an external resource such as a database, or simply be idle pool threads.' });
            }
        }

        addMonitorsWithoutLockingThreadHint(hints) {
            if (this.monitors.withoutLockingThread().length > 0) {
                hints.push({ severity: 'info', target: 'monitors-without-lock',
                    text: 'This dump contains monitors without a locking thread. The monitor might be held by a VM thread, or it is a java.util.concurrent lock and the dump was taken without lock information (jstack -l).' });
            }
        }

        addUnownedWaitingHint(hints) {
            let waiting = 0;
            for (const monitor of this.monitors.withoutLockingThread()) {
                waiting += monitor.waiters.length;
            }
            const percent = this.percentOfThreads(waiting);
            if (percent > 50) {
                hints.push({ severity: 'warning', target: 'monitors-without-lock',
                    text: Math.floor(percent) + '% of all threads are waiting for a monitor that no application thread holds. TDA reads this as a sign that the garbage collector is blocking the monitors; check the GC log for the same period.' });
            }
        }

        addStuckCarrierHint(hints) {
            const stuck = this.dump.threads.filter(function (thread) { return thread.carrierStuckInApplicationCode; });
            if (stuck.length > 0) {
                hints.push({ severity: 'warning', target: 'virtual',
                    text: stuck.length + ' carrier thread(s) appear to be stuck in application code while carrying a virtual thread. This might indicate pinning or a long-running operation that prevents the virtual thread from yielding.' });
            }
        }

        addSmrHint(hints) {
            const unresolved = this.dump.unresolvedSmrAddresses();
            if (unresolved.length > 0) {
                hints.push({ severity: 'warning', target: 'dump',
                    text: unresolved.length + ' address(es) in the Threads class SMR info match no thread in the dump. This might indicate threads that were not properly removed from the JVM\'s thread list.' });
            }
        }
    }

    /**
     * Threads whose text is unchanged across dumps (TDA's "long running thread detection").
     * The cpu= and elapsed= counters are ignored when comparing; the change in cpu= is
     * reported so a thread spinning in place can be told apart from one that is blocked.
     */
    class LongRunningThreads {
        constructor(dumps, minimumOccurrence) {
            this.dumps = dumps;
            this.minimumOccurrence = minimumOccurrence;
        }

        list() {
            if (this.dumps.length < 2) {
                return [];
            }
            const found = [];
            for (const first of this.dumps[0].threads) {
                const occurrences = this.occurrencesOf(first);
                if (occurrences.length >= this.minimumOccurrence) {
                    found.push(this.describe(first, occurrences));
                }
            }
            return found;
        }

        occurrencesOf(first) {
            const occurrences = [first];
            const signature = first.signature();
            for (let i = 1; i < this.dumps.length; i++) {
                const match = this.sameThreadIn(this.dumps[i], first);
                if (match !== null && match.signature() === signature) {
                    occurrences.push(match);
                }
            }
            return occurrences;
        }

        sameThreadIn(dump, thread) {
            const identity = thread.identity();
            for (const candidate of dump.threads) {
                if (candidate.identity() === identity) {
                    return candidate;
                }
            }
            return null;
        }

        describe(first, occurrences) {
            const last = occurrences[occurrences.length - 1];
            const cpuDeltaMs = first.cpuMs === null || last.cpuMs === null ? null : last.cpuMs - first.cpuMs;
            return { thread: first, occurrences: occurrences, cpuDeltaMs: cpuDeltaMs };
        }
    }

    const api = {
        CharsetSniffer: CharsetSniffer,
        DumpFormat: DumpFormat,
        Activity: Activity,
        RuleError: RuleError,
        CategoryRuleParser: CategoryRuleParser,
        CustomCategory: CustomCategory,
        CategoryFile: CategoryFile,
        ActivityClassifier: ActivityClassifier,
        Deadlocks: Deadlocks,
        ThreadDumpReader: ThreadDumpReader,
        ThreadDumpLog: ThreadDumpLog,
        ThreadDump: ThreadDump,
        JavaThread: JavaThread,
        LockKind: LockKind,
        MonitorIndex: MonitorIndex,
        ThreadCategories: ThreadCategories,
        DumpHints: DumpHints,
        LongRunningThreads: LongRunningThreads
    };

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    } else {
        root.ThreadSee = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this));
