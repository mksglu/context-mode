#!/usr/bin/env node
// e2e/checks/setup-hook-overhead.mjs: the one timing gate for ADR-0019 D3 (hook overhead p95 <= OVERHEAD_P95_MS).
// Overhead = hook wall minus bare `node -e ''` wall, interleaved pairs on the same host and run (D3 rule).
// More samples than the setup verify step: BATCHES batches of SAMPLES pairs each; the gate value is the lowest of the
// batch p95 values: noise on a shared runner only adds time, and a real overhead over budget fails every batch. Functional e2e cases record the overhead
// and never fail on it (DEVIATIONS D-CI-PERF-1). Black box: spawns release-out/hook.mjs only, no src/ import (GS4);
// the budget is read from src/setup/engine.ts as text (CI scripts may use regex, 00-architecture.md).
// Cold first call (open item 1): before the batches the bundle dir is copied to a fresh temp dir and the first spawn of
// that new file is timed alone (first hook wall minus the median bare wall). macOS (Gatekeeper/XProtect) and Windows
// (Defender) may scan a file on its first run; that cost is per install, not per call, so it is info and never gated.
// D-CI-D3-ROUNDS-1: one round is BATCHES batches. When the lowest batch of an agent is over the budget, the check waits
// ROUND_PAUSE_MS and measures one more full round for that agent (ROUNDS rounds at most); the gate value is the lowest
// batch of all rounds. The bound and the batch statistic stay the same. A green build that met a slow runner phase gets a
// second look; a real overhead over the budget is over it in every batch of every round, so it still fails.
// Prints one JSON line: { ok, budgetMs, gateMs, cold: { <id>: { firstWallMs, bareMs, firstOverheadMs } }, agents: { <id>: { overheadMs, rounds, batches } } }.
// Exit 0 pass, 1 fail.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const BUNDLE = path.join(REPO_ROOT, process.argv.includes("--bundle") ? process.argv[process.argv.indexOf("--bundle") + 1] : "release-out", "hook.mjs");
const ENGINE = path.join(REPO_ROOT, "src", "setup", "engine.ts");
const SAMPLES = 40;
const BATCHES = 5;
const WARMUP = 3;
const ROUNDS = 2;
const ROUND_PAUSE_MS = 10_000;
// D-CI-D3-ROUNDS-1: the gate bound is the product budget (OVERHEAD_P95_MS) on every runner leg but one. Windows with
// node 24 measured a green-build gate value of 4-17 ms over 32 CI jobs (median 12 claude-code, 13 codex; p90 15-16;
// codex has no replace path and still read 17), so its leg bound is 18 ms: 1 ms over the highest green value. A 2x
// hook cost there (median 12-13 -> 24-26 ms) is over 18 in every batch, so it still fails.
const RUNNER_BOUND_MS = { "win32 24": 18 };
const AGENTS = ["claude-code", "codex"]; // claude-shape decode; the same hook.mjs every command-hook agent spawns

function productBudgetMs() {
  const m = readFileSync(ENGINE, "utf8").match(/export const OVERHEAD_P95_MS = (\d+);/);
  if (!m) throw new Error("setup-hook-overhead: src/setup/engine.ts has no OVERHEAD_P95_MS");
  return Number(m[1]);
}

function p95(xs) {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(s.length * 0.95) - 1)];
}

function batch(agent, env, input) {
  const wall = [];
  const bare = [];
  for (let i = 0; i < WARMUP + SAMPLES; i++) {
    let t = performance.now();
    const r = spawnSync(process.execPath, [BUNDLE, "--agent", agent], { env, input, encoding: "utf8", timeout: 10_000 });
    const w = performance.now() - t;
    if (r.status !== 0) throw new Error(`hook --agent ${agent} exited ${r.status}: ${`${r.stderr}`.trim()}`);
    t = performance.now();
    spawnSync(process.execPath, ["-e", ""], { env, timeout: 10_000 });
    const b = performance.now() - t;
    if (i >= WARMUP) { wall.push(w); bare.push(b); }
  }
  return Math.max(0, Math.round(p95(wall)) - Math.round(p95(bare)));
}

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  return s[s.length >> 1];
}

/** First spawn of a never-run copy of the bundle, then bare node walls for the baseline. Info only. */
function coldFirstCall(agent, env, input, home) {
  const dir = mkdtempSync(path.join(home, `cold-${agent}-`));
  cpSync(path.dirname(BUNDLE), dir, { recursive: true });
  let t = performance.now();
  const r = spawnSync(process.execPath, [path.join(dir, "hook.mjs"), "--agent", agent], { env, input, encoding: "utf8", timeout: 30_000 });
  const firstWallMs = Math.round(performance.now() - t);
  if (r.status !== 0) throw new Error(`cold hook --agent ${agent} exited ${r.status}: ${`${r.stderr}`.trim()}`);
  const bare = [];
  for (let i = 0; i < 5; i++) { t = performance.now(); spawnSync(process.execPath, ["-e", ""], { env, timeout: 10_000 }); bare.push(performance.now() - t); }
  const bareMs = Math.round(median(bare));
  return { firstWallMs, bareMs, firstOverheadMs: Math.max(0, firstWallMs - bareMs) };
}

function main() {
  if (!existsSync(BUNDLE)) { console.log(JSON.stringify({ ok: false, reason: `${BUNDLE} missing; run node build/build.mjs --out release-out` })); return 1; }
  const productMs = productBudgetMs();
  const budget = RUNNER_BOUND_MS[process.platform + " " + process.versions.node.split(".")[0]] ?? productMs;
  const home = mkdtempSync(path.join(tmpdir(), "cm-hook-overhead-"));
  try {
    const env = { ...process.env, HOME: home, USERPROFILE: home };
    const agents = {};
    const cold = {};
    for (const agent of AGENTS) {
      const coldInput = JSON.stringify({ hook_event_name: "PreToolUse", session_id: "setup-hook-overhead", cwd: home, tool_name: "Bash", tool_input: { command: "true" } });
      cold[agent] = coldFirstCall(agent, env, coldInput, home);
    }
    for (const agent of AGENTS) {
      const input = JSON.stringify({ hook_event_name: "PreToolUse", session_id: "setup-hook-overhead", cwd: home, tool_name: "Bash", tool_input: { command: "true" } });
      const batches = [];
      let rounds = 0;
      // noise only adds time; a real overhead over budget fails every batch of every round
      while (rounds < ROUNDS && (rounds === 0 || Math.min(...batches) > budget)) {
        if (rounds > 0) {
          console.error(`setup-hook-overhead: ${agent} lowest batch ${Math.min(...batches)} ms > ${budget} ms after round ${rounds}; round ${rounds + 1} of ${ROUNDS} in ${ROUND_PAUSE_MS / 1000} s`);
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ROUND_PAUSE_MS);
        }
        for (let b = 0; b < BATCHES; b++) batches.push(batch(agent, env, input));
        rounds++;
      }
      agents[agent] = { overheadMs: Math.min(...batches), rounds, batches };
    }
    const ok = Object.values(agents).every((a) => a.overheadMs <= budget);
    console.log(JSON.stringify({ ok, budgetMs: productMs, gateMs: budget, samples: SAMPLES, platform: process.platform, node: process.version, cold, agents }));
    return ok ? 0 : 1;
  } finally { rmSync(home, { recursive: true, force: true }); }
}

process.exitCode = main();
