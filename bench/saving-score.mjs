// bench/saving-score.mjs - the frozen saving score. One command, one JSON line on stdout:
//   {m1, m2, guards:{...}, guardsOk, detail}
// Aggregates only go to bench/saving-score-last.json. Private rows go to /private/tmp/cm-v2-impl-private/bench.
// Usage: node bench/saving-score.mjs [--write-lock] [--runs N] [--only id,id] [--skip-gate] [--skip-offline] [--skip-live]
//   --write-lock  write bench/saving-score.lock (sha256 of this file and bench/live/score-tasks.mjs) and exit.
//   --skip-*      development only: the skipped part is reported as null and guardsOk is false.
//
// Definition (frozen; owner target >= 90 on M1 and M2):
// M1 (offline) = bench/replay.mjs over the owner's corpus. Population: results of Bash, Read, Grep, Glob,
//   WebFetch, WebSearch and non-ctx MCP tools whose native output is > 4096 bytes (replay buckets 4-16K, 16-64K, >64K).
//   M1 = 100 * (before - after) / before, after = bytes the model gets under v2, a deny counted as its text plus the
//   re-run bound (replay field afterBound).
// M2 (live) = tasks in bench/live/score-tasks.mjs SCORE_TASKS. Per task: sum of UTF-8 bytes of tool_result content the
//   model saw (stream-json) in arm v2 vs arm off. M2 = median over tasks of 100 * (off - v2) / off.
// Guards (all must hold):
//   success      v2 success >= off success on every task (SCORE_TASKS and SMALL_TASKS)
//   small1k      offline <=1K bucket saving >= -1 (percent, all tools, with the re-run bound)
//   tokens       median session tokens of the 5 small tasks (v2) <= BASELINE_V2_SMALL_TOKENS * 1.02
//   gate         node scripts/gate.mjs --milestone M7 --quick exits 0
// Report only: corpus-total offline saving, median session tokens per arm, cost.
import { spawn, spawnSync } from "node:child_process";
import { spawnGroup, watchdog } from "../e2e/live/lib/proc-group.mjs";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SCORE_TASKS, SMALL_TASKS, ALL_TASKS, normalize } from "./live/score-tasks.mjs";
import { initRepo } from "./live/fixtures.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PRIV = "/private/tmp/cm-v2-impl-private/bench";
const LAST = path.join(ROOT, "bench/saving-score-last.json");
const LOCK = path.join(ROOT, "bench/saving-score.lock");
const FILES = ["bench/saving-score.mjs", "bench/live/score-tasks.mjs"];
const MODEL = "claude-sonnet-5-5", EFFORT = "low", BUDGET = "0.25", TIMEOUT_MS = 270000;
// Median session tokens of the 5 small tasks under v2 in the quick A/B of 2026-10-20 (bench/live/results/ab-quick.json:
// log-1 38122, json-1 58103, tests-1 38227, file-1 38207, git-1 38296).
const BASELINE_V2_SMALL_TOKENS = 38227, TOKENS_TOLERANCE = 1.02;
const POP_TOOLS = ["Bash", "Read", "Grep", "Glob", "WebFetch", "WebSearch", "mcp:other"];
const POP_BUCKETS = ["4-16K", "16-64K", ">64K"];

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const arg = (n, d) => { const i = argv.indexOf("--" + n); return i < 0 ? d : argv[i + 1]; };
const sha = (f) => createHash("sha256").update(fs.readFileSync(path.join(ROOT, f))).digest("hex");
const median = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null; };
const round = (x, d = 2) => (x === null || x === undefined || Number.isNaN(x) ? null : +x.toFixed(d));
const err = (...a) => console.error("[saving-score]", ...a);

if (has("--write-lock")) {
  fs.writeFileSync(LOCK, FILES.map((f) => `${sha(f)}  ${f}`).join("\n") + "\n");
  console.log(fs.readFileSync(LOCK, "utf8").trimEnd());
  process.exit(0);
}
function lockOk() {
  if (!fs.existsSync(LOCK)) return false;
  const want = new Map(fs.readFileSync(LOCK, "utf8").split("\n").filter(Boolean).map((l) => { const [h, f] = l.split(/\s+/); return [f, h]; }));
  return FILES.every((f) => want.get(f) === sha(f));
}

// ---------- gate ----------
function gate() {
  const r = spawnSync("node", ["scripts/gate.mjs", "--milestone", "M7", "--quick"], { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28 });
  const lines = (r.stdout || "").split("\n").filter((l) => /^(PASS|FAIL|SKIP) /.test(l));
  return { ok: r.status === 0, status: r.status, layers: lines.map((l) => l.split(" ").slice(0, 2).join(" ")) };
}

// ---------- M1 ----------
async function offline() {
  fs.mkdirSync(PRIV, { recursive: true });
  const out = path.join(PRIV, "saving-score-replay.json");
  const t0 = Date.now();
  const r = await new Promise((resolve) => {
    const p = spawn("node", ["bench/replay.mjs", "--out", out], { cwd: ROOT, stdio: ["ignore", "ignore", "ignore"] });
    p.on("close", (code) => resolve(code));
  });
  if (r !== 0 || !fs.existsSync(out)) throw new Error("replay failed, exit " + r);
  const agg = JSON.parse(fs.readFileSync(out, "utf8"));
  let before = 0, after = 0, afterNoBound = 0, calls = 0;
  const perTool = {};
  for (const tool of POP_TOOLS) {
    const b = agg.buckets[tool]; if (!b) continue;
    const t = { calls: 0, before: 0, after: 0 };
    for (const k of POP_BUCKETS) { const x = b[k]; if (!x) continue; t.calls += x.calls; t.before += x.before; t.after += x.afterBound; afterNoBound += x.after; }
    perTool[tool] = { ...t, savingPct: round(t.before ? (100 * (t.before - t.after)) / t.before : 0) };
    before += t.before; after += t.after; calls += t.calls;
  }
  const perBucket = {};
  for (const k of ["<=1K", "1-4K", "4-16K", "16-64K", ">64K"]) { const x = agg.buckets.ALL?.[k]; if (x) perBucket[k] = { calls: x.calls, before: x.before, after: x.afterBound, savingPct: round(x.before ? (100 * (x.before - x.afterBound)) / x.before : 0) }; }
  return {
    m1: before ? (100 * (before - after)) / before : 0,
    small1kPct: perBucket["<=1K"]?.savingPct ?? 0,
    detail: { population: { calls, before, after, afterWithoutRerunBound: afterNoBound, perTool }, perBucket,
      corpusTotal: { calls: agg.total.calls, savingPct: round(agg.total.savingPct), savingPctWithRerunBound: round(agg.total.savingPctWithRerunBound) },
      corpus: { files: agg.corpus.files, sessions: agg.corpus.sessions, calls: agg.corpus.calls, lastTs: agg.corpus.lastTs }, seconds: Math.round((Date.now() - t0) / 1000) },
  };
}

// ---------- M2 ----------
function realClaude() {
  for (const d of (process.env.PATH || "").split(":")) {
    const c = path.join(d, "claude"); if (!fs.existsSync(c)) continue;
    const real = fs.realpathSync(c), b = Buffer.alloc(4), fd = fs.openSync(real, "r"); fs.readSync(fd, b, 0, 4, 0); fs.closeSync(fd);
    if (["cffaedfe", "cefaedfe", "7f454c46"].includes(b.toString("hex"))) return real;
  }
  return null;
}
const MCP = "mcp__plugin_context-mode_context-mode", TOOLS = ["Bash", "Read", "Grep", "Glob"];
function toolResultBytes(out) {
  const seen = new Set(); let bytes = 0, n = 0, res = null, calls = 0, ctxCalls = 0;
  for (const l of out.split("\n")) {
    if (!l.startsWith("{")) continue; let ev; try { ev = JSON.parse(l); } catch { continue; }
    if (ev.type === "result") res = ev;
    const content = ev.message?.content;
    if (!Array.isArray(content)) continue;
    for (const c of content) {
      if (ev.type === "assistant" && c.type === "tool_use") { calls++; if (String(c.name).startsWith("mcp__")) ctxCalls++; }
      if (ev.type === "user" && c.type === "tool_result" && !seen.has(c.tool_use_id)) {
        seen.add(c.tool_use_id); n++;
        if (typeof c.content === "string") bytes += Buffer.byteLength(c.content, "utf8");
        else if (Array.isArray(c.content)) for (const b of c.content) if (b && b.type === "text" && typeof b.text === "string") bytes += Buffer.byteLength(b.text, "utf8");
      }
    }
  }
  return { bytes, results: n, res, calls, ctxCalls };
}
function session(bin, env, task, arm, run) {
  return new Promise((resolve) => {
    const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "cm-score-")));
    initRepo(dir);
    const { prompt, expect } = task.build(dir);
    const armArgs = arm === "v2" ? ["--plugin-dir", path.join(ROOT, "release-out"), "--allowedTools", ...TOOLS, MCP] : ["--strict-mcp-config", "--allowedTools", ...TOOLS];
    const t0 = Date.now();
    // stdout goes to a file, not a pipe: claude can exit before a pipe with a large stream-json is flushed (cut result event).
    fs.mkdirSync(PRIV, { recursive: true });
    const outFile = path.join(PRIV, `saving-score-out-${process.pid}-${task.id}-${arm}-${run}.jsonl`);
    const fd = fs.openSync(outFile, "w");
    const p = spawnGroup(bin, ["-p", prompt, "--output-format", "stream-json", "--verbose", "--model", MODEL, "--effort", EFFORT, "--max-budget-usd", BUDGET,
      "--no-session-persistence", "--setting-sources", "project", ...armArgs], { cwd: dir, env, stdio: ["ignore", fd, "ignore"] });
    watchdog(p, TIMEOUT_MS);
    p.on("close", () => {
      fs.closeSync(fd);
      const out = fs.readFileSync(outFile, "utf8");
      const { bytes, results, res, calls, ctxCalls } = toolResultBytes(out);
      if (res) fs.rmSync(outFile, { force: true });
      const u = res?.usage ?? {}, text = normalize(res?.result ?? "");
      const ok = !!res && res.is_error !== true && expect.every((e) => text.includes(e));
      const key = createHash("sha256").update(fs.realpathSync.native(path.join(dir, ".git"))).digest("hex").slice(0, 16);
      fs.rmSync(path.join(os.homedir(), ".context-mode", "projects", key), { recursive: true, force: true });
      fs.rmSync(dir, { recursive: true, force: true });
      resolve({ task: task.id, arm, run, ok, subtype: res?.subtype ?? "none", resultBytes: bytes, results, calls, ctxCalls,
        tokens: (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0), cost: Number(res?.total_cost_usd ?? 0), ms: Date.now() - t0, answer: String(res?.result ?? "").slice(0, 160) });
    });
  });
}
async function live(runs) {
  const bin = realClaude(); if (!bin) throw new Error("no real claude binary");
  const version = spawnSync(bin, ["--version"], { encoding: "utf8" }).stdout.trim();
  const env = {};
  for (const k of ["PATH", "HOME", "USER", "LOGNAME", "SHELL", "TMPDIR", "LANG", "LC_ALL", "TERM"]) if (process.env[k]) env[k] = process.env[k];
  Object.assign(env, { ENABLE_CLAUDEAI_MCP_SERVERS: "false", CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1", CLAUDE_CODE_DISABLE_CLAUDE_MDS: "1" });
  const b = spawnSync("node", ["build/build.mjs", "--out", "release-out"], { cwd: ROOT, encoding: "utf8" });
  if (b.status !== 0) throw new Error("build failed: " + (b.stderr || "").trim().split("\n").pop());
  const t0 = Date.now();
  const jobs = [];
  const only = arg("only", null), pickTasks = only ? ALL_TASKS.filter((t) => only.split(",").includes(t.id)) : ALL_TASKS;
  for (let r = 1; r <= runs; r++) for (const t of pickTasks) for (const arm of ["off", "v2"]) jobs.push(session(bin, env, t, arm, r));
  const rows = await Promise.all(jobs);
  fs.mkdirSync(PRIV, { recursive: true });
  fs.writeFileSync(path.join(PRIV, "saving-score-rows.json"), JSON.stringify(rows));
  const armRows = (id, arm) => rows.filter((x) => x.task === id && x.arm === arm);
  const perTask = pickTasks.map((t) => {
    const off = armRows(t.id, "off"), v2 = armRows(t.id, "v2");
    const offB = median(off.map((x) => x.resultBytes)), v2B = median(v2.map((x) => x.resultBytes));
    return { task: t.id, inScore: SCORE_TASKS.some((s) => s.id === t.id), small: SMALL_TASKS.some((s) => s.id === t.id), offBytes: offB, v2Bytes: v2B,
      savingPct: round(offB ? (100 * (offB - v2B)) / offB : 0), passOff: off.filter((x) => x.ok).length, passV2: v2.filter((x) => x.ok).length, runs: off.length,
      v2CtxCalls: v2.reduce((s, x) => s + x.ctxCalls, 0) };
  });
  const score = perTask.filter((x) => x.inScore);
  const small = SMALL_TASKS.map((t) => t.id);
  const armSmall = (arm) => rows.filter((x) => x.arm === arm && small.includes(x.task));
  const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
  return {
    m2: median(score.map((x) => x.savingPct)),
    successOk: perTask.every((x) => x.passV2 >= x.passOff),
    smallMedianTokensV2: median(armSmall("v2").map((x) => x.tokens)),
    detail: { agent: version, model: MODEL, effort: EFFORT, budgetUsd: BUDGET, runs, perTask,
      medianSessionTokens: { off: median(armSmall("off").map((x) => x.tokens)), v2: median(armSmall("v2").map((x) => x.tokens)), tasks: small },
      passAll: { off: rows.filter((x) => x.arm === "off" && x.ok).length, v2: rows.filter((x) => x.arm === "v2" && x.ok).length, sessionsPerArm: rows.length / 2 },
      costUsd: { off: round(sum(rows.filter((x) => x.arm === "off"), (x) => x.cost), 4), v2: round(sum(rows.filter((x) => x.arm === "v2"), (x) => x.cost), 4) },
      seconds: Math.round((Date.now() - t0) / 1000) },
  };
}

// ---------- main ----------
const runs = Number(arg("runs", 2));
let g = null, off = null, lv = null;
if (!has("--skip-gate")) { err("gate"); g = gate(); }
const offP = has("--skip-offline") ? Promise.resolve(null) : (err("offline replay"), offline());
const lvP = has("--skip-live") ? Promise.resolve(null) : (err("live sessions"), live(runs));
[off, lv] = await Promise.all([offP, lvP]);

const guards = {
  success: lv ? lv.successOk : false,
  small1k: off ? off.small1kPct >= -1 : false,
  tokens: lv ? lv.smallMedianTokensV2 <= BASELINE_V2_SMALL_TOKENS * TOKENS_TOLERANCE : false,
  gate: g ? g.ok : false,
};
const guardsOk = Object.values(guards).every(Boolean);
const result = {
  m1: off ? round(off.m1) : null, m2: lv ? round(lv.m2) : null, guards, guardsOk,
  detail: { lockOk: lockOk(), targetPct: 90, baselineV2SmallTokens: BASELINE_V2_SMALL_TOKENS, tokensLimit: BASELINE_V2_SMALL_TOKENS * TOKENS_TOLERANCE,
    small1kPct: off ? off.small1kPct : null, gate: g, offline: off ? off.detail : null, live: lv ? lv.detail : null },
};
fs.writeFileSync(LAST, JSON.stringify({ date: new Date().toISOString().slice(0, 10), ...result }, null, 2) + "\n");
console.log(JSON.stringify(result));
