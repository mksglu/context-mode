// src/setup/engine.ts
// ADR-0019 section 3 steps: preflight, detect, plan, apply, verify, rollback per agent, summary. No UI here.
// Owner decisions D3 (hook overhead budget) and D4 (v1 forms replaced by the absolute form).
import { geminiSettingsGate } from "./gemini-gate.ts";
import { CODEX_TRUST_PATH, codexTrustEntries, listPluginHooks, pluginTrustEntries } from "./codex-trust.ts";
import type { PluginHook } from "./codex-trust.ts";
import { spawn, spawnSync } from "node:child_process";
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { claudeDirOf, codexDirOf, copilotDirOf, kiroDirOf, opencodeDirOf } from "../core/project/config-dir.ts";
import { AGENT_HOME_DIR, DB_FILE_NAME, PROJECTS_DIR_NAME, TOOL_ORDER, UPGRADE_REPORT_ONLY_REASONS } from "../core/contracts/constants.ts";
import { CtxError } from "../core/contracts/errors.ts";
import type { AgentId, HostConfigFormat, V1Finding } from "../core/contracts/types.ts";
import { detectV1 } from "../core/ops/detect-v1.ts";
import { atomicWriteFile, renameWithRetry, unlinkWithRetry } from "../core/ops/atomic-file.ts";
import { editHostConfigText, parseHostConfig } from "../core/ops/host-config.ts";
import { hostLayout, hostText, withLayout } from "../core/ops/host-text.ts";
import { AGENT_FLAG, BACKUP_DIR, COMMAND_SKILLS, HOOK_BUNDLE, LOCK_FILE, SKILL_FILE, STATE_DIR, assertWritable, buildRegistry, configEdits, hookCommandString, renderSkill } from "./registry.ts";
import type { CheckRow, HookFile, NativePlugin, SetupContext } from "./registry.ts";
import { pathEntries, spawnForm, spawnShim, whichBin, winCmdLine } from "./spawn-bin.ts";
export { spawnForm, spawnShim, whichBin, winCmdLine };
import { SAMPLE_FILE, hookSample, sampleText, sampleVerdict } from "./hook-sample.ts";

export const OVERHEAD_P95_MS = 15; // D3: hook wall minus bare node wall, p95, same host and run
/** CI-only knob: shared runners add jitter the D3 budget was not measured on. Unset means the 15 ms budget. */
function overheadBudgetMs(env: SetupContext["env"]): number {
  const n = Number(env.CM_HOOK_OVERHEAD_BUDGET_MS);
  return Number.isFinite(n) && n >= OVERHEAD_P95_MS ? n : OVERHEAD_P95_MS;
}
const HOOK_SAMPLES = 9;
const HOOK_ROUNDS = 5; // noise only adds time: a real overhead over budget fails every round
const P95 = 0.95;
const VERIFY_TIMEOUT_MS = 10_000;
const MANIFEST = "manifest.json";
const MANIFEST_DONE = "manifest.removed.json";
const FILES = "files";
const V1_HOOK_MARK = "context-mode hook";

export type AgentStatus = "PASS" | "FAIL" | "SKIPPED";
export interface Change { file?: string; path?: string; before?: unknown; after?: unknown; command?: string[]; }
export interface Check { name: string; ok: boolean; warn?: boolean; detail?: string; overheadP95Ms?: number; wallP95Ms?: number; bareP95Ms?: number; }
export interface AgentResult {
  id: AgentId; status: AgentStatus; reason?: string; v1: V1Finding[]; changes: Change[]; checks: Check[]; rolledBack?: boolean;
  /** OPEN-ITEMS H8: the host CLI file setup and doctor ran for this agent (absolute, resolved). */
  bin?: string;
}
export interface SetupResult { exitCode: number; agents: AgentResult[]; backupDir?: string; error?: string; }
export interface SetupOptions extends SetupContext {
  agents?: AgentId[]; runId?: string; dryRun?: boolean;
  /** D7 Ctrl-C: on abort the agent in progress is rolled back and the lock released, synchronously. */
  signal?: AbortSignal;
  /** Live checklist: called before and after each agent. */
  onAgent?: (id: AgentId, phase: "start" | "done", res?: AgentResult) => void;
}

interface Entry { agent: AgentId; file?: string; existed?: boolean; backup?: string; undo?: { bin: string; args: string[] }; ran?: { bin: string; args: string[] }; }
interface Manifest { runId: string; path: string; entries: Entry[]; }

// ---------- small helpers ----------

const which = whichBin;

/** OPEN-ITEMS H8, ADR-0012 traps, D-FU-RF-2: a wrapper (the claude-worktree shim) can sit first on PATH. The real
 *  Claude Code is a native file (Mach-O, ELF, PE magic) or a file of the package named @anthropic-ai/claude-code; npm on
 *  Windows keeps the native claude.exe under node_modules beside its claude.cmd shim. */
const REAL_HOST: Readonly<Record<string, { pkg: string; extra: readonly (readonly string[])[] }>> = Object.freeze({
  claude: { pkg: "@anthropic-ai/claude-code", extra: [["claude.exe"], ["node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe"]] },
});
const BINARY_MAGICS = Object.freeze(["cffaedfe", "cefaedfe", "7f454c46", "4d5a"]);

function isNativeBinary(file: string): boolean {
  const head = Buffer.alloc(4);
  const fd = openSync(file, "r");
  try { readSync(fd, head, 0, 4, 0); } finally { closeSync(fd); }
  const hex = head.toString("hex");
  return BINARY_MAGICS.some((m) => hex.startsWith(m));
}

/** Name of the nearest package.json at or above dir, or undefined when there is none. */
function owningPackage(dir: string): string | undefined {
  for (let d = dir; ; d = path.dirname(d)) {
    const f = path.join(d, "package.json");
    if (existsSync(f)) { try { return String(JSON.parse(hostText(readFileSync(f, "utf8"))).name); } catch { return undefined; } }
    if (path.dirname(d) === d) return undefined;
  }
}

/** The host CLI file setup runs. An agent with no REAL_HOST row: the first PATH hit. claude: the first PATH candidate
 *  that is the real Claude Code; every other candidate seen before it is listed in `shims` and never run. */
export function hostBin(bin: string, env: SetupContext["env"], platform: NodeJS.Platform = process.platform): { file: string | undefined; shims: string[] } {
  const real = REAL_HOST[bin];
  if (!real) return { file: which(bin, env, platform), shims: [] };
  const get = (k: string): string | undefined => env[Object.keys(env).find((x) => x.toUpperCase() === k) ?? k];
  const shims: string[] = [];
  for (const dir of pathEntries(get("PATH") ?? "", platform)) {
    const own = which(bin, { PATH: dir, ...(get("PATHEXT") ? { PATHEXT: get("PATHEXT") } : {}) }, platform);
    for (const f of [own, ...real.extra.map((p) => path.join(dir, ...p))]) {
      if (!f || !existsSync(f) || !statSync(f).isFile()) continue;
      const file = realpathSync(f);
      if (isNativeBinary(file) || owningPackage(path.dirname(file)) === real.pkg) return { file, shims };
      shims.push(f);
    }
  }
  return { file: undefined, shims };
}

const WIN_EXIT_CRASH = 3221226505; // 0xC0000409 STACK_BUFFER_OVERRUN

/** D-WIN-EXITCRASH-1: gemini-cli 0.66.0 on Windows finishes `extensions link`, prints "linked successfully", then crashes
 *  on exit with 0xC0000409. An install exit is accepted when it is 0, or when it is that Windows crash code and the host's
 *  own list command now shows the plugin. Any other code is a failure. */
export function installExitOk(status: number | null, listed: boolean, platform: NodeJS.Platform = process.platform): boolean {
  if (status === 0) return true;
  return platform === "win32" && status === WIN_EXIT_CRASH && listed;
}

/** Runs an agent CLI found on PATH; a Windows .cmd/.bat shim goes through cmd.exe (spawnForm). */
function runBin(bin: string, args: string[], env: SetupContext["env"], input?: string): ReturnType<typeof spawnSync> {
  return spawnShim(hostBin(bin, env).file ?? bin, args, env, { encoding: "utf8", input, timeout: VERIFY_TIMEOUT_MS }) as ReturnType<typeof spawnSync>;
}

/** CC-WIN-3: host file text as plain LF without a BOM (PowerShell 5 writes both); apply gives the layout back. */
function readOr(file: string): string | undefined { return existsSync(file) ? hostText(readFileSync(file, "utf8")) : undefined; }
/** The bytes as they are: backups, and files that are rendered whole (skills). */
function readRaw(file: string): string | undefined { return existsSync(file) ? readFileSync(file, "utf8") : undefined; }

const atomicWrite = atomicWriteFile; // D-WIN-ATOMIC-1: retries a Windows "file in use" rename, removes its tmp file on failure

function pidAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code === "EPERM"; }
}

function p95(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(s.length * P95) - 1)];
}

// The agent id is not repeated here: the CLI lines already start with it (`FAIL <id>: <reason>. Fix: ...`).
function parseFail(_row: CheckRow, file: string): string { return `${file} does not parse; left as is. Fix the file, then re-run setup`; }

// ---------- plan ----------

interface FileEdit { file: string; before: string | undefined; after: string; changes: Change[]; plain?: boolean; }
interface Plan { edits: FileEdit[]; cli: string[][]; refresh: string[][]; }

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

/** Rewrite (D4) or drop v1 hook commands in a hooks/settings JSON file; other entries stay as they are. */
function planHookFile(row: CheckRow, hf: HookFile): FileEdit | undefined {
  const before = readOr(hf.file);
  if (before === undefined) return undefined;
  let doc: unknown;
  try { doc = JSON.parse(before); } catch { throw new Error(parseFail(row, hf.file)); }
  if (!isObj(doc) || !isObj(doc.hooks)) return undefined;
  const changes: Change[] = [];
  const want = hookCommandString(row);
  for (const [event, groups] of Object.entries(doc.hooks)) {
    if (!Array.isArray(groups)) continue;
    for (let g = groups.length - 1; g >= 0; g--) {
      const group = groups[g];
      // Flat shape (copilot-cli): the event array holds {type,command,...} entries, no inner hooks array (CP-WIN-5).
      if (isObj(group) && typeof group.command === "string" && !Array.isArray(group.hooks)) {
        if (!group.command.includes(V1_HOOK_MARK)) continue;
        const at = `hooks.${event}[${g}].command`;
        if (hf.mode === "rewrite") { changes.push({ file: hf.file, path: at, before: group.command, after: want }); group.command = want; }
        else { changes.push({ file: hf.file, path: at, before: group.command, after: null }); groups.splice(g, 1); }
        continue;
      }
      const list = isObj(group) ? group.hooks : undefined;
      if (!Array.isArray(list)) continue;
      for (let h = list.length - 1; h >= 0; h--) {
        const cmd = isObj(list[h]) ? (list[h] as Json).command : undefined;
        if (typeof cmd !== "string" || !cmd.includes(V1_HOOK_MARK)) continue;
        const at = `hooks.${event}[${g}].hooks[${h}].command`;
        if (hf.mode === "rewrite") { (list[h] as Json).command = want; changes.push({ file: hf.file, path: at, before: cmd, after: want }); }
        else { list.splice(h, 1); changes.push({ file: hf.file, path: at, before: cmd, after: null }); }
      }
      if (list.length === 0) groups.splice(g, 1);
    }
  }
  return changes.length ? { file: hf.file, before, after: JSON.stringify(doc, null, 2) + "\n", changes } : undefined;
}

// Z-WIN-4 (D-WIN-HOOKMERGE-1): an own hook command is found by a stable marker, not by the full command string. The
// marker is `hook.mjs` (after a path separator or a quote) then `--agent <id>` and the end of the string. A node upgrade,
// C:\\ vs c:\\, an 8.3 short name or an nvm-windows switch changes the paths before the marker; the marker stays.
// String search only (rule: no regex as a mechanism). A leading `& ` (the PowerShell field) is before the marker.
const MARK_LEFT = ["/", "\\", '"'];
export function isOwnHookCommand(cmd: unknown, agent: string): boolean {
  if (typeof cmd !== "string") return false;
  const at = cmd.lastIndexOf(HOOK_BUNDLE);
  if (at <= 0 || !MARK_LEFT.includes(cmd[at - 1])) return false;
  let tail = cmd.slice(at + HOOK_BUNDLE.length);
  if (tail.startsWith('"')) tail = tail.slice(1);
  return tail.trim() === `${AGENT_FLAG} ${agent}`;
}
const holdsOwn = (v: unknown, agent: string): boolean =>
  typeof v === "string" ? isOwnHookCommand(v, agent)
    : Array.isArray(v) ? v.some((x) => holdsOwn(x, agent))
    : isObj(v) ? Object.values(v).some((x) => holdsOwn(x, agent)) : false;

// ADR-0020 merge: objects merge key by key; in an array, an own item (it holds an own hook command, at any package
// path) that differs from the wanted one is replaced, user items stay; scalars take the wanted value.
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
function mergeOwn(cur: unknown, want: unknown, agent: string): unknown {
  if (isObj(want)) {
    const base: Json = isObj(cur) ? { ...cur } : {};
    for (const [k, v] of Object.entries(want)) base[k] = mergeOwn(base[k], v, agent);
    return base;
  }
  if (Array.isArray(want)) {
    const base = Array.isArray(cur) ? cur.filter((x) => !holdsOwn(x, agent) || want.some((w) => same(w, x))) : [];
    for (const w of want) if (!base.some((x) => same(x, w))) base.push(w);
    return base;
  }
  return want;
}

/** The format of a host file: the MCP config row's format when the file is that config (opencode.json), else JSON. */
const fileFormat = (row: CheckRow, file: string): HostConfigFormat => (row.config?.file === file ? row.config.format : "json");

/** One edit of `file` (a JSON host file), chained on any earlier edit of the same file in this plan. */
function planJsonKeys(row: CheckRow, edits: FileEdit[], file: string, format: HostConfigFormat, want: (doc: Json) => [readonly string[], unknown][]): void {
  const prior = edits.find((e) => e.file === file);
  const text = prior ? prior.after : readOr(file);
  let doc: unknown = {};
  // D-WIN-JSONC-1: the host's own format (OpenCode reads opencode.json as JSONC), read by the one shared host-config parser.
  if (text !== undefined && text.trim() !== "") { try { doc = parseHostConfig(row.id, file, text, format); } catch { throw new Error(parseFail(row, file)); } }
  if (!isObj(doc)) throw new Error(parseFail(row, file));
  let res;
  try { res = editHostConfigText(row.id, file, text ?? "", format, want(doc)); }
  catch (e) { if (e instanceof CtxError) throw new Error(parseFail(row, file)); throw e; }
  if (!res.edits.length) return;
  const changes = res.edits.map((e) => ({ file, ...e }));
  if (prior) { prior.after = res.text; prior.changes.push(...changes); }
  else edits.push({ file, before: text, after: res.text, changes });
}

/** D-HA-CODEX-TRUST-1: one [hooks.state."<key>"] table per own handler in the planned hooks.json, chained on any
 *  earlier edit of config.toml in this plan (the MCP server entry). */
function planCodexTrust(row: CheckRow, edits: FileEdit[], hooksFile: string, file: string, command: string, env: SetupContext["env"]): void {
  const hooksText = edits.find((e) => e.file === hooksFile)?.after ?? readOr(hooksFile);
  if (hooksText === undefined) return;
  const want = codexTrustEntries(hooksFile, JSON.parse(hooksText), command, env);
  if (!want.length) return;
  const prior = edits.find((e) => e.file === file);
  const text = prior ? prior.after : readOr(file);
  let res;
  try { res = editHostConfigText(row.id, file, text ?? "", "toml", want); }
  catch (e) { if (e instanceof CtxError) throw new Error(parseFail(row, file)); throw e; }
  if (!res.edits.length) return;
  const changes = res.edits.map((e) => ({ file, ...e }));
  if (prior) { prior.after = res.text; prior.changes.push(...changes); }
  else edits.push({ file, before: text, after: res.text, changes });
}

/** ADR-0020 hook channel: write or merge the host hook file, or add the in-process plugin list entry. */
function planHookInstall(row: CheckRow, edits: FileEdit[], env: SetupContext["env"]): void {
  const h = row.hookInstall;
  if (h.kind === "file") {
    planJsonKeys(row, edits, h.file, fileFormat(row, h.file), (doc) => Object.keys(h.shape).map((k) => [[k], mergeOwn(doc[k], h.shape[k], row.id)]));
    if (h.trust) planCodexTrust(row, edits, h.file, h.trust, h.command, env);
  } else if (h.kind === "plugin-list") {
    planJsonKeys(row, edits, h.file, fileFormat(row, h.file), (doc) => {
      const cur = doc[h.key[0]];
      const list = Array.isArray(cur) ? cur : [];
      return [[h.key, list.includes(h.entry) ? list : [...list, h.entry]]];
    });
  }
}

/** ADR-0020 skill channel: <dir>/<name>/SKILL.md rendered with the agent's tool name prefix. */
function planSkills(row: CheckRow, edits: FileEdit[]): void {
  const s = row.skillInstall;
  if (s.kind !== "dir") return;
  for (const f of s.files) {
    if (!existsSync(f.src)) throw new Error(`preflight: ${f.src} is missing`);
    const after = renderSkill(readFileSync(f.src, "utf8"), s.prefixes);
    const before = readRaw(f.file);
    if (before !== after) edits.push({ plain: true, file: f.file, before, after, changes: [{ file: f.file, path: f.name, before: before === undefined ? null : "old", after: "SKILL.md" }] });
  }
}

function planRow(row: CheckRow, listed: boolean, stale: boolean, env: SetupContext["env"]): Plan {
  const edits: FileEdit[] = [];
  if (row.config) {
    const c = row.config;
    const before = readOr(c.file);
    let res;
    try { res = editHostConfigText(row.id, c.file, before ?? "", c.format, configEdits(c)); }
    catch (e) { if (e instanceof CtxError) throw new Error(parseFail(row, c.file)); throw e; }
    if (res.edits.length) edits.push({ file: c.file, before, after: res.text, changes: res.edits.map((e) => ({ file: c.file, ...e })) });
  }
  for (const hf of row.hookFiles) { const e = planHookFile(row, hf); if (e) edits.push(e); }
  planHookInstall(row, edits, env);
  planSkills(row, edits);
  const cli = row.config || !row.cli || listed ? [] : row.cli.install;
  // D-US-1: a listed plugin whose copy is older than the package gets the host's own update command, not a reinstall.
  const refresh = listed && stale && row.copy ? [row.copy.refresh] : [];
  return { edits, cli, refresh };
}

// ---------- verify ----------

function listCheck(row: CheckRow, env: SetupContext["env"]): Check | undefined {
  const l = row.listCommand;
  if (!l || !hostBin(l.bin, env).file) return undefined;
  const r = runBin(l.bin, l.args, env);
  // Gemini 0.65.0 writes the list to stderr (D-INST-2), so both streams count.
  const ok = r.status === 0 && `${r.stdout}${r.stderr}`.includes("context-mode");
  return { name: "list", ok, detail: ok ? undefined : `${l.bin} ${l.args.join(" ")} does not list context-mode` };
}

function packageVersion(pkgDir: string): string | undefined {
  try {
    const v: unknown = JSON.parse(hostText(readFileSync(path.join(pkgDir, "package.json"), "utf8"))).version;
    return typeof v === "string" ? v : undefined;
  } catch { return undefined; }
}

/** D-US-1: a host that runs a copy of the package must run the installed version. No record, no check: list covers it. */
function copyCheck(row: CheckRow, pkgDir: string): Check | undefined {
  const c = row.copy;
  const pkg = packageVersion(pkgDir);
  const text = c ? readOr(c.file) : undefined;
  if (!c || pkg === undefined || text === undefined) return undefined;
  let entries: unknown;
  try {
    const doc: unknown = JSON.parse(text);
    entries = isObj(doc) && isObj(doc.plugins) ? doc.plugins[c.plugin] : undefined;
  } catch { return { name: "copy", ok: false, detail: `${c.file} is not valid JSON; run ${c.bin} ${c.refresh.join(" ")}` }; }
  if (!Array.isArray(entries)) return undefined;
  const versions = entries.filter(isObj).map((e) => e.version).filter((v): v is string => typeof v === "string");
  if (!versions.length) return undefined;
  const old = versions.find((v) => v !== pkg);
  if (old === undefined) return { name: "copy", ok: true };
  return { name: "copy", ok: false, detail: `${c.host} runs context-mode ${old}, the installed package is ${pkg}; run ${c.bin} ${c.refresh.join(" ")}` };
}

function mcpCheck(cmd: string[], env: SetupContext["env"]): Promise<Check> {
  return new Promise((resolve) => {
    // Own process group on POSIX: a terminal Ctrl-C then reaches only the CLI, whose SIGINT handler rolls back and
    // exits 130. Otherwise the server dies first and this check reports a FAIL before the handler runs.
    const child = spawn(cmd[0], cmd.slice(1), { env, stdio: ["pipe", "pipe", "ignore"], detached: process.platform !== "win32", windowsHide: true });
    const reap = (): void => { child.kill(); };
    process.once("exit", reap);
    let buf = "";
    let init = false;
    const done = (ok: boolean, detail?: string): void => { clearTimeout(timer); process.off("exit", reap); child.kill(); resolve({ name: "mcp", ok, detail }); };
    const timer = setTimeout(() => done(false, "no MCP answer before timeout"), VERIFY_TIMEOUT_MS);
    child.on("error", (e) => done(false, e.message));
    child.on("exit", (code) => done(false, `server exited (${code}) before tools/list`));
    // D-CLI-EPIPE-1: a server that dies or closes its input makes the next stdin write fail with EPIPE. With no
    // listener Node throws it as an uncaught error: the CLI exits 1 before it writes the report.
    child.stdin.on("error", (e) => done(false, `server closed its input: ${e.message}`));
    child.stdout.on("data", (d: Buffer) => {
      buf += d.toString();
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
        let m: Json; try { m = JSON.parse(line); } catch { continue; }
        if (m.id === 1 && !init) {
          init = true;
          child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
          child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }) + "\n");
        } else if (m.id === 2) {
          const tools = isObj(m.result) && Array.isArray(m.result.tools) ? m.result.tools.map((t: Json) => t.name) : [];
          const want = [...TOOL_ORDER].sort();
          const got = [...tools].sort();
          const ok = JSON.stringify(got) === JSON.stringify(want);
          done(ok, ok ? undefined : `tools/list returned ${got.join(",")}, expected ${want.join(",")}`);
        }
      }
    });
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {
      protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "context-mode-setup", version: "2.0.0" } } }) + "\n");
  });
}

function hookRound(row: CheckRow, env: SetupContext["env"]): Check {
  const cmd = row.hookCommand as string[];
  const input = JSON.stringify(row.goldenPayload);
  const wall: number[] = [];
  const bare: number[] = [];
  for (let i = 0; i < HOOK_SAMPLES; i++) { // interleaved so host load hits both series alike (D3)
    let t = performance.now();
    const r = spawnSync(cmd[0], cmd.slice(1), { env, input, encoding: "utf8", timeout: VERIFY_TIMEOUT_MS, windowsHide: true });
    wall.push(performance.now() - t);
    if (r.status !== 0) return { name: "hook", ok: false, detail: `hook exited ${r.status}: ${`${r.stderr}`.trim()}` };
    const out = `${r.stdout}`.trim(); // the golden payload is a harmless shell call: no answer, or one JSON object
    if (out) { let j: unknown; try { j = JSON.parse(out); } catch { /* below */ } if (!isObj(j)) return { name: "hook", ok: false, detail: `hook answer is not a JSON object: ${out.slice(0, 200)}` }; }
    t = performance.now();
    spawnSync(cmd[0], ["-e", ""], { env, timeout: VERIFY_TIMEOUT_MS, windowsHide: true });
    bare.push(performance.now() - t);
  }
  const wallP95Ms = Math.round(p95(wall));
  const bareP95Ms = Math.round(p95(bare));
  const overheadP95Ms = Math.max(0, wallP95Ms - bareP95Ms);
  const budget = overheadBudgetMs(env);
  const ok = overheadP95Ms <= budget;
  return { name: "hook", ok, overheadP95Ms, wallP95Ms, bareP95Ms, detail: ok ? undefined : `hook overhead p95 ${overheadP95Ms} ms > ${budget} ms` };
}

/** D3 gate: best of HOOK_ROUNDS rounds; a hook that exits non-zero fails at once. */
function hookCheck(row: CheckRow, env: SetupContext["env"]): Check {
  let best: Check | undefined;
  for (let i = 0; i < HOOK_ROUNDS; i++) {
    const c = hookRound(row, env);
    if (c.overheadP95Ms === undefined) return c;
    if (!best || c.overheadP95Ms < (best.overheadP95Ms as number)) best = c;
    if (c.ok) break;
  }
  return best as Check;
}

function parseCheck(row: CheckRow): Check {
  const c = row.config;
  if (!c) return { name: "parse", ok: true };
  try {
    const r = editHostConfigText(row.id, c.file, readOr(c.file) ?? "", c.format, configEdits(c));
    return { name: "parse", ok: r.edits.length === 0, detail: r.edits.length ? "entry differs after write" : undefined };
  } catch (e) { return { name: "parse", ok: false, detail: (e as Error).message }; }
}

/** ADR-0020 hook-registered: the host channel holds our entry. A file or plugin-list channel is planned again (no
 *  edit left means the entry is there); a package channel is registered when the host list command shows it. */
function hookRegisteredCheck(row: CheckRow, env: SetupContext["env"], list: Check | undefined): Check {
  const h = row.hookInstall;
  if (h.kind === "package") {
    const l = row.listCommand;
    if (!l) return { name: "hook-registered", ok: false, detail: `no list command for ${row.id}` };
    if (!list) return { name: "hook-registered", ok: false, detail: `${l.bin} is not on PATH, so the hooks cannot be checked` };
    return { name: "hook-registered", ok: list.ok, detail: list.ok ? undefined : `${l.bin} ${l.args.join(" ")} does not list context-mode (hooks ship in ${h.via})` };
  }
  const edits: FileEdit[] = [];
  try { planHookInstall(row, edits, env); } catch (e) { return { name: "hook-registered", ok: false, detail: (e as Error).message }; }
  if (!edits.length) return { name: "hook-registered", ok: true };
  const trust = h.kind === "file" ? h.trust : undefined;
  if (trust && edits.every((e) => e.file === trust && e.changes.every((c) => isTrust(row, c)))) return { name: "hook-registered", ok: false, detail: `${h.file}: the context-mode hooks are not trusted in ${trust}; re-run setup` };
  return { name: "hook-registered", ok: false, detail: `${h.file} lacks the context-mode hook entry` };
}

/**
 * ADR-0020 hook-runs, OPEN-ITEMS H5 (D-HF-DOCTOR-RUNS-1): one large shell read, in the host's own wire shape, through
 * the hook bundle for this agent (in-process agents too). PASS only on the host's saving effect with the project
 * resolved. The sample runs in its own temp HOME and project, so doctor never writes into the user's store.
 */
export function hookRunsCheck(row: CheckRow, env: SetupContext["env"]): Check {
  const root = mkdtempSync(path.join(tmpdir(), "cm-doctor-runs-"));
  try {
    const home = path.join(root, "home");
    const proj = path.join(root, "proj");
    mkdirSync(home);
    mkdirSync(proj);
    const text = sampleText();
    writeFileSync(path.join(proj, SAMPLE_FILE), text);
    const { effect, payload } = hookSample(row.id, proj, text);
    const sampleEnv: NodeJS.ProcessEnv = { ...env, HOME: home, USERPROFILE: home };
    delete sampleEnv.CLAUDE_PROJECT_DIR; // the sample project is the payload cwd, never the caller's project
    const cmd = row.hookRunCommand;
    const r = spawnSync(cmd[0], cmd.slice(1), { env: sampleEnv, cwd: proj, input: JSON.stringify(payload), encoding: "utf8", timeout: VERIFY_TIMEOUT_MS, windowsHide: true });
    const bad = sampleVerdict(row.id, effect, text, { status: r.status, stdout: `${r.stdout ?? ""}`, stderr: `${r.stderr ?? ""}` });
    return bad === null ? { name: "hook-runs", ok: true } : { name: "hook-runs", ok: false, detail: bad };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
const SEEN_SQL = "SELECT 1 FROM events WHERE agent = ? LIMIT 1";
export const NOT_SEEN_LINE = "not seen yet, run one tool call";
/** ADR-0020 hook-seen: a journal row from this agent exists in any project db. None yet is a WARN, not a FAIL. */
function hookSeenCheck(row: CheckRow, home: string): Check {
  const base = path.join(home, STATE_DIR, PROJECTS_DIR_NAME);
  const dirs = existsSync(base) ? readdirSync(base) : [];
  let sqlite: typeof import("node:sqlite") | undefined;
  try { sqlite = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite"); } catch { sqlite = undefined; }
  for (const d of dirs) {
    const file = path.join(base, d, DB_FILE_NAME);
    if (!sqlite || !existsSync(file)) continue;
    let db: import("node:sqlite").DatabaseSync | undefined;
    try {
      db = new sqlite.DatabaseSync(file, { readOnly: true });
      if (db.prepare(SEEN_SQL).get(row.id)) return { name: "hook-seen", ok: true };
    } catch { /* a busy or old db does not count as seen */ } finally { db?.close(); }
  }
  return { name: "hook-seen", ok: true, warn: true, detail: NOT_SEEN_LINE };
}

/** ADR-0020 skills: every skill file is present with this agent's tool name prefix (package: shipped skills/). */
function skillsCheck(row: CheckRow, pkgDir: string): Check {
  const s = row.skillInstall;
  if (s.kind === "package") {
    const miss = COMMAND_SKILLS.map((n) => path.join(pkgDir, s.via, n, SKILL_FILE)).filter((f) => !existsSync(f));
    return { name: "skills", ok: miss.length === 0, detail: miss.length ? `missing ${miss.join(", ")}` : undefined };
  }
  const bad = s.files.filter((f) => readRaw(f.file) !== (existsSync(f.src) ? renderSkill(readFileSync(f.src, "utf8"), s.prefixes) : undefined));
  return { name: "skills", ok: bad.length === 0, detail: bad.length ? `${bad.map((f) => f.file).join(", ")} missing or without the ${s.prefixes.join(" / ") || "plain"} tool prefix` : undefined };
}

// ---------- native plugin (D-NI-CODEX-DOCTOR-1) ----------

const PLUGIN_ENABLED = "enabled";
const WORD_TRIM = ",;";
const CODEX_CONFIG_FILE = "config.toml";

const EXT_ENABLED_USER = "Enabled (User):";
const EXT_ENABLED_WORKSPACE = "Enabled (Workspace):";
const EXT_TRUE = "true";
type NativeState = "enabled" | "disabled" | undefined;
/** The extension list also shows the workspace scope: off there, gemini runs none of its hooks (D-NI-GEMINI-GATE-1). */
interface NativeStatus { state: NativeState; workspaceOff: boolean }

/** codex plugin list: the table row that names the plugin, enabled when one of its words is "enabled". */
function tableState(n: NativePlugin, text: string): NativeState {
  const line = text.split("\n").find((l) => l.split(" ").includes(n.plugin));
  if (line === undefined) return undefined;
  return line.split(" ").map((w) => trimChars(w, WORD_TRIM)).includes(PLUGIN_ENABLED) ? "enabled" : "disabled";
}

/** qwen 0.26.1 / gemini 0.65.0 extensions list: a block per extension. A header line starts in column 0 ("<mark> <name>
 *  (<version>)"); its indented lines follow. Only the header names the extension: an indented "context-mode" is an MCP
 *  server another extension ships. */
function extensionState(n: NativePlugin, text: string): NativeStatus {
  let mine = false;
  let state: NativeState;
  let workspaceOff = false;
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    if (line.length && !line.startsWith(" ")) { mine = line.split(" ")[1] === n.plugin; continue; }
    const t = line.trim();
    if (!mine) continue;
    if (t.startsWith(EXT_ENABLED_USER)) state = t.slice(EXT_ENABLED_USER.length).trim() === EXT_TRUE ? "enabled" : "disabled";
    if (t.startsWith(EXT_ENABLED_WORKSPACE)) workspaceOff = t.slice(EXT_ENABLED_WORKSPACE.length).trim() !== EXT_TRUE;
  }
  return { state, workspaceOff };
}

/** The host's own install as its list command shows it (undefined: not listed in that form, setup owns the agent). */
function nativeState(row: CheckRow, env: SetupContext["env"]): NativeStatus {
  const none: NativeStatus = { state: undefined, workspaceOff: false };
  const n = row.nativePlugin;
  if (!n || !hostBin(n.bin, env).file) return none;
  const r = runBin(n.bin, n.args, env);
  if (r.status !== 0) return none;
  // Gemini 0.65.0 writes the extension list to stderr (D-INST-2).
  return n.format === "extension" ? extensionState(n, `${r.stdout}${r.stderr}`) : { state: tableState(n, `${r.stdout}`), workspaceOff: false };
}

/** The row as the host's own plugin install sets it up. */
function nativeRow(row: CheckRow, n: NativePlugin): CheckRow {
  return { ...row, config: undefined, cli: undefined, copy: undefined, hookFiles: [], listCommand: { bin: n.bin, args: n.args },
    hookInstall: { kind: "package", via: n.hooksVia }, skillInstall: { kind: "package", via: n.skillsVia } };
}

function trimChars(w: string, chars: string): string {
  let a = 0;
  let b = w.length;
  while (a < b && chars.includes(w.charAt(a))) a++;
  while (b > a && chars.includes(w.charAt(b - 1))) b--;
  return w.slice(a, b);
}

/** A native plugin install: verify it as is, write nothing (a second hook copy under HOME would run twice). A listed but
 *  disabled extension is a FAIL that names the host's enable command: setup cannot link over it (D-NI-EXT-DOCTOR-1). */
async function nativeResult(row: CheckRow, ctx: SetupContext, apply?: { run: Run; dryRun: boolean }): Promise<AgentResult | undefined> {
  const n = row.nativePlugin;
  const { state, workspaceOff } = nativeState(row, ctx.env);
  if (!n || state === undefined) return undefined;
  const bin = hostBin(n.bin, ctx.env).file;
  if (state === "disabled") {
    if (!n.enable) return undefined;
    return { id: row.id, status: "FAIL", v1: [], changes: [], checks: [], bin,
      reason: `context-mode is installed but disabled in ${n.bin}, run ${n.bin} ${n.enable.join(" ")}` };
  }
  const res: AgentResult = { id: row.id, status: "PASS", v1: [], changes: [], checks: [], bin };
  let hooks = n.hookTrust ? await listPluginHooks(ctx.env, n.plugin, ctx.home) : undefined;
  if (apply && hooks?.some((h) => !h.trusted)) {
    try {
      const done = trustPluginHooks(row, ctx, apply, hooks);
      res.changes.push(...done);
      if (done.length && !apply.dryRun) hooks = await listPluginHooks(ctx.env, n.plugin, ctx.home);
    } catch (e) {
      apply.run.rollback(row.id, ctx.env);
      return { ...res, status: "FAIL", reason: (e as Error).message, rolledBack: true };
    }
  }
  res.checks = await verifyRow(nativeRow(row, n), ctx);
  if (n.hookTrust) res.checks = withHookTrust(res.checks, hooks, !!apply?.dryRun);
  if (n.format === "extension") res.checks = withHookGate(res.checks, geminiGate(n, ctx, workspaceOff));
  const bad = res.checks.filter((c) => !c.ok);
  if (bad.length) {
    res.status = "FAIL"; res.reason = bad.map((c) => `${c.name}: ${c.detail}`).join("; ");
    if (apply && !apply.dryRun && res.changes.length) { apply.run.rollback(row.id, ctx.env); res.rolledBack = true; }
  }
  return res;
}

/** D-NI-CODEX-TRUST-1: trust the hooks of our own plugin, as Codex keyed and hashed them (hooks/list), in config.toml.
 *  Only entries of the plugin id are written; user hooks and other plugins are never touched. */
function trustPluginHooks(row: CheckRow, ctx: SetupContext, apply: { run: Run; dryRun: boolean }, hooks: PluginHook[]): Change[] {
  const file = path.join(codexDirOf(ctx.env, ctx.home), CODEX_CONFIG_FILE);
  const text = readOr(file);
  let edit;
  try { edit = editHostConfigText(row.id, file, text ?? "", "toml", pluginTrustEntries(hooks)); }
  catch (e) { if (e instanceof CtxError) throw new Error(parseFail(row, file)); throw e; }
  if (!edit.edits.length) return [];
  if (!apply.dryRun) {
    assertWritable(row, file);
    const raw = readRaw(file);
    apply.run.record({ agent: row.id, file, existed: raw !== undefined }, raw);
    atomicWrite(file, raw === undefined ? edit.text : withLayout(edit.text, hostLayout(raw)));
  }
  return edit.edits.map((e) => ({ file, ...e }));
}

/** D-NI-GEMINI-GATE-1: why gemini would not run an installed, enabled extension's hooks (undefined: nothing gates them). */
function geminiGate(n: NativePlugin, ctx: SetupContext, workspaceOff: boolean): string | undefined {
  if (n.bin !== "gemini") return undefined;
  if (workspaceOff && n.enable) return `gemini lists context-mode disabled for this workspace, so it runs no hook; run ${n.bin} ${n.enable.join(" ")} --scope workspace`;
  return geminiSettingsGate(ctx.env, ctx.home, process.cwd());
}

/** hook-registered says FAIL when a host setting stops the installed hooks. */
function withHookGate(checks: Check[], detail: string | undefined): Check[] {
  if (detail === undefined) return checks;
  return checks.map((c) => c.name === "hook-registered" ? { name: c.name, ok: false, detail } : c);
}

const UNTRUSTED_FIX = "run: context-mode setup";
/** hook-registered says FAIL when Codex lists our plugin hooks untrusted (they never run); a hook-trust WARN when Codex gave no answer. */
function withHookTrust(checks: Check[], hooks: PluginHook[] | undefined, dryRun: boolean): Check[] {
  if (hooks === undefined) return [...checks, { name: "hook-trust", ok: true, warn: true, detail: "codex did not report hook trust (codex app-server hooks/list)" }];
  const bad = hooks.filter((h) => !h.trusted);
  if (!bad.length || dryRun) return checks;
  const detail = `codex lists ${bad.length} of ${hooks.length} context-mode plugin hooks untrusted, so they do not run; ${UNTRUSTED_FIX}`;
  return checks.map((c) => c.name === "hook-registered" ? { name: c.name, ok: false, detail } : c);
}

async function verifyRow(row: CheckRow, ctx: SetupContext): Promise<Check[]> {
  const env = ctx.env;
  const checks: Check[] = [parseCheck(row)];
  const l = listCheck(row, env);
  if (l) checks.push(l);
  const cp = copyCheck(row, ctx.pkgDir);
  if (cp) checks.push(cp);
  checks.push(await mcpCheck(row.serverCommand, env));
  if (row.hookCommand) checks.push(hookCheck(row, env));
  checks.push(hookRegisteredCheck(row, env, l), hookRunsCheck(row, env), hookSeenCheck(row, ctx.home), skillsCheck(row, ctx.pkgDir));
  return checks;
}

// ---------- apply, backup, rollback ----------

class Run {
  manifest?: Manifest;
  readonly root: string;
  readonly runId: string;
  constructor(root: string, runId: string) { this.root = root; this.runId = runId; }
  get dir(): string { return path.join(this.root, BACKUP_DIR, this.runId); }
  private save(): void { if (this.manifest) atomicWrite(path.join(this.dir, MANIFEST), JSON.stringify(this.manifest, null, 2)); }
  record(e: Entry, bytes?: string): void {
    if (!this.manifest) this.manifest = { runId: this.runId, path: this.dir, entries: [] };
    if (bytes !== undefined) {
      const rel = path.join(FILES, String(this.manifest.entries.length));
      atomicWrite(path.join(this.dir, rel), bytes);
      e.backup = rel;
    }
    this.manifest.entries.push(e);
    this.save();
  }
  rollback(agent: AgentId, env: SetupContext["env"]): void {
    if (!this.manifest) return;
    undo(this.dir, this.manifest.entries.filter((e) => e.agent === agent), env);
    this.manifest.entries = this.manifest.entries.filter((e) => e.agent !== agent);
    this.save();
  }
}

function undo(dir: string, entries: Entry[], env: SetupContext["env"]): void {
  for (const e of [...entries].reverse()) {
    if (e.undo) { runBin(e.undo.bin, e.undo.args, env); continue; }
    if (!e.file) continue;
    if (e.existed && e.backup) atomicWrite(e.file, readFileSync(path.join(dir, e.backup), "utf8"));
    else unlinkWithRetry(e.file); // D-WIN-ATOMIC-4
  }
}

function takeLock(root: string, runId: string): string | undefined {
  const file = path.join(root, LOCK_FILE);
  mkdirSync(root, { recursive: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    try { writeFileSync(file, JSON.stringify({ pid: process.pid, runId }), { flag: "wx" }); return undefined; }
    catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      let pid = 0;
      try { pid = Number(JSON.parse(readFileSync(file, "utf8")).pid); } catch { /* unreadable lock = stale */ }
      if (pid && pidAlive(pid)) return `setup lock ${file} is held by pid ${pid}; wait for that run or remove the lock`;
      rmSync(file, { force: true }); // stale lock from a dead run
    }
  }
  return `setup lock ${file} could not be taken`;
}

// ---------- detect ----------

/** The dir whose presence marks a host as installed: the agent's own config-dir override when it has one. */
function agentHomeDir(id: AgentId, ctx: SetupContext): string {
  if (id === "claude-code") return claudeDirOf(ctx.env, ctx.home);
  if (id === "copilot-cli") return copilotDirOf(ctx.env, ctx.home); // D-WIN-COPILOT-HOME-1
  if (id === "kiro") return kiroDirOf(ctx.env, ctx.home); // D-WIN-KIRO-HOME-1
  if (id === "opencode") return opencodeDirOf(ctx.env, ctx.home); // D-WIN-OPENCODE-DIR-1
  return path.join(ctx.home, ...AGENT_HOME_DIR[id]);
}

export function detectAgents(reg: CheckRow[], ctx: SetupContext): AgentId[] {
  return reg.filter((r) => existsSync(agentHomeDir(r.id, ctx))
    || (r.listCommand && which(r.listCommand.bin, ctx.env))).map((r) => r.id);
}

// ---------- entry points ----------

export async function runSetup(opts: SetupOptions): Promise<SetupResult> {
  const ctx: SetupContext = { home: opts.home, pkgDir: opts.pkgDir, env: opts.env };
  const runId = opts.runId ?? new Date().toISOString().split(":").join("-").split(".").join("-");
  const reg = buildRegistry(ctx);
  // preflight
  for (const f of ["server.mjs", "hook.mjs"]) {
    if (!existsSync(path.join(ctx.pkgDir, f))) return { exitCode: 1, agents: [], error: `preflight: ${path.join(ctx.pkgDir, f)} is missing` };
  }
  const ids = opts.agents ?? detectAgents(reg, ctx);
  const root = path.join(ctx.home, STATE_DIR);
  if (!opts.dryRun) {
    const held = takeLock(root, runId);
    if (held) return { exitCode: 1, agents: [], error: held };
  }
  const run = new Run(root, runId);
  const agents: AgentResult[] = [];
  let current: AgentId | undefined;
  const onAbort = (): void => {
    if (current !== undefined && !opts.dryRun) run.rollback(current, ctx.env);
    if (!opts.dryRun) rmSync(path.join(root, LOCK_FILE), { force: true });
  };
  opts.signal?.addEventListener("abort", onAbort, { once: true });
  try {
    for (const id of ids) {
      const row = reg.find((r) => r.id === id);
      if (!row) { agents.push({ id, status: "FAIL", reason: `unknown agent ${id}`, v1: [], changes: [], checks: [] }); continue; }
      current = id;
      opts.onAgent?.(id, "start");
      const res = (await nativeResult(row, ctx, { run, dryRun: !!opts.dryRun })) ?? await setupRow(row, ctx, run, !!opts.dryRun);
      current = undefined;
      agents.push(res);
      opts.onAgent?.(id, "done", res);
    }
  } finally {
    opts.signal?.removeEventListener("abort", onAbort);
    if (!opts.dryRun) rmSync(path.join(root, LOCK_FILE), { force: true });
  }
  return { exitCode: agents.some((a) => a.status === "FAIL") ? 1 : 0, agents, backupDir: run.manifest ? run.dir : undefined };
}

async function setupRow(row: CheckRow, ctx: SetupContext, run: Run, dryRun: boolean): Promise<AgentResult> {
  const res: AgentResult = { id: row.id, status: "PASS", v1: [], changes: [], checks: [] };
  const needsBin = !row.config && row.cli;
  if (needsBin) {
    const hb = hostBin(row.cli!.bin, ctx.env);
    if (!hb.file && hb.shims.length) return { ...res, status: "FAIL", reason: `no real ${row.cli!.bin} binary on PATH; found only shim script(s): ${hb.shims.join(", ")}` };
    if (!hb.file) return { ...res, status: "SKIPPED", reason: `${row.cli!.bin} not on PATH` };
    res.bin = hb.file;
  }
  if (!row.config && !row.cli) return { ...res, status: "SKIPPED", reason: `${row.id}: no setup path in the registry` };
  let plan: Plan;
  try {
    const listed = needsBin ? listCheck(row, ctx.env)?.ok === true : false;
    plan = planRow(row, listed, copyCheck(row, ctx.pkgDir)?.ok === false, ctx.env);
  } catch (e) { return { ...res, status: "FAIL", reason: (e as Error).message }; }
  // The config entry is current when the plan changes nothing in that file but codex trust entries.
  const configEdited = (file: string): boolean => plan.edits.some((e) => e.file === file && e.changes.some((c) => !isTrust(row, c)));
  res.v1 = detectV1(row.id, ctx.home, { claudeDir: claudeDirOf(ctx.env, ctx.home), codexDir: codexDirOf(ctx.env, ctx.home), copilotDir: copilotDirOf(ctx.env, ctx.home), kiroDir: kiroDirOf(ctx.env, ctx.home), opencodeDir: opencodeDirOf(ctx.env, ctx.home) }).filter((f) => !(row.config && f.file === row.config.file && !configEdited(f.file)));
  res.changes = [...plan.edits.flatMap((e) => e.changes), ...[...plan.cli, ...plan.refresh].map((args) => ({ command: [row.cli!.bin, ...args] }))];
  if (dryRun) return res;
  try {
    for (const e of plan.edits) {
      assertWritable(row, e.file);
      const raw = readRaw(e.file); // the backup holds the bytes as they were, BOM and CRLF included
      run.record({ agent: row.id, file: e.file, existed: raw !== undefined }, raw);
      atomicWrite(e.file, e.plain || raw === undefined ? e.after : withLayout(e.after, hostLayout(raw)));
    }
    for (const args of plan.cli) {
      const r = runBin(row.cli!.bin, args, ctx.env, row.cli!.input ?? "");
      if (!installExitOk(r.status, r.status === WIN_EXIT_CRASH && listCheck(row, ctx.env)?.ok === true)) throw new Error(`${row.cli!.bin} ${args.join(" ")} exited ${r.status}: ${`${r.stderr}`.trim()}`);
    }
    if (plan.cli.length) for (const args of row.cli!.remove) run.record({ agent: row.id, undo: { bin: row.cli!.bin, args } });
    for (const args of plan.refresh) { // a refresh is not an install: recorded, never undone
      const r = runBin(row.cli!.bin, args, ctx.env);
      if (r.status !== 0) throw new Error(`${row.cli!.bin} ${args.join(" ")} exited ${r.status}: ${`${r.stderr}`.trim()}`);
      run.record({ agent: row.id, ran: { bin: row.cli!.bin, args } });
    }
    res.checks = await verifyRow(row, ctx);
    const bad = res.checks.filter((c) => !c.ok);
    if (bad.length) throw new Error(bad.map((c) => `${c.name}: ${c.detail}`).join("; "));
  } catch (e) {
    run.rollback(row.id, ctx.env);
    return { ...res, status: "FAIL", reason: (e as Error).message, rolledBack: true };
  }
  return res;
}

/** doctor (read-only): plan each agent without writing; pending changes or v1 entries are a FAIL that names the
 *  setup command; an agent with nothing to change runs the same verify checks as setup. */
export const V1_FORM_REASON = "old context-mode entry, run: context-mode setup";
export const NOT_SET_UP_REASON = "not set up, run context-mode setup";
export async function runDoctor(opts: SetupOptions): Promise<SetupResult> {
  const ctx: SetupContext = { home: opts.home, pkgDir: opts.pkgDir, env: opts.env };
  const reg = buildRegistry(ctx);
  for (const f of ["server.mjs", "hook.mjs"]) {
    if (!existsSync(path.join(ctx.pkgDir, f))) return { exitCode: 1, agents: [], error: `preflight: ${path.join(ctx.pkgDir, f)} is missing` };
  }
  const ids = opts.agents ?? detectAgents(reg, ctx);
  const run = new Run(path.join(ctx.home, STATE_DIR), "doctor"); // dry run: never records or writes
  const agents: AgentResult[] = [];
  for (const id of ids) {
    const row = reg.find((r) => r.id === id);
    if (!row) { agents.push({ id, status: "FAIL", reason: `unknown agent ${id}`, v1: [], changes: [], checks: [] }); continue; }
    opts.onAgent?.(id, "start");
    const native = await nativeResult(row, ctx);
    if (native) { agents.push(native); opts.onAgent?.(id, "done", native); continue; }
    const res = await setupRow(row, ctx, run, true);
    if (res.status === "PASS") {
      // Report-only findings (shared temp file, user data dir) are never changed by setup, so they cannot be fixed by it.
      if (res.v1.some((f) => !UPGRADE_REPORT_ONLY_REASONS.includes(f.reason))) { res.status = "FAIL"; res.reason = V1_FORM_REASON; }
      else if (res.changes.length && !onlyTrust(row, res.changes)) { res.status = "FAIL"; res.reason = NOT_SET_UP_REASON; }
      else {
        res.checks = await verifyRow(row, ctx);
        const bad = res.checks.filter((c) => !c.ok);
        if (bad.length) { res.status = "FAIL"; res.reason = bad.map((c) => `${c.name}: ${c.detail}`).join("; "); }
      }
    }
    agents.push(res);
    opts.onAgent?.(id, "done", res);
  }
  return { exitCode: agents.some((a) => a.status === "FAIL") ? 1 : 0, agents };
}

/** D-HA-CODEX-TRUST-1: the only planned change is a trust entry, so the hooks are there and hook-registered names it. */
function onlyTrust(row: CheckRow, changes: Change[]): boolean { return changes.every((c) => isTrust(row, c) || isRefresh(row, c)); }
/** D-US-1: a pending copy refresh is not "not set up": doctor runs verify, whose copy check names the stale version. */
function isRefresh(row: CheckRow, c: Change): boolean {
  const r = row.copy;
  return r !== undefined && c.command !== undefined && c.command.join(" ") === [r.bin, ...r.refresh].join(" ");
}
function isTrust(row: CheckRow, c: Change): boolean {
  const h = row.hookInstall;
  return h.kind === "file" && h.trust !== undefined && c.file === h.trust && typeof c.path === "string" && c.path.startsWith(CODEX_TRUST_PATH);
}

/** setup --remove: undo every recorded run, newest first, so each touched file gets its pre-setup bytes back. */
export function runRemove(opts: { home: string; env?: SetupContext["env"] }): { exitCode: number; restored: number; error?: string } {
  const env = opts.env ?? process.env;
  const root = path.join(opts.home, STATE_DIR);
  const base = path.join(root, BACKUP_DIR);
  if (!existsSync(base)) return { exitCode: 0, restored: 0 };
  const held = takeLock(root, "remove");
  if (held) return { exitCode: 1, restored: 0, error: held };
  let restored = 0;
  try {
    const runs = readdirSync(base).map((r) => path.join(base, r)).filter((d) => existsSync(path.join(d, MANIFEST)))
      .sort().reverse();
    for (const dir of runs) {
      const m = JSON.parse(readFileSync(path.join(dir, MANIFEST), "utf8")) as Manifest;
      undo(dir, m.entries, env);
      restored += m.entries.length;
      renameWithRetry(path.join(dir, MANIFEST), path.join(dir, MANIFEST_DONE));
    }
  } finally { rmSync(path.join(root, LOCK_FILE), { force: true }); }
  return { exitCode: 0, restored };
}
