/**
 * Per-adapter hook command emission — issue #738.
 *
 * The four adapters that emit JS-runtime hook spawn commands (claude-code,
 * qwen-code, gemini-cli, kiro) must route through `buildHookRuntimeCommand`
 * so bun is preferred when available.
 *
 * Adapters that emit CLI dispatcher commands (codex, cursor, vscode-copilot,
 * jetbrains-copilot, copilot-cli) are NOT in scope here — they invoke
 * `context-mode hook <adapter> <event>` which inherits the CLI's runtime choice.
 *
 * Adapters with no JSON-hook layer (pi, omp, opencode, kilo, openclaw,
 * antigravity, zed) are NOT in scope here.
 *
 * Test strategy: rather than fight Vitest's module cache (which caches
 * `runtime.js` after the first import and never picks up subsequent
 * `vi.doMock("node:fs")` calls), we read the host's real runtime resolution
 * and assert each adapter emits exactly that path. This proves the adapter
 * routes through `buildHookRuntimeCommand` because the only other code path
 * (`buildNodeCommand` using `process.execPath`) would produce a different
 * binary name when bun is available on the host.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

describe("hook command emission flows through buildHookRuntimeCommand (#738)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
  });

  test("claude-code generateHookConfig emits the resolved hook runtime path", async () => {
    const { resolveHookRuntime, resetHookRuntimeCache } = await import("../../src/runtime.js");
    resetHookRuntimeCache();
    const runtime = resolveHookRuntime();
    const { ClaudeCodeAdapter } = await import("../../src/adapters/claude-code/index.js");
    const adapter = new ClaudeCodeAdapter();
    const config = adapter.generateHookConfig("/plugin/root") as Record<string, Array<{ hooks: Array<{ command: string }> }>>;
    const preCmd = config.PreToolUse[0].hooks[0].command;
    // Wire format: `"<runtimePath>" "<scriptPath>"` with forward-slashed paths.
    const expectedRuntime = runtime.path.replace(/\\/g, "/");
    expect(preCmd).toBe(`"${expectedRuntime}" "/plugin/root/hooks/pretooluse.mjs"`);
  });

  test("claude-code never emits bare 'node' (Algo-D3 invariant preserved)", async () => {
    const { resetHookRuntimeCache } = await import("../../src/runtime.js");
    resetHookRuntimeCache();
    const { ClaudeCodeAdapter } = await import("../../src/adapters/claude-code/index.js");
    const adapter = new ClaudeCodeAdapter();
    const config = adapter.generateHookConfig("/plugin/root") as Record<string, Array<{ hooks: Array<{ command: string }> }>>;
    const allCommands = Object.values(config).flatMap((entries) =>
      entries.flatMap((e) => e.hooks.map((h) => h.command))
    );
    for (const cmd of allCommands) {
      // Must NOT be bare `node ...` — that would mean the helper was
      // bypassed (the bug claude-code/index.ts comment Algo-D3 prevents).
      expect(cmd).not.toMatch(/^node\s/);
      // Wire shape (always double-quoted pair).
      expect(cmd).toMatch(/^"[^"]+"\s+"[^"]+"$/);
    }
  });

  test("qwen-code generateHookConfig emits the resolved hook runtime path", async () => {
    const { resolveHookRuntime, resetHookRuntimeCache } = await import("../../src/runtime.js");
    resetHookRuntimeCache();
    const runtime = resolveHookRuntime();
    const { QwenCodeAdapter } = await import("../../src/adapters/qwen-code/index.js");
    const adapter = new QwenCodeAdapter();
    const config = adapter.generateHookConfig("/plugin/root") as Record<string, Array<{ hooks: Array<{ command: string }> }>>;
    const preCmd = config.PreToolUse[0].hooks[0].command;
    const expectedRuntime = runtime.path.replace(/\\/g, "/");
    expect(preCmd).toBe(`"${expectedRuntime}" "/plugin/root/hooks/pretooluse.mjs"`);
  });

  test("gemini-cli generateHookConfig emits the resolved hook runtime path when pluginRoot provided", async () => {
    const { resolveHookRuntime, resetHookRuntimeCache } = await import("../../src/runtime.js");
    resetHookRuntimeCache();
    const runtime = resolveHookRuntime();
    const { GeminiCLIAdapter } = await import("../../src/adapters/gemini-cli/index.js");
    const adapter = new GeminiCLIAdapter();
    const config = adapter.generateHookConfig("/plugin/root") as Record<string, Array<{ hooks: Array<{ command: string }> }>>;
    const allCommands = Object.values(config).flatMap((entries) =>
      entries.flatMap((e) => e.hooks.map((h) => h.command))
    );
    const expectedRuntime = runtime.path.replace(/\\/g, "/");
    const someCmd = allCommands.find((c) => c.includes("/plugin/root/hooks/"));
    expect(someCmd).toBeDefined();
    expect(someCmd!.startsWith(`"${expectedRuntime}" "`)).toBe(true);
  });

  test("kiro generateHookConfig emits the resolved hook runtime path", async () => {
    const { resolveHookRuntime, resetHookRuntimeCache } = await import("../../src/runtime.js");
    resetHookRuntimeCache();
    const runtime = resolveHookRuntime();
    const { KiroAdapter } = await import("../../src/adapters/kiro/index.js");
    const adapter = new KiroAdapter();
    const config = adapter.generateHookConfig("/plugin/root") as Record<string, Array<{ hooks: Array<{ command: string }> }>>;
    const allCommands = Object.values(config).flatMap((entries) =>
      entries.flatMap((e) => e.hooks.map((h) => h.command))
    );
    const expectedRuntime = runtime.path.replace(/\\/g, "/");
    expect(allCommands[0].startsWith(`"${expectedRuntime}" "`)).toBe(true);
  });
});

describe("CLI-dispatcher adapters keep their dispatcher form (#738 non-regression)", () => {
  test("cursor still emits 'context-mode hook cursor <event>' shape", async () => {
    const { CursorAdapter } = await import("../../src/adapters/cursor/index.js");
    const adapter = new CursorAdapter();
    const config = adapter.generateHookConfig("/plugin/root") as Record<string, Array<{ command: string }>>;
    // Cursor uses flat shape (one entry per hook).
    const cmds = Object.values(config).flatMap((arr) => arr.map((e) => e.command));
    for (const cmd of cmds) {
      expect(cmd).toMatch(/^context-mode hook cursor /);
    }
  });

  test("codex still emits 'context-mode hook codex <event>' shape", async () => {
    const { CodexAdapter } = await import("../../src/adapters/codex/index.js");
    const adapter = new CodexAdapter();
    const config = adapter.generateHookConfig("/plugin/root") as Record<string, Array<{ hooks: Array<{ command: string }> }>>;
    const cmds = Object.values(config).flatMap((arr) =>
      arr.flatMap((e) => e.hooks.map((h) => h.command))
    );
    for (const cmd of cmds) {
      expect(cmd).toMatch(/^context-mode hook codex /);
    }
  });

  test("vscode-copilot still emits 'context-mode hook vscode-copilot <event>' shape", async () => {
    const { VSCodeCopilotAdapter } = await import("../../src/adapters/vscode-copilot/index.js");
    const adapter = new VSCodeCopilotAdapter();
    const config = adapter.generateHookConfig("/plugin/root") as Record<string, Array<{ hooks: Array<{ command: string }> }>>;
    const cmds = Object.values(config).flatMap((arr) =>
      arr.flatMap((e) => e.hooks.map((h) => h.command))
    );
    for (const cmd of cmds) {
      expect(cmd).toMatch(/^context-mode hook vscode-copilot /);
    }
  });

  test("jetbrains-copilot still emits 'context-mode hook jetbrains-copilot <event>' shape", async () => {
    const { JetBrainsCopilotAdapter } = await import("../../src/adapters/jetbrains-copilot/index.js");
    const adapter = new JetBrainsCopilotAdapter();
    const config = adapter.generateHookConfig("/plugin/root") as Record<string, Array<{ hooks: Array<{ command: string }> }>>;
    const cmds = Object.values(config).flatMap((arr) =>
      arr.flatMap((e) => e.hooks.map((h) => h.command))
    );
    for (const cmd of cmds) {
      expect(cmd).toMatch(/^context-mode hook jetbrains-copilot /);
    }
  });

  test("copilot-cli emits 'context-mode hook copilot-cli <event>' shape", async () => {
    const { CopilotCliAdapter } = await import("../../src/adapters/copilot-cli/index.js");
    const adapter = new CopilotCliAdapter();
    const config = adapter.generateHookConfig("/plugin/root") as Record<string, Array<{ hooks: Array<{ command: string }> }>>;
    const cmds = Object.values(config).flatMap((arr) =>
      arr.flatMap((e) => e.hooks.map((h) => h.command))
    );
    for (const cmd of cmds) {
      expect(cmd).toMatch(/^context-mode hook copilot-cli /);
    }
  });
});
