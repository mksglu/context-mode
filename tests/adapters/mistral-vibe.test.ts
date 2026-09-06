import "../setup-home";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { MistralVibeAdapter, probeVibeCliVersion } from "../../src/adapters/mistral-vibe/index.js";
import { resolveVibeConfigDir } from "../../src/adapters/mistral-vibe/paths.js";

describe("MistralVibeAdapter", () => {
  let adapter: MistralVibeAdapter;

  beforeEach(() => {
    adapter = new MistralVibeAdapter();
  });

  // ── Capabilities ──────────────────────────────────────

  describe("capabilities", () => {
    it("preToolUse is true (Vibe has pre_tool)", () => {
      expect(adapter.capabilities.preToolUse).toBe(true);
    });

    it("postToolUse is true (Vibe has post_tool)", () => {
      expect(adapter.capabilities.postToolUse).toBe(true);
    });

    it("preCompact is false (Vibe has no PreCompact equivalent)", () => {
      expect(adapter.capabilities.preCompact).toBe(false);
    });

    it("sessionStart is false (Vibe has no SessionStart hook)", () => {
      expect(adapter.capabilities.sessionStart).toBe(false);
    });

    it("canModifyArgs is true (pre_tool supports hook_specific_output.tool_input)", () => {
      expect(adapter.capabilities.canModifyArgs).toBe(true);
    });

    it("canModifyOutput is false (post_tool only supports additional_context append)", () => {
      expect(adapter.capabilities.canModifyOutput).toBe(false);
    });

    it("canInjectSessionContext is false (no SessionStart hook)", () => {
      expect(adapter.capabilities.canInjectSessionContext).toBe(false);
    });

    it("paradigm is json-stdio", () => {
      expect(adapter.paradigm).toBe("json-stdio");
    });

    it("name is 'Mistral Vibe'", () => {
      expect(adapter.name).toBe("Mistral Vibe");
    });
  });

  // ── parsePreToolUseInput ──────────────────────────────

  describe("parsePreToolUseInput", () => {
    it("extracts tool_name from payload", () => {
      const event = adapter.parsePreToolUseInput({
        tool_name: "bash",
        tool_input: { command: "ls" },
        session_id: "vibe-s1",
        cwd: "/tmp/proj",
        hook_event_name: "pre_tool",
      });
      expect(event.toolName).toBe("bash");
    });

    it("extracts session_id from payload", () => {
      const event = adapter.parsePreToolUseInput({
        tool_name: "bash",
        tool_input: { command: "ls" },
        session_id: "vibe-abc-123",
        cwd: "/tmp",
        hook_event_name: "pre_tool",
      });
      expect(event.sessionId).toBe("vibe-abc-123");
    });

    it("extracts projectDir from cwd", () => {
      const event = adapter.parsePreToolUseInput({
        tool_name: "bash",
        tool_input: { command: "ls" },
        session_id: "s1",
        cwd: "/Users/me/project",
        hook_event_name: "pre_tool",
      });
      expect(event.projectDir).toBe("/Users/me/project");
    });

    it("preserves tool_input passthrough", () => {
      const event = adapter.parsePreToolUseInput({
        tool_name: "bash",
        tool_input: { command: "curl example.com", extra: 42 },
        session_id: "s1",
        cwd: "/tmp",
        hook_event_name: "pre_tool",
      });
      expect(event.toolInput).toEqual({ command: "curl example.com", extra: 42 });
    });

    it("falls back to ppid-derived session id when payload lacks one", () => {
      const event = adapter.parsePreToolUseInput({
        tool_name: "bash",
        tool_input: {},
        cwd: "/tmp",
        hook_event_name: "pre_tool",
      });
      expect(event.sessionId).toMatch(/^vibe-ppid-\d+$/);
    });
  });

  // ── parsePostToolUseInput ─────────────────────────────

  describe("parsePostToolUseInput", () => {
    it("captures tool_output_text as toolOutput", () => {
      const event = adapter.parsePostToolUseInput({
        tool_name: "bash",
        tool_input: { command: "ls" },
        tool_output_text: "file1\nfile2\n",
        tool_status: "success",
        session_id: "s1",
        cwd: "/tmp",
      });
      expect(event.toolOutput).toBe("file1\nfile2\n");
    });

    it("marks isError=true on tool_status='failure'", () => {
      const event = adapter.parsePostToolUseInput({
        tool_name: "bash",
        tool_input: { command: "false" },
        tool_output_text: "",
        tool_status: "failure",
        tool_error: "exit 1",
        session_id: "s1",
        cwd: "/tmp",
      });
      expect(event.isError).toBe(true);
    });

    it("marks isError=false on tool_status='success'", () => {
      const event = adapter.parsePostToolUseInput({
        tool_name: "bash",
        tool_input: { command: "true" },
        tool_output_text: "",
        tool_status: "success",
        session_id: "s1",
        cwd: "/tmp",
      });
      expect(event.isError).toBe(false);
    });
  });

  // ── formatPreToolUseResponse ──────────────────────────

  describe("formatPreToolUseResponse", () => {
    it("emits {decision:'deny', reason} on deny", () => {
      const out = adapter.formatPreToolUseResponse({
        decision: "deny",
        reason: "Blocked by policy",
      });
      expect(out).toEqual({ decision: "deny", reason: "Blocked by policy" });
    });

    it("emits default reason when deny reason is missing", () => {
      const out = adapter.formatPreToolUseResponse({ decision: "deny" });
      expect(out).toMatchObject({ decision: "deny" });
      expect((out as { reason: string }).reason).toBeTruthy();
    });

    it("emits hook_specific_output.tool_input on modify", () => {
      const out = adapter.formatPreToolUseResponse({
        decision: "modify",
        updatedInput: { command: "safe-cmd" },
      });
      expect(out).toMatchObject({
        hook_specific_output: { tool_input: { command: "safe-cmd" } },
      });
    });

    it("attaches system_message with reason on modify", () => {
      const out = adapter.formatPreToolUseResponse({
        decision: "modify",
        updatedInput: { command: "x" },
        reason: "rerouted for safety",
      });
      expect(out).toMatchObject({
        system_message: "context-mode: rerouted for safety",
      });
    });

    it("returns {} for ask (Vibe has no ask surface)", () => {
      const out = adapter.formatPreToolUseResponse({ decision: "ask" });
      expect(out).toEqual({});
    });

    it("returns {} for allow passthrough", () => {
      const out = adapter.formatPreToolUseResponse({ decision: "allow" });
      expect(out).toEqual({});
    });
  });

  // ── formatPostToolUseResponse ─────────────────────────

  describe("formatPostToolUseResponse", () => {
    it("emits hook_specific_output.additional_context when provided", () => {
      const out = adapter.formatPostToolUseResponse({
        additionalContext: "extra guidance",
      });
      expect(out).toEqual({
        hook_specific_output: { additional_context: "extra guidance" },
      });
    });

    it("returns {} when no additionalContext supplied", () => {
      const out = adapter.formatPostToolUseResponse({});
      expect(out).toEqual({});
    });
  });

  // ── Configuration paths ───────────────────────────────

  describe("configuration paths", () => {
    it("getConfigDir defaults to ~/.vibe", () => {
      delete process.env.VIBE_HOME;
      expect(adapter.getConfigDir()).toBe(resolve(homedir(), ".vibe"));
    });

    it("getConfigDir honors $VIBE_HOME", () => {
      const oldVal = process.env.VIBE_HOME;
      process.env.VIBE_HOME = "/tmp/vibe-alt";
      try {
        expect(new MistralVibeAdapter().getConfigDir()).toBe(resolve("/tmp/vibe-alt"));
      } finally {
        if (oldVal === undefined) delete process.env.VIBE_HOME;
        else process.env.VIBE_HOME = oldVal;
      }
    });

    it("getSettingsPath returns config.toml under config dir", () => {
      delete process.env.VIBE_HOME;
      expect(adapter.getSettingsPath()).toBe(join(resolve(homedir(), ".vibe"), "config.toml"));
    });

    it("getHooksPath returns hooks.toml under config dir", () => {
      delete process.env.VIBE_HOME;
      expect(adapter.getHooksPath()).toBe(join(resolve(homedir(), ".vibe"), "hooks.toml"));
    });

    it("getInstructionFiles returns AGENTS.md + AGENTS.override.md", () => {
      expect(adapter.getInstructionFiles()).toEqual(["AGENTS.md", "AGENTS.override.md"]);
    });
  });

  // ── generateHookConfig ────────────────────────────────

  describe("generateHookConfig", () => {
    it("registers pre_tool and post_tool hooks", () => {
      const cfg = adapter.generateHookConfig("");
      expect(Object.keys(cfg).sort()).toEqual(["post_tool", "pre_tool"]);
    });

    it("pre_tool matcher targets bash", () => {
      const cfg = adapter.generateHookConfig("");
      expect(cfg.pre_tool[0].matcher).toBe("bash");
    });

    it("pre_tool command dispatches through context-mode CLI", () => {
      const cfg = adapter.generateHookConfig("");
      expect(cfg.pre_tool[0].hooks[0].command).toBe("context-mode hook mistral-vibe pretooluse");
    });

    it("post_tool command dispatches through context-mode CLI", () => {
      const cfg = adapter.generateHookConfig("");
      expect(cfg.post_tool[0].hooks[0].command).toBe("context-mode hook mistral-vibe posttooluse");
    });
  });

  // ── configureAllHooks (writes hooks.toml) ─────────────

  describe("configureAllHooks", () => {
    let tmpHome: string;

    beforeEach(() => {
      tmpHome = mkdtempSync(join(tmpdir(), "vibe-test-"));
      process.env.VIBE_HOME = tmpHome;
      adapter = new MistralVibeAdapter();
    });

    afterEach(() => {
      delete process.env.VIBE_HOME;
      rmSync(tmpHome, { recursive: true, force: true });
    });

    it("writes hooks.toml with pre_tool and post_tool blocks", () => {
      adapter.configureAllHooks("");
      const raw = readFileSync(adapter.getHooksPath(), "utf-8");
      expect(raw).toContain("[[hooks]]");
      expect(raw).toContain(`type = "pre_tool"`);
      expect(raw).toContain(`type = "post_tool"`);
      expect(raw).toContain("context-mode hook mistral-vibe pretooluse");
      expect(raw).toContain("context-mode hook mistral-vibe posttooluse");
    });

    it("preserves non-managed hooks (e.g. user rtk-rewrite)", () => {
      const existing = [
        `[[hooks]]`,
        `name = "rtk-rewrite"`,
        `type = "pre_tool"`,
        `match = "bash"`,
        `command = "/usr/local/bin/rtk hook vibe"`,
        `timeout = 10.0`,
      ].join("\n") + "\n";
      writeFileSync(adapter.getHooksPath(), existing, "utf-8");

      adapter.configureAllHooks("");
      const raw = readFileSync(adapter.getHooksPath(), "utf-8");
      expect(raw).toContain(`name = "rtk-rewrite"`);
      expect(raw).toContain("context-mode hook mistral-vibe pretooluse");
    });

    it("replaces stale context-mode hooks on re-run", () => {
      adapter.configureAllHooks("");
      adapter.configureAllHooks("");
      const raw = readFileSync(adapter.getHooksPath(), "utf-8");
      const preToolCount = (raw.match(/context-mode hook mistral-vibe pretooluse/g) ?? []).length;
      expect(preToolCount).toBe(1);
    });
  });

  // ── validateHooks ─────────────────────────────────────

  describe("validateHooks", () => {
    let tmpHome: string;

    beforeEach(() => {
      tmpHome = mkdtempSync(join(tmpdir(), "vibe-validate-"));
      process.env.VIBE_HOME = tmpHome;
      adapter = new MistralVibeAdapter();
    });

    afterEach(() => {
      delete process.env.VIBE_HOME;
      rmSync(tmpHome, { recursive: true, force: true });
    });

    it("fails when hooks.toml is missing", () => {
      const results = adapter.validateHooks("");
      const cfgCheck = results.find((r) => r.check === "Hooks config");
      expect(cfgCheck?.status).toBe("fail");
    });

    it("passes after configureAllHooks", () => {
      adapter.configureAllHooks("");
      const results = adapter.validateHooks("");
      const preToolCheck = results.find((r) => r.check === "pre_tool hook");
      const postToolCheck = results.find((r) => r.check === "post_tool hook");
      expect(preToolCheck?.status).toBe("pass");
      expect(postToolCheck?.status).toBe("pass");
    });

    it("reports Vibe CLI status", () => {
      const results = adapter.validateHooks("");
      const cliCheck = results.find((r) => r.check === "Mistral Vibe CLI binary");
      expect(cliCheck).toBeDefined();
      expect(["pass", "warn"]).toContain(cliCheck?.status);
    });
  });

  // ── checkPluginRegistration ───────────────────────────

  describe("checkPluginRegistration", () => {
    let tmpHome: string;

    beforeEach(() => {
      tmpHome = mkdtempSync(join(tmpdir(), "vibe-mcp-"));
      process.env.VIBE_HOME = tmpHome;
      adapter = new MistralVibeAdapter();
    });

    afterEach(() => {
      delete process.env.VIBE_HOME;
      rmSync(tmpHome, { recursive: true, force: true });
    });

    it("warns when config.toml is missing", () => {
      const res = adapter.checkPluginRegistration();
      expect(res.status).toBe("warn");
    });

    it("fails when no [[mcp_servers]] block exists", () => {
      writeFileSync(adapter.getSettingsPath(), `active_model = "opus-4"\n`, "utf-8");
      const res = adapter.checkPluginRegistration();
      expect(res.status).toBe("fail");
      expect(res.message).toMatch(/mcp_servers/);
    });

    it("fails when [[mcp_servers]] exists but context-mode is absent", () => {
      writeFileSync(
        adapter.getSettingsPath(),
        `[[mcp_servers]]\nname = "other"\ncommand = "other"\n`,
        "utf-8",
      );
      const res = adapter.checkPluginRegistration();
      expect(res.status).toBe("fail");
    });

    it("passes when context-mode is registered", () => {
      writeFileSync(
        adapter.getSettingsPath(),
        `[[mcp_servers]]\nname = "context-mode"\ntransport = "stdio"\ncommand = "context-mode"\n`,
        "utf-8",
      );
      const res = adapter.checkPluginRegistration();
      expect(res.status).toBe("pass");
    });
  });

  // ── probe helpers ─────────────────────────────────────

  describe("probeVibeCliVersion", () => {
    it("returns null when the CLI is not available", () => {
      const result = probeVibeCliVersion(() => {
        throw new Error("ENOENT");
      });
      expect(result).toBeNull();
    });

    it("returns the trimmed version string on success", () => {
      const result = probeVibeCliVersion(() => "vibe 2.24.0\n");
      expect(result).toBe("vibe 2.24.0");
    });
  });

  describe("resolveVibeConfigDir", () => {
    afterEach(() => {
      delete process.env.VIBE_HOME;
    });

    it("returns ~/.vibe by default", () => {
      delete process.env.VIBE_HOME;
      expect(resolveVibeConfigDir()).toBe(resolve(homedir(), ".vibe"));
    });

    it("honors VIBE_HOME absolute path", () => {
      process.env.VIBE_HOME = "/opt/vibe-custom";
      expect(resolveVibeConfigDir()).toBe(resolve("/opt/vibe-custom"));
    });

    it("expands ~ prefix in VIBE_HOME", () => {
      process.env.VIBE_HOME = "~/my-vibe";
      expect(resolveVibeConfigDir()).toBe(resolve(homedir(), "my-vibe"));
    });
  });
});
