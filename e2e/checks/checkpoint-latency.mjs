#!/usr/bin/env node
// e2e/checks/checkpoint-latency.mjs — Viet report 1 (docs/v2/review/viet/README.md): ctx_stats / ctx_search after a
// ctx_index took ~1.45 s each on Windows, all inside PRAGMA wal_checkpoint(TRUNCATE).
// Black box: spawns release-out/server.mjs only; imports nothing from src/ (GS4).
// Method (the tester's): fresh temp HOME, empty project, `server.mjs --agent codex`, MCP initialize, then
// ctx_index, ctx_stats, ctx_stats, ctx_search, ctx_stats; every call timed.
// Modes: default = time the 5 calls and compare each to CALL_BUDGET_MS (judged on every OS).
//        --trace  = also load a --import patch that times only `PRAGMA wal_checkpoint(...)` on DatabaseSync.prototype.exec
//                   and prints the checkpoint kinds and ms. Info only, never gates.
//        --crash  = kill -9 the server right after ctx_index, then reopen and ctx_search must find the sentinel.
// Env CTX_LATENCY_BUDGET_MS overrides the budget only for a diagnostic run.
import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnBundle } from "../harness/mcp-client.mjs";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SERVER_BUNDLE = path.join(REPO_ROOT, "release-out", "server.mjs");
// Harness-local budget (not a runtime constant, D-M0-4); chosen from measured numbers, see DEVIATIONS D-CKPT-LAT-1.
const CALL_BUDGET_MS = Number(process.env.CTX_LATENCY_BUDGET_MS ?? 250);
const SENTINEL = "LATENCY_SENTINEL answer=731";
const argv = new Set(process.argv.slice(2));
const TRACE = argv.has("--trace");
const CRASH = argv.has("--crash");

if (!existsSync(SERVER_BUNDLE)) {
  console.log(JSON.stringify({ ok: false, error: "release-out/server.mjs missing, run node build/build.mjs --out release-out" }));
  process.exit(1);
}

const mk = (p) => realpathSync(mkdtempSync(path.join(tmpdir(), p)));
const HOME = mk("cm-ckpt-home-");
const PROJECT = mk("cm-ckpt-proj-");
const SCRATCH = mk("cm-ckpt-scratch-");
spawnSync("git", ["init", "-q", PROJECT], { shell: false });
const CODEX_HOME = path.join(HOME, ".codex");
const CLAUDE_CONFIG_DIR = path.join(HOME, ".claude");
mkdirSync(CODEX_HOME, { recursive: true });
mkdirSync(CLAUDE_CONFIG_DIR, { recursive: true });
const ENV = { ...process.env, HOME, USERPROFILE: HOME, CODEX_HOME, CLAUDE_CONFIG_DIR, CLAUDE_PROJECT_DIR: PROJECT };
delete ENV.NODE_OPTIONS;

let args = ["--agent", "codex"];
const traceFile = path.join(SCRATCH, "ckpt.log");
if (TRACE) {
  const tracer = path.join(SCRATCH, "trace.mjs");
  writeFileSync(
    tracer,
    [
      'import { DatabaseSync } from "node:sqlite";',
      'import { appendFileSync } from "node:fs";',
      "const orig = DatabaseSync.prototype.exec;",
      "DatabaseSync.prototype.exec = function (sql) {",
      '  if (typeof sql === "string" && sql.includes("wal_checkpoint")) {',
      "    const t = performance.now();",
      "    try { return orig.call(this, sql); } finally {",
      '      appendFileSync(' + JSON.stringify(traceFile) + ', sql.trim() + " ro=" + String(this.isOpen) + " " + (performance.now() - t).toFixed(2) + "\\n");',
      "    }",
      "  }",
      "  return orig.call(this, sql);",
      "};",
    ].join("\n"),
  );
  ENV.NODE_OPTIONS = "--import " + pathToFileURL(tracer).href;
}

function start() {
  const client = spawnBundle(SERVER_BUNDLE, ENV, args);
  return client;
}
const textOf = (r) => (r?.content ?? []).map((c) => c.text ?? "").join("\n");

const client = start();
await client.request("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "e2e", version: "0.0.0" } });
client.notify("notifications/initialized");

const steps = [
  ["ctx_index", { content: SENTINEL, source: "latency-source" }],
  ["ctx_stats", {}],
  ["ctx_stats", {}],
  ["ctx_search", { queries: ["LATENCY_SENTINEL"] }],
  ["ctx_stats", {}],
];
const rows = [];
let searchText = "";
for (const [name, a] of steps) {
  const t = performance.now();
  const r = await client.request("tools/call", { name, arguments: a });
  const ms = Number((performance.now() - t).toFixed(1));
  rows.push({ call: name, ms });
  if (name === "ctx_search") searchText = textOf(r);
  if (CRASH && name === "ctx_index") break;
}

let crash = null;
if (CRASH) {
  client.kill(); // SIGKILL / TerminateProcess right after ctx_index returned: no shutdown, no close checkpoint
  await new Promise((r) => setTimeout(r, 300));
  const again = start();
  await again.request("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "e2e", version: "0.0.0" } });
  again.notify("notifications/initialized");
  const r = await again.request("tools/call", { name: "ctx_search", arguments: { queries: ["LATENCY_SENTINEL"] } });
  crash = { found: textOf(r).includes("LATENCY_SENTINEL") };
  await again.close().catch(() => {});
} else {
  await client.close().catch(() => {});
}

const timed = rows.filter((r) => r.call !== "ctx_index");
const over = timed.filter((r) => r.ms > CALL_BUDGET_MS);
const found = CRASH ? crash.found : searchText.includes("LATENCY_SENTINEL");
const ok = over.length === 0 && found;
const checkpoints = TRACE && existsSync(traceFile) ? readFileSync(traceFile, "utf8").trim().split("\n") : undefined;
console.log(JSON.stringify({ ok, os: process.platform, node: process.version, budgetMs: CALL_BUDGET_MS, trace: TRACE, crash, rows, checkpoints, over: over.length, found }));
process.exit(ok ? 0 : 1);
