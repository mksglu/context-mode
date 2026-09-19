/**
 * adapters/mistral-vibe — Mistral Vibe CLI platform adapter.
 *
 * Mistral Vibe is Mistral AI's official open-source coding CLI
 * (https://github.com/mistralai/mistral-vibe). Package: mistral-vibe (PyPI),
 * command: vibe.
 *
 * Implements HookAdapter for Vibe's JSON stdin/stdout paradigm over TOML-
 * declared hooks. Vibe supports three hook events (pre_tool, post_tool,
 * post_agent) invoked as subprocesses with JSON payloads, and full MCP
 * integration via stdio/HTTP/streamable-http transports.
 *
 * Configuration surfaces:
 *   - User config:    $VIBE_HOME/config.toml     (or ~/.vibe/config.toml)
 *   - Hooks config:   $VIBE_HOME/hooks.toml      (or ~/.vibe/hooks.toml)
 *   - Session logs:   $VIBE_HOME/logs/session/   (or ~/.vibe/logs/session/)
 *
 * Reference: https://docs.mistral.ai/vibe/code/cli/
 *
 * Known limitations vs Claude Code:
 *   - No PreCompact / SessionStart / UserPromptSubmit / Stop equivalents
 *     (Vibe exposes only pre_tool, post_tool, post_agent)
 *   - MCP clientInfo.name defaults to "mcp" (SDK default, not overridden by
 *     Vibe) — detection relies on env var + config dir instead of clientInfo
 *   - Session id is delivered in the hook stdin payload, not env vars
 */

import { execFileSync } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  accessSync,
  copyFileSync,
  constants,
  mkdirSync,
} from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { BaseAdapter, resolveContextModeDataRoot } from "../base.js";
import { hashProjectDirCanonical } from "../../session/db.js";
import { resolveVibeConfigDir } from "./paths.js";

import {
  type HookAdapter,
  type HookParadigm,
  type PlatformCapabilities,
  type DiagnosticResult,
  type PreToolUseEvent,
  type PostToolUseEvent,
  type PreToolUseResponse,
  type PostToolUseResponse,
  type HookEntry,
  type HookRegistration,
} from "../types.js";

import {
  HOOK_TYPES,
  PRE_TOOL_MATCHER,
  VIBE_HOOK_COMMANDS,
} from "./hooks.js";

// ─────────────────────────────────────────────────────────
// Mistral Vibe raw input types
// ─────────────────────────────────────────────────────────

/**
 * Shape of the JSON payload Vibe writes to hook stdin.
 * Mirrors PreToolInvocation / PostToolInvocation / PostAgentInvocation
 * from vibe/core/hooks/models.py.
 */
interface VibeHookInput {
  session_id?: string;
  hook_event_name?: string;
  transcript_path?: string;
  cwd?: string;
  parent_session_id?: string | null;
  // pre_tool / post_tool only
  tool_name?: string;
  tool_call_id?: string;
  tool_input?: Record<string, unknown>;
  // post_tool only
  tool_status?: "success" | "failure" | "cancelled";
  tool_output?: Record<string, unknown> | null;
  tool_output_text?: string;
  tool_error?: string | null;
  duration_ms?: number;
}

/** Structure of a single hook entry inside ~/.vibe/hooks.toml. */
interface VibeTomlHook {
  name: string;
  type: string;
  command: string;
  match?: string;
  timeout?: number;
  strict?: boolean;
  description?: string;
}

// ─────────────────────────────────────────────────────────
// TOML [[hooks]] helpers
// ─────────────────────────────────────────────────────────

/**
 * Minimal TOML parser for Vibe's `[[hooks]]` array-of-tables format.
 *
 * We do NOT use a full TOML library here to keep the adapter dependency-free
 * (mirrors the kimi adapter pattern). Vibe's hooks.toml is always flat —
 * one `[[hooks]]` block per hook with scalar fields only — so a
 * line-oriented parser is sufficient.
 */
function parseVibeHooks(toml: string): VibeTomlHook[] {
  const hooks: VibeTomlHook[] = [];
  const lines = toml.split(/\r?\n/);
  let current: Partial<VibeTomlHook> | null = null;

  const commit = () => {
    if (current && current.name && current.type && current.command) {
      hooks.push(current as VibeTomlHook);
    }
    current = null;
  };

  for (const line of lines) {
    if (/^\s*\[\[hooks\]\]\s*(?:#.*)?$/.test(line)) {
      commit();
      current = {};
      continue;
    }
    if (!current) continue;

    const stringMatch = line.match(/^\s*(\w+)\s*=\s*"((?:[^"\\]|\\.)*)"\s*(?:#.*)?$/);
    if (stringMatch) {
      const key = stringMatch[1];
      const val = stringMatch[2].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
      (current as Record<string, string>)[key] = val;
      continue;
    }

    const numberMatch = line.match(/^\s*(\w+)\s*=\s*(-?\d+(?:\.\d+)?)\s*(?:#.*)?$/);
    if (numberMatch) {
      (current as Record<string, number>)[numberMatch[1]] = Number(numberMatch[2]);
      continue;
    }

    const boolMatch = line.match(/^\s*(\w+)\s*=\s*(true|false)\s*(?:#.*)?$/);
    if (boolMatch) {
      (current as Record<string, boolean>)[boolMatch[1]] = boolMatch[2] === "true";
      continue;
    }
  }
  commit();
  return hooks;
}

/** Emit a Vibe `[[hooks]]` block from a parsed hook object. */
function formatVibeHook(hook: VibeTomlHook): string {
  const escape = (v: string) => v.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const lines: string[] = ["[[hooks]]"];
  lines.push(`name = "${escape(hook.name)}"`);
  lines.push(`type = "${escape(hook.type)}"`);
  if (hook.match !== undefined) lines.push(`match = "${escape(hook.match)}"`);
  lines.push(`command = "${escape(hook.command)}"`);
  if (hook.timeout !== undefined) lines.push(`timeout = ${hook.timeout}`);
  if (hook.strict !== undefined) lines.push(`strict = ${hook.strict}`);
  if (hook.description !== undefined) lines.push(`description = "${escape(hook.description)}"`);
  return lines.join("\n");
}

/** Detect hooks owned by context-mode (safe to remove/replace on upgrade). */
function isManagedVibeHook(hook: VibeTomlHook): boolean {
  return hook.command.includes("context-mode hook mistral-vibe");
}

/**
 * Probe `vibe --version` to confirm the Mistral Vibe CLI is on PATH.
 * Returns the version string or null if not available. Non-fatal.
 */
type VibeVersionRunner = (
  file: string,
  args: string[],
  options: {
    encoding: BufferEncoding;
    stdio: ["ignore", "pipe", "ignore"];
    timeout: number;
  },
) => string | Buffer;

export function probeVibeCliVersion(runCommand: VibeVersionRunner = execFileSync): string | null {
  try {
    const output = process.platform === "win32"
      ? runCommand("cmd.exe", ["/d", "/s", "/c", "vibe --version"], {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 5000,
      })
      : runCommand("vibe", ["--version"], {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 1500,
      });
    const version = String(output).trim();
    return version.length > 0 ? version : "available (empty version output)";
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────
// Adapter implementation
// ─────────────────────────────────────────────────────────

export class MistralVibeAdapter extends BaseAdapter implements HookAdapter {
  constructor() {
    super([".vibe"]);
  }

  readonly name = "Mistral Vibe";
  readonly paradigm: HookParadigm = "json-stdio";

  /**
   * Vibe supports pre_tool (input rewrite/deny) and post_tool
   * (additional_context append). PreCompact, SessionStart, and
   * UserPromptSubmit have no Vibe equivalent — capabilities false.
   */
  readonly capabilities: PlatformCapabilities = {
    preToolUse: true,
    postToolUse: true,
    preCompact: false,
    sessionStart: false,
    canModifyArgs: true,
    canModifyOutput: false, // additional_context is append-only, not a rewrite
    canInjectSessionContext: false,
  };

  // ── Input parsing ──────────────────────────────────────

  parsePreToolUseInput(raw: unknown): PreToolUseEvent {
    const input = raw as VibeHookInput;
    return {
      toolName: input.tool_name ?? "",
      toolInput: input.tool_input ?? {},
      sessionId: input.session_id ?? this.fallbackSessionId(),
      projectDir: input.cwd ?? undefined,
      raw,
    };
  }

  parsePostToolUseInput(raw: unknown): PostToolUseEvent {
    const input = raw as VibeHookInput;
    return {
      toolName: input.tool_name ?? "",
      toolInput: input.tool_input ?? {},
      toolOutput: input.tool_output_text ?? undefined,
      isError: input.tool_status === "failure" || Boolean(input.tool_error),
      sessionId: input.session_id ?? this.fallbackSessionId(),
      projectDir: input.cwd ?? undefined,
      raw,
    };
  }

  // ── Response formatting ────────────────────────────────

  formatPreToolUseResponse(response: PreToolUseResponse): unknown {
    if (response.decision === "deny") {
      return {
        decision: "deny",
        reason: response.reason ?? "Blocked by context-mode hook",
      };
    }
    if (response.decision === "modify" && response.updatedInput) {
      const out: Record<string, unknown> = {
        hook_specific_output: {
          tool_input: response.updatedInput,
        },
      };
      if (response.reason) {
        out.system_message = `context-mode: ${response.reason}`;
      }
      return out;
    }
    // ask / context / allow — no PreTool equivalent on Vibe; empty passthrough.
    return {};
  }

  formatPostToolUseResponse(response: PostToolUseResponse): unknown {
    if (response.additionalContext) {
      return {
        hook_specific_output: {
          additional_context: response.additionalContext,
        },
      };
    }
    return {};
  }

  // ── Configuration ──────────────────────────────────────

  getConfigDir(_projectDir?: string): string {
    return resolveVibeConfigDir();
  }

  /**
   * Vibe reads its main configuration from config.toml (MCP servers,
   * providers, agent profiles). Hooks live in a sibling hooks.toml — see
   * `getHooksPath()`.
   */
  getSettingsPath(): string {
    return join(this.getConfigDir(), "config.toml");
  }

  /** Path to Vibe's hooks TOML file (managed by context-mode upgrade). */
  getHooksPath(): string {
    return join(this.getConfigDir(), "hooks.toml");
  }

  getSessionDir(): string {
    const override = resolveContextModeDataRoot();
    const dir = override
      ? join(override, "context-mode", "sessions")
      : join(this.getConfigDir(), "context-mode", "sessions");
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  /**
   * Vibe reads AGENTS.md by default (same convention as Codex CLI /
   * OpenCode). Both root-level and .override variants are honored so users
   * can override the routing block per-project.
   */
  getInstructionFiles(): string[] {
    return ["AGENTS.md", "AGENTS.override.md"];
  }

  getMemoryDir(projectDir?: string): string {
    const override = resolveContextModeDataRoot();
    const base = override
      ? join(override, "context-mode", "memory")
      : join(this.getConfigDir(), "memory");
    if (!projectDir) return base;
    return join(base, hashProjectDirCanonical(projectDir));
  }

  /**
   * Vibe hooks are declared in TOML, not JSON. This returns the JSON-shaped
   * HookRegistration expected by the HookAdapter interface. The upgrade
   * flow (`configureAllHooks`) translates the registration into the
   * hooks.toml `[[hooks]]` array-of-tables format via `formatVibeHook`.
   */
  generateHookConfig(_pluginRoot: string): HookRegistration {
    return {
      pre_tool: [
        {
          matcher: PRE_TOOL_MATCHER,
          hooks: [{ type: "command", command: VIBE_HOOK_COMMANDS.pre_tool }],
        },
      ],
      post_tool: [
        {
          matcher: "",
          hooks: [{ type: "command", command: VIBE_HOOK_COMMANDS.post_tool }],
        },
      ],
    };
  }

  readSettings(): Record<string, unknown> | null {
    try {
      const raw = readFileSync(this.getSettingsPath(), "utf-8");
      return { _raw_toml: raw };
    } catch {
      return null;
    }
  }

  writeSettings(_settings: Record<string, unknown>): void {
    // Vibe's config.toml uses TOML format. Writing a full TOML serializer
    // is out of scope for this adapter — config edits should be performed
    // manually via `vibe` UI or with an external TOML tool. The upgrade
    // flow (`configureAllHooks`) only touches hooks.toml, which is
    // written via `writeHooksFile` below.
  }

  /**
   * Read the current hooks.toml, replace context-mode-managed hooks with the
   * freshly generated set, and write the file atomically.
   *
   * Non-managed hooks (e.g., user-registered rtk-rewrite, custom formatters)
   * are preserved untouched.
   */
  private writeHooksFile(managed: VibeTomlHook[]): void {
    let existing: VibeTomlHook[] = [];
    try {
      const raw = readFileSync(this.getHooksPath(), "utf-8");
      existing = parseVibeHooks(raw);
    } catch {
      // No hooks.toml yet — start fresh.
    }
    const preserved = existing.filter((h) => !isManagedVibeHook(h));
    const combined = [...preserved, ...managed];
    const body = combined.map(formatVibeHook).join("\n\n") + (combined.length > 0 ? "\n" : "");
    mkdirSync(dirname(this.getHooksPath()), { recursive: true });
    writeFileSync(this.getHooksPath(), body, { encoding: "utf-8", mode: 0o600 });
  }

  // ── Diagnostics (doctor) ─────────────────────────────────

  validateHooks(_pluginRoot: string): DiagnosticResult[] {
    const results: DiagnosticResult[] = [];
    const vibeCliVersion = probeVibeCliVersion();

    results.push({
      check: "Mistral Vibe CLI binary",
      status: vibeCliVersion ? "pass" : "warn",
      message: vibeCliVersion
        ? `vibe --version resolved to ${vibeCliVersion}`
        : "Could not run vibe --version; hooks need the Mistral Vibe CLI available on PATH",
      ...(vibeCliVersion ? {} : { fix: "Install Mistral Vibe (uv tool install mistral-vibe) and ensure vibe is on PATH" }),
    });

    let rawToml = "";
    try {
      rawToml = readFileSync(this.getHooksPath(), "utf-8");
    } catch {
      results.push({
        check: "Hooks config",
        status: "fail",
        message: `No readable ${this.getHooksPath()} found`,
        fix: "Run context-mode upgrade to generate the initial hooks.toml",
      });
      return results;
    }

    const existing = parseVibeHooks(rawToml);
    const managed = existing.filter(isManagedVibeHook);

    const expected: Array<{ event: string; command: string; matcher?: string }> = [
      { event: HOOK_TYPES.PRE_TOOL, command: VIBE_HOOK_COMMANDS.pre_tool, matcher: PRE_TOOL_MATCHER },
      { event: HOOK_TYPES.POST_TOOL, command: VIBE_HOOK_COMMANDS.post_tool },
    ];

    for (const want of expected) {
      const found = managed.find((h) => h.type === want.event);
      if (!found) {
        results.push({
          check: `${want.event} hook`,
          status: "fail",
          message: `Missing context-mode ${want.event} hook in ${this.getHooksPath()}`,
          fix: "Run context-mode upgrade to install missing hooks",
        });
        continue;
      }
      if (want.matcher && found.match !== want.matcher) {
        results.push({
          check: `${want.event} hook`,
          status: "warn",
          message: `Matcher drift: expected "${want.matcher}", got "${found.match ?? ""}"`,
          fix: "Run context-mode upgrade to re-sync hook matchers",
        });
        continue;
      }
      results.push({
        check: `${want.event} hook`,
        status: "pass",
        message: `Hook installed with command "${found.command}"`,
      });
    }

    return results;
  }

  checkPluginRegistration(): DiagnosticResult {
    try {
      const raw = readFileSync(this.getSettingsPath(), "utf-8");
      const hasContextMode = raw.includes("context-mode");
      const hasMcpServers = /^\s*\[\[mcp_servers\]\]/m.test(raw);

      if (hasMcpServers && hasContextMode) {
        return {
          check: "MCP registration",
          status: "pass",
          message: `context-mode found in ${this.getSettingsPath()} [[mcp_servers]]`,
        };
      }
      if (hasMcpServers) {
        return {
          check: "MCP registration",
          status: "fail",
          message: "No context-mode entry in [[mcp_servers]]",
          fix: `Add a [[mcp_servers]] block for context-mode to ${this.getSettingsPath()}`,
        };
      }
      return {
        check: "MCP registration",
        status: "fail",
        message: "No [[mcp_servers]] section in config.toml",
        fix: `Add [[mcp_servers]] name = "context-mode" ... to ${this.getSettingsPath()}`,
      };
    } catch {
      return {
        check: "MCP registration",
        status: "warn",
        message: `Could not read ${this.getSettingsPath()}`,
      };
    }
  }

  getInstalledVersion(): string {
    return probeVibeCliVersion() ?? "not installed";
  }

  // ── Upgrade ────────────────────────────────────────────

  configureAllHooks(pluginRoot: string): string[] {
    const changes: string[] = [];
    const managed: VibeTomlHook[] = [
      {
        name: "context-mode-pretool",
        type: HOOK_TYPES.PRE_TOOL,
        match: PRE_TOOL_MATCHER,
        command: VIBE_HOOK_COMMANDS.pre_tool,
        timeout: 30.0,
        strict: false,
        description: "Route bash commands through context-mode sandbox",
      },
      {
        name: "context-mode-posttool",
        type: HOOK_TYPES.POST_TOOL,
        command: VIBE_HOOK_COMMANDS.post_tool,
        timeout: 30.0,
        strict: false,
        description: "Capture session events for context-mode",
      },
    ];

    this.writeHooksFile(managed);
    changes.push(`Wrote ${managed.length} hooks to ${this.getHooksPath()}`);

    // Best-effort: hint the operator about MCP registration. We do NOT
    // rewrite config.toml (TOML edits require a real serializer to
    // preserve provider/agent blocks).
    changes.push(
      `Note: add context-mode to [[mcp_servers]] in ${this.getSettingsPath()} manually — see configs/mistral-vibe/AGENTS.md`,
    );

    void pluginRoot; // reserved for future absolute-path resolution
    return changes;
  }

  setHookPermissions(_pluginRoot: string): string[] {
    // Vibe hook commands are ordinary shell invocations (e.g., `context-mode
    // hook mistral-vibe pretooluse`) — Vibe does not chmod scripts itself.
    // The `context-mode` CLI is expected to be on PATH and executable.
    return [];
  }

  updatePluginRegistry(_pluginRoot: string, _version: string): void {
    // Vibe has no plugin registry — MCP servers and hooks are registered
    // by editing config.toml / hooks.toml directly. No-op.
  }

  // ── Internal helpers ───────────────────────────────────

  /**
   * Fallback session id when Vibe's payload lacks one. Uses the process
   * parent PID — stable across hook invocations within the same Vibe
   * session on macOS/Linux. On Windows + Git Bash the ppid can drift; this
   * is acceptable for a fallback path (proper session id is always in the
   * Vibe payload).
   */
  private fallbackSessionId(): string {
    return `vibe-ppid-${process.ppid}`;
  }
}

// Re-export path helpers for callers that need to resolve Vibe locations
// without instantiating the adapter (e.g., detect.ts).
export { resolveVibeConfigDir };
