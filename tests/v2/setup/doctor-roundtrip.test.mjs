// tests/v2/setup/doctor-roundtrip.test.mjs
// Tester report, next.11 (codex-cli 0.156.1, fresh HOME): `setup --yes --agents codex` passes, then ctx_doctor says
// "D3 FAIL: wrong: MCP entry" and "D4 FAIL: old context-mode config.toml [mcp_servers.context-mode*] section".
// Setup and doctor must agree on the MCP entry setup writes (D-DOC-RT-1), and D4 must tell a v1 section from ours.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { TOOL_ORDER } from "../../../src/core/contracts/constants.ts";
import { getAdapter } from "../../../src/adapters/table.ts";
import { generateManifests } from "../../../build/manifests.ts";
import { checkHostConfig, checkV1Leftovers } from "../../../src/core/ops/doctor-config.ts";
import { runSetup } from "../../../src/setup/index.ts";

const REPO = path.resolve(import.meta.dirname, "../../..");
const SKILLS = ["ctx-doctor", "ctx-stats", "ctx-upgrade"];
const HOSTS = ["claude-code", "codex", "copilot-cli", "gemini", "kiro", "opencode", "pi", "qwen", "vscode", "zcode"];
const FILE_HOSTS = ["codex", "copilot-cli", "kiro", "opencode", "vscode", "zcode"]; // setup runs for these
const ENTRY_HOSTS = ["codex", "kiro", "opencode", "vscode", "zcode"]; // setup writes the MCP/plugin entry into a host config file (copilot-cli: the entry ships in the plugin manifest)

function sandbox(t) {
  const root = mkdtempSync(path.join(tmpdir(), "cm-doc-rt-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, "home");
  const bin = path.join(root, "bin");
  const pkgDir = path.join(root, "prefix", "lib", "node_modules", "context-mode");
  for (const d of [home, bin, pkgDir]) mkdirSync(d, { recursive: true });
  writeFileSync(path.join(pkgDir, "server.mjs"), `
import { createInterface } from "node:readline";
const tools = ${JSON.stringify([...TOOL_ORDER])};
createInterface({ input: process.stdin }).on("line", (l) => {
  const m = JSON.parse(l);
  if (m.id === undefined) return;
  const result = m.method === "initialize"
    ? { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "context-mode", version: "2.0.0" } }
    : { tools: tools.map((name) => ({ name, inputSchema: { type: "object" } })) };
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: m.id, result }) + "\\n");
});
`);
  writeFileSync(path.join(pkgDir, "hook.mjs"), `let s = ""; process.stdin.on("data", (d) => { s += d; }); process.stdin.on("end", () => { const p = JSON.parse(s); if (!JSON.stringify(p).includes("context-mode-doctor-hook-runs")) return; const t = "deny: run ctx_execute; ctx_search( finds the rest"; process.stderr.write(t + "\\n"); process.stdout.write(JSON.stringify({ decision: "deny", reason: t })); });\n`);
  writeFileSync(path.join(pkgDir, "package.json"), JSON.stringify({ name: "context-mode", version: "2.0.0" }));
  generateManifests(pkgDir);
  for (const dir of ["skills", "pi/skills", "claude-code/skills"]) for (const s of SKILLS) cpSync(path.join(REPO, "skills", s), path.join(pkgDir, dir, s), { recursive: true });
  if (process.platform === "win32") writeFileSync(path.join(bin, "copilot.cmd"), "@echo context-mode\r\n");
  else writeFileSync(path.join(bin, "copilot"), "#!/bin/sh\necho context-mode\n", { mode: 0o755 });
  const win = process.platform === "win32" ? { SystemRoot: process.env.SystemRoot, ComSpec: process.env.ComSpec } : {};
  const env = { PATH: [bin, "/usr/bin", "/bin"].join(path.delimiter), HOME: home, USERPROFILE: home, CM_HOOK_OVERHEAD_BUDGET_MS: "60000", ...win };
  return { root, home, pkgDir, env, tmp: path.join(root, "tmp") };
}

// The doctor runs inside the server: process.argv[1] is the bundle the host launched.
async function asServer(pkgDir, fn) {
  const was = process.argv[1];
  process.argv[1] = path.join(pkgDir, "server.mjs");
  try { return await fn(); } finally { process.argv[1] = was; }
}

const d3Parts = (row) => row.detail.split(":")[0] === "wrong" ? row.detail.replace("wrong: ", "").split(", ") : [];

test("[D-DOC-RT-1] codex: setup --yes --agents codex, then D3 and D4 PASS on a fresh HOME", async (t) => {
  const s = sandbox(t);
  mkdirSync(s.tmp, { recursive: true });
  const res = await runSetup({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: ["codex"], runId: "r1" });
  assert.equal(res.exitCode, 0, JSON.stringify(res.agents));
  const row = getAdapter("codex");
  const d3 = await asServer(s.pkgDir, () => checkHostConfig(row, s.env, s.home));
  assert.deepEqual([d3.status, d3.detail], ["PASS", "ok"]);
  const d4 = checkV1Leftovers("codex", s.home, { tmp: s.tmp });
  assert.deepEqual([d4.status, d4.detail], ["PASS", "ok"]);
});

test("[D-DOC-RT-1] codex: the same round trip with CODEX_HOME set (D3 and D4 read the Codex dir setup wrote)", async (t) => {
  const s = sandbox(t);
  mkdirSync(s.tmp, { recursive: true });
  const env = { ...s.env, CODEX_HOME: path.join(s.root, "codex-home") };
  const res = await runSetup({ home: s.home, pkgDir: s.pkgDir, env, agents: ["codex"], runId: "r1" });
  assert.equal(res.exitCode, 0, JSON.stringify(res.agents));
  const d3 = await asServer(s.pkgDir, () => checkHostConfig(getAdapter("codex"), env, s.home));
  assert.deepEqual([d3.status, d3.detail], ["PASS", "ok"]);
  // v1 left a section in the Codex dir that CODEX_HOME names: D4 must look there, not only in ~/.codex.
  writeFileSync(path.join(env.CODEX_HOME, "config.toml"), readFileSync(path.join(env.CODEX_HOME, "config.toml"), "utf8") + '\n[mcp_servers.context-mode.tools.ctx_execute]\napproval_mode = "approve"\n');
  assert.match(checkV1Leftovers("codex", s.home, { tmp: s.tmp, codexDir: env.CODEX_HOME }).detail, /config\.toml/);
});

// The real v1 1.0.169 file (package/configs/codex/config.toml) and its tool tables (Codex adapter removes
// mcp_servers.context-mode and mcp_servers.context-mode.tools.*).
const V1_TOML = '[features]\nhooks = true\n\n[mcp_servers.context-mode]\ncommand = "context-mode"\n\n[mcp_servers.context-mode.tools.ctx_execute]\napproval_mode = "approve"\n';

test("[D-DOC-RT-1] D4 still flags a real v1 1.0.169 codex section, and only that", (t) => {
  const s = sandbox(t);
  mkdirSync(s.tmp, { recursive: true });
  const file = path.join(s.home, ".codex", "config.toml");
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, V1_TOML);
  const d4 = checkV1Leftovers("codex", s.home, { tmp: s.tmp });
  assert.equal(d4.status, "FAIL");
  assert.match(d4.detail, /\[mcp_servers\.context-mode\*\]/);
});

test("[D-DOC-RT-1] D4 does not flag a v2 table, a v2 table with tool tables of other servers, or a sibling server named context-mode-x", (t) => {
  const s = sandbox(t);
  mkdirSync(s.tmp, { recursive: true });
  const file = path.join(s.home, ".codex", "config.toml");
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, '[mcp_servers.context-mode]\ncommand = "/usr/bin/node"\nargs = ["/p/server.mjs", "--agent", "codex"]\n\n[mcp_servers.context-mode-other]\ncommand = "x"\n');
  assert.equal(checkV1Leftovers("codex", s.home, { tmp: s.tmp }).status, "PASS");
});

test("[D-DOC-RT-1] all 10 hosts: after setup, D4 is clean and D3 names no MCP entry for a host whose entry setup wrote", async (t) => {
  const s = sandbox(t);
  mkdirSync(s.tmp, { recursive: true });
  const res = await runSetup({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: FILE_HOSTS, runId: "r1" });
  assert.equal(res.exitCode, 0, JSON.stringify(res.agents.map((a) => [a.id, a.status, a.reason])));
  const project = path.join(s.root, "project");
  mkdirSync(project, { recursive: true });
  const bad = [];
  for (const id of HOSTS) {
    const row = getAdapter(id);
    const d4 = checkV1Leftovers(id, s.home, { tmp: s.tmp, project });
    if (d4.status !== "PASS") bad.push(`${id} D4 ${d4.detail}`);
    if (!ENTRY_HOSTS.includes(id)) continue; // claude-code, gemini, qwen, copilot-cli, pi: the host's own CLI installs the entry, D4 only
    const d3 = await asServer(s.pkgDir, () => checkHostConfig(row, s.env, project));
    if (d3Parts(d3).includes("MCP entry")) bad.push(`${id} D3 ${d3.detail}`);
  }
  assert.deepEqual(bad, []);
});
