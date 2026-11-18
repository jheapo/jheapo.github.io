# jheapo.com — design

Status: being answered, 2026-11-15. This document will hold the visual and page design once these questions are answered. What the site says and sells is in `_specs/site-structure.md`.

The questions come from the business development analyst's manuscript ("the manuscript"): its graphic approach, its graphic briefs, its developer handoff and its accessibility notes. Each one names the part of the manuscript it comes from.

## A. Visual identity

**Decided (2026-11-15):** "I like the current colour scheme and I don't want to change it."
- Read as: D1–D6 stay as the site is now (colours, the light version with a dark version that follows the visitor's system setting, the product marks, system fonts). Correct this if any of D1, D4, D5 or D6 should change.


- **D1. Brand.** The site has a JHeapo mark (`jheapo-mark.svg`, `hippo-line.svg`), a GCSee image, a JScrub image (Duke with a mop) and a JThread Duke head. Do all four products share one family look with a colour each (the JetBrains model), or does each keep its own mark as it is now?
- **D2. Light or dark.** The site is light, with a dark version that follows the visitor's system setting. JHeapo's own UI, and so every screenshot, is dark. Does the site stay light and frame the dark screenshots, go dark to match the product, or keep following the system setting?
- **D3. Colour.** Teal (`--brand: #0e7c86`) and amber (`--accent`) carry the site now. Keep them, or choose new colours with D1?
- **D4. Type.** The site uses the visitor's system fonts and a system monospace. The manuscript wants code identifiers such as `Tip`, `Keyword.AllKeywords`, `equals` and `hashCode` set in monospace. Keep system fonts, or choose a typeface? This also decides how the brand name is set.
- **D5. Grey text.** The UI rule is black text, not grey. The site's `--ink-soft` (grey) is used for most body text. Does the rule apply to the website as well as the product?
- **D6. What not to look like.** You don't want a site that reads as built by Claude. Apart from JetBrains, is there a site whose look you like, or one you specifically don't want to look like?

## B. Graphics

**Decided (2026-11-15):** the images don't change. Further questions on graphics are discussed as they come up.


The manuscript asks for real report excerpts, reference paths, deployment comparisons and simple process diagrams. Real measurements must name their source; anything else is labelled "Illustration". No invented dashboards, invented savings percentages, stock server-room photos, or customer logos without permission.

- **D7. Who draws the diagrams?** Options:
  - Screenshots of JHeapo itself.
  - Diagrams redrawn in the site's style as SVG.
  - A mix: screenshots for the product pages, SVG for the use-case and process pages.
- **D8. Measured, sampled, inferred, illustrative.** The manuscript wants diagrams to show which of these four each element is. What visual convention: line styles, a label on each diagram, or a legend?
- **D9. Home hero (manuscript page 1).** The brief asks for a simplified heap showing application data, duplicated data, collection overhead and retained objects. Use the Assessment screenshot (real data from the Tips demo), or an SVG labelled "Illustration"?
- **D10. Story panels (pages 1 and 6).** Three panels, outcome first, engagement type beneath. Is a LinkedIn logo allowed, or text only? (Tied to O7.)
- **D11. Deployment graphic (page 2).** One service repeated across a deployment, with the source of overhead marked where it occurs. Static SVG, or built from a real customer case?
- **D12. Cost worksheet (page 2).** Current cost, proposed deployment, validated cost, implementation cost and payback period, all customer inputs. A static example table, or a small calculator the visitor fills in on the page? A calculator keeps all data in the browser, like JThread.
- **D13. Reference path (page 3).** A static field at the top, the retaining collection under it, the affected objects below, with the retaining reference marked. Draw it as SVG from the Tips demo, or crop the JHeapo dominator map?
- **D14. Process diagram (page 4).** Five stages, each with its output: question, evidence, findings, recommendations, validation. A row of steps, a vertical timeline, or numbered sections with no diagram?
- **D15. Out-of-core diagram (page 5).** The manuscript's "disk-streaming" diagram. What should it show: the dump streamed past each registered query, indexes on disk and memory-mapped, the analysis machine's RAM smaller than the dump? No benchmark figures until measured.
- **D16. Story graphics (page 6).**
  - LinkedIn: a capacity-planning timeline with the original upgrade date and the one-year deferral.
  - Collaboration company: training, then the method applied across several services.
  - C24: two separate graphics, the framework benchmark and the customer's deployment (four servers chosen).

  Draw all three, or only the C24 pair, where numbers make the point?
- **D17. Tips worked example (page 6).** Recreate the report's reference-path diagram in the site style, paired with a short excerpt from the recommendation. Depends on O12 (may it be published).
- **D18. Data-handling diagram (page 7).** The brief has a local route and an external route. With "all tools keep the customer's data on the customer's machine", the external route exists only for the consulting package (a dump shared with Kirk, after JScrub). Show both routes, or only the local one on product pages and both on `/data-handling/`?
- **D19. Portrait and timeline (page 8).** An authentic working portrait and a short career timeline. Is there a photo (`assets/img/profile/`) you want to use? Which milestones go on the timeline?
- **D20. MCP session.** Not in the manuscript, but central to the aim. How is an agent session shown: a transcript styled as a terminal, a chat, or a screenshot of Claude?

## C. Page layout and components

Being answered one question at a time (2026-11-15).

**Decided (2026-11-16):** most visitors will use a desktop. Pages work on a phone, with no phone-specific design beyond that.
- D23, proposed: menus A. The phone menu reuses the desktop Products and Use cases lists, so no extra index pages are needed. B would need a Products page and a Use cases page on every page's menu.

**D21 and D23 are being compared on built pages (2026-11-16).** `/homepage/` links to six versions of a new home page: width options 1, 2 and 3 (D21) × phone menus A and B (D23). The current site is unchanged. Kirk picks one; the others are then removed.


- **D21. Page width and rhythm.** The site's content width is 1,120 px. JetBrains alternates full-width bands with narrow text. Keep one width, or alternate?
- **D22. Product sub-navigation (J2).** Fixed to the top of the window while scrolling, or scrolls away with the page?
- **D23. Menus.** Products ▾ and Use cases ▾ on a phone: expand inside the burger menu, or link to an index page?
- **D24. Feature rows (J4).** Screenshot on alternating sides, or always on the same side? How do wide dark screenshots appear on a phone: cropped to the important area, or scrollable sideways?
- **D25. Pricing cards.** Six or seven cards (four products, Enterprise, consulting, academic line). One row that wraps, or paid and free in separate groups? Paddle shows the price including the visitor's sales tax (`display_total: total`); keep that?
- **D26. Contact form (page 9 and developer handoff).**
  - The manuscript's fields: name, work email, organisation, enquiry type, what is happening, what a useful result looks like, optional technical details.
  - Required: name, work email, organisation, enquiry type, what is happening.
  - Buttons on other pages select the enquiry type (consulting package, Enterprise, training, academic licence, data handling) through the link.
  - Keep the visitor's input when sending fails, and show a clear error.
  - "Please do not attach heap dumps…" note under the form.

  Agree these, and then O13 (where the form sends).
- **D27. Help popovers.** The UI rule puts explanations, hedges and how-a-figure-is-counted text in help popovers. Does the site use the same convention (for example the stories' caveat, or "Results are specific to the workloads described")?

## D. Accessibility

**Decided (2026-11-15):** the site is to be accessible.
- Proposed defaults, unless Kirk says otherwise:
  - D28: text equivalents for every graphic.
  - D29: WCAG 2.2 AA contrast.
  - D30: full class names in a tooltip that opens on hover, focus and tap.


- **D28. Text equivalents.** The manuscript wants every finding and outcome in text, not only in a graphic. Every diagram gets a caption, plus a longer text description for screen readers?
- **D29. Contrast.** Which contrast level is the target (WCAG AA)? Red values in bold (UI rule) applies on the site too?
- **D30. Class names.** The UI rule shows the simple class name with the fully qualified name on hover. Hover doesn't exist on a phone or for keyboard users. Show the simple name with the full name in a tooltip that also opens on focus and tap?

## E. Building and running the site

- **D31. Mock-ups first (O14).** Mock up the home page and `/jheapo/` before building, or build in Jekyll and review in the browser? If mock-ups, in what form: static HTML pages in the repo, or a design tool?
- **D32. Images.** Decided (2026-11-16): images are optimized for the web. The four screenshots are in `assets/img/web/` as WebP at 1,400 and 2,800 px, with a 1,400 px PNG fallback. Open: a script in the repo for future screenshots.
- **D32 (original question).** GitHub Pages runs Jekyll without custom plugins, so images can't be resized during the build. Resize and compress screenshots before committing (a script in the repo), and serve WebP with PNG as a fallback?
- **D33. Analytics.** `_includes/analytics.html` loads Google Analytics when `google_analytics` is set. Keep it? It has to be named in the privacy notice, and some visitors' browsers block it.
- **D34. Release notes.** "What's new" (J2, J12) needs a page per product. Written by hand in Markdown, or generated from the releases repo's tags?
