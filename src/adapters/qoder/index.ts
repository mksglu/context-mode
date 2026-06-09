/**
 * adapters/qoder — Qoder IDE platform adapter.
 *
 * Qoder uses JSON stdin/stdout hooks with native plugin hook config,
 * wire-format compatible with Claude Code (hookSpecificOutput).
 *
 * Supported events: PreToolUse, PostToolUse, SessionStart, PreCompact,
 * UserPromptSubmit, and Stop.
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
import { resolve, dirname, join } from "node:path";
import { homedir } from "node:os";

import { BaseAdapter } from "../base.js";

import {
  HOOK_TYPES as QODER_HOOK_TYPES,
  PRE_TOOL_USE_MATCHER_PATTERN as QODER_PRE_TOOL_USE_MATCHER_PATTERN,
  buildHookCommand as buildQoderHookCommand,
  isContextModeHook as isQoderContextModeHook,
  REQUIRED_HOOKS,
  OPTIONAL_HOOKS,
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
  PreCompactEvent,
  SessionStartEvent,
  PreCompactResponse,
  SessionStartResponse,
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
  source?: string;
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
    preCompact: true,
    sessionStart: true,
    canModifyArgs: true,
    canModifyOutput: true,
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

  parsePreCompactInput(raw: unknown): PreCompactEvent {
    const input = raw as QoderHookInput;
    return { sessionId: this.extractSessionId(input), projectDir: this.getProjectDir(input), raw };
  }

  parseSessionStartInput(raw: unknown): SessionStartEvent {
    const input = raw as QoderHookInput;
    const rawSource = typeof input.source === "string" ? input.source : "startup";
    const source = (["startup", "compact", "resume", "clear"] as const).includes(rawSource as SessionStartEvent["source"])
      ? rawSource as SessionStartEvent["source"]
      : "startup";
    return { sessionId: this.extractSessionId(input), source, projectDir: this.getProjectDir(input), raw };
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
        return {
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "allow",
            updatedInput: response.updatedInput ?? {},
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
    if (response.additionalContext || response.updatedOutput !== undefined) {
      return {
        hookSpecificOutput: {
          hookEventName: "PostToolUse",
          ...(response.additionalContext ? { additionalContext: response.additionalContext } : {}),
          ...(response.updatedOutput !== undefined ? { updatedToolOutput: response.updatedOutput } : {}),
        },
      };
    }
    return undefined;
  }

  formatPreCompactResponse(response: PreCompactResponse): unknown {
    return response.context
      ? { hookSpecificOutput: { hookEventName: "PreCompact", additionalContext: response.context } }
      : {};
  }

  formatSessionStartResponse(response: SessionStartResponse): unknown {
    return response.context
      ? { hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: response.context } }
      : {};
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
    return join(this.getConfigDir(), "settings.json");
  }

  override getInstructionFiles(): string[] {
    return ["AGENTS.md"];
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

    hooks[QODER_HOOK_TYPES.SESSION_START] = [{
      matcher: "startup|resume|clear|compact",
      hooks: [{ type: "command", command: buildQoderHookCommand(QODER_HOOK_TYPES.SESSION_START) }],
    }];

    hooks[QODER_HOOK_TYPES.PRE_COMPACT] = [{
      hooks: [{ type: "command", command: buildQoderHookCommand(QODER_HOOK_TYPES.PRE_COMPACT) }],
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
    const root = process.env.QODER_PLUGIN_ROOT || _pluginRoot || process.cwd();
    let settings: Record<string, unknown> | null = null;
    try {
      settings = JSON.parse(readFileSync(join(root, ".qoder-plugin", "hooks.json"), "utf8")) as Record<string, unknown>;
    } catch {
      settings = this.readSettings();
    }

    if (!settings) {
      results.push({
        check: "Hook config",
        status: "fail",
        message: "No readable Qoder plugin hooks.json found",
        fix: "Reinstall the context-mode Qoder plugin",
      });
      return results;
    }

    const hooks = (settings.hooks ?? {}) as Record<string, QoderHookEntry[]>;
    results.push({
      check: "Hook config",
      status: "pass",
      message: "Loaded Qoder hook configuration",
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
        fix: hasHook ? undefined : "Reinstall the context-mode Qoder plugin",
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
    if (process.env.QODER_PLUGIN_ROOT) {
      return {
        check: "Plugin registration",
        status: "pass",
        message: `Qoder loaded context-mode from ${process.env.QODER_PLUGIN_ROOT}`,
      };
    }
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
    const root = process.env.QODER_PLUGIN_ROOT;
    if (root) {
      try {
        const manifest = JSON.parse(readFileSync(join(root, ".qoder-plugin", "plugin.json"), "utf8")) as { version?: string };
        if (manifest.version) return manifest.version;
      } catch { /* fall through */ }
    }
    return "standalone";
  }

  // ── Upgrade ────────────────────────────────────────────

  configureAllHooks(_pluginRoot: string): string[] {
    // Native Qoder plugins own their hooks.json. Mutating user settings here
    // would duplicate every hook and bypass Qoder's plugin lifecycle.
    return [];
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
    return input.cwd || process.cwd();
  }

  private extractSessionId(input: QoderHookInput): string {
    if (input.session_id) return input.session_id;
    return `pid-${process.ppid}`;
  }
}
