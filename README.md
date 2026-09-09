# Procint UX prototype

Selected direction: Pursuit Room. The application contains 34 customer and operator screens, with 180 directly selectable screen/state entries. Some default scenes intentionally represent a partial, empty, queued or failed fixture.

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

Open `/#/guide` to inspect the full catalogue. The bottom bar changes the screen and scene; **Reset demo** resets fictional browser data. **Advance demo** advances a saved simulated assessment. The default entry is the selected pursuit workspace.

The application groups screens in `src/Pursuit.tsx`, `Reports.tsx`, `Market.tsx`, `AccountEvidence.tsx` and `Operations.tsx`. `catalogue.ts` defines navigation and states. `model.ts` contains the small deterministic decision/publication model; its tests cover observable invariants. `WeeklyBrief.tsx` provides the weekly briefing view.

## Product authority

The wider specification and handover live in the parent workspace's `docs/` directory. Bobby's latest clarification makes structured analytical methods, procurement history and monitoring changes central to the product. This prototype does not implement or validate those analytical methods. Its evidence-first pursuit screen is one part of that broader product.

Keep `worker/index.js`, `scripts/prepare-sites-build.mjs` and `.openai/hosting.json` intact. Hosting changes must use the existing registered Site. Only deploy when requested, to the requested audience. No production credentials are required by this prototype.

`node scripts/export-standalone.mjs` produces a self-contained HTML review copy after a build. The regular Site remains the primary review destination. Font files are bundled through Fontsource; icons use Phosphor. The selected visual is retained in `public/reference.png` solely for the comparison view.

See `design-qa.md` and `qa/` for verification evidence. No claim of backend security, scheduler durability, analytical quality or accessibility certification follows from a successful UX check.
