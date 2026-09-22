# Groundwork private Railway pilot

## Live status · 23 September 2026

The latest deployment is `a64f8b5e-b0d2-426b-a589-52f5831aedd1`, adding the source-linked Watchlist quick read on top of owner-triggered GETS public-notice intake. Three public GETS runs completed with 368 notices and zero failed details; GETS permission, RealMe documents and a GETS schedule remain separate. See `docs/gets-intake-implementation.md` and the root `docs/build-progress.md` for current status. The source-readers deployment below is an earlier release.

Source management, public research in the normal Sources screen, DOCX/XLSX readers, local scanned-PDF OCR and the original-PDF highlight viewer are live in deployment `89d0aac9-8fe4-45a4-b130-d1819dddb5eb`. This retains the earlier design polish. See `docs/source-management-readers.md` for behaviour, limits, verification and rollback constraints.

Production assets match the tested local build; health, unauthenticated rejection, existing sign-in, all 25 existing report payloads and eight original source hashes passed. Actual hosted Firecrawl research, original-page acquisition, source editing/archive and OCR/PDF highlighting passed, including cropped-page alignment. Hosted allowance remains 50 total, now 8 spent and 0 reserved (two included credits used for this slice). Local research remains disabled to avoid duplicate allowance. Reviewers can inspect evidence but cannot edit sources, generate reports or trigger research. No Claude inference calls or credential/configuration changes were made for this slice.

Deployed with Shaun's approval using the existing Hobby plan and a $20 workspace hard usage limit. Website: https://groundwork-production-fcaa.up.railway.app . Dedicated Groundwork project with private Postgres18, `/data` application volume, compiled React/Vite UI and Node.js/TypeScript API/worker. No custom domain or Git push needed.

Three opportunities, 21 report versions and 8 sources migrated with evidence/history/provenance intact. Live authenticated API checks compare every report payload and every original source download hash against the local originals. Owner/reviewer access, secure cookies, origin rejection and reviewer feedback tested over HTTPS. Actual reviewer navigation, source citation viewing and owner generation checked in the browser; Bobby still needs to assess the user journeys.

Website keys are in the private local `Pilot access.md` under `/Users/shaun/projects/procint/.local-groundwork/railway/`. They are deliberately absent from this repository. Fresh owner and reviewer identities; no local sessions or Claude credentials copied. Dedicated registered SSH key: `/Users/shaun/.ssh/groundwork_railway`.

**Hosted generation is enabled and tested.** Official Claude Code is signed in as shaunnesbittuk@gmail.com, using claude.ai / firstParty / Pro. Verified usage credits and auto-reload OFF before setting GROUNDWORK_SUBSCRIPTION_APPROVED=true. A real public pursuit reassessment succeeded with three fresh subscription calls and its saved report/citation were inspected in the browser. Three companion reports and two current collections compiled without additional model calls, bringing the saved report count to 25. No API-key fallback.

Login and saved records survived a real redeployment. A private pre-assessment backup restored successfully into disposable Postgres18 (21 reports, 8 sources, 3 opportunities); automated backups remain unconfigured and that backup predates the four new reports. Firecrawl is enabled as described in the latest follow-up above, with its earlier 6/50 usage retained. Original Bobby evidence is still absent. Read `docs/bobby-pilot-review.md` for the review checklist.

The sections below record preparation choices; any earlier “not deployed”/“pending authorization” wording is historical and superseded by this live status and the parent `docs/build-progress.md` checkpoint.

## Preparation decision (historical) · 22 September 2026

Shaun has asked to proceed using his details, without a domain. Railway is the selected path: its generated HTTPS address avoids buying/configuring a domain. The earlier Ubuntu/Caddy proposal below is superseded for this deployment, retained as background only.

No Railway resources have been provisioned. Railway dashboard sign-in and Shaun's monthly spending limit are pending. Do not buy a plan or provision billable resources until the ceiling is supplied. Do not change a workspace-wide spending limit without checking for unrelated projects in that workspace.

### Package prepared locally

- `Dockerfile` builds the React/Vite UI and installs the unmodified official Claude Code CLI 2.1.278. The Node.js/TypeScript API serves the compiled UI; a supervised worker runs alongside it. One replica only.
- `railway.toml` selects the Docker build and `/api/health` readiness check.
- `scripts/start-hosted.ts` initialises the schema transactionally under a database lock and starts API/worker. A failed child stops the sibling so Railway can restart the service.
- A private Postgres service stores records. A persistent application volume mounted at `/data` stores evidence under `/data/objects` and the CLI-managed home under `/data/claude-home`. The entrypoint gives the non-root worker access to those directories.
- HTTPS origin/host checks, Secure/HttpOnly/SameSite cookies and bounded sign-in attempts protect the pilot. Fresh owner and reviewer access keys are separate from Claude authentication. Reviewers can read evidence and record report feedback/decisions, but cannot trigger generation, research or administration. This is a small private pilot, not a production identity system.

### Railway configuration

Create a dedicated project and private Postgres service. Deploy this isolated worktree through the Railway CLI; no commit/push is necessary. Add the application volume before first deployment, one replica and no overlapping deployment instances. Generate Railway's HTTPS domain and configure:

| Variable | Value |
| --- | --- |
| `GROUNDWORK_HOSTED` | `true` (image default) |
| `DATABASE_URL` | Railway private Postgres reference, not its public TCP URL |
| `GROUNDWORK_ACCESS_KEY` | Fresh random owner key for Shaun |
| `GROUNDWORK_REVIEW_KEY` | Different random reviewer key for Bobby |
| `GROUNDWORK_PUBLIC_ORIGIN` | Exact generated HTTPS origin, or rely on `RAILWAY_PUBLIC_DOMAIN` |
| `GROUNDWORK_SUBSCRIPTION_APPROVED` | Leave unset/false until hosted sign-in and billing checks are complete |

Use Railway's injected `PORT`. Do not upload local `.env`, config, sessions, passwords, OAuth tokens or private evidence as build context. The Docker ignore file excludes local/private configuration. Transfer any approved public/synthetic reports separately, with matching evidence files, provenance and ledger history; do not fabricate a successful empty deployment as an evidence-populated review site. Data transfer tooling/remote import are not yet implemented.

### Shaun's official server login

After deployment, use Railway SSH to run the official CLI as the worker user:

```sh
gosu node env HOME=/data/claude-home /home/node/.local/bin/claude
```

Shaun completes the CLI's official browser login himself. Do not extract/copy OAuth tokens or build a Claude login screen in Groundwork. The application uses that worker home and a clean provider environment. Before every new inference call it checks official `claude auth status --json` for logged-in `claude.ai` / `firstParty`; API authentication is rejected. The explicit subscription approval flag additionally records the manual billing/extra-usage confirmation. Auth status by itself does not prove that overages are disabled.

Shaun previously confirmed his extra usage is disabled. Verify the server login belongs to that intended account before enabling owner-triggered generation. Bobby's reviewer key does not grant generation using Shaun's subscription. Bobby generating his own reports requires his own permitted authentication arrangement or a later API deployment.

Keep Firecrawl disabled: the earlier goal's 50-credit allowance has 6 credits already used and must not be reset or duplicated on the server. Establish a hosted ledger/allowance before enabling research. Never add an API-key fallback.

### Acceptance still required remotely

Verify HTTPS/login, owner/reviewer restrictions, source upload/download, saved report viewing and persistence after redeploy; verify hosted CLI sign-in before any inference. Configure protected backups and test restore. Application exports must exclude the CLI home; a whole-volume backup includes that home and must be protected accordingly. No remote acceptance, hosted model run, report migration or restore check has happened yet.

Official Railway references: https://docs.railway.com/networking/public-networking, https://docs.railway.com/pricing, https://docs.railway.com/pricing/cost-control, https://docs.railway.com/volumes/reference.

## Earlier alternative (superseded)

Prepared 22 September 2026. Setup design only: no server provisioned, connected to or deployed. Hostname/IP, SSH access and website hostname are still needed. Existing local implementation and evidence remain untouched.

## Intended setup

One Ubuntu LTS server, preferably 8 GB RAM for the combined services. Keep React/Vite + Node.js/TypeScript, Postgres and persistent source files. Serve the compiled frontend through Caddy with HTTPS and proxy the API to loopback. Run the API and worker as supervised systemd services. No new agent framework or container platform is needed for this private pilot.

Bobby uses the website in his browser. Viewing reports and recording feedback require no Claude call. Explicit report generation invokes the official Claude Code binary under his dedicated worker account, authenticated directly with Anthropic.

## Required inputs

- Server hostname/IP and SSH username, with authorized public-key access. Do not send passwords, SSH private keys or Claude tokens in chat.
- Website hostname/subdomain and DNS access, or an agreed private-access arrangement.
- Bobby's own Claude Code-capable subscription/Team seat and his participation in official sign-in. Confirm his extra usage/paid overages are disabled; Shaun's earlier confirmation does not cover Bobby.
- Initial evidence pack: existing public/synthetic records can be copied with provenance intact. Do not copy Shaun's Claude credentials, local sessions or unrelated configuration.

## Official Claude sign-in

Install the unmodified official CLI under the dedicated worker account. SSH into that account and launch `claude`. Bobby completes Anthropic's browser sign-in. Its documented SSH flow supports opening the login URL locally and, where prompted, entering the returned code directly in the terminal. The worker must use that same server account and persistent home directory. Do not log in as root and expect another service account to inherit authentication.

Groundwork invokes the CLI; it must not parse, copy, export or store OAuth/session tokens itself. Preserve the existing clean invocation environment and no API-key fallback, without modifying or disabling the binary's authentication options. Verify the intended subscription account and extra-usage settings before a bounded generation check. Expired login and exhausted allowance must stop generation with an actionable message; reauthentication may be needed later.

Anthropic's current guidance permits end users to authenticate to an unmodified hosted Claude Code binary with their own subscription, subject to its Commercial Terms and hosting conditions. It distinguishes this from offering third-party Claude.ai login or intermediating credentials. A private pilot is not a blanket exemption: verify the final implementation against those conditions and do not pool Bobby's subscription for future customers.

Official references checked on 22 September 2026:
- https://code.claude.com/docs/en/legal-and-compliance
- https://code.claude.com/docs/en/authentication
- https://code.claude.com/docs/en/setup

## Engineering before exposure

1. Make the hard-coded Mac Claude executable path configurable, preserving the local setup.
2. Prepare Linux database/bootstrap and private storage configuration. Copy database records and original files together; create fresh website sessions.
3. Configure an explicit HTTPS host/origin, secure cookies and bounded login attempts. Keep database/API interfaces private; never expose the Vite development server.
4. Restrict website access to Bobby's pilot. Website access and Claude CLI authentication stay separate.
5. Configure service supervision, health checks, persistent storage and backups with a restore check. Exclude the CLI credential home from application exports/backups.
6. Keep research disabled until a pilot-specific allowance and included-credit authorization are established. Do not reset or silently replenish the previous goal's 50-credit allowance.

## Verification and remaining boundary

Verify remote HTTPS, unauthenticated denial, evidence intake/download, review/feedback, and persistence across service restart. Verify CLI account/billing before a bounded generation check; then inspect the report and citations in the browser. Check expiry/limits/failure handling without an API fallback. Record actual outcomes separately from this plan.

Future customer inference through an API key and multi-user authentication/billing is separate work. This setup plan does not purchase infrastructure or authorize shared subscription use.
