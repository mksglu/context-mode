/**
 * startWalCheckpointTimer — issue #985.
 *
 * Opportunistic PASSIVE WAL checkpoint so the shared content-store WAL stays
 * bounded even when a process is killed before closeDB()'s TRUNCATE runs.
 * Must: fire PASSIVE (never TRUNCATE/EXCLUSIVE — ADR 0001), stop on request,
 * disable on non-positive/non-finite intervals, and swallow pragma errors.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { startWalCheckpointTimer } from "../../src/db-base.js";

describe("startWalCheckpointTimer (#985)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function fakeDb() {
    return { pragma: vi.fn() } as unknown as import("better-sqlite3").Database & { pragma: ReturnType<typeof vi.fn> };
  }

  it("issues a PASSIVE checkpoint on each interval", () => {
    const db = fakeDb();
    const stop = startWalCheckpointTimer(db, 1000);
    expect(db.pragma).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3000);
    expect(db.pragma).toHaveBeenCalledTimes(3);
    expect(db.pragma).toHaveBeenCalledWith("wal_checkpoint(PASSIVE)");
    // ADR 0001: never a blocking/locking variant.
    for (const [arg] of (db.pragma as ReturnType<typeof vi.fn>).mock.calls) {
      expect(arg).not.toMatch(/TRUNCATE|EXCLUSIVE|locking_mode/);
    }
    stop();
  });

  it("stops firing after the returned stopper is called", () => {
    const db = fakeDb();
    const stop = startWalCheckpointTimer(db, 1000);
    vi.advanceTimersByTime(1000);
    expect(db.pragma).toHaveBeenCalledTimes(1);
    stop();
    vi.advanceTimersByTime(5000);
    expect(db.pragma).toHaveBeenCalledTimes(1); // no further ticks
  });

  it("is a no-op for non-positive or non-finite intervals", () => {
    const db = fakeDb();
    for (const bad of [0, -1, NaN, Infinity]) {
      const stop = startWalCheckpointTimer(db, bad);
      vi.advanceTimersByTime(10000);
      stop(); // must be safe to call
    }
    expect(db.pragma).not.toHaveBeenCalled();
  });

  it("swallows pragma errors so a busy/closing DB never crashes the timer", () => {
    const db = { pragma: vi.fn(() => { throw new Error("SQLITE_BUSY"); }) } as unknown as import("better-sqlite3").Database;
    const stop = startWalCheckpointTimer(db, 1000);
    expect(() => vi.advanceTimersByTime(2000)).not.toThrow();
    stop();
  });
});
