# jheapo.com — site structure and copy

Status: draft for Kirk to edit, updated 2026-11-15. Nothing here is built yet. Section 11 lists what is decided and can be built now. Visual and page design are in `_specs/design.md`.

Inputs:
- the current site in this repo
- the business development analyst's manuscript, "JHeapo Website Framework and Complete Copy" ("the manuscript" below)
- `_specs/paddle-checkout.md`

Each item is marked **Decided** (Kirk ruled on it), **Proposed** (Claude's suggestion, yours to accept, change or strike) or **Open** (needs a fact or a ruling from Kirk).

## 1. What the site sells

**Decided**
- The aim (2026-11-15): "a complete memory analysis package backed by MCP so that tools like Claude can make use of it."
- The product line (2026-11-15):

  | Product | Price | MCP server |
  |---|---|---|
  | GCSee | Free | Premium add-on. Not started; GCSee is the next product to get MCP |
  | JScrub | Free | Free |
  | JHeapo Desktop | Paid | Premium add-on (below) |
  | JThread | Free; built into the website, runs in the visitor's browser | Deferred: Kirk will consider it later. A Node MCP server reusing `model.js` is possible; WebMCP is not ready. The site says nothing about it until then |

- JHeapo MCP (2026-11-15, as ruled 2026-11-11): buying JHeapo MCP gives a licence that also runs Desktop. It is one purchase, not a second item bought on top of Desktop. Desktop→MCP upgrades are handled by hand for now.

- All tools keep the customer's data on the customer's machine (2026-11-15). This applies to every tool, JThread included; JThread analyses a thread dump in the visitor's browser.
- The site also sells a consulting package and an Enterprise offering (2026-11-15).
- Enterprise (2026-11-15): site-wide use of the products, with support. Sold by contact. Which products are covered is agreed with each client.
- Enterprise copy lists what the offering includes. It does not mention what it excludes (2026-11-15).
- Licences are self-serve through Paddle: the buyer pays and receives a licence without contacting Kirk.
- No tiers and no seat count.
- JHeapo is a free download. Without a licence it shows only the summary page. There is no trial or "try it first" offer.
- Free non-commercial licences for education, academic research and open-source development are available on request.

**Proposed**
- The site has four routes, and every page leads to at least one of them:
  1. **Run it yourself**: Download and Pricing. The free products (GCSee, JScrub) are a way in to the paid ones.
  2. **Have Kirk investigate**: the consulting package.
  3. **Enterprise**: the Enterprise offering, by contact.
  4. **Learn the method**: training, by contact (O1).
- Licences for JHeapo Desktop and the MCP add-ons are never sold through the contact form. Only Enterprise and academic/open-source licences are.
  - This replaces the manuscript's "Ask about licensing" and "Discuss software licensing" buttons with Pricing and Download.
- MCP appears in the home page hero and on every product page, not only on the Pricing page. Each product page marks its MCP server as free or as a premium add-on.
  - Show one real agent session against a demo dump: the question asked, the MCP tool calls, and the answer ending in a reference chain to a domain class.
- The audience split (J6) gets a third entry: "For AI agents". It lists the MCP servers (JHeapo, JScrub, and GCSee when it ships) and shows how to connect them to Claude and to other MCP clients. The servers are vendor-neutral.
- The Pricing page has one card per product, as on JetBrains:
  - GCSee: free.
  - JScrub: free, MCP included.
  - JHeapo Desktop: price.
  - JHeapo MCP: price, with the line "Includes JHeapo Desktop".
  - Enterprise: by contact.
  - Consulting package: by contact.
  - A line for academic and open-source licences.

**Open**
- **O0b. GCSee MCP on the site before it ships.** List it as "MCP add-on planned" with no date, or leave it off until it ships?
  - It will also need its own licence kind in the licence service.
- **O0c. JScrub MCP.** Does the free JScrub MCP server exist today, or is it also planned?
- **O0e. The consulting package.** Is it a defined offer (fixed scope, stated price or price range, stated deliverables), or the manuscript's engagement where scope and price are agreed each time?
  - Does it include a JHeapo licence for the customer's team?
- **O0f. Enterprise details.**
  - Does the current card's "terms and invoicing to suit your procurement" stay?
- **O1. kodewerk.com overlap.** kodewerk.com already has service pages.
  - Proposal: jheapo.com offers the consulting package. kodewerk.com keeps general Java performance consulting and training, and each site links to the other.
  - Or does all consulting move to jheapo.com?
- **O3. Prices public.** Paddle's domain approval needs a public pricing page.
  - The 2026-11-02 ruling "prices not to be mentioned publicly" looks superseded by the Paddle cards, which show prices. Confirm.

## 2. Sitemap

**Decided (2026-11-16):** every product has its own page: `/jheapo/`, `/gcsee/`, `/jscrub/`, `/jthread/`.

**Proposed.** Routes marked † are new. Paths are relative to the site root.

| Route | Page | Source |
|---|---|---|
| `/` | Home | Manuscript page 1, reworked (section 4) |
| `/jheapo/` | JHeapo Desktop and its MCP add-on | Manuscript page 5 + current `jheapo.html`, rewritten |
| `/gcsee/` † | GCSee (free) and its planned MCP add-on | Current home-page section, expanded |
| `/jscrub/` † | JScrub and its MCP server (both free) | Current home-page section + manuscript page 7 |
| `/use-cases/infrastructure-costs/` † | Reduce Java infrastructure costs | Manuscript page 2 |
| `/use-cases/memory-problems/` † | Resolve memory and performance problems | Manuscript page 3 |
| `/consulting/` † | The consulting package: how an analysis works | Manuscript page 4 (O0e) |
| `/enterprise/` † | Enterprise: site-wide use and support | New; replaces the Enterprise card's text (O0f) |
| `/stories/` † | Customer stories and worked examples | Manuscript page 6 + demo apps |
| `/pricing/` | One card per product, plus Enterprise, consulting and academic | Current `/license/` renamed (O4) |
| `/download/` | Downloads for JHeapo, GCSee and JScrub | Current page, extended |
| `/data-handling/` † | Data handling | Manuscript page 7 |
| `/about/` | About Kirk | Manuscript page 8 + current page |
| `/contact/` † | Start an engagement | Manuscript page 9, form options changed |
| `/terms/` | Terms | Current page |
| `/privacy/` † | Privacy notice | Required by Paddle and by the contact form |
| `/refunds/` † | Refund policy | Required by Paddle; refers to Paddle's policy (2026-11-10 ruling) |
| `/welcome/` | After checkout | Current page |
| `/jthread/` | JThread, the tool itself | Current page; listed under Products ▾ |

**Open**
- **O4. Pricing page route.** `/pricing/` avoids the licence/license spelling question in the URL.
  - Keep `/license/` as a redirect (jekyll-redirect-from works on GitHub Pages)?
  - Paddle's default payment link would change to `/pricing/`.
- **O5. MCP pages.** Each product's MCP server is described on that product's page, not on a page of its own.
  - The "For AI agents" page gathers all of them in one place.

## 3. Navigation

**Proposed**
- **Header:** Products ▾ · Use cases ▾ · Consulting · Enterprise · Stories · Pricing · **Download** (a button).
  - Products ▾ lists JHeapo, GCSee, JScrub and JThread, each with a one-line description and a tag (Free · MCP included · MCP add-on), as JetBrains does.
  - Use cases ▾: Infrastructure costs · Memory and performance problems.
- **Footer:** every page in the sitemap, plus Terms · Privacy · Refunds · Contact.
  - Paddle requires the legal pages to be reachable from the navigation.
- No links to GitHub pages (2026-11-10 ruling). Download files are still served from the releases repo.
- Each product page also has its own sub-navigation bar under the site header (section 10, J2).

## 4. Home page

**Proposed** order:
1. **Hero.** The manuscript's headline "Before you buy more memory, find out what's using it." and its short lede, with two buttons: Download and Discuss your Java workload.
2. **Products.** A JetBrains-style row: each product with a name, a one-line description and links to its page and to Download.
3. **Three problems.** The manuscript's three symptoms (larger instances, recurring performance work, a stalled heap-dump investigation). Each links to its use-case page.
4. **What a finding looks like.** One reference-chain excerpt from a worked example, showing the chain ending in a domain class (section 7).
5. **Stories.** Three short panels (section 6) and a link to `/stories/`.
6. **Routes** (section 1): Download · Consulting · Enterprise · Training.

## 5. Manuscript copy: keep, rewrite or drop

**Proposed**

| Manuscript page | Disposition |
|---|---|
| 1 Home | Keep the headline, lede and three symptoms. Replace "Two ways to use JHeapo" with the routes in section 1. Drop "Ask about licensing". |
| 2 Infrastructure costs | Keep most of it. Drop the cost formula. Add a closing section with both routes. |
| 3 Memory problems | Keep. Rewrite the OutOfMemoryError item to say plainly that the heap may be too small for the live set — a configuration problem, not a leak. |
| 4 How it works | Keep as `/consulting/`. Choose a voice (O6). |
| 5 Software | Rewrite as `/jheapo/`: Desktop and its MCP add-on, Download and Buy, the corrected analysis list (section 7), and "streaming, out-of-core" in place of "disk-streaming". |
| 6 Stories | Keep the three stories with the corrections in section 6. Add worked examples from the demo apps. |
| 7 Data handling | Keep. Link to `/jscrub/`. Kirk confirms what JScrub transforms. |
| 8 About | Merge with the current about page. Check the facts (O7). |
| 9 Contact | Keep the form. Change the enquiry types to: Consulting package · Enterprise · Training · Academic or open-source licence · Data-handling requirements. Drop "Software licensing". |
| Developer handoff | Keep as guidance for building the site; it is not site copy. |

**Style corrections across the manuscript**
- Decided (2026-11-15): lists on the site say what is included, never what is excluded. This applies to every offering (products, MCP servers, consulting package, Enterprise, academic licence) and to feature lists.
- State the "results are specific to the workload" caveat once, on `/stories/`. Elsewhere, remove the hedging from the copy.
- Use "licence" as the noun and "license" only as the verb.
- Plain vocabulary, no filler words, and Java engineering terms (Style guide).
- **O6. Voice.** The manuscript mixes "Kirk" in the third person with "we". Pick one: third person throughout, or "I"?

## 6. Stories

**Proposed**
- Say plainly that all three stories are consulting and training results from reducing allocation rate. None was produced by heap-dump analysis or by JHeapo.
- They support the consulting route. JHeapo's own claims rest on worked examples (section 7).

**Open**
- **O7. LinkedIn.** The duration is two days in the case study and three days on the earlier site. Which is right? Name LinkedIn, or keep it anonymous?
- **O8. C24.** Confirm the benchmark figures (100,000 → 25 million transactions per second) and the customer's server counts (40 servers → one plus a mirror required → four deployed).
- **O9. Collaboration company.** Confirm the figure of roughly $1 million a month and that the company stays anonymous.
- **O10. Source site.** The manuscript cites jheppo.netlify.app as "the current JHeapo website", and the collaboration story isn't in this repo. Is that an older copy of the site?

## 7. Worked examples and what JHeapo analyses

**Proposed**
- Worked examples come from Kirk's demo applications, labelled as demos: Tips, BadClassLoader and the Neo4j demo.
  - They deliberately use bad coding practices (static fields, for example) to show why those practices are bad. Say so on the page.
- What sets JHeapo apart, stated with evidence rather than as a claim:
  1. Every finding ends in a reference chain from a GC root to a domain class the user wrote. JDK objects are not filtered out, because leaks occur in JDK code too.
  2. The streaming, out-of-core design analyses dumps larger than the analysis machine's RAM. No size figure until one has been measured (2026-11-02 ruling).
  3. The MCP product lets an AI agent run the analysis.

**Open**
- **O11. Analysis list.** The manuscript lists duplicate strings, boxed primitives, empty and oversized collections, duplicate arrays and objects, reference paths, and object model complexity.
  - Add: retained size and immediate dominators, entanglement, classloaders, and finalization / Cleaner / JDK-internal Cleaner (counted separately).
  - Object model complexity is in the product, as "Class complexity" (screenshot, 2026-11-15). Use that name on the site.
- **O12. Tips report.** May the Tips report excerpt and its reference-chain diagram be published as a worked example?

## 8. Practical requirements

**Proposed**
- **Paddle (live):** domain approval needs the pricing page, terms, privacy notice, refund policy and contact details, all reachable from the navigation.
  - `plans.yml` changes from Basic/Advanced to Desktop and MCP.
  - The quantity selector is removed, because licences carry no seat count.
  - Copy that sells "one seat" is removed.

**Open**
- **O13. Contact form backend.** GitHub Pages can't receive form submissions. Choose one:
  1. A third-party form service.
  2. An endpoint on the Hetzner licence server.
  3. A mailto link with the manuscript's fields as a template.

  Whichever is chosen, the privacy notice has to cover it.

## 9. Visual direction

**Proposed**
- Avoid the patterns the current pages share: a small label over every heading, a centred lede under every title, and every section built as a grid of three equal cards.
- Each product page gets its own layout and its own colour, within one shared header, footer and type scale (as on JetBrains).
- Graphics come from real output (reference chains, dominator views, the deployment comparisons in the manuscript's graphic briefs), never invented dashboards.
- The UI rules apply to the site:
  - black text, not grey
  - titles bold and slightly larger
  - red values in bold
  - simple class names, with the fully qualified name on hover
- Layout is designed after the copy is settled.

**Open**
- **O14a. Screenshots.** Four are in `assets/img/` (2026-11-15). All are from the Tips demo (`tips_tiny.hprof`, 1.49 GB).

  Proposed use:

  | File | View | Use on the site |
  |---|---|---|
  | `ss_assesment.png` | Assessment: "Accumulation — 98.1% of what is reachable is retained by the dominators below · dumped on OutOfMemoryError"; Heap waste 909.4 MB and Dup. strings 271.5 MB in the sidebar | J4 first row; memory-problems use case (accumulation versus a heap too small for the live set) |
  | `ss_dominator.png` | Dominator map: `Keyword` → `ConcurrentHashMap` → … → `Tip`, with the `BoundedThreadPool` chain beside it | J4 row on retained size and immediate dominators |
  | `ss_entanglement.png` | Entanglement: 1,803,213 of 1,803,232 `Tip` instances (100%) entangled; graph from `Keyword` down to `Tip`; legend application / JDK / library | J4 entanglement row; home page "What a finding looks like" (the chain ends at a domain class) |
  | `ss_classcomplexity.png` | Class complexity: 19 classes, max inheritance depth 4, statics per class (`Keyword` has 9) | J4 object-model complexity row. This answers part of O11: the analysis is in the product as "Class complexity" |

  Kirk fixed the screenshots (2026-11-15): the browser window is cropped out of `ss_dominator.png` and `ss_entanglement.png`.
  - **O14b.** Still visible: the header's "complete at 19s" against a 1.49 GB dump, which is a performance figure (2026-11-02: no performance figures). Keep it or crop it?
  - Resize to twice the displayed width when building the page.

  More screenshots will be added later. Rows in J4 with no screenshot yet: heap waste / duplicate strings, collections, classloaders (BadClassLoader demo), finalization and Cleaners, and an MCP session (an agent's question, the tool calls, and the answer).
- **O14. Design pass.** Mock up the home page and `/jheapo/` before building, or build directly in Jekyll?

## 10. Patterns taken from jetbrains.com

Kirk likes how jetbrains.com presents its products and thinks its structure combines well with the manuscript. Below are the patterns read from the JetBrains home page and the IntelliJ IDEA page (2026-11-15), each mapped to this site.

**Proposed: adopt**

| # | JetBrains pattern | On jheapo.com |
|---|---|---|
| J1 | Products listed as a name and a one-line description, with tags such as "Free for non-commercial use" | Products ▾ menu and the home page product row. Tag: "Free licence for education and open source" |
| J2 | Each product page has a sub-navigation bar: product name · What's New · Features · Resources, with **Pricing** and **Download** buttons on the right | `/jheapo/` bar: JHeapo · What's new (release notes) · Features · Docs · **Pricing** · **Download**. The same for `/gcsee/` and `/jscrub/` |
| J3 | Product hero: the product name as H1, a one-line subhead, one Download button, and a small note under it about what is free | H1 "JHeapo", subhead from the manuscript (O15), Download button. Note: "Free download. Without a licence, the summary page only." |
| J4 | Features shown as rows: a heading, a short paragraph, and real product footage beside it | One row per analysis, each with a screenshot of real JHeapo output from a demo dump: reference chain to a domain class, immediate dominators, duplicate strings, entanglement, classloaders, MCP from an agent |
| J5 | A side-by-side comparison labelled "illustrative" (a refactoring without and with IDE support, counted in tool calls) | Option: the same Tips leak shown as the largest retainer (a JDK collection) beside JHeapo's reference chain ending at `Keyword.AllKeywords`, labelled as a demo. Must not say or imply that other tools can't do this (O16) |
| J6 | Home page split by audience (For devs · For teams · For orgs) | Three entries. "For engineers" leads to the memory-problems use case and the products. "For engineering leaders and FinOps" leads to the infrastructure-costs use case and the consulting package. "For AI agents" leads to the MCP servers (section 1) |
| J7 | Customer stories as cards: the person, their role, a short quote, and a link to the case study | Story cards on `/stories/` and the home page. Quotes only where the person has given permission. Until then, cards carry the outcome and the type of engagement (section 6) |
| J8 | A trust block (SOC 2, GDPR) with a link to more detail | A data-handling block: analysis runs on your machine, nothing is uploaded, JScrub before sharing a dump. Links to `/data-handling/`. No compliance badges, since there are none |
| J9 | The Download call to action repeated at the bottom of the product page | Repeated at the bottom of `/jheapo/` and of each use-case page, next to "Discuss your Java workload" |
| J10 | "Discover more" link cards near the end of the page (Choose your IDE · Contact support · Speak to sales) | The routes from section 1: Download · Consulting · Enterprise · Training |
| J11 | Footer: link columns by group, then a separate row of legal links | Columns: Products · Use cases · Services · Company. Legal row: Terms · Privacy · Refunds |
| J12 | Early Access as a separate section from releases | Beta releases (`v<n>-beta.<m>`) listed under What's new and marked as betas |

**Proposed: leave out**
- **The size of the menus.** JetBrains has ten groups in its "More" menu. A small product line needs two menus at most.
- **Logo walls** ("Trusted by 300,000+ organizations"), unless Kirk has permission to use customer logos.
- **Background videos.** Use still screenshots of real output; they load faster and can be read without playing.
- **Duplicated sections.** The JetBrains home page repeats its product list in a second order.

**Open**
- **O15. JHeapo subhead.** The one line under "JHeapo" in the hero. Candidates:
  - "Find the code behind your Java memory bill." (from the manuscript's core proposition)
  - "Java heap analysis that ends at the code responsible."
  - Something of yours.
- **O16. Comparison in J5.** Include it? If yes, should it be built from the Tips demo or from another demo app?

## 11. Ready to build

Everything below is Decided, or follows directly from a Decided item. It can be built before the Open items are settled.

1. **Paddle catalogue and Pricing page.**
   - `plans.yml`: Basic and Advanced become JHeapo Desktop and JHeapo MCP.
   - The JHeapo MCP card carries "Includes JHeapo Desktop".
   - The seat quantity is removed from the checkout, and "one seat" is removed from the copy.
   - New Paddle products and prices are needed in the sandbox first (Kirk, in the Paddle dashboard).
2. **Product line in the navigation.** Products ▾ lists JHeapo, GCSee, JScrub and JThread, with Free / MCP included / MCP add-on tags.
3. **Product pages for GCSee and JScrub.** Built from the current home-page sections. GCSee's MCP line waits for O0b.
4. **Enterprise page and card.** Site-wide use of the products, with support, by contact. Products covered are agreed with each client.
5. **Data handling.** "All tools keep the customer's data on the customer's machine" goes on every product page and on `/data-handling/`.
6. **Inclusive lists.** Lists say what is included, never what is excluded. This applies to every page, the current pages included.
7. **Spelling.** "Licence" is the noun everywhere in the copy.
8. **JHeapo page facts.** Replace "Contact us for a build", "private release build", "Leak suspects" and "x64 only" with the current product facts.

