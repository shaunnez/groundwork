# Groundwork by BidEdge UX prototype

Selected direction: Pursuit Room. The application contains 35 customer and operator screens, with 186 directly selectable screen/state entries. Some default scenes intentionally represent a partial, empty, queued or failed fixture.

This is a review prototype. All organisations, procurement records, documents, model activity and delivery events are fictional. Forms update browser-local state; they do not authenticate, upload private files, run paid analysis or send email. The public operator views are demonstrations, not operational access.

## Run and verify

```sh
npm ci
npm run dev -- --host 127.0.0.1 --port 5198
npm run typecheck
npm test
npm run build
npm run test:sites
```

Open `/#/guide` to inspect the full catalogue. The bottom bar changes the screen and scene; **Reset demo** resets fictional browser data. **Advance demo** advances a saved simulated assessment. The default entry is the client Home dashboard. The reviewer guide explains client, operator and shared-recipient audiences; operator tools are accessed through the prototype controls. For the main journey: open the digital transformation pursuit, add sample RFP documents, complete sample extraction, request reassessment and use Advance demo. At the analyst hold, record a scoped correction, return to the request and advance to publication. Report version 1 remains selectable alongside the revised version.

The application groups screens in `src/Pursuit.tsx`, `Reports.tsx`, `Market.tsx`, `AccountEvidence.tsx` and `Operations.tsx`. `catalogue.ts` defines navigation and states. `model.ts` contains the small deterministic decision/publication model; its tests cover observable invariants. `Intelligence.tsx` and `intelligence-data.ts` contain the shared fictional assessment, comparison and competitor examples. `WeeklyBrief.tsx` provides the weekly synthesis.

## Product authority

The wider specification and handover live in the parent workspace's `docs/` directory. Bobby's latest clarification makes structured analytical methods, procurement history and monitoring changes central to the product. This prototype does not implement or validate those analytical methods. The overview now leads with the competitive field. The RFP example changes the recommendation and retracts a disproved finding. Competitor analysis requires a listing and matched sample entity; its method sections are illustrative. The broader market screens remain available without deciding first-release scope.

Keep `worker/index.js`, `scripts/prepare-sites-build.mjs` and `.openai/hosting.json` intact. Hosting changes must use the existing registered Site. Only deploy when requested, to the requested audience. No production credentials are required by this prototype.

`node scripts/export-standalone.mjs` produces a self-contained HTML review copy after a build. The regular Site remains the primary review destination. Font files are bundled through Fontsource; icons use Phosphor. The selected visual is retained in `public/reference.png` solely for the comparison view.

See `design-qa.md` and `qa/` for verification evidence. No claim of backend security, scheduler durability, analytical quality or accessibility certification follows from a successful UX check.

## Review status

The Pursuit Room layout and typography are retained. The 15 September feedback adds navy/blue accents, alternating white/pale-blue rows, a client Home dashboard, an audience guide, concise watchlist assessments/actions, and more detailed pursuit/report sections. Groundwork is the product name and BidEdge the firm. Public-data reports retain unknown evaluation criteria; RFP reports use the sample disclosed weights. Recommendation wording, the optional restriction on recording Pursue, and the analyst publication hold are expressly proposed policies. The new PDF does not establish their final behaviour.

The full v0.2 specification and original handover ZIP have not been regenerated. Use the v0.3 draft alignment brief and questions in the parent `docs/` folder for the remaining requirements discussion.
