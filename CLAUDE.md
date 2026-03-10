# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# context-mode

MCP plugin (TypeScript/Node.js) that sandboxes tool output to prevent context window flooding. Exposes 6 MCP tools (`ctx_execute`, `ctx_execute_file`, `ctx_batch_execute`, `ctx_search`, `ctx_index`, `ctx_fetch_and_index`) and hooks for Claude Code, Gemini CLI, VS Code Copilot, OpenCode, and Codex CLI.

## Commands

```bash
npm run build          # tsc + chmod +x build/cli.js
npm run dev            # run server via tsx (no build needed)
npm test               # vitest run (all unit tests)
npm run test:watch     # vitest in watch mode
npm run typecheck      # tsc --noEmit
npx vitest run tests/executor.test.ts   # run a single test file
```

## Architecture

### Core pipeline (`src/`)

- **`server.ts`** — MCP server entry point. Registers all 6 tools, handles security policy checks, intent-driven search threshold (5 KB), and `trackResponse`/`trackIndexed` for stats.
- **`executor.ts`** — `PolyglotExecutor`: spawns isolated subprocesses per language. `execute()` writes a temp script and runs it. `executeFile()` calls `#wrapWithFileContent()` to prepend file-reading boilerplate (exposes `FILE_CONTENT_PATH` and `FILE_CONTENT` variables), then delegates to `execute()`.
- **`runtime.ts`** — Detects available language runtimes (node/bun/python/ruby/go/rust/php/perl/r/elixir). Bun auto-detected for JS/TS.
- **`store.ts`** — `ContentStore`: SQLite + FTS5 knowledge base (BM25 ranking). Handles index, search, dedup, smart snippet extraction.
- **`security.ts`** — Reads Claude Code's `.claude/settings.json` deny/allow policies and enforces them for sandbox calls.
- **`session/`** — Session event capture, snapshot building (≤2 KB priority-tiered XML), and restore on compaction.
- **`adapters/`** — Per-platform hook implementations (claude-code, gemini-cli, vscode-copilot, opencode, codex).
- **`cli.ts`** — `context-mode` CLI: `setup`, `doctor`, `hook <platform> <event>` subcommands.
- **`opencode-plugin.ts`** — OpenCode TypeScript plugin entry (exported as package main).

### Key variable contract for `ctx_execute_file`

When `ctx_execute_file` is called, `#wrapWithFileContent()` prepends boilerplate that exposes these variables in user code:

| Language | Variables available |
|---|---|
| Python | `FILE_CONTENT_PATH`, `FILE_CONTENT` |
| JS/TS | `FILE_CONTENT_PATH`, `FILE_CONTENT` |
| Shell | `$FILE_CONTENT_PATH`, `$FILE_CONTENT` |
| Ruby | `FILE_CONTENT_PATH`, `FILE_CONTENT` |

The `path` parameter is **not** exposed as a variable in user code — only `FILE_CONTENT_PATH` and `FILE_CONTENT` are.

### Data flow

```
MCP tool call → security check → executor.executeFile()
  → #wrapWithFileContent() prepends FILE_CONTENT boilerplate
  → #writeScript() writes to mkdtempSync temp dir
  → #spawn() in isolated subprocess
  → stdout captured → smartTruncate() → returned to MCP client
  (if intent + output >5KB → intentSearch() via FTS5 instead)
```

### Build outputs

- `build/` — tsc output (used for local dev and `npm run build`)
- `server.bundle.mjs` / `cli.bundle.mjs` — esbuild bundles for distribution (external: `better-sqlite3`)
- `build/opencode-plugin.js` — package main for OpenCode plugin import

## Tool Selection (for working in this repo)

- DO NOT use Bash for commands producing >20 lines of output — use `ctx_execute` or `ctx_batch_execute`.
- DO NOT use Read for analysis — use `ctx_execute_file`. Read IS correct for files you intend to Edit.
- Bash is ONLY for git, mkdir, rm, mv, navigation, and short commands.
