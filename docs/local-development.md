# Groundwork local implementation

The functional application is React/Vite + TypeScript, a Node.js TypeScript API and worker, PostgreSQL, and private local object files. There is no Next.js or Python application.

## Local operation

The coordinator provisions the dedicated `groundwork_local` database through `npm run setup:local`. Private configuration and original local evidence live in the Git-ignored `.local-groundwork/` directory inside this checkout. On Shaun's Mac, set `GROUNDWORK_CONFIG=/Users/shaun/projects/groundwork/.local-groundwork/config.json` for the API, worker and integration tests. The setup command defaults to this checkout's `.local-groundwork/` directory and refuses to adopt an existing role/database if its matching private configuration is missing. The previous `/Users/shaun/projects/procint/.local-groundwork` path is a temporary compatibility link while older local services remain running; new work should use the checkout path.

- Connected product UI: `npm run dev` → `http://127.0.0.1:5178/` (`/local` opens the same application)
- API: `npm run dev:api` → loopback port 4318
- Durable worker: `npm run dev:worker`
- Original fictional prototype: `http://127.0.0.1:5178/prototype/`
- Developer workbench: `http://127.0.0.1:5178/diagnostics`

Home, Watchlist, Pursuit Room, Market, Reports, source intake/viewing, requirements, decisions and weekly briefs now use the original product layouts with saved backend records. Reviewer tools are reached from the footer. See `ui-integration.md` for the route/API mapping and browser verification. The fictional prototype is a separate reference and does not supply analytical content to the connected UI.

The local access key is in the private configuration. It is never built into the frontend. Sessions are HttpOnly, same-site and account-scoped; mutations require a custom request header. This is a loopback evaluation identity mechanism, not production authentication. Do not expose either development server to the network.

## Evidence and analysis

Add an opportunity, optionally select a client, and admit public or synthetic sources with permission to use them. Unknown client answers remain unknown. Text/HTML/PDF readers record every source, reader and coverage failure. Unsupported spreadsheets and scanned/blank PDF pages remain visible and block dependent exhaustive review. Search describes its literal query and actual visited units.

Assessment inputs are frozen at admission. PostgreSQL `date` values remain ISO calendar strings to avoid timezone shifts. Completed stages are cached by account, stage, inputs and method; prompt/schema/transport hashes are included for model stages. The worker claims durable dispatch rows with leases. Cancellation and lease loss prevent publication; partial provider receipts are retained.

Model invocation uses the official Claude CLI with native subscription authentication, an explicit child-environment allowlist, safe mode, no tools/MCP/plugins/hooks and no API fallback. The operator must confirm extra usage disabled. Provider receipts and usage estimates are retained; estimated API-equivalent dollars are not actual charges. A terminal response can be recovered after interruption without calling the model again. An unknown external outcome is not blindly retried.

Report creation is assessment → validation → separate support review → composition. A bounded new assessment revision may correct rejected claims and must be verified again. The verifier itself cannot author or reword claims. Quotes are mechanically checked at their cited unit; support is a separate model judgment. Summaries select existing claims. One verdict governs the report. NO-GO needs primary tender evidence, plus separately identified client evidence for capability disqualification.

Every saved report is immutable. Feedback and customer decisions are separate records. A newer source pack does not overwrite old reports. Probability/confidence mappings, review timeouts and automatic publication remain unapproved; all outputs are internal drafts.

## Verification

- `npm run typecheck`
- `npm test`
- `npm run test:backend` (requires private configuration plus local Postgres administrator socket access; creates and removes its own temporary test database and object directory, with fresh provider calls disabled)
- `npm run build && npm run test:sites`
- `node --import tsx scripts/browser-check.ts` with the local services running

Selected GETS packs are declared against a saved GETS notice revision and imported one original at a time from an owner-authorised transfer. For a locally saved subscribed notice, `scripts/admit-gets-pack.ts` imports the notice, declares the manifest, admits each checked original and resumes from a private receipt. Keep the notice HTML, manifest, originals, archive, receipt and reader report inside `.local-groundwork/`. `scripts/check-gets-pack.ts` verifies all declared sizes and SHA-256 hashes and runs the real PDF/DOCX/XLSX readers before admission. File admission and complete reader coverage are separate states; unresolved embedded or tracked-change content keeps the pack incomplete. The mapping and sector review pages are in Reviewer tools.

`scripts/acquire-gets-pack.ts --rfx=34995788 --output=.local-groundwork/selected-pack` opens a dedicated Chromium profile at the selected GETS detail page. Complete RealMe sign-in and notice subscription in that browser if prompted, then press Enter in the running command. The script reads the subscribed file table, streams the selected project's bulk ZIP under a 128 MiB and three-minute bound, verifies all declared sizes and SHA-256 checksums, and retains immutable individual originals under `originals/`. The script saves GETS-only session cookies at mode 0600 under the ignored local output directory so a later headless run can reuse the sign-in; it never copies credentials or cookies to Railway. Temporary ZIP work remains separate from retained originals. A rerun verifies and skips already retained originals. `--notice=<saved.html> --archive=<existing.zip>` exercises the exact parser/extraction path without opening a browser. Admission into Groundwork remains the separate `admit-gets-pack.ts` step.

For unattended local sign-in, set `GROUNDWORK_REALME_USERNAME` and `GROUNDWORK_REALME_PASSWORD` in the local shell, or place those two assignments in the Git-ignored `.local-groundwork/realme.env` with file mode 0600. The collector clicks GETS supplier login, fills the RealMe form on `login.realme.govt.nz`, and waits for the return to GETS. A challenge or first-time notice subscription can still require interaction in the visible browser. Credentials are never sent to Railway or written to the collector's cookie file. An expired session with no credentials stops before download.

On 23 September, a fresh visible local credential run downloaded and verified all 13 current RFx 34995788 originals (70,860,482 bytes); a subsequent headless run reused the GETS-only session and verified the originals without a new transfer. The withdrawn file was absent from the admitted manifest. This proves the selected local acquisition route; it does not establish hosted RealMe collection.

`GROUNDWORK_CONFIG=/Users/shaun/projects/groundwork/.local-groundwork/config.json node --import tsx scripts/run-local-gets-report.ts --rfx=34995788 --output=.local-groundwork/browser-acquisition-live-poc` runs the selected local acquisition, resumable admission, and a first **limited** report in sequence. It opens its own loopback API on a free port and starts a worker restricted to this report run; existing local services need not be restarted. If a prior report exists on the imported opportunity, the new report links to it as a later version. The first scope includes the saved GETS notice, RFT, BoP and technical specification (about 107,000 extracted characters). Every other admitted source is named as an exclusion in the frozen run manifest and report. This is a source-backed limited RFP assessment path, not certification of all 13 attachments. `--skip-acquire=true` uses already saved, checked local originals when testing report generation independently of sign-in. The 160,000-character limit remains in `server/run-readiness.ts`; raising it without chunked analysis would multiply oversized model calls.

If a report stops after a completed provider receipt and the error is correctable, `GROUNDWORK_CONFIG=... node --import tsx scripts/resume-local-gets-report.ts --run-id=<failed-run-uuid>` runs the existing resume checks, reserves that run for the local worker and retains completed stages and receipts. A failed or uncertain provider call still blocks safe resume until its exact outcome is reconciled. Do not start a fresh report merely to bypass that state.

`scripts/archive-synthetic-opportunities.ts --account=<uuid> --expect=<count> --output=.local-groundwork/synthetic-archive-receipt.json` removes labelled synthetic opportunities from active journeys and future sector runs. It disables their schedules and retains earlier reports and original evidence for historical links. This is a selected account maintenance action, not a normal startup operation.

`scripts/reconcile-sectors.ts --mode=inventory --account=<uuid> --taxonomy=config/groundwork-sectors.json --output=.local-groundwork/sector-inventory.json` inventories and previews every saved title, overview and raw GETS category. It also accepts `--snapshot=<bootstrap.json> --gets=<status.json>` for an offline snapshot. The checked-in taxonomy is a repeatable baseline; the classifier records the matched field and phrase, and leaves ambiguous notices Unknown. `--mode=apply --account=<uuid> --taxonomy=config/groundwork-sectors.json --expect=<count> --output=<private-summary.json>` seeds missing sectors and runs bounded, resumable 25-item backfill batches. Reruns update changed notice revisions and classifier versions but preserve person corrections, edited sector keywords and archived sectors. On the 23 September snapshot the active preview contains 369 opportunities, including 368 saved GETS notices; two labelled synthetic evaluations are excluded. The preview does not itself change the hosted database. A manual **Check GETS now** run saves notice briefs only for new or changed readable notices. `getsBriefsPerAttempt` in local private configuration, or `GROUNDWORK_GETS_BRIEFS_PER_ATTEMPT` on the host, sets the 1–500 brief attempt limit (default 25); a partial run can be continued. The limit counts model-generated notice briefs, not fetched GETS notices or full pursuit reports. No background schedule or full-pursuit fan-out is enabled.

Live evaluation scripts are explicit actions, not automatic tests. `scripts/browser-live.ts --start` starts a subscription-backed assessment and must only be run within the authorised goal. Research scripts use the durable 50-credit goal allowance; no live-provider fallback is allowed. Fixed-output tests are not model-quality evidence.

Current milestone status, running processes, real versus fixture evidence and remaining work are maintained in `/Users/shaun/projects/procint/docs/build-progress.md`. The implementation worktree remains uncommitted for review.

## Review, collections and local delivery

The pursuit room can compile a daily watchlist entry, notice-linked competitor profile and weekly brief from a saved pursuit, without another model call. Watchlists & briefs compiles account-wide or selected-client collections across tracked opportunities. Each item retains its own cutoff and intelligence snapshot. Missing assessments, new sources, changed scope and pending/correction reviews block delivery. Delivery writes only the local inbox; there is no email or publication transport.

Refresh & delivery owns local schedules and weekly review samples. A tick compiles the latest saved assessment, and an optional explicit discovery query spends at most its reserved included credits. It does not ingest unverified search hits or start another model run. Missed intervals collapse to one tick; interrupted ticks remain failed for inspection. All evaluation schedules are paused for handoff. Both individual and collection deliveries enter weekly sampling.

For a historical assessment, choose an earlier cutoff. The UI starts an independent version without later-report knowledge. The narrower-pack form explicitly records excluded later documents; future-dated client context also remains outside that assessment. No excluded document is relabelled as read.

## Operator recovery

An uncertain external outcome retains its receipt and reservation. Do not delete its ledger row or restart the same call blindly. `scripts/reconcile-research.ts` accepts a private operator-checked provider reconciliation record matching the call; see `server/reconcile.ts` for the schema. A timeout is never evidence of zero credits. A completed Claude receipt can be recovered without a new call; invalid structured output is an explicit failed outcome requiring correction before a new assessment.

`scripts/purge-local-account.ts` requires an account UUID and the matching `--confirm-purge=UUID` flag, refuses active/uncertain work, and deletes only that account's local records/objects. It is a destructive maintenance command, not a routine restart step. No real evaluation account has been purged.
