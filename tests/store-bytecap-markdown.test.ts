/**
 * Regression coverage for #878: #chunkMarkdown must enforce MAX_CHUNK_BYTES
 * even when a single paragraph / line / fenced code block exceeds the cap.
 *
 * The pre-fix paragraph-boundary splitter guarded the flush with
 *     accumulator.length > 1
 * so a single oversized paragraph passed flushAccumulator() unchanged and
 * landed in `chunks` (and `chunks_trigram`) at full size. This is reachable
 * through `ctx_batch_execute`, which wraps command stdout under a Markdown
 * heading and routes the payload to `store.index(...)` — the Markdown chunker.
 *
 * RED/GREEN: reverting #chunkMarkdown to flush only when accumulator.length > 1
 * makes every test below fail with a stored chunk above the cap. With the fix,
 * every persisted markdown chunk is <= MAX_CHUNK_BYTES (modulo the documented
 * 1-4 byte multibyte-codepoint overshoot).
 */
import { describe, test } from "vitest";
import { strict as assert } from "node:assert";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ContentStore } from "../src/store.js";
import { loadDatabase } from "../src/db-base.js";

// Mirrors the private MAX_CHUNK_BYTES in src/store.ts.
const MAX_CHUNK_BYTES = 4096;
// Multibyte code-point overshoot tolerance documented on #byteCappedPrefix.
const OVERSHOOT_TOLERANCE = 4;

function tmpDbPath(tag: string): string {
  return join(
    tmpdir(),
    `context-mode-bytecap-md-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
  );
}

function storedChunkSizes(dbPath: string): number[] {
  const Database = loadDatabase();
  const db = new Database(dbPath, { readonly: true });
  try {
    const rows = db
      .prepare("SELECT content FROM chunks")
      .all() as Array<{ content: string }>;
    return rows.map((r) => Buffer.byteLength(r.content));
  } finally {
    db.close();
  }
}

describe("#chunkMarkdown byte cap (#878)", () => {
  test("one oversized paragraph under a heading is split below the cap", () => {
    const dbPath = tmpDbPath("paragraph");
    const store = new ContentStore(dbPath);
    // Mirrors ctx_batch_execute: `# <label>\n\n<command stdout>`.
    const para = "a".repeat(MAX_CHUNK_BYTES * 3);
    const md = `# Synthetic oversized line\n\n${para}`;
    store.index({ content: md, source: "synthetic-oversized" });
    store.close();

    const sizes = storedChunkSizes(dbPath);
    assert.ok(
      sizes.length >= 2,
      `expected the oversized paragraph to be split, got ${sizes.length} chunk(s)`,
    );
    for (const bytes of sizes) {
      assert.ok(
        bytes <= MAX_CHUNK_BYTES + OVERSHOOT_TOLERANCE,
        `chunk of ${bytes}B exceeds cap ${MAX_CHUNK_BYTES}`,
      );
    }
  });

  test("one oversized single line (no paragraph breaks) stays capped", () => {
    const dbPath = tmpDbPath("line");
    const store = new ContentStore(dbPath);
    // No double-newline: the paragraph splitter sees one paragraph that is
    // itself one giant line. Both the paragraph guard and the line splitter
    // must hold.
    const md = `# Big single line\n${"a".repeat(MAX_CHUNK_BYTES * 2)}`;
    store.index({ content: md, source: "single-line" });
    store.close();

    const sizes = storedChunkSizes(dbPath);
    assert.ok(sizes.length >= 2, `expected the long line to be split, got ${sizes.length} chunk(s)`);
    for (const bytes of sizes) {
      assert.ok(
        bytes <= MAX_CHUNK_BYTES + OVERSHOOT_TOLERANCE,
        `chunk of ${bytes}B exceeds cap ${MAX_CHUNK_BYTES}`,
      );
    }
  });

  test("one oversized fenced code block is split below the cap", () => {
    const dbPath = tmpDbPath("code");
    const store = new ContentStore(dbPath);
    // Fenced code blocks are collected as a unit by #chunkMarkdown — so an
    // oversized fence used to land in a single chunk too.
    const body = "console.log('x');\n".repeat(400); // ~7KB
    const md = `# Big code\n\n\`\`\`ts\n${body}\`\`\`\n`;
    store.index({ content: md, source: "big-code" });
    store.close();

    const sizes = storedChunkSizes(dbPath);
    assert.ok(sizes.length >= 1, "expected at least one chunk");
    for (const bytes of sizes) {
      assert.ok(
        bytes <= MAX_CHUNK_BYTES + OVERSHOOT_TOLERANCE,
        `chunk of ${bytes}B exceeds cap ${MAX_CHUNK_BYTES}`,
      );
    }
  });

  test("oversized multibyte (CJK) paragraph is byte-split, not character-split", () => {
    const dbPath = tmpDbPath("cjk");
    const store = new ContentStore(dbPath);
    // 4096 CJK code points = 12288 UTF-8 bytes in one paragraph.
    const md = `# CJK\n\n${"你".repeat(MAX_CHUNK_BYTES)}`;
    store.index({ content: md, source: "cjk-paragraph" });
    store.close();

    const sizes = storedChunkSizes(dbPath);
    assert.ok(sizes.length >= 2, `expected CJK paragraph to be split, got ${sizes.length} chunk(s)`);
    for (const bytes of sizes) {
      assert.ok(
        bytes <= MAX_CHUNK_BYTES + OVERSHOOT_TOLERANCE,
        `chunk of ${bytes}B exceeds cap ${MAX_CHUNK_BYTES}`,
      );
    }
  });

  test("ctx_batch_execute heading-wrapped oversized output stays capped (#878 repro)", () => {
    const dbPath = tmpDbPath("batch");
    const store = new ContentStore(dbPath);
    // Replicates the exact ctx_batch_execute synthetic repro from the issue:
    // ~1.2MB of 'a' plus a search needle, wrapped under "# <label>".
    const payload = "a".repeat(1_200_000) + " needleXYZ";
    const md = `# Synthetic oversized line\n\n${payload}`;
    store.index({ content: md, source: "batch-repro" });
    store.close();

    const sizes = storedChunkSizes(dbPath);
    assert.ok(sizes.length >= 2, `expected oversized batch output to be split, got ${sizes.length}`);
    for (const bytes of sizes) {
      assert.ok(
        bytes <= MAX_CHUNK_BYTES + OVERSHOOT_TOLERANCE,
        `chunk of ${bytes}B exceeds cap ${MAX_CHUNK_BYTES}`,
      );
    }
  });
});
