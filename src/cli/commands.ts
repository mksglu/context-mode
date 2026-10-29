// src/cli/commands.ts: context-mode setup, doctor and upgrade on top of the setup engine (ADR-0019 sections 4-8,
// Owner decisions D5-D7). Results go to stdout, progress and errors to stderr. Prompts (@clack/prompts, bundled at
// build time, D5) run only when stdin and stdout are a TTY and neither --yes, --no-input nor --json is set; every
// other run takes the flag path and never waits for input (exit 2 when an answer is needed).
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import * as clack from "@clack/prompts";
import { ADAPTERS } from "../adapters/table.ts";
import type { AgentId } from "../core/contracts/agents.ts";
import { homeDirOf } from "../core/project/config-dir.ts";
import { buildRegistry, detectAgents, printPlan, printText, runDoctor, runRemove, runSetup, STATE_DIR } from "../setup/index.ts";
import type { AgentResult, SetupContext, SetupResult } from "../setup/index.ts";
import { HELP, parseFlags, UsageError, type Command, type Flags } from "./args.ts";

export const EXIT_OK = 0;
export const EXIT_FAIL = 1;
export const EXIT_USAGE = 2;
export const EXIT_SIGINT = 130;
export const ISSUE_REPO = "mksglu/context-mode";
const REPORT_DIR = "reports";
const URL_BODY_MAX = 6000; // GitHub rejects very long prefilled URLs; the report file stays whole
const NO_TTY = "an answer is needed and there is no TTY (or --no-input is set). Run again with --yes to apply, or with --dry-run to only see the plan.";

export interface CliEnv { pkgDir: string; version: string; argv: readonly string[]; }
type Clack = typeof clack;
interface Ui { f: Flags; ctx: SetupContext; clack?: Clack; env: CliEnv; }

// ---------- output ----------

const out = (s: string): void => { process.stdout.write(s.endsWith("\n") ? s : s + "\n"); };
const err = (s: string): void => { process.stderr.write(s.endsWith("\n") ? s : s + "\n"); };
function progress(ui: Ui, s: string): void {
  if (ui.f.quiet) return;
  if (ui.clack) ui.clack.log.step(s); else err(s);
}
const fixFor = (id: AgentId): string => `context-mode setup --agents ${id}`;

/** D-INST-7: a PASS row names the checks that ran, so a user sees what was verified. */
function passDetail(a: AgentResult): string {
  if (a.status !== "PASS" || !a.checks.length) return "";
  const warns = a.checks.filter((c) => c.warn).map((c) => `; WARN ${c.name}: ${c.detail}`).join("");
  return `checked: ${a.checks.map((c) => c.name).join(", ")}${warns}`;
}

function table(agents: readonly AgentResult[]): string {
  // OPEN-ITEMS H8: the row names the host CLI file that ran, so a wrapper on PATH is visible.
  const rows = agents.map((a) => `${a.id.padEnd(13)} ${a.status.padEnd(7)} ${a.reason ?? passDetail(a)}${a.bin ? `; bin: ${a.bin}` : ""}${a.rolledBack ? " (rolled back)" : ""}`.trimEnd());
  return [`${"AGENT".padEnd(13)} STATUS  DETAIL`, ...rows].join("\n");
}

function failLines(agents: readonly AgentResult[]): string[] {
  return agents.filter((a) => a.status === "FAIL").map((a) => `FAIL ${a.id}: ${a.reason ?? "failed"}. Fix: ${fixFor(a.id)}`);
}

function verboseLines(agents: readonly AgentResult[]): string[] {
  return agents.flatMap((a) => a.checks.map((c) => `  ${a.id} ${c.warn ? "WARN" : c.ok ? "ok  " : "FAIL"} ${c.name}${c.detail ? `: ${c.detail}` : ""}`));
}

function planText(res: SetupResult): string {
  const lines: string[] = [];
  for (const a of res.agents) {
    lines.push(`${a.id}${a.status === "PASS" ? "" : `  ${a.status}: ${a.reason ?? ""}`}`);
    if (a.status === "PASS" && !a.changes.length) lines.push("  no change needed");
    for (const c of a.changes) {
      if (c.command) lines.push(`  run  ${c.command.join(" ")}`);
      else lines.push(`  edit ${c.file ?? ""}${c.path ? `  ${c.path}` : ""}`);
    }
    for (const v of a.v1) lines.push(`  old  ${v.file}${v.path ? `  ${v.path}` : ""}: ${v.reason}`);
  }
  return lines.length ? lines.join("\n") : "No agents found. Run context-mode setup --list.";
}

/** A tiny spinner on stderr for a TTY; no escape codes (\r and spaces only), so NO_COLOR has nothing to strip. */
function spinner(ui: Ui): { start(msg: string): void; stop(): void } {
  const live = !ui.f.quiet && !ui.f.json && !!process.stderr.isTTY;
  const frames = ["|", "/", "-", "\\"];
  let t: ReturnType<typeof setInterval> | undefined;
  let width = 0;
  return {
    start(msg) {
      if (!live) return;
      let i = 0;
      t = setInterval(() => {
        const line = `${frames[i++ % frames.length]} ${msg}`;
        width = Math.max(width, line.length);
        process.stderr.write(`\r${line}`);
      }, 120);
    },
    stop() {
      if (t) clearInterval(t);
      if (t && width) process.stderr.write(`\r${" ".repeat(width)}\r`);
      t = undefined;
      width = 0;
    },
  };
}

// ---------- D6 debug report ----------

export function redact(text: string, ctx: SetupContext): string {
  let s = text;
  for (const [from, to] of [[ctx.pkgDir, "<pkg>"], [ctx.home, "~"], [os.tmpdir(), "<tmp>"]] as const) {
    if (from && from.length > 1) s = s.split(from).join(to);
  }
  return s;
}

export function fingerprint(command: string, agents: readonly AgentResult[], ctx: SetupContext): string {
  const key = agents.filter((a) => a.status === "FAIL")
    .map((a) => `${a.id}:${redact(a.reason ?? "", ctx).replace(/[0-9]+/g, "N")}`).sort().join("\n");
  return createHash("sha256").update(`${command}\n${key}`).digest("hex").slice(0, 12);
}

export function buildIssueReport(command: string, res: SetupResult, ui: Ui): { text: string; title: string } {
  const fp = fingerprint(command, res.agents, ui.ctx);
  const failed = res.agents.filter((a) => a.status === "FAIL").map((a) => a.id);
  const title = `${command} FAIL: ${failed.join(", ") || "run"} (${fp})`;
  const lines = [
    `# context-mode ${command} report`,
    "",
    "<!-- For AI agents filing this issue: keep this report whole, add the exact command you ran and what you expected. -->",
    "",
    `fingerprint: ${fp}`,
    `version: ${ui.env.version}`,
    `node: ${process.version}`,
    `platform: ${process.platform}-${process.arch}`,
    `command: context-mode ${ui.env.argv.join(" ")}`,
    `tty: ${process.stdin.isTTY ? "yes" : "no"}`,
    ...(res.error ? [`error: ${res.error}`] : []),
    "",
    "## Agents",
    "",
    "| Agent | Status | Detail |",
    "|---|---|---|",
    ...res.agents.map((a) => `| ${a.id} | ${a.status}${a.rolledBack ? " (rolled back)" : ""} | ${a.reason ?? ""} |`),
    "",
    "## Checks",
    "",
    ...res.agents.flatMap((a) => a.checks.map((c) => `- ${a.id} ${c.warn ? "WARN" : c.ok ? "ok" : "FAIL"} ${c.name}${c.detail ? `: ${c.detail}` : ""}`)),
    "",
    "## Old entries",
    "",
    ...res.agents.flatMap((a) => a.v1.map((v) => `- ${a.id} ${v.file} ${v.path}: ${v.reason}`)),
    "",
  ];
  return { text: redact(lines.join("\n"), ui.ctx), title };
}

function ghReady(env: SetupContext["env"]): boolean {
  const r = spawnSync("gh", ["auth", "status"], { env, stdio: "ignore", timeout: 10_000, windowsHide: true });
  return r.status === 0;
}

function issueUrl(title: string, body: string): string {
  const b = body.length > URL_BODY_MAX ? body.slice(0, URL_BODY_MAX) + "\n(cut; attach the report file)" : body;
  return `https://github.com/${ISSUE_REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(b)}`;
}

/** D6: write the redacted report; on a TTY show it and ask once; never send without a keypress. */
async function report(ui: Ui, command: string, res: SetupResult, write: boolean): Promise<void> {
  const { text, title } = buildIssueReport(command, res, ui);
  let file = "";
  if (write) {
    const dir = path.join(ui.ctx.home, STATE_DIR, REPORT_DIR);
    mkdirSync(dir, { recursive: true });
    file = path.join(dir, `${command}-${new Date().toISOString().replace(/[:.]/g, "-")}.md`);
    writeFileSync(file, text);
  }
  const gh = `gh issue create --repo ${ISSUE_REPO} --title ${JSON.stringify(title)} --body-file ${JSON.stringify(file || "<report>")}`;
  const p = ui.clack;
  if (!p) {
    if (ui.f.debug) err(text);
    if (file) err(`Debug report (redacted): ${file}`);
    err(`To report it: ${gh}`);
    return;
  }
  p.note(text, "Debug report (redacted)");
  const yes = await p.confirm({ message: `Open an issue on github.com/${ISSUE_REPO} with this report?`, initialValue: false });
  if (p.isCancel(yes) || !yes) { p.log.info(`Not sent.${file ? ` Report: ${file}` : ""}`); return; }
  if (file && ghReady(ui.ctx.env)) {
    const r = spawnSync("gh", ["issue", "create", "--repo", ISSUE_REPO, "--title", title, "--body-file", file], { env: ui.ctx.env, encoding: "utf8", timeout: 60_000, windowsHide: true });
    if (r.status === 0) { p.log.success(`Issue opened: ${`${r.stdout}`.trim()}`); return; }
    p.log.warn(`gh issue create failed: ${`${r.stderr}`.trim()}`);
  }
  p.log.info(`Open this URL to file the issue:\n${issueUrl(title, text)}`);
}

// ---------- apply with live checklist and Ctrl-C rollback ----------

async function apply(ui: Ui, agents: AgentId[] | undefined, dryRun: boolean): Promise<SetupResult> {
  const ac = new AbortController();
  const onSig = (): void => {
    ac.abort(); // the engine rolls back the agent in progress and releases the lock, synchronously
    err("\nStopped with Ctrl-C; the agent in progress was rolled back.");
    process.exit(EXIT_SIGINT);
  };
  if (!dryRun) process.on("SIGINT", onSig);
  const spin = spinner(ui);
  try {
    return await runSetup({
      ...ui.ctx, agents, dryRun, signal: ac.signal,
      onAgent: (id, phase, r) => {
        if (dryRun) return;
        if (phase === "start") { progress(ui, `${id}: apply and verify ...`); spin.start(`${id}: verifying`); return; }
        spin.stop();
        const line = `${id}: ${r?.status}${r?.reason ? ` (${r.reason})` : ""}`;
        if (ui.f.quiet) return;
        if (!ui.clack) err(line);
        else if (r?.status === "FAIL") ui.clack.log.error(line);
        else if (r?.status === "PASS") ui.clack.log.success(line);
        else ui.clack.log.warn(line);
      },
    });
  } finally {
    spin.stop();
    process.off("SIGINT", onSig);
  }
}

async function finish(ui: Ui, command: string, res: SetupResult, writeReport: boolean): Promise<number> {
  if (ui.f.json) out(JSON.stringify({ command, ...res }));
  else if (ui.clack) ui.clack.note(table(res.agents), "Summary");
  else out(table(res.agents));
  if (ui.f.verbose && !ui.f.json) for (const l of verboseLines(res.agents)) err(l);
  if (res.error) err(`FAIL ${command}: ${res.error}. Fix: context-mode ${command}${command === "setup" ? " --repair" : ""}`);
  for (const l of failLines(res.agents)) err(l);
  if (res.exitCode !== EXIT_OK) await report(ui, command, res, writeReport);
  return res.exitCode;
}

// ---------- commands ----------

function list(ui: Ui): number {
  const reg = buildRegistry(ui.ctx);
  const detected = new Set(detectAgents(reg, ui.ctx));
  const rows = ADAPTERS.map((a) => ({
    id: a.id,
    hooks: a.hookChannel.kind, // ADR-0020: every agent has a hook channel
    installMode: a.installMode,
    detected: detected.has(a.id),
  }));
  if (ui.f.json) { out(JSON.stringify({ agents: rows })); return EXIT_OK; }
  out(`${"AGENT".padEnd(13)} ${"HOOKS".padEnd(11)} ${"FOUND".padEnd(9)} INSTALL`);
  for (const r of rows) out(`${r.id.padEnd(13)} ${r.hooks.padEnd(11)} ${(r.detected ? "detected" : "-").padEnd(9)} ${r.installMode}`);
  return EXIT_OK;
}

async function remove(ui: Ui): Promise<number> {
  if (!ui.f.dryRun && !ui.f.yes) {
    if (!ui.clack) { err(`context-mode: ${NO_TTY}`); return EXIT_USAGE; }
    const ok = await ui.clack.confirm({ message: "Undo every setup run and put each touched file back?", initialValue: false });
    if (ui.clack.isCancel(ok)) { ui.clack.cancel("Cancelled; nothing changed."); return EXIT_SIGINT; }
    if (!ok) { ui.clack.outro("Nothing changed."); return EXIT_OK; }
  }
  if (ui.f.dryRun) { out(`Would restore every file recorded under ${path.join(ui.ctx.home, STATE_DIR, "backups")}`); return EXIT_OK; }
  const r = runRemove({ home: ui.ctx.home, env: ui.ctx.env });
  if (ui.f.json) out(JSON.stringify(r));
  else out(`Restored ${r.restored} file(s).`);
  if (r.error) err(`FAIL remove: ${r.error}. Fix: context-mode setup --remove --yes`);
  return r.exitCode;
}

/** setup --print <id>: the manual step from the same registry row setup applies; writes nothing. */
function printManual(ui: Ui, id: AgentId): number {
  const row = buildRegistry(ui.ctx).find((r) => r.id === id)!;
  const p = printPlan(row, ui.ctx.env);
  if (ui.f.json) out(JSON.stringify({ command: "setup", print: p }));
  else out(printText(p));
  return EXIT_OK;
}

async function setup(ui: Ui): Promise<number> {
  const { f } = ui;
  if (f.print) return printManual(ui, f.print);
  if (f.list) return list(ui);
  if (f.remove) return remove(ui);
  if (f.dryRun) {
    const plan = await apply(ui, f.agents, true);
    if (f.json) out(JSON.stringify({ command: "setup", dryRun: true, ...plan }));
    else out(planText(plan));
    if (plan.error) err(`FAIL setup: ${plan.error}`);
    return plan.exitCode;
  }
  const p = ui.clack;
  if (!f.yes && !p) {
    const plan = await apply(ui, f.agents, true);
    if (f.json) out(JSON.stringify({ command: "setup", dryRun: true, ...plan })); else out(planText(plan));
    err(`context-mode: ${NO_TTY}`);
    return EXIT_USAGE;
  }
  let ids = f.agents;
  if (p) {
    p.intro(`context-mode ${ui.env.version} setup`);
    if (!ids) {
      const detected = detectAgents(buildRegistry(ui.ctx), ui.ctx);
      const sel = await p.multiselect({
        message: "Select agents to set up (space toggles, enter confirms)",
        options: ADAPTERS.map((a) => ({ value: a.id, label: a.id, hint: detected.includes(a.id) ? "detected" : "not found" })),
        initialValues: detected,
        required: true,
      });
      if (p.isCancel(sel)) { p.cancel("Cancelled; nothing changed."); return EXIT_SIGINT; }
      ids = sel as AgentId[];
    }
    const plan = await apply(ui, ids, true);
    p.note(planText(plan), "Plan");
    if (!f.yes) {
      const ok = await p.confirm({ message: "Apply this plan?" });
      if (p.isCancel(ok)) { p.cancel("Cancelled; nothing changed."); return EXIT_SIGINT; }
      if (!ok) { p.outro("Nothing changed."); return EXIT_OK; }
    }
  }
  const res = await apply(ui, ids, false);
  const code = await finish(ui, "setup", res, true);
  p?.outro(code === EXIT_OK ? "Done. Restart your agents to load context-mode." : "Some agents failed; each one was rolled back.");
  return code;
}

async function doctor(ui: Ui): Promise<number> {
  const spin = spinner(ui);
  const res = await runDoctor({
    ...ui.ctx, agents: ui.f.agents,
    onAgent: (id, phase) => { if (phase === "start") { spin.stop(); spin.start(`${id}: checking`); } else spin.stop(); },
  });
  spin.stop();
  if (!res.agents.length && !res.error && !ui.f.json) { out("No agents found. Run context-mode setup --list."); return EXIT_OK; }
  // doctor is read-only: no report file; --debug prints the report to stderr.
  const code = await finish({ ...ui, clack: undefined }, "doctor", res, false);
  const p = ui.clack;
  if (!p || code === EXIT_OK) return code;
  let worst = code;
  for (const a of res.agents.filter((x) => x.status === "FAIL")) {
    const ok = await p.confirm({ message: `Fix ${a.id} now? (runs ${fixFor(a.id)})`, initialValue: true });
    if (p.isCancel(ok)) return EXIT_SIGINT;
    if (!ok) continue;
    const fixed = await apply(ui, [a.id], false);
    worst = await finish(ui, "setup", fixed, true);
  }
  return worst;
}

/** D-US-1: 2.0.0-next.900 came from the "next" dist-tag, 2.0.1 from "latest"; upgrade stays on that channel. */
function channelOf(version: string): string {
  const dash = version.indexOf("-");
  if (dash < 0) return "latest";
  const pre = version.slice(dash + 1).split(".")[0];
  return pre === "" ? "latest" : pre;
}

async function upgrade(ui: Ui): Promise<number> {
  const { f } = ui;
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const spec = `context-mode@${f.tag ?? channelOf(ui.env.version)}`; // --tag is checked against TAG_RE in args.ts
  const install = `npm i -g ${spec}`;
  const agentArgs = f.agents ? ["--agents", f.agents.join(",")] : [];
  const repairArgs = ["setup", "--repair", "--yes", ...agentArgs, ...(f.json ? ["--json"] : []), ...(f.quiet ? ["--quiet"] : [])];
  if (f.dryRun) { out(install); out(`context-mode ${repairArgs.join(" ")}`); return EXIT_OK; }
  if (!f.yes) {
    const p = ui.clack;
    if (!p) { err(`context-mode: ${NO_TTY}`); return EXIT_USAGE; }
    const ok = await p.confirm({ message: `Run ${install}, then context-mode setup --repair?` });
    if (p.isCancel(ok)) return EXIT_SIGINT;
    if (!ok) return EXIT_OK;
  }
  const shell = process.platform === "win32";
  progress(ui, `running ${install}`);
  const r = spawnSync(npm, ["i", "-g", spec], { env: ui.ctx.env, encoding: "utf8", shell, windowsHide: true });
  if (r.status !== 0) {
    const why = (`${r.stderr ?? ""}`.trim().split("\n").pop() ?? "") || (r.error?.message ?? "");
    err(`FAIL upgrade: ${install} exited ${r.status ?? "?"}${why ? `: ${why}` : ""}. Fix: ${install}`);
    return EXIT_FAIL;
  }
  const root = `${spawnSync(npm, ["root", "-g"], { env: ui.ctx.env, encoding: "utf8", shell, windowsHide: true }).stdout ?? ""}`.trim();
  const cli = path.join(root, "context-mode", "cli.mjs");
  if (!root || !existsSync(cli)) {
    err(`FAIL upgrade: ${cli} not found after ${install}. Fix: ${install}`);
    return EXIT_FAIL;
  }
  progress(ui, `running context-mode ${repairArgs.join(" ")}`);
  const c = spawnSync(process.execPath, [cli, ...repairArgs], { env: ui.ctx.env, stdio: "inherit", windowsHide: true });
  return c.status ?? (c.signal === "SIGINT" ? EXIT_SIGINT : EXIT_FAIL);
}

/** Entry for setup, doctor and upgrade. Returns the exit code; never throws. */
export async function runCommand(cmd: Command, args: readonly string[], env: CliEnv): Promise<number> {
  let f: Flags;
  try {
    f = parseFlags(cmd, args);
  } catch (e) {
    if (!(e instanceof UsageError)) throw e;
    err(`context-mode: ${e.message}\nRun context-mode ${cmd} --help.`);
    return EXIT_USAGE;
  }
  if (f.help) { out(HELP[cmd].trimEnd()); return EXIT_OK; }
  // D-WIN-HOME-1, D-WIN-HOME-2: the homeDirOf rule (USERPROFILE first on win32, HOME first on POSIX), as hooks and server use.
  const ctx: SetupContext = { home: homeDirOf(process.env) ?? os.homedir(), pkgDir: env.pkgDir, env: process.env };
  const tty = !!process.stdin.isTTY && !!process.stdout.isTTY;
  const interactive = tty && !f.yes && !f.noInput && !f.json && !f.list && !f.print;
  // A pty may report 0 columns; clack would then wrap every character onto its own line. Fall back to 80.
  if (interactive && !process.stdout.columns) Object.defineProperty(process.stdout, "columns", { value: 80, configurable: true });
  const ui: Ui = { f, ctx, env, clack: interactive ? clack : undefined };
  try {
    if (cmd === "setup") return await setup(ui);
    if (cmd === "doctor") return await doctor(ui);
    return await upgrade(ui);
  } catch (e) {
    err(`FAIL ${cmd}: ${(e as Error).message}. Fix: context-mode ${cmd} --debug, then report it (gh issue create --repo ${ISSUE_REPO})`);
    if (f.debug) err((e as Error).stack ?? "");
    return EXIT_FAIL;
  }
}
