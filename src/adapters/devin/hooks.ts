/**
 * adapters/devin/hooks — Devin CLI hook definitions.
 *
 * Devin CLI (by Cognition) supports Claude-Code-compatible hooks via
 * `.devin/hooks.v1.json` or `.devin/config.json`. The wire protocol is
 * JSON stdin/stdout — same as Claude Code.
 *
 * 6 hook events: PreToolUse, PostToolUse, PreCompact (mapped to
 * PostCompaction), SessionStart, UserPromptSubmit, Stop.
 *
 * Config: ~/.devin/config.json (mcpServers + hooks) or
 *         .devin/hooks.v1.json (project-level hooks).
 * MCP: full support via mcpServers in config.json.
 *
 * Known limitations:
 *   - PreToolUse: deny works (decision:"block" or
 *     permissionDecision:"deny"). updatedInput (modify) is not
 *     documented; we convert modify→deny+context for safety.
 *   - additionalContext injection works via hookSpecificOutput for
 *     PostToolUse, SessionStart, and UserPromptSubmit.
 *   - On Windows, Devin's hook runner cannot spawn commands (confirmed
 *     bug as of Devin 2026.7.23). Hooks are a no-op on Windows until
 *     Cognition fixes the spawn mechanism. The MCP server still works.
 *   - PreCompact is not a Devin event; Devin emits PostCompaction.
 *     We map precompact hooks to fire on PostCompaction.
 */

// ─────────────────────────────────────────────────────────
// Hook type constants
// ─────────────────────────────────────────────────────────

/** Devin CLI hook types — Claude-Code-compatible event names. */
export const HOOK_TYPES = {
  PRE_TOOL_USE: "PreToolUse",
  POST_TOOL_USE: "PostToolUse",
  PRE_COMPACT: "PreCompact",
  SESSION_START: "SessionStart",
  USER_PROMPT_SUBMIT: "UserPromptSubmit",
  STOP: "Stop",
} as const;

// ─────────────────────────────────────────────────────────
// Hook script file names
// ─────────────────────────────────────────────────────────

/**
 * Map of hook types to their script file names.
 *
 * Devin hook scripts live under `<pluginRoot>/hooks/devin/<scriptName>`
 * (see HOOK_MAP in src/cli.ts and setHookPermissions in index.ts).
 * This map is the single source of truth for getHealthChecks —
 * adding a new hook event here auto-extends doctor coverage.
 */
export const HOOK_SCRIPTS: Record<string, string> = {
  [HOOK_TYPES.PRE_TOOL_USE]: "pretooluse.mjs",
  [HOOK_TYPES.POST_TOOL_USE]: "posttooluse.mjs",
  [HOOK_TYPES.PRE_COMPACT]: "precompact.mjs",
  [HOOK_TYPES.SESSION_START]: "sessionstart.mjs",
  [HOOK_TYPES.USER_PROMPT_SUBMIT]: "userpromptsubmit.mjs",
  [HOOK_TYPES.STOP]: "stop.mjs",
};

// ─────────────────────────────────────────────────────────
// External MCP routing matcher
// ─────────────────────────────────────────────────────────

/**
 * PreToolUse matcher for Devin. Devin uses bare tool names (exec, read,
 * grep, webfetch, web_search, etc.) and `mcp__<server>__<tool>` for
 * MCP-namespaced tools — same convention as Codex/Cursor.
 */
export const PRE_TOOL_USE_MATCHER_PATTERN =
  "exec|read|grep|webfetch|web_search|edit|write|Bash|Read|Grep|WebFetch|Edit|Write|ctx_execute|ctx_execute_file|ctx_batch_execute|ctx_fetch_and_index|ctx_search|ctx_index|mcp__";

// ─────────────────────────────────────────────────────────
// Routing instructions
// ─────────────────────────────────────────────────────────

/**
 * Path to the routing instructions file for Devin CLI.
 */
export const ROUTING_INSTRUCTIONS_PATH = "configs/devin/AGENTS.md";
