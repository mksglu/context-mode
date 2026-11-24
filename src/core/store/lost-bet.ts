// D-0027-LOSTBET-1 (ADR-0027 D3, RC4, FR5, AC4-AC6, 10.6, 10.7, 12): the per-session memory of a lost bet. Every read is
// one primary-key lookup on meta; a mark write that fails (a busy lock) leaves the bet as today and never blocks a tool.
import { BET_META_PREFIX, LOSTBET_META_PREFIX, MCP_SERVER_TOOL_PREFIX, SUBAGENT_SOURCE_PREFIX } from "../contracts/constants.ts";
import type { DbHandle } from "../contracts/types.ts";
import { metaGet, metaSet, withWrite } from "./db.ts";

export type LostBetReason = "ranged-read" | "ordered-read";

function lostKey(sessionId: string, key: string): string {
  return LOSTBET_META_PREFIX + sessionId + ":" + key;
}

/** One indexed lookup: was the bet on this tool key lost in this session? */
export function isLostBet(db: DbHandle, sessionId: string, key: string): boolean {
  return sessionId !== "" && metaGet(db, lostKey(sessionId, key)) !== null;
}

export function markLostBet(db: DbHandle, sessionId: string, key: string, reason: LostBetReason, source: string): void {
  if (sessionId === "" || key === "") return;
  try {
    metaSet(db, lostKey(sessionId, key), JSON.stringify({ at: Date.now(), reason, source }));
  } catch {
    // ADR-0027 section 12: the mark is lost, the next output with this key is a bet again
  }
}

/** Case b: a full Read of this file was replaced in this session (one indexed lookup). */
export function hasBet(db: DbHandle, sessionId: string, key: string): boolean {
  return sessionId !== "" && metaGet(db, BET_META_PREFIX + sessionId + ":" + key) !== null;
}

export function noteBet(db: DbHandle, sessionId: string, key: string, source: string): void {
  if (sessionId === "" || key === "") return;
  try {
    metaSet(db, BET_META_PREFIX + sessionId + ":" + key, source);
  } catch {
    // ADR-0027 section 12: no note, so a later ranged Read of this file marks nothing
  }
}

/** ADR-0027 10.6: a compaction ends Passing. One range delete on the meta primary key (":" + 1 is ";"). */
export function clearLostBets(db: DbHandle, sessionId: string): void {
  if (sessionId === "") return;
  const lo = LOSTBET_META_PREFIX + sessionId + ":";
  const hi = LOSTBET_META_PREFIX + sessionId + ";";
  const run = (h: DbHandle): void => {
    h.raw.prepare("DELETE FROM meta WHERE key >= ? AND key < ?").run(lo, hi);
  };
  if (db.raw.isTransaction) run(db);
  else withWrite(db, run);
}

/** The tool key a main-session source label carries: the label without its "#<call id>" tail (dispatch mainLabel).
 * A shell label keeps the command; an MCP label keeps server + tool. Any other label (a Read, whose label holds no
 * path, a subagent label) has no key here: a Read is marked by the hook (case b). */
export function betKeyOfLabel(label: string): string | null {
  if (label.startsWith(SUBAGENT_SOURCE_PREFIX)) return null;
  const hash = label.lastIndexOf("#");
  if (hash <= 0) return null;
  const stem = label.slice(0, hash);
  const colon = stem.indexOf(":");
  if (colon <= 0) return null;
  if (colon + 1 < stem.length || stem.startsWith(MCP_SERVER_TOOL_PREFIX)) return stem;
  return null;
}
