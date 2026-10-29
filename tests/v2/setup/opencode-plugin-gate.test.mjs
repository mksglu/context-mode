// D-HF-OPENCODE-GATE-1: OpenCode 1.19.5 loads every entry of the `plugin` list (config.plugin_origins) and skips an
// entry whose file is missing without an error, so hooks silently do not run. Two ways our hooks stop or double:
//  - a stale own path entry (the package moved or was upgraded): the file is gone, the hooks never run;
//  - the native entry `context-mode@next` (opencode plugin context-mode@next --global) plus our absolute path: the
//    plugin loads twice and every hook fires twice (two `prompt` rows per message in context.db).
// Setup keeps exactly one working entry; doctor FAILs hook-registered with a one-line fix when it is not so.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { TOOL_ORDER } from "../../../src/core/contracts/constants.ts";
import { generateManifests } from "../../../build/manifests.ts";
import { runDoctor, runRemove, runSetup } from "../../../src/setup/index.ts";

const REPO = path.resolve(import.meta.dirname, "../../..");
const SKILLS = ["ctx-doctor", "ctx-stats", "ctx-upgrade"];

function pkg(root) {
  const dir = path.join(root, "pkg");
  mkdirSync(path.join(dir, "opencode"), { recursive: true });
  writeFileSync(path.join(dir, "opencode", "plugin.js"), "export default {};\n");
  writeFileSync(path.join(dir, "server.mjs"), `
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
  writeFileSync(path.join(dir, "hook.mjs"), `let s = ""; process.stdin.on("data", (d) => { s += d; }); process.stdin.on("end", () => { const p = JSON.parse(s); if (!JSON.stringify(p).includes("context-mode-doctor-hook-runs")) return; const t = "deny: run ctx_execute; ctx_search( finds the rest"; process.stderr.write(t + "\\n"); process.stdout.write(JSON.stringify({ decision: "deny", reason: t })); });\n`);
  writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "context-mode", version: "2.0.0" }));
  generateManifests(dir);
  for (const s of SKILLS) cpSync(path.join(REPO, "skills", s), path.join(dir, "skills", s), { recursive: true });
  for (const s of SKILLS) cpSync(path.join(REPO, "skills", s), path.join(dir, "pi", "skills", s), { recursive: true });
  for (const s of SKILLS) cpSync(path.join(REPO, "skills", s), path.join(dir, "claude-code", "skills", s), { recursive: true });
  return dir;
}

function sandbox(t) {
  const root = mkdtempSync(path.join(tmpdir(), "cm-oc-gate-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, "home");
  const bin = path.join(root, "bin");
  mkdirSync(home, { recursive: true });
  mkdirSync(bin, { recursive: true });
  const win = process.platform === "win32" ? { SystemRoot: process.env.SystemRoot, ComSpec: process.env.ComSpec } : {};
  const file = path.join(home, ".config", "opencode", "opencode.json");
  return { root, home, file, pkgDir: pkg(root),
    env: { PATH: [bin, "/usr/bin", "/bin"].join(path.delimiter), HOME: home, USERPROFILE: home, CM_HOOK_OVERHEAD_BUDGET_MS: "60000", ...win } };
}

function put(s, doc) {
  mkdirSync(path.dirname(s.file), { recursive: true });
  writeFileSync(s.file, JSON.stringify(doc, null, 2) + "\n");
}
const plugins = (s) => JSON.parse(readFileSync(s.file, "utf8")).plugin;
const own = (s) => path.join(s.pkgDir, "opencode", "plugin.js");
const opts = (s) => ({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: ["opencode"] });
const registered = (d) => d.agents[0].checks.find((c) => c.name === "hook-registered");

test("native entry context-mode@next: setup adds no second plugin entry, doctor passes hook-registered", async (t) => {
  const s = sandbox(t);
  put(s, { plugin: ["context-mode@next"] });
  const res = await runSetup({ ...opts(s), runId: "a" });
  assert.equal(res.exitCode, 0, JSON.stringify(res.agents.map((a) => [a.id, a.status, a.reason])));
  assert.deepEqual(plugins(s), ["context-mode@next"], "one entry: the native one loads the hooks");
  const d = await runDoctor(opts(s));
  assert.equal(registered(d).ok, true, JSON.stringify(registered(d)));
});

test("native entry plus our path entry (loads twice): doctor FAILs hook-registered, setup drops our path entry only", async (t) => {
  const s = sandbox(t);
  put(s, { plugin: ["my-own-plugin", "context-mode@next", own(s)] });
  const d = await runDoctor(opts(s));
  const c = registered(d);
  assert.equal(c.ok, false, "two entries is a FAIL");
  assert.ok(c.detail.includes("twice") && c.detail.includes("context-mode setup"), c.detail);
  const res = await runSetup({ ...opts(s), runId: "b" });
  assert.equal(res.exitCode, 0, JSON.stringify(res.agents.map((a) => [a.id, a.status, a.reason])));
  assert.deepEqual(plugins(s), ["my-own-plugin", "context-mode@next"], "user entry and native entry kept");
  assert.equal(registered(await runDoctor(opts(s))).ok, true);
});

test("stale own path entry (the file is gone): doctor FAILs hook-registered, setup swaps it for the live path", async (t) => {
  const s = sandbox(t);
  const stale = path.join(s.root, "old-prefix", "node_modules", "context-mode", "opencode", "plugin.js");
  put(s, { plugin: ["my-own-plugin", stale] });
  const c = registered(await runDoctor(opts(s)));
  assert.equal(c.ok, false, "a missing plugin file never loads");
  assert.ok(c.detail.includes("missing") && c.detail.includes("context-mode setup"), c.detail);
  const res = await runSetup({ ...opts(s), runId: "c" });
  assert.equal(res.exitCode, 0, JSON.stringify(res.agents.map((a) => [a.id, a.status, a.reason])));
  assert.deepEqual(plugins(s), ["my-own-plugin", own(s)]);
  assert.equal(registered(await runDoctor(opts(s))).ok, true);
});

test("a user plugin that is a missing file but not ours is never touched", async (t) => {
  const s = sandbox(t);
  const theirs = path.join(s.root, "gone", "my-plugin.js");
  put(s, { plugin: [theirs] });
  await runSetup({ ...opts(s), runId: "d" });
  assert.deepEqual(plugins(s), [theirs, own(s)]);
});

test("remove after the native-entry setup restores the original bytes", async (t) => {
  const s = sandbox(t);
  put(s, { plugin: ["context-mode@next", own(s)] });
  const before = readFileSync(s.file, "utf8");
  const res = await runSetup({ ...opts(s), runId: "e" });
  assert.equal(res.exitCode, 0);
  assert.equal(runRemove({ home: s.home, env: s.env }).exitCode, 0);
  assert.equal(readFileSync(s.file, "utf8"), before);
});
