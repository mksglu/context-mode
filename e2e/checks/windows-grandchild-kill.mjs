#!/usr/bin/env node
// e2e/checks/windows-grandchild-kill.mjs — local check for live case e2e/live/cases/windows-grandchild-kill.json (T-F5).
// Docs: DECISIONS-r9 F5 + row T-F5, docs/v2/impl/03-sandbox.md §4 E2E case, 00-architecture A6
// (taskkill /F /T /PID, shell:false, no Job Object), impl/14 §6 (kind local, Windows only).
// Black box: spawns release-out/server.mjs only; imports nothing from src/ (GS4).
// Windows: 10 runs. Each run: ctx_execute runs a JavaScript child that spawns a grandchild direct
// (no cmd.exe between) and writes the grandchild PID to a file; the check sends
// notifications/cancelled, waits KILL_GRACE_MS, then asks `tasklist /FI "PID eq <pid>"`.
// Other platforms: prints a SKIPPED JSON line and exits 0.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnBundle } from "../harness/mcp-client.mjs";

const RUNS = 10;
// Harness-local wait for the child to write the grandchild PID (not a runtime constant, D-M0-4).
const PID_WAIT_MS = 15000;
// Harness-local diagnostic poll after a failed run (not a runtime constant, D-M0-4).
const LATE_POLL_MS = 8000;

if (process.platform !== "win32") {
  console.log(JSON.stringify({ ok: true, result: "SKIPPED", reason: "windows only" }));
  process.exit(0);
}

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SERVER_BUNDLE = path.join(REPO_ROOT, "release-out", "server.mjs");

// KILL_GRACE_MS lives only in src/core/contracts/constants.ts; read it as text (no src import, D-M7-B1-1).
const text = readFileSync(path.join(REPO_ROOT, "src", "core", "contracts", "constants.ts"), "utf8");
const key = "export const KILL_GRACE_MS = ";
const at = text.indexOf(key);
const graceMs = at < 0 ? NaN : Number(text.slice(at + key.length, text.indexOf(";", at)));
if (!Number.isFinite(graceMs)) {
  console.log(JSON.stringify({ ok: false, error: "KILL_GRACE_MS not found" }));
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// tasklist CSV row starts with "<image>","<pid>"; "INFO: No tasks ..." when the PID is gone.
function alive(pid) {
  const r = spawnSync("tasklist", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"], { encoding: "utf8", shell: false });
  return String(r.stdout).includes(`"${pid}"`);
}

const PROJECT = realpathSync(mkdtempSync(path.join(tmpdir(), "cm-tf5-proj-")));
spawnSync("git", ["init", "-q", PROJECT], { shell: false });
const HOME = realpathSync(mkdtempSync(path.join(tmpdir(), "cm-tf5-home-")));
const ENV = { ...process.env, HOME, USERPROFILE: HOME, CLAUDE_PROJECT_DIR: PROJECT };

const results = [];
for (let i = 0; i < RUNS; i++) {
  const pidFile = path.join(PROJECT, `grandchild-${i}.pid`);
  const code =
    "const { spawn } = require('node:child_process');" +
    "const g = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore', shell: false });" +
    "require('node:fs').writeFileSync(" + JSON.stringify(pidFile) + ", String(g.pid));" +
    "setInterval(() => {}, 1000);";
  const client = spawnBundle(SERVER_BUNDLE, ENV);
  await client.request("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "e2e", version: "0.0.0" } });
  client.request("tools/call", { name: "ctx_execute", arguments: { language: "javascript", code } }).catch(() => {});
  const start = Date.now();
  while (!existsSync(pidFile) || readFileSync(pidFile, "utf8") === "") {
    if (Date.now() - start > PID_WAIT_MS) break;
    await sleep(50);
  }
  const gpid = existsSync(pidFile) ? Number(readFileSync(pidFile, "utf8")) : NaN;
  client.notify("notifications/cancelled", { requestId: 2 }); // id 1 = initialize, id 2 = this tools/call
  await sleep(graceMs);
  const left = Number.isInteger(gpid) && gpid > 0 ? alive(gpid) : null;
  // Diagnosis only (the pass rule above is unchanged): a grandchild still alive at KILL_GRACE_MS is polled for
  // up to LATE_POLL_MS. `diedAfterMs` set = the tree kill was only slow; null = it never reached the grandchild.
  let diedAfterMs = null;
  if (left) {
    const t0 = Date.now();
    while (Date.now() - t0 < LATE_POLL_MS) {
      await sleep(100);
      if (!alive(gpid)) { diedAfterMs = graceMs + (Date.now() - t0); break; }
    }
  }
  results.push(left ? { run: i + 1, gpid, alive: left, diedAfterMs } : { run: i + 1, gpid, alive: left });
  if (left && diedAfterMs === null) spawnSync("taskkill", ["/F", "/PID", String(gpid)], { shell: false });
  await client.close();
}

const aliveCount = results.filter((r) => r.alive === true).length;
const noPid = results.filter((r) => r.alive === null).length;
const ok = aliveCount === 0 && noPid === 0;
console.log(JSON.stringify({ ok, runs: RUNS, alive: aliveCount, noPid, graceMs, results }));
process.exit(ok ? 0 : 1);
