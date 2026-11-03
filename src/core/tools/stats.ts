// impl/06 §5, PRD §12, TECH-SPEC GP10 + §6.2a D3; DECISIONS-r4 I1-14, I1-15, I1-19; DECISIONS-r9 V18, V19;
// DEVIATIONS D-M4-arch-3 (handler shape (input, ctx)), D-M4-arch-4 (sums sandbox_bytes/returned_bytes),
// D-M4-S3-1 (call rows, scopes, labels), D-STATS-REPORT-1 (detailed text report, ctx_stats rows not counted),
// D-STATS-VALUE-1 (context window, hook work, largest outputs, index and search, last 7 days, footer),
// D-STATS-FIX-1 (one verb, rows that add up, scoped headings, no repeated blocks, UTM footer).
// ctx_stats: on demand, one read-only open of this project's own context.db; it opens no other DB, so no
// sibling DB is ever opened or touched (#1213, #1236).
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod/v4";
import {
  ISSUE_REPO_SLUG,
  MS_PER_DAY,
  OUTPUT_CAP,
  PERCENT_SCALE,
  RUN_LABEL_PREFIX,
  STATS_BYTES_PER_TOKEN,
  STATS_CALLS_W,
  STATS_CLOCK_DIGITS,
  STATS_HEAD_BAR,
  STATS_HOURS_PER_DAY,
  STATS_KIB,
  STATS_KIND_BAR,
  STATS_KIND_W,
  STATS_LABEL_MAX,
  STATS_LABEL_W,
  STATS_MILLION,
  STATS_MINUTES_PER_HOUR,
  STATS_MS_PER_MINUTE,
  STATS_NUM_W,
  STATS_PCT_W,
  STATS_ROW_BAR,
  STATS_COLUMNS,
  STATS_EMPTY_LINES,
  STATS_JOURNAL_HINTS,
  STATS_KIND_LABELS,
  STATS_MAX_TOOL_ROWS,
  STATS_NO_DATA,
  STATS_REPORT_TITLE,
  STATS_SUMMARY,
  STATS_UNKNOWN_FIELD_LINE,
  STATS_WIDTH,
  STATS_CARD_W,
  STATS_DAY_BAR,
  STATS_DAYS,
  STATS_FOOTER_URL,
  STATS_INDEX_TOOLS,
  STATS_THOUSAND,
  STATS_TOKEN_NOTE,
  STATS_TOP_OUTPUTS,
  STATS_WAYS,
  STATS_WHOLE_FROM,
  STATS_WINDOW_TOKENS,
} from "../contracts/constants.ts";
import type { CtxStatsInput, ToolContext, ToolReply } from "../contracts/types.ts";
import { capBytes } from "../sandbox/cap.ts";
import { closeDb, openDb } from "../store/db.ts";

export type { CtxStatsInput } from "../contracts/types.ts";

// impl/06 §5 errors: no input fields, so an unknown field is the only input error.
export const ctxStatsSchema = z.object({}, {
  error: (issue: z.core.$ZodRawIssue) => (issue.code === "unrecognized_keys" ? STATS_UNKNOWN_FIELD_LINE : undefined),
}).strict();

interface Totals { calls: number; produced: number; returned: number; saved: number; }
interface Group extends Totals { session: string; agent: string; }
interface Named extends Totals { name: string; }
type WayKey = (typeof STATS_WAYS)[number][0];
// D-STATS-VALUE-1: one UTC day of "Last 7 days": calls counted and bytes saved per way of saving.
interface Day { day: number; calls: number; ways: Record<WayKey, number>; }
interface Facts {
  groups: Group[];
  tools: Named[];
  kinds: Map<string, { session: number; project: number }>;
  span: number;
  sessions: number;
  agents: number;
  days: number;
  sources: { count: number; chunks: number; bytes: number };
  dbBytes: number;
  top: Named[];
  replaced: number;
  redirected: number;
  week: Day[];
}

// D-M4-S3-1: a call row has a tool name (prompt rows have none); `cost` rows are the M5 plugin usage
// events, not calls (D-M4-arch-4). Each own call and each host call has exactly one row, so no dedup here
// (I1-14). D-STATS-REPORT-1: ctx_stats rows are left out; reading the report is not work, and counting its
// reply made every call lower the percent a little.
const CALLS = "tool IS NOT NULL AND kind <> 'cost' AND tool <> 'ctx_stats'";
const GROUPS =
  "SELECT session_id, agent, COUNT(*) AS calls, COALESCE(SUM(sandbox_bytes), 0) AS produced," +
  ` COALESCE(SUM(returned_bytes), 0) AS returned FROM events WHERE ${CALLS}` +
  " GROUP BY session_id, agent ORDER BY agent, session_id";
const TOOLS =
  "SELECT tool, COUNT(*) AS calls, COALESCE(SUM(sandbox_bytes), 0) AS produced," +
  ` COALESCE(SUM(returned_bytes), 0) AS returned FROM events WHERE ${CALLS} GROUP BY tool`;
const KINDS =
  "SELECT kind, COALESCE(SUM(session_id = ?), 0) AS s, COUNT(*) AS p FROM events" +
  " WHERE kind <> 'cost' AND (tool IS NULL OR tool <> 'ctx_stats') GROUP BY kind";
const META =
  "SELECT COUNT(DISTINCT session_id) AS sessions, COUNT(DISTINCT agent) AS agents," +
  ` COUNT(DISTINCT created_at / ${MS_PER_DAY}) AS days FROM events WHERE ${CALLS}`;
const SPAN = "SELECT COALESCE(MAX(created_at) - MIN(created_at), 0) AS span FROM events WHERE session_id = ? AND kind <> 'cost'";
const SOURCES =
  "SELECT COUNT(*) AS n, COALESCE(SUM(chunk_count), 0) AS chunks, COALESCE(SUM(bytes_total), 0) AS bytes FROM sources";

// D-STATS-VALUE-1. Hook work: a host row that sent fewer bytes to the chat than it made is an output the
// PostToolUse hook replaced after it ran; a run.mjs source is a large command the PreToolUse hook sent to the
// sandbox (ADR-0016 case B), which writes the source and no events row. A redirect saves its bytes past
// OUTPUT_CAP (the reply the host would have shown is the capped preview).
const HOST = "tool NOT LIKE 'ctx\\_%' ESCAPE '\\'";
const REPLACED = `SELECT COUNT(*) AS n FROM events WHERE ${CALLS} AND ${HOST} AND returned_bytes < sandbox_bytes`;
const RUNS = "FROM sources WHERE substr(label, 1, ?) = ?";
const REDIRECTED = `SELECT COUNT(*) AS n, COALESCE(MAX(created_ts), 0) AS last ${RUNS}`;
const LAST = `SELECT COALESCE(MAX(created_at), 0) AS last FROM events WHERE ${CALLS}`;
const WEEK =
  `SELECT created_at / ${MS_PER_DAY} AS day, tool, COUNT(*) AS calls, COALESCE(SUM(sandbox_bytes), 0) AS produced,` +
  ` COALESCE(SUM(returned_bytes), 0) AS returned FROM events WHERE ${CALLS} AND created_at >= ? GROUP BY day, tool`;
const WEEK_RUNS =
  `SELECT created_ts / ${MS_PER_DAY} AS day, COUNT(*) AS calls,` +
  ` COALESCE(SUM(MAX(0, bytes_total - ${OUTPUT_CAP})), 0) AS saved ${RUNS} AND created_ts >= ? GROUP BY day`;
const TOP =
  "SELECT tool, 1 AS calls, sandbox_bytes AS produced, returned_bytes AS returned FROM events" +
  ` WHERE ${CALLS} AND sandbox_bytes > 0 ORDER BY sandbox_bytes DESC, seq ASC LIMIT ${STATS_TOP_OUTPUTS}`;

function wayOf(tool: string): WayKey {
  if (STATS_INDEX_TOOLS.includes(tool)) return "index";
  return tool.startsWith("ctx_") ? "sandbox" : "replace";
}

// The last STATS_DAYS UTC days, ending on the day of the latest row: same journal, same days (no clock).
function readWeek(raw: DatabaseSync, lastMs: number): Day[] {
  const last = Math.floor(lastMs / MS_PER_DAY);
  const first = last - STATS_DAYS + 1;
  const days: Day[] = Array.from({ length: STATS_DAYS }, (_, i) => ({
    day: first + i, calls: 0, ways: { sandbox: 0, index: 0, redirect: 0, replace: 0 },
  }));
  const net = new Map<string, number>();
  for (const r of raw.prepare(WEEK).all(first * MS_PER_DAY) as Row[]) {
    const d = days[Number(r.day) - first];
    if (d === undefined) continue;
    d.calls += Number(r.calls);
    const key = `${d.day}:${wayOf(String(r.tool))}`;
    net.set(key, (net.get(key) ?? 0) + Number(r.produced) - Number(r.returned));
  }
  // Net bytes per day and way, like a saving unit: a ctx_search reply counts against the index it reads.
  for (const d of days) for (const [way] of STATS_WAYS) d.ways[way] = Math.max(0, net.get(`${d.day}:${way}`) ?? 0);
  for (const r of raw.prepare(WEEK_RUNS).all(RUN_LABEL_PREFIX.length, RUN_LABEL_PREFIX, first * MS_PER_DAY) as Row[]) {
    const d = days[Number(r.day) - first];
    if (d === undefined) continue;
    d.calls += Number(r.calls);
    d.ways.redirect += Number(r.saved);
  }
  return days;
}

const EMPTY: Totals = Object.freeze({ calls: 0, produced: 0, returned: 0, saved: 0 });
type Row = Record<string, string | number | null>;

function totals(r: Row): Totals {
  const produced = Number(r.produced);
  const returned = Number(r.returned);
  return { calls: Number(r.calls), produced, returned, saved: Math.max(0, produced - returned) };
}

// D-M4-S3-1: the saving unit is one agent's work in one session. Inside it, returned bytes are counted
// once against produced bytes (PRD §12, I1-15, #1042: index then search nets out); a unit that returned
// more than it produced kept nothing out, so it adds 0, never a negative. Every scope and agent row is a
// sum of whole units, so session <= project <= all-time and agent rows sum to all-time by construction.
function readFacts(raw: DatabaseSync, sessionId: string): Facts {
  const groups = (raw.prepare(GROUPS).all() as Row[]).map((r) => ({ session: String(r.session_id), agent: String(r.agent), ...totals(r) }));
  const tools = (raw.prepare(TOOLS).all() as Row[]).map((r) => ({ name: String(r.tool), ...totals(r) }));
  const kinds = new Map<string, { session: number; project: number }>();
  for (const r of raw.prepare(KINDS).all(sessionId) as Row[]) kinds.set(String(r.kind), { session: Number(r.s), project: Number(r.p) });
  const meta = raw.prepare(META).get() as Row;
  const span = Number((raw.prepare(SPAN).get(sessionId) as Row).span);
  const src = raw.prepare(SOURCES).get() as Row;
  const runs = raw.prepare(REDIRECTED).get(RUN_LABEL_PREFIX.length, RUN_LABEL_PREFIX) as Row;
  const last = Math.max(Number((raw.prepare(LAST).get() as Row).last), Number(runs.last));
  const pages = raw.prepare("PRAGMA page_count").get() as Row;
  const size = raw.prepare("PRAGMA page_size").get() as Row;
  return {
    groups, tools, kinds, span,
    sessions: Number(meta.sessions), agents: Number(meta.agents), days: Number(meta.days),
    sources: { count: Number(src.n), chunks: Number(src.chunks), bytes: Number(src.bytes) },
    dbBytes: Number(pages.page_count) * Number(size.page_size),
    top: (raw.prepare(TOP).all() as Row[]).map((r) => ({ name: String(r.tool), ...totals(r) })),
    replaced: Number((raw.prepare(REPLACED).get() as Row).n),
    redirected: Number(runs.n),
    week: readWeek(raw, last),
  };
}

function sum(groups: Totals[]): Totals {
  return groups.reduce<Totals>((t, g) => ({
    calls: t.calls + g.calls, produced: t.produced + g.produced, returned: t.returned + g.returned, saved: t.saved + g.saved,
  }), EMPTY);
}

// PRD §12, I1-15: denominator is produced bytes only. One decimal place for display.
function reductionPct(t: Totals): number {
  if (t.calls === 0) return 0;
  return Number(((t.saved * PERCENT_SCALE) / Math.max(1, t.produced)).toFixed(1));
}

// Step 7: values are labelled bytes, no time claim (#1023). Step 4: zero calls -> zeros and the reason.
function tableRow(label: string, t: Totals): string {
  const last = t.calls === 0 ? STATS_NO_DATA : String(reductionPct(t));
  return "| " + [label, t.produced + " B", t.returned + " B", t.saved + " B", last].join(" | ") + " |";
}

// ---- D-STATS-REPORT-1: the text report. Same facts -> same bytes; no clock, no locale. ----

const UNITS = ["KB", "MB", "GB", "TB"] as const;
const LABEL_W = STATS_LABEL_W;
const NUM_W = STATS_NUM_W;
const PCT_W = STATS_PCT_W;
const INT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }); // fixed locale: same bytes everywhere

function int(n: number): string {
  return INT.format(Math.round(n));
}

function count(n: number): string {
  return n < STATS_MILLION ? int(n) : (n / STATS_MILLION).toFixed(1) + "M";
}

function bytes(n: number): string {
  if (n < 0) return "-" + bytes(-n);
  if (n < STATS_KIB) return int(n) + " B";
  let v = n / STATS_KIB;
  let u = 0;
  while (v >= STATS_KIB && u < UNITS.length - 1) { v /= STATS_KIB; u++; }
  return v.toFixed(1) + " " + UNITS[u];
}

// D-STATS-ZERO-1: one space always sets a field apart from the one before it, also when the value is
// wider than its column; a value that fits takes exactly `width` columns, as before.
function right(v: string, width: number): string {
  return " " + v.padStart(width - 1);
}

function pct(t: Totals): string {
  return ((t.saved * PERCENT_SCALE) / Math.max(1, t.produced)).toFixed(1) + "%";
}

function bar(value: number, max: number, width: number, fill = "█", rest = ""): string {
  const n = value <= 0 || max <= 0 ? 0 : Math.min(width, Math.max(1, Math.round((value / max) * width)));
  return fill.repeat(n) + rest.repeat(width - n);
}

function label(s: string): string {
  const chars = [...s];
  return (chars.length > STATS_LABEL_MAX ? chars.slice(0, STATS_LABEL_MAX - 1).join("") + "…" : s).padEnd(LABEL_W);
}

function span(ms: number): string {
  const min = Math.floor(ms / STATS_MS_PER_MINUTE);
  if (min < 1) return "<1m";
  if (min < STATS_MINUTES_PER_HOUR) return min + "m";
  const h = Math.floor(min / STATS_MINUTES_PER_HOUR);
  return h < STATS_HOURS_PER_DAY
    ? `${h}h ${String(min % STATS_MINUTES_PER_HOUR).padStart(STATS_CLOCK_DIGITS, "0")}m`
    : `${Math.floor(h / STATS_HOURS_PER_DAY)}d ${h % STATS_HOURS_PER_DAY}h`;
}

function plural(n: number, word: string): string {
  return `${int(n)} ${word}${n === 1 ? "" : "s"}`;
}

// One table of byte totals: label, calls, produced, returned, saved, %, a bar scaled to the largest saving.
// D-STATS-FIX-1 (7): one verb pair, "made" and "sent", and "kept out" for the result.
function table(title: string, rows: Named[]): string[] {
  const max = Math.max(0, ...rows.map((r) => r.saved));
  const head = "  " + title.padEnd(LABEL_W) + right("Calls", STATS_CALLS_W) + right("Made", NUM_W) + right("Sent", NUM_W) +
    right("Kept out", NUM_W) + right("%", PCT_W);
  return [head, ...rows.map((r) => ("  " + label(r.name) + right(count(r.calls), STATS_CALLS_W) + right(bytes(r.produced), NUM_W) +
    right(bytes(r.returned), NUM_W) + right(bytes(r.saved), NUM_W) + right(pct(r), PCT_W) + " " + bar(r.saved, max, STATS_ROW_BAR)).trimEnd())];
}

function bySaved(a: Named, b: Named): number {
  // Most saved first; on a tie, more produced first, then fewer bytes sent to the chat, then the name.
  return b.saved - a.saved || b.produced - a.produced || a.returned - b.returned || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
}

function toolName(tool: string): string {
  return tool.startsWith("ctx_") ? tool : "hook " + tool;
}

// D-STATS-FIX-1 (1): a ctx_search reply nets against the index it reads (PRD §12, I1-15), so the two share
// one row. D-STATS-ZERO-1: a row keeps out max(0, made - sent), like the saving units of the scope rows, so a
// search with no hits reads 0 B and 0.0%, never a negative.
function joinIndex(tools: Named[]): Named[] {
  const idx = tools.filter((t) => STATS_INDEX_TOOLS.includes(t.name));
  if (idx.length <= 1) return tools;
  const t = sum(idx);
  const one = { name: STATS_INDEX_TOOLS.join(" + ").replace(" + ctx_", " + "), ...t, saved: Math.max(0, t.produced - t.returned) };
  return [...tools.filter((x) => !idx.includes(x)), one];
}

// D-STATS-VALUE-1 (6): two or more rows with 0 B kept out fold into one "other" row; past STATS_MAX_TOOL_ROWS
// the rows with the smallest saving join it.
function toolRows(tools: Named[]): Named[] {
  const named = joinIndex(tools.map((t) => ({ ...t, saved: Math.max(0, t.produced - t.returned) })))
    .map((t) => ({ ...t, name: toolName(t.name) })).sort(bySaved);
  const zero = named.filter((t) => t.saved <= 0);
  const fold = zero.length > 1 ? zero : [];
  const keep = named.filter((t) => !fold.includes(t));
  const room = fold.length > 0 ? STATS_MAX_TOOL_ROWS - 1 : STATS_MAX_TOOL_ROWS;
  const over = keep.length > room;
  const shown = over ? keep.slice(0, STATS_MAX_TOOL_ROWS - 1) : keep;
  const rest = over ? [...keep.slice(STATS_MAX_TOOL_ROWS - 1), ...fold] : fold;
  return rest.length === 0 ? shown : [...shown, { name: `other (${plural(rest.length, "tool")})`, ...sum(rest) }];
}

// ---- D-STATS-VALUE-1: the business-value lines. ----

const TOKEN_UNITS = ["K", "M", "B", "T"] as const;

// One decimal below STATS_WHOLE_FROM, a whole number at or past it.
function whole(v: number): string {
  return v >= STATS_WHOLE_FROM ? int(v) : v.toFixed(1);
}

function tokens(n: number): string {
  if (n < STATS_THOUSAND) return int(n);
  let v = n / STATS_THOUSAND;
  let u = 0;
  while (v >= STATS_THOUSAND && u < TOKEN_UNITS.length - 1) { v /= STATS_THOUSAND; u++; }
  return whole(v) + TOKEN_UNITS[u];
}

// Tokens are bytes / STATS_BYTES_PER_TOKEN, so the line says "about"; the window is a Claude context window.
function windowLine(saved: number): string {
  const t = saved / STATS_BYTES_PER_TOKEN;
  const share = t / STATS_WINDOW_TOKENS;
  const win = `a ${tokens(STATS_WINDOW_TOKENS)} window`;
  const head = `  about ${tokens(t)} tokens kept out`;
  if (share >= 1) return `${head}, ${whole(share)} times ${win}`;
  const p = share * PERCENT_SCALE;
  return p * STATS_WHOLE_FROM < 1 ? head : `${head}, ${whole(p)}% of ${win}`;
}

function ymd(day: number): string {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, "yyyy-mm-dd".length);
}

function mmdd(day: number): string {
  return ymd(day).slice("yyyy-".length);
}

// One stacked bar: ways in STATS_WAYS order, cut at rounded running sums so the parts add up to the whole.
function stack(parts: number[], max: number, width: number): string {
  let total = 0;
  let at = 0;
  let out = "";
  parts.forEach((v, i) => {
    total += v;
    const end = max <= 0 ? 0 : Math.round((total / max) * width);
    if (end > at) { out += STATS_WAYS[i]![1].repeat(end - at); at = end; }
  });
  if (out === "" && total > 0) out = STATS_WAYS[parts.indexOf(Math.max(...parts))]![1];
  return out;
}

function cards(cells: string[]): string {
  return ("  " + cells.map((c) => c.padEnd(STATS_CARD_W)).join("")).trimEnd();
}

// The Gateway Analytics shape from local data. D-STATS-FIX-1 (6, 9): the cards show only when older calls
// exist (else they repeat the project row); the chart lists days with data; the header has the year.
function lastDays(week: Day[], allCalls: number): string[] {
  const saved = week.map((d) => STATS_WAYS.reduce((t, [w]) => t + d.ways[w], 0));
  const all = saved.reduce((a, b) => a + b, 0);
  const calls = week.reduce((a, d) => a + d.calls, 0);
  const max = Math.max(0, ...saved);
  const head = `Last ${STATS_DAYS} days of use · ${ymd(week[0]!.day)} to ${ymd(week[week.length - 1]!.day)}`;
  const card = calls < allCalls
    ? [cards(["Kept out", "Tokens kept out", "Calls", "Kept out per call"]),
      cards([bytes(all), "about " + tokens(all / STATS_BYTES_PER_TOKEN), count(calls), bytes(calls > 0 ? all / calls : 0)]), ""]
    : [];
  return [
    head,
    ...card,
    ...week.flatMap((d, i) => (saved[i]! > 0 ? ["  " + mmdd(d.day) + " " +
      stack(STATS_WAYS.map(([w]) => d.ways[w]), max, STATS_DAY_BAR).padEnd(STATS_DAY_BAR) + right(bytes(saved[i]!), NUM_W)] : [])),
    "  " + STATS_WAYS.map(([, ch, name]) => `${ch} ${name}`).join("  "),
    "",
  ];
}

// D-STATS-FIX-1 (4): one count with its scope; a way with nothing to count is left out.
function hookLine(redirected: number, replaced: number): string[] {
  const all = redirected + replaced;
  if (all === 0) return [];
  const parts = [...(redirected > 0 ? [`${int(redirected)} sent to the sandbox`] : []), ...(replaced > 0 ? [`${int(replaced)} cut down`] : [])];
  const what = plural(all, "large output");
  return [parts.length === 1 ? `  Project hooks: ${what} ${parts[0]!.replace(/^[\d,]+ /, "")}` : `  Project hooks: ${what} kept out · ${parts.join(", ")}`];
}

function fit(line: string): string {
  const chars = [...line];
  return chars.length <= STATS_WIDTH ? line : chars.slice(0, STATS_WIDTH - 1).join("") + "…";
}

function report(f: Facts, sessionId: string, agent: string): string {
  const head = [STATS_REPORT_TITLE, "─".repeat(STATS_WIDTH), ""];
  const project = sum(f.groups);
  if (project.calls === 0) return [...head, ...STATS_EMPTY_LINES].join("\n");

  const session = sum(f.groups.filter((g) => g.session === sessionId));
  const [scopeName, focus] = session.calls > 0 ? ["This session", session] : ["This project", project];
  const top = Math.max(focus.produced, focus.returned);
  const extra = session.calls > 0 ? ` · ${span(f.span)} active` : "";
  const lines = [
    ...head,
    `${scopeName} · ${plural(focus.calls, "call")}${extra}`,
    `  ${bytes(focus.produced)} became ${bytes(focus.returned)}: ${bytes(focus.saved)} kept out (${pct(focus)})`,
    "  " + "Without context-mode".padEnd(LABEL_W) + "|" + bar(focus.produced, top, STATS_HEAD_BAR, "█", "░") + "|" + right(bytes(focus.produced), NUM_W),
    "  " + "With context-mode".padEnd(LABEL_W) + "|" + bar(focus.returned, top, STATS_HEAD_BAR, "█", "░") + "|" + right(bytes(focus.returned), NUM_W),
    ...(focus.saved > 0 ? [windowLine(focus.saved), STATS_TOKEN_NOTE] : []),
    ...hookLine(f.redirected, f.replaced),
    "",
    ...lastDays(f.week, project.calls + f.redirected),
    // D-STATS-FIX-1 (5): one DB per project holds every session of it, so project and all-time are one row.
    "By scope",
    ...table("Scope", [{ name: "session", ...session }, { name: "project (all-time)", ...project }]),
    "",
    "By tool (this project)",
    ...table("Tool", toolRows(f.tools)),
    "",
    ...(f.top.length > 0
      ? ["Largest single outputs (made → sent to the chat)",
        ...f.top.map((t) => "  " + label(toolName(t.name)) + right(bytes(t.produced), NUM_W) + " → " + right(bytes(t.returned), NUM_W)), ""]
      : []),
  ];

  const agents = new Map<string, Totals>();
  for (const g of f.groups) agents.set(g.agent, sum([agents.get(g.agent) ?? EMPTY, g]));
  if (!agents.has(agent)) agents.set(agent, EMPTY);
  lines.push("By agent (this project)", ...table("Agent", [...agents].map(([name, t]) => ({ name, ...t })).sort(bySaved)), "");

  const maxKind = Math.max(0, ...[...f.kinds.values()].map((k) => k.project));
  lines.push("Kept in the session journal", "  " + "Journal".padEnd(LABEL_W) + right("Session", STATS_KIND_W) + right("Project", STATS_KIND_W));
  for (const [kind, name] of STATS_KIND_LABELS) {
    const k = f.kinds.get(kind) ?? { session: 0, project: 0 };
    lines.push(("  " + label(name) + right(int(k.session), STATS_KIND_W) + right(int(k.project), STATS_KIND_W) + "  " + bar(k.project, maxKind, STATS_KIND_BAR)).trimEnd());
  }
  lines.push("", ...STATS_JOURNAL_HINTS.map((h) => "  " + h), "");

  // D-STATS-FIX-1 (6): the source count shows once.
  lines.push(
    "  " + "Index and search".padEnd(LABEL_W) + `${plural(f.sources.count, "source")} · ${plural(f.sources.chunks, "chunk")} · ` +
      `${bytes(f.sources.bytes)} · ${plural(f.tools.find((t) => t.name === "ctx_search")?.calls ?? 0, "ctx_search call")}`,
    "  " + "Database file".padEnd(LABEL_W) + bytes(f.dbBytes),
    "  " + "Sessions".padEnd(LABEL_W) + `${int(f.sessions)} · agents ${int(f.agents)} · active days ${int(f.days)}`,
    "",
    STATS_FOOTER_URL,
    "github.com/" + ISSUE_REPO_SLUG,
  );
  return lines.map(fit).join("\n");
}

async function handler(_input: CtxStatsInput, ctx: ToolContext): Promise<ToolReply> {
  const db = await openDb(ctx.project, { readOnly: true }); // step 1
  let facts: Facts;
  try {
    // D-STATS-SNAPSHOT-1: every SELECT of one reply reads one WAL snapshot. BEGIN DEFERRED takes no lock
    // until the first read, and on a reader it never takes a write lock; COMMIT or ROLLBACK ends it.
    db.raw.exec("BEGIN DEFERRED");
    try {
      facts = readFacts(db.raw, ctx.sessionId);
      db.raw.exec("COMMIT");
    } catch (err) {
      if (db.raw.isTransaction) db.raw.exec("ROLLBACK");
      throw err;
    }
  } finally {
    closeDb(db);
  }
  const groups = facts.groups;
  // Step 3. One DB per project holds every worktree and session of it, so the project scope and the
  // all-time scope read the same rows (D-M4-S3-1); the session id comes from the server (D-M4-arch-3).
  const session = sum(groups.filter((g) => g.session === ctx.sessionId));
  const project = sum(groups);
  const allTime = project;
  // Step 6 + PRD §12: one row per agent; the calling agent always has one ("no data" with the reason).
  const agentIds = [...new Set([...groups.map((g) => g.agent), ctx.project.agent])].sort();
  const mdTable = [
    "| " + STATS_COLUMNS.join(" | ") + " |",
    "|" + STATS_COLUMNS.map(() => "---").join("|") + "|",
    tableRow("session", session),
    tableRow("project", project),
    tableRow("all-time", allTime),
    ...agentIds.map((a) => tableRow("agent " + a, sum(groups.filter((g) => g.agent === a)))),
  ].join("\n");
  const summary = STATS_SUMMARY(reductionPct(allTime), reductionPct(session)); // step 7 first line
  // D-STATS-REPORT-1: summary line, the report for people (code block keeps the columns), the table for agents.
  const text = summary + "\n\n```text\n" + report(facts, ctx.sessionId, ctx.project.agent) + "\n```\n\n" + mdTable;
  // Steps 8-9: the cap check runs on every reply, like every other tool.
  return { text: capBytes(text, OUTPUT_CAP).text, isError: false, sandboxBytes: 0 };
}

export const ctxStats = Object.freeze({
  name: "ctx_stats",
  schema: ctxStatsSchema,
  readOnly: true,
  alwaysLoad: false,
  handler,
});
