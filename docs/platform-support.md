# Platform Support Matrix

This document provides a comprehensive comparison of all platforms supported by context-mode, including their hook paradigms, capabilities, configuration, and known limitations.

## Overview

context-mode supports six platforms across three hook paradigms:

| Paradigm | Platforms |
|----------|-----------|
| **JSON stdin/stdout** | Claude Code, Gemini CLI, VS Code Copilot, Cursor |
| **TS Plugin** | OpenCode |
| **MCP-only** | Codex CLI |

The MCP server layer is 100% portable and needs no adapter. Only the hook layer requires platform-specific adapters.

## Prerequisites

All platforms (except Claude Code plugin install) require a global install:

```bash
npm install -g context-mode
```

This puts the `context-mode` binary in PATH, which is required for:
- **MCP server:** `"command": "context-mode"` (replaces ephemeral `npx -y context-mode`)
- **Hook dispatcher:** `context-mode hook <platform> <event>` (replaces `node ./node_modules/...` paths)
- **Utility commands:** `context-mode doctor`, `context-mode upgrade`
- **Persistent upgrades:** `ctx-upgrade` updates the global binary in-place

---

## Main Comparison Table

| Feature | Claude Code | Gemini CLI | VS Code Copilot | Cursor | OpenCode | Codex CLI |
|---------|-------------|------------|-----------------|--------|----------|-----------|
| **Paradigm** | json-stdio | json-stdio | json-stdio | json-stdio | ts-plugin | mcp-only |
| **PreToolUse equivalent** | `PreToolUse` | `BeforeTool` | `PreToolUse` | `preToolUse` | `tool.execute.before` | -- |
| **PostToolUse equivalent** | `PostToolUse` | `AfterTool` | `PostToolUse` | `postToolUse` | `tool.execute.after` | -- |
| **PreCompact equivalent** | `PreCompact` | `PreCompress` | `PreCompact` | -- | `experimental.session.compacting` | -- |
| **SessionStart** | `SessionStart` | `SessionStart` | `SessionStart` | `sessionStart` | -- | -- |
| **Can modify args** | Yes | Yes | Yes | Yes | Yes | -- |
| **Can modify output** | Yes | Yes | Yes | No | Yes (caveat) | -- |
| **Can inject session context** | Yes | Yes | Yes | Yes | -- | -- |
| **Can block tools** | Yes | Yes | Yes | Yes | Yes (throw) | -- |
| **Config location** | `~/.claude/settings.json` | `~/.gemini/settings.json` | `.github/hooks/*.json` | `.cursor/hooks.json` or `~/.cursor/hooks.json` | `opencode.json` | `~/.codex/config.toml` |
| **Session ID field** | `session_id` | `session_id` | `sessionId` (camelCase) | `conversation_id` | `sessionID` (camelCase) | N/A |
| **Project dir env** | `CLAUDE_PROJECT_DIR` | `GEMINI_PROJECT_DIR` | `CLAUDE_PROJECT_DIR` | `CURSOR_CWD` | `ctx.directory` (plugin init) | N/A |
| **MCP tool naming** | `mcp__server__tool` | `mcp__server__tool` | `f1e_` prefix | `MCP:<tool>` in hook payloads | `mcp__server__tool` | `mcp__server__tool` |
| **Hook command format** | `context-mode hook claude-code <event>` | `context-mode hook gemini-cli <event>` | `context-mode hook vscode-copilot <event>` | `context-mode hook cursor <event>` | TS plugin (no command) | N/A |
| **Hook registration** | settings.json hooks object | settings.json hooks object | `.github/hooks/*.json` | `hooks.json` native hook arrays | opencode.json plugin array | N/A |
| **MCP server command** | `context-mode` (or plugin auto) | `context-mode` | `context-mode` | `context-mode` | `context-mode` | `context-mode` |
| **Plugin distribution** | Claude plugin registry | npm global | npm global | npm global | npm global | npm global |
| **Session dir** | `~/.claude/context-mode/sessions/` | `~/.gemini/context-mode/sessions/` | `.github/context-mode/sessions/` or `~/.vscode/context-mode/sessions/` | `~/.cursor/context-mode/sessions/` | `~/.config/opencode/context-mode/sessions/` | `~/.codex/context-mode/sessions/` |

### Legend

- Yes = Fully supported
- -- = Not supported
- (caveat) = Supported with known issues

---

## Platform Details

### Claude Code

**Status:** Fully supported (primary platform)

**Hook Paradigm:** JSON stdin/stdout

Claude Code is the primary platform for context-mode. All hooks communicate via JSON on stdin/stdout. The adapter reads raw JSON input, normalizes it into platform-agnostic events, and formats responses back into Claude Code's expected output format.

**Hook Names:**
- `PreToolUse` -- fires before a tool is executed
- `PostToolUse` -- fires after a tool completes
- `PreCompact` -- fires before context compaction
- `SessionStart` -- fires when a session starts, resumes, or compacts
- `UserPromptSubmit` -- fires when user submits a prompt

**Blocking:** `permissionDecision: "deny"` in response JSON

**Arg Modification:** `updatedInput` field at top level of response

**Output Modification:** `updatedMCPToolOutput` for MCP tools, `additionalContext` for appending

**Session ID Extraction Priority:**
1. UUID from `transcript_path` field
2. `session_id` field
3. `CLAUDE_SESSION_ID` environment variable
4. Parent process ID fallback

**Hook Commands:**
```
context-mode hook claude-code pretooluse
context-mode hook claude-code posttooluse
context-mode hook claude-code precompact
context-mode hook claude-code sessionstart
context-mode hook claude-code userpromptsubmit
```

**Known Issues:** None significant.

---

### Gemini CLI

**Status:** Fully supported

**Hook Paradigm:** JSON stdin/stdout

Gemini CLI uses the same JSON stdin/stdout paradigm as Claude Code but with different hook names and response format.

**Hook Names:**
- `BeforeTool` -- equivalent to PreToolUse
- `AfterTool` -- equivalent to PostToolUse
- `PreCompress` -- equivalent to PreCompact (advisory only, async, cannot block)
- `SessionStart` -- fires when a session starts

**Blocking:** `decision: "deny"` in response (NOT `permissionDecision`)

**Arg Modification:** `hookSpecificOutput.tool_input` (merged with original, not `updatedInput`)

**Output Modification:** `decision: "deny"` + `reason` replaces output; `hookSpecificOutput.additionalContext` appends

**Environment Variables:**
- `GEMINI_PROJECT_DIR` -- primary project directory
- `CLAUDE_PROJECT_DIR` -- alias (also works)

**Hook Commands:**
```
context-mode hook gemini-cli beforetool
context-mode hook gemini-cli aftertool
context-mode hook gemini-cli precompress
context-mode hook gemini-cli sessionstart
```

**Known Issues / Caveats:**
- `PreCompress` is advisory only (async, cannot block)
- No `decision: "ask"` support
- Hooks don't fire for subagents yet

---

### OpenCode

**Status:** Partially supported

**Hook Paradigm:** TS Plugin

OpenCode uses a TypeScript plugin paradigm instead of JSON stdin/stdout. Hooks are registered via the `plugin` array in `opencode.json`.

**Hook Names:**
- `tool.execute.before` -- equivalent to PreToolUse
- `tool.execute.after` -- equivalent to PostToolUse
- `experimental.session.compacting` -- equivalent to PreCompact (experimental)

**Blocking:** `throw Error` in `tool.execute.before` handler

**Arg Modification:** `output.args` mutation

**Output Modification:** `output.output` mutation (TUI bug for bash, see issue #13575)

**Session ID:** `input.sessionID` (camelCase, note the uppercase `ID`)

**Project Directory:** Available via `ctx.directory` in plugin init, not via environment variable

**Configuration:**
- `opencode.json` or `.opencode/opencode.json`
- Plugin registered in the `plugin` array with npm package names

**Known Issues / Caveats:**
- SessionStart is broken (issue #14808, no hook issue #5409)
- Output modification has TUI rendering bug for bash tool (issue #13575)
- `experimental.session.compacting` is marked experimental and may change
- No `canInjectSessionContext` capability

---

### Codex CLI

**Status:** MCP-only (no hooks)

**Hook Paradigm:** MCP-only

Codex CLI does not support hooks. PRs #2904 and #9796 were closed without merge. The only integration path is via MCP servers configured in `config.toml`.

**Configuration:**
- `~/.codex/config.toml` (TOML format, not JSON)
- MCP servers configured in `[mcp_servers]` section

**Capabilities:**
- PreToolUse: --
- PostToolUse: --
- PreCompact: --
- SessionStart: --
- Can modify args: --
- Can modify output: --
- Can inject session context: --

**Known Issues / Caveats:**
- Only `"hook": notify` config for `agent-turn-complete` exists (very limited)
- No plugin system or marketplace
- TOML configuration requires manual editing
- All hook-related parse/format methods throw errors

---

### VS Code Copilot

**Status:** Fully supported (preview)

**Hook Paradigm:** JSON stdin/stdout

VS Code Copilot uses the same JSON stdin/stdout paradigm as Claude Code with PascalCase hook names. It also provides unique hooks for subagent lifecycle.

**Hook Names:**
- `PreToolUse` -- fires before a tool is executed
- `PostToolUse` -- fires after a tool completes
- `PreCompact` -- fires before context compaction
- `SessionStart` -- fires when a session starts
- `Stop` -- fires when agent stops (unique to VS Code)
- `SubagentStart` -- fires when a subagent starts (unique to VS Code)
- `SubagentStop` -- fires when a subagent stops (unique to VS Code)

**Blocking:** `permissionDecision: "deny"` (same as Claude Code)

**Arg Modification:** `updatedInput` inside `hookSpecificOutput` wrapper (NOT flat like Claude Code)
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "updatedInput": { ... }
  }
}
```

**Output Modification:** `additionalContext` inside `hookSpecificOutput`, or `decision: "block"` + `reason`

**MCP Tool Naming:** Uses `f1e_` prefix (not `mcp__server__tool`)

**Session ID:** `sessionId` (camelCase, not `session_id`)

**Configuration:**
- Primary: `.github/hooks/*.json`
- Also reads: `.claude/settings.json`
- MCP config: `.vscode/mcp.json`

**Environment Detection:**
- `VSCODE_PID` environment variable
- `TERM_PROGRAM=vscode`

**Hook Commands:**
```
context-mode hook vscode-copilot pretooluse
context-mode hook vscode-copilot posttooluse
context-mode hook vscode-copilot precompact
context-mode hook vscode-copilot sessionstart
```

**Known Issues / Caveats:**
- Preview status -- API may change without notice
- Matchers are parsed but IGNORED (all hooks fire on all tools)
- Tool input property names use camelCase (`filePath` not `file_path`)
- Response must be wrapped in `hookSpecificOutput` with `hookEventName`

---

### Cursor

**Status:** Supported (native hooks, v1 scope)

**Hook Paradigm:** JSON stdin/stdout

Cursor uses native lower-camel hook names and flat hook entries in `.cursor/hooks.json` or `~/.cursor/hooks.json`. context-mode treats Cursor as a first-class adapter and does not rely on Claude-compat wrappers for official support.

**Hook Names:**
- `preToolUse` -- fires before a tool is executed
- `postToolUse` -- fires after a tool completes
- `sessionStart` -- fires on startup, resume, and compact

**Blocking:** `{ "permission": "deny", "user_message": "..." }`

**Arg Modification:** `{ "updated_input": { ... } }`

**Output Modification:** not supported in v1

**Session Context Injection:** `{ "additional_context": "..." }`

**Session ID Extraction Priority:**
1. `conversation_id`
2. `CURSOR_SESSION_ID` environment variable
3. `CURSOR_TRACE_ID` environment variable
4. Parent process ID fallback

**Configuration:**
- Project: `.cursor/hooks.json`
- User: `~/.cursor/hooks.json`
- Enterprise: `/Library/Application Support/Cursor/hooks.json` (read-only informational layer)
- MCP config: `.cursor/mcp.json` or `~/.cursor/mcp.json`

**Hook Commands:**
```
context-mode hook cursor pretooluse
context-mode hook cursor posttooluse
context-mode hook cursor sessionstart
```

**Known Issues / Caveats:**
- `preCompact` is intentionally not shipped in v1
- Hook payloads name MCP tools as `MCP:<tool>` and need adapter normalization
- Claude-compatible Cursor behavior exists, but native Cursor config is the supported path

---

## Capability Matrix (Quick Reference)

| Capability | Claude Code | Gemini CLI | VS Code Copilot | Cursor | OpenCode | Codex CLI |
|-----------|:-----------:|:----------:|:---------------:|:------:|:--------:|:---------:|
| PreToolUse | Yes | Yes | Yes | Yes | Yes | -- |
| PostToolUse | Yes | Yes | Yes | Yes | Yes | -- |
| PreCompact | Yes | Yes | Yes | -- | Yes* | -- |
| SessionStart | Yes | Yes | Yes | Yes | -- | -- |
| Modify Args | Yes | Yes | Yes | Yes | Yes | -- |
| Modify Output | Yes | Yes | Yes | No | Yes** | -- |
| Inject Context | Yes | Yes | Yes | Yes | -- | -- |
| Block Tools | Yes | Yes | Yes | Yes | Yes | -- |
| MCP Support | Yes | Yes | Yes | Yes | Yes | Yes |

\* OpenCode `experimental.session.compacting` is experimental
\*\* OpenCode has a TUI rendering bug for bash tool output (#13575)

---

## Hook Response Format Comparison

### Blocking a Tool

| Platform | Response Format |
|----------|----------------|
| Claude Code | `{ "permissionDecision": "deny", "reason": "..." }` |
| Gemini CLI | `{ "decision": "deny", "reason": "..." }` |
| VS Code Copilot | `{ "permissionDecision": "deny", "reason": "..." }` |
| Cursor | `{ "permission": "deny", "user_message": "..." }` |
| OpenCode | `throw new Error("...")` |
| Codex CLI | N/A |

### Modifying Tool Input

| Platform | Response Format |
|----------|----------------|
| Claude Code | `{ "updatedInput": { ... } }` |
| Gemini CLI | `{ "hookSpecificOutput": { "tool_input": { ... } } }` |
| VS Code Copilot | `{ "hookSpecificOutput": { "hookEventName": "PreToolUse", "updatedInput": { ... } } }` |
| Cursor | `{ "updated_input": { ... } }` |
| OpenCode | `{ "args": { ... } }` (mutation) |
| Codex CLI | N/A |

### Injecting Additional Context (PostToolUse)

| Platform | Response Format |
|----------|----------------|
| Claude Code | `{ "additionalContext": "..." }` |
| Gemini CLI | `{ "hookSpecificOutput": { "additionalContext": "..." } }` |
| VS Code Copilot | `{ "hookSpecificOutput": { "hookEventName": "PostToolUse", "additionalContext": "..." } }` |
| Cursor | `{ "additional_context": "..." }` |
| OpenCode | `{ "additionalContext": "..." }` |
| Codex CLI | N/A |

---

## CLI Hook Dispatcher

All hook-based platforms use the CLI dispatcher pattern instead of direct `node` paths:

```
context-mode hook <platform> <event>
```

The dispatcher resolves the hook script relative to the installed package and dynamically imports it. Stdin/stdout flow through naturally since it runs in the same process.

**Advantages over `node ./node_modules/...` paths:**
- Works from any directory (no per-project `npm install` needed)
- Single global install serves all projects
- `context-mode upgrade` updates hooks in-place
- Short, portable command strings in settings files

**Supported dispatches:**

| Platform | Events |
|----------|--------|
| `claude-code` | `pretooluse`, `posttooluse`, `precompact`, `sessionstart`, `userpromptsubmit` |
| `gemini-cli` | `beforetool`, `aftertool`, `precompress`, `sessionstart` |
| `vscode-copilot` | `pretooluse`, `posttooluse`, `precompact`, `sessionstart` |
| `cursor` | `pretooluse`, `posttooluse`, `sessionstart` |

OpenCode uses a TS plugin paradigm (no command dispatcher). Codex CLI has no hook support.

---

## Utility Commands

All platforms support utility commands via MCP meta-tools:

| Command | What it does |
|---------|-------------|
| `ctx stats` | Show context savings, call counts, and session statistics |
| `ctx doctor` | Diagnose installation: runtimes, hooks, FTS5, versions |
| `ctx upgrade` | Update from GitHub, rebuild, reconfigure hooks |

**How they work:** The MCP server exposes `stats`, `doctor`, and `upgrade` tools. The `<ctx_commands>` section in routing instructions (CLAUDE.md, GEMINI.md, AGENTS.md, copilot-instructions.md) maps natural language triggers to MCP tool calls. The `doctor` and `upgrade` tools return shell commands that the LLM executes and formats as a checklist.
