/**
 * Tests for the OpenCode TypeScript plugin entry point.
 *
 * Tests the ContextModePlugin factory and its three hooks:
 *   - tool.execute.before (routing enforcement)
 *   - tool.execute.after (session event capture)
 *   - experimental.session.compacting (snapshot generation)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// ── Test helpers ──────────────────────────────────────────

/**
 * Create a plugin instance with DB in a temp directory.
 * Uses dynamic import to resolve routing module from project root.
 */
async function createTestPlugin(tempDir: string) {
  // Import the plugin module
  const { ContextModePlugin } = await import("../src/opencode-plugin.js");

  // Monkey-patch the session dir to use temp directory
  // The plugin uses homedir() internally, but we can control the DB path
  // by creating the plugin with a unique directory that produces a unique hash
  return ContextModePlugin({ directory: tempDir });
}

// ── Tests ─────────────────────────────────────────────────

describe("ContextModePlugin", () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), "opencode-plugin-test-"));
  });

  afterAll(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch { /* cleanup best effort */ }
  });

  // ── Factory ───────────────────────────────────────────

  describe("factory", () => {
    it("returns object with 3 hook handlers", async () => {
      const plugin = await createTestPlugin(join(tempDir, "factory-test"));

      expect(plugin).toHaveProperty("tool.execute.before");
      expect(plugin).toHaveProperty("tool.execute.after");
      expect(plugin).toHaveProperty("experimental.session.compacting");

      expect(typeof plugin["tool.execute.before"]).toBe("function");
      expect(typeof plugin["tool.execute.after"]).toBe("function");
      expect(typeof plugin["experimental.session.compacting"]).toBe("function");
    });

    it("writes AGENTS.md routing instructions on startup", async () => {
      const projectDir = join(tempDir, "factory-startup-routing");
      mkdirSync(projectDir, { recursive: true });
      await createTestPlugin(projectDir);

      const agentsPath = join(projectDir, "AGENTS.md");
      expect(existsSync(agentsPath)).toBe(true);
      expect(readFileSync(agentsPath, "utf-8")).toContain("context-mode");
    });
  });

  // ── tool.execute.before ───────────────────────────────

  describe("tool.execute.before", () => {
    it("modifies curl commands to block them", async () => {
      const plugin = await createTestPlugin(join(tempDir, "before-curl"));
      const input = {
        tool_name: "Bash",
        tool_input: { command: "curl https://example.com/data" },
      };

      await plugin["tool.execute.before"](input);

      // Routing replaces the curl command with an informative echo
      expect(input.tool_input.command).toMatch(/^echo /);
      expect(input.tool_input.command).toContain("context-mode");
    });

    it("modifies wget commands to block them", async () => {
      const plugin = await createTestPlugin(join(tempDir, "before-wget"));
      const input = {
        tool_name: "Bash",
        tool_input: { command: "wget https://example.com/file" },
      };

      await plugin["tool.execute.before"](input);

      expect(input.tool_input.command).toMatch(/^echo /);
      expect(input.tool_input.command).toContain("context-mode");
    });

    it("passes through normal tool calls", async () => {
      const plugin = await createTestPlugin(join(tempDir, "before-pass"));

      // TaskCreate is not routed — should passthrough
      const result = await plugin["tool.execute.before"]({
        tool_name: "TaskCreate",
        tool_input: { subject: "test task" },
      });

      expect(result).toBeUndefined();
    });

    it("handles empty input gracefully", async () => {
      const plugin = await createTestPlugin(join(tempDir, "before-empty"));

      const result = await plugin["tool.execute.before"]({});
      expect(result).toBeUndefined();
    });
  });

  // ── tool.execute.after ────────────────────────────────

  describe("tool.execute.after", () => {
    it("captures file read events without throwing", async () => {
      const plugin = await createTestPlugin(join(tempDir, "after-read"));

      // Should not throw
      await expect(
        plugin["tool.execute.after"]({
          tool_name: "Read",
          tool_input: { file_path: "/test/file.ts" },
          tool_output: "file contents here",
        }),
      ).resolves.toBeUndefined();
    });

    it("captures file write events", async () => {
      const plugin = await createTestPlugin(join(tempDir, "after-write"));

      await expect(
        plugin["tool.execute.after"]({
          tool_name: "Write",
          tool_input: { file_path: "/test/new-file.ts", content: "code" },
        }),
      ).resolves.toBeUndefined();
    });

    it("captures git events from Bash", async () => {
      const plugin = await createTestPlugin(join(tempDir, "after-git"));

      await expect(
        plugin["tool.execute.after"]({
          tool_name: "Bash",
          tool_input: { command: "git commit -m 'test'" },
          tool_output: "[main abc1234] test",
        }),
      ).resolves.toBeUndefined();
    });

    it("handles empty input gracefully", async () => {
      const plugin = await createTestPlugin(join(tempDir, "after-empty"));

      await expect(
        plugin["tool.execute.after"]({}),
      ).resolves.toBeUndefined();
    });
  });

  // ── experimental.session.compacting ───────────────────

  describe("experimental.session.compacting", () => {
    it("returns empty string when no events captured", async () => {
      const plugin = await createTestPlugin(join(tempDir, "compact-empty"));

      const snapshot = await plugin["experimental.session.compacting"]();
      expect(snapshot).toBe("");
    });

    it("returns snapshot XML after events are captured", async () => {
      const plugin = await createTestPlugin(join(tempDir, "compact-snap"));

      // Capture several events first
      await plugin["tool.execute.after"]({
        tool_name: "Read",
        tool_input: { file_path: "/src/index.ts" },
        tool_output: "export default {}",
      });
      await plugin["tool.execute.after"]({
        tool_name: "Edit",
        tool_input: { file_path: "/src/index.ts", old_string: "{}", new_string: "{ foo: 1 }" },
      });
      await plugin["tool.execute.after"]({
        tool_name: "Bash",
        tool_input: { command: "git status" },
        tool_output: "On branch main",
      });

      const snapshot = await plugin["experimental.session.compacting"]();

      expect(snapshot.length).toBeGreaterThan(0);
      expect(snapshot).toContain("session_resume");
      expect(snapshot).toContain("/src/index.ts");
    });

    it("can be called multiple times (increments compact count)", async () => {
      const plugin = await createTestPlugin(join(tempDir, "compact-multi"));

      await plugin["tool.execute.after"]({
        tool_name: "Read",
        tool_input: { file_path: "/test/a.ts" },
        tool_output: "code",
      });

      const snap1 = await plugin["experimental.session.compacting"]();
      expect(snap1.length).toBeGreaterThan(0);

      // Capture more events
      await plugin["tool.execute.after"]({
        tool_name: "Write",
        tool_input: { file_path: "/test/b.ts", content: "new file" },
      });

      const snap2 = await plugin["experimental.session.compacting"]();
      expect(snap2.length).toBeGreaterThan(0);
    });
  });

  // ── Integration: before + after + compact ─────────────

  describe("end-to-end flow", () => {
    it("captures events from allowed tools and generates snapshot", async () => {
      const plugin = await createTestPlugin(join(tempDir, "e2e-flow"));

      // Normal tool call passes through before hook
      await plugin["tool.execute.before"]({
        tool_name: "Read",
        tool_input: { file_path: "/app/main.ts" },
      });

      // After hook captures the event
      await plugin["tool.execute.after"]({
        tool_name: "Read",
        tool_input: { file_path: "/app/main.ts" },
        tool_output: "console.log('hello')",
      });

      // Compacting generates snapshot
      const snapshot = await plugin["experimental.session.compacting"]();
      expect(snapshot).toContain("session_resume");
      expect(snapshot).toContain("/app/main.ts");
    });

    it("blocked tool command is replaced before execution", async () => {
      const plugin = await createTestPlugin(join(tempDir, "e2e-block"));
      const input = {
        tool_name: "Bash",
        tool_input: { command: "curl https://evil.com" },
      };

      // Before hook replaces the command
      await plugin["tool.execute.before"](input);
      expect(input.tool_input.command).toContain("context-mode");

      // After hook still runs (with the replaced command)
      await plugin["tool.execute.after"]({
        tool_name: "Bash",
        tool_input: input.tool_input,
        tool_output: input.tool_input.command,
      });

      // Snapshot should be empty (echo commands don't generate events)
      const snapshot = await plugin["experimental.session.compacting"]();
      expect(snapshot).toBe("");
    });
  });
});
