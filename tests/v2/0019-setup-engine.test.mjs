// tests/v2/0019-setup-engine.test.mjs
// Area: ADR-0019 (interactive setup, npm channel), ADR-0023, PRD-setup.
// One file per ADR area (ADR-0024). A new setup test goes into the describe block of its section.
import { describe, test } from "node:test";
import { CONC } from "./_lib/concurrency.mjs";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import ts from "typescript";
import { ADAPTERS } from "../../src/adapters/table.ts";
import { TOOL_ORDER } from "../../src/core/contracts/constants.ts";
import { qwenHooksOff } from "../../src/setup/qwen-gate.ts";
import { assertWritable, buildRegistry, hostBin, installExitOk, pathEntries, runDoctor, runRemove, runSetup, spawnForm, spawnShim, whichBin, winCmdLine, LOCK_FILE, BACKUP_DIR, shellWord } from "../../src/setup/index.ts";
import { generateManifests } from "../../build/manifests.ts";
import { vscodeUserDirOf } from "../../src/core/project/config-dir.ts";

  // serial: runSetup and runDoctor share in-process state; the tests fail when they overlap
describe("ADR-0019 section 3: setup engine (setup, doctor, remove, spawn, lock, backup)", () => {
  // Spec: docs/v2/adr/0019-interactive-setup-and-npm-channel.md section 3 (setup flow) and Owner decisions D3, D4;
  // docs/v2/spikes/setup/S-V1.md (v1 entries). E2E style: temp HOME, a fake package dir (server.mjs answers MCP
  // initialize + tools/list, hook.mjs answers a hook call), fake agent binaries on a temp PATH.


  const NODE = process.execPath;

  function fakePkg(root, { tools = TOOL_ORDER } = {}) {
    const dir = path.join(root, "pkg");
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "server.mjs"), `
import { createInterface } from "node:readline";
const tools = ${JSON.stringify([...tools])};
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
    writeFileSync(path.join(dir, "hook.mjs"), `let s = ""; process.stdin.on("data", (d) => { s += d; }); process.stdin.on("end", () => { const p = JSON.parse(s); if (!JSON.stringify(p).includes("context-mode-doctor-hook-runs")) return; const t = "deny: run ctx_execute; ctx_search( finds the rest"; process.stderr.write(t + "\\n"); process.stdout.write(JSON.stringify({ decision: "deny", reason: t })); });\n`);
    writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "context-mode", version: "2.0.0" }));
    // ADR-0020: the release package ships skills/; setup renders them into the host skill dir.
    cpSync(path.join(import.meta.dirname, "..", "..", "skills"), path.join(dir, "skills"), { recursive: true });
    cpSync(path.join(import.meta.dirname, "..", "..", "skills"), path.join(dir, "pi", "skills"), { recursive: true }); // D-HQ-SKILLS-1: pi prefix is ""
    cpSync(path.join(import.meta.dirname, "..", "..", "skills"), path.join(dir, "claude-code", "skills"), { recursive: true }); // D-HQ-SKILLS-2
    return dir;
  }

  function fakeBin(root, name, script) {
    const dir = path.join(root, "bin");
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, name);
    writeFileSync(file, `#!/bin/sh\n${script}\n`);
    chmodSync(file, 0o755);
    return dir;
  }

  /** The real Claude Code in npm's global layout (ADR-0012: a package.json named @anthropic-ai/claude-code):
   *  <binDir>/claude -> <root>/npm/lib/node_modules/@anthropic-ai/claude-code/cli.sh. Returns the resolved file. */
  function fakeClaude(root, binDir, script) {
    const pkg = path.join(root, "npm", "lib", "node_modules", "@anthropic-ai", "claude-code");
    mkdirSync(pkg, { recursive: true });
    writeFileSync(path.join(pkg, "package.json"), JSON.stringify({ name: "@anthropic-ai/claude-code", version: "2.0.0" }));
    const file = path.join(pkg, "cli.sh");
    writeFileSync(file, `#!/bin/sh\n${script}\n`);
    chmodSync(file, 0o755);
    mkdirSync(binDir, { recursive: true });
    symlinkSync(file, path.join(binDir, "claude"));
    return realpathSync(file);
  }

  /** A wrapper first on PATH (like the claude-worktree shim): a script outside the Claude Code package. */
  function claudeShim(root, ran) {
    const dir = path.join(root, "shims");
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "claude"), `#!/bin/sh\ntouch "${ran}"\nexit 1\n`);
    chmodSync(path.join(dir, "claude"), 0o755);
    return dir;
  }

  function sandbox(t) {
    const root = mkdtempSync(path.join(tmpdir(), "cm-setup-"));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const home = path.join(root, "home");
    mkdirSync(home, { recursive: true });
    const bin = path.join(root, "bin");
    mkdirSync(bin, { recursive: true });
    // The D3 timing budget is gated by e2e/checks/setup-hook-overhead.mjs; shared runners jitter past 15 ms here.
    return { root, home, bin, pkgDir: fakePkg(root),
      env: { PATH: [bin, "/usr/bin", "/bin"].join(path.delimiter), HOME: home, USERPROFILE: home, CM_HOOK_OVERHEAD_BUDGET_MS: "60000" } };
  }

  function put(file, text) {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text);
    return file;
  }

  const CODEX_V1 = `model = "o3"\n\n[mcp_servers.context-mode]\ncommand = "context-mode"\n`;
  const KIRO_USER = `{\n  "mcpServers": {\n    "other": { "command": "other-server" }\n  }\n}\n`;
  const CODEX_HOOKS_V1 = JSON.stringify({ hooks: { PreToolUse: [{ hooks: [{ type: "command", command: "context-mode hook codex PreToolUse" }] }], Stop: [{ hooks: [{ type: "command", command: "my-own-hook" }] }] } }, null, 2) + "\n";

  test("registry: one check row per adapter row, built from src/adapters/table.ts", () => {
    const reg = buildRegistry({ home: "/h", pkgDir: "/abs/pkg", env: {} });
    assert.deepEqual(reg.map((r) => r.id), ADAPTERS.map((a) => a.id));
    for (const r of reg) {
      const row = ADAPTERS.find((a) => a.id === r.id);
      assert.equal(r.installMode, row.installMode);
      assert.ok(r.goldenPayload && typeof r.goldenPayload === "object", `${r.id} golden payload`);
      for (const p of r.allowedWrites) assert.ok(path.isAbsolute(p), `${r.id} write path absolute`);
      const text = JSON.stringify(r);
      assert.ok(!/\bnpx\b/.test(text), `${r.id}: never npx`);
    }
  });

  test("registry: server and hook commands are absolute node + absolute file, never the bin name", () => {
    const reg = buildRegistry({ home: "/h", pkgDir: "/abs/pkg", env: {} });
    for (const r of reg.filter((x) => x.hookCommand)) {
      assert.deepEqual(r.hookCommand, [NODE, path.join("/abs/pkg", "hook.mjs"), "--agent", r.id]);
    }
    const codex = reg.find((r) => r.id === "codex");
    assert.deepEqual(codex.serverCommand, [NODE, path.join("/abs/pkg", "server.mjs"), "--agent", "codex"]);
  });

  test("instruction files: the allowlist guard refuses every routing-instruction file", () => {
    const reg = buildRegistry({ home: "/h", pkgDir: "/abs/pkg", env: {} });
    for (const name of ["CLAUDE.md", "AGENTS.md", "AGENTS.override.md", "GEMINI.md", "QWEN.md", "copilot-instructions.md", "KIRO.md"]) {
      assert.throws(() => assertWritable(reg.find((r) => r.id === "codex"), path.join("/h/.codex", name)), /not allowed/);
    }
    assert.throws(() => assertWritable(reg.find((r) => r.id === "codex"), "/h/.bashrc"), /not allowed/);
    assert.doesNotThrow(() => assertWritable(reg.find((r) => r.id === "codex"), path.join("/h", ".codex", "config.toml")));
  });

  test("setup: replaces v1 entries, keeps user keys, verifies, backs up, releases the lock", async (t) => {
    const s = sandbox(t);
    const codexToml = put(path.join(s.home, ".codex", "config.toml"), CODEX_V1);
    const codexHooks = put(path.join(s.home, ".codex", "hooks.json"), CODEX_HOOKS_V1);
    const kiro = put(path.join(s.home, ".kiro", "settings", "mcp.json"), KIRO_USER);
    const res = await runSetup({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: ["codex", "kiro"], runId: "r1" });
    assert.equal(res.exitCode, 0, JSON.stringify(res, null, 2));
    const byId = Object.fromEntries(res.agents.map((a) => [a.id, a]));
    assert.equal(byId.codex.status, "PASS");
    assert.equal(byId.kiro.status, "PASS");
    assert.ok(byId.codex.v1.length > 0, "v1 entries detected");
    const toml = readFileSync(codexToml, "utf8");
    assert.match(toml, /model = "o3"/);
    assert.ok(toml.includes(JSON.stringify(NODE)), "absolute node");
    assert.ok(toml.includes(JSON.stringify(path.join(s.pkgDir, "server.mjs"))), "absolute server.mjs");
    const hooks = JSON.parse(readFileSync(codexHooks, "utf8"));
    assert.equal(hooks.hooks.PreToolUse[0].hooks[0].command, `"${NODE}" "${path.join(s.pkgDir, "hook.mjs")}" --agent codex`);
    assert.equal(hooks.hooks.Stop[0].hooks[0].command, "my-own-hook");
    const k = JSON.parse(readFileSync(kiro, "utf8"));
    assert.deepEqual(k.mcpServers.other, { command: "other-server" });
    assert.deepEqual(k.mcpServers["context-mode"], { command: NODE, args: [path.join(s.pkgDir, "server.mjs"), "--agent", "kiro"] });
    for (const id of ["codex", "kiro"]) {
      const names = byId[id].checks.map((c) => c.name);
      for (const n of ["parse", "mcp", "hook"]) assert.ok(names.includes(n), `${id} check ${n}`);
      assert.ok(byId[id].checks.every((c) => c.ok), JSON.stringify(byId[id].checks));
      const hook = byId[id].checks.find((c) => c.name === "hook");
      assert.ok(typeof hook.overheadP95Ms === "number" && typeof hook.wallP95Ms === "number" && typeof hook.bareP95Ms === "number");
    }
    assert.equal(res.backupDir, path.join(s.home, ".context-mode", BACKUP_DIR, "r1"));
    assert.equal(readFileSync(path.join(res.backupDir, "files", "0"), "utf8").length > 0, true);
    assert.equal(existsSync(path.join(s.home, ".context-mode", LOCK_FILE)), false);
  });

  test("setup: second run changes nothing and makes no backup", async (t) => {
    const s = sandbox(t);
    const codexToml = put(path.join(s.home, ".codex", "config.toml"), CODEX_V1);
    await runSetup({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: ["codex"], runId: "a" });
    const after1 = readFileSync(codexToml, "utf8");
    const res = await runSetup({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: ["codex"], runId: "b" });
    assert.equal(res.exitCode, 0);
    assert.deepEqual(res.agents[0].changes, []);
    assert.equal(readFileSync(codexToml, "utf8"), after1);
    assert.equal(existsSync(path.join(s.home, ".context-mode", BACKUP_DIR, "b")), false);
  });

  test("setup --remove restores every touched file byte for byte, and deletes files setup created", async (t) => {
    const s = sandbox(t);
    const codexToml = put(path.join(s.home, ".codex", "config.toml"), CODEX_V1);
    const kiro = path.join(s.home, ".kiro", "settings", "mcp.json");
    await runSetup({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: ["codex", "kiro"], runId: "r1" });
    assert.ok(existsSync(kiro));
    const rm = runRemove({ home: s.home });
    assert.equal(rm.exitCode, 0);
    assert.equal(readFileSync(codexToml, "utf8"), CODEX_V1);
    assert.equal(existsSync(kiro), false);
  });

  test("setup: host files with a BOM and CRLF (PowerShell 5 UTF8) parse, are edited, and keep their layout; the backup holds the original bytes (CC-WIN-3)", async (t) => {
    const s = sandbox(t);
    const bom = "\uFEFF";
    const crlf = (text) => text.split("\n").join("\r\n");
    const hooksRaw = bom + crlf(CODEX_HOOKS_V1);
    const tomlRaw = bom + crlf(CODEX_V1);
    const codexHooks = put(path.join(s.home, ".codex", "hooks.json"), hooksRaw);
    const codexToml = put(path.join(s.home, ".codex", "config.toml"), tomlRaw);
    const res = await runSetup({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: ["codex"], runId: "r1" });
    assert.equal(res.exitCode, 0, JSON.stringify(res, null, 2));
    for (const f of [codexHooks, codexToml]) {
      const out = readFileSync(f, "utf8");
      assert.equal(out.charCodeAt(0), 0xfeff, `${f} keeps its BOM`);
      assert.equal(out.split("\r\n").join("").includes("\n"), false, `${f}: every line end is CRLF`);
    }
    const hooks = JSON.parse(readFileSync(codexHooks, "utf8").slice(1));
    assert.equal(hooks.hooks.PreToolUse[0].hooks[0].command, `"${NODE}" "${path.join(s.pkgDir, "hook.mjs")}" --agent codex`);
    assert.equal(hooks.hooks.Stop[0].hooks[0].command, "my-own-hook");
    const saved = readdirSync(path.join(res.backupDir, "files")).map((n) => readFileSync(path.join(res.backupDir, "files", n), "utf8"));
    assert.ok(saved.includes(hooksRaw) && saved.includes(tomlRaw), "backup keeps the original bytes");
    const rm = await runRemove({ home: s.home, env: s.env, runId: "r1" });
    assert.equal(rm.exitCode, 0);
    assert.equal(readFileSync(codexHooks, "utf8"), hooksRaw);
    assert.equal(readFileSync(codexToml, "utf8"), tomlRaw);
  });

  test("setup: a file that does not parse is refused and left as is", async (t) => {
    const s = sandbox(t);
    const kiro = put(path.join(s.home, ".kiro", "settings", "mcp.json"), "{ not json");
    const res = await runSetup({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: ["kiro"], runId: "r" });
    assert.equal(res.exitCode, 1);
    assert.equal(res.agents[0].status, "FAIL");
    assert.match(res.agents[0].reason, /does not parse/);
    assert.equal(readFileSync(kiro, "utf8"), "{ not json");
  });

  test("setup: a held lock stops the run before any write", async (t) => {
    const s = sandbox(t);
    put(path.join(s.home, ".context-mode", LOCK_FILE), JSON.stringify({ pid: process.pid, runId: "other" }));
    const codexToml = put(path.join(s.home, ".codex", "config.toml"), CODEX_V1);
    const res = await runSetup({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: ["codex"], runId: "r" });
    assert.equal(res.exitCode, 1);
    assert.match(res.error, /lock/);
    assert.equal(readFileSync(codexToml, "utf8"), CODEX_V1);
  });

  test("setup: a failed verify rolls that agent back byte for byte", async (t) => {
    const s = sandbox(t);
    const pkgDir = fakePkg(path.join(s.root, "bad"), { tools: ["ctx_execute"] });
    const codexToml = put(path.join(s.home, ".codex", "config.toml"), CODEX_V1);
    const res = await runSetup({ home: s.home, pkgDir, env: s.env, agents: ["codex"], runId: "r" });
    assert.equal(res.exitCode, 1);
    assert.equal(res.agents[0].status, "FAIL");
    assert.equal(res.agents[0].rolledBack, true);
    assert.equal(readFileSync(codexToml, "utf8"), CODEX_V1);
  });

  test("setup --dry-run returns the plan and writes nothing", async (t) => {
    const s = sandbox(t);
    const codexToml = put(path.join(s.home, ".codex", "config.toml"), CODEX_V1);
    const res = await runSetup({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: ["codex"], runId: "r", dryRun: true });
    assert.equal(res.exitCode, 0);
    assert.ok(res.agents[0].changes.length > 0);
    assert.equal(readFileSync(codexToml, "utf8"), CODEX_V1);
    assert.equal(existsSync(path.join(s.home, ".context-mode")), false);
  });

  test("setup: CLI agents use the agent's own command; missing binary is SKIPPED with the reason", { skip: process.platform === "win32" && "fake agent binaries are sh scripts" }, async (t) => {
    const s = sandbox(t);
    const log = path.join(s.root, "claude.log");
    const state = path.join(s.root, "claude.state");
    fakeClaude(s.root, s.bin, `echo "$@" >> "${log}"
case "$1 $2" in
  "plugin list") if [ -f "${state}" ]; then echo "context-mode@context-mode 2.0.0"; fi ;;
  "plugin install") touch "${state}" ;;
esac
exit 0`);
    const res = await runSetup({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: ["claude-code", "gemini"], runId: "r" });
    const byId = Object.fromEntries(res.agents.map((a) => [a.id, a]));
    assert.equal(byId["claude-code"].status, "PASS", JSON.stringify(byId["claude-code"], null, 2));
    assert.ok(readFileSync(log, "utf8").includes("plugin install context-mode@context-mode"));
    assert.ok(byId["claude-code"].checks.find((c) => c.name === "list").ok);
    assert.equal(byId.gemini.status, "SKIPPED");
    assert.match(byId.gemini.reason, /not on PATH/);
    assert.equal(readdirSync(s.home).includes(".gemini"), false);
  });

  const CLAUDE_FAKE = (state) => `case "$1 $2" in
  "plugin list") if [ -f "${state}" ]; then echo "context-mode@context-mode 2.0.0"; fi ;;
  "plugin install") touch "${state}" ;;
esac
exit 0`;

  test("[H8] setup: a shim first on PATH is skipped; setup and doctor run the real claude behind it and name it", { skip: process.platform === "win32" && "fake agent binaries are sh scripts" }, async (t) => {
    const s = sandbox(t);
    const ran = path.join(s.root, "shim-ran");
    const real = fakeClaude(s.root, s.bin, CLAUDE_FAKE(path.join(s.root, "claude.state")));
    const env = { ...s.env, PATH: [claudeShim(s.root, ran), s.env.PATH].join(path.delimiter) };
    const opts = { home: s.home, pkgDir: s.pkgDir, env, agents: ["claude-code"] };
    const res = await runSetup({ ...opts, runId: "r" });
    assert.equal(res.agents[0].status, "PASS", JSON.stringify(res.agents[0], null, 2));
    assert.equal(res.agents[0].bin, real, "setup names the binary it ran");
    const doc = await runDoctor(opts);
    assert.equal(doc.agents[0].status, "PASS", JSON.stringify(doc.agents[0], null, 2));
    assert.equal(doc.agents[0].bin, real, "doctor names the binary it ran");
    assert.equal(existsSync(ran), false, "the shim never ran");
  });

  test("[H8] setup: only a shim on PATH is a FAIL that names the shim; the shim never runs", { skip: process.platform === "win32" && "fake agent binaries are sh scripts" }, async (t) => {
    const s = sandbox(t);
    const ran = path.join(s.root, "shim-ran");
    const shims = claudeShim(s.root, ran);
    const env = { ...s.env, PATH: [shims, s.env.PATH].join(path.delimiter) };
    const res = await runSetup({ home: s.home, pkgDir: s.pkgDir, env, agents: ["claude-code"], runId: "r" });
    assert.equal(res.agents[0].status, "FAIL");
    assert.equal(res.agents[0].reason, `no real claude binary on PATH; found only shim script(s): ${path.join(shims, "claude")}`);
    assert.equal(existsSync(ran), false, "the shim never ran");
  });

  test("[H8] hostBin: claude resolves to a native binary (Mach-O/ELF/PE magic) behind a shim; other agents are the first PATH hit", { skip: process.platform === "win32" && "symlinks need admin on Windows" }, (t) => {
    const s = sandbox(t);
    const shims = claudeShim(s.root, path.join(s.root, "shim-ran"));
    const native = path.join(s.root, "native");
    mkdirSync(native);
    symlinkSync(process.execPath, path.join(native, "claude"));
    const env = { PATH: [shims, native].join(path.delimiter) };
    assert.deepEqual(hostBin("claude", env), { file: realpathSync(process.execPath), shims: [path.join(shims, "claude")] });
    assert.deepEqual(hostBin("claude", { PATH: shims }), { file: undefined, shims: [path.join(shims, "claude")] });
    writeFileSync(path.join(shims, "codex"), "#!/bin/sh\n");
    chmodSync(path.join(shims, "codex"), 0o755);
    assert.deepEqual(hostBin("codex", env), { file: path.join(shims, "codex"), shims: [] });
  });

  test("[M7] setup/doctor: a report-only v1 finding (shared OS temp file) does not fail an agent that is set up", async (t) => {
    const { runDoctor } = await import("../../src/setup/index.ts");
    const root = mkdtempSync(path.join(tmpdir(), "cm-doctor-tmp-"));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const home = path.join(root, "home");
    mkdirSync(home, { recursive: true });
    const pkgDir = fakePkg(root);
    // Timing is not under test here (the D3 gate has its own tests): same CI-only knob as the sandbox() helper.
    const env = { ...process.env, HOME: home, USERPROFILE: home, PATH: path.dirname(NODE), CM_HOOK_OVERHEAD_BUDGET_MS: "60000" };
    // A context-mode-* file in the OS temp dir is a v1 footprint, report only (UPGRADE_REPORT_ONLY_REASONS).
    const stray = path.join(tmpdir(), `context-mode-doctor-test-${process.pid}.db`);
    writeFileSync(stray, "");
    t.after(() => rmSync(stray, { force: true }));
    const opts = { home, pkgDir, env, agents: ["vscode"] };
    assert.equal((await runSetup(opts)).exitCode, 0);
    const res = await runDoctor(opts);
    assert.equal(res.exitCode, 0, JSON.stringify(res.agents));
    assert.ok(res.agents[0].v1.length > 0, "the temp finding is still reported");
  });

  test("whichBin: on Windows only PATHEXT names match (npm's <bin>.cmd shim), PATH key in any case", (t) => {
    const s = sandbox(t);
    writeFileSync(path.join(s.bin, "claude"), "#!/bin/sh\n"); // npm also writes an sh script cmd.exe cannot run
    chmodSync(path.join(s.bin, "claude"), 0o755);
    assert.equal(whichBin("claude", { Path: s.bin, PATHEXT: ".EXE;.CMD" }, "win32"), undefined, "extensionless file is not a Windows command");
    writeFileSync(path.join(s.bin, "claude.cmd"), "@echo off\r\n");
    chmodSync(path.join(s.bin, "claude.cmd"), 0o755);
    assert.equal(whichBin("claude", { Path: s.bin, PATHEXT: ".EXE;.CMD" }, "win32"), path.join(s.bin, "claude.cmd"));
    assert.equal(whichBin("claude", { PATH: s.bin }, "win32"), path.join(s.bin, "claude.cmd"), "default PATHEXT has .CMD");
    // A POSIX PATH splits on ":", which cannot hold a Windows drive path (C:\\...), so these two run on POSIX hosts only.
    if (process.platform !== "win32") {
      assert.equal(whichBin("claude", { PATH: s.bin }, "linux"), path.join(s.bin, "claude"));
      assert.equal(whichBin("nope", { PATH: s.bin }, "linux"), undefined);
    }
    mkdirSync(path.join(s.bin, "dir.cmd"));
    assert.equal(whichBin("dir", { PATH: s.bin }, "win32"), undefined, "a directory is not a command");
  });

  test("[CC-WIN-4] pathEntries: a Windows PATH entry may be wrapped in one pair of double quotes (cmd.exe accepts it); POSIX entries are kept as is", () => {
    assert.deepEqual(pathEntries('"C:\\Program Files\\nodejs";C:\\bin;;"D:\\a b"', "win32"), ["C:\\Program Files\\nodejs", "C:\\bin", "D:\\a b"]);
    assert.deepEqual(pathEntries('"C:\\x', "win32"), ['"C:\\x'], "an unpaired quote is left alone");
    assert.deepEqual(pathEntries('""', "win32"), [], "an empty quoted entry is no entry");
    assert.deepEqual(pathEntries('"/a":/b', "linux"), ['"/a"', "/b"], "POSIX has no quoted PATH entries");
  });

  test("[CC-WIN-4] whichBin: finds <bin>.cmd in a quoted Windows PATH entry (fake win32 on any OS)", (t) => {
    const s = sandbox(t);
    writeFileSync(path.join(s.bin, "claude.cmd"), "@echo off\r\n");
    chmodSync(path.join(s.bin, "claude.cmd"), 0o755);
    assert.equal(whichBin("claude", { Path: `"${s.bin}"`, PATHEXT: ".EXE;.CMD" }, "win32"), path.join(s.bin, "claude.cmd"));
  });

  test("winCmdLine: quotes each argument for cmd.exe /d /s /c", () => {
    assert.equal(winCmdLine("C:\\a b\\claude.cmd", ["plugin", "add", "C:\\x y", ""]), '""C:\\a b\\claude.cmd" plugin add "C:\\x y" """');
    assert.equal(winCmdLine("c.cmd", ['say "hi"']), '"c.cmd "say ""hi""""');
  });

  // D-WIN-CMDPCT-1 (GEM-WIN-7): cmd.exe expands %NAME% inside double quotes when NAME is a defined variable (or one of
  // its dynamic ones, %CD% %DATE% ...), and no quoting stops it. Such a value is refused with a message. A % that names
  // no variable is left as typed by cmd.exe, so URL escapes (file:///C:/RUNNER%7E1/a%20b) must pass: smoke hands the
  // gemini shim a file URL like that on Windows (CI run 40567801094).
  test("winCmdLine: a %NAME% that cmd.exe would expand is refused with a clear message (D-WIN-CMDPCT-1)", () => {
    const env = { Path: "C:\\bin", TEMP: "C:\\t" };
    assert.throws(() => winCmdLine("C:\\p\\gemini.cmd", ["x", "C:\\%TEMP%\\pkg"], env), /cmd\.exe expands %TEMP%/);
    assert.throws(() => winCmdLine("C:\\%temp%\\gemini.cmd", [], env), /cmd\.exe expands %temp%/, "name matched without case");
    assert.throws(() => winCmdLine("c.cmd", ["%PATH:~0,5%"], env), /%PATH:~0,5%/, "substring form");
    assert.throws(() => winCmdLine("c.cmd", ["%cd%"], {}), /%cd%/, "dynamic variable, no env entry needed");
    assert.throws(() => winCmdLine("c.cmd", ["a%", "%TEMP", "x%TEMP%"], env), /%TEMP%/, "a pair that spans arguments counts");
  });

  test("winCmdLine: a % that names no variable passes, and every other metacharacter stays quoted (D-WIN-CMDPCT-1)", () => {
    const env = { Path: "C:\\bin" };
    const url = "file:///C:/RUNNER%7E1/AppData/Local/Temp/cm%20smoke-x/bare.git";
    assert.equal(winCmdLine("c.cmd", [url], env), `"c.cmd ${url}"`);
    assert.equal(winCmdLine("c.cmd", ["100%", "%%", "%TEMP"], env), '"c.cmd 100% %% %TEMP"');
    assert.equal(winCmdLine("c.cmd", ["a!b", "a^b", "(x)", "a&b"], env), '"c.cmd "a!b" "a^b" "(x)" "a&b""');
    assert.equal(winCmdLine("c.cmd", ["tab\there", "nb\u00a0sp", "plain"], env), '"c.cmd "tab\there" "nb\u00a0sp" plain"', "any white space is quoted");
  });

  test("spawnForm: a Windows shim line with an expandable %NAME% throws; .exe and other platforms are not affected (D-WIN-CMDPCT-1)", () => {
    assert.throws(() => spawnForm("C:\\n p\\gemini.cmd", ["x", "%APPDATA%"], { APPDATA: "C:\\a" }, "win32"), /cmd\.exe expands %APPDATA%/);
    assert.deepEqual(spawnForm("C:\\n p\\gemini.cmd", ["file:///a%20b"], {}, "win32").args, ["/d", "/v:off", "/s", "/c", '""C:\\n p\\gemini.cmd" file:///a%20b"']);
    assert.deepEqual(spawnForm("C:\\n p\\claude.exe", ["%APPDATA%"], { APPDATA: "x" }, "win32").args, ["%APPDATA%"]);
    assert.deepEqual(spawnForm("/usr/bin/codex.cmd", ["%HOME%"], { HOME: "/h" }, "linux").args, ["%HOME%"]);
  });

  test("spawnForm: cmd.exe runs with /v:off so a registry DelayedExpansion setting cannot expand ! in a quoted argument (D-WIN-CMDBANG-1)", () => {
    const f = spawnForm("C:\\n p\\gemini.cmd", ["extensions", "link", "C:\\a!b\\pkg"], {}, "win32");
    assert.deepEqual(f.args.slice(0, 4), ["/d", "/v:off", "/s", "/c"], "/c stays the last switch");
    assert.ok(f.args[4].includes("a!b"), "the ! is kept as text");
  });

  test("spawnShim: a refused % argument is a failed step with the reason, not a throw and not a run (D-WIN-CMDPCT-1)", () => {
    // platform "win32" is faked, so this runs on every OS; nothing is spawned because the refusal comes first.
    const r = spawnShim("C:\\n p\\gemini.cmd", ["extensions", "link", "C:\\%TEMP%\\pkg"], { TEMP: "C:\\t" }, { encoding: "utf8" }, "win32");
    assert.equal(r.status, null);
    assert.match(String(r.stderr), /cmd\.exe expands %TEMP%/);
    assert.match(String(r.error?.message), /cmd\.exe expands %TEMP%/);
    assert.equal(r.stdout, "");
  });

  test("spawnShim: a clean command runs and returns the spawnSync result (D-WIN-CMDPCT-1)", () => {
    const r = spawnShim(process.execPath, ["-e", "process.stdout.write('ok')"], {}, { encoding: "utf8" });
    assert.equal(r.status, 0);
    assert.equal(r.stdout, "ok");
  });

  // D-RN-WIN-1: release smoke spawned `codex` by bare name on Windows and got ENOENT (npm puts only codex.cmd/.ps1 on
  // PATH). setup and smoke now share one spawn form: a .cmd/.bat shim runs through cmd.exe /d /s /c, any other file as is.
  test("spawnForm: a Windows .cmd/.bat shim runs through cmd.exe /d /v:off /s /c; any other file runs as is (D-RN-WIN-1)", () => {
    const comspec = "C:\\Windows\\system32\\cmd.exe";
    assert.deepEqual(spawnForm("C:\\n p\\codex.cmd", ["mcp", "list", "--json"], { ComSpec: comspec }, "win32"),
      { command: comspec, args: ["/d", "/v:off", "/s", "/c", '""C:\\n p\\codex.cmd" mcp list --json"'], windowsVerbatimArguments: true });
    assert.deepEqual(spawnForm("C:\\x\\GEMINI.BAT", ["a"], { COMSPEC: comspec }, "win32").command, comspec, "extension and env key in any case");
    assert.equal(spawnForm("C:\\x\\q.cmd", [], {}, "win32").command, "cmd.exe", "no ComSpec: cmd.exe from PATH");
    assert.deepEqual(spawnForm("C:\\x\\claude.exe", ["a"], {}, "win32"), { command: "C:\\x\\claude.exe", args: ["a"], windowsVerbatimArguments: false });
    assert.deepEqual(spawnForm("/usr/bin/codex.cmd", ["a"], {}, "linux"), { command: "/usr/bin/codex.cmd", args: ["a"], windowsVerbatimArguments: false });
  });

  test("spawnForm: on Windows an npm-style .cmd shim in a dir with a space runs and gets every argument (D-RN-WIN-1)", { skip: process.platform !== "win32" && "cmd.exe is Windows only" }, (t) => {
    const s = sandbox(t);
    const dir = path.join(s.root, "npm bin");
    mkdirSync(dir);
    writeFileSync(path.join(dir, "echo-args.js"), "process.stdout.write(JSON.stringify(process.argv.slice(2)));\n");
    writeFileSync(path.join(dir, "echo-args.cmd"), `@"${process.execPath}" "%~dp0echo-args.js" %*\r\n`);
    // Windows spells it `Path`; drop it so the test PATH is the only PATH key (Node's spawn, like whichBin, uses the first).
    const env = { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => k.toUpperCase() !== "PATH")), PATH: dir };
    const file = whichBin("echo-args", env);
    assert.equal(file, path.join(dir, "echo-args.cmd"));
    const f = spawnForm(file, ["mcp", "list", "--json", "a b", "x!PATH!y"], env);
    const r = spawnSync(f.command, f.args, { env, encoding: "utf8", windowsVerbatimArguments: f.windowsVerbatimArguments, windowsHide: true });
    assert.equal(r.status, 0, `${r.error ?? ""} ${r.stderr}`);
    assert.deepEqual(JSON.parse(r.stdout), ["mcp", "list", "--json", "a b", "x!PATH!y"], "a ! argument reaches the shim as text (D-WIN-CMDBANG-1)");
  });

  test("spawnForm: on Windows real cmd.exe leaves a %7E/%20 URL argument as typed, and a %TEMP% argument is refused (D-WIN-CMDPCT-1)", { skip: process.platform !== "win32" && "cmd.exe is Windows only" }, (t) => {
    const s = sandbox(t);
    const dir = path.join(s.root, "npm bin");
    mkdirSync(dir);
    writeFileSync(path.join(dir, "echo-args.js"), "process.stdout.write(JSON.stringify(process.argv.slice(2)));\n");
    writeFileSync(path.join(dir, "echo-args.cmd"), `@"${process.execPath}" "%~dp0echo-args.js" %*\r\n`);
    const env = { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => k.toUpperCase() !== "PATH")), PATH: dir };
    const file = whichBin("echo-args", env);
    const url = "file:///C:/RUNNER%7E1/AppData/Local/Temp/cm%20smoke-x/bare.git";
    const r = spawnShim(file, ["install", url], env, { encoding: "utf8" });
    assert.equal(r.status, 0, `${r.error ?? ""} ${r.stderr}`);
    assert.deepEqual(JSON.parse(String(r.stdout)), ["install", url]);
    const bad = spawnShim(file, ["install", "%TEMP%"], { ...env, TEMP: "C:\\x" }, { encoding: "utf8" });
    assert.equal(bad.status, null);
    assert.match(String(bad.stderr), /cmd\.exe expands %TEMP%/);
  });

  // D-INST-1: `gemini extensions install <dir>` asks "trust this folder?" and waits for a key even with --consent, so a
  // non-interactive setup hung. ADR-0019 section 3 step 4 names `extensions link` (gemini: --consent; qwen: `y` on stdin).
  test("registry: gemini and qwen link the package dir; qwen answers its prompt on stdin (D-INST-1)", () => {
    const rows = Object.fromEntries(buildRegistry({ home: "/h", pkgDir: "/p/context-mode", env: {} }).map((r) => [r.id, r]));
    assert.deepEqual(rows.gemini.cli.install, [["extensions", "link", "/p/context-mode", "--consent"]]);
    assert.deepEqual(rows.qwen.cli.install, [["extensions", "link", "/p/context-mode"]]);
    assert.equal(rows.qwen.cli.input, "y\n");
    assert.equal(rows.gemini.cli.input, undefined);
  });

  test("setup: a CLI agent that needs an answer on stdin gets it (D-INST-1)", { skip: process.platform === "win32" && "fake agent binaries are sh scripts" }, async (t) => {
    const s = sandbox(t);
    const log = path.join(s.root, "qwen.log");
    const state = path.join(s.root, "qwen.state");
    fakeBin(s.root, "qwen", `echo "$@" >> "${log}"
case "$1 $2" in
  "extensions list") if [ -f "${state}" ]; then echo "context-mode (2.0.0)"; fi ;;
  "extensions link") read a; echo "answer=$a" >> "${log}"; if [ "$a" = y ]; then touch "${state}"; else exit 1; fi ;;
esac
exit 0`);
    const res = await runSetup({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: ["qwen"], runId: "r" });
    assert.equal(res.agents[0].status, "PASS", JSON.stringify(res.agents[0], null, 2));
    const text = readFileSync(log, "utf8");
    assert.ok(text.includes("extensions link "), text);
    assert.ok(text.includes("answer=y"), text);
  });

  // D-INST-2: Gemini 0.65.0 prints `extensions list` to stderr. The list check read stdout only, so a linked extension
  // looked missing and setup rolled Gemini back.
  test("setup: the list check reads the agent's stderr too (D-INST-2)", { skip: process.platform === "win32" && "fake agent binaries are sh scripts" }, async (t) => {
    const s = sandbox(t);
    const state = path.join(s.root, "gemini.state");
    fakeBin(s.root, "gemini", `case "$1 $2" in
  "extensions list") if [ -f "${state}" ]; then echo "context-mode (2.0.0)" >&2; else echo "No extensions installed." >&2; fi ;;
  "extensions link") touch "${state}" ;;
esac
exit 0`);
    const res = await runSetup({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: ["gemini"], runId: "r" });
    assert.equal(res.agents[0].status, "PASS", JSON.stringify(res.agents[0], null, 2));
  });

  // D-HF-OPENCODE-LIST-1: with our plugin entry in opencode.json, OpenCode 1.19.4 first installs @opencode-ai/plugin
  // (30-60 s, network) before `mcp list` prints, so the 10 s list check timed out and setup rolled back on a fresh
  // HOME. `mcp list --pure` (run without external plugins) lists the MCP servers without that install.
  test("setup: the opencode list check does not load plugins (D-HF-OPENCODE-LIST-1)", { skip: process.platform === "win32" && "fake agent binaries are sh scripts" }, async (t) => {
    const s = sandbox(t);
    const log = path.join(s.root, "opencode.log");
    fakeBin(s.root, "opencode", `echo "$@" >> "${log}"
case " $* " in
  *" --pure "*) echo "context-mode connected" ;;
  *) exit 1 ;;
esac
exit 0`);
    const res = await runSetup({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: ["opencode"], runId: "r" });
    assert.equal(res.agents[0].status, "PASS", JSON.stringify(res.agents[0], null, 2));
    assert.ok(readFileSync(log, "utf8").includes("mcp list --pure"), readFileSync(log, "utf8"));
  });

  // D-US-1 (upgrade-sync): Claude Code runs a copy of the package under ~/.claude/plugins/cache/<mp>/context-mode/<version>
  // and records it in ~/.claude/plugins/installed_plugins.json. npm i -g does not refresh that copy.
  function installedPlugins(home, version) {
    return JSON.stringify({ version: 2, plugins: { "context-mode@context-mode": [{ scope: "user", installPath: path.join(home, ".claude", "plugins", "cache", "context-mode", "context-mode", version), version }] } });
  }

  test("[US] claude-code: a plugin copy older than the installed package is a doctor FAIL naming both versions; setup runs claude plugin update", { skip: process.platform === "win32" && "fake agent binaries are sh scripts" }, async (t) => {
    const s = sandbox(t);
    const log = path.join(s.root, "claude.log");
    const state = path.join(s.root, "claude.state");
    const want = path.join(s.root, "want.json"); // what the host writes on install/update: the package version it copied
    const ip = path.join(s.home, ".claude", "plugins", "installed_plugins.json");
    fakeClaude(s.root, s.bin, `echo "$@" >> "${log}"
case "$1 $2" in
  "plugin list") if [ -f "${state}" ]; then echo "context-mode@context-mode"; fi ;;
  "plugin install"|"plugin update") touch "${state}"; mkdir -p "${path.dirname(ip)}"; cp "${want}" "${ip}" ;;
esac
exit 0`);
    const opts = { home: s.home, pkgDir: s.pkgDir, env: s.env, agents: ["claude-code"] };
    writeFileSync(want, installedPlugins(s.home, "2.0.0"));
    const first = await runSetup({ ...opts, runId: "r1" });
    assert.equal(first.agents[0].status, "PASS", JSON.stringify(first.agents[0], null, 2));
    assert.equal((await runDoctor(opts)).agents[0].status, "PASS");
    // npm i -g context-mode@<newer>: the package moves on, the host copy does not.
    writeFileSync(path.join(s.pkgDir, "package.json"), JSON.stringify({ name: "context-mode", version: "2.0.1" }));
    const stale = await runDoctor(opts);
    assert.equal(stale.agents[0].status, "FAIL");
    assert.equal(stale.agents[0].reason, "copy: Claude Code runs context-mode 2.0.0, the installed package is 2.0.1; run claude plugin update context-mode@context-mode");
    writeFileSync(want, installedPlugins(s.home, "2.0.1"));
    writeFileSync(log, "");
    const fixed = await runSetup({ ...opts, runId: "r2" });
    assert.equal(fixed.agents[0].status, "PASS", JSON.stringify(fixed.agents[0], null, 2));
    assert.ok(readFileSync(log, "utf8").includes("plugin update context-mode@context-mode"), readFileSync(log, "utf8"));
    assert.equal(readFileSync(log, "utf8").includes("plugin install"), false, "a listed plugin is updated, not installed again");
    assert.ok(fixed.agents[0].checks.find((c) => c.name === "copy").ok);
    assert.equal((await runDoctor(opts)).agents[0].status, "PASS");
    // A refresh is not an install: undo must not uninstall the plugin.
    const manifest = JSON.parse(readFileSync(path.join(s.home, ".context-mode", "backups", "r2", "manifest.json"), "utf8"));
    assert.equal(manifest.entries.some((e) => e.undo), false, JSON.stringify(manifest));
  });

  test("[US] claude-code: setup that cannot refresh a stale copy is a FAIL that names the copy check", { skip: process.platform === "win32" && "fake agent binaries are sh scripts" }, async (t) => {
    const s = sandbox(t);
    const ip = put(path.join(s.home, ".claude", "plugins", "installed_plugins.json"), installedPlugins(s.home, "1.9.0"));
    fakeClaude(s.root, s.bin, `case "$1 $2" in
  "plugin list") echo "context-mode@context-mode" ;;
esac
exit 0`);
    const res = await runSetup({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: ["claude-code"], runId: "r" });
    assert.equal(res.agents[0].status, "FAIL");
    assert.match(res.agents[0].reason, /^copy: Claude Code runs context-mode 1\.9\.0, the installed package is 2\.0\.0/);
    assert.equal(JSON.parse(readFileSync(ip, "utf8")).plugins["context-mode@context-mode"][0].version, "1.9.0");
  });

  // D-NI-CODEX-DOCTOR-1 (ADR-0023): `codex plugin add context-mode@context-mode` installs the npm package as a Codex plugin.
  // The plugin ships the MCP server, hooks (.codex-plugin) and skills (codex/skills); setup writes nothing under ~/.codex.
  // Live run (codex-cli 0.156.1, temp HOME): codex plugin list showed "installed, enabled", doctor said "not set up".
  const CODEX_PLUGIN_FAKE = (status) => `case "$1 $2" in
  "plugin list") printf 'PLUGIN                     STATUS              VERSION  SOURCE\\ncontext-mode@context-mode  ${status}  2.0.0    /x\\n' ;;
  "mcp list") echo "context-mode  node  ./server.mjs --agent codex  enabled" ;;
esac
exit 0`;

  test("[D-NI-CODEX-DOCTOR-1] doctor: a native codex plugin install passes with no ~/.codex setup files", { skip: process.platform === "win32" && "fake agent binaries are sh scripts" }, async (t) => {
    const s = sandbox(t);
    cpSync(path.join(import.meta.dirname, "..", "..", "skills"), path.join(s.pkgDir, "codex", "skills"), { recursive: true });
    fakeBin(s.root, "codex", CODEX_PLUGIN_FAKE("installed, enabled"));
    const doc = await runDoctor({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: ["codex"] });
    assert.equal(doc.agents[0].status, "PASS", JSON.stringify(doc.agents[0], null, 2));
    const names = doc.agents[0].checks.filter((c) => c.ok).map((c) => c.name);
    for (const n of ["list", "mcp", "hook-registered", "hook-runs", "skills"]) assert.ok(names.includes(n), `${n}: ${JSON.stringify(doc.agents[0].checks)}`);
    assert.equal(existsSync(path.join(s.home, ".codex", "config.toml")), false, "doctor writes nothing");
  });

  test("[D-NI-CODEX-DOCTOR-1] doctor: a disabled codex plugin is still not set up", { skip: process.platform === "win32" && "fake agent binaries are sh scripts" }, async (t) => {
    const s = sandbox(t);
    cpSync(path.join(import.meta.dirname, "..", "..", "skills"), path.join(s.pkgDir, "codex", "skills"), { recursive: true });
    fakeBin(s.root, "codex", CODEX_PLUGIN_FAKE("installed, disabled"));
    const doc = await runDoctor({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: ["codex"] });
    assert.equal(doc.agents[0].status, "FAIL");
    assert.equal(doc.agents[0].reason, "not set up, run context-mode setup");
  });

  // D-NI-CODEX-TRUST-1: after `codex plugin add context-mode@context-mode` Codex 0.156.1 lists the plugin hooks "untrusted"
  // (hooks/list: key "<plugin>:.codex-plugin/hooks.json:<event>:0:0", currentHash) and never runs them. A
  // [hooks.state."<key>"] trusted_hash = <currentHash> entry in $CODEX_HOME/config.toml flips them to "trusted" (live probe).
  // The fake app-server below behaves like the real one: it answers over a held-open stdin and exits when stdin closes.
  const PLUGIN_ID = "context-mode@context-mode";
  const PLUGIN_KEY = (ev) => `${PLUGIN_ID}:.codex-plugin/hooks.json:${ev}:0:0`;
  const PLUGIN_EVENTS = ["pre_tool_use", "post_tool_use", "session_start", "user_prompt_submit"];
  const OTHER_KEY = "other@x:.codex-plugin/hooks.json:pre_tool_use:0:0";
  const hashOf = (key) => "sha256:" + key.length.toString(16).padStart(64, "0");
  const FAKE_APP_SERVER = `import { readFileSync, existsSync } from "node:fs";
import { createInterface } from "node:readline";
const home = process.env.CODEX_HOME;
const hooks = ${JSON.stringify([...PLUGIN_EVENTS.map((e) => ({ key: PLUGIN_KEY(e), pluginId: PLUGIN_ID, source: "plugin" })), { key: OTHER_KEY, pluginId: "other@x", source: "plugin" }, { key: "/h/hooks.json:pre_tool_use:0:0", source: "user" }])};
const hash = (k) => "sha256:" + k.length.toString(16).padStart(64, "0");
const rl = createInterface({ input: process.stdin });
rl.on("line", (l) => {
  const m = JSON.parse(l);
  if (m.id === 1) process.stdout.write(JSON.stringify({ id: 1, result: { codexHome: home } }) + "\\n");
  if (m.id === 2) {
    const toml = existsSync(home + "/config.toml") ? readFileSync(home + "/config.toml", "utf8") : "";
    const data = hooks.map((h) => ({ ...h, eventName: "preToolUse", currentHash: hash(h.key),
      trustStatus: toml.includes("[hooks.state." + JSON.stringify(h.key) + "]\\ntrusted_hash = " + JSON.stringify(hash(h.key))) ? "trusted" : "untrusted" }));
    process.stdout.write(JSON.stringify({ id: 2, result: { data: [{ cwd: process.cwd(), hooks: data }] } }) + "\\n");
  }
});
rl.on("close", () => process.exit(0));
`;
  function codexWithHookTrust(s) {
    const app = put(path.join(s.root, "fake-app-server.mjs"), FAKE_APP_SERVER);
    cpSync(path.join(import.meta.dirname, "..", "..", "skills"), path.join(s.pkgDir, "codex", "skills"), { recursive: true });
    fakeBin(s.root, "codex", `case "$1" in
  plugin) printf 'PLUGIN                     STATUS              VERSION  SOURCE\\ncontext-mode@context-mode  installed, enabled  2.0.0    /x\\n' ;;
  app-server) exec "${NODE}" "${app}" ;;
esac
exit 0`);
    s.env.CODEX_HOME = path.join(s.home, ".codex");
    mkdirSync(s.env.CODEX_HOME, { recursive: true });
    return path.join(s.env.CODEX_HOME, "config.toml");
  }
  const SKIP_SH = { skip: process.platform === "win32" && "fake agent binaries are sh scripts" };

  test("[D-NI-CODEX-TRUST-1] doctor: a native codex install whose plugin hooks Codex lists untrusted is a FAIL that names the fix", SKIP_SH, async (t) => {
    const s = sandbox(t);
    const toml = codexWithHookTrust(s);
    const doc = await runDoctor({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: ["codex"] });
    const a = doc.agents[0];
    assert.equal(a.status, "FAIL", JSON.stringify(a, null, 2));
    const reg = a.checks.find((c) => c.name === "hook-registered");
    assert.equal(reg.ok, false);
    assert.ok(reg.detail.includes("untrusted") && reg.detail.includes("context-mode setup"), reg.detail);
    assert.equal(existsSync(toml), false, "doctor writes nothing");
  });

  test("[D-NI-CODEX-TRUST-1] setup: a native codex install gets a trust entry per own plugin hook, no other hook; doctor then passes; remove restores", SKIP_SH, async (t) => {
    const s = sandbox(t);
    const toml = codexWithHookTrust(s);
    const before = `model = "o3"\n`;
    put(toml, before);
    const res = await runSetup({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: ["codex"], runId: "t1" });
    assert.equal(res.agents[0].status, "PASS", JSON.stringify(res.agents[0], null, 2));
    const text = readFileSync(toml, "utf8");
    for (const ev of PLUGIN_EVENTS) assert.ok(text.includes(`[hooks.state.${JSON.stringify(PLUGIN_KEY(ev))}]\ntrusted_hash = ${JSON.stringify(hashOf(PLUGIN_KEY(ev)))}\n`), `trusted: ${ev}\n${text}`);
    assert.equal(text.includes("other@x"), false, "another plugin's hook is not trusted");
    assert.equal(text.includes("/h/hooks.json"), false, "a user hook is not trusted");
    assert.ok(text.startsWith(`model = "o3"`), "user keys stay");
    const doc = await runDoctor({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: ["codex"] });
    assert.equal(doc.agents[0].status, "PASS", JSON.stringify(doc.agents[0], null, 2));
    const again = await runSetup({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: ["codex"], runId: "t2" });
    assert.equal(again.agents[0].status, "PASS");
    assert.equal(readFileSync(toml, "utf8"), text, "a second run changes nothing");
    const rm = await runRemove({ home: s.home, env: s.env, runId: "t1" });
    assert.equal(rm.exitCode, 0, JSON.stringify(rm));
    assert.equal(readFileSync(toml, "utf8"), before, "remove gives the original bytes back");
  });

  // D-NI-EXT-DOCTOR-1 (ADR-0023): `qwen extensions install <source>` (Qwen Code 0.26.1) and `gemini extensions install
  // <source>` (gemini-cli 0.65.0) copy the package to ~/.<host>/extensions/context-mode; the extension ships the MCP server,
  // the hooks and skills/. Live run (temp HOME): qwen doctor said "not set up" because setup still planned ~/.qwen/skills.
  // The list shapes below are the real 0.26.1 / 0.65.0 output (qwen on stdout, gemini on stderr, D-INST-2).
  const EXT_LIST = (enabled) => `\\342\\234\\223 other (1.0.0)\\n Path: /x/other\\n Enabled (User): true\\n MCP servers:\\n  context-mode\\n\\342\\234\\223 context-mode (2.0.0)\\n Path: /h/extensions/context-mode\\n Source: /x (Type: local)\\n Enabled (User): ${enabled}\\n Enabled (Workspace): true\\n MCP servers:\\n  context-mode\\n`;
  const EXT_FAKE = (bin, enabled, log, stream) => `echo "$@" >> "${log}"
case "$1 $2" in
  "extensions list") printf '${EXT_LIST(enabled)}' ${stream === "stderr" ? ">&2" : ""} ;;
  "extensions link") exit 7 ;;
esac
exit 0`;

  for (const [bin, stream] of [["qwen", "stdout"], ["gemini", "stderr"]]) {
    test(`[D-NI-EXT-DOCTOR-1] doctor and setup: a native ${bin} extension install passes and setup writes nothing`, { skip: process.platform === "win32" && "fake agent binaries are sh scripts" }, async (t) => {
      const s = sandbox(t);
      const log = path.join(s.root, `${bin}.log`);
      fakeBin(s.root, bin, EXT_FAKE(bin, "true", log, stream));
      const doc = await runDoctor({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: [bin] });
      assert.equal(doc.agents[0].status, "PASS", JSON.stringify(doc.agents[0], null, 2));
      const names = doc.agents[0].checks.filter((c) => c.ok).map((c) => c.name);
      for (const n of ["list", "mcp", "hook-registered", "hook-runs", "skills"]) assert.ok(names.includes(n), `${n}: ${JSON.stringify(doc.agents[0].checks)}`);
      const res = await runSetup({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: [bin], runId: "r" });
      assert.equal(res.agents[0].status, "PASS", JSON.stringify(res.agents[0], null, 2));
      assert.deepEqual(res.agents[0].changes, []);
      assert.equal(existsSync(path.join(s.home, `.${bin}`)), false, "setup writes nothing under the host dir (no second skill or hook copy)");
      assert.ok(!readFileSync(log, "utf8").includes("extensions link"), readFileSync(log, "utf8"));
    });

    test(`[D-NI-EXT-DOCTOR-1] doctor: a disabled native ${bin} extension fails and names the enable command`, { skip: process.platform === "win32" && "fake agent binaries are sh scripts" }, async (t) => {
      const s = sandbox(t);
      fakeBin(s.root, bin, EXT_FAKE(bin, "false", path.join(s.root, `${bin}.log`), stream));
      const doc = await runDoctor({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: [bin] });
      assert.equal(doc.agents[0].status, "FAIL", JSON.stringify(doc.agents[0], null, 2));
      assert.equal(doc.agents[0].reason, `context-mode is installed but disabled in ${bin}, run ${bin} extensions enable context-mode`);
    });
  }

  // D-NI-QWEN-GATE-1: live (qwen 0.26.4, fake provider, e2e/live qwen-fire): with the extension linked and enabled, qwen still
  // ran no hook when settings.json had "disableAllHooks": true (user, project or system file) or when the extension was disabled
  // for the workspace ("Enabled (Workspace): false"); the model saw the full 192 KB. Doctor and setup must FAIL with a one-line fix.
  const WS_LIST = (ws) => EXT_LIST("true").split("Enabled (Workspace): true").join(`Enabled (Workspace): ${ws}`);
  const QWEN_FAKE = (ws) => `case "$1 $2" in\n  "extensions list") printf '${WS_LIST(ws)}' ;;\n  "extensions link") exit 7 ;;\nesac\nexit 0`;

  for (const [where, rel, envKey] of [["user", [".qwen", "settings.json"]], ["system", ["sys", "settings.json"], "QWEN_CODE_SYSTEM_SETTINGS_PATH"]]) {
    for (const [id, setup] of [["doctor", false], ["setup", true]]) {
      test(`[D-NI-QWEN-GATE-1] ${id}: disableAllHooks in the ${where} qwen settings fails and names the file and the fix`, { skip: process.platform === "win32" && "fake agent binaries are sh scripts" }, async (t) => {
        const s = sandbox(t);
        fakeBin(s.root, "qwen", QWEN_FAKE("true"));
        const file = put(path.join(envKey ? s.root : s.home, ...rel), '{\n  // hooks off\n  "disableAllHooks": true\n}\n');
        const env = envKey ? { ...s.env, [envKey]: file } : s.env;
        const o = { home: s.home, pkgDir: s.pkgDir, env, agents: ["qwen"], runId: "r" };
        const res = setup ? await runSetup(o) : await runDoctor(o);
        assert.equal(res.agents[0].status, "FAIL", JSON.stringify(res.agents[0], null, 2));
        const bad = res.agents[0].checks.find((c) => c.name === "hook-registered");
        assert.equal(bad.ok, false);
        assert.equal(bad.detail, `qwen runs no hook: "disableAllHooks" is true in ${file}; set it to false`);
        assert.equal(readFileSync(file, "utf8").includes('"disableAllHooks": true'), true, "the user's settings file is never edited");
      });
    }
  }

  test("[D-NI-QWEN-GATE-1] doctor: a qwen extension disabled for the workspace fails and names the enable command", { skip: process.platform === "win32" && "fake agent binaries are sh scripts" }, async (t) => {
    const s = sandbox(t);
    fakeBin(s.root, "qwen", QWEN_FAKE("false"));
    const doc = await runDoctor({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: ["qwen"] });
    assert.equal(doc.agents[0].status, "FAIL", JSON.stringify(doc.agents[0], null, 2));
    assert.equal(doc.agents[0].checks.find((c) => c.name === "hook-registered").detail, "qwen runs no hook: context-mode is disabled for this workspace; run qwen extensions enable context-mode");
  });

  test("[D-NI-QWEN-GATE-1] doctor: disableAllHooks false, or absent, in user, project and system files passes", { skip: process.platform === "win32" && "fake agent binaries are sh scripts" }, async (t) => {
    const s = sandbox(t);
    fakeBin(s.root, "qwen", QWEN_FAKE("true"));
    put(path.join(s.home, ".qwen", "settings.json"), '{"disableAllHooks": false}');
    const doc = await runDoctor({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: ["qwen"] });
    assert.equal(doc.agents[0].status, "PASS", JSON.stringify(doc.agents[0], null, 2));
  });

  test("[D-NI-QWEN-GATE-1] qwenHooksOff: project settings in the working directory, QWEN_HOME, and a file that does not parse", (t) => {
    const s = sandbox(t);
    const proj = path.join(s.root, "proj");
    const pf = put(path.join(proj, ".qwen", "settings.json"), '{"disableAllHooks": true}');
    assert.equal(qwenHooksOff(s.env, s.home, proj), `qwen runs no hook: "disableAllHooks" is true in ${pf}; set it to false`);
    const qh = put(path.join(s.root, "qh", "settings.json"), '{"disableAllHooks": true}');
    assert.equal(qwenHooksOff({ ...s.env, QWEN_HOME: path.join(s.root, "qh") }, s.home, s.root), `qwen runs no hook: "disableAllHooks" is true in ${qh}; set it to false`);
    put(path.join(s.home, ".qwen", "settings.json"), "{ not json");
    assert.equal(qwenHooksOff(s.env, s.home, s.root), undefined, "a file qwen itself cannot read is not our finding");
  });

  // GEM-WIN-1, CP-WIN-4 (D-WIN-BOM-2): the BOM + CRLF fixture for the two JSON hook files that are not codex's:
  // gemini's ~/.gemini/settings.json (mode drop) and copilot-cli's ~/.copilot/hooks/context-mode.json (mode rewrite).
  // Windows PowerShell 5 `Set-Content -Encoding UTF8` and Notepad write exactly these bytes.
  for (const [id, rel, v1, check] of [
    ["gemini", [".gemini", "settings.json"], { theme: "dark", hooks: { BeforeTool: [{ hooks: [{ type: "command", command: "context-mode hook gemini BeforeTool" }] }], AfterTool: [{ hooks: [{ type: "command", command: "my-own-hook" }] }] } },
      (doc) => { assert.equal(doc.theme, "dark"); assert.equal(JSON.stringify(doc.hooks).includes("context-mode hook gemini"), false); assert.ok(JSON.stringify(doc.hooks).includes("my-own-hook")); }],
    ["copilot-cli", [".copilot", "hooks", "context-mode.json"], { version: 1, hooks: { sessionEnd: [{ type: "command", bash: "my-own-hook" }] } },
      (doc) => { assert.ok(JSON.stringify(doc.hooks).includes("hook.mjs")); assert.ok(JSON.stringify(doc.hooks).includes("my-own-hook")); }],
  ]) {
    test(`setup: ${id} hook file with a BOM and CRLF parses, is edited, keeps its layout; remove gives the original bytes back (GEM-WIN-1, CP-WIN-4)`, { skip: process.platform === "win32" && "fake agent binaries are sh scripts" }, async (t) => {
      const s = sandbox(t);
      const bin = id === "gemini" ? "gemini" : "copilot";
      const state = path.join(s.root, "agent.state");
      fakeBin(s.root, bin, id === "gemini"
        ? `case "$1 $2" in\n  "extensions list") if [ -f "${state}" ]; then echo "context-mode (2.0.0)" >&2; fi ;;\n  "extensions link") touch "${state}" ;;\n  "extensions uninstall") rm -f "${state}" ;;\nesac\nexit 0`
        : `case "$1 $2" in\n  "mcp list") if [ -f "${state}" ]; then echo "context-mode"; fi ;;\n  "mcp add") touch "${state}" ;;\n  "mcp remove") rm -f "${state}" ;;\nesac\nexit 0`);
      const raw = "﻿" + JSON.stringify(v1, null, 2).split("\n").join("\r\n") + "\r\n";
      const file = put(path.join(s.home, ...rel), raw);
      const res = await runSetup({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: [id], runId: "r1" });
      assert.equal(res.agents[0].status, "PASS", JSON.stringify(res.agents[0], null, 2));
      const out = readFileSync(file, "utf8");
      assert.equal(out.charCodeAt(0), 0xfeff, "BOM kept");
      assert.equal(out.split("\r\n").join("").includes("\n"), false, "every line end is CRLF");
      check(JSON.parse(out.slice(1)));
      const rm = await runRemove({ home: s.home, env: s.env, runId: "r1" });
      assert.equal(rm.exitCode, 0, JSON.stringify(rm, null, 2));
      assert.equal(readFileSync(file, "utf8"), raw);
    });
  }

  // Q-WIN-2: the "drop" hook files (claude-code, gemini, qwen settings.json) written by PowerShell 5 or Notepad carry a
  // BOM and CRLF. The v1 hook entry is removed, the user's entries, the BOM and the CRLF stay. Runs on every OS: the bytes
  // are built in the test; only the fake qwen binary is an sh script, so the file is also planned through --dry-run.
  test("setup: a qwen settings.json with a BOM and CRLF loses its v1 hook entry and keeps both (Q-WIN-2)", { skip: process.platform === "win32" && "fake agent binaries are sh scripts" }, async (t) => {
    const s = sandbox(t);
    const state = path.join(s.root, "qwen.state");
    fakeBin(s.root, "qwen", `case "$1 $2" in
  "extensions list") if [ -f "${state}" ]; then echo "context-mode (2.0.0)"; fi ;;
  "extensions link") read a; touch "${state}" ;;
esac
exit 0`);
    const raw = "﻿" + JSON.stringify({ theme: "dark", hooks: { PreToolUse: [{ hooks: [{ type: "command", command: "context-mode hook qwen PreToolUse" }] }], Stop: [{ hooks: [{ type: "command", command: "my-own-hook" }] }] } }, null, 2).split("\n").join("\r\n") + "\r\n";
    const file = put(path.join(s.home, ".qwen", "settings.json"), raw);
    const res = await runSetup({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: ["qwen"], runId: "r1" });
    assert.equal(res.exitCode, 0, JSON.stringify(res, null, 2));
    const out = readFileSync(file, "utf8");
    assert.equal(out.charCodeAt(0), 0xfeff, "BOM kept");
    assert.equal(out.split("\r\n").join("").includes("\n"), false, "every line end is CRLF");
    const doc = JSON.parse(out.slice(1));
    assert.equal(doc.theme, "dark");
    assert.deepEqual(doc.hooks.PreToolUse, [], "v1 entry removed");
    assert.equal(doc.hooks.Stop[0].hooks[0].command, "my-own-hook");
    const rm = await runRemove({ home: s.home, env: s.env, runId: "r1" });
    assert.equal(rm.exitCode, 0);
    assert.equal(readFileSync(file, "utf8"), raw, "rollback restores the bytes");
  });

  // CP-WIN-5 (D-HOOKFLAT-1): copilot-cli's context-mode.json is flat: hooks.<event>[] = {type,command,...}, with no inner
  // hooks array. A v1 hook command in a flat entry must be rewritten like one in a nested group. Runs on every OS.
  test("setup: copilot-cli flat hook file loses its v1 hook command and keeps the user entry (CP-WIN-5)", { skip: process.platform === "win32" && "fake agent binaries are sh scripts" }, async (t) => {
    const s = sandbox(t);
    const state = path.join(s.root, "copilot.state");
    fakeBin(s.root, "copilot", `case "$1 $2" in\n  "mcp list") if [ -f "${state}" ]; then echo "context-mode"; fi ;;\n  "mcp add") touch "${state}" ;;\n  "mcp remove") rm -f "${state}" ;;\nesac\nexit 0`);
    const v1 = { version: 1, hooks: {
      sessionStart: [{ type: "command", command: "context-mode hook copilot-cli sessionStart" }, { type: "command", command: "my-own-hook" }],
      sessionEnd: [{ type: "command", command: "my-own-end" }],
    } };
    const raw = JSON.stringify(v1, null, 2) + "\n";
    const file = put(path.join(s.home, ".copilot", "hooks", "context-mode.json"), raw);
    const res = await runSetup({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: ["copilot-cli"], runId: "r1" });
    assert.equal(res.agents[0].status, "PASS", JSON.stringify(res.agents[0], null, 2));
    const text = readFileSync(file, "utf8");
    assert.equal(text.includes("context-mode hook copilot-cli"), false, "v1 command gone: " + text);
    const doc = JSON.parse(text);
    const start = doc.hooks.sessionStart.map((e) => e.command);
    assert.ok(start.includes("my-own-hook"), "user entry stays");
    assert.equal(start.filter((c) => c.includes("hook.mjs")).length, 1, "one v2 command, no duplicate: " + JSON.stringify(start));
    assert.equal(doc.hooks.sessionEnd.some((e) => e.command === "my-own-end"), true);
    const rm = await runRemove({ home: s.home, env: s.env, runId: "r1" });
    assert.equal(rm.exitCode, 0, JSON.stringify(rm, null, 2));
    assert.equal(readFileSync(file, "utf8"), raw, "remove gives the original bytes back");
  });

  // D-WIN-EXITCRASH-1: gemini-cli 0.66.0 on Windows links the extension, prints "linked successfully", then dies on exit with
  // 0xC0000409 (3221226505, STACK_BUFFER_OVERRUN). The work is done; the host's own list command is the judge.
  test("installExitOk: only the Windows exit-time crash code is forgiven, and only when the host lists the plugin (D-WIN-EXITCRASH-1)", () => {
    assert.equal(installExitOk(0, false, "win32"), true);
    assert.equal(installExitOk(1, true, "win32"), false, "an ordinary failure stays a failure");
    assert.equal(installExitOk(3221226505, false, "win32"), false, "crash and not listed: failed");
    assert.equal(installExitOk(3221226505, true, "win32"), true, "crash and listed: installed");
    assert.equal(installExitOk(3221226505, true, "linux"), false, "the code means nothing off Windows");
    assert.equal(installExitOk(null, true, "win32"), false);
  });
});

describe("ADR-0019 no-regex rule for src/setup", { concurrency: CONC }, () => {
  // No regex in the setup runtime (rule: no regex as a mechanism). The TypeScript parser finds the nodes.
  // CP-WIN-6: spawn-bin.ts quotes with a char loop; the leftovers in print.ts and engine.ts went the same way.

  const FILES = [...readdirSync("src/setup").filter((f) => f.endsWith(".ts")).map((f) => `src/setup/${f}`), "src/core/sandbox/path-entries.ts"];

  function regexNodes(path) {
    const sf = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
    const found = [];
    const visit = (node) => {
      if (node.kind === ts.SyntaxKind.RegularExpressionLiteral) found.push(node.getText(sf));
      if ((ts.isNewExpression(node) || ts.isCallExpression(node)) && ts.isIdentifier(node.expression) && node.expression.text === "RegExp") found.push(node.getText(sf));
      ts.forEachChild(node, visit);
    };
    visit(sf);
    return found;
  }

  for (const path of FILES) {
    test("no regex literal or RegExp call in " + path, () => {
      assert.deepEqual(regexNodes(path), []);
    });
  }

  test("shellWord: safe words stay bare, everything else is single-quoted (same output as before)", () => {
    for (const w of ["abc", "a/b-c.d", "x=1", "a@b+c", "50%", "C:/x", "a,b", "A_9"]) assert.equal(shellWord(w), w);
    assert.equal(shellWord(""), "''");
    assert.equal(shellWord("a b"), "'a b'");
    assert.equal(shellWord("it's"), `'it'"'"'s'`);
    assert.equal(shellWord("C:\\x"), "'C:\\x'");
    assert.equal(shellWord("a$b"), "'a$b'");
    assert.equal(shellWord("é"), "'é'");
  });
});

  // serial: runSetup and runDoctor share in-process state
describe("ADR-0019 and ADR-0023: JSONC host files (VS Code mcp.json, opencode.json)", () => {
  // VS-WIN-5 (D-WIN-JSONC-1). VS Code reads its user-profile mcp.json and OpenCode reads opencode.json as JSONC (comments,
  // trailing commas), so setup and doctor must accept such a file and keep the user's comments byte for byte.


  const REPO = path.resolve(import.meta.dirname, "../..");

  function sandbox(t) {
    const root = mkdtempSync(path.join(tmpdir(), "cm-jsonc-"));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const home = path.join(root, "home");
    const pkgDir = path.join(root, "pkg");
    mkdirSync(home, { recursive: true });
    mkdirSync(pkgDir, { recursive: true });
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
    for (const sub of ["skills", "pi/skills", "claude-code/skills"]) for (const k of ["ctx-doctor", "ctx-stats", "ctx-upgrade"]) cpSync(path.join(REPO, "skills", k), path.join(pkgDir, sub, k), { recursive: true });
    return { home, pkgDir, env: { PATH: "/usr/bin:/bin", HOME: home, USERPROFILE: home, CM_HOOK_OVERHEAD_BUDGET_MS: "60000" } };
  }

  const COMMENTED = `{
  // my servers
  "servers": {
    /* keep this one */
    "other": { "command": "other-server", },
  },
}
`;

  test("VS-WIN-5: vscode mcp.json with comments and trailing commas is set up, comments kept, doctor passes", async (t) => {
    const s = sandbox(t);
    const file = path.join(vscodeUserDirOf(s.env, s.home), "mcp.json"); // D-WIN-VSCODE-MCP-1
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, COMMENTED);
    const res = await runSetup({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: ["vscode"], runId: "j" });
    assert.equal(res.exitCode, 0, JSON.stringify(res.agents));
    const text = readFileSync(file, "utf8");
    assert.ok(text.includes("// my servers") && text.includes("/* keep this one */"), "the user's comments stay");
    assert.ok(text.includes('"context-mode"'), "the own entry is written");
    const doc = await runDoctor({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: ["vscode"] });
    assert.equal(doc.exitCode, 0, JSON.stringify(doc.agents));
  });

  test("VS-WIN-5: a commented opencode.json (MCP entry and plugin list) is read as JSONC and keeps its comments", async (t) => {
    const s = sandbox(t);
    const file = path.join(s.home, ".config", "opencode", "opencode.json");
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `{\n  // mine\n  "theme": "dark",\n}\n`);
    const res = await runSetup({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: ["opencode"], runId: "o" });
    assert.equal(res.exitCode, 0, JSON.stringify(res.agents));
    const text = readFileSync(file, "utf8");
    assert.ok(text.includes("// mine") && text.includes('"context-mode"') && text.includes('"plugin"'), text);
    const doc = await runDoctor({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: ["opencode"] });
    assert.ok(!JSON.stringify(doc.agents).includes("does not parse"), JSON.stringify(doc.agents));
  });
});
