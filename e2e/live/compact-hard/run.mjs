// compact-hard runner (PREREG.md). One keyless `claude -p` stream-json session per (question, run, arm):
//   turn 1: print the data file with Bash (the only time the exact values reach the model)
//   then:   the runner deletes the data file, sends "/compact", then the question.
// Arms: direct (no plugin) and v2 (--plugin-dir <bundle>, unchanged). Score = exact compare of the
// "ANSWER:" line (score.mjs). Raw stream-json of every session goes to --raw <dir>.
// Usage: node e2e/live/compact-hard/run.mjs --bundle <release-out> --set main|heldout --n 3 --model <id>
//        [--arms v2,direct] [--budget 1] [--effort low] [--jobs 6] [--root <scratch>] [--raw <dir>] [--out <json>]
//        [--only <questionId,...>]
// Isolation (ADR-0012): real Claude Code binary, fresh CLAUDE_CONFIG_DIR per session holding only the login
// credential, --strict-mcp-config, ENABLE_CLAUDEAI_MCP_SERVERS=false, CLAUDE_CODE_DISABLE_AUTO_MEMORY=1,
// CLAUDE_CODE_DISABLE_CLAUDE_MDS=1, stdin is the stream-json pipe only. Fail closed: no credential, no binary,
// no bundle, or a session without a compact boundary -> the run is marked invalid and counts as wrong.
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { isCorrect, parseAnswer } from "./score.mjs";
import { ANSWER_RULE, mainSessions, printTurn } from "./sessions.mjs";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BUNDLE = path.resolve(arg("--bundle", "release-out"));
const SET = arg("--set", "main");
const N = Number(arg("--n", "3"));
const MODEL = arg("--model", "");
const EFFORT = arg("--effort", "low");
const BUDGET = arg("--budget", "1");
const JOBS = Number(arg("--jobs", "6"));
const ARMS = arg("--arms", "v2,direct").split(",");
const ONLY = arg("--only", "") === "" ? null : new Set(arg("--only", "").split(","));
const SCRATCH = path.resolve(arg("--root", os.tmpdir()));
const RAW = arg("--raw", "") === "" ? null : path.resolve(arg("--raw", ""));
const OUT = path.resolve(arg("--out", path.join(SCRATCH, `compact-hard-${SET}-${Date.now()}.json`)));
const TURN_TIMEOUT_MS = 420000;
const PREFIX = "mcp__plugin_context-mode_context-mode__";

function fail(msg) { console.log(JSON.stringify({ id: "compact-hard", ok: false, error: msg })); process.exit(1); }

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

// The login credential only (macOS Keychain item of Claude Code), written into a fresh config dir.
function loginCredential() {
  try {
    const s = execFileSync("security", ["find-generic-password", "-s", "Claude Code-credentials", "-w"], { encoding: "utf8" });
    return JSON.parse(s).claudeAiOauth ? s : "";
  } catch { return ""; }
}

const projectStore = (cwd) => path.join(os.homedir(), ".context-mode", "projects",
  createHash("sha256").update(realpathSync.native(path.join(cwd, ".git"))).digest("hex").slice(0, 16));

function childEnv(cfg) {
  const env = {};
  for (const k of ["PATH", "HOME", "USER", "LOGNAME", "SHELL", "TMPDIR", "LANG"]) if (process.env[k] !== undefined) env[k] = process.env[k];
  return Object.assign(env, { CLAUDE_CONFIG_DIR: cfg, ENABLE_CLAUDEAI_MCP_SERVERS: "false", CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1", CLAUDE_CODE_DISABLE_CLAUDE_MDS: "1" });
}

const userLine = (text) => JSON.stringify({ type: "user", message: { role: "user", content: [{ type: "text", text }] } }) + "\n";
const RETRIEVAL = new Set(["Bash", "Read", "Grep", "Glob", ...["ctx_search", "ctx_resume", "ctx_execute", "ctx_execute_file", "ctx_batch_execute"].map((t) => PREFIX + t)]);

function hookText(ev) {
  try {
    const j = JSON.parse(ev.stdout ?? ev.output ?? "");
    return String(j?.hookSpecificOutput?.additionalContext ?? j?.additionalContext ?? "");
  } catch { return ""; }
}

async function session(bin, cred, arm, sess, q, run, root) {
  const dir = mkdtempSync(path.join(root, `${arm}-${q.id}-${run}-`));
  const cfg = path.join(dir, "config"); const cwd = path.join(dir, "project");
  mkdirSync(cfg); mkdirSync(cwd);
  writeFileSync(path.join(cfg, ".credentials.json"), cred); chmodSync(path.join(cfg, ".credentials.json"), 0o600);
  if (spawnSync("git", ["init", "-q", cwd]).status !== 0) throw new Error("git init failed");
  const dataPath = path.join(cwd, sess.data.file);
  mkdirSync(path.dirname(dataPath), { recursive: true });
  writeFileSync(dataPath, sess.data.text);
  const storeNew = !existsSync(projectStore(cwd));
  const args = ["-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose", "--include-hook-events",
    "--model", MODEL, "--effort", EFFORT, "--max-budget-usd", BUDGET, "--no-session-persistence",
    "--permission-mode", "bypassPermissions", "--tools", "Bash,Read,Grep,Glob"];
  // --strict-mcp-config drops the plugin's own MCP server (measured: init mcp_servers = [] with --plugin-dir).
  // The v2 arm follows e2e/live/run.mjs (ADR-0012 plugin cases): --plugin-dir, no --strict-mcp-config; the
  // fresh CLAUDE_CONFIG_DIR and the empty temp project hold no other MCP server. The direct arm stays strict.
  if (arm === "v2") args.push("--plugin-dir", BUNDLE); else args.push("--strict-mcp-config");
  const sends = [printTurn(sess.data), "/compact", `${q.q} ${ANSWER_RULE}`];
  const t0 = Date.now();
  const child = spawn(bin, args, { cwd, env: childEnv(cfg), stdio: ["pipe", "pipe", "pipe"] });
  const o = { arm, question: q.id, run, expected: q.answer, compacted: false, isError: false, turns: [], hooks: [], toolCalls: [], finalText: "", costUsd: 0, raw: [] };
  let turn = 0; let timer = null;
  const next = () => {
    clearTimeout(timer);
    if (turn === 1) rmSync(dataPath, { force: true }); // the values now exist only in history and the store
    if (turn >= sends.length) { child.stdin.end(); return; }
    child.stdin.write(userLine(sends[turn]));
    timer = setTimeout(() => { o.isError = true; child.kill(); }, TURN_TIMEOUT_MS);
  };
  const onEvent = (ev) => {
    o.raw.push(ev);
    if (ev.type === "system" && ev.subtype === "compact_boundary") o.compacted = true;
    if (ev.type === "system" && ev.subtype === "init" && o.mcpServers === undefined) o.mcpServers = (ev.mcp_servers ?? []).map((m) => `${m.name}:${m.status}`);
    if (ev.type === "system" && ev.subtype === "hook_response") {
      const t = hookText(ev);
      if (t !== "") o.hooks.push({ turn, event: String(ev.hook_event ?? ev.hook_name ?? ""), bytes: Buffer.byteLength(t), text: t });
    }
    if (ev.type === "assistant") for (const c of ev.message?.content ?? []) if (c.type === "tool_use") o.toolCalls.push({ turn, name: c.name, input: c.input });
    if (ev.type === "result") {
      const u = ev.usage ?? {};
      o.turns.push({ turn, ms: ev.duration_ms ?? null, tokensIn: (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0), tokensOut: u.output_tokens ?? 0, costUsd: ev.total_cost_usd ?? 0, isError: ev.is_error === true });
      o.costUsd = Math.max(o.costUsd, Number(ev.total_cost_usd ?? 0));
      o.isError = o.isError || ev.is_error === true;
      o.finalText = String(ev.result ?? "");
      turn += 1; next();
    }
  };
  let buf = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (d) => { buf += d; let i; while ((i = buf.indexOf("\n")) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); if (l.trim() === "") continue; try { onEvent(JSON.parse(l)); } catch {} } });
  let stderr = ""; child.stderr.setEncoding("utf8"); child.stderr.on("data", (d) => { stderr += d; });
  child.stdin.on("error", () => {});
  const code = await new Promise((res) => { child.on("close", res); next(); });
  clearTimeout(timer);
  o.wallMs = Date.now() - t0; o.exitCode = code; o.stderr = stderr.slice(0, 2000);
  if (turn < sends.length) o.isError = true;
  const qTurn = sends.length - 1;
  o.answer = parseAnswer(o.finalText);
  const mcpOk = arm !== "v2" || (o.mcpServers ?? []).some((m) => m.includes("context-mode") && m.endsWith(":connected"));
  o.valid = o.compacted && !o.isError && mcpOk;
  o.correct = o.valid && isCorrect(o.finalText, q.answer);
  o.retrievalCalls = o.toolCalls.filter((t) => t.turn === qTurn && RETRIEVAL.has(t.name)).length;
  o.ctxCalls = o.toolCalls.filter((t) => t.turn === qTurn && t.name.startsWith(PREFIX)).length;
  const last = o.turns.find((t) => t.turn === qTurn);
  o.tokensAfter = last ? last.tokensIn + last.tokensOut : null;
  o.hookBytesAfter = o.hooks.filter((h) => h.turn >= 1).reduce((n, h) => n + h.bytes, 0);
  if (RAW) { mkdirSync(RAW, { recursive: true }); writeFileSync(path.join(RAW, `${SET}-${arm}-${q.id}-${run}.jsonl`), o.raw.map((e) => JSON.stringify(e)).join("\n") + "\n"); }
  delete o.raw;
  if (arm === "v2" && storeNew) rmSync(projectStore(cwd), { recursive: true, force: true });
  rmSync(dir, { recursive: true, force: true });
  return o;
}

const bin = realClaude();
if (bin === "") fail("no real claude binary on PATH");
if (MODEL === "") fail("--model is required");
if (ARMS.includes("v2") && !existsSync(path.join(BUNDLE, ".claude-plugin", "plugin.json"))) fail(`no built plugin in ${BUNDLE}`);
const cred = loginCredential();
if (cred === "") fail("no login credential in the Keychain (ADR-0012: login only, no API key)");
const version = String(execFileSync(bin, ["--version"], { encoding: "utf8" })).trim();
const sessions = SET === "heldout" ? (await import("./heldout/sessions.mjs")).heldoutSessions() : mainSessions();
const jobs = [];
for (const arm of ARMS) for (const s of sessions) for (const q of s.questions) if (ONLY === null || ONLY.has(q.id)) for (let r = 0; r < N; r++) jobs.push({ arm, s, q, r });
mkdirSync(SCRATCH, { recursive: true });
const root = mkdtempSync(path.join(SCRATCH, "compact-hard-"));
const results = [];
const summary = () => {
  const by = {};
  for (const arm of ARMS) {
    const xs = results.filter((x) => x.arm === arm);
    const med = (k) => { const v = xs.map((x) => x[k]).filter((n) => typeof n === "number").sort((a, b) => a - b); return v.length ? v[v.length >> 1] : null; };
    by[arm] = { runs: xs.length, valid: xs.filter((x) => x.valid).length, correct: xs.filter((x) => x.correct).length,
      correctPct: xs.length ? Number((100 * xs.filter((x) => x.correct).length / xs.length).toFixed(1)) : null,
      retrievalCallRate: xs.length ? Number((xs.filter((x) => x.retrievalCalls > 0).length / xs.length).toFixed(3)) : null,
      ctxCallRate: xs.length ? Number((xs.filter((x) => x.ctxCalls > 0).length / xs.length).toFixed(3)) : null,
      tokensAfterMedian: med("tokensAfter"), hookBytesAfterMedian: med("hookBytesAfter"), wallMsMedian: med("wallMs"),
      costUsd: Number(xs.reduce((n, x) => n + x.costUsd, 0).toFixed(4)) };
  }
  return by;
};
const save = (complete) => { mkdirSync(path.dirname(OUT), { recursive: true }); writeFileSync(OUT, JSON.stringify({ id: "compact-hard", set: SET, model: MODEL, effort: EFFORT, budgetUsd: BUDGET, n: N, claudeVersion: version, bundle: BUNDLE, complete, arms: summary(), runs: results }, null, 2)); };
try {
  let k = 0;
  await Promise.all(Array.from({ length: Math.min(JOBS, jobs.length) }, async () => {
    while (k < jobs.length) {
      const j = jobs[k++];
      let r;
      try { r = await session(bin, cred, j.arm, j.s, j.q, j.r, root); } catch (e) { r = { arm: j.arm, question: j.q.id, run: j.r, valid: false, correct: false, error: String(e), costUsd: 0 }; }
      results.push(r); save(false);
      console.error(`${r.arm} ${r.question} #${r.run}: correct ${r.correct} answer ${JSON.stringify(r.answer)} compacted ${r.compacted} retrieval ${r.retrievalCalls} ctx ${r.ctxCalls} $${(r.costUsd ?? 0).toFixed(3)}`);
    }
  }));
} finally {
  rmSync(root, { recursive: true, force: true });
}
save(true);
console.log(JSON.stringify({ id: "compact-hard", ok: true, set: SET, model: MODEL, claudeVersion: version, arms: summary(), resultFile: OUT }));
