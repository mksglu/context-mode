// Published-package live test on Claude Code: npm i -g context-mode@<spec> into a temp prefix, `context-mode setup` and
// `context-mode doctor` in a temp HOME, then one `claude -p` session per arm on the same task:
//   a 200 KB log with one FATAL line, "read logs/app.log with a shell cat and tell me the value on the FATAL line".
// Arms: off (fresh HOME, no plugin, --strict-mcp-config) and v2 (the HOME setup wrote: plugin installed the native way,
// `claude plugin marketplace add <pkg>` + `claude plugin install`, see src/setup/registry.ts cliFor).
// Login: the same way e2e/live/cache/run.mjs logs in (ADR-0012, no API key): the Keychain login credential is copied into
// <config>/.credentials.json of a fresh config dir. next5-verify set CLAUDE_CONFIG_DIR to an empty dir and got
// "Not logged in"; here CLAUDE_CONFIG_DIR = <temp HOME>/.claude, so setup (which writes HOME/.claude) and claude agree.
// Evidence: stream-json only. Bytes = UTF-8 bytes of every tool_result the model got; hook fired = a PreToolUse or
// PostToolUse hook event in the stream (--include-hook-events); answer = the result text holds the FATAL value.
// Usage: node e2e/live/npm-package/claude-code.mjs [--spec context-mode@next] [--model claude-sonnet-5-5] [--effort low]
//        [--budget 1] [--root <scratch>] [--out <json>] [--raw <dir>] [--keep]
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { runGroup } from "../lib/proc-group.mjs";
import { resultBytes } from "../routing/score.mjs";

export const PROMPT = "read logs/app.log with a shell cat and tell me the value on the FATAL line";
export const FATAL_VALUE = "K7-ZETA-4412";

/** About 200 KB of INFO/WARN/ERROR rows with exactly one FATAL row at line 2101. */
export function fatalLog() {
  const rows = [];
  for (let i = 0; i < 2600; i++) {
    const level = i % 97 === 0 ? "ERROR" : i % 13 === 0 ? "WARN" : "INFO";
    rows.push(`2026-01-01T00:${String(Math.floor(i / 60) % 60).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}Z ${level} req=${i} route=/api/v${i % 4}/item/${i * 7} status=${level === "ERROR" ? 500 : 200} ms=${(i * 31) % 997} retry=${i % 5}`);
  }
  rows[2101] = `2026-01-01T00:35:01Z FATAL req=2101 disk quota exceeded value=${FATAL_VALUE}`;
  return rows.join("\n") + "\n";
}

/** Score one arm from its stream-json stdout. */
export function scoreArm(stdout) {
  const byId = new Map(), tools = [], hooks = [];
  let bytes = 0, result = "", costUsd = 0, isError = false, mcp = [];
  for (const line of String(stdout).split("\n")) {
    if (!line.startsWith("{")) continue;
    let e; try { e = JSON.parse(line); } catch { continue; }
    if (e.type === "system" && e.subtype === "init") mcp = (e.mcp_servers ?? []).map((m) => `${m.name}:${m.status}`);
    else if (e.type === "system" && e.subtype === "hook_response") hooks.push(String(e.hook_event ?? e.hook_name ?? ""));
    else if (e.type === "assistant" && !e.parent_tool_use_id) {
      for (const c of e.message?.content ?? []) if (c.type === "tool_use") { tools.push(c.name); byId.set(c.id, { name: c.name, bytes: 0 }); }
    } else if (e.type === "user") {
      for (const c of e.message?.content ?? []) if (c.type === "tool_result") {
        const b = resultBytes(c.content); bytes += b;
        const t = byId.get(c.tool_use_id); if (t) t.bytes += b;
      }
    } else if (e.type === "result") { result = String(e.result ?? ""); costUsd = Number(e.total_cost_usd ?? 0); isError = e.is_error === true; }
  }
  const hookFired = hooks.some((h) => h.startsWith("PreToolUse") || h.startsWith("PostToolUse"));
  return { bytes, perTool: [...byId.values()], tools, hooks, hookFired, answer: result, answerOk: result.includes(FATAL_VALUE),
    mcp, mcpConnected: mcp.some((m) => m.includes("context-mode") && m.endsWith(":connected")), costUsd, isError };
}

/** Child env: own HOME, CLAUDE_CONFIG_DIR = HOME/.claude, the cache runner's isolation flags, no API key, no parent CLAUDE_*. */
export function childEnv(home, pathValue) {
  const env = {};
  for (const k of ["USER", "LOGNAME", "SHELL", "TMPDIR", "LANG"]) if (process.env[k] !== undefined) env[k] = process.env[k];
  return Object.assign(env, { PATH: pathValue, HOME: home, CLAUDE_CONFIG_DIR: path.join(home, ".claude"), ENABLE_CLAUDEAI_MCP_SERVERS: "false",
    CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1", CLAUDE_CODE_DISABLE_CLAUDE_MDS: "1" });
}

// Same lookup as e2e/live/cache/run.mjs: the first native claude binary on PATH (shims are skipped).
function realClaude() {
  for (const dir of (process.env.PATH || "").split(":")) {
    const c = path.join(dir, "claude");
    if (!existsSync(c)) continue;
    const r = realpathSync(c);
    const b = Buffer.alloc(4); const fd = openSync(r, "r"); readSync(fd, b, 0, 4, 0); closeSync(fd);
    if (["cffaedfe", "cefaedfe", "7f454c46"].includes(b.toString("hex"))) return r;
  }
  return "";
}

// Same as e2e/live/cache/run.mjs: the Keychain login credential (never printed).
function loginCredential() {
  try {
    const s = execFileSync("security", ["find-generic-password", "-s", "Claude Code-credentials", "-w"], { encoding: "utf8" });
    return JSON.parse(s).claudeAiOauth ? s : "";
  } catch { return ""; }
}

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const log = (m) => console.error(`[${new Date().toISOString()}] ${m}`);
const TURN_TIMEOUT_MS = 420000;

function fail(msg) { console.log(JSON.stringify({ id: "npm-package-claude-code", ok: false, error: msg })); process.exit(1); }

/** A sandbox: HOME with .claude/.credentials.json, a git project holding logs/app.log, a bin dir with the real claude. */
function sandbox(root, tag, bin, cred) {
  const dir = path.join(root, tag);
  const home = path.join(dir, "home"), cfg = path.join(home, ".claude"), cwd = path.join(dir, "project"), sbin = path.join(dir, "bin");
  for (const d of [cfg, path.join(cwd, "logs"), sbin]) mkdirSync(d, { recursive: true });
  writeFileSync(path.join(cfg, ".credentials.json"), cred); chmodSync(path.join(cfg, ".credentials.json"), 0o600);
  symlinkSync(bin, path.join(sbin, "claude"));
  if (spawnSync("git", ["init", "-q", cwd]).status !== 0) throw new Error("git init failed");
  writeFileSync(path.join(cwd, "logs", "app.log"), fatalLog());
  return { dir, home, cwd, sbin };
}

async function runArm(bin, sb, arm, pathValue, opts) {
  const args = ["-p", PROMPT, "--model", opts.model, "--effort", opts.effort, "--max-budget-usd", opts.budget, "--output-format", "stream-json",
    "--verbose", "--include-hook-events", "--permission-mode", "bypassPermissions", ...(arm === "off" ? ["--strict-mcp-config"] : [])];
  const t0 = Date.now();
  const r = await runGroup(bin, args, { cwd: sb.cwd, env: childEnv(sb.home, pathValue) }, TURN_TIMEOUT_MS);
  if (opts.raw) { mkdirSync(opts.raw, { recursive: true }); writeFileSync(path.join(opts.raw, `${arm}.jsonl`), r.stdout); }
  const s = scoreArm(r.stdout);
  return { arm, exitCode: r.status, timedOut: r.timedOut, wallMs: Date.now() - t0, stderrTail: r.stderr.slice(-400), ...s };
}

async function main() {
  const spec = arg("--spec", "context-mode@next");
  const opts = { model: arg("--model", "claude-sonnet-5-5"), effort: arg("--effort", "low"), budget: arg("--budget", "1"),
    raw: arg("--raw", "") === "" ? null : path.resolve(arg("--raw", "")) };
  const root = path.resolve(arg("--root", path.join(os.tmpdir(), `cm-v2-npm-cc-${Date.now()}`)));
  const out = path.resolve(arg("--out", path.join(root, "result.json")));
  const keep = process.argv.includes("--keep");
  const bin = realClaude();
  if (bin === "") fail("no real claude binary on PATH");
  const cred = loginCredential();
  if (cred === "") fail("no login credential in the Keychain (ADR-0012: login only, no API key)");
  mkdirSync(root, { recursive: true });
  const doc = { id: "npm-package-claude-code", spec, claudeVersion: String(execFileSync(bin, ["--version"], { encoding: "utf8" })).trim(), model: opts.model, effort: opts.effort,
    installed: null, setup: null, doctor: null, arms: {}, pass: false, error: null };
  try {
    const off = sandbox(root, "off", bin, cred);
    const v2 = sandbox(root, "v2", bin, cred);
    // npm into a temp prefix with the v2 HOME, own cache.
    const prefix = path.join(root, "prefix");
    const npmEnv = { ...childEnv(v2.home, `${v2.sbin}:${process.env.PATH}`), npm_config_cache: path.join(root, "npm-cache") };
    log(`npm i -g ${spec} --prefix ${prefix}`);
    const npm = spawnSync("npm", ["i", "-g", spec, "--prefix", prefix, "--no-fund", "--no-audit"], { env: npmEnv, encoding: "utf8", timeout: 600000 });
    if (npm.status !== 0) throw new Error(`npm install failed: ${String(npm.stderr).slice(-600)}`);
    const cm = path.join(prefix, "bin", "context-mode");
    doc.installed = String(spawnSync(cm, ["--version"], { env: npmEnv, encoding: "utf8" }).stdout).trim();
    // Setup and doctor run with the v2 sandbox PATH: the bin dir with the real claude comes first, then the temp prefix.
    const v2Path = `${v2.sbin}:${path.join(prefix, "bin")}:${process.env.PATH}`;
    const env = childEnv(v2.home, v2Path);
    log(`context-mode setup --yes --agents claude-code (installed ${doc.installed})`);
    const st = spawnSync(cm, ["setup", "--yes", "--agents", "claude-code", "--json"], { env, cwd: v2.cwd, encoding: "utf8", timeout: 600000 });
    doc.setup = { exitCode: st.status, json: tryJson(st.stdout), stderrTail: String(st.stderr).slice(-600) };
    const dr = spawnSync(cm, ["doctor", "--agents", "claude-code", "--json", "--no-input"], { env, cwd: v2.cwd, encoding: "utf8", timeout: 600000 });
    doc.doctor = { exitCode: dr.status, json: tryJson(dr.stdout), stderrTail: String(dr.stderr).slice(-600) };
    if (st.status !== 0) throw new Error(`setup exit ${st.status}`);
    log("arm off");
    doc.arms.off = await runArm(bin, off, "off", `${off.sbin}:${process.env.PATH}`, opts);
    log(`arm off: bytes ${doc.arms.off.bytes} answerOk ${doc.arms.off.answerOk} cost ${doc.arms.off.costUsd}`);
    log("arm v2");
    doc.arms.v2 = await runArm(bin, v2, "v2", v2Path, opts);
    log(`arm v2: bytes ${doc.arms.v2.bytes} answerOk ${doc.arms.v2.answerOk} hook ${doc.arms.v2.hookFired} cost ${doc.arms.v2.costUsd}`);
    const a = doc.arms;
    doc.pass = doc.setup.exitCode === 0 && doc.doctor.exitCode === 0 && a.v2.hookFired && a.v2.mcpConnected && a.v2.answerOk && a.off.answerOk && a.v2.bytes < a.off.bytes / 2;
  } catch (e) { doc.error = String(e.message ?? e); }
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(doc, null, 2));
  if (!keep) for (const t of ["off", "v2"]) rmSync(path.join(root, t), { recursive: true, force: true }); // drops the copied credential
  const a = doc.arms;
  console.log(JSON.stringify({ id: doc.id, pass: doc.pass, error: doc.error, installed: doc.installed, setup: doc.setup?.exitCode, doctor: doc.doctor?.exitCode,
    bytesOff: a.off?.bytes ?? null, bytesV2: a.v2?.bytes ?? null, answerOff: a.off?.answer ?? null, answerV2: a.v2?.answer ?? null,
    hookFired: a.v2?.hookFired ?? null, toolsV2: a.v2?.tools ?? null, costUsd: (a.off?.costUsd ?? 0) + (a.v2?.costUsd ?? 0), out }));
  process.exit(doc.pass ? 0 : 1);
}

function tryJson(s) { try { return JSON.parse(s); } catch { return String(s).slice(-1500); } }

if (import.meta.url === `file://${process.argv[1]}`) await main();
