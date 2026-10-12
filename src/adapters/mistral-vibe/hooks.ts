/**
 * adapters/mistral-vibe/hooks — Mistral Vibe hook definitions.
 *
 * Mistral Vibe supports 3 hook types via TOML `[[hooks]]` array tables in
 * ~/.vibe/hooks.toml (or $VIBE_HOME/hooks.toml). Hooks are invoked as
 * subprocesses with JSON payloads on stdin; responses are JSON on stdout
 * with exit code 0.
 *
 * Reference: https://docs.mistral.ai/vibe/code/cli/hooks
 * Source: vibe/core/hooks/models.py in mistralai/mistral-vibe
 *
 * Hook types:
 *   - pre_tool  — Before tool execution. Can rewrite tool_input or deny.
 *   - post_tool — After tool execution. Can inject additional_context.
 *   - post_agent — After each agent turn. No tool payload.
 *
 * Wire protocol:
 *   stdin:
 *     {
 *       "session_id": "...",
 *       "hook_event_name": "pre_tool" | "post_tool" | "post_agent",
 *       "transcript_path": "/path/to/messages.jsonl",
 *       "cwd": "/current/working/dir",
 *       "parent_session_id": null | "...",
 *       "tool_name": "bash",           // pre_tool / post_tool only
 *       "tool_call_id": "call_xyz",    // pre_tool / post_tool only
 *       "tool_input": {...},           // pre_tool / post_tool only
 *       // post_tool additional fields:
 *       "tool_status": "success" | "failure" | "cancelled",
 *       "tool_output": {...} | null,
 *       "tool_output_text": "...",
 *       "tool_error": null | "...",
 *       "duration_ms": 123.4
 *     }
 *
 *   stdout (exit 0, JSON on single line):
 *     {
 *       "decision": "allow" | "deny",   // optional, defaults to "allow"
 *       "reason": "...",                 // optional
 *       "system_message": "...",         // optional, shown to user
 *       "hook_specific_output": {
 *         "tool_input": {...},           // pre_tool: rewrite tool input
 *         "additional_context": "..."    // post_tool: inject context
 *       }
 *     }
 *
 * Known limitations:
 *   - No PreCompact / SessionStart / UserPromptSubmit / Stop equivalents
 *   - additional_context (post_tool) is text-append only, not model-injected
 *   - No ask/confirm — Vibe's own approval flow fires on rewritten commands
 */

// ─────────────────────────────────────────────────────────
// Hook type constants
// ─────────────────────────────────────────────────────────

/** Mistral Vibe hook types — three lifecycle events. */
export const HOOK_TYPES = {
  PRE_TOOL: "pre_tool",
  POST_TOOL: "post_tool",
  POST_AGENT: "post_agent",
} as const;

// ─────────────────────────────────────────────────────────
// Pre-tool matcher
// ─────────────────────────────────────────────────────────

/**
 * Tool name matcher for pre_tool hooks.
 *
 * Vibe's `match` field is a substring OR regex applied to tool_name. Bash is
 * the primary target for context-mode routing (curl/wget interception,
 * routing nudges). Other tools bypass the pre_tool hook and are captured only
 * by post_tool for session events.
 *
 * NOTE: Vibe's TOML `match` accepts one string. To match multiple tools,
 * register multiple [[hooks]] blocks. context-mode installs a single bash-
 * scoped hook to minimize overhead on lightweight tools (read_file, etc.).
 */
export const PRE_TOOL_MATCHER = "bash";

// ─────────────────────────────────────────────────────────
// Hook commands
// ─────────────────────────────────────────────────────────

export const VIBE_HOOK_COMMANDS = {
  pre_tool: "context-mode hook mistral-vibe pretooluse",
  post_tool: "context-mode hook mistral-vibe posttooluse",
  post_agent: "context-mode hook mistral-vibe postagent",
} as const;

// ─────────────────────────────────────────────────────────
// Routing instructions
// ─────────────────────────────────────────────────────────

/**
 * Path to the routing instructions file for Mistral Vibe.
 * Vibe reads AGENTS.md from the project root by default.
 */
export const ROUTING_INSTRUCTIONS_PATH = "configs/mistral-vibe/AGENTS.md";
