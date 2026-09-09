# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Groundwork revision · 9 September 2026

The current prototype follows Bobby's supplied rebuild brief: watchlist → public-data pursuit → uploaded-RFP reassessment. Lead with competitive structure and reasoning; keep firm context separate. The RFP example changes/retracts findings and preserves the public-data version. Competitor analysis requires listing context plus a matched sample entity. All analytical content is fictional.

Keep the selected Pursuit Room layout, fonts and green/ivory palette. Groundwork is the product name and BidEdge the firm; the PDF's navy/teal colours remain an explicit review question. Recommendation wording, user decision restrictions and analyst publication gates are proposals, not approved policies. Do not make a production requirement out of a sample UX rule.
