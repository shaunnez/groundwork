import pg from "pg";
import type { Config } from "./config.ts";
// SQL dates are calendar dates, not local-midnight timestamps.
pg.types.setTypeParser(1082, (value) => value);
export type Database = pg.Pool;
export function database(c: Config): Database {
  return new pg.Pool({ connectionString: c.databaseUrl, max: 6 });
}
export async function transaction<T>(
  db: Database,
  action: (c: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const result = await action(c);
    await c.query("COMMIT");
    return result;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
