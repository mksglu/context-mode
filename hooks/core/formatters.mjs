/**
 * Platform-specific response formatters.
 * Takes normalized decision from routing.mjs -> platform-specific JSON output.
 */

export const formatters = {
  "claude-code": {
    deny: (reason) => ({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    }),
    ask: () => ({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "ask",
      },
    }),
    // Tool-aware modify handling for claude-code:
    //
    // - Bash redirect (updatedInput.command): CC v2.1.x ignores
    //   `updatedInput.command` substitution under `permissionDecision: "allow"`
    //   — original command runs unchanged. Verified via /diagnose Phase 4
    //   forced-deny probe: only `permissionDecision: "deny"` is honored for
    //   Bash blocking. Emit deny + extract echo payload into
    //   `permissionDecisionReason`.
    //
    // - Agent prompt injection (updatedInput.prompt): CC honors
    //   allow+updatedInput for Agent tool — modified prompt reaches the
    //   subagent. Keep modify shape so subagent routing-block injection works.
    //
    // - Any other shape: pass through as modify and let CC decide.
    //
    // Other adapters (gemini-cli, vscode-copilot, etc.) keep their own modify
    // semantics — their hosts implement updatedInput differently or not at all.
    modify: (updatedInput) => {
      const ui = updatedInput ?? {};
      const isBashCommandRedirect = "command" in ui;
      if (!isBashCommandRedirect) {
        return {
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            updatedInput: ui,
          },
        };
      }
      // routing.mjs wraps the redirect guidance in `echo "..."` form.
      // Extract the quoted payload as the deny reason. Fall back to a generic
      // ADR-0003 CASE A message if the shape doesn't match.
      const cmd = ui.command ?? "";
      const m = cmd.match(/^echo\s+"(.+)"$/s);
      const reason = m
        ? m[1]
        : "Redirected to ctx_execute / ctx_fetch_and_index. Call ctx_execute(language, code) to fetch and derive your answer in one round trip, or call ctx_fetch_and_index(url, source) when you want to query the response later via ctx_search. Both have full network access. Retry the same call on a transient DNS error (EAI_AGAIN, ETIMEDOUT, ENETUNREACH).";
      return {
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: reason,
        },
      };
    },
    context: (additionalContext) => ({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        additionalContext,
      },
    }),
  },

  "gemini-cli": {
    deny: (reason) => ({ decision: "deny", reason }),
    ask: () => null, // Gemini CLI has no "ask" concept
    modify: (updatedInput) => ({
      hookSpecificOutput: { tool_input: updatedInput },
    }),
    context: (additionalContext) => ({
      hookSpecificOutput: { additionalContext },
    }),
  },

  "vscode-copilot": {
    deny: (reason) => ({
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    }),
    ask: () => ({
      permissionDecision: "ask",
    }),
    modify: (updatedInput) => ({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
        permissionDecisionReason: "Routed to context-mode sandbox",
        updatedInput,
      },
    }),
    context: (additionalContext) => ({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        additionalContext,
      },
    }),
  },

  "jetbrains-copilot": {
    deny: (reason) => ({
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    }),
    ask: () => ({
      permissionDecision: "ask",
    }),
    modify: (updatedInput) => ({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
        permissionDecisionReason: "Routed to context-mode sandbox",
        updatedInput,
      },
    }),
    context: (additionalContext) => ({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        additionalContext,
      },
    }),
  },

  "copilot-cli": {
    deny: (reason) => ({
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    }),
    ask: () => ({
      permissionDecision: "ask",
    }),
    modify: (updatedInput) => ({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
        permissionDecisionReason: "Routed to context-mode sandbox",
        updatedInput,
      },
    }),
    context: (additionalContext) => ({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        additionalContext,
      },
    }),
  },

  "codex": {
    deny: (reason) => ({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    }),
    ask: () => null, // Codex rejects permissionDecision: "ask" in PreToolUse
    modify: () => null, // Codex rejects updatedInput in PreToolUse
    context: () => null, // Codex rejects additionalContext in PreToolUse (fails open)
  },

  "kimi": {
    // Kimi Code / Kimi CLI hook runners parse ONLY `permissionDecision === "deny"`
    // for structured PreToolUse output. Anything else (ask / allow+updatedInput /
    // additionalContext) is silently dropped, and the host's HookResult type has
    // no `additionalContext` field at all.
    //   Evidence: refs/platforms/kimi-code/packages/agent-core/src/session/hooks/
    //     runner.ts:36-39,162-178  (HookSpecificOutputSchema + structuredOutput())
    //   Evidence: refs/platforms/kimi-code/packages/agent-core/src/session/hooks/
    //     types.ts:28-37            (HookResult has no additionalContext)
    //   Evidence: refs/platforms/kimi-cli/src/kimi_cli/hooks/runner.py:62-89
    //     (Python runtime behaves identically)
    // This mirrors the codex precedent established at commit 607dc70 (#225),
    // where the same upstream "deny-only" parser forced ask/modify/context to
    // return null in the formatter rather than emit fields the host ignores.
    deny: (reason) => ({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    }),
    ask: () => null,     // Kimi runner ignores permissionDecision !== "deny"
    modify: () => null,  // Kimi runner has no updatedInput channel
    context: () => null, // Kimi HookResult has no additionalContext field
  },

  "cursor": {
    deny: (reason) => ({
      permission: "deny",
      user_message: reason,
    }),
    ask: () => ({
      permission: "ask",
    }),
    modify: (updatedInput) => ({
      updated_input: updatedInput,
    }),
    context: (additionalContext) => ({
      agent_message: additionalContext,
    }),
  },
};

/**
 * Apply a formatter to a normalized routing decision.
 * Returns the platform-specific JSON response, or null for passthrough.
 */
export function formatDecision(platform, decision) {
  if (!decision) return null;

  const fmt = formatters[platform];
  if (!fmt) return null;

  switch (decision.action) {
    case "deny": return fmt.deny(decision.reason);
    case "ask": return fmt.ask();
    case "modify": return fmt.modify(decision.updatedInput);
    case "context": return fmt.context(decision.additionalContext);
    default: return null;
  }
}
