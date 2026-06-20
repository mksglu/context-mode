/**
 * adapters/codex — Codex CLI platform adapter.
 *
 * Implements HookAdapter for Codex CLI's JSON stdin/stdout paradigm.
 *
 * Codex CLI hook specifics:
 *   - 6 hook events: PreToolUse, PostToolUse, PreCompact, SessionStart, UserPromptSubmit, Stop
 *   - Same wire protocol as Claude Code (JSON stdin → stdout)
 *   - Config: $CODEX_HOME or ~/.codex (hooks.json + config.toml)
 *   - Session dir: $CODEX_HOME/context-mode/sessions/
 *
 * Hook dispatch is stable in Codex CLI. PreToolUse deny decisions work,
 * while input rewriting remains blocked on upstream updatedInput support.
 * Track: https://github.com/openai/codex/issues/18491
 */

import { execFileSync } from "node:child_process";
import {
  existsSync,
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
import { resolveCodexConfigDir } from "./paths.js";

import {
  type HookAdapter,
  type HookParadigm,
  type PlatformCapabilities,
  type DiagnosticResult,
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

// ─────────────────────────────────────────────────────────
// Codex CLI raw input types
// ─────────────────────────────────────────────────────────

interface CodexHookInput {
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
  turn_id?: string;
  source?: string;
}

interface CodexHooksFile {
  hooks?: HookRegistration;
}

type HooksConfigReadResult =
  | { ok: true; config: CodexHooksFile }
  | { ok: false; reason: "missing" }
  | { ok: false; reason: "invalid_json"; error: string }
  | { ok: false; reason: "read_error"; error: string };

// PreToolUse matcher: canonical Codex tool names + context-mode bare MCP tool
// names + external MCP catch-all literal (#529, #547 hotfix).
//
// Codex CLI's Rust `regex` crate does NOT support look-around, and
// `is_exact_matcher` (refs/platforms/codex/codex-rs/hooks/src/events/common.rs:152)
// short-circuits the regex engine entirely when the matcher contains only
// [A-Za-z0-9_|]. v1.0.124 shipped a matcher with `(?!.*context-mode)` AND
// `mcp__.*__ctx_*` regex syntax — Codex rejected the file at boot with
// "look-around not supported" → all v1.0.124 Codex users broken (#547).
//
// Fix: keep only literal tool names (charset-clean). The hook BODY already
// filters context-mode's own MCP tools via `isExternalMcpTool()` in
// hooks/core/routing.mjs, so dropping `mcp__.*__ctx_*` and the lookaround
// preserves end-to-end semantics. The literal `mcp__` final segment is a
// no-op under exact-matcher mode but kept for parity with hooks/hooks.json.
//
// Keep this as a single string literal — `codex.test.ts` drift-guard parses
// the source with a `"([^"]+)"` regex.
const PRE_TOOL_USE_MATCHER_PATTERN =
  "local_shell|shell|shell_command|exec_command|Bash|Shell|apply_patch|Edit|Write|grep_files|ctx_execute|ctx_execute_file|ctx_batch_execute|ctx_fetch_and_index|ctx_search|ctx_index|mcp__";

const CODEX_HOOK_COMMANDS = {
  PreToolUse: "context-mode hook codex pretooluse",
  PostToolUse: "context-mode hook codex posttooluse",
  SessionStart: "context-mode hook codex sessionstart",
  PreCompact: "context-mode hook codex precompact",
  UserPromptSubmit: "context-mode hook codex userpromptsubmit",
  Stop: "context-mode hook codex stop",
} as const;

const LEGACY_HOOK_PATH_SUFFIXES: Record<keyof typeof CODEX_HOOK_COMMANDS, string[]> = {
  PreToolUse: ["hooks/pretooluse.mjs", "hooks/codex/pretooluse.mjs"],
  PostToolUse: ["hooks/posttooluse.mjs", "hooks/codex/posttooluse.mjs"],
  SessionStart: ["hooks/sessionstart.mjs", "hooks/codex/sessionstart.mjs"],
  PreCompact: ["hooks/precompact.mjs", "hooks/codex/precompact.mjs"],
  UserPromptSubmit: ["hooks/userpromptsubmit.mjs", "hooks/codex/userpromptsubmit.mjs"],
  Stop: ["hooks/stop.mjs", "hooks/codex/stop.mjs"],
};

type CodexVersionRunner = (
  file: string,
  args: string[],
  options: {
    encoding: BufferEncoding;
    stdio: ["ignore", "pipe", "ignore"];
    timeout: number;
  },
) => string | Buffer;

interface CodexAdapterOptions {
  codexPluginListRunner?: CodexVersionRunner;
}

interface CodexPluginHookStatus {
  enabled: boolean;
  configuredRoot: string;
  configuredManifestAvailable: boolean;
  runtimeRoot: string | null;
  runtimeManifestAvailable: boolean;
  rootMismatch: boolean;
  hooksAvailable: boolean;
  ownsHooksForUpgrade: boolean;
}

export function probeCodexCliVersion(runCommand: CodexVersionRunner = execFileSync): string | null {
  try {
    const output = process.platform === "win32"
      ? runCommand("cmd.exe", ["/d", "/s", "/c", "codex --version"], {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 5000,
      })
      : runCommand("codex", ["--version"], {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 1500,
      });
    const version = String(output).trim();
    return version.length > 0 ? version : "available (version output empty)";
  } catch {
    return null;
  }
}

export function parseCodexContextModePluginRoot(raw: string): string | null {
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s*context-mode@context-mode\s+installed,\s+enabled\s+\S+\s+(.+?)\s*$/);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

function getTomlSection(raw: string, sectionName: string): string | null {
  const lines = raw.split(/\r?\n/);
  let inSection = false;
  const body: string[] = [];

  for (const line of lines) {
    const section = line.match(/^\s*\[([^\]]+)\]\s*(?:#.*)?$/);
    if (section) {
      if (inSection) break;
      inSection = section[1]?.trim() === sectionName;
      continue;
    }
    if (inSection) body.push(line);
  }

  return inSection ? body.join("\n") : null;
}

function hasCodexHooksFeature(raw: string): boolean {
  const features = getTomlSection(raw, "features");
  return features !== null && /^\s*hooks\s*=\s*true\s*(?:#.*)?$/mi.test(features);
}

function hasDeprecatedCodexHooksFeature(raw: string): boolean {
  const features = getTomlSection(raw, "features");
  return features !== null && /^\s*codex_hooks\s*=\s*true\s*(?:#.*)?$/mi.test(features);
}

function hasCodexPluginEnabled(raw: string): boolean {
  const plugin = getTomlSection(raw, 'plugins."context-mode@context-mode"');
  return plugin !== null && /^\s*enabled\s*=\s*true\s*(?:#.*)?$/mi.test(plugin);
}

function hasStandaloneContextModeMcp(raw: string): boolean {
  return getTomlSection(raw, "mcp_servers.context-mode") !== null;
}

function ensureCodexHooksFeature(raw: string): { text: string; changed: boolean } {
  if (hasCodexHooksFeature(raw)) return { text: raw, changed: false };

  const newline = raw.includes("\r\n") ? "\r\n" : "\n";
  const lines = raw.split(/\r?\n/);
  const featuresIndex = lines.findIndex((line) => /^\s*\[features\]\s*(?:#.*)?$/.test(line));

  if (featuresIndex === -1) {
    const prefix = raw.length > 0 && !raw.endsWith("\n") ? newline : "";
    return {
      text: `${raw}${prefix}[features]${newline}hooks = true${newline}`,
      changed: true,
    };
  }

  let endIndex = lines.length;
  for (let i = featuresIndex + 1; i < lines.length; i++) {
    if (/^\s*\[[^\]]+\]\s*(?:#.*)?$/.test(lines[i] ?? "")) {
      endIndex = i;
      break;
    }
  }

  for (let i = featuresIndex + 1; i < endIndex; i++) {
    if (/^\s*hooks\s*=/.test(lines[i] ?? "")) {
      lines[i] = "hooks = true";
      return { text: lines.join(newline), changed: true };
    }
  }

  lines.splice(featuresIndex + 1, 0, "hooks = true");
  return { text: lines.join(newline), changed: true };
}

function removeTomlSections(
  raw: string,
  shouldRemove: (sectionName: string) => boolean,
): { text: string; removed: string[] } {
  const newline = raw.includes("\r\n") ? "\r\n" : "\n";
  const lines = raw.split(/\r?\n/);
  const out: string[] = [];
  const removed: string[] = [];
  let skipping = false;

  for (const line of lines) {
    const section = line.match(/^\s*\[([^\]]+)\]\s*(?:#.*)?$/);
    if (section) {
      const sectionName = section[1]?.trim() ?? "";
      skipping = shouldRemove(sectionName);
      if (skipping) removed.push(sectionName);
    }
    if (!skipping) out.push(line);
  }

  return { text: out.join(newline), removed };
}

function parseTomlQuotedString(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('"') || !trimmed.endsWith('"')) return null;

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return typeof parsed === "string" ? parsed : null;
  } catch {
    // Codex hook-state keys are TOML quoted keys, not guaranteed JSON strings.
    // Preserve Windows backslashes such as C:\Users\... even when they are not
    // valid JSON escapes, while still handling the common escaped quote/slash.
    let out = "";
    let escaping = false;
    for (const ch of trimmed.slice(1, -1)) {
      if (escaping) {
        out += ch === '"' || ch === "\\" ? ch : `\\${ch}`;
        escaping = false;
      } else if (ch === "\\") {
        escaping = true;
      } else {
        out += ch;
      }
    }
    if (escaping) out += "\\";
    return out;
  }
}

// ─────────────────────────────────────────────────────────
// Adapter implementation
// ─────────────────────────────────────────────────────────

export class CodexAdapter extends BaseAdapter implements HookAdapter {
  private readonly codexPluginListRunner: CodexVersionRunner;

  constructor(options: CodexAdapterOptions = {}) {
    super([".codex"]);
    this.codexPluginListRunner = options.codexPluginListRunner ?? execFileSync;
  }

  readonly name = "Codex CLI";
  readonly paradigm: HookParadigm = "json-stdio";

  readonly capabilities: PlatformCapabilities = {
    preToolUse: true,
    postToolUse: true,
    preCompact: true,
    sessionStart: true,
    canModifyArgs: false,
    canModifyOutput: false,
    canInjectSessionContext: true,
  };

  // ── Input parsing ──────────────────────────────────────

  parsePreToolUseInput(raw: unknown): PreToolUseEvent {
    const input = raw as CodexHookInput;
    return {
      toolName: input.tool_name ?? "",
      toolInput: input.tool_input ?? {},
      sessionId: this.extractSessionId(input),
      projectDir: this.getProjectDir(input),
      raw,
    };
  }

  parsePostToolUseInput(raw: unknown): PostToolUseEvent {
    const input = raw as CodexHookInput;
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
    const input = raw as CodexHookInput;
    return {
      sessionId: this.extractSessionId(input),
      projectDir: this.getProjectDir(input),
      raw,
    };
  }

  parseSessionStartInput(raw: unknown): SessionStartEvent {
    const input = raw as CodexHookInput;
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
  // Codex CLI uses hookSpecificOutput wrapper for all hook responses.
  // Unlike Claude Code, Codex does NOT support updatedInput or updatedMCPToolOutput.

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
      // Codex does not support additionalContext in PreToolUse (fails open).
      // Context injection works via PostToolUse and SessionStart instead.
      return {};
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
    // Codex PreCompact currently accepts only universal hook fields.
    // The hook script stores snapshots in context-mode's DB; SessionStart
    // injects them after compaction.
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
    return resolveCodexConfigDir();
  }

  getSettingsPath(): string {
    return join(this.getConfigDir(), "config.toml");
  }

  getSessionDir(): string {
    // Issue #649: honor CONTEXT_MODE_DATA_DIR universal storage override
    // before falling back to the $CODEX_HOME-rooted default. Settings.toml
    // and hooks.json continue to live under getConfigDir() so the Codex CLI
    // sees its own config in the expected place.
    const override = resolveContextModeDataRoot();
    const dir = override
      ? join(override, "context-mode", "sessions")
      : join(this.getConfigDir(), "context-mode", "sessions");
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  // C2 narrowing (2026-05): the historical `getSessionDBPath` /
  // `getSessionEventsPath` overrides were removed. Both delegated to the
  // same canonical helpers (`resolveSessionDbPath` / `hashProjectDirCanonical`
  // + `getWorktreeSuffix`) which already normalize the path internally —
  // the explicit `normalizeWorktreePath` here was a no-op. Callers now reach
  // the helpers directly through `adapter.getSessionDir()`.

  getInstructionFiles(): string[] {
    // Codex CLI honors AGENTS.md plus an optional override file.
    return ["AGENTS.md", "AGENTS.override.md"];
  }

  getMemoryDir(projectDir?: string): string {
    // Codex uses "memories" (plural), not the default "memory".
    // Issue #649: honor CONTEXT_MODE_DATA_DIR for context-mode-owned
    // persistent memory while preserving the platform-native plural folder
    // name so legacy Codex tooling continues to find it when DATA_DIR is
    // unset. Under the override, layout is `<DATA_DIR>/context-mode/memories`.
    // Issue #663: scope by projectDir hash so parallel projects can't
    // read each other's memory.
    const override = resolveContextModeDataRoot();
    const base = override
      ? join(override, "context-mode", "memories")
      : join(this.getConfigDir(), "memories");
    if (!projectDir) return base;
    return join(base, hashProjectDirCanonical(projectDir));
  }

  generateHookConfig(_pluginRoot: string): HookRegistration {
    return {
      PreToolUse: [
        {
          matcher: PRE_TOOL_USE_MATCHER_PATTERN,
          hooks: [
            {
              type: "command",
              command: CODEX_HOOK_COMMANDS.PreToolUse,
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
              command: CODEX_HOOK_COMMANDS.PostToolUse,
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
              command: CODEX_HOOK_COMMANDS.SessionStart,
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
              command: CODEX_HOOK_COMMANDS.PreCompact,
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
              command: CODEX_HOOK_COMMANDS.UserPromptSubmit,
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
              command: CODEX_HOOK_COMMANDS.Stop,
            },
          ],
        },
      ],
    };
  }

  readSettings(): Record<string, unknown> | null {
    // Codex CLI uses TOML format. Full TOML parsing is complex;
    // return null for now. MCP configuration should be done manually
    // or via a dedicated TOML library in the upgrade flow.
    try {
      const raw = readFileSync(this.getSettingsPath(), "utf-8");
      // Return raw TOML as a single-key object for inspection
      return { _raw_toml: raw };
    } catch {
      return null;
    }
  }

  writeSettings(_settings: Record<string, unknown>): void {
    // Codex CLI uses TOML format. Writing TOML requires a dedicated
    // serializer. This is a no-op; TOML config should be edited
    // manually or via the `codex` CLI tool.
  }

  // ── Diagnostics (doctor) ─────────────────────────────────

  validateHooks(pluginRoot: string): DiagnosticResult[] {
    const results: DiagnosticResult[] = [];
    const codexCliVersion = probeCodexCliVersion();
    let settingsRaw = "";
    let settingsReadable = false;

    results.push({
      check: "Codex CLI binary",
      status: codexCliVersion ? "pass" : "warn",
      message: codexCliVersion
        ? `codex --version resolved to ${codexCliVersion}`
        : "Could not run codex --version; hooks need the Codex CLI available on PATH",
      ...(codexCliVersion ? {} : { fix: "Install Codex CLI or make codex available on PATH" }),
    });

    try {
      settingsRaw = readFileSync(this.getSettingsPath(), "utf-8");
      settingsReadable = true;
      const enabled = hasCodexHooksFeature(settingsRaw);
      const deprecatedOnly = !enabled && hasDeprecatedCodexHooksFeature(settingsRaw);

      results.push({
        check: "Codex hooks feature flag",
        status: enabled ? "pass" : "fail",
        message: enabled
          ? `[features].hooks enabled in ${this.getSettingsPath()}`
          : deprecatedOnly
            ? `[features].codex_hooks is deprecated; [features].hooks is missing in ${this.getSettingsPath()}`
            : `[features].hooks missing from ${this.getSettingsPath()}`,
        ...(enabled ? {} : { fix: "context-mode upgrade" }),
      });
    } catch {
      results.push({
        check: "Codex hooks feature flag",
        status: "warn",
        message: `Could not read ${this.getSettingsPath()}`,
        fix: "context-mode upgrade",
      });
    }

    const expected = this.generateHookConfig("");
    const pluginHookStatus = this.getCodexPluginHookStatus(pluginRoot, settingsRaw, settingsReadable);
    const codexPluginEnabled = pluginHookStatus.enabled;
    const codexPluginHooksAvailable = pluginHookStatus.hooksAvailable;
    if (codexPluginEnabled && pluginHookStatus.runtimeRoot) {
      results.push({
        check: "Codex plugin root",
        status: pluginHookStatus.rootMismatch ? "warn" : "pass",
        message: pluginHookStatus.rootMismatch
          ? `context-mode doctor is running from ${pluginHookStatus.configuredRoot}, but Codex plugin manager reports ${pluginHookStatus.runtimeRoot}`
          : `Codex plugin manager reports ${pluginHookStatus.runtimeRoot}`,
        ...(pluginHookStatus.rootMismatch
          ? { fix: "Restart Codex after upgrade; run context-mode upgrade to keep native user-hook fallback until the plugin root converges" }
          : {}),
      });
    } else if (codexPluginEnabled) {
      results.push({
        check: "Codex plugin root",
        status: "warn",
        message: "context-mode@context-mode is enabled, but `codex plugin list` did not report its runtime root",
        fix: "Restart Codex or verify `codex plugin list` shows context-mode@context-mode installed and enabled",
      });
    }
    if (codexPluginEnabled && !codexPluginHooksAvailable) {
      const expectedRoot = pluginHookStatus.runtimeRoot ?? pluginRoot;
      results.push({
        check: "Codex plugin hooks",
        status: "fail",
        message: `context-mode Codex plugin is enabled, but ${join(expectedRoot, ".codex-plugin", "hooks.json")} is missing`,
        fix: "Reinstall or upgrade the context-mode Codex plugin",
      });
    }
    if (codexPluginEnabled && hasStandaloneContextModeMcp(settingsRaw)) {
      results.push({
        check: "Standalone MCP duplicate",
        status: "warn",
        message: "[mcp_servers.context-mode] is still registered while context-mode@context-mode is enabled; Codex may start both plugin and standalone MCP surfaces",
        fix: "context-mode upgrade (removes the standalone Codex MCP registration when the plugin owns context-mode)",
      });
    }

    const hookConfig = this.readHooksConfig();
    if (!hookConfig.ok) {
      if (hookConfig.reason === "missing" && codexPluginHooksAvailable) {
        const pluginHookChecks = Object.keys(expected).map((hookName) => ({
          check: `${hookName} hook`,
          status: "pass" as const,
          message: `${hookName} hook provided by context-mode@context-mode plugin`,
        }));
        return results.concat(pluginHookChecks);
      }
      if (hookConfig.reason === "missing") {
        return results.concat([{
          check: "Hooks config",
          status: "fail",
          message: `No readable ${this.getHooksPath()} found`,
          fix: "Copy configs/codex/hooks.json to hooks.json or run context-mode upgrade",
        }]);
      }
      if (hookConfig.reason === "invalid_json") {
        return results.concat([{
          check: "Hooks config",
          status: "fail",
          message: `${this.getHooksPath()} is not valid JSON: ${hookConfig.error}`,
          fix: "Repair hooks.json so it contains valid JSON, then rerun context-mode upgrade if needed",
        }]);
      }

      return results.concat([{
        check: "Hooks config",
        status: "fail",
        message: `Could not read ${this.getHooksPath()}: ${hookConfig.error}`,
        fix: "Check permissions and file accessibility for hooks.json, then rerun context-mode upgrade if needed",
      }]);
    }

    if (!hookConfig.config.hooks && !codexPluginHooksAvailable) {
      return results.concat([{
        check: "Hooks config",
        status: "fail",
        message: `${this.getHooksPath()} is missing the top-level hooks object`,
        fix: `Update ${this.getHooksPath()} to match configs/codex/hooks.json`,
      }]);
    }

    const hookChecks = codexPluginHooksAvailable
      ? Object.keys(expected).map((hookName) => ({
        check: `${hookName} hook`,
        status: "pass" as const,
        message: `${hookName} hook provided by context-mode@context-mode plugin`,
      }))
      : Object.entries(expected).map(([hookName, entries]) => {
        const actualEntries = hookConfig.config.hooks?.[hookName];
        const expectedEntry = entries[0];
        const ok = Array.isArray(actualEntries)
          && actualEntries.some((entry) => this.isExpectedHookEntry(hookName, entry, expectedEntry));
        const missingStatus = hookName === "PreCompact" ? "warn" : "fail";

        return {
          check: `${hookName} hook`,
          status: (ok ? "pass" : missingStatus) as "pass" | "warn" | "fail",
          message: ok
            ? `${hookName} hook configured in ${this.getHooksPath()}`
            : hookName === "PreCompact"
              ? `${hookName} hook missing or not pointing to context-mode; compaction snapshots require a Codex build that emits PreCompact`
              : `${hookName} hook missing or not pointing to context-mode`,
          fix: ok ? undefined : `Update ${this.getHooksPath()} to match configs/codex/hooks.json`,
        };
      });

    // #603: surface duplicate context-mode entries per hook event. Codex fires
    // every matching entry, so duplicates double the work, can saturate the
    // MCP transport (`Transport closed`), and have been observed to inflate
    // codex-tui.log into the multi-GB range. `context-mode upgrade` collapses
    // them via `upsertManagedHookEntry`, so the fix is one command away.
    const duplicateChecks: DiagnosticResult[] = [];
    for (const hookName of Object.keys(expected)) {
      const actualEntries = hookConfig.config.hooks?.[hookName];
      if (!Array.isArray(actualEntries)) continue;
      const managedCount = actualEntries.filter(
        (entry) => this.isManagedContextModeEntry(hookName, entry as HookEntry),
      ).length;
      if (managedCount > 1) {
        duplicateChecks.push({
          check: `${hookName} duplicates`,
          status: "warn",
          message: `${managedCount} context-mode entries found for ${hookName} in ${this.getHooksPath()}; Codex will fire all of them`,
          fix: "context-mode upgrade (collapses duplicate context-mode entries; preserves unrelated hooks)",
        });
      } else if (codexPluginHooksAvailable && managedCount === 1) {
        duplicateChecks.push({
          check: `${hookName} plugin duplicate`,
          status: "warn",
          message: `${hookName} is configured in both ${this.getHooksPath()} and the context-mode Codex plugin; Codex will fire both hooks`,
          fix: "context-mode upgrade (removes user config context-mode hooks; preserves unrelated hooks)",
        });
      }
    }

    return results.concat(hookChecks, duplicateChecks);
  }

  checkPluginRegistration(): DiagnosticResult {
    try {
      const raw = readFileSync(this.getSettingsPath(), "utf-8");
      const pluginEnabled = hasCodexPluginEnabled(raw);
      const standaloneMcp = hasStandaloneContextModeMcp(raw);
      const hasMcpSection =
        raw.includes("[mcp_servers]") || raw.includes("[mcp_servers.");

      if (pluginEnabled && standaloneMcp) {
        return {
          check: "MCP registration",
          status: "warn",
          message: "context-mode@context-mode plugin is enabled, but standalone [mcp_servers.context-mode] is also configured",
          fix: "context-mode upgrade",
        };
      }

      if (pluginEnabled) {
        return {
          check: "MCP registration",
          status: "pass",
          message: "context-mode@context-mode plugin enabled",
        };
      }

      if (standaloneMcp) {
        return {
          check: "MCP registration",
          status: "pass",
          message: "context-mode found in [mcp_servers] config",
        };
      }

      if (hasMcpSection) {
        return {
          check: "MCP registration",
          status: "fail",
          message:
            "[mcp_servers] section exists but context-mode not found",
          fix: `Add context-mode to [mcp_servers] in ${this.getSettingsPath()}`,
        };
      }

      return {
        check: "MCP registration",
        status: "fail",
        message: "No [mcp_servers] section in config.toml",
        fix: `Add [mcp_servers.context-mode] to ${this.getSettingsPath()}`,
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
    // Codex uses standalone MCP registration; there is no platform-owned
    // plugin version to compare against the context-mode npm package.
    return "standalone";
  }

  // ── Upgrade ────────────────────────────────────────────

  configureAllHooks(pluginRoot: string): string[] {
    const hookConfig = this.readHooksConfig();
    const changes: string[] = [];
    const settingsPath = this.getSettingsPath();
    let settingsRaw = "";
    try {
      settingsRaw = readFileSync(settingsPath, "utf-8");
    } catch {
      settingsRaw = "";
    }
    const pluginHookStatus = this.getCodexPluginHookStatus(pluginRoot, settingsRaw, settingsRaw.length > 0);
    const codexPluginOwnsHooks = pluginHookStatus.ownsHooksForUpgrade;
    let hookFile: CodexHooksFile;
    if (hookConfig.ok) {
      hookFile = hookConfig.config;
    } else if (hookConfig.reason === "missing") {
      hookFile = { hooks: {} };
    } else if (hookConfig.reason === "invalid_json") {
      const backupPath = this.backupFile(this.getHooksPath(), ".broken");
      changes.push(`Backed up malformed Codex hooks to ${backupPath}`);
      hookFile = { hooks: {} };
    } else {
      throw new Error(`Failed to update ${this.getHooksPath()}: ${hookConfig.error}`);
    }

    const hooks = hookFile.hooks && typeof hookFile.hooks === "object" && !Array.isArray(hookFile.hooks)
      ? hookFile.hooks
      : {};
    const desiredHooks = this.generateHookConfig(pluginRoot);
    const hookChangeStart = changes.length;

    if (codexPluginOwnsHooks) {
      for (const hookName of Object.keys(desiredHooks)) {
        this.removeManagedHookEntries(hooks, hookName, changes);
      }
    } else {
      for (const [hookName, entries] of Object.entries(desiredHooks)) {
        this.upsertManagedHookEntry(hooks, hookName, entries[0], changes);
      }
    }

    if (changes.length > hookChangeStart) {
      hookFile.hooks = hooks;
      this.writeHooksConfig(hookFile);
      changes.push(
        codexPluginOwnsHooks
          ? `Removed duplicate context-mode user hooks from ${this.getHooksPath()}`
          : `Wrote native Codex hooks to ${this.getHooksPath()}`,
      );
    }

    let settingsText = ensureCodexHooksFeature(settingsRaw).text;
    const enabledSettingsChanged = settingsText !== settingsRaw;
    if (codexPluginOwnsHooks) {
      const removedMcp = removeTomlSections(settingsText, (sectionName) =>
        sectionName === "mcp_servers.context-mode"
        || sectionName.startsWith("mcp_servers.context-mode.tools."),
      );
      if (removedMcp.removed.length > 0) {
        settingsText = removedMcp.text;
        changes.push("Removed standalone Codex context-mode MCP registration");
      }

      const prunedTrust = this.pruneStaleUserHookTrustState(settingsText, hooks);
      if (prunedTrust.removed.length > 0) {
        settingsText = prunedTrust.text;
        changes.push(`Removed ${prunedTrust.removed.length} stale Codex hook trust entr${prunedTrust.removed.length === 1 ? "y" : "ies"}`);
      }
    }

    if (settingsText !== settingsRaw) {
      const newline = settingsText.includes("\r\n") ? "\r\n" : "\n";
      const text = settingsText.endsWith("\n")
        ? settingsText
        : `${settingsText}${newline}`;
      mkdirSync(dirname(settingsPath), { recursive: true });
      writeFileSync(settingsPath, text, "utf-8");
      if (enabledSettingsChanged) changes.push("Enabled Codex hooks feature flag");
    }

    return changes;
  }

  backupSettings(): string | null {
    let firstBackupPath: string | null = null;
    for (const settingsPath of [this.getHooksPath(), this.getSettingsPath()]) {
      try {
        accessSync(settingsPath, constants.R_OK);
        const backupPath = this.backupFile(settingsPath);
        firstBackupPath ??= backupPath;
      } catch {
        continue;
      }
    }
    return firstBackupPath;
  }



  setHookPermissions(_pluginRoot: string): string[] {
    // Hook permissions are set during plugin install
    return [];
  }

  updatePluginRegistry(_pluginRoot: string, _version: string): void {
    // Codex CLI has no plugin registry
  }

  getRoutingInstructions(): string {
    const instructionsPath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "..",
      "..",
      "..",
      "configs",
      "codex",
      "AGENTS.md",
    );
    try {
      return readFileSync(instructionsPath, "utf-8");
    } catch {
      // Fallback inline instructions
      return "# context-mode\n\nUse context-mode MCP tools (execute, execute_file, batch_execute, fetch_and_index, search) instead of bash/cat/curl for data-heavy operations.";
    }
  }

  // ── Internal helpers ───────────────────────────────────

  /**
   * Resolve the project directory for a Codex hook input.
   * Priority: input.cwd > CODEX_PROJECT_DIR env > process.cwd().
   * Mirrors the cursor / opencode pattern so downstream hooks always
   * receive a defined projectDir even under worktrees or when the
   * platform omits cwd from the wire payload.
   */
  private getProjectDir(input: CodexHookInput): string {
    return input.cwd ?? process.env.CODEX_PROJECT_DIR ?? process.cwd();
  }

  getHooksPath(): string {
    return join(this.getConfigDir(), "hooks.json");
  }

  private backupFile(filePath: string, suffix = ""): string {
    const backupPath = suffix
      ? `${filePath}${suffix}-${new Date().toISOString().replace(/[:.]/g, "-")}.bak`
      : `${filePath}.bak`;
    copyFileSync(filePath, backupPath);
    return backupPath;
  }

  private readHooksConfig(): HooksConfigReadResult {
    const hooksPath = this.getHooksPath();
    try {
      return { ok: true, config: JSON.parse(readFileSync(hooksPath, "utf-8")) as CodexHooksFile };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const code = typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: unknown }).code ?? "")
        : "";

      if (code === "ENOENT") {
        return { ok: false, reason: "missing" };
      }
      if (error instanceof SyntaxError) {
        return { ok: false, reason: "invalid_json", error: message };
      }
      return { ok: false, reason: "read_error", error: message };
    }
  }

  private writeHooksConfig(config: CodexHooksFile): void {
    const hooksPath = this.getHooksPath();
    mkdirSync(dirname(hooksPath), { recursive: true });
    writeFileSync(hooksPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
  }

  private upsertManagedHookEntry(
    hooks: HookRegistration,
    hookName: string,
    expectedEntry: HookEntry,
    changes: string[],
  ): void {
    const currentEntries = Array.isArray(hooks[hookName]) ? [...hooks[hookName]] : [];
    const managedIndices = currentEntries
      .map((entry, index) => this.isManagedContextModeEntry(hookName, entry) ? index : -1)
      .filter((index) => index >= 0);

    if (managedIndices.length === 0) {
      currentEntries.push(expectedEntry);
      hooks[hookName] = currentEntries;
      changes.push(`Added ${hookName} hook`);
      return;
    }

    const primaryIndex = managedIndices[0];
    if (JSON.stringify(currentEntries[primaryIndex]) !== JSON.stringify(expectedEntry)) {
      currentEntries[primaryIndex] = expectedEntry;
      changes.push(`Updated ${hookName} hook`);
    }

    for (const duplicateIndex of managedIndices.slice(1).reverse()) {
      currentEntries.splice(duplicateIndex, 1);
      changes.push(`Removed duplicate ${hookName} context-mode hook`);
    }

    hooks[hookName] = currentEntries;
  }

  private removeManagedHookEntries(
    hooks: HookRegistration,
    hookName: string,
    changes: string[],
  ): void {
    const currentEntries = Array.isArray(hooks[hookName]) ? [...hooks[hookName]] : [];
    const filtered = currentEntries.filter((entry) =>
      !this.isManagedContextModeEntry(hookName, entry),
    );
    const removed = currentEntries.length - filtered.length;
    if (removed === 0) return;

    if (filtered.length > 0) {
      hooks[hookName] = filtered;
    } else {
      delete hooks[hookName];
    }
    changes.push(`Removed ${removed} ${hookName} context-mode user hook${removed === 1 ? "" : "s"}`);
  }

  private hasCodexPluginHookManifest(pluginRoot: string): boolean {
    return existsSync(join(pluginRoot, ".codex-plugin", "hooks.json"));
  }

  private getCodexPluginHookStatus(
    pluginRoot: string,
    settingsRaw: string,
    settingsReadable: boolean,
  ): CodexPluginHookStatus {
    const enabled = settingsReadable && hasCodexPluginEnabled(settingsRaw);
    const configuredRoot = resolve(pluginRoot);
    const configuredManifestAvailable = this.hasCodexPluginHookManifest(configuredRoot);
    const runtimeRoot = enabled ? this.probeCodexContextModePluginRoot() : null;
    const runtimeManifestAvailable = runtimeRoot
      ? this.hasCodexPluginHookManifest(runtimeRoot)
      : false;
    const rootMismatch = runtimeRoot
      ? !this.samePath(configuredRoot, runtimeRoot)
      : false;

    const hooksAvailable = enabled && (
      runtimeManifestAvailable
      || (!runtimeRoot && configuredManifestAvailable)
    );

    return {
      enabled,
      configuredRoot,
      configuredManifestAvailable,
      runtimeRoot,
      runtimeManifestAvailable,
      rootMismatch,
      hooksAvailable,
      ownsHooksForUpgrade: enabled
        && runtimeRoot !== null
        && runtimeManifestAvailable
        && !rootMismatch,
    };
  }

  private probeCodexContextModePluginRoot(): string | null {
    try {
      const output = process.platform === "win32"
        ? this.codexPluginListRunner("cmd.exe", ["/d", "/s", "/c", "codex plugin list"], {
          encoding: "utf-8",
          stdio: ["ignore", "pipe", "ignore"],
          timeout: 5000,
        })
        : this.codexPluginListRunner("codex", ["plugin", "list"], {
          encoding: "utf-8",
          stdio: ["ignore", "pipe", "ignore"],
          timeout: 5000,
        });
      return parseCodexContextModePluginRoot(String(output));
    } catch {
      return null;
    }
  }

  private samePath(left: string, right: string): boolean {
    return this.normalizeCommand(resolve(left)) === this.normalizeCommand(resolve(right));
  }

  private pruneStaleUserHookTrustState(
    settingsRaw: string,
    hooks: HookRegistration,
  ): { text: string; removed: string[] } {
    const hooksPath = this.normalizeCommand(this.getHooksPath());
    const eventNames: Record<string, string> = {
      post_compact: "PostCompact",
      post_tool_use: "PostToolUse",
      pre_compact: "PreCompact",
      pre_tool_use: "PreToolUse",
      session_start: "SessionStart",
      stop: "Stop",
      user_prompt_submit: "UserPromptSubmit",
    };

    return removeTomlSections(settingsRaw, (sectionName) => {
      const prefix = "hooks.state.";
      if (!sectionName.startsWith(prefix)) return false;

      const key = parseTomlQuotedString(sectionName.slice(prefix.length));
      if (key === null) return false;

      const normalized = this.normalizeCommand(key);
      const parts = normalized.split(":");
      const hookIndex = Number(parts.pop());
      const entryIndex = Number(parts.pop());
      const eventName = eventNames[parts.pop() ?? ""];
      const stateHooksPath = parts.join(":");
      if (
        stateHooksPath !== hooksPath
        || !eventName
        || !Number.isInteger(entryIndex)
        || !Number.isInteger(hookIndex)
      ) {
        return false;
      }

      const entry = hooks[eventName]?.[entryIndex];
      return !entry || !Array.isArray(entry.hooks) || !entry.hooks[hookIndex];
    });
  }

  private isExpectedHookEntry(
    hookName: string,
    entry: HookEntry,
    expectedEntry: HookEntry,
  ): boolean {
    if (!entry || typeof entry !== "object") return false;
    if (hookName === "PreToolUse" && entry.matcher !== expectedEntry.matcher) {
      return false;
    }
    return this.entryContainsManagedCommand(hookName, entry);
  }

  private isManagedContextModeEntry(hookName: string, entry: HookEntry): boolean {
    if (!entry || typeof entry !== "object") return false;
    return this.entryContainsManagedCommand(hookName, entry);
  }

  private entryContainsManagedCommand(hookName: string, entry: HookEntry): boolean {
    const normalizedCommands = (Array.isArray(entry.hooks) ? entry.hooks : [])
      .map((hook) => this.normalizeCommand(hook.command))
      .filter((command) => command.length > 0);
    const expectedCliCommand = this.normalizeCommand(
      CODEX_HOOK_COMMANDS[hookName as keyof typeof CODEX_HOOK_COMMANDS] ?? "",
    );
    const legacySuffixes = LEGACY_HOOK_PATH_SUFFIXES[hookName as keyof typeof LEGACY_HOOK_PATH_SUFFIXES] ?? [];

    return normalizedCommands.some((command) =>
      command.includes(expectedCliCommand)
      || legacySuffixes.some((suffix) => command.includes(suffix)),
    );
  }

  private normalizeCommand(command: string | undefined): string {
    return (command ?? "").replace(/\\/g, "/");
  }

  /**
   * Extract session ID from Codex CLI hook input.
   * Priority: session_id field > fallback to ppid.
   */
  private extractSessionId(input: CodexHookInput): string {
    if (input.session_id) return input.session_id;
    return `pid-${process.ppid}`;
  }
}
