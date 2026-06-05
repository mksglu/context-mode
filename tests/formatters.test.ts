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

describe("copilot-cli formatter", () => {
  it("deny emits permissionDecision and permissionDecisionReason", () => {
    const result = formatters["copilot-cli"].deny("operation not allowed");
    expect(result.permissionDecision).toBe("deny");
    expect(result.permissionDecisionReason).toBe("operation not allowed");
    expect(result).not.toHaveProperty("hookSpecificOutput");
  });

  it("ask emits permissionDecision without hookSpecificOutput", () => {
    const result = formatters["copilot-cli"].ask();
    expect(result.permissionDecision).toBe("ask");
    expect(result).not.toHaveProperty("hookSpecificOutput");
  });

  it("modify emits flat allow with modifiedArgs (no hookSpecificOutput wrapper, no hookEventName)", () => {
    const result = formatters["copilot-cli"].modify({ prompt: "modified input" });
    // Flat schema per GitHub Copilot CLI hooks reference
    expect(result.permissionDecision).toBe("allow");
    expect(result.modifiedArgs).toEqual({ prompt: "modified input" });
    expect(result).not.toHaveProperty("hookSpecificOutput");
    expect(result).not.toHaveProperty("hookEventName");
    expect(result).not.toHaveProperty("updatedInput");
    expect(result).not.toHaveProperty("permissionDecisionReason");
  });

  it("context emits flat additionalContext (no hookSpecificOutput wrapper, no hookEventName)", () => {
    const result = formatters["copilot-cli"].context("additional info");
    // Flat schema per GitHub Copilot CLI hooks reference
    expect(result.additionalContext).toBe("additional info");
    expect(result).not.toHaveProperty("hookSpecificOutput");
    expect(result).not.toHaveProperty("hookEventName");
    expect(result).not.toHaveProperty("permissionDecision");
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

  it("copilot-cli deny flows through with correct field names", () => {
    const result = formatDecision("copilot-cli", { action: "deny", reason: "denied" });
    expect(result.permissionDecision).toBe("deny");
    expect(result.permissionDecisionReason).toBe("denied");
    expect(result).not.toHaveProperty("hookSpecificOutput");
  });

  it("copilot-cli ask flows through correctly", () => {
    const result = formatDecision("copilot-cli", { action: "ask" });
    expect(result.permissionDecision).toBe("ask");
  });

  it("copilot-cli modify flows through flat: allow + modifiedArgs (no hookSpecificOutput, no updatedInput)", () => {
    const result = formatDecision("copilot-cli", { action: "modify", updatedInput: { file: "test.ts" } });
    // Flat schema per GitHub Copilot CLI hooks reference
    expect(result.permissionDecision).toBe("allow");
    expect(result.modifiedArgs).toEqual({ file: "test.ts" });
    expect(result).not.toHaveProperty("hookSpecificOutput");
    expect(result).not.toHaveProperty("updatedInput");
    expect(result).not.toHaveProperty("hookEventName");
    expect(result).not.toHaveProperty("permissionDecisionReason");
  });

  it("copilot-cli context flows through flat: additionalContext only (no hookSpecificOutput, no hookEventName)", () => {
    const result = formatDecision("copilot-cli", { action: "context", additionalContext: "extra context data" });
    // Flat schema per GitHub Copilot CLI hooks reference
    expect(result.additionalContext).toBe("extra context data");
    expect(result).not.toHaveProperty("hookSpecificOutput");
    expect(result).not.toHaveProperty("hookEventName");
  });
});
