import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { z } from "zod";
import {
  BatchAnalysisSchema,
  MAX_PROMPT_BYTES,
  analysisBatches,
  preflightAnalysis,
  segmentUnit,
  validateBatchAnalysis,
} from "../../server/analysis-pipeline.ts";
import {
  analyseReadableUnits,
  analysisDigest,
  streamSourceUnits,
  validatedAnalysisBatch,
} from "../../server/analysis-engine.ts";
import { loadConfig } from "../../server/config.ts";
import { database } from "../../server/db.ts";
import { createApi } from "../../server/api.ts";
import { hash } from "../../server/storage.ts";
import { hasUnmarkedLegacyRevisions } from "../../server/run-readiness.ts";
import { ClaudeTerminalError } from "../../server/claude-receipt.ts";
import type { SourceUnit } from "../../server/domain/evidence.ts";

const unit = (
  text: string,
  location = "Page 1",
  sourceId = randomUUID(),
): SourceUnit => ({
  id: randomUUID(),
  sourceId,
  ordinal: 1,
  location,
  text,
});

test("legacy DOCX revision text is rejected until the source is excluded", () => {
  const source = {
    name: "Contract.docx",
    reader: "docx-structure-v1",
    required: true,
    published_at: null,
    coverage: {
      total: 2,
      read: 1,
      unread: 1,
      unit: "section" as const,
      failures: ["word/document.xml: ins content needs tracked-change review"],
    },
  };
  assert.equal(hasUnmarkedLegacyRevisions(source), true);
  assert.equal(
    hasUnmarkedLegacyRevisions({ ...source, reader: "docx-structure-v2" }),
    false,
  );
});

test("segments retain every original character and keep locatable spreadsheet cells", () => {
  const rows = Array.from(
    { length: 1200 },
    (_, n) =>
      `Pricing!A${n + 1}: Item ${n + 1}\nPricing!B${n + 1}: =A${n + 1}*2; cached value ${n * 2}`,
  ).join("\n");
  const source = unit(
    `Sheet: Pricing. Stored values; formulas are not executed.\n${rows}`,
    "Sheet Pricing",
  );
  const segments = [...segmentUnit(source)];
  assert.ok(segments.length > 20);
  assert.equal(segments.map((s) => s.text).join(""), source.text);
  assert.ok(segments.every((s) => Buffer.byteLength(s.text) <= 2000));
  assert.match(segments.at(-1)!.location, /cells .*1199|cells .*1200/);
  assert.ok(
    [...analysisBatches([source])].every(
      (b) => b.promptBytes <= MAX_PROMPT_BYTES,
    ),
  );
});

test("high-level batches skip revised paragraphs and validate readable quotes", () => {
  const source = unit(
    "Supplier must return a signed form.",
    "Body · Paragraph 1",
  );
  const revised = unit(
    "Base text. ⟦proposed deletion (A, 2026-09-23): old term⟧ ⟦proposed insertion (B): new term⟧",
    "Body · Paragraph 2",
  );
  const batches = [...analysisBatches([source, revised])];
  assert.equal(batches.length, 1);
  assert.equal(batches[0].segments.length, 1);
  assert.ok(!batches[0].prompt.includes("new term"));
  assert.ok(
    !JSON.stringify(z.toJSONSchema(BatchAnalysisSchema)).includes(
      "revisionState",
    ),
  );
  const segment = [...segmentUnit(source)][0];
  const valid = {
    outcomes: [
      {
        segmentId: segment.id,
        items: [
          {
            text: "Return a signed form",
            quote: "Supplier must return a signed form.",
            kind: "requirement",
            mandatory: true,
            contradiction: null,
          },
        ],
      },
    ],
  };
  assert.deepEqual(validateBatchAnalysis([segment], valid), valid);
  assert.throws(
    () => validateBatchAnalysis([segment], { outcomes: [] }),
    /reconcile/,
  );
  assert.throws(
    () =>
      validateBatchAnalysis([segment], {
        outcomes: [valid.outcomes[0], valid.outcomes[0]],
      }),
    /reconcile/,
  );
  assert.throws(
    () =>
      validateBatchAnalysis([segment], {
        outcomes: [
          {
            segmentId: segment.id,
            items: [{ ...valid.outcomes[0].items[0], quote: "invented" }],
          },
        ],
      }),
    /Quote/,
  );
  assert.deepEqual(
    validateBatchAnalysis([segment], {
      extra: "discarded",
      outcomes: [
        {
          segmentId: segment.id,
          extra: "discarded",
          items: [
            {
              ...valid.outcomes[0].items[0],
              kind: "fact",
              extra: "discarded",
            },
          ],
        },
      ],
    }),
    {
      outcomes: [
        {
          segmentId: segment.id,
          items: [{ ...valid.outcomes[0].items[0], kind: "fact", mandatory: false }],
        },
      ],
    },
  );
  assert.throws(
    () => validateBatchAnalysis([segment], { outcomes: [{ segmentId: "", items: [] }] }),
    /Unknown analysis segment/,
  );
});

test("quote correction reruns only the invalid segment and retains valid outcomes", async () => {
  const first = unit("Supplier must return the signed form.");
  const second = unit("The tender closes at 5pm.");
  const batch = [...analysisBatches([first, second])][0];
  assert.equal(batch.segments.length, 2);
  const names: string[] = [];
  const result = await validatedAnalysisBatch(
    "analyse-00000",
    { method: "test" },
    batch,
    async (name, input, prompt) => {
      names.push(name);
      if (names.length === 2) {
        assert.deepEqual(
          (input as { repairSegmentIds: string[] }).repairSegmentIds,
          [batch.segments[0].id],
        );
        assert.ok(prompt.includes(first.text));
        assert.ok(!prompt.includes(second.text));
      }
      return {
        outcomes: [
          {
            segmentId: batch.segments[0].id,
            items: [
              {
                text: "Return signed form",
                quote:
                  names.length === 1
                    ? "Supplier must submit a signed form."
                    : first.text,
                kind: "requirement",
                mandatory: true,
                contradiction: null,
              },
            ],
          },
          ...(names.length === 1
            ? [
                {
                  segmentId: batch.segments[1].id,
                  items: [
                    {
                      text: "Tender closes at 5pm",
                      quote: second.text,
                      kind: "fact" as const,
                      mandatory: false,
                      contradiction: null,
                    },
                  ],
                },
              ]
            : []),
        ],
      };
    },
  );
  assert.deepEqual(names, ["analyse-00000", "analyse-00000-quote-repair-1"]);
  assert.deepEqual(
    result.outcomes.map((outcome) => outcome.segmentId),
    [batch.segments[0].id, batch.segments[1].id],
  );
  assert.equal(result.outcomes[1].items[0].quote, second.text);
});

test("unknown model segment ID is discarded and only the missing segment is rerun", async () => {
  const first = unit("The site meeting is optional.");
  const second = unit("Submit the pricing schedule.");
  const batch = [...analysisBatches([first, second])][0];
  const calls: string[] = [];
  const result = await validatedAnalysisBatch(
    "analyse-00008",
    { method: "test" },
    batch,
    async (name, input, prompt) => {
      calls.push(name);
      if (calls.length === 2) {
        assert.deepEqual(
          (input as { repairSegmentIds: string[] }).repairSegmentIds,
          [batch.segments[1].id],
        );
        assert.ok(prompt.includes(second.text));
        assert.ok(!prompt.includes(first.text));
      }
      return {
        outcomes:
          calls.length === 1
            ? [
                { segmentId: batch.segments[0].id, items: [] },
                { segmentId: "f".repeat(64), items: [] },
              ]
            : [
                {
                  segmentId: batch.segments[1].id,
                  items: [
                    {
                      text: "Submit pricing schedule",
                      quote: second.text,
                      kind: "requirement",
                      mandatory: true,
                      contradiction: null,
                    },
                  ],
                },
              ],
      };
    },
  );
  assert.deepEqual(calls, ["analyse-00008", "analyse-00008-segment-repair-1"]);
  assert.deepEqual(
    result.outcomes.map((outcome) => outcome.segmentId),
    batch.segments.map((segment) => segment.id),
  );
  assert.deepEqual(result.rejectedBySegment, {});
});

test("a terminal turn-limit result splits only its batch and preserves exact segment IDs", async () => {
  const sources = Array.from({ length: 4 }, (_, index) =>
    unit(`Clause ${index + 1}: supplier must provide the stated document.`),
  );
  const batch = [...analysisBatches(sources)][0];
  const callId = randomUUID();
  const names: string[] = [];
  const result = await validatedAnalysisBatch(
    "analyse-00011",
    { method: "test" },
    batch,
    async (name, input, prompt) => {
      names.push(name);
      if (name === "analyse-00011")
        throw new ClaudeTerminalError(callId, "error_max_turns");
      const ids = (input as { splitSegmentIds: string[] }).splitSegmentIds;
      assert.equal(ids.length, 2);
      assert.ok(ids.every((id) => batch.segments.some((s) => s.id === id)));
      assert.ok(prompt.length < batch.prompt.length);
      return { outcomes: ids.map((segmentId) => ({ segmentId, items: [] })) };
    },
  );
  assert.deepEqual(names, [
    "analyse-00011",
    "analyse-00011-split-1",
    "analyse-00011-split-2",
  ]);
  assert.deepEqual(result.outcomes.map((outcome) => outcome.segmentId), batch.segments.map((s) => s.id));
  assert.deepEqual(result.recoveredCallIds, [callId]);
});

test("tenfold synthetic multi-document pack is fully planned with bounded prompts", () => {
  const sources = Array.from({ length: 80 }, (_, n) =>
    unit(
      `Document ${n}.\n` +
        `Clause ${n}: submit a priced schedule and inspection plan.\n`.repeat(
          1650,
        ),
      `Page ${n + 1}`,
    ),
  );
  const characters = sources.reduce((n, s) => n + s.text.length, 0);
  assert.ok(characters >= 6_981_620);
  const result = preflightAnalysis(sources);
  assert.ok(result.batches > 100);
  assert.ok(result.segments >= sources.length);
  assert.ok(result.peakPromptBytes <= MAX_PROMPT_BYTES);
  assert.equal(
    [...analysisBatches(sources)]
      .flatMap((batch) => batch.segments)
      .reduce((n, s) => n + s.text.length, 0),
    characters,
  );
});

test("durable outcomes survive restart, suppress duplicates and expose partial processing", async () => {
  const config = loadConfig();
  const db = database(config);
  const accountId = randomUUID(),
    opportunityId = randomUUID(),
    sourceId = randomUUID(),
    runId = randomUUID();
  const source = unit(
    "Supplier must return the signed form.\nSupplier must return the signed form.",
    "Body · Paragraph 1",
    sourceId,
  );
  const revised = {
    ...unit(
      "Unchanged context. ⟦proposed insertion (editor): unaccepted clause⟧",
      "Body · Paragraph 2",
      sourceId,
    ),
    ordinal: 2,
  };
  assert.equal(preflightAnalysis([source, revised]).excludedUnits, 1);
  try {
    await db.query("INSERT INTO accounts(id,name) VALUES($1,'Analysis test')", [
      accountId,
    ]);
    await db.query(
      "INSERT INTO opportunities(id,account_id,title,buyer,notice_id,cutoff,metadata) VALUES($1,$2,'Analysis test','Test buyer','T-1','2026-09-23','{}')",
      [opportunityId, accountId],
    );
    await db.query(
      "INSERT INTO sources(id,account_id,opportunity_id,name,media_type,purpose,required,hash,object_ref,reader,state,coverage,provenance) VALUES($1,$2,$3,'Test.txt','text/plain','rfp',true,'hash','ref','test','read',$4,'synthetic')",
      [
        sourceId,
        accountId,
        opportunityId,
        { total: 2, read: 2, unread: 0, unit: "section", failures: [] },
      ],
    );
    await db.query(
      "INSERT INTO units(id,account_id,source_id,ordinal,location,text_content) VALUES($1,$2,$3,1,$4,$5)",
      [source.id, accountId, sourceId, source.location, source.text],
    );
    await db.query(
      "INSERT INTO units(id,account_id,source_id,ordinal,location,text_content) VALUES($1,$2,$3,2,$4,$5)",
      [revised.id, accountId, sourceId, revised.location, revised.text],
    );
    await db.query(
      "INSERT INTO runs(id,account_id,opportunity_id,input_hash,manifest,state) VALUES($1,$2,$3,$4,$5,'running')",
      [
        runId,
        accountId,
        opportunityId,
        randomUUID(),
        { sourceIds: [sourceId], sourceHashes: ["hash"] },
      ],
    );
    const run = {
      id: runId,
      account_id: accountId,
      manifest: { sourceIds: [sourceId], sourceHashes: ["hash"] },
    };
    let calls = 0;
    const model = async (_name: string, _input: unknown, _prompt: string) => {
      calls++;
      const segment = [...segmentUnit(source)][0];
      return {
        outcomes: [
          {
            segmentId: segment.id,
            items: [
              {
                text: "Return signed form",
                quote: "Supplier must return the signed form.",
                kind: "requirement" as const,
                mandatory: true,
                contradiction: null,
              },
              {
                text: "Return signed form",
                quote: "Supplier must return the signed form.",
                kind: "requirement" as const,
                mandatory: true,
                contradiction: null,
              },
            ],
          },
        ],
      };
    };
    const first = await analyseReadableUnits(
      db,
      run,
      [source, revised],
      model,
      async () => {},
    );
    assert.equal(first.segmentsProcessed, 1);
    assert.equal(first.unitsExcluded, 1);
    const excluded = await db.query(
      "SELECT reason FROM analysis_segments WHERE run_id=$1 AND state='excluded'",
      [runId],
    );
    assert.equal(excluded.rowCount, 1);
    assert.match(excluded.rows[0].reason, /outside high-level analysis/);
    assert.equal(calls, 1);
    await analyseReadableUnits(
      db,
      run,
      [source, revised],
      async () => {
        throw new Error("completed stage was replayed");
      },
      async () => {},
    );
    const repairRunId = randomUUID();
    await db.query(
      "INSERT INTO runs(id,account_id,opportunity_id,input_hash,manifest,state) VALUES($1,$2,$3,$4,$5,'running')",
      [repairRunId, accountId, opportunityId, randomUUID(), run.manifest],
    );
    const repairNames: string[] = [];
    const segment = [...segmentUnit(source)][0];
    const repaired = await analyseReadableUnits(
      db,
      { ...run, id: repairRunId },
      [source],
      async (name, input, prompt) => {
        repairNames.push(name);
        if (repairNames.length === 2) {
          assert.deepEqual(
            (input as { repairSegmentIds: string[] }).repairSegmentIds,
            [segment.id],
          );
          assert.ok(prompt.includes(source.text.slice(0, 30)));
        }
        return {
          outcomes: [
            {
              segmentId: segment.id,
              items: [
                {
                  text: "Return signed form",
                  quote:
                    repairNames.length === 1
                      ? "Supplier must submit a signed form."
                      : "Supplier must return the signed form.",
                  kind: "requirement" as const,
                  mandatory: true,
                  contradiction: null,
                },
              ],
            },
          ],
        };
      },
      async () => {},
    );
    assert.deepEqual(repairNames, [
      "analyse-00000",
      "analyse-00000-quote-repair-1",
    ]);
    assert.equal(repaired.segmentsProcessed, 1);
    const repairedItems = await db.query(
      "SELECT quote FROM analysis_items WHERE run_id=$1",
      [repairRunId],
    );
    assert.deepEqual(
      repairedItems.rows.map((item) => item.quote),
      ["Supplier must return the signed form."],
    );
    const rejectedRunId = randomUUID();
    await db.query(
      "INSERT INTO runs(id,account_id,opportunity_id,input_hash,manifest,state) VALUES($1,$2,$3,$4,$5,'running')",
      [rejectedRunId, accountId, opportunityId, randomUUID(), run.manifest],
    );
    let rejectedCalls = 0;
    const quarantined = await analyseReadableUnits(
      db,
      { ...run, id: rejectedRunId },
      [source],
      async () => {
        rejectedCalls++;
        return {
          outcomes: [
            {
              segmentId: segment.id,
              items: [
                {
                  text: "Unverified",
                  quote: "A phrase absent from every saved segment.",
                  kind: "fact" as const,
                  mandatory: false,
                  contradiction: null,
                },
              ],
            },
          ],
        };
      },
      async () => {},
    );
    assert.equal(rejectedCalls, 3);
    assert.equal(quarantined.rejectedQuotes, 1);
    assert.equal(quarantined.rejectedMandatoryQuotes, 0);
    const rejectedLedger = await db.query(
      "SELECT state,outcome,reason FROM analysis_segments WHERE run_id=$1",
      [rejectedRunId],
    );
    assert.deepEqual(
      rejectedLedger.rows.map((item) => item.state),
      ["processed"],
    );
    assert.equal(rejectedLedger.rows[0].outcome.rejectedQuoteCount, 1);
    assert.match(rejectedLedger.rows[0].reason, /quarantined/);
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::int AS n FROM analysis_items WHERE run_id=$1",
          [rejectedRunId],
        )
      ).rows[0].n,
      0,
    );
    const digest = await analysisDigest(db, runId);
    assert.equal(digest.totals.requirement_occurrences, 1);
    assert.equal(digest.totals.distinct_requirements, 1);
    for (let n = 0; n < 105; n++)
      await db.query(
        "INSERT INTO analysis_items(run_id,account_id,item_id,segment_id,source_id,unit_id,location,kind,text_content,quote,mandatory,revision_state) VALUES($1,$2,$3,$4,$5,$6,$7,'requirement',$8,$9,true,'operative')",
        [
          runId,
          accountId,
          n.toString(16).padStart(64, "0"),
          [...segmentUnit(source)][0].id,
          sourceId,
          source.id,
          source.location,
          `Condition ${n}`,
          "Supplier must return the signed form.",
        ],
      );
    const userId = randomUUID(),
      token = randomBytes(32).toString("hex");
    await db.query(
      "INSERT INTO memberships(user_id,account_id,role) VALUES($1,$2,'owner')",
      [userId, accountId],
    );
    await db.query(
      "INSERT INTO sessions(token_hash,user_id,account_id,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",
      [hash(token), userId, accountId],
    );
    const app = await createApi(config, db);
    try {
      const headers = {
        host: "127.0.0.1",
        cookie: `groundwork_session=${token}`,
      };
      const page1 = await app.inject({
        url: `/api/runs/${runId}/analysis-items?kind=requirement`,
        headers,
      });
      assert.equal(page1.statusCode, 200, page1.body);
      assert.equal(page1.json().items.length, 100);
      const page2 = await app.inject({
        url: `/api/runs/${runId}/analysis-items?kind=requirement&after=${page1.json().next}`,
        headers,
      });
      assert.equal(page2.statusCode, 200, page2.body);
      assert.equal(page2.json().items.length, 6);
      assert.equal(page2.json().next, null);
      const preflight = await app.inject({
        url: `/api/opportunities/${opportunityId}/analysis-preflight`,
        headers,
      });
      assert.equal(preflight.statusCode, 200, preflight.body);
      assert.equal(preflight.json().sourceCount, 1);
      assert.equal(preflight.json().unitCount, 2);
      assert.equal(preflight.json().excludedUnits, 1);
    } finally {
      await app.close();
    }
  } finally {
    await db.query("DELETE FROM accounts WHERE id=$1", [accountId]);
    await db.end();
  }
});

test("tenfold fixture records every segment, resumes without model replay and bounds peak memory", async (t) => {
  const units = Array.from({ length: 80 }, (_, n) =>
    unit(
      `Document ${n}.\n` +
        `Clause ${n}: submit a priced schedule and inspection plan.\n`.repeat(
          1650,
        ),
      `Page ${n + 1}`,
    ),
  );
  const characters = units.reduce((n, source) => n + source.text.length, 0);
  assert.ok(characters >= 6_981_620);
  const db = database(loadConfig());
  const accountId = randomUUID(),
    opportunityId = randomUUID(),
    runId = randomUUID();
  const baselineRss = process.memoryUsage().rss;
  const started = performance.now();
  try {
    await db.query(
      "INSERT INTO accounts(id,name) VALUES($1,'Large analysis fixture')",
      [accountId],
    );
    await db.query(
      "INSERT INTO opportunities(id,account_id,title,buyer,notice_id,cutoff,metadata) VALUES($1,$2,'Large fixture','Test buyer','T-LARGE','2026-09-23','{}')",
      [opportunityId, accountId],
    );
    for (const source of units) {
      await db.query(
        "INSERT INTO sources(id,account_id,opportunity_id,name,media_type,purpose,required,hash,object_ref,reader,state,coverage,provenance) VALUES($1,$2,$3,'Fixture.txt','text/plain','rfp',true,'hash','ref','test','read',$4,'synthetic')",
        [
          source.sourceId,
          accountId,
          opportunityId,
          { total: 1, read: 1, unread: 0, unit: "section", failures: [] },
        ],
      );
      await db.query(
        "INSERT INTO units(id,account_id,source_id,ordinal,location,text_content) VALUES($1,$2,$3,1,$4,$5)",
        [source.id, accountId, source.sourceId, source.location, source.text],
      );
    }
    const manifest = {
      sourceIds: units.map((source) => source.sourceId),
      sourceHashes: units.map(() => "hash"),
    };
    await db.query(
      "INSERT INTO runs(id,account_id,opportunity_id,input_hash,manifest,state) VALUES($1,$2,$3,$4,$5,'running')",
      [runId, accountId, opportunityId, randomUUID(), manifest],
    );
    const run = { id: runId, account_id: accountId, manifest };
    let calls = 0;
    const result = await analyseReadableUnits(
      db,
      run,
      streamSourceUnits(db, accountId, manifest.sourceIds),
      async (_name, input) => {
        calls++;
        const segments = (input as { segments: { id: string }[] }).segments;
        return {
          outcomes: segments.map((segment) => ({
            segmentId: segment.id,
            items: [],
          })),
        };
      },
      async () => {},
    );
    assert.equal(
      result.segmentsProcessed,
      [...analysisBatches(units)].reduce((n, b) => n + b.segments.length, 0),
    );
    assert.equal(calls, result.batches);
    assert.ok(result.peakPromptBytes <= MAX_PROMPT_BYTES);
    await analyseReadableUnits(
      db,
      run,
      streamSourceUnits(db, accountId, manifest.sourceIds),
      async () => {
        throw new Error("completed work was replayed");
      },
      async () => {},
    );
    const status = await db.query(
      "SELECT count(*)::int AS total,count(*) FILTER(WHERE state='processed')::int AS processed FROM analysis_segments WHERE run_id=$1",
      [runId],
    );
    assert.equal(status.rows[0].processed, status.rows[0].total);
    const rssIncrease = process.memoryUsage().rss - baselineRss;
    assert.ok(
      rssIncrease < 256 * 1024 * 1024,
      `RSS increase ${rssIncrease} bytes`,
    );
    t.diagnostic(
      JSON.stringify({
        characters,
        documents: units.length,
        segments: status.rows[0].total,
        batches: result.batches,
        peakPromptBytes: result.peakPromptBytes,
        rssIncreaseBytes: rssIncrease,
        elapsedMs: Math.round(performance.now() - started),
      }),
    );
  } finally {
    await db.query("DELETE FROM accounts WHERE id=$1", [accountId]);
    await db.end();
  }
});
