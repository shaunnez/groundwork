import { writeFile } from "node:fs/promises";
import { z } from "zod";
import { loadConfig } from "../server/config.ts";
import { database, transaction } from "../server/db.ts";

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...value] = arg.replace(/^--/, "").split("=");
    return [key, value.join("=")];
  }),
);
const account = z.string().uuid().parse(args.account);
const output = z.string().min(1).parse(args.output);
const expected = z.coerce.number().int().positive().parse(args.expect);
const db = database(loadConfig());
try {
  const receipt = await transaction(db, async (c) => {
    const records = await c.query(
      `SELECT id,notice_id,metadata->>'provenance' AS provenance,archived_at,
       (SELECT count(*)::int FROM reports WHERE opportunity_id=o.id) AS retained_reports,
       (SELECT count(*)::int FROM sources WHERE opportunity_id=o.id) AS retained_sources
       FROM opportunities o WHERE account_id=$1 AND metadata->>'provenance'='synthetic' FOR UPDATE`,
      [account],
    );
    if (records.rowCount !== expected)
      throw new Error(
        `Expected ${expected} synthetic opportunities; found ${records.rowCount}`,
      );
    const active = await c.query(
      "SELECT id FROM runs WHERE account_id=$1 AND opportunity_id=ANY($2::uuid[]) AND state IN ('queued','running')",
      [account, records.rows.map((row) => row.id)],
    );
    if (active.rowCount)
      throw new Error("Synthetic opportunity has active work");
    await c.query(
      "UPDATE schedules SET enabled=false WHERE account_id=$1 AND opportunity_id=ANY($2::uuid[])",
      [account, records.rows.map((row) => row.id)],
    );
    await c.query(
      "UPDATE opportunities SET archived_at=coalesce(archived_at,now()) WHERE account_id=$1 AND id=ANY($2::uuid[])",
      [account, records.rows.map((row) => row.id)],
    );
    return {
      account,
      action:
        "archive from active journeys; retain original evidence and reports",
      records: records.rows.map((row) => ({
        id: row.id,
        noticeId: row.notice_id,
        alreadyArchived: row.archived_at !== null,
        retainedReports: row.retained_reports,
        retainedSources: row.retained_sources,
      })),
    };
  });
  await writeFile(output, JSON.stringify(receipt, null, 2), { mode: 0o600 });
  console.log(
    `Archived ${receipt.records.length} synthetic opportunities from active journeys; retained ${receipt.records.reduce((n, row) => n + row.retainedReports, 0)} reports`,
  );
} finally {
  await db.end();
}
