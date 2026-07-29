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

  it("modify with non-bash input returns updatedInput and lets CC default-allow", () => {
    const result = formatters["claude-code"].modify({ prompt: "modified" });
    const output = result.hookSpecificOutput;
    expect(output.updatedInput).toEqual({ prompt: "modified" });
    expect(output).not.toHaveProperty("permissionDecision");
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

describe("hermes formatter", () => {
  it("turns unsupported argument rewrites into enforceable denials", () => {
    const result = formatDecision("hermes", {
      action: "modify",
      updatedInput: { command: 'echo "use mcp__context_mode__ctx_execute"' },
    });
    expect(result.hookSpecificOutput.permissionDecision).toBe("deny");
    expect(result.hookSpecificOutput.permissionDecisionReason).toContain("ctx_execute");
  });

  it("uses the Hermes block shape for direct denials", () => {
    const result = formatDecision("hermes", { action: "deny", reason: "blocked" });
    expect(result).toEqual({
      hookSpecificOutput: {
        permissionDecision: "deny",
        permissionDecisionReason: "blocked",
      },
    });
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
