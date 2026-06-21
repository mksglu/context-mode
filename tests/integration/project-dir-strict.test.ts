/**
 * Issue #545 — server.ts getProjectDir() passes strictPlatform to resolveProjectDir.
 *
 * Without strict mode, a foreign workspace var (e.g. CLAUDE_PROJECT_DIR
 * leaked into Pi's MCP child env) wins the cascade and Pi's sessions write
 * into Claude Code's project. Slice 5 wires `strictPlatform: detectPlatform().platform`
 * for ALL adapters as defense in depth.
 *
 * This integration test exercises the wiring by importing the real resolver
 * and asserting that each platform's strict-mode call rejects foreign env
 * and accepts its own.
 */

import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveProjectDir } from "../../src/util/project-dir.js";
import { workspaceEnvVarsFor } from "../../src/adapters/detect.js";
import { getProjectDir } from "../../src/server.js";
import type { PlatformId } from "../../src/adapters/types.js";

// Build a foreign-leak env: every workspace var from every adapter set to
// a leak path. Used as the adversarial baseline for each platform.
function makeForeignLeakEnv(): Record<string, string> {
  return {
    CLAUDE_PROJECT_DIR: "/leak/claude",
    GEMINI_PROJECT_DIR: "/leak/gemini",
    VSCODE_CWD: "/leak/vscode",
    OPENCODE_PROJECT_DIR: "/leak/opencode",
    PI_WORKSPACE_DIR: "/leak/pi-ws",
    PI_PROJECT_DIR: "/leak/pi-project",
    IDEA_INITIAL_DIRECTORY: "/leak/idea",
    CURSOR_CWD: "/leak/cursor",
    QWEN_PROJECT_DIR: "/leak/qwen",
    PI_CODING_AGENT_DIR: "/leak/omp",
  };
}

describe("server getProjectDir wiring — strictPlatform for all adapters (issue #545)", () => {
  const cleanup: string[] = [];

  afterEach(() => {
    while (cleanup.length) {
      const p = cleanup.pop();
      if (p) try { rmSync(p, { recursive: true, force: true }); } catch {}
    }
  });

  // Adapters with at least one workspace var.
  const platformsWithOwnVar: ReadonlyArray<PlatformId> = [
    "claude-code",
    "gemini-cli",
    "cursor",
    "vscode-copilot",
    "jetbrains-copilot",
    "opencode",
    "qwen-code",
    "pi",
    "omp",
  ];

  // Adapters with no workspace var (rely on universal escape hatch / pwd / cwd).
  const platformsNoOwnVar: ReadonlyArray<PlatformId> = [
    "codex",
    "kilo",
    "kiro",
    "zed",
    "antigravity",
    "openclaw",
  ];

  for (const platform of platformsWithOwnVar) {
    it(`platform=${platform}: strict mode prefers own workspace var over foreign leaks`, () => {
      const ownVars = workspaceEnvVarsFor(platform);
      expect(ownVars.length).toBeGreaterThan(0);

      // Set foreign leaks AND own var. Strict mode must pick own.
      const leakEnv = makeForeignLeakEnv();
      // Override the FIRST own var with the canonical /own value. (Other
      // adapters' workspace vars are leaks above; this one is correct.)
      const env = { ...leakEnv, [ownVars[0]]: "/Users/x/own-project" };

      const result = resolveProjectDir({
        env,
        cwd: "/some/cwd",
        pwd: undefined,
        strictPlatform: platform,
      });
      expect(result).toBe("/Users/x/own-project");
    });
  }

  for (const platform of platformsNoOwnVar) {
    it(`platform=${platform} (no workspace var): strict mode falls back to CONTEXT_MODE_PROJECT_DIR`, () => {
      // Even with every foreign leak set, the universal escape hatch wins.
      const env = {
        ...makeForeignLeakEnv(),
        CONTEXT_MODE_PROJECT_DIR: "/Users/x/escape",
      };
      const result = resolveProjectDir({
        env,
        cwd: "/some/cwd",
        pwd: undefined,
        strictPlatform: platform,
      });
      expect(result).toBe("/Users/x/escape");
    });
  }

  it("every platform: with no own var set and no escape hatch, falls through to PWD", () => {
    // Keep the pure resolver matrix independent from the developer's live
    // Codex session logs. The production Codex branch intentionally checks
    // session logs before PWD, so this fixture must provide an empty home.
    const emptyCodexHome = mkdtempSync(join(tmpdir(), "ctx-empty-codex-home-"));
    cleanup.push(emptyCodexHome);

    const allPlatforms: ReadonlyArray<PlatformId> = [
      ...platformsWithOwnVar,
      ...platformsNoOwnVar,
    ];
    for (const platform of allPlatforms) {
      const result = resolveProjectDir({
        env: makeForeignLeakEnv(),
        cwd: "/anchor/cwd",
        pwd: "/Users/x/from-shell",
        strictPlatform: platform,
        codexHome: platform === "codex" ? emptyCodexHome : undefined,
      });
      // No own workspace var matches (we set leaks, not the platform's own
      // value). PWD is the next tier. PI / OMP have own vars set in the
      // leak env to /leak/* values though — those would win for them. So
      // distinguish: if the platform has a workspace var that the leak env
      // also sets, that "leak" value IS this platform's value (test artifact).
      // Use a stricter check: the result must NOT be from a foreign-only var.
      const ownVars = new Set(workspaceEnvVarsFor(platform));
      // Check: for any "/leak/*" the result is, the source var must be in ownVars.
      if (result.startsWith("/leak/")) {
        // Allowed only if this is the platform's own var.
        const matchedKey = Object.keys(makeForeignLeakEnv()).find(
          (k) => makeForeignLeakEnv()[k] === result,
        );
        expect(matchedKey).toBeDefined();
        expect(ownVars.has(matchedKey!)).toBe(true);
      } else {
        expect(result).toBe("/Users/x/from-shell");
      }
    }
  });
});

// ─────────────────────────────────────────────────────────
// Issue #45 — server.ts getProjectDir() must auto-detect "codex"
// platform and pass strictPlatform: "codex" + codexHome to
// resolveProjectDir() so the SessionMeta heuristic activates.
//
// Without this wiring, the Codex MCP child runs under whatever cwd
// the host inherited (often $HOME), the env cascade yields nothing
// (Codex has no workspace env var), and every project-aware tool
// ends up rooted at $HOME instead of the user's project.
//
// This test boots server.ts in a process state that mirrors a
// real Codex MCP child: CODEX_THREAD_ID set, no workspace env, a
// session.jsonl with meta.cwd on disk, CODEX_HOME pointed at the
// fixture. The assertion is `getProjectDir()` returns the
// session-log cwd — proving the Codex branch is reachable from
// the production callsite.
// ─────────────────────────────────────────────────────────

describe("getProjectDir() under Codex platform detection (issue #45)", () => {
  const cleanup: string[] = [];
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    // Snapshot every env var that could short-circuit the resolver.
    for (const k of [
      "CLAUDE_PROJECT_DIR", "GEMINI_PROJECT_DIR", "VSCODE_CWD",
      "OPENCODE_PROJECT_DIR", "PI_PROJECT_DIR", "PI_WORKSPACE_DIR",
      "IDEA_INITIAL_DIRECTORY", "CURSOR_CWD", "QWEN_PROJECT_DIR",
      "CONTEXT_MODE_PROJECT_DIR", "PI_CODING_AGENT_DIR",
      "CODEX_THREAD_ID", "CODEX_CI", "CODEX_HOME",
      "CONTEXT_MODE_PLATFORM",
    ]) {
      savedEnv[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    while (cleanup.length) {
      const p = cleanup.pop();
      if (p) try { rmSync(p, { recursive: true, force: true }); } catch {}
    }
  });

  it("recovers cwd from Codex session log when env is empty and Codex is the detected platform", async () => {
    // Fixture: tmp CODEX_HOME with one fresh session.jsonl carrying meta.cwd.
    const tmpHome = mkdtempSync(join(tmpdir(), "ctx-codex-server-"));
    cleanup.push(tmpHome);
    const sessionsDir = join(tmpHome, "sessions");
    mkdirSync(sessionsDir, { recursive: true });
    const expectedCwd = "/project/from-codex-session";
    writeFileSync(
      join(sessionsDir, "abc-123.jsonl"),
      JSON.stringify({ meta: { sessionId: "abc-123", cwd: expectedCwd } }) + "\n",
    );

    // Codex platform markers. CODEX_THREAD_ID is the canonical env
    // signal per src/adapters/detect.ts PLATFORM_ENV_VARS.
    process.env.CODEX_THREAD_ID = "thread-fixture";
    process.env.CODEX_HOME = tmpHome;
    // Force the detector to "codex" deterministically — clearer than
    // relying on CODEX_THREAD_ID alone (the detector also reads
    // ~/.claude existence which is true on dev machines).
    process.env.CONTEXT_MODE_PLATFORM = "codex";

    // server.ts captures `detectPlatform()` + env vars at call time
    // inside getProjectDir(), so a single static import + per-test env
    // setup is enough.
    expect(getProjectDir()).toBe(expectedCwd);
  });
});
