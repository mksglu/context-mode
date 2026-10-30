// tests/v2/0020-hooks-all.test.mjs
// Area: ADR-0020 (hooks and skills on every agent): one fire matrix plus the per-shell hook command checks.
// One file per ADR area (ADR-0024).
import { describe, test } from "node:test";
import { CONC } from "./_lib/concurrency.mjs";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { getAdapter } from "../../src/adapters/table.ts";
import { TOOL_ORDER } from "../../src/core/contracts/constants.ts";
import { generateManifests } from "../../build/manifests.ts";
import { buildRegistry, printPlan, runRemove, runSetup, hookCommandString } from "../../src/setup/index.ts";
import { hookSample } from "../../src/setup/hook-sample.ts";

  // serial: runSetup and runDoctor share in-process state; the tests fail when they overlap
describe("ADR-0020 fire matrix: hook channel and skill channel per agent", () => {
  // Spec: docs/v2/adr/0020-hooks-and-skills-on-every-agent.md. Setup writes each agent's one hook channel and one
  // skill channel on a fresh HOME; a second run changes nothing; --remove restores every byte.


  const NODE = process.execPath;
  const REPO = path.resolve(import.meta.dirname, "../..");
  const SKILLS = ["ctx-doctor", "ctx-stats", "ctx-upgrade"];

  function pkg(root) {
    const dir = path.join(root, "pkg");
    mkdirSync(dir, { recursive: true });
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
    for (const s of SKILLS) cpSync(path.join(REPO, "skills", s), path.join(dir, "pi", "skills", s), { recursive: true }); // D-HQ-SKILLS-1: pi prefix is ""
    for (const s of SKILLS) cpSync(path.join(REPO, "skills", s), path.join(dir, "claude-code", "skills", s), { recursive: true }); // D-HQ-SKILLS-2
    return dir;
  }

  function sandbox(t) {
    const root = mkdtempSync(path.join(tmpdir(), "cm-hooks-all-"));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const home = path.join(root, "home");
    const bin = path.join(root, "bin");
    mkdirSync(home, { recursive: true });
    mkdirSync(bin, { recursive: true });
    // copilot-cli adds its MCP server through its own CLI; a stub that already lists context-mode stands in for it.
    // On Windows whichBin matches PATHEXT names only (npm's <bin>.cmd shim), so the stub is a .cmd there and cmd.exe needs its env.
    if (process.platform === "win32") writeFileSync(path.join(bin, "copilot.cmd"), "@echo context-mode\r\n");
    else writeFileSync(path.join(bin, "copilot"), "#!/bin/sh\necho context-mode\n", { mode: 0o755 });
    const win = process.platform === "win32" ? { SystemRoot: process.env.SystemRoot, ComSpec: process.env.ComSpec } : {};
    return { root, home, pkgDir: pkg(root),
      env: { PATH: [bin, "/usr/bin", "/bin"].join(path.delimiter), HOME: home, USERPROFILE: home, CM_HOOK_OVERHEAD_BUDGET_MS: "60000", ...win } };
  }

  const hookCmd = (pkgDir, id) => `"${NODE}" "${path.join(pkgDir, "hook.mjs")}" --agent ${id}`;
  // Agents setup writes by file (no host CLI needed): their hook file and skill dir sit under HOME.
  const FILE_AGENTS = ["codex", "copilot-cli", "vscode", "kiro", "zcode", "opencode"];

  function commands(doc) {
    const out = [];
    const walk = (v) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { if (k === "command" && typeof x === "string") out.push(x); else walk(x); }
    };
    walk(doc);
    return out;
  }

  test("ADR-0020: setup writes the hook channel for every file agent with the absolute hook command", async (t) => {
    const s = sandbox(t);
    const res = await runSetup({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: FILE_AGENTS, runId: "r1" });
    assert.equal(res.exitCode, 0, JSON.stringify(res.agents.map((a) => [a.id, a.status, a.reason])));
    for (const id of ["codex", "copilot-cli", "vscode", "kiro", "zcode"]) {
      const file = path.join(s.home, getAdapter(id).hookChannel.path);
      assert.ok(existsSync(file), id + " hook file " + file);
      const cmds = commands(JSON.parse(readFileSync(file, "utf8")));
      const names = Object.keys(getAdapter(id).eventMap).filter((e) => e !== "Usage");
      // kiro: PreToolUse/PostToolUse each have an @mcp and a shell entry (D-HF-KIRO-SHELL-1).
      const events = names.length + (id === "kiro" ? names.filter((e) => e === "PreToolUse" || e === "PostToolUse").length : 0);
      assert.equal(cmds.filter((c) => c === hookCmd(s.pkgDir, id)).length, events, id + " one command per event (and per kiro matcher)");
    }
    const zc = JSON.parse(readFileSync(path.join(s.home, ".zcode", "cli", "config.json"), "utf8"));
    assert.equal(zc.hooks.enabled, true, "zcode hooks.enabled");
    assert.ok(zc.mcp.servers["context-mode"], "zcode MCP entry kept next to the hooks (D-HF-ZCODE-SHAPE-1)");
    assert.equal(zc.features.mcp, true, "zcode features.mcp");
    const oc = JSON.parse(readFileSync(path.join(s.home, ".config", "opencode", "opencode.json"), "utf8"));
    assert.deepEqual(oc.plugin, [path.join(s.pkgDir, "opencode", "plugin.js")], "opencode plugin entry");
  });

  test("ADR-0020: setup writes the three skills per agent with that agent's tool name prefix", async (t) => {
    const s = sandbox(t);
    const res = await runSetup({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: FILE_AGENTS, runId: "r1" });
    assert.equal(res.exitCode, 0, JSON.stringify(res.agents.map((a) => [a.id, a.status, a.reason])));
    for (const id of FILE_AGENTS) {
      const row = getAdapter(id);
      for (const name of SKILLS) {
        const file = path.join(s.home, row.skillChannel.path, name, "SKILL.md");
        assert.ok(existsSync(file), id + " " + file);
        const text = readFileSync(file, "utf8");
        const tool = name.replace("ctx-", "ctx_");
        assert.ok(text.includes(row.toolNamePrefix + tool), id + " " + name + " names " + row.toolNamePrefix + tool);
        assert.ok(text.startsWith("---\nname: " + name + "\n"), id + " frontmatter kept");
      }
    }
  });

  test("ADR-0020: user hooks in a shared hook file are kept; second run changes nothing; --remove restores bytes", async (t) => {
    const s = sandbox(t);
    const codexHooks = path.join(s.home, ".codex", "hooks.json");
    mkdirSync(path.dirname(codexHooks), { recursive: true });
    const user = JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: "command", command: "my-own-hook" }] }], PreToolUse: [{ matcher: "Edit", hooks: [{ type: "command", command: "my-lint" }] }] } }, null, 2) + "\n";
    writeFileSync(codexHooks, user);
    const first = await runSetup({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: ["codex", "kiro"], runId: "a" });
    assert.equal(first.exitCode, 0, JSON.stringify(first.agents.map((a) => [a.id, a.status, a.reason])));
    const doc = JSON.parse(readFileSync(codexHooks, "utf8"));
    assert.ok(commands(doc).includes("my-own-hook") && commands(doc).includes("my-lint"), "user hooks kept");
    assert.equal(commands(doc).filter((c) => c === hookCmd(s.pkgDir, "codex")).length, 4);
    const after = readFileSync(codexHooks, "utf8");
    const second = await runSetup({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: ["codex", "kiro"], runId: "b" });
    assert.deepEqual(second.agents.map((a) => a.changes), [[], []], "idempotent");
    assert.equal(readFileSync(codexHooks, "utf8"), after);
    assert.equal(runRemove({ home: s.home }).exitCode, 0);
    assert.equal(readFileSync(codexHooks, "utf8"), user, "byte-exact restore");
    assert.equal(existsSync(path.join(s.home, ".kiro", "hooks", "context-mode.json")), false, "created hook file removed");
    assert.equal(existsSync(path.join(s.home, ".codex", "skills", "ctx-stats", "SKILL.md")), false, "created skill removed");
  });

  test("ADR-0020: --print lists the hook step and the skill step for every agent", (t) => {
    // D-N5-SKILL-1: the package layout (pi/skills holds the bare names); the repo root has no pi/skills.
    for (const row of buildRegistry({ home: "/h", pkgDir: sandbox(t).pkgDir, env: {} })) {
      const kinds = printPlan(row).steps.map((s) => s.kind);
      assert.ok(row.hookInstall, row.id + " hookInstall");
      assert.ok(row.skillInstall, row.id + " skillInstall");
      if (getAdapter(row.id).hookChannel.kind !== "package") assert.ok(kinds.includes("hook") || kinds.includes("run"), row.id + " hook step");
      if (getAdapter(row.id).skillChannel.kind === "home-dir") assert.ok(kinds.includes("skill"), row.id + " skill step");
    }
  });

  // ADR-0020 step 4: doctor runs three hook checks (registered, runs, seen) and one skill check per agent.
  test("ADR-0020: doctor names hook-registered, hook-runs, hook-seen and skills; seen is a WARN before the first event", async (t) => {
    const s = sandbox(t);
    const { runDoctor } = await import("../../src/setup/index.ts");
    const agents = ["codex", "kiro", "opencode"];
    const res = await runSetup({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents, runId: "r1" });
    assert.equal(res.exitCode, 0, JSON.stringify(res.agents.map((a) => [a.id, a.status, a.reason])));
    const d = await runDoctor({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents });
    assert.equal(d.exitCode, 0, JSON.stringify(d.agents.map((a) => [a.id, a.status, a.reason])));
    for (const a of d.agents) {
      const by = Object.fromEntries(a.checks.map((c) => [c.name, c]));
      for (const n of ["hook-registered", "hook-runs", "hook-seen", "skills"]) assert.ok(by[n], a.id + " " + n);
      assert.equal(by["hook-registered"].ok, true, a.id);
      assert.equal(by["hook-runs"].ok, true, a.id);
      assert.equal(by.skills.ok, true, a.id);
      assert.equal(by["hook-seen"].warn, true, a.id + " seen is WARN");
      assert.match(by["hook-seen"].detail, /not seen yet, run one tool call/);
    }
  });

  test("ADR-0020: doctor hook-seen passes once the journal holds a row from that agent", async (t) => {
    const s = sandbox(t);
    const { runDoctor } = await import("../../src/setup/index.ts");
    await runSetup({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: ["codex"], runId: "r1" });
    const { DatabaseSync } = await import("node:sqlite");
    const { DDL } = await import("../../src/core/store/schema.ts");
    const dir = path.join(s.home, ".context-mode", "projects", "abc");
    mkdirSync(dir, { recursive: true });
    const db = new DatabaseSync(path.join(dir, "context.db"));
    db.exec(DDL);
    db.prepare("INSERT INTO events(session_id, worktree, agent, kind, turn, created_at, accessed_at) VALUES ('s','/w','codex','cmd',1,1,1)").run();
    db.close();
    const d = await runDoctor({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: ["codex"] });
    const seen = d.agents[0].checks.find((c) => c.name === "hook-seen");
    assert.equal(seen.ok, true);
    assert.notEqual(seen.warn, true);
  });

  test("ADR-0020: doctor fails hook-registered when the hook file lost the entry, and skills when a skill has the wrong prefix", async (t) => {
    const s = sandbox(t);
    const { runDoctor } = await import("../../src/setup/index.ts");
    await runSetup({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: ["kiro"], runId: "r1" });
    writeFileSync(path.join(s.home, ".kiro", "hooks", "context-mode.json"), JSON.stringify({ version: "v1", hooks: [] }));
    const skill = path.join(s.home, ".kiro", "skills", "ctx-stats", "SKILL.md");
    writeFileSync(skill, readFileSync(skill, "utf8").split("mcp_context-mode_ctx_stats").join("ctx_stats"));
    const d = await runDoctor({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: ["kiro"] });
    assert.equal(d.exitCode, 1);
    assert.equal(d.agents[0].status, "FAIL");
  });

  // Codex 0.164.0 runs a hooks.json hook only when config.toml holds [hooks.state."<realpath>:<snake_event>:<group>:<handler>"]
  // trusted_hash = "sha256:<hex>" (probe: codex app-server hooks/list gives trustStatus trusted / modified / untrusted).
  // The hash is sha256 of the sorted-key JSON {event_name, matcher?, hooks:[{type, command, timeout, async:false}]}
  // (checked against currentHash from hooks/list for five hooks, D-HA-CODEX-TRUST-1).
  // D-TRUST-KEYDIR-2: a default ~/.codex is keyed as spelled (Codex hooks/list on macOS prints /var/..., not /private/var/...).
  const sortKeys = (v) => Array.isArray(v) ? v.map(sortKeys)
    : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v;
  const SNAKE = { PreToolUse: "pre_tool_use", PostToolUse: "post_tool_use", SessionStart: "session_start", UserPromptSubmit: "user_prompt_submit" };
  function codexTrust(file) {
    const doc = JSON.parse(readFileSync(file, "utf8"));
    const out = {};
    for (const [ev, groups] of Object.entries(doc.hooks)) groups.forEach((g, gi) => g.hooks.forEach((h, hi) => {
      const id = { event_name: SNAKE[ev], hooks: [{ ...h, async: false }] };
      if (g.matcher !== undefined) id.matcher = g.matcher;
      out[`${path.resolve(file)}:${SNAKE[ev]}:${gi}:${hi}`] = { cmd: h.command, hash: "sha256:" + createHash("sha256").update(JSON.stringify(sortKeys(id))).digest("hex") };
    }));
    return out;
  }

  test("ADR-0020: codex setup trusts each own hook in config.toml; user hooks are not trusted; remove restores", async (t) => {
    const s = sandbox(t);
    const hooks = path.join(s.home, ".codex", "hooks.json");
    mkdirSync(path.dirname(hooks), { recursive: true });
    writeFileSync(hooks, JSON.stringify({ hooks: { PreToolUse: [{ matcher: "Edit", hooks: [{ type: "command", command: "my-lint" }] }] } }));
    const res = await runSetup({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: ["codex"], runId: "a" });
    assert.equal(res.exitCode, 0, JSON.stringify(res.agents.map((a) => [a.id, a.status, a.reason])));
    const toml = readFileSync(path.join(s.home, ".codex", "config.toml"), "utf8");
    const want = codexTrust(hooks);
    let own = 0;
    for (const [key, { cmd, hash }] of Object.entries(want)) {
      const block = `[hooks.state.${JSON.stringify(key)}]\ntrusted_hash = ${JSON.stringify(hash)}\n`;
      if (cmd === hookCmd(s.pkgDir, "codex")) { own += 1; assert.ok(toml.includes(block), "trusted: " + key); }
      else assert.ok(!toml.includes(JSON.stringify(key)), "user hook not trusted: " + key);
    }
    assert.equal(own, 4);
    assert.ok(toml.includes("[mcp_servers.context-mode]"), "server entry kept");
    const second = await runSetup({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: ["codex"], runId: "b" });
    assert.deepEqual(second.agents.map((a) => a.changes), [[]], "idempotent");
    assert.equal(runRemove({ home: s.home }).exitCode, 0);
    assert.equal(existsSync(path.join(s.home, ".codex", "config.toml")), false, "created config.toml removed");
  });

  test("ADR-0020: codex doctor fails hook-registered when a trusted_hash does not match the hook", async (t) => {
    const s = sandbox(t);
    const { runDoctor } = await import("../../src/setup/index.ts");
    await runSetup({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: ["codex"], runId: "r1" });
    const cfg = path.join(s.home, ".codex", "config.toml");
    const toml = readFileSync(cfg, "utf8");
    const first = Object.values(codexTrust(path.join(s.home, ".codex", "hooks.json")))[0].hash;
    writeFileSync(cfg, toml.split(first).join("sha256:" + "0".repeat(64)));
    const d = await runDoctor({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: ["codex"] });
    const reg = d.agents[0].checks.find((c) => c.name === "hook-registered");
    assert.equal(reg.ok, false);
    assert.match(reg.detail, /not trusted/);
  });

  // D-HQ-COPILOT-NAMES-3: Copilot CLI 1.0.103 lists personal skills from ~/.copilot/skills before ~/.agents/skills and skips a
  // later same-name skill, and its tool names differ from VS Code's (context-mode-ctx_* vs mcp_context-mode_ctx_*). So
  // copilot-cli owns ~/.copilot/skills and vscode owns ~/.agents/skills; each SKILL.md names one host's tool, and setup of one
  // agent never rewrites the other's skill. Supersedes the shared-dir form of D-HQ-COPILOT-NAMES-2.
  test("D-HQ-COPILOT-NAMES-3: copilot-cli and vscode each own a skills dir; each SKILL.md names only its host's tool; doctor passes skills for both", async (t) => {
    const s = sandbox(t);
    const { runDoctor } = await import("../../src/setup/index.ts");
    const dirs = { "copilot-cli": ".copilot", vscode: ".agents" };
    for (const agents of [["copilot-cli"], ["vscode"], ["copilot-cli", "vscode"]]) {
      await runSetup({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents, runId: "r-" + agents.join("-") });
      for (const id of agents) for (const name of SKILLS) {
        const text = readFileSync(path.join(s.home, dirs[id], "skills", name, "SKILL.md"), "utf8");
        const tool = name.replace("ctx-", "ctx_");
        const other = getAdapter(id === "vscode" ? "copilot-cli" : "vscode").toolNamePrefix;
        assert.ok(text.includes("Call the " + getAdapter(id).toolNamePrefix + tool + " tool "), id + " " + name + " names its own tool: " + text);
        assert.equal(text.includes(" or "), false, id + " " + name + " hedges: " + text);
        assert.equal(text.includes(other + tool), false, id + " " + name + " names the other host's tool");
      }
    }
    const d = await runDoctor({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: ["copilot-cli", "vscode"] });
    for (const a of d.agents) assert.equal(a.checks.find((c) => c.name === "skills")?.ok, true, a.id + " skills " + JSON.stringify(a.checks.find((c) => c.name === "skills")));
  });

  // N5 (2.0.0-next.5 live run): with CODEX_HOME set apart from HOME/.codex, setup wrote HOME/.codex/config.toml while
  // `codex mcp list` reads CODEX_HOME/config.toml, so setup failed and rolled back. Codex reads its config, hooks.json
  // and skills from CODEX_HOME (default ~/.codex), so setup writes all three there.
  test("[D-N5-CODEX-HOME-1] setup writes codex config.toml, hooks.json and skills under CODEX_HOME when it is set", async (t) => {
    const s = sandbox(t);
    const codexHome = path.join(s.root, "codex-home");
    const env = { ...s.env, CODEX_HOME: codexHome };
    const res = await runSetup({ home: s.home, pkgDir: s.pkgDir, env, agents: ["codex"], runId: "ch" });
    assert.equal(res.exitCode, 0, JSON.stringify(res.agents.map((a) => [a.id, a.status, a.reason])));
    assert.ok(readFileSync(path.join(codexHome, "config.toml"), "utf8").includes("[mcp_servers.context-mode]"), "MCP entry in CODEX_HOME/config.toml");
    const cmds = commands(JSON.parse(readFileSync(path.join(codexHome, "hooks.json"), "utf8")));
    assert.ok(cmds.includes(hookCmd(s.pkgDir, "codex")), "hook command in CODEX_HOME/hooks.json");
    for (const name of SKILLS) assert.ok(existsSync(path.join(codexHome, "skills", name, "SKILL.md")), name + " under CODEX_HOME/skills");
    assert.equal(existsSync(path.join(s.home, ".codex")), false, "nothing written to HOME/.codex");
  });

  // N6 (2.0.0-next.5 live run): Codex 0.156.1 deferred our MCP tools behind tool_search, so the model dumped the
  // tool catalogue (10,730 B) before it called ctx_execute. Codex's per-server key omit_tools_from = ["deferred"]
  // takes the deferred surface away, so the tools are direct (codex-rs core/src/tools/spec_plan.rs
  // apply_mcp_tool_exposure_policy; config/src/mcp_types.rs omit_tools_from; `codex mcp list` rejects other values).
  test("[D-N6-CODEX-DIRECT-1] setup writes omit_tools_from = [\"deferred\"] in the codex MCP entry", async (t) => {
    const { parseHostConfig, hostConfigValueAt } = await import("../../src/core/ops/host-config.ts");
    const s = sandbox(t);
    const codexHome = path.join(s.root, "codex-home");
    const env = { ...s.env, CODEX_HOME: codexHome };
    const res = await runSetup({ home: s.home, pkgDir: s.pkgDir, env, agents: ["codex"], runId: "cd" });
    assert.equal(res.exitCode, 0, JSON.stringify(res.agents.map((a) => [a.id, a.status, a.reason])));
    const file = path.join(codexHome, "config.toml");
    const toml = parseHostConfig("codex", file, readFileSync(file, "utf8"), "toml");
    assert.deepEqual(hostConfigValueAt(toml, ["mcp_servers", "context-mode", "omit_tools_from"]), ["deferred"]);
  });

  // N7 (2.0.0-next.6 codex exec run): approval policy "never" refused the ctx_execute call ("MCP tool call requires
  // approval, but approval policy is never"), so the model fell back to rg. Codex's per-server key
  // default_tools_approval_mode = "approve" (codex-rs config/src/mcp_types.rs RawMcpServerConfig; AppToolApproval
  // auto|prompt|approve) lets our own read-only ctx tools run without approval; the plugin mcp.json sets the same key.
  test("[D-N7-CODEX-APPROVE-1] setup writes default_tools_approval_mode = \"approve\" in the codex MCP entry", async (t) => {
    const { parseHostConfig, hostConfigValueAt } = await import("../../src/core/ops/host-config.ts");
    const s = sandbox(t);
    const codexHome = path.join(s.root, "codex-home");
    const env = { ...s.env, CODEX_HOME: codexHome };
    const res = await runSetup({ home: s.home, pkgDir: s.pkgDir, env, agents: ["codex"], runId: "ca" });
    assert.equal(res.exitCode, 0, JSON.stringify(res.agents.map((a) => [a.id, a.status, a.reason])));
    const file = path.join(codexHome, "config.toml");
    const toml = parseHostConfig("codex", file, readFileSync(file, "utf8"), "toml");
    assert.equal(hostConfigValueAt(toml, ["mcp_servers", "context-mode", "default_tools_approval_mode"]), "approve");
    assert.deepEqual(hostConfigValueAt(toml, ["mcp_servers", "context-mode", "omit_tools_from"]), ["deferred"]);
  });

  // D-WIN-BOM-1: PowerShell 5 / Notepad write a UTF-8 BOM and CRLF. Setup reads such a hook file and config.toml,
  // keeps the user's bytes, and writes CRLF for what it adds; --remove restores the bytes.
  const BOM = "﻿";
  const toCrlf = (s) => s.split("\n").join("\r\n");
  const hasBareLf = (s) => s.split("\r\n").join("").includes("\n");

  test("D-WIN-BOM-1: codex setup reads a BOM + CRLF hooks.json and config.toml, keeps them BOM + CRLF, remove restores bytes", async (t) => {
    const s = sandbox(t);
    const dir = path.join(s.home, ".codex");
    mkdirSync(dir, { recursive: true });
    const hooksText = BOM + toCrlf(JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: "command", command: "my-own-hook" }] }] } }, null, 2) + "\n");
    const tomlText = BOM + toCrlf('model = "o3"\n\n[mcp_servers.other]\ncommand = "x"\n');
    writeFileSync(path.join(dir, "hooks.json"), hooksText);
    writeFileSync(path.join(dir, "config.toml"), tomlText);
    const first = await runSetup({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: ["codex"], runId: "a" });
    assert.equal(first.exitCode, 0, JSON.stringify(first.agents.map((a) => [a.id, a.status, a.reason])));
    const hooks = readFileSync(path.join(dir, "hooks.json"), "utf8");
    const toml = readFileSync(path.join(dir, "config.toml"), "utf8");
    for (const [name, text] of [["hooks.json", hooks], ["config.toml", toml]]) {
      assert.ok(text.startsWith(BOM), name + " keeps its BOM");
      assert.ok(!text.slice(1).includes(BOM), name + " has one BOM");
      assert.ok(!hasBareLf(text), name + " has no bare LF");
    }
    assert.ok(commands(JSON.parse(hooks.slice(1))).includes("my-own-hook"), "user hook kept");
    assert.ok(toml.startsWith(tomlText), "user toml lines are a byte-exact prefix");
    assert.ok(toml.includes("[mcp_servers.context-mode]"), "server entry written");
    const second = await runSetup({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: ["codex"], runId: "b" });
    assert.deepEqual(second.agents.map((a) => a.changes), [[]], "idempotent");
    assert.equal(runRemove({ home: s.home }).exitCode, 0);
    assert.equal(readFileSync(path.join(dir, "hooks.json"), "utf8"), hooksText, "hooks.json restored");
    assert.equal(readFileSync(path.join(dir, "config.toml"), "utf8"), tomlText, "config.toml restored");
  });

  test("D-WIN-BOM-1: a BOM kiro hook file and a BOM vscode JSONC config are read, not reported as a parse failure", async (t) => {
    const s = sandbox(t);
    const mcp = path.join(s.home, ".kiro", "settings", "mcp.json");
    mkdirSync(path.dirname(mcp), { recursive: true });
    const user = BOM + toCrlf(JSON.stringify({ mcpServers: { other: { command: "o" } } }, null, 2) + "\n");
    writeFileSync(mcp, user);
    const res = await runSetup({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: ["kiro"], runId: "a" });
    assert.equal(res.exitCode, 0, JSON.stringify(res.agents.map((a) => [a.id, a.status, a.reason])));
    const after = readFileSync(mcp, "utf8");
    assert.ok(after.startsWith(BOM) && !hasBareLf(after), "BOM and CRLF kept");
    assert.ok(JSON.parse(after.slice(1)).mcpServers.other, "user server kept");
  });

  // KIRO-WIN-2: the kiro hook file ~/.kiro/hooks/context-mode.json and mcp.json, both saved by Notepad or PowerShell 5 with a
  // BOM and CRLF. Setup keeps the user's hook, the BOM and the CRLF; doctor parses both; remove gives the bytes back.
  test("KIRO-WIN-2: kiro setup, doctor and remove read a BOM + CRLF hook file and mcp.json and keep their layout", async (t) => {
    const s = sandbox(t);
    const { runDoctor } = await import("../../src/setup/index.ts");
    const hookFile = path.join(s.home, ".kiro", "hooks", "context-mode.json");
    const mcp = path.join(s.home, ".kiro", "settings", "mcp.json");
    mkdirSync(path.dirname(hookFile), { recursive: true });
    mkdirSync(path.dirname(mcp), { recursive: true });
    const ownHook = { name: "my-own", trigger: "PostToolUse", action: { type: "command", command: "my-own-hook" }, enabled: true };
    const hooksRaw = BOM + toCrlf(JSON.stringify({ version: "v1", hooks: [ownHook] }, null, 2) + "\n");
    const mcpRaw = BOM + toCrlf(JSON.stringify({ mcpServers: { other: { command: "o" } } }, null, 2) + "\n");
    writeFileSync(hookFile, hooksRaw);
    writeFileSync(mcp, mcpRaw);
    const res = await runSetup({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: ["kiro"], runId: "a" });
    assert.equal(res.exitCode, 0, JSON.stringify(res.agents.map((a) => [a.id, a.status, a.reason])));
    for (const f of [hookFile, mcp]) {
      const out = readFileSync(f, "utf8");
      assert.ok(out.startsWith(BOM) && !out.slice(1).includes(BOM), `${f} keeps one BOM`);
      assert.ok(!hasBareLf(out), `${f} keeps CRLF`);
    }
    const hooks = JSON.parse(readFileSync(hookFile, "utf8").slice(1)).hooks;
    assert.ok(hooks.some((h) => h.action?.command === "my-own-hook"), "user hook kept");
    assert.ok(hooks.some((h) => String(h.action?.command).includes("hook.mjs")), "our hook added");
    const d = await runDoctor({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: ["kiro"] });
    assert.equal(d.agents[0].status, "PASS", JSON.stringify(d.agents[0]));
    assert.equal(runRemove({ home: s.home, env: s.env }).exitCode, 0);
    assert.equal(readFileSync(hookFile, "utf8"), hooksRaw, "hook file restored byte for byte");
    assert.equal(readFileSync(mcp, "utf8"), mcpRaw, "mcp.json restored byte for byte");
  });

  // OC-WIN-1: PowerShell 5 writes opencode.json with a BOM and CRLF. Setup, doctor and remove read it, keep the user's
  // keys, keep BOM + CRLF, and remove restores the original bytes. Runs on every OS: the bytes are built in the test.
  test("OC-WIN-1: opencode setup, doctor and remove read a BOM + CRLF opencode.json and keep its layout", async (t) => {
    const s = sandbox(t);
    const file = path.join(s.home, ".config", "opencode", "opencode.json");
    mkdirSync(path.dirname(file), { recursive: true });
    const user = BOM + toCrlf(JSON.stringify({ theme: "dark", plugin: ["my-own-plugin"] }, null, 2) + "\n");
    writeFileSync(file, user);
    const res = await runSetup({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: ["opencode"], runId: "a" });
    assert.equal(res.exitCode, 0, JSON.stringify(res.agents.map((a) => [a.id, a.status, a.reason])));
    const after = readFileSync(file, "utf8");
    assert.ok(after.startsWith(BOM) && !after.slice(1).includes(BOM), "one BOM kept");
    assert.ok(!hasBareLf(after), "CRLF kept");
    const doc = JSON.parse(after.slice(1));
    assert.equal(doc.theme, "dark", "user key kept");
    assert.ok(doc.plugin.includes("my-own-plugin"), "user plugin kept");
    assert.ok(doc.plugin.includes(path.join(s.pkgDir, "opencode", "plugin.js")), "our plugin entry added");
    const { runDoctor } = await import("../../src/setup/index.ts");
    const d = await runDoctor({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: ["opencode"] });
    assert.equal(d.agents[0].status, "PASS", JSON.stringify(d.agents[0]));
    assert.equal(d.agents[0].checks.find((c) => c.name === "parse")?.ok, true, "doctor parses the BOM file");
    assert.equal(runRemove({ home: s.home, env: s.env }).exitCode, 0);
    assert.equal(readFileSync(file, "utf8"), user, "remove restores the original bytes");
  });
});

describe("ADR-0020 Copilot hook sample", { concurrency: CONC }, () => {
  // D-HQ-COPILOT-EVENT-1: doctor hook-runs must send the copilot-cli payload the host really sends
  // (docs.github.com/en/copilot/reference/hooks-configuration): no hookEventName, toolArgs a JSON string.
  // A sample with a field the host never sends hid the live decode failure.


  test("copilot-cli doctor sample is the documented postToolUse payload, with no hookEventName", () => {
    const { effect, payload } = hookSample("copilot-cli", "/tmp/proj", "x");
    assert.equal(effect, "replace");
    assert.equal("hookEventName" in payload, false);
    assert.equal("hook_event_name" in payload, false);
    assert.equal(typeof payload.toolArgs, "string");
    assert.deepEqual(JSON.parse(payload.toolArgs), { command: "cat big.log" });
    assert.deepEqual(payload.toolResult, { resultType: "success", textResultForLlm: "x" });
  });
});

describe("ADR-0020 Windows hook shell command", { concurrency: CONC }, () => {
  // D-HW-PS-1: the hook command setup writes starts with a quoted node path. cmd.exe /C "..." (codex) and sh accept
  // that; PowerShell reads a leading quoted string as a string literal and fails to parse the rest. The Copilot
  // harness (copilot-cli, vscode) runs `command` through PowerShell on Windows unless an explicit `powershell` field
  // is set (docs.github.com/en/copilot/reference/hooks-reference: "explicit bash or powershell entries take
  // precedence on their respective platforms"). So those two hosts get `powershell: "& " + command`.


  // Fake Windows paths: the registry only joins strings, so this runs on every OS.
  const WIN_HOME = "C:\\Users\\Jane Doe";
  const WIN_PKG = "C:\\Program Files\\nodejs\\node_modules\\context-mode";

  function hookEntries(row) {
    const out = [];
    const walk = (v) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") { if (typeof v.command === "string") out.push(v); for (const x of Object.values(v)) walk(x); }
    };
    walk(row.hookInstall.shape);
    return out;
  }

  test("D-HW-PS-1: copilot-cli and vscode hook entries carry an explicit powershell field: call operator + the command", () => {
    const reg = buildRegistry({ home: WIN_HOME, pkgDir: WIN_PKG, env: {} });
    for (const id of ["copilot-cli", "vscode"]) {
      const row = reg.find((r) => r.id === id);
      const entries = hookEntries(row);
      assert.ok(entries.length > 0, id + " has hook entries");
      for (const e of entries) {
        assert.equal(e.command, row.hookInstall.command, id + ": command stays the sh/cmd form");
        assert.equal(e.powershell, "& " + row.hookInstall.command, id + ": powershell field starts with the call operator");
        assert.ok(e.command.startsWith('"'), id + ": command starts with a quoted path (what PowerShell cannot parse)");
      }
    }
  });

  test("D-HW-PS-1: every other host keeps command only (their shell is cmd.exe, sh, or not documented)", () => {
    const reg = buildRegistry({ home: WIN_HOME, pkgDir: WIN_PKG, env: {} });
    for (const row of reg.filter((r) => r.hookInstall.kind === "file" && !["copilot-cli", "vscode"].includes(r.id))) {
      for (const e of hookEntries(row)) assert.equal(e.powershell, undefined, row.id + ": no powershell field");
    }
  });

  // Only a real Windows run proves PowerShell's parser: the quoted-first form fails, the `& ` form runs.
  test("D-HW-PS-1: Windows PowerShell runs the powershell field and rejects the bare quoted form", { skip: process.platform !== "win32" }, () => {
    const root = mkdtempSync(path.join(tmpdir(), "cm ps "));
    try {
      const dir = path.join(root, "pkg dir");
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, "hook.mjs"), "process.stdout.write('ran:' + process.argv.slice(2).join(' '));\n");
      const reg = buildRegistry({ home: root, pkgDir: dir, env: {} });
      const row = reg.find((r) => r.id === "copilot-cli");
      const entry = hookEntries(row)[0];
      const ps = (line) => spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", line], { encoding: "utf8", windowsHide: true });
      const bare = ps(hookCommandString(row));
      assert.notEqual(bare.status, 0, "bare quoted form is a PowerShell parse error: " + bare.stdout);
      const good = ps(entry.powershell);
      assert.equal(good.status, 0, good.stderr);
      assert.equal(good.stdout.trim(), "ran:--agent copilot-cli");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  // W-CODEX-5: Codex (codex-rs/hooks/src/engine/command_runner.rs build_command) runs a hook as
  // `%COMSPEC% /C` (fallback cmd.exe) with raw_arg(`"<command_line>"`), never PowerShell. cmd.exe /C drops the outer
  // pair of quotes when the line has more than two quotes, so the quoted node path is valid. This test calls cmd.exe the
  // same way (verbatim arguments) with a path that has a space, so a change of the codex command form that cmd.exe
  // cannot run goes red.
  test("W-CODEX-5: the codex hook command runs through cmd.exe /C with the outer quotes Codex adds", { skip: process.platform !== "win32" }, () => {
    const root = mkdtempSync(path.join(tmpdir(), "cm cx "));
    try {
      const dir = path.join(root, "pkg dir");
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, "hook.mjs"), "process.stdout.write('ran:' + process.argv.slice(2).join(' '));\n");
      const reg = buildRegistry({ home: root, pkgDir: dir, env: {} });
      const row = reg.find((r) => r.id === "codex");
      const entry = hookEntries(row)[0];
      assert.equal(entry.command, hookCommandString(row));
      assert.equal(entry.powershell, undefined, "codex has no powershell channel");
      const run = spawnSync(process.env.COMSPEC || "cmd.exe", ["/C", `"${entry.command}"`], { encoding: "utf8", windowsHide: true, windowsVerbatimArguments: true });
      assert.equal(run.status, 0, run.stderr);
      assert.equal(run.stdout.trim(), "ran:--agent codex");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

describe("ADR-0020 Codex 0.166 hook shell command (D-C166-WIN-FIRE-1)", { concurrency: CONC }, () => {
  // CI run 41047932424 (codex-cli 0.166.0, windows-latest): every hook, even a logging-only one, ended `hook: PreToolUse Failed`.
  // Source (rust-v0.166.0 core/src/session/mod.rs build_hooks_config): the hook shell is the session shell, and on Windows
  // that is PowerShell (the exec_command error names pwsh.exe). 0.156 ran `%COMSPEC% /C`. PowerShell reads a leading quoted
  // path as a string, so `"C:\...\node.exe" "hook.mjs" ...` is a parse error. The codex command must start with a bare word
  // that cmd.exe, sh and PowerShell all run: `node "<hook.mjs>" --agent codex`.
  const WIN_HOME = "C:\\Users\\Jane Doe";
  const WIN_PKG = "C:\\Program Files\\nodejs\\node_modules\\context-mode";
  const codexCommands = (row) => Object.values(row.hookInstall.shape.hooks).flatMap((g) => g.flatMap((x) => x.hooks.map((h) => h.command)));

  test("D-C166-WIN-FIRE-1: on Windows the codex hook command starts with bare node, never a quoted path", () => {
    const row = buildRegistry({ home: WIN_HOME, pkgDir: WIN_PKG, env: {}, platform: "win32" }).find((r) => r.id === "codex");
    const cmds = codexCommands(row);
    assert.ok(cmds.length > 0);
    for (const c of cmds) {
      assert.ok(c.startsWith('node "'), "starts with bare node: " + c);
      assert.ok(c.endsWith('hook.mjs" --agent codex'), c);
    }
    assert.equal(hookCommandString(row), cmds[0], "the v1 rewrite and the doctor use the same line");
    assert.equal(row.hookCommand[0], "node", "the written line uses bare node");
    assert.equal(row.hookRunCommand[0], process.execPath, "the doctor still runs the absolute node");
  });

  test("D-C166-WIN-FIRE-1: off Windows the codex hook command keeps the absolute quoted node path (D4)", () => {
    const row = buildRegistry({ home: "/home/jane", pkgDir: "/opt/context mode", env: {}, platform: "linux" }).find((r) => r.id === "codex");
    for (const c of codexCommands(row)) assert.ok(c.startsWith('"' + process.execPath + '" "'), c);
  });

  test("D-C166-WIN-FIRE-1: only codex changes; every other host keeps the quoted absolute form on Windows", () => {
    const reg = buildRegistry({ home: WIN_HOME, pkgDir: WIN_PKG, env: {}, platform: "win32" });
    for (const row of reg.filter((r) => r.id !== "codex" && r.hookCommand)) assert.ok(hookCommandString(row).startsWith('"'), row.id);
  });

  // Windows only: PowerShell runs the line the way 0.166 builds it (hook_environment_executor.rs): the JSON line is piped in.
  test("D-C166-WIN-FIRE-1: PowerShell runs the codex hook command with the stdin line piped in", { skip: process.platform !== "win32" }, () => {
    const root = mkdtempSync(path.join(tmpdir(), "cm c166 "));
    try {
      const dir = path.join(root, "pkg dir");
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, "hook.mjs"), "let d='';process.stdin.on('data',(c)=>d+=c).on('end',()=>process.stdout.write('ran:' + process.argv.slice(2).join(' ') + ':' + d.trim()));\n");
      const row = buildRegistry({ home: root, pkgDir: dir, env: {} }).find((r) => r.id === "codex");
      const script = "$global:LASTEXITCODE = 0\n'{\"a\":1}' | " + hookCommandString(row) + "\nif ($?) { exit 0 }\nif ($LASTEXITCODE) { exit $LASTEXITCODE }\nexit 1";
      const run = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8", windowsHide: true });
      assert.equal(run.status, 0, run.stderr + run.stdout);
      assert.equal(run.stdout.trim(), 'ran:--agent codex:{"a":1}');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

describe("ADR-0020 Kiro hook shell command", { concurrency: CONC }, () => {
  // KIRO-WIN-4: which shell runs the kiro hook command on Windows, and does the registered string survive it.
  // Source read (aws/amazon-q-developer-cli main, crates/chat-cli/src/cli/chat/cli/hooks.rs run_hook, the open source
  // base of Kiro CLI): unix `bash -c <command>`; windows `tokio::process::Command::new("cmd").arg("/C").arg(command)`.
  // So the shell is cmd.exe, not PowerShell, and the finding's `& ` prefix is not needed (it would be a cmd.exe error).
  // What matters is how the argument reaches cmd.exe: Rust std (like Node without windowsVerbatimArguments) wraps an
  // argument with spaces in quotes and escapes each inner quote as \". This test repeats that spawn with a spaced path.
  // Kiro CLI 2.x / V3 is closed source: the same call is assumed and NOT verified on a real Kiro.


  test("KIRO-WIN-4: the kiro hook entry is the plain registered string, with no powershell field", () => {
    const reg = buildRegistry({ home: "C:\\Users\\Jane Doe", pkgDir: "C:\\Program Files\\nodejs\\node_modules\\context-mode", env: {} });
    const row = reg.find((r) => r.id === "kiro");
    const cmds = row.hookInstall.shape.hooks.map((h) => h.action);
    assert.ok(cmds.length > 0);
    for (const a of cmds) { assert.equal(a.command, hookCommandString(row)); assert.equal(a.powershell, undefined); }
  });

  // Windows only: spawn(cmd, ["/C", line]) with the default (non-verbatim) quoting, as Kiro's Rust code does.
  test("KIRO-WIN-4: cmd.exe /C, spawned the way Kiro spawns it, runs the registered kiro hook command", { skip: process.platform !== "win32", todo: "UNVERIFIED KIRO-WIN-4 (D-WIN-KIRO-SHELL-1): if CI shows this red, Node/Rust re-quote the line as \\\" and cmd.exe cannot run a spaced node path; same class as Q-WIN-5; needs a design decision, see OPEN-ITEMS" }, () => {
    const root = mkdtempSync(path.join(tmpdir(), "cm kiro "));
    try {
      const dir = path.join(root, "pkg dir");
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, "hook.mjs"), "let d='';process.stdin.on('data',(c)=>d+=c).on('end',()=>process.stdout.write('ran:' + process.argv.slice(2).join(' ') + ':' + d));\n");
      const reg = buildRegistry({ home: root, pkgDir: dir, env: {} });
      const row = reg.find((r) => r.id === "kiro");
      const line = hookCommandString(row);
      const r = spawnSync(process.env.ComSpec || "cmd.exe", ["/C", line], { input: '{"x":1}', encoding: "utf8", windowsHide: true });
      assert.equal(r.status, 0, "stderr=" + r.stderr + " stdout=" + r.stdout + " line=" + line);
      assert.equal(r.stdout.trim(), 'ran:--agent kiro:{"x":1}');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

describe("ADR-0020 Z Code hook shell command", { concurrency: CONC }, () => {
  // Z-WIN-3: which shell runs the zcode hook command on Windows, and does the registered string survive it.
  // Source read (zai-org/ZCode main, apps/zcode-cli/packages): core/src/hooks/configured-runner-callback.ts runs a
  // `type: "command"` hook as ExecutionCommand mode "shell" with no shellProfile; adapters/src/exec/execution-command.ts
  // resolveExecutionCommand -> resolveShell returns `shell: process.env.ComSpec ?? "cmd.exe"` on win32 (or the hook's own
  // `shell` field), file = the command string, args = []; exec/node-execution-adapter-process.ts passes that to Node
  // child_process.spawn({ shell }). Node, for a shell that matches cmd(.exe), runs `<shell> /d /s /c "<command>"` with
  // windowsVerbatimArguments. So cmd strips only the outer pair and the leading-quoted node path is valid: no `& `, no
  // extra quote wrap, and the `process` handler type is not needed. This test repeats that spawn.


  function commandEntries(v, out = []) {
    if (Array.isArray(v)) v.forEach((x) => commandEntries(x, out));
    else if (v && typeof v === "object") { if (typeof v.command === "string") out.push(v); for (const x of Object.values(v)) commandEntries(x, out); }
    return out;
  }

  test("Z-WIN-3: the zcode hook entry is a plain `command` handler holding the registered string, no powershell prefix", () => {
    const reg = buildRegistry({ home: "C:\\Users\\Jane Doe", pkgDir: "C:\\Program Files\\nodejs\\node_modules\\context-mode", env: {} });
    const row = reg.find((r) => r.id === "zcode");
    const entries = commandEntries(row.hookInstall.shape);
    assert.ok(entries.length > 0);
    for (const e of entries) {
      assert.equal(e.type, "command");
      assert.equal(e.command, hookCommandString(row));
      assert.equal(e.powershell, undefined);
      assert.equal(e.shell, undefined, "no per-hook shell override: ZCode picks ComSpec on win32");
    }
  });

  // Windows only: spawn exactly as ZCode does, Node spawn with shell = ComSpec and the command string as the file.
  test("Z-WIN-3: Node spawn with shell=ComSpec (as ZCode spawns a command hook) runs the registered zcode hook command", { skip: process.platform !== "win32" }, () => {
    const root = mkdtempSync(path.join(tmpdir(), "cm zc "));
    try {
      const dir = path.join(root, "pkg dir");
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, "hook.mjs"), "let d='';process.stdin.on('data',(c)=>d+=c).on('end',()=>process.stdout.write('ran:' + process.argv.slice(2).join(' ') + ':' + d));\n");
      const reg = buildRegistry({ home: root, pkgDir: dir, env: {} });
      const row = reg.find((r) => r.id === "zcode");
      const line = hookCommandString(row);
      const r = spawnSync(line, { shell: process.env.ComSpec || "cmd.exe", input: '{"x":1}', encoding: "utf8", windowsHide: true });
      assert.equal(r.status, 0, "stderr=" + r.stderr + " stdout=" + r.stdout + " line=" + line);
      assert.equal(r.stdout.trim(), 'ran:--agent zcode:{"x":1}');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
