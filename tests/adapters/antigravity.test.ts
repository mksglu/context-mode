import "../setup-home";
import { describe, it, expect, beforeEach } from "vitest";
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { AntigravityAdapter } from "../../src/adapters/antigravity/index.js";
import {
  AntigravityCliAdapter,
  antigravityCliHooksPath,
  antigravityCliPluginDir,
} from "../../src/adapters/antigravity-cli/index.js";
import { hashProjectDirCanonical, resolveSessionDbPath } from "../../src/session/db.js";

describe("AntigravityAdapter", () => {
  let adapter: AntigravityAdapter;

  beforeEach(() => {
    adapter = new AntigravityAdapter();
  });

  // ── Identity ───────────────────────────────────────────

  describe("identity", () => {
    it("name is Antigravity", () => {
      expect(adapter.name).toBe("Antigravity");
    });

    it("paradigm is mcp-only", () => {
      expect(adapter.paradigm).toBe("mcp-only");
    });
  });

  // ── Capabilities ──────────────────────────────────────

  describe("capabilities", () => {
    it("all capabilities are false", () => {
      expect(adapter.capabilities.preToolUse).toBe(false);
      expect(adapter.capabilities.postToolUse).toBe(false);
      expect(adapter.capabilities.preCompact).toBe(false);
      expect(adapter.capabilities.sessionStart).toBe(false);
      expect(adapter.capabilities.canModifyArgs).toBe(false);
      expect(adapter.capabilities.canModifyOutput).toBe(false);
      expect(adapter.capabilities.canInjectSessionContext).toBe(false);
    });
  });

  // ── Parse methods (all throw) ─────────────────────────

  describe("parse methods", () => {
    it("parsePreToolUseInput throws", () => {
      expect(() => adapter.parsePreToolUseInput({})).toThrow(
        /Antigravity does not support hooks/,
      );
    });

    it("parsePostToolUseInput throws", () => {
      expect(() => adapter.parsePostToolUseInput({})).toThrow(
        /Antigravity does not support hooks/,
      );
    });

    it("parsePreCompactInput throws", () => {
      expect(() => adapter.parsePreCompactInput({})).toThrow(
        /Antigravity does not support hooks/,
      );
    });

    it("parseSessionStartInput throws", () => {
      expect(() => adapter.parseSessionStartInput({})).toThrow(
        /Antigravity does not support hooks/,
      );
    });
  });

  // ── Format methods (all return undefined) ─────────────

  describe("format methods", () => {
    it("formatPreToolUseResponse returns undefined", () => {
      const result = adapter.formatPreToolUseResponse({
        decision: "deny",
        reason: "test",
      });
      expect(result).toBeUndefined();
    });

    it("formatPostToolUseResponse returns undefined", () => {
      const result = adapter.formatPostToolUseResponse({
        additionalContext: "test",
      });
      expect(result).toBeUndefined();
    });

    it("formatPreCompactResponse returns undefined", () => {
      const result = adapter.formatPreCompactResponse({
        context: "test",
      });
      expect(result).toBeUndefined();
    });

    it("formatSessionStartResponse returns undefined", () => {
      const result = adapter.formatSessionStartResponse({
        context: "test",
      });
      expect(result).toBeUndefined();
    });
  });

  // ── Hook config (all empty) ───────────────────────────

  describe("hook config", () => {
    it("generateHookConfig returns empty object", () => {
      const config = adapter.generateHookConfig("/some/plugin/root");
      expect(config).toEqual({});
    });

    it("configureAllHooks returns empty array", () => {
      const changes = adapter.configureAllHooks("/some/plugin/root");
      expect(changes).toEqual([]);
    });

    it("setHookPermissions returns empty array", () => {
      const set = adapter.setHookPermissions("/some/plugin/root");
      expect(set).toEqual([]);
    });
  });

  // ── Config paths ──────────────────────────────────────

  describe("config paths", () => {
    it("settings path is ~/.gemini/antigravity/mcp_config.json", () => {
      expect(adapter.getSettingsPath()).toBe(
        resolve(homedir(), ".gemini", "antigravity", "mcp_config.json"),
      );
    });

    it("session dir is under ~/.gemini/context-mode/sessions/", () => {
      const sessionDir = adapter.getSessionDir();
      expect(sessionDir).toBe(
        join(homedir(), ".gemini", "context-mode", "sessions"),
      );
    });

    it("session DB path contains project hash", () => {
      const dbPath = resolveSessionDbPath({ projectDir: "/test/project", sessionsDir: adapter.getSessionDir() });
      expect(dbPath).toMatch(/[a-f0-9]{16}\.db$/);
      expect(dbPath).toContain(".gemini");
    });

    it("session events path contains project hash with -events.md suffix", () => {
      const eventsPath = join(adapter.getSessionDir(), `${hashProjectDirCanonical("/test/project")}-events.md`);
      expect(eventsPath).toMatch(/[a-f0-9]{16}-events\.md$/);
      expect(eventsPath).toContain(".gemini");
    });
  });

});

describe("AntigravityCliAdapter", () => {
  let adapter: AntigravityCliAdapter;

  beforeEach(() => {
    adapter = new AntigravityCliAdapter();
  });

  it("name is Antigravity CLI and paradigm is json-stdio", () => {
    expect(adapter.name).toBe("Antigravity CLI");
    expect(adapter.paradigm).toBe("json-stdio");
  });

  it("declares bounded PreToolUse/PostToolUse hook capabilities", () => {
    expect(adapter.capabilities.preToolUse).toBe(true);
    expect(adapter.capabilities.postToolUse).toBe(true);
    expect(adapter.capabilities.preCompact).toBe(false);
    expect(adapter.capabilities.sessionStart).toBe(false);
    expect(adapter.capabilities.canModifyArgs).toBe(false);
    expect(adapter.capabilities.canModifyOutput).toBe(false);
    expect(adapter.capabilities.canInjectSessionContext).toBe(false);
  });

  it("parses agy hook payloads into normalized events", () => {
    const payload = {
      conversationId: "conv-1",
      workspacePaths: ["C:/repo"],
      toolCall: { name: "run_command", args: { CommandLine: "git status" } },
      error: "failed",
    };

    expect(adapter.parsePreToolUseInput(payload)).toMatchObject({
      toolName: "run_command",
      toolInput: { CommandLine: "git status" },
      sessionId: "conv-1",
      projectDir: "C:/repo",
    });
    expect(adapter.parsePostToolUseInput(payload)).toMatchObject({
      toolName: "run_command",
      toolInput: { CommandLine: "git status" },
      toolOutput: "failed",
      isError: true,
      sessionId: "conv-1",
      projectDir: "C:/repo",
    });
  });

  it("formats agy PreToolUse responses with the native top-level decision contract", () => {
    expect(adapter.formatPreToolUseResponse({ decision: "deny", reason: "blocked" })).toEqual({
      decision: "deny",
      reason: "blocked",
    });
    expect(adapter.formatPreToolUseResponse({ decision: "ask", reason: "confirm" })).toEqual({
      decision: "ask",
      reason: "confirm",
    });
    expect(adapter.formatPreToolUseResponse({ decision: "context", additionalContext: "note" })).toEqual({
      decision: "deny",
      reason: "context-mode: use the context-mode MCP tools instead of this native tool. note",
    });
  });

  it("settings path is ~/.gemini/config/mcp_config.json", () => {
    expect(adapter.getSettingsPath()).toBe(
      resolve(homedir(), ".gemini", "config", "mcp_config.json"),
    );
  });

  it("config dir is ~/.gemini/antigravity-cli", () => {
    expect(adapter.getConfigDir()).toBe(
      resolve(homedir(), ".gemini", "antigravity-cli"),
    );
  });

  it("checkPluginRegistration fails with the agy plugin install remediation when nothing is registered", () => {
    rmSync(adapter.getSettingsPath(), { force: true });
    rmSync(join(antigravityCliPluginDir(), "mcp_config.json"), { force: true });

    expect(adapter.checkPluginRegistration()).toMatchObject({
      check: "MCP registration",
      status: "fail",
      fix: "agy plugin install https://github.com/mksglu/context-mode/tree/main/configs/antigravity-cli",
    });
  });

  it("checkPluginRegistration PASSES when MCP is in the plugin profile (agy plugin install)", () => {
    // B: `agy plugin install` writes MCP to ~/.gemini/config/plugins/context-mode/
    // mcp_config.json — not the global profile. doctor must recognize it.
    rmSync(adapter.getSettingsPath(), { force: true });
    const pluginMcp = join(antigravityCliPluginDir(), "mcp_config.json");
    mkdirSync(antigravityCliPluginDir(), { recursive: true });
    writeFileSync(
      pluginMcp,
      JSON.stringify({ mcpServers: { "context-mode": { command: "context-mode" } } }),
    );

    const result = adapter.checkPluginRegistration();
    expect(result.status).toBe("pass");
    expect(result.message).toContain("mcp_config.json");
    rmSync(pluginMcp, { force: true });
  });

  it("hooks path is ~/.gemini/config/hooks.json", () => {
    expect(antigravityCliHooksPath()).toBe(resolve(homedir(), ".gemini", "config", "hooks.json"));
  });

  it("configureAllHooks writes PreToolUse/PostToolUse/Stop hooks, idempotently", () => {
    rmSync(antigravityCliHooksPath(), { force: true });

    const changes = adapter.configureAllHooks("/plugin/root");
    expect(changes.length).toBeGreaterThan(0);

    const cfg = JSON.parse(readFileSync(antigravityCliHooksPath(), "utf-8")) as {
      hooks: Record<string, Array<Record<string, unknown>>>;
    };
    expect(cfg.hooks.PreToolUse[0].matcher).toBe("run_command|view_file|grep_search|web_fetch|read_url_content");
    expect(cfg.hooks.PreToolUse[0].hooks[0].command).toBe(
      "context-mode hook antigravity-cli pretooluse",
    );
    expect(cfg.hooks.PostToolUse[0].hooks[0].command).toBe(
      "context-mode hook antigravity-cli posttooluse",
    );
    // agy requires Stop as a flat list of handler objects (no matcher/hooks
    // wrapper); the grouped form makes agy reject the whole hooks.json (#1206).
    expect(cfg.hooks.Stop[0]).toEqual({
      type: "command",
      command: "context-mode hook antigravity-cli stop",
    });

    // Second run sees no drift.
    expect(adapter.configureAllHooks("/plugin/root")).toEqual([]);
  });

  it("configureAllHooks preserves unrelated hooks already in the file", () => {
    rmSync(antigravityCliHooksPath(), { force: true });
    adapter.configureAllHooks("/plugin/root");
    // Hand-add an unrelated hook, then reconfigure — it must survive.
    const path = antigravityCliHooksPath();
    const cfg = JSON.parse(readFileSync(path, "utf-8"));
    cfg.hooks.SessionStart = [{ matcher: "", hooks: [{ type: "command", command: "echo start" }] }];
    cfg.hooks.PreToolUse.push({ matcher: "other_tool", hooks: [{ type: "command", command: "echo pre" }] });
    writeFileSync(path, JSON.stringify(cfg));
    adapter.configureAllHooks("/plugin/root");
    const after = JSON.parse(readFileSync(path, "utf-8"));
    expect(after.hooks.SessionStart).toBeDefined();
    expect(JSON.stringify(after.hooks.PreToolUse)).toContain("echo pre");
    expect(JSON.stringify(after.hooks.PreToolUse)).toContain("antigravity-cli pretooluse");
    expect(after.hooks.PostToolUse[0].hooks[0].command).toContain("antigravity-cli posttooluse");
    expect(after.hooks.Stop[0].command).toContain("antigravity-cli stop");
  });

  it("configureAllHooks rewrites a legacy grouped Stop into the flat form agy accepts", () => {
    // #1206: agy 1.2.x rejects the whole hooks.json when Stop is grouped.
    rmSync(antigravityCliHooksPath(), { force: true });
    const path = antigravityCliHooksPath();
    writeFileSync(
      path,
      JSON.stringify({
        hooks: {
          Stop: [
            {
              matcher: "",
              hooks: [{ type: "command", command: "context-mode hook antigravity-cli stop" }],
            },
          ],
        },
      }),
    );

    adapter.configureAllHooks("/plugin/root");

    const after = JSON.parse(readFileSync(path, "utf-8"));
    expect(after.hooks.Stop).toHaveLength(1);
    expect(after.hooks.Stop[0]).toEqual({
      type: "command",
      command: "context-mode hook antigravity-cli stop",
    });
  });

  it("validateHooks warns until all agy hooks are configured, then passes", () => {
    rmSync(antigravityCliHooksPath(), { force: true });
    rmSync(join(antigravityCliPluginDir(), "hooks.json"), { force: true });
    const before = adapter.validateHooks("/plugin/root");
    expect(before[0].status).toBe("warn");

    adapter.configureAllHooks("/plugin/root");
    const after = adapter.validateHooks("/plugin/root");
    expect(after[0].status).toBe("pass");
    expect(after[0].message).toContain("PreToolUse guard");
  });

  it("validateHooks PASSES when PreToolUse/PostToolUse are in the plugin profile (Stop is best-effort)", () => {
    // B: `agy plugin install` writes the hook to ~/.gemini/config/plugins/
    // context-mode/hooks.json — not the global hooks.json. doctor must recognize it.
    rmSync(antigravityCliHooksPath(), { force: true });
    const pluginHooks = join(antigravityCliPluginDir(), "hooks.json");
    mkdirSync(antigravityCliPluginDir(), { recursive: true });
    writeFileSync(
      pluginHooks,
      JSON.stringify({
        hooks: {
          PreToolUse: [
            { matcher: "run_command|view_file|grep_search|web_fetch|read_url_content", hooks: [{ type: "command", command: "context-mode hook antigravity-cli pretooluse" }] },
          ],
          PostToolUse: [
            { matcher: "", hooks: [{ type: "command", command: "context-mode hook antigravity-cli posttooluse" }] },
          ],
          Stop: [
            { type: "command", command: "context-mode hook antigravity-cli stop" },
          ],
        },
      }),
    );

    const result = adapter.validateHooks("/plugin/root")[0];
    expect(result.status).toBe("pass");
    expect(result.message).toContain("best-effort Stop hook also configured");
    rmSync(pluginHooks, { force: true });
  });
});

/**
 * Guards the shipped agy plugin bundle (configs/antigravity-cli/), which users
 * install in one command — `agy plugin install <github-subpath>` — with agy
 * cloning the repo and resolving the configs/antigravity-cli subpath itself
 * (no local clone needed).
 *
 * agy's native plugin system reads the root `plugin.json` + `mcp_config.json`
 * shape. Verified on agy 1.0.6, re-verified on 1.0.10: `agy plugin install` logs "mcpServers : 1
 * processed" and registers the server — env preserved — into
 * ~/.gemini/config/plugins/<name>/mcp_config.json. `.mcp.json` and
 * `.claude-plugin/plugin.json` are intentionally not shipped here because agy
 * native validate/install does not read them.
 *
 * The MCP config is committed in the plugin bundle rather than generated during
 * install.
 */
const AGY_PLUGIN = resolve(__dirname, "..", "..", "configs", "antigravity-cli");

describe("configs/antigravity-cli — agy plugin bundle", () => {
  it("ships native agy plugin.json + mcp_config.json pinned to antigravity-cli", () => {
    const manifest = JSON.parse(readFileSync(resolve(AGY_PLUGIN, "plugin.json"), "utf-8"));
    expect(manifest.name).toBe("context-mode");
    expect(manifest.skills).toContain("./skills/context-mode");
    const mcpPath = resolve(AGY_PLUGIN, "mcp_config.json");
    expect(existsSync(mcpPath)).toBe(true);
    const mcp = JSON.parse(readFileSync(mcpPath, "utf-8"));
    const server = mcp.mcpServers?.["context-mode"];
    expect(server?.command).toBe("context-mode");
    // The env pin makes the server self-identify as agy, so detection / ctx_upgrade
    // resolve antigravity-cli even when ~/.claude (a gemini-cli→agy migration leaves
    // both dirs) would otherwise win — the core of #774, fixed at the MCP level.
    expect(server?.env?.CONTEXT_MODE_PLATFORM).toBe("antigravity-cli");
  });

  it("root hooks.json wires only mapped agy hook dispatchers", () => {
    const hooks = JSON.parse(readFileSync(resolve(AGY_PLUGIN, "hooks.json"), "utf-8"));
    // agy 1.0.6 runtime loads installed plugin root hooks.json, while
    // validate/install only reports hooks when the bundle also has hooks/hooks.json.
    // Keep both files identical until agy converges on one path.
    expect(JSON.parse(readFileSync(resolve(AGY_PLUGIN, "hooks", "hooks.json"), "utf-8"))).toEqual(hooks);
    const pre = hooks.hooks?.PreToolUse?.[0];
    const post = hooks.hooks?.PostToolUse?.[0]?.hooks?.[0];
    const stop = hooks.hooks?.Stop?.[0];
    expect(pre?.matcher).toBe("run_command|view_file|grep_search|web_fetch|read_url_content");
    expect(pre?.hooks?.[0]?.command).toBe("context-mode hook antigravity-cli pretooluse");
    expect(post?.type).toBe("command");
    expect(post?.command).toBe("context-mode hook antigravity-cli posttooluse");
    // Stop must stay flat: agy 1.2.x rejects the whole hooks.json when Stop
    // carries the matcher/hooks wrapper (#1206).
    expect(stop).toEqual({ type: "command", command: "context-mode hook antigravity-cli stop" });
    // Do not over-map invocation hooks until agy payload/response semantics are verified.
    expect(hooks.hooks?.PreInvocation).toBeUndefined();
    expect(hooks.hooks?.PostInvocation).toBeUndefined();
  });

  it("ships agy-native routing rules", () => {
    const rulePath = resolve(AGY_PLUGIN, "rules", "context-mode.md");
    expect(existsSync(rulePath)).toBe(true);
    const rule = readFileSync(rulePath, "utf-8");
    expect(rule).toContain("context-mode/ctx_execute");
    expect(rule).toContain("call_mcp_tool");
    expect(rule).toContain("Do not read `~/.gemini/antigravity-cli/mcp/context-mode/*.json`");
    expect(rule).toContain("there is no separate `ctx_read` tool");
    expect(rule).toContain("`context-mode/ctx_execute_file` is the context-mode file-read surface");
    expect(rule).toContain("Never print");
    expect(rule).toContain("`FILE_CONTENT` wholesale");
    expect(rule).toContain("Use `context-mode/ctx_index` only when content should be stored and searched");
  });

  it("ships an agy-native routing skill with the fixed tool list", () => {
    const skillPath = resolve(AGY_PLUGIN, "skills", "context-mode", "SKILL.md");
    expect(existsSync(skillPath)).toBe(true);
    const skill = readFileSync(skillPath, "utf-8");
    expect(skill).toContain("name: context-mode");
    expect(skill).toContain("context-mode/ctx_execute_file");
    expect(skill).toContain("There is no separate `ctx_read` tool");
    expect(skill).toContain("When the user asks \"what context-mode tools are available\"");
    expect(skill).toContain("Do not list `~/.gemini/antigravity-cli/mcp/context-mode`");
    expect(skill).toContain("Never print `FILE_CONTENT` wholesale");
    for (const tool of [
      "ctx_execute",
      "ctx_execute_file",
      "ctx_batch_execute",
      "ctx_index",
      "ctx_search",
      "ctx_fetch_and_index",
      "ctx_stats",
      "ctx_doctor",
      "ctx_upgrade",
      "ctx_purge",
      "ctx_insight",
    ]) {
      expect(skill).toContain(`context-mode/${tool}`);
    }
  });

  it("the dispatched hook script exists", () => {
    expect(existsSync(resolve(__dirname, "..", "..", "hooks", "antigravity-cli", "pretooluse.mjs"))).toBe(true);
    expect(existsSync(resolve(__dirname, "..", "..", "hooks", "antigravity-cli", "posttooluse.mjs"))).toBe(true);
    expect(existsSync(resolve(__dirname, "..", "..", "hooks", "antigravity-cli", "stop.mjs"))).toBe(true);
    expect(existsSync(resolve(__dirname, "..", "..", "hooks", "antigravity-cli", "payload.mjs"))).toBe(true);
  });
});
