// impl/10 §1.1-§1.5: one AdapterRow per agent, PRD §3 order. Row data only; build/manifests.ts renders the
// hook configs from it (impl/13 §3). pi and opencode are in-process adapters (impl/10 §10, §11); their rows
// also carry the in-process helpers the plugin entries call (DEVIATIONS D-M5-A1-1).
import type { AgentId } from "../core/contracts/agents.ts";
import { HOOK_TIMEOUT_MS, IN_PROCESS_TIMEOUT_MS } from "../core/contracts/constants.ts";
import type { AdapterRow, HookOutput } from "../core/contracts/types.ts";
import * as claudeCode from "./claude-code.ts";
import * as codex from "./codex.ts";
import * as gemini from "./gemini.ts";
import * as qwen from "./qwen.ts";
import * as copilotCli from "./copilot-cli.ts";
import * as vscode from "./vscode.ts";
import * as kiro from "./kiro.ts";
import * as zcode from "./zcode.ts";
import * as pi from "./pi.ts";
import * as opencode from "./opencode.ts";

const CLAUDE_EVENTS = { SessionStart: "SessionStart", UserPromptSubmit: "UserPromptSubmit", PreToolUse: "PreToolUse", PostToolUse: "PostToolUse" };
const CLAUDE_TOOLS = { shell: ["Bash"], read: ["Read"], grep: ["Grep"], webfetch: ["WebFetch"], edit: ["Write", "Edit", "NotebookEdit"] };

// In-process rows add one helper each for their plugin entry (DEVIATIONS D-M5-A1-1): Pi turns an encoded deny into
// its tool_call {block, reason} return; OpenCode maps a native tool name to the canonical name decide() uses.
type Row = AdapterRow & {
  checkPermission?: (out: HookOutput) => { block: true; reason: string } | undefined;
  toCanonicalTool?: (name: string) => string;
};

export const ADAPTERS: readonly AdapterRow[] = Object.freeze([
  {
    id: "claude-code", installMode: "marketplace", projectSource: "env:CLAUDE_PROJECT_DIR", toolNamePrefix: claudeCode.TOOL_NAME_PREFIX,
    nativeTools: CLAUDE_TOOLS, execReadOnlyHint: false, eventMap: CLAUDE_EVENTS,
    compactDelivery: "sessionstart", compactSummary: "none", hookTimeoutMs: HOOK_TIMEOUT_MS, denyChannel: "deny-reason",
    hookChannel: { kind: "package", path: "hooks/claude-code.json" }, skillChannel: { kind: "package", path: "claude-code/skills" }, // ADR-0020, D-HQ-SKILLS-2
    decode: claudeCode.decode, encode: claudeCode.encode,
  },
  {
    id: "codex", installMode: "config-mcp", projectSource: "arg:--agent+cwd", toolNamePrefix: codex.TOOL_NAME_PREFIX,
    nativeTools: { shell: ["Bash"], edit: ["apply_patch"] }, execReadOnlyHint: true, eventMap: CLAUDE_EVENTS,
    compactDelivery: "sessionstart", compactSummary: "none", hookTimeoutMs: HOOK_TIMEOUT_MS, denyChannel: "deny-reason",
    hookChannel: { kind: "home-file", path: ".codex/hooks.json" }, skillChannel: { kind: "home-dir", path: ".codex/skills" }, // ADR-0020
    decode: codex.decode, encode: codex.encode,
  },
  {
    id: "gemini", installMode: "extension", projectSource: "spawn-cwd", toolNamePrefix: gemini.TOOL_NAME_PREFIX,
    // D-HA-GEMINI-NAMES-1: gemini-cli 0.65.0 *_TOOL_NAME constants.
    nativeTools: { shell: ["run_shell_command"], read: ["read_file"], grep: ["grep_search"], webfetch: ["web_fetch"] }, execReadOnlyHint: false,
    // D-FU-GCH-1: no SessionStart. Claude Code also loads hooks/hooks.json (Gemini's file) and would run a SessionStart
    // entry through /bin/sh, which fails on ${extensionPath}. Gemini's SessionStart only sent the resume hint (compact never
    // arrives there), and GP6 forbids that hint on BeforeAgent, so Gemini goes without it.
    eventMap: { UserPromptSubmit: "BeforeAgent", PreToolUse: "BeforeTool", PostToolUse: "AfterTool", PreCompact: "PreCompress" },
    compactDelivery: "pending-flag", compactSummary: "none", hookTimeoutMs: HOOK_TIMEOUT_MS, denyChannel: "deny-reason",
    hookChannel: { kind: "package", path: "hooks/hooks.json" }, skillChannel: { kind: "package", path: "skills" }, // ADR-0020
    decode: gemini.decode, encode: gemini.encode,
  },
  {
    id: "qwen", installMode: "extension", projectSource: "spawn-cwd", toolNamePrefix: qwen.TOOL_NAME_PREFIX,
    nativeTools: { shell: ["run_shell_command", "Shell"], read: ["read_file"], grep: ["grep_search"], webfetch: ["web_fetch"] }, execReadOnlyHint: false,
    eventMap: CLAUDE_EVENTS,
    compactDelivery: "sessionstart", compactSummary: "none", hookTimeoutMs: HOOK_TIMEOUT_MS, denyChannel: "deny-reason",
    hookChannel: { kind: "package", path: "hooks/qwen.json" }, skillChannel: { kind: "package", path: "skills" }, // ADR-0020, D-HQ-SKILLS-3: qwen loads <extension>/skills, shared with gemini
    decode: qwen.decode, encode: qwen.encode,
  },
  {
    id: "copilot-cli", installMode: "plugin", projectSource: "arg:--agent+cwd", toolNamePrefix: copilotCli.TOOL_NAME_PREFIX,
    nativeTools: { shell: [...copilotCli.SHELL_TOOL_NAMES] }, execReadOnlyHint: false, // D-PWSH-DUMP-1
    eventMap: { SessionStart: "sessionStart", UserPromptSubmit: "userPromptSubmitted", PreToolUse: "preToolUse", PostToolUse: "postToolUse" },
    compactDelivery: "pending-flag", compactSummary: "none", hookTimeoutMs: HOOK_TIMEOUT_MS, denyChannel: "deny-reason",
    hookChannel: { kind: "home-file", path: ".copilot/hooks/context-mode.json" }, skillChannel: { kind: "home-dir", path: ".copilot/skills" }, // ADR-0020
    decode: copilotCli.decode, encode: copilotCli.encode,
  },
  {
    id: "vscode", installMode: "mcp-entry", projectSource: "arg:workspaceFolder", toolNamePrefix: vscode.TOOL_NAME_PREFIX,
    // PreCompact sets the pending flag (ADR-0009 §6, DEVIATIONS D-M3-A4-1).
    nativeTools: { shell: [...vscode.SHELL_TOOL_NAMES], read: [...vscode.READ_TOOL_NAMES], webfetch: [...vscode.WEBFETCH_TOOL_NAMES] }, // D-HF-VSCODE-PROJECT-1, D-N7-VSCODE-TOOLS-1
    execReadOnlyHint: false, eventMap: { ...CLAUDE_EVENTS, PreCompact: "PreCompact" },
    compactDelivery: "pending-flag", compactSummary: "none", hookTimeoutMs: HOOK_TIMEOUT_MS, denyChannel: "deny-reason",
    hookChannel: { kind: "home-file", path: ".copilot/hooks/context-mode-vscode.json" }, skillChannel: { kind: "home-dir", path: ".agents/skills" }, // ADR-0020, D-HQ-COPILOT-NAMES-3: Copilot CLI owns ~/.copilot/skills
    decode: vscode.decode, encode: vscode.encode,
  },
  {
    id: "kiro", installMode: "mcp-entry", projectSource: "arg:--agent+cwd", toolNamePrefix: kiro.TOOL_NAME_PREFIX,
    nativeTools: { shell: [...kiro.SHELL_TOOL_NAMES] }, execReadOnlyHint: false, // D-HF-KIRO-SHELL-1, D-N7-KIRO-1
    eventMap: { SessionStart: "SessionStart", UserPromptSubmit: "UserPromptSubmit", PreToolUse: "PreToolUse", PostToolUse: "PostToolUse" },
    compactDelivery: "none", compactSummary: "none", hookTimeoutMs: HOOK_TIMEOUT_MS, denyChannel: "hint-only",
    hookChannel: { kind: "home-file", path: ".kiro/hooks/context-mode.json" }, skillChannel: { kind: "home-dir", path: ".kiro/skills" }, // ADR-0020
    decode: kiro.decode, encode: kiro.encode,
  },
  {
    // toolNamePrefix is the documented ZCode name mcp__<server>__<tool> (D-N7-ZCODE-NAMES-1); nativeTools are Claude names.
    id: "zcode", installMode: "hooks+mcp", projectSource: "spawn-cwd", toolNamePrefix: zcode.TOOL_NAME_PREFIX,
    nativeTools: CLAUDE_TOOLS, execReadOnlyHint: false, eventMap: CLAUDE_EVENTS,
    compactDelivery: "sessionstart", compactSummary: "none", hookTimeoutMs: HOOK_TIMEOUT_MS, denyChannel: "deny-reason",
    hookChannel: { kind: "home-file", path: ".zcode/cli/config.json" }, skillChannel: { kind: "home-dir", path: ".zcode/skills" }, // ADR-0020
    decode: zcode.decode, encode: zcode.encode,
  },
  {
    id: "pi", installMode: "in-process", projectSource: "pi:ctx.cwd", toolNamePrefix: pi.TOOL_NAME_PREFIX,
    nativeTools: { shell: ["bash"], read: ["read"] }, execReadOnlyHint: false,
    eventMap: { SessionStart: "session_start", UserPromptSubmit: "input", PreToolUse: "tool_call", PostToolUse: "tool_result" },
    compactDelivery: "pi-flag", compactSummary: "none", hookTimeoutMs: IN_PROCESS_TIMEOUT_MS, denyChannel: "deny-reason",
    hookChannel: { kind: "in-process", path: "pi/index.js" }, skillChannel: { kind: "package", path: "pi/skills" }, // ADR-0020
    decode: pi.decode, encode: pi.encode, checkPermission: pi.checkPermission,
  },
  {
    id: "opencode", installMode: "in-process", projectSource: "spawn-cwd", toolNamePrefix: opencode.TOOL_NAME_PREFIX,
    nativeTools: { shell: [opencode.SHELL_TOOL_NAME] }, execReadOnlyHint: false, // D-HF-OPENCODE-SHELL-1
    // Usage: step-finish cost row (DEVIATIONS D-M5-arch-2).
    eventMap: { SessionStart: "context", UserPromptSubmit: "prompt", PreToolUse: "execute.before", PostToolUse: "execute.after", PreCompact: "compaction", Usage: "step-finish" },
    compactDelivery: "opencode-cache", compactSummary: "none", hookTimeoutMs: IN_PROCESS_TIMEOUT_MS, denyChannel: "deny-reason",
    hookChannel: { kind: "in-process", path: "opencode/plugin.js" }, skillChannel: { kind: "home-dir", path: ".config/opencode/skills" }, // ADR-0020
    decode: opencode.decode, encode: opencode.encode, toCanonicalTool: opencode.toCanonicalTool,
  },
] satisfies Row[]);

const BY_ID = new Map<AgentId, AdapterRow>(ADAPTERS.map((r) => [r.id, r]));

// D-M7-RR-1 (DECISIONS-r10): rows whose encode writes a PostToolUse replace (claude-code updatedToolOutput,
// pi tool_result rewrite). On these rows the main agent gets "run, then replace" and no Bash size-guess deny;
// every other row keeps its one path (ADR-0001).
// gemini: AfterTool decision deny + reason replaces the result (D-HA-GEMINI-REPLACE-1).
const REPLACE_ROWS: ReadonlySet<AgentId> = new Set<AgentId>(["claude-code", "gemini", "copilot-cli", "pi"]);

export function hasReplace(row: AdapterRow): boolean {
  return REPLACE_ROWS.has(row.id);
}

// D-HA-GEMINI-DUMP-1: rows where a one-file shell dump over the cap runs and PostToolUse replaces it (D-M7-RR-1).
// gemini is out: its BeforeTool deny stops the tool before it runs (gemini-cli docs/hooks/reference.md BeforeTool),
// so a large `cat` is denied with the Read redirect, as on every other deny host.
const DUMP_REPLACE_ROWS: ReadonlySet<AgentId> = new Set<AgentId>(["claude-code", "copilot-cli", "pi"]);

export function dumpRunsThenReplaces(row: AdapterRow): boolean {
  return DUMP_REPLACE_ROWS.has(row.id) && hasReplace(row);
}

// DECISIONS-r11 (B): rows whose encode carries a UserPromptSubmit hint as additionalContext. Only these rows
// get turn-boundary recall after a compaction; kiro, pi and opencode keep their one compact path (ADR-0001).
const RECALL_ROWS: ReadonlySet<AgentId> = new Set<AgentId>(["claude-code", "codex", "gemini", "qwen", "copilot-cli", "vscode", "zcode"]);

export function hasRecall(row: AdapterRow): boolean {
  return RECALL_ROWS.has(row.id);
}

// impl/10 §1.2: AGENT_IDS (contracts) is exhaustive, every AgentId has exactly one row.
export function getAdapter(id: AgentId): AdapterRow {
  return BY_ID.get(id) as AdapterRow;
}
