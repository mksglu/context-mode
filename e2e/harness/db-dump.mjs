// e2e/harness/db-dump.mjs
// Read-only node:sqlite dump, sorted rows. Spec: docs/architecture/modules/14-tests.md §1.
import { DatabaseSync } from "node:sqlite";

/**
 * @param {string} dbPath
 * @param {string[]} [tables] - defaults to every table in sqlite_master.
 * @returns {Record<string, object[]>} table name -> sorted rows.
 */
export function dumpDb(dbPath, tables) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const names =
      tables ??
      db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all()
        .map((r) => r.name);

    const out = {};
    for (const name of names.slice().sort()) {
      const rows = db.prepare(`SELECT * FROM "${name}"`).all();
      const sortKey = (row) => JSON.stringify(row);
      out[name] = rows.slice().sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : sortKey(a) > sortKey(b) ? 1 : 0));
    }
    return out;
  } finally {
    db.close();
  }
}
