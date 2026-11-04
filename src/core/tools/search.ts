// impl/05 §6, §7; ADR-0009 §8.1 (timeline), §8.3 + §9 (RRF, no MMR); DECISIONS-r6 D2; DECISIONS-r7 R1,
// O1; ADR-0009 §8.2 + DEVIATIONS D-M4-arch-5 (source:"decision"); DECISIONS-r9 M14-M24, V23; DEVIATIONS D-M2-3, D-M2-6, D-M2-T3-1, D-M2-T9-1, D-M2-T9-2.
// ctx_search: relevance (ContentStore, BM25 / RRF for scope "project", session first) or timeline
// (ContentStore + SessionDB + auto-memory, oldest first, epoch-ms `after` cursor).
import { z } from "zod/v4";
import { DECISION_SOURCE, LABEL_PAGE_BYTES, OUTPUT_CAP, SEARCH_PAGE_SIZE, SEARCH_REPLY_HITS, SNIPPET_MAX_BYTES } from "../contracts/constants.ts";
import { formatError } from "../contracts/errors.ts";
import type { CtxSearchInput, DbHandle, Hit, SearchScope, TimelineRow, ToolContext, ToolReply } from "../contracts/types.ts";
import { capBytes } from "../sandbox/cap.ts";
import { closeDb, openDb } from "../store/db.ts";
import { collisionLine, ftsListSource, ftsQuery, ftsQueryTimeline, groupDigits, isLongLabel, labelPage, pickSource, rankTexts, shownLabel, sourceCardRow, sourceHandle, type SourcePick } from "../store/fts.ts";
import { memoryChunks, memoryFileNamed, memoryHits, readAutoMemory } from "../index/auto-memory.ts";
import { fitRow, jsonRows, namedKeys } from "../index/shape.ts";

// DECISIONS-r9 V23, M23: six keys, strict (unknown key -> the SDK's isError); offset/after are
// non-negative integers; an empty `queries` array is valid input. impl/05 §6 error table, D-M2-arch-3:
// the SDK's one isError line for an unknown key carries the UNKNOWN_FIELD text, which names "queries".
export function unknownField(issue: z.core.$ZodRawIssue): string | undefined {
  return issue.code === "unrecognized_keys" ? formatError("UNKNOWN_FIELD", { f: issue.keys[0] }) : undefined;
}

export const ctxSearchSchema = z.object({
  queries: z.array(z.string()),
  scope: z.enum(["session", "worktree", "project"]).optional(),
  source: z.string().optional(),
  offset: z.number().int().nonnegative().optional(),
  sort: z.enum(["relevance", "timeline"]).optional(),
  after: z.number().int().nonnegative().optional(),
}, { error: unknownField }).strict();

// Source count for the zero-hit line (PRD §8): the same scope and source filter ftsQuery applies.
const COUNT_SOURCES = `
SELECT COUNT(*) AS n FROM sources
WHERE (:scope <> 'session' OR session_id = :session_id)
  AND (:scope <> 'worktree' OR worktree = :worktree)
  AND (:source IS NULL OR label = :source)`;

function bytes(s: string): number {
  return Buffer.byteLength(s, "utf8");
}

function reply(text: string, isError: boolean): ToolReply {
  return { text: capBytes(text, OUTPUT_CAP).text, isError, sandboxBytes: 0 };
}

function invalid(field: string, action: string): ToolReply {
  return reply(formatError("INVALID_ARGS", { field, action }), true);
}

function sourceCount(db: DbHandle, scope: SearchScope, ctx: ToolContext, source: string | undefined): number {
  const row = db.raw.prepare(COUNT_SOURCES).get({
    scope,
    session_id: ctx.sessionId,
    worktree: ctx.project.worktree,
    source: source ?? null,
  }) as { n: number };
  return Number(row.n);
}

// D-MEMORY-SOURCE-1: the memory files one call searches. `rows` = every file in scope (no source), the file the source
// names, or none; `named` = the source names a memory file (its hits page with `offset` like content hits).
interface MemorySide { rows: TimelineRow[]; named: boolean }

function zeroHits(db: DbHandle, scope: SearchScope, ctx: ToolContext, source: string | undefined, mem: MemorySide, offset = 0): ToolReply {
  // D-MEMORY-SOURCE-1: the count holds the memory files in the scope with the indexed sources.
  const n = sourceCount(db, scope, ctx, source) + mem.rows.length;
  // D-LABEL-HANDLE-2: past the last hit the reply says so (the hits are behind, not missing).
  if (offset > 0) return reply("No more hits past offset " + offset + ' in scope "' + scope + '" across ' + n + " source(s).", false);
  return reply('No hits in scope "' + scope + '" across ' + n + " source(s).", false);
}

// D-LABEL-HANDLE-1/2: how one call names its source to the user: `arg` is the value a paging line repeats (the
// handle of a long label, else what the user typed); `note` is the collision line, when the value was a label
// here and another source's handle.
interface Named { arg: string | undefined; note: string | null }

function named(given: string | undefined, pick: SourcePick | null): Named {
  if (given === undefined || pick === null) return { arg: given, note: null };
  const arg = pick.id !== null && isLongLabel(given) ? sourceHandle(pick.id) : given;
  return { arg, note: collisionLine(given, pick) };
}

// D-LABEL-HANDLE-2: empty `queries` on one stored source -> its card: handle, label size, chunks, bytes, then the
// stored label whole, LABEL_PAGE_BYTES a page; `offset` is the label byte offset of the page.
function sourceCard(db: DbHandle, id: number, input: CtxSearchInput, scope: SearchScope, arg: string): ToolReply | null {
  const row = sourceCardRow(db, id);
  if (row === null) return null;
  const pg = labelPage(row.label, input.offset ?? 0, LABEL_PAGE_BYTES);
  const lines = [
    "Source " + sourceHandle(id) + ": label " + groupDigits(pg.total) + " B, " + row.chunks + " chunk(s), " + groupDigits(row.bytes) + " B of " + row.kind + ".",
    "Label:",
    pg.text,
  ];
  if (pg.next !== null) lines.push("More: " + callText([], scope, arg, "offset:" + pg.next));
  return reply(lines.join("\n"), false);
}

// The call a paging line repeats: same queries, scope and source, plus the cursor ("" = the call as is).
function callText(queries: string[], scope: SearchScope, source: string | undefined, cursor: string): string {
  const src = source === undefined ? "" : ", source:" + JSON.stringify(source);
  return "ctx_search({queries:" + JSON.stringify(queries) + ", scope:" + JSON.stringify(scope) + src + (cursor === "" ? "" : ", " + cursor) + "})";
}

// ADR-0009 §8.2: with source:"decision", empty `queries` (or a query with no words) lists every
// decision row in scope, newest first, paged by `offset` like any relevance page.
function decisionQueries(input: CtxSearchInput): string[] {
  return input.source === DECISION_SOURCE && input.queries.length === 0 ? [""] : input.queries;
}

// D-SEARCH-REPLY-1: a relevance reply holds SEARCH_REPLY_HITS hits; the decision list keeps SEARCH_PAGE_SIZE.
function pageSize(input: CtxSearchInput): number {
  return input.source === DECISION_SOURCE ? SEARCH_PAGE_SIZE : SEARCH_REPLY_HITS;
}

// `extra` asks for hits past the page, so the caller knows whether a `More:` line has anything behind it.
function page(db: DbHandle, q: string, input: CtxSearchInput, scope: SearchScope, ctx: ToolContext, offset: number, extra = 0): Hit[] {
  const size = pageSize(input) + extra;
  if (input.source === DECISION_SOURCE && q.trim() === "") {
    return ftsListSource(db, DECISION_SOURCE, scope, ctx.project, ctx.sessionId, size, offset);
  }
  const hits = ftsQuery(db, q, scope, ctx.project, ctx.sessionId, size, offset, input.source);
  // H9 (D-HL-H9-1): the replace handle line names a source and uses the command as the query. When no query
  // word is in that source, the source's chunks are listed by position, so the handle line always returns rows.
  if (hits.length > 0 || input.source === undefined) return hits;
  const any = offset === 0 ? hits : ftsQuery(db, q, scope, ctx.project, ctx.sessionId, 1, 0, input.source);
  if (any.length > 0) return hits;
  return ftsListSource(db, input.source, scope, ctx.project, ctx.sessionId, size, offset);
}

// D-M2-JSON-3: a `source` that holds a JSON array of objects answers with whole rows, BM25-ranked over the row
// text (keys and values), JSON_ROWS_PAGE rows a page, each within SNIPPET_MAX_BYTES; the first line names the
// schema and the count. The rows come from the stored chunks, joined in order. Not JSON -> null (snippet path).
const JSON_ROWS_PAGE = 5;
const JSON_SOURCE_MAX_BYTES = 8 * 1024 * 1024;
const JSON_SOURCE = `
SELECT id, bytes_total FROM sources
WHERE label = :source
  AND (:scope <> 'session' OR session_id = :session_id)
  AND (:scope <> 'worktree' OR worktree = :worktree)
ORDER BY id DESC LIMIT 1`;

function jsonRowsReply(db: DbHandle, input: CtxSearchInput, scope: SearchScope, ctx: ToolContext, nm: Named): ToolReply | null {
  if (input.source === undefined || input.source === DECISION_SOURCE || input.queries.length === 0) return null;
  const src = db.raw.prepare(JSON_SOURCE).get({ source: input.source, scope, session_id: ctx.sessionId, worktree: ctx.project.worktree }) as { id: number; bytes_total: number } | undefined;
  if (src === undefined || Number(src.bytes_total) > JSON_SOURCE_MAX_BYTES) return null;
  const bodies = (db.raw.prepare("SELECT body FROM chunks WHERE source_id = ? ORDER BY CAST(ord AS INTEGER)").all(Number(src.id)) as unknown as Array<{ body: string }>).map((r) => r.body);
  const parsed = jsonRows(bodies.join("")) ?? jsonRows(bodies.join("\n"));
  if (parsed === null) return null;
  const { objs, keys } = parsed;
  const texts = objs.map((o) => JSON.stringify(o));
  const offset = input.offset ?? 0;
  const out: string[] = [objs.length + " objects {" + keys.join(",") + "}"];
  const name = shownLabel(input.source, Number(src.id));
  let shown = 0;
  let more = false;
  for (const q of input.queries) {
    const scores = rankTexts(texts, q, "any");
    const order = objs.map((_, i) => i).filter((i) => scores[i] > 0).sort((a, b) => scores[b] - scores[a] || a - b);
    const named = namedKeys(keys, q);
    out.push("Query " + JSON.stringify(q) + ":");
    for (const i of order.slice(offset, offset + JSON_ROWS_PAGE)) {
      const row = fitRow(objs[i], [], named, SNIPPET_MAX_BYTES);
      if (row === null) continue;
      out.push(name + " [" + i + "]: " + row);
      shown++;
    }
    if (order.length > offset + JSON_ROWS_PAGE) {
      out.push("More: " + callText([q], scope, nm.arg, "offset:" + (offset + JSON_ROWS_PAGE)));
      more = true;
    }
  }
  if (shown === 0 && !more) return null;
  return reply((nm.note === null ? out : [nm.note, ...out]).join("\n"), false);
}

// D-SEARCH-SMALL-1: the hit bytes of one reply, per source, stay within this share of that source's bytes. A reply
// that is most of the source it searches saves nothing over reading the source. The first new hit of a source in
// each query is always shown, and the share is spread over the queries (query k may spend k/n of it, so a first
// query cannot use up the room of the later ones); the hits left out stay behind the `More:` line (nothing is cut).
const SMALL_SOURCE_SHARE = 0.5;
const SOURCE_BYTES = "SELECT id, bytes_total FROM sources WHERE id IN (SELECT value FROM json_each(:ids))";

function sourceBytes(db: DbHandle, ids: number[]): Map<number, number> {
  const out = new Map<number, number>();
  if (ids.length === 0) return out;
  for (const r of db.raw.prepare(SOURCE_BYTES).all({ ids: JSON.stringify(ids) }) as unknown as Array<{ id: number; bytes_total: number }>) {
    out.set(Number(r.id), Number(r.bytes_total));
  }
  return out;
}

// D-SEARCH-LEAN-1: when the top hit holds every query word (`full`), the answer is in it; the reply shows
// LEAN_HITS (3) hits, plus any further hit that also holds every word, up to the page. Nothing is cut: the rest
// stays behind `More:`. A top hit that lacks a word keeps the whole page (held-out ranks 3-5 live there).
const LEAN_HITS = 3;
function replyHits(hits: Hit[], size: number): number {
  if (hits.length === 0 || hits[0].full !== true) return Math.min(size, hits.length);
  let n = Math.min(LEAN_HITS, size, hits.length);
  while (n < size && n < hits.length && hits[n].full === true) n++;
  return n;
}

// D-UNIFIED-MEMORY-1: memory hits (sourceId < 0) join the content hits of the first page. A hit that holds every
// query word comes before one that does not; inside one class content and memory alternate, content first. Both lists
// keep their own order and nothing is cut: the paging cursor counts content hits only (contentIn).
const MEMORY_HITS = 2;
function mergeMemory(content: Hit[], memory: Hit[]): Hit[] {
  const out: Hit[] = [];
  let c = 0;
  let m = 0;
  let lastMem = true;
  while (c < content.length || m < memory.length) {
    const rank = (h: Hit | undefined): number => (h === undefined ? -1 : h.full === true ? 1 : 0);
    const rc = rank(content[c]);
    const rm = rank(memory[m]);
    const mem = rc < 0 || rm > rc || (rm === rc && !lastMem);
    if (mem) { out.push(memory[m++]); lastMem = true; } else { out.push(content[c++]); lastMem = false; }
  }
  return out;
}

// Content hits among the first n hits: the paging cursor counts content hits only.
const contentIn = (hits: Hit[], n: number): number => hits.slice(0, n).filter((h) => h.sourceId > 0).length;

// impl/05 §6 steps 5-10. Hits are kept whole: when the next hit line would not fit OUTPUT_CAP, that
// query (and every later one) gets a `More:` line starting at the first hit not shown (D-M2-6).
// D-SEARCH-SMALL-1: a hit already shown for an earlier query of the call is named in one `Same as above:` line,
// so a query never gets an empty block; a hit that was only left out of an earlier query still shows here.
function relevance(db: DbHandle, given: CtxSearchInput, scope: SearchScope, ctx: ToolContext, nm: Named, ms: MemorySide, indexed: boolean): ToolReply {
  const input: CtxSearchInput = { ...given, queries: decisionQueries(given) };
  const offset = input.offset ?? 0;
  const size = pageSize(input);
  // D-UNIFIED-MEMORY-1: with no source, memory hits join the first page and the cursor counts content hits.
  // D-MEMORY-SOURCE-1: a source that names a memory file pages that file's hits (and the indexed source of the same
  // label, when there is one) as one ranked list, so the cursor counts every hit.
  const mem = ms.named || offset === 0 ? memoryChunks(ms.rows) : [];
  const count = (hits: Hit[], n: number): number => (ms.named ? Math.min(n, hits.length) : contentIn(hits, n));
  // One hit past the page: a `More:` line is printed only when a hit is left behind it (D-SEARCH-SMALL-1).
  const fetched: Hit[][] = input.queries.map((q) => {
    if (ms.named) {
      const want = offset + size + 1;
      const content = indexed ? ftsQuery(db, q, scope, ctx.project, ctx.sessionId, want, 0, input.source) : [];
      return mergeMemory(content, memoryHits(mem, q, want)).slice(offset, want);
    }
    const content = page(db, q, input, scope, ctx, offset, 1);
    return mem.length === 0 ? content : mergeMemory(content, memoryHits(mem, q, MEMORY_HITS));
  });
  const take: number[] = fetched.map((h) => replyHits(h, size));
  const pages: Hit[][] = fetched.map((h, i) => h.slice(0, take[i]));
  // Step 9: every query had zero hits.
  if (pages.every((p) => p.length === 0)) return zeroHits(db, scope, ctx, input.source, ms, offset);

  // D-LABEL-HANDLE-2: the cursor names a long label by its handle, so the line is short and whole.
  const moreLine = (q: string, pos: number): string =>
    "More: " + callText([q], scope, nm.arg, "offset:" + pos);
  // Room for one paging line per query at its largest cursor (offset + page size).
  let reserve = 0;
  for (const q of input.queries) reserve += bytes(moreLine(q, offset + size)) + 1;

  const total = input.source === DECISION_SOURCE ? new Map<number, number>() : sourceBytes(db, [...new Set(pages.flat().map((h) => h.sourceId))]);
  const spent = new Map<number, number>(); // hit bytes shown so far, per source

  const lines: string[] = nm.note === null ? [] : [nm.note];
  const more: Array<{ q: string; pos: number }> = []; // grouped by cursor when the reply is built
  const shown = new Set<string>(); // "sourceId:ord" of every hit line already in the reply
  let used = nm.note === null ? 0 : bytes(nm.note) + 1;
  let stopped = false;
  input.queries.forEach((q, qi) => {
    const hits = pages[qi];
    if (stopped) {
      more.push({ q, pos: offset });
      return;
    }
    const head = "Query " + JSON.stringify(q) + ":";
    lines.push(head);
    used += bytes(head) + 1;
    const again = new Map<string, number[]>(); // label -> chunk numbers already shown above
    const mine = new Set<number>(); // sources with a new hit line in this query
    let cut = -1; // position of the first hit left out
    for (let i = 0; i < hits.length; i++) {
      const hit = hits[i];
      const key = hit.sourceId + ":" + hit.ord;
      if (shown.has(key)) {
        const name = shownLabel(hit.label, hit.sourceId);
        again.set(name, [...(again.get(name) ?? []), hit.ord]);
        continue;
      }
      // D-LABEL-HANDLE-2: a long label is its handle and a short preview, so the snippet keeps the room.
      const line = shownLabel(hit.label, hit.sourceId) + " #" + hit.ord + ": " + hit.snippet;
      if (used + bytes(line) + 1 + reserve > OUTPUT_CAP) {
        cut = offset + count(hits, i);
        stopped = true;
        break;
      }
      const room = total.get(hit.sourceId);
      if (room !== undefined && mine.has(hit.sourceId) && (spent.get(hit.sourceId) ?? 0) + bytes(line) + 1 > room * SMALL_SOURCE_SHARE * (qi + 1) / input.queries.length) {
        cut = offset + count(hits, i);
        break;
      }
      lines.push(line);
      shown.add(key);
      used += bytes(line) + 1;
      spent.set(hit.sourceId, (spent.get(hit.sourceId) ?? 0) + bytes(line) + 1);
      mine.add(hit.sourceId);
    }
    if (again.size > 0) {
      const line = "Same as above: " + [...again].map(([label, ords]) => label + " (chunk " + ords.join(",") + ")").join("; ");
      lines.push(line);
      used += bytes(line) + 1;
    }
    if (cut >= 0) more.push({ q, pos: cut });
    else if (count(fetched[qi], fetched[qi].length) > count(fetched[qi], take[qi])) more.push({ q, pos: offset + count(fetched[qi], take[qi]) });
  });
  // D-SEARCH-LEAN-1: queries that stop at one cursor share one `More:` line (the call pages them all from there).
  const moreLines: string[] = [];
  const byPos = new Map<number, string[]>();
  for (const m of more) byPos.set(m.pos, [...(byPos.get(m.pos) ?? []), m.q]);
  for (const [pos, qs] of byPos) moreLines.push("More: " + callText(qs, scope, nm.arg, "offset:" + pos));
  return reply(lines.concat(moreLines).join("\n"), false);
}

// ADR-0009 §8.1 rule 8 line; `#<seq>` only for journal rows (D-M2-T9-2).
function timelineLine(r: TimelineRow): string {
  const nl = r.text.indexOf("\n");
  const first = nl < 0 ? r.text : r.text.slice(0, nl);
  const seq = r.seq === null ? "" : " #" + r.seq;
  return "[" + new Date(r.ts).toISOString() + "] " + shownLabel(r.label, r.sourceId) + seq + " " + first;
}

// ADR-0009 §8.1 rules 1-8, D-M2-3, D-M2-T3-1. Lines are added a whole timestamp group at a time;
// a group that does not fit ends the page there, so the `after` cursor never skips a row (M18).
function timeline(db: DbHandle, input: CtxSearchInput, scope: SearchScope, ctx: ToolContext, nm: Named, ms: MemorySide): ToolReply {
  // D-M2-T9-1: memory files belong to the worktree, not to a session (ms.rows is empty for scope "session").
  const page = ftsQueryTimeline(db, scope, ctx.project, ctx.sessionId, SEARCH_PAGE_SIZE, input.after ?? null, input.source, ms.rows);
  if (page.rows.length === 0) return zeroHits(db, scope, ctx, input.source, ms);

  const moreLine = (ts: number): string =>
    "more: " + callText(input.queries, scope, nm.arg, 'sort:"timeline", after:' + ts);
  const reserve = bytes(moreLine(page.rows[page.rows.length - 1].ts)) + 1;

  const lines: string[] = nm.note === null ? [] : [nm.note];
  let used = nm.note === null ? 0 : bytes(nm.note) + 1;
  let lastTs: number | null = null;
  let more = page.more;
  let i = 0;
  while (i < page.rows.length) {
    const ts = page.rows[i].ts;
    const group: string[] = [];
    let groupBytes = 0;
    while (i < page.rows.length && page.rows[i].ts === ts) {
      const line = timelineLine(page.rows[i]);
      group.push(line);
      groupBytes += bytes(line) + 1;
      i += 1;
    }
    if (lastTs !== null && used + groupBytes + reserve > OUTPUT_CAP) {
      more = true;
      break;
    }
    lines.push(...group);
    used += groupBytes;
    lastTs = ts;
  }
  if (more && lastTs !== null) lines.push(moreLine(lastTs));
  return reply(lines.join("\n"), false);
}

function answer(db: DbHandle, input: CtxSearchInput, scope: SearchScope, ctx: ToolContext, nm: Named, ms: MemorySide, indexed: boolean, sort: string, pick: SourcePick | null): ToolReply {
  if (sort === "timeline") return timeline(db, input, scope, ctx, nm, ms);
  if (pick !== null && pick.id !== null && input.queries.length === 0) {
    const card = sourceCard(db, pick.id, input, scope, nm.arg as string);
    if (card !== null) return card;
  }
  const rows = ms.named ? null : jsonRowsReply(db, input, scope, ctx, nm);
  return rows ?? relevance(db, input, scope, ctx, nm, ms, indexed);
}

async function handler(input: CtxSearchInput, ctx: ToolContext): Promise<ToolReply> {
  const sort = input.sort ?? "relevance";
  // DECISIONS-r9 M23, ADR-0009 §8.1 rule 6.
  if (sort === "timeline" && input.offset !== undefined) {
    return invalid("offset", 'drop offset; page a timeline with "after"');
  }
  if (sort === "relevance" && input.after !== undefined) {
    return invalid("after", 'drop after, or pass sort:"timeline"');
  }
  const scope: SearchScope = input.scope ?? "worktree";
  const db = await openDb(ctx.project, { readOnly: true });
  try {
    // D-LABEL-HANDLE-1: a stored label wins, then a short id, then a label without its "#" suffix (pickSource).
    const given = input.source;
    const pick = given !== undefined && given !== DECISION_SOURCE ? pickSource(db, given) : null;
    if (pick !== null) input = { ...input, source: pick.label };
    const nm = named(given, pick);
    const indexed = pick !== null && pick.id !== null;
    // D-MEMORY-SOURCE-1: a source that is a memory file's label, or its label as a hit shows it ("memory AGENTS.md").
    const files = scope !== "session" || given !== undefined ? readAutoMemory(ctx.project) : [];
    const file = given === undefined || given === DECISION_SOURCE ? null : memoryFileNamed(files, given);
    const ms: MemorySide = { rows: scope === "session" ? [] : file !== null ? [file] : given === undefined ? files : [], named: file !== null };
    if (file !== null && indexed && scope !== "session") {
      const both = "Source " + JSON.stringify(given) + ": searched the indexed source " + shownLabel(pick.label, pick.id) + " and the memory file " + file.label + ".";
      nm.note = nm.note === null ? both : nm.note + "\n" + both;
    }
    const out = answer(db, input, scope, ctx, nm, ms, indexed, sort, pick);
    if (file === null || scope !== "session") return out;
    // D-MEMORY-SOURCE-1: scope "session" holds no memory file; one line names the scope that holds it.
    const call = callText(input.queries, "worktree", nm.arg, sort === "timeline" ? 'sort:"timeline"' : "");
    return reply(out.text + "\nMemory file " + file.label + ' is in scope "worktree": ' + call + " searches it.", out.isError);
  } finally {
    closeDb(db);
  }
}

export const ctxSearch = Object.freeze({
  name: "ctx_search",
  description: "",
  schema: ctxSearchSchema,
  readOnly: true,
  alwaysLoad: false,
  handler,
});
