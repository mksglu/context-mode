// Live A/B runner. node bench/live/run.mjs [--batch-size 10] [--max-batches N] [--only task-id] [--runs 3]
// Raw rows -> /private/tmp/cm-v2-impl-private/bench/live-rows.jsonl (private). Aggregate -> bench/live/results/.
import { spawnSync } from "node:child_process";
import { runGroup } from "../../e2e/live/lib/proc-group.mjs";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TASKS } from "./tasks.mjs";
import { initRepo } from "./fixtures.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PRIV = "/private/tmp/cm-v2-impl-private/bench";
const ROWS = path.join(PRIV, "live-rows.jsonl");
const MODEL = "claude-sonnet-5-5", EFFORT = "low", BUDGET = "0.25";
const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i < 0 ? d : process.argv[i + 1]; };
const BATCH = Number(arg("batch-size", 10)), MAXB = Number(arg("max-batches", 1e9)), RUNS = Number(arg("runs", 3)), ONLY = arg("only", null);
fs.mkdirSync(PRIV, { recursive: true });

function realClaude() {
  for (const d of (process.env.PATH || "").split(":")) {
    const c = path.join(d, "claude"); if (!fs.existsSync(c)) continue;
    const real = fs.realpathSync(c), b = Buffer.alloc(4), fd = fs.openSync(real, "r"); fs.readSync(fd, b, 0, 4, 0); fs.closeSync(fd);
    if (["cffaedfe", "cefaedfe", "7f454c46"].includes(b.toString("hex"))) return real;
  }
  return null;
}
const bin = realClaude(); if (!bin) { console.error("no real claude binary"); process.exit(2); }
const version = spawnSync(bin, ["--version"], { encoding: "utf8" }).stdout.trim();
const env = {};
for (const k of ["PATH", "HOME", "USER", "LOGNAME", "SHELL", "TMPDIR", "LANG", "LC_ALL", "TERM"]) if (process.env[k]) env[k] = process.env[k];
Object.assign(env, { ENABLE_CLAUDEAI_MCP_SERVERS: "false", CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1", CLAUDE_CODE_DISABLE_CLAUDE_MDS: "1" });

// plan: task x run x arm, interleaved, fixed order
const plan = [];
for (let r = 1; r <= RUNS; r++) for (const t of TASKS) { if (ONLY && t.id !== ONLY) continue; for (const arm of r % 2 ? ["off", "on"] : ["on", "off"]) plan.push({ id: `${t.id}/${r}/${arm}`, task: t, run: r, arm }); }
const done = new Set(fs.existsSync(ROWS) ? fs.readFileSync(ROWS, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l).id) : []);
const todo = plan.filter((p) => !done.has(p.id));

async function session(p) {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "cm-live-")));
  initRepo(dir);
  const { prompt, expect } = p.task.build(dir);
  const tools = ["Bash", "Read", "Grep", "Glob"];
  const arm = p.arm === "on" ? ["--plugin-dir", path.join(ROOT, "release-out"), "--allowedTools", ...tools, "mcp__plugin_context-mode_context-mode"]
    : ["--strict-mcp-config", "--allowedTools", ...tools];
  const t0 = Date.now();
  const r = await runGroup(bin, ["-p", prompt, "--output-format", "stream-json", "--verbose", "--model", MODEL, "--effort", EFFORT, "--max-budget-usd", BUDGET,
    "--no-session-persistence", "--setting-sources", "project", ...arm], { cwd: dir, env }, 600000);
  let res = null, calls = 0, mcpCalls = 0, mcpOk = 0, toolNames = [];
  for (const l of (r.stdout || "").split("\n")) {
    if (!l.startsWith("{")) continue;
    let ev; try { ev = JSON.parse(l); } catch { continue; }
    if (ev.type === "result") res = ev;
    if (ev.type === "system" && ev.subtype === "init") { mcpOk = (ev.mcp_servers ?? []).filter((m) => m.status === "connected").length; }
    if (ev.type === "assistant") for (const c of ev.message?.content ?? []) if (c.type === "tool_use") { toolNames.push(c.name); calls++; if (c.name.startsWith("mcp__")) mcpCalls++; }
  }
  const u = res?.usage ?? {};
  const text = String(res?.result ?? "");
  const ok = !!res && res.is_error !== true && text.includes(expect);
  const key = createHash("sha256").update(fs.realpathSync.native(path.join(dir, ".git"))).digest("hex").slice(0, 16);
  fs.rmSync(path.join(os.homedir(), ".context-mode", "projects", key), { recursive: true, force: true });
  fs.rmSync(dir, { recursive: true, force: true });
  return { id: p.id, task: p.task.id, run: p.run, arm: p.arm, ok, isError: res?.is_error ?? true, input: u.input_tokens ?? 0, cacheCreate: u.cache_creation_input_tokens ?? 0, cacheRead: u.cache_read_input_tokens ?? 0,
    output: u.output_tokens ?? 0, cost: Number(res?.total_cost_usd ?? 0), calls, mcpCalls, mcpOk, tools: toolNames.join(","), ms: Date.now() - t0, answer: text.slice(0, 200), expect };
}

function median(a) { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : NaN; }
const tot = (r) => r.input + r.cacheCreate + r.cacheRead;
function aggregate() {
  const rows = fs.readFileSync(ROWS, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const arms = {};
  for (const a of ["on", "off"]) { const x = rows.filter((r) => r.arm === a); arms[a] = { sessions: x.length, pass: x.filter((r) => r.ok).length, costUsd: +x.reduce((s, r) => s + r.cost, 0).toFixed(4), medianSessionInput: median(x.map(tot)), medianFreshInput: median(x.map((r) => r.input + r.cacheCreate)), mcpCallSessions: x.filter((r) => r.mcpCalls > 0).length }; }
  const per = [];
  for (const t of [...new Set(rows.map((r) => r.task))]) {
    const on = rows.filter((r) => r.task === t && r.arm === "on"), off = rows.filter((r) => r.task === t && r.arm === "off");
    if (!on.length || !off.length) continue;
    const sv = (f) => 1 - median(on.map(f)) / median(off.map(f));
    const onOk = on.filter((r) => r.ok), offOk = off.filter((r) => r.ok);
    per.push({ task: t, nOn: on.length, nOff: off.length, passOn: onOk.length, passOff: offOk.length, savingTotal: +sv(tot).toFixed(4), savingFresh: +sv((r) => r.input + r.cacheCreate).toFixed(4),
      savingTotalOk: onOk.length && offOk.length ? +(1 - median(onOk.map(tot)) / median(offOk.map(tot))).toFixed(4) : null });
  }
  const sv = per.map((p) => p.savingTotal), sf = per.map((p) => p.savingFresh);
  return { date: new Date().toISOString().slice(0, 10), agent: version, model: MODEL, effort: EFFORT, budgetUsd: BUDGET, sessionsDone: rows.length, arms,
    savingTotal: sv.length ? { median: +median(sv).toFixed(4), min: Math.min(...sv), max: Math.max(...sv), tasks: sv.length } : null,
    savingFresh: sf.length ? { median: +median(sf).toFixed(4), min: Math.min(...sf), max: Math.max(...sf) } : null,
    totalCostUsd: +(arms.on.costUsd + arms.off.costUsd).toFixed(4), perTask: per };
}

let b = 0;
while (todo.length && b < MAXB) {
  const batch = todo.splice(0, BATCH); b++;
  for (const p of batch) { const row = await session(p); fs.appendFileSync(ROWS, JSON.stringify(row) + "\n"); console.log(p.id, row.ok ? "ok" : "FAIL", tot(row), "$" + row.cost.toFixed(3)); }
  const agg = aggregate(); const out = path.join(ROOT, "bench/live/results"); fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "aggregate.json"), JSON.stringify(agg, null, 2) + "\n");
  spawnSync("git", ["add", "bench/live/results/aggregate.json"], { cwd: ROOT });
  spawnSync("git", ["-c", "user.name=mksglu", "-c", "user.email=mksglu@users.noreply.github.com", "commit", "-qm", `bench(live): aggregate after ${agg.sessionsDone} sessions`], { cwd: ROOT });
  for (let i = 0; i < 5; i++) { if (spawnSync("git", ["push", "-q", "origin", "v2-design"], { cwd: ROOT }).status === 0) break; spawnSync("git", ["pull", "--rebase", "-q", "origin", "v2-design"], { cwd: ROOT }); }
  console.log("batch", b, "pushed; sessions", agg.sessionsDone);
}
