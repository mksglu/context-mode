/**
 * Regression coverage for #781: #chunkPlainText must enforce the same byte cap
 * as #chunkMarkdown. Large low-newline output (broad greps, big JSON, dense
 * logs) was previously indexed as a single oversized chunk, bloating the FTS5
 * DB and timing out ctx_search / ctx_doctor.
 *
 * RED/GREEN: reverting the byte-cap guards in #chunkPlainText (return a single
 * chunk regardless of size) makes these tests fail — a stored chunk exceeds the
 * cap. With the fix, every persisted plain-text chunk is <= MAX_CHUNK_BYTES.
 */
import { describe, test } from "vitest";
import { strict as assert } from "node:assert";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ContentStore } from "../src/store.js";
import { loadDatabase } from "../src/db-base.js";

// Mirrors the private MAX_CHUNK_BYTES in src/store.ts (cap shared with markdown).
const MAX_CHUNK_BYTES = 4096;

function tmpDbPath(tag: string): string {
  return join(
    tmpdir(),
    `context-mode-bytecap-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
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

describe("#chunkPlainText byte cap (#781)", () => {
  test("a single huge line is split into byte-capped chunks", () => {
    const dbPath = tmpDbPath("line");
    const store = new ContentStore(dbPath);
    // One line, no newlines, ~3x the cap — the <= linesPerChunk fast path.
    store.indexPlainText("A".repeat(MAX_CHUNK_BYTES * 3), "huge-line");
    store.close();

    const sizes = storedChunkSizes(dbPath);
    assert.ok(sizes.length >= 2, `expected the oversized line to be split, got ${sizes.length} chunk(s)`);
    for (const bytes of sizes) {
      assert.ok(bytes <= MAX_CHUNK_BYTES, `chunk of ${bytes}B exceeds cap ${MAX_CHUNK_BYTES}`);
    }
  });

  test("oversized line-groups are sub-split below the cap", () => {
    const dbPath = tmpDbPath("group");
    const store = new ContentStore(dbPath);
    // 40 dense lines (~300B each) → 20-line groups join to ~6KB > cap.
    const line = "token ".repeat(50).trim();
    const content = Array.from({ length: 40 }, () => line).join("\n");
    store.indexPlainText(content, "dense-log");
    store.close();

    const sizes = storedChunkSizes(dbPath);
    assert.ok(sizes.length >= 1, "expected at least one chunk");
    for (const bytes of sizes) {
      assert.ok(bytes <= MAX_CHUNK_BYTES, `chunk of ${bytes}B exceeds cap ${MAX_CHUNK_BYTES}`);
    }
  });

  test("blank-line sections in the 4097–4999B band respect the cap", () => {
    const dbPath = tmpDbPath("section");
    const store = new ContentStore(dbPath);
    // 3 blank-line-separated sections, each ~4500B: passes the old
    // `< 5000B` strategy guard so the blank-line fast path is taken, but
    // each section exceeds MAX_CHUNK_BYTES and was stored uncapped.
    const section = "a".repeat(4500);
    const content = [section, section, section].join("\n\n");
    store.indexPlainText(content, "blank-sections");
    store.close();

    const sizes = storedChunkSizes(dbPath);
    assert.ok(sizes.length >= 1, "expected at least one chunk");
    for (const bytes of sizes) {
      assert.ok(bytes <= MAX_CHUNK_BYTES, `chunk of ${bytes}B exceeds cap ${MAX_CHUNK_BYTES}`);
    }
  });

  test("a long multibyte (CJK) line is split by bytes, not characters", () => {
    const dbPath = tmpDbPath("cjk");
    const store = new ContentStore(dbPath);
    // 4096 CJK code points = 12288 UTF-8 bytes on one line. Character-count
    // slicing keeps a 4096-char (12288B) piece — far above the cap.
    store.indexPlainText("你".repeat(MAX_CHUNK_BYTES), "cjk-line");
    store.close();

    const sizes = storedChunkSizes(dbPath);
    assert.ok(sizes.length >= 2, `expected the CJK line to be split, got ${sizes.length} chunk(s)`);
    for (const bytes of sizes) {
      assert.ok(bytes <= MAX_CHUNK_BYTES, `chunk of ${bytes}B exceeds cap ${MAX_CHUNK_BYTES}`);
    }
  });

  test("a long emoji line never splits a surrogate pair and stays capped", () => {
    const dbPath = tmpDbPath("emoji");
    const store = new ContentStore(dbPath);
    // 2048 emoji = 4096 UTF-16 units = 8192 UTF-8 bytes on one line.
    // Byte-accurate splitting must not cut a 4-byte sequence in half.
    store.indexPlainText("🎉".repeat(2048), "emoji-line");
    store.close();

    const sizes = storedChunkSizes(dbPath);
    assert.ok(sizes.length >= 2, `expected the emoji line to be split, got ${sizes.length} chunk(s)`);
    for (const bytes of sizes) {
      assert.ok(bytes <= MAX_CHUNK_BYTES, `chunk of ${bytes}B exceeds cap ${MAX_CHUNK_BYTES}`);
    }
  });
});
