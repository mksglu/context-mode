/**
 * adapters/qoder — Qoder IDE platform adapter.
 *
 * Qoder uses JSON stdin/stdout hooks with settings.json-embedded config,
 * wire-format compatible with Claude Code (hookSpecificOutput).
 *
 * Supported IDE events: PreToolUse, PostToolUse, UserPromptSubmit, Stop.
 * NOT supported in IDE: SessionStart, PreCompact.
 *
 * Sources:
 *   - Hooks: https://docs.qoder.com/extensions/hooks
 *   - MCP: https://docs.qoder.com/user-guide/chat/model-context-protocol
 */

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { resolve, dirname } from "node:path";
import { homedir } from "node:os";

import { BaseAdapter } from "../base.js";

import {
  HOOK_TYPES as QODER_HOOK_TYPES,
  PRE_TOOL_USE_MATCHER_PATTERN as QODER_PRE_TOOL_USE_MATCHER_PATTERN,
  buildHookCommand as buildQoderHookCommand,
  isContextModeHook as isQoderContextModeHook,
  REQUIRED_HOOKS,
  OPTIONAL_HOOKS,
  type HookType,
  type QoderHookEntry,
} from "./hooks.js";

import type {
  HookAdapter,
  HookParadigm,
  PlatformCapabilities,
  DiagnosticResult,
  PreToolUseEvent,
  PostToolUseEvent,
  PreToolUseResponse,
  PostToolUseResponse,
  HookRegistration,
} from "../types.js";

// ─────────────────────────────────────────────────────────
// Qoder hook input types
// ─────────────────────────────────────────────────────────

interface QoderHookInput {
  hook_event_name?: string;
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_response?: unknown;
  prompt?: string;
  stop_hook_active?: boolean;
  last_assistant_message?: string;
  extra?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────
// Adapter implementation
// ─────────────────────────────────────────────────────────

export class QoderAdapter extends BaseAdapter implements HookAdapter {
  constructor() {
    super([".qoder"]);
  }

  readonly name = "Qoder";
  readonly paradigm: HookParadigm = "json-stdio";

  readonly capabilities: PlatformCapabilities = {
    preToolUse: true,
    postToolUse: true,
    preCompact: false,
    sessionStart: false,
    canModifyArgs: true,
    canModifyOutput: false,
    canInjectSessionContext: true,
  };

  // ── Input parsing ──────────────────────────────────────

  parsePreToolUseInput(raw: unknown): PreToolUseEvent {
    const input = raw as QoderHookInput;
    return {
      toolName: input.tool_name ?? "",
      toolInput: input.tool_input ?? {},
      sessionId: this.extractSessionId(input),
      projectDir: this.getProjectDir(input),
      raw,
    };
  }

  parsePostToolUseInput(raw: unknown): PostToolUseEvent {
    const input = raw as QoderHookInput;
    const toolResponse = input.tool_response;
    return {
      toolName: input.tool_name ?? "",
      toolInput: input.tool_input ?? {},
      toolOutput: toolResponse == null
        ? ""
        : typeof toolResponse === "string"
          ? toolResponse
          : JSON.stringify(toolResponse),
      sessionId: this.extractSessionId(input),
      projectDir: this.getProjectDir(input),
      raw,
    };
  }

  // ── Response formatting ────────────────────────────────
  // Wire format identical to Claude Code (hookSpecificOutput).

  formatPreToolUseResponse(response: PreToolUseResponse): unknown {
    switch (response.decision) {
      case "deny":
        return {
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "deny",
            permissionDecisionReason: response.reason ?? "Blocked by context-mode",
          },
        };
      case "ask":
        return {
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "ask",
          },
        };
      case "modify": {
        const ui = response.updatedInput ?? {};
        const isObj = ui !== null && typeof ui === "object" && !Array.isArray(ui);
        const isBashRedirect = isObj && "command" in ui;
        if (!isBashRedirect) {
          return {
            hookSpecificOutput: {
              hookEventName: "PreToolUse",
              updatedInput: ui,
            },
          };
        }
        const rawCmd = (ui as Record<string, unknown>).command;
        const cmd = typeof rawCmd === "string" ? rawCmd : "";
        const m = cmd.match(/^echo\s+"(.+)"$/s);
        const reason = m?.[1] ?? "Redirected to ctx_execute / ctx_fetch_and_index.";
        return {
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "deny",
            permissionDecisionReason: reason,
          },
        };
      }
      case "context":
        return {
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            additionalContext: response.additionalContext,
          },
        };
      default:
        return undefined;
    }
  }

  formatPostToolUseResponse(response: PostToolUseResponse): unknown {
    if (response.additionalContext) {
      return {
        hookSpecificOutput: {
          hookEventName: "PostToolUse",
          additionalContext: response.additionalContext,
        },
      };
    }
    return undefined;
  }

  // ── Stop hook ──────────────────────────────────────────

  parseStopInput(raw: unknown): { sessionId: string; status: string; lastMessage?: string } {
    const input = raw as QoderHookInput;
    return {
      sessionId: this.extractSessionId(input),
      status: "completed",
      lastMessage: input.last_assistant_message,
    };
  }

  formatStopResponse(response: { followupMessage?: string }): Record<string, unknown> {
    if (response.followupMessage) {
      return { decision: "block", reason: response.followupMessage };
    }
    return {};
  }

  // ── Configuration ──────────────────────────────────────

  getSettingsPath(): string {
    return resolve(".qoder", "settings.json");
  }

  override getConfigDir(projectDir?: string): string {
    return resolve(projectDir ?? process.cwd(), ".qoder");
  }

  override getInstructionFiles(): string[] {
    return ["QODER.md"];
  }

  generateHookConfig(_pluginRoot: string): HookRegistration {
    const hooks: Record<string, QoderHookEntry[]> = {};

    hooks[QODER_HOOK_TYPES.PRE_TOOL_USE] = [{
      matcher: QODER_PRE_TOOL_USE_MATCHER_PATTERN,
      hooks: [{ type: "command", command: buildQoderHookCommand(QODER_HOOK_TYPES.PRE_TOOL_USE) }],
    }];

    hooks[QODER_HOOK_TYPES.POST_TOOL_USE] = [{
      hooks: [{ type: "command", command: buildQoderHookCommand(QODER_HOOK_TYPES.POST_TOOL_USE) }],
    }];

    hooks[QODER_HOOK_TYPES.USER_PROMPT_SUBMIT] = [{
      hooks: [{ type: "command", command: buildQoderHookCommand(QODER_HOOK_TYPES.USER_PROMPT_SUBMIT) }],
    }];

    hooks[QODER_HOOK_TYPES.STOP] = [{
      hooks: [{ type: "command", command: buildQoderHookCommand(QODER_HOOK_TYPES.STOP) }],
    }];

    return hooks as unknown as HookRegistration;
  }

  readSettings(): Record<string, unknown> | null {
    for (const configPath of this.getCandidateSettingsPaths()) {
      try {
        const raw = readFileSync(configPath, "utf-8");
        return JSON.parse(raw) as Record<string, unknown>;
      } catch {
        continue;
      }
    }
    return null;
  }

  writeSettings(settings: Record<string, unknown>): void {
    const configPath = this.getSettingsPath();
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(configPath, JSON.stringify(settings, null, 2) + "\n", "utf-8");
  }

  // ── Diagnostics ────────────────────────────────────────

  validateHooks(_pluginRoot: string): DiagnosticResult[] {
    const results: DiagnosticResult[] = [];
    const settings = this.readSettings();

    if (!settings) {
      results.push({
        check: "Hook config",
        status: "fail",
        message: "No readable .qoder/settings.json found",
        fix: "context-mode upgrade",
      });
      return results;
    }

    const hooks = (settings.hooks ?? {}) as Record<string, QoderHookEntry[]>;
    results.push({
      check: "Hook config",
      status: "pass",
      message: "Loaded .qoder/settings.json",
    });

    for (const hookType of REQUIRED_HOOKS) {
      const entries = hooks[hookType] ?? [];
      const hasHook = entries.some((e) => isQoderContextModeHook(e, hookType));
      results.push({
        check: hookType,
        status: hasHook ? "pass" : "fail",
        message: hasHook
          ? `${hookType} hook configured`
          : `${hookType} hook not configured`,
        fix: hasHook ? undefined : "context-mode upgrade",
      });
    }

    for (const hookType of OPTIONAL_HOOKS) {
      const entries = hooks[hookType] ?? [];
      const hasHook = entries.some((e) => isQoderContextModeHook(e, hookType));
      results.push({
        check: hookType,
        status: hasHook ? "pass" : "warn",
        message: hasHook
          ? `${hookType} hook configured`
          : `${hookType} hook missing — some features will be reduced`,
      });
    }

    return results;
  }

  checkPluginRegistration(): DiagnosticResult {
    const mcpPaths = [
      resolve(".qoder", "shared_client", "mcp.json"),
      resolve(homedir(), ".qoder", "shared_client", "mcp.json"),
    ];

    for (const configPath of mcpPaths) {
      try {
        const raw = readFileSync(configPath, "utf-8");
        const config = JSON.parse(raw) as Record<string, unknown>;
        const servers = (config.mcpServers ?? {}) as Record<string, unknown>;
        if ("context-mode" in servers) {
          return {
            check: "MCP registration",
            status: "pass",
            message: `context-mode found in ${configPath}`,
          };
        }
      } catch {
        continue;
      }
    }

    return {
      check: "MCP registration",
      status: "warn",
      message: "Could not find context-mode in Qoder MCP config",
    };
  }

  getInstalledVersion(): string {
    return "standalone";
  }

  // ── Upgrade ────────────────────────────────────────────

  configureAllHooks(_pluginRoot: string): string[] {
    const settings = (this.readSettings() ?? {}) as Record<string, unknown>;
    const hooks = (settings.hooks ?? {}) as Record<string, QoderHookEntry[]>;
    const changes: string[] = [];

    const hookSpecs: Array<[HookType, string | undefined]> = [
      [QODER_HOOK_TYPES.PRE_TOOL_USE, QODER_PRE_TOOL_USE_MATCHER_PATTERN],
      [QODER_HOOK_TYPES.POST_TOOL_USE, undefined],
      [QODER_HOOK_TYPES.USER_PROMPT_SUBMIT, undefined],
      [QODER_HOOK_TYPES.STOP, undefined],
    ];

    for (const [hookType, matcher] of hookSpecs) {
      const entries = hooks[hookType] ?? [];
      if (!entries.some((e) => isQoderContextModeHook(e, hookType))) {
        const entry: QoderHookEntry = {
          hooks: [{ type: "command", command: buildQoderHookCommand(hookType) }],
        };
        if (matcher) entry.matcher = matcher;
        entries.push(entry);
        hooks[hookType] = entries;
        changes.push(`Added ${hookType} hook`);
      }
    }

    if (changes.length > 0) {
      settings.hooks = hooks;
      this.writeSettings(settings);
      changes.push(`Wrote hooks to ${this.getSettingsPath()}`);
    }
    return changes;
  }

  setHookPermissions(_pluginRoot: string): string[] {
    return [];
  }

  updatePluginRegistry(_pluginRoot: string, _version: string): void {
    // Qoder plugin registry is managed via MCP config
  }

  // ── Private helpers ────────────────────────────────────

  private getCandidateSettingsPaths(): string[] {
    return [
      this.getSettingsPath(),
      resolve(homedir(), ".qoder", "settings.json"),
    ];
  }

  private getProjectDir(input: QoderHookInput): string | undefined {
    return input.cwd || process.env.QODER_CWD || process.cwd();
  }

  private extractSessionId(input: QoderHookInput): string {
    if (input.session_id) return input.session_id;
    if (process.env.QODER_SESSION_ID) return process.env.QODER_SESSION_ID;
    return `pid-${process.ppid}`;
  }
}
