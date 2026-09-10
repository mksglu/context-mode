/**
 * Regression: cleanupOldSessions must not evict sessions that are old but
 * still actively used.
 *
 * Reported in #1140: `getOldSessions` selected on `session_meta.started_at`,
 * which `INSERT OR IGNORE` sets once at first insert and never refreshes. A
 * session continuously used via `--continue`/`--resume` for more than
 * maxAgeDays therefore had its entire history wiped by the next SessionStart
 * cleanup sweep from ANY session sharing the per-project DB — even though the
 * session was never abandoned.
 *
 * The fix keys the TTL off last activity:
 *   COALESCE(last_event_at, started_at)
 * so the horizon is a sliding idle-window. `last_event_at` is maintained by
 * `updateMetaLastEvent` on every event insert; `started_at` remains the
 * fallback for sessions that recorded no events yet.
 *
 * Test strategy: seed three sessions, backdate timestamps via raw SQL, run
 * cleanupOldSessions(7), and assert survival/eviction. Re-running this
 * against the unfixed code MUST fail (proves the bug: the active-old session
 * is evicted). Modeled on cleanup-preserves-live-uuid-events.test.ts.
 */

import { afterAll, describe, expect, test } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import { SessionDB } from "../../src/session/db.js";

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) {
    try { fn(); } catch { /* ignore cleanup errors */ }
  }
});

function createTestDB(): SessionDB {
  const dbPath = join(tmpdir(), `cleanup-active-${randomUUID()}.db`);
  const db = new SessionDB({ dbPath });
  cleanups.push(() => db.cleanup());
  return db;
}

function makeEvent(data: string) {
  return {
    type: "file",
    category: "file",
    data,
    priority: 2,
    data_hash: "",
  };
}

/**
 * Backdate session_meta timestamps for one session.
 * `lastEventDaysAgo === null` leaves last_event_at untouched
 * (null for event-less rows, "now" for rows touched by insertEvent).
 */
function backdate(db: SessionDB, sessionId: string, startedDaysAgo: number, lastEventDaysAgo: number | null) {
  if (lastEventDaysAgo === null) {
    db.db
      .prepare(`UPDATE session_meta SET started_at = datetime('now', ? || ' days') WHERE session_id = ?`)
      .run(`-${startedDaysAgo}`, sessionId);
  } else {
    db.db
      .prepare(
        `UPDATE session_meta
          SET started_at = datetime('now', ? || ' days'),
              last_event_at = datetime('now', ? || ' days')
         WHERE session_id = ?`,
      )
      .run(`-${startedDaysAgo}`, `-${lastEventDaysAgo}`, sessionId);
  }
}

describe("cleanupOldSessions evicts on inactivity, not creation age (#1140)", () => {
  test("active session older than maxAgeDays survives; idle one is evicted", () => {
    const db = createTestDB();

    const activeOld = randomUUID(); // started 10d ago, last event NOW (the #1140 repro)
    const idleOld = randomUUID(); // started 10d ago, last event 10d ago
    const fresh = randomUUID(); // started now

    for (const id of [activeOld, idleOld, fresh]) {
      // Hooks call ensureSession before insertEvent; insertEvent alone does
      // not create the meta row (it only updates meta "if session exists").
      db.ensureSession(id, "/project");
      db.insertEvent(id, makeEvent(`/project/${id}.ts`), "PostToolUse", { projectDir: "/project" });
    }

    backdate(db, activeOld, 10, null); // keep last_event_at = now (set by insertEvent)
    backdate(db, idleOld, 10, 10);
    backdate(db, fresh, 0, null);

    const deleted = db.cleanupOldSessions(7);

    expect(deleted).toBe(1);
    expect(db.db.prepare(`SELECT session_id FROM session_meta WHERE session_id = ?`).get(activeOld)).toBeTruthy();
    expect(db.db.prepare(`SELECT session_id FROM session_meta WHERE session_id = ?`).get(idleOld)).toBeUndefined();
    expect(db.db.prepare(`SELECT session_id FROM session_meta WHERE session_id = ?`).get(fresh)).toBeTruthy();

    // The surviving active session keeps its events — the history-wipe from #1140.
    expect(db.getEvents(activeOld, { limit: 10 }).length).toBe(1);
  });

  test("session with no events yet falls back to started_at", () => {
    const db = createTestDB();

    // ensureSession-style row with no events: last_event_at stays NULL.
    const lonely = randomUUID();
    db.db
      .prepare(`INSERT OR IGNORE INTO session_meta (session_id, project_dir) VALUES (?, '/project')`)
      .run(lonely);
    backdate(db, lonely, 10, null); // NULL last_event_at

    const deleted = db.cleanupOldSessions(7);

    expect(deleted).toBe(1);
    expect(db.db.prepare(`SELECT session_id FROM session_meta WHERE session_id = ?`).get(lonely)).toBeUndefined();
  });
});
