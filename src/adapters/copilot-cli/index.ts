/**
 * adapters/copilot-cli — GitHub Copilot CLI adapter.
 *
 * Native config:
 *   - MCP:   $COPILOT_HOME/mcp-config.json or ~/.copilot/mcp-config.json
 *            under root key `mcpServers`.
 *   - Hooks: $COPILOT_HOME/hooks/context-mode.json or
 *            ~/.copilot/hooks/context-mode.json.
 *
 * Hooks use Copilot CLI's native camelCase event keys (preToolUse /
 * postToolUse / sessionStart / userPromptSubmitted / agentStop / preCompact)
 * with flat `{ type, command }` entries. (The CLI also accepts PascalCase
 * event names alongside camelCase — copilot-cli changelog.md:1065 — so the
 * casing is not load-bearing; we use camelCase because it is the CLI's native
 * naming.) Copilot CLI's command output contract is top-level
 * (`permissionDecision`, `modifiedArgs`, `additionalContext`), so this adapter
 * overrides the response formatter from CopilotBaseAdapter.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { CopilotBaseAdapter } from "../copilot-base.js";
import type { CopilotHookInput, CopilotHookModule } from "../copilot-base.js";
import { resolveContextModeDataRoot } from "../base.js";
import { parseJsonc } from "../../util/jsonc.js";
import type {
  DiagnosticResult,
  HookRegistration,
  PostToolUseResponse,
  PreCompactResponse,
  PostToolUseEvent,
  PreToolUseEvent,
  PreToolUseResponse,
  SessionStartResponse,
} from "../types.js";

import {
  HOOK_TYPES as COPILOT_HOOK_NAMES,
  HOOK_SCRIPTS as COPILOT_HOOK_SCRIPTS,
  buildHookCommand as buildCopilotHookCommand,
} from "./hooks.js";

const COPILOT_PLUGIN_ENV = "CONTEXT_MODE_COPILOT_PLUGIN";

function isCopilotPluginRuntime(): boolean {
  return process.env[COPILOT_PLUGIN_ENV] === "1";
}

function copilotPluginHooksPath(pluginRoot: string): string {
  return resolve(pluginRoot, "configs", "copilot-cli", "hooks.json");
}

function readHookConfig(path: string): Record<string, unknown> {
  return parseJsonc<Record<string, unknown>>(readFileSync(path, "utf-8")) ?? {};
}

function hasHook(hooks: Record<string, unknown> | undefined, hookName: string): boolean {
  return Array.isArray(hooks?.[hookName]) && (hooks?.[hookName] as unknown[]).length > 0;
}

export function copilotCliHome(): string {
  const raw = process.env.COPILOT_HOME;
  if (raw && raw.trim() !== "") {
    if (raw.startsWith("~")) {
      return join(homedir(), raw.replace(/^~[/\\]?/, ""));
    }
    return resolve(raw);
  }
  return join(homedir(), ".copilot");
}

export function copilotCliMcpConfigPath(): string {
  return join(copilotCliHome(), "mcp-config.json");
}

export class CopilotCliAdapter extends CopilotBaseAdapter {
  constructor() {
    super([".copilot"]);
  }

  readonly name = "GitHub Copilot CLI";

  protected readonly hookModule: CopilotHookModule = {
    HOOK_TYPES: COPILOT_HOOK_NAMES,
    HOOK_SCRIPTS: COPILOT_HOOK_SCRIPTS,
    buildHookCommand: buildCopilotHookCommand,
  };

  protected readonly hookSubdir = "copilot-cli";

  protected extractSessionId(input: CopilotHookInput): string {
    const raw = input as CopilotHookInput & {
      session_id?: string;
      conversation_id?: string;
      transcript_path?: string;
    };
    if (raw.transcript_path) {
      const match = raw.transcript_path.match(/([a-f0-9-]{36})\.jsonl$/);
      if (match) return match[1];
    }
    if (raw.conversation_id) return raw.conversation_id;
    // `session_id` (snake_case) is the field Copilot CLI documents in its hook
    // payloads (copilot-cli changelog.md:811). Prefer it; `sessionId` (camelCase)
    // is kept only as a defensive fallback for non-standard payload shapes and is
    // not a documented Copilot CLI field.
    if (raw.session_id) return raw.session_id;
    if (input.sessionId) return input.sessionId;
    return `pid-${process.ppid}`;
  }

  protected getProjectDir(): string {
    return process.cwd();
  }

  parsePreToolUseInput(raw: unknown): PreToolUseEvent {
    const input = raw as CopilotHookInput & {
      cwd?: string;
      toolName?: string;
      toolArgs?: Record<string, unknown>;
    };
    return {
      toolName: input.tool_name ?? input.toolName ?? "",
      toolInput: input.tool_input ?? input.toolArgs ?? {},
      sessionId: this.extractSessionId(input),
      projectDir: typeof input.cwd === "string" && input.cwd ? input.cwd : process.cwd(),
      raw,
    };
  }

  parsePostToolUseInput(raw: unknown): PostToolUseEvent {
    const input = raw as CopilotHookInput & {
      cwd?: string;
      toolName?: string;
      toolArgs?: Record<string, unknown>;
      tool_result?: { text_result_for_llm?: string };
      toolResult?: { textResultForLlm?: string };
      tool_response?: unknown;
    };
    const output =
      input.tool_result?.text_result_for_llm ??
      input.toolResult?.textResultForLlm ??
      (typeof input.tool_response === "string" ? input.tool_response : undefined) ??
      input.tool_output;
    return {
      toolName: input.tool_name ?? input.toolName ?? "",
      toolInput: input.tool_input ?? input.toolArgs ?? {},
      toolOutput: output,
      isError: input.is_error,
      sessionId: this.extractSessionId(input),
      projectDir: typeof input.cwd === "string" && input.cwd ? input.cwd : process.cwd(),
      raw,
    };
  }

  getSettingsPath(_projectDir?: string): string {
    return join(copilotCliHome(), "hooks", "context-mode.json");
  }

  getConfigDir(_projectDir?: string): string {
    return copilotCliHome();
  }

  getSessionDir(): string {
    // Parity with codex/kimi: honor CONTEXT_MODE_DATA_DIR first, else root
    // session storage at getConfigDir() (= copilotCliHome(), COPILOT_HOME-aware)
    // so the TS server reads sessions from the SAME place the hook runtime
    // (COPILOT_OPTS configDirEnv: "COPILOT_HOME") writes them. Without this, a
    // relocated COPILOT_HOME splits hook writes ($COPILOT_HOME/...) from server
    // reads (~/.copilot/...) and sessions appear empty/orphaned.
    const override = resolveContextModeDataRoot();
    const dir = override
      ? join(override, "context-mode", "sessions")
      : join(this.getConfigDir(), "context-mode", "sessions");
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  getInstructionFiles(): string[] {
    return [".github/copilot-instructions.md", "AGENTS.md"];
  }

  // ── Hook-config writing (Copilot CLI shape) ────────────
  //
  // GitHub Copilot CLI's hooks schema differs from the VS Code / JetBrains
  // Copilot extensions that share CopilotBaseAdapter:
  //   - hook entries are FLAT `{ type: "command", command }` — NOT the
  //     Claude-Code nested `{ matcher, hooks: [...] }` shape the base emits, and
  //   - we emit a top-level `"version": 1`. This is OPTIONAL, not mandatory:
  //     the Copilot CLI accepts hook config files that omit the version field
  //     (copilot-cli changelog.md:1109). We still write version:1 to pin the
  //     schema explicitly — it is harmless and self-documenting, NOT a
  //     hooks-never-fire requirement.
  // The shared base also hardcodes `mkdir .github/hooks` and writes there, but
  // this adapter's settings live at ~/.copilot/hooks/context-mode.json, so
  // writeSettings is overridden to create the real parent directory. All three
  // overrides are scoped to copilot-cli so vscode/jetbrains-copilot keep the
  // shared base behavior unchanged.

  generateHookConfig(pluginRoot: string): HookRegistration {
    const { HOOK_TYPES, buildHookCommand } = this.hookModule;
    const flat = (hookType: string) =>
      [
        { type: "command", command: buildHookCommand(hookType, pluginRoot) },
      ] as unknown as HookRegistration[string];
    // Emit an entry for every declared hook type (preToolUse, postToolUse,
    // preCompact, sessionStart, userPromptSubmitted, agentStop).
    const config: HookRegistration = {};
    for (const hookType of Object.values(HOOK_TYPES)) {
      config[hookType] = flat(hookType);
    }
    return config;
  }

  writeSettings(settings: Record<string, unknown>): void {
    const configPath = this.getSettingsPath();
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(configPath, JSON.stringify(settings, null, 2) + "\n", "utf-8");
  }

  configureAllHooks(pluginRoot: string): string[] {
    const changes: string[] = [];
    const settings = this.readSettings() ?? {};
    const hooks =
      (settings.hooks as Record<string, unknown> | undefined) ?? {};
    const { HOOK_TYPES, HOOK_SCRIPTS, buildHookCommand } = this.hookModule;

    // Configure every hook type the module declares (preToolUse, postToolUse,
    // preCompact, sessionStart, userPromptSubmitted, agentStop) — driven by
    // HOOK_TYPES so new events are picked up automatically.
    for (const hookType of Object.values(HOOK_TYPES)) {
      if (!HOOK_SCRIPTS[hookType]) continue;
      const command = buildHookCommand(hookType, pluginRoot);
      const existing = Array.isArray(hooks[hookType])
        ? hooks[hookType] as Array<Record<string, unknown>>
        : [];
      let found = false;
      const desired = existing.map((entry) => {
        if (typeof entry?.command !== "string" || entry.command.trim() !== command) {
          return entry;
        }
        found = true;
        return { ...entry, type: "command", command };
      });
      if (!found) desired.push({ type: "command", command });
      // Only treat a hook as drift when it differs from desired, so repeated
      // `context-mode upgrade` runs stay idempotent.
      if (JSON.stringify(hooks[hookType]) !== JSON.stringify(desired)) {
        hooks[hookType] = desired;
        changes.push(`Configured ${hookType} hook`);
      }
    }

    // We pin version:1 explicitly (optional per copilot-cli changelog.md:1109,
    // but self-documenting); treat a missing/mismatched value as drift to repair.
    if (settings.version !== 1) {
      changes.push("Set hooks schema version to 1");
    }

    if (changes.length > 0) {
      settings.version = 1;
      settings.hooks = hooks;
      this.writeSettings(settings);
      changes.push(`Wrote hook config to ${this.getSettingsPath()}`);
    }

    return changes;
  }

  readSettings(): Record<string, unknown> | null {
    try {
      const raw = readFileSync(this.getSettingsPath(), "utf-8");
      return parseJsonc<Record<string, unknown>>(raw) ?? null;
    } catch {
      return null;
    }
  }

  formatPreToolUseResponse(response: PreToolUseResponse): unknown {
    if (response.decision === "deny") {
      return {
        permissionDecision: "deny",
        permissionDecisionReason: response.reason ?? "Blocked by context-mode hook",
      };
    }
    if (response.decision === "ask") {
      return {
        permissionDecision: "ask",
        permissionDecisionReason: response.reason ?? "Action requires user confirmation",
      };
    }
    if (response.decision === "modify" && response.updatedInput) {
      return { modifiedArgs: response.updatedInput };
    }
    if (response.decision === "context" && response.additionalContext) {
      return { additionalContext: response.additionalContext };
    }
    return undefined;
  }

  formatPostToolUseResponse(response: PostToolUseResponse): unknown {
    if (response.updatedOutput) {
      return {
        modifiedResult: {
          resultType: "success",
          textResultForLlm: response.updatedOutput,
        },
      };
    }
    if (response.additionalContext) {
      return { additionalContext: response.additionalContext };
    }
    return undefined;
  }

  formatPreCompactResponse(response: PreCompactResponse): unknown {
    void response;
    return undefined;
  }

  formatSessionStartResponse(response: SessionStartResponse): unknown {
    return response.context ? { additionalContext: response.context } : undefined;
  }

  validateHooks(pluginRoot: string): DiagnosticResult[] {
    const results: DiagnosticResult[] = [];
    const pluginRuntime = isCopilotPluginRuntime();
    const settingsPath = pluginRuntime ? copilotPluginHooksPath(pluginRoot) : this.getSettingsPath();
    const settingsLabel = pluginRuntime
      ? `Copilot CLI plugin bundle hooks.json (${settingsPath})`
      : settingsPath;
    const fix = pluginRuntime
      ? "copilot plugin install mksglu/context-mode:configs/copilot-cli"
      : "context-mode upgrade";

    try {
      const config = readHookConfig(settingsPath);
      const hooks = config.hooks as Record<string, unknown> | undefined;

      results.push({
        check: "Hooks schema version",
        status: config.version === 1 ? "pass" : "fail",
        message: config.version === 1
          ? `${settingsLabel} declares the required "version": 1`
          : `${settingsLabel} is missing top-level "version": 1`,
        ...(config.version === 1 ? {} : { fix }),
      });

      for (const hookName of Object.values(COPILOT_HOOK_NAMES)) {
        const configured = hasHook(hooks, hookName);
        results.push({
          check: `${hookName} hook`,
          status: configured ? "pass" : "fail",
          message: configured
            ? `${hookName} hook configured in ${settingsLabel}`
            : `${hookName} not found in ${settingsLabel}`,
          ...(configured ? {} : { fix }),
        });
      }
    } catch {
      results.push({
        check: "Hook configuration",
        status: "fail",
        message: `Could not read ${settingsLabel}`,
        fix,
      });
    }

    return results;
  }

  checkPluginRegistration(): DiagnosticResult {
    if (isCopilotPluginRuntime()) {
      return {
        check: "MCP registration",
        status: "pass",
        message: "context-mode loaded from the Copilot CLI plugin bundle",
      };
    }
    try {
      const raw = readFileSync(copilotCliMcpConfigPath(), "utf-8");
      const config = parseJsonc<Record<string, unknown>>(raw) ?? {};
      const mcpServers = (config?.mcpServers as Record<string, unknown>) ?? {};
      if ("context-mode" in mcpServers) {
        return {
          check: "MCP registration",
          status: "pass",
          message: "context-mode found in Copilot CLI mcp-config.json",
        };
      }
      return {
        check: "MCP registration",
        status: "fail",
        message: "context-mode not found in Copilot CLI mcpServers",
        // `context-mode upgrade` configures HOOKS only — never the MCP server.
        // Copilot CLI's own command writes ~/.copilot/mcp-config.json for us.
        fix: "copilot mcp add context-mode -- context-mode",
      };
    } catch {
      return {
        check: "MCP registration",
        status: "fail",
        message: `Could not read ${copilotCliMcpConfigPath()}`,
        fix: "copilot mcp add context-mode -- context-mode",
      };
    }
  }

  getInstalledVersion(): string {
    // Copilot's user-level MCP config and local/plugin-dir bundle do not expose
    // a durable installed plugin version to this process. The npm package
    // version is already checked above, so avoid the false `vconfigured` WARN.
    return existsSync(copilotCliMcpConfigPath()) || existsSync(this.getSettingsPath())
      ? "standalone"
      : "not installed";
  }
}
