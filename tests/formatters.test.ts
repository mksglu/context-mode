import { describe, it, expect } from "vitest";
import { formatters, formatDecision } from "../hooks/core/formatters.mjs";

describe("claude-code formatter", () => {
  it("deny uses permissionDecisionReason, not reason", () => {
    const result = formatters["claude-code"].deny("blocked by sandbox");
    const output = result.hookSpecificOutput;
    expect(output.permissionDecisionReason).toBe("blocked by sandbox");
    expect(output).not.toHaveProperty("reason");
  });

  // Per 4bc292f: CC ignores updatedInput.command for Bash, so allow+updatedInput
  // never reaches the user. The forced-deny probe + echo payload in the reason
  // is the only way to surface a redirect; for non-Bash tools we drop the
  // explicit permissionDecision and let CC's default-allow path apply.
  it("modify with bash command emits forced-deny probe", () => {
    const result = formatters["claude-code"].modify({ command: "ls" });
    const output = result.hookSpecificOutput;
    expect(output.permissionDecision).toBe("deny");
    expect(output.permissionDecisionReason).toBeDefined();
  });

  it("modify with bash echo payload extracts the quoted message as deny reason", () => {
    const result = formatters["claude-code"].modify({ command: 'echo "use ctx_execute instead"' });
    const output = result.hookSpecificOutput;
    expect(output.permissionDecision).toBe("deny");
    expect(output.permissionDecisionReason).toBe("use ctx_execute instead");
  });

  it("modify with non-bash input pairs the rewrite with an explicit allow", () => {
    // Claude Code honours updatedInput alongside permissionDecision "allow".
    // Emitted alone the rewrite is ignored, so the ctx_execute cwd pin fell
    // through to the permission prompt on every shell call despite a
    // permissions.allow rule (#1142). The previous version of this test
    // asserted the ABSENCE of a decision, which is the defect itself.
    const result = formatters["claude-code"].modify({ prompt: "modified" });
    const output = result.hookSpecificOutput;
    expect(output.updatedInput).toEqual({ prompt: "modified" });
    expect(output.permissionDecision).toBe("allow");
  });
});

// #979 — the headless gate has to live on the module the hook actually loads.
// hooks/pretooluse.mjs imports hooks/core/formatters.mjs; the gate used to sit
// in hooks/formatters/claude-code.mjs, which nothing in hooks/ imports.
describe("claude-code headless passthrough on the ACTIVE formatter (#979)", () => {
  const withHeadless = (value: string | undefined, run: () => unknown) => {
    const saved = process.env.CLAUDE_CODE_HEADLESS;
    if (value === undefined) delete process.env.CLAUDE_CODE_HEADLESS;
    else process.env.CLAUDE_CODE_HEADLESS = value;
    try {
      return run();
    } finally {
      if (saved === undefined) delete process.env.CLAUDE_CODE_HEADLESS;
      else process.env.CLAUDE_CODE_HEADLESS = saved;
    }
  };

  it("deny passes through — there is no UI to reconsider it", () => {
    expect(withHeadless("1", () => formatDecision("claude-code", { action: "deny", reason: "x" }))).toBeNull();
  });

  it("ask passes through — with no TTY it would hang the run forever", () => {
    expect(withHeadless("1", () => formatDecision("claude-code", { action: "ask" }))).toBeNull();
  });

  it("modify passes through — an echo-only rewrite yields no stdout to read", () => {
    expect(
      withHeadless("1", () =>
        formatDecision("claude-code", {
          action: "modify",
          updatedInput: { command: 'echo "use ctx_execute"' },
        }),
      ),
    ).toBeNull();
  });

  it("still injects additionalContext — informational, never blocked", () => {
    const r = withHeadless("1", () =>
      formatDecision("claude-code", { action: "context", additionalContext: "tip" }),
    ) as { hookSpecificOutput: { additionalContext: string } };
    expect(r.hookSpecificOutput.additionalContext).toBe("tip");
  });

  it('only the exact value "1" enables it', () => {
    expect(
      withHeadless("true", () => formatDecision("claude-code", { action: "deny", reason: "x" })),
    ).not.toBeNull();
  });

  it("interactive mode is unchanged — routing must not be disabled wholesale", () => {
    withHeadless(undefined, () => {
      expect(
        (formatDecision("claude-code", { action: "deny", reason: "x" }) as { hookSpecificOutput: { permissionDecision: string } })
          .hookSpecificOutput.permissionDecision,
      ).toBe("deny");
      expect(
        (formatDecision("claude-code", { action: "ask" }) as { hookSpecificOutput: { permissionDecision: string } })
          .hookSpecificOutput.permissionDecision,
      ).toBe("ask");
      expect(
        (formatDecision("claude-code", { action: "modify", updatedInput: { command: "ls" } }) as { hookSpecificOutput: { permissionDecision: string } })
          .hookSpecificOutput.permissionDecision,
      ).toBe("deny");
    });
  });
});

describe("vscode-copilot formatter", () => {
  it("deny uses permissionDecisionReason, not reason", () => {
    const result = formatters["vscode-copilot"].deny("not allowed");
    expect(result.permissionDecisionReason).toBe("not allowed");
    expect(result).not.toHaveProperty("reason");
  });

  it("modify includes permissionDecision and permissionDecisionReason alongside updatedInput", () => {
    const result = formatters["vscode-copilot"].modify({ file_path: "/tmp/x" });
    const output = result.hookSpecificOutput;
    expect(output.permissionDecision).toBe("allow");
    expect(output.permissionDecisionReason).toBeDefined();
    expect(output.updatedInput).toEqual({ file_path: "/tmp/x" });
  });
});

describe("formatDecision integration", () => {
  it("claude-code deny flows through with correct field names", () => {
    const result = formatDecision("claude-code", { action: "deny", reason: "sandbox only" });
    expect(result.hookSpecificOutput.permissionDecisionReason).toBe("sandbox only");
    expect(result.hookSpecificOutput).not.toHaveProperty("reason");
  });

  it("claude-code modify with bash command flows through as forced-deny", () => {
    const result = formatDecision("claude-code", { action: "modify", updatedInput: { command: "echo hi" } });
    expect(result.hookSpecificOutput.permissionDecision).toBe("deny");
    expect(result.hookSpecificOutput.permissionDecisionReason).toBeDefined();
  });

});
