import "../setup-home";
import { describe, it, expect } from "vitest";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { QoderAdapter } from "../../src/adapters/qoder/index.js";

const adapter = new QoderAdapter();

describe("QoderAdapter", () => {
  it("declares the complete Qoder hook capability set", () => {
    expect(adapter.capabilities).toEqual({
      preToolUse: true,
      postToolUse: true,
      preCompact: true,
      sessionStart: true,
      canModifyArgs: true,
      canModifyOutput: true,
      canInjectSessionContext: true,
    });
  });

  it("uses home-rooted Qoder configuration and AGENTS.md", () => {
    expect(adapter.getConfigDir("/ignored/project")).toBe(join(homedir(), ".qoder"));
    expect(adapter.getSettingsPath()).toBe(join(homedir(), ".qoder", "settings.json"));
    expect(adapter.getInstructionFiles()).toEqual(["AGENTS.md"]);
  });

  it("parses hook payload fields from stdin JSON", () => {
    const event = adapter.parsePreToolUseInput({
      session_id: "qoder-session-1",
      cwd: "/project",
      tool_name: "Bash",
      tool_input: { command: "git status" },
    });
    expect(event).toMatchObject({
      sessionId: "qoder-session-1",
      projectDir: "/project",
      toolName: "Bash",
      toolInput: { command: "git status" },
    });
  });

  it("normalizes SessionStart and PreCompact payloads", () => {
    expect(adapter.parseSessionStartInput?.({ session_id: "s", cwd: "/p", source: "resume" }))
      .toMatchObject({ sessionId: "s", projectDir: "/p", source: "resume" });
    expect(adapter.parsePreCompactInput?.({ session_id: "s", cwd: "/p" }))
      .toMatchObject({ sessionId: "s", projectDir: "/p" });
  });

  it("formats supported input and output rewrites", () => {
    expect(adapter.formatPreToolUseResponse({
      decision: "modify", updatedInput: { command: "ctx_search query" },
    })).toEqual({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
        updatedInput: { command: "ctx_search query" },
      },
    });
    expect(adapter.formatPostToolUseResponse({ updatedOutput: "indexed" })).toEqual({
      hookSpecificOutput: { hookEventName: "PostToolUse", updatedToolOutput: "indexed" },
    });
  });

  it("formats lifecycle context using Qoder hookSpecificOutput", () => {
    expect(adapter.formatSessionStartResponse?.({ context: "routing" })).toEqual({
      hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: "routing" },
    });
    expect(adapter.formatPreCompactResponse?.({ context: "snapshot" })).toEqual({
      hookSpecificOutput: { hookEventName: "PreCompact", additionalContext: "snapshot" },
    });
  });

  it("generates all six hook registrations", () => {
    const hooks = adapter.generateHookConfig("/plugin") as Record<string, unknown>;
    expect(Object.keys(hooks).sort()).toEqual([
      "PostToolUse", "PreCompact", "PreToolUse", "SessionStart", "Stop", "UserPromptSubmit",
    ]);
  });
});

describe("native Qoder plugin", () => {
  const root = resolve(process.cwd());
  const manifest = JSON.parse(readFileSync(join(root, ".qoder-plugin", "plugin.json"), "utf8"));
  const hookFile = JSON.parse(readFileSync(join(root, ".qoder-plugin", "hooks.json"), "utf8"));

  it("keeps its version aligned and exposes MCP, skills, and hooks", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    expect(manifest.version).toBe(pkg.version);
    expect(manifest).toMatchObject({
      mcpServers: "./.qoder-plugin/mcp.json",
      hooks: "./.qoder-plugin/hooks.json",
      skills: "./skills/",
    });
  });

  it("uses relocatable QODER_PLUGIN_ROOT commands for all six hooks", () => {
    const expected = ["PreToolUse", "PostToolUse", "SessionStart", "PreCompact", "UserPromptSubmit", "Stop"];
    expect(Object.keys(hookFile.hooks).sort()).toEqual(expected.sort());
    for (const entries of Object.values(hookFile.hooks) as Array<Array<{ hooks: Array<{ command: string }> }>>) {
      for (const entry of entries) {
        for (const hook of entry.hooks) {
          expect(hook.command).toContain("$QODER_PLUGIN_ROOT/hooks/qoder/");
          const relative = hook.command.match(/hooks\/qoder\/([^\"]+)/)?.[0];
          expect(relative && existsSync(join(root, relative))).toBe(true);
        }
      }
    }
  });
});
