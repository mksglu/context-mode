#!/usr/bin/env node
// e2e/checks/hook-phase-profile.mjs: info-only profile of the claude-code hook path (owner rule: profile first).
// Viet round (Windows Claude Desktop): ctx_doctor D5 FAIL at 72 ms and 58 ms against 40 ms. D5 times the whole child
// wall, so this splits that wall: bare node start, node + one empty module, the hook bundle, per event, idle and under
// CPU load, through both spawn paths (spawnSync as D3 does, async spawn with 3 pipes as D5's runProcess does).
// Black box: spawns release-out/hook.mjs, no src/ import (GS4). Prints one JSON line. Never fails the build (exit 0).
// Phases inside one hook process come from performance.nodeTiming read at exit by a --require probe:
//   bootMs (node bootstrap done), loopStartMs (user code loaded and ran to the first loop turn), exitMs (process end).
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { cpus, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const BUNDLE = path.join(REPO_ROOT, "release-out", "hook.mjs");
const RUNS = Number(process.env.PROFILE_RUNS ?? 50);
const WARMUP = 3;

const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return +s[Math.min(s.length - 1, Math.ceil(s.length * p) - 1)].toFixed(1); };
const stat = (xs) => ({ p50: pct(xs, 0.5), p95: pct(xs, 0.95), n: xs.length });

async function main() {
  const home = mkdtempSync(path.join(tmpdir(), "cm-hook-profile-"));
  try {
    const repo = path.join(home, "repo");
    spawnSync("git", ["init", "-q", repo]);
    const env = { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_PROJECT_DIR: repo };
    const empty = path.join(home, "empty.mjs");
    writeFileSync(empty, "");
    const marks = path.join(home, "marks.jsonl");
    const probe = path.join(home, "probe.cjs");
    writeFileSync(probe, `process.on("exit",()=>{const t=performance.nodeTiming;require("node:fs").appendFileSync(${JSON.stringify(marks)},JSON.stringify({bootMs:t.bootstrapComplete,loopStartMs:t.loopStart,exitMs:performance.now()})+"\\n")});`);
    const ev = (name, extra = {}) => JSON.stringify({ hook_event_name: name, session_id: "profile", cwd: repo, tool_name: "Bash", tool_input: { command: "ls" }, tool_use_id: "t", ...extra });
    const pre = ev("PreToolUse");
    const post = ev("PostToolUse", { tool_response: { stdout: "x", stderr: "", interrupted: false } });
    const hookArgs = [BUNDLE, "--agent", "claude-code"];

    const syncWall = (args, input) => {
      const t = performance.now();
      const r = spawnSync(process.execPath, args, { env, input, cwd: repo, encoding: "utf8", windowsHide: true });
      const w = performance.now() - t;
      if (r.status !== 0) throw new Error(`exit ${r.status}: ${r.stderr}`);
      return w;
    };
    const asyncWall = (args, input) => new Promise((resolve) => {
      const t = performance.now();
      const c = spawn(process.execPath, args, { env, cwd: repo, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
      c.stdout.on("data", () => {});
      c.stderr.on("data", () => {});
      c.on("close", () => resolve(performance.now() - t));
      c.stdin.on("error", () => {});
      c.stdin.end(input);
    });

    const cases = [
      ["bare", ["-e", ""], ""],
      ["emptyModule", [empty], ""],
      ["pre", hookArgs, pre],
      ["post", hookArgs, post],
    ];

    const measure = async (label) => {
      const out = {};
      for (const [name, args, input] of cases) {
        for (let i = 0; i < WARMUP; i++) syncWall(args, input);
        const s = []; const a = [];
        for (let i = 0; i < RUNS; i++) { s.push(syncWall(args, input)); a.push(await asyncWall(args, input)); }
        out[name] = { sync: stat(s), async: stat(a) };
      }
      return { label, ...out };
    };

    const phases = (event) => {
      const input = event === "pre" ? pre : post;
      const probeArgs = ["--require", probe, ...hookArgs];
      for (let i = 0; i < WARMUP + RUNS; i++) syncWall(probeArgs, input);
      const rows = readFileSync(marks, "utf8").trim().split("\n").slice(WARMUP).map((l) => JSON.parse(l));
      rmSync(marks, { force: true });
      const col = (k) => stat(rows.map((r) => r[k]));
      return { bootMs: col("bootMs"), loopStartMs: col("loopStartMs"), exitMs: col("exitMs") };
    };

    const run = async () => {
      const idle = await measure("idle");
      const phasePre = phases("pre");
      const phasePost = phases("post");
      // Load: one busy child per core minus one, so the probe still gets a core but the machine is not idle (a host app and AV running).
      const busy = Array.from({ length: Math.max(1, cpus().length - 1) }, () => spawn(process.execPath, ["-e", "const e=Date.now()+600000;while(Date.now()<e);"], { stdio: "ignore", windowsHide: true }));
      let load;
      try { load = await measure("load"); } finally { for (const b of busy) b.kill(); }
      return { idle, load, phases: { pre: phasePre, post: phasePost } };
    };

    const r = await run();
    console.log(JSON.stringify({ platform: process.platform, node: process.version, cpus: cpus().length, bundleBytes: statSync(BUNDLE).size, runs: RUNS, ...r }));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

main().then(() => process.exit(0), (e) => { console.log(JSON.stringify({ ok: false, error: String(e) })); process.exit(0); });
