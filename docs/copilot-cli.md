# GitHub Copilot CLI Setup

Setup guide for using context-mode with **GitHub Copilot CLI**.

> This integration supports both:
> - **Hook-based** mode (recommended): routing enforcement + session continuity across compaction
> - **MCP-only** mode: works as a standard MCP server, but without hook-driven redirects

## Prerequisites

- **Node.js 18+** (`node --version`)
- **GitHub Copilot CLI** installed and authenticated
- `context-mode` installed (recommended globally):

```bash
npm install -g context-mode
```

## MCP setup

Configure GitHub Copilot CLI to launch `context-mode` as an MCP server.

- **Command:** `context-mode`
- (If you prefer npx) **Command:** `npx` with **Args:** `-y context-mode`

## Hook installation (recommended)

Install hook wiring in your repo:

```bash
npx context-mode@latest setup --adapter copilot-cli
```

This writes `.github/hooks/context-mode.json` with hook commands in Tier‑C portable form:

```json
{
  "hooks": {
    "PreToolUse": [
      { "type": "command", "command": "context-mode hook copilot-cli pretooluse" }
    ],
    "PostToolUse": [
      { "type": "command", "command": "context-mode hook copilot-cli posttooluse" }
    ],
    "PreCompact": [
      { "type": "command", "command": "context-mode hook copilot-cli precompact" }
    ],
    "SessionStart": [
      { "type": "command", "command": "context-mode hook copilot-cli sessionstart" }
    ]
  }
}
```

Full template: [`configs/copilot-cli/hooks.json`](../configs/copilot-cli/hooks.json)

## Storage location

Copilot CLI sessions are stored under the Copilot config root:

- Default: `~/.copilot/context-mode/sessions/`
- Override: set `COPILOT_HOME` (then uses `$COPILOT_HOME/context-mode/sessions/`)

## Project directory resolution

context-mode uses the first available project root signal:

1. `COPILOT_CWD` (preferred)
2. `CLAUDE_PROJECT_DIR` (compat)
3. `process.cwd()` fallback

## Verification

Run diagnostics:

```bash
context-mode doctor
```

In a Copilot CLI chat session, you can also run `ctx stats` once routing is active.

## Troubleshooting

**Hooks not firing**
- Ensure `.github/hooks/context-mode.json` exists.
- Ensure `context-mode` is in PATH (global install recommended).

**No redirects / no session continuity**
- MCP-only mode will still work, but routing enforcement relies on hooks.
- Run `context-mode doctor` and ensure PreToolUse + SessionStart pass.
