# Kimi Code CLI Setup

Setup guide for using context-mode with [Kimi Code CLI](https://moonshotai.github.io/kimi-code/en/customization/hooks.html).

## Overview

Kimi Code CLI uses a JSON stdin/stdout hook paradigm similar to Claude Code and Codex CLI, with TOML-based configuration in `~/.kimi-code/config.toml`.

## Prerequisites

- Kimi Code CLI installed (`kimi` binary in PATH)
- `context-mode` installed globally:
  ```bash
  npm install -g context-mode
  ```

## Capabilities

| Feature | Status |
|---------|--------|
| PreToolUse | Deny only (exit code 2 or `permissionDecision: "deny"`) |
| PostToolUse | Yes |
| SessionStart | Yes (session continuity DB only; see note) |
| SessionEnd | Yes (genuine session close, distinct from `Stop`) |
| PreCompact | Yes |
| UserPromptSubmit | Yes (handles `ContentPart[]` array format) |
| Stop | Yes (per-turn end) |
| Modify args | No (`updatedInput` silently dropped by host runner) |
| Modify output | No (PostToolUse `additionalContext` emitted but not acted upon by host; `canModifyOutput: false`) |
| Inject session context | No via `additionalContext` (host has no channel) — use `UserPromptSubmit.message` instead |
| Block tools | Yes (exit code 2 or `permissionDecision: "deny"`) |

> Capability matrix verified against upstream sources:
> `refs/platforms/kimi-code/packages/agent-core/src/session/hooks/runner.ts:36-39,162-178`
> and `types.ts:28-37` show that `HookSpecificOutputSchema` only parses
> `message`, `permissionDecision`, and `permissionDecisionReason`, and that
> `HookResult` has no `additionalContext` field. The Python runtime at
> `refs/platforms/kimi-cli/src/kimi_cli/hooks/runner.py:62-89` behaves
> identically. Only `permissionDecision === "deny"` triggers a block; every
> other field is silently discarded.

## Differences from Codex CLI

Kimi Code uses the same JSON stdin/stdout wire protocol as Codex, with closely matching capabilities:

- **Deny-only PreToolUse** — `ask` / `modify` / `additionalContext` are silently dropped by Kimi's runner, same as Codex
- **Exit code 2** blocks a tool call (same as Codex)
- **`SessionEnd` is a distinct event** from `Stop` — `Stop` fires at end of each assistant turn; `SessionEnd` fires once when the host's session closes (`refs/platforms/kimi-code/.../session/index.ts:192,502`, `refs/platforms/kimi-cli/.../hooks/events.py:99-114`)
- **`ContentPart[]` prompts** — Kimi sends user prompts as an array of `{ type: "text", text: "..." }` objects instead of a plain string
- **`KIMI_CODE_HOME` is honoured** — relocating the Kimi data root also relocates context-mode's session DB (matches MoonshotAI's own first-party plugins; see `refs/platforms/kimi-code/plugins/official/kimi-datasource/bin/kimi-datasource.mjs:207-210`)

## Configuration

Add to `~/.kimi-code/config.toml`:

```toml
[[hooks]]
event = "PreToolUse"
matcher = "Bash|Shell|Read|Edit|Write|WebFetch|Agent|ctx_execute|ctx_execute_file|ctx_batch_execute|ctx_fetch_and_index|ctx_search|ctx_index|mcp__"
command = "context-mode hook kimi pretooluse"
timeout = 30

[[hooks]]
event = "PostToolUse"
command = "context-mode hook kimi posttooluse"
timeout = 30

[[hooks]]
event = "SessionStart"
command = "context-mode hook kimi sessionstart"
timeout = 30

[[hooks]]
event = "PreCompact"
command = "context-mode hook kimi precompact"
timeout = 30

[[hooks]]
event = "UserPromptSubmit"
command = "context-mode hook kimi userpromptsubmit"
timeout = 30

[[hooks]]
event = "Stop"
command = "context-mode hook kimi stop"
timeout = 30

[[hooks]]
event = "SessionEnd"
command = "context-mode hook kimi sessionend"
timeout = 30
```

## Hook Commands

| Event | Command |
|-------|---------|
| PreToolUse | `context-mode hook kimi pretooluse` |
| PostToolUse | `context-mode hook kimi posttooluse` |
| SessionStart | `context-mode hook kimi sessionstart` |
| SessionEnd | `context-mode hook kimi sessionend` |
| PreCompact | `context-mode hook kimi precompact` |
| UserPromptSubmit | `context-mode hook kimi userpromptsubmit` |
| Stop | `context-mode hook kimi stop` |

## MCP Configuration

Add to `~/.kimi-code/mcp.json`:

```json
{
  "mcpServers": {
    "context-mode": {
      "command": "context-mode",
      "args": []
    }
  }
}
```

## Session Storage

Sessions are stored in `$KIMI_CODE_HOME/context-mode/sessions/` when the env
var is set, falling back to `~/.kimi-code/context-mode/sessions/` otherwise.
This matches how Kimi Code resolves its own data root.

## Verify Installation

Run the diagnostic:

```bash
kimi # start a new session
# Then type:
ctx doctor
```

Or test individual hooks manually:

```bash
echo '{"tool_name":"Bash","tool_input":{"command":"curl https://example.com"}}' \
  | context-mode hook kimi pretooluse
```

Expected output: a JSON response with routing guidance redirecting to `ctx_execute` / `ctx_fetch_and_index`.

## Confirm savings

Run `ctx stats` to see how much context window context-mode saved this session
(savings ratio plus a per-tool token breakdown).
