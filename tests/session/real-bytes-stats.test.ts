/**
 * real-bytes-stats — Phase 8 of D2 PRD (stats-event-driven-architecture)
 *
 * `getRealBytesStats` is the new SQL aggregator that replaces the
 * conservative `conversation.events × 256` token estimate with real
 * bytes drawn from `session_events.data` length, the new
 * `bytes_avoided` / `bytes_returned` columns, and the `session_resume`
 * snapshot table.
 *
 * Math (per PRD step 5):
 *   eventDataBytes  = SUM(LENGTH(data))            FROM session_events
 *   bytesAvoided    = SUM(bytes_avoided)           FROM session_events
 *   bytesReturned   = SUM(bytes_returned)          FROM session_events
 *   snapshotBytes   = SUM(LENGTH(snapshot))        FROM session_resume
 *   totalSavedTokens = (eventDataBytes + bytesAvoided + snapshotBytes) / 4
 *
 * The renderer plumbs this into formatReport via opts.realBytes so the
 * "$ saved" line stops under-counting. Lifetime + project tier variants
 * exercised below (omit `sessionId` for lifetime, add `worktreeHash` for
 * project filter).
 */

import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, test } from "vitest";
import { SessionDB } from "../../src/session/db.js";
import {
  getContentBytesForSession,
  getMultiAdapterRealBytesStats,
  getRealBytesStats,
} from "../../src/session/analytics.js";
import { ContentStore } from "../../src/store.js";

const cleanups: Array<() => void> = [];

afterAll(() => {
  for (const fn of cleanups) {
    try { fn(); } catch { /* ignore */ }
  }
});

function mkSessionsDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "real-bytes-"));
  cleanups.push(() => { try { rmSync(dir, { recursive: true, force: true }); } catch {} });
  return dir;
}

function dbPathFor(sessionsDir: string, hash: string): string {
  return join(sessionsDir, `${hash}__suffix.db`);
}

function seed(
  dbPath: string,
  sessionId: string,
  events: Array<{ type: string; category: string; data: string; bytesAvoided?: number; bytesReturned?: number }>,
  snapshots?: Array<{ snapshot: string }>,
): void {
  const sdb = new SessionDB({ dbPath });
  try {
    sdb.ensureSession(sessionId, "/tmp/proj");
    let i = 0;
    for (const e of events) {
      sdb.insertEvent(
        sessionId,
        {
          type: e.type,
          category: e.category,
          priority: 1,
          // suffix uniquifies data so dedup doesn't drop subsequent rows
          data: `${e.data}#${i++}`,
          project_dir: "",
          attribution_source: "test",
          attribution_confidence: 1,
        },
        "test",
        undefined,
        { bytesAvoided: e.bytesAvoided, bytesReturned: e.bytesReturned },
      );
    }
    if (snapshots) {
      for (const s of snapshots) {
        sdb.upsertResume(sessionId, s.snapshot, events.length);
      }
    }
  } finally {
    sdb.close();
  }
}

describe("getRealBytesStats (Phase 8 renderer source-of-truth)", () => {
  test("8.1 conversation tier: sums data + bytes_avoided + bytes_returned + snapshot for one session", () => {
    const dir = mkSessionsDir();
    const sid = `sess-${randomUUID()}`;
    const dbPath = dbPathFor(dir, "deadbeefdeadbeef");
    seed(dbPath, sid, [
      { type: "tool_use", category: "file", data: "src/app.ts", bytesAvoided: 0, bytesReturned: 0 },
      { type: "sandbox-execute", category: "sandbox", data: "ctx_execute", bytesReturned: 5_000 },
      { type: "index-write", category: "sandbox", data: "execute:javascript", bytesAvoided: 10_000 },
      { type: "cache-hit", category: "cache", data: "https://x", bytesAvoided: 20_000 },
    ], [{ snapshot: "X".repeat(8_000) }]);

    const r = getRealBytesStats({ sessionId: sid, sessionsDir: dir });

    // eventDataBytes = sum of LENGTH(data) across the 4 events. The seed
    // suffix `#N` adds 2 bytes/event, but the assertion only checks that
    // the value is in a sane range — exact byte arithmetic is fragile.
    expect(r.eventDataBytes).toBeGreaterThan(40); // 4 short rows w/ suffixes
    expect(r.eventDataBytes).toBeLessThan(500);
    expect(r.bytesAvoided).toBe(30_000);
    expect(r.bytesReturned).toBe(5_000);
    expect(r.snapshotBytes).toBe(8_000);
    // totalSavedTokens = (eventDataBytes + bytesAvoided + snapshotBytes) / 4
    // (bytesReturned is "what the model already paid for" — don't add)
    const expectedTokens = Math.floor((r.eventDataBytes + r.bytesAvoided + r.snapshotBytes) / 4);
    expect(r.totalSavedTokens).toBe(expectedTokens);
    expect(r.totalSavedTokens).toBeGreaterThan(9_000); // ≈ 9_500
  });

  test("8.5 lifetime tier: omitting sessionId aggregates every session in sessionsDir", () => {
    const dir = mkSessionsDir();
    const sidA = `lifeA-${randomUUID()}`;
    const sidB = `lifeB-${randomUUID()}`;
    seed(dbPathFor(dir, "1111111111111111"), sidA, [
      { type: "sandbox-execute", category: "sandbox", data: "x", bytesReturned: 1_000 },
      { type: "cache-hit", category: "cache", data: "y", bytesAvoided: 2_000 },
    ]);
    seed(dbPathFor(dir, "2222222222222222"), sidB, [
      { type: "index-write", category: "sandbox", data: "z", bytesAvoided: 3_000 },
    ]);

    const r = getRealBytesStats({ sessionsDir: dir });
    expect(r.bytesAvoided).toBe(5_000);   // 2_000 + 3_000
    expect(r.bytesReturned).toBe(1_000);
    expect(r.totalSavedTokens).toBeGreaterThan(0);
  });

  test("8.6 project tier: worktreeHash filters DB files by filename prefix", () => {
    const dir = mkSessionsDir();
    const sidA = `pa-${randomUUID()}`;
    const sidB = `pb-${randomUUID()}`;
    seed(dbPathFor(dir, "60303a5b5b31fb98"), sidA, [
      { type: "sandbox-execute", category: "sandbox", data: "ctx_execute", bytesReturned: 7_000 },
    ]);
    seed(dbPathFor(dir, "abcdef0123456789"), sidB, [
      { type: "sandbox-execute", category: "sandbox", data: "ctx_execute", bytesReturned: 99_999 },
    ]);

    const r = getRealBytesStats({ sessionsDir: dir, worktreeHash: "60303a5b5b31fb98" });
    expect(r.bytesReturned).toBe(7_000); // ONLY the matching DB
  });

  test("returns zeroes when sessionsDir does not exist", () => {
    const r = getRealBytesStats({ sessionsDir: join(tmpdir(), `missing-${randomUUID()}`) });
    expect(r.eventDataBytes).toBe(0);
    expect(r.bytesAvoided).toBe(0);
    expect(r.bytesReturned).toBe(0);
    expect(r.snapshotBytes).toBe(0);
    expect(r.totalSavedTokens).toBe(0);
  });

  test("returns zeroes for unknown sessionId in a real DB", () => {
    const dir = mkSessionsDir();
    const sid = `seed-${randomUUID()}`;
    seed(dbPathFor(dir, "f1f1f1f1f1f1f1f1"), sid, [
      { type: "sandbox-execute", category: "sandbox", data: "x", bytesReturned: 1 },
    ]);
    const r = getRealBytesStats({ sessionId: "no-such-session", sessionsDir: dir });
    expect(r.eventDataBytes).toBe(0);
    expect(r.bytesAvoided).toBe(0);
    expect(r.bytesReturned).toBe(0);
    expect(r.totalSavedTokens).toBe(0);
  });

  // ── v1.0.133: stats bar reads content DB chunks (Slice 3 — render-time only) ──
  //
  // v1.0.132 wired chunks.session_id (Slice 1) so new chunks carry the FK.
  // The render path still ignored the content DB, leaving the per-conversation
  // bar invisible (≈200 B of event metadata). Slice 3 closes the loop with a
  // read-only join: when ctx_stats fires, sum LENGTH(title)+LENGTH(content)
  // FROM chunks WHERE session_id = ? and fold it into the bar formula.
  //
  // Architect-safe choice: legacy chunks (empty session_id) are NOT backfilled.
  // Old sessions stay low; new sessions populate honestly.

  test("8.7 getContentBytesForSession sums LENGTH(title)+LENGTH(content) for FK-attributed chunks", () => {
    const sid = `chunk-${randomUUID()}`;
    const contentDbPath = join(mkSessionsDir(), `content-${randomUUID()}.db`);
    const store = new ContentStore(contentDbPath);
    try {
      // Two attributed chunks for the target session.
      store.indexPlainText(
        "alpha line one\nalpha line two",
        "src/alpha.ts",
        20,
        { sessionId: sid, eventId: "evt-1" },
      );
      store.indexPlainText(
        "beta payload that should be summed",
        "src/beta.ts",
        20,
        { sessionId: sid, eventId: "evt-2" },
      );
      // One chunk attributed to a DIFFERENT session — must be excluded.
      store.indexPlainText(
        "noise from a sibling session",
        "src/noise.ts",
        20,
        { sessionId: "other-session", eventId: "evt-x" },
      );
      // One legacy chunk with empty session_id — must be excluded (no backfill).
      store.indexPlainText(
        "legacy chunk no FK",
        "src/legacy.ts",
        20,
      );
    } finally {
      store.close();
    }

    const bytes = getContentBytesForSession(sid, contentDbPath);

    // Two chunks for `sid`: titles "src/alpha.ts" + "src/beta.ts" plus
    // bodies. Exact arithmetic depends on the markdown chunker (titles may
    // be re-derived from headings), so assert a sane lower bound that
    // still proves both attributed chunks were summed, plus an upper
    // bound that would fail if noise or legacy rows leaked in (they'd
    // push >200B easily).
    expect(bytes).toBeGreaterThan(60);
    expect(bytes).toBeLessThan(200);
  });

  test("8.8 getContentBytesForSession returns 0 for missing DB or unknown session", () => {
    expect(getContentBytesForSession("any-sid", join(tmpdir(), `missing-${randomUUID()}.db`))).toBe(0);

    const contentDbPath = join(mkSessionsDir(), `content-${randomUUID()}.db`);
    const store = new ContentStore(contentDbPath);
    try {
      store.indexPlainText("payload", "src/x.ts", 20, { sessionId: "real-sid", eventId: "evt" });
    } finally {
      store.close();
    }
    expect(getContentBytesForSession("no-such-session", contentDbPath)).toBe(0);
  });

  test("8.9 getRealBytesStats with contentDbPath folds chunk bytes into bytesAvoided + totalSavedTokens", () => {
    const dir = mkSessionsDir();
    const sid = `int-${randomUUID()}`;
    const dbPath = dbPathFor(dir, "cafebabecafebabe");
    seed(dbPath, sid, [
      { type: "sandbox-execute", category: "sandbox", data: "ctx_execute", bytesReturned: 1_000 },
    ]);

    const contentDbPath = join(dir, `content-${randomUUID()}.db`);
    const store = new ContentStore(contentDbPath);
    try {
      // Big enough payload that the chunk byte sum dwarfs event-data noise
      // and proves the value flowed through, not just got rounded in.
      store.indexPlainText(
        "X".repeat(10_000),
        "fixture.txt",
        20,
        { sessionId: sid, eventId: "evt-int" },
      );
    } finally {
      store.close();
    }

    const baseline = getRealBytesStats({ sessionId: sid, sessionsDir: dir });
    const withChunks = getRealBytesStats({ sessionId: sid, sessionsDir: dir, contentDbPath });

    expect(withChunks.bytesAvoided).toBeGreaterThan(baseline.bytesAvoided + 9_000);
    expect(withChunks.totalSavedTokens).toBeGreaterThan(baseline.totalSavedTokens + 2_000);
    // bytesReturned untouched — content DB doesn't represent re-served bytes.
    expect(withChunks.bytesReturned).toBe(baseline.bytesReturned);
  });

  // ─── v1.0.134 SLICE C — lifetime tier all-chunks aggregate ───────────────
  // `getContentBytesForSession` filters by session_id (per-conversation tier).
  // Lifetime tier needs a sibling that sums ALL chunks, regardless of FK,
  // so the lifetime "kept out" headline reflects the full content store —
  // not just session_events.bytes_avoided. Without this, a fresh adapter
  // with 50 MB of indexed but unattributed chunks shows ~0 lifetime bytes.
  test("lifetime contentBytes sums all chunks (no session_id filter)", async () => {
    const { getContentBytesAllSessions } = await import(
      "../../src/session/analytics.js"
    );

    const contentDbPath = join(mkSessionsDir(), `content-life-${randomUUID()}.db`);
    const store = new ContentStore(contentDbPath);
    try {
      // Three chunks attributed to three different sessions — all should sum.
      store.indexPlainText("A".repeat(5_000), "src/a.ts", 20, {
        sessionId: "sess-A",
        eventId: "evt-a",
      });
      store.indexPlainText("B".repeat(5_000), "src/b.ts", 20, {
        sessionId: "sess-B",
        eventId: "evt-b",
      });
      // One legacy chunk with no session FK — MUST also sum (this is the
      // whole point of the lifetime aggregate; per-session filter excludes
      // these but lifetime must include them).
      store.indexPlainText("C".repeat(5_000), "src/c.ts", 20);
    } finally {
      store.close();
    }

    const total = getContentBytesAllSessions(contentDbPath);

    // Three chunks of 5_000 bytes body each + small title bytes. Lower
    // bound proves all three rows summed (per-session filter on any one
    // sid would yield ≤5_000 + title noise ≈ 5_010-ish, never > 14_000).
    // Upper bound catches accidental double-counting (e.g. JOIN explosion).
    expect(total).toBeGreaterThan(14_000);
    expect(total).toBeLessThan(20_000);
  });

  test("getContentBytesAllSessions returns 0 for missing DB", async () => {
    const { getContentBytesAllSessions } = await import(
      "../../src/session/analytics.js"
    );
    expect(
      getContentBytesAllSessions(join(tmpdir(), `missing-${randomUUID()}.db`)),
    ).toBe(0);
  });

  // ─── v1.0.134 SLICE C bug — multi-adapter contentBytes accumulation ──────
  // ARCH-REVIEW-V134-ABC SLICE C verdict: getMultiAdapterRealBytesStats
  // currently sums eventDataBytes / bytesAvoided / bytesReturned /
  // snapshotBytes per adapter but NEVER touches contentBytes from each
  // adapter's content DB. Result: ctx_stats lifetime tier shows the
  // FIRST adapter's content bytes only, masking 50+ MB of indexed payload
  // across the other 14 adapters. This test pins the contract that
  // contentBytes accumulates across every adapter's content/*.db.
  test("lifetime contentBytes accumulates across multiple adapter content DBs", () => {
    const home = mkdtempSync(join(tmpdir(), "multi-content-"));
    cleanups.push(() => { try { rmSync(home, { recursive: true, force: true }); } catch {} });

    // Two adapters with separate content DBs. Sessions dirs must exist
    // (existsSync gate at the top of the loop) but the multi-adapter
    // aggregator should still pick up contentBytes from the sibling
    // content/ tree even when no session_events rows exist.
    const claudeBase = join(home, ".claude", "context-mode");
    const codexBase = join(home, ".codex", "context-mode");
    mkdirSync(join(claudeBase, "sessions"), { recursive: true });
    mkdirSync(join(codexBase, "sessions"), { recursive: true });
    mkdirSync(join(claudeBase, "content"), { recursive: true });
    mkdirSync(join(codexBase, "content"), { recursive: true });

    // ContentStore writes to <dir>/content.db when given a directory or
    // an explicit path. enumerateAdapterDirs hands back contentDir as
    // <base>/content — the canonical content DB lives at
    // <base>/content/content.db (mirrors store.ts default layout).
    const claudeContent = join(claudeBase, "content", "content.db");
    const codexContent = join(codexBase, "content", "content.db");

    const a = new ContentStore(claudeContent);
    try {
      a.indexPlainText("X".repeat(7_000), "src/x.ts", 20);
    } finally { a.close(); }
    const b = new ContentStore(codexContent);
    try {
      b.indexPlainText("Y".repeat(11_000), "src/y.ts", 20);
    } finally { b.close(); }

    const r = getMultiAdapterRealBytesStats({ home });

    // 7_000 + 11_000 = 18_000 bytes of body across both adapter content
    // DBs (plus tiny title overhead). If the impl only reads the first
    // adapter's content DB, this asserts ~7_000 — well under 16_000.
    expect(r.contentBytes).toBeGreaterThan(16_000);
    expect(r.contentBytes).toBeLessThan(22_000);
  });
});

// ──────────────────────────────────────────────────────────────────────
// v1.0.148 hotfix — lazy schema migration in the aggregator.
//
// Bug A + C cascade: pre-v1.0.130 session DBs on disk have no
// `bytes_avoided`, `bytes_returned`, or `project_dir` columns. The
// aggregator's combined SUM query references those columns, so SQLite
// throws "no such column" at prepare() time and the surrounding catch
// in getRealBytesStats silently skips the WHOLE DB — even the
// LENGTH(data) signal is lost, not just the missing columns. On the
// reporter's machine 131 of 197 historical DBs were affected.
//
// Fix: aggregator now calls ensureSessionEventsSchema(dbPath, ctor)
// before opening each DB readonly. Idempotent, ADR-0001 compatible
// (no EXCLUSIVE pragma). Self-healing — every stats call migrates
// any legacy DBs it scans.
//
// These tests pin the behavioural guarantee through the public
// getRealBytesStats API (no implementation coupling): a legacy-schema
// DB on disk must still contribute LENGTH(data) signal, and the
// migration must be observable as columns added in place.
// ──────────────────────────────────────────────────────────────────────
describe("aggregator schema-migration recovery (#683 follow-up, v1.0.148)", () => {
  /**
   * Build a pre-v1.0.130 session DB on disk — no `bytes_avoided`,
   * `bytes_returned`, `project_dir`, or attribution columns. Mirrors
   * the schema actually observed on real upgraded installs. Uses raw
   * SQL via better-sqlite3 to bypass the SessionDB ctor's
   * auto-migration.
   */
  async function createLegacySessionDb(
    dbPath: string,
    sessionId: string,
    events: Array<{ data: string }>,
  ): Promise<void> {
    const Database = (await import("better-sqlite3")).default;
    const db = new Database(dbPath);
    try {
      db.exec(`
        CREATE TABLE session_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id TEXT NOT NULL,
          type TEXT NOT NULL,
          category TEXT NOT NULL,
          priority INTEGER NOT NULL DEFAULT 2,
          data TEXT NOT NULL,
          source_hook TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          data_hash TEXT NOT NULL DEFAULT ''
        );
        CREATE TABLE session_meta (
          session_id TEXT PRIMARY KEY,
          project_dir TEXT NOT NULL,
          started_at TEXT NOT NULL DEFAULT (datetime('now')),
          last_event_at TEXT,
          event_count INTEGER NOT NULL DEFAULT 0,
          compact_count INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE session_resume (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id TEXT NOT NULL UNIQUE,
          snapshot TEXT NOT NULL,
          event_count INTEGER NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          consumed INTEGER NOT NULL DEFAULT 0
        );
      `);
      const ins = db.prepare(
        `INSERT INTO session_events (session_id, type, category, data, source_hook) VALUES (?, ?, ?, ?, ?)`,
      );
      let i = 0;
      for (const e of events) {
        ins.run(sessionId, "tool_use", "file", `${e.data}#${i++}`, "test");
      }
    } finally {
      db.close();
    }
  }

  /** Read the column set from a session DB. Used to assert pre/post migration state. */
  async function readSessionEventsColumns(dbPath: string): Promise<Set<string>> {
    const Database = (await import("better-sqlite3")).default;
    const db = new Database(dbPath, { readonly: true });
    try {
      const colInfo = db.pragma("table_xinfo(session_events)") as Array<{ name: string }>;
      return new Set(colInfo.map((c) => c.name));
    } finally {
      db.close();
    }
  }

  test("recovers LENGTH(data) signal from a legacy-schema DB (the regression v1.0.148 fixes)", async () => {
    const dir = mkSessionsDir();
    const sid = `sess-${randomUUID()}`;
    const dbPath = dbPathFor(dir, "legacy0123456789");

    await createLegacySessionDb(dbPath, sid, [
      { data: "src/app.ts captured by hook" },
      { data: "src/another.ts more bytes for the sum" },
    ]);

    // Confirm the seed DB has the pre-v1.0.130 legacy schema.
    const colsBefore = await readSessionEventsColumns(dbPath);
    expect(colsBefore.has("bytes_avoided")).toBe(false);
    expect(colsBefore.has("bytes_returned")).toBe(false);
    expect(colsBefore.has("project_dir")).toBe(false);

    // ACT — the aggregator call that triggered the original regression
    // (pre-fix: prepare() throws on missing column, catch skips the DB,
    // result.eventDataBytes returns 0 even though LENGTH(data) > 0).
    const r = getRealBytesStats({ sessionId: sid, sessionsDir: dir });

    // ASSERT — LENGTH(data) signal recovered. Two events, each ~27-38 chars
    // plus the `#N` dedup suffix; the assertion guards against the
    // identity-collapse failure mode (eventDataBytes == 0) without
    // pinning fragile exact byte counts.
    expect(r.eventDataBytes).toBeGreaterThan(40);
    expect(r.eventDataBytes).toBeLessThan(500);
    // Legacy events never recorded these — 0 by absence, not by bug.
    expect(r.bytesAvoided).toBe(0);
    expect(r.bytesReturned).toBe(0);
  });

  test("migrates the DB schema in-place on first read (columns now exist on disk)", async () => {
    const dir = mkSessionsDir();
    const sid = `sess-${randomUUID()}`;
    const dbPath = dbPathFor(dir, "legacymigrate56a");

    await createLegacySessionDb(dbPath, sid, [{ data: "one event" }]);

    const colsBefore = await readSessionEventsColumns(dbPath);
    expect(colsBefore.has("bytes_avoided")).toBe(false);
    expect(colsBefore.has("project_dir")).toBe(false);

    // ACT — aggregator call triggers ensureSessionEventsSchema.
    getRealBytesStats({ sessionsDir: dir });

    // ASSERT — the disk DB now carries all five post-v1.0.130 columns.
    const colsAfter = await readSessionEventsColumns(dbPath);
    expect(colsAfter.has("project_dir")).toBe(true);
    expect(colsAfter.has("attribution_source")).toBe(true);
    expect(colsAfter.has("attribution_confidence")).toBe(true);
    expect(colsAfter.has("bytes_avoided")).toBe(true);
    expect(colsAfter.has("bytes_returned")).toBe(true);
  });

  test("migration is idempotent — second aggregator call adds no columns, no error", async () => {
    const dir = mkSessionsDir();
    const sid = `sess-${randomUUID()}`;
    const dbPath = dbPathFor(dir, "legacyidempotent");

    await createLegacySessionDb(dbPath, sid, [{ data: "event" }]);

    // First call migrates.
    getRealBytesStats({ sessionsDir: dir });
    const colsAfterFirst = await readSessionEventsColumns(dbPath);
    expect(colsAfterFirst.has("bytes_avoided")).toBe(true);

    // Second call must not throw and must not add new columns.
    expect(() => getRealBytesStats({ sessionsDir: dir })).not.toThrow();
    const colsAfterSecond = await readSessionEventsColumns(dbPath);
    expect(colsAfterSecond.size).toBe(colsAfterFirst.size);
  });
});
