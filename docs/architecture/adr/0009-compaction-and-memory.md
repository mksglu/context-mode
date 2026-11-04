# ADR-0009: State after compaction = budgeted greedy selection over the session journal

- Status: Accepted (2026-10-15). It replaces r1. The owner asked for an algorithm based on best practice, accepted `DECISIONS-r3.md` in full, and delegated the r4 fixes in `DECISIONS-r4.md`.
- Evidence: workflow `wf_5b7e35b3-72f`, topic `compaction-algorithm`: 19 findings verified, 2 unverified, 1 refuted. Raw output: `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/round4-evidence.json`. Prototype: `/tmp/wf4/sk/`.

## Best practice (sources)

- **Anthropic context editing:** clear the oldest tool results first, put a placeholder in their place, keep the last N (default 3). This is *observation masking*.
- **Anthropic memory tool:** "memory preserves the information that must survive summarization", kept as a progress log in an external store.
- **JetBrains, "The Complexity Trap"** (arXiv 2508.21433): observation masking "halves cost … while matching … LLM summarization".
- **Generative Agents:** score = recency decay + importance; take the best items that fit the budget.
- **What Claude Code restores itself after compaction:** CLAUDE.md, auto memory, git status, the plan, and up to 5 recently changed files. Context that hooks added earlier is summarized away. So our block must **not** repeat file contents; paths are enough.
- **Only re-injection point for Claude Code, Codex, Qwen, ZCode:** `SessionStart(source=compact)`; `PreCompact` never injects there. [V] live: a 234 B block reached the model whole.
- **A second path exists for Gemini, Copilot CLI, VS Code:** `PreCompact` writes a pending flag (`meta('pending_compact:'+sid)`); the next `UserPromptSubmit` hook performs the actual injection (see delivery table, §6). The "only re-injection point" claim above does not hold universally — it is scoped to the first group.
- **Reciprocal Rank Fusion** (Cormack et al., SIGIR '09): `1/(60+rank)` beat single rankers and Condorcet fuse on TREC runs. Used for cross-session ranking, §8.
- **Time-aware retrieval** (LongMemEval, arXiv:2410.10813): normalize timestamps to one shape before ordering or comparing. Used for `sort:"timeline"`, §8.
- **Mem0** (arXiv:2504.19413): update-beats-duplicate idea for memory rows, taken without its LLM step. Used for the `decision` tag design, §8.
- Measured, not preference: a 12-case deterministic sweep, 0 model calls, backs the unchanged weights below (`https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/memory-r6/eval/results.md`; `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/review/DECISIONS-r6.md` D1).
- Delivery mode per agent (DECISIONS-r6 D6) is measured, not preference: `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/memory-r6/eval/run2.mjs`, 20 real compaction points, 6 projects, scored in `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/memory-r6/eval/results.md`.

## v1 failures this fixes

- the snapshot had no byte budget
- text was cut (80 chars, 400 chars, 150 chars)
- the header contained the clock, so the output was not stable
- "unresolved errors" were never resolved, and resolution used regex
- eviction used fixed priority labels

## Decision

The block is a deterministic function of this session's journal rows. No LLM, no regex, and no text is ever cut: whole items are selected, or an item becomes a pointer.

### 0. Journal write path

One write path into the one shared `context.db` per project: the server writes journal rows from its own `ctx_*` handlers at handler-return time, for its own tool calls. Hooks (`PostToolUse`, `PostToolUseFailure`) write rows only for other adapters' host tools. Both paths use the single `#645` path resolver. This retires the earlier "server never writes" rule.

### 1. Journal (in `context.db`)

```
events(seq PK, session_id, worktree, agent, kind, tool, key, path, ok, exit_code, bytes, body, turn)
INDEX (session_id, kind, seq), (session_id, kind, key, seq)
```

Rows by kind:
- `prompt`: user prompts
- `edit`: Write/Edit file path, ok/fail
- `cmd`: shell / `ctx_execute`; key = tool + canonical command
- `toolerr`: other failed tools; key = tool + stable JSON of the input
- `index`: `ctx_index` source

How the values are computed, with no regex:
- **Canonical command:** a quote-aware state machine that only folds whitespace outside quotes.
- **exit_code:** read from the first line of the error with `startsWith("Exit code ")` and a digit loop.
- **Claude Code also registers PostToolUseFailure.** Without it, failures from host tools are never recorded. (`ctx_*` tool-call failures are still recorded by the server itself, per §0.)

### 2. Candidates

Every query has `WHERE session_id = :current`. An empty id means nothing is injected.

| Section | Rule |
|---|---|
| last request | the newest prompt, always included (pinned) |
| open errors | keys whose last failure is newer than their last success: **resolved structurally**, when the same command or input later succeeds |
| changed files | paths, last write wins, with an edit count |
| earlier requests | the other prompts |
| indexed sources | `ctx_index` sources |

Each section gives at most 85 candidates. That is ⌊2048 / 24⌋, the shortest possible line, so no more lines could fit anyway.

### 3. Score (integers only)

```
w      = open error 900 · prompt 500 · edit 400 · index 200
age    = current turn − item turn
decay  = 0.25 + 0.75 · 2^(−age/4)        half-life 4 turns, from a checked-in integer table
bonus  = 1 + ⌊log2(repeat count)⌋
score  = w · decay · bonus
```

A `decision` row (§8) is never a candidate here. The prompt row already holds the text; a second line would waste budget.

Scoring covers **sections**, not raw `EventKind` values: a `cmd` or `toolerr` row with `ok = 0` feeds the `open_errors` section (weight `WEIGHT.toolerr`, value `900`); a `cmd` row with `ok = 1` only resolves an existing open error, it is never itself a candidate; `cost` and `decision` rows are never candidates (DECISIONS-r9 F2/F8).

### 4. Selection: budgeted lazy greedy (knapsack by score/size)

- Budget **B = 2,048 UTF-8 bytes**: 5× under Claude Code's 10,000-char spill limit. This is the compaction-state budget only, separate from the global `OUTPUT_CAP = 16,384` B used elsewhere (ADR-0008, ADR-0016; Q2).
- `ratio = score · 0.7^k / bytes`, where k = lines already taken from that section. This decaying gain keeps the sections mixed.
- Take items in ratio order. An item that does not fit is skipped, and smaller ones may still fit.
- An item over 640 B is never cut. It becomes a pointer line: `#<seq> (<bytes> B) ctx_resume(seq:<seq>)`.
- `ctx_resume(seq:N)` is a primary-key read of the whole row, so a pointer is never a dead end.
- At most 340 candidates, O(m²) worst case: under 0.2 ms. Measured whole algorithm: 4.3–8.9 ms.

### 5. Render

```
<context_mode_state session="ID" upto="MAXSEQ">
… sections in a fixed order; lines in seq order …
more: ctx_search(queries:[…], scope:"session")
</context_mode_state>
```

- No clock, no user role, bare tool names, framed as data.
- **Same rows → same bytes.** [V] 10 runs out of 10 identical, and rows from other sessions are ignored.
- **The injected bytes must be byte-identical across every request within a turn** (#822 cache-prefix lesson): the block is computed once per turn, not re-rendered per request.

### 6. Delivery: one path per agent

Delivery now also depends on `compactSummary` (`adapters/table.ts`: `"host" | "none"`), per DECISIONS-r6 D6. `"host"` means the agent writes its own compact summary: after compaction, inject one pointer line only (no state block): `context-mode: earlier work of this session is in ctx_resume (state block) and ctx_search(scope:"session", sort:"timeline").` The 2,048 B block (§4, unchanged) is still computed on demand — `ctx_resume()` with no `seq` returns it. `"none"` means the full 2,048 B block is injected through the agent's row below, as before. Claude Code is `"none"` (D-M7-CL-1): the earlier `"host"` choice rested on `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/memory-r6/eval/run2.mjs` (pointer-only 0.85 vs 0.75), but T-CMP live failed arm (a), the pointer arm. Two runs, keyless, 10 sessions per arm, `--max-budget-usd 0.25` per session: Sonnet 5 low: correct 7/10 (gate 0.80), call rate 0/10 (gate 0.70). Re-measure on 2026-10-19, Sonnet 5.5 low: arm (a) correct 7/10, call rate 0/10; arm (b) 7/10, 0/10; (c) 7/10, 0/10; (d) 7/10, 0/10; (e) 7/10, 0/10; Opus 5.5 low, arm (a) only: correct 4/10, call rate 0/10 (3 sessions hit the cap). No session called `ctx_resume` or `ctx_search` after the reset turn, so the pointer line is not enough on its own. The row stays `"none"`: the full 2,048 B block is injected once after compaction. Clean re-measure 2026-10-21 (isolation from D-M7-CL-3: no host auto-memory, no CLAUDE.md, no claude.ai MCP; 0 of 50 sessions touched memory), Sonnet 5.5 low, 10 sessions per arm, all arms, 0.25 USD cap: correct (a) 7/10, (b) 7/10, (c) 7/10, (d) 7/10, (e) 7/10; ctx_resume/ctx_search call rate 0/10 in every arm; bytes returned by those tools 0 in all 50 sessions; cost (a) 0.8682, (b) 0.9114, (c) 0.9014, (d) 0.8898, (e) 0.9514, total 4.5222 USD. Every miss is fixture session-03 (case-sensitive exactMatch, open for the owner). Result: arm (a) still fails both gates, so claude-code stays "none" (D-M7-CL-1). Result file: e2e/live/compact/results/2026-10-21-sonnet-5-5-clean-all-arms.json. Result files: `e2e/live/compact/results/`. The `"host"` text of this section is kept for agents whose LV-COMPACT check passes. Every other agent stays `"none"` until its own LV-COMPACT live check (one per agent, milestone M3) shows the host writes a summary the model sees; then that row's column flips to `"host"`. Each flip is decided once per release by that agent's own live check, never re-decided per session (DECISIONS-r9 V9, V27). One path per agent, no fallback.

| Agent | Path |
|---|---|
| Claude Code, Codex, Qwen, ZCode | computed inside SessionStart(compact). No PreCompact hook, no precomputing |
| Gemini, Copilot CLI, VS Code | the compaction hook writes `meta('pending_compact:'+sid)`. The next prompt hook runs `DELETE … RETURNING` in a `BEGIN IMMEDIATE` transaction, so the injection happens exactly once |
| Pi | `session_compact` flag, then `before_agent_start`, once |
| OpenCode 2 | live test first (r1 notes still apply); delivered once, through a channel that keeps the prompt cache stable (Q12) |
| Kiro | not supported — no compaction signal of any kind; documented as a known gap for Q20+ (live test showed no `SessionStart(compact)` signal and no usable `PreCompact` substitute) |

Qwen sits in the `SessionStart(compact)` row above, not a separate "no PreCompact hook" row: Qwen does have a `PreCompact` hook, but it fires too early to carry enough state for the Gemini/Copilot CLI/VS Code pending-flag pattern, so `SessionStart(compact)` stays the delivery path for Qwen. This is confirmed, not an open question.

### 7. Memory

- There is no injected memory, and the role/intent classifier is removed.
- What the user decided are the user's own prompts.
- Auto-memory is only a search source inside `ctx_search`.

## Golden cases (GP6)

- the block is ≤ 2,048 B for a journal of 10,000 rows (#1022)
- no foreign session rows (#1274)
- an error fixed later is not listed
- the same rows give identical bytes
- an item over 640 B becomes a pointer, and `ctx_resume(seq)` returns it whole
- not the user role (#1263), bare tool names (#1028), no "directive" text (#911, #1259)
- a failed `ctx_execute` call with no `PostToolUse` fixture still produces a journal row (the server writes it at handler-return time, per §0)
- the one measured open-error miss (12-case sweep, DECISIONS-r6 D1) is a budget skip, not a scoring bug — if a future run shows a scoring bug, fix the bug; do not raise B
- an agent with `compactSummary: "host"` (DECISIONS-r6 D6) receives the pointer line only, never the 2,048 B block, unless `ctx_resume()` is called; an agent with `"none"` always receives the full block

## Open

- **O1. Earlier-error lookup:** BM25 alone beats RRF (0.72 vs 0.59). Candidate: lower the session list's weight for `toolerr` rows. Must be measured with `run.mjs` first. Source: `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/review/DECISIONS-r7.md`.
- **O2. File by topic:** 0.04 for every variant; text search cannot link a later prompt to an old edit row. Candidate without embeddings: store the turn's prompt tokens on each `edit` row. Must be measured first. Source: `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/review/DECISIONS-r7.md`.
- Hook budget: the whole SessionStart process is 48.6 ms p95, of which bare Node is 45.6 ms. See ADR-0008 "Open".
- Resume-quality eval (Memory-R6, 2026-10-16): `e2e/live/memory-r6/` holds a keyless, deterministic harness that scores `none`/`v1`/`v2` (this ADR)/`keeplastn`/`masking` on 12 real session cases. Deterministic sweep (12 cases, 0 model calls): `v2` holds the 2,048 B budget at 11-12/12 hit rate on naming the open error, last request, and changed files; `none`/`v1` carry no budget (155-191 KB mean); `keeplastn`/`masking` both drop below `v2` on naming the last request and changed files, the regression the research doc predicted. An LLM-judged quality pilot was started but stopped small (n=3) under time pressure — see `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/memory-r6/eval/results.md` for the exact numbers and the command to resume it.

## 8. Memory-R6 additions: `sort:"timeline"`, the `decision` tag, cross-session ranking

Owner decision (2026-10-16): yes to both `sort:"timeline"` and the `decision` tag, on the evidence in `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/review/DECISIONS-r6.md` (D2–D4). No embeddings, no LLM call at query time — same constraint as §0–§7.

### 8.1 `ctx_search sort:"timeline"`

```ts
interface CtxSearchInput {
  queries: string[];
  scope?: "session" | "project" | "global";   // default per PRD §8
  source?: string;
  offset?: number;                            // relevance mode only
  sort?: "relevance" | "timeline";            // default "relevance", v1 behavior unchanged
  after?: number;                             // timeline mode only; opaque seq cursor
}
```

Rules, in order:
1. **Sources.** `"timeline"` reads three sources: ContentStore (current session), SessionDB (prior sessions), auto-memory. `"relevance"` reads ContentStore only, as in v1.
2. **Scope first.** Apply `scope` to all three sources the same way. Always filter by the current `projectDir`/worktree. Fixes #663 (timeline leaked across projects) and the #895/#1294/#1302 class.
3. **Fetch.** Fetch up to `limit` rows from each source on its own (≤ 3·limit candidates). Never clip one source before the merge.
4. **Normalize.** Convert every timestamp to ISO-8601 UTC `YYYY-MM-DDTHH:MM:SS.sssZ` before any compare. Fixes v1's `9de1c658` bug (SQLite and ISO shapes mixed).
5. **Order.** Ascending by normalized timestamp (oldest first). Ties break by `seq` ascending. Rows with no `seq` (auto-memory files) sort after journal rows at the same timestamp, then by path ascending. Same input, same order.
6. **Page.** `after` is an epoch-ms timestamp cursor (M18), not `seq`: drop rows with normalized timestamp ≤ `after`, then cut to `limit` — except a page never ends inside a group of rows sharing one timestamp; it extends to the end of that group so no row is skipped between pages. Reply ends with `more: ctx_search({…, sort:"timeline", after:<ms>})` when rows remain (M22). `offset` with `sort:"timeline"` returns `isError` `INVALID_ARGS`; `after` with `"relevance"` returns the same error.
7. **Empty.** Empty `queries` is allowed in timeline mode; it returns the newest page in scope.
8. **Output.** Each line: `[<iso time>] <source> #<seq> <first line of row>`, cut by `capBytes(text, OUTPUT_CAP)`.

Sources: v1 `e7dbf587` (#367), `9de1c658`, `19cb64b1`, #663; time-aware retrieval, LongMemEval (arXiv:2410.10813).

### 8.2 The `decision` tag

The rule is structural, not a word list, and it never infers intent from prose. v1's keyword-and-shape approach is removed in full — it caused #856 (a casual phrase frozen as a standing directive) and the #895/D12 retune loop.

A journal row with `kind = "decision"` is written only when one of these is true:
1. **Tool answer.** `PostToolUse` for `AskUserQuestion` with a JSON `tool_response.answers`. Body: `Q: <question> → A: <label>`; multi-select labels joined with ` | `. A non-JSON response writes no row (fail-safe).
2. **Option echo.** The user's prompt, trimmed and case-folded, equals one option label from the `AskUserQuestion` call, or the numbered/lettered option list (`1.`, `2.`, `A)`, `B)` at line start) in the assistant's prior turn. Body: `A: <label>` plus `ref: #<seq of that turn>`. Plain string compare, no regex.

No marker-word list (`"decision:"`, `"let's go with"`, and similar) is used. A marker list tags one language's users only; this project does not assume English.

`EventKind` gains `"decision"`. Fields: `seq, session_id, turn, kind:"decision", key = <question text or "option">, body, ok = true`, written through the same `appendEvent` path (§0). The source prompt row is still written as `kind:"prompt"`; the decision row is extra, not a replacement.

**Not a compaction candidate.** §2's candidate list does not select `decision` rows (also noted there).

**`ctx_search source:"decision"`.** `"decision"` is a reserved source label:
- It searches journal rows with `kind = 'decision'` through FTS5, under the §8.1 rule-2 scope rules.
- `sort:"relevance"`: BM25 rank, tie-break `seq` descending (newest first).
- `sort:"timeline"`: §8.1 rules 4–8.
- Empty `queries` returns all decision rows in scope.
- A user source indexed under the label `"decision"` is renamed `decision (user)` at `ctx_index` time, so the reserved label stays unique.

Trade: recall drops — a decision typed as free prose stays a plain, searchable `prompt` row, not tagged. A missed tag costs nothing; a wrong tag caused a production loop (#856). Sources: LongMemEval fact-augmented keys; Mem0's update-beats-duplicate idea, without its LLM (arXiv:2504.19413).

### 8.3 Cross-session relevance ranking

`scope:"session"` with `sort:"relevance"`: v1 ContentStore BM25, unchanged. For `scope:"project"` or `"global"`, fuse two rank lists with Reciprocal Rank Fusion:

```
list_A = ContentStore + SessionDB FTS5 hits, ordered by bm25(chunks, 5.0, 1.0)   (title 5×, body 1×)
list_B = the same hit set, ordered by created_at desc (recency)
RRF(d) = 1/(60 + rank_A(d)) + 1/(60 + rank_B(d))        rank starts at 1
order  = current session first (#895), then RRF desc, then seq desc (M19), then ord asc
```

This reuses the RRF fusion already in v1's `store.ts` (`const K = 60`, `bm25(chunks, 5.0, 1.0)`), rather than adding a second scoring scheme. Not adopted: Generative Agents' weighted sum (needs embeddings and an LLM importance score); Mem0, A-MEM, Zep (LLM in the write or read path); MMR (v1's diversity cap from `604aba98` covers this instead). Source: Cormack et al., SIGIR '09.

### 8.4 Golden cases (GP6 extension)

- timeline sort gives identical merged order on repeated calls for the same journal state
- a timestamp tie is broken by `seq`, not source order
- `scope:"session"` on `sort:"timeline"` excludes SessionDB/auto-memory rows from other sessions
- `offset` with `sort:"timeline"`, and `after` with `sort:"relevance"`, both return `isError` `INVALID_ARGS`
- an `AskUserQuestion` tool answer writes a `decision` row; a free-prose message that merely looks like a decision does not
- an option echoed verbatim in the next prompt writes a `decision` row with the correct `ref` seq
- `decision` rows never appear in the compaction block's candidate list
- a fresh same-session hit outranks an older cross-session hit with a higher BM25 score (open item: GP5 case, #895, not yet measured)

## 9. Memory-R7: retrieval ranking, by measurement

Owner decision (2026-10-16): keep the design below on the evidence in `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/review/DECISIONS-r7.md`. Evidence: `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/memory-retrieval/eval/results.md` (90 real queries from 7 projects, gold labels from transcript structure only, no model calls).

### Measured

| Variant | recall@5 | MRR | p95 ms |
|---|---|---|---|
| v1 behaviour | 0.27 | 0.22 | 8.6 |
| BM25 only | 0.31 | 0.27 | 13 |
| **BM25 per scope + RRF k=60** | **0.48** | **0.41** | 27 |
| + MMR λ=0.7 | 0.47 | 0.40 | 27 |
| + `source:"decision"` filter | 0.48 | 0.41 | 28 |
| RRF k=20 / k=100 | 0.48 | 0.41 | 28 |

### Rule (current)

- **R1. Ranking = BM25 per scope (session, worktree, project) fused with RRF, k = 60.** Best overall; 1.8× v1. k is insensitive (20-100 equal), so the published default stays.
- **R2. No MMR.** No gain, about 2× latency.
- **R3. The `decision` tag stays structural (§8.2).** `source:"decision"` stays as a filter for the user; it gives no ranking gain.
- **R4. `sort:"timeline"` with the `after` cursor stays as written in §8.1.** Paging is complete on real data.
- **R5. Latency budget:** `ctx_search` p95 ≤ `SEARCH_P95_MS` (30 ms) on node:sqlite FTS5 with up to 17k journal rows (measured 27 ms).

Sources: `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/review/DECISIONS-r7.md`; `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/memory-retrieval/eval/results.md`.

## Changes

- 2026-10-21 (DECISIONS-r11): push, not pull. §3/§4: decision rows score (`WEIGHT.decision` 700) and are the `decisions` section of the state block, after edited files (supersedes DECISIONS-r6 D3 and the r9 F2/F8 "decision never a candidate" clause). New turn-boundary recall: after a compaction, each `UserPromptSubmit` injects whole journal rows ranked by BM25 against the prompt (`RECALL_MIN_SCORE`, `RECALL_BUDGET_BYTES`, no repeat per session, §8 scope rules); zero bytes when the session had no compaction.
- 2026-10-16 (DECISIONS-r9): §3 names which sections/kinds score (F2/F8: `cmd`/`toolerr` with `ok=0` feed `open_errors`, `cost`/`decision` never candidates); §6 adds the T-CMP fail-back for Claude Code and the per-release, per-agent flip rule (V9, V27); §8.1 `after` fixed to an epoch-ms cursor, not `seq` (M18), with the paging line to match (M22); §8.3 tie-break fixed to `seq` desc then `ord` asc (M19).
- 2026-10-14 (fix-r4, owners.adr-b): added the single journal write path, §0 (A4); added the byte-identical-per-turn rule (A49); scoped the "only re-injection point" claim to Claude Code/Codex/Qwen/ZCode and named the Gemini/Copilot CLI/VS Code second path (B26); resolved Kiro as unsupported with a documented gap, and clarified Qwen's delivery path (B12, B23).
- 2026-10-15: status set to Accepted. Folded r3's Q12 into the OpenCode 2 delivery row and Q2 into the budget line in §4; removed the standalone r3 section.
- 2026-10-16 (Memory-R6): added §8 — `sort:"timeline"` semantics, the literal-cue `decision` tag, and RRF-based cross-session ranking, sourced from `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/memory-r6/research-memory.md`.
- 2026-10-16 (DECISIONS-r6): rewrote §8 to the structural `decision` rule (tool answer + option echo only, no marker-word list); added the exact `CtxSearchInput` contract and reserved `source:"decision"`; added citations (Cormack SIGIR '09, LongMemEval arXiv:2410.10813, Mem0 arXiv:2504.19413) to the sources list; noted `decision` rows are not compaction candidates in §2; added the GP6 budget-skip case and the §8.4 GP6 extension.
- 2026-10-16 (DECISIONS-r6 D6): §6 delivery now keys on `compactSummary` (`"host" | "none"`); Claude Code is `"host"` and gets a pointer line only, every other agent stays `"none"` until its LV-COMPACT check (M3); added the matching GP6 case; cited `run2.mjs`/`results.md` in Sources.
- 2026-10-16 (DECISIONS-r7): added §9 — retrieval ranking R1-R5 with the measured table (BM25 per scope + RRF k=60, no MMR), sourced from `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/memory-retrieval/eval/results.md`; added O1/O2 to Open.
- 2026-10-19 (T-CMP re-measure, Sonnet 5.5 and Opus 5.5): §6 states that Claude Code stays `"none"`, with the measured numbers (arm (a) correct 7/10 and 4/10, call rate 0/10); D6 is not restored.
- 2026-10-21 (T-CMP clean re-measure, Sonnet 5.5): §6 notes add the clean numbers (all arms correct 7/10, call rate 0/10); the row stays "none".
- 2026-10-24 (compact round 2, `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/spikes/compact/RESULT.md`): the MCP server takes the host session id from `CLAUDE_CODE_SESSION_ID` (D-CR2-SID-1), and every PostToolUse replacement ends with a handle line naming the stored source and size (D-CR2-HANDLE-1). compact-hard main 13.9% -> 44.4% (sonnet-5-5), 62.5% (opus-5-5, n=2); heldout 16.7%. §6 delivery is unchanged.
- 2026-10-24 (compact round 3, `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/spikes/compact/RESULT.md`): three builds measured (head, r3-handle, r3-combined = handle + r3-ledger line units). compact-hard main mean of two runs 19.4% / 20.8% / 100%, heldout 27.8% / 44.4% / 100%; M2 main 78.97 / 85.02 / 86.56. No build meets M2 main >= 90, so the pick rule merges nothing and the Decision sections are unchanged. Line units stay on exp/r3-combined.
- 2026-10-24 (compact round 4, `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/spikes/compact/RESULT.md`): exp/r4-final (r3-combined line units + recall block, short-id handle, M2 JSON digest) merged into v2-design. compact-hard main mean of two interleaved runs 100% vs HEAD 41.65%, heldout 18/18; tokens after compaction median about 11.7k vs 45-67k.
