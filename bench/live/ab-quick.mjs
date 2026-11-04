// Quick live A/B: all sessions in parallel, arms off / v1 / v2. node bench/live/ab-quick.mjs [--v1 <plugin dir>]
// Raw rows -> /private/tmp/cm-v2-impl-private/bench/ab-quick-rows.json (private). Aggregate -> bench/live/results/ab-quick.json.
import { spawnSync } from "node:child_process";
import { spawnGroup, watchdog } from "../../e2e/live/lib/proc-group.mjs";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TASKS } from "./tasks.mjs";
import { initRepo } from "./fixtures.mjs";
import { ALL_TASKS } from "./score-tasks.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PRIV = "/private/tmp/cm-v2-impl-private/bench";
const MODEL = "claude-sonnet-5-5", EFFORT = "low", BUDGET = "0.25", TIMEOUT_MS = 270000;
const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i < 0 ? d : process.argv[i + 1]; };
const V1 = arg("v1", "/private/tmp/cm-v2-fu-ab/v1src");
const RUNS = Number(arg("runs", "1")), OUT = arg("out", "ab-quick");
fs.mkdirSync(PRIV, { recursive: true });

// New multi-step task: three large outputs in a row, one marker value in each.
function multi(dir) {
  let s = 7; const r = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const tok = () => Array.from({ length: 8 }, () => "abcdefghjkmnpqrstuvwxyz23456789"[Math.floor(r() * 31)]).join("");
  const vals = [];
  for (let k = 1; k <= 3; k++) {
    const v = tok(); vals.push(v); const at = 400 + Math.floor(r() * 600);
    const lines = Array.from({ length: 1500 }, (_, i) => i === at ? `SECRET-${k} value=${v}` : `row ${i} ${tok()} ${tok()} ${tok()} ${tok()}`);
    fs.mkdirSync(path.join(dir, "data"), { recursive: true });
    fs.writeFileSync(path.join(dir, "data", `part${k}.txt`), lines.join("\n") + "\n");
  }
  return { prompt: 'Run cat on data/part1.txt, then data/part2.txt, then data/part3.txt (one Bash call each). In each, find the line starting with SECRET-<n> (n = file number) and read the value after "value=". Reply with only the three values separated by spaces, in order.', expect: vals };
}
const IDS = arg("tasks", "log-1,json-1,tests-1,file-1,git-1,multi-1").split(",");
const tasks = IDS.map((id) => ALL_TASKS.find((t) => t.id === id));

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

const arms = ["off", ...(fs.existsSync(V1) ? ["v1"] : []), "v2"];
const tools = ["Bash", "Read", "Grep", "Glob"], MCP = "mcp__plugin_context-mode_context-mode";
function armArgs(a) {
  if (a === "off") return ["--strict-mcp-config", "--allowedTools", ...tools];
  return ["--plugin-dir", a === "v2" ? path.join(ROOT, "release-out") : V1, "--allowedTools", ...tools, MCP];
}
function session(task, arm) {
  return new Promise((resolve) => {
    const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "cm-ab-")));
    initRepo(dir);
    const { prompt, expect } = task.build(dir);
    const t0 = Date.now();
    const p = spawnGroup(bin, ["-p", prompt + " Reply with only the answer, no other text.", "--output-format", "stream-json", "--verbose", "--model", MODEL, "--effort", EFFORT, "--max-budget-usd", BUDGET,
      "--no-session-persistence", "--setting-sources", "project", ...armArgs(arm)], { cwd: dir, env, stdio: ["ignore", "pipe", "ignore"] });
    let out = ""; p.stdout.on("data", (d) => (out += d));
    watchdog(p, TIMEOUT_MS);
    p.on("close", () => {
      let res = null, calls = 0, ctx = 0, trBytes = 0; const names = [];
      for (const l of out.split("\n")) {
        if (!l.startsWith("{")) continue; let ev; try { ev = JSON.parse(l); } catch { continue; }
        if (ev.type === "result") res = ev;
        if (ev.type === "user") for (const c of ev.message?.content ?? []) if (c.type === "tool_result") trBytes += Buffer.byteLength(typeof c.content === "string" ? c.content : JSON.stringify(c.content ?? ""));
        if (ev.type === "assistant") for (const c of ev.message?.content ?? []) if (c.type === "tool_use") { calls++; names.push(c.name); if (c.name.startsWith("mcp__")) ctx++; }
      }
      const u = res?.usage ?? {}, text = String(res?.result ?? "");
      const ok = !!res && res.is_error !== true && expect.every((e) => text.includes(e));
      const key = createHash("sha256").update(fs.realpathSync.native(path.join(dir, ".git"))).digest("hex").slice(0, 16);
      fs.rmSync(path.join(os.homedir(), ".context-mode", "projects", key), { recursive: true, force: true });
      fs.rmSync(dir, { recursive: true, force: true });
      resolve({ task: task.id, arm, ok, subtype: res?.subtype ?? "none", tokens: (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0),
        cost: Number(res?.total_cost_usd ?? 0), trBytes, calls, ctxCalls: ctx, ms: Date.now() - t0, tools: names.join(","), answer: text.slice(0, 120) });
    });
  });
}
const median = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : NaN; };
const t0 = Date.now();
const rows = await Promise.all(tasks.flatMap((t) => arms.flatMap((a) => Array.from({ length: RUNS }, () => session(t, a)))));
fs.writeFileSync(path.join(PRIV, OUT + "-rows.json"), JSON.stringify(rows));
const summary = { date: new Date().toISOString().slice(0, 10), agent: version, model: MODEL, effort: EFFORT, budgetUsd: BUDGET, runs: RUNS, wallSeconds: Math.round((Date.now() - t0) / 1000), v1Skipped: !arms.includes("v1"), arms: {}, perTask: [] };
const by = (a) => rows.filter((r) => r.arm === a);
const mt = (t, a, f) => median(rows.filter((r) => r.task === t.id && r.arm === a).map(f));
const stats = (v) => ({ median: +(median(v) * 100).toFixed(1), min: +(Math.min(...v) * 100).toFixed(1), max: +(Math.max(...v) * 100).toFixed(1) });
for (const a of arms) {
  const x = by(a);
  const vs = (b) => stats(tasks.map((t) => 1 - mt(t, a, (r) => r.tokens) / mt(t, b, (r) => r.tokens)));
  summary.arms[a] = { sessions: x.length, pass: x.filter((r) => r.ok).length, medianTokens: median(x.map((r) => r.tokens)), medianToolResultBytes: median(x.map((r) => r.trBytes)), savingVsOffPct: a === "off" ? null : vs("off"), savingVsV1Pct: a === "v2" && arms.includes("v1") ? vs("v1") : null, ctxCalls: x.reduce((s, r) => s + r.ctxCalls, 0), costUsd: +x.reduce((s, r) => s + r.cost, 0).toFixed(4) };
}
for (const t of tasks) summary.perTask.push({ task: t.id, ...Object.fromEntries(arms.map((a) => { const q = rows.filter((r) => r.task === t.id && r.arm === a); return [a, { medianTokens: mt(t, a, (r) => r.tokens), medianToolResultBytes: mt(t, a, (r) => r.trBytes), pass: q.filter((r) => r.ok).length + "/" + q.length, ctxCalls: q.reduce((s, r) => s + r.ctxCalls, 0), cost: +q.reduce((s, r) => s + r.cost, 0).toFixed(4) }]; })) });
summary.totalCostUsd = +rows.reduce((s, r) => s + r.cost, 0).toFixed(4);
fs.mkdirSync(path.join(ROOT, "bench/live/results"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "bench/live/results/" + OUT + ".json"), JSON.stringify(summary, null, 2) + "\n");
console.log(JSON.stringify(summary, null, 1));
