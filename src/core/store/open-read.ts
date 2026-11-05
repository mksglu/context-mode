// D-R44-OC-SQLITE-RO-1 (#1310): Bun 1.4.4 (the OpenCode 2 host) cannot open a database with node:sqlite `readOnly: true`
// ("unable to open database file"); a normal open works. Under Bun the handle opens normally and PRAGMA query_only
// stops every write. `queryOnly: false` leaves the handle able to run VACUUM INTO (the heal reads the source, writes a copy).
import type { DatabaseSync } from "node:sqlite";
import { DB_TIMEOUT_MS } from "../contracts/constants.ts";

type SqliteModule = typeof import("node:sqlite");

export function openReadOnlyHandle(sqlite: SqliteModule, path: string, opts: { queryOnly?: boolean; bun?: string | undefined } = {}): DatabaseSync {
  const bun = "bun" in opts ? opts.bun : process.versions.bun;
  if (bun === undefined) return new sqlite.DatabaseSync(path, { timeout: DB_TIMEOUT_MS, readOnly: true });
  const raw = new sqlite.DatabaseSync(path, { timeout: DB_TIMEOUT_MS });
  if (opts.queryOnly !== false) raw.exec("PRAGMA query_only = ON");
  return raw;
}
