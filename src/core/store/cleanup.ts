// impl/02 §8, A-S1, A-S2, A-S7, ADR-0002 decision 4, DECISIONS-r9 V22, DEVIATIONS D-M1-11, D-M1-T7-1.
// cleanupProject: row retention + size cap inside the open project's own DB.
// sweepDeadProjects: whole-project delete; the live-PID check and the delete decision run in one
// BEGIN IMMEDIATE (#880 race class). Never on a timer: the caller runs both once (D-M1-11).
import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import {
  DB_FILE_NAME,
  DB_SHM_SUFFIX,
  DB_TIMEOUT_MS,
  DB_WAL_SUFFIX,
  MS_PER_DAY,
  PROJECT_DEAD_IDLE_DAYS,
  PROJECTS_DIR_NAME,
  RETENTION_IDLE_DAYS,
  RETENTION_SIZE_CAP_BYTES,
} from "../contracts/constants.ts";
import { CtxError } from "../contracts/errors.ts";
import type { DbHandle } from "../contracts/types.ts";
import { closeDb, withWrite } from "./db.ts";
import { deleteChunkRows } from "./fts.ts";
import { listLiveOwners } from "./owners.ts";
import { applyMigrations } from "./schema.ts";

// §8.1 step 3: a source and its chunks go together.
function deleteSource(raw: DatabaseSync, id: number): void {
  raw.prepare("DELETE FROM sources WHERE id = ?").run(id);
  deleteChunkRows(raw, { sourceId: id });
}

/** impl/02 §8.1: row-level retention, all inside one withWrite. */
export function cleanupProject(db: DbHandle, configDir: string): { deletedSources: number; deletedProject: boolean } {
  return withWrite(db, (h) => {
    // D-M1-T7-1: no row maps a session to a server, so a live owner keeps every session warm.
    if (listLiveOwners(configDir, h.projectKey).length > 0) return { deletedSources: 0, deletedProject: false };
    let deletedSources = 0;

    // Steps 1-3: age since last access.
    const cutoff = Date.now() - RETENTION_IDLE_DAYS * MS_PER_DAY;
    const old = h.raw.prepare("SELECT id FROM sources WHERE accessed_ts < ?").all(cutoff) as Array<{ id: number }>;
    for (const row of old) {
      deleteSource(h.raw, row.id);
      deletedSources += 1;
    }

    // Step 4: size cap, oldest accessed_ts first.
    // D-R4-RETENTION-1: the cap counts the source bytes and the line units' bytes (the units are stored text too).
    const sum = h.raw.prepare("SELECT SUM(bytes_total) AS n FROM sources").get() as { n: number | null };
    const units = h.raw.prepare("SELECT source_id, SUM(LENGTH(CAST(body AS BLOB))) AS n FROM line_units GROUP BY source_id").all() as Array<{ source_id: number; n: number }>;
    const unitBytes = new Map(units.map((u) => [Number(u.source_id), Number(u.n)]));
    let totalBytes = (sum.n ?? 0) + [...unitBytes.values()].reduce((a, b) => a + b, 0);
    if (totalBytes > RETENTION_SIZE_CAP_BYTES) {
      const byAge = h.raw
        .prepare("SELECT id, bytes_total FROM sources ORDER BY accessed_ts ASC, id ASC")
        .all() as Array<{ id: number; bytes_total: number }>;
      for (const row of byAge) {
        if (totalBytes <= RETENTION_SIZE_CAP_BYTES) break;
        deleteSource(h.raw, row.id);
        totalBytes -= row.bytes_total + (unitBytes.get(Number(row.id)) ?? 0);
        deletedSources += 1;
      }
    }
    // A-S7: the open project itself is never deleted here; sweepDeadProjects owns that.
    return { deletedSources, deletedProject: false };
  });
}

function userVersion(raw: DatabaseSync): number {
  return (raw.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
}

// §8.2 step 2: openDb-equivalent access, synchronous (D-M1-T7-1). Same checks as impl/02 §6.1
// steps 4-7; the caller already passed openDb's Node gate for its own project.
function openForSweep(dbPath: string, projectKey: string): DbHandle {
  if (!existsSync(dbPath) && (existsSync(dbPath + DB_WAL_SUFFIX) || existsSync(dbPath + DB_SHM_SUFFIX))) {
    throw new CtxError("DB_GONE");
  }
  const sqlite = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite") | undefined;
  if (sqlite === undefined) throw new CtxError("NO_SQLITE");
  const raw = new sqlite.DatabaseSync(dbPath, { timeout: DB_TIMEOUT_MS });
  try {
    applyMigrations(raw, userVersion(raw));
  } catch (err) {
    raw.close();
    throw err;
  }
  return { raw, projectKey, path: dbPath };
}

// D-M1-11: last access = MAX(sources.accessed_ts, events.created_at); an empty project = 0.
function lastAccess(raw: DatabaseSync): number {
  const row = raw
    .prepare(
      "SELECT MAX(COALESCE((SELECT MAX(accessed_ts) FROM sources), 0), COALESCE((SELECT MAX(created_at) FROM events), 0)) AS t",
    )
    .get() as { t: number };
  return row.t;
}

// §8.2 steps 2-4 for one project. The live-PID check and the age check run inside one
// BEGIN IMMEDIATE; a live owner, any age, means keep (V22). The directory goes after closeDb
// (step 4 order: Windows cannot delete an open file).
function sweepOne(configDir: string, projectKey: string, cutoff: number): boolean {
  const dir = join(configDir, PROJECTS_DIR_NAME, projectKey);
  const db = openForSweep(join(dir, DB_FILE_NAME), projectKey);
  let dead: boolean;
  try {
    dead = withWrite(db, (h) => listLiveOwners(configDir, projectKey).length === 0 && lastAccess(h.raw) < cutoff);
  } finally {
    closeDb(db);
  }
  if (dead) rmSync(dir, { recursive: true, force: true });
  return dead;
}

/** impl/02 §8.2: delete whole projects with no live owner and no access for PROJECT_DEAD_IDLE_DAYS. */
export function sweepDeadProjects(configDir: string): string[] {
  let entries;
  try {
    entries = readdirSync(join(configDir, PROJECTS_DIR_NAME), { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const cutoff = Date.now() - PROJECT_DEAD_IDLE_DAYS * MS_PER_DAY;
  const deleted: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      if (sweepOne(configDir, entry.name, cutoff)) deleted.push(entry.name);
    } catch (err) {
      // §8.2 errors: a corrupt or busy project is skipped, never deleted; the loop goes on.
      console.error("context-mode: cleanup skipped project " + entry.name + ": " + (err as Error).message);
    }
  }
  return deleted;
}
