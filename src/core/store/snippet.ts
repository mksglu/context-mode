// D-SEARCH-7 (owner decision 2026-10-23): build a reply snippet from the stored chunk text.
// - Verbatim: the snippet is one contiguous slice of the stored text; no entity encoding, no markers.
// - Window by score: the text splits into blocks (fenced code blocks, paragraphs). Each block gets a
//   BM25-style score from the query terms (term weight x in-chunk idf x saturated tf, length-normalised).
//   The best block is the window; whole neighbour blocks join while the budget allows.
// - Fence-aware: a fenced block comes back whole up to codeMaxBytes. A larger fence returns its best
//   contiguous whole lines between the fence lines and a "[lines a-b of N]" marker.
// - Identifiers: a query word such as createConnection, func_data.message or src/a.ts is matched as
//   the whole symbol (double weight, double again inside code) and as its parts (camelCase, _ . / - :).
// A single line over the budget (no line break to cut at) is the only place a line is cut: at a space
// when one is near, else at a code-point boundary.
import { SNIPPET_CODE_MAX_BYTES } from "../contracts/constants.ts";

const K1 = 1.2; // BM25 tf saturation (Robertson/Zaragoza standard value)
const B = 0.75; // BM25 length normalisation (standard value)
const MAX_POSITIONS = 4096; // per term; bounds work on a huge single row

interface Term { text: string; weight: number; symbol: boolean; }
interface Block { first: number; last: number; code: boolean; }

function isAlnum(c: number): boolean {
  return (c >= 48 && c <= 57) || (c >= 97 && c <= 122) || (c >= 65 && c <= 90) || c > 127;
}
function isUpper(c: number): boolean { return c >= 65 && c <= 90; }
function isLowerOrDigit(c: number): boolean { return (c >= 97 && c <= 122) || (c >= 48 && c <= 57); }

// Split an identifier into parts at non-alphanumeric characters and at lower->Upper (camelCase).
function identParts(w: string): string[] {
  const parts: string[] = [];
  let cur = "";
  for (let i = 0; i < w.length; i++) {
    const c = w.charCodeAt(i);
    if (!isAlnum(c)) {
      if (cur !== "") parts.push(cur);
      cur = "";
      continue;
    }
    if (cur !== "" && isUpper(c) && isLowerOrDigit(w.charCodeAt(i - 1))) {
      parts.push(cur);
      cur = "";
    }
    cur += w[i];
  }
  if (cur !== "") parts.push(cur);
  return parts;
}

// Query words -> weighted terms (lower case). Whole symbol 2, its parts 1, a plain word 1.
export function snippetTerms(words: readonly string[]): Term[] {
  const out = new Map<string, Term>();
  const add = (text: string, weight: number, symbol: boolean): void => {
    if (text === "") return;
    const prev = out.get(text);
    if (!prev || prev.weight < weight) out.set(text, { text, weight, symbol });
  };
  for (const raw of words) {
    let a = 0;
    let b = raw.length;
    while (a < b && !isAlnum(raw.charCodeAt(a))) a++;
    while (b > a && !isAlnum(raw.charCodeAt(b - 1))) b--;
    const w = raw.slice(a, b);
    if (w === "") continue;
    const parts = identParts(w);
    if (parts.length > 1) {
      add(w.toLowerCase(), 2, true);
      for (const p of parts) if (p.length >= 2) add(p.toLowerCase(), 1, false);
    } else {
      add(w.toLowerCase(), 1, false);
    }
  }
  return [...out.values()];
}

function byteLen(s: string): number { return Buffer.byteLength(s, "utf8"); }

export function buildSnippet(row: string, given: readonly Term[], maxBytes: number, codeMaxBytes: number = SNIPPET_CODE_MAX_BYTES): string {
  if (row === "") return "";
  const codeCap = Math.max(maxBytes, codeMaxBytes);

  // ---- lines ----
  const ls: number[] = [];
  const le: number[] = [];
  for (let p = 0; ; ) {
    const n = row.indexOf("\n", p);
    ls.push(p);
    if (n < 0) { le.push(row.length); break; }
    le.push(n);
    p = n + 1;
  }
  const L = ls.length;
  const lb = new Array<number>(L);
  const cb = new Array<number>(L); // bytes of row before line i
  let acc = 0;
  for (let i = 0; i < L; i++) {
    cb[i] = acc;
    lb[i] = L === 1 ? byteLen(row) : byteLen(row.slice(ls[i], le[i]));
    acc += lb[i] + 1;
  }
  const rangeBytes = (i: number, j: number): number => cb[j] + lb[j] - cb[i];
  const slice = (i: number, j: number): string => row.slice(ls[i], le[j]);

  // ---- blocks: fences (``` or ~~~, up to 3 leading spaces) and blank-line separated paragraphs ----
  const fenceOf = (i: number): string => {
    let p = ls[i];
    const end = Math.min(le[i], p + 3);
    while (p < end && row.charCodeAt(p) === 32) p++;
    const c = row.charCodeAt(p);
    if ((c !== 96 && c !== 126) || row.charCodeAt(p + 1) !== c || row.charCodeAt(p + 2) !== c || p + 2 >= le[i]) return "";
    return row.slice(p, p + 3);
  };
  const blank = (i: number): boolean => {
    for (let p = ls[i]; p < le[i]; p++) {
      const c = row.charCodeAt(p);
      if (c !== 32 && c !== 9 && c !== 13) return false;
    }
    return true;
  };
  const blocks: Block[] = [];
  const fenceClose = new Map<number, number>(); // block index -> closing line (or -1 when unclosed)
  for (let i = 0; i < L; ) {
    const f = fenceOf(i);
    if (f !== "") {
      let j = i + 1;
      while (j < L && fenceOf(j) !== f) j++;
      const closed = j < L;
      fenceClose.set(blocks.length, closed ? j : -1);
      blocks.push({ first: i, last: closed ? j : L - 1, code: true });
      i = (closed ? j : L - 1) + 1;
      continue;
    }
    if (blank(i)) { i++; continue; }
    let j = i;
    while (j + 1 < L && !blank(j + 1) && fenceOf(j + 1) === "") j++;
    blocks.push({ first: i, last: j, code: false });
    i = j + 1;
  }
  if (blocks.length === 0) return clipLine(row, 0, row.length, -1, maxBytes);

  // ---- term positions (token-start matches, case-insensitive) ----
  const lower = row.toLowerCase();
  const hay = lower.length === row.length ? lower : row;
  const find = (t: Term): number[] => {
    const out: number[] = [];
    if (t.text === "") return out;
    for (let p = hay.indexOf(t.text); p >= 0 && out.length < MAX_POSITIONS; p = hay.indexOf(t.text, p + 1)) {
      const prev = p === 0 ? 32 : row.charCodeAt(p - 1);
      if (!isAlnum(prev) || (isLowerOrDigit(prev) && isUpper(row.charCodeAt(p)))) out.push(p);
    }
    return out;
  };
  let terms: readonly Term[] = given;
  let pos: number[][] = terms.map(find);
  // Typo fallback: the chunk came back by trigram or edit distance, so no query word is in it as typed.
  // Each word of 5+ characters then matches by its first max(4, length - 2) characters.
  if (pos.every((p) => p.length === 0)) {
    terms = given.filter((t) => t.text.length >= 5).map((t) => ({ ...t, text: t.text.slice(0, Math.max(4, t.text.length - 2)) }));
    pos = terms.map(find);
  }
  const count = (ti: number, a: number, b: number): number => {
    const ps = pos[ti];
    let lo = 0, hi = ps.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (ps[m] < a) lo = m + 1; else hi = m; }
    let n = 0;
    for (let k = lo; k < ps.length && ps[k] < b; k++) n++;
    return n;
  };

  // ---- BM25-style block scores ----
  const N = blocks.length;
  const blen = blocks.map((bk) => rangeBytes(bk.first, bk.last));
  const avg = blen.reduce((a, b) => a + b, 0) / N || 1;
  const tf: number[][] = blocks.map((bk) => terms.map((_, ti) => count(ti, ls[bk.first], le[bk.last])));
  const idf = terms.map((_, ti) => {
    let df = 0;
    for (let k = 0; k < N; k++) if (tf[k][ti] > 0) df++;
    return Math.log(1 + (N - df + 0.5) / (df + 0.5));
  });
  const weight = (ti: number, code: boolean): number => terms[ti].weight * (terms[ti].symbol && code ? 2 : 1) * idf[ti];
  const scores = blocks.map((bk, k) => {
    let s = 0;
    const norm = K1 * (1 - B + (B * blen[k]) / avg);
    terms.forEach((_, ti) => {
      const f = tf[k][ti];
      if (f > 0) s += (weight(ti, bk.code) * f * (K1 + 1)) / (f + norm);
    });
    return s;
  });
  let best = 0;
  for (let k = 1; k < N; k++) if (scores[k] > scores[best]) best = k;
  const bk = blocks[best];
  const lineScore = (i: number): number => {
    let s = 0;
    terms.forEach((_, ti) => { if (count(ti, ls[i], le[i]) > 0) s += weight(ti, bk.code); });
    return s;
  };
  const firstHit = (i: number): number => {
    let at = -1;
    let w = -1;
    terms.forEach((_, ti) => {
      const c = count(ti, ls[i], le[i]);
      if (c === 0 || weight(ti, bk.code) <= w) return;
      const ps = pos[ti];
      let lo = 0, hi = ps.length;
      while (lo < hi) { const m = (lo + hi) >> 1; if (ps[m] < ls[i]) lo = m + 1; else hi = m; }
      at = ps[lo];
      w = weight(ti, bk.code);
    });
    return at;
  };

  // Best contiguous run of whole lines in [a, b] that fits budget, grown from the best line.
  const lineWindow = (a: number, b: number, budget: number): [number, number] | null => {
    let anchor = a;
    let top = -1;
    for (let i = a; i <= b; i++) { const s = lineScore(i); if (s > top) { top = s; anchor = i; } }
    if (lb[anchor] > budget) return null;
    let i = anchor, j = anchor;
    for (;;) {
      const up = i > a && rangeBytes(i - 1, j) <= budget;
      const down = j < b && rangeBytes(i, j + 1) <= budget;
      if (!up && !down) break;
      if (up && down) { if (lineScore(i - 1) > lineScore(j + 1)) i--; else j++; }
      else if (up) i--;
      else j++;
    }
    return [i, j];
  };

  // ---- fenced code block ----
  if (bk.code) {
    if (blen[best] <= codeCap) return grow(best);
    const close = fenceClose.get(best) ?? -1;
    const open = bk.first;
    const innerA = open + 1;
    const innerB = close >= 0 ? close - 1 : bk.last;
    const total = innerB - innerA + 1;
    const openText = slice(open, open);
    const closeText = close >= 0 ? slice(close, close) : fenceOf(open);
    const markerMax = byteLen(`\n[lines ${total}-${total} of ${total}]`);
    const budget = codeCap - lb[open] - 1 - 1 - byteLen(closeText) - markerMax;
    if (total <= 0) return clipLine(row, ls[open], le[bk.last], -1, codeCap);
    const win = lineWindow(innerA, innerB, budget);
    if (win === null) {
      // One code line over the cap: the only cut inside a line (at a space or a code-point boundary).
      let anchor = innerA, top = -1;
      for (let i = innerA; i <= innerB; i++) { const s = lineScore(i); if (s > top) { top = s; anchor = i; } }
      const body = clipLine(row, ls[anchor], le[anchor], firstHit(anchor), Math.max(0, budget));
      const n = anchor - innerA + 1;
      return `${openText}\n${body}\n${closeText}\n[lines ${n}-${n} of ${total}]`;
    }
    const [i, j] = win;
    return `${openText}\n${slice(i, j)}\n${closeText}\n[lines ${i - innerA + 1}-${j - innerA + 1} of ${total}]`;
  }

  // ---- prose ----
  if (blen[best] <= maxBytes) return grow(best);
  const win = lineWindow(bk.first, bk.last, maxBytes);
  if (win !== null) return slice(win[0], win[1]);
  let anchor = bk.first, top = -1;
  for (let i = bk.first; i <= bk.last; i++) { const s = lineScore(i); if (s > top) { top = s; anchor = i; } }
  return clipLine(row, ls[anchor], le[anchor], firstHit(anchor), maxBytes);

  // Whole neighbour blocks join (higher score first, the next block on a tie) while they fit: a window
  // that holds a fenced block may use codeCap, a prose-only window maxBytes.
  function grow(k: number): string {
    let a = k, b = k;
    let code = blocks[k].code;
    const fits = (i: number, j: number, c: boolean): boolean => rangeBytes(blocks[i].first, blocks[j].last) <= (c ? codeCap : maxBytes);
    for (;;) {
      const up = a > 0 && fits(a - 1, b, code || blocks[a - 1].code);
      const down = b < N - 1 && fits(a, b + 1, code || blocks[b + 1].code);
      if (!up && !down) break;
      if (up && down) { if (scores[a - 1] > scores[b + 1]) a--; else b++; }
      else if (up) a--;
      else b++;
      code = code || blocks[a].code || blocks[b].code;
    }
    return slice(blocks[a].first, blocks[b].last);
  }
}

// Cut one over-budget line [s, e): start up to a quarter budget before the hit (at a space when one
// is there), take whole code points, end at the last space in the back half when one is there.
function clipLine(row: string, s: number, e: number, hit: number, budget: number): string {
  if (budget <= 0) return "";
  let start = s;
  if (hit > s) {
    start = Math.max(s, hit - (budget >> 2));
    if (start > s) {
      const sp = row.indexOf(" ", start);
      start = sp >= 0 && sp < hit ? sp + 1 : start;
    }
  }
  const cu = row.charCodeAt(start);
  if (start > s && cu >= 0xdc00 && cu <= 0xdfff) start++;
  let used = 0;
  let end = start;
  while (end < e) {
    const c = row.charCodeAt(end);
    const pair = c >= 0xd800 && c <= 0xdbff && end + 1 < e;
    const n = c < 0x80 ? 1 : c < 0x800 ? 2 : pair ? 4 : 3;
    if (used + n > budget) break;
    used += n;
    end += pair ? 2 : 1;
  }
  if (end < e) {
    const sp = row.lastIndexOf(" ", end - 1);
    if (sp > start && sp - start >= (end - start) >> 1) end = sp;
  }
  return row.slice(start, end);
}
