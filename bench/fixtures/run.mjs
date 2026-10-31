#!/usr/bin/env node
// bench/fixtures/run.mjs: short fixture benchmark in the layout of v1 BENCHMARK.md (origin/main).
// Plain Node, no deps, no network, no model calls. Starts the built v2 server (<bundle>/server.mjs) over
// MCP stdio and makes the real tools/call per v1 scenario; feeds each fixture through <bundle>/hook.mjs
// as a Claude Code PostToolUse Bash payload (golden shape e2e/fixtures/claude-code/2.1.303).
//   node bench/fixtures/run.mjs            run, write bench/fixtures/results.json
//   node bench/fixtures/run.mjs --check    run, fail on any scenario error or a part total off by > 5%
//   --bundle <dir>                         built bundle dir (default release-out; built if missing)
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { devVersionLabel } from "../../scripts/release/dev-version.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");
const DATA = path.join(HERE, "data");
const RESULTS = path.join(HERE, "results.json");
const GOLDEN = path.join(REPO, "e2e", "fixtures", "claude-code", "2.1.303", "PostToolUse-Bash-large.json");
const TOLERANCE = 0.05;
const argv = process.argv.slice(2);
const CHECK = argv.includes("--check");
const bi = argv.indexOf("--bundle");
const BUNDLE = path.resolve(REPO, bi >= 0 ? argv[bi + 1] : "release-out");
const bytes = (s) => Buffer.byteLength(s, "utf8");
const T0 = performance.now();

if (!existsSync(path.join(BUNDLE, "server.mjs"))) {
  execFileSync(process.execPath, [path.join(REPO, "build", "build.mjs"), "--out", BUNDLE], { cwd: REPO, stdio: "inherit" });
}
const scen = JSON.parse(readFileSync(path.join(HERE, "scenarios.json"), "utf8"));
const v1 = JSON.parse(readFileSync(path.join(HERE, "v1-baseline.json"), "utf8"));
const v1Row = (part, name) => v1.rows.find((r) => r.part === part && r.scenario === name);

// v1 ctx_execute_file injected FILE_CONTENT (v1 src/executor.ts). v2 ctx_execute with `file` sets CTX_FILE
// instead, so the same one-line prelude defines FILE_CONTENT; the v1 code string follows unchanged.
const PRELUDE = {
  javascript: 'const FILE_CONTENT = require("fs").readFileSync(process.env.CTX_FILE, "utf-8");\n',
  python: 'import os\nwith open(os.environ["CTX_FILE"], "r", encoding="utf-8") as _f:\n    FILE_CONTENT = _f.read()\n',
};

// part-2 input text, built the way v1 tests/live-benchmark.ts built it.
function part2Content(s) {
  if (s.fixture) return readFileSync(path.join(DATA, s.fixture), "utf8");
  if (s.concat) return s.concat.map((f) => readFileSync(path.join(DATA, f), "utf8") + s.sep).join("");
  return JSON.parse(readFileSync(path.join(DATA, s.mcpTools), "utf8")).map((t) => `### ${t.name}\n\n${t.description}`).join("\n\n---\n\n");
}
const fences = (t) => t.match(/```[\s\S]*?```/g) ?? [];
// Queries of one ctx_search reply that got at least one hit (v2 prints 'Query "<q>":' then the hits).
function queriesWithHits(text, queries) {
  if (text === undefined || text.startsWith("No hits")) return 0;
  const parts = text.split(/^Query ".*":$/m).slice(1);
  return Math.min(queries.length, parts.filter((p) => p.trim() !== "").length);
}

// Minimal newline-delimited JSON-RPC client (MCP stdio).
function mcp(bundle, env, cwd) {
  const child = spawn(process.execPath, [path.join(bundle, "server.mjs"), "--agent", "claude-code"], { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
  let buf = "", id = 0, err = "";
  const pending = new Map();
  child.stderr.on("data", (d) => { err += d; });
  child.stdout.on("data", (d) => {
    buf += d;
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
      if (line.trim() === "") continue;
      const msg = JSON.parse(line);
      if (msg.id !== undefined && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    }
  });
  child.once("exit", (c) => { for (const r of pending.values()) r({ error: { message: "server exited " + c + ": " + err.slice(-400) } }); pending.clear(); });
  const send = (o) => child.stdin.write(JSON.stringify(o) + "\n");
  return {
    request: (method, params) => new Promise((resolve) => { const i = ++id; pending.set(i, resolve); send({ jsonrpc: "2.0", id: i, method, params }); }),
    notify: (method, params) => send({ jsonrpc: "2.0", method, ...(params ? { params } : {}) }),
    close: () => new Promise((resolve) => { child.once("exit", resolve); child.stdin.end(); setTimeout(() => child.kill(), 2000); }),
  };
}
async function call(c, name, args) {
  const t = performance.now();
  const m = await c.request("tools/call", { name, arguments: args });
  const ms = performance.now() - t;
  if (m.error) return { error: m.error.message, ms };
  const text = (m.result.content ?? []).filter((p) => p.type === "text").map((p) => p.text).join("\n");
  return { text, isError: m.result.isError === true, ms };
}

// v2 hook path: one PostToolUse Bash payload per fixture, golden shape, the fixture as stdout.
const golden = JSON.parse(readFileSync(GOLDEN, "utf8"));
function hook(env, project, rel, text, n) {
  const payload = {
    ...golden, session_id: "bench-session", transcript_path: path.join(project, "transcript.jsonl"), cwd: project,
    tool_input: { command: "cat " + rel }, tool_response: { ...golden.tool_response, stdout: text },
    tool_use_id: "toolu_bench_" + String(n).padStart(2, "0"),
  };
  const t = performance.now();
  const r = spawnSync(process.execPath, [path.join(BUNDLE, "hook.mjs"), "--agent", "claude-code"], { cwd: project, env, input: JSON.stringify(payload), encoding: "utf8", timeout: 30000 });
  const ms = performance.now() - t;
  if (r.status !== 0) return { error: "hook exit " + r.status + ": " + (r.stderr ?? "").slice(-300), ms };
  if (r.stdout.trim() === "") return { seen: text, replaced: false, ms }; // allow: the model sees the raw stdout
  const out = JSON.parse(r.stdout).hookSpecificOutput?.updatedToolOutput;
  const seen = typeof out === "string" ? out : (out?.stdout ?? "") + (out?.stderr ?? "");
  return { seen, replaced: true, ms };
}

const tmp = realpathSync.native(mkdtempSync(path.join(tmpdir(), "cm-bench-fixtures-")));
const home = path.join(tmp, "home"), project = path.join(tmp, "project");
mkdirSync(home); mkdirSync(project);
cpSync(DATA, path.join(project, "data"), { recursive: true });
execFileSync("git", ["init", "-q", project]);
const env = { PATH: process.env.PATH ?? "", SystemRoot: process.env.SystemRoot ?? "", PATHEXT: process.env.PATHEXT ?? "", ComSpec: process.env.ComSpec ?? "", HOME: home, USERPROFILE: home, TMPDIR: tmp, TMP: tmp, TEMP: tmp, CLAUDE_PROJECT_DIR: project };

const rows = [];
try {
  const c = mcp(BUNDLE, env, project);
  const init = await c.request("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "bench-fixtures", version: "0" } });
  if (init.error) throw new Error("initialize: " + init.error.message);
  c.notify("notifications/initialized");
  let n = 0;
  // Part 1: v1 ctx_execute_file -> v2 ctx_execute with `file` (v2 has no ctx_execute_file).
  for (const s of scen.part1) {
    const raw = readFileSync(path.join(DATA, s.fixture), "utf8");
    const r = await call(c, "ctx_execute", { language: s.language, file: "data/" + s.fixture, code: PRELUDE[s.language] + s.code });
    const h = hook(env, project, "data/" + s.fixture, raw, ++n);
    rows.push({
      part: 1, scenario: s.name, source: s.tool, fixture: s.fixture, raw_bytes: bytes(raw),
      v1_context_bytes: v1Row(1, s.name)?.v1_context_bytes ?? null, v2_tool: "ctx_execute",
      v2_tool_context_bytes: r.text === undefined ? null : bytes(r.text), v2_hook_context_bytes: h.seen === undefined ? null : bytes(h.seen),
      v2_hook_replaced: h.replaced ?? null, v2_ms: Math.round(r.ms), v2_hook_ms: Math.round(h.ms), code_blocks: null,
      error: r.error ?? (r.isError ? "isError: " + r.text.slice(0, 200) : null) ?? h.error ?? null,
    });
  }
  // Part 2: v1 ContentStore.index + search(q, 1) per query -> v2 ctx_index {content, source} + one
  // ctx_search {queries, source} (v2 returns the whole first page per query; that page is what the model sees).
  for (const s of scen.part2) {
    const content = part2Content(s);
    const t = performance.now();
    const ix = await call(c, "ctx_index", { content, source: s.source });
    const se = await call(c, "ctx_search", { queries: s.queries, source: s.source });
    const ms = performance.now() - t;
    const blocks = fences(content);
    const intact = se.text === undefined ? 0 : blocks.filter((b) => se.text.includes(b)).length;
    const v1r = v1Row(2, s.scenario);
    const rel = s.fixture ? "data/" + s.fixture : s.concat ? "data/skills/references.md" : "data/" + s.mcpTools;
    const h = hook(env, project, rel, content, ++n);
    rows.push({
      part: 2, scenario: s.scenario, source: s.source, queries: s.queries, raw_bytes: bytes(content),
      v1_context_bytes: v1r?.v1_context_bytes ?? null, v2_tool: "ctx_index+ctx_search",
      v2_tool_context_bytes: se.text === undefined ? null : bytes(se.text), v2_hook_context_bytes: h.seen === undefined ? null : bytes(h.seen),
      v2_hook_replaced: h.replaced ?? null, v2_ms: Math.round(ms), v2_hook_ms: Math.round(h.ms),
      queries_with_hits: { v2: queriesWithHits(se.text, s.queries), v1: null, of: s.queries.length },
      code_blocks: { in_source: blocks.length, returned_whole_v2: intact, v1_code_chunks: v1r?.code_chunks ?? null, v1_exact_code_preserved: v1r?.exact_code_preserved ?? null },
      v2_index_reply: ix.text ?? null,
      error: ix.error ?? se.error ?? (ix.isError ? "ctx_index: " + ix.text : se.isError ? "ctx_search: " + se.text : null) ?? h.error ?? null,
    });
  }
  await c.close();
} finally {
  rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

const sum = (part, k) => rows.filter((r) => r.part === part).reduce((a, r) => a + (r[k] ?? 0), 0);
const totals = {};
for (const p of [1, 2]) {
  totals["part" + p] = { raw_bytes: sum(p, "raw_bytes"), v1_context_bytes: sum(p, "v1_context_bytes"), v2_tool_context_bytes: sum(p, "v2_tool_context_bytes"), v2_hook_context_bytes: sum(p, "v2_hook_context_bytes") };
}
const runMs = Math.round(performance.now() - T0);
let sha = null;
try { sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO, encoding: "utf8" }).trim(); } catch { /* not a git checkout */ }
const result = {
  date: new Date().toISOString().slice(0, 10),
  versions: { v1: v1.v1_version, v2: devVersionLabel(JSON.parse(readFileSync(path.join(REPO, "package.json"), "utf8")).version, null), node: process.version },
  shas: { v1: v1.v1_commit, v2: sha },
  v1_source: v1.note, run_ms: runMs, totals, rows,
};

for (const r of rows) {
  const pct = (x) => (x === null ? "  n/a" : (((1 - x / r.raw_bytes) * 100).toFixed(0) + "%").padStart(5));
  console.log(`p${r.part} ${r.scenario.padEnd(38)} raw ${String(r.raw_bytes).padStart(6)}  v1 ${String(r.v1_context_bytes).padStart(5)} ${pct(r.v1_context_bytes)}  v2 tool ${String(r.v2_tool_context_bytes).padStart(5)} ${pct(r.v2_tool_context_bytes)}  v2 hook ${String(r.v2_hook_context_bytes).padStart(6)} ${pct(r.v2_hook_context_bytes)}${r.error ? "  ERROR " + r.error : ""}`);
}
console.log("totals " + JSON.stringify(totals) + " run " + runMs + " ms");

const errors = rows.filter((r) => r.error);
if (CHECK) {
  const fails = errors.map((r) => "error: " + r.scenario + ": " + r.error);
  const old = JSON.parse(readFileSync(RESULTS, "utf8"));
  if (old.rows.length !== rows.length) fails.push("row count " + rows.length + " != " + old.rows.length);
  for (const [part, t] of Object.entries(totals)) {
    for (const k of ["v2_tool_context_bytes", "v2_hook_context_bytes"]) {
      const was = old.totals[part][k], now = t[k];
      if (Math.abs(now - was) > was * TOLERANCE) fails.push(`${part} ${k}: ${now} vs ${was} in results.json (> ${TOLERANCE * 100}%)`);
    }
  }
  if (fails.length) { console.error("check: FAIL\n" + fails.join("\n")); process.exit(1); }
  console.log("check: ok");
} else {
  if (errors.length) { console.error(errors.length + " scenario(s) errored; results.json not written"); process.exit(1); }
  writeFileSync(RESULTS, JSON.stringify(result, null, 2) + "\n");
  console.log("wrote " + path.relative(REPO, RESULTS));
}
