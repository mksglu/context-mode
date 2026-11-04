# How context-mode works

This page is for users and contributors. It describes context-mode as built on `main`. The design notes are at
`https://github.com/mksglu/context-mode/tree/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/`. `docs/architecture/modules/DEVIATIONS.md` records each place where the code differs from the design docs.

## In one line

context-mode keeps large tool output out of an AI coding agent's context window. The agent still gets
the answer it needs; the raw bytes stay in a local database and come back only on request.

## The two halves: hooks and MCP server

context-mode has two parts that run together inside one coding agent session:

1. **Hooks.** Small scripts the agent's own host (Claude Code, Codex, Gemini, etc.) runs before and after
   a tool call. A `PreToolUse` hook can allow, deny, or rewrite a call before it runs. A `PostToolUse` hook
   sees the real output after the call ran, and can replace it.
2. **The MCP server.** A small set of tools the agent can call itself: `ctx_execute`, `ctx_batch`,
   `ctx_index`, `ctx_search`, `ctx_resume`, `ctx_stats`, `ctx_doctor`, `ctx_upgrade`, `ctx_purge`
   (`TOOL_ORDER`, `docs/architecture/modules/00-architecture.md` §3.2).

The hook is the gate: it stops a huge file or log before it lands in context. The MCP tools are the way
around the gate: they let the agent run the same work, get a search-able record of the full output, and
receive back only the part that matches its stated intent.

## One database per project

Each project gets one SQLite file, `context.db`, under `~/.context-mode/projects/<projectKey>/`, not in the
repo (`00-architecture.md`, `projectDir` and `dbPath`). It runs in WAL mode with a 5-second busy timeout, so the hook process and the
MCP server process can both read and write it without stepping on each other (`02-store.md`; see
`docs/algorithms.md` §8). The database holds two kinds of row:

- **Journal rows** (`events` table): one row per tool call — session, tool, path, byte count, exit code.
  Used to rebuild state after a context compaction (`docs/algorithms.md` §3).
- **Content rows**: chunked, FTS5-indexed text from tool output over `REPLACE_TRIGGER_BYTES`, searchable later by
  `ctx_search` (`docs/algorithms.md` §7).

## The three-step pattern on one tool call

1. **Before the call** (`PreToolUse`): the hook parses the command (`docs/algorithms.md` §1), checks it
   against the user's deny rules, and checks any `Read` against the byte-size rule (`docs/algorithms.md` §2). A `Read`
   of a file that is too big is denied, with a message naming the real size and three ways to get
   the data without it landing whole in context.
2. **During the call**: for `ctx_execute`/`ctx_batch`, code runs in a sandboxed child process, inside the
   project directory, with a kill switch on the whole process tree if it times out or is cancelled
   (`docs/algorithms.md` §9). Only what the code prints comes back, up to `OUTPUT_CAP` (16,384 bytes).
   This is Thinking in Code: the agent writes a script that prints only the answer, instead of reading the data
   ([tools.md](tools.md#ctx_execute)).
3. **After the call** (`PostToolUse`): if the real output from a host tool (not `ctx_*`) is over
   `REPLACE_TRIGGER_BYTES` (4,096), the hook chunks it, indexes it whole, and replaces what the agent sees with
   the best-matching whole chunks (at most `REPLACE_RETURN_BYTES`, 96) plus a line it can run to search for more.
   Chunks are ranked by BM25 against the tool intent and the session's last user prompt. Nothing is cut and no
   regex filters the text (`docs/algorithms.md` §7). There are no size hints: a Bash call is not denied for a size
   guess, because the real size is known after the run (DECISIONS-r10).
   Measured (2026-10-21, Claude Code 2.1.303, claude-sonnet-5-5 low): outputs of 8,893 to 60,090 bytes reached the model
   as 152 to 190 chars and the answer was right in 16 of 16 runs. On small tasks the plugin adds a fixed prompt cost of
   about 2,000 tokens (`bench/RESULTS.md`).

## Search: scope, ranking, and time

`ctx_search` takes one or more query strings and a scope (`"session"`, `"worktree"` or `"project"`; default `"worktree"`, `05-tools-index.md` §6):

- Inside one scope, rows are ranked by BM25 (SQLite FTS5's built-in text ranking).
- Across the whole project, that BM25 ranking is combined with a separate recency ranking by Reciprocal
  Rank Fusion, so a result that is both a good text match and recent outranks one that is only one of the
  two (`docs/algorithms.md` §4).
- `sort:"timeline"` orders by real time instead, using a timestamp cursor, not a row id
  (`docs/algorithms.md` §6).

## Surviving a context compaction

When the agent's host compacts the conversation, most of what hooks added earlier is summarized away. To
give the agent its place back, context-mode rebuilds a small block (`STATE_BUDGET`, 2,048 bytes) from the
session's journal: the highest-scoring rows (errors first, then prompts, edits, index writes, with older
rows worth less) are picked until the budget is used up. No row's text is ever cut partway — a row that
will not fit whole becomes a one-line pointer into `ctx_search` instead (`docs/algorithms.md` §3).

## Data flow, end to end

```text
agent asks for something
        |
        v
  [PreToolUse hook] --deny (Read over cap, user policy)--> agent gets a message with a safe next step
        |  allow
        v
  tool call runs (host tool, or an MCP ctx_* tool in its own sandbox)
        |
        v
  [PostToolUse hook / MCP handler]
        |
        +-- output <= 4096 B --> returned to the agent as-is
        |
        +-- output > 4096 B --> chunked + written to context.db (FTS5)
                               |
                               v
                       agent sees: best-matching whole chunks (<= 96 B) + "ctx_search(...) for more"
```

```text
agent runs ctx_search(queries, scope)
        |
        v
  BM25 rank inside scope -----+
                               |--> Reciprocal Rank Fusion (project scope only) --> ranked hits --> agent
  recency rank (project only) +
```

## Adapters: one mechanism per host

Every coding agent host (Claude Code, Codex, Gemini, Qwen, Copilot CLI, VS Code, Kiro, ZCode, Pi,
OpenCode) wires hooks and the MCP server in a different way. The adapter table names, per host: how
context-mode installs (`installMode`), how it finds the project root (`projectSource`), what its MCP tool
names are prefixed with (`toolNamePrefix`), how a compaction-recovery block is delivered
(`compactDelivery`), and how deny messages reach the host (`denyChannel`) (`docs/architecture/modules/10-adapters.md`
§lines 51-61):

| Host | install | project source | compaction delivery |
|---|---|---|---|
| Claude Code | marketplace plugin | `env:CLAUDE_PROJECT_DIR` | `SessionStart(source=compact)` |
| Codex | config MCP entry | `--agent` + cwd | `SessionStart(source=compact)` |
| Gemini, Copilot CLI, VS Code | extension / plugin / MCP entry | spawn cwd / `--agent`+cwd / workspace folder | pending flag, delivered on next prompt |
| Qwen | extension | spawn cwd | `SessionStart(source=compact)` |
| Kiro | MCP entry | `--agent` + cwd | none |
| ZCode | hooks + MCP | spawn cwd | `SessionStart(source=compact)` (unverified) |
| Pi, OpenCode | plugin inside the agent | the agent's own cwd | agent-specific flag/cache |

One mechanism, ten adapters: the rules in the sections above (deny, chunk, search, compact) are the same
everywhere; only how a host is told about them changes.

## Engineering details

These facts moved here from the README (D-README-HOW-1). The numbers come from `src/core/contracts/constants.ts`.

Context Mode has three parts: hooks, an MCP server with nine tools, and one SQLite database per project. All three run on your machine, and the data stays in `~/.context-mode`.

### Hooks

The hooks listen to four events: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`. Gemini CLI, VS Code and OpenCode also send a compaction event; each host keeps its own event names. `PreToolUse` checks rules in a fixed order: the user's deny list, WebFetch, curl and HTTP or build commands, then Read and shell dumps. Context Mode denies a full-file `Read` of a file over 16,384 B, and the deny message names the exact `ctx_execute` call to use. A `Read` with a range still runs. A hook always exits 0: on any error it gives the host's "allow" reply and writes one log line, so your agent keeps working. Spawned hooks time out after 5,000 ms.

### Sandbox execution

`ctx_execute` writes the script to a temp folder and runs it as a local subprocess: shell, PowerShell, JavaScript, TypeScript, Python, or any runtime found on `PATH`. It spawns the runtime directly from an argument list, in the project folder. The default and maximum timeout is 600,000 ms; on timeout it kills the whole process group (`taskkill /F /T` on Windows). The child gets the parent environment minus the preload variables (`NODE_OPTIONS`, `BUN_OPTIONS`, `DENO_OPTIONS` and similar). The agent gets what the script prints, cut on a whole character.

### Index and search

Each output goes into SQLite FTS5 twice: a Porter-stemmed table for words, and a trigram table for paths, names and parts of words. `ctx_search` ranks each table with BM25 and joins the two lists with Reciprocal Rank Fusion: a hit scores 1/(60 + rank) in each list. Before it returns an empty list, it tries a spelling fix from the indexed words. Search covers one of three scopes: this session, this worktree (the default) or the whole project. Chunks are at most 4,096 B. A Markdown chunk stays inside one heading section and carries its heading path as its title. A code block that fits in a chunk stays whole; a bigger one splits on blank lines, and each piece repeats the fence. A reply snippet is at most 800 B, or a whole code block up to 2,048 B.

### Large output: run, then replace

When a host tool returns more than the cap, `PostToolUse` indexes the whole output and replaces it. The agent gets the best-matching whole chunks and one `ctx_search` line for the rest. Context Mode keeps the full text in the local index. The cap is 4,096 B (`REPLACE_TRIGGER_BYTES`); each returned chunk is at most 96 B (`REPLACE_RETURN_BYTES`).

### Session continuity

The hooks log each prompt, edit, command, tool error, index, cost and decision. After a compaction the agent gets a state block of at most 2,048 B built from that log. Every line stays whole: a long line becomes a `ctx_resume(seq)` pointer that reads the full row. On the next prompt, a prompt match block of at most 2,048 B brings back the log rows that match it by BM25, always as whole rows. The same rows always give the same bytes.

### Storage

Context Mode uses Node's built-in `node:sqlite`, so the install is plain JavaScript. Each project gets one `context.db` under `~/.context-mode` on your machine. The database runs in WAL mode. On close it always runs a PASSIVE checkpoint. Context Mode builds a new database under a temp name, then moves it into place in one step, so the file on disk is always complete, even after a crash. Busy timeout: 5,000 ms.

## What is still open

`docs/architecture/modules/DEVIATIONS.md` is the one place a gap between the design docs and the code at a given commit
is recorded — date, file, question, decision, reason. A number on this page comes from `src/core/contracts/constants.ts`
or a `DECISIONS-r*.md` file; measured results are in `bench/RESULTS.md`. See `docs/algorithms.md` for the
per-algorithm sources.
