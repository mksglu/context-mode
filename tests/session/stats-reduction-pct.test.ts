/**
 * #1025 — persistStats must not double-count returned snippet bytes in
 * total_processed / reduction_pct / tokens_saved.
 */

import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverSrc = readFileSync(resolve(__dirname, "../../src/server.ts"), "utf-8");

function computePersistStats(rawKeptOut: number, totalReturned: number) {
  const keptOut = Math.max(0, rawKeptOut - totalReturned);
  const totalProcessed = keptOut + totalReturned;
  const reductionPct =
    totalProcessed > 0
      ? Math.round((1 - totalReturned / totalProcessed) * 100)
      : 0;
  const tokensSaved = Math.round(keptOut / 4);
  return { keptOut, totalProcessed, reductionPct, tokensSaved };
}

describe("persistStats reduction_pct (#1025)", () => {
  test("server.ts nets returned bytes out of rawKeptOut before totaling", () => {
    expect(serverSrc).toMatch(/rawKeptOut/);
    expect(serverSrc).toMatch(/Math\.max\(0,\s*rawKeptOut\s*-\s*totalReturned\)/);
  });

  test("indexed stdout with returned snippet uses universe as total_processed", () => {
    const universe = 10_001;
    const returned = 3_000;
    const { keptOut, totalProcessed, reductionPct, tokensSaved } = computePersistStats(
      universe,
      returned,
    );

    expect(totalProcessed).toBe(universe);
    expect(keptOut).toBe(universe - returned);
    expect(reductionPct).toBe(Math.round((1 - returned / universe) * 100));
    expect(tokensSaved).toBe(Math.round((universe - returned) / 4));
  });

  test("naive sum would inflate total_processed (regression guard)", () => {
    const universe = 10_001;
    const returned = 3_000;
    const naiveTotal = universe + returned;
    const { totalProcessed } = computePersistStats(universe, returned);

    expect(naiveTotal).toBeGreaterThan(totalProcessed);
    expect(naiveTotal - totalProcessed).toBe(returned);
  });
});
