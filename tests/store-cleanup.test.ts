/**
 * #1024 / #880 — cleanupStaleContentDBs must not destroy a database a live
 * process still holds.
 *
 * The previous rule treated a stale `-wal` mtime as proof of a dead owner. A
 * WAL mtime is a *write* timestamp, so any live-but-idle owner looked
 * abandoned after an hour and had its `.db`/`-wal`/`-shm` unlinked underneath
 * it. On bun:sqlite that also wedges the holder on a permanent
 * SQLITE_IOERR, which is why the bug surfaced as an unexplainable store
 * failure with a green `ctx_doctor`.
 *
 * Every assertion below is on the filesystem or on real ContentStore
 * behaviour. Asserting on the source text would pass regardless of what the
 * function does — a shape this repo has had trouble with before.
 */

import { describe, test, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

import { ContentStore, cleanupStaleContentDBs } from "../src/store.js";

const TWO_HOURS_AGO = new Date(Date.now() - 2 * 3600_000);

const dirs: string[] = [];

function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), "cm-stale-"));
  dirs.push(dir);
  return dir;
}

/**
 * A content DB with a live owner in THIS process, whose WAL looks abandoned:
 * the database mtime stays fresh (so the 14-day age sweep cannot fire) and
 * only the WAL is backdated past the one-hour staleness threshold.
 */
function liveOwnerFixture(label: string) {
  const dir = scratch();
  const dbPath = join(dir, "live.db");
  const store = new ContentStore(dbPath);
  store.index({ content: `# Doc\n\nmarker ${label}`, source: label });
  utimesSync(dbPath + "-wal", TWO_HOURS_AGO, TWO_HOURS_AGO);
  return { dir, dbPath, store };
}

afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

describe("cleanupStaleContentDBs leaves a live owner's database alone", () => {
  test("a stale WAL on a DB this process has open is not unlinked", () => {
    const { dbPath, store } = liveOwnerFixture("live");
    try {
      expect(cleanupStaleContentDBs(join(dbPath, ".."), 14)).toBe(0);
      expect(existsSync(dbPath)).toBe(true);
      expect(existsSync(dbPath + "-wal")).toBe(true);
      expect(existsSync(dbPath + "-shm")).toBe(true);
      expect(store.getStats().sources).toBe(1);
    } finally {
      store.close();
    }
  });

  test("maxAgeDays=0 disables the age sweep instead of expiring everything", () => {
    // cutoff === now meant every pre-existing file was stale, so the legacy
    // sweep in getStore() unlinked the whole directory on every boot.
    const { dbPath, store } = liveOwnerFixture("zero");
    try {
      expect(cleanupStaleContentDBs(join(dbPath, ".."), 0)).toBe(0);
      expect(existsSync(dbPath)).toBe(true);
    } finally {
      store.close();
    }
  });

  test("an excluded path is skipped even when it looks abandoned", () => {
    // getStore() opens its DB and then sweeps the directory containing it.
    const { dbPath, store } = liveOwnerFixture("excluded");
    try {
      expect(
        cleanupStaleContentDBs(join(dbPath, ".."), 14, { exclude: [dbPath] }),
      ).toBe(0);
      expect(existsSync(dbPath)).toBe(true);
    } finally {
      store.close();
    }
  });
});

/**
 * Leave behind what an abruptly-killed server leaves behind: a real, non-empty
 * WAL with no live owner. Closing a ContentStore cleanly would checkpoint and
 * remove it, so the process has to die instead.
 */
function killedOwnerFixture() {
  const dir = scratch();
  const dbPath = join(dir, "dead.db");
  const ready = join(dir, "ready");

  const child = spawn(
    process.execPath,
    ["-e", `const D=require("better-sqlite3");const d=new D(${JSON.stringify(dbPath)});
       d.pragma("journal_mode=WAL");d.exec("create table t(a)");
       for(let i=0;i<200;i++)d.prepare("insert into t values(?)").run("x".repeat(200));
       require("fs").writeFileSync(${JSON.stringify(ready)},"1");setInterval(()=>{},1e9);`],
    { stdio: "ignore" },
  );

  // Wait for the writer to be done, then kill it without a clean close.
  const deadline = Date.now() + 10_000;
  while (!existsSync(ready) && Date.now() < deadline) {
    spawn(process.execPath, ["-e", "setTimeout(()=>{},50)"]);
  }
  child.kill("SIGKILL");
  // Age the database too: abandonment is now decided by mtime alone.
  utimesSync(dbPath, TWO_HOURS_AGO, TWO_HOURS_AGO);
  const old = new Date(Date.now() - 40 * 24 * 3600_000);
  utimesSync(dbPath, old, old);

  return { dir, dbPath };
}

describe("cleanupStaleContentDBs still reclaims abandoned databases", () => {
  // Without this, "never delete" would satisfy every test above.
  test("a DB whose owner was killed is removed despite the stale WAL", () => {
    const { dir, dbPath } = killedOwnerFixture();
    expect(cleanupStaleContentDBs(dir, 14)).toBe(1);
    expect(existsSync(dbPath)).toBe(false);
  });

  test("a DB older than the age limit is removed once no process holds it", () => {
    const dir = scratch();
    const dbPath = join(dir, "ancient.db");
    const store = new ContentStore(dbPath);
    store.close();
    const old = new Date(Date.now() - 40 * 24 * 3600_000);
    utimesSync(dbPath, old, old);

    expect(cleanupStaleContentDBs(dir, 14)).toBe(1);
    expect(existsSync(dbPath)).toBe(false);
  });
});
