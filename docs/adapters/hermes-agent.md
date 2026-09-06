# Hermes Agent

## Status

Hermes Agent is supported through two independent public interfaces:

1. Context Mode runs as a standard MCP server.
2. A Python plugin uses Hermes hooks for proactive routing and bounded output
   fallback.

No Hermes source patch or private API is required.

## Current Contracts

| Integration point | Hermes contract | Context Mode use |
|---|---|---|
| MCP naming | `mcp__<sanitized_server>__<sanitized_tool>` | `mcp__context_mode__ctx_*` |
| `pre_tool_call` | May return `{"action":"block","message":str}` | Blocks known high-output terminal commands. |
| `transform_tool_result` | First non-empty string replaces the model-visible result. | Replaces eligible results over 3 KiB with a local file pointer. |
| `pre_llm_call` | May return `{"context":str}` | Injects routing guidance once per session. |
| `on_session_end` | Fires after every `run_conversation()` call. | Persists a metrics snapshot without releasing session state. |
| `on_session_finalize` | Fires on actual CLI/gateway session teardown. | Persists and releases session state. |

The `on_session_end`/`on_session_finalize` distinction is required for current
Hermes. Treating `on_session_end` as final teardown loses state after the first
turn.

## Install

Register Context Mode using Hermes' current MCP CLI syntax:

```bash
hermes mcp add context-mode --command npx --args -y context-mode
```

Copy `.hermes-plugin/plugin.yaml` and `.hermes-plugin/__init__.py` to:

```text
~/.hermes/plugins/hermes-context-mode/
```

Enable the plugin:

```yaml
plugins:
  enabled:
    - hermes-context-mode
```

Restart Hermes, run `hermes mcp test context-mode`, and ask for `ctx stats`.

Project-local Hermes plugins are disabled by default. If you intentionally copy
the plugin under `./.hermes/plugins/`, Hermes requires
`HERMES_ENABLE_PROJECT_PLUGINS=true` for that trusted repository.

## Data and Failure Model

The plugin is standard-library-only and fails open for metrics writes. It stores
only local metrics and oversized output files under the plugin directory. The
first-turn guidance map is concurrency-safe, evicts oldest entries, and never
exceeds 1,000 session IDs. Tool output files use nanosecond timestamps plus
random suffixes so parallel calls cannot overwrite one another.

The MCP server remains the source of Context Mode execution, indexing, search,
statistics, and diagnostics. The Python plugin does not duplicate those systems.

## References

- Hermes Agent repository: <https://github.com/NousResearch/hermes-agent>
- Hermes plugin API: <https://hermes-agent.nousresearch.com/docs/user-guide/features/plugins>
- Hermes hook API: <https://hermes-agent.nousresearch.com/docs/user-guide/features/hooks>
- Hermes MCP setup: <https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp>
