// impl/09 §3 (appendDetached), A21; 00 rule "Journal writes from hooks are detached" (GP3, A32);
// DEVIATIONS D-M3-H1-3, D-1401-SPOOL-1.
import type { NewJournalRow, ProjectContext } from "../contracts/types.ts";
import { writeDetached } from "./spool.ts";

/**
 * Fire-and-forget journal append. Returns before the row is written; never throws, never rejects.
 * `sessionId` is the session the row belongs to; the row itself carries it in `session_id`.
 * D-1401-SPOOL-1: the write waits at most HOOK_BUSY_MS for the lock; a busy lock puts the row in the project
 * spool with the time the hook took it, and the next hook write that gets the lock applies it. No closeDb (A21).
 */
export function appendDetached(project: ProjectContext, sessionId: string, row: NewJournalRow): void {
  void sessionId;
  writeDetached(project, { t: "row", row, at: Date.now() }, "journal");
}
