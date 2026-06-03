/**
 * Issue #5 + #8 (Layer 3) — extractUserPromptFeatures per §11.
 *
 * Reference: context-mode-platform/docs/prds/2026-06-insight-data-flow/
 *   11-multilingual-prompt-algorithm.md §11 Layer 1 + Layer 3
 *
 * The §11 spec mandates Unicode property regex (`\p{L}`, `\p{Lu}`,
 * `\p{Script=X}`) — script-agnostic, no per-language tables, no
 * franc/fasttext/compromise dependencies. Output is 10 numeric/string
 * features + one `prompt_word_tokens: string[]` array (Layer 3).
 *
 * Privacy: per §11 the features carry no prompt prose. Layer 3 tokens
 * are letter-only words ≥3 chars, lowercased, deduplicated — they may
 * include words from the prompt but the platform's prompt_word_count
 * table aggregates these by (org_id, week, word) so individual tokens
 * never surface in the UI.
 */

import { describe, test, expect } from "vitest";
import { extractUserPromptFeatures } from "../../src/session/extract.js";

describe("extractUserPromptFeatures — §11 Layer 1 (10 features)", () => {
  test("tracer: empty prompt → all zeros + null script + empty tokens", () => {
    const f = extractUserPromptFeatures("");
    expect(f.prompt_length).toBe(0);
    expect(f.prompt_word_count).toBe(0);
    expect(f.prompt_uppercase_ratio).toBe(0);
    expect(f.prompt_file_ref_count).toBe(0);
    expect(f.prompt_path_ref_count).toBe(0);
    expect(f.prompt_script_primary).toBeNull();
    expect(f.prompt_script_count).toBe(0);
    expect(f.prompt_question_glyph_count).toBe(0);
    expect(f.prompt_code_block_count).toBe(0);
    expect(f.prompt_url_count).toBe(0);
    expect(f.prompt_word_tokens).toEqual([]);
  });

  test("Latin script primary on English prompt", () => {
    const f = extractUserPromptFeatures("Refactor the auth module please");
    expect(f.prompt_script_primary).toBe("Latin");
    expect(f.prompt_script_count).toBe(1);
    expect(f.prompt_word_count).toBeGreaterThan(0);
  });

  test("Han script primary on Chinese prompt", () => {
    const f = extractUserPromptFeatures("中文测试 重构");
    expect(f.prompt_script_primary).toBe("Han");
  });

  test("Hangul script primary on Korean prompt", () => {
    const f = extractUserPromptFeatures("한국어 테스트");
    expect(f.prompt_script_primary).toBe("Hangul");
  });

  test("Cyrillic script primary on Russian prompt", () => {
    const f = extractUserPromptFeatures("Привет мир рефакторинг");
    expect(f.prompt_script_primary).toBe("Cyrillic");
  });

  test("Arabic script primary on Arabic prompt", () => {
    const f = extractUserPromptFeatures("مرحبا العالم");
    expect(f.prompt_script_primary).toBe("Arabic");
  });

  test("mixed-script prompt reports script_count >= 2", () => {
    const f = extractUserPromptFeatures("Hello мир");
    expect(f.prompt_script_count).toBeGreaterThanOrEqual(2);
  });

  test("question_glyph_count counts ASCII + fullwidth + Arabic variants", () => {
    expect(extractUserPromptFeatures("Why?").prompt_question_glyph_count).toBe(1);
    expect(extractUserPromptFeatures("為什麼？").prompt_question_glyph_count).toBe(1);
    expect(extractUserPromptFeatures("لماذا؟").prompt_question_glyph_count).toBe(1);
    expect(extractUserPromptFeatures("Why? Why？ Why؟").prompt_question_glyph_count).toBe(3);
  });

  test("uppercase_ratio computed over letters only (digits/punct ignored)", () => {
    expect(extractUserPromptFeatures("ABCD efgh").prompt_uppercase_ratio).toBeCloseTo(0.5, 3);
    expect(extractUserPromptFeatures("abcd").prompt_uppercase_ratio).toBe(0);
    expect(extractUserPromptFeatures("ABCD").prompt_uppercase_ratio).toBe(1);
  });

  test("file_ref_count matches multi-segment paths with extension", () => {
    expect(extractUserPromptFeatures("src/foo/bar.ts").prompt_file_ref_count).toBeGreaterThanOrEqual(1);
    expect(extractUserPromptFeatures("no extension here").prompt_file_ref_count).toBe(0);
  });

  test("path_ref_count matches ./ ../ / prefixes", () => {
    expect(extractUserPromptFeatures("./foo/bar").prompt_path_ref_count).toBeGreaterThanOrEqual(1);
    expect(extractUserPromptFeatures("../up/dir").prompt_path_ref_count).toBeGreaterThanOrEqual(1);
    expect(extractUserPromptFeatures("/abs/path").prompt_path_ref_count).toBeGreaterThanOrEqual(1);
  });

  test("code_block_count = floor(fence_count / 2)", () => {
    expect(extractUserPromptFeatures("```code```").prompt_code_block_count).toBe(1);
    expect(extractUserPromptFeatures("```a``` ```b```").prompt_code_block_count).toBe(2);
    expect(extractUserPromptFeatures("```unpaired").prompt_code_block_count).toBe(0);
  });

  test("url_count matches http(s) URLs", () => {
    expect(extractUserPromptFeatures("see https://example.com").prompt_url_count).toBe(1);
    expect(extractUserPromptFeatures("a http://x and https://y").prompt_url_count).toBe(2);
    expect(extractUserPromptFeatures("no url here").prompt_url_count).toBe(0);
  });

  test("prompt_length equals JavaScript string length", () => {
    expect(extractUserPromptFeatures("hello").prompt_length).toBe(5);
    expect(extractUserPromptFeatures("şğı").prompt_length).toBe(3);
  });

  test("non-string input (defensive) → safe zero shape", () => {
    // @ts-expect-error — defensive boundary
    const f = extractUserPromptFeatures(null);
    expect(f.prompt_length).toBe(0);
    expect(f.prompt_script_primary).toBeNull();
    expect(f.prompt_word_tokens).toEqual([]);
  });

  test("no first_word field exists (per §11 spec removal)", () => {
    const f = extractUserPromptFeatures("Refactor auth");
    expect(f).not.toHaveProperty("prompt_first_word");
  });
});

describe("extractUserPromptFeatures — §11 Layer 3 (prompt_word_tokens)", () => {
  test("tokens are lowercased letter-only words ≥3 chars", () => {
    const f = extractUserPromptFeatures("Refactor THE auth module");
    expect(f.prompt_word_tokens).toContain("refactor");
    expect(f.prompt_word_tokens).toContain("the");
    expect(f.prompt_word_tokens).toContain("auth");
    expect(f.prompt_word_tokens).toContain("module");
  });

  test("tokens deduplicated within prompt (set semantics)", () => {
    const f = extractUserPromptFeatures("auth auth auth payments payments");
    expect(f.prompt_word_tokens.filter((t) => t === "auth").length).toBe(1);
    expect(f.prompt_word_tokens.filter((t) => t === "payments").length).toBe(1);
  });

  test("words shorter than 3 chars are excluded", () => {
    const f = extractUserPromptFeatures("a bi the auth");
    expect(f.prompt_word_tokens).not.toContain("a");
    expect(f.prompt_word_tokens).not.toContain("bi");
    expect(f.prompt_word_tokens).toContain("the");
    expect(f.prompt_word_tokens).toContain("auth");
  });

  test("non-Latin tokens carry through (Turkish, Chinese)", () => {
    const f1 = extractUserPromptFeatures("ödeme ödeme yapılır");
    expect(f1.prompt_word_tokens).toContain("ödeme");
    expect(f1.prompt_word_tokens.filter((t) => t === "ödeme").length).toBe(1);

    const f2 = extractUserPromptFeatures("认证 认证 测试");
    expect(f2.prompt_word_tokens.some((t) => t.length >= 3)).toBe(false);
  });

  test("punctuation does NOT survive in tokens", () => {
    const f = extractUserPromptFeatures("hello, world! testing.");
    for (const t of f.prompt_word_tokens) {
      expect(t).not.toMatch(/[,!.]/);
    }
  });

  test("digits do NOT survive in tokens (letters-only)", () => {
    const f = extractUserPromptFeatures("foo123 bar456");
    for (const t of f.prompt_word_tokens) {
      expect(t).not.toMatch(/[0-9]/);
    }
  });
});
