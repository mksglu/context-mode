// impl/09 §2 (shouldHint), A20, A24; DECISIONS-r9 E5; impl/08 §6.1 step 8 (everyN for the mcp key family);
// DEVIATIONS D-M3-H1-1..3.
// The marker is one meta row "hint:" + sessionId + ":" + onceKey. Keyed by session id only: no ppid,
// no "latest session" guess. A PreToolUse call may touch meta (A24), never the journal.
import { metaGet, metaSet, withWrite } from "../store/db.ts";
import type { DbHandle } from "../contracts/types.ts";

function markerKey(sessionId: string, onceKey: string): string {
  return "hint:" + sessionId + ":" + onceKey;
}

// §2.2 step 3: a plain once-per-session key fires only when its row does not exist yet.
function takeOnce(db: DbHandle, key: string): boolean {
  if (metaGet(db, key) !== null) return false;
  metaSet(db, key, "1");
  return true;
}

// §2.2 step 2: count-based key; fires on calls 1, 1+N, 1+2N, ... (D-M3-H1-2).
function takeEvery(db: DbHandle, key: string, everyN: number): boolean {
  const stored = metaGet(db, key);
  const count = (stored === null ? 0 : Number.parseInt(stored, 10)) + 1;
  metaSet(db, key, String(count));
  return (count - 1) % everyN === 0;
}

/**
 * True when the hint for (sessionId, onceKey) fires on this call. Without everyN the key fires once
 * per session; with everyN (the mcp family, MCP_HINT_EVERY) it re-fires every everyN calls.
 * Joins the caller's open write transaction (§2.2 step 4); otherwise runs its own BEGIN IMMEDIATE so
 * the read and the write of the marker are one step across processes.
 * An empty session id returns false and writes nothing (E5, D-M3-H1-1).
 */
export function shouldHint(db: DbHandle, sessionId: string, onceKey: string, everyN?: number): boolean {
  if (sessionId === "") return false;
  const key = markerKey(sessionId, onceKey);
  const decide = (h: DbHandle): boolean => (everyN === undefined ? takeOnce(h, key) : takeEvery(h, key, everyN));
  return db.raw.isTransaction ? decide(db) : withWrite(db, decide);
}
