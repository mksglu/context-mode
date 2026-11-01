#!/usr/bin/env node
// e2e/checks/hook-budget.mjs — local check for live case e2e/live/cases/gs6-hook-budget.json (T-GS6).
// Docs: https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/review/DECISIONS-r9.md §V row V14 (200 calls per agent class); docs/architecture/modules/14-tests.md §6
// (T-GS6 row); docs/architecture/modules/09-hooks.md §5.3 "Wall-time budget (GS6)"; docs/architecture/adr/0008-enforcement-rewrite-
// and-cap.md "Hook budget (GS6) — decided".
//
// Two agent classes (09-hooks.md §5.3):
//   - Claude Code: wall p95 <= HOOK_P95_MS, measured end-to-end by hook-runner.mjs.
//   - Command-hook agents (every other spawn-based agent): CPU over bare Node p95 <= HOOK_CPU_OVER_NODE_MS,
//     and combined wall p95 <= HOOK_COMBINED_P95_MS.
// DEVIATIONS 2026-10-19 row 1: the docs name the class "command-hook agents", not one id. `codex` is the
// representative (claude-shape decode, same release-out/hook.mjs bundle every command-hook agent spawns);
// this file does not loop every such agent, since the budget is a property of the shared hook.mjs body and
// the spawn path, not of any one adapter's decode/encode.
//
// Wall timing for both classes spawns release-out/hook.mjs through e2e/harness/hook-runner.mjs (imports
// nothing from src/). DEVIATIONS 2026-10-19 row 2: CPU-over-bare-Node needs the child's CPU time;
// `child.resourceUsage()` is the documented Node API for that, but it returned no data in this task's dev
// sandbox on every Node tried (v22/v24/v26, same macOS host) — `resourceUsage` was not even a property of
// the ChildProcess instance after `exit`/`close`, on every version, suggesting the shell this bench runs
// under blocks the underlying wait/getrusage call rather than a Node version gap. The one path here is the
// POSIX `/usr/bin/time -p` wrapper (present on macOS and on the Ubuntu CI runners this repo targets),
// parsed for its `user`/`sys` lines; hook-runner.mjs itself is not touched (outside this task's file list).
//
// DEVIATIONS 2026-10-19 row 3: HOOK_P95_MS / HOOK_CPU_OVER_NODE_MS / HOOK_COMBINED_P95_MS are not written
// into any release-out/*.json by the build, and this file must neither import src/ nor redefine the
// numbers. The smallest rule meeting both: read the three `export const HOOK_*_MS = <n>;` lines out of
// src/core/contracts/constants.ts as plain text with a regex (e2e/ check code; 00-architecture.md line 9
// "CI scripts may use regex" — this is not src/ runtime code).
//
// Prints one JSON line to stdout (never throws): { ok, n, p95Ms, thresholds, classes }. Exit 0 pass, 1 fail.
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runHook } from "../harness/hook-runner.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const BUNDLE = path.join(REPO_ROOT, "release-out", "hook.mjs");
const CONSTANTS_FILE = path.join(REPO_ROOT, "src", "core", "contracts", "constants.ts");

const N = 200; // DECISIONS-r9 §V T-GS6: "200 calls per agent class"
const CC_AGENT = "claude-code";
const COMMAND_HOOK_AGENT = "codex";

const PAYLOAD = Object.freeze({
  hook_event_name: "PreToolUse",
  session_id: "hook-budget-bench",
  cwd: REPO_ROOT,
  tool_name: "Bash",
  tool_input: { command: "echo hook-budget-bench" },
});

function readThresholds() {
  const text = readFileSync(CONSTANTS_FILE, "utf8");
  const get = (name) => {
    const m = text.match(new RegExp(`export const ${name} = (\\d+);`));
    if (!m) throw new Error(`hook-budget: constants.ts has no ${name}`);
    return Number(m[1]);
  };
  return {
    HOOK_P95_MS: get("HOOK_P95_MS"),
    HOOK_CPU_OVER_NODE_MS: get("HOOK_CPU_OVER_NODE_MS"),
    HOOK_COMBINED_P95_MS: get("HOOK_COMBINED_P95_MS"),
  };
}

function p95(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1);
  return sorted[idx];
}

async function wallSamples(agent, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const r = await runHook(BUNDLE, { agent, event: "PreToolUse", payload: PAYLOAD });
    out.push(r.ms);
  }
  return out;
}

// CPU time (user+sys, ms) for one spawn of `cmd args`, via the POSIX `/usr/bin/time -p` wrapper (see file
// header DEVIATIONS row 2). `stdin` (a string) is written and closed so hook.mjs's own stdin read resolves.
function cpuMsSample(cmd, args, stdin) {
  return new Promise((resolve, reject) => {
    const child = spawn("/usr/bin/time", ["-p", cmd, ...args], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, LC_ALL: "C" },
    });
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", reject);
    child.on("exit", () => {
      const user = Number(stderr.match(/user ([\d.]+)/)?.[1] ?? NaN);
      const sys = Number(stderr.match(/sys ([\d.]+)/)?.[1] ?? NaN);
      if (Number.isNaN(user) || Number.isNaN(sys)) {
        return reject(new Error("hook-budget: could not parse /usr/bin/time output: " + JSON.stringify(stderr)));
      }
      resolve((user + sys) * 1000);
    });
    if (stdin !== undefined) child.stdin.write(stdin);
    child.stdin.end();
  });
}

async function series(n, fn) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(await fn());
  return out;
}

async function main() {
  const t = readThresholds();
  const payloadText = JSON.stringify(PAYLOAD);

  const ccWall = await wallSamples(CC_AGENT, N);
  const chWall = await wallSamples(COMMAND_HOOK_AGENT, N);
  const bareCpu = await series(N, () => cpuMsSample(process.execPath, ["-e", ""]));
  const chCpu = await series(N, () => cpuMsSample(process.execPath, [BUNDLE, "--agent", COMMAND_HOOK_AGENT], payloadText));

  const ccP95Wall = p95(ccWall);
  const chP95Wall = p95(chWall);
  const bareP95Cpu = p95(bareCpu);
  const chP95Cpu = p95(chCpu);
  const cpuOverNode = chP95Cpu - bareP95Cpu;

  const ccOk = ccP95Wall <= t.HOOK_P95_MS;
  const chWallOk = chP95Wall <= t.HOOK_COMBINED_P95_MS;
  const chCpuOk = cpuOverNode <= t.HOOK_CPU_OVER_NODE_MS;
  const ok = ccOk && chWallOk && chCpuOk;

  console.log(JSON.stringify({
    ok,
    n: N,
    p95Ms: { cc: ccP95Wall, commandHooks: chP95Wall },
    thresholds: t,
    classes: {
      cc: { agent: CC_AGENT, p95Ms: ccP95Wall, ok: ccOk },
      commandHooks: {
        agent: COMMAND_HOOK_AGENT,
        wallP95Ms: chP95Wall,
        wallOk: chWallOk,
        cpuOverNodeMs: cpuOverNode,
        cpuOk: chCpuOk,
        bareNodeCpuP95Ms: bareP95Cpu,
        hookCpuP95Ms: chP95Cpu,
      },
    },
  }));
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.log(JSON.stringify({ ok: false, reason: err.message }));
  console.error("hook-budget: " + err.message);
  process.exit(1);
});
