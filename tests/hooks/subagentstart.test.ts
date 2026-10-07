/**
 * SubagentStart hook (#911, #946, #967)
 *
 * Claude Code delivers the subagent routing block through SubagentStart
 * `additionalContext` instead of rewriting the Agent tool's prompt in
 * PreToolUse. A rewritten Agent input trips the auto-mode permission
 * classifier ("[Auto-Mode Bypass]" / "a hook changed this call's input").
 */

import { describe, test, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOOK_PATH = join(__dirname, "..", "..", "hooks", "subagentstart.mjs");
const PLUGIN_PREFIX = "mcp__plugin_context-mode_context-mode__";

function runHook(input: Record<string, unknown>, env: Record<string, string> = {}) {
  const home = mkdtempSync(join(tmpdir(), "ctx-subagentstart-"));
  try {
    const r = spawnSync("node", [HOOK_PATH], {
      input: JSON.stringify(input),
      encoding: "utf-8",
      timeout: 30_000,
      env: {
        ...process.env,
        HOME: home,
        CLAUDE_CONFIG_DIR: join(home, ".claude"),
        CONTEXT_MODE_NO_AGENT_INJECTION: "",
        ...env,
      },
    });
    return { exitCode: r.status ?? 1, stdout: (r.stdout ?? "").trim() };
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

const baseInput = {
  hook_event_name: "SubagentStart",
  session_id: "sess-subagentstart",
  agent_id: "agent-1",
  agent_type: "general-purpose",
};

describe("SubagentStart hook", () => {
  test("emits the subagent routing block as additionalContext", () => {
    const r = runHook(baseInput);
    expect(r.exitCode).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.hookSpecificOutput.hookEventName).toBe("SubagentStart");
    const ctx: string = out.hookSpecificOutput.additionalContext;
    expect(ctx).toContain("<tool_selection_hierarchy>");
    expect(ctx).toContain("ToolSearch");
    expect(ctx).toContain(PLUGIN_PREFIX + "ctx_batch_execute");
    expect(ctx).toContain(PLUGIN_PREFIX + "ctx_search");
    // Subagents cannot run ctx commands (#233).
    expect(ctx).not.toContain("<ctx_commands>");
  });

  test("emits nothing for Bash-type subagents (no MCP tools)", () => {
    const r = runHook({ ...baseInput, agent_type: "Bash" });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe("");
  });

  test("emits nothing when CONTEXT_MODE_NO_AGENT_INJECTION=1", () => {
    const r = runHook(baseInput, { CONTEXT_MODE_NO_AGENT_INJECTION: "1" });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe("");
  });

  test("exits 0 with no output on malformed stdin", () => {
    const r = spawnSync("node", [HOOK_PATH], { input: "not json", encoding: "utf-8", timeout: 30_000 });
    expect(r.status).toBe(0);
  });
});
