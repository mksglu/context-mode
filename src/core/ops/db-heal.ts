// impl/07 §5 step 7, ADR-0010 D8 (the one doctor write), impl/02 §7 owners.ts, impl/02 A-S3.
// Runs only after D8's integrity_check sub-check failed. Sole live owner -> healLossless; else, or if
// healLossless throws -> rename context.db, -wal, -shm aside as <file>.<ts>.bak and recreate via openDb.
// All file steps are synchronous: no other code of this process runs between the copy and the swap.
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import {
  D8_HEALED_LOSSLESS_DETAIL,
  D8_HEALED_RECREATE_DETAIL,
  D8_ORPHAN_HEALED_DETAIL,
  D8_ORPHAN_HEALED_FIX,
  D8_ORPHAN_MOVE_FAILED,
  ORPHAN_DIR_PREFIX,
  DB_SHM_SUFFIX,
  DB_SIBLING_SUFFIXES,
  DB_TIMEOUT_MS,
  DB_WAL_SUFFIX,
  HEAL_BACKUP_SUFFIX,
  HEAL_TMP_SUFFIX,
  HEAL_TS_SEP,
  INTEGRITY_OK,
  PRAGMA_INTEGRITY_CHECK,
  SQLITE_MODULE,
} from "../contracts/constants.ts";
import { CtxError } from "../contracts/errors.ts";
import { renameWithRetry } from "./atomic-file.ts";
import type { OrphanFile } from "../contracts/constants.ts";
import type { DoctorRow, ProjectContext } from "../contracts/types.ts";
import { closeDb, openDb } from "../store/db.ts";
import { openReadOnlyHandle } from "../store/open-read.ts";
import { listLiveOwners } from "../store/owners.ts";

export interface HealD8Input {
  project: ProjectContext;
  configDir: string; // resolveConfigDir(env): owners/ lives under <configDir>/projects/<projectKey>
  serverId: string;  // this server's owner file stem
  row: DoctorRow;    // D8 row whose integrity_check sub-check failed
}

function integrityOk(rows: unknown[]): boolean {
  return rows.length === 1 && (rows[0] as { integrity_check: unknown }).integrity_check === INTEGRITY_OK;
}

/**
 * Lossless heal: read-only open, VACUUM INTO <db>.heal, rebuild indexes and switch the copy to WAL,
 * check it, then swap it in. VACUUM INTO reads the WAL too, so the old -wal/-shm hold nothing the copy
 * lacks; they go before the rename, else SQLite would replay stale frames onto the new file
 * (DEVIATIONS D-M5-D5-2). Throws on any failure; the temp file never survives.
 */
export async function healLossless(dbPath: string): Promise<void> {
  const { DatabaseSync } = (await import(SQLITE_MODULE)) as typeof import("node:sqlite");
  const tmp = dbPath + HEAL_TMP_SUFFIX;
  rmSync(tmp, { force: true });
  try {
    const src = openReadOnlyHandle({ DatabaseSync } as typeof import("node:sqlite"), dbPath, { queryOnly: false }); // D-R44-OC-SQLITE-RO-1
    try {
      src.prepare("VACUUM INTO ?").run(tmp);
    } finally {
      src.close();
    }
    const copy = new DatabaseSync(tmp, { timeout: DB_TIMEOUT_MS });
    try {
      copy.exec("REINDEX"); // a broken index is copied as-is; rebuild it from the table rows
      copy.exec("PRAGMA journal_mode = WAL"); // VACUUM INTO writes a rollback-journal file
      if (!integrityOk(copy.prepare(PRAGMA_INTEGRITY_CHECK).all())) throw new CtxError("DB_CORRUPT");
    } finally {
      copy.close(); // last connection: SQLite checkpoints and removes the copy's -wal/-shm
    }
    rmSync(dbPath + DB_WAL_SUFFIX, { force: true });
    rmSync(dbPath + DB_SHM_SUFFIX, { force: true });
    renameWithRetry(tmp, dbPath);
  } finally {
    rmSync(tmp, { force: true });
  }
}

/** Rename context.db, -wal, -shm aside as <file>.<ts>.bak; returns <ts> (UTC epoch ms, impl/02 A-S12). */
function renameAside(dbPath: string): string {
  const ts = String(Date.now());
  for (const suffix of DB_SIBLING_SUFFIXES) {
    const file = dbPath + suffix;
    if (existsSync(file)) renameWithRetry(file, file + HEAL_TS_SEP + ts + HEAL_BACKUP_SUFFIX);
  }
  return ts;
}

/**
 * impl/07 §5 step 7. "This process holds the WAL checkpoint ownership" = this server is the only live
 * owner (DEVIATIONS D-M5-D5-1). Returns the updated D8 row; the input row is not changed.
 */
export async function healD8(input: HealD8Input): Promise<DoctorRow> {
  const { project, configDir, serverId, row } = input;
  const live = listLiveOwners(configDir, project.projectKey);
  if (live.length === 1 && live[0] === serverId) {
    try {
      await healLossless(project.dbPath);
      const { fixCommand: _omit, ...rest } = row; // PASS rows carry no fix
      return { ...rest, status: "PASS", detail: D8_HEALED_LOSSLESS_DETAIL };
    } catch {
      // impl/07 §5 step 7: "or if healLossless itself throws" -> rename aside and recreate
    }
  }
  const ts = renameAside(project.dbPath);
  closeDb(await openDb(project));
  return { ...row, status: "FAIL", detail: D8_HEALED_RECREATE_DETAIL(ts) };
}

// "2026-11-03T12:01:02.345Z" -> "20261103T120102Z": no ":" (Windows file names), sorts by time.
function utcStamp(now: Date): string {
  return now.toISOString().slice(0, 19).replaceAll("-", "").replaceAll(":", "") + "Z";
}

/** A new folder <projectDir>/orphan-<UTC stamp>/ (a "-<n>" suffix when that second is taken). */
function makeOrphanDir(projectDir: string): string {
  const base = join(projectDir, ORPHAN_DIR_PREFIX + utcStamp(new Date()));
  for (let n = 1; ; n += 1) {
    const dir = n === 1 ? base : base + "-" + String(n);
    try {
      mkdirSync(dir);
      return dir;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    }
  }
}

/**
 * D-ORPHAN-WAL-1, ADR-0010 D8 (the one doctor write): context.db is missing and its -wal/-shm are left. Each file
 * moves whole and unchanged (rename, same folder tree) into a new orphan-<UTC>/ folder; then openDb starts a new
 * context.db. Nothing is deleted or cut (D-NO-TRUNCATE-1). A failed move keeps the row's own text plus the cause.
 */
export async function healOrphan(project: ProjectContext, files: readonly OrphanFile[], row: DoctorRow): Promise<DoctorRow> {
  const moved: OrphanFile[] = [];
  let dir = "";
  try {
    dir = makeOrphanDir(dirname(project.dbPath));
    for (const f of files) {
      const to = join(dir, basename(f.path));
      renameWithRetry(f.path, to);
      moved.push({ path: to, bytes: f.bytes });
    }
    closeDb(await openDb(project));
  } catch (err) {
    const cause = err instanceof CtxError ? err.toLine() : err instanceof Error ? err.message : String(err);
    const at = moved.length > 0 ? D8_ORPHAN_HEALED_DETAIL(dir, moved, project.dbPath) : row.detail;
    return { ...row, detail: D8_ORPHAN_MOVE_FAILED(at, cause) };
  }
  return { ...row, status: "FAIL", detail: D8_ORPHAN_HEALED_DETAIL(dir, moved, project.dbPath), fixCommand: D8_ORPHAN_HEALED_FIX };
}
