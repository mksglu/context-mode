import { buildHookRuntimeCommand, parseNodeCommand } from "../types.js";

/**
 * adapters/claude-code/hooks — Claude Code hook definitions and matchers.
 *
 * Defines the hook types, matchers, and registration format specific to
 * Claude Code's hook system. This module is used by:
 *   - CLI setup/upgrade commands (to configure hooks in settings.json)
 *   - Doctor command (to validate hook configuration)
 *   - hooks.json generation
 *
 * Claude Code hook system reference:
 *   - Hooks are registered in ~/.claude/settings.json under "hooks" key
 *   - Each hook type maps to an array of { matcher, hooks } entries
 *   - matcher: tool name pattern (empty = match all tools)
 *   - hooks: array of { type: "command", command: "..." }
 *   - Input: JSON on stdin
 *   - Output: JSON on stdout (or empty for passthrough)
 */

// ─────────────────────────────────────────────────────────
// Hook type constants
// ─────────────────────────────────────────────────────────

/** Claude Code hook types. */
export const HOOK_TYPES = {
  PRE_TOOL_USE: "PreToolUse",
  POST_TOOL_USE: "PostToolUse",
  PRE_COMPACT: "PreCompact",
  SESSION_START: "SessionStart",
  USER_PROMPT_SUBMIT: "UserPromptSubmit",
  STOP: "Stop",
} as const;

export type HookType = (typeof HOOK_TYPES)[keyof typeof HOOK_TYPES];

// ─────────────────────────────────────────────────────────
// PreToolUse matchers
// ─────────────────────────────────────────────────────────

/**
 * External MCP catch-all matcher for Claude Code (#529, #547 hotfix, #1222).
 *
 * Claude Code's hook matcher engine has two evaluation modes, selected by the
 * characters in the matcher (see the "Matcher patterns" table in the Claude
 * Code hooks reference):
 *
 *   - letters, digits, `_`, `-`, spaces, `,`, `|` only → exact string, or a
 *     `|`/`,`-separated list of exact strings;
 *   - anything else → JavaScript regular expression, unanchored.
 *
 * Since v2.1.195 the first mode no longer substring-matches, so a bare
 * `mcp__` is compared as the exact tool name `mcp__` and matches no tool at
 * all. Claude Code logs `Hook matcher 'mcp__' matches no tool (it is compared
 * as an exact string)` on every session start, and the external-MCP routing
 * added for #529 silently does nothing.
 *
 * The documented spelling for "every tool from any server" is `mcp__.*`: the
 * `.*` pushes the matcher onto the regex path, where it is tested
 * unanchored against `mcp__<server>__<tool>`.
 *
 * The `.*` must live in its OWN matcher entry. Folding it into a
 * pipe-joined list (e.g. `Bash|Read|mcp__.*`) puts that whole list on the
 * regex path, where every alternative becomes an unanchored substring match
 * — `Read` would then also fire on `NotebookRead`, `Edit` on `MultiEdit`, and
 * so on. Keeping the catch-all separate leaves the tool-name list on the
 * exact-match path, which is what it was written for.
 *
 * v1.0.124 used a negative lookahead `mcp__(?!plugin_context-mode_)` to skip
 * context-mode's own MCP tools, but this same hooks.json is bundled to Codex
 * CLI which uses Rust's `regex` crate (no look-around support) — Codex
 * rejected the matcher at boot, breaking every Codex user (#547). Plain
 * `.*` is supported by both engines; the hook BODY (`isExternalMcpTool()` in
 * hooks/core/routing.mjs) already filters context-mode's own tools, so
 * semantics are preserved.
 */
export const EXTERNAL_MCP_MATCHER_PATTERN = "mcp__.*";

/** Tools that context-mode's PreToolUse hook intercepts. */
export const PRE_TOOL_USE_MATCHERS = [
  "Bash",
  "WebFetch",
  "Read",
  "Grep",
  "Agent",
  "mcp__plugin_context-mode_context-mode__ctx_execute",
  "mcp__plugin_context-mode_context-mode__ctx_execute_file",
  "mcp__plugin_context-mode_context-mode__ctx_batch_execute",
  EXTERNAL_MCP_MATCHER_PATTERN,
] as const;

/**
 * Seconds a command hook may run before the host kills it (Claude Code #1226).
 * Without a bound, a hook stuck on stdin or in a loop blocks the CLI with no
 * way out — the user cannot interrupt a turn that never yields.
 *
 * The values live in the config the host reads (shipped `hooks/hooks.json` and
 * the `generateHookConfig` output written into settings.json), because
 * `ctx upgrade` rewrites those; patching the plugin cache by hand is undone on
 * the next update.
 *
 * PreToolUse gets the tight bound because it sits on the critical path of every
 * tool call — its work is in-process routing, so a slow one means something is
 * wrong, not that it needs longer. The rest fire at most once per turn and open
 * a SQLite handle, so they get room to finish a cold start.
 */
export const HOOK_TIMEOUT_SECONDS: Record<string, number> = {
  PreToolUse: 10,
  PostToolUse: 30,
  PreCompact: 30,
  UserPromptSubmit: 30,
  SessionStart: 30,
  Stop: 30,
};

/**
 * Combined matcher pattern for settings.json (pipe-separated).
 * Used by the upgrade command when writing a single consolidated entry.
 *
 * Excludes EXTERNAL_MCP_MATCHER_PATTERN: that is a regex, and folding it into
 * this list would put every tool name here on Claude Code's unanchored-regex
 * path. It is registered as its own matcher entry instead (#1222).
 */
export const PRE_TOOL_USE_MATCHER_PATTERN = PRE_TOOL_USE_MATCHERS.filter(
  (matcher) => matcher !== EXTERNAL_MCP_MATCHER_PATTERN,
).join("|");

// ─────────────────────────────────────────────────────────
// PostToolUse matchers (#229)
// ─────────────────────────────────────────────────────────

/**
 * Tools that context-mode's PostToolUse hook should fire on.
 * Only tools that extractEvents() actually handles — all others
 * produce zero events and cause false "hook error" display.
 *
 * The external-MCP catch-all is NOT a member of this list. It is a regex
 * (`mcp__.*`), and joining it here would drag every other tool name onto
 * Claude Code's unanchored-regex path, where `Read` would also match
 * `NotebookRead` and `Edit` would match `MultiEdit`. It is emitted as its own
 * matcher group instead — see POST_TOOL_USE_MCP_CATCH_ALL_MATCHER.
 */
export const POST_TOOL_USE_MATCHERS = [
  "Bash",
  "Read",
  "Write",
  "Edit",
  "NotebookEdit",
  "Glob",
  "Grep",
  "TodoWrite",
  "TaskCreate",
  "TaskUpdate",
  "EnterPlanMode",
  "ExitPlanMode",
  "Skill",
  "Agent",
  "AskUserQuestion",
  "EnterWorktree",
] as const;

/**
 * Combined matcher pattern for PostToolUse in hooks.json / settings.json.
 */
export const POST_TOOL_USE_MATCHER_PATTERN = POST_TOOL_USE_MATCHERS.join("|");

/**
 * Separate PostToolUse matcher group for external MCP tools (#1222).
 *
 * Kept out of POST_TOOL_USE_MATCHERS so the tool-name list above stays on
 * Claude Code's exact-match path; see EXTERNAL_MCP_MATCHER_PATTERN.
 */
export const POST_TOOL_USE_MCP_CATCH_ALL_MATCHER = EXTERNAL_MCP_MATCHER_PATTERN;

// ─────────────────────────────────────────────────────────
// Hook script file names
// ─────────────────────────────────────────────────────────

/** Map of hook types to their script file names. */
export const HOOK_SCRIPTS: Record<HookType, string> = {
  PreToolUse: "pretooluse.mjs",
  PostToolUse: "posttooluse.mjs",
  PreCompact: "precompact.mjs",
  SessionStart: "sessionstart.mjs",
  UserPromptSubmit: "userpromptsubmit.mjs",
  Stop: "stop.mjs",
};

// ─────────────────────────────────────────────────────────
// Hook validation
// ─────────────────────────────────────────────────────────

/** Required hooks that must be configured for context-mode to function. */
export const REQUIRED_HOOKS: HookType[] = [
  HOOK_TYPES.PRE_TOOL_USE,
  HOOK_TYPES.SESSION_START,
];

/** Optional hooks that enhance functionality but aren't critical. */
export const OPTIONAL_HOOKS: HookType[] = [
  HOOK_TYPES.POST_TOOL_USE,
  HOOK_TYPES.PRE_COMPACT,
  HOOK_TYPES.USER_PROMPT_SUBMIT,
  HOOK_TYPES.STOP,
];

/**
 * Check if a hook entry points to a context-mode hook script.
 * Matches both legacy format (node .../pretooluse.mjs) and
 * CLI dispatcher format (context-mode hook claude-code pretooluse).
 */
export function isContextModeHook(
  entry: { hooks?: Array<{ command?: string }> },
  hookType: HookType,
): boolean {
  const scriptName = HOOK_SCRIPTS[hookType];
  const cliCommand = buildHookCommand(hookType);
  return (
    entry.hooks?.some((h) =>
      h.command?.includes(scriptName) || h.command?.includes(cliCommand),
    ) ?? false
  );
}

/**
 * Build the hook command string for a given hook type.
 * Uses process.execPath + forward slashes to avoid PATH issues and MSYS
 * path mangling on Windows (#369, #372).
 * Falls back to CLI dispatcher if pluginRoot is not provided.
 */
export function buildHookCommand(hookType: HookType, pluginRoot?: string): string {
  if (pluginRoot) {
    const scriptName = HOOK_SCRIPTS[hookType];
    return buildHookRuntimeCommand(`${pluginRoot}/hooks/${scriptName}`);
  }
  return `context-mode hook claude-code ${hookType.toLowerCase()}`;
}

/**
 * Extract the hook script file path from a command string.
 *
 * Algo-D2 twin — same shape as `src/util/hook-config.ts::extractHookScriptPath`.
 * Delegates to `parseNodeCommand` for canonical buildNodeCommand-shape;
 * keeps narrow legacy fallbacks for pre-D3 settings.json entries
 * (`node "X.mjs"` and `node X.mjs` with no internal whitespace).
 *
 * Pre-D2 this matched `node\s+"?([^"]+\.mjs)"?` — the unquoted fallback
 * silently grabbed the tail after the last whitespace, producing the
 * #548 doubled-path FAIL on Windows paths with spaces. The new shape
 * refuses ambiguous input; doctor (Algo-D1) falls through to direct
 * `existsSync` instead of trusting the regex.
 */
export function extractHookScriptPath(command: string): string | null {
  const parsed = parseNodeCommand(command);
  if (parsed) {
    return parsed.scriptPath.endsWith(".mjs") ? parsed.scriptPath : null;
  }
  const legacyQuoted = command.match(/^\s*node\s+"([^"]+\.mjs)"\s*$/);
  if (legacyQuoted) return legacyQuoted[1];
  const legacyBare = command.match(/^\s*node\s+(\S+\.mjs)\s*$/);
  if (legacyBare) return legacyBare[1];
  return null;
}

/**
 * Check if a hook entry is a context-mode hook (any hook type).
 * Broader than `isContextModeHook` — matches any context-mode script name
 * without requiring a specific hookType.
 */
export function isAnyContextModeHook(
  entry: { hooks?: Array<{ command?: string }> },
): boolean {
  const scriptNames = Object.values(HOOK_SCRIPTS);
  return (
    entry.hooks?.some((h) =>
      h.command != null &&
      (scriptNames.some((s) => h.command!.includes(s)) ||
        h.command.includes("context-mode hook")),
    ) ?? false
  );
}
