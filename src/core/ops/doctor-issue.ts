// src/core/ops/doctor-issue.ts — the ctx_doctor agent issue path (D-DOCTOR-ISSUE-1, ADR-0010, ADR-0014).
// Owner 2026-11-03: "User in AI Agent'i, issue yu oyle bir doldurmali ki o issueye oyle veriler vermeliyiz ki sen
// aninda onu fixleyebilmelisin". The report file is the issue body of .github/ISSUE_TEMPLATE/agent-report.yml:
// one "### <label>" section per form field (ISSUE_FORM_HEADINGS), filled with what a maintainer asked for in the
// tester replies (versions, install route, config entries, hook errors, journal rows, env paths, a repro script).
// Home paths show as ~, secret values are masked, journal bodies stay out. Never throws: a fact it cannot read is a line.
import { spawnSync } from "node:child_process";
import { closeSync, existsSync, fstatSync, mkdirSync, openSync, readFileSync, readSync, realpathSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import {
  type UnsupportedHost, BUNDLE_SHA, CONFIG_TOML_FILE, DOCTOR_CONFIG_LINES, DOCTOR_ENV_NAMES, DOCTOR_ENV_PREFIX, DOCTOR_GH_LINE, DOCTOR_GH_NEXT,
  DOCTOR_GIT_VERSION_TIMEOUT_MS, DOCTOR_HOOK_LOG_LINES, DOCTOR_JOURNAL_ROWS, DOCTOR_LOG_TAIL_BYTES, DOCTOR_MASK,
  DOCTOR_PATH_TOOLS, DOCTOR_REPORT_FILE_PREFIX, DOCTOR_REPORT_LINE, DOCTOR_REPORTS_DIR, DOCTOR_SECRET_WORDS, DOCTOR_URL_LINE, DOCTOR_RULES_LINE,
  EXE_SUFFIX, ISSUE_FORM_HEADINGS, ISSUE_FORM_URL, ISSUE_GUIDE_URL, ISSUE_REPO_SLUG, ISSUE_URL_MAX, NATIVE_INSTALL, SETTINGS_FILE,
} from "../contracts/constants.ts";
import type { AdapterRow, DoctorRow, ToolContext } from "../contracts/types.ts";
import { hookLogPath } from "../hooks/fallback.ts";
import { claudeDirOf, codexDirOf, homeDirOf, resolveConfigDir } from "../project/config-dir.ts";
import { closeDb, openDb } from "../store/db.ts";
import { configPaths } from "./doctor-config.ts";

const TOKEN_PREFIXES = ["ghp_", "gho_", "github_pat_", "sk-", "xoxb-", "AKIA"];

/** Home paths as ~ (both the HOME text and its realpath, since macOS tmp dirs differ). */
export function tildeOf(env: NodeJS.ProcessEnv): (text: string) => string {
  const home = homeDirOf(env);
  if (home === null || home === "") return (t) => t;
  const homes = [home];
  try {
    const real = realpathSync.native(home);
    if (real !== home) homes.push(real);
  } catch { /* HOME is absent on disk; the text form is enough */ }
  homes.sort((a, b) => b.length - a.length);
  // D-DOCTOR-WIN-1: a Windows path under home prints with "/" after the "~", so the report, the gh line and the form agree on every OS.
  const slash = (rest: string): string => rest.replace(/^[^\s"'`|)>,;]*/, (run) => run.replace(/\\/g, "/"));
  return (t) => homes.reduce((acc, h) => acc.split(h).map((piece, n) => (n === 0 ? piece : slash(piece))).join("~"), t);
}

/** A line that names a secret word or a token prefix keeps its key and loses its value. */
export function maskLine(line: string): string {
  const lower = line.toLowerCase();
  const named = DOCTOR_SECRET_WORDS.some((w) => lower.includes(w));
  const token = TOKEN_PREFIXES.some((p) => line.includes(p));
  if (!named && !token) return line;
  const at = Math.max(line.indexOf(":"), line.indexOf("="));
  return at === -1 ? DOCTOR_MASK : line.slice(0, at + 1) + " " + DOCTOR_MASK;
}

/** One line above the table: context-mode version and sha, agent and version, OS-arch, Node, shell. */
export function environmentLine(ctx: ToolContext, adapter: AdapterRow, env: NodeJS.ProcessEnv, version: string | undefined): string {
  const sha = BUNDLE_SHA === undefined ? "dev build" : BUNDLE_SHA.slice(0, 7);
  const client = ctx.clientInfo;
  const agent = client === undefined ? adapter.id
    : client.name === adapter.id ? `${adapter.id} ${client.version}` : `${adapter.id} ${client.version} (client ${client.name})`;
  const shell = env.SHELL ?? env.ComSpec ?? "sh";
  // D-DOCTOR-FIX-1: two lines, so each fits 80 columns: what runs, then where it runs.
  return `${DOCTOR_ENV_PREFIX}context-mode ${version ?? "source checkout"} (${sha}), agent ${agent}\n` +
    `${DOCTOR_ENV_PREFIX}${process.platform}-${process.arch}, Node ${process.version}, shell ${shell}`;
}

function gitVersion(env: NodeJS.ProcessEnv): string {
  const r = spawnSync("git", ["--version"], { env, encoding: "utf8", timeout: DOCTOR_GIT_VERSION_TIMEOUT_MS, windowsHide: true });
  if (r.status === 0) return `${r.stdout}`.trim();
  return `git --version: ${r.error ? r.error.message : `exit ${r.status}`}`;
}

function onPath(env: NodeJS.ProcessEnv, tool: string): string[] {
  const names = process.platform === "win32" ? [tool + EXE_SUFFIX, tool + ".cmd", tool] : [tool];
  const out: string[] = [];
  for (const dir of (env.PATH ?? env.Path ?? "").split(delimiter)) {
    if (dir === "") continue;
    for (const n of names) if (existsSync(join(dir, n))) { out.push(join(dir, n)); break; }
  }
  return out;
}

function hookLogTail(env: NodeJS.ProcessEnv): string[] {
  const file = hookLogPath(env);
  if (file === "" || !existsSync(file)) return [`(${file || "hook-errors.log"} holds zero lines)`];
  try {
    const fd = openSync(file, "r");
    try {
      const size = fstatSync(fd).size;
      const start = Math.max(0, size - DOCTOR_LOG_TAIL_BYTES);
      const buf = Buffer.alloc(size - start);
      readSync(fd, buf, 0, buf.length, start);
      const lines = buf.toString("utf8").split("\n").filter((l) => l.trim() !== "");
      if (start > 0) lines.shift(); // the first line of a tail read starts mid-line
      return lines.slice(-DOCTOR_HOOK_LOG_LINES).map(maskLine);
    } finally {
      closeSync(fd);
    }
  } catch (err) {
    return [`hook-errors.log read: ${err instanceof Error ? err.message : String(err)}`];
  }
}

async function journalRows(ctx: ToolContext): Promise<string[]> {
  const head = ["| kind | tool | bytes | ok | exit_code | created_at |", "|---|---|---|---|---|---|"];
  if (!existsSync(ctx.project.dbPath)) return [`(context.db is absent at ${ctx.project.dbPath})`];
  try {
    const db = await openDb(ctx.project, { readOnly: true });
    try {
      const rows = db.raw.prepare(`SELECT kind, tool, bytes, ok, exit_code, created_at FROM events ORDER BY seq DESC LIMIT ${DOCTOR_JOURNAL_ROWS}`).all() as Record<string, unknown>[];
      const cell = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
      return head.concat(rows.map((r) => `| ${cell(r.kind)} | ${cell(r.tool)} | ${cell(r.bytes)} | ${cell(r.ok)} | ${cell(r.exit_code)} | ${typeof r.created_at === "number" ? new Date(r.created_at).toISOString() : cell(r.created_at)} |`));
    } finally {
      closeDb(db);
    }
  } catch (err) {
    return [`journal read: ${err instanceof Error ? err.message : String(err)}`];
  }
}

/** The agent's config files that hold context-mode, with only the lines that name it (masked). */
function agentConfig(adapter: AdapterRow, env: NodeJS.ProcessEnv, worktree: string): string[] {
  const home = homeDirOf(env);
  const files = configPaths(adapter, env, worktree);
  if (home !== null) {
    if (adapter.id === "claude-code") files.push({ label: "agent settings (enabledPlugins)", path: join(claudeDirOf(env, home), SETTINGS_FILE) });
    if (adapter.id === "codex") files.push({ label: "agent config (plugins, trust)", path: join(codexDirOf(env, home), CONFIG_TOML_FILE) });
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const f of files) {
    if (seen.has(f.path)) continue;
    seen.add(f.path);
    if (!existsSync(f.path)) { out.push(`${f.label}: ${f.path} (absent)`); continue; }
    let text = "";
    try { text = readFileSync(f.path, "utf8"); } catch (err) { out.push(`${f.label}: ${f.path} (read: ${err instanceof Error ? err.message : String(err)})`); continue; }
    const hit = text.split("\n").filter((l) => l.includes("context-mode") || l.includes("hook.mjs") || (adapter.id === "codex" && l.includes("trust")));
    out.push(`${f.label}: ${f.path} (${hit.length} matching lines)`);
    for (const l of hit.slice(0, DOCTOR_CONFIG_LINES)) out.push("    " + maskLine(l.trimEnd()));
  }
  return out;
}

export interface IssueInput {
  unsupported?: UnsupportedHost; // D-UNSUPPORTED-HOSTS-1
  ctx: ToolContext;
  adapter: AdapterRow;
  env: NodeJS.ProcessEnv;
  bundleDir: string;
  rows: DoctorRow[];
  envLine: string; // environmentLine(...)
  table: string;   // buildReport(...) whole: rows, command line, env lines
}

function failing(rows: DoctorRow[]): DoctorRow[] {
  return rows.filter((r) => r.status === "FAIL");
}

export function issueTitle(agent: string, rows: DoctorRow[], other?: UnsupportedHost): string {
  return `ctx_doctor ${agent}${other === undefined ? "" : ` (${other.name} is not a supported host today)`}: ${failing(rows).map((r) => `${r.id} ${r.label}`).join(", ")} FAIL`;
}

export function summaryOf(agent: string, rows: DoctorRow[], other?: UnsupportedHost): string {
  const f = failing(rows)[0];
  const tag = other === undefined ? "" : `${other.name} is not a supported host today. `;
  return tag + (f === undefined ? `ctx_doctor ${agent}` : `${f.id} ${f.label} FAIL on ${agent}: ${f.detail}`);
}

/** The issue body; section order = ISSUE_FORM_HEADINGS (a test pins it). */
export async function buildIssueBody(i: IssueInput): Promise<string> {
  const tilde = tildeOf(i.env);
  const agent = i.adapter.id;
  const install = NATIVE_INSTALL[agent] ?? [];
  const failRows = i.rows.filter((r) => r.status !== "PASS");
  const envNames = DOCTOR_ENV_NAMES.map((n) => (i.env[n] === undefined ? `${n} (unset)` : `${n}=${i.env[n]}`));
  const pathTools = DOCTOR_PATH_TOOLS.map((t) => `PATH holds ${t}: ${onPath(i.env, t).join(", ") || "(absent)"}`);
  const sections: Record<string, string[]> = {
    "Summary": [summaryOf(agent, i.rows, i.unsupported)],
    "ctx-report": [i.table],
    "What happened": [
      "Rows that need a look:",
      ...failRows.map((r) => `- ${r.id} ${r.label} ${r.status}: ${r.detail}${r.fixCommand ? ` (Fix: ${r.fixCommand})` : ""}`),
      "Error code and text: <the agent fills this in: the exact error the user saw>",
    ],
    "Hook errors": ["hook-errors.log, last " + DOCTOR_HOOK_LOG_LINES + " lines (UTC):", "```", ...hookLogTail(i.env), "```"],
    "Journal rows": ["events, newest first, last " + DOCTOR_JOURNAL_ROWS + " (bodies stay local):", ...(await journalRows(i.ctx))],
    "Agent config": agentConfig(i.adapter, i.env, i.ctx.project.worktree),
    "Expected": ["Expected: <the agent fills this in: what should happen, with the byte count>"],
    "Steps": [
      "Reproduced: <yes (2 of 2) or 1 of 2>",
      "Prompt or command: <the agent fills this in: the exact prompt or command>",
      "Actual: <the agent fills this in: what context-mode did, with the byte count>",
      "Repro script (fresh HOME, native install for " + agent + "):",
      "```sh",
      'export HOME="$(mktemp -d)"',
      'cd "$HOME"',
      ...install,
      "<the command or prompt above>",
      "```",
    ],
    "Environment": [
      i.envLine,
      `context-mode bundle: ${i.bundleDir}`,
      `Install route: ${install.join(" && ")}`,
      `git: ${gitVersion(i.env)}`,
      ...pathTools,
      ...envNames,
      `Project: ${i.ctx.project.worktree} (key ${i.ctx.project.projectKey})`,
      "Filed by: <your agent name, version, model id>",
    ],
  };
  const out: string[] = [];
  for (const h of ISSUE_FORM_HEADINGS) out.push(`### ${h}`, "", ...(sections[h] ?? []), "");
  return tilde(out.join("\n"));
}

/** Writes the report file and returns the lines printed under the table: path, gh command, form URL, filing rules. */
export async function writeIssueReport(i: IssueInput): Promise<string[]> {
  const tilde = tildeOf(i.env);
  const body = await buildIssueBody(i);
  const dir = join(resolveConfigDir(i.env), DOCTOR_REPORTS_DIR);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${DOCTOR_REPORT_FILE_PREFIX}${new Date().toISOString().replace(/[:.]/g, "-")}.md`);
  writeFileSync(file, body);
  const shown = tilde(file);
  const title = issueTitle(i.adapter.id, i.rows, i.unsupported);
  // gh refuses --template together with --body-file; the body file already holds the form's sections.
  // D-DOCTOR-FIX-1: the command wraps with a trailing backslash, so each line fits 80 columns and a shell runs it as one.
  const gh = [`gh issue create --repo ${ISSUE_REPO_SLUG} --label bug \\`, `${DOCTOR_GH_NEXT}title ${JSON.stringify(title)} \\`, `${DOCTOR_GH_NEXT}body-file ${shown}`];
  return [DOCTOR_REPORT_LINE + shown, DOCTOR_GH_LINE + gh[0], gh[1]!, gh[2]!, DOCTOR_URL_LINE + formUrl(title, summaryOf(i.adapter.id, i.rows, i.unsupported)), DOCTOR_RULES_LINE + ISSUE_GUIDE_URL];
}

/** The prefilled agent-report.yml URL: title and summary only, under ISSUE_URL_MAX. */
export function formUrl(title: string, summary: string): string {
  const base = `${ISSUE_FORM_URL}&title=${encodeURIComponent(title)}`;
  const full = `${base}&summary=${encodeURIComponent(summary)}`;
  return full.length < ISSUE_URL_MAX ? full : base;
}
