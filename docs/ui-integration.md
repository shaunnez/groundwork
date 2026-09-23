# Original product UI connected to the local backend

Design polish follow-up: see [design-polish.md](./design-polish.md) for the page-by-page prototype comparison, mobile/keyboard corrections, evidence presentation changes and current verification. The implementation/verification narrative below records the initial integration and is historical.

22 September 2026. This follow-up corrects the initial delivery gap: the first backend implementation used a developer workbench instead of the designed product journeys. The main application now follows the original Groundwork layout, typography, navy/blue palette, section navigation, cards, rows and pursuit side panel. It renders saved records, never the prototype's fictional claims.

## Entry points

- `/` and `/local`: connected product application, with hash routes retaining opportunity/report IDs across reloads and browser navigation.
- `/prototype/`: preserved fictional design reference, explicitly labelled as such.
- `/diagnostics`: existing developer workbench.
- Reviewer tools in the footer: review queue, review/correction history, refresh schedules, collections and local inbox delivery. This is a local audience distinction, not production role-based authorization.

## Connected journeys

| Product screen | Saved backend behaviour |
| --- | --- |
| Home | Real opportunity/profile/report counts, latest pursuit and links into the journey. |
| Watchlist | Search, firm filter, assessed/unassessed filters, saved recommendation/next action, opportunity creation. |
| Pursuit Room | All analytical sections, verified evidence links, explicit gaps, current firm context separately labelled, saved report versions and actual comparisons. |
| Evidence | File, pasted text and permitted public URL intake; reader coverage/failures; scoped literal search; source-section viewer and original download. |
| Request / progress | Explicit cutoff and source exclusions, durable run admission, polling, cancellation and supported recovery. No analysis starts merely from browsing. |
| Requirements | Saved exhaustive-review counts, mandatory clauses, exact source-section links; no invented firm-compliance state. |
| Decisions | Separate firm choice/rationale, correction feedback and source-backed outcome records. |
| Reports / Market | Account-scoped report library, immutable historical versions, source-observed suppliers and notice-linked profiles. Companion views reuse the exact source pursuit; an existing companion is opened before compiling another. |
| Weekly brief | Saved multi-opportunity versions and explicit compilation from existing intelligence. Unassessed opportunities remain visible. No new model call or publication. |
| Firm profiles | Saved user-declared context and profile creation. Editing existing profiles/reassigning pursuits is not added. |

The only new API surfaces are account-scoped lightweight `GET /api/report-library` and `POST /api/sign-out`, which invalidates the current session without affecting other sessions. Existing API validation and account guards remain authoritative. Report/opportunity mismatch links are rejected in the UI rather than combining the wrong title and evidence. Failed loads provide a recovery path.

## Verification

76 backend tests passed, including unauthenticated/cross-account report-library access and current-session-only logout; 23 preserved domain tests and 4 hosting checks passed; TypeScript and production build passed. The production build still warns about a bundle over 500 kB; this is not a build failure or deployment qualification.

Actual in-app browser checks, using the connected UI:

- Compared the original reference and connected Home/Pursuit layouts; checked 1440px desktop and 390px mobile. Home and pursuit had no horizontal page overflow. Restored source/decision/version actions hidden by an inherited narrow-screen prototype rule.
- Created the explicitly labelled `SYNTHETIC-UI-20260922` opportunity; saved pasted text and a local synthetic file. Verified extraction coverage, search results, citation opening at section 2, and switching back to section 1.
- Opened the existing Harbour RFP result: 22/22 units, two mandatory obligations, with the late requirement opening section 18 of its original source. This is a synthetic evaluation, not Bobby's original evidence.
- Recorded an explicitly synthetic Watch decision and verified it remained after browser reload. Opened the preserved pre-RFP report and its stale-version notice.
- Tested report type/search filters, real public competitor profile, weekly brief preparation and visibility of the new unassessed opportunity. Inspected reassessment scope without starting another model call.
- Verified reviewer separation, disabled delivery for an unapproved report, mismatched report/opportunity link handling, sign-out across reload, and sign-in with the existing private local key.
- Inspected browser logs: no application warnings/errors returned at the final desktop check.

Private screenshots are under `/Users/shaun/projects/groundwork/.local-groundwork/browser/connected-*.png`; backend test output is `receipts/ui-integration-tests.txt`. Synthetic browser records remain labelled and retained. Previous public/synthetic evaluation history is unchanged.

## Remaining boundaries

This connects the core original product journeys; it does not implement every speculative screen in the prototype catalogue. Share/recipient access, production sign-in, automated market-wide feeds, registry-grade supplier identity, renewal forecasting and customer notifications remain separate launch work. No customer publication or deployment occurred. Existing model/content quality limits and the missing Bobby source pack remain unchanged. No new Claude or Firecrawl calls were needed for this UI work.
