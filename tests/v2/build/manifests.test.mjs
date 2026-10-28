// Unit tests for build/manifests.ts (impl/13 §3; impl/10 §1.5; DECISIONS-r9 R1, R4; DEVIATIONS D-M3-arch-4,
// D-M3-A7-1..4). Expected matchers are the impl/10 §1.5 literals; zcode uses the r9 R4 Claude names (D-M3-A7-1).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assertOutPackageJson, buildMatcher, generateManifests } from "../../../build/manifests.ts";
import { ADAPTERS, getAdapter } from "../../../src/adapters/table.ts";

// D-PKG-META-1: the shared release fields are read from the repo package.json, so the tests read them there too.
const DEV = JSON.parse(readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "package.json"), "utf8"));
const META = { description: DEV.description, keywords: DEV.keywords, license: DEV.license, homepage: DEV.homepage, bugs: DEV.bugs };

const CLAUDE_MATCHER_NAMES = "Bash|Read|Grep|WebFetch|Write|Edit|NotebookEdit";
const MATCHERS = {
  "claude-code": `^(${CLAUDE_MATCHER_NAMES}|mcp__plugin_context-mode_context-mode__ctx_.*)$`,
  codex: "^(Bash|apply_patch|mcp__context_mode__ctx_.*)$",
  qwen: "^(run_shell_command|Shell|read_file|grep_search|web_fetch|mcp__context-mode__ctx_.*)$",
  zcode: `^(${CLAUDE_MATCHER_NAMES}|mcp__context-mode__ctx_.*)$`,
};

const EXPECTED_FILES = [
  ".claude-plugin/marketplace.json",
  ".claude-plugin/plugin.json",
  ".codex-plugin/hooks.json", // ADR-0023 D-NI-CODEX-1
  ".codex-plugin/mcp.json",
  ".codex-plugin/plugin.json",
  "copilot/plugin.json",
  "gemini-extension.json",
  "hooks/claude-code.json",
  "hooks/codex.json",
  "hooks/copilot-cli.json",
  "hooks/hooks.json",
  "hooks/kiro.json",
  "hooks/qwen.json",
  "hooks/vscode.json",
  "hooks/zcode.json",
  "package.json",
  "qwen-extension.json",
];

function scratch(t) {
  const dir = mkdtempSync(path.join(tmpdir(), "cm-v2-manifests-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function listFiles(root, rel = "") {
  const out = [];
  for (const name of readdirSync(path.join(root, rel))) {
    const r = rel === "" ? name : rel + "/" + name;
    if (statSync(path.join(root, r)).isDirectory()) out.push(...listFiles(root, r));
    else out.push(r);
  }
  return out.sort();
}

const readJson = (dir, rel) => JSON.parse(readFileSync(path.join(dir, rel), "utf8"));

test("buildMatcher gives the impl/10 §1.5 matcher for every host-matcher row", () => {
  for (const [id, expected] of Object.entries(MATCHERS)) assert.equal(buildMatcher(getAdapter(id)), expected, id);
});

test("D-M2-MCP-1: the claude-code PostToolUse matcher also names every MCP tool; PreToolUse does not", () => {
  const row = getAdapter("claude-code");
  assert.equal(buildMatcher(row, "PostToolUse"), `^(${CLAUDE_MATCHER_NAMES}|mcp__plugin_context-mode_context-mode__ctx_.*|mcp__.*)$`);
  assert.equal(buildMatcher(row, "PreToolUse"), MATCHERS["claude-code"]);
  const post = new RegExp(buildMatcher(row, "PostToolUse"));
  assert.ok(post.test("mcp__tix__list_tickets") && post.test("mcp__plugin_context-mode_context-mode__ctx_search") && !post.test("Glob"));
  for (const id of ["codex", "qwen", "zcode"]) assert.equal(buildMatcher(getAdapter(id), "PostToolUse"), MATCHERS[id], id);
});

test("buildMatcher escapes only the prefix; missing nativeTools slots add nothing", () => {
  const row = { ...getAdapter("kiro"), toolNamePrefix: "a.b(c)|", nativeTools: { shell: [], edit: ["x"] } };
  assert.equal(buildMatcher(row), "^(x|a\\.b\\(c\\)\\|ctx_.*)$");
  const own = new RegExp(buildMatcher(row));
  assert.ok(own.test("a.b(c)|ctx_execute"));
  assert.ok(!own.test("aXb(c)|ctx_execute"));
});

test("generateManifests writes exactly the manifest + hook files (impl/13 §3.1 step 2, D-M3-A7-2)", (t) => {
  const dir = scratch(t);
  generateManifests(dir);
  assert.deepEqual(listFiles(dir), EXPECTED_FILES);
});

test("output is byte-identical across runs and every object has sorted keys (step 3)", (t) => {
  const a = scratch(t);
  const b = scratch(t);
  generateManifests(a);
  generateManifests(b);
  const sortedDeep = (v) => {
    if (Array.isArray(v)) return v.every(sortedDeep);
    if (v === null || typeof v !== "object") return true;
    const keys = Object.keys(v);
    return keys.join("\0") === [...keys].sort().join("\0") && keys.every((k) => sortedDeep(v[k]));
  };
  for (const rel of EXPECTED_FILES) {
    const text = readFileSync(path.join(a, rel), "utf8");
    assert.equal(text, readFileSync(path.join(b, rel), "utf8"), rel);
    assert.ok(text.endsWith("}\n"), rel);
    assert.ok(sortedDeep(JSON.parse(text)), rel + " keys not sorted");
  }
});

test("plugin and extension manifests carry name, dev version and the --agent MCP entry", (t) => {
  const dir = scratch(t);
  generateManifests(dir);
  const entry = (id) => ({ "context-mode": { command: "node", args: ["server.mjs", "--agent", id] } });
  // D-M3-F-5: Claude Code runs the plugin server with cwd = the project, so the path names the plugin root.
  const claudeEntry = { "context-mode": { command: "node", args: ["${CLAUDE_PLUGIN_ROOT}/server.mjs", "--agent", "claude-code"] } };
  assert.deepEqual(readJson(dir, ".claude-plugin/plugin.json"), {
    description: DEV.description, hooks: "./hooks/claude-code.json", mcpServers: claudeEntry, name: "context-mode", skills: "./claude-code/skills", version: "0.0.0-dev",
  });
  // D-INST-3: `claude plugin marketplace add <package dir>` (what setup runs) needs this file in the npm package.
  assert.deepEqual(readJson(dir, ".claude-plugin/marketplace.json"), {
    name: "context-mode", owner: { name: "context-mode" }, plugins: [{ description: DEV.description, name: "context-mode", skills: "./claude-code/skills", source: "./", version: "0.0.0-dev" }],
  });
  // D-FU-RM-GEMINI-1: Gemini expands ${extensionPath} and ${/} in the manifest and reads hooks only from <ext>/hooks/hooks.json.
  const geminiEntry = { "context-mode": { command: "node", args: ["${extensionPath}${/}server.mjs", "--agent", "gemini"] } };
  assert.deepEqual(readJson(dir, "gemini-extension.json"), { description: DEV.description, mcpServers: geminiEntry, name: "context-mode", version: "0.0.0-dev" });
  // D-FU-RM-QWEN-1: Qwen expands ${extensionPath} and ${/} in the manifest and reads config.hooks (a path relative to the extension).
  const qwenEntry = { "context-mode": { command: "node", args: ["${extensionPath}${/}server.mjs", "--agent", "qwen"] } };
  assert.deepEqual(readJson(dir, "qwen-extension.json"), {
    description: DEV.description, hooks: "hooks/qwen.json", mcpServers: qwenEntry, name: "context-mode", version: "0.0.0-dev",
  });
  assert.deepEqual(readJson(dir, "copilot/plugin.json"), { description: DEV.description, mcpServers: entry("copilot-cli"), name: "context-mode", version: "0.0.0-dev" });
});

test("hook files follow each host shape of impl/10 §1.5", (t) => {
  const dir = scratch(t);
  generateManifests(dir);
  const cmd = (id) => "node hook.mjs --agent " + id;
  // D-M3-F-5: Claude Code hooks run with cwd = the project; the command names the plugin root, quoted.
  const claudeCmd = 'node "${CLAUDE_PLUGIN_ROOT}/hook.mjs" --agent claude-code';
  const claude = readJson(dir, "hooks/claude-code.json");
  assert.deepEqual(claude.hooks.PreToolUse, [{ hooks: [{ command: claudeCmd, timeout: 5, type: "command" }], matcher: MATCHERS["claude-code"] }]);
  assert.deepEqual(claude.hooks.PostToolUse, [{ hooks: [{ command: claudeCmd, timeout: 5, type: "command" }], matcher: `^(${CLAUDE_MATCHER_NAMES}|mcp__plugin_context-mode_context-mode__ctx_.*|mcp__.*)$` }]);
  assert.deepEqual(claude.hooks.SessionStart, [{ hooks: [{ command: claudeCmd, timeout: 5, type: "command" }] }]);
  // D-FU-RM-QWEN-1: Qwen replaces only ${CLAUDE_PLUGIN_ROOT} in hook commands.
  const qwenCmd = 'node "${CLAUDE_PLUGIN_ROOT}/hook.mjs" --agent qwen';
  const qwen = readJson(dir, "hooks/qwen.json");
  assert.deepEqual(qwen.hooks.PreToolUse, [{ hooks: [{ command: qwenCmd, timeout: 5, type: "command" }], matcher: MATCHERS.qwen }]);
  assert.deepEqual(qwen.hooks.SessionStart, [{ hooks: [{ command: qwenCmd, timeout: 5, type: "command" }] }]);
  // D-FU-RM-GEMINI-1: Gemini reads hooks only from hooks/hooks.json and expands ${extensionPath} and ${/} in commands.
  const geminiCmd = 'node "${extensionPath}${/}hook.mjs" --agent gemini';
  const gemini = readJson(dir, "hooks/hooks.json");
  // D-FU-GCH-1: no SessionStart; Claude Code also loads hooks/hooks.json and would run it through /bin/sh.
  assert.deepEqual(Object.keys(gemini.hooks), ["AfterTool", "BeforeAgent", "BeforeTool", "PreCompress"]);
  assert.deepEqual(gemini.hooks.BeforeTool, [{ hooks: [{ command: geminiCmd, timeout: 5000, type: "command" }] }]);
  assert.deepEqual(gemini.hooks.BeforeAgent, [{ hooks: [{ command: geminiCmd, timeout: 5000, type: "command" }] }]);
  const copilot = readJson(dir, "hooks/copilot-cli.json");
  assert.equal(copilot.version, 1);
  assert.deepEqual(copilot.hooks.preToolUse, [{ command: cmd("copilot-cli"), timeoutSec: 5, type: "command" }]);
  const vs = readJson(dir, "hooks/vscode.json");
  assert.equal(vs.version, 1);
  assert.deepEqual(Object.keys(vs.hooks), ["PostToolUse", "PreCompact", "PreToolUse", "SessionStart", "UserPromptSubmit"]);
  assert.deepEqual(vs.hooks.PreToolUse, [{ command: cmd("vscode"), timeout: 5, type: "command" }]);
  const kiro = readJson(dir, "hooks/kiro.json");
  assert.equal(kiro.version, "v1");
  // D-HF-KIRO-SHELL-1: one tool-event entry for own MCP tools (@mcp) and one for the native shell tool.
  assert.deepEqual(kiro.hooks.filter((h) => h.trigger === "PreToolUse"), [
    { action: { command: cmd("kiro"), type: "command" }, enabled: true, matcher: "@mcp", name: "context-mode-PreToolUse-mcp", timeout: 5, trigger: "PreToolUse" },
    { action: { command: cmd("kiro"), type: "command" }, enabled: true, matcher: "shell", name: "context-mode-PreToolUse-shell", timeout: 5, trigger: "PreToolUse" },
  ]);
  assert.equal("matcher" in kiro.hooks.find((h) => h.trigger === "UserPromptSubmit"), false);
  const z = readJson(dir, "hooks/zcode.json");
  assert.equal(z.hooks.enabled, true);
  // D-HF-ZCODE-SHAPE-1: ZCode CLI docs usage/09-hooks.md, matcher groups {matcher?, hooks:[...]}.
  assert.deepEqual(z.hooks.events.PreToolUse, [{ hooks: [{ command: cmd("zcode"), timeoutMs: 5000, type: "command" }], matcher: MATCHERS.zcode }]);
});

// D-FU-GCH-1: Claude Code loads <plugin>/hooks/hooks.json by default, next to plugin.json "hooks", and runs any entry
// whose event it knows through /bin/sh, which fails on ${extensionPath}/${/} ("bad substitution"). Hook event names
// read from the Claude Code 2.1.303 binary.
const CLAUDE_CODE_EVENTS = ["PreToolUse", "PostToolUse", "PostToolUseFailure", "PostToolBatch", "Notification", "UserPromptSubmit",
  "UserPromptExpansion", "SessionStart", "SessionEnd", "Stop", "StopFailure", "SubagentStart", "SubagentStop", "PreCompact", "PostCompact",
  "PreModelSwitch", "PostModelSwitch", "PermissionRequest", "PermissionDenied", "Setup", "TeammateIdle", "TaskCreated", "TaskCompleted",
  "Elicitation", "ElicitationResult", "ConfigChange", "WorktreeCreate", "WorktreeRemove", "InstructionsLoaded", "CwdChanged", "FileChanged",
  "DirectoryAdded", "MessageDisplay"];
test("GP1/claude-code-default-hooks-json: no hooks/hooks.json entry Claude Code runs carries ${extensionPath} or ${/}", (t) => {
  const dir = scratch(t);
  generateManifests(dir);
  const hooks = readJson(dir, "hooks/hooks.json").hooks;
  for (const event of Object.keys(hooks)) {
    if (!CLAUDE_CODE_EVENTS.includes(event)) continue;
    const text = JSON.stringify(hooks[event]);
    assert.equal(text.includes("${extensionPath}"), false, event + " runs under Claude Code with ${extensionPath}");
    assert.equal(text.includes("${/}"), false, event + " runs under Claude Code with ${/}");
  }
});

test("an unknown installMode is a build-time hard stop (step 4)", (t) => {
  const dir = scratch(t);
  const bad = { ...getAdapter("qwen"), installMode: "floppy" };
  assert.throws(() => generateManifests(dir, undefined, [...ADAPTERS, bad]), { message: "manifest: unknown installMode floppy" });
});

// D-FU-RM-PI-1 (ADR-0002 GS7 amended) + ADR-0019 D1 (PO-NPM-2): the out tree holds one package.json, the npm package:
// name, version, bin, type, engines, files and pi (Pi reads "pi".extensions from the package dir); no dependencies,
// no scripts, no private.
const D1_FILES = [
  ".claude-plugin", ".codex-plugin", "SHA256SUMS", "claude-code", "cli.mjs", "codex", "copilot", "fixtures", "gemini-extension.json", "hook.mjs", "hooks",
  "opencode", "pi", "qwen-extension.json", "run.mjs", "search.mjs", "server.mjs", "skills",
];
test("package.json is the D1 npm shape: name, version, bin, type, engines, files, pi (extensions, skills)", (t) => {
  const dir = scratch(t);
  generateManifests(dir, "2.0.0");
  assert.deepEqual(readJson(dir, "package.json"), {
    ...META,
    bin: { "context-mode": "cli.mjs" },
    engines: { node: ">=24.15.0" },
    files: D1_FILES,
    main: "./opencode/plugin.js", // ADR-0023 D-NI-OPENCODE-1
    name: "context-mode",
    pi: { extensions: ["./pi/index.js"], skills: ["./pi/skills"] },
    repository: { type: "git", url: "git+https://github.com/mksglu/context-mode.git" },
    type: "module",
    version: "2.0.0",
  });
  assert.doesNotThrow(() => assertOutPackageJson(readJson(dir, "package.json")));
});

test("assertOutPackageJson throws on dependencies, scripts, private or any other key", () => {
  const ok = {
    ...META,
    name: "context-mode", version: "2.0.0", type: "module", bin: { "context-mode": "cli.mjs" }, engines: { node: ">=24.15.0" },
    files: D1_FILES, main: "./opencode/plugin.js", pi: { extensions: ["./pi/index.js"], skills: ["./pi/skills"] },
    repository: { type: "git", url: "git+https://github.com/mksglu/context-mode.git" },
  };
  assert.doesNotThrow(() => assertOutPackageJson(ok));
  assert.throws(() => assertOutPackageJson({ ...ok, dependencies: { "better-sqlite3": "1.0.0" } }), /dependencies/);
  assert.throws(() => assertOutPackageJson({ ...ok, scripts: { postinstall: "node x.js" } }), /scripts/);
  assert.throws(() => assertOutPackageJson({ ...ok, devDependencies: {} }), /devDependencies/);
  assert.throws(() => assertOutPackageJson({ ...ok, private: true }), /private/);
  assert.throws(() => assertOutPackageJson({ ...ok, type: "commonjs" }), /type/);
  assert.throws(() => assertOutPackageJson({ ...ok, bin: { "context-mode": "./cli.mjs" } }), /bin/);
  assert.throws(() => assertOutPackageJson({ ...ok, engines: { node: ">=22.5.0" } }), /engines/);
  assert.throws(() => assertOutPackageJson({ ...ok, files: D1_FILES.slice(1) }), /files/);
  assert.throws(() => assertOutPackageJson({ ...ok, pi: { extensions: ["./pi/index.js"], skills: ["./pi/skills"], prompts: [] } }), /pi/);
  // D-RN-REPO-1: npm provenance (E422) needs repository.url to name the source repo; npm pkg fix form, so it stays a no-op.
  assert.throws(() => assertOutPackageJson({ ...ok, repository: { type: "git", url: "" } }), /repository/);
  assert.throws(() => assertOutPackageJson({ ...ok, repository: { type: "git", url: "https://github.com/mksglu/context-mode" } }), /repository/);
  for (const key of ["description", "keywords", "license", "homepage", "bugs"]) { // D-PKG-META-1: must equal the repo package.json
    assert.throws(() => assertOutPackageJson({ ...ok, [key]: "x" }), new RegExp(key));
  }
  assert.throws(() => assertOutPackageJson({ ...ok, main: "./server.mjs" }), /main/); // ADR-0023 D-NI-OPENCODE-1
  for (const key of ["pi", "bin", "engines", "files", "repository"]) {
    const { [key]: _drop, ...missing } = ok;
    assert.throws(() => assertOutPackageJson(missing), new RegExp(key));
  }
});
