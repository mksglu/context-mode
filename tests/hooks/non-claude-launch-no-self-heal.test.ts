/**
 * start.mjs's cache-heal layer exists only to repair Claude Code's plugin cache,
 * and every write it makes lands in Claude Code's config tree. But start.mjs is
 * not Claude-only: the Codex plugin launches it from .codex-plugin/mcp.json with
 * CONTEXT_MODE_PLATFORM=codex. Unguarded, a Codex-only user boots context-mode
 * and gets a ~/.claude/hooks/ directory plus a SessionStart entry in a
 * settings.json they never asked for — Claude Code's config, invented for them.
 *
 * The guard keys on an explicitly declared platform rather than on Claude Code's
 * absence, because absence is not evidence: Claude Code never sets
 * CONTEXT_MODE_PLATFORM, so it must keep reaching the layer.
 *
 * The same reasoning covers the heal log. The `no-plugin-root` and
 * `not-claude-code` skips are the two branches that establish the caller is NOT
 * a Claude Code install, so writing a diagnostic for them plants evidence of one
 * in the very directory that should not have been touched.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");

let configDir: string;
const savedPlatform = process.env.CONTEXT_MODE_PLATFORM;
const savedConfigDir = process.env.CLAUDE_CONFIG_DIR;
const savedHome = process.env.HOME;

beforeEach(() => {
  configDir = mkdtempSync(join(tmpdir(), "ctx-heal-guard-"));
  process.env.CLAUDE_CONFIG_DIR = configDir;
  mkdirSync(join(configDir, "plugins", "cache"), { recursive: true });
});

afterEach(() => {
  rmSync(configDir, { recursive: true, force: true });
  if (savedPlatform === undefined) delete process.env.CONTEXT_MODE_PLATFORM;
  else process.env.CONTEXT_MODE_PLATFORM = savedPlatform;
  if (savedConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR;
  else process.env.CLAUDE_CONFIG_DIR = savedConfigDir;
  if (savedHome === undefined) delete process.env.HOME;
  else process.env.HOME = savedHome;
});

/** Boot start.mjs the way a plugin launcher does, and report what it touched. */
function boot(platform: string | undefined): {
  hooksDir: boolean;
  healHook: boolean;
  sessionStart: boolean;
} {
  if (platform === undefined) delete process.env.CONTEXT_MODE_PLATFORM;
  else process.env.CONTEXT_MODE_PLATFORM = platform;
  // HOME is redirected too: a stray write outside CLAUDE_CONFIG_DIR is the same
  // defect, and pointing HOME at the sandbox makes it observable.
  process.env.HOME = configDir;

  writeFileSync(
    join(configDir, "settings.json"),
    JSON.stringify({ hooks: {} }, null, 2),
  );

  const result = spawnSync(process.execPath, [join(repoRoot, "start.mjs")], {
    encoding: "utf8",
    timeout: 30_000,
    env: { ...process.env },
  });
  // A crash here means the guard broke the boot path, which is worse than the
  // leak — surface it instead of reporting a clean-looking skip.
  expect(result.status, result.stderr?.slice(-800)).toBe(0);

  const hooksDir = resolve(configDir, "hooks");
  const settings = JSON.parse(
    readFileSync(join(configDir, "settings.json"), "utf8"),
  );
  return {
    hooksDir: existsSync(hooksDir),
    healHook: existsSync(join(hooksDir, "context-mode-cache-heal.mjs")),
    sessionStart: Boolean(settings.hooks?.SessionStart?.length),
  };
}

describe("cache-heal layer only writes Claude Code's config for Claude Code", () => {
  it("a declared non-Claude platform creates nothing", () => {
    const touched = boot("codex");
    expect(
      touched.hooksDir,
      "created ~/.claude/hooks for a Codex-only user",
    ).toBe(false);
    expect(touched.healHook).toBe(false);
    expect(
      touched.sessionStart,
      "registered a SessionStart hook in Claude's settings.json",
    ).toBe(false);
  });

  it("an undeclared platform still self-heals (Claude Code never sets the var)", () => {
    // Absence is not evidence of a non-Claude launch. If this regressed, every
    // Claude Code user silently loses the cache heal.
    const touched = boot(undefined);
    expect(touched.hooksDir, "Claude Code lost its self-heal").toBe(true);
    expect(touched.healHook).toBe(true);
  });

  it("an explicit claude-code platform self-heals too", () => {
    expect(boot("claude-code").healHook).toBe(true);
  });
});

describe("the heal log records only runs that reached a Claude Code install", () => {
  const healLog = () =>
    join(configDir, "context-mode", "heal-partial-install.log");

  it("a non-CC pluginRoot writes no log line", () => {
    // The skip reason stays in the return value; the point is that proving the
    // caller is not Claude Code must not create Claude Code's config dir.
    process.env.CLAUDE_PLUGIN_ROOT = join(
      configDir,
      "plugins",
      "cache",
      "not-a-cc-cache",
    );
    const result = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `const m = await import(${JSON.stringify(join(repoRoot, "hooks", "heal-partial-install.mjs"))});
         const r = m.healPartialInstallFromMarketplace({});
         process.stdout.write(JSON.stringify(r));`,
      ],
      {
        encoding: "utf8",
        env: { ...process.env, CLAUDE_CONFIG_DIR: configDir },
        timeout: 30_000,
      },
    );
    expect(result.status, result.stderr?.slice(-500)).toBe(0);
    // The caller still learns why it was skipped.
    expect(JSON.parse(result.stdout).skipped).toBeTruthy();
    expect(
      existsSync(healLog()),
      "logged a skip that proves this is not a CC install",
    ).toBe(false);
    expect(existsSync(resolve(configDir, "context-mode"))).toBe(false);
  });
});
