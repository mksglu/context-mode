// impl/06 §5, PRD §12, TECH-SPEC GP10 + §6.2a D3; DECISIONS-r4 I1-14, I1-15, I1-19; DECISIONS-r9 V18, V19;
// DEVIATIONS D-M4-arch-3 (handler shape (input, ctx)), D-M4-arch-4 (sums sandbox_bytes/returned_bytes),
// D-M4-S3-1 (call rows, scopes, labels), D-STATS-REPORT-1 (detailed text report, ctx_stats rows not counted).
// ctx_stats: on demand, one read-only open of this project's own context.db; it opens no other DB, so no
// sibling DB is ever opened or touched (#1213, #1236).
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod/v4";
import {
  MS_PER_DAY,
  OUTPUT_CAP,
  PERCENT_SCALE,
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
  const pages = raw.prepare("PRAGMA page_count").get() as Row;
  const size = raw.prepare("PRAGMA page_size").get() as Row;
  return {
    groups, tools, kinds, span,
    sessions: Number(meta.sessions), agents: Number(meta.agents), days: Number(meta.days),
    sources: { count: Number(src.n), chunks: Number(src.chunks), bytes: Number(src.bytes) },
    dbBytes: Number(pages.page_count) * Number(size.page_size),
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
  if (n < STATS_KIB) return int(n) + " B";
  let v = n / STATS_KIB;
  let u = 0;
  while (v >= STATS_KIB && u < UNITS.length - 1) { v /= STATS_KIB; u++; }
  return v.toFixed(1) + " " + UNITS[u];
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
function table(title: string, rows: Named[]): string[] {
  const max = Math.max(0, ...rows.map((r) => r.saved));
  const head = "  " + title.padEnd(LABEL_W) + "Calls".padStart(STATS_CALLS_W) + "Produced".padStart(NUM_W) + "Returned".padStart(NUM_W) +
    "Saved".padStart(NUM_W) + "%".padStart(PCT_W);
  return [head, ...rows.map((r) => ("  " + label(r.name) + count(r.calls).padStart(STATS_CALLS_W) + bytes(r.produced).padStart(NUM_W) +
    bytes(r.returned).padStart(NUM_W) + bytes(r.saved).padStart(NUM_W) + pct(r).padStart(PCT_W) + " " + bar(r.saved, max, STATS_ROW_BAR)).trimEnd())];
}

function bySaved(a: Named, b: Named): number {
  // Most saved first; on a tie, more produced first, then fewer bytes sent to the chat, then the name.
  return b.saved - a.saved || b.produced - a.produced || a.returned - b.returned || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
}

function toolRows(tools: Named[]): Named[] {
  const named = tools.map((t) => ({ ...t, name: t.name.startsWith("ctx_") ? t.name : "hook " + t.name })).sort(bySaved);
  if (named.length <= STATS_MAX_TOOL_ROWS) return named;
  const rest = named.slice(STATS_MAX_TOOL_ROWS - 1);
  return [...named.slice(0, STATS_MAX_TOOL_ROWS - 1), { name: `other (${rest.length} tools)`, ...sum(rest) }];
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
    "  " + "Without context-mode".padEnd(LABEL_W) + "|" + bar(focus.produced, top, STATS_HEAD_BAR, "█", "░") + "|" + bytes(focus.produced).padStart(NUM_W),
    "  " + "With context-mode".padEnd(LABEL_W) + "|" + bar(focus.returned, top, STATS_HEAD_BAR, "█", "░") + "|" + bytes(focus.returned).padStart(NUM_W),
    `  ${bytes(focus.saved)} saved (${pct(focus)}) · about ${int(focus.saved / STATS_BYTES_PER_TOKEN)} tokens kept out of the chat`,
    "",
    ...table("Scope", [{ name: "session", ...session }, { name: "project", ...project }, { name: "all-time", ...project }]),
    "",
    "Where the savings came from (this project)",
    ...table("Tool", toolRows(f.tools)),
    "",
  ];

  const agents = new Map<string, Totals>();
  for (const g of f.groups) agents.set(g.agent, sum([agents.get(g.agent) ?? EMPTY, g]));
  if (!agents.has(agent)) agents.set(agent, EMPTY);
  lines.push(...table("Agent", [...agents].map(([name, t]) => ({ name, ...t })).sort(bySaved)), "");

  const maxKind = Math.max(0, ...[...f.kinds.values()].map((k) => k.project));
  lines.push("Kept in the session journal", "  " + "Journal".padEnd(LABEL_W) + "Session".padStart(STATS_KIND_W) + "Project".padStart(STATS_KIND_W));
  for (const [kind, name] of STATS_KIND_LABELS) {
    const k = f.kinds.get(kind) ?? { session: 0, project: 0 };
    lines.push(("  " + label(name) + int(k.session).padStart(STATS_KIND_W) + int(k.project).padStart(STATS_KIND_W) + "  " + bar(k.project, maxKind, STATS_KIND_BAR)).trimEnd());
  }
  lines.push("", ...STATS_JOURNAL_HINTS.map((h) => "  " + h), "");

  lines.push(
    "  " + "Indexed sources".padEnd(LABEL_W) + `${int(f.sources.count)} · ${plural(f.sources.chunks, "chunk")} · ${bytes(f.sources.bytes)} of content`,
    "  " + "Database file".padEnd(LABEL_W) + bytes(f.dbBytes),
    "  " + "Sessions".padEnd(LABEL_W) + `${int(f.sessions)} · agents ${int(f.agents)} · active days ${int(f.days)}`,
  );
  return lines.map(fit).join("\n");
}

async function handler(_input: CtxStatsInput, ctx: ToolContext): Promise<ToolReply> {
  const db = await openDb(ctx.project, { readOnly: true }); // step 1
  let facts: Facts;
  try {
    facts = readFacts(db.raw, ctx.sessionId);
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
