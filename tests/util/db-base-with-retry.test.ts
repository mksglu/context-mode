/**
 * #985 — withRetry must back off without burning CPU.
 *
 * The store's statements are synchronous, so withRetry has to be too, and the
 * backoff used to spin on Date.now() for the full delay: 100 + 500 + 2000 ms
 * of pegged core per contended operation, inside the event loop, with every
 * other statement queued behind it.
 *
 * The assertion is on process CPU time rather than wall time, so it measures
 * the thing that was actually wrong. Wall time is unchanged by the fix and
 * would pass either way.
 */

import { describe, test, expect } from "vitest";

import { withRetry } from "../../src/db-base.js";

describe("withRetry backoff", () => {
  test("retries a busy database and returns the eventual result", () => {
    let calls = 0;
    const result = withRetry(() => {
      calls++;
      if (calls <= 2) throw new Error("SQLITE_BUSY: database is locked");
      return "ok";
    }, [10, 10, 10]);

    expect(result).toBe("ok");
    expect(calls).toBe(3);
  });

  test("a non-busy error is rethrown immediately, without backing off", () => {
    const before = process.cpuUsage();
    const wallBefore = Date.now();
    expect(() =>
      withRetry(() => {
        throw new Error("SQLITE_IOERR: disk I/O error");
      }, [2000, 2000]),
    ).toThrow(/SQLITE_IOERR/);
    // No delay list is walked for an error that is not contention.
    expect(Date.now() - wallBefore).toBeLessThan(1000);
    expect(process.cpuUsage(before).user).toBeLessThan(200_000);
  });

  test("the backoff consumes wall time without consuming CPU", () => {
    let calls = 0;
    const cpuBefore = process.cpuUsage();
    const wallBefore = Date.now();

    const result = withRetry(() => {
      calls++;
      if (calls <= 3) throw new Error("SQLITE_BUSY: database is locked");
      return "ok";
    }, [150, 150, 150]);

    const wall = Date.now() - wallBefore;
    const cpu = process.cpuUsage(cpuBefore);
    const busyMs = (cpu.user + cpu.system) / 1000;

    expect(result).toBe("ok");
    // It really did wait.
    expect(wall).toBeGreaterThanOrEqual(300);
    // But it was asleep, not spinning. A busy-wait would land near wall.
    expect(busyMs).toBeLessThan(wall * 0.5);
  });
});
