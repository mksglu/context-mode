// bench/m2/eval.mjs - frozen M2 eval over a built release-out, on the main or the heldout set.
// Usage: node bench/m2/eval.mjs --set main|heldout --release-out <dir> [--runs 3] [--work <dir>] [--keep <dir>]
//   [--credentials <file>] [--concurrency 6] [--only id,id]
// One JSON line on stdout: { set, score, perTask, perTool, invalid, agent, model, ... }.
// M2 per workload = median over v2 runs of 100 * (offRef - v2Bytes) / offRef, where bytes = UTF-8 bytes of
// tool_result content the model saw (stream-json) and offRef = median bytes of the passing off runs (no plugin).
// Oracle gate: a v2 run that fails the task oracle counts min(0, saving). Score = median over workloads.
// Live isolation (ADR-0012): real claude binary, a fresh CLAUDE_CONFIG_DIR and HOME per session with only the
// login credential copied (no API key), ENABLE_CLAUDEAI_MCP_SERVERS=false, CLAUDE_CODE_DISABLE_AUTO_MEMORY=1,
// CLAUDE_CODE_DISABLE_CLAUDE_MDS=1, explicit --model, stdin closed, --max-budget-usd 1.
// Arm off: --strict-mcp-config, no plugin. Arm v2: --plugin-dir <release-out>; --strict-mcp-config is not
// passed there because Claude Code 2.1.303 then drops the plugin MCP server (the fresh config dir isolates instead).
import { spawn, spawnSync, execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { parseTranscript, oracle, scoreRows } from "./score.mjs";

const MODEL = "claude-sonnet-5-5", EFFORT = "low", BUDGET = "1", TIMEOUT_MS = 300000;
const CTX = "mcp__plugin_context-mode_context-mode";
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf("--" + n); return i < 0 ? d : argv[i + 1]; };
const err = (...a) => console.error("[m2-eval]", ...a);
const fail = (m) => { console.error("[m2-eval] FAIL " + m); process.exit(2); };

const set = arg("set", "main");
if (!["main", "heldout"].includes(set)) fail("--set must be main or heldout");
const releaseOut = path.resolve(arg("release-out", "release-out"));
if (!fs.existsSync(path.join(releaseOut, ".claude-plugin", "plugin.json"))) fail("no built release-out at " + releaseOut);
const runs = Number(arg("runs", 3)), conc = Number(arg("concurrency", 6));
const work = fs.realpathSync.native(fs.mkdtempSync(path.join(path.resolve(arg("work", os.tmpdir())), "m2-")));
const keep = arg("keep", null);
const { TASKS } = await import(`./${set}/tasks.mjs`);
const only = arg("only", null), tasks = only ? TASKS.filter((t) => only.split(",").includes(t.id)) : TASKS;

function realClaude() {
  for (const d of (process.env.PATH || "").split(":")) {
    const c = path.join(d, "claude"); if (!fs.existsSync(c)) continue;
    const real = fs.realpathSync(c), b = Buffer.alloc(4), fd = fs.openSync(real, "r"); fs.readSync(fd, b, 0, 4, 0); fs.closeSync(fd);
    if (["cffaedfe", "cefaedfe", "7f454c46"].includes(b.toString("hex"))) return real;
  }
  return null;
}
function credential() {
  const f = arg("credentials", null);
  if (f) return fs.readFileSync(f, "utf8");
  if (process.platform === "darwin") {
    const r = spawnSync("security", ["find-generic-password", "-s", "Claude Code-credentials", "-w"], { encoding: "utf8" });
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim();
  }
  const def = path.join(os.homedir(), ".claude", ".credentials.json");
  if (fs.existsSync(def)) return fs.readFileSync(def, "utf8");
  fail("no login credential (pass --credentials <file>)");
}
const bin = realClaude(); if (!bin) fail("no real claude binary on PATH");
const agent = spawnSync(bin, ["--version"], { encoding: "utf8" }).stdout.trim();
const cred = credential();

// Local HTTP server for workloads with http: true (paths are per session).
const pages = new Map();
const server = http.createServer((q, s) => { const b = pages.get(q.url); if (b === undefined) { s.statusCode = 404; return s.end(); } s.setHeader("content-type", "text/html"); s.end(b); });
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

function session(task, arm, run) {
  return new Promise((resolve) => {
    const root = path.join(work, `${task.id}-${arm}-${run}`), dir = path.join(root, "repo"), cfg = path.join(root, "cfg"), home = path.join(root, "home");
    for (const d of [dir, cfg, home]) fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(cfg, ".credentials.json"), cred, { mode: 0o600 });
    execFileSync("git", ["init", "-q", dir]); execFileSync("git", ["-C", dir, "config", "commit.gpgsign", "false"]);
    const prefix = `/${task.id}-${arm}-${run}`;
    const { prompt, expect } = task.build(dir, { url: base + prefix, serve: (p, body) => pages.set(prefix + p, body) });
    const tools = task.tools ?? ["Bash", "Read", "Grep", "Glob"];
    const args = ["-p", prompt, "--output-format", "stream-json", "--verbose", "--include-hook-events", "--model", MODEL, "--effort", EFFORT,
      "--max-budget-usd", BUDGET, "--no-session-persistence", "--setting-sources", "project"];
    if (task.mcp) {
      const servers = Object.fromEntries(Object.entries(task.mcp).map(([k, v]) => [k, { type: "stdio", command: v.command, args: v.args.map((a) => path.join(dir, a)) }]));
      fs.writeFileSync(path.join(root, "mcp.json"), JSON.stringify({ mcpServers: servers }));
      args.push("--mcp-config", path.join(root, "mcp.json"));
    }
    if (arm === "v2") args.push("--plugin-dir", releaseOut, "--allowedTools", ...tools, CTX);
    else args.push("--strict-mcp-config", "--allowedTools", ...tools);
    const env = { PATH: process.env.PATH, HOME: home, USER: process.env.USER ?? "u", TMPDIR: root + "/", LANG: "en_US.UTF-8",
      CLAUDE_CONFIG_DIR: cfg, ENABLE_CLAUDEAI_MCP_SERVERS: "false", CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1", CLAUDE_CODE_DISABLE_CLAUDE_MDS: "1" };
    const outFile = path.join(root, "transcript.jsonl"), fd = fs.openSync(outFile, "w");
    const t0 = Date.now();
    const p = spawn(bin, args, { cwd: dir, env, stdio: ["ignore", fd, "ignore"] });
    const kill = setTimeout(() => p.kill("SIGKILL"), TIMEOUT_MS);
    p.on("close", () => {
      clearTimeout(kill); fs.closeSync(fd);
      const text = fs.readFileSync(outFile, "utf8"), t = parseTranscript(text);
      if (keep) { fs.mkdirSync(keep, { recursive: true }); fs.copyFileSync(outFile, path.join(keep, `${set}-${task.id}-${arm}-${run}.jsonl`)); }
      fs.rmSync(root, { recursive: true, force: true });
      resolve({ task: task.id, arm, run, ok: oracle(t.res, expect), bytes: t.bytes, perTool: t.perTool, hookBytes: t.hookBytes, calls: t.calls,
        subtype: t.res?.subtype ?? "none", cost: Number(t.res?.total_cost_usd ?? 0), ms: Date.now() - t0 });
    });
  });
}

const jobs = [];
for (let r = 1; r <= runs; r++) for (const t of tasks) for (const arm of ["off", "v2"]) jobs.push([t, arm, r]);
const rows = []; let next = 0;
await Promise.all(Array.from({ length: Math.min(conc, jobs.length) }, async () => {
  while (next < jobs.length) { const j = jobs[next++]; const row = await session(...j); rows.push(row); err(`${row.task} ${row.arm} ${row.run} ok=${row.ok} bytes=${row.bytes} $${row.cost.toFixed(3)}`); }
}));
server.close();
fs.rmSync(work, { recursive: true, force: true });

const s = scoreRows(rows, tasks.map((t) => t.id));
// Per workload and tool: median bytes per arm (bytes in = off arm, bytes the model saw = v2 arm).
const perTool = {};
for (const t of tasks) for (const arm of ["off", "v2"]) {
  const rs = rows.filter((x) => x.task === t.id && x.arm === arm);
  const names = new Set(rs.flatMap((x) => Object.keys(x.perTool)));
  for (const n of names) {
    const v = rs.map((x) => x.perTool[n]?.bytes ?? 0).sort((a, b) => a - b);
    ((perTool[t.id] ??= {})[n] ??= {})[arm] = v[v.length >> 1];
  }
}
const hookBytes = Object.fromEntries(tasks.map((t) => [t.id, rows.filter((x) => x.task === t.id && x.arm === "v2").map((x) => x.hookBytes)]));
const cost = (arm) => +rows.filter((x) => x.arm === arm).reduce((a, x) => a + x.cost, 0).toFixed(4);
console.log(JSON.stringify({ set, score: s.score, perTask: s.perTask, invalid: s.invalid, perTool, v2HookContextBytes: hookBytes,
  agent, model: MODEL, effort: EFFORT, budgetUsd: BUDGET, runs, costUsd: { off: cost("off"), v2: cost("v2") } }));
