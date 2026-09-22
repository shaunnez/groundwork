# Groundwork: manual GETS enrichment and pursuit usability plan

23 September 2026. Planning document; none of the changes below is implemented by this document.

## Outcome and fixed decisions

An owner presses **Check GETS now**. Groundwork imports the public notices, shows what it read and could not read, maps fields with inspectable provenance, assigns a Groundwork sector, and produces a bounded notice-level brief for each new or changed readable notice. The Watchlist shows the result and its evidence limits. A full pursuit package remains an explicit choice for a selected opportunity after the relevant source pack and firm context are available. Existing reports remain whole and immutable.

There is **no cron job or unattended daily trigger in this delivery**. A later scheduler may invoke the same manual pipeline, but is not part of the acceptance criteria. GETS access remains subject to the existing owner-authorised pilot setting or a recorded GETS/MBIE arrangement; this plan does not turn RealMe authentication into a server-side collector. The current Claude CLI subscription route is retained for the pilot, with no API-key fallback, and model work must stop cleanly at its configured usage or run limits.

The first real-data acceptance case is [Remedial Bridge Works, RFx 34995788](https://www.gets.govt.nz/DCC/ExternalTenderDetails.htm?id=34995788), linked to the [existing Groundwork pursuit](https://groundwork-production-fcaa.up.railway.app/#/pursuit?opportunity=868ed901-7280-48b4-a349-92c2de5a4f98). It is a live RFT with an existing one-source report, so its current limitations are visible before document admission. Its closing time is 20 October 2026, 4 pm New Zealand daylight time. On 23 September Shaun signed in with RealMe and subscribed to this notice in his own browser. The supplier view then showed 13 attachments: nine PDFs, three DOCX files and one XLSX pricing schedule, totalling 70,858,766 bytes. The bridge-drawings PDF alone is 58,516,246 bytes. No addenda or published Q&A were shown. File contents and downloadability have not yet been tested, and the existing report has not read these attachments.

## Current baseline

- GETS intake currently reads public listing and detail HTML, stores the original, creates immutable parsed notice revisions, and maps selected fields into an opportunity. It does not read protected attachments or automatically generate reports. The Watchlist quick read is currently derived from the saved public overview and existing reports. Existing source upload accepts at most 20 MB per file, 20 active documents and 200 PDF pages per pack; the discovered drawings PDF cannot enter through that route unchanged.
- The Watchlist showed 371 tracked opportunities when Shaun raised this request. Treat that as a review snapshot, not a hardcoded batch size; query and reconcile the live inventory before backfill.
- The linked pursuit has one admitted source, the public GETS HTML notice. Its citations open extracted HTML sections; the quote is not visibly marked. PDF highlighting is implemented only when source geometry allows a mechanically located match.
- There are no admitted award records or supplier observations for this pursuit, so incumbency and named suppliers are unknown. RealMe attachments may improve scope and evaluation detail but do not themselves prove current incumbency. An award or contract source is needed for that claim.
- GETS-imported opportunities currently have no linked firm profile. Creating a profile alone does not change an existing opportunity or immutable report; the selected profile must be linked and a new report generated from a frozen snapshot.
- The renderer emits a finding in the executive summary and renders later uses of the same finding as a bare “See finding” link. This preserves finding identity but leaves several sections hard to understand.
- The database retains raw notice revisions and normalized opportunity metadata, but does not retain a field-level mapping trace showing the exact source label, parser rule, transformation and review status. GETS categories are carried through as source data; no editable Groundwork sector taxonomy exists.

## 1. Make the pursuit readable and inspectable

Add a prominent **Open original GETS notice** link beside the opportunity identity and in the assessment basis when `noticeUrl` is present. Keep the title, RFx ID, closing date and notice-only/fully enriched status together, with the assessment cutoff visible.

For each citation, show the quoted words, source name, section/page, and verification state before opening the source. In HTML/text/Office views, deterministically mark the exact extracted substring and bring it into view. For PDFs, retain the current geometry-based rectangle only when the location is mechanically established. If the quote cannot be uniquely located, say so and show the cited section without a guessed highlight. The saved source and original bytes remain read-only.

Give each report section useful content in place. Put the complete canonical finding in the section where it is most useful; the executive summary can carry concise navigation and the summary sentence rather than a second full copy. A repeated reference should show a short, meaningful excerpt and destination, never only “See finding in Executive summary.” Keep distinct duplicate findings; do not silently collapse or delete them.

Add a short explanatory card immediately below each of these headings: **Cone of plausibility**, **Analysis of competing hypotheses**, **Risk register**, **Intelligence gaps and next steps**, and **Centre of gravity analysis**. Explain what the section tests and how a reader should use it, without claiming that thin evidence makes a complete analysis. On notice-only reports, show explicit evidence limits; generic win/lose/cancel scenarios must not be presented as substantive competitor intelligence.

**Acceptance:** On RFx 34995788, a reader can open GETS directly, see the exact cited wording or a clear unlocatable state, understand every section without following a bare finding link, and distinguish missing evidence from a negative finding. Check desktop, keyboard and mobile presentation.

## 2. Add the missing inputs to a selected pursuit

Allow an owner to link an existing firm profile to an imported GETS opportunity, with a visible effective date and source. Freeze the selected profile in each new run. Do not rewrite an older report when a profile changes. A report with no profile should say which firm information is needed: services/capabilities, relevant credentials, current relationships, delivery capacity, and case examples. A model must not infer eligibility from an absent profile.

Separate **notice-only brief**, **enriched public pursuit**, and **RFP reassessment** in the UI. Show the actual admitted source inventory and coverage for each report. Supplier and incumbent fields remain unknown until source-backed observations or suitable award records are admitted. Protected tender attachments can add requirements and evaluation detail; award data and firm-provided context are separate inputs.

**Acceptance:** A newly linked profile appears only in a newly generated version; the earlier one-source report remains intact. Incumbency and competitors stay unknown until evidence supports them. The new version names its source pack and limitations.

### Admit a selected GETS document pack

For a selected opportunity, provide a bounded **Import tender documents** step after the public notice has been saved. The immediate pilot route is an owner-supplied GETS download/upload or other approved transfer from a supplier account already subscribed to that notice. It must not reuse Shaun's local RealMe cookies or credentials on Railway. A future direct connector is conditional on a supported GETS/MBIE access arrangement, separate account ownership, session/revocation design and an audit of allowed download and reuse scope. Do not auto-subscribe or download documents for every Watchlist entry.

First record the authenticated attachment inventory for RFx 34995788: GETS file identifier, displayed name, size, displayed checksum, attachment versus addendum, retrieval time and source notice revision. Reconcile the expected inventory with received originals. Check each received file's type, length and digest; a missing, changed or unreadable file remains named in the run. Preserve every admitted original immutably for future citation and report reproduction. PostgreSQL stores metadata, source versions, coverage and object references; the private persistent `/data/objects` Railway volume stores original bytes and extraction artefacts for the pilot. Use disposable, bounded scratch space only for download/extraction intermediates, and remove those after the immutable original and extraction result are safely recorded. A cache alone is insufficient because old report citations must continue to open the same bytes. Protect and restore-test the volume together with PostgreSQL; consider external object storage only when scale or backup needs justify the migration.

The existing 20 MB upload/body limit must be extended through a bounded streamed path for the 58,516,246-byte drawings PDF, without raising all uploads blindly or buffering the whole pack in memory. Keep per-file and per-run byte, page, runtime and disk limits explicit. The 20-document limit covers this 13-file pack, but the 200-PDF-page limit and drawing readability require inspection. PDFs, DOCX and XLSX use their existing deterministic readers where qualified; drawings or scanned pages may need OCR or human review. Do not claim the drawing's technical content has been understood merely because its PDF text was extracted. Record each file's reader and exact read/unread coverage, and fail a dependent exhaustive RFP reassessment until the declared pack reconciles or a narrow, recorded override is made. Never omit the pricing spreadsheet.

**Acceptance:** The selected RFx shows all 13 expected attachments with their individual ingestion, checksum and reader states. Originals survive a restart and open from citations; temporary work files are dispensable. The large drawing is either processed within bounded limits or reported as a named gap with its required reader. An RFP reassessment freezes the complete admitted manifest, preserves the earlier one-source report, and makes no unsupported claim of complete coverage.

## 3. Create Groundwork sectors and classify the tracked opportunities

First inventory the currently tracked opportunities and their raw GETS categories, titles and overviews. Propose a small, mutually understandable sector list for Bobby to approve; do not simply mirror GETS's often inaccurate category field. Store the raw category unchanged alongside a separate Groundwork primary sector. An optional secondary tag can wait until real review shows it is needed. **Unknown** is a valid result when the notice does not justify a sector.

Add an owner-facing Settings area to create, rename and archive sectors, and to correct an opportunity's assignment. A manual correction takes precedence over future automatic classification. Record the taxonomy version, classifier version, input notice revision, result, reason/evidence pointer, and whether it came from a rule, model, or person. Reclassify automatically only on a new/changed notice or taxonomy change, without overwriting manual decisions. Backfill the current tracked set in bounded, resumable batches, with counts of attempted, classified, unknown, failed and manually overridden items that reconcile to the inventory.

Use high-precision deterministic rules for obvious cases and a small model only for ambiguous ones. Choose a provider/model after testing a stratified Bobby-reviewed sample, rather than assuming JEV or Luna is accurate or available in this runtime. Measure error patterns by sector and notice type, including the cases where GETS's own category is wrong. The Watchlist gets a sector filter and an **Unknown** option; free-text search remains available.

**Acceptance:** Every tracked opportunity has exactly one Groundwork primary sector or Unknown, each with recorded provenance; sector filters work on desktop and mobile; a manual correction persists after the next GETS check.

## 4. Expose GETS-to-Groundwork mapping and improve its quality

Keep immutable raw HTML, the existing parsed notice revision, and the opportunity projection separate. Add a field-level mapping record for RFx ID, title, buyer, notice type, status, open/close dates, category, region and overview. For each field, record the GETS label or location, raw text, parsed value, normalization rule and version, warnings, and human override if any. Preserve conflicting or missing values rather than overwriting them silently. Corrections should create a new mapping/projection version while leaving source snapshots and report citations intact.

Provide an owner-facing mapping review screen with a paginated inventory and filters for **missing**, **changed**, **conflicting**, **unusual**, **Unknown sector** and **reviewed**. A row opens its source notice and field-level before/after mapping. The review queue should prioritize exceptions; nobody should need to click through all tracked rows to find the bad ones.

Do not use a model's self-reported numerical confidence as truth. Initially display categorical states such as **copied from source**, **normalized by rule**, **model-suggested**, **conflicting**, **unresolved** and **human-verified**. A model may propose a correction and cite the raw field; deterministic checks and a person accept or reject it. Once Bobby has review labels, report measured per-field accuracy and coverage on a held-out sample. A calibrated score is a later decision, separate from a model's assertion about itself.

**Acceptance:** For any displayed field on RFx 34995788, an owner can identify the original GETS value and the transformation that produced the displayed value. A deliberately miscategorized or malformed fixture is flagged, and correction does not mutate the saved source or old reports.

## 5. Extend the manually triggered GETS check into a bounded enrichment run

The existing **Check GETS now** button remains the only trigger. Treat the run as explicit stages: discover listing rows; read detail pages; reconcile coverage; save new/changed/unchanged notice revisions; map and flag anomalies; classify sector; generate a compact, cited notice-level brief for each new/changed readable notice; publish the Watchlist state. Do not start a full pursuit run for every notice. Full pursuit assessment remains an owner action, with its own source manifest and report version.

The notice-level brief should answer what the buyer appears to want, why the scope may matter, visible red flags and three sensible checks, while clearly distinguishing source facts from interpretation. It must not invent price, evaluation criteria, incumbent, bidders or firm fit. It should cite the admitted notice sections, verify quotes, and label unread protected attachments as **not examined**, never as absent. No outside web research or Firecrawl call is implied by the GETS button; a later enrichment route must be separately bounded and attributable.

Run model tasks in small, resumable per-notice units. Use the saved semantic notice hash, prompt/schema version and sector taxonomy version as cache inputs. Reserve usage before each call, settle a durable receipt after it, cap notices/model work per manual run, and show pending/failed/complete counts. If the limit or subscription allowance is reached, preserve imported notices and mark enrichment incomplete; a later manual continuation should not repay for completed stages. Existing unchanged notices should not be regenerated merely because the button was pressed again. Backfill of the current tracked inventory is a separate explicit owner action with a preview of item count and usage bound.

**Acceptance:** A manual current/future/single-notice check reports every discovered item as new, changed, unchanged or unread, and every new/changed readable item as brief completed, pending or failed. A retry is idempotent. No background scheduler, RealMe collection, unbounded model fan-out or automatic full report generation is active.

## Local RealMe/GETS access experiment

Shaun used his own browser to sign in with RealMe and subscribe to RFx 34995788. The agent did not handle an MFA challenge. Credentials, tokens and cookies have not been copied into Groundwork, Git, logs or Railway. GETS's [supplier guide](https://www.gets.govt.nz/SupplierUserTenderHelp.htm) says subscription is required to access attachments. This establishes only what this account can see for this notice, not a reusable server integration or permission to automate other accounts.

The supplier account is active and subscribed; the 13 attachment names, sizes, GETS checksums and individual download links are visible. No attachment was downloaded or read during this inspection, so actual downloads and file integrity remain unverified. No tender response or question was submitted. Next, use a bounded owner-approved transfer of the full pack for local reader/coverage tests; retain each original, reader state and cited page or Office location, and check the PDF viewer against actual source bytes.

Only after the access experiment should we design a server-side authenticated route. It would need a supported supplier-access mechanism, account ownership, session handling, allowed download scope, addendum updates, audit and revocation. A successful browser login alone does not settle those questions or the existing GETS/MBIE access arrangement.

## Delivery order and stop conditions

1. Completed: inspect the RealMe supplier view for RFx 34995788 and inventory its 13 subscribed attachments. Download, byte integrity and reader coverage remain to be tested.
2. Test a bounded transfer of the 13-file pack, then deliver selected-opportunity document admission, including the large-file path, checksum and reader/coverage reconciliation. Keep direct authenticated GETS collection separate.
3. Deliver pursuit presentation fixes, firm-profile linkage and explicit report maturity/coverage states; verify a fresh RFP reassessment with actual admitted documents without changing the old report.
4. Build mapping provenance, sector taxonomy/settings and a reviewed backfill of the tracked inventory.
5. Extend the manual GETS button into staged, capped **public notice** enrichment; test unchanged/retry/partial cases, then validate a small real batch before widening the cap. Keep authenticated pack admission a selected-opportunity step.

The first four steps do not require a scheduler. Stop a run and show the specific blocker if the GETS detail is unread, parser identity or coverage does not reconcile, protected evidence is unavailable, model billing/allowance cannot be established, or a citation cannot be verified. Do not represent an incomplete notice-only brief as a complete pursuit report. The decision to add cron, server-side RealMe access, or automatic full-report generation is deferred. GETS's [terms](https://www.gets.govt.nz/GetsTermsAndConditions.htm) restrict software or other methods of collecting/indexing site content and impose conditions on tender-document reuse; obtain an explicit supported arrangement before treating authenticated collection as a hosted product feature.
