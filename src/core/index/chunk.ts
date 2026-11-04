// impl/05 §2, Assumption A2 (MAX_CHUNK_BYTES), TECH-SPEC GP5 (rowless tables, nested fences, byte caps),
// impl/00 rule 4 (no regex: every scan below is character by character), DEVIATIONS D-M2-T6-1.
// Chunks are spans of the normalized input: block text is never rewritten, and the only cut is the
// code-point-safe split of a single block over MAX_CHUNK_BYTES, whose remainder starts the next chunk.
import { MAX_CHUNK_BYTES } from "../contracts/constants.ts";
import type { Chunk } from "../contracts/types.ts";

interface Heading { level: number; text: string; }
// openEnd: index of the "\n" ending the opener line; closeStart: start of the closer line, -1 when unclosed.
interface FenceInfo { fence: string; openEnd: number; closeStart: number; }
interface Span { start: number; end: number; heading?: Heading; fence?: FenceInfo; }

// HTML grammar (not tunables): elements that never close, and elements whose body is raw text.
const VOID_TAGS: ReadonlySet<string> = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr",
]);
const RAW_TAGS: ReadonlySet<string> = new Set(["script", "style"]);

const encoder = new TextEncoder();

// maxBytes (D-M7-SV-1): a smaller chunk cap for the PostToolUse replace path; clamped to MAX_CHUNK_BYTES.
// Under a smaller cap an over-long block is cut after its last whole line that fits (the chunk keeps that
// newline); a single line over the small cap is its own whole chunk, and only a line over MAX_CHUNK_BYTES is
// cut by code point (D-HQ-PI-LINE-1).
// The default call is unchanged.
export function chunkText(text: string, kind: "md" | "html" | "text", maxBytes: number = MAX_CHUNK_BYTES): Chunk[] {
  const src = normalize(text);
  if (src.length === 0) return [];
  const cap = Math.max(4, Math.min(MAX_CHUNK_BYTES, Math.floor(maxBytes)));
  if (kind === "md") return mdChunks(src, cap, cap < MAX_CHUNK_BYTES);
  const blocks = kind === "html" ? htmlBlocks(src) : lineBlocks(src, false);
  return merge(src, blocks, kind !== "text", cap, cap < MAX_CHUNK_BYTES);
}

// Search layer 1 (DEVIATIONS D-SEARCH-1): "md" chunks never cross a heading and carry the heading path
// ("A > B > C") as `title`. Blocks of one section merge greedily up to the cap, so a fenced block that
// fits the cap is never split. A fenced block over the cap is split on its blank lines into pieces
// that each repeat the opener and closer lines, so every piece is a valid fenced block.
function mdChunks(src: string, cap: number, lineCut: boolean): Chunk[] {
  const out: Chunk[] = [];
  const stack: Heading[] = [];
  let title = "";
  let run: Span[] = [];
  const push = (text: string, bytes: number): void => {
    out.push({ ord: out.length, text, bytes, title });
  };
  const flush = (): void => {
    if (run.length === 0) return;
    for (const c of merge(src, run, true, cap, lineCut)) push(c.text, c.bytes);
    run = [];
  };
  for (const b of lineBlocks(src, true)) {
    if (b.heading !== undefined) {
      flush();
      while (stack.length > 0 && stack[stack.length - 1].level >= b.heading.level) stack.pop();
      stack.push(b.heading);
      title = stack.map((h) => h.text).join(" > ");
    }
    if (b.fence !== undefined && utf8Bytes(src.slice(b.start, b.end)) > cap) {
      const pieces = fencePieces(src, b, b.fence, cap);
      if (pieces !== undefined) {
        flush();
        for (const p of pieces) push(p, utf8Bytes(p));
        continue;
      }
    }
    run.push(b);
  }
  flush();
  return out;
}

// Opener line + "\n" + a run of the fence body's blank-line blocks + "\n" + closer line, each piece at
// most `cap` bytes. undefined when the fence lines alone leave no room (the block is then cut as text).
function fencePieces(src: string, b: Span, f: FenceInfo, cap: number): string[] | undefined {
  const opener = src.slice(b.start, f.openEnd);
  const closer = f.closeStart >= 0 ? src.slice(f.closeStart, b.end) : f.fence;
  const innerEnd = f.closeStart >= 0 ? Math.max(f.openEnd + 1, f.closeStart - 1) : b.end;
  const inner = src.slice(Math.min(f.openEnd + 1, innerEnd), innerEnd);
  const room = cap - utf8Bytes(opener) - utf8Bytes(closer) - 2;
  if (room < 16 || inner.length === 0) return undefined;
  return merge(inner, lineBlocks(inner, false), true, room, true).map((c) => opener + "\n" + c.text + "\n" + closer);
}

// Step 1: "\r\n" -> "\n", leading BOM removed.
function normalize(text: string): string {
  const lf = text.split("\r\n").join("\n");
  return lf.startsWith("﻿") ? lf.slice(1) : lf;
}

// Step 2, "text" and "md": a block is a run of non-empty lines. In "md", a blank line inside a fence
// is not a split point, a run of table lines (each containing "|") is its own block, an ATX heading
// line is its own block, and a fenced block is its own block (opener line to closer line).
function lineBlocks(src: string, md: boolean): Span[] {
  const out: Span[] = [];
  let start = -1;
  let end = -1;
  let inTable = false;
  let fence = "";
  let heading: Heading | undefined;
  let fenceInfo: FenceInfo | undefined;
  const close = (): void => {
    if (start >= 0) {
      const span: Span = { start, end };
      if (heading !== undefined) span.heading = heading;
      if (fenceInfo !== undefined) span.fence = fenceInfo;
      out.push(span);
    }
    start = -1;
    heading = undefined;
    fenceInfo = undefined;
  };
  const add = (from: number, to: number, table: boolean): void => {
    if (start < 0) start = from;
    end = to;
    inTable = table;
  };
  let pos = 0;
  while (pos <= src.length) {
    const nl = src.indexOf("\n", pos);
    const eol = nl < 0 ? src.length : nl;
    const line = src.slice(pos, eol);
    if (fence !== "") {
      add(pos, eol, false);
      if (closesFence(line, fence)) {
        fence = "";
        if (md && fenceInfo !== undefined) {
          fenceInfo.closeStart = pos;
          close();
        }
      }
    } else if (line.length === 0) {
      close();
    } else {
      const opener = md ? fenceOf(line) : "";
      const head = md && opener === "" ? headingOf(line) : undefined;
      const table = md && opener === "" && head === undefined && line.includes("|");
      if (md && start >= 0 && (table !== inTable || opener !== "" || head !== undefined)) close();
      add(pos, eol, table);
      fence = opener;
      if (opener !== "") fenceInfo = { fence: opener, openEnd: eol, closeStart: -1 };
      if (head !== undefined) {
        heading = head;
        close();
      }
    }
    pos = eol + 1;
  }
  close();
  return out;
}

/** D-SEARCH-1: true when some line of `text` is an ATX heading or opens a code fence (inline content is then chunked as "md"). */
export function hasMdStructure(text: string): boolean {
  let pos = 0;
  while (pos <= text.length) {
    const nl = text.indexOf("\n", pos);
    const eol = nl < 0 ? text.length : nl;
    const line = text.slice(pos, eol).replace("\r", "");
    if (fenceOf(line) !== "" || headingOf(line) !== undefined) return true;
    pos = eol + 1;
  }
  return false;
}

// An ATX heading: up to 3 spaces, 1-6 "#", then a space, a tab or the end of the line. The text drops
// a closing run of "#" that follows a space.
function headingOf(line: string): Heading | undefined {
  let i = 0;
  while (i < line.length && i < 4 && line[i] === " ") i += 1;
  if (i > 3) return undefined;
  let level = 0;
  while (i + level < line.length && line[i + level] === "#") level += 1;
  if (level < 1 || level > 6) return undefined;
  const after = line[i + level];
  if (after !== undefined && after !== " " && after !== "\t") return undefined;
  let text = line.slice(i + level).trim();
  let k = text.length;
  while (k > 0 && text[k - 1] === "#") k -= 1;
  if (k === 0) text = "";
  else if (k < text.length && (text[k - 1] === " " || text[k - 1] === "\t")) text = text.slice(0, k).trim();
  return { level, text };
}

// The fence string a line opens: the full run of "`" or "~" (three or more) after leading spaces.
function fenceOf(line: string): string {
  const t = line.trimStart();
  if (!t.startsWith("```") && !t.startsWith("~~~")) return "";
  let n = 0;
  while (n < t.length && t[n] === t[0]) n += 1;
  return t.slice(0, n);
}

// A fence closes on a line made only of the same fence character, at least as long as the opener.
function closesFence(line: string, fence: string): boolean {
  const t = line.trim();
  if (t.length < fence.length) return false;
  for (let i = 0; i < t.length; i += 1) if (t[i] !== fence[0]) return false;
  return true;
}

// Step 2, "html": split after a closing tag that brings the open-element depth back to 0.
// Depth is the sum of per-name counters; a stray close tag (counter 0) is ignored. Comments and
// <script>/<style> bodies are skipped whole, so no split lands inside them.
function htmlBlocks(src: string): Span[] {
  const out: Span[] = [];
  const open = new Map<string, number>();
  let depth = 0;
  let blockStart = 0;
  let i = 0;
  const split = (at: number): void => {
    pushTrimmed(out, src, blockStart, at);
    blockStart = at;
  };
  while (i < src.length) {
    if (src[i] !== "<") {
      i += 1;
      continue;
    }
    if (src.startsWith("<!--", i)) {
      const e = src.indexOf("-->", i + "<!--".length);
      i = e < 0 ? src.length : e + "-->".length;
      continue;
    }
    const tag = readTag(src, i);
    if (tag === undefined) {
      i += 1;
      continue;
    }
    i = tag.end;
    if (tag.close) {
      const n = open.get(tag.name) ?? 0;
      if (n === 0) continue;
      open.set(tag.name, n - 1);
      depth -= 1;
      if (depth === 0) split(i);
      continue;
    }
    if (tag.selfClose || VOID_TAGS.has(tag.name)) continue;
    if (RAW_TAGS.has(tag.name)) {
      i = rawEnd(src, i, tag.name);
      if (depth === 0) split(i);
      continue;
    }
    open.set(tag.name, (open.get(tag.name) ?? 0) + 1);
    depth += 1;
  }
  pushTrimmed(out, src, blockStart, src.length);
  return out;
}

interface Tag { name: string; close: boolean; selfClose: boolean; end: number; }

function isLetter(c: string): boolean {
  return (c >= "a" && c <= "z") || (c >= "A" && c <= "Z");
}

function isNameChar(c: string): boolean {
  return isLetter(c) || (c >= "0" && c <= "9") || c === "-" || c === ":";
}

// Reads "<name ...>" or "</name ...>" at i. Quoted attribute values may hold ">". Anything else
// (no letter after "<", or no closing ">") is text, not a tag.
function readTag(src: string, i: number): Tag | undefined {
  let j = i + 1;
  const close = src[j] === "/";
  if (close) j += 1;
  if (j >= src.length || !isLetter(src[j])) return undefined;
  const nameStart = j;
  while (j < src.length && isNameChar(src[j])) j += 1;
  const name = src.slice(nameStart, j).toLowerCase();
  let quote = "";
  while (j < src.length) {
    const c = src[j];
    if (quote !== "") {
      if (c === quote) quote = "";
    } else if (c === "\"" || c === "'") {
      quote = c;
    } else if (c === ">") {
      break;
    }
    j += 1;
  }
  if (j >= src.length) return undefined;
  return { name, close, selfClose: src[j - 1] === "/", end: j + 1 };
}

// End of a raw-text element body: just past the ">" of its "</name" close tag, or end of input.
function rawEnd(src: string, from: number, name: string): number {
  let k = src.indexOf("</", from);
  while (k >= 0) {
    const after = k + "</".length + name.length;
    const named = src.slice(k + "</".length, after).toLowerCase() === name;
    if (named && (after >= src.length || !isNameChar(src[after]))) {
      const gt = src.indexOf(">", after);
      return gt < 0 ? src.length : gt + 1;
    }
    k = src.indexOf("</", k + "</".length);
  }
  return src.length;
}

function isSpace(c: string): boolean {
  return c === " " || c === "\n" || c === "\t" || c === "\f" || c === "\r";
}

function pushTrimmed(out: Span[], src: string, start: number, end: number): void {
  let s = start;
  let e = end;
  while (s < e && isSpace(src[s])) s += 1;
  while (e > s && isSpace(src[e - 1])) e -= 1;
  if (s < e) out.push({ start: s, end: e });
}

function utf8Bytes(s: string): number {
  return Buffer.byteLength(s, "utf8");
}

// Step 4: the longest prefix of src[start, end) that fits MAX_CHUNK_BYTES, ending on a code point.
// TextEncoder.encodeInto never writes part of a code point; the slice end is moved back one unit
// when it would split a surrogate pair.
function cutPoint(src: string, start: number, end: number, scratch: Uint8Array): { end: number; written: number } {
  let limit = Math.min(end, start + scratch.length);
  if (limit < end && [...src.slice(limit - 1, limit + 1)].length === 1) limit -= 1;
  const r = encoder.encodeInto(src.slice(start, limit), scratch);
  return { end: start + r.read, written: r.written };
}

// Steps 3-5: greedy merge of blocks into chunks of at most MAX_CHUNK_BYTES. A merged chunk is the
// input span from its first block to its last, so the text between blocks stays as written.
// "text" blocks are not merged: each blank-line block is its own chunk (DEVIATIONS D-M2-T6-1).
function merge(src: string, blocks: Span[], join: boolean, cap: number, lineCut: boolean): Chunk[] {
  const out: Chunk[] = [];
  const scratch = new Uint8Array(cap);
  let wide: Uint8Array | undefined;
  let cur: Span | undefined;
  let curBytes = 0;
  const emit = (start: number, end: number, bytes: number): void => {
    out.push({ ord: out.length, text: src.slice(start, end), bytes });
  };
  for (const b of blocks) {
    if (cur !== undefined && !join) {
      emit(cur.start, cur.end, curBytes);
      cur = undefined;
    }
    if (cur !== undefined) {
      const add = utf8Bytes(src.slice(cur.end, b.end));
      if (curBytes + add <= cap) {
        cur.end = b.end;
        curBytes += add;
        continue;
      }
      emit(cur.start, cur.end, curBytes);
      cur = undefined;
    }
    let start = b.start;
    let bytes = utf8Bytes(src.slice(b.start, b.end));
    while (bytes > cap) {
      const cut = cutPoint(src, start, b.end, scratch);
      const nl = lineCut ? src.lastIndexOf("\n", cut.end - 1) : -1;
      if (nl > start) { // whole lines: the chunk keeps its last newline, so no byte of the text is dropped
        const w = utf8Bytes(src.slice(start, nl + 1));
        emit(start, nl + 1, w);
        start = nl + 1;
        bytes -= w;
        continue;
      }
      if (lineCut) {
        // D-HQ-PI-LINE-1: one line over the small cap is its own chunk, whole, up to MAX_CHUNK_BYTES; only a
        // line over MAX_CHUNK_BYTES is cut by code point. A search hit then holds the whole line.
        const eol = src.indexOf("\n", start);
        const lineEnd = eol < 0 || eol >= b.end ? b.end : eol + 1;
        const w = utf8Bytes(src.slice(start, lineEnd));
        if (w <= MAX_CHUNK_BYTES) {
          emit(start, lineEnd, w);
          start = lineEnd;
          bytes -= w;
          continue;
        }
        wide ??= new Uint8Array(MAX_CHUNK_BYTES);
        const big = cutPoint(src, start, lineEnd, wide);
        emit(start, big.end, big.written);
        start = big.end;
        bytes -= big.written;
        continue;
      }
      emit(start, cut.end, cut.written);
      start = cut.end;
      bytes -= cut.written;
    }
    if (start >= b.end) continue; // the whole block went out as whole lines
    cur = { start, end: b.end };
    curBytes = bytes;
  }
  if (cur !== undefined) emit(cur.start, cur.end, curBytes);
  return out;
}
