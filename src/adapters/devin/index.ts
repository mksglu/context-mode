/**
 * adapters/devin — Devin CLI platform adapter.
 *
 * Implements HookAdapter for Devin CLI's JSON stdin/stdout paradigm.
 *
 * Devin CLI hook specifics:
 *   - 6 hook events: PreToolUse, PostToolUse, PreCompact (PostCompaction),
 *     SessionStart, UserPromptSubmit, Stop
 *   - Same wire protocol as Claude Code (JSON stdin → stdout)
 *   - Config: ~/.devin/config.json or .devin/hooks.v1.json
 *   - Session dir: ~/.devin/context-mode/sessions/
 *   - Instruction files: AGENTS.md (Devin reads .devin/ rules)
 *
 * Devin uses Claude-Code-compatible hook output format:
 *   { hookSpecificOutput: { hookEventName, permissionDecision?, reason?, additionalContext? } }
 *
 * Known limitations:
 *   - PreToolUse: deny works. updatedInput (modify) is not documented;
 *     we convert modify→deny+context for safety (same as Codex <0.141.0).
 *   - On Windows, Devin's hook runner cannot spawn commands (confirmed
 *     bug as of Devin 2026.7.23). Hooks are a no-op on Windows until
 *     Cognition fixes the spawn mechanism. The MCP server works.
 *   - Devin does not set any DEVIN_* env vars when spawning MCP children,
 *     so platform detection relies on CONTEXT_MODE_PLATFORM=devin override
 *     or MCP clientInfo.name from the initialize handshake.
 */

import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  chmodSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { homedir } from "node:os";

import { BaseAdapter, resolveContextModeDataRoot } from "../base.js";
import { hashProjectDirCanonical } from "../../session/db.js";

import {
  type HookAdapter,
  type HookParadigm,
  type PlatformCapabilities,
  type DiagnosticResult,
  type HealthCheck,
  type PreToolUseEvent,
  type PostToolUseEvent,
  type PreCompactEvent,
  type SessionStartEvent,
  type PreToolUseResponse,
  type PostToolUseResponse,
  type PreCompactResponse,
  type SessionStartResponse,
  type HookEntry,
  type HookRegistration,
} from "../types.js";
import { buildHookRuntimeCommand } from "../types.js";
import { PRE_TOOL_USE_MATCHER_PATTERN, HOOK_SCRIPTS } from "./hooks.js";

// ─────────────────────────────────────────────────────────
// Devin CLI raw input types
// ─────────────────────────────────────────────────────────

interface DevinHookInput {
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_response?: string;
  session_id?: string;
  cwd?: string;
  hook_event_name?: string;
  model?: string;
  permission_mode?: string;
  tool_use_id?: string;
  transcript_path?: string | null;
  source?: string;
}

// ─────────────────────────────────────────────────────────
// Adapter implementation
// ─────────────────────────────────────────────────────────

export class DevinAdapter extends BaseAdapter implements HookAdapter {
  constructor() {
    super([".devin"]);
  }

  readonly name = "Devin CLI";
  readonly paradigm: HookParadigm = "json-stdio";

  readonly capabilities: PlatformCapabilities = {
    preToolUse: true,
    postToolUse: true,
    preCompact: true,
    sessionStart: true,
    canModifyArgs: false,  // updatedInput not documented for Devin
    canModifyOutput: false,
    canInjectSessionContext: true,
  };

  // ── Input parsing ──────────────────────────────────────

  parsePreToolUseInput(raw: unknown): PreToolUseEvent {
    const input = raw as DevinHookInput;
    return {
      toolName: input.tool_name ?? "",
      toolInput: input.tool_input ?? {},
      sessionId: this.extractSessionId(input),
      projectDir: this.getProjectDir(input),
      raw,
    };
  }

  parsePostToolUseInput(raw: unknown): PostToolUseEvent {
    const input = raw as DevinHookInput;
    return {
      toolName: input.tool_name ?? "",
      toolInput: input.tool_input ?? {},
      toolOutput: input.tool_response,
      sessionId: this.extractSessionId(input),
      projectDir: this.getProjectDir(input),
      raw,
    };
  }

  parsePreCompactInput(raw: unknown): PreCompactEvent {
    const input = raw as DevinHookInput;
    return {
      sessionId: this.extractSessionId(input),
      projectDir: this.getProjectDir(input),
      raw,
    };
  }

  parseSessionStartInput(raw: unknown): SessionStartEvent {
    const input = raw as DevinHookInput;
    const rawSource = input.source ?? "startup";

    let source: SessionStartEvent["source"];
    switch (rawSource) {
      case "compact":
        source = "compact";
        break;
      case "resume":
        source = "resume";
        break;
      case "clear":
        source = "clear";
        break;
      default:
        source = "startup";
    }

    return {
      sessionId: this.extractSessionId(input),
      source,
      projectDir: this.getProjectDir(input),
      raw,
    };
  }

  // ── Response formatting ────────────────────────────────
  // Devin uses Claude-Code-compatible hookSpecificOutput wrapper.
  // Does NOT support updatedInput or updatedMCPToolOutput.

  formatPreToolUseResponse(response: PreToolUseResponse): unknown {
    if (response.decision === "deny") {
      return {
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason:
            response.reason ?? "Blocked by context-mode hook",
        },
      };
    }
    if (response.decision === "context" && response.additionalContext) {
      return {
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          additionalContext: response.additionalContext,
        },
      };
    }
    // "allow" — return empty object for passthrough
    return {};
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
    return {};
  }

  formatPreCompactResponse(response: PreCompactResponse): unknown {
    // Devin PreCompact (PostCompaction) currently accepts only universal
    // hook fields. The hook script stores snapshots in context-mode's DB;
    // SessionStart injects them after compaction.
    return {};
  }

  formatSessionStartResponse(response: SessionStartResponse): unknown {
    if (response.context) {
      return {
        hookSpecificOutput: {
          hookEventName: "SessionStart",
          additionalContext: response.context,
        },
      };
    }
    return {};
  }

  // ── Configuration ──────────────────────────────────────

  getConfigDir(_projectDir?: string): string {
    // Devin config: $DEVIN_HOME or ~/.devin
    const devinHome = process.env.DEVIN_HOME;
    if (devinHome && devinHome.trim() !== "") {
      if (devinHome.startsWith("~")) {
        return resolve(homedir(), devinHome.replace(/^~[/\\]?/, ""));
      }
      return resolve(devinHome);
    }
    return join(homedir(), ".devin");
  }

  getSettingsPath(): string {
    return join(this.getConfigDir(), "config.json");
  }

  getSessionDir(): string {
    // Issue #649: honor CONTEXT_MODE_DATA_DIR universal storage override
    const override = resolveContextModeDataRoot();
    const dir = override
      ? join(override, "context-mode", "sessions")
      : join(this.getConfigDir(), "context-mode", "sessions");
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  getInstructionFiles(): string[] {
    // Devin reads AGENTS.md and .devin/ rules
    return ["AGENTS.md"];
  }

  getMemoryDir(projectDir?: string): string {
    const override = resolveContextModeDataRoot();
    const base = override
      ? join(override, "context-mode", "memory")
      : join(this.getConfigDir(), "memory");
    if (!projectDir) return base;
    return join(base, hashProjectDirCanonical(projectDir));
  }

  generateHookConfig(pluginRoot: string): HookRegistration {
    // Build hook commands using the resolved JS runtime (issue #738).
    // On Windows, use node.exe directly (not .cmd shims) since Devin's
    // hook runner spawns commands without a shell.
    const buildCmd = (event: string) =>
      buildHookRuntimeCommand(
        join(pluginRoot, "hooks", "devin", `${event}.mjs`),
        { platform: "devin" },
      );

    return {
      PreToolUse: [
        {
          matcher: PRE_TOOL_USE_MATCHER_PATTERN,
          hooks: [
            {
              type: "command",
              command: buildCmd("pretooluse"),
            },
          ],
        },
      ],
      PostToolUse: [
        {
          matcher: "",
          hooks: [
            {
              type: "command",
              command: buildCmd("posttooluse"),
            },
          ],
        },
      ],
      SessionStart: [
        {
          matcher: "",
          hooks: [
            {
              type: "command",
              command: buildCmd("sessionstart"),
            },
          ],
        },
      ],
      PreCompact: [
        {
          matcher: "",
          hooks: [
            {
              type: "command",
              command: buildCmd("precompact"),
            },
          ],
        },
      ],
      UserPromptSubmit: [
        {
          matcher: "",
          hooks: [
            {
              type: "command",
              command: buildCmd("userpromptsubmit"),
            },
          ],
        },
      ],
      Stop: [
        {
          matcher: "",
          hooks: [
            {
              type: "command",
              command: buildCmd("stop"),
            },
          ],
        },
      ],
    };
  }

  readSettings(): Record<string, unknown> | null {
    try {
      const raw = readFileSync(this.getSettingsPath(), "utf-8");
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  writeSettings(settings: Record<string, unknown>): void {
    const dir = this.getConfigDir();
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(this.getSettingsPath(), JSON.stringify(settings, null, 2) + "\n", "utf-8");
  }

  // ── Diagnostics (doctor) ───────────────────────────────

  validateHooks(pluginRoot: string): DiagnosticResult[] {
    const results: DiagnosticResult[] = [];

    // Check if config.json exists
    const settingsPath = this.getSettingsPath();
    if (existsSync(settingsPath)) {
      results.push({
        check: "Devin config.json",
        status: "pass",
        message: `Found ${settingsPath}`,
      });
    } else {
      results.push({
        check: "Devin config.json",
        status: "warn",
        message: `No config.json at ${settingsPath} — hooks may not be configured`,
        fix: "context-mode upgrade",
      });
    }

    // Check hook scripts exist
    const expected = this.generateHookConfig(pluginRoot);
    for (const [event, entries] of Object.entries(expected)) {
      for (const entry of entries) {
        for (const hook of entry.hooks) {
          // Extract script path from the command string
          const match = hook.command.match(/"([^"]+\.mjs)"/);
          if (match && !existsSync(match[1])) {
            results.push({
              check: `Hook script: ${event}`,
              status: "fail",
              message: `Missing hook script: ${match[1]}`,
              fix: "context-mode upgrade",
            });
          }
        }
      }
    }

    return results;
  }

  /**
   * Adapter-defined health checks (Algo-D1) — mirrors claude-code's override
   * at src/adapters/claude-code/index.ts:286 and gemini-cli's at
   * src/adapters/gemini-cli/index.ts:417.
   *
   * For each entry in HOOK_SCRIPTS (the canonical hookType → scriptName
   * map in hooks.ts), emit a HealthCheck that joins
   * `pluginRoot + "hooks" + "devin" + scriptName` and probes via
   * `existsSync`. Crucially, this NEVER parses a hook command —
   * pluginRoot and scriptName are both in our hand, so the regex
   * round-trip that produced the #548 doubled-path FAIL is bypassed.
   *
   * Devin hook scripts ship under `<pluginRoot>/hooks/devin/<scriptName>`
   * (see HOOK_MAP in src/cli.ts and setHookPermissions below).
   * Adding a new hook event in HOOK_SCRIPTS auto-extends doctor
   * coverage — no parallel hardcoded list to maintain.
   */
  getHealthChecks(pluginRoot: string): readonly HealthCheck[] {
    return Object.entries(HOOK_SCRIPTS).map(
      ([hookType, scriptName]) => {
        const absolutePath = join(pluginRoot, "hooks", "devin", scriptName);
        return {
          name: `Hook script: ${hookType} (${scriptName})`,
          check: () => {
            if (existsSync(absolutePath)) {
              return { status: "OK" as const, detail: absolutePath };
            }
            return {
              status: "FAIL" as const,
              detail: `not found at ${absolutePath}`,
            };
          },
        };
      },
    );
  }

  checkPluginRegistration(): DiagnosticResult {
    const settings = this.readSettings();
    if (!settings) {
      return {
        check: "Plugin registration",
        status: "warn",
        message: "Cannot read Devin config.json — plugin registration unknown",
        fix: "context-mode upgrade",
      };
    }
    const mcpServers = settings.mcpServers as Record<string, unknown> | undefined;
    if (mcpServers && mcpServers["context-mode"]) {
      return {
        check: "Plugin registration",
        status: "pass",
        message: "context-mode MCP server registered in Devin config.json",
      };
    }
    return {
      check: "Plugin registration",
      status: "fail",
      message: "context-mode MCP server not found in Devin config.json",
      fix: "context-mode upgrade",
    };
  }

  getInstalledVersion(): string {
    // Devin has no plugin marketplace — context-mode is installed manually
    return "standalone";
  }

  // ── Upgrade ────────────────────────────────────────────

  configureAllHooks(pluginRoot: string): string[] {
    const changes: string[] = [];
    const settings = this.readSettings() ?? {};
    const hooks = (settings.hooks ?? {}) as Record<string, unknown[]>;
    const expected = this.generateHookConfig(pluginRoot);

    for (const [event, entries] of Object.entries(expected)) {
      const existing = hooks[event] as Array<Record<string, unknown>> | undefined;
      const commands = entries.flatMap((e) => e.hooks.map((h) => h.command));
      const existingCommands = existing?.flatMap(
        (h) => (h.hooks as Array<Record<string, string>>)?.map((hh) => hh.command) ?? [],
      ) ?? [];

      const hasAll = commands.every((cmd) =>
        existingCommands.some((ec) => ec.includes("devin") && ec.includes(event.toLowerCase())),
      );

      if (!hasAll) {
        hooks[event] = entries;
        changes.push(`Configured ${event} hook for Devin`);
      }
    }

    settings.hooks = hooks;
    this.writeSettings(settings);
    return changes;
  }

  setHookPermissions(pluginRoot: string): string[] {
    // No-op on Windows; chmod on Unix
    const paths: string[] = [];
    if (process.platform === "win32") return paths;
    for (const scriptName of Object.values(HOOK_SCRIPTS)) {
      const p = join(pluginRoot, "hooks", "devin", scriptName);
      if (existsSync(p)) {
        try { chmodSync(p, 0o755); paths.push(p); } catch { /* best effort */ }
      }
    }
    return paths;
  }

  updatePluginRegistry(pluginRoot: string, version: string): void {
    // Register context-mode as an MCP server in Devin's config.json
    const settings = this.readSettings() ?? {};
    const mcpServers = (settings.mcpServers ?? {}) as Record<string, unknown>;
    mcpServers["context-mode"] = {
      command: buildHookRuntimeCommand(join(pluginRoot, "start.mjs"), { platform: "devin" }),
      transport: "stdio",
      env: { CONTEXT_MODE_PLATFORM: "devin" },
    };
    settings.mcpServers = mcpServers;
    this.writeSettings(settings);
  }

  // ── Private helpers ────────────────────────────────────

  private extractSessionId(input: DevinHookInput): string {
    return input.session_id ?? "";
  }

  private getProjectDir(input: DevinHookInput): string | undefined {
    return input.cwd ?? process.env.CONTEXT_MODE_PROJECT_DIR;
  }
}
