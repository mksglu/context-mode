# Context Mode for Hermes Agent

This Hermes plugin adds proactive Context Mode routing and a bounded fallback
for oversized native tool results. It uses the public Hermes plugin API and the
Python standard library only.

## Requirements

- Hermes Agent with the current Python plugin hooks
- Node.js 22.5 or later, or Bun
- The Context Mode MCP server registered under the name `context-mode`

Hermes registers that server's tools as `mcp__context_mode__ctx_*`.

## Install

Register the MCP server:

```bash
hermes mcp add context-mode --command npx --args -y context-mode
```

Copy the plugin on Linux, macOS, or WSL:

```bash
mkdir -p ~/.hermes/plugins/hermes-context-mode
cp .hermes-plugin/plugin.yaml .hermes-plugin/__init__.py ~/.hermes/plugins/hermes-context-mode/
```

Copy the plugin in PowerShell:

```powershell
$target = Join-Path $HOME ".hermes/plugins/hermes-context-mode"
New-Item -ItemType Directory -Force $target | Out-Null
Copy-Item .hermes-plugin/plugin.yaml, .hermes-plugin/__init__.py $target -Force
```

Enable it in `~/.hermes/config.yaml`:

```yaml
plugins:
  enabled:
    - hermes-context-mode
```

Restart Hermes. For a gateway install, restart the gateway process. Confirm the
MCP connection with `hermes mcp test context-mode`, then ask Hermes for
`ctx stats`.

## Behavior

| Hook | Behavior |
|---|---|
| `pre_tool_call` | Blocks known high-output terminal fetch/build commands using Hermes' `{"action":"block","message":"..."}` contract. |
| `transform_tool_result` | Writes eligible outputs larger than 3 KiB to a collision-safe UTF-8 file and returns a compact pointer. |
| `pre_llm_call` | Injects current `mcp__context_mode__ctx_*` routing guidance once per session. |
| `on_session_start` | Initializes bounded per-session metrics. |
| `on_session_end` | Persists a snapshot at Hermes' per-turn boundary without destroying session state. |
| `on_session_finalize` | Persists and releases state when Hermes tears down the session. |

Generated data stays under
`~/.hermes/plugins/hermes-context-mode/` (or `$HERMES_HOME/plugins/...`):

```text
metrics.db
sandbox/
```

Hermes plugin API: <https://hermes-agent.nousresearch.com/docs/user-guide/features/plugins>

Hermes hook contracts: <https://hermes-agent.nousresearch.com/docs/user-guide/features/hooks>

Hermes MCP configuration: <https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp>
