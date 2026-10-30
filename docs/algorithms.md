# Algorithms

Each entry: what it does, why we chose it, source, measured result, constants, code location.
Numbers come from `docs/v2/benchmarks.md`, `docs/v2/prompt/results.md` and the `docs/v2/review/DECISIONS-r*.md` files (see per-row source).
Every number has a source file and a date. A number with no measured source is not written here.

## 1. Shell parser + deny rules

**What:** `parseShell(cmd)` splits a shell command string into its parts (pipes, `&&`, `bash -c`, heredocs)
without running it, so the enforcement layer can check each part. It never throws. The deny step then checks
each part against `permissions.deny` and the built-in safety rules (WebFetch). Bash size-guess denies (curl/wget, inline HTTP) are removed where the agent supports post-run replace (DECISIONS-r10).

**Why:** A single regex over the raw string misses a command hidden inside `bash -c "..."` or a heredoc. The
parser recurses into those forms instead.

**Source:** `docs/v2/impl/08-enforcement.md` §2.3, ADR-0008.

**Measured:** not a timed benchmark; correctness is proven by the enforcement test suite (§6, `14-tests.md`).

**Constants:** none (no byte or time limit; rule is structural, not numeric).

**Code:** `src/core/policy/` (`lexer.ts`, `parse.ts`, `unwrap.ts`, `decide.ts`, `user-deny.ts`).

## 2. Read size rule

**What:** On a `Read` call with no `offset`/`limit`, if the real file size is over `OUTPUT_CAP`, the call is
denied. The deny message always states the real byte count and offers three ways to get the data: a ranged
Read, `ctx_execute` with `file`, or `grep`/`tail`. No part of the file is ever truncated and returned.

**Why:** A hint-then-allow path was tried and removed (DECISIONS-r10); the model often ignored the hint and the full file still landed in
context. A deny with no path around it is the only rule that holds every time.

**Source:** `docs/v2/adr/0008-enforcement-rewrite-and-cap.md`; `docs/v2/impl/00-architecture.md` §3.2.

**Measured:** `READ_MAX_LINES` (200) is text only, not enforced — on denied reads the median line is 48,848
bytes, so a 200-line slice would still exceed `OUTPUT_CAP` in 30.8% of cases (`DECISIONS-r8.md`). This is why
the rule denies rather than slices.

**Constants:** `OUTPUT_CAP = 16384` B; `READ_MAX_LINES = 200` (example text only).

**Code:** `src/core/policy/decide.ts` (PreToolUse path), `08-enforcement.md` §2.6/§5.3.

## 3. Compaction state selection (budgeted greedy)

**What:** After a context compaction, the block re-injected into the model is built by scoring every row in
the session's journal (tool errors, prompts, edits, index writes) and greedily picking the highest-scoring
rows until a byte budget is used up. No row's text is ever cut; a row that cannot fit whole becomes a pointer
instead.

**Why:** Cutting text at fixed character counts (80, 400, 150) with a clock-stamped header makes output
never stable and never reproducible. A deterministic score-then-select pass over the journal, with no LLM
call and no regex, fixes both.

**Source:** ADR-0009; best-practice basis: Anthropic context editing (observation masking), Generative
Agents (recency decay + importance), JetBrains "The Complexity Trap" (arXiv 2508.21433).

**Measured:** weights unchanged after a 12-case deterministic sweep, 0 model calls (`tickets/memory-r6/eval/results.md`,
`DECISIONS-r6` D1) — no tested alternative weighting beat the current one.

**Constants:** `STATE_BUDGET = 2048` B; `POINTER_MIN = 640` B; `MAX_CANDIDATES = 85` per section;
`WEIGHT = {toolerr:900, prompt:500, edit:400, index:200}`; `DECAY_HALF_LIFE_TURNS = 4`.

**Code:** `src/core/compaction/` (`candidates.ts`, `score.ts`, `render.ts`; ADR-0009 §1-§7).

## 4. BM25 per scope + RRF across scopes

**What:** `ctx_search` ranks results inside one scope (session or project) with BM25 (SQLite FTS5's built-in
ranking). When the scope is `"project"` and the request wants cross-session relevance, the BM25 rank list is
fused with a separate recency rank list by Reciprocal Rank Fusion: `1/(RRF_K + rank)` per list, summed.

**Why:** RRF needs no score normalization and is proven on TREC runs against single rankers and Condorcet
fuse (Cormack et al., SIGIR '09). It lets two different kinds of ranking (text match, recency) combine
without one swamping the other.

**Source:** `docs/v2/impl/05-tools-index.md` §5 step 5; ADR-0009 §8.3/§9; Cormack et al., SIGIR '09.

**Measured:** an MMR (diversity) step on top of RRF was tried and dropped: no gain, about 2x latency at p50,
equal at p95 (`DECISIONS-r7`, `tickets/memory-retrieval/eval/results.md`). Search itself measured 27 ms
against a 30 ms target (`SEARCH_P95_MS`).

**Constants:** `RRF_K = 60`; `SEARCH_PAGE_SIZE = 20` per source before merge (decision list page); `SEARCH_REPLY_HITS = 5` hits per `ctx_search` relevance reply (D-SEARCH-REPLY-1); `SEARCH_P95_MS = 30` (target).

**Code:** `src/core/tools/search.ts` (per `05-tools-index.md`).

## 5. Decision tag (update-beats-duplicate)

**What:** A memory row written as a "decision" updates the existing row for the same subject instead of
adding a duplicate. The tag is structural (part of the row shape), not a judgment made by a model call.

**Why:** Taken from Mem0's update-beats-duplicate idea for memory rows (arXiv:2504.19413), but without its
LLM step — the match is done by the row's own key, not by asking a model if two rows mean the same thing.

**Source:** ADR-0009 §8 (Decision), citing Mem0 arXiv:2504.19413.

**Measured:** not separately timed; it is part of the same deterministic journal-selection pass as §3, so it
shares that pass's "no LLM, no regex" guarantee.

**Constants:** none beyond the shared selection constants in §3.

**Code:** `decision` event kind in `src/core/journal/` and `ctx_search(source:"decision")` (`00-architecture.md`; ADR-0009 §8).

## 6. Timeline cursor

**What:** `ctx_search(sort:"timeline")` orders rows by real time, using an epoch-millisecond cursor (`after`)
rather than the row id (`seq`), so paging keeps working even if rows from two different sources interleave.

**Why:** Time-aware retrieval research (LongMemEval, arXiv:2410.10813) found that timestamps need one
shape before they can be ordered or compared; an id-based cursor does not give that.

**Source:** `docs/v2/impl/05-tools-index.md` §5 (DECISIONS-r9, M18); LongMemEval arXiv:2410.10813.

**Measured:** no separate benchmark; covered by the same `SEARCH_P95_MS = 30` ms target as BM25 search (§4),
measured at 27 ms.

**Constants:** `after` is an epoch-ms timestamp, not `seq` (M18).

**Code:** `src/core/tools/search.ts`.

## 7. Replace path: chunk, index, select (run, then replace)

**What:** When a host tool result (not `ctx_*`) is larger than `REPLACE_TRIGGER_BYTES`, the PostToolUse hook
splits it into line-aligned chunks of at most `REPLACE_CHUNK_BYTES` (`chunkText`), writes all chunks to the
FTS5 index, and gives the model whole chunks only, picked by BM25, up to `REPLACE_RETURN_BYTES`, plus a
`ctx_search(...)` line that reaches every chunk not shown. The same path serves subagent case C (ADR-0016).
Output at or under `SYNC_INDEX_MAX_BYTES` is indexed inside the hook call; above that size the chunks are
scored in memory and the FTS5 write is detached, after the hook has returned.

**Ranking:** chunks are ranked by BM25 (`rankTexts`, the store's own tokenizer). The query is the tool intent
(description, else command, file path, pattern or URL) plus the words of the session's last user prompt,
matched by any word (`mode "any"`; D-M7-SV-5, D-M7-RR-3). With no prompt, the intent alone ranks. Equal score:
the later chunk first. Selected chunks are shown in reading order. A chunk that does not fit is skipped and a
smaller one may still fit. Nothing is cut and no regex filters the text (owner rule).

**Why:** A Bash size-guess deny costs more than it saves (offline replay of 820 sessions, DECISIONS-r10), and
hints did not pay for themselves. After the run the real size is known. Claude Code ignores a replace that does
not match the Bash output shape `{stdout, stderr, interrupted}`, so the adapter builds that shape (D-M7-SV-1).
Past a size line the write moves off the hook's critical path because of the hook budget
(`HOOK_COMBINED_P95_MS = 60` ms).

**Source:** `docs/v2/review/DECISIONS-r10.md`; `docs/v2/impl/05-tools-index.md` §5 `selectChunksInMemory`
(DECISIONS-r9 F1); `docs/v2/impl/DEVIATIONS.md` D-M7-RR-1..3, D-M7-SV-1..5.

**Measured:** saving score, median of 3 runs (`bench/saving-score.mjs`, v2-design `980272a5`, 2026-10-21): offline M1 94.21,
live M2 87.23 (runs 89.32, 85.83, 87.23); target 90, M2 not met; `guardsOk` false in all 3 runs (gate guard, layer
`check-removed`). Live proof: outputs of 8,893 to 60,090 bytes reached the model as 152 to 190 chars, answer right 16 of 16
(2026-10-21). Rounds are in `docs/v2/benchmarks.md` "Saving loop". Sweeps of
the return and chunk sizes (offline replay, same corpus) are in D-M7-SV-2 and D-M7-SV-3. Hook-path cost:
`docs/performance.md`.

**Constants:** `REPLACE_TRIGGER_BYTES = 4096` B; `REPLACE_RETURN_BYTES = 96` B (was 1024, then 512);
`REPLACE_CHUNK_BYTES = 48` B (was 256); `SYNC_INDEX_MAX_BYTES = 65536` B; `MAX_CHUNK_BYTES = 4096` B (search index
chunks); `INDEX_WRITE_CHUNK = 1048576` B; `SNIPPET_MAX_BYTES = 800` B (under floor(`OUTPUT_CAP` / `SEARCH_PAGE_SIZE`) = 819).
`OUTPUT_CAP = 16384` B stays the cap for replies and the Read deny threshold.

**Code:** `src/core/hooks/dispatch.ts` (PostToolUse step 5, `lastPrompt`), `src/core/index/chunk.ts`,
`src/core/index/select.ts` (`selectChunksInMemory`), `src/core/store/fts.ts` (`rankTexts`).

## 8. WAL mode + busy timeout

**What:** The one SQLite database per project (`context.db`) runs with `PRAGMA journal_mode = WAL` and
`PRAGMA busy_timeout = 5000`. Under WAL, readers never block on a writer's `BEGIN IMMEDIATE`.

**Why:** Several processes — the MCP server and hook calls from the same session — can hit the database at
close to the same moment. WAL plus a busy timeout is SQLite's own answer to that, and needs no extra lock
file or queue in our code.

**Source:** `docs/v2/impl/02-store.md` lines 105-106, 359.

**Measured:** not separately benchmarked; `DB_TIMEOUT_MS = 5000` is the driver-side mirror of the same
pragma value, so client and database agree on one wait limit.

**Constants:** `DB_TIMEOUT_MS = 5000` ms (ADR-0002, PRD §4); `busy_timeout = 5000`.

**Code:** `src/core/store/db.ts` (per `02-store.md`).

## 9. Process-tree kill

**What:** `killTree(pid)` stops a whole process tree, not just the top process. On POSIX it sends `SIGTERM`
to the negative PID (the process group), waits `KILL_GRACE_MS`, then sends `SIGKILL` the same way if the
process has not exited. On Windows it runs `taskkill /F /T /PID` instead, since Windows has no POSIX process
groups.

**Why:** A child process (for example a test runner) can itself spawn children. Killing only the top PID
leaves those running. This mechanism is proven, so it stays rather than moving to a Windows Job Object,
pending a live check.

**Source:** `docs/v2/impl/03-sandbox.md` lines 155-171, 221-225, 295 (A6); PRD §9; TECH-SPEC GP4.

**Measured:** T-F5 (Windows-only live check, GP4): spawn a child that spawns a grandchild with no
intermediary shell, call `killTree` on the top PID, confirm the grandchild is gone within `KILL_GRACE_MS`.
Not yet run at this commit — see `DEVIATIONS.md`.

**Constants:** `KILL_GRACE_MS = 1000` ms; `EXIT_SIGTERM_MS = 2000` ms; `EXIT_SIGKILL_MS = 5000` ms.

**Code:** `src/core/sandbox/` (`killTree`, `spawn.ts`).

## Context-saving numbers (whole system)

| Metric | Value | Source, date, agent |
|---|---|---|
| Live proof, bytes the model saw (4 sizes x git/non-git x 2 = 16 runs) | full 8,893 / 19,998 / 28,003 / 60,090 bytes; model saw 152 / 187 / 182 / 190 chars; correct 16/16 | `docs/v2/benchmarks.md` "Replace live proof (final)", `980272a5`, 2026-10-21, Claude Code 2.1.303, claude-sonnet-5-5 low |
| Final A/B, large tasks, median tool_result bytes | off 4,694.5; with the plugin 734.5 | `bench/live/results/ab-final2.json`, `docs/v2/benchmarks.md`, 2026-10-21 |
| Final A/B, large tasks (36 sessions), median session tokens | off 55,897; with the plugin 60,390; 12/12 pass per arm | same |
| Final A/B, small tasks (45 sessions), median session tokens | off 36,184; with the plugin 38,210; 15/15 pass per arm; fixed plugin cost about 2,000 tokens | same |
| Saving score, median of 3 runs | M1 94.21, M2 87.23, `guardsOk` false (gate guard) | `bench/saving-score.mjs`, `980272a5`, 2026-10-21 |
| Offline replay, corpus byte saving (23175 tool calls, 820 sessions; old policy with hints) | 1.1%; -1.5% with the re-run bound | `docs/v2/benchmarks.md`, 2026-10-19, Claude Code transcripts mostly 2.1.149 to 2.1.283 |
| Offline replay, Read byte saving (28 denies of large unranged reads) | 21.2%; 10.4% with the re-run bound | same |
| Live routing, run 4, under / over (new rule, `ROUTE_BYTES` 2048) | under 0/20 all models; over 0, 0, 1 of 20 | `docs/v2/prompt/results.md`, 2026-10-19, Claude Code 2.1.303 |

Hook latency against the GS6 budgets is in `docs/performance.md`.
