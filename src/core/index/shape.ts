// D-M2-SHAPE-1: shape by content type. A replaced tool output whose structure a parser finds is reduced to
// its rare units: the rows or lines that break the structure every other row or line follows. The rare units
// the query names (BM25, any word) are returned whole, within the replace budget, with a one-line count of
// the structure; the caller adds the retrieval handle. No shape, no rare unit, or no rare unit the query
// names -> null, and the caller keeps the BM25 chunk path unchanged. Detectors are parsers and statistics
// over the content (JSON.parse, token clusters), never a pattern match on the content. Nothing is cut
// mid-unit: a line is whole; a JSON row keeps whole fields (key and value), the full row stays indexed.
//
// JSON: an array of SHAPE_MIN_ROWS+ objects. Per key with scalar values, the values of all rows are counted
// (an absent key is its own value). A key is skewed when one value holds >= SHAPE_DOMINANT of the rows and
// the other values hold at most SHAPE_RARE_MAX rows; the rows with those other values are rare.
//
// Lines: a Drain-style template miner. A token with a digit is a variable (<*>). Lines are grouped by token
// count and first token; in a group a line joins the first cluster whose template matches at least
// SHAPE_SIMILARITY of its positions (a <*> matches any token), and positions that differ become <*>. More
// than SHAPE_MAX_CLUSTERS clusters, or a common cluster with no literal token -> not a log (null). A
// cluster of at most SHAPE_RARE_MAX lines is rare, and so is a line whose token at a skewed position of its
// cluster (the JSON rule, per position) is a rare token.
import { rankTexts } from "../store/fts.ts";

const SHAPE_MIN_ROWS = 20; // fewer rows or lines: no statistics to stand on
const SHAPE_RARE_MAX = 2; // a value, token or template seen in at most 2 rows is rare
const SHAPE_RARE_UNITS_MAX = 9; // more rare units than this: the structure is not a strong one
const SHAPE_CATEGORICAL_MAX = 8; // a key or position with at most this many distinct values is categorical (D-M2-MCP-2)
const SHAPE_DOMINANT = 0.9; // the common value of a skewed key or position holds 90% of the rows
const SHAPE_SIMILARITY = 0.5; // Drain similarity threshold
const SHAPE_MAX_CLUSTERS = 64; // more templates than this: free text or code, not a log
const SHAPE_EXTREME_KEYS = 2; // D-M2-JSON-2: a query that names more numeric keys than this is not asking for one extreme
const SHAPE_COMMON_MAX = 4; // more common templates than this: not a uniform log
const SEP = "\n";
const ABSENT = "(absent)";

interface Unit { pos: number; rank: string; render: (budget: number) => string | null }
// direct (D-M2-JSON-2): the units were chosen by a statistic over the rows, not by the query; every one is kept.
interface Shape { header: string; units: Unit[]; direct?: boolean }

const bytes = (s: string): number => Buffer.byteLength(s, "utf8");

/** The digest of `text` within `budget` bytes, or null when no shape or no rare unit the query names. */
export function shapeDigest(text: string, query: string, budget: number): string | null {
  const shape = jsonShape(text, query) ?? jsonExtremes(text, query) ?? lineShape(text);
  if (shape === null || query.trim() === "") return null;
  const scores = shape.direct === true ? shape.units.map(() => 1) : rankTexts(shape.units.map((u) => u.rank), query, "any");
  const order = shape.units.map((_, i) => i).filter((i) => scores[i] > 0).sort((a, b) => scores[b] - scores[a] || shape.units[a].pos - shape.units[b].pos);
  const picked: Array<{ pos: number; text: string }> = [];
  let used = 0;
  for (const i of order) {
    const sep = picked.length > 0 ? bytes(SEP) : 0;
    const r = shape.units[i].render(budget - used - sep);
    if (r === null || used + sep + bytes(r) > budget) continue; // skipped; a smaller one may still fit
    picked.push({ pos: shape.units[i].pos, text: r });
    used += sep + bytes(r);
  }
  if (picked.length === 0) return null;
  picked.sort((a, b) => a.pos - b.pos);
  const body = picked.map((p) => p.text);
  if (used + bytes(SEP) + bytes(shape.header) <= budget) body.unshift(shape.header);
  return body.join(SEP);
}

// ---------- JSON ----------

function firstNonSpace(s: string): string {
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c !== " " && c !== "\n" && c !== "\r" && c !== "\t") return c;
  }
  return "";
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// Skewed-value outliers, shared by JSON keys and log token positions: the rows of the non-dominant values.
function rareOfSkewed(n: number, counts: Map<string, number[]>, totals: Map<string, number>): number[] {
  if (totals.size < 2 || totals.size > SHAPE_CATEGORICAL_MAX) return [];
  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  if (totals.size <= SHAPE_RARE_MAX + 1) {
    if (sorted[0][1] < SHAPE_DOMINANT * n || n - sorted[0][1] > SHAPE_RARE_MAX) return [];
    return sorted.slice(1).flatMap(([v]) => counts.get(v) ?? []);
  }
  // D-M2-MCP-2: a categorical key with no dominant value: the values seen in at most SHAPE_RARE_MAX rows are
  // rare when the other values (each common) hold the rest and there are at least two of them.
  const common = sorted.filter(([, c]) => c > SHAPE_RARE_MAX);
  const oneOff = sorted.filter(([, c]) => c <= SHAPE_RARE_MAX);
  if (common.length < 2 || oneOff.length === 0) return [];
  return oneOff.flatMap(([v]) => counts.get(v) ?? []);
}

/** The rows of a JSON array of SHAPE_MIN_ROWS+ objects, with every key in first-seen order; else null. */
export function jsonRows(text: string): { objs: Record<string, unknown>[]; keys: string[] } | null {
  if (firstNonSpace(text) !== "[") return null;
  let rows: unknown;
  try {
    rows = JSON.parse(text);
  } catch {
    return null;
  }
  if (!Array.isArray(rows) || rows.length < SHAPE_MIN_ROWS || !rows.every(isPlainObject)) return null;
  const objs = rows as Record<string, unknown>[];
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const o of objs) for (const k of Object.keys(o)) if (!seen.has(k)) { seen.add(k); keys.push(k); }
  return { objs, keys };
}

const schemaOf = (n: number, keys: string[]): string => n + " objects {" + keys.join(",") + "}";

export function jsonShape(text: string, query: string): Shape | null {
  const parsedRows = jsonRows(text);
  if (parsedRows === null) return null;
  const { objs, keys } = parsedRows;
  const outliers = new Map<number, string[]>(); // row index -> skewed keys it breaks
  for (const k of keys) {
    const counts = new Map<string, number[]>();
    const totals = new Map<string, number>();
    let scalar = true;
    for (let i = 0; i < objs.length && scalar; i++) {
      const v = k in objs[i] ? objs[i][k] : undefined;
      if (typeof v === "object" && v !== null) { scalar = false; break; }
      const s = v === undefined ? ABSENT : JSON.stringify(v);
      totals.set(s, (totals.get(s) ?? 0) + 1);
      const at = counts.get(s) ?? [];
      if (at.length <= SHAPE_RARE_MAX) at.push(i);
      counts.set(s, at);
      if (totals.size > SHAPE_CATEGORICAL_MAX) break; // many values: not categorical
    }
    if (!scalar) continue;
    for (const i of rareOfSkewed(objs.length, counts, totals)) outliers.set(i, [...(outliers.get(i) ?? []), k]);
  }
  if (outliers.size === 0 || outliers.size > SHAPE_RARE_UNITS_MAX) return null;
  // Field order for a row that does not fit whole: the skewed keys, then keys the query names, then the
  // other scalar fields, then the rest; whole fields, shown in the row's own key order.
  const keyScore = rankTexts(keys, query, "any");
  const named = new Set(keys.filter((_, i) => keyScore[i] > 0));
  const units: Unit[] = [...outliers.entries()].map(([i, skewed]) => ({
    pos: i,
    rank: JSON.stringify(objs[i]),
    render: (budget: number) => renderRow(i, objs[i], skewed, named, budget),
  }));
  return { header: schemaOf(objs.length, keys) + ", " + outliers.size + " rare:", units };
}

function renderRow(i: number, row: Record<string, unknown>, skewed: string[], named: Set<string>, budget: number): string | null {
  const prefix = "[" + i + "] ";
  const body = fitRow(row, skewed, named, budget - bytes(prefix));
  return body === null ? null : prefix + body;
}

/** One row as JSON within `budget` bytes: whole, else whole fields (skewed keys, keys the query names, scalars). */
export function fitRow(row: Record<string, unknown>, skewed: string[], named: Set<string>, budget: number): string | null {
  const whole = JSON.stringify(row);
  if (bytes(whole) <= budget) return whole;
  const own = Object.keys(row);
  const tier = (k: string): number => (skewed.includes(k) ? 0 : named.has(k) ? 1 : typeof row[k] !== "object" || row[k] === null ? 2 : 3);
  const order = [...own].sort((a, b) => tier(a) - tier(b) || own.indexOf(a) - own.indexOf(b));
  const field = (k: string): string => JSON.stringify(k) + ":" + JSON.stringify(row[k]);
  const chosen = new Set<string>();
  let used = 2; // "{" + "}"
  for (const k of order) {
    const cost = bytes(field(k)) + (chosen.size > 0 ? 1 : 0);
    if (used + cost > budget) continue;
    chosen.add(k);
    used += cost;
  }
  if (!skewed.every((k) => chosen.has(k))) return null; // the field that makes the row rare must show
  return "{" + own.filter((k) => chosen.has(k)).map(field).join(",") + "}";
}

/** Keys of `keys` the query names (BM25, any word). */
export function namedKeys(keys: string[], query: string): Set<string> {
  const score = rankTexts(keys, query, "any");
  return new Set(keys.filter((_, i) => score[i] > 0));
}

// D-M2-JSON-2: no skewed key, but the query names a key whose value is a number in every row ("the highest
// score"): the rows at its extremes (largest and smallest), whole. The statistic is the order of the values;
// the query only names the key. Up to SHAPE_EXTREME_KEYS named keys; a constant key has no extremes.
export function jsonExtremes(text: string, query: string): Shape | null {
  const parsedRows = jsonRows(text);
  if (parsedRows === null) return null;
  const { objs, keys } = parsedRows;
  const named = namedKeys(keys, query);
  const picks = new Map<number, string>();
  let used = 0;
  for (const k of keys) {
    if (!named.has(k) || used >= SHAPE_EXTREME_KEYS) continue;
    if (!objs.every((o) => typeof o[k] === "number" && Number.isFinite(o[k] as number))) continue;
    let hi = 0, lo = 0;
    for (let i = 1; i < objs.length; i++) {
      if ((objs[i][k] as number) > (objs[hi][k] as number)) hi = i;
      if ((objs[i][k] as number) < (objs[lo][k] as number)) lo = i;
    }
    if (hi === lo) continue;
    used++;
    picks.set(hi, k);
    picks.set(lo, k);
  }
  if (picks.size === 0) return null;
  const units: Unit[] = [...picks.entries()].map(([i, k]) => ({
    pos: i,
    rank: "",
    render: (budget: number) => renderRow(i, objs[i], [k], named, budget),
  }));
  return { header: schemaOf(objs.length, keys) + ", extremes of " + [...new Set(picks.values())].join(",") + ":", units, direct: true };
}

// ---------- lines (Drain-style) ----------

interface Cluster { tpl: string[]; count: number; lines: number[]; pos: Array<{ counts: Map<string, number[]>; totals: Map<string, number> } | null> }

function hasDigit(t: string): boolean {
  for (let i = 0; i < t.length; i++) if (t[i] >= "0" && t[i] <= "9") return true;
  return false;
}

function similarity(tpl: string[], toks: string[]): number {
  let same = 0;
  for (let i = 0; i < tpl.length; i++) if (tpl[i] === toks[i] || tpl[i] === "<*>" || toks[i] === "<*>") same++;
  return same / tpl.length;
}

export function lineShape(text: string): Shape | null {
  const all = text.split("\n");
  if (all.length > 0 && all[all.length - 1] === "") all.pop();
  if (all.length < SHAPE_MIN_ROWS) return null;
  const groups = new Map<string, Cluster[]>();
  const clusters: Cluster[] = [];
  for (let n = 0; n < all.length; n++) {
    const raw = all[n].split(" ").filter((t) => t !== "");
    const toks = raw.map((t) => (hasDigit(t) ? "<*>" : t));
    const key = toks.length + " " + (toks[0] ?? "");
    const group = groups.get(key) ?? [];
    let hit: Cluster | undefined;
    for (const c of group) if (similarity(c.tpl, toks) >= SHAPE_SIMILARITY) { hit = c; break; }
    if (hit === undefined) {
      hit = { tpl: [...toks], count: 0, lines: [], pos: raw.map(() => ({ counts: new Map(), totals: new Map() })) };
      group.push(hit);
      groups.set(key, group);
      clusters.push(hit);
      if (clusters.length > SHAPE_MAX_CLUSTERS) return null;
    } else {
      for (let i = 0; i < hit.tpl.length; i++) if (hit.tpl[i] !== toks[i]) hit.tpl[i] = "<*>";
    }
    hit.count++;
    if (hit.lines.length <= SHAPE_RARE_MAX) hit.lines.push(n);
    for (let i = 0; i < hit.pos.length; i++) {
      const p = hit.pos[i];
      if (p === null) continue;
      p.totals.set(raw[i], (p.totals.get(raw[i]) ?? 0) + 1);
      const at = p.counts.get(raw[i]) ?? [];
      if (at.length <= SHAPE_RARE_MAX) at.push(n);
      p.counts.set(raw[i], at);
      if (p.totals.size > SHAPE_RARE_MAX + 1) hit.pos[i] = null; // a free field, not a skewed one
    }
  }
  const common = clusters.filter((c) => c.count > SHAPE_RARE_MAX);
  if (common.length === 0 || common.length > SHAPE_COMMON_MAX) return null;
  if (common.some((c) => c.tpl.every((t) => t === "<*>"))) return null; // no literal token: data, not a log
  const rare = new Set(clusters.filter((c) => c.count <= SHAPE_RARE_MAX).flatMap((c) => c.lines));
  for (const c of common) for (const p of c.pos) if (p !== null) for (const n of rareOfSkewed(c.count, p.counts, p.totals)) rare.add(n);
  if (rare.size === 0 || rare.size > SHAPE_RARE_UNITS_MAX) return null;
  // Counts only: the templates stay in the index (the more line reaches them); the budget goes to rare lines.
  const header = all.length + " lines, " + rare.size + " rare:";
  const units: Unit[] = [...rare].sort((a, b) => a - b).map((n) => {
    const line = n + 1 + ": " + all[n];
    return { pos: n, rank: all[n], render: (budget: number) => (bytes(line) <= budget ? line : null) };
  });
  return { header, units };
}
