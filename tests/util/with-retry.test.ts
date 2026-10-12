/**
 * withRetry backoff — issue #985.
 *
 * better-sqlite3 is synchronous, so the SQLITE_BUSY retry backoff cannot await
 * a timer. It previously slept with a `while (Date.now() - start < delay)`
 * busy-wait, which pins a CPU core for the full 100+500+2000ms backoff; under
 * multi-session write contention on the shared per-project content DB this
 * accumulated hundreds of CPU-seconds per instance. The fix replaces the spin
 * with a real blocking sleep via `Atomics.wait`.
 *
 * Source-level guard: assert the busy-wait is gone and Atomics.wait is used.
 * Runtime guards: retry-then-succeed, non-BUSY rethrow, exhaustion, and that a
 * real (non-zero) delay actually elapses.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { withRetry } from "../../src/db-base.js";

describe("withRetry backoff (#985)", () => {
  const src = readFileSync(resolve(__dirname, "..", "..", "src", "db-base.ts"), "utf8");

  it("no longer busy-waits; uses Atomics.wait for the backoff sleep", () => {
    expect(src).not.toMatch(/while\s*\(\s*Date\.now\(\)\s*-\s*start\s*<\s*delay\s*\)/);
    expect(src).toContain("Atomics.wait(");
  });

  it("retries on SQLITE_BUSY and eventually succeeds", () => {
    let calls = 0;
    const result = withRetry(() => {
      calls++;
      if (calls < 3) throw new Error("SQLITE_BUSY: database is locked");
      return "ok";
    }, [0, 0, 0]);
    expect(result).toBe("ok");
    expect(calls).toBe(3);
  });

  it("rethrows non-BUSY errors immediately without retrying", () => {
    let calls = 0;
    expect(() =>
      withRetry(() => {
        calls++;
        throw new Error("SQLITE_CONSTRAINT: boom");
      }, [0, 0, 0]),
    ).toThrow("SQLITE_CONSTRAINT");
    expect(calls).toBe(1);
  });

  it("throws a descriptive error after exhausting all retries", () => {
    expect(() =>
      withRetry(() => {
        throw new Error("database is locked");
      }, [0, 0]),
    ).toThrow(/database is locked after 2 retries/);
  });

  it("actually sleeps for a non-zero delay between retries", () => {
    let calls = 0;
    const start = Date.now();
    const result = withRetry(() => {
      calls++;
      if (calls < 2) throw new Error("SQLITE_BUSY");
      return "ok";
    }, [25]);
    expect(result).toBe("ok");
    // Allow scheduler slack, but the ~25ms sleep must have elapsed.
    expect(Date.now() - start).toBeGreaterThanOrEqual(20);
  });
});
