// Unit tests for src/adapters/table.ts, src/adapters/claude-code.ts and the M0 hook entry
// src/entries/hook.ts (impl/10 §1.2-§1.5, §2, shared decode/encode; impl/09 §5.2; DEVIATIONS D-M0-7).
// Unit tests may import src/ (TECH-SPEC §6.2a); e2e/ never does (GS4).
// Payloads below follow the Claude Code hook stdin shape (impl/10 §2 field table).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { AGENT_IDS } from "../../../src/core/contracts/agents.ts";
import { HOOK_TIMEOUT_MS } from "../../../src/core/contracts/constants.ts";
import { ADAPTERS, getAdapter } from "../../../src/adapters/table.ts";
import { decode, encode } from "../../../src/adapters/claude-code.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
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
  assert.deepEqual(getAdapter("copilot-cli").nativeTools, { shell: ["bash"] }); // D-HA-COPILOT-NAMES-1
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
  const codex = await import("../../../src/adapters/codex.ts");
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
  const { decode } = await import("../../../src/adapters/claude-code.ts");
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
