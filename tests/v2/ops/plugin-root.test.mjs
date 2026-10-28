// tests/v2/ops/plugin-root.test.mjs
// Spec: docs/v2/impl/07-tools-ops.md §1. resolvePluginRoot(adapter, env) switches on
// adapter.installMode, realpaths the result, never caches across calls, and throws
// PLUGIN_ROOT_MISSING when the resolved path does not exist.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { resolvePluginRoot } from "../../../src/core/ops/plugin-root.ts";
import { CtxError } from "../../../src/core/contracts/errors.ts";

function tmp(t) {
  // impl/07 §1 step 2 returns a realpath; macOS tmpdir() is a symlink (/var -> /private/var).
  const dir = realpathSync.native(mkdtempSync(path.join(tmpdir(), "cm-plugin-root-")));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("[M5] plugin-root/marketplace-resolves-under-HOME-claude-plugins-cache", (t) => {
  const home = tmp(t);
  const cache = path.join(home, ".claude", "plugins", "cache", "anthropics", "context-mode");
  mkdirSync(cache, { recursive: true });
  const root = resolvePluginRoot({ id: "claude-code", installMode: "marketplace" }, { HOME: home, USERPROFILE: home });
  assert.equal(root, cache);
});

test("[M5] plugin-root/plugin-mode-reads-current-symlink-under-DATA_ROOT", (t) => {
  const home = tmp(t);
  const target = path.join(home, "real-pi-plugin");
  mkdirSync(target, { recursive: true });
  const linkDir = path.join(home, ".context-mode", "plugins", "pi");
  mkdirSync(linkDir, { recursive: true });
  symlinkSync(target, path.join(linkDir, "current"));
  const root = resolvePluginRoot({ id: "pi", installMode: "plugin" }, { HOME: home, USERPROFILE: home });
  assert.equal(root, target);
});

test("[M5] plugin-root/missing-path-throws-PLUGIN_ROOT_MISSING", (t) => {
  const home = tmp(t);
  assert.throws(
    () => resolvePluginRoot({ id: "pi", installMode: "plugin" }, { HOME: home, USERPROFILE: home }),
    (err) => err instanceof CtxError && err.code === "PLUGIN_ROOT_MISSING",
  );
});

test("[M5] plugin-root/never-caches-across-calls: a second call after the dir changes sees the new path", (t) => {
  const home = tmp(t);
  const a = path.join(home, "a-root");
  const b = path.join(home, "b-root");
  mkdirSync(a, { recursive: true });
  mkdirSync(b, { recursive: true });
  const linkDir = path.join(home, ".context-mode", "plugins", "pi");
  mkdirSync(linkDir, { recursive: true });
  const link = path.join(linkDir, "current");
  symlinkSync(a, link);
  const first = resolvePluginRoot({ id: "pi", installMode: "plugin" }, { HOME: home, USERPROFILE: home });
  rmSync(link);
  symlinkSync(b, link);
  const second = resolvePluginRoot({ id: "pi", installMode: "plugin" }, { HOME: home, USERPROFILE: home });
  assert.notEqual(first, second);
  assert.equal(second, b);
});

// ---- D-DOC-D3-ROOT-1: the versioned plugin cache (Claude Code 2.1.311 layout) ----------------------------------
// Claude Code copies the plugin to <claude dir>/plugins/cache/<marketplace>/context-mode/<version> and records that dir as
// installPath in installed_plugins.json. The three source layouts all end in the same cache shape:
//   release branch (marketplace source "./"), context7 main subfolder (source "./plugins/claude-code"), npm/flat (no record).
import { writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const CLAUDE = { id: "claude-code", installMode: "marketplace" };
const put = (file, text) => { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, text, "utf8"); };
const record = (installPath, extra = {}) => JSON.stringify({ version: 2, plugins: { "context-mode@context-mode": [{ scope: "user", installPath, version: "2.0.0-next.8", ...extra }] } }, null, 2);

for (const [layout, source] of [["release-branch", "./"], ["context7-main-subfolder", "./plugins/claude-code"]]) {
  test(`[D-DOC-D3-ROOT-1] plugin-root/${layout}: installPath of installed_plugins.json is the root, not the parent dir`, (t) => {
    const home = tmp(t);
    const install = path.join(home, ".claude", "plugins", "cache", "context-mode", "context-mode", "2.0.0-next.8");
    mkdirSync(path.join(install, "hooks"), { recursive: true });
    put(path.join(home, ".claude", "plugins", "installed_plugins.json"), record(install, { source }));
    assert.equal(resolvePluginRoot(CLAUDE, { HOME: home, USERPROFILE: home }), install);
  });
}

test("[D-DOC-D3-ROOT-1] plugin-root/npm-flat: no record, one flat cache dir is still the root", (t) => {
  const home = tmp(t);
  const flat = path.join(home, ".claude", "plugins", "cache", "mp", "context-mode");
  mkdirSync(flat, { recursive: true });
  assert.equal(resolvePluginRoot(CLAUDE, { HOME: home, USERPROFILE: home }), flat);
});

test("[D-DOC-D3-ROOT-1] plugin-root/versioned-cache: CLAUDE_CONFIG_DIR and a space in HOME", (t) => {
  const base = tmp(t);
  const home = path.join(base, "my home");
  const cfg = path.join(base, "one drive", "claude cfg");
  const install = path.join(cfg, "plugins", "cache", "context-mode", "context-mode", "2.0.0-next.8");
  mkdirSync(install, { recursive: true });
  mkdirSync(home, { recursive: true });
  put(path.join(cfg, "plugins", "installed_plugins.json"), record(install));
  assert.equal(resolvePluginRoot(CLAUDE, { HOME: home, USERPROFILE: home, CLAUDE_CONFIG_DIR: cfg }), install);
});

test("[D-DOC-D3-ROOT-1] plugin-root/versioned-cache: a record that points at a missing dir is PLUGIN_ROOT_MISSING, no parent-dir pick", (t) => {
  const home = tmp(t);
  const cacheParent = path.join(home, ".claude", "plugins", "cache", "context-mode", "context-mode");
  mkdirSync(cacheParent, { recursive: true });
  put(path.join(home, ".claude", "plugins", "installed_plugins.json"), record(path.join(cacheParent, "9.9.9")));
  assert.throws(() => resolvePluginRoot(CLAUDE, { HOME: home, USERPROFILE: home }), (e) => e instanceof CtxError && e.code === "PLUGIN_ROOT_MISSING");
});

test("[D-DOC-D3-ROOT-1] plugin-root/versioned-cache: two live records and a bundle outside both is PLUGIN_ROOT_MISSING", (t) => {
  const home = tmp(t);
  const base = path.join(home, ".claude", "plugins", "cache", "context-mode", "context-mode");
  const a = path.join(base, "1.0.0");
  const b = path.join(base, "2.0.0");
  mkdirSync(a, { recursive: true });
  mkdirSync(b, { recursive: true });
  put(path.join(home, ".claude", "plugins", "installed_plugins.json"), JSON.stringify({ version: 2, plugins: { "context-mode@context-mode": [{ installPath: a }, { installPath: b }] } }));
  assert.throws(() => resolvePluginRoot(CLAUDE, { HOME: home, USERPROFILE: home }), (e) => e instanceof CtxError && e.code === "PLUGIN_ROOT_MISSING");
});

// The running bundle decides between two live records, and is the root when there is no record at all.
function runFromBundle(install, home, withRecord) {
  const script = path.join(install, "server.mjs");
  const mod = new URL("../../../src/core/ops/plugin-root.ts", import.meta.url).href;
  writeFileSync(script, `import { resolvePluginRoot } from ${JSON.stringify(mod)};\nconsole.log(resolvePluginRoot({ id: "claude-code", installMode: "marketplace" }, { HOME: ${JSON.stringify(home)}, USERPROFILE: ${JSON.stringify(home)} }));\n`);
  const r = spawnSync(process.execPath, [script], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}

test("[D-DOC-D3-ROOT-1] plugin-root/versioned-cache: the running bundle's dir wins between two live records", (t) => {
  const home = tmp(t);
  const base = path.join(home, ".claude", "plugins", "cache", "context-mode", "context-mode");
  const a = path.join(base, "1.0.0");
  const b = path.join(base, "2.0.0");
  mkdirSync(a, { recursive: true });
  mkdirSync(b, { recursive: true });
  put(path.join(home, ".claude", "plugins", "installed_plugins.json"), JSON.stringify({ version: 2, plugins: { "context-mode@context-mode": [{ installPath: a }, { installPath: b }] } }));
  assert.equal(runFromBundle(b, home), b);
});

test("[D-DOC-D3-ROOT-1] plugin-root/versioned-cache: no record, the running bundle inside the cache is the root", (t) => {
  const home = tmp(t);
  const install = path.join(home, ".claude", "plugins", "cache", "context-mode", "context-mode", "2.0.0-next.8");
  mkdirSync(install, { recursive: true });
  assert.equal(runFromBundle(install, home), install);
});

test("[D-DOC-D3-ROOT-1] plugin-root/windows-style: installPath strings keep their backslashes, drive, space and other plugins are skipped", async () => {
  const { recordedInstallPaths } = await import("../../../src/core/ops/plugin-root.ts");
  const winPath = "C:\\Users\\Ada Lovelace\\AppData\\Roaming\\Claude\\plugins\\cache\\context-mode\\context-mode\\2.0.0-next.8";
  const text = "\uFEFF" + JSON.stringify({ version: 2, plugins: {
    "context-mode@context-mode": [{ installPath: winPath }],
    "other@context-mode": [{ installPath: "C:\\x\\other" }],
    "context-mode@second": [{ installPath: "D:\\y\\context-mode\\1.0.0" }, { installPath: winPath }, { installPath: "" }, {}],
  } }, null, 2).split("\n").join("\r\n");
  assert.deepEqual(recordedInstallPaths(text), [winPath, "D:\\y\\context-mode\\1.0.0"]);
  assert.deepEqual(recordedInstallPaths("not json"), []);
  assert.deepEqual(recordedInstallPaths(JSON.stringify({ plugins: [] })), []);
});
