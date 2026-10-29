// D-NI-KIRO-GATE-1 live check. The real kiro-cli (V3 engine, 2.35.2) loads the hook file setup wrote and logs
// `hooks.reload.loaded {"read":N,"registered":N}` in ~/.kiro/logs/<run>/kiro.log. N must equal the number of entries in
// ~/.kiro/hooks/context-mode.json, so the host parsed every own entry. This proves LOAD, not FIRE: kiro needs a real login
// before its first model call (a fake KIRO_API_KEY stops at "could not load the available models"), and the loader also
// counts an "enabled": false entry as registered, so the enabled flag is covered by tests/v2/setup/kiro-gate.test.mjs.
// Skipped with a reason when no kiro-cli binary is found (KIRO_CLI_BIN, else `kiro-cli` on PATH).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { TOOL_ORDER } from "../../../src/core/contracts/constants.ts";
import { runSetup } from "../../../src/setup/index.ts";

const WIN = process.platform === "win32";
function findBin() {
  if (process.env.KIRO_CLI_BIN && existsSync(process.env.KIRO_CLI_BIN)) return process.env.KIRO_CLI_BIN;
  const r = spawnSync(WIN ? "where" : "which", ["kiro-cli"], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.split("\n")[0].trim() : undefined;
}
const BIN = findBin();
const LOADED = "hooks.reload.loaded ";
const WAIT_MS = 60000;

function fakePkg(root) {
  const dir = path.join(root, "pkg");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "server.mjs"), `
import { createInterface } from "node:readline";
const tools = ${JSON.stringify([...TOOL_ORDER])};
const rl = createInterface({ input: process.stdin });
rl.on("line", (l) => {
  const m = JSON.parse(l);
  if (m.id === undefined) return;
  const result = m.method === "initialize"
    ? { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "context-mode", version: "2.0.0" } }
    : { tools: tools.map((name) => ({ name, inputSchema: { type: "object" } })) };
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: m.id, result }) + "\\n");
});
`);
  writeFileSync(path.join(dir, "hook.mjs"), `let s = ""; process.stdin.on("data", (d) => { s += d; }); process.stdin.on("end", () => { const p = JSON.parse(s); if (!JSON.stringify(p).includes("context-mode-doctor-hook-runs")) return; process.stderr.write("deny: run ctx_execute; ctx_search( finds the rest\\n"); process.exit(2); });\n`);
  writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "context-mode", version: "2.0.0" }));
  const skills = path.join(import.meta.dirname, "..", "..", "..", "skills");
  for (const rel of ["skills", path.join("pi", "skills"), path.join("claude-code", "skills")]) cpSync(skills, path.join(dir, rel), { recursive: true });
  return dir;
}

function loadedLine(home) {
  const logs = path.join(home, ".kiro", "logs");
  if (!existsSync(logs)) return undefined;
  for (const run of readdirSync(logs)) {
    const log = path.join(logs, run, "kiro.log");
    if (!existsSync(log)) continue;
    const line = readFileSync(log, "utf8").split("\n").find((l) => l.includes(LOADED));
    if (line) return JSON.parse(JSON.parse(line).message.slice(LOADED.length));
  }
  return undefined;
}

test("[D-NI-KIRO-GATE-1] live: the real kiro V3 loader reads and registers every hook entry setup wrote",
  { skip: BIN === undefined && "kiro-cli binary not found (set KIRO_CLI_BIN or put kiro-cli on PATH)" }, async (t) => {
    const root = mkdtempSync(path.join(tmpdir(), "cm-kirofire-"));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const home = path.join(root, "home");
    const work = path.join(root, "work");
    mkdirSync(home, { recursive: true });
    mkdirSync(work, { recursive: true });
    const env = { PATH: process.env.PATH, HOME: home, USERPROFILE: home, CM_HOOK_OVERHEAD_BUDGET_MS: "60000" };
    const res = await runSetup({ home, pkgDir: fakePkg(root), env, agents: ["kiro"], runId: "kf1" });
    assert.equal(res.agents[0].status, "PASS", JSON.stringify(res.agents[0]));
    const want = JSON.parse(readFileSync(path.join(home, ".kiro", "hooks", "context-mode.json"), "utf8")).hooks.length;
    assert.ok(want >= 6, `setup wrote ${want} entries`);

    const child = spawn(BIN, ["chat", "--no-interactive", "--v3", "hi"], {
      cwd: work, stdio: "ignore",
      env: { ...process.env, HOME: home, USERPROFILE: home, KIRO_API_KEY: "ksk_fake", KIRO_DISABLE_TELEMETRY: "1" },
    });
    let got;
    const until = Date.now() + WAIT_MS;
    while (Date.now() < until && (got = loadedLine(home)) === undefined) await new Promise((r) => setTimeout(r, 500));
    child.kill();
    assert.ok(got, "kiro never logged hooks.reload.loaded");
    assert.deepEqual(got, { read: want, registered: want });
  });
