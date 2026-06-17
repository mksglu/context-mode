/**
 * cache-heal — consolidated test suite for the Brew node upgrade fix.
 *
 * Combines three previously-separate slices of the cache-heal hook system:
 *
 *   Slice 1 — extractNodePath / isStaleNodePath: detection primitives that
 *     find a node path inside a hook command and check if it still exists.
 *
 *   Slice 2 — buildHookCommand: emits the appropriate hook command shape:
 *       Unix    → bare script path (relies on shebang + chmod +x)
 *       Windows → '"<nodePath>" "<scriptPath>"' (no shebang support)
 *     Plus an integration check that a Unix shebang script + chmod +x is
 *     actually spawnable using just its bare path.
 *
 *   Slice 3 — selfHealCacheHealHook: end-to-end reconciliation that reads
 *     settings.json, detects stale node paths, rewrites them via
 *     buildHookCommand(), and ensures the script is shebang+exec-bit ready.
 *
 * Bug being fixed: After Brew upgrades Node, ~/.claude/settings.json contains
 * a hook command pointing at a versioned Cellar path that no longer exists:
 *
 *   "/opt/homebrew/Cellar/node/25.9.0_2/bin/node" "/Users/x/.claude/hooks/context-mode-cache-heal.mjs"
 *
 * Fix layer A (new installs, Unix): write hook script with shebang +
 *   chmod +x, register hook command as bare script path. `env` resolves
 *   node from PATH at runtime — survives any Node upgrade.
 * Fix layer B (self-heal): on every MCP boot, check if existing hook
 *   command references a node path that no longer exists. If stale,
 *   rewrite using the layer-A pattern.
 */

import { describe, test, expect, afterEach, beforeAll, afterAll } from "vitest";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  chmodSync,
  statSync,
  existsSync,
  cpSync,
  lstatSync,
  lutimesSync,
  mkdirSync,
  realpathSync,
  symlinkSync,
  utimesSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import {
  extractNodePath,
  isStaleNodePath,
  buildHookCommand,
  selfHealCacheHealHook,
} from "../../hooks/cache-heal-utils.mjs";
import { sweepStaleMcpJson } from "../../scripts/heal-installed-plugins.mjs";

// ─────────────────────────────────────────────────────────
// Shared fixtures
// ─────────────────────────────────────────────────────────

const cleanups: string[] = [];

afterEach(() => {
  while (cleanups.length) {
    const dir = cleanups.pop();
    if (dir) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* best effort */
      }
    }
  }
});

/** Create a tracked temp directory; auto-cleaned in afterEach. */
function makeTmp(prefix = "ctx-cache-heal-"): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  cleanups.push(dir);
  return dir;
}

/** Pretty-write JSON with trailing newline (matches settings.json convention). */
function writeJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n", "utf-8");
}

// ─────────────────────────────────────────────────────────
// Slice 1 — extractNodePath: pull leading executable path out of a hook command string
// ─────────────────────────────────────────────────────────

describe("extractNodePath", () => {
  test("extracts a quoted node path from the start of the command", () => {
    const cmd =
      '"/opt/homebrew/Cellar/node/25.9.0_2/bin/node" "/Users/vigo/.claude/hooks/context-mode-cache-heal.mjs"';
    expect(extractNodePath(cmd)).toBe(
      "/opt/homebrew/Cellar/node/25.9.0_2/bin/node",
    );
  });

  test("extracts a Windows-style quoted node path", () => {
    const cmd =
      '"C:/Program Files/nodejs/node.exe" "C:/Users/me/hook.mjs"';
    expect(extractNodePath(cmd)).toBe("C:/Program Files/nodejs/node.exe");
  });

  test("returns null when command is shebang-style (no node prefix)", () => {
    // Layer A registration: bare script path, shebang inside script handles node.
    const cmd = '"/Users/vigo/.claude/hooks/context-mode-cache-heal.mjs"';
    expect(extractNodePath(cmd)).toBeNull();
  });

  test("returns null for empty / non-string input", () => {
    expect(extractNodePath("")).toBeNull();
    // @ts-expect-error — runtime guard
    expect(extractNodePath(undefined)).toBeNull();
    // @ts-expect-error — runtime guard
    expect(extractNodePath(null)).toBeNull();
  });

  test("returns null when leading path doesn't look like a node executable", () => {
    const cmd = '"/usr/bin/python3" "/Users/x/script.py"';
    expect(extractNodePath(cmd)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────
// Slice 1 — isStaleNodePath: does the hook command reference a missing node binary?
// ─────────────────────────────────────────────────────────

describe("isStaleNodePath", () => {
  test("returns true when extracted node path doesn't exist on disk", () => {
    const cmd =
      '"/opt/homebrew/Cellar/node/99.0.0_999/bin/node" "/tmp/whatever.mjs"';
    expect(isStaleNodePath(cmd)).toBe(true);
  });

  test("returns false when extracted node path exists on disk", () => {
    const dir = makeTmp();
    const fakeNode = join(dir, "node");
    writeFileSync(fakeNode, "#!/bin/sh\necho fake\n");
    chmodSync(fakeNode, 0o755);
    const cmd = `"${fakeNode}" "/tmp/whatever.mjs"`;
    expect(isStaleNodePath(cmd)).toBe(false);
  });

  test("returns false when command has no node path (shebang style)", () => {
    // Bare script path — `env` resolves node, nothing to validate here.
    const cmd = '"/Users/vigo/.claude/hooks/context-mode-cache-heal.mjs"';
    expect(isStaleNodePath(cmd)).toBe(false);
  });

  test("returns false for empty input", () => {
    expect(isStaleNodePath("")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────
// Slice 2 — buildHookCommand: emit the right hook command shape per platform
// ─────────────────────────────────────────────────────────

describe("buildHookCommand", () => {
  test("Unix: produces just the script path (shebang-based)", () => {
    const out = buildHookCommand({
      scriptPath: "/Users/x/.claude/hooks/context-mode-cache-heal.mjs",
      platform: "darwin",
      nodePath: "/opt/homebrew/Cellar/node/25.9.0_2/bin/node",
    });
    expect(out).toBe(
      '"/Users/x/.claude/hooks/context-mode-cache-heal.mjs"',
    );
    expect(out).not.toContain("node");
  });

  test("Linux: same as darwin (any non-win32 platform)", () => {
    const out = buildHookCommand({
      scriptPath: "/home/x/.claude/hooks/context-mode-cache-heal.mjs",
      platform: "linux",
      nodePath: "/usr/bin/node",
    });
    expect(out).toBe(
      '"/home/x/.claude/hooks/context-mode-cache-heal.mjs"',
    );
  });

  test("Windows: produces nodePath + scriptPath, both quoted, forward slashes", () => {
    const out = buildHookCommand({
      scriptPath: "C:\\Users\\me\\.claude\\hooks\\context-mode-cache-heal.mjs",
      platform: "win32",
      nodePath: "C:\\Program Files\\nodejs\\node.exe",
    });
    expect(out).toBe(
      '"C:/Program Files/nodejs/node.exe" "C:/Users/me/.claude/hooks/context-mode-cache-heal.mjs"',
    );
  });

  test("Windows: throws when nodePath is missing", () => {
    expect(() =>
      buildHookCommand({
        scriptPath: "C:/x.mjs",
        platform: "win32",
      }),
    ).toThrow();
  });

  test("missing scriptPath throws", () => {
    expect(() =>
      buildHookCommand({ platform: "linux", nodePath: "/usr/bin/node" }),
    ).toThrow();
  });

  test.skipIf(process.platform === "win32")(
    "Unix: returned bare-script command can actually execute (shebang + chmod +x)",
    () => {
      const dir = makeTmp("ctx-cache-heal-build-");
      const scriptPath = join(dir, "context-mode-cache-heal.mjs");
      writeFileSync(
        scriptPath,
        '#!/usr/bin/env node\nprocess.stdout.write("OK");\n',
      );
      chmodSync(scriptPath, 0o755);

      const cmd = buildHookCommand({
        scriptPath,
        platform: process.platform,
        nodePath: process.execPath,
      });

      // The shell would just run this command directly — simulate that.
      // cmd is e.g. '"/tmp/xxx/context-mode-cache-heal.mjs"'.
      const unquoted = cmd.replace(/^"|"$/g, "");
      const r = spawnSync(unquoted, [], { encoding: "utf-8" });
      expect(r.status).toBe(0);
      expect(r.stdout).toBe("OK");
    },
  );
});

// ─────────────────────────────────────────────────────────
// Slice 3 — selfHealCacheHealHook: end-to-end reconciliation against settings.json
// ─────────────────────────────────────────────────────────

describe("selfHealCacheHealHook", () => {
  test("returns 'missing-settings' when settings.json doesn't exist", () => {
    const dir = makeTmp("ctx-cache-heal-self-");
    const settingsPath = join(dir, "settings.json");
    const result = selfHealCacheHealHook({
      settingsPath,
      scriptPath: "/whatever/script.mjs",
      platform: "linux",
      nodePath: "/usr/bin/node",
    });
    expect(result).toBe("missing-settings");
  });

  test("no-op when no cache-heal hook is registered", () => {
    const dir = makeTmp("ctx-cache-heal-self-");
    const settingsPath = join(dir, "settings.json");
    const original = {
      hooks: {
        SessionStart: [
          {
            hooks: [{ type: "command", command: "/usr/bin/echo hello" }],
          },
        ],
      },
    };
    writeJson(settingsPath, original);
    const before = readFileSync(settingsPath, "utf-8");

    const result = selfHealCacheHealHook({
      settingsPath,
      scriptPath: "/whatever/script.mjs",
      platform: "linux",
      nodePath: "/usr/bin/node",
    });

    expect(result).toBe("noop");
    expect(readFileSync(settingsPath, "utf-8")).toBe(before);
  });

  test("no-op when the cache-heal hook command is shebang-form (no node path)", () => {
    const dir = makeTmp("ctx-cache-heal-self-");
    const settingsPath = join(dir, "settings.json");
    const scriptPath = join(dir, "context-mode-cache-heal.mjs");
    // Doesn't matter that the script doesn't exist — the command alone is
    // shebang form which means there's no node path to validate.
    writeJson(settingsPath, {
      hooks: {
        SessionStart: [
          {
            hooks: [
              { type: "command", command: `"${scriptPath}"` },
            ],
          },
        ],
      },
    });
    const before = readFileSync(settingsPath, "utf-8");

    const result = selfHealCacheHealHook({
      settingsPath,
      scriptPath,
      platform: "linux",
      nodePath: "/usr/bin/node",
    });

    expect(result).toBe("noop");
    expect(readFileSync(settingsPath, "utf-8")).toBe(before);
  });

  test("no-op when the cache-heal hook command's node path exists", () => {
    const dir = makeTmp("ctx-cache-heal-self-");
    const settingsPath = join(dir, "settings.json");
    const scriptPath = join(dir, "context-mode-cache-heal.mjs");
    const fakeNode = join(dir, "node");
    writeFileSync(fakeNode, "#!/bin/sh\n");
    chmodSync(fakeNode, 0o755);

    writeJson(settingsPath, {
      hooks: {
        SessionStart: [
          {
            hooks: [
              {
                type: "command",
                command: `"${fakeNode}" "${scriptPath}"`,
              },
            ],
          },
        ],
      },
    });
    const before = readFileSync(settingsPath, "utf-8");

    const result = selfHealCacheHealHook({
      settingsPath,
      scriptPath,
      platform: "linux",
      nodePath: fakeNode,
    });

    expect(result).toBe("noop");
    expect(readFileSync(settingsPath, "utf-8")).toBe(before);
  });

  test("Unix: rewrites command when node path is stale", () => {
    const dir = makeTmp("ctx-cache-heal-self-");
    const settingsPath = join(dir, "settings.json");
    const scriptPath = join(dir, "context-mode-cache-heal.mjs");
    // Pretend an old script exists (we simulate the upgrade case where the
    // script was already on disk before Brew nuked the node binary).
    writeFileSync(scriptPath, "console.log('heal')\n");

    const stalePath = join(dir, "totally-gone", "bin", "node");
    writeJson(settingsPath, {
      hooks: {
        SessionStart: [
          {
            hooks: [
              {
                type: "command",
                command: `"${stalePath}" "${scriptPath}"`,
              },
            ],
          },
        ],
      },
    });

    const result = selfHealCacheHealHook({
      settingsPath,
      scriptPath,
      platform: "linux",
      nodePath: "/usr/bin/node",
    });

    expect(result).toBe("healed");
    const after = JSON.parse(readFileSync(settingsPath, "utf-8"));
    const cmd = after.hooks.SessionStart[0].hooks[0].command;
    // Unix-form: just the script path, quoted, no node prefix.
    // buildHookCommand normalizes backslashes → forward slashes for cross-platform safety.
    expect(cmd).toBe(`"${scriptPath.replace(/\\/g, "/")}"`);
    expect(cmd).not.toContain("/totally-gone/");

    // Script should now have shebang + exec bit.
    const content = readFileSync(scriptPath, "utf-8");
    expect(content.startsWith("#!/usr/bin/env node\n")).toBe(true);
    // Exec bit only meaningful on POSIX hosts — NTFS ignores chmod 0o755.
    if (process.platform !== "win32") {
      const mode = statSync(scriptPath).mode & 0o777;
      expect(mode).toBe(0o755);
    }
  });

  test("Windows: rewrites stale command using execPath form", () => {
    const dir = makeTmp("ctx-cache-heal-self-");
    const settingsPath = join(dir, "settings.json");
    const scriptPath = join(dir, "context-mode-cache-heal.mjs");
    writeFileSync(scriptPath, "console.log('heal')\n");

    const stalePath = join(dir, "old-cellar", "node");
    writeJson(settingsPath, {
      hooks: {
        SessionStart: [
          {
            hooks: [
              {
                type: "command",
                command: `"${stalePath}" "${scriptPath}"`,
              },
            ],
          },
        ],
      },
    });

    const winNode = "C:\\Program Files\\nodejs\\node.exe";
    const result = selfHealCacheHealHook({
      settingsPath,
      scriptPath,
      platform: "win32",
      nodePath: winNode,
    });

    expect(result).toBe("healed");
    const after = JSON.parse(readFileSync(settingsPath, "utf-8"));
    const cmd = after.hooks.SessionStart[0].hooks[0].command;
    expect(cmd).toContain('"C:/Program Files/nodejs/node.exe"');
    expect(cmd).toContain(scriptPath.replace(/\\/g, "/"));
    expect(cmd).not.toContain("/old-cellar/");
  });

  test("preserves other hooks unchanged", () => {
    const dir = makeTmp("ctx-cache-heal-self-");
    const settingsPath = join(dir, "settings.json");
    const scriptPath = join(dir, "context-mode-cache-heal.mjs");
    writeFileSync(scriptPath, "console.log('heal')\n");
    const stalePath = join(dir, "totally-gone", "bin", "node");

    writeJson(settingsPath, {
      hooks: {
        SessionStart: [
          {
            hooks: [
              {
                type: "command",
                command: '"/usr/bin/echo" "unrelated hook"',
              },
            ],
          },
          {
            hooks: [
              {
                type: "command",
                command: `"${stalePath}" "${scriptPath}"`,
              },
            ],
          },
        ],
        UserPromptSubmit: [
          {
            hooks: [
              { type: "command", command: '"/usr/local/bin/other-tool"' },
            ],
          },
        ],
      },
    });

    const result = selfHealCacheHealHook({
      settingsPath,
      scriptPath,
      platform: "linux",
      nodePath: "/usr/bin/node",
    });

    expect(result).toBe("healed");
    const after = JSON.parse(readFileSync(settingsPath, "utf-8"));
    expect(after.hooks.SessionStart[0].hooks[0].command).toBe(
      '"/usr/bin/echo" "unrelated hook"',
    );
    // buildHookCommand normalizes backslashes → forward slashes for cross-platform safety.
    expect(after.hooks.SessionStart[1].hooks[0].command).toBe(
      `"${scriptPath.replace(/\\/g, "/")}"`,
    );
    expect(after.hooks.UserPromptSubmit[0].hooks[0].command).toBe(
      '"/usr/local/bin/other-tool"',
    );
  });

  test("does not touch settings.json when nothing needs healing", () => {
    const dir = makeTmp("ctx-cache-heal-self-");
    const settingsPath = join(dir, "settings.json");
    writeJson(settingsPath, { hooks: {} });
    const beforeMtime = statSync(settingsPath).mtimeMs;

    selfHealCacheHealHook({
      settingsPath,
      scriptPath: "/whatever",
      platform: "linux",
      nodePath: "/usr/bin/node",
    });

    // mtime should be unchanged — we never wrote.
    expect(statSync(settingsPath).mtimeMs).toBe(beforeMtime);
  });

  test("survives malformed settings.json without throwing", () => {
    const dir = makeTmp("ctx-cache-heal-self-");
    const settingsPath = join(dir, "settings.json");
    writeFileSync(settingsPath, "{not json", "utf-8");
    expect(() =>
      selfHealCacheHealHook({
        settingsPath,
        scriptPath: "/whatever",
        platform: "linux",
        nodePath: "/usr/bin/node",
      }),
    ).not.toThrow();
    // file untouched
    expect(readFileSync(settingsPath, "utf-8")).toBe("{not json");
    // existsSync sanity — still there
    expect(existsSync(settingsPath)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────
// Slice 4 — sweepStaleMcpJson: remove cache-baked `.mcp.json` files (#609)
//
// Background: cli.ts upgrade() wrote `.mcp.json` into every per-version
// plugin-cache dir starting with #411. PR #531 (9261377) removed `.mcp.json`
// from `package.json files[]` so the npm tarball no longer ships it, but
// the cli-side write persisted — every `/ctx-upgrade` re-baked a new
// per-version copy. When Claude Code's native plugin manager auto-update
// later copies a previous version's `.mcp.json` forward into a fresh
// version dir, the stale start.mjs absolute path goes with it.
//
// The architectural fix is "don't ship `.mcp.json` from the cache layer
// at all" — `.claude-plugin/plugin.json.mcpServers` is already the canonical
// MCP source. `sweepStaleMcpJson` removes any pre-existing `.mcp.json` from
// every per-version cache directory so the previous-version-carry vector
// can't replay across upgrades.
// ─────────────────────────────────────────────────────────

describe("sweepStaleMcpJson", () => {
  function makeCacheLayout(): {
    pluginCacheRoot: string;
    pluginKey: string;
    versionDirs: string[];
  } {
    const dir = makeTmp("ctx-sweep-");
    // Match the real cache layout: <cacheRoot>/<owner>/<plugin>/<version>/
    const pluginCacheRoot = join(dir, "cache");
    const pluginKey = "context-mode@context-mode";
    const ownerDir = join(pluginCacheRoot, "context-mode", "context-mode");
    const versionDirs = ["1.0.135", "1.0.136", "1.0.137"].map((v) =>
      join(ownerDir, v),
    );
    for (const vd of versionDirs) {
      writeFileSync(
        join(makeDir(vd), ".mcp.json"),
        JSON.stringify({
          mcpServers: {
            "context-mode": {
              command: "node",
              args: ["${CLAUDE_PLUGIN_ROOT}/start.mjs"],
            },
          },
        }),
      );
    }
    return { pluginCacheRoot, pluginKey, versionDirs };
  }

  /** Make a dir + return it. */
  function makeDir(p: string): string {
    // mkdirSync via writeFileSync requires parent existence — use a small inline helper.
    const { mkdirSync } = require("node:fs") as typeof import("node:fs");
    mkdirSync(p, { recursive: true });
    return p;
  }

  test("removes .mcp.json from every per-version cache dir", () => {
    const { pluginCacheRoot, pluginKey, versionDirs } = makeCacheLayout();

    for (const vd of versionDirs) {
      expect(existsSync(join(vd, ".mcp.json"))).toBe(true);
    }

    const result = sweepStaleMcpJson({ pluginCacheRoot, pluginKey });

    for (const vd of versionDirs) {
      expect(existsSync(join(vd, ".mcp.json"))).toBe(false);
    }
    expect(Array.isArray(result.removed)).toBe(true);
    expect(result.removed.length).toBe(versionDirs.length);
    for (const removedPath of result.removed) {
      expect(removedPath).toContain(".mcp.json");
    }
  });

  test("no-op when no .mcp.json files exist in any version dir", () => {
    const dir = makeTmp("ctx-sweep-empty-");
    const pluginCacheRoot = join(dir, "cache");
    const ownerDir = join(pluginCacheRoot, "context-mode", "context-mode");
    makeDir(join(ownerDir, "1.0.137"));

    const result = sweepStaleMcpJson({
      pluginCacheRoot,
      pluginKey: "context-mode@context-mode",
    });

    expect(result.removed).toEqual([]);
  });

  test("returns 'no-cache-root' when pluginCacheRoot does not exist", () => {
    const dir = makeTmp("ctx-sweep-missing-");
    const result = sweepStaleMcpJson({
      pluginCacheRoot: join(dir, "absent"),
      pluginKey: "context-mode@context-mode",
    });
    expect(result.removed).toEqual([]);
    expect(result.skipped).toBe("no-cache-root");
  });

  test("path-traversal guard: refuses pluginKey that escapes cacheRoot", () => {
    // pluginKey is split to derive owner + plugin segments. A malicious
    // pluginKey shape (with .. segments) MUST not allow the sweep to walk
    // outside `pluginCacheRoot`.
    const { pluginCacheRoot } = makeCacheLayout();
    const result = sweepStaleMcpJson({
      pluginCacheRoot,
      pluginKey: "../../etc@passwd",
    });
    expect(result.removed).toEqual([]);
    // Either skipped with a guard reason OR safely no-op. The point is
    // that no file outside pluginCacheRoot was touched and the call did
    // not throw.
    expect(result).toBeDefined();
  });

  test("never touches sibling files in the version dir", () => {
    const { pluginCacheRoot, pluginKey, versionDirs } = makeCacheLayout();
    // Drop a sibling file we MUST not touch.
    for (const vd of versionDirs) {
      writeFileSync(join(vd, "plugin-manifest.txt"), "DO NOT DELETE", "utf-8");
    }

    sweepStaleMcpJson({ pluginCacheRoot, pluginKey });

    for (const vd of versionDirs) {
      expect(existsSync(join(vd, "plugin-manifest.txt"))).toBe(true);
      expect(readFileSync(join(vd, "plugin-manifest.txt"), "utf-8")).toBe(
        "DO NOT DELETE",
      );
    }
  });

  test("survives a version dir whose `.mcp.json` cannot be removed (best-effort)", () => {
    // The sweep MUST never throw — best-effort like the rest of the heal
    // family. Construct a scenario where one removal will silently fail
    // (target is missing between scan and remove); the others must still
    // succeed.
    const { pluginCacheRoot, pluginKey, versionDirs } = makeCacheLayout();
    // Pre-delete one of the .mcp.json files between layout-build and sweep.
    // The sweep will encounter "ENOENT on rm" mid-walk and must shrug.
    const { unlinkSync } = require("node:fs") as typeof import("node:fs");
    unlinkSync(join(versionDirs[0], ".mcp.json"));

    expect(() =>
      sweepStaleMcpJson({ pluginCacheRoot, pluginKey }),
    ).not.toThrow();

    // The remaining two SHOULD have been removed.
    expect(existsSync(join(versionDirs[1], ".mcp.json"))).toBe(false);
    expect(existsSync(join(versionDirs[2], ".mcp.json"))).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────
// Slice 5 — Issues #814 / #807: version-dir cleanup must leave a breadcrumb
//
// sessionstart.mjs age-gated cleanup (#181) deletes old plugin cache version
// dirs, but sessions that loaded hooks before an auto-update keep the old
// version's absolute paths baked into their hook configuration. Deleting the
// dir without leaving a forwarding link strands those sessions: every
// subsequent hook call fails with "Plugin directory does not exist" until the
// session is restarted (~3k errors over 6h observed in #807). These tests run
// the real sessionstart.mjs against a fake plugin-cache layout and assert the
// swept version dir is replaced by a symlink (junction on Windows) pointing at
// the live version.
// ─────────────────────────────────────────────────────────

const BREADCRUMB_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("Issues #814/#807 — cleanup leaves a breadcrumb to the live version", () => {
  let fakeRoot: string;
  let cacheParent: string;
  let currentDir: string;
  let fakeProjectDir: string;
  let fakeHomeDir: string;

  const TWO_HOURS_AGO = new Date(Date.now() - 2 * 3600_000);

  function runSessionStart(sessionId: string) {
    return spawnSync("node", [join(currentDir, "hooks", "sessionstart.mjs")], {
      input: JSON.stringify({ session_id: sessionId, source: "startup" }),
      encoding: "utf-8",
      timeout: 60_000,
      env: {
        ...process.env,
        CLAUDE_PLUGIN_ROOT: currentDir,
        CLAUDE_PROJECT_DIR: fakeProjectDir,
        CLAUDE_SESSION_ID: sessionId,
        CONTEXT_MODE_PLATFORM: "claude-code",
        HOME: fakeHomeDir,
        USERPROFILE: fakeHomeDir,
      },
    });
  }

  beforeAll(() => {
    fakeRoot = mkdtempSync(join(tmpdir(), "ctx-breadcrumb-"));
    // The cleanup only fires when CLAUDE_PLUGIN_ROOT matches
    // .../plugins/cache/<owner>/<plugin>/<version>.
    cacheParent = join(fakeRoot, "plugins", "cache", "context-mode", "context-mode");
    currentDir = join(cacheParent, "1.0.200");
    mkdirSync(currentDir, { recursive: true });

    // A working plugin install inside the current version dir.
    cpSync(join(BREADCRUMB_ROOT, "hooks"), join(currentDir, "hooks"), { recursive: true });
    cpSync(join(BREADCRUMB_ROOT, "package.json"), join(currentDir, "package.json"));
    if (existsSync(join(BREADCRUMB_ROOT, "node_modules"))) {
      symlinkSync(join(BREADCRUMB_ROOT, "node_modules"), join(currentDir, "node_modules"));
    }

    fakeProjectDir = mkdtempSync(join(tmpdir(), "ctx-breadcrumb-project-"));
    fakeHomeDir = mkdtempSync(join(tmpdir(), "ctx-breadcrumb-home-"));
  });

  afterAll(() => {
    for (const dir of [fakeRoot, fakeProjectDir, fakeHomeDir]) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* best effort */
      }
    }
  });

  test("an aged-out real version dir is replaced by a link to the current version", () => {
    const oldDir = join(cacheParent, "1.0.100");
    mkdirSync(join(oldDir, "hooks"), { recursive: true });
    writeFileSync(join(oldDir, "hooks", "pretooluse.mjs"), "// stale version\n");
    utimesSync(oldDir, TWO_HOURS_AGO, TWO_HOURS_AGO);

    const result = runSessionStart("breadcrumb-real-dir");
    expect(result.status).toBe(0);

    // The stale dir's contents are gone, but the path still resolves:
    // a session pinned to .../1.0.100/hooks/... follows the breadcrumb
    // into the live version instead of erroring.
    expect(lstatSync(oldDir).isSymbolicLink()).toBe(true);
    expect(realpathSync(oldDir)).toBe(realpathSync(currentDir));
    expect(existsSync(join(oldDir, "hooks", "sessionstart.mjs"))).toBe(true);
  });

  test("a stale breadcrumb pointing at a removed intermediate version is re-pointed at the live root", () => {
    // Simulate a chain of updates: 1.0.050's breadcrumb targets 1.0.150,
    // which has since been deleted itself — the link is dangling.
    const danglingTarget = join(cacheParent, "1.0.150");
    const oldLink = join(cacheParent, "1.0.050");
    symlinkSync(danglingTarget, oldLink, process.platform === "win32" ? "junction" : undefined);
    lutimesSync(oldLink, TWO_HOURS_AGO, TWO_HOURS_AGO);

    const result = runSessionStart("breadcrumb-stale-link");
    expect(result.status).toBe(0);

    expect(lstatSync(oldLink).isSymbolicLink()).toBe(true);
    expect(realpathSync(oldLink)).toBe(realpathSync(currentDir));
  });

  test("a fresh version dir is left alone (#644 age gate still respected)", () => {
    const freshDir = join(cacheParent, "1.0.199");
    mkdirSync(freshDir, { recursive: true });
    writeFileSync(join(freshDir, "marker.txt"), "fresh\n");

    const result = runSessionStart("breadcrumb-fresh-dir");
    expect(result.status).toBe(0);

    expect(lstatSync(freshDir).isDirectory()).toBe(true);
    expect(existsSync(join(freshDir, "marker.txt"))).toBe(true);
  });
});
