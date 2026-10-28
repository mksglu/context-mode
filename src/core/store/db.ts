// impl/02 §6 (openDb, withWrite, closeDb), impl/00 §4 signatures (DEVIATIONS D-M1-1),
// metaGet/metaSet/metaTake (DEVIATIONS D-M1-7), ADR-0002 decisions 2-3, impl/02 A-S3,
// DEVIATIONS D-M1-T5-1.
// D-CI-PERF-3: node:fs through getBuiltinModule; a static ESM import of node:fs also loads fs/promises, readline and streams.
const { existsSync, linkSync, mkdirSync, rmSync } = process.getBuiltinModule("node:fs") as typeof import("node:fs");
import type { DatabaseSync } from "node:sqlite";
import {
  DB_SHM_SUFFIX,
  DB_TIMEOUT_MS,
  DB_TMP_SUFFIX,
  DB_WAL_SUFFIX,
  NODE_MIN,
  SCHEMA_VERSION,
  SQLITE_CORRUPT_CODE,
  SQLITE_NOTADB_CODE,
  SQLITE_PRIMARY_CODE_MASK,
} from "../contracts/constants.ts";
import { CtxError } from "../contracts/errors.ts";
import type { DbHandle, ProjectContext } from "../contracts/types.ts";
import { applyMigrations } from "./schema.ts";

export type { DbHandle } from "../contracts/types.ts";

// "v26.8.1" or "26.8.1" -> [26, 8, 1]. Split on ".", compare numerically (impl/02 §6.1 step 1).
function versionParts(v: string): number[] {
  const bare = v.startsWith("v") ? v.slice(1) : v;
  return bare.split(".").map((p) => Number.parseInt(p, 10));
}

function isBelow(found: string, min: string): boolean {
  const a = versionParts(found);
  const b = versionParts(min);
  for (let i = 0; i < b.length; i += 1) {
    const x = a[i] ?? 0;
    if (x !== b[i]) return x < b[i];
  }
  return false;
}

// SQLITE_CORRUPT or SQLITE_NOTADB (primary code of node:sqlite's `errcode`) -> DB_CORRUPT.
function isCorrupt(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const code = (err as { errcode?: unknown }).errcode;
  if (typeof code !== "number") return false;
  const primary = code & SQLITE_PRIMARY_CODE_MASK;
  return primary === SQLITE_CORRUPT_CODE || primary === SQLITE_NOTADB_CODE;
}

type SqliteModule = typeof import("node:sqlite");

async function loadSqlite(): Promise<SqliteModule> {
  try {
    return await import("node:sqlite");
  } catch {
    throw new CtxError("NO_SQLITE");
  }
}

function readUserVersion(raw: DatabaseSync): number {
  const row = raw.prepare("PRAGMA user_version").get() as { user_version: number };
  return row.user_version;
}

// D-M2-CI-3: a missing DB is built under a private temp name (WAL switch + DDL, no other
// connection can see it), then published with linkSync, which fails with EEXIST if another server
// won. `PRAGMA journal_mode = WAL` needs an exclusive lock that SQLite takes without calling the
// busy handler, so N servers switching one fresh file at once got "database is locked" (GP8).
function createAtomically(sqlite: SqliteModule, path: string): void {
  // GS6 (D-M7-HP-1): node:crypto loads only when a DB is created, not on every open.
  const { randomUUID } = process.getBuiltinModule("node:crypto") as typeof import("node:crypto");
  const tmp = path + "." + randomUUID() + DB_TMP_SUFFIX;
  try {
    const raw = new sqlite.DatabaseSync(tmp, { timeout: DB_TIMEOUT_MS });
    try {
      applyMigrations(raw, readUserVersion(raw));
    } finally {
      raw.close(); // last connection: SQLite checkpoints and removes the temp -wal/-shm
    }
    try {
      linkSync(tmp, path);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    }
  } finally {
    for (const suffix of ["", DB_WAL_SUFFIX, DB_SHM_SUFFIX]) rmSync(tmp + suffix, { force: true });
  }
}

// Read-write open + migrations (impl/02 §6.1 steps 5-7). Closes the handle on any error.
function openWritable(sqlite: SqliteModule, path: string): DatabaseSync {
  let raw: DatabaseSync | null = null;
  try {
    if (!existsSync(path)) createAtomically(sqlite, path);
    raw = new sqlite.DatabaseSync(path, { timeout: DB_TIMEOUT_MS });
    applyMigrations(raw, readUserVersion(raw));
    return raw;
  } catch (err) {
    if (raw) raw.close();
    throw err;
  }
}

// Read-only open (D-M1-T5-1): never migrates; a schema other than SCHEMA_VERSION is SCHEMA_STALE.
function openReadOnly(sqlite: SqliteModule, path: string): DatabaseSync {
  const raw = new sqlite.DatabaseSync(path, { timeout: DB_TIMEOUT_MS, readOnly: true });
  try {
    const found = readUserVersion(raw);
    if (found !== SCHEMA_VERSION) throw new CtxError("SCHEMA_STALE", { found, want: SCHEMA_VERSION });
    return raw;
  } catch (err) {
    raw.close();
    throw err;
  }
}

export async function openDb(project: ProjectContext, opts?: { readOnly?: boolean }): Promise<DbHandle> {
  // Step 1: Node version gate.
  if (isBelow(process.version, NODE_MIN)) throw new CtxError("NODE_TOO_OLD", { v: process.version });
  const sqlite = await loadSqlite();

  // Steps 2-3: the project dir and DB path come from ProjectContext (resolve.ts built them).
  mkdirSync(project.projectDir, { recursive: true });
  const path = project.dbPath;

  // Step 4: main file gone but a WAL/SHM sibling left behind -> hard error, no recreate (ADR-0002 §3).
  // Siblings first, main file second (D-M3-F-2): SQLite makes a sibling only after the main file
  // exists, so a sibling seen before a missing main file means the main file was deleted. The other
  // order races a concurrent first open: main absent, then the winner links it and opens WAL.
  const sibling = existsSync(path + DB_WAL_SUFFIX) || existsSync(path + DB_SHM_SUFFIX);
  if (sibling && !existsSync(path)) {
    throw new CtxError("DB_GONE");
  }

  try {
    let raw: DatabaseSync;
    if (opts?.readOnly === true) {
      // A read-only open cannot create the file; the first open of a project creates it once.
      if (!existsSync(path)) openWritable(sqlite, path).close();
      raw = openReadOnly(sqlite, path);
    } else {
      raw = openWritable(sqlite, path);
    }
    return { raw, projectKey: project.projectKey, path, ...(opts?.readOnly === true ? { readOnly: true } : {}) };
  } catch (err) {
    // Never rename here: only ctx_doctor renames aside (ADR-0002 decision 3, impl/02 A-S3).
    if (isCorrupt(err)) throw new CtxError("DB_CORRUPT");
    throw err;
  }
}

// ADR-0002 decision 2: every write transaction starts BEGIN IMMEDIATE. No retry loop on top of
// DB_TIMEOUT_MS; a SQLITE_BUSY from BEGIN propagates unchanged (impl/02 §6.2).
export function withWrite<T>(db: DbHandle, fn: (db: DbHandle) => T): T {
  db.raw.exec("BEGIN IMMEDIATE");
  try {
    const result = fn(db);
    // COMMIT inside the try: a failed COMMIT (busy, disk full) must not leave the connection in an
    // open transaction that the next withWrite's BEGIN would trip over (review-M1 #3).
    db.raw.exec("COMMIT");
    return result;
  } catch (err) {
    // SQLite may already have rolled back (e.g. on SQLITE_FULL); ROLLBACK only an open transaction.
    if (db.raw.isTransaction) db.raw.exec("ROLLBACK");
    throw err;
  }
}

// Every server checkpoints on its own close, no election (impl/02 §6.3). Never throws.
// PASSIVE, never TRUNCATE: owner main rule (D-NO-TRUNCATE-1). PASSIVE never waits on readers.
// D-CKPT-LAT-1: a read-only handle wrote nothing, so it has nothing to checkpoint; the writers checkpoint their own WAL.
export function closeDb(db: DbHandle): void {
  if (db.readOnly !== true) {
    try {
      db.raw.exec("PRAGMA wal_checkpoint(PASSIVE)");
    } catch {
      // best-effort: a failed checkpoint never blocks shutdown
    }
  }
  try {
    db.raw.close();
  } catch {
    // already closed
  }
}

// Meta writes join the caller's transaction when one is open (hooks call them inside withWrite,
// impl/09 §4); otherwise they start their own BEGIN IMMEDIATE (DEVIATIONS D-M1-T5-1).
function inWrite<T>(db: DbHandle, fn: (db: DbHandle) => T): T {
  return db.raw.isTransaction ? fn(db) : withWrite(db, fn);
}

export function metaGet(db: DbHandle, key: string): string | null {
  const row = db.raw.prepare("SELECT value FROM meta WHERE key = ?").get(key) as { value: string } | undefined;
  return row === undefined ? null : row.value;
}

export function metaSet(db: DbHandle, key: string, v: string): void {
  inWrite(db, (h) => {
    h.raw
      .prepare("INSERT INTO meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(key, v);
  });
}

// DELETE ... RETURNING: read-and-clear in one statement, so a flag fires exactly once (ADR-0009 §6).
export function metaTake(db: DbHandle, key: string): string | null {
  return inWrite(db, (h) => {
    const row = h.raw.prepare("DELETE FROM meta WHERE key = ? RETURNING value").get(key) as { value: string } | undefined;
    return row === undefined ? null : row.value;
  });
}
