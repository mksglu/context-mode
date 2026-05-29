/**
 * BaseAdapter — shared implementation for methods identical across all adapters.
 *
 * Each concrete adapter extends this and provides platform-specific logic.
 *
 * Shared methods:
 *   - getSessionDir()       — builds session dir from sessionDirSegments
 *   - backupSettings()      — copies settings file to .bak
 *
 * Adapters with custom logic override the relevant method:
 *   - vscode-copilot: overrides getSessionDir (checks .github dir)
 *   - opencode: overrides getSessionDir (XDG_CONFIG_HOME / APPDATA)
 *              and backupSettings (calls checkPluginRegistration first)
 *   - openclaw: overrides backupSettings (searches 3 config paths)
 *
 * NOTE — C2 narrowing (2026-05): `getSessionDBPath` and `getSessionEventsPath`
 * were removed. Both were SHALLOW pure derivatives of `getSessionDir() +
 * projectDir` (interface complexity == implementation complexity). All
 * adapter-storage path computation now flows through ONE site:
 * `resolveSessionDbPath({ projectDir, sessionsDir: adapter.getSessionDir() })`
 * in `src/session/db.ts`. Adapters expose only `getSessionDir()` for
 * storage-related path concerns.
 *
 * Issue #649 — `CONTEXT_MODE_DATA_DIR` universal storage override. Many
 * adapters (Pi, OMP, Gemini CLI, Codex, Cursor, …) had storage hardcoded to
 * `~/.<platform>/context-mode/sessions/` with no env-var escape hatch. CI
 * runners on NFS homes, dev containers, and shared-workspace setups need to
 * point context-mode storage at a writable volume without patching source or
 * abusing the host platform's own config-dir variable. The override applies
 * only to context-mode-owned state (`getSessionDir`, `getMemoryDir`) — never
 * to platform-native config (`getConfigDir`, `getSettingsPath`), which must
 * stay where the host platform's own tooling expects it. Adapters that
 * override `getSessionDir`/`getMemoryDir` directly (claude-code, codex,
 * opencode, vscode-copilot) honor the override by routing through
 * `resolveContextModeDataRoot()` at the top of their override.
 */

import { join, resolve } from "node:path";
import {
  accessSync,
  copyFileSync,
  constants,
  mkdirSync,
} from "node:fs";
import { homedir } from "node:os";
import { hashProjectDirCanonical } from "../session/db.js";
import { symlinkEscapesRoot } from "../util/safe-project-write.js";

/**
 * Universal storage-root override. Returns the resolved absolute path when
 * `CONTEXT_MODE_DATA_DIR` is set to a non-blank value, otherwise `null` so
 * callers fall back to their platform-native default.
 *
 * Mirrors the `resolveClaudeConfigDir` contract for env-var handling
 * (whitespace guard, tilde expansion, relative-path resolution) so users
 * get one consistent set of rules across every override site.
 */
export function resolveContextModeDataRoot(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const raw = env.CONTEXT_MODE_DATA_DIR;
  if (!raw || raw.trim() === "") return null;
  if (raw.startsWith("~")) {
    return resolve(homedir(), raw.replace(/^~[/\\]?/, ""));
  }
  return resolve(raw);
}

export abstract class BaseAdapter {
  constructor(protected readonly sessionDirSegments: string[]) {}

  getSessionDir(): string {
    const override = resolveContextModeDataRoot();
    const dir = override
      ? join(override, "context-mode", "sessions")
      : join(homedir(), ...this.sessionDirSegments, "context-mode", "sessions");
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  /**
   * Default: build config dir from sessionDirSegments rooted at $HOME.
   *
   * Contract: ALWAYS returns an absolute path. Adapters with project-scoped
   * or non-home-rooted config dirs (cursor, vscode-copilot, jetbrains-copilot,
   * openclaw, opencode) override this and resolve their segments against
   * `projectDir` (or `process.cwd()` when omitted).
   *
   * NOT relocated by `CONTEXT_MODE_DATA_DIR` (#649). The platform owns its
   * settings.json / hooks.json / config.toml location — relocating that
   * would silently fork platform behaviour from the platform's own tooling.
   * Use `CLAUDE_CONFIG_DIR`, `CODEX_HOME`, `XDG_CONFIG_HOME`, etc. to move
   * platform-native config; use `CONTEXT_MODE_DATA_DIR` to move context-mode
   * storage independently.
   *
   * @param _projectDir Unused by the home-rooted default — accepted so
   *                    project-scoped overrides honor the same signature.
   */
  getConfigDir(_projectDir?: string): string {
    return join(homedir(), ...this.sessionDirSegments);
  }

  /**
   * Default: Claude Code convention. Most adapters override with their
   * own platform-specific instruction file name (AGENTS.md, GEMINI.md, ...).
   */
  getInstructionFiles(): string[] {
    return ["CLAUDE.md"];
  }

  /**
   * Default: <configDir>/memory/<projectHash>. Always absolute (configDir is
   * absolute by contract). Adapters with a different memory dir name (e.g.,
   * codex uses "memories" plural) override this.
   *
   * Issue #649: when `CONTEXT_MODE_DATA_DIR` is set, memory follows storage
   * to `<DATA_DIR>/context-mode/memory/` since persistent memory is
   * context-mode-owned state, not platform-native config.
   *
   * Issue #663: when `projectDir` is supplied the path is scoped via
   * `hashProjectDirCanonical(projectDir)` so two projects running in
   * parallel never share auto-memory contents. When omitted (legacy
   * callers), the unscoped path is returned for backwards compatibility.
   */
  getMemoryDir(projectDir?: string): string {
    const override = resolveContextModeDataRoot();
    const base = override
      ? join(override, "context-mode", "memory")
      : join(this.getConfigDir(), "memory");
    if (!projectDir) return base;
    return join(base, hashProjectDirCanonical(projectDir));
  }

  backupSettings(): string | null {
    const settingsPath = this.getSettingsPath();
    try {
      // Mirror the write guard (writeProjectConfigSafely): skip a config symlink
      // whose real target escapes the project, since copying through it would
      // pull an arbitrary file (e.g. ~/.ssh/id_rsa) into a repo-local .bak. An
      // in-root symlink (a dotfile manager's intra-repo link) stays in-tree, so
      // back it up the way the write follows it.
      if (symlinkEscapesRoot(settingsPath, process.cwd())) return null;
      accessSync(settingsPath, constants.R_OK);
      const backupPath = settingsPath + ".bak";
      copyFileSync(settingsPath, backupPath);
      return backupPath;
    } catch {
      return null;
    }
  }

  abstract getSettingsPath(): string;
}
