# context-mode — GitHub Copilot CLI plugin

One-command install of the context-mode MCP server (and routing skill) into
GitHub Copilot CLI, with **no `context-mode upgrade` / agent call required**:

```sh
copilot plugin install mksglu/context-mode:configs/copilot-cli
```

This registers:

- **MCP server** (`.mcp.json`) — exposes the `ctx_*` tools (`ctx_execute`,
  `ctx_batch_execute`, `ctx_search`, `ctx_fetch_and_index`, …). The server is
  launched with `CONTEXT_MODE_PLATFORM=copilot-cli`, so it self-identifies as
  Copilot regardless of any other CLI installed on the machine — `ctx_upgrade`
  and platform detection resolve `copilot-cli`, never a co-installed Claude Code.
- **Routing skill** (`skills/context-mode/`) — the MANDATORY "Think in Code"
  rules that keep raw bytes out of the context window.
- **Capture hooks** (`hooks.json`) — `preToolUse`, `postToolUse`,
  `sessionStart`, `userPromptSubmitted`, `agentStop`, `preCompact` (Copilot
  CLI's native camelCase event names — verified against the `@github/copilot`
  1.0.60 binary; PascalCase event names are ALSO accepted and fire, so the
  casing is not load-bearing — context-mode uses camelCase because it is the
  CLI's native naming, not because PascalCase would fail), each dispatching
  `context-mode hook copilot-cli <event>`. Byte-equivalent to what
  `context-mode upgrade` writes to `~/.copilot/hooks/`, so the plugin registers
  them with no `upgrade` / agent call.

## Prerequisite

The MCP server runs the global `context-mode` binary (it needs the native
`better-sqlite3` dependency):

```sh
npm install -g context-mode
```

## Alternative (no plugin)

```sh
copilot mcp add context-mode --env CONTEXT_MODE_PLATFORM=copilot-cli -- context-mode
```

Then, to also install the capture hooks, run the upgrade **from inside Copilot**
(so it detects `copilot-cli` via the live MCP client) rather than standalone:

```sh
copilot -p "Use the context-mode ctx_upgrade tool to install context-mode's hooks." --allow-all
```

## Verify / Troubleshoot

Run the diagnostic:

```sh
context-mode doctor
```

Under the plugin, the doctor validates the bundle's `hooks.json` and the MCP
registration. When something is missing it prints the exact fix:

- **Plugin path** (`CONTEXT_MODE_COPILOT_PLUGIN=1`) — the suggested fix is
  `copilot plugin install mksglu/context-mode:configs/copilot-cli`.
- **Standalone path** — the MCP fix is
  `copilot mcp add context-mode -- context-mode` and the hooks fix is
  `context-mode upgrade`.

Hooks fail open: if a stale global `context-mode` is on PATH, routing goes inert
rather than blocking your tools — so a misconfiguration shows up as *no
redirection*, not as errors.

## Confirm savings

In a Copilot CLI session, type `ctx stats` (or call the `ctx_stats` MCP tool) to
see the context-window tokens saved this session — savings ratio plus a per-tool
breakdown.
