/*
 * threadsee - the HTML5 page. A client of js/model.js: it reads files, asks the model
 * for dumps and analyses, and draws them in TDA's layout. Dump text is only ever
 * inserted as text, never as HTML.
 *
 * Derived from TDA - Thread Dump Analyzer (https://github.com/irockel/tda), LGPL-2.1.
 */
(function (root) {
    'use strict';

    /** Raised by one every time a changed view.js is delivered; shown in the status bar to tell which copy is loaded. */
    const VIEW_BUILD = 13;

    const model = root.ThreadSee;
    const JDK_FRAME = /^\s*at (java|javax|jdk|sun|com\.sun)\./;
    const LOCK_ADDRESS = /<([^>]+)>/;
    const STATE_ORDER = ['RUNNABLE', 'WAITING', 'TIMED_WAITING', 'BLOCKED', 'NEW'];

    /** Small helper for building DOM nodes with text content only. */
    class Dom {
        constructor(document) {
            this.document = document;
        }

        el(tag, className, text) {
            const node = this.document.createElement(tag);
            if (className) {
                node.className = className;
            }
            if (text !== undefined && text !== null) {
                node.textContent = String(text);
            }
            return node;
        }

        text(value) {
            return this.document.createTextNode(String(value));
        }

        link(text, action) {
            const button = this.el('button', 'ts-link', text);
            button.type = 'button';
            button.addEventListener('click', function (event) {
                event.stopPropagation();
                action();
            });
            return button;
        }

        clear(node) {
            while (node.firstChild) {
                node.removeChild(node.firstChild);
            }
        }
    }

    /** The analyses of one dump, computed once and shared by the panes that show it. */
    class DumpAnalysis {
        constructor(log, dump) {
            this.log = log;
            this.dump = dump;
            this.categories = new model.ThreadCategories(dump);
            this.monitors = new model.MonitorIndex(dump);
            this.deadlocks = new model.Deadlocks(dump, this.monitors).list();
            this.hints = new model.DumpHints(dump).list();
            this.concerns = new model.Concerns(dump, this.monitors);
        }

        hasConcerns() {
            return this.concerns.threads.size > 0 || this.concerns.monitors.size > 0 || this.concerns.categories.size > 0;
        }

        /** Threads of concern are painted red, virtual threads in italics. */
        threadClasses(thread) {
            const classes = [];
            if (this.concerns.threads.has(thread)) {
                classes.push('ts-row-concern');
            }
            if (thread.isVirtual) {
                classes.push('ts-row-virtual');
            }
            return classes;
        }

        threadNamed(name) {
            return this.dump.threads.find(function (thread) { return thread.name === name; }) || null;
        }
    }

    /** A sortable, filterable table with a selected row, as in TDA's right-hand pane. */
    class DataTable {
        constructor(dom, columns, rows, options) {
            this.dom = dom;
            this.columns = columns;
            this.rows = rows;
            this.options = options;
            this.sortColumn = null;
            this.sortDescending = false;
            this.filter = '';
            this.rowElements = new Map();
            this.selected = null;
        }

        render(container) {
            const tools = this.dom.el('div', 'ts-table-tools');
            if (this.options.extraTools) {
                tools.appendChild(this.options.extraTools);
            }
            if (this.options.filterText) {
                tools.appendChild(this.searchBox());
            }
            this.counter = this.dom.el('span', 'ts-count');
            tools.appendChild(this.counter);
            container.appendChild(tools);
            this.table = this.dom.el('table', 'ts-table');
            this.table.appendChild(this.head());
            this.body = this.dom.el('tbody');
            this.table.appendChild(this.body);
            this.table.addEventListener('keydown', (event) => this.moveSelection(event));
            container.appendChild(this.table);
            this.fill();
        }

        searchBox() {
            const input = this.dom.el('input');
            input.type = 'search';
            input.placeholder = this.options.filterPlaceholder || 'Filter';
            input.setAttribute('aria-label', input.placeholder);
            input.addEventListener('input', () => {
                this.filter = input.value.trim().toLowerCase();
                this.fill();
            });
            return input;
        }

        head() {
            const head = this.dom.el('thead');
            const row = this.dom.el('tr');
            this.headers = [];
            for (const column of this.columns) {
                const cell = this.dom.el('th', null, column.title);
                cell.setAttribute('aria-sort', 'none');
                cell.addEventListener('click', () => this.sortBy(column, cell));
                this.headers.push(cell);
                row.appendChild(cell);
            }
            head.appendChild(row);
            return head;
        }

        sortBy(column, cell) {
            this.sortDescending = this.sortColumn === column ? !this.sortDescending : false;
            this.sortColumn = column;
            for (const header of this.headers) {
                header.setAttribute('aria-sort', 'none');
            }
            cell.setAttribute('aria-sort', this.sortDescending ? 'descending' : 'ascending');
            this.fill();
        }

        visibleRows() {
            let rows = this.rows;
            if (this.filter !== '') {
                rows = rows.filter((row) => this.options.filterText(row).toLowerCase().indexOf(this.filter) >= 0);
            }
            if (this.sortColumn !== null) {
                const column = this.sortColumn;
                const direction = this.sortDescending ? -1 : 1;
                rows = rows.slice().sort(function (a, b) {
                    return direction * compareValues(column.value(a), column.value(b));
                });
            }
            return rows;
        }

        fill() {
            this.dom.clear(this.body);
            this.rowElements.clear();
            const rows = this.visibleRows();
            this.appendRows(rows);
            this.counter.textContent = rows.length === this.rows.length
                ? plural(rows.length, this.options.noun)
                : rows.length + ' of ' + plural(this.rows.length, this.options.noun);
            if (this.selected !== null && this.rowElements.has(this.selected)) {
                this.rowElements.get(this.selected).setAttribute('aria-selected', 'true');
            }
        }

        appendRows(rows) {
            for (const row of rows) {
                this.body.appendChild(this.rowElement(row));
            }
        }

        rowElement(row) {
            const element = this.dom.el('tr');
            element.tabIndex = -1;
            if (this.options.rowClasses) {
                this.options.rowClasses(row).forEach(function (name) { element.classList.add(name); });
            }
            for (const column of this.columns) {
                const value = column.value(row);
                const cell = this.dom.el('td', column.numeric ? 'ts-number' : null, column.display ? column.display(row) : value);
                element.appendChild(cell);
            }
            element.addEventListener('click', () => this.select(row));
            this.rowElements.set(row, element);
            return element;
        }

        select(row) {
            this.highlight(row);
            this.options.onSelect(row);
        }

        /** Selects the row a link in the detail pane points at. */
        reveal(row) {
            this.select(row);
        }

        highlight(row) {
            if (this.selected !== null && this.rowElements.has(this.selected)) {
                this.rowElements.get(this.selected).removeAttribute('aria-selected');
            }
            this.selected = row;
            const element = this.rowElements.get(row);
            if (element) {
                element.setAttribute('aria-selected', 'true');
                element.focus({ preventScroll: true });
                element.scrollIntoView({ block: 'nearest', inline: 'start' });
            }
        }

        /** The rows the arrow keys move through, in display order. */
        rowsInOrder() {
            return this.visibleRows();
        }

        moveSelection(event) {
            if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
                return;
            }
            event.preventDefault();
            const rows = this.rowsInOrder();
            const index = rows.indexOf(this.selected) + (event.key === 'ArrowDown' ? 1 : -1);
            if (index >= 0 && index < rows.length) {
                this.select(rows[index]);
            }
        }
    }

    /**
     * A DataTable whose top-level rows open into child rows, as a monitor opens into the groups of
     * threads holding it, waiting to lock it and waiting on it, and each group into its threads.
     * The filter and sorting apply to the top-level rows; children stay under their row. The
     * children of a top-level row come from options.children(row); a child row is an object with
     * label(), note(), rowClasses(), children(), show() and startsOpen.
     */
    class TreeTable extends DataTable {
        constructor(dom, columns, rows, options) {
            super(dom, columns, rows, options);
            this.open = new Set();
            this.childRows = new Map();
            this.parents = new Map();
            this.depths = new Map();
            this.shown = [];
        }

        render(container) {
            super.render(container);
            this.table.setAttribute('role', 'treegrid');
        }

        appendRows(rows) {
            this.shown = [];
            for (const row of rows) {
                this.appendBranch(row, 0);
            }
        }

        appendBranch(row, depth) {
            this.depths.set(row, depth);
            this.shown.push(row);
            const children = this.childrenOf(row, depth);
            const element = depth === 0 ? this.rowElement(row) : this.childElement(row);
            element.setAttribute('aria-level', String(depth + 1));
            element.firstChild.insertBefore(this.twisty(row, children.length > 0), element.firstChild.firstChild);
            if (children.length > 0) {
                element.setAttribute('aria-expanded', String(this.open.has(row)));
                element.addEventListener('dblclick', () => this.toggle(row));
            }
            this.body.appendChild(element);
            if (this.open.has(row)) {
                for (const child of children) {
                    this.appendBranch(child, depth + 1);
                }
            }
        }

        childrenOf(row, depth) {
            if (!this.childRows.has(row)) {
                const children = depth === 0 ? this.options.children(row) : row.children();
                for (const child of children) {
                    this.parents.set(child, row);
                    if (child.startsOpen) {
                        this.open.add(child);
                    }
                }
                this.childRows.set(row, children);
            }
            return this.childRows.get(row);
        }

        childElement(child) {
            const element = this.dom.el('tr', 'ts-row-child');
            child.rowClasses().forEach(function (name) { element.classList.add(name); });
            element.tabIndex = -1;
            const cell = this.dom.el('td');
            cell.colSpan = this.columns.length;
            cell.appendChild(this.dom.el('span', 'ts-row-label', child.label()));
            const note = child.note();
            if (note !== '') {
                cell.appendChild(this.dom.el('span', 'ts-row-note', note));
            }
            element.appendChild(cell);
            element.addEventListener('click', () => this.select(child));
            this.rowElements.set(child, element);
            return element;
        }

        twisty(row, hasChildren) {
            const twisty = this.dom.el('span', 'ts-twisty', hasChildren ? (this.open.has(row) ? '▾' : '▸') : '');
            if (hasChildren) {
                twisty.addEventListener('click', (event) => {
                    event.stopPropagation();
                    this.toggle(row);
                });
            }
            return twisty;
        }

        toggle(row) {
            if (this.open.has(row)) {
                this.open.delete(row);
            } else {
                this.open.add(row);
            }
            this.fill();
            if (this.selected !== null && !this.rowElements.has(this.selected)) {
                this.select(row);
            } else if (this.selected !== null) {
                this.highlight(this.selected);
            }
        }

        select(row) {
            this.highlight(row);
            if (this.depths.get(row) === 0) {
                this.options.onSelect(row);
            } else {
                row.show();
            }
        }

        /** Opens the row and selects it, so a monitor followed from a stack shows its threads. */
        reveal(row) {
            this.open.add(row);
            this.fill();
            this.select(row);
        }

        rowsInOrder() {
            return this.shown;
        }

        moveSelection(event) {
            if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') {
                super.moveSelection(event);
                return;
            }
            event.preventDefault();
            const row = this.selected;
            if (row === null) {
                return;
            }
            const hasChildren = this.childrenOf(row, this.depths.get(row)).length > 0;
            if (event.key === 'ArrowRight' && hasChildren && !this.open.has(row)) {
                this.toggle(row);
            } else if (event.key === 'ArrowLeft' && this.open.has(row)) {
                this.toggle(row);
            } else if (event.key === 'ArrowLeft' && this.parents.has(row)) {
                this.select(this.parents.get(row));
            }
        }
    }

    /** The threads that stand in one relation to a monitor: holding it, waiting to lock it or waiting on it. */
    class MonitorThreads {
        constructor(title, threads, detail, analysis) {
            this.title = title;
            this.threads = threads;
            this.detail = detail;
            this.analysis = analysis;
            this.startsOpen = true;
        }

        label() {
            return this.title + ' (' + this.threads.length + ')';
        }

        note() {
            return '';
        }

        rowClasses() {
            return [];
        }

        children() {
            return this.threads.map((thread) => new MonitorThread(thread, this.detail, this.analysis));
        }

        show() {
            this.detail.showMessage('Select a thread to see its stack.');
        }
    }

    /** One thread under a monitor, shown with the frame it is in. */
    class MonitorThread {
        constructor(thread, detail, analysis) {
            this.thread = thread;
            this.detail = detail;
            this.analysis = analysis;
            this.startsOpen = false;
        }

        label() {
            return this.thread.name;
        }

        note() {
            return this.thread.frames.length > 0 ? this.thread.frames[0] : (this.thread.threadState || '');
        }

        rowClasses() {
            return this.analysis.threadClasses(this.thread);
        }

        children() {
            return [];
        }

        show() {
            this.detail.showThread(this.thread, this.analysis);
        }
    }

    function compareValues(a, b) {
        if (typeof a === 'number' && typeof b === 'number') {
            return a - b;
        }
        if (a === null || a === undefined) {
            return b === null || b === undefined ? 0 : -1;
        }
        if (b === null || b === undefined) {
            return 1;
        }
        return String(a).localeCompare(String(b), undefined, { numeric: true });
    }

    /** The lower pane: the text of a thread, a monitor's threads, a deadlock report. */
    class DetailView {
        constructor(dom, container, app) {
            this.dom = dom;
            this.container = container;
            this.app = app;
        }

        showMessage(message) {
            this.dom.clear(this.container);
            this.container.appendChild(this.dom.el('p', 'ts-placeholder', message));
        }

        showThread(thread, analysis) {
            this.dom.clear(this.container);
            this.container.appendChild(this.threadText(thread, analysis));
        }

        threadText(thread, analysis) {
            const pre = this.dom.el('pre', 'ts-stack');
            thread.lines.forEach((line, index) => {
                pre.appendChild(this.line(line, index === 0, analysis));
                pre.appendChild(this.dom.text('\n'));
            });
            if (thread.carrierStuckInApplicationCode) {
                pre.appendChild(this.dom.el('span', 'ts-line-note', 'Note: the carrier thread seems to be stuck in application code.'));
            }
            return pre;
        }

        line(text, isHeader, analysis) {
            const trimmed = text.trim();
            if (isHeader) {
                return this.dom.el('span', 'ts-line-header', text);
            }
            if (trimmed.startsWith('- ')) {
                return this.lockLine(text, analysis);
            }
            if (trimmed.startsWith('Carrying virtual thread')) {
                return this.dom.el('span', 'ts-line-note', text);
            }
            return this.dom.el('span', JDK_FRAME.test(text) ? 'ts-line-jdk' : null, text);
        }

        lockLine(text, analysis) {
            const span = this.dom.el('span', 'ts-line-lock');
            const found = LOCK_ADDRESS.exec(text);
            const monitor = found === null ? null : analysis.monitors.find(found[1]);
            if (monitor === null) {
                span.textContent = text;
                return span;
            }
            const start = text.indexOf(found[0]);
            span.appendChild(this.dom.text(text.substring(0, start)));
            span.appendChild(this.dom.link(found[0], () => this.app.showMonitor(analysis, monitor)));
            span.appendChild(this.dom.text(text.substring(start + found[0].length)));
            return span;
        }

        showMonitor(monitor, analysis) {
            this.dom.clear(this.container);
            this.container.appendChild(this.dom.el('h2', null, 'Monitor ' + monitor.label()));
            this.container.appendChild(this.dom.el('p', 'ts-muted', plural(monitor.waiters.length, 'thread') + ' waiting to lock it, '
                + monitor.sleepers.length + ' waiting on it (Object.wait() or parked).'));
            if (monitor.lockingThreads().length === 0) {
                this.container.appendChild(this.dom.el('p', null, this.noHolderText(monitor, analysis)));
            }
            for (const holder of monitor.lockingThreads()) {
                this.container.appendChild(this.dom.el('h3', null, 'Stack of ' + holder.name));
                this.container.appendChild(this.threadText(holder, analysis));
            }
        }

        noHolderText(monitor, analysis) {
            if (monitor.waiters.length === 0) {
                return 'No thread holds it. The threads under it in the table wait on it for an event (a notify, a signal, a count-down or a result), not to acquire it.';
            }
            if (analysis.dump.format === model.DumpFormat.JCMD_TEXT) {
                return 'No thread holds it in this dump. It might be held by a VM thread, or it is a lock whose owner the JVM did not print.';
            }
            return 'No thread holds this monitor. It might be held by a VM thread, or it is a java.util.concurrent lock in a dump taken without lock information (jstack -l).';
        }

        showMatchingThreads(threads, analysis) {
            this.dom.clear(this.container);
            this.container.appendChild(this.dom.el('h3', null, 'Threads the rule selects (' + threads.length + ')'));
            const list = this.dom.el('ul');
            for (const thread of threads) {
                const item = this.dom.el('li');
                item.appendChild(this.dom.el('span', null, thread.name));
                item.appendChild(this.dom.el('span', 'ts-muted', '  ' + (thread.frames[0] || thread.threadState)));
                list.appendChild(item);
            }
            this.container.appendChild(list);
        }

        showDeadlock(report, number, analysis) {
            this.dom.clear(this.container);
            this.container.appendChild(this.dom.el('h2', null, 'Deadlock No. ' + number));
            if (report.foundBy !== 'JVM') {
                this.container.appendChild(this.dom.el('p', 'ts-muted',
                    'Found by JThread by following each blocked thread to the thread holding the monitor or lock it waits for. This dump format carries no deadlock report from the JVM.'));
            }
            const pre = this.dom.el('pre', 'ts-stack');
            for (const line of report.lines) {
                pre.appendChild(this.deadlockLine(line, analysis));
                pre.appendChild(this.dom.text('\n'));
            }
            this.container.appendChild(pre);
        }

        deadlockLine(text, analysis) {
            if (text.trim().startsWith('- ')) {
                return this.lockLine(text, analysis);
            }
            const quoted = /"([^"]+)"/.exec(text);
            const thread = quoted === null ? null : analysis.threadNamed(quoted[1]);
            if (thread === null) {
                return this.dom.el('span', JDK_FRAME.test(text) ? 'ts-line-jdk' : null, text);
            }
            const span = this.dom.el('span');
            span.appendChild(this.dom.text(text.substring(0, quoted.index)));
            span.appendChild(this.dom.link(quoted[0], () => this.app.showThread(analysis, thread)));
            span.appendChild(this.dom.text(text.substring(quoted.index + quoted[0].length)));
            return span;
        }

        showOccurrences(entry, analyses) {
            this.dom.clear(this.container);
            this.container.appendChild(this.dom.el('h2', null, entry.thread.name));
            this.container.appendChild(this.dom.el('p', 'ts-muted',
                'Unchanged in ' + entry.occurrences.length + ' dumps' + this.cpuSummary(entry) + '.'));
            for (const thread of entry.occurrences) {
                const analysis = analyses.find(function (candidate) { return candidate.dump.threads.indexOf(thread) >= 0; });
                this.container.appendChild(this.dom.el('h3', null, analysis.dump.title()));
                this.container.appendChild(this.threadText(thread, analysis));
            }
        }

        cpuSummary(entry) {
            if (entry.cpuDeltaMs === null) {
                return ' (these dumps carry no cpu= per thread)';
            }
            return '; cpu= grew by ' + formatMs(entry.cpuDeltaMs) + ' ms from the first to the last of them';
        }
    }

    function formatMs(value) {
        return value === null ? '' : value.toFixed(value < 10 ? 2 : 0);
    }

    /** A node in the dump tree on the left. */
    class TreeNode {
        constructor(label, icon, show, options) {
            this.label = label;
            this.icon = icon;
            this.show = show;
            this.children = [];
            this.expanded = (options && options.expanded) || false;
            this.key = (options && options.key) || null;
            this.closable = (options && options.closable) || false;
            this.parent = null;
            this.element = null;
        }

        add(child) {
            child.parent = this;
            this.children.push(child);
            return child;
        }

        root() {
            return this.parent === null ? this : this.parent.root();
        }
    }

    /** Draws the tree and keeps one node selected. */
    class TreeView {
        constructor(dom, container, onSelect, emptyState) {
            this.dom = dom;
            this.container = container;
            this.onSelect = onSelect;
            this.emptyState = emptyState;
            this.roots = [];
            this.selected = null;
            this.marked = new Set();
            this.nodes = new WeakMap();
            container.setAttribute('role', 'tree');
            container.addEventListener('keydown', (event) => this.keyPressed(event));
        }

        addRoot(node) {
            this.roots.push(node);
            this.render();
        }

        removeRoot(node) {
            this.roots = this.roots.filter(function (candidate) { return candidate !== node; });
            if (this.selected !== null && this.selected.root() === node) {
                this.selected = null;
            }
            this.marked.clear();
            this.render();
        }

        replaceRoot(oldNode, newNode) {
            this.roots[this.roots.indexOf(oldNode)] = newNode;
            this.marked.clear();
            this.selected = null;
            this.render();
        }

        /** The nodes Close acts on: the Cmd/Ctrl-clicked entries, or else the selected node. */
        selection() {
            if (this.marked.size > 0) {
                return Array.from(this.marked);
            }
            return this.selected === null ? [] : [this.selected];
        }

        /** The tree node whose row contains the element, or null. */
        nodeAt(element) {
            const row = element && element.closest ? element.closest('.ts-node') : null;
            return row === null ? null : (this.nodes.get(row) || null);
        }

        /** Cmd/Ctrl-click adds a dump or set entry to the selection, or takes it out again. */
        mark(node) {
            if (this.marked.size === 0 && this.selected !== null && this.selected.closable) {
                this.marked.add(this.selected);
            }
            if (this.marked.has(node)) {
                this.marked.delete(node);
            } else {
                this.marked.add(node);
            }
            this.render();
        }

        render() {
            this.dom.clear(this.container);
            if (this.roots.length === 0) {
                this.container.appendChild(this.emptyState);
                return;
            }
            const list = this.dom.el('ul');
            for (const node of this.roots) {
                list.appendChild(this.item(node));
            }
            this.container.appendChild(list);
        }

        item(node) {
            const item = this.dom.el('li');
            const row = this.dom.el('div', 'ts-node');
            row.setAttribute('role', 'treeitem');
            row.tabIndex = node === this.selected ? 0 : -1;
            row.setAttribute('aria-selected', node === this.selected || this.marked.has(node) ? 'true' : 'false');
            this.nodes.set(row, node);
            const twisty = this.dom.el('span', 'ts-twisty', node.children.length === 0 ? '' : (node.expanded ? '▾' : '▸'));
            if (node.children.length > 0) {
                row.setAttribute('aria-expanded', String(node.expanded));
                twisty.addEventListener('click', (event) => {
                    event.stopPropagation();
                    this.toggle(node);
                });
            }
            row.appendChild(twisty);
            row.appendChild(this.dom.el('span', 'ts-icon', node.icon));
            row.appendChild(this.dom.el('span', 'ts-label', node.label));
            row.addEventListener('click', (event) => {
                if ((event.metaKey || event.ctrlKey) && node.closable) {
                    this.mark(node);
                } else {
                    this.marked.clear();
                    this.select(node);
                }
            });
            row.addEventListener('dblclick', () => this.toggle(node));
            node.element = row;
            item.appendChild(row);
            if (node.expanded && node.children.length > 0) {
                const children = this.dom.el('ul');
                children.setAttribute('role', 'group');
                for (const child of node.children) {
                    children.appendChild(this.item(child));
                }
                item.appendChild(children);
            }
            return item;
        }

        toggle(node) {
            node.expanded = !node.expanded;
            this.render();
            this.focusSelected();
        }

        select(node) {
            for (let parent = node.parent; parent !== null; parent = parent.parent) {
                parent.expanded = true;
            }
            this.selected = node;
            this.render();
            this.focusSelected();
            this.onSelect(node);
        }

        focusSelected() {
            if (this.selected !== null && this.selected.element !== null) {
                this.selected.element.focus({ preventScroll: true });
                this.selected.element.scrollIntoView({ block: 'nearest' });
            }
        }

        visibleNodes() {
            const nodes = [];
            const walk = function (node) {
                nodes.push(node);
                if (node.expanded) {
                    node.children.forEach(walk);
                }
            };
            this.roots.forEach(walk);
            return nodes;
        }

        keyPressed(event) {
            if (this.selected === null) {
                return;
            }
            const nodes = this.visibleNodes();
            const index = nodes.indexOf(this.selected);
            if (event.key === 'ArrowDown' && index < nodes.length - 1) {
                this.select(nodes[index + 1]);
            } else if (event.key === 'ArrowUp' && index > 0) {
                this.select(nodes[index - 1]);
            } else if (event.key === 'ArrowRight' && !this.selected.expanded && this.selected.children.length > 0) {
                this.toggle(this.selected);
            } else if (event.key === 'ArrowLeft' && this.selected.expanded) {
                this.toggle(this.selected);
            } else {
                return;
            }
            event.preventDefault();
        }
    }

    /** The page: wires the toolbar, the tree, the content pane and the detail pane together. */
    class ThreadSeeApp {
        constructor(document) {
            this.document = document;
            this.dom = new Dom(document);
            this.appElement = document.getElementById('threadsee');
            this.content = document.getElementById('ts-content');
            this.status = document.getElementById('ts-status');
            this.closeButton = document.getElementById('ts-close');
            this.detail = new DetailView(this.dom, document.getElementById('ts-detail'), this);
            this.tree = new TreeView(this.dom, document.getElementById('ts-tree'), (node) => this.nodeSelected(node), this.dropZone());
            this.analyses = new Map();
            this.currentTable = null;
            this.categories = new CategoryStore(root.localStorage);
            this.previewAnalysis = null;
        }

        /** What the tree shows while nothing is open: a place to drop files, which also opens the file chooser. */
        dropZone() {
            const zone = this.dom.el('label', 'ts-drop-zone');
            zone.htmlFor = 'ts-file';
            zone.appendChild(this.dom.el('span', 'ts-drop-zone-title', 'Drop thread dump files here'));
            zone.appendChild(this.dom.el('span', 'ts-drop-zone-hint', 'or click to choose them'));
            return zone;
        }

        start() {
            this.document.querySelector('.ts-status span').appendChild(this.dom.text(' \u00B7 view.js build ' + VIEW_BUILD));
            this.wireToolbar();
            this.wireDragAndDrop();
            new SplitterDrag(this.appElement, this.document.getElementById('ts-main')).wire(
                this.document.getElementById('ts-split-vertical'), this.document.getElementById('ts-split-horizontal'));
            this.tree.render();
            this.showWelcome();
        }

        wireToolbar() {
            const input = this.document.getElementById('ts-file');
            input.addEventListener('change', () => {
                if (input.files.length > 0) {
                    this.openFiles(Array.from(input.files));
                }
                input.value = '';
            });
            this.closeButton.addEventListener('click', () => this.closeSelection());
            this.document.getElementById('ts-categories').addEventListener('click', () => this.showCategoryEditor());
        }

        wireDragAndDrop() {
            let depth = 0;
            this.document.addEventListener('dragenter', (event) => {
                event.preventDefault();
                depth++;
                this.appElement.classList.add('ts-dragging');
            });
            this.document.addEventListener('dragleave', () => {
                depth = Math.max(0, depth - 1);
                if (depth === 0) {
                    this.appElement.classList.remove('ts-dragging');
                }
            });
            this.document.addEventListener('dragover', (event) => event.preventDefault());
            this.document.addEventListener('drop', (event) => {
                event.preventDefault();
                depth = 0;
                this.appElement.classList.remove('ts-dragging');
                if (event.dataTransfer && event.dataTransfer.files.length > 0) {
                    const node = this.tree.nodeAt(event.target);
                    if (node === null) {
                        this.openFiles(Array.from(event.dataTransfer.files));
                    } else {
                        this.addFiles(Array.from(event.dataTransfer.files), node.root());
                    }
                }
            });
        }

        /** Reads the files' bytes into { name, text } sources and hands them to then. */
        readFiles(files, then) {
            const sniffer = new model.CharsetSniffer();
            const names = files.map(function (file) { return file.name; }).join(', ');
            this.status.textContent = 'Reading ' + names + '\u2026';
            Promise.all(files.map(function (file) {
                return file.arrayBuffer().then(function (buffer) {
                    return { name: file.name, text: sniffer.decode(new Uint8Array(buffer)) };
                });
            })).then(then).catch((error) => {
                this.showError('Could not read ' + names + ': ' + error.message);
            });
        }

        /** Files opened together are read as one set of dumps. */
        openFiles(files) {
            this.readFiles(files, (sources) => this.open(sources));
        }

        /** Adds files to an open set; the set is read again so its dumps are ordered and numbered across all its files. */
        addFiles(files, rootNode) {
            this.readFiles(files, (sources) => this.reopen(rootNode, rootNode.log.sources.concat(sources)));
        }

        readSet(sources) {
            try {
                return new model.ThreadDumpReader().readFiles(sources);
            } catch (error) {
                this.showError('Could not parse ' + sources.map(function (source) { return source.name; }).join(', ') + ': ' + error.message);
                throw error;
            }
        }

        noDumpMessage(log) {
            return 'No thread dump was found in ' + log.name + '. JThread reads the output of jstack, jcmd Thread.print and kill -3 (starting with the line "Full thread dump") and the file written by jcmd Thread.dump_to_file.';
        }

        open(sources) {
            const log = this.readSet(sources);
            if (log.dumps.length === 0) {
                this.showError(this.noDumpMessage(log));
                return;
            }
            const rootNode = this.buildTree(log);
            this.tree.addRoot(rootNode);
            this.selectFirstDump(rootNode);
            this.closeButton.disabled = false;
        }

        /** Replaces a set with one read from the given sources; a set left with no dump is closed. */
        reopen(rootNode, sources) {
            this.forget(rootNode.log);
            const log = sources.length === 0 ? null : this.readSet(sources);
            if (log === null || log.dumps.length === 0) {
                this.tree.removeRoot(rootNode);
                this.afterClosing(log === null ? '' : this.noDumpMessage(log));
                return;
            }
            const newRoot = this.buildTree(log);
            this.tree.replaceRoot(rootNode, newRoot);
            this.selectFirstDump(newRoot);
        }

        selectFirstDump(rootNode) {
            const first = this.analysisOf(rootNode.log, rootNode.log.dumps[0]).node;
            first.expanded = true;
            this.tree.select(first);
        }

        forget(log) {
            for (const dump of log.dumps) {
                this.analyses.delete(dump);
            }
        }

        logLabel(log) {
            return log.sources.length === 1 ? log.name : log.sources.length + ' files: ' + log.name;
        }

        analysisOf(log, dump) {
            if (!this.analyses.has(dump)) {
                this.analyses.set(dump, new DumpAnalysis(log, dump));
            }
            return this.analyses.get(dump);
        }

        buildTree(log) {
            const rootNode = new TreeNode(this.logLabel(log), '◔', () => this.showSet(log), { expanded: true, closable: true });
            rootNode.log = log;
            for (const dump of log.dumps) {
                rootNode.add(this.dumpNode(log, dump, log.dumps.length === 1));
            }
            if (log.dumps.length > 1) {
                rootNode.add(new TreeNode('Long running threads', '⏱', () => this.showLongRunning(log)));
            }
            return rootNode;
        }

        dumpNode(log, dump, expanded) {
            const analysis = this.analysisOf(log, dump);
            const categories = analysis.categories;
            const node = new TreeNode(dump.title(), '▤', () => this.showOverview(analysis), { expanded: expanded, closable: true });
            const add = (key, label, icon, rows, show) => {
                if (key === 'threads' || rows.length > 0) {
                    node.add(new TreeNode(label, icon, show, { key: key }));
                }
            };
            const monitors = analysis.monitors.all();
            const unowned = analysis.monitors.withoutLockingThread();
            add('threads', 'Threads (' + categories.all.length + ' Threads overall)', '☰', categories.all,
                () => this.showThreads(analysis, categories.all, 'Threads'));
            add('active', 'Active Threads (' + categories.active.length + ' Threads active)', '\u25B6', categories.active,
                () => this.showThreads(analysis, categories.active, 'Active Threads'));
            add('deadlocks', 'Deadlocks (' + plural(analysis.deadlocks.length, 'deadlock') + ')', '⚠', analysis.deadlocks,
                () => this.showDeadlocks(analysis));
            add('waiting', 'Threads waiting for Monitors (' + categories.waiting.length + ' Threads waiting)', '⧖', categories.waiting,
                () => this.showThreads(analysis, categories.waiting, 'Threads waiting for Monitors'));
            add('sleeping', 'Threads sleeping on Monitors (' + categories.sleeping.length + ' Threads sleeping)', '☾', categories.sleeping,
                () => this.showThreads(analysis, categories.sleeping, 'Threads sleeping on Monitors'));
            add('locking', 'Threads locking Monitors (' + categories.locking.length + ' Threads locking)', '⚿', categories.locking,
                () => this.showThreads(analysis, categories.locking, 'Threads locking Monitors'));
            add('virtual', 'Virtual Threads (' + categories.virtual.length + ' Virtual Threads)', '☲', categories.virtual,
                () => this.showThreads(analysis, categories.virtual, 'Virtual Threads'));
            add('monitors', 'Monitors (' + monitors.length + ' Monitors)', '▣', monitors,
                () => this.showMonitors(analysis, monitors));
            add('monitors-without-lock', 'Monitors without locking thread (' + unowned.length + ' Monitors)', '▢', unowned,
                () => this.showMonitors(analysis, unowned));
            for (const category of this.categories.list()) {
                const threads = category.select(analysis.dump.threads);
                node.add(new TreeNode(category.name + ' (' + plural(threads.length, 'Thread') + ')', '\u25C7',
                    () => this.showThreads(analysis, threads, category.name), { key: 'custom:' + category.name }));
            }
            node.analysis = analysis;
            node.children.forEach(function (child) { child.analysis = analysis; });
            analysis.node = node;
            return node;
        }

        /** Builds every tree again after the custom categories change, keeping what was expanded and selected. */
        rebuildTrees() {
            const selected = this.tree.selected;
            const selectedKey = selected === null ? null : (selected.key || selected.label);
            const selectedDump = selected === null || !selected.analysis ? null : selected.analysis.dump;
            const roots = this.tree.roots.map((oldRoot) => this.rebuiltRoot(oldRoot));
            this.tree.roots = roots;
            this.tree.selected = null;
            this.tree.render();
            const target = this.equivalentNode(roots, selectedDump, selectedKey);
            if (target !== null && this.content.querySelector('.ts-category-editor') === null) {
                this.tree.select(target);
            } else if (target !== null) {
                this.tree.selected = target;
                this.tree.render();
            }
        }

        rebuiltRoot(oldRoot) {
            const expanded = new Set();
            for (const child of oldRoot.children) {
                if (child.expanded && child.analysis) {
                    expanded.add(child.analysis.dump);
                }
            }
            const newRoot = this.buildTree(oldRoot.log);
            for (const child of newRoot.children) {
                child.expanded = Boolean(child.analysis) && expanded.has(child.analysis.dump);
            }
            return newRoot;
        }

        equivalentNode(roots, dump, key) {
            for (const rootNode of roots) {
                for (const child of rootNode.children) {
                    if (dump !== null && child.analysis && child.analysis.dump === dump) {
                        const match = child.children.find(function (node) { return node.key === key; });
                        return match || child;
                    }
                }
            }
            return roots.length > 0 ? roots[0] : null;
        }

        showCategoryEditor() {
            this.currentTable = null;
            this.dom.clear(this.content);
            new CategoryEditorPane(this.dom, this).render(this.content);
        }

        nodeSelected(node) {
            if (node.analysis) {
                this.previewAnalysis = node.analysis;
            }
            this.currentTable = null;
            this.dom.clear(this.content);
            this.content.scrollTop = 0;
            this.detail.showMessage('Select a row above to see its details here.');
            node.show();
            const log = node.root().log;
            const threads = log.dumps.reduce(function (sum, dump) { return sum + dump.threads.length; }, 0);
            const files = log.sources.length === 1 ? log.name : plural(log.sources.length, 'file');
            const missing = log.filesWithoutDumps.length === 0 ? '' : ' \u00B7 no dump in ' + log.filesWithoutDumps.join(', ');
            this.status.textContent = files + ': ' + plural(log.dumps.length, 'dump') + ', ' + plural(threads, 'thread') + missing;
        }

        categoryNode(analysis, key) {
            return analysis.node.children.find(function (child) { return child.key === key; }) || null;
        }

        /** Navigates to a category of a dump and selects one row in it. */
        navigate(analysis, key, row) {
            const node = this.categoryNode(analysis, key);
            if (node === null) {
                return;
            }
            this.tree.select(node);
            if (row !== undefined && this.currentTable !== null) {
                this.currentTable.reveal(row);
            }
        }

        showThread(analysis, thread) {
            this.navigate(analysis, 'threads', thread);
        }

        showMonitor(analysis, monitor) {
            this.navigate(analysis, 'monitors', monitor);
        }

        showWelcome() {
            this.dom.clear(this.content);
            const welcome = this.dom.el('div', 'ts-welcome ts-welcome-start');
            const pane = this.dom.el('div', 'ts-welcome-text');
            welcome.appendChild(pane);
            pane.appendChild(this.dom.el('h1', null, 'Analyse Java thread dumps in your browser'));
            pane.appendChild(this.dom.el('p', null, 'Open one or more files that contain HotSpot thread dumps from JDK 8 or later.'));
            pane.appendChild(this.dom.el('p', null, 'Use jstack -l <pid> or jcmd <pid> Thread.print -l to include the owners of java.util.concurrent locks.'));
            pane.appendChild(this.dom.el('p', 'ts-muted', 'All data remains local.'));
            this.content.appendChild(welcome);
            this.detail.showMessage('');
        }

        showError(message) {
            this.status.textContent = '';
            this.dom.clear(this.content);
            const pane = this.dom.el('div', 'ts-welcome');
            pane.appendChild(this.dom.el('p', 'ts-error', message));
            this.content.appendChild(pane);
        }

        showSet(log) {
            const dumps = log.dumps;
            const pane = this.dom.el('div', 'ts-pane');
            pane.appendChild(this.dom.el('h2', null, this.logLabel(log)));
            pane.appendChild(this.dom.el('p', 'ts-subtitle',
                plural(log.dumps.length, 'thread dump') + ' in ' + plural(log.sources.length, 'file') + (log.sources.length > 1 ? ', in timestamp order' : '')));
            if (log.filesWithoutDumps.length > 0) {
                pane.appendChild(this.dom.el('p', 'ts-error', 'No thread dump was found in ' + log.filesWithoutDumps.join(', ') + '.'));
            }
            this.content.appendChild(pane);
            const columns = [
                { title: 'Dump', value: function (dump) { return dump.number; }, numeric: true },
                { title: 'File', value: function (dump) { return dump.source; } },
                { title: 'Line', value: function (dump) { return dump.lineNumber; }, numeric: true },
                { title: 'Time', value: function (dump) { return dump.timestamp || ''; } },
                { title: 'Threads', value: function (dump) { return dump.threads.length; }, numeric: true },
                { title: 'Deadlocks', value: (dump) => this.analysisOf(log, dump).deadlocks.length, numeric: true },
                { title: 'VM', value: function (dump) { return dump.vmInfo; } }
            ].filter(function (column) { return column.title !== 'File' || log.sources.length > 1; });
            const table = new DataTable(this.dom, columns, dumps, {
                noun: 'dump',
                rowClasses: (dump) => this.analysisOf(log, dump).hasConcerns() ? ['ts-row-concern'] : [],
                onSelect: (dump) => this.tree.select(this.analysisOf(log, dump).node)
            });
            table.render(this.content);
            this.detail.showMessage('Select a dump to see its overview.');
        }

        showOverview(analysis) {
            new OverviewPane(this.dom, this, analysis).render(this.content);
            this.detail.showMessage('Select a category in the tree to see its threads or monitors.');
        }

        showThreads(analysis, threads, title) {
            this.currentTable = new DataTable(this.dom, [
                { title: 'Name', value: function (thread) { return thread.name; } },
                { title: 'Type', value: function (thread) { return thread.type(); } },
                { title: 'Prio', value: function (thread) { return numberOrNull(thread.prio); }, display: function (thread) { return thread.prio || ''; }, numeric: true },
                { title: 'Thread-ID', value: function (thread) { return thread.tid || ''; } },
                { title: 'Native-ID', value: function (thread) { return numberOrNull(thread.nativeId); }, display: function (thread) { return thread.nativeId || ''; }, numeric: true },
                { title: 'State', value: function (thread) { return thread.headerState; } },
                { title: 'Thread.State', value: function (thread) { return thread.threadState; } },
                { title: 'CPU (ms)', value: function (thread) { return thread.cpuMs; }, display: function (thread) { return formatMs(thread.cpuMs); }, numeric: true },
                { title: 'Address Range', value: function (thread) { return thread.addressRange ? '[' + thread.addressRange + ']' : ''; } }
            ], threads, {
                noun: 'thread',
                filterText: function (thread) { return thread.text(); },
                filterPlaceholder: 'Filter by name or stack text',
                rowClasses: function (thread) { return analysis.threadClasses(thread); },
                onSelect: (thread) => this.detail.showThread(thread, analysis)
            });
            this.currentTable.render(this.content);
        }

        showMonitors(analysis, monitors) {
            this.currentTable = new TreeTable(this.dom, [
                { title: 'Monitor', value: function (monitor) { return '<' + monitor.address + '>'; } },
                { title: 'Class', value: function (monitor) { return monitor.className || ''; } },
                { title: 'Locked by', value: function (monitor) { return monitor.lockingThreads().map(function (thread) { return thread.name; }).join(', '); } },
                { title: 'Waiting to lock', value: function (monitor) { return monitor.waiters.length; }, numeric: true },
                { title: 'Waiting on', value: function (monitor) { return monitor.sleepers.length; }, numeric: true }
            ], monitors, {
                noun: 'monitor',
                filterText: function (monitor) { return monitor.label(); },
                filterPlaceholder: 'Filter by address or class',
                rowClasses: function (monitor) { return analysis.concerns.monitors.has(monitor) ? ['ts-row-concern'] : []; },
                onSelect: (monitor) => this.detail.showMonitor(monitor, analysis),
                children: (monitor) => [
                    new MonitorThreads('Locked by', monitor.lockingThreads(), this.detail, analysis),
                    new MonitorThreads('Waiting to lock', monitor.waiters, this.detail, analysis),
                    new MonitorThreads('Waiting on (Object.wait() or parked)', monitor.sleepers, this.detail, analysis)
                ].filter(function (group) { return group.threads.length > 0; })
            });
            this.currentTable.render(this.content);
        }

        showDeadlocks(analysis) {
            const reports = analysis.deadlocks;
            this.currentTable = new DataTable(this.dom, [
                { title: 'Deadlock', value: function (report) { return 'Deadlock No. ' + (reports.indexOf(report) + 1); } },
                { title: 'Threads', value: function (report) { return report.threadNames.join(', '); } }
            ], reports, {
                noun: 'deadlock',
                rowClasses: function () { return ['ts-row-concern']; },
                onSelect: (report) => this.detail.showDeadlock(report, reports.indexOf(report) + 1, analysis)
            });
            this.currentTable.render(this.content);
            this.currentTable.select(reports[0]);
        }

        showLongRunning(log) {
            new LongRunningPane(this.dom, this, log).render(this.content);
        }

        /**
         * Closes what is selected: a set's entry closes the set, and a dump or anything under it the
         * file that dump came from. The rest of each set is read again.
         */
        closeSelection() {
            const closing = new Map();
            for (const node of this.tree.selection()) {
                const rootNode = node.root();
                if (!closing.has(rootNode)) {
                    closing.set(rootNode, new Set());
                }
                this.filesClosedBy(node).forEach(function (source) { closing.get(rootNode).add(source); });
            }
            for (const [rootNode, sources] of closing) {
                this.reopen(rootNode, rootNode.log.sources.filter(function (source) { return !sources.has(source); }));
            }
        }

        filesClosedBy(node) {
            const log = node.root().log;
            if (node.parent === null) {
                return log.sources;
            }
            const dump = node.analysis ? node.analysis.dump : null;
            return dump === null ? [] : log.sources.filter(function (source) { return source.name === dump.source; });
        }

        afterClosing(message) {
            this.closeButton.disabled = this.tree.roots.length === 0;
            if (this.tree.roots.length > 0 && this.tree.selected === null) {
                this.tree.select(this.tree.roots[0]);
            } else if (this.tree.roots.length === 0) {
                this.status.textContent = '';
                this.showWelcome();
            }
            if (message !== '') {
                this.showError(message);
            }
        }
    }

    function plural(count, noun) {
        return count + ' ' + noun + (count === 1 ? '' : 's');
    }

    function numberOrNull(text) {
        return text === null || text === undefined || text === '' ? null : Number(text);
    }

    /**
     * The user's custom categories, kept in this browser's localStorage when it is available.
     * Storage that cannot be read or written is reported, never silently ignored.
     */
    class CategoryStore {
        constructor(storage) {
            this.storage = storage;
            this.file = new model.CategoryFile();
            this.categories = [];
            this.problem = null;
            this.load();
        }

        load() {
            try {
                const json = this.storage === undefined || this.storage === null ? null : this.storage.getItem(CATEGORY_KEY);
                this.categories = json === null ? [] : this.file.categories(json);
            } catch (error) {
                this.problem = 'Saved categories could not be read: ' + error.message;
            }
        }

        save() {
            try {
                this.storage.setItem(CATEGORY_KEY, this.file.json(this.categories));
                this.problem = null;
            } catch (error) {
                this.problem = 'Categories could not be saved in this browser (' + error.message + '). Export them to keep them.';
            }
        }

        list() {
            return this.categories.slice();
        }

        /** Adds the category, replacing the one named replacing (when editing) and any of the same name. */
        put(category, replacing) {
            this.categories = this.categories.filter(function (existing) {
                return existing.name !== category.name && existing.name !== replacing;
            });
            this.categories.push(category);
            this.save();
        }

        remove(name) {
            this.categories = this.categories.filter(function (existing) { return existing.name !== name; });
            this.save();
        }

        importAll(categories) {
            for (const category of categories) {
                this.categories = this.categories.filter(function (existing) { return existing.name !== category.name; });
                this.categories.push(category);
            }
            this.save();
        }

        json() {
            return this.file.json(this.categories);
        }
    }

    const CATEGORY_KEY = 'threadsee.categories';
    const PARTS = [['name', 'Name'], ['frame', 'Any frame'], ['top', 'Top frame'], ['lock', 'Any lock line'], ['text', 'Whole thread'], ['is', 'Thread is']];
    const ACTIVITIES = [['active', 'active'], ['idle', 'idle'], ['jvm', 'a JVM thread']];

    /**
     * The form behind the rule text: conditions combined with "all" or "any", with groups one
     * level deep. Changes in the form rewrite the text; text the form can show rebuilds the form.
     */
    class RuleForm {
        constructor() {
            this.junction = 'and';
            this.items = [new FormCondition()];
        }

        text() {
            const texts = this.items.map((item) => item.text(this.junction)).filter(function (text) { return text !== ''; });
            return texts.join(' ' + this.junction + ' ');
        }

        /** Fills the form from a parsed rule; returns false when the rule nests deeper than the form can show. */
        fill(rule) {
            const operands = rule.kind === 'and' || rule.kind === 'or' ? rule.operands : [rule];
            const reader = new FormReader();
            const items = [];
            for (const operand of operands) {
                const item = reader.group(operand) || reader.condition(operand);
                if (item === null) {
                    return false;
                }
                items.push(item);
            }
            this.junction = rule.kind === 'or' ? 'or' : 'and';
            this.items = items;
            return true;
        }
    }

    /** Turns parts of a parsed rule into form items, or null when the form cannot show them. */
    class FormReader {
        group(rule) {
            if (rule.kind !== 'and' && rule.kind !== 'or') {
                return null;
            }
            const conditions = rule.operands.map((operand) => this.condition(operand));
            return conditions.indexOf(null) >= 0 ? null : new FormGroup(rule.kind, conditions);
        }

        condition(rule) {
            const negated = rule.kind === 'not';
            const test = negated ? rule.operand : rule;
            if (test.kind !== 'regex' && test.kind !== 'activity') {
                return null;
            }
            const condition = new FormCondition();
            condition.negated = negated;
            condition.part = test.kind === 'regex' ? test.part : 'is';
            condition.pattern = test.kind === 'regex' ? test.source.replace(/\\\//g, '/') : '';
            condition.flags = test.kind === 'regex' ? test.flags : '';
            condition.activity = test.kind === 'activity' ? test.activity : 'active';
            return condition;
        }
    }

    class FormGroup {
        constructor(junction, conditions) {
            this.junction = junction;
            this.conditions = conditions;
        }

        text() {
            const texts = this.conditions.map((condition) => condition.text(this.junction)).filter(function (text) { return text !== ''; });
            return texts.length === 0 ? '' : (texts.length === 1 ? texts[0] : '(' + texts.join(' ' + this.junction + ' ') + ')');
        }
    }

    class FormCondition {
        constructor() {
            this.part = 'name';
            this.negated = false;
            this.pattern = '';
            this.flags = '';
            this.activity = 'active';
        }

        text() {
            const not = this.negated ? 'not ' : '';
            if (this.part === 'is') {
                return not + 'is ' + this.activity;
            }
            if (this.pattern === '') {
                return '';
            }
            return not + this.part + ' ~ /' + this.escapedPattern() + '/' + this.flags;
        }

        /** Writes each / that is not already escaped as \/ so the pattern can sit between slashes. */
        escapedPattern() {
            let escaped = '';
            let afterBackslash = false;
            for (const character of this.pattern) {
                escaped += character === '/' && !afterBackslash ? '\\/' : character;
                afterBackslash = character === '\\' && !afterBackslash;
            }
            return escaped;
        }
    }

    /** Draws a RuleForm and reports every change to onChange(text). */
    class RuleFormView {
        constructor(dom, form, onChange) {
            this.dom = dom;
            this.form = form;
            this.onChange = onChange;
            this.container = dom.el('div', 'ts-rule-form');
        }

        render() {
            this.dom.clear(this.container);
            this.container.appendChild(this.junctionLine(this.form, 'Threads that match '));
            for (const item of this.form.items) {
                this.container.appendChild(item instanceof FormGroup ? this.groupBox(item) : this.conditionRow(item, this.form.items));
            }
            const buttons = this.dom.el('div', 'ts-rule-buttons');
            buttons.appendChild(this.button('+ Condition', () => this.form.items.push(new FormCondition())));
            buttons.appendChild(this.button('+ Group', () => this.form.items.push(new FormGroup('or', [new FormCondition(), new FormCondition()]))));
            this.container.appendChild(buttons);
            return this.container;
        }

        changed(redraw) {
            if (redraw) {
                this.render();
            }
            this.onChange(this.form.text());
        }

        button(text, action) {
            const button = this.dom.el('button', 'ts-button ts-button-small', text);
            button.type = 'button';
            button.addEventListener('click', () => {
                action();
                this.changed(true);
            });
            return button;
        }

        junctionLine(owner, prefix) {
            const line = this.dom.el('div', 'ts-rule-junction');
            line.appendChild(this.dom.text(prefix));
            line.appendChild(this.select([['and', 'all'], ['or', 'any']], owner.junction, (value) => { owner.junction = value; }, false));
            line.appendChild(this.dom.text(' of these:'));
            return line;
        }

        groupBox(group) {
            const box = this.dom.el('div', 'ts-rule-group');
            box.appendChild(this.junctionLine(group, 'Group: '));
            for (const condition of group.conditions) {
                box.appendChild(this.conditionRow(condition, group.conditions));
            }
            const buttons = this.dom.el('div', 'ts-rule-buttons');
            buttons.appendChild(this.button('+ Condition', () => group.conditions.push(new FormCondition())));
            buttons.appendChild(this.button('Remove group', () => this.form.items.splice(this.form.items.indexOf(group), 1)));
            box.appendChild(buttons);
            return box;
        }

        conditionRow(condition, siblings) {
            const row = this.dom.el('div', 'ts-rule-row');
            row.appendChild(this.select(PARTS, condition.part, (value) => { condition.part = value; }, true));
            const verbs = condition.part === 'is' ? [['is', 'is'], ['not', 'is not']] : [['is', 'matches'], ['not', 'does not match']];
            row.appendChild(this.select(verbs, condition.negated ? 'not' : 'is', (value) => { condition.negated = value === 'not'; }, false));
            if (condition.part === 'is') {
                row.appendChild(this.select(ACTIVITIES, condition.activity, (value) => { condition.activity = value; }, false));
            } else {
                row.appendChild(this.patternInput(condition));
                row.appendChild(this.ignoreCase(condition));
            }
            row.appendChild(this.button('✕', () => siblings.splice(siblings.indexOf(condition), 1)));
            return row;
        }

        select(options, value, assign, redraw) {
            const select = this.dom.el('select');
            for (const option of options) {
                const element = this.dom.el('option', null, option[1]);
                element.value = option[0];
                select.appendChild(element);
            }
            select.value = value;
            select.addEventListener('change', () => {
                assign(select.value);
                this.changed(redraw);
            });
            return select;
        }

        patternInput(condition) {
            const input = this.dom.el('input', 'ts-rule-pattern');
            input.type = 'text';
            input.placeholder = 'regular expression, e.g. ^pool-';
            input.value = condition.pattern;
            input.addEventListener('input', () => {
                condition.pattern = input.value;
                this.changed(false);
            });
            return input;
        }

        ignoreCase(condition) {
            const label = this.dom.el('label', 'ts-rule-flag');
            const box = this.dom.el('input');
            box.type = 'checkbox';
            box.checked = condition.flags.indexOf('i') >= 0;
            box.addEventListener('change', () => {
                condition.flags = box.checked ? condition.flags + 'i' : condition.flags.replace('i', '');
                this.changed(false);
            });
            label.appendChild(box);
            label.appendChild(this.dom.text(' ignore case'));
            return label;
        }
    }

    /** The custom categories: list, editor with form and rule text, live preview, export and import. */
    class CategoryEditorPane {
        constructor(dom, app) {
            this.dom = dom;
            this.app = app;
            this.parser = new model.CategoryRuleParser();
        }

        render(container) {
            this.container = container;
            this.pane = this.dom.el('div', 'ts-pane ts-category-editor');
            container.appendChild(this.pane);
            this.showList(null);
        }

        showList(message) {
            this.dom.clear(this.pane);
            this.pane.appendChild(this.dom.el('h2', null, 'Custom categories'));
            this.pane.appendChild(this.dom.el('p', 'ts-subtitle', 'Each category appears under every dump in the tree. Categories are kept in this browser; export them to keep or share them.'));
            this.note(message, this.app.categories.problem);
            this.pane.appendChild(this.listButtons());
            this.pane.appendChild(this.categoryList());
            this.pane.appendChild(this.exampleList());
            this.app.detail.showMessage('Select a category to edit it, or create a new one.');
        }

        note(message, problem) {
            if (problem) {
                this.pane.appendChild(this.dom.el('p', 'ts-error', problem));
            }
            if (message) {
                this.pane.appendChild(this.dom.el('p', 'ts-muted', message));
            }
        }

        listButtons() {
            const buttons = this.dom.el('div', 'ts-rule-buttons');
            buttons.appendChild(this.action('New category', () => this.showEditor(null)));
            buttons.appendChild(this.importButton());
            const exportButton = this.action('Export', () => this.exportFile());
            exportButton.disabled = this.app.categories.list().length === 0;
            buttons.appendChild(exportButton);
            return buttons;
        }

        action(text, handler) {
            const button = this.dom.el('button', 'ts-button', text);
            button.type = 'button';
            button.addEventListener('click', handler);
            return button;
        }

        categoryList() {
            const categories = this.app.categories.list();
            if (categories.length === 0) {
                return this.dom.el('p', 'ts-muted', 'No custom categories yet.');
            }
            const list = this.dom.el('ul', 'ts-category-list');
            for (const category of categories) {
                const item = this.dom.el('li');
                item.appendChild(this.dom.link(category.name, () => this.showEditor(category)));
                item.appendChild(this.dom.el('code', 'ts-rule-text', category.rule.text()));
                list.appendChild(item);
            }
            return list;
        }

        exampleList() {
            const section = this.dom.el('div', 'ts-examples');
            section.appendChild(this.dom.el('h3', null, 'Examples'));
            section.appendChild(this.dom.el('p', 'ts-muted', 'Use one as it is or as a starting point for your own. Nothing is added until you save it.'));
            const list = this.dom.el('ul', 'ts-category-list');
            for (const example of new model.CategoryExamples().list()) {
                const item = this.dom.el('li');
                item.appendChild(this.dom.el('strong', null, example.name));
                item.appendChild(this.dom.el('span', 'ts-muted', example.purpose));
                item.appendChild(this.dom.el('code', 'ts-rule-text', example.rule));
                item.appendChild(this.action('Use this', () => this.showExample(example)));
                list.appendChild(item);
            }
            section.appendChild(list);
            return section;
        }

        /** Opens the editor on a new category filled in from an example. */
        showExample(example) {
            this.showEditor(null);
            this.nameInput.value = example.name;
            this.ruleText.value = example.rule;
            this.textChanged();
        }

        importButton() {
            const label = this.dom.el('label', 'ts-button', 'Import…');
            const input = this.dom.el('input', 'ts-file-input');
            input.type = 'file';
            input.accept = '.json,application/json';
            input.addEventListener('change', () => {
                if (input.files.length > 0) {
                    input.files[0].text().then((json) => this.importJson(json, input.files[0].name));
                }
            });
            label.appendChild(input);
            return label;
        }

        importJson(json, name) {
            let categories;
            try {
                categories = new model.CategoryFile().categories(json);
            } catch (error) {
                this.showList(null);
                this.pane.insertBefore(this.dom.el('p', 'ts-error', 'Could not import ' + name + ': ' + error.message), this.pane.children[2]);
                return;
            }
            this.app.categories.importAll(categories);
            this.app.rebuildTrees();
            this.showList('Imported ' + (categories.length === 1 ? '1 category' : categories.length + ' categories') + ' from ' + name + '.');
        }

        exportFile() {
            const blob = new Blob([this.app.categories.json()], { type: 'application/json' });
            const link = this.dom.el('a');
            link.href = URL.createObjectURL(blob);
            link.download = 'threadsee-categories.json';
            this.pane.appendChild(link);
            link.click();
            link.remove();
            setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
        }

        showEditor(category) {
            this.editing = category;
            this.dom.clear(this.pane);
            this.pane.appendChild(this.dom.el('h2', null, category === null ? 'New category' : 'Edit category'));
            this.nameInput = this.labelled('Name', this.dom.el('input', 'ts-category-name'));
            this.nameInput.type = 'text';
            this.nameInput.value = category === null ? '' : category.name;
            this.form = new RuleForm();
            this.formView = new RuleFormView(this.dom, this.form, (text) => this.formChanged(text));
            this.pane.appendChild(this.formView.render());
            this.ruleText = this.labelled('Rule', this.dom.el('textarea', 'ts-rule-input'));
            this.ruleText.rows = 3;
            this.ruleText.spellcheck = false;
            this.ruleText.addEventListener('input', () => this.textChanged());
            this.status = this.dom.el('div', 'ts-rule-status');
            this.pane.appendChild(this.status);
            this.pane.appendChild(this.editorButtons(category));
            this.pane.appendChild(this.dom.el('p', 'ts-muted ts-rule-help',
                'Rule syntax: name, frame, top, lock or text ~ /regex/ (add i after the closing / to ignore case), is active | idle | jvm, combined with and, or, not and parentheses. Frames are matched as printed, without "at".'));
            this.ruleText.value = category === null ? '' : category.rule.text();
            this.textChanged();
            this.nameInput.focus();
        }

        labelled(text, control) {
            const label = this.dom.el('label', 'ts-field');
            label.appendChild(this.dom.el('span', null, text));
            label.appendChild(control);
            this.pane.appendChild(label);
            return control;
        }

        editorButtons(category) {
            const buttons = this.dom.el('div', 'ts-rule-buttons');
            buttons.appendChild(this.action('Save', () => this.saveCategory()));
            buttons.appendChild(this.action('Cancel', () => this.showList(null)));
            if (category !== null) {
                buttons.appendChild(this.action('Delete', () => this.deleteCategory(category)));
            }
            return buttons;
        }

        formChanged(text) {
            this.ruleText.value = text;
            this.preview(text, false);
        }

        textChanged() {
            if (this.ruleText.value.trim() === '') {
                this.form.junction = 'and';
                this.form.items = [new FormCondition()];
                this.formView.container.classList.remove('ts-disabled');
                this.formView.render();
                this.preview('', false);
                return;
            }
            const rule = this.preview(this.ruleText.value, true);
            if (rule === null) {
                return;
            }
            this.formView.container.classList.toggle('ts-disabled', !this.form.fill(rule));
            if (this.formView.container.classList.contains('ts-disabled')) {
                this.dom.clear(this.formView.container);
                this.formView.container.appendChild(this.dom.el('p', 'ts-muted', 'This rule nests deeper than the form can show; edit it as text.'));
            } else {
                this.formView.render();
            }
        }

        /** Parses the rule, shows the error or the threads it selects in the dump last looked at, and returns the rule or null. */
        preview(text, fromText) {
            this.dom.clear(this.status);
            if (text.trim() === '' && !fromText) {
                this.status.appendChild(this.dom.el('span', 'ts-muted', 'Fill in a condition.'));
                return null;
            }
            try {
                const rule = this.parser.parse(text);
                this.showMatches(rule);
                return rule;
            } catch (error) {
                if (!(error instanceof model.RuleError)) {
                    throw error;
                }
                this.showError(text, error);
                return null;
            }
        }

        showError(text, error) {
            this.status.appendChild(this.dom.el('div', 'ts-error', 'Position ' + error.position + ': ' + error.message));
            const marker = this.dom.el('pre', 'ts-rule-marker');
            marker.textContent = text + '\n' + ' '.repeat(error.position) + '^';
            this.status.appendChild(marker);
            this.app.detail.showMessage('');
        }

        previewAnalysis() {
            const analysis = this.app.previewAnalysis;
            if (analysis !== null && this.app.analyses.has(analysis.dump)) {
                return analysis;
            }
            const first = this.app.analyses.values().next();
            return first.done ? null : first.value;
        }

        showMatches(rule) {
            const analysis = this.previewAnalysis();
            if (analysis === null) {
                this.status.appendChild(this.dom.el('span', 'ts-muted', 'The rule is valid. Open a thread dump to see which threads it selects.'));
                this.app.detail.showMessage('');
                return;
            }
            const matching = analysis.dump.threads.filter(function (thread) { return rule.matches(thread); });
            this.status.appendChild(this.dom.el('span', null, 'Selects ' + matching.length + ' of ' + plural(analysis.dump.threads.length, 'thread') + ' in ' + analysis.dump.title() + '.'));
            this.app.detail.showMatchingThreads(matching, analysis);
        }

        saveCategory() {
            const name = this.nameInput.value.trim();
            let category;
            try {
                if (name === '') {
                    throw new Error('Give the category a name.');
                }
                category = new model.CustomCategory(name, this.ruleText.value);
            } catch (error) {
                this.dom.clear(this.status);
                this.status.appendChild(this.dom.el('div', 'ts-error', error instanceof model.RuleError ? 'Position ' + error.position + ': ' + error.message : error.message));
                return;
            }
            this.app.categories.put(category, this.editing === null ? null : this.editing.name);
            this.app.rebuildTrees();
            this.showList('Saved "' + name + '".');
        }

        deleteCategory(category) {
            this.app.categories.remove(category.name);
            this.app.rebuildTrees();
            this.showList('Deleted "' + category.name + '".');
        }
    }

    /** The overview of one dump: state distribution, counts, TDA's hints and heap information. */
    class OverviewPane {
        constructor(dom, app, analysis) {
            this.dom = dom;
            this.app = app;
            this.analysis = analysis;
        }

        render(container) {
            const dump = this.analysis.dump;
            const pane = this.dom.el('div', 'ts-pane');
            pane.appendChild(this.dom.el('h2', null, 'Thread Dump Overview'));
            pane.appendChild(this.dom.el('p', 'ts-subtitle', dump.title() + ' · ' + dump.vmInfo));
            this.formatNote(pane);
            if (dump.isBeforeJdk8()) {
                pane.appendChild(this.hint({ severity: 'warning', text: 'This dump comes from a JVM older than JDK 8. JThread supports JDK 8 and later, so some details may be missing or wrong.' }));
            }
            if (dump.threads.some(function (thread) { return thread.threadState !== '' || thread.headerState !== ''; })) {
                pane.appendChild(this.dom.el('h3', null, 'Thread State Distribution (' + plural(dump.threads.length, 'thread') + ')'));
                this.stateBar(pane);
            }
            pane.appendChild(this.stats());
            this.hints(pane);
            this.heap(pane);
            container.appendChild(pane);
        }

        formatNote(pane) {
            const dump = this.analysis.dump;
            if (dump.format !== model.DumpFormat.JCMD_TEXT) {
                return;
            }
            const hasStates = dump.threads.some(function (thread) { return thread.threadState !== ''; });
            const text = hasStates
                ? 'Written by jcmd Thread.dump_to_file. This format has no thread priorities, native ids, CPU times or JVM deadlock report; JThread looks for deadlocks itself in the lock lines.'
                : 'Written by jcmd Thread.dump_to_file on a JDK that records neither thread states nor locks, so only the threads and their stacks can be shown. Later JDKs (JDK 27, for one) add both.';
            pane.appendChild(this.hint({ severity: 'info', text: text }));
        }

        stateBar(pane) {
            const counts = this.analysis.categories.stateDistribution();
            const total = this.analysis.dump.threads.length;
            const bar = this.dom.el('div', 'ts-state-bar');
            const legend = this.dom.el('div', 'ts-legend');
            let other = total;
            for (const state of STATE_ORDER) {
                const count = counts.get(state) || 0;
                other -= count;
                this.segment(bar, legend, state, count, total);
            }
            this.segment(bar, legend, 'OTHER', other, total);
            pane.appendChild(bar);
            pane.appendChild(legend);
        }

        segment(bar, legend, state, count, total) {
            if (count <= 0) {
                return;
            }
            const part = this.dom.el('span', 'ts-state-' + state);
            part.style.width = (count * 100 / total) + '%';
            part.title = state + ': ' + count;
            bar.appendChild(part);
            const key = this.dom.el('span');
            key.appendChild(this.dom.el('i', 'ts-state-' + state));
            key.appendChild(this.dom.text(state + ' (' + count + ')'));
            legend.appendChild(key);
        }

        stats() {
            const categories = this.analysis.categories;
            const dump = this.analysis.dump;
            const list = this.dom.el('dl', 'ts-stats');
            const add = (label, value) => {
                const row = this.dom.el('div');
                row.appendChild(this.dom.el('dt', null, label));
                row.appendChild(this.dom.el('dd', null, value));
                list.appendChild(row);
            };
            add('Threads', dump.threads.length);
            add('Deadlocks', this.analysis.deadlocks.length);
            add('Monitors', this.analysis.monitors.all().length);
            add('Monitors without locking thread', this.analysis.monitors.withoutLockingThread().length);
            add('Threads waiting', categories.waiting.length);
            add('Threads sleeping', categories.sleeping.length);
            add('Threads locking', categories.locking.length);
            add('Virtual threads', categories.virtual.length);
            if (dump.jniReferences !== null) {
                add('JNI', dump.jniReferences.replace(/^JNI global ref\w*:?\s*/, ''));
            }
            return list;
        }

        hints(pane) {
            if (this.analysis.hints.length === 0) {
                return;
            }
            pane.appendChild(this.dom.el('h3', null, 'Analysis Hints'));
            for (const hint of this.analysis.hints) {
                pane.appendChild(this.hint(hint));
            }
        }

        hint(hint) {
            const box = this.dom.el('p', 'ts-hint ts-hint-' + hint.severity, hint.text);
            if (hint.target && this.app.categoryNode(this.analysis, hint.target) !== null) {
                box.appendChild(this.dom.link('Show', () => this.app.navigate(this.analysis, hint.target)));
            }
            return box;
        }

        heap(pane) {
            if (this.analysis.dump.heapLines.length === 0) {
                return;
            }
            pane.appendChild(this.dom.el('h3', null, 'Heap'));
            pane.appendChild(this.dom.el('pre', 'ts-block', this.analysis.dump.heapLines.join('\n')));
        }
    }

    /** TDA's long running thread detection over all the dumps of one log file. */
    class LongRunningPane {
        constructor(dom, app, log) {
            this.dom = dom;
            this.app = app;
            this.log = log;
            this.analyses = log.dumps.map(function (dump) { return app.analysisOf(log, dump); });
        }

        render(container) {
            this.container = container;
            this.minimum = this.log.dumps.length;
            this.draw();
        }

        draw() {
            this.dom.clear(this.container);
            const found = new model.LongRunningThreads(this.log.dumps, this.minimum).list();
            const table = new DataTable(this.dom, [
                { title: 'Name', value: function (entry) { return entry.thread.name; } },
                { title: 'In dumps', value: function (entry) { return entry.occurrences.length; }, numeric: true },
                { title: 'Thread.State', value: function (entry) { return entry.thread.threadState; } },
                { title: 'CPU change (ms)', value: function (entry) { return entry.cpuDeltaMs; }, display: function (entry) { return formatMs(entry.cpuDeltaMs); }, numeric: true },
                { title: 'First frame', value: function (entry) { return entry.thread.frames[0] || ''; } }
            ], found, {
                noun: 'unchanged thread',
                extraTools: this.minimumInput(),
                filterText: function (entry) { return entry.thread.text(); },
                filterPlaceholder: 'Filter by name or stack text',
                onSelect: (entry) => this.app.detail.showOccurrences(entry, this.analyses)
            });
            table.render(this.container);
            this.app.detail.showMessage('Threads whose stack is identical in at least ' + this.minimum + ' of the ' + this.log.dumps.length
                + ' dumps, compared with the first dump. A large CPU change means the thread is running in the same place; none means it is blocked or idle.');
        }

        minimumInput() {
            const label = this.dom.el('label', 'ts-count', 'Unchanged in at least ');
            const input = this.dom.el('input');
            input.type = 'number';
            input.min = '2';
            input.max = String(this.log.dumps.length);
            input.value = String(this.minimum);
            input.addEventListener('change', () => {
                const value = parseInt(input.value, 10);
                if (value >= 2 && value <= this.log.dumps.length) {
                    this.minimum = value;
                    this.draw();
                }
            });
            label.appendChild(input);
            label.appendChild(this.dom.text(' of ' + this.log.dumps.length + ' dumps'));
            return label;
        }
    }

    /** Lets the user drag the two splitters to resize the panes. */
    class SplitterDrag {
        constructor(appElement, mainElement) {
            this.appElement = appElement;
            this.mainElement = mainElement;
        }

        wire(vertical, horizontal) {
            this.follow(vertical, (event, box) => {
                const percent = clamp((event.clientX - box.left) * 100 / box.width, 15, 70);
                this.appElement.style.setProperty('--ts-tree-width', percent + '%');
            });
            this.follow(horizontal, (event, box) => {
                const percent = clamp((event.clientY - box.top) * 100 / box.height, 15, 85);
                this.appElement.style.setProperty('--ts-top-height', percent + '%');
            });
        }

        follow(handle, move) {
            handle.addEventListener('pointerdown', (event) => {
                event.preventDefault();
                handle.setPointerCapture(event.pointerId);
                const onMove = (moveEvent) => move(moveEvent, this.mainElement.getBoundingClientRect());
                const onUp = () => {
                    handle.removeEventListener('pointermove', onMove);
                    handle.removeEventListener('pointerup', onUp);
                };
                handle.addEventListener('pointermove', onMove);
                handle.addEventListener('pointerup', onUp);
            });
        }
    }

    function clamp(value, low, high) {
        return Math.min(high, Math.max(low, value));
    }

    new ThreadSeeApp(root.document).start();
}(window));
