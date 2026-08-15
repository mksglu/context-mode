# JetBrains Copilot Setup

Setup guide for using context-mode with JetBrains IDEs (IntelliJ IDEA, WebStorm, PyCharm, etc.) via the GitHub Copilot plugin.

## Prerequisites

- **Node.js >= 22.5** (or Bun) (`node --version`)
- **JetBrains IDE** — any JetBrains IDE (IntelliJ IDEA, WebStorm, PyCharm, GoLand, Rider, CLion, etc.)
- **GitHub Copilot plugin v1.5.57+** — install from Settings > Plugins > Marketplace, search "GitHub Copilot"

## MCP Setup

JetBrains configures MCP servers via the Settings UI, not a file.

1. Open your JetBrains IDE.
2. Go to **Settings > Tools > GitHub Copilot > MCP**.
3. Click **Add Server** (or **Configure**) and set:
   - **Name:** `context-mode`
   - **Command:** `context-mode`
   - **Args:** *(none)*
4. Click **OK** to save.

This matches the shipped [`configs/jetbrains-copilot/mcp.json`](../configs/jetbrains-copilot/mcp.json), which registers `{ "command": "context-mode" }` and requires a global install (`npm install -g context-mode`).

If you prefer not to install globally, set the **Command** to `npx` and **Args** to `-y context-mode` instead.

## Hook Installation

Install hooks using the upgrade command (the hook-config writer):

```bash
context-mode upgrade
```

If you have multiple CLIs installed and want to force JetBrains detection:

```bash
CONTEXT_MODE_PLATFORM=jetbrains-copilot context-mode upgrade
```

This creates `.github/hooks/context-mode.json` in your project with the following hook configuration:

```json
{
  "hooks": {
    "PreToolUse": [
      { "type": "command", "command": "context-mode hook jetbrains-copilot pretooluse" }
    ],
    "PostToolUse": [
      { "type": "command", "command": "context-mode hook jetbrains-copilot posttooluse" }
    ],
    "PreCompact": [
      { "type": "command", "command": "context-mode hook jetbrains-copilot precompact" }
    ],
    "SessionStart": [
      { "type": "command", "command": "context-mode hook jetbrains-copilot sessionstart" }
    ]
  }
}
```

Full hook config reference: [`configs/jetbrains-copilot/hooks.json`](../configs/jetbrains-copilot/hooks.json)

## Upgrade

Update context-mode to the latest version:

```
context-mode upgrade
```

Or from within a Copilot chat session, type `ctx upgrade`.

## Verification

Run the diagnostics to verify everything is working:

```
context-mode doctor
```

Or from within a Copilot chat session, type `ctx doctor`.

All checks should show `[x]`. The doctor validates runtimes, hooks, FTS5, and MCP registration.

You can also verify context savings by typing `ctx stats` in a Copilot chat session.

## Troubleshooting

**MCP server not connecting**
- Ensure Node.js >= 22.5 is in your PATH.
- Restart the JetBrains IDE after adding the MCP server.
- Check Settings > Tools > AI Assistant > MCP and confirm "context-mode" shows a green status indicator.

**Hooks not firing**
- Verify `.github/hooks/context-mode.json` exists in your project root.
- JetBrains Copilot reads hooks from `.github/hooks/` — the same location as VS Code Copilot.
- Re-run `context-mode upgrade` (optionally `CONTEXT_MODE_PLATFORM=jetbrains-copilot context-mode upgrade`) to regenerate the hook config.

**"context-mode: command not found"**
- Install globally: `npm install -g context-mode`
- Verify: `which context-mode` should return a path.
- If using `npx`, ensure npx is in your IDE's PATH.

**Tools appear but routing is not enforced**
- Hooks enforce routing programmatically. Without hooks, the model can still use context-mode tools but won't be redirected to prefer them.
- Ensure the hook config file is in `.github/hooks/context-mode.json` (not `.github/hooks.json`).

**Session continuity not working**
- Verify all four hooks (PreToolUse, PostToolUse, PreCompact, SessionStart) are configured.
- Run `ctx doctor` to check hook registration status.
