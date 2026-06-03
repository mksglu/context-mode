/**
 * PR #741 follow-up — pricePerToken() must NOT freeze at module load.
 *
 * The original 1dba9b3 commit shipped:
 *   export const PRICE_PER_TOKEN = resolvePricePerToken();
 *
 * Pi sets PI_CONTEXT_MODE_PRICE_OUTPUT_PER_TOKEN AFTER the MCP server
 * has been imported (the bridge spawns the server child, then the
 * child reads its own env on every render). A module-load-time const
 * captures process.env at import and freezes to the Opus fallback
 * because the env var is unset at import time. The PR body advertised
 * env-driven dynamic pricing that silently did not work.
 *
 * The fix converts the export to a function so it re-reads the env on
 * every call. These tests pin that behavior.
 */

import { describe, it, expect, afterEach } from "vitest";
import {
  pricePerToken,
  tokensToUsd,
  OPUS_INPUT_PRICE_PER_TOKEN,
} from "../../src/session/analytics.js";

const ENV_NAME = "PI_CONTEXT_MODE_PRICE_OUTPUT_PER_TOKEN";

afterEach(() => {
  delete process.env[ENV_NAME];
});

describe("pricePerToken() — dynamic env resolution (PR #741 follow-up)", () => {
  it("returns the Opus 4.7/4.8 input fallback ($5/1M) when env is unset", () => {
    delete process.env[ENV_NAME];
    expect(pricePerToken()).toBeCloseTo(5 / 1_000_000, 15);
  });

  it("reads PI_CONTEXT_MODE_PRICE_OUTPUT_PER_TOKEN when set AFTER module load", () => {
    // This is the key invariant: import happened above (env unset), but
    // a later setter must be honored on the next call. A frozen const
    // would still report the Opus fallback here.
    process.env[ENV_NAME] = "0.000003"; // Sonnet 4.6 rate, $3/1M
    expect(pricePerToken()).toBeCloseTo(0.000003, 12);
  });

  it("switches back to the fallback when env is cleared mid-run", () => {
    process.env[ENV_NAME] = "0.000001"; // Haiku 4.5, $1.00/1M
    expect(pricePerToken()).toBeCloseTo(0.000001, 12);
    delete process.env[ENV_NAME];
    expect(pricePerToken()).toBeCloseTo(5 / 1_000_000, 15);
  });

  it("ignores empty / non-numeric / non-positive env values and falls back", () => {
    for (const bad of ["", "  ", "abc", "0", "-1", "Infinity", "NaN"]) {
      process.env[ENV_NAME] = bad;
      expect(pricePerToken()).toBeCloseTo(5 / 1_000_000, 15);
    }
  });

  it("tokensToUsd() picks up the dynamic rate on every call", () => {
    process.env[ENV_NAME] = "0.000001"; // $1/1M — easy to verify
    expect(tokensToUsd(1_000_000)).toBe("$1.00");
    process.env[ENV_NAME] = "0.000010"; // $10/1M
    expect(tokensToUsd(1_000_000)).toBe("$10.00");
  });

  it("OPUS_INPUT_PRICE_PER_TOKEN back-compat alias resolves to $5/1M (Opus 4.7/4.8)", () => {
    // Third-party consumers that still import the original const name
    // get the fallback literal. Pricing dedup invariant (PR #401 P1.1)
    // preserved. Updated 2026-06: Opus 4.7/4.8 ship at $5/1M, not the
    // earlier Opus 4 $15/1M rate.
    expect(OPUS_INPUT_PRICE_PER_TOKEN).toBeCloseTo(5 / 1_000_000, 15);
  });
});
