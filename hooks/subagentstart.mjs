#!/usr/bin/env node
/**
 * SubagentStart hook for context-mode (Claude Code)
 *
 * Gives each subagent the context-mode routing block as additionalContext.
 * This replaces appending the block to the Agent tool's prompt in PreToolUse:
 * a rewritten Agent input trips Claude Code's auto-mode permission classifier,
 * which denies the spawn as instruction injection (#911, #946, #967).
 *
 * - Omits <ctx_commands>: subagents cannot run ctx stats/doctor/upgrade (#233).
 * - Includes the ToolSearch bootstrap: ctx_* tools are deferred (#724).
 * - Skips Bash-type subagents, which have no MCP tools.
 * - CONTEXT_MODE_NO_AGENT_INJECTION=1 disables it.
 *
 * Crash-resilience: wrapped via runHook (#414).
 */

import { runHook } from "./run-hook.mjs";

await runHook(async () => {
  if (process.env.CONTEXT_MODE_NO_AGENT_INJECTION === "1") return;

  const { readStdin } = await import("./core/stdin.mjs");
  const { parseStdin } = await import("./session-helpers.mjs");
  const { createRoutingBlock } = await import("./routing-block.mjs");
  const { createToolNamer } = await import("./core/tool-naming.mjs");

  const input = parseStdin(await readStdin());
  if (input.agent_type === "Bash") return;

  const additionalContext = createRoutingBlock(createToolNamer("claude-code"), {
    includeCommands: false,
    toolSearchBootstrap: true,
  });

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "SubagentStart",
      additionalContext,
    },
  }) + "\n");
});
