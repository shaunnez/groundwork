# Groundwork local implementation

The functional application is React/Vite + TypeScript, a Node.js TypeScript API and worker, PostgreSQL, and private local object files. There is no Next.js or Python application.

## Local operation

The coordinator provisions the dedicated `groundwork_local` database through `npm run setup:local`. Private configuration lives outside Git at `/Users/shaun/projects/procint/.local-groundwork/config.json`. Set `GROUNDWORK_CONFIG` to that file for API, worker and integration tests. The setup command refuses to adopt an existing role/database if its matching private configuration is missing.

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

Live evaluation scripts are explicit actions, not automatic tests. `scripts/browser-live.ts --start` starts a subscription-backed assessment and must only be run within the authorised goal. Research scripts use the durable 50-credit goal allowance; no live-provider fallback is allowed. Fixed-output tests are not model-quality evidence.

Current milestone status, running processes, real versus fixture evidence and remaining work are maintained in `/Users/shaun/projects/procint/docs/build-progress.md`. The implementation worktree remains uncommitted for review.

## Review, collections and local delivery

The pursuit room can compile a daily watchlist entry, notice-linked competitor profile and weekly brief from a saved pursuit, without another model call. Watchlists & briefs compiles account-wide or selected-client collections across tracked opportunities. Each item retains its own cutoff and intelligence snapshot. Missing assessments, new sources, changed scope and pending/correction reviews block delivery. Delivery writes only the local inbox; there is no email or publication transport.

Refresh & delivery owns local schedules and weekly review samples. A tick compiles the latest saved assessment, and an optional explicit discovery query spends at most its reserved included credits. It does not ingest unverified search hits or start another model run. Missed intervals collapse to one tick; interrupted ticks remain failed for inspection. All evaluation schedules are paused for handoff. Both individual and collection deliveries enter weekly sampling.

For a historical assessment, choose an earlier cutoff. The UI starts an independent version without later-report knowledge. The narrower-pack form explicitly records excluded later documents; future-dated client context also remains outside that assessment. No excluded document is relabelled as read.

## Operator recovery

An uncertain external outcome retains its receipt and reservation. Do not delete its ledger row or restart the same call blindly. `scripts/reconcile-research.ts` accepts a private operator-checked provider reconciliation record matching the call; see `server/reconcile.ts` for the schema. A timeout is never evidence of zero credits. A completed Claude receipt can be recovered without a new call; invalid structured output is an explicit failed outcome requiring correction before a new assessment.

`scripts/purge-local-account.ts` requires an account UUID and the matching `--confirm-purge=UUID` flag, refuses active/uncertain work, and deletes only that account's local records/objects. It is a destructive maintenance command, not a routine restart step. No real evaluation account has been purged.
