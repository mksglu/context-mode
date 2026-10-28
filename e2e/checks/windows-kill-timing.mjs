#!/usr/bin/env node
// e2e/checks/windows-kill-timing.mjs — info probe for T-F5 (D-TF5-TIMING-1). Not a gate: always exit 0.
// Question: when a tree kill is slow, is it the taskkill.exe call (start + run) or the wait until Windows drops the process?
// 30 runs: spawn a node child that spawns a node grandchild, then time `taskkill /F /T /PID <child>` (spawnSync, shell:false,
// the same call as src/core/sandbox/kill.ts) and poll tasklist every 20 ms until the grandchild PID is gone.
// Black box: imports nothing from src/ (GS4).
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

if (process.platform !== "win32") {
  console.log(JSON.stringify({ ok: true, result: "SKIPPED", reason: "windows only" }));
  process.exit(0);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const alive = (pid) => String(spawnSync("tasklist", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"], { encoding: "utf8", shell: false }).stdout).includes(`"${pid}"`);
const dir = mkdtempSync(path.join(tmpdir(), "cm-tf5-timing-"));
const rows = [];
for (let i = 0; i < 30; i++) {
  const pidFile = path.join(dir, `g${i}.pid`);
  const code = "const g = require('node:child_process').spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore', shell: false });" +
    "require('node:fs').writeFileSync(" + JSON.stringify(pidFile) + ", String(g.pid)); setInterval(() => {}, 1000);";
  const child = spawn(process.execPath, ["-e", code], { stdio: "ignore", shell: false, windowsHide: true });
  const t0 = Date.now();
  while ((!existsSync(pidFile) || readFileSync(pidFile, "utf8") === "") && Date.now() - t0 < 15000) await sleep(20);
  const gpid = Number(readFileSync(pidFile, "utf8"));
  const k0 = performance.now();
  spawnSync("taskkill", ["/F", "/T", "/PID", String(child.pid)], { stdio: "ignore", windowsHide: true, shell: false });
  const taskkillMs = Math.round(performance.now() - k0);
  while (alive(gpid) && performance.now() - k0 < 10000) await sleep(20);
  rows.push({ taskkillMs, goneAfterMs: Math.round(performance.now() - k0) });
}
const p = (k, q) => rows.map((r) => r[k]).sort((a, b) => a - b)[Math.min(rows.length - 1, Math.floor(rows.length * q))];
console.log(JSON.stringify({ ok: true, runs: rows.length, taskkillMs: { p50: p("taskkillMs", 0.5), max: p("taskkillMs", 1) }, goneAfterMs: { p50: p("goneAfterMs", 0.5), max: p("goneAfterMs", 1) }, rows }));
