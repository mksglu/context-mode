// impl/02 §11, impl/00 §4 signatures (DEVIATIONS D-M1-1: null for a missing seq, optional kind kept).
// Read-only: WAL readers never block on BEGIN IMMEDIATE writers, so no transaction here.
import type { DbHandle, EventKind, JournalRow } from "../contracts/types.ts";

/**
 * Rows of one session in seq order, optionally of one kind. An empty or unknown session id
 * returns []; never a "latest session" fallback (ADR-0009 §2, DECISIONS-r9 F4, PR #398).
 */
export function readSessionEvents(db: DbHandle, sessionId: string, kind?: EventKind): JournalRow[] {
  if (sessionId === "") return [];
  if (kind === undefined) {
    return db.raw
      .prepare("SELECT * FROM events WHERE session_id = ? ORDER BY seq ASC")
      .all(sessionId) as unknown as JournalRow[];
  }
  return db.raw
    .prepare("SELECT * FROM events WHERE session_id = ? AND kind = ? ORDER BY seq ASC")
    .all(sessionId, kind) as unknown as JournalRow[];
}

/** Primary-key read behind ctx_resume(seq:N) (ADR-0009 §4). A missing row is null, never a throw. */
export function readEventBySeq(db: DbHandle, seq: number): JournalRow | null {
  const row = db.raw.prepare("SELECT * FROM events WHERE seq = ?").get(seq);
  return row === undefined ? null : (row as unknown as JournalRow);
}

/** D-M7-SV-5: body of the newest prompt row of one session, or "" when there is none. */
export function readLastPrompt(db: DbHandle, sessionId: string): string {
  if (sessionId === "") return "";
  const row = db.raw
    .prepare("SELECT body FROM events WHERE session_id = ? AND kind = 'prompt' ORDER BY seq DESC LIMIT 1")
    .get(sessionId) as { body: string } | undefined;
  return row === undefined ? "" : row.body;
}

/** r3-ledger: the session goal, read as the first prompt of the session ("" when none). */
export function readFirstPrompt(db: DbHandle, sessionId: string): string {
  if (sessionId === "") return "";
  const row = db.raw
    .prepare("SELECT body FROM events WHERE session_id = ? AND kind = 'prompt' ORDER BY seq ASC LIMIT 1")
    .get(sessionId) as { body: string } | undefined;
  return row === undefined ? "" : row.body;
}

/**
 * DECISIONS-r11 (B): recall candidates, newest first. This session's rows plus the same worktree's rows of
 * prior sessions (ADR-0009 §8 rule 2: always filter by the current worktree). Cost rows carry no text.
 */
export function readRecallRows(db: DbHandle, sessionId: string, worktree: string, limit: number): JournalRow[] {
  if (sessionId === "") return [];
  return db.raw
    .prepare("SELECT * FROM events WHERE kind <> 'cost' AND (session_id = ? OR worktree = ?) ORDER BY seq DESC LIMIT ?")
    .all(sessionId, worktree, limit) as unknown as JournalRow[];
}

/** D-FU-GCH-2: true when this worktree holds at least one journal row written by this agent. */
export function hasAgentRows(db: DbHandle, worktree: string, agent: string): boolean {
  return db.raw.prepare("SELECT 1 FROM events WHERE worktree = ? AND agent = ? LIMIT 1").get(worktree, agent) !== undefined;
}

/** D-FU-GCH-2: true when this session already holds a journal row (so this is not its first turn). */
export function hasSessionRows(db: DbHandle, sessionId: string): boolean {
  return db.raw.prepare("SELECT 1 FROM events WHERE session_id = ? LIMIT 1").get(sessionId) !== undefined;
}
