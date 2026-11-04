# bench/ - context-mode benchmark suite and offline replay

## Suite: one folder per use case, one command

```
cd bench && node run.mjs                 # all 66 scenarios, 3 runs each
node run.mjs a-sandbox                   # one group, or one scenario id
node run.mjs --runs 5                    # n runs; median, min, max and sigma are over these
```

Plain Node, no dependencies, no network, no API keys, no model calls. It builds the bundle into `release-out` if it is missing,
starts the built MCP server over stdio and runs the built hooks as separate processes. Each run uses a fresh temp home and project.

| Folder | Use case |
|---|---|
| [a-sandbox](a-sandbox/README.md) | tool output processed in the sandbox (the 14 v1 scenarios plus large JSON, npm log, big source, long git log) |
| [b-retrieval](b-retrieval/README.md) | ctx_index + ctx_search with fixed queries; code blocks whole; the exact answer string in the hits (HTML docs page) |
| [c-batch](c-batch/README.md) | ctx_batch against separate raw calls, including a case with nothing to save |
| [d-externalize](d-externalize/README.md) | output over 100 KB kept whole in FTS5; first, middle and last line found by search |
| [e-continuity](e-continuity/README.md) | compaction state block, ctx_resume and the recall block against a transcript replay |
| [f-hook-redirect](f-hook-redirect/README.md) | Read, WebFetch and Bash dumps denied or replaced; bytes that would have entered against bytes that did |
| [g-overhead](g-overhead/README.md) | hook ms over bare node for all 10 host adapters, ctx_search latency, index time per MB, full session total |

Output: `results/<date>-<os>-<arch>.json` (raw samples, median, min, max, sigma, n, node, os, cpu, context-mode version and git
commit, dirty flag, sha256 of every input) and `results/<date>-<os>-<arch>.md` (one table per group, each with a footnote line).
Each table row links to its case in the group README: what the case does, a sample of the raw output, the reply the agent got, the rerun command and the input hashes. `node run.mjs --pages` rebuilds those pages from the newest results file and its `-replies.json`.

Method notes.
- Tokens are bytes / 4. That is an estimate. No tokenizer is vendored.
- "Saved" is 1 - bytes the model sees / bytes the raw output would put into the context. A negative number means context-mode
  costs more on that input; those rows stay in the tables (B search replies on small docs, C with tiny outputs).
- Group A reuses the v1 summary scripts byte for byte. The summary a script prints is not the answer to your question; it shows
  how small a script-made summary is.
- Inputs live in `fixtures/data`. Real captures carry source and date in `fixtures/data/SOURCE.md`. Where no real capture exists the
  input is generated with seed 20261031 and the row says "synthetic".
- Numbers never fail a run. A scenario that errors fails it. CI runs `node run.mjs --runs 1` on ubuntu to prove it runs.
- Bytes are exact and repeat; milliseconds depend on the machine, so compare ranges, not single numbers.

---

## Offline replay (method)

`bench/replay.mjs` replays real Claude Code transcripts through the v2 policy code and counts bytes.
It is not a model run. It measures what the v2 hooks would change in the bytes the model receives.
It does not measure answer quality, task success, or what the model does next.

## Input

- `~/.claude/projects/*/*.jsonl`, one file per session. Each file is read as a stream, line by line.
- Files larger than 200 MB are skipped. The count is logged (stderr and the aggregate JSON).
- Nothing from the transcripts is committed. Raw per-session rows (they hold session ids and paths) go to
  `/private/tmp/cm-v2-impl-private/bench/` only. Only aggregates go into the repo.

## Pairing

A `tool_use` block (assistant message: id, name, input) is paired with the `tool_result` block that has the
same `tool_use_id` (user message). Duplicate results for one id in one file count once.
Lines with `isSidechain: true` are subagent calls.

## Bytes before (v1 / native reality)

UTF-8 bytes of the `tool_result` text parts (a string, or the `text` blocks of a content array).
Image blocks are not counted; their number is logged. This is what the model received in that session.

## Bytes after (v2)

The v2 code is used as a library: `src/core/policy/decide.ts` (`decide`, `denyMessage`), the adapter row
for `claude-code` (`src/adapters/table.ts`), `src/core/sandbox/cap.ts` (`capBytes`),
`src/core/index/chunk.ts` and `select.ts` (`chunkText`, `selectChunksInMemory`), and the constants in
`src/core/contracts/constants.ts`. The build (`node build/build.mjs`) is run first to prove the tree builds.
The user deny list is empty. For each paired call:

| v2 decision | bytes after |
| --- | --- |
| allow | same as before |
| deny (PreToolUse) | bytes of the deny text. The tool does not run. |
| hint (PreToolUse) | bytes before + bytes of the hint text, when the throttle fires |
| ctx_* tool (own tool, any prefix form) | same as before ("as is") |
| subagent call, result > OUTPUT_CAP (PostToolUse case B/C replace) | bytes of the selected chunks that `selectChunksInMemory` returns, at most OUTPUT_CAP, with intent = tool input `description` |

Hint throttle is modelled in memory with the same rules as `throttle.ts`: bash, read, grep hints once per
session; other-MCP hint on calls 1, 11, 21 ... per session (MCP_HINT_EVERY = 10).
Subagent tool set is unknown in a transcript, so `toolSet = null` and the case is C (impl/08 B4).

## Known approximations (they are stated in the results too)

1. Read deny: `decide` reads the file size from disk. The files in old transcripts are gone or changed.
   The replay uses the bytes of the Read result as the size, with no offset and no limit in the input.
   The result has line-number prefixes, so this size is a little above the file size.
2. A deny removes the tool run. The model then usually calls `ctx_execute`, and that reply is not in the
   transcript. The main number counts the deny text only (the task definition). A second column,
   "re-run bound", adds `min(bytes before, OUTPUT_CAP)` for every deny, as an upper bound on that cost.
3. Many sessions in the corpus ran with v1 hooks or with context-mode tools. Their "before" bytes already
   hold v1 effects. The saving here is v2 on top of what the model received, not v2 against a bare client.
4. No quality check. A smaller byte count can lose information the model needed.

## Statistics

Per tool and corpus total: calls, bytes before, bytes after, saving % = (before - after) / before.
Per-session median and p90 of the saving %, over the sessions that made at least one call of that tool
(p90 = nearest rank). Tool names are grouped: built-in names as they are, own `ctx_*` tools as they are,
every other MCP tool as `mcp:other`, anything else as `other`.

## Run

```
npm install --ignore-scripts --no-package-lock
node build/build.mjs --out /tmp/cm-bench-release-out
node bench/replay.mjs [--out <aggregate.json>]
```

Output: the aggregate JSON (committed values are copied to `bench/RESULTS.md`, section "Offline replay")
and the private per-session rows in `/private/tmp/cm-v2-impl-private/bench/sessions.json`.
