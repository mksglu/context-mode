/**
 * #1025 — returned bytes must not be double-counted in total_processed, and
 * must never be claimed as saved tokens.
 *
 * Bytes returned to the model as query snippets were already counted when
 * their source was indexed. Adding them again to the kept-out total counted
 * the same universe twice, and let tokens_saved include bytes the agent
 * genuinely received — an over-claim on the product's headline number.
 *
 * The formula is exercised through the exported computeSavings(), which is
 * what persistStats() calls. Asserting on the source text instead would pass
 * regardless of the arithmetic.
 */

import { describe, expect, test } from "vitest";

import { computeSavings } from "../../src/server.js";

const noActivity = {
  bytesIndexed: 0,
  bytesSandboxed: 0,
  cacheBytesSaved: 0,
  bytesReturned: 0,
};

describe("computeSavings: returned bytes are not double-counted", () => {
  test("total_processed is the real universe, not universe plus returned", () => {
    // 10 000 bytes reached the index; 3 000 of them came back as snippets.
    const universe = 10_000;
    const returned = 3_000;
    const r = computeSavings({
      ...noActivity,
      bytesIndexed: universe,
      bytesReturned: returned,
    });

    // The buggy shape was universe + returned.
    expect(r.totalProcessed).toBe(universe);
    expect(r.totalProcessed).not.toBe(universe + returned);
  });

  test("kept_out excludes the bytes that were actually returned", () => {
    const r = computeSavings({
      ...noActivity,
      bytesIndexed: 10_000,
      bytesSandboxed: 500,
      cacheBytesSaved: 500,
      bytesReturned: 3_000,
    });

    expect(r.keptOut).toBe(11_000 - 3_000);
  });

  test("tokens_saved counts only bytes that never reached the model", () => {
    const r = computeSavings({
      ...noActivity,
      bytesIndexed: 10_000,
      bytesReturned: 3_000,
    });

    // The returned 3 000 bytes were delivered, so they are not savings.
    expect(r.tokensSaved).toBe(Math.round(7_000 / 4));
    expect(r.tokensSaved).toBeLessThan(Math.round(10_000 / 4));
  });

  test("reduction_pct is the returned share of the real universe", () => {
    const r = computeSavings({
      ...noActivity,
      bytesIndexed: 10_000,
      bytesReturned: 3_000,
    });

    expect(r.reductionPct).toBe(Math.round((1 - 3_000 / 10_000) * 100));
  });
});

describe("computeSavings: no returned bytes is the untouched path", () => {
  test("pure sandboxing keeps the whole universe as savings", () => {
    const r = computeSavings({
      ...noActivity,
      bytesSandboxed: 8_000,
      cacheBytesSaved: 2_000,
    });

    expect(r.keptOut).toBe(10_000);
    expect(r.totalProcessed).toBe(10_000);
    expect(r.reductionPct).toBe(100);
    expect(r.tokensSaved).toBe(2_500);
  });
});

describe("computeSavings: edges", () => {
  test("zero activity reports zero rather than NaN", () => {
    const r = computeSavings(noActivity);

    expect(r.totalProcessed).toBe(0);
    expect(r.reductionPct).toBe(0);
    expect(r.tokensSaved).toBe(0);
  });

  test("returned bytes beyond the counted universe clamp instead of going negative", () => {
    // Counters can disagree across restarts; a negative savings figure would
    // be worse than a conservative zero.
    const r = computeSavings({
      ...noActivity,
      bytesIndexed: 1_000,
      bytesReturned: 4_000,
    });

    expect(r.keptOut).toBe(0);
    expect(r.tokensSaved).toBe(0);
    expect(r.totalProcessed).toBe(4_000);
  });
});
