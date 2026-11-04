// bench/hook-gs6.mjs — GS6 hook budget bench (TECH-SPEC §1 GS6, DECISIONS-r9 V14, impl/14 §6 T-GS6).
// Spawns release-out/hook.mjs N times per event with Claude Code payloads in a temp git repo and a
// temp HOME, next to bare `node` with the same CPU probe, and prints one JSON line:
//   { p95Ms, bareP95Ms, cpuOverNodeMs, coldMs, pass, ... }
// p95Ms is the combined wall (spawn + hook body, HOOK_COMBINED_P95_MS); cpuOverNodeMs is the p95
// CPU of the hook minus the p95 CPU of bare Node (HOOK_CPU_OVER_NODE_MS). The CPU number comes from
// a preload that writes process.cpuUsage() to fd 3 on exit; bare Node runs with the same preload.
// Usage: node bench/hook-gs6.mjs [--runs 40] [--bundle release-out/hook.mjs]
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const RUNS = Number(arg("--runs", "40"));
const BUNDLE = path.resolve(ROOT, arg("--bundle", "release-out/hook.mjs"));
// Budgets mirror src/core/contracts/constants.ts (HOOK_COMBINED_P95_MS, HOOK_CPU_OVER_NODE_MS).
const COMBINED_P95_MS = 60;
const CPU_OVER_NODE_MS = 20;

if (!existsSync(BUNDLE)) {
  const b = spawnSync(process.execPath, [path.join(ROOT, "build/build.mjs"), "--out", path.join(ROOT, "release-out")], { stdio: "inherit" });
  if (b.status !== 0) process.exit(b.status ?? 1);
}

const work = mkdtempSync(path.join(tmpdir(), "cm-gs6-"));
const home = path.join(work, "home");
const repo = path.join(work, "repo");
const probe = path.join(work, "cpu-probe.mjs");
writeFileSync(probe, 'import { writeSync } from "node:fs";\nprocess.on("exit", () => { const u = process.cpuUsage(); try { writeSync(3, String((u.user + u.system) / 1000)); } catch {} });\n');
spawnSync("git", ["init", "-q", repo]);
const env = { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_PROJECT_DIR: repo };

const base = { session_id: "gs6", cwd: repo, transcript_path: path.join(work, "t.jsonl"), permission_mode: "default" };
const EVENTS = {
  // allow path: a plain native tool, no DB touch
  "PreToolUse:allow": { ...base, hook_event_name: "PreToolUse", tool_name: "Edit", tool_input: { file_path: path.join(repo, "a.txt"), old_string: "a", new_string: "b" } },
  // hint path: Bash hint, one meta write (throttle)
  "PreToolUse:hint": { ...base, hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "ls -la" } },
  // deny path: curl
  "PreToolUse:deny": { ...base, hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "curl https://example.com" } },
  "PostToolUse": { ...base, hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: { command: "echo hi" }, tool_response: { stdout: "hi", stderr: "", interrupted: false } },
  "UserPromptSubmit": { ...base, hook_event_name: "UserPromptSubmit", prompt: "hello" },
};

function once(args, payload) {
  return new Promise((resolve, reject) => {
    const t0 = process.hrtime.bigint();
    const c = spawn(process.execPath, ["--import", probe, ...args], { env, stdio: ["pipe", "ignore", "pipe", "pipe"] });
    let cpu = "";
    let err = "";
    c.stdio[3].on("data", (d) => { cpu += d; });
    c.stderr.on("data", (d) => { err += d; });
    c.on("error", reject);
    c.on("close", (code) => {
      const wall = Number(process.hrtime.bigint() - t0) / 1e6;
      if (code !== 0) return reject(new Error(`exit ${code}: ${err}`));
      if (err.trim() !== "") return reject(new Error(`stderr: ${err.trim()}`));
      resolve({ wall, cpu: Number(cpu) });
    });
    c.stdin.end(payload);
  });
}

const p95 = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil(0.95 * s.length) - 1)]; };
const r1 = (x) => Math.round(x * 10) / 10;

try {
  // Cold: the first call on a fresh project creates context.db.
  const cold = await once([BUNDLE, "--agent", "claude-code"], JSON.stringify(EVENTS["PreToolUse:hint"]));
  const bare = { wall: [], cpu: [] };
  const hook = { wall: [], cpu: [] };
  const perEvent = {};
  for (let i = 0; i < RUNS; i += 1) {
    const b = await once(["-e", ""], "");
    bare.wall.push(b.wall); bare.cpu.push(b.cpu);
    for (const [name, p] of Object.entries(EVENTS)) {
      const h = await once([BUNDLE, "--agent", "claude-code"], JSON.stringify(p));
      hook.wall.push(h.wall); hook.cpu.push(h.cpu);
      (perEvent[name] ??= []).push(h.wall);
    }
  }
  const out = {
    p95Ms: r1(p95(hook.wall)),
    bareP95Ms: r1(p95(bare.wall)),
    cpuP95Ms: r1(p95(hook.cpu)),
    bareCpuP95Ms: r1(p95(bare.cpu)),
    cpuOverNodeMs: r1(p95(hook.cpu) - p95(bare.cpu)),
    coldMs: r1(cold.wall),
    perEventP95Ms: Object.fromEntries(Object.entries(perEvent).map(([k, v]) => [k, r1(p95(v))])),
    runs: RUNS,
    node: process.version,
    platform: process.platform,
  };
  out.pass = out.p95Ms <= COMBINED_P95_MS && out.cpuOverNodeMs <= CPU_OVER_NODE_MS;
  console.log(JSON.stringify(out));
} finally {
  rmSync(work, { recursive: true, force: true });
}
