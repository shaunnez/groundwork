# Groundwork design polish · 22 September 2026

## Outcome

The connected application follows the preserved prototype's typography, navy/blue palette, page hierarchy, reading layout and table density. The main usability defects found in this pass are corrected. This is a targeted visual and interaction review, not a formal accessibility certification or a new analytical evaluation.

Reference: `/prototype/#/home`. Connected local preview: http://127.0.0.1:5178/local. Private pilot: https://groundwork-production-fcaa.up.railway.app . The fictional reference remains unchanged.

## Page audit

| Screen | Review and correction |
| --- | --- |
| Home | Preserved hero, serif/sans hierarchy, dashboard cards and working journey links; shared focus and phone navigation corrections. |
| Watchlist | Restored two-column intelligence/action content; fixed inherited mobile grid rule that collapsed text; consistent filters and row actions. |
| Pursuit | Corrected disclosures, citations, section navigation, risk spacing and dark-panel focus contrast. Each claim ID appears once with working references from subsequent sections. |
| Saved report | Restored contents sidebar and reading column; compact phone section picker; version selector and evidence actions remain available. |
| Reports | Compact table on desktop, labelled cards on phones, meaningful filter-empty state and clear-filter recovery. All saved versions retained. |
| Market | Styled section navigation and explicit empty state; original supplier evidence and identity limitations retained. |
| Sources | Corrected table hierarchy, format labels and mobile cards; source fields readable by default, exact original text and download retained. |
| Upload | Prototype form proportions, consistent fields/buttons and selected intake modes; phone layout retains all three intake choices. |
| Request | Prototype two-column form; source scope, exclusions and disabled/busy controls retain backend behaviour. |
| Processing | Shared status, button and responsive typography reviewed using existing completed runs. |
| Requirements | Empty and populated states reviewed; identical requirement/quote text shown once, exact source clause still accessible. |
| Decisions | Balanced form/context layout; consistent labels, fields and focus states. |
| Weekly brief | Existing populated collection reviewed; shared disclosure and mobile styling. |
| Firm profiles | Existing context and creation form reviewed; accurate cancel label and expansion semantics. |
| Reviewer queue/detail | Compact semantic table and mobile cards; repetitive review reasons available in a disclosure; review form layout aligned with decisions. |
| Refresh & delivery | Fixed unstyled embedded operator fields/tables and responsive overflow; controls retain existing restrictions. |

## Shared components and evidence handling

- Consistent control heights, hover colours, underlines, keyboard focus, icon alignment and reduced-motion behaviour. Account menu closes with Escape and returns focus.
- Removed repeated breadcrumb page titles. Supplier identity caveat appears once per section.
- Repeated placements of the same finding link to its first appearance. Jumping expands containing disclosures and focuses the destination. Separate findings marked duplicate are retained.
- Companion reports link to their underlying pursuit instead of repeating the whole pursuit inline.
- JSON sources render original fields and values without model summarisation. Exact text is one action away. Partial JSON remains plain exact text; deeply nested fields have a bounded fallback.
- Citation lists show two references initially and retain the remainder in a disclosure. No report payload, quote, finding or source file was edited.

## Verification

- Compared all 16 connected routes with their prototype counterparts. Captured reference/current desktop views and phone views; examined important below-fold report and source states.
- All 16 routes passed document-overflow checks at 1440×1000 and 390×844. Seven key routes also passed at 320×900 and 768×900. Mobile cards retain table headers in the accessibility tree.
- Actual browser checks: Watchlist search/navigation; report filtering and empty-state recovery; report contents and finding references; phone section picker; structured/exact source toggle; citation dialog Escape and focus return; account Escape and focus return; opportunity dialog dismissal; individual review form; synthetic requirement citation opens section 18.
- No browser console warnings/errors returned at the final local check.
- **31 tests passed:** 23 domain, four source/finding presentation tests, four Sites routing/build checks. TypeScript, production build, changed-file formatting and diff whitespace checks passed.
- The existing main-bundle warning remains (~553 kB minified). Backend tests were not rerun for this presentation-only change. No inference or research calls were made.

Private captures and viewport results: `/Users/shaun/projects/procint/.local-groundwork/browser/design-polish/`. Early full-page captures were rejected because of compositor stitching; final viewport captures and direct browser checks are the usable evidence. The request-form captures were replaced after detecting a stale screenshot frame.

## Boundaries

The pass covers existing connected routes and their shared controls. It does not implement speculative screens from the prototype catalogue or the separate source editing/deletion, OCR, spreadsheet and Word-reader work. Report wording authored by earlier model runs remains unchanged; Bobby's original evidence remains unavailable. No commits, pushes or merges.

## Hosted verification

Deployment `56213f7e-9cef-42d5-b66c-68268381d948` succeeded. Deployed JS/CSS filenames match the local production build. Health is OK; unauthenticated bootstrap returns 401. The existing authenticated browser session loads all 25 report versions. Actual hosted browser checks passed report-table navigation, mobile section picker and risk register, structured/exact source switching and Escape dismissal, with no returned console warnings/errors. Temporary viewport overrides were reset and the pilot Home page left open.

No model/research calls, access-key changes or database changes were required. Before deployment there were no active/queued runs; Firecrawl remained 6 spent and 0 reserved out of 50. Seven reviewed UI files were copied into the existing allowlisted deployment source; backend, provider and deployment configuration were preserved.
