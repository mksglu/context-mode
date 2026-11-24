// D-1401-SPOOL-1 (#1401): hook writes under another process's write lock. A hook process waits at most
// HOOK_BUSY_MS for the project write lock (not DB_TIMEOUT_MS: the host kills a hook at HOOK_TIMEOUT_MS). When the
// lock stays busy, the write goes to <projectDir>/pending as one JSON file, and the next hook write in the project
// that gets the lock applies the pending files first, oldest first. No journal row and no indexed output is dropped.
// D-CI-PERF-7: node:fs through getBuiltinModule; a static ESM import of node:fs also loads fs/promises, readline and streams.
const { mkdirSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, utimesSync, writeFileSync } = process.getBuiltinModule("node:fs") as typeof import("node:fs");
import { join } from "node:path";
import {
  HOOK_BUSY_MS, HOOK_SPOOL_DIR, SPOOL_CLAIM_STALE_MS, SPOOL_DRAIN_MS, SQLITE_BUSY_CODE, SQLITE_PRIMARY_CODE_MASK,
} from "../contracts/constants.ts";
import type { Chunk, DbHandle, NewJournalRow, ProjectContext } from "../contracts/types.ts";
import { metaGet, metaSet, openDb, withWrite } from "../store/db.ts";
import { appendEvent } from "../journal/append.ts";
import { deleteChunkRows, insertChunks, insertUnits, reserveSource, type SourceDraft } from "../store/fts.ts";
import { chunkText } from "../index/chunk.ts";
import { buildUnits } from "../index/units.ts";

/** One hook write. "row": a journal row and the time the hook took it. "src": a text to index as one source; id is
 * the reserved source row (null: not written yet), max the chunk size, units whether line units are written too. */
export type SpoolOp =
  | { t: "row"; row: NewJournalRow; at: number }
  | { t: "src"; id: number | null; src: SourceDraft; text: string; max: number; units: boolean }
  | { t: "seen"; key: string; add: Array<number | string> };

// D-1401-SEEN-SPOOL-1: a "seen" op (recall's sent-once list) carries this tag in its file name, so readSeen reads
// only those small files back, never an output text.
const SEEN_TAG = ".seen";

const OP_SUFFIX = ".json";
const CLAIM_SUFFIX = ".claim";
const TMP_SUFFIX = ".tmp";
const BAD_SUFFIX = ".bad";
const NAME_TIME_DIGITS = 15;
const NAME_SEQ_DIGITS = 6;
let nameSeq = 0;

export function isBusy(err: unknown): boolean {
  const code = (err as { errcode?: unknown } | null)?.errcode;
  return typeof code === "number" && (code & SQLITE_PRIMARY_CODE_MASK) === SQLITE_BUSY_CODE;
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** The project store with the hook's short lock wait. */
export async function hookDb(project: ProjectContext): Promise<DbHandle> {
  const db = await openDb(project);
  db.raw.exec("PRAGMA busy_timeout = " + String(HOOK_BUSY_MS));
  return db;
}

function spoolDir(project: ProjectContext): string {
  return join(project.projectDir, HOOK_SPOOL_DIR);
}

/** Write `op` to the spool: a private .tmp name first, then one rename, so a reader never sees half a file. */
export function spool(project: ProjectContext, op: SpoolOp): void {
  const dir = spoolDir(project);
  mkdirSync(dir, { recursive: true });
  const name = String(Date.now()).padStart(NAME_TIME_DIGITS, "0") + "-" + String(process.pid) + "-" + String(nameSeq++).padStart(NAME_SEQ_DIGITS, "0");
  const tmp = join(dir, name + TMP_SUFFIX);
  writeFileSync(tmp, JSON.stringify(op));
  renameSync(tmp, join(dir, name + (op.t === "seen" ? SEEN_TAG : "") + OP_SUFFIX));
}

// Apply one op. cur.op follows the work: once the source row is reserved, cur.op carries its id, so a busy
// lock after that spools the rest under the same id (the handle the model got stays valid).
function runOp(db: DbHandle, op: SpoolOp, chunks: Chunk[] | undefined, cur: { op: SpoolOp }): number | null {
  if (op.t === "row") {
    appendEvent(db, op.row, op.at);
    return null;
  }
  if (op.t === "seen") {
    // A union with what the meta row holds: two writers of one list both land, in any order.
    withWrite(db, (h) => {
      const have = parseList(metaGet(h, op.key));
      const add = op.add.filter((v) => !have.includes(v));
      if (add.length > 0) metaSet(h, op.key, JSON.stringify([...have, ...add]));
    });
    return null;
  }
  const c = chunks ?? chunkText(op.text, "text", op.max);
  let id = op.id;
  if (id === null) {
    id = reserveSource(db, op.src, c);
    cur.op = { ...op, id };
  } else if (chunks === undefined) {
    // A spooled finish: the source may hold part of its chunks from the busy try, and a purge may have removed it.
    const sid = id;
    const gone = withWrite(db, (h) => {
      if (h.raw.prepare("SELECT 1 AS x FROM sources WHERE id = ?").get(sid) === undefined) return true;
      deleteChunkRows(h.raw, { sourceId: sid });
      return false;
    });
    if (gone) return null;
  }
  try {
    insertChunks(db, id, op.src, c);
    if (op.units) insertUnits(db, id, op.src.sessionId, buildUnits(op.text));
  } catch (err) {
    // A busy lock keeps the reserved row: the spooled finish clears its partial chunks and writes them again.
    if (isBusy(err)) throw err;
    const sid = id;
    withWrite(db, (h) => { // D-R4-RESERVE-1: no 0-chunk orphan; this removes what landed
      deleteChunkRows(h.raw, { sourceId: sid });
      h.raw.prepare("DELETE FROM sources WHERE id = ?").run(sid);
    });
    throw err;
  }
  return id;
}

function parseList(value: string | null): Array<number | string> {
  if (value === null) return [];
  try {
    const v = JSON.parse(value) as unknown;
    return Array.isArray(v) ? v.filter((x): x is number | string => typeof x === "number" || typeof x === "string") : [];
  } catch {
    return [];
  }
}

/**
 * D-1401-SEEN-SPOOL-1: the sent-once list of `key`, spooled entries first, then the meta row. A drain applies a file
 * before it unlinks it, so an entry is in one of the two at every point. Read-only: no lock wait.
 */
export function readSeen(project: ProjectContext, db: DbHandle, key: string): Array<number | string> {
  const out: Array<number | string> = [];
  const dir = spoolDir(project);
  let names: string[] = [];
  try {
    names = readdirSync(dir);
  } catch {
    // no spool dir: nothing waits
  }
  for (const name of names) {
    const base = name.endsWith(CLAIM_SUFFIX) ? name.slice(0, -CLAIM_SUFFIX.length) : name;
    if (!base.endsWith(SEEN_TAG + OP_SUFFIX)) continue;
    let op: SpoolOp | null = null;
    for (const n of [name, base + CLAIM_SUFFIX, base]) {
      try {
        op = JSON.parse(readFileSync(join(dir, n), "utf8")) as SpoolOp;
        break;
      } catch {
        // renamed by a drainer between readdir and read: try the other name; gone: it is in the meta row
      }
    }
    if (op !== null && op.t === "seen" && op.key === key) out.push(...op.add);
  }
  for (const v of parseList(metaGet(db, key))) if (!out.includes(v)) out.push(v);
  return out;
}

// D-1401-SEEN-SPOOL-1: the time until which this process takes the lock as busy. One hook run waits at most once
// (HOOK_BUSY_MS) for another writer's lock; its later detached writes in that window go to the spool at once.
let busyUntil = 0;

/** Apply `op` now; on a busy lock, spool what is left. Returns the source id of a "src" op when it is known. */
export function writeOrSpool(project: ProjectContext, db: DbHandle, op: SpoolOp, chunks?: Chunk[]): number | null {
  const cur = { op };
  try {
    return runOp(db, op, chunks, cur);
  } catch (err) {
    if (!isBusy(err)) throw err;
    busyUntil = Date.now() + HOOK_BUSY_MS;
    spool(project, cur.op);
    return cur.op.t === "src" ? cur.op.id : null;
  }
}

/** Fire-and-forget hook write: drain the spool, then apply `op` (or spool it). Never throws, never rejects. */
export function writeDetached(project: ProjectContext, op: SpoolOp, what: string, chunks?: Chunk[]): void {
  void (async () => {
    try {
      const db = await hookDb(project);
      if (Date.now() < busyUntil) {
        spool(project, op);
      } else if (drain(project, db)) {
        busyUntil = Date.now() + HOOK_BUSY_MS;
        spool(project, op); // the lock is busy: the row waits behind the older ones
      } else {
        writeOrSpool(project, db, op, chunks);
      }
    } catch (err) {
      try {
        if (!isBusy(err)) throw err;
        busyUntil = Date.now() + HOOK_BUSY_MS;
        spool(project, op);
      } catch (e) {
        process.stderr.write("hooks: " + what + " write failed: " + message(e) + "\n");
      }
    }
  })();
}

// Take one spool file for this process: one rename, so two drainers never apply the same file. A claim older than
// SPOOL_CLAIM_STALE_MS belongs to a hook the host killed; it goes back to the queue first.
function claim(dir: string, name: string): string | null {
  let base = name;
  if (name.endsWith(OP_SUFFIX + CLAIM_SUFFIX)) {
    const path = join(dir, name);
    try {
      if (Date.now() - statSync(path).mtimeMs < SPOOL_CLAIM_STALE_MS) return null;
      base = name.slice(0, -CLAIM_SUFFIX.length);
      renameSync(path, join(dir, base));
    } catch {
      return null;
    }
  } else if (!name.endsWith(OP_SUFFIX)) {
    return null;
  }
  const claimed = join(dir, base + CLAIM_SUFFIX);
  try {
    renameSync(join(dir, base), claimed);
    const now = new Date();
    utimesSync(claimed, now, now);
    return claimed;
  } catch {
    return null;
  }
}

/**
 * Apply the pending spool files, oldest first, for at most SPOOL_DRAIN_MS. Returns true when the lock is busy
 * (the file goes back to the queue and the drain stops), false otherwise.
 */
export function drain(project: ProjectContext, db: DbHandle): boolean {
  const dir = spoolDir(project);
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return false; // no spool dir: nothing waits
  }
  const start = Date.now();
  for (const name of names.sort()) {
    if (Date.now() - start > SPOOL_DRAIN_MS) return false;
    const claimed = claim(dir, name);
    if (claimed === null) continue;
    const base = claimed.slice(0, -CLAIM_SUFFIX.length);
    let op: SpoolOp;
    try {
      op = JSON.parse(readFileSync(claimed, "utf8")) as SpoolOp;
    } catch (err) {
      process.stderr.write("hooks: pending write unreadable: " + message(err) + "\n");
      renameSync(claimed, base + BAD_SUFFIX); // kept on disk, never applied twice
      continue;
    }
    const cur = { op };
    try {
      runOp(db, op, undefined, cur);
    } catch (err) {
      if (isBusy(err)) {
        if (cur.op === op) {
          renameSync(claimed, base);
        } else {
          writeFileSync(base + TMP_SUFFIX, JSON.stringify(cur.op));
          renameSync(base + TMP_SUFFIX, base);
          unlinkSync(claimed);
        }
        return true;
      }
      process.stderr.write("hooks: pending write failed: " + message(err) + "\n");
      renameSync(claimed, base + BAD_SUFFIX);
      continue;
    }
    unlinkSync(claimed);
  }
  return false;
}
