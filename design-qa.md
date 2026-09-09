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
