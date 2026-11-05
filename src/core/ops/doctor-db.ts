// impl/07 §5 D8 + D9, ADR-0010, impl/02 (store), DEVIATIONS D-M5-U1-6, D-M5-D4-1..4.
// D8: stale schema and integrity_check are two independent sub-checks folded into one row (A-T5).
// D9: source and chunk counts of this project's context.db (one DB per project, so every row counts).
// Read-only: the DB opens with readOnly, never migrates, never creates a missing file. The one doctor
// write (the D8 heal) lives in doctor-heal.ts and runs on `integrityFailed`.
import { existsSync, statSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import {
  D2_SQLITE_DETAIL, D8_INTEGRITY_DETAIL, D8_ORPHAN_DETAIL, D8_ORPHAN_FIX, DB_SHM_SUFFIX, DB_WAL_SUFFIX, D8_INTEGRITY_FIX, D8_STALE_SCHEMA_DETAIL, D9_INDEX_DETAIL,
  DB_TIMEOUT_MS, DOCTOR_FIX_UPGRADE, DOCTOR_LABEL, DOCTOR_PASS_DETAIL, INTEGRITY_OK, PRAGMA_INTEGRITY_CHECK,
  SCHEMA_VERSION, SQLITE_CORRUPT_CODE, SQLITE_MODULE, SQLITE_NOTADB_CODE, SQLITE_PRIMARY_CODE_MASK,
} from "../contracts/constants.ts";
import type { OrphanFile } from "../contracts/constants.ts";
import type { DoctorRow, ProjectContext } from "../contracts/types.ts";
import { openReadOnlyHandle } from "../store/open-read.ts";

type SqliteModule = typeof import("node:sqlite");

/** D8 row plus which sub-check failed; db-heal.ts reads `integrityFailed`, and `orphan` (D-ORPHAN-WAL-1). */
export interface DbCheck { row: DoctorRow; schemaStale: boolean; integrityFailed: boolean; orphan: OrphanFile[]; }

const unknown = (id: "D8" | "D9", detail: string): DoctorRow => ({ id, label: DOCTOR_LABEL[id], status: "UNKNOWN", detail });
const pass = (id: "D8" | "D9", detail: string): DoctorRow => ({ id, label: DOCTOR_LABEL[id], status: "PASS", detail });
const fail = (detail: string, fixCommand: string): DoctorRow => ({ id: "D8", label: DOCTOR_LABEL.D8, status: "FAIL", detail, fixCommand });

// SQLITE_CORRUPT or SQLITE_NOTADB (primary code of node:sqlite's `errcode`), same test as store/db.ts.
function isCorrupt(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const code = (err as { errcode?: unknown }).errcode;
  if (typeof code !== "number") return false;
  const primary = code & SQLITE_PRIMARY_CODE_MASK;
  return primary === SQLITE_CORRUPT_CODE || primary === SQLITE_NOTADB_CODE;
}

const message = (err: unknown): string => (err instanceof Error ? err.message : String(err));

async function loadSqlite(): Promise<SqliteModule | null> {
  try {
    return (await import(SQLITE_MODULE)) as SqliteModule;
  } catch {
    return null; // D2 reports the cause; D8/D9 say UNKNOWN with the same text
  }
}

function openRead(sqlite: SqliteModule, path: string): DatabaseSync {
  return openReadOnlyHandle(sqlite, path); // D-R44-OC-SQLITE-RO-1
}

// One cell of a one-column PRAGMA/SELECT row.
const cell = (row: unknown): unknown => Object.values(row as Record<string, unknown>)[0];

/** Sub-check 1: PRAGMA user_version against SCHEMA_VERSION. Any other value is stale (D-M5-D4-1). */
function readSchema(raw: DatabaseSync): number {
  return Number(cell(raw.prepare("PRAGMA user_version").get()));
}

/** Sub-check 2: PRAGMA integrity_check passes only as the single row "ok". */
function integrityOk(raw: DatabaseSync): boolean {
  const rows = raw.prepare(PRAGMA_INTEGRITY_CHECK).all();
  return rows.length === 1 && cell(rows[0]) === INTEGRITY_OK;
}

/** Runs `step`; a corrupt/not-a-db error is the answer `true` (failed), any other error propagates. */
function failsOnCorrupt(step: () => boolean): boolean {
  try {
    return step();
  } catch (err) {
    if (isCorrupt(err)) return true;
    throw err;
  }
}

// D-ORPHAN-WAL-1: the -wal/-shm siblings of a missing context.db, same order as openDb (siblings first, D-M3-F-2).
function orphanFiles(dbPath: string): OrphanFile[] {
  const files: OrphanFile[] = [];
  for (const suffix of [DB_WAL_SUFFIX, DB_SHM_SUFFIX]) {
    const path = dbPath + suffix;
    if (existsSync(path)) files.push({ path, bytes: statSync(path).size });
  }
  return files.length > 0 && !existsSync(dbPath) ? files : [];
}

export async function checkDb(project: ProjectContext): Promise<DbCheck> {
  const clean = { schemaStale: false, integrityFailed: false, orphan: [] as OrphanFile[] };
  // D-ORPHAN-WAL-1: openDb answers DB_GONE in this state, so D8 names it; the doctor run then moves the files aside.
  const orphan = orphanFiles(project.dbPath);
  if (orphan.length > 0) return { row: fail(D8_ORPHAN_DETAIL(orphan), D8_ORPHAN_FIX), schemaStale: false, integrityFailed: false, orphan };
  // No context.db yet: nothing stale, nothing corrupt; doctor never creates it (D-M5-D4-2).
  if (!existsSync(project.dbPath)) return { row: pass("D8", DOCTOR_PASS_DETAIL), ...clean };
  const sqlite = await loadSqlite();
  if (sqlite === null) return { row: unknown("D8", D2_SQLITE_DETAIL), ...clean };
  let raw: DatabaseSync | null = null;
  try {
    raw = openRead(sqlite, project.dbPath);
    const db = raw;
    let got: number | null = null;
    try {
      got = readSchema(db);
    } catch (err) {
      if (!isCorrupt(err)) throw err; // a corrupt header is the integrity cause, not a stale schema
    }
    const schemaStale = got !== null && got !== SCHEMA_VERSION;
    const integrityFailed = failsOnCorrupt(() => !integrityOk(db));
    // Both failed: the integrity cause shows, because the heal runs first; stale shows next run (D-M5-D4-3).
    if (integrityFailed) return { row: fail(D8_INTEGRITY_DETAIL, D8_INTEGRITY_FIX), schemaStale, integrityFailed, orphan: [] };
    if (schemaStale && got !== null) return { row: fail(D8_STALE_SCHEMA_DETAIL(got, SCHEMA_VERSION), DOCTOR_FIX_UPGRADE), schemaStale, integrityFailed, orphan: [] };
    return { row: pass("D8", DOCTOR_PASS_DETAIL), ...clean };
  } catch (err) {
    // Neither sub-check could run (busy, permission): reported, not guessed (D-M5-D4-4).
    if (isCorrupt(err)) return { row: fail(D8_INTEGRITY_DETAIL, D8_INTEGRITY_FIX), schemaStale: false, integrityFailed: true, orphan: [] };
    return { row: unknown("D8", message(err)), ...clean };
  } finally {
    raw?.close();
  }
}

export async function checkIndex(project: ProjectContext): Promise<DoctorRow> {
  // Empty is valid but never reads as healthy-and-populated (#1014): PASS with the zero counts.
  if (!existsSync(project.dbPath)) return pass("D9", D9_INDEX_DETAIL(0, 0));
  const sqlite = await loadSqlite();
  if (sqlite === null) return unknown("D9", D2_SQLITE_DETAIL);
  let raw: DatabaseSync | null = null;
  try {
    raw = openRead(sqlite, project.dbPath);
    const sources = Number(cell(raw.prepare("SELECT count(*) FROM sources").get()));
    const chunks = Number(cell(raw.prepare("SELECT count(*) FROM chunks").get()));
    return pass("D9", D9_INDEX_DETAIL(sources, chunks));
  } catch (err) {
    return unknown("D9", message(err)); // a corrupt or stale DB is D8's FAIL; D9 only says it cannot count
  } finally {
    raw?.close();
  }
}
