/**
 * adapters/copilot-cli — GitHub Copilot CLI platform adapter.
 *
 * Extends CopilotBaseAdapter with Copilot CLI-specific logic:
 *   - extractSessionId: input.sessionId fallback
 *   - getProjectDir: COPILOT_CWD (else process.cwd())
 *   - getSessionDir: ~/.copilot/context-mode/sessions (honors COPILOT_HOME)
 *   - checkPluginRegistration: WARN (not reliably CLI-inspectable)
 *   - getInstalledVersion: best-effort based on hook config presence
 */

import {
  readFileSync,
  mkdirSync,
  accessSync,
  constants,
} from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";

import { CopilotBaseAdapter } from "../copilot-base.js";
import { resolveContextModeDataRoot } from "../base.js";
import type { CopilotHookInput, CopilotHookModule } from "../copilot-base.js";

import type {
  DiagnosticResult,
} from "../types.js";

import {
  HOOK_TYPES as COPILOT_CLI_HOOK_NAMES,
  HOOK_SCRIPTS as COPILOT_CLI_HOOK_SCRIPTS,
  buildHookCommand as buildCopilotCliHookCommand,
} from "./hooks.js";

export class CopilotCliAdapter extends CopilotBaseAdapter {
  constructor() {
    super([".copilot"]);
  }

  readonly name = "GitHub Copilot CLI";

  protected readonly hookModule: CopilotHookModule = {
    HOOK_TYPES: COPILOT_CLI_HOOK_NAMES,
    HOOK_SCRIPTS: COPILOT_CLI_HOOK_SCRIPTS,
    buildHookCommand: buildCopilotCliHookCommand,
  };

  protected readonly hookSubdir = "copilot-cli";

  protected extractSessionId(input: CopilotHookInput): string {
    if (input.sessionId) return input.sessionId;
    return `pid-${process.ppid}`;
  }

  protected getProjectDir(): string {
    return process.env.COPILOT_CWD || process.cwd();
  }

  getSessionDir(): string {
    // Consistent with VS Code Copilot: CONTEXT_MODE_DATA_DIR wins when set.
    const override = resolveContextModeDataRoot();
    if (override) {
      const overrideDir = join(override, "context-mode", "sessions");
      mkdirSync(overrideDir, { recursive: true });
      return overrideDir;
    }

    const configHome = process.env.COPILOT_HOME
      ? resolve(process.env.COPILOT_HOME)
      : join(homedir(), ".copilot");

    const dir = join(configHome, "context-mode", "sessions");
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  /**
   * Copilot platforms honor .github/copilot-instructions.md per project.
   * Always returned absolute, resolved against the supplied `projectDir`.
   */
  getConfigDir(projectDir?: string): string {
    return resolve(projectDir ?? this.getProjectDir(), ".github");
  }

  getInstructionFiles(): string[] {
    return ["copilot-instructions.md"];
  }

  validateHooks(pluginRoot: string): DiagnosticResult[] {
    const results: DiagnosticResult[] = [];

    const hooksDir = resolve(".github", "hooks");
    try {
      accessSync(hooksDir, constants.R_OK);
    } catch {
      results.push({
        check: "Hooks directory",
        status: "fail",
        message: ".github/hooks/ directory not found",
        fix: "context-mode upgrade --platform copilot-cli",
      });
      return results;
    }

    const hookConfigPath = resolve(hooksDir, "context-mode.json");
    try {
      const raw = readFileSync(hookConfigPath, "utf-8");
      const config = JSON.parse(raw) as Record<string, unknown>;
      const hooks = config.hooks as Record<string, unknown> | undefined;

      if (hooks?.[COPILOT_CLI_HOOK_NAMES.PRE_TOOL_USE]) {
        results.push({
          check: "PreToolUse hook",
          status: "pass",
          message: "PreToolUse hook configured in context-mode.json",
        });
      } else {
        results.push({
          check: "PreToolUse hook",
          status: "fail",
          message: "PreToolUse not found in context-mode.json",
          fix: "context-mode upgrade --platform copilot-cli",
        });
      }

      if (hooks?.[COPILOT_CLI_HOOK_NAMES.SESSION_START]) {
        results.push({
          check: "SessionStart hook",
          status: "pass",
          message: "SessionStart hook configured in context-mode.json",
        });
      } else {
        results.push({
          check: "SessionStart hook",
          status: "fail",
          message: "SessionStart not found in context-mode.json",
          fix: "context-mode upgrade --platform copilot-cli",
        });
      }
    } catch {
      results.push({
        check: "Hook configuration",
        status: "fail",
        message: "Could not read .github/hooks/context-mode.json",
        fix: "context-mode upgrade --platform copilot-cli",
      });
    }

    results.push({
      check: "Hook scripts",
      status: "warn",
      message: `Copilot CLI hook wrappers should resolve to ${pluginRoot}/hooks/copilot-cli/*.mjs`,
    });

    results.push({
      check: "Matcher support",
      status: "warn",
      message: "Matchers are parsed but IGNORED — all hooks fire on all tools",
    });

    return results;
  }

  checkPluginRegistration(): DiagnosticResult {
    // Copilot CLI configuration is not reliably inspectable from a
    // project-scoped file (unlike VS Code's .vscode/mcp.json).
    return {
      check: "MCP registration",
      status: "warn",
      message: "Copilot CLI MCP server config is not reliably CLI-inspectable",
      fix: "Verify Copilot CLI has a context-mode MCP server entry",
    };
  }

  getInstalledVersion(): string {
    // Best-effort: if hook config exists and has hooks, treat as configured.
    const settings = this.readSettings();
    const hooks = settings?.hooks as Record<string, unknown> | undefined;
    if (hooks && Object.keys(hooks).length > 0) return "configured";
    return "unknown";
  }
}
