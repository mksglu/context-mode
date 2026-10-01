/**
 * blocks — block-level template/content extraction for fetched documents.
 *
 * WHY THIS EXISTS
 * ───────────────
 * A format converter answers "what format". It can never answer "which part of
 * the page". Turndown (and Cloudflare's `toMarkdown`, and every other
 * converter) transliterates the whole document, chrome included: nav lists,
 * sidebars, footers, cookie banners. Bolting a link-density or byte threshold
 * onto the converter is a symptom detector — it guesses from the shape of a
 * single page, and the right threshold differs per host. Measured 2026-08-12 on
 * the shipped converter: link-only lines are 28.3% of the Stripe API reference
 * and 0.3% of the Resend send-email page. No single number separates those.
 *
 * The signal that does work needs no threshold at all:
 *
 *   CHROME IS WHAT REPEATS ACROSS PAGES OF THE SAME HOST.
 *   CONTENT IS WHAT DOES NOT.
 *
 * Every page of docs.stripe.com carries the same nav; only the article differs.
 * So a block is classified `template` only when that exact block was already
 * seen on a DIFFERENT page of the same host. The rule never guesses from the
 * shape of one page, which makes it lossless by construction.
 *
 * NO DATA LOSS MEANS LABEL, NEVER DROP
 * ────────────────────────────────────
 * This module only ever LABELS. It does not delete, trim, summarise or
 * truncate. `splitBlocks` is exactly reversible — see `reassemble`, and the
 * invariant test that asserts `reassemble(splitBlocks(x)) === x` byte for byte.
 * The caller stores every block; only `content` blocks reach the search index.
 *
 * No regular expressions anywhere (repo-wide ban): all scanning is explicit
 * character and prefix work.
 */

import { createHash } from "node:crypto";

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────

export interface Block {
  /** 0-based position in the document. */
  ordinal: number;
  /**
   * The block's source bytes VERBATIM, including the newlines and blank-line
   * separators that followed it. Concatenating `raw` over all blocks in
   * ordinal order reproduces the input document exactly.
   */
  raw: string;
  /** The block's visible text: `raw` with leading/trailing whitespace removed. */
  text: string;
  /** sha256 (full digest, never shortened) of the normalised text. */
  hash: string;
}

export type BlockKind = "content" | "template";

export interface ClassifiedBlock extends Block {
  kind: BlockKind;
}

export interface ClassifyResult {
  blocks: ClassifiedBlock[];
  /**
   * True when this host had no other recorded page at classification time, so
   * every block was admitted as `content` on no evidence. The caller must
   * re-run classification for this page once a second page of the host lands.
   */
  provisional: boolean;
  /**
   * True when every block of this page was already seen on other pages of the
   * host — the fetch returned the site shell, not this page. The caller must
   * refuse rather than index it.
   */
  allTemplate: boolean;
  contentBytes: number;
  templateBytes: number;
}

// ─────────────────────────────────────────────────────────
// Splitting
// ─────────────────────────────────────────────────────────

/** True when `s` starts with `prefix`. Explicit so no regex is involved. */
function startsWith(s: string, prefix: string): boolean {
  return s.lastIndexOf(prefix, 0) === 0;
}

function isSpace(ch: string): boolean {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r" || ch === "\f" || ch === "\v";
}

/** Trim ASCII whitespace from both ends without a regex. */
function trimEdges(s: string): string {
  let start = 0;
  let end = s.length;
  while (start < end && isSpace(s.charAt(start))) start++;
  while (end > start && isSpace(s.charAt(end - 1))) end--;
  return start === 0 && end === s.length ? s : s.substring(start, end);
}

/**
 * Split a document into lines, KEEPING each line's terminator on the line.
 * Concatenating the result reproduces the input exactly — the property the
 * whole lossless story rests on.
 */
function splitLinesKeepEnds(text: string): string[] {
  const lines: string[] = [];
  let lineStart = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charAt(i) === "\n") {
      lines.push(text.substring(lineStart, i + 1));
      lineStart = i + 1;
    }
  }
  if (lineStart < text.length) lines.push(text.substring(lineStart));
  return lines;
}

/**
 * Split converted markdown into blocks.
 *
 * A block boundary is a blank line, or a heading line, outside a fenced code
 * block. Blank lines stay attached to the block they follow, so every input
 * byte belongs to exactly one block and `reassemble` is exact.
 *
 * Fenced code is never split: a nav list and a JSON example must each be a
 * single unit, or a code sample that happens to share one line with another
 * page would be classified independently of its surroundings.
 */
export function splitBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  if (markdown.length === 0) return blocks;

  const lines = splitLinesKeepEnds(markdown);
  let rawParts: string[] = [];
  let hasText = false;
  let fenceCharacter = "";
  let fenceLength = 0;
  let pendingBreak = false;

  const flush = (): void => {
    if (rawParts.length === 0) return;
    const raw = rawParts.join("");
    const text = trimEdges(raw);
    blocks.push({ ordinal: blocks.length, raw, text, hash: hashBlockText(text) });
    rawParts = [];
    hasText = false;
  };

  for (const line of lines) {
    const trimmed = trimEdges(line);
    const inFence = fenceLength > 0;
    // CommonMark fences open with at least three identical characters and
    // close only with the same character, at least the opening length, and
    // trailing whitespace. Shorter or mixed fences are literal code content.
    let indentation = 0;
    while (line.charAt(indentation) === " ") indentation++;
    const character = line.charAt(indentation);
    let markerLength = 0;
    if (indentation <= 3 && (character === "`" || character === "~")) {
      while (line.charAt(indentation + markerLength) === character) markerLength++;
    }
    const remainder = line.substring(indentation + markerLength);
    let closingWhitespace = true;
    for (const ch of remainder) {
      if (ch !== " " && ch !== "\t" && ch !== "\r" && ch !== "\n") {
        closingWhitespace = false;
        break;
      }
    }
    const isFenceMarker = markerLength >= 3 && (inFence
      ? character === fenceCharacter && markerLength >= fenceLength &&
        closingWhitespace
      : character !== "`" || !remainder.includes("`"));
    const blank = !inFence && trimmed.length === 0;
    const heading = !inFence && !isFenceMarker && startsWith(trimmed, "#");

    // A new block starts at the first non-blank line after a blank run, or at
    // a heading — but only if the block being built already carries text, so
    // leading separators never produce an empty block.
    if (!blank && (pendingBreak || heading) && hasText) {
      flush();
      pendingBreak = false;
    }

    if (isFenceMarker) {
      fenceCharacter = inFence ? "" : character;
      fenceLength = inFence ? 0 : markerLength;
    }

    rawParts.push(line);
    if (!blank) hasText = true;
    if (blank) pendingBreak = true;
  }
  flush();
  return blocks;
}

/**
 * Exact inverse of `splitBlocks`. `reassemble(splitBlocks(x)) === x` for every
 * input — this is the formal statement of "nothing was lost".
 */
export function reassemble(blocks: Array<{ raw: string }>): string {
  let out = "";
  for (const b of blocks) out += b.raw;
  return out;
}

// ─────────────────────────────────────────────────────────
// Hashing
// ─────────────────────────────────────────────────────────

/**
 * Normalise a block for cross-page comparison: lower-cased, with every run of
 * whitespace collapsed to a single space. Two renderings of the same nav that
 * differ only in indentation or line wrapping must hash identically, or the
 * repeat is missed and chrome leaks into the index.
 *
 * Deliberately conservative: no punctuation stripping, no token dropping. A
 * looser normaliser risks collapsing two DIFFERENT blocks to one hash, which
 * would demote real content. Under-matching leaks chrome (recoverable, and
 * visible); over-matching hides content (a silent loss, which is forbidden).
 */
export function normalizeBlockText(text: string): string {
  let out = "";
  let inRun = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charAt(i);
    if (isSpace(ch)) {
      inRun = true;
      continue;
    }
    if (inRun && out.length > 0) out += " ";
    inRun = false;
    out += ch;
  }
  return out.toLowerCase();
}

/** Full sha256 hex digest of the normalised block. Never shortened. */
export function hashBlockText(text: string): string {
  return createHash("sha256").update(normalizeBlockText(text), "utf-8").digest("hex");
}

// ─────────────────────────────────────────────────────────
// Classification
// ─────────────────────────────────────────────────────────

export interface ClassifyOptions {
  blocks: Block[];
  /**
   * Number of DISTINCT other pages of this host on which the given block hash
   * has been seen. Must exclude the page being classified, or a page compared
   * against itself marks its own article as template.
   */
  otherPageCount: (hash: string) => number;
  /** Distinct pages already recorded for this host, excluding the current one. */
  hostPageCount: number;
  /**
   * Set when the document came straight from the site's own machine-readable
   * endpoint. Such a document was authored for machines and carries no chrome
   * to classify, so every block is content and the result is never provisional.
   */
  authored?: boolean;
}

/**
 * Classify every block of one page.
 *
 * COLD START — the honest hard case. The first page of a host has no
 * comparison set, so there is no evidence on which to call anything template.
 * The decision here is to admit EVERY block as `content`, mark the page
 * `provisional`, and re-run the moment a second page of that host arrives.
 *
 * The alternative — guessing per-block from link density, position or
 * container on page one — is rejected on the measurements above: the correct
 * threshold is 28.3% on Stripe and 0.3% on Resend, so any fixed value demotes
 * real content on one of them. Over-indexing on page one is fully recoverable
 * (the re-run removes the chrome, and the page's own bytes were never
 * discarded); under-indexing is a silent loss with nothing left to detect it.
 * Never demote on evidence we do not have.
 */
export function classifyBlocks(opts: ClassifyOptions): ClassifyResult {
  const { blocks, otherPageCount, hostPageCount, authored } = opts;
  const coldStart = !authored && hostPageCount < 1;

  const classified: ClassifiedBlock[] = [];
  let contentBytes = 0;
  let templateBytes = 0;
  let sawContent = false;
  let sawTextBlock = false;

  for (const b of blocks) {
    // A whitespace-only separator carries no information either way; keep it
    // as content so reassembly of the content stream stays readable.
    const textual = b.text.length > 0;
    if (textual) sawTextBlock = true;
    const repeated = textual && !authored && !coldStart && otherPageCount(b.hash) >= 1;
    const kind: BlockKind = repeated ? "template" : "content";
    if (kind === "content") {
      if (textual) sawContent = true;
      contentBytes += Buffer.byteLength(b.text, "utf-8");
    } else {
      templateBytes += Buffer.byteLength(b.text, "utf-8");
    }
    classified.push({ ...b, kind });
  }

  return {
    blocks: classified,
    provisional: coldStart,
    // Every textual block of this page already exists on other pages of this
    // host: the response carried no page-specific content at all.
    allTemplate: sawTextBlock && !sawContent,
    contentBytes,
    templateBytes,
  };
}

/**
 * The text that goes to the search index: the `content` blocks, in document
 * order, joined by their own separators. Template blocks are NOT deleted —
 * the caller has already stored every block verbatim; they are simply left
 * out of the index.
 */
export function contentText(blocks: ClassifiedBlock[]): string {
  let out = "";
  for (const b of blocks) {
    if (b.kind === "content") out += b.raw;
  }
  return trimEdges(out);
}

/** The template stream, in document order. Stored and retrievable, never indexed. */
export function templateText(blocks: ClassifiedBlock[]): string {
  let out = "";
  for (const b of blocks) {
    if (b.kind === "template") out += b.raw;
  }
  return trimEdges(out);
}
