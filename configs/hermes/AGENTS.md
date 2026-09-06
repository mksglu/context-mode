# Context Mode

Context Mode is connected to Hermes as the MCP server `context-mode`. Hermes
registers its tools with the prefix `mcp__context_mode__`.

## Routing

- Gather high-output command results with `mcp__context_mode__ctx_batch_execute`.
- Analyze files with `mcp__context_mode__ctx_execute_file` when exact bytes are
  not needed for an edit.
- Analyze, filter, count, parse, or transform data with
  `mcp__context_mode__ctx_execute`; print only the derived answer.
- Fetch web content with `mcp__context_mode__ctx_fetch_and_index`, then query it
  with `mcp__context_mode__ctx_search`.
- Use native terminal for short, predictable output and state mutations.
- Use native file reads when exact content is needed for an edit.

The Hermes plugin blocks known high-output terminal fetch/build commands. Do
not retry blocked commands through terminal; route them through Context Mode.

If the plugin is enabled, it injects these rules on the first turn. Copy this
file into a project only when a persistent project-level fallback is useful.
