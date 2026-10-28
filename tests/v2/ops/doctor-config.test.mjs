// tests/v2/ops/doctor-config.test.mjs
// Spec: docs/v2/impl/07-tools-ops.md §5 D3, D4, D5b; DEVIATIONS D-M5-arch-3, D-M5-D2-1..4.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { checkDoubleFire, checkHostConfig, checkV1Leftovers, composeMatcher } from "../../../src/core/ops/doctor-config.ts";
import { getAdapter } from "../../../src/adapters/table.ts";

function tmp(t) {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), "cm-doctor-config-")));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
const put = (file, value) => {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value), "utf8");
};

// A Codex install as ctx_upgrade + the release hook file would leave it.
function codexInstall(home, opts = {}) {
  const codexDir = opts.codexDir ?? path.join(home, ".codex");
  const row = getAdapter("codex");
  const cmd = opts.cmd ?? "node /opt/cm/hook.mjs --agent codex";
  const hooks = {};
  for (const [canonical, native] of Object.entries(row.eventMap)) {
    const group = { hooks: [{ type: "command", command: cmd, timeout: opts.timeout ?? 5 }] };
    if (canonical === "PreToolUse" || canonical === "PostToolUse") group.matcher = opts.matcher ?? composeMatcher(row, canonical);
    hooks[native] = [group];
  }
  put(path.join(codexDir, "hooks.json"), { hooks });
  // JSON string escapes are TOML basic-string escapes: a Windows path keeps its backslashes (D-M3-F-9 rule).
  const serverArgs = JSON.stringify([path.join(path.dirname(process.argv[1] ?? ""), "server.mjs"), "--agent", "codex"]);
  put(path.join(codexDir, "config.toml"), `model = "o1"\n${opts.features ?? ""}\n[mcp_servers.context-mode]\ncommand = "node"\nargs = ${serverArgs}\nomit_tools_from = ["deferred"]\ndefault_tools_approval_mode = "approve"\n`);
  return row;
}

test("[M5] doctor-config/composeMatcher-is-buildMatcher-text", async () => {
  const { buildMatcher } = await import("../../../build/manifests.ts");
  for (const id of ["claude-code", "codex", "qwen", "zcode"]) {
    assert.equal(composeMatcher(getAdapter(id)), buildMatcher(getAdapter(id)));
  }
});

test("[M5] doctor-config/hook-matcher-valid-regex: composed matcher hits a real tool name (#1222)", () => {
  for (const id of ["claude-code", "codex", "qwen", "zcode"]) {
    const row = getAdapter(id);
    const re = new RegExp(composeMatcher(row));
    assert.ok(Object.values(row.nativeTools).flat().some((n) => re.test(n)) || re.test(row.toolNamePrefix + "ctx_execute"));
    assert.ok(re.test(row.toolNamePrefix + "ctx_search"));
  }
});

test("[M5] doctor-config/D3-codex-pass-no-features-hooks-key-means-true (#1152 #1153)", (t) => {
  const home = tmp(t);
  const row = codexInstall(home);
  const d3 = checkHostConfig(row, { HOME: home, USERPROFILE: home }, home);
  assert.equal(d3.status, "PASS", d3.detail);
});

test("[M5] doctor-config/D3-codex-features-hooks-false-fails-hook-entries", (t) => {
  const home = tmp(t);
  const row = codexInstall(home, { features: "[features]\nhooks = false\n" });
  const d3 = checkHostConfig(row, { HOME: home, USERPROFILE: home }, home);
  assert.equal(d3.status, "FAIL");
  assert.equal(d3.detail, "wrong: hook entries");
  assert.equal(d3.fixCommand, "run ctx_upgrade");
});

test("[M5] doctor-config/D3-wrong-matcher-names-hook-entries", (t) => {
  const home = tmp(t);
  const row = codexInstall(home, { matcher: "Bash" });
  assert.equal(checkHostConfig(row, { HOME: home, USERPROFILE: home }, home).detail, "wrong: hook entries");
});

test("[M5] doctor-config/D3-bad-timeout-names-hook-timeout", (t) => {
  const home = tmp(t);
  const row = codexInstall(home, { timeout: "5" });
  assert.equal(checkHostConfig(row, { HOME: home, USERPROFILE: home }, home).detail, "wrong: hook timeout");
});

test("[M5] doctor-config/user-hook-timeout-kept: a user-set timeout is a valid value, not a FAIL (#1226)", (t) => {
  const home = tmp(t);
  const row = codexInstall(home, { timeout: 45 });
  assert.equal(checkHostConfig(row, { HOME: home, USERPROFILE: home }, home).status, "PASS");
});

test("[D-N6-CODEX-HOME-2] doctor-config/D3 reads codex config.toml and hooks.json from CODEX_HOME when it is set", (t) => {
  const home = tmp(t);
  const codexDir = path.join(tmp(t), "codex-home");
  const row = codexInstall(home, { codexDir });
  assert.equal(checkHostConfig(row, { HOME: home, CODEX_HOME: codexDir }, home).status, "PASS");
  assert.equal(checkHostConfig(row, { HOME: home, USERPROFILE: home }, home).detail, "wrong: MCP entry, hook entries");
  codexInstall(home, { codexDir, features: "[features]\nhooks = false\n" });
  assert.equal(checkHostConfig(row, { HOME: home, CODEX_HOME: codexDir }, home).detail, "wrong: hook entries");
  assert.equal(checkHostConfig(row, { HOME: home, CODEX_HOME: "" }, home).detail, "wrong: MCP entry, hook entries");
});

test("[M5] doctor-config/D3-empty-home-names-all-three-parts-for-codex", (t) => {
  const home = tmp(t);
  const d3 = checkHostConfig(getAdapter("codex"), { HOME: home, USERPROFILE: home }, home);
  assert.equal(d3.status, "FAIL");
  assert.equal(d3.detail, "wrong: MCP entry, hook entries");
});

test("[M5] doctor-config/D3-broken-config-is-FAIL-not-throw", (t) => {
  const home = tmp(t);
  const row = codexInstall(home);
  put(path.join(home, ".codex", "hooks.json"), "{ not json");
  assert.equal(checkHostConfig(row, { HOME: home, USERPROFILE: home }, home).status, "FAIL");
});

test("[M5] doctor-config/D4-folds-every-finding-into-one-row", (t) => {
  const home = tmp(t);
  const empty = tmp(t);
  assert.equal(checkV1Leftovers("claude-code", home, { tmp: empty }).status, "PASS");
  put(path.join(home, ".claude", "settings.json"), { mcpServers: { "context-mode": { command: "node", args: ["v1/server.js"] } } });
  mkdirSync(path.join(home, ".claude", "context-mode"), { recursive: true });
  const d4 = checkV1Leftovers("claude-code", home, { tmp: empty });
  assert.equal(d4.id, "D4");
  assert.equal(d4.status, "FAIL");
  assert.ok(d4.detail.split("; ").length >= 2, d4.detail);
  assert.equal(d4.fixCommand, "run ctx_upgrade");
});

test("[M5] doctor-config/D5b-double-fire-detected", (t) => {
  const repo = tmp(t);
  assert.equal(checkDoubleFire("claude-code", repo).status, "PASS");
  put(path.join(repo, ".claude", "settings.json"), { hooks: { PreToolUse: [{ matcher: "Bash", hooks: [] }] } });
  assert.equal(checkDoubleFire("claude-code", repo).status, "PASS");
  put(path.join(repo, ".vscode", "settings.json"), '{\n  // jsonc comment\n  "chat.useClaudeHooks": true,\n}\n');
  for (const agent of ["claude-code", "vscode"]) {
    const d5b = checkDoubleFire(agent, repo);
    assert.equal(d5b.status, "FAIL");
    assert.equal(d5b.detail, "both Claude Code hooks and VS Code chat.useClaudeHooks are active for this repo");
    assert.equal(d5b.fixCommand, "disable chat.useClaudeHooks or the Claude Code hooks block");
  }
  assert.equal(checkDoubleFire("codex", repo).status, "PASS");
});

// GP11 pi-discovery-dirs-doctor (#1168), pi-doctor-real-paths (#1266); DEVIATIONS D-M7-G2-1.
const piSettings = (dir, packages) => put(path.join(dir, "settings.json"), { packages });
const PI_GIT = "git:github.com/mksglu/context-mode@release";

test("[M7] doctor-config/D3-pi-reports-default-agent-dir-path (#1266)", (t) => {
  const home = tmp(t);
  const dir = path.join(home, ".pi", "agent");
  piSettings(dir, [PI_GIT]);
  const d3 = checkHostConfig(getAdapter("pi"), { HOME: home, USERPROFILE: home }, home);
  assert.equal(d3.status, "PASS", d3.detail);
  assert.ok(d3.detail.includes(path.join(dir, "settings.json")), d3.detail);
});

test("[M7] doctor-config/D3-pi-PI_CODING_AGENT_DIR-wins, legacy path never named (#1168 #1035)", (t) => {
  const home = tmp(t);
  const custom = tmp(t);
  piSettings(custom, [PI_GIT]);
  const d3 = checkHostConfig(getAdapter("pi"), { HOME: home, USERPROFILE: home, PI_CODING_AGENT_DIR: custom }, home);
  assert.equal(d3.status, "PASS", d3.detail);
  assert.ok(d3.detail.includes(path.join(custom, "settings.json")), d3.detail);
  assert.ok(!d3.detail.includes(path.join(home, ".pi")), d3.detail);
});

test("[M7] doctor-config/D3-pi-missing-package-FAIL-names-the-file-read", (t) => {
  const home = tmp(t);
  const custom = tmp(t);
  const d3 = checkHostConfig(getAdapter("pi"), { HOME: home, USERPROFILE: home, PI_CODING_AGENT_DIR: custom }, home);
  assert.equal(d3.status, "FAIL");
  assert.ok(d3.detail.startsWith("wrong: MCP entry"), d3.detail);
  assert.ok(d3.detail.includes(path.join(custom, "settings.json")), d3.detail);
  assert.equal(d3.fixCommand, "run ctx_upgrade");
});

test("[D-N6-CODEX-DIRECT-1] doctor-config/D3 names the MCP entry when the codex entry lacks omit_tools_from deferred", (t) => {
  const home = tmp(t);
  const row = codexInstall(home);
  const file = path.join(home, ".codex", "config.toml");
  const text = readFileSync(file, "utf8");
  put(file, text.split('omit_tools_from = ["deferred"]\n').join(""));
  assert.equal(checkHostConfig(row, { HOME: home, USERPROFILE: home }, home).detail, "wrong: MCP entry");
});

test("[D-N7-CODEX-APPROVE-1] doctor-config/D3 names the MCP entry when the codex entry lacks default_tools_approval_mode approve", (t) => {
  const home = tmp(t);
  const row = codexInstall(home);
  const file = path.join(home, ".codex", "config.toml");
  const text = readFileSync(file, "utf8");
  put(file, text.split('default_tools_approval_mode = "approve"\n').join(""));
  assert.equal(checkHostConfig(row, { HOME: home, USERPROFILE: home }, home).detail, "wrong: MCP entry");
});

// W-CODEX-1 (D-VT-DOCTOR-CMD-1): setup writes `"<execPath>" "<dir>/hook.mjs" --agent <id>`; doctor must own it.
test("[D-VT-DOCTOR-CMD-1] doctor-config/D3 owns the quoted absolute-path hook command setup writes (Windows, POSIX)", (t) => {
  const cmds = [
    '"C:\\Program Files\\nodejs\\node.exe" "C:\\Users\\a b\\AppData\\ctx\\hook.mjs" --agent codex',
    '"/usr/local/bin/node" "/opt/my dir/cm/hook.mjs" --agent codex',
    '"C:\\Program Files\\nodejs\\NODE.EXE" "C:\\ctx\\hook.mjs" --agent codex',
    'node "/opt/my dir/cm/hook.mjs" --agent codex',
  ];
  for (const cmd of cmds) {
    const home = tmp(t);
    const row = codexInstall(home, { cmd });
    const d3 = checkHostConfig(row, { HOME: home, USERPROFILE: home }, home);
    assert.equal(d3.status, "PASS", `${cmd}: ${d3.detail}`);
  }
});

test("[D-VT-DOCTOR-CMD-1] doctor-config/D3 rejects a hook command whose first token is not node or whose agent differs", (t) => {
  const cmds = [
    '"C:\\tools\\python.exe" "C:\\ctx\\hook.mjs" --agent codex',
    '"/usr/bin/nodejs-foo" "/opt/cm/hook.mjs" --agent codex',
    '"/usr/bin/node" "/opt/cm/other.mjs" --agent codex',
    '"/usr/bin/node" "/opt/cm/hook.mjs" --agent gemini',
    '"/usr/bin/node "/opt/cm/hook.mjs" --agent codex',
  ];
  for (const cmd of cmds) {
    const home = tmp(t);
    const row = codexInstall(home, { cmd });
    assert.equal(checkHostConfig(row, { HOME: home, USERPROFILE: home }, home).status, "FAIL", cmd);
  }
});

// Runs on every OS; on win32 process.execPath is the real "C:\Program Files\nodejs\node.exe" form (D-VT-DOCTOR-CMD-1).
test("[D-VT-DOCTOR-CMD-1] doctor-config/D3 owns the exact command setup builds from the real process.execPath", async (t) => {
  const { hookCommandString } = await import("../../../src/setup/registry.ts");
  const cmd = hookCommandString({ hookCommand: [process.execPath, path.join(tmp(t), "dir with space", "hook.mjs"), "--agent", "codex"] });
  const home = tmp(t);
  const row = codexInstall(home, { cmd });
  const d3 = checkHostConfig(row, { HOME: home, USERPROFILE: home }, home);
  assert.equal(d3.status, "PASS", `${cmd}: ${d3.detail}`);
});

// GEM-WIN-4: Gemini and Qwen ship their hooks inside the extension (<ext>/hooks/hooks.json, <ext>/hooks/qwen.json), not in
// ~/.<agent>/settings.json. Gemini's command names the script as "${extensionPath}${/}hook.mjs" (the host fills ${/} with
// the OS separator). Runs on every OS: the files come from the real generator, the paths are plain temp dirs.
async function extensionInstall(t, id, mutate = (s) => s) {
  const { generateManifests } = await import("../../../build/manifests.ts");
  const base = tmp(t);
  const out = path.join(base, "out");
  mkdirSync(out);
  generateManifests(out);
  const home = path.join(base, "home");
  const ext = path.join(home, `.${id}`, "extensions", "context-mode");
  mkdirSync(path.join(ext, "hooks"), { recursive: true });
  const file = id === "gemini" ? "hooks.json" : `${id}.json`;
  writeFileSync(path.join(ext, "hooks", file), mutate(readFileSync(path.join(out, "hooks", file), "utf8")), "utf8");
  return { home, row: getAdapter(id), file: path.join(ext, "hooks", file) };
}

for (const id of ["gemini", "qwen"]) {
  test(`[GEM-WIN-4] doctor-config/D3 reads the ${id} extension hook file the build generates and passes`, async (t) => {
    const { home, row } = await extensionInstall(t, id);
    const d3 = checkHostConfig(row, { HOME: home, USERPROFILE: home }, home);
    assert.equal(d3.status, "PASS", d3.detail);
  });

  test(`[GEM-WIN-4] doctor-config/D3 fails a ${id} extension whose hook command is not ours`, async (t) => {
    const { home, row } = await extensionInstall(t, id, (s) => s.replaceAll("hook.mjs", "other.mjs"));
    assert.equal(checkHostConfig(row, { HOME: home, USERPROFILE: home }, home).status, "FAIL");
  });
}

test("[GEM-WIN-4] doctor-config/D3 gemini: the ${/} token is a separator, a bare ${extensionPath} suffix is not", async (t) => {
  const real = await extensionInstall(t, "gemini");
  assert.match(readFileSync(real.file, "utf8"), /\$\{extensionPath\}\$\{\/\}hook\.mjs/);
  const bad = await extensionInstall(t, "gemini", (s) => s.replaceAll("${extensionPath}${/}hook.mjs", "${extensionPath}hook.mjs"));
  assert.equal(checkHostConfig(bad.row, { HOME: bad.home, USERPROFILE: bad.home }, bad.home).status, "FAIL");
});

// D-DOC-D3-ROOT-1: Claude Code 2.1.311 puts the plugin under plugins/cache/<marketplace>/context-mode/<version> and records
// that dir as installPath. D3 must read hooks/claude-code.json from there (tester report 2, next.8: "wrong: hook entries").
for (const [name, layout] of [["versioned", true], ["flat", false]]) {
  for (const spaced of [false, true]) {
    test(`[D-DOC-D3-ROOT-1] doctor-config/D3 claude-code ${name} plugin cache${spaced ? ", space in HOME" : ""} passes`, async (t) => {
      const { generateManifests } = await import("../../../build/manifests.ts");
      const base = tmp(t);
      const out = path.join(base, "out");
      mkdirSync(out);
      generateManifests(out);
      const home = path.join(base, spaced ? "my home" : "home");
      const plugins = path.join(home, ".claude", "plugins");
      const root = layout ? path.join(plugins, "cache", "context-mode", "context-mode", "2.0.0-next.8") : path.join(plugins, "cache", "mp", "context-mode");
      put(path.join(root, "hooks", "claude-code.json"), readFileSync(path.join(out, "hooks", "claude-code.json"), "utf8"));
      if (layout) put(path.join(plugins, "installed_plugins.json"), JSON.stringify({ version: 2, plugins: { "context-mode@context-mode": [{ scope: "user", installPath: root }] } }));
      const d3 = checkHostConfig(getAdapter("claude-code"), { HOME: home, USERPROFILE: home }, home);
      assert.equal(d3.status, "PASS", d3.detail);
    });
  }
}
