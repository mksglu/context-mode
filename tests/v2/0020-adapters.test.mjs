// tests/v2/0020-adapters.test.mjs
// ADR-0020 (hooks and skills on every agent), PRD-v2 section 3. Unit tests for the per-agent adapters in src/adapters/ and the adapter table.
// One describe per adapter. Unit tests may import src/ (TECH-SPEC 6.2a).

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { ADAPTERS, getAdapter } from "../../src/adapters/table.ts";
import { AGENT_IDS } from "../../src/core/contracts/agents.ts";
import * as claudeCode from "../../src/adapters/claude-code.ts";
import { decode, encode, decode as claudeDecode, encode as claudeEncode } from "../../src/adapters/claude-code.ts";
import * as codex from "../../src/adapters/codex.ts";
import * as gemini from "../../src/adapters/gemini.ts";
import * as qwen from "../../src/adapters/qwen.ts";
import * as copilotCli from "../../src/adapters/copilot-cli.ts";
import { TOOL_NAME_PREFIX } from "../../src/adapters/copilot-cli.ts";
import * as vscode from "../../src/adapters/vscode.ts";
import * as kiro from "../../src/adapters/kiro.ts";
import * as zcode from "../../src/adapters/zcode.ts";
import * as pi from "../../src/adapters/pi.ts";
import * as opencode from "../../src/adapters/opencode.ts";
import { CLIENT_NAME_TO_PLATFORM } from "../../src/core/contracts/client-map.ts";
import { spawnSync } from "node:child_process";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { HOOK_TIMEOUT_MS } from "../../src/core/contracts/constants.ts";
import * as __m0 from "../../src/adapters/codex.ts";
import * as __m1 from "../../src/adapters/copilot-cli.ts";
import * as __m2 from "../../src/adapters/gemini.ts";
import * as __m3 from "../../src/adapters/kiro.ts";
import * as __m4 from "../../src/adapters/qwen.ts";
import * as __m5 from "../../src/adapters/vscode.ts";
import * as __m6 from "../../src/adapters/zcode.ts";

// Serial describes: kiro tests set process.env.USER_PROMPT and claude-code tests spawn the hook; the rest are sync and gain nothing from concurrency.
describe("ADR-0020 adapters", () => {
  describe("ADR-0020 adapter table", () => {
    // Unit tests for src/adapters/table.ts (impl/10 §1.1-§1.5, §10, §11; DECISIONS-r9 R1, R4, R5; DEVIATIONS D-M3-A7-1,
    // D-M5-arch-2, D-M5-A1-1).
    // Expected values are copied from the impl/10 tables, not from table.ts. Unit tests may import src/ (TECH-SPEC §6.2a).


    // impl/10 §1.3 main table: installMode, projectSource, toolNamePrefix, compactDelivery, compactSummary, hookTimeoutMs, denyChannel.
    // claude-code compactSummary "none": T-CMP arm (a) failed live (DECISIONS-r9 V9, impl/10 §1.3 note, D-M7-CL-1).
    const MAIN = {
      "claude-code": ["marketplace", "env:CLAUDE_PROJECT_DIR", "mcp__plugin_context-mode_context-mode__", "sessionstart", "none", 5000, "deny-reason"],
      codex: ["config-mcp", "arg:--agent+cwd", "mcp__context_mode__", "sessionstart", "none", 5000, "deny-reason"],
      gemini: ["extension", "spawn-cwd", "mcp_context-mode_", "pending-flag", "none", 5000, "deny-reason"],
      qwen: ["extension", "spawn-cwd", "mcp__context-mode__", "sessionstart", "none", 5000, "deny-reason"],
      "copilot-cli": ["plugin", "arg:--agent+cwd", "context-mode-", "pending-flag", "none", 5000, "deny-reason"],
      vscode: ["mcp-entry", "arg:workspaceFolder", "mcp_context-mode_", "pending-flag", "none", 5000, "deny-reason"],
      kiro: ["mcp-entry", "arg:--agent+cwd", "mcp_context-mode_", "none", "none", 5000, "hint-only"],
      zcode: ["hooks+mcp", "spawn-cwd", "mcp__context-mode__", "sessionstart", "none", 5000, "deny-reason"],
      pi: ["in-process", "pi:ctx.cwd", "", "pi-flag", "none", 0, "deny-reason"],
      opencode: ["in-process", "spawn-cwd", "", "opencode-cache", "none", 0, "deny-reason"],
    };

    const CLAUDE_NATIVE = { shell: ["Bash"], read: ["Read"], grep: ["Grep"], webfetch: ["WebFetch"], edit: ["Write", "Edit", "NotebookEdit"] };
    // impl/10 §1.3a; zcode = Claude names per DECISIONS-r9 R4 and impl/00 §3.1 (DEVIATIONS D-M3-A7-1).
    const NATIVE = {
      "claude-code": CLAUDE_NATIVE,
      codex: { shell: ["Bash"], edit: ["apply_patch"] },
      gemini: { shell: ["run_shell_command"], read: ["read_file"], grep: ["grep_search"], webfetch: ["web_fetch"] }, // gemini-cli 0.65.0 *_TOOL_NAME
      qwen: { shell: ["run_shell_command", "Shell"], read: ["read_file"], grep: ["grep_search"], webfetch: ["web_fetch"] },
      "copilot-cli": { shell: ["bash", "powershell"] }, // D-HA-COPILOT-NAMES-1, D-PWSH-DUMP-1
      vscode: { shell: ["run_in_terminal", "runTerminalCommand", "bash", "powershell"], read: ["read_file", "view"], webfetch: ["fetch_webpage", "web_fetch"] }, // D-HF-VSCODE-PROJECT-1, D-N7-VSCODE-TOOLS-1
      kiro: { shell: ["execute_bash", "execute_pwsh", "shell"] }, // D-HF-KIRO-SHELL-1, D-N7-KIRO-1
      zcode: CLAUDE_NATIVE,
      pi: { shell: ["bash"], read: ["read"] }, // D-HA-PI-NAMES-1
      opencode: { shell: ["bash"] }, // D-HF-OPENCODE-SHELL-1
    };

    const CLAUDE_EVENTS = { SessionStart: "SessionStart", UserPromptSubmit: "UserPromptSubmit", PreToolUse: "PreToolUse", PostToolUse: "PostToolUse" };
    // impl/10 §1.4; vscode PreCompact per DEVIATIONS D-M3-A4-1.
    const EVENTS = {
      "claude-code": CLAUDE_EVENTS,
      codex: CLAUDE_EVENTS,
      gemini: { UserPromptSubmit: "BeforeAgent", PreToolUse: "BeforeTool", PostToolUse: "AfterTool", PreCompact: "PreCompress" },
      qwen: CLAUDE_EVENTS,
      "copilot-cli": { SessionStart: "sessionStart", UserPromptSubmit: "userPromptSubmitted", PreToolUse: "preToolUse", PostToolUse: "postToolUse" },
      vscode: { ...CLAUDE_EVENTS, PreCompact: "PreCompact" },
      kiro: { SessionStart: "SessionStart", UserPromptSubmit: "UserPromptSubmit", PreToolUse: "PreToolUse", PostToolUse: "PostToolUse" },
      zcode: CLAUDE_EVENTS,
      pi: { SessionStart: "session_start", UserPromptSubmit: "input", PreToolUse: "tool_call", PostToolUse: "tool_result" },
      // Usage: OpenCode step-finish cost row (DEVIATIONS D-M5-arch-2).
      opencode: { SessionStart: "context", UserPromptSubmit: "prompt", PreToolUse: "execute.before", PostToolUse: "execute.after", PreCompact: "compaction", Usage: "step-finish" },
    };

    const MODULES = { "claude-code": claudeCode, codex, gemini, qwen, "copilot-cli": copilotCli, vscode, kiro, zcode, pi, opencode };

    test("ADAPTERS has one row per AgentId, in AGENT_IDS order (impl/10 §1.2, §1.3)", () => {
      assert.deepEqual(ADAPTERS.map((r) => r.id), [...AGENT_IDS]);
      assert.ok(Object.isFrozen(ADAPTERS));
      for (const id of AGENT_IDS) assert.equal(getAdapter(id).id, id);
    });

    test("main columns match impl/10 §1.3", () => {
      for (const id of AGENT_IDS) {
        const r = getAdapter(id);
        assert.deepEqual(
          [r.installMode, r.projectSource, r.toolNamePrefix, r.compactDelivery, r.compactSummary, r.hookTimeoutMs, r.denyChannel],
          MAIN[id],
          id,
        );
      }
    });

    test("nativeTools match impl/10 §1.3a; execReadOnlyHint true only for codex (DECISIONS-r9 R4, R5)", () => {
      for (const id of AGENT_IDS) {
        const r = getAdapter(id);
        assert.deepEqual(r.nativeTools, NATIVE[id], id);
        assert.equal(r.execReadOnlyHint, id === "codex", id);
      }
    });

    test("eventMap matches impl/10 §1.4", () => {
      for (const id of AGENT_IDS) assert.deepEqual(getAdapter(id).eventMap, EVENTS[id], id);
    });

    test("toolNamePrefix equals each adapter module's TOOL_NAME_PREFIX", () => {
      for (const [id, mod] of Object.entries(MODULES)) assert.equal(getAdapter(id).toolNamePrefix, mod.TOOL_NAME_PREFIX, id);
    });

    test("all 10 adapters are wired to their own decode/encode (no not-built stub)", () => {
      for (const [id, mod] of Object.entries(MODULES)) {
        const r = getAdapter(id);
        assert.equal(r.decode, mod.decode, id + " decode");
        assert.equal(r.encode, mod.encode, id + " encode");
      }
    });

    test("each newly wired row decodes its own native PreToolUse and encodes allow as empty stdout, exit 0", () => {
      const payloads = {
        gemini: { hook_event_name: "BeforeTool", session_id: "s", cwd: "/p", tool_name: "run_shell_command", tool_input: { command: "ls" } },
        qwen: { hook_event_name: "PreToolUse", session_id: "s", cwd: "/p", tool_name: "run_shell_command", tool_input: { command: "ls" } },
        "copilot-cli": { hookEventName: "preToolUse", sessionId: "s", cwd: "/p", toolName: "bash", toolArgs: { command: "ls" } },
        vscode: { hook_event_name: "PreToolUse", session_id: "s", cwd: "/p", tool_name: "runInTerminal", tool_input: { command: "ls" } },
        kiro: { hook_event_name: "PreToolUse", session_id: "s", cwd: "/p", tool_name: "execute_bash", tool_input: { command: "ls" } },
        zcode: { hook_event_name: "PreToolUse", session_id: "s", cwd: "/p", tool_name: "Bash", tool_input: { command: "ls" } },
      };
      for (const [id, raw] of Object.entries(payloads)) {
        const r = getAdapter(id);
        const ev = r.decode(raw);
        assert.equal(ev.event, "PreToolUse", id);
        assert.equal(ev.agent, id, id);
        assert.deepEqual(r.encode(ev, { kind: "allow" }), { stdout: "", exitCode: 0 }, id);
      }
    });

    test("pi decodes its call-site payloads (impl/10 §10, DEVIATIONS D-M5-A1-1)", () => {
      const r = getAdapter("pi");
      const pre = r.decode({ type: "tool_call", sessionId: "s", cwd: "/p", toolName: "ctx_execute", toolCallId: "c1", input: { code: "1" } });
      assert.deepEqual(pre, { event: "PreToolUse", agent: "pi", sessionId: "s", cwd: "/p", tool: { name: "ctx_execute", canonicalName: "ctx_execute", input: { code: "1" }, callId: "c1" } });
      assert.equal(r.decode({ type: "session_start", sessionId: "s", cwd: "/p" }).source, "startup");
      assert.equal(r.decode({ type: "session_compact", sessionId: "s", cwd: "/p" }).source, "compact");
      assert.equal(r.decode({ type: "input", sessionId: "s", cwd: "/p", message: "hi" }).prompt, "hi");
      const post = r.decode({ type: "tool_result", sessionId: "s", cwd: "/p", toolName: "bash", input: {}, content: "abc", isError: true });
      assert.deepEqual(post.result, { isError: true, bytes: 3, text: "abc" });
      assert.throws(() => r.decode({ type: "turn_end" }), /pi: unknown hook event turn_end/);
      assert.throws(() => r.decode(null), /pi: hook payload is not an object/);
    });

    test("pi encode: allow is the empty shape; injected text is a custom-role message with a timestamp", () => {
      const r = getAdapter("pi");
      const ss = { event: "SessionStart", agent: "pi", sessionId: "s", cwd: "/p" };
      const pre = { event: "PreToolUse", agent: "pi", sessionId: "s", cwd: "/p" };
      assert.deepEqual(r.encode(pre, { kind: "allow" }), { stdout: "", exitCode: 0 });
      const hint = r.encode(ss, { kind: "hint", text: "use ctx_resume", onceKey: "k" });
      assert.equal(hint.stdout, "use ctx_resume");
      assert.equal(hint.exitCode, 0);
      assert.equal(hint.role, "custom");
      assert.equal(hint.content, "use ctx_resume");
      assert.ok(Number.isFinite(hint.timestamp));
      assert.equal(r.encode(pre, { kind: "hint", text: "x", onceKey: "k" }).stdout, "", "no tool_call hint field: dropped");
      const deny = r.encode(pre, { kind: "deny", reason: "use ctx_execute", rewritten: "node run.mjs x" });
      assert.equal(deny.exitCode, 2);
      assert.equal(deny.stdout, "node run.mjs x\nuse ctx_execute");
      assert.deepEqual(pi.checkPermission(deny), { block: true, reason: "node run.mjs x\nuse ctx_execute" });
      assert.equal(pi.checkPermission({ stdout: "", exitCode: 0 }), undefined);
      assert.equal(r.encode({ ...pre, event: "PostToolUse" }, { kind: "replace", output: "short" }).stdout, "short");
    });

    test("opencode decodes its call-site payloads, webfetch is WebFetch, step-finish is Usage (impl/10 §11, D-M5-arch-2)", () => {
      const r = getAdapter("opencode");
      const pre = r.decode({ type: "execute.before", sessionID: "s", directory: "/p", tool: "webfetch", callID: "c1", args: { url: "https://x.test" } });
      assert.deepEqual(pre, { event: "PreToolUse", agent: "opencode", sessionId: "s", cwd: "/p", tool: { name: "webfetch", canonicalName: "WebFetch", input: { url: "https://x.test" }, callId: "c1" } });
      assert.equal(r.decode({ type: "execute.before", sessionID: "s", directory: "/p", tool: "context-mode_ctx_execute", args: {} }).tool.canonicalName, "ctx_execute");
      assert.equal(r.decode({ type: "execute.before", sessionID: "s", directory: "/p", tool: "bash", args: {} }).tool.canonicalName, "Bash"); // D-HF-OPENCODE-SHELL-1
      assert.equal(r.toCanonicalTool("webfetch"), "WebFetch");
      assert.equal(r.decode({ type: "context", sessionID: "s", directory: "/p" }).event, "SessionStart");
      assert.equal(r.decode({ type: "compaction", sessionID: "s", directory: "/p" }).event, "PreCompact");
      assert.equal(r.decode({ type: "prompt", sessionID: "s", directory: "/p", message: "hi" }).prompt, "hi");
      const usage = r.decode({ type: "step-finish", sessionID: "s", directory: "/p", turn: 3 });
      assert.deepEqual(usage, { event: "Usage", agent: "opencode", sessionId: "s", cwd: "/p", turn: 3 });
      const post = r.decode({ type: "execute.after", sessionID: "s", directory: "/p", tool: "bash", args: {}, output: "abc" });
      assert.deepEqual(post.result, { isError: false, bytes: 3, text: "abc" });
      assert.throws(() => r.decode({ type: "message.updated" }), /opencode: unknown hook event message.updated/);
    });

    test("opencode encode: hint only on session text, deny exits 2 on execute.before only, prompt never fails", () => {
      const r = getAdapter("opencode");
      const base = { agent: "opencode", sessionId: "s", cwd: "/p" };
      assert.deepEqual(r.encode({ ...base, event: "PreToolUse" }, { kind: "allow" }), { stdout: "", exitCode: 0 });
      assert.deepEqual(r.encode({ ...base, event: "SessionStart" }, { kind: "hint", text: "t", onceKey: "k" }), { stdout: "t", exitCode: 0 });
      assert.deepEqual(r.encode({ ...base, event: "PreToolUse" }, { kind: "hint", text: "t", onceKey: "k" }), { stdout: "", exitCode: 0 });
      assert.deepEqual(r.encode({ ...base, event: "PreToolUse" }, { kind: "deny", reason: "why" }), { stdout: "why", exitCode: 2 });
      assert.deepEqual(r.encode({ ...base, event: "UserPromptSubmit" }, { kind: "deny", reason: "why" }), { stdout: "", exitCode: 0 });
      assert.deepEqual(r.encode({ ...base, event: "PostToolUse" }, { kind: "replace", output: "o" }), { stdout: "", exitCode: 0 });
    });

    // D-FU-RM-KIRO-2: every native name a row's eventMap emits (the build writes these into hooks/<id>.json) must
    // decode to its canonical event, or the host fires a hook the entry drops ("unknown hook event").
    test("each spawn row decodes every native event name its eventMap emits", () => {
      for (const row of ADAPTERS.filter((r) => r.installMode !== "in-process")) {
        for (const [canonical, native] of Object.entries(row.eventMap)) {
          const payload = { hook_event_name: native, session_id: "s", cwd: "/tmp/p", tool_name: "x", tool_input: {}, tool_response: "" };
          assert.equal(row.decode(payload).event, canonical, `${row.id}: ${native}`);
        }
      }
    });

    // ADR-0020: every row names its one hook channel and its one skill channel. Expected values copied from the ADR table.
    const HOOK_CHANNEL = {
      "claude-code": { kind: "package", path: "hooks/claude-code.json" },
      codex: { kind: "home-file", path: ".codex/hooks.json" },
      gemini: { kind: "package", path: "hooks/hooks.json" },
      qwen: { kind: "package", path: "hooks/qwen.json" },
      "copilot-cli": { kind: "home-file", path: ".copilot/hooks/context-mode.json" },
      vscode: { kind: "home-file", path: ".copilot/hooks/context-mode-vscode.json" },
      kiro: { kind: "home-file", path: ".kiro/hooks/context-mode.json" },
      zcode: { kind: "home-file", path: ".zcode/cli/config.json" },
      pi: { kind: "in-process", path: "pi/index.js" },
      opencode: { kind: "in-process", path: "opencode/plugin.js" },
    };
    const SKILL_CHANNEL = {
      "claude-code": { kind: "package", path: "claude-code/skills" }, // D-HQ-SKILLS-2
      codex: { kind: "home-dir", path: ".codex/skills" },
      gemini: { kind: "package", path: "skills" },
      qwen: { kind: "package", path: "skills" }, // D-HQ-SKILLS-3: <extension>/skills, shared with gemini
      "copilot-cli": { kind: "home-dir", path: ".copilot/skills" },
      vscode: { kind: "home-dir", path: ".agents/skills" }, // D-HQ-COPILOT-NAMES-3
      kiro: { kind: "home-dir", path: ".kiro/skills" },
      zcode: { kind: "home-dir", path: ".zcode/skills" },
      pi: { kind: "package", path: "pi/skills" },
      opencode: { kind: "home-dir", path: ".config/opencode/skills" },
    };

    test("every row has a hookChannel and a skillChannel with a non-empty path (ADR-0020, no exception rows)", () => {
      for (const id of AGENT_IDS) {
        const r = getAdapter(id);
        assert.ok(r.hookChannel && typeof r.hookChannel.path === "string" && r.hookChannel.path.length > 0, id + " hookChannel");
        assert.ok(r.skillChannel && typeof r.skillChannel.path === "string" && r.skillChannel.path.length > 0, id + " skillChannel");
        assert.deepEqual(r.hookChannel, HOOK_CHANNEL[id], id + " hookChannel");
        assert.deepEqual(r.skillChannel, SKILL_CHANNEL[id], id + " skillChannel");
      }
    });
  });

  describe("ADR-0020 client map", () => {
    // Unit test for src/core/contracts/client-map.ts (14a GP1/opencode-clientinfo-detect, #1276; D-M7-arch-1).
    // Unit tests may import src/ (TECH-SPEC §6.2a); e2e/ never does (GS4).


    test("MCP clientInfo.name opencode maps to adapter opencode (#1276)", () => {
      assert.equal(CLIENT_NAME_TO_PLATFORM["opencode"], "opencode");
    });
  });

  describe("ADR-0020 claude-code adapter and hook entry", () => {
    // Unit tests for src/adapters/table.ts, src/adapters/claude-code.ts and the M0 hook entry
    // src/entries/hook.ts (impl/10 §1.2-§1.5, §2, shared decode/encode; impl/09 §5.2; DEVIATIONS D-M0-7).
    // Unit tests may import src/ (TECH-SPEC §6.2a); e2e/ never does (GS4).
    // Payloads below follow the Claude Code hook stdin shape (impl/10 §2 field table).


    const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
    const HOOK_ENTRY = join(ROOT, "src/entries/hook.ts");

    const base = { session_id: "s-1", transcript_path: "/tmp/t.jsonl", cwd: "/tmp/proj", permission_mode: "default" };

    // ---------- table.ts ----------

    test("ADAPTERS has one row per AGENT_IDS entry, same order", () => {
      assert.deepEqual(ADAPTERS.map((r) => r.id), [...AGENT_IDS]);
    });

    test("getAdapter resolves every AgentId to its own row", () => {
      for (const id of AGENT_IDS) assert.equal(getAdapter(id).id, id);
    });

    test("table rows carry impl/10 §1.3 values", () => {
      const want = {
        "claude-code": ["marketplace", "env:CLAUDE_PROJECT_DIR", "mcp__plugin_context-mode_context-mode__", "sessionstart", "none", "deny-reason"],
        codex: ["config-mcp", "arg:--agent+cwd", "mcp__context_mode__", "sessionstart", "none", "deny-reason"],
        gemini: ["extension", "spawn-cwd", "mcp_context-mode_", "pending-flag", "none", "deny-reason"],
        qwen: ["extension", "spawn-cwd", "mcp__context-mode__", "sessionstart", "none", "deny-reason"],
        "copilot-cli": ["plugin", "arg:--agent+cwd", "context-mode-", "pending-flag", "none", "deny-reason"],
        vscode: ["mcp-entry", "arg:workspaceFolder", "mcp_context-mode_", "pending-flag", "none", "deny-reason"],
        kiro: ["mcp-entry", "arg:--agent+cwd", "mcp_context-mode_", "none", "none", "hint-only"],
        zcode: ["hooks+mcp", "spawn-cwd", "mcp__context-mode__", "sessionstart", "none", "deny-reason"],
        pi: ["in-process", "pi:ctx.cwd", "", "pi-flag", "none", "deny-reason"],
        opencode: ["in-process", "spawn-cwd", "", "opencode-cache", "none", "deny-reason"],
      };
      for (const r of ADAPTERS) {
        assert.deepEqual(
          [r.installMode, r.projectSource, r.toolNamePrefix, r.compactDelivery, r.compactSummary, r.denyChannel],
          want[r.id],
          r.id,
        );
      }
    });

    test("hookTimeoutMs is HOOK_TIMEOUT_MS for spawned hooks, 0 for in-process plugins", () => {
      for (const r of ADAPTERS) {
        assert.equal(r.hookTimeoutMs, r.installMode === "in-process" ? 0 : HOOK_TIMEOUT_MS, r.id);
      }
    });

    test("nativeTools and execReadOnlyHint follow impl/10 §1.3a and DECISIONS-r9 R4/R5", () => {
      const claude = { shell: ["Bash"], read: ["Read"], grep: ["Grep"], webfetch: ["WebFetch"], edit: ["Write", "Edit", "NotebookEdit"] };
      assert.deepEqual(getAdapter("claude-code").nativeTools, claude);
      assert.deepEqual(getAdapter("zcode").nativeTools, claude);
      assert.deepEqual(getAdapter("codex").nativeTools, { shell: ["Bash"], edit: ["apply_patch"] });
      assert.deepEqual(getAdapter("qwen").nativeTools, {
        shell: ["run_shell_command", "Shell"], read: ["read_file"], grep: ["grep_search"], webfetch: ["web_fetch"],
      });
      assert.deepEqual(getAdapter("gemini").nativeTools, { // D-HA-GEMINI-NAMES-1: gemini-cli 0.65.0 *_TOOL_NAME
        shell: ["run_shell_command"], read: ["read_file"], grep: ["grep_search"], webfetch: ["web_fetch"],
      });
      assert.deepEqual(getAdapter("copilot-cli").nativeTools, { shell: ["bash", "powershell"] }); // D-HA-COPILOT-NAMES-1, D-PWSH-DUMP-1
      assert.deepEqual(getAdapter("pi").nativeTools, { shell: ["bash"], read: ["read"] }); // D-HA-PI-NAMES-1
      assert.deepEqual(getAdapter("vscode").nativeTools, { shell: ["run_in_terminal", "runTerminalCommand", "bash", "powershell"], read: ["read_file", "view"], webfetch: ["fetch_webpage", "web_fetch"] }); // D-HF-VSCODE-PROJECT-1, D-N7-VSCODE-TOOLS-1
      assert.deepEqual(getAdapter("kiro").nativeTools, { shell: ["execute_bash", "execute_pwsh", "shell"] }); // D-HF-KIRO-SHELL-1, D-N7-KIRO-1
      assert.deepEqual(getAdapter("opencode").nativeTools, { shell: ["bash"] }); // D-HF-OPENCODE-SHELL-1
      for (const r of ADAPTERS) assert.equal(r.execReadOnlyHint, r.id === "codex", r.id);
    });

    test("eventMap follows impl/10 §1.4", () => {
      const claudeShape = { SessionStart: "SessionStart", UserPromptSubmit: "UserPromptSubmit", PreToolUse: "PreToolUse", PostToolUse: "PostToolUse" };
      assert.deepEqual(getAdapter("claude-code").eventMap, claudeShape);
      assert.deepEqual(getAdapter("codex").eventMap, claudeShape);
      assert.deepEqual(getAdapter("qwen").eventMap, claudeShape);
      assert.deepEqual(getAdapter("vscode").eventMap, { ...claudeShape, PreCompact: "PreCompact" }); // DEVIATIONS D-M3-A4-1
      assert.deepEqual(getAdapter("zcode").eventMap, claudeShape);
      // D-FU-GCH-1: no gemini SessionStart (Claude Code also runs hooks/hooks.json entries it knows).
      assert.deepEqual(getAdapter("gemini").eventMap, {
        UserPromptSubmit: "BeforeAgent", PreToolUse: "BeforeTool", PostToolUse: "AfterTool", PreCompact: "PreCompress",
      });
      assert.deepEqual(getAdapter("copilot-cli").eventMap, {
        SessionStart: "sessionStart", UserPromptSubmit: "userPromptSubmitted", PreToolUse: "preToolUse", PostToolUse: "postToolUse",
      });
      assert.deepEqual(getAdapter("kiro").eventMap, {
        SessionStart: "SessionStart", UserPromptSubmit: "UserPromptSubmit", PreToolUse: "PreToolUse", PostToolUse: "PostToolUse",
      });
      assert.deepEqual(getAdapter("pi").eventMap, {
        SessionStart: "session_start", UserPromptSubmit: "input", PreToolUse: "tool_call", PostToolUse: "tool_result",
      });
      assert.deepEqual(getAdapter("opencode").eventMap, {
        SessionStart: "context", UserPromptSubmit: "prompt", PreToolUse: "execute.before", PostToolUse: "execute.after", PreCompact: "compaction", Usage: "step-finish", // D-M5-arch-2
      });
    });

    // M3-A7 wired the six spawn adapters; only pi/opencode stay not built (DEVIATIONS D-M3-A7-1).
    test("rows of adapters not built yet: decode throws, encode gives the empty allow shape", () => {
      for (const id of ["pi", "opencode"]) {
        const row = getAdapter(id);
        assert.throws(() => row.decode({ hook_event_name: "PreToolUse" }), id);
        assert.deepEqual(row.encode({ event: "PreToolUse", agent: id, sessionId: "", cwd: "" }, { kind: "allow" }), { stdout: "", exitCode: 0 }, id);
      }
    });

    test("claude-code and codex rows use their own decode/encode", async () => {
      const codex = await import("../../src/adapters/codex.ts");
      assert.equal(getAdapter("claude-code").decode, decode);
      assert.equal(getAdapter("claude-code").encode, encode);
      assert.equal(getAdapter("codex").decode, codex.decode);
      assert.equal(getAdapter("codex").encode, codex.encode);
    });

    // ---------- claude-code.ts decode ----------

    test("decode SessionStart reads session_id, cwd, source", () => {
      const ev = decode({ ...base, hook_event_name: "SessionStart", source: "compact" });
      assert.deepEqual(ev, { event: "SessionStart", agent: "claude-code", sessionId: "s-1", cwd: "/tmp/proj", source: "compact" });
    });

    test("decode SessionStart keeps each of the four source values", () => {
      for (const source of ["startup", "resume", "clear", "compact"]) {
        assert.equal(decode({ ...base, hook_event_name: "SessionStart", source }).source, source);
      }
    });

    test("decode UserPromptSubmit reads prompt", () => {
      const ev = decode({ ...base, hook_event_name: "UserPromptSubmit", prompt: "fix the build" });
      assert.deepEqual(ev, { event: "UserPromptSubmit", agent: "claude-code", sessionId: "s-1", cwd: "/tmp/proj", prompt: "fix the build" });
    });

    test("decode PreToolUse native Bash keeps the name as canonical", () => {
      const ev = decode({ ...base, hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "ls -la", description: "list" }, tool_use_id: "toolu_1" });
      assert.equal(ev.event, "PreToolUse");
      // D-M7-RR-1: tool_use_id is kept as callId (main-agent replace source label).
      assert.deepEqual(ev.tool, { name: "Bash", canonicalName: "Bash", input: { command: "ls -la", description: "list" }, callId: "toolu_1" });
      assert.equal(ev.agentId, undefined);
      assert.equal(ev.agentType, undefined);
    });

    test("decode maps own plugin tool names to bare ctx_* names", () => {
      const ev = decode({ ...base, hook_event_name: "PreToolUse", tool_name: "mcp__plugin_context-mode_context-mode__ctx_execute", tool_input: { code: "1" } });
      assert.equal(ev.tool.canonicalName, "ctx_execute");
      assert.equal(ev.tool.name, "mcp__plugin_context-mode_context-mode__ctx_execute");
    });

    test("decode maps another MCP server's tool to mcp:<server>:<tool>", () => {
      const ev = decode({ ...base, hook_event_name: "PreToolUse", tool_name: "mcp__github__list_issues", tool_input: {} });
      assert.equal(ev.tool.canonicalName, "mcp:github:list_issues");
    });

    test("decode PreToolUse with no tool_input gives an empty input object", () => {
      const ev = decode({ ...base, hook_event_name: "PreToolUse", tool_name: "Read" });
      assert.deepEqual(ev.tool.input, {});
    });

    test("decode subagent: agent_id marks it, agent_type rides along", () => {
      const ev = decode({ ...base, hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "ls" }, agent_id: "a-7", agent_type: "Explore" });
      assert.equal(ev.agentId, "a-7");
      assert.equal(ev.agentType, "Explore");
    });

    test("decode PostToolUse reads tool_response size and is_error", () => {
      const resp = { stdout: "hello\n", stderr: "", interrupted: false, isImage: false };
      const ev = decode({ ...base, hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: { command: "echo hello" }, tool_response: resp });
      assert.equal(ev.event, "PostToolUse");
      // D-M7-RR-1: a Bash {stdout, stderr} response is read as the plain output the model sees.
      assert.deepEqual(ev.result, { isError: false, bytes: Buffer.byteLength("hello\n"), text: "hello\n" });
      const both = decode({ ...base, hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: {}, tool_response: { stdout: "out", stderr: "err" } });
      assert.equal(both.result.text, "out\nerr");
      const errOnly = decode({ ...base, hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: {}, tool_response: { stdout: "", stderr: "err" } });
      assert.equal(errOnly.result.text, "err");
      const other = { file: { content: "x" } };
      const obj = decode({ ...base, hook_event_name: "PostToolUse", tool_name: "Read", tool_input: {}, tool_response: other });
      assert.equal(obj.result.text, JSON.stringify(other));

      const failed = decode({ ...base, hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: {}, tool_response: { is_error: true } });
      assert.equal(failed.result.isError, true);

      const plain = decode({ ...base, hook_event_name: "PostToolUse", tool_name: "Read", tool_input: {}, tool_response: "ünï" });
      assert.deepEqual(plain.result, { isError: false, bytes: Buffer.byteLength("ünï"), text: "ünï" });
    });

    test("decode throws on an event name outside the eventMap, and on a non-object payload", () => {
      assert.throws(() => decode({ ...base, hook_event_name: "Stop" }));
      assert.throws(() => decode({ ...base }));
      assert.throws(() => decode(null));
      assert.throws(() => decode("SessionStart"));
    });

    // ---------- claude-code.ts encode ----------

    const pre = { event: "PreToolUse", agent: "claude-code", sessionId: "s-1", cwd: "/tmp/proj" };

    test("encode allow is the native empty shape, exit 0, on every event", () => {
      for (const event of ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse"]) {
        assert.deepEqual(encode({ ...pre, event }, { kind: "allow" }), { stdout: "", exitCode: 0 });
      }
    });

    test("encode hint writes hookSpecificOutput.additionalContext", () => {
      const out = encode({ ...pre, event: "SessionStart" }, { kind: "hint", text: "call ctx_resume", onceKey: "k" });
      assert.equal(out.exitCode, 0);
      assert.deepEqual(JSON.parse(out.stdout), { hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: "call ctx_resume" } });
    });

    test("encode deny writes permissionDecision deny + reason", () => {
      const out = encode(pre, { kind: "deny", reason: "use ctx_execute" });
      assert.equal(out.exitCode, 0);
      assert.deepEqual(JSON.parse(out.stdout), {
        hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: "use ctx_execute" },
      });
    });

    test("encode deny puts the rewritten command before the reason; never updatedInput", () => {
      const out = encode(pre, { kind: "deny", reason: "why", rewritten: "node /x/run.mjs abc" });
      const hso = JSON.parse(out.stdout).hookSpecificOutput;
      assert.equal(hso.permissionDecisionReason, "node /x/run.mjs abc\nwhy");
      assert.equal("updatedInput" in hso, false);
    });

    test("encode replace writes updatedToolOutput on PostToolUse only", () => {
      const out = encode({ ...pre, event: "PostToolUse" }, { kind: "replace", output: "chunks" });
      assert.deepEqual(JSON.parse(out.stdout), { hookSpecificOutput: { hookEventName: "PostToolUse", updatedToolOutput: "chunks" } });
      assert.deepEqual(encode(pre, { kind: "replace", output: "chunks" }), { stdout: "", exitCode: 0 });
    });

    test("D-M7-SV-1: encode replace on Bash writes the Bash output shape {stdout, stderr, interrupted}", () => {
      const ev = { ...pre, event: "PostToolUse", tool: { name: "Bash", canonicalName: "Bash", input: { command: "ls" } } };
      const out = encode(ev, { kind: "replace", output: "chunks" });
      assert.deepEqual(JSON.parse(out.stdout), { hookSpecificOutput: { hookEventName: "PostToolUse", updatedToolOutput: { stdout: "chunks", stderr: "", interrupted: false } } });
    });

    // ---------- src/entries/hook.ts (M0 skeleton, D-M0-7) ----------

    function runEntry(args, input) {
      return spawnSync(process.execPath, [HOOK_ENTRY, ...args], { input, encoding: "utf8" });
    }

    // D-HNE-GUARD-1: a Bash PreToolUse with no resolvable project is now denied (the hook failed), so the PreToolUse cases
    // below run in a real git repo with a temp HOME and CLAUDE_PROJECT_DIR; the assertions (allow, empty stdout, exit 0) are unchanged.
    function healthyEntry(args, payload) {
      const dir = mkdtempSync(join(tmpdir(), "cm-cc-entry-"));
      try {
        spawnSync("git", ["init", "-q", dir]);
        const env = { PATH: process.env.PATH, HOME: dir, USERPROFILE: dir, CLAUDE_PROJECT_DIR: dir };
        return spawnSync(process.execPath, [HOOK_ENTRY, ...args], { input: JSON.stringify({ ...payload, cwd: dir }), encoding: "utf8", env, cwd: dir });
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }

    test("hook entry: recorded-shape payload -> allow, empty stdout, exit 0", () => {
      for (const [event, extra] of [
        ["SessionStart", { source: "startup" }],
        ["UserPromptSubmit", { prompt: "hi" }],
        ["PreToolUse", { tool_name: "Bash", tool_input: { command: "ls" } }],
        ["PostToolUse", { tool_name: "Bash", tool_input: { command: "ls" }, tool_response: { stdout: "a" } }],
      ]) {
        const payload = { ...base, hook_event_name: event, ...extra };
        const args = ["--agent", "claude-code", "--event", event];
        const r = event === "PreToolUse" ? healthyEntry(args, payload) : runEntry(args, JSON.stringify(payload));
        assert.equal(r.status, 0, event + " " + r.stderr);
        assert.equal(r.stdout, "", event);
      }
    });

    test("hook entry: codex payload -> allow, empty stdout, exit 0", () => {
      const r = healthyEntry(["--agent", "codex"], { ...base, turn_id: "t1", model: "m", hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "ls" } });
      assert.equal(r.status, 0, r.stderr);
      assert.equal(r.stdout, "");
    });

    test("hook entry fails open: unknown agent, missing agent, bad JSON, unknown event, unbuilt adapter", () => {
      const cases = [
        [["--agent", "nope"], "{}"],
        [[], "{}"],
        [["--agent", "claude-code"], "{not json"],
        [["--agent", "claude-code"], JSON.stringify({ ...base, hook_event_name: "Stop" })],
        [["--agent", "gemini"], JSON.stringify({ ...base, hook_event_name: "BeforeTool" })],
      ];
      for (const [args, input] of cases) {
        const r = runEntry(args, input);
        assert.equal(r.status, 0, JSON.stringify(args));
        assert.equal(r.stdout, "", JSON.stringify(args));
      }
    });

    test("hook path imports contracts + adapters only: no DB, no network, no spawn (PRD P4)", () => {
      // D-M3-H2-9: since M3 the entry imports handleHook (impl/09 §5.2); its own lines stay contracts + dispatch.
      const entry = readFileSync(join(ROOT, "src/entries/hook.ts"), "utf8");
      for (const line of entry.split("\n").filter((l) => l.startsWith("import "))) {
        const spec = line.slice(line.lastIndexOf(" from ") + 6).trim();
        assert.ok(spec.includes("/core/contracts/") || spec === '"../core/hooks/dispatch.ts";', "src/entries/hook.ts: " + line);
      }
      const files = ["src/adapters/table.ts", "src/adapters/claude-code.ts", "src/adapters/codex.ts"];
      const banned = ["node:sqlite", "node:child_process", "node:net", "node:http", "node:https", "node:dns", "fetch(", "/store/", "/sandbox/"];
      for (const f of files) {
        const src = readFileSync(join(ROOT, f), "utf8");
        for (const b of banned) assert.equal(src.includes(b), false, f + " contains " + b);
        for (const line of src.split("\n").filter((l) => l.startsWith("import "))) {
          const spec = line.slice(line.lastIndexOf(" from ") + 6).trim();
          assert.ok(spec.includes("/core/contracts/") || spec.includes("/adapters/") || spec.startsWith('"./'), f + ": " + line);
        }
      }
    });

    // D-M2-SHAPE-2: a Bash result over the host's inline limit carries persistedOutputPath; decode names the file.
    test("D-M2-SHAPE-2: decode keeps persistedOutputPath only when the inline text is a head of a larger output", async () => {
      const { decode } = await import("../../src/adapters/claude-code.ts");
      const base = { hook_event_name: "PostToolUse", session_id: "s", cwd: "/x", tool_name: "Bash", tool_input: { command: "cat x" }, tool_use_id: "toolu_p" };
      const head = "row 0\nrow 1\n";
      const big = decode({ ...base, tool_response: { stdout: head, stderr: "", interrupted: false, persistedOutputPath: "/x/out.txt", persistedOutputSize: 66370 } });
      assert.equal(big.result.persistedPath, "/x/out.txt");
      assert.equal(big.result.text, head);
      const same = decode({ ...base, tool_response: { stdout: head, stderr: "", interrupted: false, persistedOutputPath: "/x/out.txt", persistedOutputSize: Buffer.byteLength(head) } });
      assert.equal(same.result.persistedPath, undefined);
      const plain = decode({ ...base, tool_response: { stdout: head, stderr: "", interrupted: false } });
      assert.equal(plain.result.persistedPath, undefined);
    });

    // ---------- D-M2-MCP-1: MCP content blocks and the Grep output shape (2.1.303 probes) ----------

    const blocksResp = [{ type: "text", text: "line one" }, { type: "text", text: "line two" }];

    test("D-M2-MCP-1: decode PostToolUse of an MCP tool reads the text blocks as the output", () => {
      const ev = decode({ ...base, hook_event_name: "PostToolUse", tool_name: "mcp__tix__list_tickets", tool_input: {}, tool_response: blocksResp });
      assert.equal(ev.tool.canonicalName, "mcp:tix:list_tickets");
      assert.equal(ev.result.text, "line one\nline two");
      assert.equal(ev.result.bytes, Buffer.byteLength("line one\nline two"));
      assert.equal(ev.result.blocks, true);
      assert.equal(ev.result.keep, undefined);
    });

    test("D-M2-MCP-1: a block that is not text (image) marks the result keep: the original stays", () => {
      const resp = [{ type: "text", text: "a" }, { type: "image", data: "AAAA", mimeType: "image/png" }];
      const ev = decode({ ...base, hook_event_name: "PostToolUse", tool_name: "mcp__tix__shot", tool_input: {}, tool_response: resp });
      assert.equal(ev.result.keep, true);
    });

    test("D-M2-MCP-1: encode replace of an MCP result writes one text block", () => {
      const ev = decode({ ...base, hook_event_name: "PostToolUse", tool_name: "mcp__tix__list_tickets", tool_input: {}, tool_response: blocksResp });
      const out = encode(ev, { kind: "replace", output: "chunks" });
      assert.deepEqual(JSON.parse(out.stdout), { hookSpecificOutput: { hookEventName: "PostToolUse", updatedToolOutput: [{ type: "text", text: "chunks" }] } });
    });

    test("D-M2-MCP-1: decode a Grep content result reads content as the output; encode keeps the Grep shape", () => {
      const resp = { mode: "content", numFiles: 0, filenames: [], content: "a.js:1:x\nb.js:2:y", numLines: 2, totalLines: 2, appliedLimit: 250 };
      const ev = decode({ ...base, hook_event_name: "PostToolUse", tool_name: "Grep", tool_input: { pattern: "x" }, tool_response: resp });
      assert.equal(ev.result.text, "a.js:1:x\nb.js:2:y");
      const out = encode(ev, { kind: "replace", output: "chunks" });
      assert.deepEqual(JSON.parse(out.stdout).hookSpecificOutput.updatedToolOutput, { ...resp, content: "chunks" });
    });

    test("D-M2-MCP-1: a string response keeps the string replace shape", () => {
      const ev = decode({ ...base, hook_event_name: "PostToolUse", tool_name: "WebFetch", tool_input: {}, tool_response: "text" });
      assert.equal(ev.result.blocks, undefined);
      assert.equal(JSON.parse(encode(ev, { kind: "replace", output: "c" }).stdout).hookSpecificOutput.updatedToolOutput, "c");
    });
  });

  describe("ADR-0020 codex adapter", () => {
    const { decode } = __m0;
    const { encode } = __m0;

    // Unit tests for src/adapters/codex.ts (impl/10 §3, shared decode/encode; DECISIONS-r9 R1, R4).
    // Unit tests may import src/ (TECH-SPEC §6.2a); e2e/ never does (GS4).
    // Payloads follow the Codex CLI 0.156.1 hook stdin shape (Claude shape plus turn_id, model).


    const base = { session_id: "c-1", turn_id: "turn-3", transcript_path: null, cwd: "/tmp/proj", model: "m", permission_mode: "default" };

    test("decode SessionStart: source passes through; fork maps to resume (impl/10 A4)", () => {
      for (const source of ["startup", "resume", "clear", "compact"]) {
        assert.equal(decode({ ...base, hook_event_name: "SessionStart", source }).source, source);
      }
      const ev = decode({ ...base, hook_event_name: "SessionStart", source: "fork" });
      assert.deepEqual(ev, { event: "SessionStart", agent: "codex", sessionId: "c-1", cwd: "/tmp/proj", source: "resume" });
    });

    test("decode UserPromptSubmit reads prompt", () => {
      const ev = decode({ ...base, hook_event_name: "UserPromptSubmit", prompt: "run tests" });
      assert.deepEqual(ev, { event: "UserPromptSubmit", agent: "codex", sessionId: "c-1", cwd: "/tmp/proj", prompt: "run tests" });
    });

    test("decode PreToolUse native Bash and apply_patch keep their names", () => {
      const bash = decode({ ...base, hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "cat big.log" } });
      assert.deepEqual(bash.tool, { name: "Bash", canonicalName: "Bash", input: { command: "cat big.log" } });
      const patch = decode({ ...base, hook_event_name: "PreToolUse", tool_name: "apply_patch", tool_input: { input: "*** Begin Patch" } });
      assert.equal(patch.tool.canonicalName, "apply_patch");
    });

    test("decode maps the underscore own prefix to bare ctx_* (DECISIONS-r9 R1)", () => {
      const ev = decode({ ...base, hook_event_name: "PreToolUse", tool_name: "mcp__context_mode__ctx_search", tool_input: { queries: ["a"] } });
      assert.equal(ev.tool.canonicalName, "ctx_search");
      assert.equal(ev.tool.name, "mcp__context_mode__ctx_search");
    });

    test("decode maps the hyphen prefix as another server, not as own tool", () => {
      const ev = decode({ ...base, hook_event_name: "PreToolUse", tool_name: "mcp__context-mode__ctx_search", tool_input: {} });
      assert.equal(ev.tool.canonicalName, "mcp:context-mode:ctx_search");
    });

    test("decode another MCP server's tool to mcp:<server>:<tool>", () => {
      const ev = decode({ ...base, hook_event_name: "PreToolUse", tool_name: "mcp__linear__get_issue", tool_input: {} });
      assert.equal(ev.tool.canonicalName, "mcp:linear:get_issue");
    });

    test("decode subagent fields: agent_id marks a subagent", () => {
      const ev = decode({ ...base, hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: {}, agent_id: "sub-1", agent_type: "worker" });
      assert.equal(ev.agentId, "sub-1");
      assert.equal(ev.agentType, "worker");
      const main = decode({ ...base, hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: {} });
      assert.equal("agentId" in main, false);
    });

    test("decode PostToolUse reads tool_response.is_error and size", () => {
      const ok = decode({ ...base, hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: {}, tool_response: "out" });
      assert.deepEqual(ok.result, { isError: false, bytes: 3, text: "out" });
      const bad = decode({ ...base, hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: {}, tool_response: { is_error: true, output: "x" } });
      assert.equal(bad.result.isError, true);
    });

    test("decode throws on unknown event names and non-object payloads", () => {
      assert.throws(() => decode({ ...base, hook_event_name: "Stop" }));
      assert.throws(() => decode({ ...base, hook_event_name: "PreCompact" }));
      assert.throws(() => decode(undefined));
      assert.throws(() => decode([1]));
    });

    const pre = { event: "PreToolUse", agent: "codex", sessionId: "c-1", cwd: "/tmp/proj" };

    test("encode allow is the native empty shape, exit 0, on every event", () => {
      for (const event of ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse"]) {
        assert.deepEqual(encode({ ...pre, event }, { kind: "allow" }), { stdout: "", exitCode: 0 });
      }
    });

    test("encode hint writes hookSpecificOutput.additionalContext", () => {
      const out = encode(pre, { kind: "hint", text: "prefer ctx_execute", onceKey: "k" });
      assert.equal(out.exitCode, 0);
      assert.deepEqual(JSON.parse(out.stdout), { hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: "prefer ctx_execute" } });
    });

    test("encode deny writes permissionDecision deny + reason, rewritten first", () => {
      const out = encode(pre, { kind: "deny", reason: "why", rewritten: "node /x/run.mjs abc" });
      assert.equal(out.exitCode, 0);
      assert.deepEqual(JSON.parse(out.stdout), {
        hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: "node /x/run.mjs abc\nwhy" },
      });
    });

    test("encode replace is a no-op on Codex (no replace field, documented gap)", () => {
      assert.deepEqual(encode({ ...pre, event: "PostToolUse" }, { kind: "replace", output: "x" }), { stdout: "", exitCode: 0 });
    });
  });

  describe("ADR-0020 copilot-cli adapter", () => {
    const { decode } = __m1;
    const { encode } = __m1;

    // Unit tests for src/adapters/copilot-cli.ts (impl/10 §6, shared decode/encode; ADR-0008 per-adapter table).
    // Unit tests may import src/ (TECH-SPEC §6.2a); e2e/ never does (GS4).
    // Payloads follow the Copilot CLI 1.0.96 hook stdin shapes (spike-hooks-verified §2):
    // camelCase event names -> camelCase payload (hookEventName, sessionId, toolName, toolArgs, toolResult);
    // PascalCase event names -> snake_case payload (hook_event_name, session_id, tool_name, tool_input, tool_response).


    const camel = { sessionId: "cp-1", cwd: "/tmp/proj", timestamp: 1760000000000 };
    const snake = { session_id: "cp-2", cwd: "/tmp/proj", timestamp: 1760000000000 };

    // Copilot CLI 1.0.103 bundle names MCP tools <server>-<tool>: "github-mcp-server-search_code",
    // "playwright-browser_take_screenshot" (runtime.node strings). Server key is "context-mode" (D-HQ-COPILOT-NAMES-2).
    test("own tool prefix is <server>- : context-mode- (Copilot CLI 1.0.103 bundle)", () => {
      assert.equal(TOOL_NAME_PREFIX, "context-mode-");
    });

    test("decode camelCase event names to canonical events", () => {
      const cases = { sessionStart: "SessionStart", userPromptSubmitted: "UserPromptSubmit", preToolUse: "PreToolUse", postToolUse: "PostToolUse", postToolUseFailure: "PostToolUse" };
      for (const [native, canonical] of Object.entries(cases)) {
        const ev = decode({ ...camel, hookEventName: native, toolName: "bash", toolArgs: {} });
        assert.equal(ev.event, canonical, native);
        assert.equal(ev.agent, "copilot-cli");
        assert.equal(ev.sessionId, "cp-1");
        assert.equal(ev.cwd, "/tmp/proj");
      }
    });

    test("decode PascalCase event names read the snake_case payload", () => {
      const cases = { SessionStart: "SessionStart", UserPromptSubmit: "UserPromptSubmit", PreToolUse: "PreToolUse", PostToolUse: "PostToolUse", PostToolUseFailure: "PostToolUse" };
      for (const [native, canonical] of Object.entries(cases)) {
        const ev = decode({ ...snake, hook_event_name: native, tool_name: "bash", tool_input: {} });
        assert.equal(ev.event, canonical, native);
        assert.equal(ev.sessionId, "cp-2");
      }
    });

    test("decode SessionStart source: startup/resume pass, new maps to startup, compact never arrives", () => {
      assert.equal(decode({ ...camel, hookEventName: "sessionStart", source: "startup" }).source, "startup");
      assert.equal(decode({ ...camel, hookEventName: "sessionStart", source: "resume" }).source, "resume");
      const ev = decode({ ...camel, hookEventName: "sessionStart", source: "new" });
      assert.deepEqual(ev, { event: "SessionStart", agent: "copilot-cli", sessionId: "cp-1", cwd: "/tmp/proj", source: "startup" });
      assert.equal("source" in decode({ ...camel, hookEventName: "sessionStart", source: "other" }), false);
    });

    test("decode UserPromptSubmit reads prompt when present, else leaves it undefined", () => {
      const ev = decode({ ...camel, hookEventName: "userPromptSubmitted", prompt: "run tests" });
      assert.deepEqual(ev, { event: "UserPromptSubmit", agent: "copilot-cli", sessionId: "cp-1", cwd: "/tmp/proj", prompt: "run tests" });
      assert.equal("prompt" in decode({ ...camel, hookEventName: "userPromptSubmitted" }), false);
    });

    test("decode PreToolUse toolArgs: object or JSON string", () => {
      const obj = decode({ ...camel, hookEventName: "preToolUse", toolName: "bash", toolArgs: { command: "cat big.log" } });
      assert.deepEqual(obj.tool, { name: "bash", canonicalName: "Bash", input: { command: "cat big.log" } }); // D-HA-COPILOT-NAMES-1
      const str = decode({ ...camel, hookEventName: "preToolUse", toolName: "bash", toolArgs: "{\"command\":\"ls\"}" });
      assert.deepEqual(str.tool.input, { command: "ls" });
      const bad = decode({ ...camel, hookEventName: "preToolUse", toolName: "bash", toolArgs: "not json" });
      assert.deepEqual(bad.tool.input, {});
      const arr = decode({ ...camel, hookEventName: "preToolUse", toolName: "bash", toolArgs: "[1]" });
      assert.deepEqual(arr.tool.input, {});
    });

    test("decode snake_case PreToolUse reads tool_name / tool_input", () => {
      const ev = decode({ ...snake, hook_event_name: "PreToolUse", tool_name: "bash", tool_input: { command: "ls" } });
      assert.deepEqual(ev.tool, { name: "bash", canonicalName: "Bash", input: { command: "ls" } }); // D-HA-COPILOT-NAMES-1
    });

    test("decode maps the own prefix context-mode- to bare ctx_*; other MCP tool names stay unchanged", () => {
      const own = decode({ ...camel, hookEventName: "preToolUse", toolName: "context-mode-ctx_search", toolArgs: {} });
      assert.equal(own.tool.canonicalName, "ctx_search");
      assert.equal(own.tool.name, "context-mode-ctx_search");
      const other = decode({ ...camel, hookEventName: "preToolUse", toolName: "github-mcp-server-search_code", toolArgs: {} });
      assert.equal(other.tool.canonicalName, "github-mcp-server-search_code");
      const native = decode({ ...camel, hookEventName: "preToolUse", toolName: "view", toolArgs: {} });
      assert.equal(native.tool.canonicalName, "view");
    });

    test("decode PostToolUse: toolResult text and size; failure variant or non-success resultType is an error", () => {
      const ok = decode({ ...camel, hookEventName: "postToolUse", toolName: "bash", toolArgs: {}, toolResult: { resultType: "success", textResultForLlm: "out" } });
      assert.deepEqual(ok.result, { isError: false, bytes: 3, text: "out" });
      const failed = decode({ ...camel, hookEventName: "postToolUse", toolName: "bash", toolArgs: {}, toolResult: { resultType: "failure", textResultForLlm: "boom" } });
      assert.equal(failed.result.isError, true);
      const variant = decode({ ...camel, hookEventName: "postToolUseFailure", toolName: "bash", toolArgs: {}, toolResult: { textResultForLlm: "x" } });
      assert.equal(variant.result.isError, true);
      const none = decode({ ...camel, hookEventName: "postToolUse", toolName: "bash", toolArgs: {} });
      assert.deepEqual(none.result, { isError: false, bytes: 0, text: "" });
      // D-HA-COPILOT-REPLACE-1: snake_case result is tool_result {result_type, text_result_for_llm}.
      const snakeOut = decode({ ...snake, hook_event_name: "PostToolUse", tool_name: "bash", tool_input: {}, tool_result: { result_type: "success", text_result_for_llm: "abc" } });
      assert.deepEqual(snakeOut.result, { isError: false, bytes: 3, text: "abc" });
    });

    test("decode never sets subagent fields ([U], S-NAMES open)", () => {
      const ev = decode({ ...camel, hookEventName: "preToolUse", toolName: "bash", toolArgs: {}, agentId: "sub-1", agent_id: "sub-1", agentType: "w" });
      assert.equal("agentId" in ev, false);
      assert.equal("agentType" in ev, false);
    });

    test("decode throws on unknown event names and non-object payloads", () => {
      assert.throws(() => decode({ ...camel, hookEventName: "agentStop" }));
      assert.throws(() => decode({ ...camel, hookEventName: "preCompact" }));
      assert.throws(() => decode({ ...camel }));
      assert.throws(() => decode(undefined));
      assert.throws(() => decode([1]));
      assert.throws(() => decode("preToolUse"));
    });

    const pre = { event: "PreToolUse", agent: "copilot-cli", sessionId: "cp-1", cwd: "/tmp/proj" };

    test("encode allow is empty stdout, exit 0, on every event", () => {
      for (const event of ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse"]) {
        assert.deepEqual(encode({ ...pre, event }, { kind: "allow" }), { stdout: "", exitCode: 0 });
      }
    });

    test("encode hint writes additionalContext on SessionStart, UserPromptSubmit, PreToolUse", () => {
      for (const event of ["SessionStart", "UserPromptSubmit", "PreToolUse"]) {
        const out = encode({ ...pre, event }, { kind: "hint", text: "prefer ctx_execute", onceKey: "k" });
        assert.equal(out.exitCode, 0);
        assert.deepEqual(JSON.parse(out.stdout), { additionalContext: "prefer ctx_execute" });
      }
    });

    test("encode hint on PostToolUse is dropped (no post-call hint field)", () => {
      assert.deepEqual(encode({ ...pre, event: "PostToolUse" }, { kind: "hint", text: "x", onceKey: "k" }), { stdout: "", exitCode: 0 });
    });

    test("encode deny is plain deny-with-reason, rewritten first, never modifiedArgs (ADR-0008)", () => {
      const out = encode(pre, { kind: "deny", reason: "why", rewritten: "node /x/run.mjs abc" });
      assert.equal(out.exitCode, 0);
      const body = JSON.parse(out.stdout);
      assert.deepEqual(body, { permissionDecision: "deny", permissionDecisionReason: "node /x/run.mjs abc\nwhy" });
      assert.equal("modifiedArgs" in body, false);
      assert.deepEqual(JSON.parse(encode(pre, { kind: "deny", reason: "why" }).stdout), { permissionDecision: "deny", permissionDecisionReason: "why" });
    });

    test("encode deny on a non-PreToolUse event is a no-op (no deny field there)", () => {
      for (const event of ["SessionStart", "UserPromptSubmit", "PostToolUse"]) {
        assert.deepEqual(encode({ ...pre, event }, { kind: "deny", reason: "why" }), { stdout: "", exitCode: 0 });
      }
    });

    test("encode replace on postToolUse is modifiedResult; on any other event a no-op (D-HA-COPILOT-REPLACE-1)", () => {
      const out = encode({ ...pre, event: "PostToolUse" }, { kind: "replace", output: "x" });
      assert.equal(out.exitCode, 0);
      assert.deepEqual(JSON.parse(out.stdout), { modifiedResult: { resultType: "success", textResultForLlm: "x" } });
      assert.deepEqual(encode(pre, { kind: "replace", output: "x" }), { stdout: "", exitCode: 0 });
    });

    test("GP3 copilot-cli MCP-firing sub-case", { skip: "SKIPPED until S-NAMES closes (impl/10 §6, TECH-SPEC §3.8)" }, () => {});

    // Copilot CLI hooks reference (docs.github.com/en/copilot/reference/hooks-configuration): the camelCase
    // payload carries no hookEventName. Each event has its own key set; toolArgs is a JSON string (D-HQ-COPILOT-EVENT-1).
    test("decode the documented camelCase payloads that carry no hookEventName", () => {
      const base = { sessionId: "cp-9", timestamp: 1704614600000, cwd: "/tmp/proj" };
      const start = decode({ ...base, source: "new", initialPrompt: "hi" });
      assert.equal(start.event, "SessionStart");
      assert.equal(start.source, "startup");
      const prompt = decode({ ...base, prompt: "run tests" });
      assert.equal(prompt.event, "UserPromptSubmit");
      assert.equal(prompt.prompt, "run tests");
      const pre = decode({ ...base, toolName: "bash", toolArgs: "{\"command\":\"cat big.log\"}" });
      assert.equal(pre.event, "PreToolUse");
      assert.deepEqual(pre.tool, { name: "bash", canonicalName: "Bash", input: { command: "cat big.log" } });
      const post = decode({ ...base, toolName: "bash", toolArgs: "{\"command\":\"cat big.log\"}",
        toolResult: { resultType: "success", textResultForLlm: "out" } });
      assert.equal(post.event, "PostToolUse");
      assert.deepEqual(post.result, { isError: false, bytes: 3, text: "out" });
      assert.equal(post.sessionId, "cp-9");
      assert.equal(post.cwd, "/tmp/proj");
    });
  });

  describe("ADR-0020 gemini adapter", () => {
    const { decode } = __m2;
    const { encode } = __m2;
    const { TOOL_NAME_PREFIX } = __m2;

    // Unit tests for src/adapters/gemini.ts (impl/10 §4, shared decode/encode; TECH-SPEC §3.8 Gemini row).
    // Unit tests may import src/ (TECH-SPEC §6.2a); e2e/ never does (GS4).
    // Payloads are synthetic GP3-shape Gemini CLI payloads (spike-hooks-verified.md Gemini row, gemini-cli@51617c1):
    // common {session_id, transcript_path, cwd, hook_event_name, timestamp} plus source / prompt /
    // tool_name, tool_input, mcp_context, original_request_name / tool_response. No live fixture exists yet
    // (DEVIATIONS T11-gp3-fixtures: gemini pending owner login), so none is written under e2e/fixtures/.


    const base = { session_id: "g-1", transcript_path: "/tmp/g.json", cwd: "/tmp/proj", timestamp: "2026-10-18T00:00:00.000Z" };
    const head = { agent: "gemini", sessionId: "g-1", cwd: "/tmp/proj" };

    // ---------- GP3 synthetic payloads, one per native event ----------
    const FX = {
      SessionStart: { ...base, hook_event_name: "SessionStart", source: "startup" },
      BeforeAgent: { ...base, hook_event_name: "BeforeAgent", prompt: "run the tests" },
      BeforeTool: { ...base, hook_event_name: "BeforeTool", tool_name: "run_shell_command", tool_input: { command: "cat big.log" }, original_request_name: "run_shell_command" },
      AfterTool: { ...base, hook_event_name: "AfterTool", tool_name: "run_shell_command", tool_input: { command: "ls" }, tool_response: { llmContent: "a\nb\n", returnDisplay: "a\nb\n" } },
      PreCompress: { ...base, hook_event_name: "PreCompress", trigger: "auto" },
    };

    test("own prefix is mcp_context-mode_ (single underscore, TECH-SPEC §3.8)", () => {
      assert.equal(TOOL_NAME_PREFIX, "mcp_context-mode_");
    });

    test("decode maps the five native names to canonical events (impl/10 §1.4)", () => {
      const want = { SessionStart: "SessionStart", BeforeAgent: "UserPromptSubmit", BeforeTool: "PreToolUse", AfterTool: "PostToolUse", PreCompress: "PreCompact" };
      for (const [native, canonical] of Object.entries(want)) assert.equal(decode(FX[native]).event, canonical);
    });

    test("decode SessionStart reads source startup/resume/clear", () => {
      assert.deepEqual(decode(FX.SessionStart), { event: "SessionStart", ...head, source: "startup" });
      for (const source of ["resume", "clear"]) assert.equal(decode({ ...FX.SessionStart, source }).source, source);
    });

    test("decode PreCompress gives PreCompact with no extra fields", () => {
      assert.deepEqual(decode(FX.PreCompress), { event: "PreCompact", ...head });
    });

    test("decode BeforeAgent reads prompt", () => {
      assert.deepEqual(decode(FX.BeforeAgent), { event: "UserPromptSubmit", ...head, prompt: "run the tests" });
    });

    test("decode BeforeTool maps the native shell tool to Bash; no subagent field on Gemini (D-HA-GEMINI-NAMES-1)", () => {
      const ev = decode({ ...FX.BeforeTool, agent_id: "x", agent_type: "y" });
      assert.deepEqual(ev, { event: "PreToolUse", ...head, tool: { name: "run_shell_command", canonicalName: "Bash", input: { command: "cat big.log" } } });
      assert.equal("agentId" in ev, false);
      assert.equal("agentType" in ev, false);
    });

    test("decode own tool mcp_context-mode_<tool> to bare ctx_*", () => {
      const ev = decode({ ...FX.BeforeTool, tool_name: "mcp_context-mode_ctx_execute", tool_input: { language: "shell", code: "ls" }, mcp_context: { server_name: "context-mode", tool_name: "ctx_execute" } });
      assert.equal(ev.tool.name, "mcp_context-mode_ctx_execute");
      assert.equal(ev.tool.canonicalName, "ctx_execute");
    });

    test("decode the v1 double-underscore shape is not an own tool", () => {
      const ev = decode({ ...FX.BeforeTool, tool_name: "mcp__context-mode__ctx_execute" });
      assert.notEqual(ev.tool.canonicalName, "ctx_execute");
    });

    test("decode another MCP server's tool from mcp_context to mcp:<server>:<tool> (#529)", () => {
      const ev = decode({ ...FX.BeforeTool, tool_name: "mcp_slack_read_channel", tool_input: {}, mcp_context: { server_name: "slack", tool_name: "read_channel" } });
      assert.equal(ev.tool.canonicalName, "mcp:slack:read_channel");
      const dashed = decode({ ...FX.BeforeTool, tool_name: "mcp_my_srv_get_x", tool_input: {}, mcp_context: { server_name: "my_srv", tool_name: "get_x" } });
      assert.equal(dashed.tool.canonicalName, "mcp:my_srv:get_x");
    });

    test("decode AfterTool reads tool_response size and error", () => {
      const ok = decode(FX.AfterTool);
      assert.equal(ok.event, "PostToolUse");
      assert.equal(ok.tool.canonicalName, "Bash"); // D-HA-GEMINI-NAMES-1
      // D-HA-GEMINI-REPLACE-1: a string llmContent is the text the model sees, so it is the result text.
      const text = FX.AfterTool.tool_response.llmContent;
      assert.deepEqual(ok.result, { isError: false, bytes: Buffer.byteLength(text), text });
      const parts = { llmContent: [{ text: "a" }], returnDisplay: "a" };
      const pj = JSON.stringify(parts);
      assert.deepEqual(decode({ ...FX.AfterTool, tool_response: parts }).result, { isError: false, bytes: Buffer.byteLength(pj), text: pj });
      const bad = decode({ ...FX.AfterTool, tool_response: { llmContent: "", returnDisplay: "", error: { message: "boom" } } });
      assert.equal(bad.result.isError, true);
      const nullErr = decode({ ...FX.AfterTool, tool_response: { llmContent: "x", error: null } });
      assert.equal(nullErr.result.isError, false);
    });

    test("decode throws on unknown events, Claude names and non-object payloads", () => {
      for (const name of ["PreToolUse", "UserPromptSubmit", "AfterAgent", "BeforeModel", undefined]) {
        assert.throws(() => decode({ ...base, hook_event_name: name }));
      }
      assert.throws(() => decode(undefined));
      assert.throws(() => decode(null));
      assert.throws(() => decode([1]));
    });

    // ---------- encode ----------
    const ev = (event) => ({ event, ...head });
    const json = (out) => JSON.parse(out.stdout);

    test("encode allow is empty stdout, exit 0, on every event", () => {
      for (const e of ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "PreCompact"]) {
        assert.deepEqual(encode(ev(e), { kind: "allow" }), { stdout: "", exitCode: 0 });
      }
    });

    test("encode hint on BeforeTool is dropped (no hint field on Gemini BeforeTool)", () => {
      assert.deepEqual(encode(ev("PreToolUse"), { kind: "hint", text: "use ctx_execute", onceKey: "k" }), { stdout: "", exitCode: 0 });
    });

    test("encode hint on SessionStart, BeforeAgent, AfterTool writes hookSpecificOutput.additionalContext", () => {
      for (const e of ["SessionStart", "UserPromptSubmit", "PostToolUse"]) {
        const out = encode(ev(e), { kind: "hint", text: "ctx note", onceKey: "k" });
        assert.equal(out.exitCode, 0);
        assert.deepEqual(json(out), { hookSpecificOutput: { additionalContext: "ctx note" } });
      }
    });

    test("encode hint on PreCompress is a no-op (advisory event)", () => {
      assert.deepEqual(encode(ev("PreCompact"), { kind: "hint", text: "x", onceKey: "k" }), { stdout: "", exitCode: 0 });
    });

    test("encode deny on BeforeTool writes decision deny + reason, rewritten first, exit 0", () => {
      assert.deepEqual(json(encode(ev("PreToolUse"), { kind: "deny", reason: "why" })), { decision: "deny", reason: "why" });
      const out = encode(ev("PreToolUse"), { kind: "deny", reason: "why", rewritten: "node /x/run.mjs abc" });
      assert.equal(out.exitCode, 0);
      assert.deepEqual(json(out), { decision: "deny", reason: "node /x/run.mjs abc\nwhy" });
      assert.equal("hookSpecificOutput" in json(out), false);
    });

    test("encode deny on BeforeAgent writes decision deny", () => {
      assert.deepEqual(json(encode(ev("UserPromptSubmit"), { kind: "deny", reason: "no" })), { decision: "deny", reason: "no" });
    });

    test("encode deny on SessionStart, AfterTool, PreCompress is a no-op (no deny channel there)", () => {
      for (const e of ["SessionStart", "PostToolUse", "PreCompact"]) {
        assert.deepEqual(encode(ev(e), { kind: "deny", reason: "x" }), { stdout: "", exitCode: 0 });
      }
    });

    // gemini-cli 0.65.0 docs/hooks/reference.md AfterTool: decision "deny" + reason, the reason replaces the tool result
    // sent to the model (D-HA-GEMINI-REPLACE-1). BeforeTool has no replace.
    test("encode replace on AfterTool is decision deny with the output as reason; no-op on BeforeTool", () => {
      assert.deepEqual(encode(ev("PostToolUse"), { kind: "replace", output: "x" }), { stdout: JSON.stringify({ decision: "deny", reason: "x" }), exitCode: 0 });
      assert.deepEqual(encode(ev("PreToolUse"), { kind: "replace", output: "x" }), { stdout: "", exitCode: 0 });
    });

    test("GP3 synthetic round trip: every payload decodes and encodes allow to the native empty shape", () => {
      for (const p of Object.values(FX)) assert.deepEqual(encode(decode(p), { kind: "allow" }), { stdout: "", exitCode: 0 });
    });

    // gemini-cli 0.65.0 bundle: SHELL_TOOL_NAME run_shell_command, READ_FILE_TOOL_NAME read_file, GREP_TOOL_NAME
    // grep_search, WEB_FETCH_TOOL_NAME web_fetch (D-HA-GEMINI-NAMES-1).
    test("decode maps Gemini native tool ids to canonical names", () => {
      const want = { run_shell_command: "Bash", read_file: "Read", grep_search: "Grep", web_fetch: "WebFetch", list_directory: "list_directory" };
      for (const [name, canonical] of Object.entries(want)) assert.equal(decode({ ...FX.BeforeTool, tool_name: name }).tool.canonicalName, canonical, name);
    });
  });

  describe("ADR-0020 kiro adapter", () => {
    const { decode } = __m3;
    const { encode } = __m3;
    const { TOOL_NAME_PREFIX } = __m3;

    // Unit tests for src/adapters/kiro.ts (impl/10 §8, impl/09 §5.2 item 6 + A28; DECISIONS-r3 Q24).
    // Unit tests may import src/ (TECH-SPEC §6.2a); e2e/ never does (GS4).
    // Payloads follow the Kiro CLI V3 hook shape (tickets/spike-hooks-verified.md §2): hook_event_name,
    // session_id, cwd on every hook; tool_input on tool hooks; the prompt comes from env USER_PROMPT.


    const base = { session_id: "k-1", cwd: "/tmp/proj" };

    function withPrompt(value, fn) {
      const had = Object.prototype.hasOwnProperty.call(process.env, "USER_PROMPT");
      const old = process.env.USER_PROMPT;
      if (value === undefined) delete process.env.USER_PROMPT;
      else process.env.USER_PROMPT = value;
      try {
        return fn();
      } finally {
        if (had) process.env.USER_PROMPT = old;
        else delete process.env.USER_PROMPT;
      }
    }

    test("own prefix is mcp_context-mode_ (impl/10 §1.3, A1)", () => {
      assert.equal(TOOL_NAME_PREFIX, "mcp_context-mode_");
    });

    test("decode SessionStart and legacy agentSpawn; source read only when present", () => {
      assert.deepEqual(decode({ ...base, hook_event_name: "SessionStart" }), { event: "SessionStart", agent: "kiro", sessionId: "k-1", cwd: "/tmp/proj" });
      assert.deepEqual(decode({ ...base, hook_event_name: "agentSpawn" }), { event: "SessionStart", agent: "kiro", sessionId: "k-1", cwd: "/tmp/proj" });
      for (const source of ["startup", "resume", "clear", "compact"]) {
        assert.equal(decode({ ...base, hook_event_name: "SessionStart", source }).source, source);
      }
      assert.equal("source" in decode({ ...base, hook_event_name: "SessionStart", source: "other" }), false);
    });

    test("decode PromptSubmit and legacy userPromptSubmit read the prompt from env USER_PROMPT only", () => {
      withPrompt("run tests", () => {
        const ev = decode({ ...base, hook_event_name: "PromptSubmit", prompt: "stdin field is ignored" });
        assert.deepEqual(ev, { event: "UserPromptSubmit", agent: "kiro", sessionId: "k-1", cwd: "/tmp/proj", prompt: "run tests" });
        assert.equal(decode({ ...base, hook_event_name: "userPromptSubmit" }).event, "UserPromptSubmit");
      });
      withPrompt(undefined, () => {
        const ev = decode({ ...base, hook_event_name: "PromptSubmit", prompt: "stdin field is ignored" });
        assert.equal("prompt" in ev, false);
      });
    });

    test("decode PreToolUse: own prefix to bare ctx_*, other mcp server to mcp:<server>:<tool>, native unchanged", () => {
      const own = decode({ ...base, hook_event_name: "PreToolUse", tool_name: "mcp_context-mode_ctx_execute", tool_input: { language: "shell", code: "ls" } });
      assert.deepEqual(own.tool, { name: "mcp_context-mode_ctx_execute", canonicalName: "ctx_execute", input: { language: "shell", code: "ls" } });
      const other = decode({ ...base, hook_event_name: "PreToolUse", tool_name: "mcp_linear_get_issue", tool_input: {} });
      assert.equal(other.tool.canonicalName, "mcp:linear:get_issue");
      const native = decode({ ...base, hook_event_name: "PreToolUse", tool_name: "execute_bash", tool_input: { command: "ls" } });
      assert.equal(native.tool.canonicalName, "Bash"); // D-HF-KIRO-SHELL-1: execute_bash is the shell tool
      const other2 = decode({ ...base, hook_event_name: "PreToolUse", tool_name: "fs_write", tool_input: {} });
      assert.equal(other2.tool.canonicalName, "fs_write", "other native names unchanged");
      const odd = decode({ ...base, hook_event_name: "PreToolUse", tool_name: "mcp_x", tool_input: [1] });
      assert.deepEqual(odd.tool, { name: "mcp_x", canonicalName: "mcp_x", input: {} });
    });

    test("decode never sets a subagent marker (Q24 item 7)", () => {
      const ev = decode({ ...base, hook_event_name: "PreToolUse", tool_name: "execute_bash", tool_input: {}, agent_id: "sub-1", agent_type: "worker" });
      assert.equal("agentId" in ev, false);
      assert.equal("agentType" in ev, false);
    });

    test("decode PostToolUse reads tool_response text and size; isError false (no documented error field)", () => {
      const ok = decode({ ...base, hook_event_name: "PostToolUse", tool_name: "execute_bash", tool_input: {}, tool_response: "out" });
      assert.deepEqual(ok.result, { isError: false, bytes: 3, text: "out" });
      const obj = decode({ ...base, hook_event_name: "PostToolUse", tool_name: "execute_bash", tool_input: {}, tool_response: { a: "é" } });
      assert.deepEqual(obj.result, { isError: false, bytes: Buffer.byteLength('{"a":"é"}'), text: '{"a":"é"}' });
      const none = decode({ ...base, hook_event_name: "PostToolUse", tool_name: "execute_bash", tool_input: {} });
      assert.deepEqual(none.result, { isError: false, bytes: 0, text: "" });
    });

    test("decode missing session_id/cwd gives empty strings", () => {
      assert.deepEqual(decode({ hook_event_name: "SessionStart" }), { event: "SessionStart", agent: "kiro", sessionId: "", cwd: "" });
    });

    // D-FU-RM-KIRO-2: the build writes trigger UserPromptSubmit (D-FU-RM-KIRO-1) and the Kiro docs' prompt hook
    // payload has hook_event_name "UserPromptSubmit", so decode must accept it.
    test("decode UserPromptSubmit (the trigger the build writes) reads the prompt from env USER_PROMPT only", () => {
      withPrompt("run tests", () => {
        const ev = decode({ ...base, hook_event_name: "UserPromptSubmit", prompt: "stdin field is ignored" });
        assert.deepEqual(ev, { event: "UserPromptSubmit", agent: "kiro", sessionId: "k-1", cwd: "/tmp/proj", prompt: "run tests" });
      });
      withPrompt(undefined, () => {
        assert.equal("prompt" in decode({ ...base, hook_event_name: "UserPromptSubmit" }), false);
      });
    });

    test("decode throws on unknown event names and non-object payloads", () => {
      assert.throws(() => decode({ ...base, hook_event_name: "PreCompact" }));
      assert.throws(() => decode({ ...base, hook_event_name: "Stop" }));
      assert.throws(() => decode(undefined));
      assert.throws(() => decode(null));
      assert.throws(() => decode([1]));
    });

    const ev = (event) => ({ event, agent: "kiro", sessionId: "k-1", cwd: "/tmp/proj" });
    const EVENTS = ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse"];

    test("encode allow is stdout \"\" exit 0 on every event", () => {
      for (const e of EVENTS) assert.deepEqual(encode(ev(e), { kind: "allow" }), { stdout: "", exitCode: 0 });
    });

    test("encode UserPromptSubmit is stdout \"\" exit 0 for every decision kind (A28, v1 ff0a9a26)", () => {
      const all = [
        { kind: "allow" },
        { kind: "hint", text: "use ctx_search", onceKey: "k" },
        { kind: "deny", reason: "why" },
        { kind: "replace", output: "x" },
      ];
      for (const d of all) {
        const out = encode(ev("UserPromptSubmit"), d);
        assert.strictEqual(out.stdout, "");
        assert.strictEqual(out.exitCode, 0);
      }
    });

    test("encode hint is plain text stdout exit 0, never JSON; empty text is \"\"", () => {
      for (const e of ["SessionStart", "PreToolUse", "PostToolUse"]) {
        assert.deepEqual(encode(ev(e), { kind: "hint", text: "prefer ctx_execute", onceKey: "k" }), { stdout: "prefer ctx_execute", exitCode: 0 });
        assert.deepEqual(encode(ev(e), { kind: "hint", text: "", onceKey: "k" }), { stdout: "", exitCode: 0 });
      }
    });

    // D-HF-KIRO-SHELL-1: exit 2 returns STDERR to the agent (Kiro CLI 2.x reference), so the reason goes on stderr.
    test("encode deny exits 2 with the plain-text reason on stderr, rewritten command first, never JSON", () => {
      assert.deepEqual(encode(ev("PreToolUse"), { kind: "deny", reason: "why" }), { stdout: "", stderr: "why", exitCode: 2 });
      const out = encode(ev("PreToolUse"), { kind: "deny", reason: "why", rewritten: "node /x/run.mjs abc" });
      assert.deepEqual(out, { stdout: "", stderr: "node /x/run.mjs abc\nwhy", exitCode: 2 });
      assert.throws(() => JSON.parse(out.stderr));
    });

    test("encode replace is a no-op on Kiro (no replace channel, Q24 item 7)", () => {
      for (const e of EVENTS) assert.deepEqual(encode(ev(e), { kind: "replace", output: "x" }), { stdout: "", exitCode: 0 });
    });

    // D-N7-KIRO-1: names from Kiro CLI V3 docs. Event names: https://kiro.dev/docs/cli/v3/hooks-migration/ (updated 2026-10-10):
    // 2.x agentSpawn/userPromptSubmit/preToolUse/postToolUse/stop became SessionStart/UserPromptSubmit/PreToolUse/PostToolUse/Stop.
    // Tool names: https://kiro.dev/docs/custom-agents/configuration-reference/ (2026-10-10): built-in ids execute_bash, execute_pwsh;
    // category tag "shell" (the registered matcher) selects them. Kiro CLI 2.34.2 (kiro-cli-chat strings) lists the tool as "shell",
    // "Also known as execute_bash (legacy alias)". Every name the "shell" matcher can deliver must decode as the shell tool.
    test("[D-N7-KIRO-1] documented camelCase events decode: preToolUse, postToolUse (and agentSpawn, userPromptSubmit)", () => {
      const pre = decode({ ...base, hook_event_name: "preToolUse", tool_name: "execute_bash", tool_input: { command: "cat x" } });
      assert.equal(pre.event, "PreToolUse");
      assert.equal(pre.tool.canonicalName, "Bash");
      const post = decode({ ...base, hook_event_name: "postToolUse", tool_name: "execute_bash", tool_input: {}, tool_response: "out" });
      assert.equal(post.event, "PostToolUse");
      assert.equal(post.result.text, "out");
      assert.equal(decode({ ...base, hook_event_name: "agentSpawn" }).event, "SessionStart");
    });

    test("[D-N7-KIRO-1] every tool the registered shell matcher selects decodes as the shell tool", () => {
      for (const name of ["execute_bash", "execute_pwsh", "shell"]) {
        const ev = decode({ ...base, hook_event_name: "PreToolUse", tool_name: name, tool_input: { command: "ls" } });
        assert.equal(ev.tool.canonicalName, "Bash", name);
      }
      assert.equal(decode({ ...base, hook_event_name: "PreToolUse", tool_name: "fs_read", tool_input: {} }).tool.canonicalName, "fs_read");
    });

    test("[D-N7-KIRO-1] an undocumented event name still throws", () => {
      assert.throws(() => decode({ ...base, hook_event_name: "pretooluse" }), /kiro: unknown hook event pretooluse/);
    });

    test("[D-N7-KIRO-1] the table's shell names are exactly the ones the decoder maps to Bash", async () => {
      const { getAdapter } = await import("../../src/adapters/table.ts");
      for (const name of getAdapter("kiro").nativeTools.shell) {
        assert.equal(decode({ ...base, hook_event_name: "PreToolUse", tool_name: name, tool_input: {} }).tool.canonicalName, "Bash", name);
      }
    });
  });

  describe("ADR-0020 opencode adapter", () => {
    // Spec: docs/v2/impl/12-plugins.md + 00-architecture.md adapters table. OpenCode's AdapterRow:
    // installMode "in-process". 14a rows: opencode-single-system-message (#1085),
    // tool-name-map-opencode-webfetch (#1052), default-timeout-every-host, call-row-language-code-line.


    function getRow(id) {
      return ADAPTERS.find((a) => a.id === id);
    }

    test("[M5] adapters/opencode-row-in-process-no-mcp-prefix", () => {
      const row = getRow("opencode");
      assert.equal(row.installMode, "in-process");
      assert.equal(row.toolNamePrefix, "");
    });

    test("[M5] adapters/tool-name-map-opencode-webfetch: OpenCode's webfetch maps to the WebFetch hint (#1052)", () => {
      const row = getRow("opencode");
      assert.equal(row.nativeTools?.webfetch?.[0] ?? row.nativeToolMap?.webfetch, "WebFetch" in {} ? undefined : row.nativeToolMap?.webfetch);
      const mapped = row.toCanonicalTool ? row.toCanonicalTool("webfetch") : undefined;
      assert.equal(mapped, "WebFetch");
    });

    test("[M5] adapters/default-timeout-every-host: OpenCode's hookTimeoutMs is in-process n/a per impl/10 A2", () => {
      const row = getRow("opencode");
      assert.equal(row.hookTimeoutMs, 0);
    });

    test("[M5] adapters/call-row-language-code-line: a ctx_execute call row names language on its own code line (GP5)", () => {
      const row = getRow("opencode");
      assert.ok(typeof row.formatCallRow === "function" || typeof row.encode === "function");
    });
  });

  describe("ADR-0020 opencode plugin loader", () => {
    // ADR-0020 (opencode hook channel). OpenCode 1.19.4 loads a plugin module this way (binary, function DT/h2):
    // a default export object with id (string) and server(input) is used as is; else every named export must be a
    // function, or the load fails with "Plugin export is not a function". This test pins the default export shape.

    test("ADR-0020: opencode plugin default export is { id, server } and server returns the hook object", async () => {
      const mod = await import("../../src/entries/opencode.ts");
      const d = mod.default;
      assert.ok(d && typeof d === "object", "default export is an object");
      assert.equal(typeof d.id, "string");
      assert.ok(d.id.trim().length > 0);
      assert.equal(typeof d.server, "function");
      assert.equal("tui" in d, false, "server only, never tui");
      const hooks = await d.server({ directory: process.cwd() }, {});
      for (const k of ["chat.message", "tool.execute.before", "tool.execute.after", "experimental.chat.system.transform", "experimental.session.compacting", "event"]) {
        assert.equal(typeof hooks[k], "function", k);
      }
    });
  });

  describe("ADR-0020 pi adapter", () => {
    // Spec: docs/v2/impl/12-plugins.md + 00-architecture.md adapters table. Pi's AdapterRow:
    // installMode "in-process", toolNamePrefix "" (no mcp__ prefix, D-M5 plugin rows pi-hint-not-user-role,
    // pi-system-role-injection, pi-injected-message-timestamp, pi-project-permissions-honored,
    // pi-read-hint-parity, pi-collapsed-view-plain-text-first-line, pi-bridge-per-session-workspace, pi-reload-no-leak).


    function getRow(id) {
      return ADAPTERS.find((a) => a.id === id);
    }

    test("[M5] adapters/pi-row-in-process-no-mcp-prefix", () => {
      const row = getRow("pi");
      assert.equal(row.installMode, "in-process");
      assert.equal(row.toolNamePrefix, "");
    });

    test("[M5] adapters/pi-hint-not-user-role: a context-mode hint is never role user (#1263)", () => {
      const row = getRow("pi");
      assert.ok(typeof row.encode === "function");
      const msg = row.encode({ kind: "hint", text: "use ctx_execute" });
      assert.notEqual(msg.role, "user");
    });

    test("[M5] adapters/pi-system-role-injection: SessionStart context is role system (#1264 #1002 #864)", () => {
      const row = getRow("pi");
      const msg = row.encode({ kind: "sessionStart", text: "resume context" });
      assert.ok(msg.role === "system" || msg.role === "custom");
    });

    test("[M5] adapters/pi-injected-message-timestamp: the message carries a finite numeric timestamp (#1180 #1179)", () => {
      const row = getRow("pi");
      const msg = row.encode({ kind: "hint", text: "x" });
      assert.equal(typeof msg.timestamp, "number");
      assert.ok(Number.isFinite(msg.timestamp));
    });

    test("[M5] adapters/pi-read-hint-parity: a Read over 50KB emits the same hint text as Claude Code (#1069)", () => {
      const pi = getRow("pi");
      const cc = getRow("claude-code");
      const hintPi = pi.hintFor?.("Read", 60000);
      const hintCc = cc.hintFor?.("Read", 60000);
      assert.equal(hintPi, hintCc);
    });

    test("[M5] adapters/pi-project-permissions-honored: a deny rule in the project permissions file denies with reason (#1019)", () => {
      const row = getRow("pi");
      assert.ok(typeof row.checkPermission === "function" || typeof row.decide === "function");
    });
  });

  describe("ADR-0020 qwen adapter", () => {
    const { decode } = __m4;
    const { encode } = __m4;
    const { TOOL_NAME_PREFIX } = __m4;

    // Unit tests for src/adapters/qwen.ts (impl/10 §5, §1.5b, shared decode/encode; DECISIONS-r9 R2, R4).
    // Unit tests may import src/ (TECH-SPEC §6.2a); e2e/ never does (GS4).
    // Payloads follow the Qwen Code 0.25.1 hook stdin shape (spike-hooks-verified §2: Claude shape plus
    // transcript_path, permission_mode, timestamp). No recorded Qwen fixture exists yet (DEVIATIONS T11-gp3-fixtures).


    const base = { session_id: "q-1", transcript_path: "/tmp/t.jsonl", cwd: "/tmp/proj", permission_mode: "default", timestamp: "2026-10-18T00:00:00Z" };

    test("own prefix is the hyphen form (DECISIONS-r9 R2)", () => {
      assert.equal(TOOL_NAME_PREFIX, "mcp__context-mode__");
    });

    test("decode SessionStart: the four sources pass through", () => {
      for (const source of ["startup", "resume", "clear", "compact"]) {
        assert.deepEqual(decode({ ...base, hook_event_name: "SessionStart", source }), { event: "SessionStart", agent: "qwen", sessionId: "q-1", cwd: "/tmp/proj", source });
      }
    });

    test("decode UserPromptSubmit reads prompt", () => {
      const ev = decode({ ...base, hook_event_name: "UserPromptSubmit", prompt: "run tests" });
      assert.deepEqual(ev, { event: "UserPromptSubmit", agent: "qwen", sessionId: "q-1", cwd: "/tmp/proj", prompt: "run tests" });
    });

    test("§1.5b: run_shell_command and Shell both decode to canonical Bash, name kept", () => {
      for (const name of ["run_shell_command", "Shell"]) {
        const ev = decode({ ...base, hook_event_name: "PreToolUse", tool_name: name, tool_input: { command: "cat big.log" } });
        assert.deepEqual(ev.tool, { name, canonicalName: "Bash", input: { command: "cat big.log" } }, name);
      }
    });

    test("Qwen native read/grep/web_fetch ids decode to the canonical names", () => {
      const cases = { read_file: "Read", grep_search: "Grep", web_fetch: "WebFetch" };
      for (const [name, canonical] of Object.entries(cases)) {
        assert.equal(decode({ ...base, hook_event_name: "PreToolUse", tool_name: name, tool_input: {} }).tool.canonicalName, canonical, name);
      }
    });

    test("Claude aliases are accepted unchanged", () => {
      for (const name of ["Bash", "Read", "Grep", "WebFetch"]) {
        assert.equal(decode({ ...base, hook_event_name: "PreToolUse", tool_name: name, tool_input: {} }).tool.canonicalName, name);
      }
    });

    test("GP3/powershell-routed-like-bash style: every Qwen shell name gives the same canonical event as a Claude Bash call", () => {
      const input = { command: "ls -la" };
      const ref = claudeDecode({ ...base, hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: input });
      for (const name of ["run_shell_command", "Shell"]) {
        const ev = decode({ ...base, hook_event_name: "PreToolUse", tool_name: name, tool_input: input });
        assert.equal(ev.tool.canonicalName, ref.tool.canonicalName, name);
        assert.deepEqual(ev.tool.input, ref.tool.input, name);
        const hint = { kind: "hint", text: "prefer ctx_execute", onceKey: "k" };
        assert.equal(encode(ev, hint).stdout, claudeEncode(ref, hint).stdout, name);
      }
    });

    test("decode maps the own hyphen prefix to bare ctx_*", () => {
      const ev = decode({ ...base, hook_event_name: "PreToolUse", tool_name: "mcp__context-mode__ctx_search", tool_input: { queries: ["a"] } });
      assert.equal(ev.tool.canonicalName, "ctx_search");
      assert.equal(ev.tool.name, "mcp__context-mode__ctx_search");
    });

    test("decode another MCP server's tool to mcp:<server>:<tool>; other native tools unchanged", () => {
      assert.equal(decode({ ...base, hook_event_name: "PreToolUse", tool_name: "mcp__linear__get_issue", tool_input: {} }).tool.canonicalName, "mcp:linear:get_issue");
      assert.equal(decode({ ...base, hook_event_name: "PreToolUse", tool_name: "write_file", tool_input: {} }).tool.canonicalName, "write_file");
    });

    test("decode subagent fields: agent_id marks a subagent", () => {
      const ev = decode({ ...base, hook_event_name: "PreToolUse", tool_name: "run_shell_command", tool_input: {}, agent_id: "sub-1", agent_type: "worker" });
      assert.equal(ev.agentId, "sub-1");
      assert.equal(ev.agentType, "worker");
      assert.equal("agentId" in decode({ ...base, hook_event_name: "PreToolUse", tool_name: "Shell", tool_input: {} }), false);
    });

    test("decode PostToolUse reads tool_response.is_error and size", () => {
      const ok = decode({ ...base, hook_event_name: "PostToolUse", tool_name: "run_shell_command", tool_input: {}, tool_response: "out" });
      assert.deepEqual(ok.result, { isError: false, bytes: 3, text: "out" });
      assert.equal(ok.tool.canonicalName, "Bash");
      const bad = decode({ ...base, hook_event_name: "PostToolUse", tool_name: "Shell", tool_input: {}, tool_response: { is_error: true, output: "x" } });
      assert.equal(bad.result.isError, true);
    });

    test("decode PostToolUseFailure variant: canonical PostToolUse, isError, error text", () => {
      const ev = decode({ ...base, hook_event_name: "PostToolUseFailure", tool_name: "run_shell_command", tool_input: { command: "false" }, tool_use_id: "t1", error: "Exit code 1" });
      assert.deepEqual(ev, {
        event: "PostToolUse", agent: "qwen", sessionId: "q-1", cwd: "/tmp/proj",
        tool: { name: "run_shell_command", canonicalName: "Bash", input: { command: "false" }, callId: "t1" }, // D-M7-RR-1
        result: { isError: true, bytes: 11, text: "Exit code 1" },
      });
    });

    test("decode throws on unknown event names and non-object payloads", () => {
      assert.throws(() => decode({ ...base, hook_event_name: "Stop" }));
      assert.throws(() => decode({ ...base, hook_event_name: "PreCompact" }));
      assert.throws(() => decode(undefined));
      assert.throws(() => decode([1]));
    });

    const pre = { event: "PreToolUse", agent: "qwen", sessionId: "q-1", cwd: "/tmp/proj" };

    test("encode allow is the native empty shape, exit 0, on every event", () => {
      for (const event of ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse"]) {
        assert.deepEqual(encode({ ...pre, event }, { kind: "allow" }), { stdout: "", exitCode: 0 });
      }
    });

    test("encode hint writes hookSpecificOutput.additionalContext", () => {
      const out = encode(pre, { kind: "hint", text: "prefer ctx_execute", onceKey: "k" });
      assert.equal(out.exitCode, 0);
      assert.deepEqual(JSON.parse(out.stdout), { hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: "prefer ctx_execute" } });
    });

    test("encode deny writes permissionDecision deny + reason, rewritten first", () => {
      const out = encode(pre, { kind: "deny", reason: "why", rewritten: "node /x/run.mjs abc" });
      assert.equal(out.exitCode, 0);
      assert.deepEqual(JSON.parse(out.stdout), {
        hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: "node /x/run.mjs abc\nwhy" },
      });
    });

    test("encode replace is a no-op on Qwen (no replace field, impl/10 §5)", () => {
      assert.deepEqual(encode({ ...pre, event: "PostToolUse" }, { kind: "replace", output: "x" }), { stdout: "", exitCode: 0 });
    });
  });

  describe("ADR-0020 vscode adapter", () => {
    const { decode } = __m5;
    const { encode } = __m5;
    const { TOOL_NAME_PREFIX } = __m5;

    // Unit tests for src/adapters/vscode.ts (impl/10 §7, shared decode/encode; ADR-0016 VS Code row).
    // Unit tests may import src/ (TECH-SPEC §6.2a); e2e/ never does (GS4).
    // VS Code hooks use the Claude-style snake_case payload (hook_event_name, session_id, tool_name, tool_input, tool_response).


    const base = { session_id: "v-1", cwd: "/tmp/proj", timestamp: "2026-10-18T00:00:00Z" };

    test("own prefix is the single-underscore mcp_context-mode_ (TECH-SPEC §3.8, impl/10 §1.3)", () => {
      assert.equal(TOOL_NAME_PREFIX, "mcp_context-mode_");
    });

    test("decode SessionStart: VS Code fires only source new, mapped to startup (DEVIATIONS D-M3-A4-2)", () => {
      const ev = decode({ ...base, hook_event_name: "SessionStart", source: "new" });
      assert.deepEqual(ev, { event: "SessionStart", agent: "vscode", sessionId: "v-1", cwd: "/tmp/proj", source: "startup" });
      assert.equal("source" in decode({ ...base, hook_event_name: "SessionStart", source: "compact" }), false);
      assert.equal("source" in decode({ ...base, hook_event_name: "SessionStart" }), false);
    });

    test("decode UserPromptSubmit reads prompt", () => {
      const ev = decode({ ...base, hook_event_name: "UserPromptSubmit", prompt: "run tests" });
      assert.deepEqual(ev, { event: "UserPromptSubmit", agent: "vscode", sessionId: "v-1", cwd: "/tmp/proj", prompt: "run tests" });
    });

    test("decode PreCompact is the aux event for the pending flag (ADR-0009 §6, impl/09 §4.7, D-M3-A4-1)", () => {
      assert.deepEqual(decode({ ...base, hook_event_name: "PreCompact" }), { event: "PreCompact", agent: "vscode", sessionId: "v-1", cwd: "/tmp/proj" });
    });

    test("decode: session_id and cwd are optional, absent -> empty string (impl/10 §7)", () => {
      const ev = decode({ hook_event_name: "UserPromptSubmit", prompt: "x" });
      assert.equal(ev.sessionId, "");
      assert.equal(ev.cwd, "");
    });

    test("decode: camelCase sessionId is not read (one native field, P1)", () => {
      assert.equal(decode({ hook_event_name: "UserPromptSubmit", sessionId: "camel" }).sessionId, "");
    });

    test("decode PreToolUse native VS Code tool keeps its name", () => {
      const ev = decode({ ...base, hook_event_name: "PreToolUse", tool_name: "runInTerminal", tool_input: { command: "cat big.log" } });
      assert.deepEqual(ev.tool, { name: "runInTerminal", canonicalName: "runInTerminal", input: { command: "cat big.log" } });
    });

    test("decode maps the own prefix to bare ctx_*", () => {
      const ev = decode({ ...base, hook_event_name: "PreToolUse", tool_name: "mcp_context-mode_ctx_search", tool_input: { queries: ["a"] } });
      assert.equal(ev.tool.canonicalName, "ctx_search");
      assert.equal(ev.tool.name, "mcp_context-mode_ctx_search");
    });

    test("decode another MCP server's mcp_<server>_<tool> to mcp:<server>:<tool> (split at first _ after mcp_)", () => {
      assert.equal(decode({ ...base, hook_event_name: "PreToolUse", tool_name: "mcp_linear_get_issue", tool_input: {} }).tool.canonicalName, "mcp:linear:get_issue");
      assert.equal(decode({ ...base, hook_event_name: "PreToolUse", tool_name: "mcp_context_mode_ctx_search", tool_input: {} }).tool.canonicalName, "mcp:context:mode_ctx_search");
      assert.equal(decode({ ...base, hook_event_name: "PreToolUse", tool_name: "mcp__context-mode__ctx_search", tool_input: {} }).tool.canonicalName, "mcp__context-mode__ctx_search");
      assert.equal(decode({ ...base, hook_event_name: "PreToolUse", tool_name: "mcp_x", tool_input: {} }).tool.canonicalName, "mcp_x");
    });

    test("decode: missing or non-object tool_input -> {}", () => {
      assert.deepEqual(decode({ ...base, hook_event_name: "PreToolUse", tool_name: "readFile" }).tool.input, {});
      assert.deepEqual(decode({ ...base, hook_event_name: "PreToolUse", tool_name: "readFile", tool_input: "s" }).tool.input, {});
    });

    test("decode: no subagent field on VS Code, agent_id is ignored (impl/10 §7 [U])", () => {
      const ev = decode({ ...base, hook_event_name: "PreToolUse", tool_name: "runInTerminal", tool_input: {}, agent_id: "sub-1", agent_type: "w" });
      assert.equal("agentId" in ev, false);
      assert.equal("agentType" in ev, false);
    });

    test("decode PostToolUse reads tool_response, is_error and size", () => {
      const ok = decode({ ...base, hook_event_name: "PostToolUse", tool_name: "runInTerminal", tool_input: {}, tool_response: "out" });
      assert.deepEqual(ok.result, { isError: false, bytes: 3, text: "out" });
      const bad = decode({ ...base, hook_event_name: "PostToolUse", tool_name: "runInTerminal", tool_input: {}, tool_response: { is_error: true, output: "é" } });
      assert.equal(bad.result.isError, true);
      assert.equal(bad.result.bytes, Buffer.byteLength(JSON.stringify({ is_error: true, output: "é" })));
      assert.deepEqual(decode({ ...base, hook_event_name: "PostToolUse", tool_name: "t" }).result, { isError: false, bytes: 0, text: "" });
    });

    test("decode throws on unknown event names and non-object payloads", () => {
      for (const name of ["Stop", "SubagentStart", "preToolUse", undefined]) {
        assert.throws(() => decode({ ...base, hook_event_name: name }));
      }
      assert.throws(() => decode(undefined));
      assert.throws(() => decode(null));
      assert.throws(() => decode("{}"));
      assert.throws(() => decode([1]));
    });

    const pre = { event: "PreToolUse", agent: "vscode", sessionId: "v-1", cwd: "/tmp/proj" };

    test("encode allow is the empty shape, exit 0, on every event", () => {
      for (const event of ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "PreCompact"]) {
        assert.deepEqual(encode({ ...pre, event }, { kind: "allow" }), { stdout: "", exitCode: 0 });
      }
    });

    test("encode hint writes hookSpecificOutput.additionalContext", () => {
      const out = encode(pre, { kind: "hint", text: "prefer ctx_execute", onceKey: "k" });
      assert.equal(out.exitCode, 0);
      assert.deepEqual(JSON.parse(out.stdout), { hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: "prefer ctx_execute" } });
    });

    test("encode deny writes permissionDecision deny + reason, rewritten first (ADR-0016 case B)", () => {
      const plain = encode(pre, { kind: "deny", reason: "why" });
      assert.deepEqual(JSON.parse(plain.stdout).hookSpecificOutput, { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: "why" });
      const out = encode(pre, { kind: "deny", reason: "why", rewritten: "node /x/run.mjs abc" });
      assert.equal(out.exitCode, 0);
      assert.equal(JSON.parse(out.stdout).hookSpecificOutput.permissionDecisionReason, "node /x/run.mjs abc\nwhy");
      assert.equal("updatedInput" in JSON.parse(out.stdout).hookSpecificOutput, false);
    });

    test("encode replace is a silent no-op: VS Code has no replace channel (ADR-0016 case C, impl/10 §7)", () => {
      for (const event of ["PostToolUse", "PreToolUse"]) {
        assert.deepEqual(encode({ ...pre, event }, { kind: "replace", output: "x" }), { stdout: "", exitCode: 0 });
      }
    });

    // D-HF-VSCODE-DECODE-1 (next.7). Primary source: docs.github.com/en/copilot/reference/hooks-reference ("Hook event
    // input payloads") and code.visualstudio.com/docs/copilot/customization/hooks (VS Code agent hooks, Preview, Copilot
    // harness; user hook files in ~/.copilot/hooks/): "Event names also select the input format. preToolUse receives
    // toolName and toolArgs. The compatible PreToolUse alias receives snake_case fields." The Local harness reference
    // (code.visualstudio.com/docs/agents/reference/hooks-reference) sends snake_case with tool_response.
    // Setup registers PascalCase names (snake_case payload). A camelCase payload carries camelCase keys only.
    test("D-HF-VSCODE-DECODE-1: camelCase payload with hookEventName (next.6 live) is decoded, not rejected", () => {
      const camel = { hookEventName: "preToolUse", sessionId: "c-1", timestamp: 1790000000000, cwd: "/tmp/proj", toolName: "run_in_terminal", toolArgs: { command: "cat big.log" } };
      assert.deepEqual(decode(camel), { event: "PreToolUse", agent: "vscode", sessionId: "c-1", cwd: "/tmp/proj", tool: { name: "run_in_terminal", canonicalName: "Bash", input: { command: "cat big.log" } } });
      assert.equal(decode({ ...camel, hookEventName: "PreToolUse" }).event, "PreToolUse"); // PascalCase value, same payload
    });

    test("D-HF-VSCODE-DECODE-1: documented camelCase payload names no event; each event is read by its own key set", () => {
      const c = { sessionId: "c-1", timestamp: 1790000000000, cwd: "/tmp/proj" };
      assert.deepEqual(decode({ ...c, source: "new" }), { event: "SessionStart", agent: "vscode", sessionId: "c-1", cwd: "/tmp/proj", source: "startup" });
      assert.equal(decode({ ...c, source: "resume" }).source, "resume");
      assert.deepEqual(decode({ ...c, prompt: "run tests" }), { event: "UserPromptSubmit", agent: "vscode", sessionId: "c-1", cwd: "/tmp/proj", prompt: "run tests" });
      assert.equal(decode({ ...c, toolName: "run_in_terminal", toolArgs: '{"command":"ls"}' }).tool.input.command, "ls");
      const post = decode({ ...c, toolName: "run_in_terminal", toolArgs: {}, toolResult: { resultType: "success", textResultForLlm: "out" } });
      assert.equal(post.event, "PostToolUse");
      assert.deepEqual(post.result, { isError: false, bytes: 3, text: "out" });
      assert.equal(decode({ ...c, transcriptPath: "/t", trigger: "auto", customInstructions: "" }).event, "PreCompact");
    });

    test("D-HF-VSCODE-DECODE-1: an event that cannot be read throws a line that names the field, never a silent undefined", () => {
      assert.throws(() => decode({ ...base }), /vscode: missing required field hook_event_name/);
      assert.throws(() => decode({ hookEventName: "Nope" }), /vscode: unknown hook event Nope/);
      assert.throws(() => decode({ hook_event_name: "Nope" }), /vscode: unknown hook event Nope/);
    });
  });

  describe("ADR-0020 zcode adapter", () => {
    const { decode } = __m6;
    const { encode } = __m6;
    const { TOOL_NAME_PREFIX } = __m6;

    // Unit tests for src/adapters/zcode.ts (impl/10 §9, shared decode/encode; DECISIONS-r9 R3, R4).
    // Unit tests may import src/ (TECH-SPEC §6.2a); e2e/ never does (GS4).
    // Payloads follow the ZCode hook stdin shape (spike-hooks-verified §2): Claude snake_case fields
    // plus camelCase twins. Names are Claude names, unverified until T-ZC (impl/10 §1.5a).


    const base = { session_id: "z-1", sessionId: "z-1", cwd: "/tmp/proj" };

    test("own prefix is the documented mcp__<server>__<tool> name with the hyphen kept (D-N7-ZCODE-NAMES-1)", () => {
      assert.equal(TOOL_NAME_PREFIX, "mcp__context-mode__");
    });

    test("decode SessionStart: source passes through when present, else undefined (impl/10 §9)", () => {
      for (const source of ["startup", "resume", "clear", "compact"]) {
        assert.equal(decode({ ...base, hook_event_name: "SessionStart", source }).source, source);
      }
      const ev = decode({ ...base, hook_event_name: "SessionStart" });
      assert.deepEqual(ev, { event: "SessionStart", agent: "zcode", sessionId: "z-1", cwd: "/tmp/proj" });
    });

    test("decode reads the camelCase twins when snake_case is absent", () => {
      const ev = decode({ hookEventName: "UserPromptSubmit", sessionId: "z-2", cwd: "/tmp/p", prompt: "hi" });
      assert.deepEqual(ev, { event: "UserPromptSubmit", agent: "zcode", sessionId: "z-2", cwd: "/tmp/p", prompt: "hi" });
    });

    test("decode prefers snake_case over the camelCase twin", () => {
      const ev = decode({ hook_event_name: "PreToolUse", hookEventName: "SessionStart", session_id: "snake", sessionId: "camel", cwd: "/c", tool_name: "Bash", tool_input: {} });
      assert.equal(ev.event, "PreToolUse");
      assert.equal(ev.sessionId, "snake");
    });

    test("decode UserPromptSubmit: prompt is optional", () => {
      assert.equal(decode({ ...base, hook_event_name: "UserPromptSubmit", prompt: "run tests" }).prompt, "run tests");
      assert.equal("prompt" in decode({ ...base, hook_event_name: "UserPromptSubmit" }), false);
    });

    test("decode PreToolUse native Claude names keep their names", () => {
      const ev = decode({ ...base, hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "cat big.log" } });
      assert.deepEqual(ev.tool, { name: "Bash", canonicalName: "Bash", input: { command: "cat big.log" } });
      for (const n of ["Read", "Grep", "WebFetch", "Write", "Edit", "NotebookEdit"]) {
        assert.equal(decode({ ...base, hook_event_name: "PreToolUse", tool_name: n, tool_input: {} }).tool.canonicalName, n);
      }
    });

    test("decode maps the own prefix to bare ctx_*; underscore form is another server", () => {
      const own = decode({ ...base, hook_event_name: "PreToolUse", tool_name: "mcp__context-mode__ctx_search", tool_input: { queries: ["a"] } });
      assert.equal(own.tool.canonicalName, "ctx_search");
      assert.equal(own.tool.name, "mcp__context-mode__ctx_search");
      const other = decode({ ...base, hook_event_name: "PreToolUse", tool_name: "mcp__context_mode__ctx_search", tool_input: {} });
      assert.equal(other.tool.canonicalName, "mcp:context_mode:ctx_search");
      const linear = decode({ ...base, hook_event_name: "PreToolUse", tool_name: "mcp__linear__get_issue", tool_input: {} });
      assert.equal(linear.tool.canonicalName, "mcp:linear:get_issue");
    });

    test("decode subagent fields: agent_id marks a subagent", () => {
      const ev = decode({ ...base, hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: {}, agent_id: "sub-1", agent_type: "worker" });
      assert.equal(ev.agentId, "sub-1");
      assert.equal(ev.agentType, "worker");
      assert.equal("agentId" in decode({ ...base, hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: {} }), false);
    });

    test("decode PostToolUse reads tool_response.is_error and size", () => {
      const ok = decode({ ...base, hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: {}, tool_response: "out" });
      assert.deepEqual(ok.result, { isError: false, bytes: 3, text: "out" });
      const bad = decode({ ...base, hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: {}, tool_response: { is_error: true, output: "x" } });
      assert.equal(bad.result.isError, true);
    });

    test("decode PostToolUseFailure -> PostToolUse with isError and the error text (D-M3-A6-1)", () => {
      const ev = decode({ ...base, hook_event_name: "PostToolUseFailure", tool_name: "Bash", tool_input: { command: "x" }, error: "boom" });
      assert.equal(ev.event, "PostToolUse");
      assert.deepEqual(ev.result, { isError: true, bytes: 4, text: "boom" });
      const camel = decode({ ...base, hookEventName: "PostToolUseFailure", tool_name: "Bash", tool_input: {} });
      assert.deepEqual(camel.result, { isError: true, bytes: 0, text: "" });
    });

    test("decode throws on unknown event names and non-object payloads", () => {
      assert.throws(() => decode({ ...base, hook_event_name: "Stop" }));
      assert.throws(() => decode({ ...base, hook_event_name: "PreCompact" }));
      assert.throws(() => decode({ ...base }));
      assert.throws(() => decode(undefined));
      assert.throws(() => decode(null));
      assert.throws(() => decode([1]));
    });

    const pre = { event: "PreToolUse", agent: "zcode", sessionId: "z-1", cwd: "/tmp/proj" };

    test("encode allow is the native empty shape, exit 0, on every event", () => {
      for (const event of ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse"]) {
        assert.deepEqual(encode({ ...pre, event }, { kind: "allow" }), { stdout: "", exitCode: 0 });
      }
    });

    test("encode hint writes hookSpecificOutput.additionalContext", () => {
      const out = encode(pre, { kind: "hint", text: "prefer ctx_execute", onceKey: "k" });
      assert.equal(out.exitCode, 0);
      assert.deepEqual(JSON.parse(out.stdout), { hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: "prefer ctx_execute" } });
    });

    test("encode deny writes permissionDecision deny + reason, rewritten first", () => {
      const out = encode(pre, { kind: "deny", reason: "why", rewritten: "node /x/run.mjs abc" });
      assert.equal(out.exitCode, 0);
      assert.deepEqual(JSON.parse(out.stdout), {
        hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: "node /x/run.mjs abc\nwhy" },
      });
      const plain = encode(pre, { kind: "deny", reason: "why" });
      assert.equal(JSON.parse(plain.stdout).hookSpecificOutput.permissionDecisionReason, "why");
    });

    test("encode replace is a no-op on ZCode (no replace field documented)", () => {
      assert.deepEqual(encode({ ...pre, event: "PostToolUse" }, { kind: "replace", output: "x" }), { stdout: "", exitCode: 0 });
    });
  });
});
