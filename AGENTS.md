# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Groundwork revision · 9 September 2026

The current prototype follows Bobby's supplied rebuild brief: watchlist → public-data pursuit → uploaded-RFP reassessment. Lead with competitive structure and reasoning; keep firm context separate. The RFP example changes/retracts findings and preserves the public-data version. Competitor analysis requires listing context plus a matched sample entity. All analytical content is fictional.

Keep the selected Pursuit Room layout and fonts. The 15 September feedback below supersedes the original green/ivory palette. Groundwork is the product name and BidEdge the firm; use the navy/blue visual treatment requested below. Recommendation wording, user decision restrictions and analyst publication gates are proposals, not approved policies. Do not make a production requirement out of a sample UX rule.

## Brother’s feedback · 15 September 2026

Use navy/blue accents and alternating white/pale-blue rows to break up the monochrome tan presentation. Preserve the established layout and typography. Home is the client dashboard; the prototype guide is for Bobby and product reviewers and must explain audiences, menus and the client journey. Keep operator navigation in the reviewer tools, separate from the client account menu; this is a demonstration of intended audience boundaries, not production authorisation.

Watchlist entries should add a concise intelligence summary and recommended action bullets. Distinguish an assessed opportunity from notice-only suggested checks, pending analysis and planning signals. Pursuit and report detail should include strategic framing, evaluation priorities and delivery/commercial considerations, preserving public-data versus RFP evidence and report versions. Do not infer evaluation weights from sector norms. The attached PlanCheck portfolio PDF is a separate-product visual reference, not a source of BidEdge requirements.

## Pursuit package feedback · 21 September 2026

Pursuit packages and their versioned reports should include an executive summary, centre of gravity analysis, cone of plausibility, analysis of competing hypotheses and a structured risk register. Use the old BidEdge app screenshots in `procont.zip` as guidance for analytical depth only; retain Groundwork's current UI, typography and navy/blue styling. Keep public-data assumptions separate from RFP findings, show contradictory evidence and retractions, and do not copy source-app claims or inferred evaluation weights into the fictional example.

## Working application · 22 September 2026

Shaun requires the original designed Home, Watchlist, Pursuit Room, Market and Reports journeys connected to the real backend. Matching colours on a separate developer workspace is not sufficient. Make these product screens the main application; keep diagnostics and operational controls in reviewer tools. Preserve the fictional prototype explicitly as a design reference. Never mix its sample claims or simulated actions into saved application records.

## Design polish · 22 September 2026

Compare every connected page and shared component against the original prototype. Preserve its typography, navy/blue palette, spacing and table/list hierarchy. Give links, buttons, fields and disclosures consistent hover and keyboard-focus states, and keep the main journeys usable on mobile. Avoid repeating the same text within a page: reference an already displayed finding without deleting or merging saved findings or their evidence. Keep raw data available for inspection, with readable presentation as the default.

## Source management and PDF evidence · 23 September 2026

Keep source metadata and original bytes immutable once admitted. Edits/replacements create versions; archive removes a source from future runs without breaking historical citations. In PDF evidence views, open the original on the cited page and highlight only mechanically located text regions. Preserve OCR origin and uncertainty; no guessed boxes. Use PlanCheck's scale-stable overlay approach as a reference while keeping this implementation Node.js/TypeScript.

## Watchlist quick read · 23 September 2026

Show notice type and New Zealand closing time on each watchlist item, followed by a clear intelligence summary, why the scope may matter, bullet-pointed red flags and exactly three recommended actions. For unassessed GETS notices, ground the quick read in the saved public overview and label it as notice-only; do not present generic checks as a completed assessment or invent contract value. Treat future, information and interest notices differently from open bids. Show at most three compact competitor cards only where saved research names a source-supported supplier, and state that bidding intentions are unconfirmed. Keep the cards readable on mobile and limit the number rendered at once.
