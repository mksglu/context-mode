/**
 * Pricing catalog — curated multi-vendor price lookup + cost compute.
 *
 * Replaces the Anthropic-only hardcoded table that lived in
 * src/session/extract.ts (≈1356-1396). That table priced EVERY model at
 * a Claude rate (non-Claude models silently inherited Sonnet's default),
 * which over-/under-charged every OpenAI / Gemini / Qwen / DeepSeek turn.
 *
 * The catalog reads the curated multi-vendor JSON (src/session/model-prices.json)
 * into one per-Mtok price map and prices each model from ITS OWN row.
 * Behaviours under test:
 *   (a) curated lookup hits across all five vendors
 *   (b) provider/ prefix strip (anthropic/claude-opus-4-8 → claude-opus-4-8)
 *   (c) non-Claude model gets ITS price, not Claude's (the bug)
 *   (d) unknown id → null + one console.warn of the unmatched id
 *   (e) cache_read vs cache_creation weighting (distinct prices)
 *   (f) all-zero / absent tokens → null
 *   (g) native-cost passthrough wins over computed
 */

import { describe, test, expect, vi } from "vitest";
import {
  lookupPrice,
  computeCostUsd,
  nativeOrComputed,
} from "../../src/session/pricing.js";

describe("session/pricing — lookupPrice", () => {
  // (a) curated lookup hits
  test("(a) Anthropic curated hit returns per-Mtok price", () => {
    const p = lookupPrice("claude-opus-4-8");
    expect(p).not.toBeNull();
    expect(p!.input_per_mtok).toBe(5);
    expect(p!.output_per_mtok).toBe(25);
    expect(p!.cache_write_per_mtok).toBe(6.25);
    expect(p!.cache_read_per_mtok).toBe(0.5);
  });

  test("(a) OpenAI curated hit", () => {
    expect(lookupPrice("gpt-5")!.input_per_mtok).toBe(1.25);
  });

  test("(a) Google curated hit", () => {
    expect(lookupPrice("gemini-2.5-flash")!.output_per_mtok).toBe(2.5);
  });

  test("(a) Chinese vendor curated hit", () => {
    expect(lookupPrice("deepseek-v3")).not.toBeNull();
  });

  test("(a) MiniMax curated hits use the target model ids", () => {
    expect(lookupPrice("MiniMax-M3")).toEqual({
      input_per_mtok: 0.6,
      output_per_mtok: 2.4,
      cache_read_per_mtok: 0.12,
      cache_write_per_mtok: null,
    });
    expect(lookupPrice("minimax/MiniMax-M2.7")).toEqual({
      input_per_mtok: 0.3,
      output_per_mtok: 1.2,
      cache_read_per_mtok: 0.06,
      cache_write_per_mtok: 0.375,
    });
  });

  test("(a) Other vendor curated hit", () => {
    expect(lookupPrice("grok-4")).not.toBeNull();
  });

  // (b) provider/ prefix strip + normalization
  test("(b) provider/ prefix is stripped", () => {
    const stripped = lookupPrice("anthropic/claude-opus-4-8");
    const bare = lookupPrice("claude-opus-4-8");
    expect(stripped).toEqual(bare);
  });

  test("(b) normalization trims and lowercases", () => {
    expect(lookupPrice("  GPT-5  ")).toEqual(lookupPrice("gpt-5"));
  });

  test("(b) openrouter-style provider/model strips first segment only", () => {
    // openai/gpt-5 → gpt-5
    expect(lookupPrice("openai/gpt-5")).toEqual(lookupPrice("gpt-5"));
  });

  // (d) unknown id → null
  test("(d) unknown model id returns null", () => {
    expect(lookupPrice("totally-made-up-model-xyz")).toBeNull();
  });

  // null-priced curated entry → treated as no price
  test("null-priced curated entry (gemini-2.0-pro) is treated as no price", () => {
    expect(lookupPrice("gemini-2.0-pro")).toBeNull();
  });
});

describe("session/pricing — computeCostUsd", () => {
  // (c) THE BUG: non-Claude model must use its own price, not Claude's.
  test("(c) gpt-5 priced from its own row, NOT Claude default", () => {
    const tokens = { input_tokens: 1000, output_tokens: 500 };
    const gpt5 = computeCostUsd("gpt-5", tokens);
    // gpt-5: 1000*1.25 + 500*10 = 1250 + 5000 = 6250 / 1e6 = 0.00625
    expect(gpt5).toBeCloseTo(0.00625, 8);
    // Claude-default (old buggy path) would have produced Sonnet 0.0105.
    const sonnet = computeCostUsd("claude-sonnet-4-6", tokens);
    expect(gpt5).not.toBeCloseTo(sonnet!, 8);
  });

  test("(c) gemini-2.5-flash priced from its own row", () => {
    // 1000*0.3 + 500*2.5 = 300 + 1250 = 1550 / 1e6 = 0.00155
    expect(computeCostUsd("gemini-2.5-flash", {
      input_tokens: 1000,
      output_tokens: 500,
    })).toBeCloseTo(0.00155, 8);
  });

  test("(c) MiniMax models use their curated rates", () => {
    expect(computeCostUsd("MiniMax-M3", {
      input_tokens: 1000,
      output_tokens: 500,
      cache_read_tokens: 1000,
      cache_creation_tokens: 1000,
    })).toBeCloseTo(0.00252, 8);
    expect(computeCostUsd("minimax/MiniMax-M2.7", {
      input_tokens: 1000,
      output_tokens: 500,
      cache_read_tokens: 500,
      cache_creation_tokens: 1000,
    })).toBeCloseTo(0.001305, 8);
  });

  // opus-4-8 regression — must match the old hardcoded table exactly.
  test("opus-4-8 regression: 1000 in + 500 out = 0.0175", () => {
    expect(computeCostUsd("claude-opus-4-8", {
      input_tokens: 1000,
      output_tokens: 500,
    })).toBeCloseTo(0.0175, 8);
  });

  // (e) cache_read vs cache_creation weighting
  test("(e) cache_creation uses cache_write price, cache_read uses cache_read price", () => {
    // sonnet: in 3, out 15, cache_write 3.75, cache_read 0.30
    // 1000*3 + 500*15 + 1000*3.75 + 1500*0.30 = 3000+7500+3750+450 = 14700
    expect(computeCostUsd("claude-sonnet-4-6", {
      input_tokens: 1000,
      output_tokens: 500,
      cache_creation_tokens: 1000,
      cache_read_tokens: 1500,
    })).toBeCloseTo(0.0147, 8);
  });

  test("(e) null cache price falls back to input price for that bucket", () => {
    // gpt-5 has cache_write_per_mtok=null → cache_creation billed at input (1.25).
    // 2000 cache_creation tokens only: 2000*1.25 = 2500 / 1e6 = 0.0025
    expect(computeCostUsd("gpt-5", {
      cache_creation_tokens: 2000,
    })).toBeCloseTo(0.0025, 8);
  });

  // (f) all-zero / absent tokens → null
  test("(f) all-zero tokens returns null", () => {
    expect(computeCostUsd("claude-sonnet-4-6", {
      input_tokens: 0,
      output_tokens: 0,
      cache_read_tokens: 0,
      cache_creation_tokens: 0,
    })).toBeNull();
  });

  test("(f) absent tokens returns null", () => {
    expect(computeCostUsd("claude-sonnet-4-6", {})).toBeNull();
  });

  // (d) unknown model → null + single console.warn of the unmatched id
  test("(d) unknown model returns null and warns once with the id", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const cost = computeCostUsd("unknown-vendor/mystery-9000", {
        input_tokens: 1000,
      });
      expect(cost).toBeNull();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]?.[0])).toContain("mystery-9000");
    } finally {
      warn.mockRestore();
    }
  });
});

describe("session/pricing — nativeOrComputed", () => {
  // (g) native-cost passthrough
  test("(g) provider native cost wins over computed", () => {
    const native = nativeOrComputed("gpt-5", { input_tokens: 1000 }, 0.42);
    expect(native).toBe(0.42);
  });

  test("(g) falls back to computed when native is null/undefined", () => {
    const computed = computeCostUsd("gpt-5", { input_tokens: 1000 });
    expect(nativeOrComputed("gpt-5", { input_tokens: 1000 }, null)).toBe(computed);
    expect(nativeOrComputed("gpt-5", { input_tokens: 1000 })).toBe(computed);
  });

  test("(g) native cost of 0 is a real value, not a miss", () => {
    // A provider that genuinely charged $0 (free tier) must pass through.
    expect(nativeOrComputed("gpt-5", { input_tokens: 1000 }, 0)).toBe(0);
  });
});
