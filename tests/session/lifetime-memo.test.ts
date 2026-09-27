/**
 * lifetime-memo — the per-file memo inside `getLifetimeStats()`.
 *
 * The win is a cost win, so the cost assertions (how many sidecars were REOPENED) matter
 * as much as the value ones. A test that only checks the total stays green with the memo
 * ripped out entirely, which is why it proves nothing on its own.
 *
 * The case that names this file is WAL: the LIVE session's sidecar is the only one that
 * changes, and in WAL mode the write lands in `<db>-wal` without touching the `.db`. A
 * memo keyed on the `.db` alone serves a frozen count for the session doing the work.
 */

import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync, statSync, existsSync, utimesSync, writeFileSync, copyFileSync, symlinkSync } from "node:fs";
import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { SessionDB } from "../../src/session/db.js";
import { getLifetimeStats, resetLifetimeMemo, lifetimeMemoSize, lifetimeScanCounts } from "../../src/session/analytics.js";
import { loadDatabase } from "../../src/db-base.js";

const cleanups: Array<() => void> = [];
afterAll(() => { for (const fn of cleanups) { try { fn(); } catch { /* ignore */ } } });

beforeEach(() => { resetLifetimeMemo(); });

function tmpDir(prefix: string): string {
  const dir = join(tmpdir(), `${prefix}-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

const event = (data: string) => ({ type: "file", category: "file", data, priority: 2, data_hash: "" });

/** A sidecar with `n` events in one session. Returns the path, leaves the handle open. */
function seed(dir: string, name: string, n: number): { db: SessionDB; filePath: string } {
  const filePath = join(dir, `${name}.db`);
  const db = new SessionDB({ dbPath: filePath });
  cleanups.push(() => { try { db.cleanup(); } catch { /* already closed */ } });
  db.ensureSession(`s-${name}`, `/p/${name}`);
  for (let i = 0; i < n; i++) db.insertEvent(`s-${name}`, event(`/p/${name}/${i}.ts`), "PostToolUse");
  return { db, filePath };
}

/** Wraps the real ctor, counting how many times a sidecar was OPENED. */
function spyCtor() {
  const Real = loadDatabase() as unknown as new (p: string, o: unknown) => unknown;
  const opens: string[] = [];
  const Spy = function (this: unknown, p: string, o: unknown) {
    opens.push(p);
    return new Real(p, o);
  } as unknown as typeof Real;
  return { loadDatabase: () => Spy, opens };
}

describe("getLifetimeStats — per-file memo", () => {
  test("second call returns exactly the same aggregate as the first", () => {
    const dir = tmpDir("memo-eq");
    seed(dir, "a", 3).db.close();
    seed(dir, "b", 5).db.close();

    const first = getLifetimeStats({ sessionsDir: dir, memoryRoot: join(dir, "vazio") });
    const second = getLifetimeStats({ sessionsDir: dir, memoryRoot: join(dir, "vazio") });

    expect(first.totalEvents).toBe(8);
    expect(second).toEqual(first);
  });

  test("second call does NOT reopen a sidecar that did not change", () => {
    const dir = tmpDir("memo-io");
    seed(dir, "a", 3).db.close();
    seed(dir, "b", 5).db.close();
    const spy = spyCtor();

    getLifetimeStats({ sessionsDir: dir, memoryRoot: join(dir, "vazio"), loadDatabase: spy.loadDatabase });
    const onFirst = spy.opens.length;
    getLifetimeStats({ sessionsDir: dir, memoryRoot: join(dir, "vazio"), loadDatabase: spy.loadDatabase });

    expect(onFirst).toBe(2);
    // Without the memo this number would be 4. This is the assert that tells the paths apart.
    expect(spy.opens.length).toBe(2);
  });

  test("🚨 a WAL write invalidates the memo even with the .db untouched", () => {
    const dir = tmpDir("memo-wal");
    const { db, filePath } = seed(dir, "live", 2);

    const before = getLifetimeStats({ sessionsDir: dir, memoryRoot: join(dir, "vazio") });
    expect(before.totalEvents).toBe(2);

    const statBefore = statSync(filePath);
    db.insertEvent("s-live", event("/p/live/novo.ts"), "PostToolUse");
    const statAfter = statSync(filePath);

    // The scenario is only worth anything if the `.db` really did NOT change. When SQLite
    // decides to checkpoint, the test stays correct but stops discriminating, and saying
    // so beats pretending it proved something.
    const dbUntouched = statBefore.mtimeMs === statAfter.mtimeMs && statBefore.size === statAfter.size;
    expect(existsSync(`${filePath}-wal`)).toBe(true);

    const after = getLifetimeStats({ sessionsDir: dir, memoryRoot: join(dir, "vazio") });
    expect(after.totalEvents, dbUntouched
      ? "the .db did not change: only the -wal in the key detects this write"
      : "a checkpoint happened; the discriminating case was not exercised this round",
    ).toBe(3);
    db.close();
  });

  test("a change to the .db itself invalidates the memo", () => {
    const dir = tmpDir("memo-db");
    const { db, filePath } = seed(dir, "a", 4);
    db.close();  // close and checkpoint: the content moves into the .db

    expect(getLifetimeStats({ sessionsDir: dir, memoryRoot: join(dir, "v") }).totalEvents).toBe(4);

    // mtime pushed forward without touching content: the key changes, the aggregate does not.
    const s = statSync(filePath);
    utimesSync(filePath, s.atime, new Date(s.mtimeMs + 5000));
    const spy = spyCtor();
    const r = getLifetimeStats({ sessionsDir: dir, memoryRoot: join(dir, "v"), loadDatabase: spy.loadDatabase });

    expect(spy.opens.length, "a different mtime must force a reread").toBe(1);
    expect(r.totalEvents).toBe(4);
  });

  test("a new sidecar joins the total without invalidating the old ones", () => {
    const dir = tmpDir("memo-novo");
    seed(dir, "a", 3).db.close();
    getLifetimeStats({ sessionsDir: dir, memoryRoot: join(dir, "v") });

    seed(dir, "b", 7).db.close();
    const spy = spyCtor();
    const r = getLifetimeStats({ sessionsDir: dir, memoryRoot: join(dir, "v"), loadDatabase: spy.loadDatabase });

    expect(r.totalEvents).toBe(10);
    expect(spy.opens.length, "only the new sidecar needs reading").toBe(1);
  });

  test("a deleted sidecar leaves the total and leaves no entry stuck in the memo", () => {
    const dir = tmpDir("memo-rm");
    seed(dir, "a", 3).db.close();
    const b = seed(dir, "b", 5);
    b.db.close();

    expect(getLifetimeStats({ sessionsDir: dir, memoryRoot: join(dir, "v") }).totalEvents).toBe(8);

    expect(lifetimeMemoSize()).toBe(2);

    for (const suffix of ["", "-wal", "-shm"]) rmSync(`${b.filePath}${suffix}`, { force: true });
    const r = getLifetimeStats({ sessionsDir: dir, memoryRoot: join(dir, "v") });

    expect(r.totalEvents, "the deleted file's aggregate must not survive in the memo").toBe(3);
    // 🚨 The total above is right WITH or WITHOUT the prune, because a deleted file already
    // drops out of the directory listing. Only the retained memory tells the two paths
    // apart: without the prune the dead entry is held forever, and the process lives for
    // months.
    expect(lifetimeMemoSize(), "a deleted sidecar's entry must leave the memo").toBe(1);
  });

  test("a write DURING the scan heals on the next call", () => {
    const dir = tmpDir("memo-corrida");
    const { db, filePath } = seed(dir, "corrida", 2);

    // The spy writes to the database the moment it is opened for reading: a writer committing
    // mid-scan. The entry is stored under the OLD state's key, and that is precisely why
    // nothing gets stuck — the next call computes the NEW state's key, misses the memo and
    // rereads. The cost is one extra scan; the value never freezes.
    const Real = loadDatabase() as unknown as new (p: string, o: unknown) => unknown;
    let wrote = false;
    const Intruder = function (this: unknown, p: string, o: unknown) {
      const inst = new Real(p, o);
      if (!wrote) {
        wrote = true;
        db.insertEvent("s-corrida", event("/p/corrida/intruso.ts"), "PostToolUse");
      }
      return inst;
    } as unknown as typeof Real;

    getLifetimeStats({ sessionsDir: dir, memoryRoot: join(dir, "v"), loadDatabase: () => Intruder });
    const after = getLifetimeStats({ sessionsDir: dir, memoryRoot: join(dir, "v") });

    expect(after.totalEvents, "the old state's key must miss the memo and force a reread").toBe(3);
    expect(existsSync(`${filePath}-wal`)).toBe(true);
    db.close();
  });

  test("an unreadable sidecar does not block pruning a deleted one", () => {
    const dir = tmpDir("memo-poda");
    seed(dir, "good", 3).db.close();
    // Not SQLite: readSidecarAggregate returns null and it NEVER enters the memo, but it does
    // count in `seen`. With a SIZE-based prune (memo 1 vs seen 2, then 1 vs 1) the dead
    // entry for "good" would never leave.
    writeFileSync(join(dir, "garbage.db"), "this is not a database");

    expect(getLifetimeStats({ sessionsDir: dir, memoryRoot: join(dir, "v") }).totalEvents).toBe(3);
    expect(lifetimeMemoSize()).toBe(1);

    rmSync(join(dir, "good.db"), { force: true });
    for (const s of ["-wal", "-shm"]) rmSync(join(dir, `good.db${s}`), { force: true });
    getLifetimeStats({ sessionsDir: dir, memoryRoot: join(dir, "v") });

    expect(lifetimeMemoSize(), "the prune must be by membership, not by size").toBe(0);
  });

  test("alternating two sessionsDir does not make one evict the other", () => {
    const dirA = tmpDir("memo-A");
    const dirB = tmpDir("memo-B");
    seed(dirA, "a1", 3).db.close();
    seed(dirB, "b1", 5).db.close();
    seed(dirB, "b2", 2).db.close();

    getLifetimeStats({ sessionsDir: dirA, memoryRoot: join(dirA, "v") });
    getLifetimeStats({ sessionsDir: dirB, memoryRoot: join(dirB, "v") });
    expect(lifetimeMemoSize(), "A's and B's entries coexist").toBe(3);

    const spy = spyCtor();
    const r = getLifetimeStats({ sessionsDir: dirA, memoryRoot: join(dirA, "v"), loadDatabase: spy.loadDatabase });
    expect(r.totalEvents).toBe(3);
    expect(spy.opens.length, "going back to A must hit the memo, not reread").toBe(0);
    expect(lifetimeMemoSize()).toBe(3);
  });

  test("🚨 a directory that EMPTIED OUT is pruned too", () => {
    const dir = tmpDir("memo-vazio");
    const a = seed(dir, "a", 3); a.db.close();
    const b = seed(dir, "b", 5); b.db.close();

    expect(getLifetimeStats({ sessionsDir: dir, memoryRoot: join(dir, "v") }).totalEvents).toBe(8);
    expect(lifetimeMemoSize()).toBe(2);

    // Remove the LAST sidecar. With the prune inside the per-file loop there is no loop left
    // to prune from, and both entries stay held for the life of the process.
    for (const n of ["a", "b"]) {
      for (const s of ["", "-wal", "-shm"]) rmSync(join(dir, `${n}.db${s}`), { force: true });
    }
    const r = getLifetimeStats({ sessionsDir: dir, memoryRoot: join(dir, "v") });

    expect(r.totalEvents).toBe(0);
    expect(lifetimeMemoSize(), "an empty directory must prune everything that was its own").toBe(0);
  });

  test("an UNREADABLE directory prunes nothing (a transient failure must not evict the memo)", () => {
    const dir = tmpDir("memo-ilegivel");
    seed(dir, "a", 3).db.close();
    expect(getLifetimeStats({ sessionsDir: dir, memoryRoot: join(dir, "v") }).totalEvents).toBe(3);
    expect(lifetimeMemoSize()).toBe(1);

    // A failing `readdirSync` is different from "listed it and it is empty": the first says
    // nothing about what exists, and pruning on it costs a full reread for a transient
    // EACCES.
    //
    // 🚨 Deleting the directory does NOT exercise this path — `existsSync` goes false and the
    // whole block is skipped, so the test passed without touching the guard at all (caught
    // by the sabotage matrix). Replacing the directory with a FILE at the same path keeps
    // `existsSync` true and makes `readdirSync` throw ENOTDIR, which is the real state the
    // guard protects, and it works on every operating system.
    rmSync(dir, { recursive: true, force: true });
    writeFileSync(dir, "now I am a file");
    expect(existsSync(dir)).toBe(true);
    getLifetimeStats({ sessionsDir: dir, memoryRoot: join(dir, "v") });

    expect(lifetimeMemoSize(), "with no valid listing, the memo stays as it is").toBe(1);
  });

  test("🚨 delta: a NEW row is served by an INCREMENTAL read, not by a full scan", () => {
    const dir = tmpDir("delta-novo");
    const { db } = seed(dir, "live", 5);
    const opts = { sessionsDir: dir, memoryRoot: join(dir, "v") };

    expect(getLifetimeStats(opts).totalEvents).toBe(5);
    expect(lifetimeScanCounts()).toEqual({ full: 1, delta: 0 });

    db.insertEvent("s-live", event("/p/live/nova.ts"), "PostToolUse");
    const r = getLifetimeStats(opts);

    expect(r.totalEvents).toBe(6);
    expect(r.categoryCounts?.file).toBe(6);
    // 🚨 The value above is right WITH or WITHOUT the incremental read — a full scan would
    // give the same 6. Only the counter tells the two paths apart, which is why it exists.
    expect(lifetimeScanCounts(), "the second read must be incremental").toEqual({ full: 1, delta: 1 });

    // And again, to prove the watermark ADVANCED: if it stood still, the equality guard would
    // fail now and this read would fall back to a full scan.
    db.insertEvent("s-live", event("/p/live/outra.ts"), "PostToolUse");
    expect(getLifetimeStats(opts).totalEvents).toBe(7);
    expect(lifetimeScanCounts(), "a stalled watermark drops the third read to a full scan").toEqual({ full: 1, delta: 2 });
    db.close();
  });

  test("🚨 delta REFUSES when a row is DELETED and falls back to the full scan", () => {
    const dir = tmpDir("delta-apagado");
    const { db, filePath } = seed(dir, "live", 6);
    const opts = { sessionsDir: dir, memoryRoot: join(dir, "v") };
    expect(getLifetimeStats(opts).totalEvents).toBe(6);

    // Delete 2 rows BELOW the watermark and insert 1 above. `WHERE id > last` would see only
    // the new one and answer 7; the right total is 5. The equality guard
    // (previous + added === COUNT(*)) is what separates the two paths.
    const raw = new (loadDatabase() as unknown as new (p: string, o: unknown) => {
      prepare: (s: string) => { run: (...a: unknown[]) => void };
      close: () => void;
    })(filePath, { readonly: false });
    raw.prepare("DELETE FROM session_events WHERE id IN (SELECT id FROM session_events ORDER BY id LIMIT 2)").run();
    raw.close();
    db.insertEvent("s-live", event("/p/live/after.ts"), "PostToolUse");

    const r = getLifetimeStats(opts);
    expect(r.totalEvents, "with a deletion the delta must be refused").toBe(5);
    expect(r.categoryCounts?.file, "the per-category count must come down too").toBe(5);
    db.close();
  });

  test("🚨 delta REFUSES a file REPLACED by another with the same row count", () => {
    const dirA = tmpDir("delta-troca-a");
    const dirB = tmpDir("delta-troca-b");
    const opts = { sessionsDir: dirA, memoryRoot: join(dirA, "v") };

    // A: 4 events, all of category "file". Gets memoised with a high lastId.
    const a = seed(dirA, "target", 4); a.db.close();
    expect(getLifetimeStats(opts).categoryCounts).toEqual({ file: 4 });

    // B: a different database, also 4 events, but category "git" and LOW ids — the impostor:
    // the count matches, so only an identity check catches it.
    const bPath = join(dirB, "other.db");
    const b = new SessionDB({ dbPath: bPath });
    cleanups.push(() => { try { b.cleanup(); } catch { /* already closed */ } });
    b.ensureSession("s-b", "/p/b");
    for (let i = 0; i < 4; i++) b.insertEvent("s-b", { ...event(`/p/b/${i}.ts`), category: "git" }, "PostToolUse");
    b.close();

    // swap the file out from under the memo
    for (const s of ["", "-wal", "-shm"]) rmSync(`${a.filePath}${s}`, { force: true });
    copyFileSync(bPath, a.filePath);

    const r = getLifetimeStats(opts);
    expect(r.totalEvents).toBe(4);
    expect(r.categoryCounts,
      "without the identity check the OLD file's aggregate would be served forever",
    ).toEqual({ git: 4 });
  });

  test("delta keeps the categories and project_dirs already known", () => {
    const dir = tmpDir("delta-cat");
    const filePath = join(dir, "multi.db");
    const db = new SessionDB({ dbPath: filePath });
    cleanups.push(() => { try { db.cleanup(); } catch { /* already closed */ } });
    db.ensureSession("s1", "/proj/alfa");
    db.insertEvent("s1", { ...event("/proj/alfa/a.ts"), category: "file" }, "PostToolUse");
    db.insertEvent("s1", { ...event("/proj/alfa/b.ts"), category: "git" }, "PostToolUse");
    const opts = { sessionsDir: dir, memoryRoot: join(dir, "v") };

    const before = getLifetimeStats(opts);
    expect(before.categoryCounts).toEqual({ file: 1, git: 1 });

    db.ensureSession("s2", "/proj/beta");
    db.insertEvent("s2", { ...event("/proj/beta/c.ts"), category: "git" }, "PostToolUse");
    const r = getLifetimeStats(opts);

    expect(r.totalEvents).toBe(3);
    expect(r.categoryCounts, "old category summed with the new one").toEqual({ file: 1, git: 2 });
    expect(r.distinctProjects, "the new project_dir joins without losing the old one").toBe(2);
    db.close();
  });

  test("delta is never attempted from an aggregate with no watermark (empty table)", () => {
    const dir = tmpDir("delta-vazio");
    const { db } = seed(dir, "empty", 0);
    const spy = spyCtor();
    const opts = { sessionsDir: dir, memoryRoot: join(dir, "v"), loadDatabase: spy.loadDatabase };
    expect(getLifetimeStats(opts).totalEvents).toBe(0);

    db.insertEvent("s-empty", event("/p/empty/a.ts"), "PostToolUse");
    expect(getLifetimeStats(opts).totalEvents).toBe(1);
    // lastId 0 means "nothing to anchor on": the second read must be a full scan...
    expect(lifetimeScanCounts()).toEqual({ full: 2, delta: 0 });
    // ...and the delta must not even open the file to find that out.
    expect(spy.opens.length).toBe(2);
    db.close();
  });

  test("🚨 delta and full scan agree: older created_at, empty category, consumed resume", () => {
    const dir = tmpDir("delta-antigo");
    const { db, filePath } = seed(dir, "live", 2);
    const opts = { sessionsDir: dir, memoryRoot: join(dir, "v") };
    const raw = new (loadDatabase() as unknown as new (p: string, o: unknown) => {
      prepare: (s: string) => { run: (...a: unknown[]) => void };
      close: () => void;
    })(filePath, { readonly: false });
    const insertEmpty = (data: string, at: string) => raw.prepare(
      "INSERT INTO session_events (session_id, type, category, data, source_hook, created_at)" +
      " VALUES ('s-live', 'file', '', ?, 'PostToolUse', ?)",
    ).run(data, at);

    // Seen by the FULL scan: an empty-category row and a consumed resume snapshot.
    insertEmpty("/p/live/blank.ts", "2020-06-01 00:00:00");
    db.upsertResume("s-live", "x".repeat(40));
    db.markResumeConsumed("s-live");
    const before = getLifetimeStats(opts);
    expect(before.categoryCounts, "an empty category is skipped").toEqual({ file: 2 });
    expect(before.rescueBytes).toBe(40);

    // Seen by the DELTA: another empty category, dated earlier than anything so far.
    insertEmpty("/p/live/old.ts", "2001-01-01 00:00:00");
    raw.close();
    const r = getLifetimeStats(opts);
    expect(lifetimeScanCounts(), "must be served by the delta").toEqual({ full: 1, delta: 1 });
    expect(r.totalEvents).toBe(4);
    expect(r.firstEventMs).toBe(Date.parse("2001-01-01T00:00:00Z"));
    expect(r.categoryCounts).toEqual({ file: 2 });

    // The delta must reach exactly what a fresh full scan reaches.
    resetLifetimeMemo();
    expect(getLifetimeStats(opts)).toEqual(r);
    db.close();
  });

  /** A reader that, the first time it prepares `trigger` while armed, lets `write` commit first. */
  function midReadSpy(trigger: string, write: () => void) {
    const Real = loadDatabase() as unknown as new (p: string, o: unknown) => { prepare: (s: string) => unknown };
    const state = { armed: false, injected: 0 };
    const Spy = function (this: unknown, p: string, o: unknown) {
      const real = new Real(p, o) as Record<string, unknown>;
      return new Proxy(real, {
        get(t, k) {
          const v = t[k as string];
          if (k === "prepare") {
            return (sql: string) => {
              if (state.armed && sql.includes(trigger)) { state.armed = false; state.injected++; write(); }
              return (v as (s: string) => unknown).call(t, sql);
            };
          }
          return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(t) : v;
        },
      });
    } as unknown as typeof Real;
    return { state, loadDatabase: () => Spy };
  }

  test("🚨 a write landing in the MIDDLE of a full scan is not half-counted", () => {
    const dir = tmpDir("full-meio");
    const { db } = seed(dir, "live", 3);
    const spy = midReadSpy("FROM session_events GROUP BY category",
      () => db.insertEvent("s-live", event("/p/live/mid.ts"), "PostToolUse"));
    spy.state.armed = true;
    const r = getLifetimeStats({ sessionsDir: dir, memoryRoot: join(dir, "v"), loadDatabase: spy.loadDatabase });
    expect(spy.state.injected, "the write must have landed mid-read").toBe(1);
    expect(r.totalEvents).toBe(3);
    expect(r.categoryCounts, "categories describe the same rows as the total").toEqual({ file: 3 });
    db.close();
  });

  test("🚨 a write landing in the MIDDLE of a delta read is not half-counted", () => {
    const dir = tmpDir("delta-meio");
    const { db } = seed(dir, "live", 3);
    const spy = midReadSpy("WHERE id > ? GROUP BY category",
      () => db.insertEvent("s-live", event("/p/live/mid.ts"), "PostToolUse"));
    const opts = { sessionsDir: dir, memoryRoot: join(dir, "v"), loadDatabase: spy.loadDatabase };

    expect(getLifetimeStats(opts).totalEvents).toBe(3);
    db.insertEvent("s-live", event("/p/live/a.ts"), "PostToolUse");
    spy.state.armed = true;
    const r = getLifetimeStats(opts);
    expect(spy.state.injected, "the write must have landed mid-read").toBe(1);
    expect(lifetimeScanCounts()).toEqual({ full: 1, delta: 1 });
    // The snapshot saw 4 rows; the categories must describe the same 4, not 5.
    expect(r.totalEvents).toBe(4);
    expect(r.categoryCounts).toEqual({ file: 4 });
    // And the watermark must not have skipped the mid-read row: the next read counts it.
    expect(getLifetimeStats(opts).totalEvents).toBe(5);
    db.close();
  });

  test("a sidecar that cannot be stat'd is skipped and never memoised", (ctx) => {
    const dir = tmpDir("memo-sem-stat");
    seed(dir, "ok", 2).db.close();
    const target = join(dir, "missing-target");
    const link = join(dir, "dangling.db");
    try {
      symlinkSync(target, link);
    } catch {
      // File symlinks need a privilege on Windows; a junction does not.
      try { symlinkSync(target, link, "junction"); } catch { ctx.skip(); }
    }
    const opts = { sessionsDir: dir, memoryRoot: join(dir, "v") };
    expect(getLifetimeStats(opts).totalEvents).toBe(2);
    expect(lifetimeMemoSize(), "only the readable sidecar is memoised").toBe(1);
  });

  test("delta that cannot open the file falls back to the full scan, which skips it", () => {
    const dir = tmpDir("delta-corrompido");
    const { db, filePath } = seed(dir, "live", 3);
    db.close();
    const opts = { sessionsDir: dir, memoryRoot: join(dir, "v") };
    expect(getLifetimeStats(opts).totalEvents).toBe(3);

    for (const s of ["-wal", "-shm"]) rmSync(`${filePath}${s}`, { force: true });
    writeFileSync(filePath, Buffer.alloc(8192, 7)); // not a database, different size
    expect(getLifetimeStats(opts).totalEvents).toBe(0);
    expect(lifetimeScanCounts()).toEqual({ full: 1, delta: 0 });
  });

  test("resetLifetimeMemo() forces everything to be reread", () => {
    const dir = tmpDir("memo-reset");
    seed(dir, "a", 3).db.close();
    const spy = spyCtor();

    getLifetimeStats({ sessionsDir: dir, memoryRoot: join(dir, "v"), loadDatabase: spy.loadDatabase });
    resetLifetimeMemo();
    getLifetimeStats({ sessionsDir: dir, memoryRoot: join(dir, "v"), loadDatabase: spy.loadDatabase });

    expect(spy.opens.length).toBe(2);
  });
});
