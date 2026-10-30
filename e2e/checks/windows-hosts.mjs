// e2e/checks/windows-hosts.mjs: the Windows host proof (docs/v2/review/windows-all.workflow.js, phase Matrix).
// Runs on windows-latest, ubuntu-latest and macos-latest from ci.yml job "windows hosts". Black box (GS4): spawns the
// packed npm bin and the host CLIs; no src/ import.
//
// build release-out -> npm pack -> npm i -g into a prefix under a dir WITH A SPACE -> install each host CLI that npm can
// install without login into the same prefix. Then, for each of the 10 agents, in its own HOME (also with a space):
//   setup    context-mode setup --yes --agents <a> --json   (status PASS, every check ok)
//   doctor   context-mode doctor --agents <a> --json       (exit 0, every check ok)
//   hook     the host's PreToolUse (deny rows) or PostToolUse (replace rows) payload for a 200 KB shell cat, piped into
//            the hook command exactly as the host config holds it (quotes, ${placeholders} expanded as the host does),
//            run through the platform shell the way a host runs a command hook. Assert deny / replace.
//   mcp      the MCP server command from the host config, spawned without a shell; initialize + tools/list.
// Every failure is printed as a MATRIX line and the process exits 1 at the end. Nothing is skipped on Windows; a host
// whose CLI npm cannot install still runs all four steps from the written config (cli-install says why).
import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { vscodeMcpFile } from "../harness/vscode-user-dir.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const WIN = process.platform === "win32";
const OS = process.platform === "win32" ? "windows" : process.platform === "darwin" ? "macos" : "linux";
const VERSION = "2.0.0";
const PAYLOAD_BYTES = 200_000;
const STEP_TIMEOUT_MS = 180_000;
const INSTALL_TIMEOUT_MS = 600_000;
const MCP_TOOLS = ["ctx_execute", "ctx_search"];

// Host CLI packages npm installs without a login (names checked with `npm view`, 2026-10-25).
const HOSTS = [
  { id: "claude-code", bin: "claude", pkg: "@anthropic-ai/claude-code" },
  { id: "codex", bin: "codex", pkg: "@openai/codex" },
  { id: "gemini", bin: "gemini", pkg: "@google/gemini-cli" },
  { id: "qwen", bin: "qwen", pkg: "@qwen-code/qwen-code" },
  { id: "copilot-cli", bin: "copilot", pkg: "@github/copilot" },
  { id: "opencode", bin: "opencode", pkg: "opencode-ai" },
  { id: "pi", bin: "pi", pkg: "@earendil-works/pi-coding-agent" },
  { id: "vscode", why: "VS Code is a desktop app; setup writes the user-profile mcp.json (Code/User) and the Copilot hook file, no CLI" },
  { id: "kiro", why: "Kiro CLI has no npm package; setup writes its config files" },
  { id: "zcode", why: "ZCode CLI has no npm package; setup writes its config file" },
];

// How each host names its events and shell tool, and which saving effect it shows (from the host docs and
// src/adapters/table.ts: replace rows are claude-code, gemini, copilot-cli, pi; kiro answers on stderr).
const HOOKS = {
  "claude-code": { effect: "replace", event: "PostToolUse", tool: "Bash", file: "hooks/claude-code.json", shape: "claude" },
  codex: { effect: "deny", event: "PreToolUse", tool: "Bash", shape: "claude" },
  gemini: { effect: "replace", event: "AfterTool", tool: "run_shell_command", file: "hooks/hooks.json", shape: "gemini" },
  qwen: { effect: "deny", event: "PreToolUse", tool: "run_shell_command", file: "hooks/qwen.json", shape: "claude" },
  "copilot-cli": { effect: "replace", event: "postToolUse", tool: "bash", shape: "copilot" },
  vscode: { effect: "deny", event: "PreToolUse", tool: "run_in_terminal", shape: "claude" },
  kiro: { effect: "deny", event: "PreToolUse", tool: "execute_bash", shape: "claude", answerOn: "stderr" },
  zcode: { effect: "deny", event: "PreToolUse", tool: "Bash", shape: "claude" },
  pi: { effect: "replace", event: "tool_result", tool: "bash", shape: "pi" },
  opencode: { effect: "deny", event: "execute.before", tool: "bash", shape: "opencode" },
};

const results = []; // { agent, step, ok, detail }
const record = (agent, step, ok, detail = "") => {
  results.push({ agent, step, ok, detail });
  console.log(`MATRIX|${OS}|${agent}|${step}|${ok ? "PASS" : "FAIL"}|${String(detail).replace(/\s+/g, " ").slice(0, 600)}`);
};
const tail = (s, n = 500) => `${s ?? ""}`.trim().slice(-n);

// ---------- process helpers ----------

// GS4: e2e never imports src/, so this mirrors src/setup/spawn-bin.ts spawnForm: /d /v:off /s /c (D-WIN-CMDBANG-1).
const CMD_QUOTE_CHARS = '"&|<>^()%!';
const q = (a) => (a === "" || [...a].some((c) => c.trim() === "" || CMD_QUOTE_CHARS.includes(c)) ? `"${a.split('"').join('""')}"` : a);
function form(file, args) {
  const ext = file.slice(file.lastIndexOf(".")).toLowerCase();
  if (WIN && (ext === ".cmd" || ext === ".bat")) {
    return { command: process.env.ComSpec || "cmd.exe", args: ["/d", "/v:off", "/s", "/c", `"${[file, ...args].map(q).join(" ")}"`], windowsVerbatimArguments: true };
  }
  return { command: file, args, windowsVerbatimArguments: false };
}
function run(file, args, { env, cwd, input, timeout = STEP_TIMEOUT_MS } = {}) {
  const f = form(file, args);
  const r = spawnSync(f.command, f.args, { env, cwd, input, encoding: "utf8", timeout, windowsHide: true, windowsVerbatimArguments: f.windowsVerbatimArguments, maxBuffer: 64 * 1024 * 1024 });
  return { status: r.status, signal: r.signal, stdout: r.stdout ?? "", stderr: r.stderr ?? "", error: r.error?.message };
}
/** Run a command line string through the platform shell, as a host runs a command hook. */
// GEM-WIN-5 (D-WIN-GEMINI-SHELL-1): Gemini CLI runs a hook as `powershell.exe -NoProfile -Command <line>` on Windows
// (gemini-cli shell-utils getShellConfiguration), not cmd.exe, so its line goes through PowerShell here.
function runShellLine(line, { env, cwd, input, timeout = 60_000, powershell = false }) {
  const opts = { env, cwd, input, encoding: "utf8", timeout, windowsHide: true, maxBuffer: 64 * 1024 * 1024 };
  const r = powershell && WIN
    ? spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", line + "; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }"], opts)
    : spawnSync(line, { shell: true, ...opts });
  return { status: r.status, signal: r.signal, stdout: r.stdout ?? "", stderr: r.stderr ?? "", error: r.error?.message };
}

// ---------- workspace ----------

const root = mkdtempSync(path.join(tmpdir(), "cm win host "));
const prefix = path.join(root, "npm prefix");
const packDir = path.join(root, "pack out");
const outDir = path.join(root, "release out");
const homesDir = path.join(root, "home dir");
for (const d of [prefix, packDir, homesDir]) mkdirSync(d, { recursive: true });
const binDir = WIN ? prefix : path.join(prefix, "bin");
const pkgDir = WIN ? path.join(prefix, "node_modules", "context-mode") : path.join(prefix, "lib", "node_modules", "context-mode");
const pathKey = Object.keys(process.env).find((k) => k.toLowerCase() === "path") ?? "PATH";
const npmBin = WIN ? "npm.cmd" : "npm";
const baseEnv = {
  ...process.env,
  npm_config_cache: path.join(root, "npm cache"), npm_config_userconfig: path.join(root, "npmrc"),
  npm_config_update_notifier: "false", npm_config_audit: "false", npm_config_fund: "false",
  [pathKey]: [binDir, process.env[pathKey] ?? ""].join(path.delimiter),
  CM_HOOK_OVERHEAD_BUDGET_MS: "60000", // timing is gated once by e2e/checks/setup-hook-overhead.mjs (DEVIATIONS D-CI-PERF-1)
  NO_COLOR: "1", CI: "1",
};
delete baseEnv.CLAUDE_PROJECT_DIR;
delete baseEnv.CLAUDE_CODE_SESSION_ID;
const cmBin = WIN ? path.join(prefix, "context-mode.cmd") : path.join(binDir, "context-mode");

function cleanup() { try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* best effort */ } }

// ---------- fs helpers ----------

function readJson(file) { return JSON.parse(readFileSync(file, "utf8").replace(/^﻿/, "")); }
function findFile(dir, name, depth = 8) {
  if (depth < 0 || !existsSync(dir)) return undefined;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isFile() && e.name === name) return p;
  }
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { const hit = findFile(path.join(dir, e.name), name, depth - 1); if (hit) return hit; }
  }
  return undefined;
}

/** Every hook command string for one event in a host hook file (nested, flat, kiro list and zcode events shapes). */
function hookCommands(json, event) {
  const out = [];
  const visit = (v) => {
    if (Array.isArray(v)) return v.forEach(visit);
    if (v === null || typeof v !== "object") return;
    if (typeof v.command === "string") out.push(v.command);
    if (v.action && typeof v.action.command === "string") out.push(v.action.command);
    for (const k of Object.keys(v)) if (k !== "action") visit(v[k]);
  };
  const h = json.hooks;
  if (Array.isArray(h)) visit(h.filter((e) => e.trigger === event));
  else if (h && h.events) visit(h.events[event]);
  else if (h) visit(h[event]);
  return out;
}

/** Minimal TOML read for the codex [mcp_servers.context-mode] table: command and args (basic strings, arrays of them). */
function tomlServer(file) {
  const lines = readFileSync(file, "utf8").replace(/^﻿/, "").split(/\r?\n/);
  let inTable = false; let command; let args;
  const str = (t) => (t.startsWith("'") ? t.slice(1, -1) : JSON.parse(t));
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith("[")) { inTable = line === "[mcp_servers.context-mode]" || line === '[mcp_servers."context-mode"]'; continue; }
    if (!inTable) continue;
    if (line.startsWith("command")) command = str(line.slice(line.indexOf("=") + 1).trim());
    if (line.startsWith("args")) {
      const body = line.slice(line.indexOf("=") + 1).trim();
      try { args = JSON.parse(body); } catch { args = body.slice(1, -1).split(",").map((s) => s.trim()).filter(Boolean).map(str); }
    }
  }
  if (!command || !args) throw new Error(`no [mcp_servers.context-mode] command/args in ${file}`);
  return { command, args };
}

// ---------- per-host config readers ----------

/** The place the host runs the package from, for ${CLAUDE_PLUGIN_ROOT} / ${extensionPath}. */
function hostRoot(id, home, notes) {
  let found;
  if (id === "claude-code") {
    const hook = findFile(path.join(home, ".claude", "plugins"), "hook.mjs");
    found = hook && path.dirname(hook);
  } else if (id === "gemini" || id === "qwen") {
    const ext = path.join(home, id === "gemini" ? ".gemini" : ".qwen", "extensions", "context-mode");
    if (existsSync(path.join(ext, "hook.mjs"))) found = ext;
    else if (existsSync(ext)) {
      for (const f of readdirSync(ext)) { // a linked extension records its source folder
        if (!f.includes("install") || !f.endsWith(".json")) continue;
        const src = readJson(path.join(ext, f)).source;
        if (typeof src === "string" && existsSync(path.join(src, "hook.mjs"))) found = src;
      }
    }
  }
  if (found) return found;
  notes.push(`host copy of the package not found under ${home}; used the installed package ${pkgDir}`);
  return pkgDir;
}
const expand = (s, vars) => Object.entries(vars).reduce((acc, [k, v]) => acc.split(k).join(v), s);

/** The registered hook command line for the event, placeholders expanded as the host does. */
function registeredHook(id, home, project, notes, env = process.env) {
  const spec = HOOKS[id];
  const rootDir = hostRoot(id, home, notes);
  const vars = { "${CLAUDE_PLUGIN_ROOT}": rootDir, "${extensionPath}": rootDir, "${/}": path.sep, "${workspaceFolder}": project };
  let file;
  if (spec.file) file = path.join(rootDir, spec.file);
  else if (id === "codex") file = path.join(env.CODEX_HOME || path.join(home, ".codex"), "hooks.json");
  else if (id === "copilot-cli") file = path.join(home, ".copilot", "hooks", "context-mode.json");
  else if (id === "vscode") file = path.join(home, ".copilot", "hooks", "context-mode-vscode.json");
  else if (id === "kiro") file = path.join(home, ".kiro", "hooks", "context-mode.json");
  else if (id === "zcode") file = path.join(home, ".zcode", "cli", "config.json");
  if (!file) { // pi, opencode: in-process plugins, no hook command in the host config
    notes.push("in-process agent: no hook command in the host config; ran hook.mjs from the package as doctor hook-runs does");
    return `"${process.execPath}" "${path.join(pkgDir, "hook.mjs")}" --agent ${id}`;
  }
  if (!existsSync(file)) throw new Error(`host hook file ${file} does not exist`);
  const cmds = hookCommands(readJson(file), spec.event);
  if (!cmds.length) throw new Error(`no ${spec.event} hook command in ${file}`);
  return expand(cmds[0], vars);
}

/** The MCP server { command, args } from the host config, placeholders expanded. */
function registeredServer(id, home, project, notes, env = process.env) {
  const rootDir = ["claude-code", "gemini", "qwen"].includes(id) ? hostRoot(id, home, notes) : pkgDir;
  const vars = { "${CLAUDE_PLUGIN_ROOT}": rootDir, "${extensionPath}": rootDir, "${/}": path.sep, "${workspaceFolder}": project };
  const fix = (s) => ({ command: expand(s.command, vars), args: s.args.map((a) => expand(a, vars)) });
  switch (id) {
    case "claude-code": return fix(readJson(path.join(rootDir, ".claude-plugin", "plugin.json")).mcpServers["context-mode"]);
    case "gemini": return fix(readJson(path.join(rootDir, "gemini-extension.json")).mcpServers["context-mode"]);
    case "qwen": return fix(readJson(path.join(rootDir, "qwen-extension.json")).mcpServers["context-mode"]);
    case "codex": return fix(tomlServer(path.join(env.CODEX_HOME || path.join(home, ".codex"), "config.toml")));
    case "copilot-cli": return fix(readJson(path.join(home, ".copilot", "mcp-config.json")).mcpServers["context-mode"]);
    case "vscode": return fix(readJson(vscodeMcpFile(home, env)).servers["context-mode"]);
    case "kiro": return fix(readJson(path.join(home, ".kiro", "settings", "mcp.json")).mcpServers["context-mode"]);
    case "zcode": return fix(readJson(path.join(home, ".zcode", "cli", "config.json")).mcp.servers["context-mode"]);
    case "opencode": {
      const [command, ...args] = readJson(path.join(home, ".config", "opencode", "opencode.json")).mcp["context-mode"].command;
      return fix({ command, args });
    }
    case "pi":
      notes.push("pi needs no MCP entry (docs/install/pi.md); ran the packaged server.mjs");
      return { command: process.execPath, args: [path.join(pkgDir, "server.mjs"), "--agent", "pi"] };
    default: throw new Error(`unknown agent ${id}`);
  }
}

// ---------- the 200 KB payloads, in each host's wire shape ----------

function sampleText() {
  const lines = []; let bytes = 0;
  for (let i = 0; bytes < PAYLOAD_BYTES; i++) { const l = `context-mode windows matrix sample line ${i}`; lines.push(l); bytes += l.length + 1; }
  return lines.join("\n") + "\n";
}
function payloadFor(id, cwd, text) {
  const { event, tool, shape } = HOOKS[id];
  const session = "context-mode-windows-matrix";
  const input = { command: "cat big.log" };
  switch (shape) {
    case "claude": return { hook_event_name: event, session_id: session, cwd, tool_name: tool, tool_input: input, tool_response: { stdout: text, stderr: "" } };
    case "gemini": return { hook_event_name: event, session_id: session, cwd, tool_name: tool, tool_input: input, tool_response: { llmContent: text } };
    case "copilot": return { sessionId: session, timestamp: Date.now(), cwd, toolName: tool, toolArgs: JSON.stringify(input), toolResult: { resultType: "success", textResultForLlm: text } };
    case "pi": return { type: event, sessionId: session, cwd, toolName: tool, input, content: text, isError: false };
    case "opencode": return { type: event, sessionID: session, directory: cwd, tool, args: input };
    default: throw new Error(`unknown shape ${shape}`);
  }
}

// ---------- steps ----------

function checkLines(json) {
  const a = json?.agents?.[0];
  if (!a) return "no agent row in the JSON";
  const bad = (a.checks ?? []).filter((c) => c.ok === false).map((c) => `${c.name}: ${c.detail ?? "failed"}`);
  return `${a.status}${a.reason ? " " + a.reason : ""}${bad.length ? " | " + bad.join(" | ") : ""}`;
}
function lastJson(stdout) {
  const lines = stdout.trim().split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) { try { return JSON.parse(lines[i]); } catch { /* next */ } }
  return undefined;
}

/** On a setup failure: what the host itself says (its mcp list) and the config file setup should have written. */
function diag(id, home, env) {
  const h = HOSTS.find((x) => x.id === id);
  if (h?.bin) {
    const b = path.join(WIN ? prefix : binDir, WIN ? `${h.bin}.cmd` : h.bin);
    const args = id === "opencode" ? ["mcp", "list", "--pure"] : id === "codex" ? ["mcp", "list"] : ["--version"];
    const r = run(b, args, { env, timeout: 60_000 });
    console.log(`DIAG|${OS}|${id}|${h.bin} ${args.join(" ")} -> exit ${r.status} ${r.error ?? ""} stdout=${tail(r.stdout, 600)} stderr=${tail(r.stderr, 600)}`);
  }
  const cfg = id === "codex" ? path.join(env.CODEX_HOME || path.join(home, ".codex"), "config.toml") : id === "opencode" ? path.join(home, ".config", "opencode", "opencode.json") : undefined;
  if (cfg) console.log(`DIAG|${OS}|${id}|${cfg} ${existsSync(cfg) ? "holds: " + tail(readFileSync(cfg, "utf8"), 800) : "does not exist"}`);
  console.log(`DIAG|${OS}|${id}|files under HOME: ${walkHome(home).slice(0, 40).join(", ")}`);
}
function walkHome(dir, base = dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walkHome(path.join(dir, e.name), base) : [path.relative(base, path.join(dir, e.name)).split(path.sep).join("/")]));
}

function stepSetup(id, env) {
  const r = run(cmBin, ["setup", "--yes", "--agents", id, "--json"], { env });
  const json = lastJson(r.stdout);
  const ok = r.status === 0 && json?.agents?.[0]?.status === "PASS" && (json.agents[0].checks ?? []).every((c) => c.ok);
  record(id, "setup", ok, ok ? checkLines(json) : `exit ${r.status} ${r.error ?? ""} ${json ? checkLines(json) : ""} stderr=${tail(r.stderr)} stdout=${json ? "" : tail(r.stdout)}`);
  if (!ok) diag(id, env.HOME, env);
  return ok;
}
/** D-NI-CODEX-TRUST-2: the native plugin route (ADR-0023), tester report on Codex 0.166.0-alpha.5.1 / Windows. A fresh
 *  CODEX_HOME, the release tree as a local marketplace, `codex plugin add`, then setup: the plugin hooks must end trusted
 *  and verification must not roll back. */
function stepCodexPlugin(home, env) {
  const codex = path.join(WIN ? prefix : binDir, WIN ? "codex.cmd" : "codex");
  const e = { ...env, CODEX_HOME: path.join(home, ".codex-plugin-route") };
  mkdirSync(e.CODEX_HOME, { recursive: true });
  const mk = run(codex, ["plugin", "marketplace", "add", outDir], { env: e });
  if (mk.status !== 0) return record("codex", "plugin-route", false, `marketplace add exit ${mk.status} ${tail(mk.stderr)} ${tail(mk.stdout)}`);
  const add = run(codex, ["plugin", "add", "context-mode@context-mode"], { env: e });
  if (add.status !== 0) return record("codex", "plugin-route", false, `plugin add exit ${add.status} ${tail(add.stderr)} ${tail(add.stdout)}`);
  const r = run(cmBin, ["setup", "--yes", "--agents", "codex", "--json"], { env: e });
  const json = lastJson(r.stdout);
  const a = json?.agents?.[0];
  const ok = r.status === 0 && a?.status === "PASS" && a?.rolledBack !== true && (a.checks ?? []).every((c) => c.ok);
  const cfg = path.join(e.CODEX_HOME, "config.toml");
  const trusted = existsSync(cfg) ? (readFileSync(cfg, "utf8").match(/trusted_hash = /g) ?? []).length : 0;
  record("codex", "plugin-route", ok && trusted >= 4, `exit ${r.status} status=${a?.status} rolledBack=${a?.rolledBack} trusted_hash tables=${trusted} ${json ? checkLines(json) : ""} stderr=${tail(r.stderr)}`);
}
function stepDoctor(id, env) {
  const r = run(cmBin, ["doctor", "--agents", id, "--json"], { env });
  const json = lastJson(r.stdout);
  const failed = (json?.agents?.[0]?.checks ?? []).filter((c) => c.ok === false);
  const ok = r.status === 0 && failed.length === 0 && json?.agents?.[0]?.status === "PASS";
  record(id, "doctor", ok, ok ? checkLines(json) : `exit ${r.status} ${r.error ?? ""} ${json ? checkLines(json) : ""} stderr=${tail(r.stderr)} stdout=${json ? "" : tail(r.stdout)}`);
}
function stepHook(id, home, project, env) {
  const notes = [];
  try {
    const text = sampleText();
    writeFileSync(path.join(project, "big.log"), text);
    const line = registeredHook(id, home, project, notes, env);
    const spec = HOOKS[id];
    const r = runShellLine(line, { env, cwd: project, input: JSON.stringify(payloadFor(id, project, text)), powershell: id === "gemini" });
    const seen = spec.answerOn === "stderr" ? r.stderr : r.stdout;
    const cmdNote = `command=${line.slice(0, 260)}${notes.length ? " NOTE " + notes.join("; ") : ""}`;
    if (r.error || r.status === null) return record(id, "hook", false, `did not finish: ${r.error ?? r.signal}; ${cmdNote}`);
    let ok; let why;
    if (spec.effect === "replace") {
      ok = r.status === 0 && r.stdout.includes("ctx_search(") && Buffer.byteLength(r.stdout) < Buffer.byteLength(text);
      why = `want replace (ctx_search line, smaller than ${Buffer.byteLength(text)} B): exit ${r.status}, ${Buffer.byteLength(r.stdout)} B out`;
    } else {
      ok = seen.includes("ctx_execute") && (r.status === 2 || r.stdout.includes("deny"));
      why = `want deny naming ctx_execute (exit 2 or "deny"): exit ${r.status}`;
    }
    record(id, "hook", ok, `${ok ? "" : why + " | "}${spec.effect} ${Buffer.byteLength(text)} B in, ${Buffer.byteLength(r.stdout)} B out; stdout=${tail(r.stdout, 160)} stderr=${tail(r.stderr, 200)} | ${cmdNote}`);
  } catch (e) { record(id, "hook", false, `${e.message}${notes.length ? " NOTE " + notes.join("; ") : ""}`); }
}

function stepMcp(id, home, project, env) {
  const notes = [];
  return new Promise((resolve) => {
    let server;
    try { server = registeredServer(id, home, project, notes, env); } catch (e) { record(id, "mcp", false, `config: ${e.message}`); return resolve(); }
    const note = `command=${server.command} ${server.args.join(" ").slice(0, 200)}${notes.length ? " NOTE " + notes.join("; ") : ""}`;
    let child; let buf = ""; let errBuf = ""; let done = false; const pending = new Map(); let nextId = 1;
    const finish = (ok, detail) => { if (done) return; done = true; clearTimeout(timer); try { child.kill(); } catch { /* gone */ } record(id, "mcp", ok, `${detail} | ${note}${ok ? "" : " stderr=" + tail(errBuf, 300)}`); resolve(); };
    const timer = setTimeout(() => finish(false, "timeout 60 s waiting for the MCP reply"), 60_000);
    try {
      // A host spawns the command without a shell: node on PATH, args as an array. Spaces in args must survive.
      child = spawn(server.command, server.args, { env, cwd: project, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    } catch (e) { return finish(false, `spawn: ${e.message}`); }
    child.on("error", (e) => finish(false, `spawn error: ${e.message}`));
    child.on("exit", (code) => { if (!done) finish(false, `server exited ${code} before the handshake`); });
    child.stderr.setEncoding("utf8"); child.stderr.on("data", (d) => { errBuf += d; });
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!l) continue;
        let msg; try { msg = JSON.parse(l); } catch { continue; }
        if (msg.id !== undefined && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
      }
    });
    const request = (method, params) => new Promise((res) => { const idn = nextId++; pending.set(idn, res); child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: idn, method, params }) + "\n"); });
    (async () => {
      const init = await request("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "context-mode-windows-matrix", version: "0.0.0" } });
      if (init.error) return finish(false, `initialize error: ${JSON.stringify(init.error)}`);
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }) + "\n");
      const list = await request("tools/list", {});
      const names = (list.result?.tools ?? []).map((t) => t.name);
      const missing = MCP_TOOLS.filter((n) => !names.includes(n));
      finish(!list.error && !missing.length, list.error ? `tools/list error: ${JSON.stringify(list.error)}` : `${names.length} tools${missing.length ? ", missing " + missing.join(",") : ""}`);
    })().catch((e) => finish(false, e.message));
  });
}

// ---------- main ----------

function summary() {
  const steps = ["cli-install", "setup", "doctor", "hook", "mcp"];
  const rows = [`| host (${OS}) | ${steps.join(" | ")} |`, `|---|${steps.map(() => "---").join("|")}|`];
  for (const h of HOSTS) {
    rows.push(`| ${h.id} | ${steps.map((s) => { const r = results.find((x) => x.agent === h.id && x.step === s); return r ? (r.ok ? "PASS" : "FAIL") : "-"; }).join(" | ")} |`);
  }
  const text = rows.join("\n");
  console.log("\n" + text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n### Host matrix ${OS}\n\n${text}\n`);
}

async function main() {
  console.log(`windows-hosts: ${OS} node ${process.version} root=${root}`);
  // build + pack + install the package
  const build = run(process.execPath, [path.join(REPO_ROOT, "build", "build.mjs"), "--out", outDir, "--version", VERSION], { cwd: REPO_ROOT, env: baseEnv });
  if (build.status !== 0) { record("package", "build", false, tail(build.stderr + build.stdout)); return; }
  const pack = run(npmBin, ["pack", "--json", "--pack-destination", packDir], { cwd: outDir, env: baseEnv });
  if (pack.status !== 0) { record("package", "pack", false, tail(pack.stderr)); return; }
  const tarball = path.join(packDir, JSON.parse(pack.stdout)[0].filename);
  const inst = run(npmBin, ["i", "-g", "--prefix", prefix, "--no-audit", "--no-fund", tarball], { env: baseEnv, timeout: INSTALL_TIMEOUT_MS });
  if (inst.status !== 0) { record("package", "npm-i-g", false, tail(inst.stderr)); return; }
  const ver = run(cmBin, ["--version"], { env: baseEnv });
  record("package", "npm-i-g", ver.status === 0 && ver.stdout.trim() === VERSION, `context-mode --version -> ${ver.stdout.trim()} (exit ${ver.status}) ${tail(ver.stderr, 200)}; prefix=${prefix}`);
  if (ver.stdout.trim() !== VERSION) return;

  // host CLIs, one npm call each so one bad package does not hide the others
  for (const h of HOSTS) {
    if (!h.pkg) { record(h.id, "cli-install", true, `no npm CLI: ${h.why}`); continue; }
    const r = run(npmBin, ["i", "-g", "--prefix", prefix, "--no-audit", "--no-fund", h.pkg], { env: baseEnv, timeout: INSTALL_TIMEOUT_MS });
    const v = r.status === 0 ? run(path.join(WIN ? prefix : binDir, WIN ? `${h.bin}.cmd` : h.bin), ["--version"], { env: baseEnv, timeout: 60_000 }) : undefined;
    record(h.id, "cli-install", r.status === 0 && v?.status === 0, r.status === 0 ? `${h.pkg}: ${h.bin} --version -> ${v.stdout.trim().slice(0, 80)} (exit ${v.status}) ${tail(v.stderr, 160)}` : `${h.pkg}: ${tail(r.stderr)}`);
  }

  // per agent, own HOME and project
  for (const h of HOSTS) {
    const home = path.join(homesDir, h.id);
    const project = path.join(root, "project dir", h.id);
    mkdirSync(home, { recursive: true }); mkdirSync(project, { recursive: true });
    const env = { ...baseEnv, HOME: home, USERPROFILE: home, FAKE: undefined };
    delete env.FAKE;
    if (WIN) { env.APPDATA = path.join(home, "AppData", "Roaming"); env.LOCALAPPDATA = path.join(home, "AppData", "Local"); }
    delete env.CODEX_HOME;
    // Codex finds its home with the Rust dirs crate, which asks Windows for the profile folder and ignores HOME and
    // USERPROFILE (openai/codex codex-rs/utils/home-dir). Without CODEX_HOME it reads the runner's real ~/.codex, never
    // this test HOME, so `codex mcp list` cannot see what setup wrote. CODEX_HOME must exist (find_codex_home).
    if (WIN && h.id === "codex") { env.CODEX_HOME = path.join(home, ".codex"); mkdirSync(env.CODEX_HOME, { recursive: true }); }
    delete env.XDG_CONFIG_HOME; delete env.OPENCODE_CONFIG_DIR; // D-WIN-OPENCODE-DIR-1: OpenCode reads these before <home>/.config; the runner sets XDG_CONFIG_HOME
    stepSetup(h.id, env);
    stepDoctor(h.id, env);
    stepHook(h.id, home, project, env);
    await stepMcp(h.id, home, project, env);
    if (h.id === "codex") stepCodexPlugin(home, env);
  }
}

let crashed = false;
try { await main(); } catch (e) { crashed = true; record("matrix", "crash", false, e.stack ?? e.message); } finally { summary(); cleanup(); }
const failed = results.filter((r) => !r.ok);
console.log(`\nwindows-hosts: ${OS} ${results.length - failed.length} pass, ${failed.length} fail`);
process.exit(failed.length || crashed ? 1 : 0);
