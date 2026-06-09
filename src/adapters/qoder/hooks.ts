/**
 * adapters/qoder/hooks — Qoder hook definitions and config helpers.
 *
 * Qoder uses settings.json-embedded hook config (same paradigm as Claude Code).
 * Hook entries use `{ matcher, hooks: [{ type: "command", command }] }` format.
 */

/** Qoder hook event names. */
export const HOOK_TYPES = {
  PRE_TOOL_USE: "PreToolUse",
  POST_TOOL_USE: "PostToolUse",
  USER_PROMPT_SUBMIT: "UserPromptSubmit",
  STOP: "Stop",
} as const;

export type HookType = (typeof HOOK_TYPES)[keyof typeof HOOK_TYPES];

/** Map of hook types to script filenames. */
export const HOOK_SCRIPTS: Record<HookType, string> = {
  [HOOK_TYPES.PRE_TOOL_USE]: "pretooluse.mjs",
  [HOOK_TYPES.POST_TOOL_USE]: "posttooluse.mjs",
  [HOOK_TYPES.USER_PROMPT_SUBMIT]: "userpromptsubmit.mjs",
  [HOOK_TYPES.STOP]: "stop.mjs",
};

/**
 * PreToolUse matcher pattern for tools context-mode routes proactively.
 * Uses Qoder's compatible tool names (Bash, Read, etc.).
 */
export const PRE_TOOL_USE_MATCHERS = [
  "Bash",
  "Read",
  "Grep",
  "WebFetch",
  "Task",
  "mcp__",
] as const;

export const PRE_TOOL_USE_MATCHER_PATTERN = PRE_TOOL_USE_MATCHERS.join("|");

/** Required hooks for Qoder. */
export const REQUIRED_HOOKS: HookType[] = [
  HOOK_TYPES.PRE_TOOL_USE,
];

/** Optional hooks that improve behavior. */
export const OPTIONAL_HOOKS: HookType[] = [
  HOOK_TYPES.POST_TOOL_USE,
  HOOK_TYPES.STOP,
  HOOK_TYPES.USER_PROMPT_SUBMIT,
];

/** Qoder hook entry in settings.json hooks array. */
export interface QoderHookEntry {
  matcher?: string;
  hooks: Array<{ type: string; command: string; timeout?: number }>;
}

/** Check whether a hook entry points to context-mode. */
export function isContextModeHook(
  entry: QoderHookEntry,
  _hookType: HookType,
): boolean {
  return entry.hooks?.some((hook) => {
    const cmd = hook.command ?? "";
    return cmd.includes("context-mode") && cmd.includes("qoder");
  }) ?? false;
}

/** Build the CLI dispatcher command for a Qoder hook type. */
export function buildHookCommand(hookType: HookType): string {
  return `context-mode hook qoder ${hookType.toLowerCase()}`;
}
