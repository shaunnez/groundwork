# Groundwork feedback revision QA

15 September 2026 · final result: passed

## Scope and visual evidence

Source visual: `/Users/shaun/Downloads/Pasted Graphic.png` (1440×810), plus the existing Groundwork interface captured before editing in this session. The supplied PlanCheck portfolio PDF is a separate product and has not supplied procurement requirements. The requested differences are intentional: navy/blue accents, alternating white/pale-blue rows and short intelligence/action bullets, while retaining Groundwork’s typography and working layout.

Implementation: `http://127.0.0.1:5198/`. Browser screenshots are embedded in the task’s Computer Use results, not exported as local image files. Evidence captures: “Verify the new client home dashboard”, “Inspect assessment bullets and alternating watchlist rows”, “Compare the supplied intelligence reference with the revised watchlist”, and “Inspect final report layout and leave the client home open”. The reference and revised watchlist were opened together in one tool result. They show different opportunities and viewport widths; this is a content-structure and requested palette comparison, not a pixel-identical recreation or side-by-side composite.

Desktop checks used 1280×720 and 1280×900 CSS viewports; captured content excludes the scrollbar (1265px wide). Mobile checks used 390×844 and 320×740; browser screenshots were rendered at native capture scale. No source resampling was used. Focused watchlist and report captures make body copy, row boundaries and evaluation weights legible.

## Findings and review

No outstanding P0/P1/P2 issues in the changed screens after a fresh load.

- Fonts/typography: Source Serif 4 headings and Inter body/UI retained. Dashboard, guide, watchlist and report copy wrap at the checked mobile sizes.
- Spacing/layout: dashboard introduces a product explainer, workspace counts and a next-step panel; watchlist retains notice metadata with assessment/actions in two columns on desktop and one on mobile. Report outline links reach the added sections. Mobile navigation wraps onto its own row.
- Colours/tokens: navy navigation and blue heading/action accents add separation. White/pale-blue rows alternate in the watchlist and detailed assessment. Green/amber/red retain semantic meaning.
- Images/icons: existing Phosphor icons and fonts retained; no raster assets generated or changed. The supplied screenshot is a reference only.
- Copy/content: client Home and reviewer guide have explicit audiences. BidEdge operations are reached through prototype controls and the guide, outside the client menu. Assessment content distinguishes provisional public-data findings, pending/limited research and RFP evidence. No inferred evaluation weights, bid probabilities or contract values were introduced.

During live source editing, Vite hot reload captured a transient “Missing demo context” error. Its long diagnostic text caused apparent guide overflow. A fresh page load cleared the captured diagnostic; guide overflow did not reproduce. Final guide runtime-error count is zero. This is not a claim that the entire development console history was empty.

## Behaviour and checks

- Default entry and sign-in/setup completion route to client Home.
- Saved opportunity count changes on save; selecting the Home count opens the saved-only watchlist. Restored the test bookmark to its initial unsaved state.
- Watchlist opens the pursuit. Public report shows criteria unavailable; the RFP preview shows 40/30/20/10 weights. Expanded report navigation works.
- Guide opens client, operator and recipient views. Operator main navigation contains Work queue, Source health and Delivery. Shared report has no client main navigation.
- After fresh reload: seven primary screens fit 320px (Home, guide, watchlist, pursuit, report, operations, shared report). Nine were checked at 390px, additionally including access and onboarding; the initial guide diagnostic overflow was resolved by the fresh-load check above.
- 21 domain tests pass, including publication-dependent watchlist content, public/RFP detail separation and uncertainty for pending/planned/unassessed notices.
- TypeScript, production build and four Sites packaging/worker tests pass. Changed TypeScript/CSS files formatted with repository Prettier. `git diff --check` passes.

## Limits and separate follow-up

This revision does not establish exact feature parity with an unseen full legacy pursuit report. Content uses the existing fictional evidence. No production authentication, analytical engine, live integration or permission enforcement is implemented. No live deployment or remote CI run was performed. The earlier exhaustive 185-state run below is historical, not rerun for this revision.

## Historical QA (9 September)

# Groundwork prototype revision QA

9 September 2026 · final result: passed

## Findings and fixes

- **P2, mobile navigation:** the longer Groundwork wordmark pushed the customer header 8px beyond a 390px viewport. Reduced the wordmark, gaps and mobile padding. After correction, all 34 default screens have no document overflow at 390×844; six revised primary screens also fit 320×740.
- **P2, sample consistency:** new competitor-history examples initially differed from the older award table. Reconciled the held fictional records, excluding unallocated multi-supplier totals from the competitor stat grid. The no-history candidate remains in the field without an unsupported capability exclusion.
- **P2, historical report reasoning:** the public-data candidate drill-down initially included the later RFP interpretation. Scoped its copy to the selected report stage. The original report retains its provisional reasoning.

- **P2, listing input:** the new opportunity selector initially used compact native styling. Matched the existing field treatment and a 44px minimum control height.

No outstanding P0/P1/P2 findings within the reviewed prototype scope.

## Visual comparison

Opened the selected image and rendered implementation together in `#/compare`, captured in `qa/groundwork-v3-comparison.jpg`. Both are normalized to a 1440px wide product canvas; the implementation iframe is 1440×1024 CSS pixels. The supplied image is 1487×1058 pixels, scaled proportionally. Content and product name intentionally differ: this is the user-requested competitive-intelligence revision, not a fresh attempt to copy the certification-first content.

Inspected focused desktop pursuit and RFP comparison views, plus the mobile watchlist and reassessment. Evidence: `qa/groundwork-v3-pursuit.jpg`, `qa/groundwork-v3-rfp-comparison.jpg`, `qa/groundwork-v3-mobile-watchlist.jpg`, `qa/groundwork-v3-mobile-reassessment.jpg`, `qa/groundwork-v3-competitor.jpg`. Screenshots use browser capture; full-page images include content below the viewport.

- **Fonts:** Source Serif 4 headlines and Inter UI/body retained. Revised headings, long analytical labels and mobile text wrap legibly.
- **Spacing/layout:** selected page margins, restrained dividers and two-column working surface retained. Competitive assessment replaces the requirement card; a narrower next-step/source rail replaces the large document viewer. Mobile content stacks without overflow.
- **Colours:** original green/ivory/amber tokens retained. The PDF's navy/teal palette is an open branding decision, documented in the guide.
- **Images/icons:** existing Phosphor icons and comparison source retained; this text/data workflow requires no new raster assets. No source images were altered.
- **Copy/content:** distinguishes public facts, interpretation, client context, missing vs inaccessible evidence and illustrative policies. No retention percentage, win probability or composite opportunity score is invented.

## Behaviour verified

- All 185 catalogue entries render nonempty, with their selected screen/state, without desktop document overflow: `qa/groundwork-v3-states.json`.
- All 34 default screens fit 390×844: `qa/groundwork-v3-mobile.json`.
- Browser journey: watchlist → pursuit → sample upload/extraction → RFP request → reading/assessment → analyst hold → attributed correction → report publication. Version 2 contains changed, retracted, added and confirmed findings; version 1 remains selectable with the earlier recommendation.
- Competitor method navigation works. Listing context is required, and request submission also requires the sample firm identity acknowledgement.
- A fresh browser guide reported zero captured runtime errors.
- Domain checks cover incomplete extraction, duplicate submission, retained versions, cancelled work, stale inputs, attributed review holds, further-research holds, scoped competitor publication and optional user-decision restrictions.
- TypeScript passed; 18 domain tests passed; production build passed; four Sites packaging/worker tests passed.

## Limits

These checks validate fictional frontend behaviour, not analytical accuracy, production tenancy, job durability, company verification or source authenticity. Browser-local records are demonstration state. Recommendation wording, reviewer ownership, review response time and first-release scope need Bobby's confirmation. No accessibility certification is claimed.

## 21 September 2026 · Pursuit package depth

- Added the five requested analytical sections to the shared pursuit/report body using the existing navy/blue design. The source screenshots guided structure only.
- Verified public-data and RFP report previews, the return to public-data content, and the recipient view. RFP-only weights and the bundled-scope retraction do not appear in the public-data snapshot. Shared views retain the existing private-action restrictions.
- Inspected executive summary, scenario cards and risk register in the browser. Checked desktop width (1309 CSS pixels), mobile width (354 CSS pixels), and a 320 CSS-pixel report/recipient view with no document horizontal overflow.
- Checked all ten package navigation destinations and unchanged hash routing. Rechecked centre-of-gravity navigation separately after a fast navigation sequence intersected smooth scrolling; the destination received focus correctly. Navigation respects the reduced-motion preference in code; that OS preference was not changed during QA.
- No captured browser errors or warnings during the checks. TypeScript, 23 domain tests, production build, four Sites packaging tests and final whitespace checks passed.
- Local prototype only; no hosted deployment, live analytical run, or authenticated sharing verification performed.
