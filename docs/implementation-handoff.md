# Groundwork local implementation handoff

22 September 2026. Local M0–M5 engineering implementation is complete and verified as described below. Customer launch/M6 is not complete or authorised. All changes remain uncommitted for review.

## Open and review

Preview: **http://127.0.0.1:5178/** (`/local` also works). The original designed product journeys are now connected to the backend and are the main application. An authenticated in-app browser is left open for review. The fictional design reference is `/prototype/`, the developer workbench is `/diagnostics`, and the published checkout is untouched. See `ui-integration.md` for this UI delivery and its verification.

Worktree: `/Users/shaun/projects/procint/worktrees/groundwork-local-slice`, branch `groundwork-local-slice`, baseline `e68af42811409831f1d4b43cb0c5d4dde00cc628`.

The stack is React/Vite/TypeScript, a Node.js TypeScript API and durable worker, PostgreSQL, and private local object storage. No Next.js, Python app, graph framework or managed cloud dependency was added. The local worker is deliberately an explicit staged pipeline; provider calls stay outside HTTP request handling.

Runtime configuration and access key are in `/Users/shaun/projects/procint/.local-groundwork/config.json`, outside Git. Do not paste that file into a review or commit it. The frontend is on5178, API4318, and the dedicated database/role is `groundwork_local`. Runtime instructions are in `local-development.md`; current process sessions and resumable state are in `/Users/shaun/projects/procint/docs/build-progress.md`.

## Delivered scope

| Milestone | Local behaviour |
| --- | --- |
| M0 | Source/evaluation inventory, explicit synthetic/public provenance and missing Bobby originals. |
| M1 | Saved opportunities and client context, account-scoped API/session, source originals and extracted units, coverage failures, working evidence viewer and restart persistence. |
| M2 | Bounded public search, official OCDS intake, normalized award populations, quoted supplier observations, conservative identity/incumbent resolution and versioned shared intelligence. |
| M3 | Full pursuit package: executive summary, centre of gravity, scenarios, competing hypotheses, risk register, cited evidence, one verdict, review/correction history and separate customer decisions/outcomes. |
| M4 | RFP/addendum reassessment over every admitted unit, late mandatory-clause detection, cited deadline change, immutable previous reports and before/after comparison without inferred closure. |
| M5 | Daily watchlist, competitor profile and weekly brief compiled from the same pursuit/intelligence; account/client collections; mobile review queue; local schedules, idempotent inbox delivery, staleness/review gates and weekly review sampling. |

Complete-only stage caching, owner-fenced leases, cancellation, provider receipt recovery, account boundaries, reserve-before-call accounting and immutable reports are enforced in code. A narrower source manifest records exclusions explicitly. Historical cutoffs cannot inherit later reports or later-dated source/client knowledge. The old static demo and its hosting compatibility remain intact.

## What was actually evaluated

**Real public evidence and live Claude:** UKRI CSP26317 Psychometric testing, FTS020323-2026. The initial HTML access returned403; the documented official OCDS API supplied the permitted snapshot. Search found a separate CSP26550 notice. Three admitted sources are clearly scoped; this is a one-award population, not a sector census. No client facts were invented.

Final run `32e15f60-4f0a-40d9-85b5-555f36b58d5d` succeeded in124.35 seconds from admission to saved report. Cutoff2026-09-22. Pursuit `3119afc7-6be2-4074-8299-3d7eac0c6952`, watchlist `a8c0e838-3518-48e0-9c5a-2f352aa4fad3`, competitor `f0cc5021-6807-4b43-8287-af0032402e0a`, weekly `982685e9-87d6-4ec0-ae78-dcc85e12a304` all reference intelligence `99680af7-3c9c-4400-8b4a-7fdbf6ed8357` and the same NO-GO. That verdict is notice-specific: this is a direct award, not an open call for competition. Current incumbency and legal identity remain unknown.

The final entity stage produced three matching source quotes that passed separate model support review. An earlier compressed-JSON quote failure remains recorded, with those observations excluded rather than accepted. A previous report also conflated a scheduled contract end with completed delivery; it remains immutable and marked changes-requested. Corrected versions explicitly distinguish those facts. These caught defects are evidence that analytical review remains necessary, not evidence of general model accuracy.

**Synthetic evidence and live Claude:** SYNTHETIC-M4-001. Baseline `a2feeb27-ab54-4dff-8f44-36605239f0c5`; reassessment `6c3d6330-6f96-4ed4-8e4c-f34a7bf0426d`. All22 units were judged, both expected mandatory obligations were found (including section18), and an applicable addendum changed the deadline from5 to12October2026. The previous report survived. Synthetic internal approval, delivery and schedule actions were engineering tests, not Bobby's acceptance.

Bobby's NZDF/Psytech example is **not validated**: its original evidence is absent.

## Verification and usage

- **76 backend tests passed** in an isolated temporary PostgreSQL database, with fresh model/research calls disabled. They cover persistence, tenancy, immutable evidence/reports, coverage, quote/support distinction, exhaustive reconciliation, budgets/concurrency, interrupted receipt recovery, leases, review gates, scoped historical runs, schedules and multi-opportunity collections, plus account-scoped report listing and current-session sign-out.
- **23 original tests and4 hosting compatibility tests passed.** Type checking, production build and diff whitespace checks passed.
- Actual browser checks passed for desktop/mobile source intake, progress/failure/recovery, full reports and citations, synthetic reassessment/comparison, all companion views, review/delivery/schedule/pause, and daily/weekly collections. The final public report and entity source link were inspected again in the in-app browser at390px and1440px with no horizontal overflow or browser errors. A nested report-spacing defect found visually was corrected and rechecked.
- No remote CI, deployment or customer publication was performed. No commits, pushes, merges or external messages were made. The original prototype checkout remains clean.

Claude used the official CLI2.1.278, native `claude.ai` Team/firstParty authentication, isolated environment and no API-key fallback. Shaun confirmed extra usage disabled. Returned model: `claude-sonnet-5`. App ledger:25 successful calls,2 pre-inference schema failures,1 earlier uncertain timeout retained without replay. Successful application calls report **US$2.3147856 API-equivalent usage**, plus **US$4.3177256** from six bounded coding/review delegations and **US$0.001132** smoke usage. These are list-price equivalents, **not cash charges**; actual billed cost is unknown. Codex coordination usage is separate. Successful application provider durations sum to1073.327 seconds; this is not total development time.

Firecrawl used **6 of the50 authorised included credits**, three five-result searches; no outstanding research reservation. Initial provider balance676/1000. No purchases/top-ups/overages or paid fallback. No GETS/RealMe login. All evaluation schedules are paused and no runs remain queued/running at handoff.

Private final audit: `/Users/shaun/projects/procint/.local-groundwork/receipts/final-verification.json` contains the manifest, input/source hashes, provider totals and report IDs. Screenshots are under `.local-groundwork/browser/`; provider receipts/stage outputs remain under private object storage. The uncertainty on the old timeout is intentionally unresolved; do not delete or blindly replay it.

## Remaining limitations and next gate

1. Bobby must review real original evidence and the corrected analytical outputs. Broader known-answer, variability, contradictory-total and entailment evaluation is outstanding. Exact quote matching is not proof of truth or legal identity.
2. Supplier identity uses conservative source/name relations, not a qualified registry matcher. Public-case capabilities and award-history coverage are sparse. Profiles expose those gaps; this is not a complete supplier dossier.
3. Numerical likelihood/confidence, retention eligibility, reviewer calendar/timeouts and customer-release rules remain explicit pending policies. Nothing auto-publishes or downgrades NO-GO on a timer.
4. OCR/scanned PDFs and spreadsheets are unsupported and visibly block dependent work. The local pack is bounded to20 documents,200PDF pages and160k extracted characters. Larger-pack extraction/retrieval is not qualified.
5. Scheduled refresh compiles current saved intelligence and optionally searches for leads. Automatic acquisition/reassessment, market-wide trend analysis and unattended customer distribution are not implemented. Leads require permitted admission and an explicit assessment.
6. Production authentication, hosting/managed worker, storage/retention controls, provider commercial suitability and workload/unit-economics qualification are M6/deployment work. The subscription transport is a local evaluation choice, not approval for hosted customer inference.
7. Operator research reconciliation and account purge are implemented and fixture-tested. No genuine uncertain Firecrawl outcome was reconciled, and no real evaluation account was purged. Arbitrary crash-point/power-loss recovery is not claimed.

Next action: review the local diff and the public/synthetic journeys, then supply the original Bobby evaluation pack and settle the dependent M6 policies. No signup or deployment is needed to review this implementation.
