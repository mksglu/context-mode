# 06 — Module `tools-session`: implementation spec

Owner module: `tools-session` (00-architecture.md §1). This file is the exact spec for every file that module owns: `ctx_resume`, `ctx_stats`, `ctx_purge`, and the compaction pipeline (`candidates.ts`, `score.ts`, `render.ts`) that `ctx_resume` and the `SessionStart(compact)` path both call.

Write code in this order, because each file is a direct dependency of the next:

1. `src/core/compaction/candidates.ts`
2. `src/core/compaction/score.ts`
3. `src/core/compaction/render.ts`
4. `src/core/tools/resume.ts`
5. `src/core/tools/stats.ts`
6. `src/core/tools/purge.ts`

All six files import only from `src/core/contracts/*`, `src/core/store/*`, `src/core/journal/*`, `src/core/project/*`. No file in this module opens a DB connection directly — all reads/writes go through `openDb()` / `withWrite()` from `src/core/store/db.ts` (00-architecture.md §1, "one path, no fallback chains", PRD P1).

This module owns none of its own constants (DECISIONS-r9 §C). Every value below is defined once in `src/core/contracts/constants.ts` §3.2 (owned by `impl/00-architecture.md`); this file only cites the name.

| Name used here | Was named (now retired) | Source |
|---|---|---|
| `STATE_BUDGET` | `COMPACTION_BUDGET_BYTES` | 00 §3.2, value `2048`, ADR-0009 §4 |
| `MAX_CANDIDATES` | `MAX_CANDIDATES_PER_SECTION` | 00 §3.2, value `85` (⌊2048/24⌋), ADR-0009 §2 |
| `MAX_CANDIDATES_TOTAL` | — | 00 §3.2, value `340`, ADR-0009 §4 |
| `POINTER_MIN` | `POINTER_THRESHOLD_BYTES` | 00 §3.2, value `640`, ADR-0009 §4 |
| `WEIGHT.toolerr` | `SCORE_WEIGHT_OPEN_ERROR` | 00 §3.2, value `900`, ADR-0009 §3; feeds the `open_errors` section from `cmd`/`toolerr` rows (DECISIONS-r9 F2) |
| `WEIGHT.prompt` | `SCORE_WEIGHT_PROMPT` | 00 §3.2, value `500`, ADR-0009 §3 |
| `WEIGHT.edit` | `SCORE_WEIGHT_EDIT` | 00 §3.2, value `400`, ADR-0009 §3 |
| `WEIGHT.index` | `SCORE_WEIGHT_INDEX` | 00 §3.2, value `200`, ADR-0009 §3 |
| `DECAY_HALF_LIFE_TURNS` | — | 00 §3.2, value `4`, ADR-0009 §3 |
| `DECAY_X1000` | — | 00 §3.2, a checked-in 128-entry integer array, ADR-0009 §3; entry `i` = `Math.round(1000 * (0.25 + 0.75 * 2 ** (-i / DECAY_HALF_LIFE_TURNS)))`; age past 127 uses entry 127 (M6) |
| `RATIO_SECTION_DECAY` | — | 00 §3.2, value `0.7`, ADR-0009 §4 |
| `RESUME_CAP` | — | 00 §3.2, value `2048` (same bytes as `STATE_BUDGET`, separate name because it bounds `ctx_resume()`'s no-`seq` reply, not the render budget; V21, issue #1022) |
| `OUTPUT_CAP` | `16384` | PRD §8, Q2 — reused, not redefined, by `ctx_stats` and `ctx_purge` replies |
| `DOCTOR_REPORT_CAP_BYTES` | `4096` | PRD §13 — referenced only as the sibling cap in error text; owned by `tools-ops` |

Every step below names the current column; do not use a retired name in new code.

## Shared types (owned by `contracts`, consumed here)

`EventKind` (7 values: `"prompt" | "edit" | "cmd" | "toolerr" | "index" | "cost" | "decision"`, ADR-0009 §8.2) is owned by `src/core/contracts/types.ts` §3.1. This module **imports** it (`import type { EventKind } from "../contracts/types"`) and does not redefine it — a local 6-value copy is a bug (DECISIONS-r9 F2/F8).

Add to `src/core/contracts/types.ts` if absent. This module treats these as read-only inputs:

```ts
export interface EventRow {
  seq: number;
  sessionId: string;
  worktree: string;
  agent: string;
  kind: EventKind;
  tool: string | null;
  key: string | null;
  path: string | null;
  ok: boolean | null;
  exitCode: number | null;
  bytes: number;
  body: string;
  turn: number;
}

export type CandidateSection =
  | "last_request"
  | "open_errors"
  | "changed_files"
  | "earlier_requests"
  | "indexed_sources";

export interface Candidate {
  section: CandidateSection;
  seq: number;
  turn: number;
  text: string;       // whole line, never pre-cut
  bytes: number;       // UTF-8 byte length of `text`
  repeatCount: number;  // how many journal rows this candidate folds (same key)
  pinned: boolean;      // true only for the single "last_request" row
}

export interface ScoredCandidate extends Candidate {
  score: number; // integer
}
```

`EventRow.kind === "cost"` is Assumption A7 (00-architecture.md): `ctx_stats` is the only reader of `cost` rows; `candidates.ts` never selects them.

---

## 1. `src/core/compaction/candidates.ts`

ADR-0009 §2. Covers E2E: GP6 ("Journal + resume"), live case `v1-migration` not applicable here — this file's proof case is GP6's "no foreign session rows" and "an error fixed later is not listed" rows. ADR-0017 `covers`: `src/core/compaction/candidates.ts`.

### Export

```ts
export function buildCandidates(
  db: Database,
  sessionId: string,
  upToSeq: number,
): Candidate[];
```

Superseded (intern M4 Q9, Q10; DEVIATIONS D-M4-arch-2, D-M4-S1-3): the code is `buildCandidates(rows: readonly JournalRow[], sessionId: string): CandidateSet`, pure over rows the caller already read with `readSessionEvents` (no DB handle, no `upToSeq`). `CandidateSet` holds the five sections, each `seq` ascending. Each candidate also carries `query: string | null`, the `more:` entry render adds when it skips that candidate (M11): `key` for open errors and indexed sources, `path` for changed files, `null` for prompts.

### Inputs
- `db`: an open handle from `openDb()`, read-only use only.
- `sessionId`: the current session id. An empty string is a caller bug, not a DB condition — see Errors.
- `upToSeq`: the highest `seq` to include (the compaction turn boundary, GP6 "byte-identical across every request within a turn").

### Output
An array of `Candidate`, unsorted across sections, each section internally in `seq` ascending order, capped at `MAX_CANDIDATES` per section and `MAX_CANDIDATES_TOTAL` overall (drop the oldest `seq` first when a section is over cap, since the newest rows are always more relevant — ADR-0009 §2 names the cap but not the drop order; this is an Assumption, see end of file).

### Steps

1. Run one query: `SELECT * FROM events WHERE session_id = :sessionId AND seq <= :upToSeq ORDER BY seq ASC`. A missing or empty `sessionId` returns `[]` immediately before the query runs (ADR-0009 §2: "An empty id means nothing is injected").
2. Build **last request**: the row with `kind = 'prompt'` and the highest `seq`. One `Candidate`, `section: "last_request"`, `pinned: true`. If no prompt row exists, this section is empty — not an error.
3. Build **open errors**: for every distinct `key` among rows with `kind` in (`cmd`, `toolerr`) and `ok = false`, find its latest row. Include it only if there is no later row with the same `key` and `ok = true` ("resolved structurally", ADR-0009 §2). One `Candidate` per surviving `key`, `section: "open_errors"`.
4. Build **changed files**: for every distinct `path` among rows with `kind = 'edit'`, take the latest row (last write wins) and the count of rows sharing that `path` as `repeatCount`. One `Candidate` per `path`, `section: "changed_files"`.
5. Build **earlier requests**: every `kind = 'prompt'` row except the one chosen in step 2. One `Candidate` per row, `section: "earlier_requests"`.
6. Build **indexed sources**: every `kind = 'index'` row, one `Candidate` per row (by `key`, the index source label), `section: "indexed_sources"`.
7. For each candidate, build `text` using the exact per-section line format from `render.ts` §3 (M4: `last_request` → `now: <body>`; `open_errors` → `error #<seq> <tool>: <key>`; `changed_files` → `edited <path> x<repeatCount>`; `earlier_requests` → `asked #<seq>: <body>`; `indexed_sources` → `indexed <key>`; the row's `body` is its first line only, with `\n`/`\r` folded to a single space). Section headers are never rendered; section order alone carries meaning. Set `bytes = Buffer.byteLength(text, "utf8")`; assert `bytes >= 1` (M9 — every format above has a non-empty prefix, so an empty line can never occur).
8. For each section, if its candidate count exceeds `MAX_CANDIDATES`, keep the `MAX_CANDIDATES` candidates with the highest `seq` and drop the rest.
9. Concatenate all five sections' candidates. If the total exceeds `MAX_CANDIDATES_TOTAL`, drop the lowest-`seq` candidates, keeping `last_request` pinned regardless of its `seq`.
10. Return the array.

### Errors
This function never throws on a well-formed `db` handle. A DB-open failure is the caller's (`resume.ts`) problem, not this function's — it receives an already-open `db`.

### Constants used
`MAX_CANDIDATES`, `MAX_CANDIDATES_TOTAL`.

---

## 2. `src/core/compaction/score.ts`

ADR-0009 §3. E2E: GP6 "priority polarity" row. `covers`: `src/core/compaction/score.ts`.

### Export

```ts
export function scoreCandidates(
  candidates: Candidate[],
  currentTurn: number,
): ScoredCandidate[];
```

### Steps

1. For each candidate, pick `w` by section: `last_request` and `earlier_requests` → `WEIGHT.prompt`; `open_errors` → `WEIGHT.toolerr`; `changed_files` → `WEIGHT.edit`; `indexed_sources` → `WEIGHT.index`.
2. `age = max(0, currentTurn - candidate.turn)`.
3. Compute `decayTable`: a checked-in integer lookup indexed by `age`, precomputed once at module load as `Math.round(1000 * (0.25 + 0.75 * 2 ** (-age / DECAY_HALF_LIFE_TURNS)))` for `age` in `0..127`, clamped to the `age = 127` value beyond that (ADR-0009 §3: "a checked-in integer table"). This keeps the formula integer-only at call time.
4. `decay = decayTable[min(age, 127)]`.
5. `bonus = 1 + Math.floor(Math.log2(Math.max(1, candidate.repeatCount)))`.
6. `score = Math.round(w * decay * bonus / 1000)` (the `/1000` undoes the ×1000 scaling baked into the decay table so `score` stays a plain integer close to `w` in magnitude).
7. `last_request`'s score is set to `Infinity` only for selection purposes — `render.ts` always takes it first regardless; `score.ts` itself returns the computed integer, not `Infinity` (pinning is a selection-time rule, ADR-0009 §4, not a scoring-time rule).
8. Return the input array with `score` attached, same order.

### Errors
None. `currentTurn < candidate.turn` cannot happen from `buildCandidates` output; if it does (caller bug), `age` clamps to 0 rather than going negative.

### Constants used
`WEIGHT.toolerr`, `WEIGHT.prompt`, `WEIGHT.edit`, `WEIGHT.index`, `DECAY_HALF_LIFE_TURNS`.

---

## 3. `src/core/compaction/render.ts`

ADR-0009 §4–§5. E2E: GP6 golden ("≤ 2,048 B for a journal of 10,000 rows" #1022; "the same rows give identical bytes"; "an item over 640 B becomes a pointer, and `ctx_resume(seq)` returns it whole"). `covers`: `src/core/compaction/render.ts`.

### Export

```ts
export function renderState(
  scored: ScoredCandidate[],
  sessionId: string,
  upToSeq: number,
): string;
```

Superseded (DEVIATIONS D-M4-arch-2, D-M4-S1-1): the code is `renderState(rows: readonly JournalRow[], turn: number): string`; it runs candidates, score and render itself, and takes the session and `upto` from the highest-`seq` row.

Returns the exact `<context_mode_state>` block, ≤ `STATE_BUDGET` UTF-8 bytes.

### Steps (budgeted lazy greedy, ADR-0009 §4)

1. Separate the pinned `last_request` candidate (if present) from the rest.
2. `reserved` = the byte length of the open tag line, the close tag line, and an empty `more: ctx_search(queries:[],scope:"session")` line (M12 — reserved before any item is placed, so the wrapper and an empty `more:` line always fit). `budget = STATE_BUDGET - reserved`. `used = 0` (bytes). If the pinned candidate exists, append its line, `used += pinned.bytes + 1` (newline), regardless of ratio — it is always taken first.
3. For every remaining candidate, maintain a per-section counter `k` starting at 0, incremented each time a candidate from that section is taken. Compute `ratio = candidate.score * (RATIO_SECTION_DECAY ** k) / candidate.bytes`.
4. Sort remaining candidates by `ratio` descending. This sort is recomputed once up front using `k = 0` for all (ADR-0009 §4 names ratio order, not a re-sort per pick); ties break by descending `seq` for determinism (M25 — newest first; fixes this file's earlier "ascending" text). Superseded by DEVIATIONS D-M4-S1-4 (intern M4 Q5): there is no one-time sort; each pick takes the best ratio with the live per-section `k`, so the `0.7^k` term has an effect.
5. Walk the sorted list once. For each candidate:
   a. If `candidate.bytes > POINTER_MIN`, replace its line with a pointer line: `` #<seq> (<bytes> B) ctx_resume(seq:<seq>) `` and use the pointer's own byte length for the budget check (ADR-0009 §4: "An item over 640 B is never cut. It becomes a pointer line.").
   b. If `used + lineBytes + 1 <= budget`, take it: append the line to its section's output, `used += lineBytes + 1`, increment that section's `k`.
   c. Otherwise skip it, add its `more:` query (M11, next step) and continue (ADR-0009 §4: "An item that does not fit is skipped, and smaller ones may still fit.").
6. Assemble the fixed section order: `last_request`, `open_errors`, `changed_files`, `earlier_requests`, `indexed_sources`; within a section, lines in ascending `seq` order (ADR-0009 §5).
7. Wrap:
```
<context_mode_state session="<sessionId>" upto="<upToSeq>">
<section lines, in the order from step 6, one per line, no blank lines between sections>
more: ctx_search(queries:[…], scope:"session")
</context_mode_state>
```
The `more:` line's `queries` array (M11) holds one entry per candidate dropped in step 5c: `key` for an `open_errors` or `indexed_sources` candidate, `path` for a `changed_files` candidate; a dropped `last_request`/`earlier_requests` (prompt) candidate adds no query. Dedup by exact string match. Order the surviving entries by ascending `seq` of the candidate that produced them. The array fills the `reserved` bytes computed in step 2 (M12): add entries, in that order, while the line still fits in `reserved`; stop and keep the array as built so far once the next entry would not fit — the wrapper plus an empty `more:` line always fits because `reserved` already covers that case.
8. Return the assembled string. No clock, no user role, bare tool names (ADR-0009 §5).

### Errors
None — this is a pure function over already-validated input.

### Constants used
`STATE_BUDGET`, `POINTER_MIN`, `RATIO_SECTION_DECAY`.

---

## 4. `src/core/tools/resume.ts`

PRD §8 "ctx_resume", §11; ADR-0009 §0, §4. E2E: GP6 row ("`ctx_resume(seq: N)` resumes from a given pointer"); live case `covers: ["src/core/tools/resume.ts"]`.

### Export

```ts
export interface CtxResumeInput {
  session?: string;
  seq?: number;
}

export async function ctxResume(
  input: CtxResumeInput,
  project: ProjectContext,
): Promise<ToolResult>;
```

`ToolResult` is the common tool-reply shape from `contracts/types.ts` (first line = one-line summary, `isError?: boolean`).

### Steps

1. Validate `input`. Unknown keys are rejected (PRD §8 ctx_search rule extends to every tool per the common contract): if `input` has a key other than `session`/`seq`, return `{isError: true, text: "ctx_resume: unknown field — only session and seq are accepted."}`.
2. Resolve `sessionId = input.session ?? currentSessionIdFromMeta(project)`. A missing session id with no current-session fallback returns `{isError: true, text: "ctx_resume: no session id — pass session or call from an active session."}`.
3. Open `db = openDb(project)` read-only.
4. If `input.seq` is a number: run `SELECT * FROM events WHERE session_id = :sessionId AND seq = :seq`. Zero rows → `{isError: true, text: "ctx_resume: no row at seq <seq> for this session."}`. One row → return `{text: row.body}` verbatim (this is the primary-key pointer read, ADR-0009 §4 "`ctx_resume(seq:N)` is a primary-key read of the whole row").
5. Otherwise (no `seq`): this is the on-demand path for the state block (DECISIONS-r6 D6), bounded by `RESUME_CAP` (`2048` B, same value as `STATE_BUDGET`, V21 — not the v1 figure of 196 KB named in the old report, issue #1022). Find `upToSeq = MAX(seq) FROM events WHERE session_id = :sessionId`. No rows at all → `{text: "ctx_resume: no journal rows for this session yet."}` (not an error — a fresh session has nothing to resume). `ctx_resume()` with no `seq` is the single call every agent uses to get the block: a `"host"` adapter (`compactSummary: "host"`, e.g. Claude Code) calls it only when the model asks, after its one pointer line; a `"none"` adapter (every other agent, per `impl/10-adapters.md` §1.3) calls it through its own `compactDelivery` path (ADR-0009 §6) right after compaction. The D1 algorithm and constants below (steps 6-9) are the same call either way.
6. `candidates = buildCandidates(db, sessionId, upToSeq)`.
7. `currentTurn = the `turn` value of the row at `upToSeq``.
8. `scored = scoreCandidates(candidates, currentTurn)`.
9. `block = renderState(scored, sessionId, upToSeq)`.
10. Close the read-only handle (or release it back to the pool per `db.ts`'s contract).
11. Return `{text: block}`. The summary line *is* the block's own first line (`<context_mode_state …>`), so no separate one-line summary is prepended — this tool's single line of output IS the summary (PRD §8 common contract: "No code echo by default" does not apply; this rule is about re-echoing input code, not about this tool's own reply shape).

### Errors (exact text)
- `"ctx_resume: unknown field — only session and seq are accepted."`
- `"ctx_resume: no session id — pass session or call from an active session."`
- `"ctx_resume: no row at seq <seq> for this session."`

### Constants used
None directly — all budget/threshold constants are inside `render.ts`/`score.ts`.

---

## 5. `src/core/tools/stats.ts`

PRD §12; TECH-SPEC GP10; DECISIONS-r4 I1-14, I1-15, I1-19. E2E: GP10 ("Stats"). `covers`: `src/core/tools/stats.ts`.

### Export

```ts
export interface CtxStatsInput {}

export async function ctxStats(
  input: CtxStatsInput,
  project: ProjectContext,
): Promise<ToolResult>;
```

### Formula (PRD §12, GP10)

```
saved          = bytesProduced - bytesReturned     (per scope: session, project, all-time)
reduction_pct  = saved / max(1, bytesProduced) * 100   // bytesReturned counted once in the denominator (I1-15)
```
`bytesProduced` is the sum of `events.bytes` for `kind = 'cmd'` rows (sandbox output size before capping) plus `cost`-kind rows' `bytes` field holding the pre-cap size; `bytesReturned` is the sum of what the tool reply actually carried, read from the same `cost` row (one row per tool call, written by the handler at return time per ADR-0009 §0). A `cost` event is written once per `(sessionId, turn)` pair — a duplicate step-finish event in the same turn is not written twice (I1-14): the insert is `INSERT OR IGNORE` keyed on `(session_id, turn)` inside `appendEvent()` for `kind = 'cost'` rows, so `ctx_stats` itself does no de-duplication — it trusts the journal is already correct.

### Steps

1. Open `db = openDb(project)` read-only.
2. Resolve the current `sessionId` from request `_meta` (same resolver as `resume.ts`). No session id at all (a non-MCP session, Assumption A8) uses `"mcp:" + serverId` as the session scope key, never an empty string.
3. Compute three scopes, each a `SUM(bytes)` / `SUM(returnedBytes)` pair read from `cost`-kind rows:
   - `session`: `WHERE session_id = :sessionId`
   - `project`: `WHERE worktree IN (every worktree of this project)` — every sibling session DB for other worktrees of the same git-common-dir project is opened **read-only** and its `mtime` must be unchanged after the read (TECH-SPEC: "Every sibling session DB it opens is opened read-only; its `mtime` is unchanged after a stats run.").
   - `all_time`: no `WHERE` filter beyond the project's own DB (one DB per project, so "all-time" = this file, all rows, all sessions).
4. For each scope, if there are zero `cost` rows: `saved = 0`, `reduction_pct = 0`, and the table row for that scope reads `"no data"` with a reason (`"no data — no tool calls recorded yet"`), per PRD §12 "0 calls gives 0 savings" and "no data with the reason".
5. Assert (debug-build only, not a runtime error) the invariant `session_kept_out <= project_total <= alltime_total` (GP10, I1-19) — this is a unit-test assertion, not a value the tool enforces at runtime by clamping; if it is violated the journal itself is wrong, which is a bug to catch in tests, not to silently fix in `stats.ts`.
6. Also compute a per-agent breakdown: `GROUP BY agent` over the same `cost` rows, same formula, for the "per agent" row requirement (PRD §12).
7. Render a Markdown table, one row per scope and one row per agent, columns: `Scope | Produced | Returned | Saved | Reduction %`. First line of the reply is the one-line summary: `"ctx_stats: <alltime reduction_pct>% kept out all-time, <session reduction_pct>% this session."`
8. Cap the whole reply at `OUTPUT_CAP` bytes (PRD §8 common contract) — with only three scope rows plus a small per-agent table this never actually triggers at realistic agent counts, but the cap check runs unconditionally for consistency with every other tool.
9. Return `{text: summary + "\n\n" + table}`.

### Errors (exact text)
`ctx_stats` takes no input fields, so an unknown field is the only possible input error:
- `"ctx_stats: unknown field — this tool takes no arguments."`

### Constants used
`OUTPUT_CAP`.

---

## 6. `src/core/tools/purge.ts`

PRD §8 "ctx_purge", ADR-0017 R5 ("ctx_purge scopes"); v1 reference `src/session/purge.ts` (commit `6e8556ce`, "extract `purgeSession()` deep module") — v2 keeps the "one entrypoint, pure function, dual-hash sweep is not needed in v2" shape (v1's dual-hash sweep was a case-fold migration workaround, A5 names a single lowercase-hash scheme in v2, so there is no legacy variant to sweep). E2E: a new GP case under GP6/GP11 family — this module's proof is the `ctx_purge` row in TECH-SPEC §3 tool table (one unit case per scope); `covers`: `src/core/tools/purge.ts`.

### Export

```ts
export interface CtxPurgeInput {
  session?: string;
  source?: string;
  project?: boolean;
}

export async function ctxPurge(
  input: CtxPurgeInput,
  project: ProjectContext,
): Promise<ToolResult>;
```

Exactly one of `session`, `source`, `project` must be set (PRD §8: `{session | source | project}` is a tagged union of scopes, not three optional fields that can combine).

### Steps

1. Count the set fields among `session`, `source`, `project`. Zero set → `{isError: true, text: "ctx_purge: pick one scope — session, source, or project."}`. More than one set → `{isError: true, text: "ctx_purge: pick only one scope — session, source, or project."}`.
2. Open `db = openDb(project)` for write, inside `withWrite()` (00-architecture.md: every write starts `BEGIN IMMEDIATE`, PRD §4).
3. **Scope `session`**: `DELETE FROM events WHERE session_id = :session`. If zero rows matched, this is not an error — return the zero-count result (a session with nothing journaled yet is a valid purge target).
4. **Scope `source`**: `DELETE FROM sources WHERE key = :source` plus `DELETE FROM chunks WHERE source_id = (the deleted source's id)` — the FTS5 chunk rows for that source only (not a project-wide reindex).
5. **Scope `project`**: delete every row in `events`, `sources`, `chunks` for this `context.db`, i.e. this project only (ADR-0017 R5: "ctx_purge scopes" stays a v1→v2 kept feature, scoped to one project's own DB — `ctx_purge` never touches another project's `context.db`, since each project has its own file, PRD §4).
6. Commit the transaction (handled by `withWrite()`'s own commit/rollback).
7. Build the one-line summary: `"ctx_purge: deleted <N> rows (scope: <session|source|project>). This cannot be undone."` where `<N>` is the total rows deleted across the tables touched in that scope.
8. Return `{text: summary}`.

### Errors (exact text)
- `"ctx_purge: pick one scope — session, source, or project."`
- `"ctx_purge: pick only one scope — session, source, or project."`
- On a DB write failure (lock timeout past the 5000 ms `node:sqlite` timeout, PRD §4): `"ctx_purge: database busy — try again."` (no added retry loop, per PRD §4 "No added retry loop on top of the 5000 ms timeout").

### Constants used
None beyond the DB layer's own timeout constant (owned by `store`, not redefined here).

---

## Assumptions

- A-section-cap-drop: ADR-0009 §2 caps each section at `MAX_CANDIDATES` but does not say which candidates to drop when a section is over cap. This spec drops the oldest `seq` first, because the render step already favors recency through the age-decay score, so dropping old candidates before scoring avoids wasted score computation on items that would lose the ratio sort anyway.
- A-score-table-range: ADR-0009 §3 names a "checked-in integer table" for decay but not its size. This spec fixes it at `age` 0..127 (clamped beyond), because 128 turns covers every realistic single session and keeps the table small and deterministic.
- A-stats-cost-bytes: PRD §12 gives the `saved` formula but not which journal rows carry `bytesProduced`/`bytesReturned`. This spec uses one `cost`-kind row per tool call (Assumption A7 in 00-architecture.md already adds this kind), written once by the handler at return time, matching ADR-0009 §0's single-write-path rule.
- A-stats-dedup-mechanism: I1-14 requires turn-keyed idempotency but does not name the SQL mechanism. This spec uses `INSERT OR IGNORE` on a `(session_id, turn)` partial unique index for `kind = 'cost'` rows, in `appendEvent()` (owned by `store`, not this module) — `stats.ts` itself does no de-duplication at read time.
- A-purge-no-dual-hash: v1's `purgeSession()` swept both a canonical and a legacy raw-casing hash because of a mid-life case-fold migration (v1 commit history). v2's single `projectKey` scheme (A5, 00-architecture.md) has no legacy variant, so `purge.ts` deletes rows by SQL `WHERE`, not by sweeping files on disk — v2 has one `context.db` per project, not per-session sidecar files, so the whole file-sweep shape of v1's module does not carry over; this is a deliberate simplification, not a gap.
- A-intern-M4 (answers to `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/.impl/intern-M4.md` Q1-Q10, read against `src/core/compaction/*`):
  - Q1 section order: §3 step 6 fixes it (`last_request`, `open_errors`, `changed_files`, `earlier_requests`, `indexed_sources`, ADR-0009 §5). The order carries meaning because the block has no section headers; a change is a golden change (GP6), not a refactor.
  - Q2 pointer: strictly greater. "Over 640 B" (TECH-SPEC §11) means a 640 B line stays text and a 641 B line becomes `#<seq> (<bytes> B) ctx_resume(seq:<seq>)`. Use `>`, never `>=`.
  - Q3 the two `+ 1` in `reserved`: one newline after the open tag line and one after the `more:` line. Lines are joined by `\n`, so the close tag line has no newline after it. Each item line costs its bytes `+ 1` for the same reason.
  - Q4 empty line: every M4 format has a non-empty prefix (`now: `, `error #`, `edited `, `asked #`, `indexed `), so no input gives 0 bytes. The throw is an assertion of that rule (M9); a skip would hide a format bug.
  - Q5 sort vs greedy: not equivalent. A one-time sort at `k = 0` ignores `0.7^k`. D-M4-S1-4 (lazy greedy, live `k`) wins; §3 step 4 is marked superseded.
  - Q6 `k`: lines taken from that section. A skipped candidate does not change `k`.
  - Q7 bonus: the formula `1 + floor(log2(max(1, n)))` is the rule. The loop counts how often `n` halves before it reaches 1, which is the same integer for every `n >= 1`, with no float `log2`. Both are correct; keep the integer loop (D1 uses integer tables).
  - Q8 tie to higher `seq`: determinism first (same rows give the same bytes, GP6); newest wins because newer rows are more relevant (same reason as A-section-cap-drop). Do not reverse it.
  - Q9 `query`: see the superseded note under §1 Export (M11 `more:` entry).
  - Q10 signature: see the superseded notes under §1 and §3 Export (D-M4-arch-2).
- A-intern-M6 (answers to `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/.impl/intern-M6.md` Q1-Q10, read against `src/core/compaction/*`, `src/core/tools/{resume,stats}.ts`):
  - Q1 pinned item: `last_request` is never dropped by the `MAX_CANDIDATES_TOTAL` cap. It counts toward the total, and the drop set is taken from the other sections only (oldest `seq` first), so they keep `MAX_CANDIDATES_TOTAL - 1`.
  - Q2 same key in two sections: one query per distinct key in the `more:` line (M11 dedup), whatever section it came from.
  - Q3 close tag: `STATE_CLOSE_TAG = "</context_mode_state>"` in `constants.ts`.
  - Q4 empty body: valid journal row. Every line has a non-empty prefix (A-intern-M4 Q4), so an empty first line still gives a line of 5 B or more; the throw cannot fire from an empty body.
  - Q5 `repeatCount`: a count built in `candidates.ts` (1 or more), never read from the DB. `max(1, n)` is part of the formula, not a guard.
  - Q6 section order: A-intern-M4 Q1; the GP6 goldens assert it.
  - Q7 no rows: `ctx_resume` returns `RESUME_EMPTY_LINE` before it calls `renderState`. A compact delivery with no rows renders the wrapper with `session="" upto="0"`, no item line and an empty `more:` line. This is the defined "nothing yet" block; it names no search.
  - Q8 `RESUME_CAP` and `STATE_BUDGET`: both 2048 (V21). `tests/contracts` asserts both values and `resume.ts` throws on a block over `RESUME_CAP`. A change to one is a change to both.
  - Q9 tie-break: a journal row has one kind, so it feeds at most one section; `seq` is unique among candidates and the `seq` tie-break is total. Concatenation order does not change the result.
  - Q10 `ctx_stats` errors: the tool has no input fields. An MCP call always sends an object, so `unrecognized_keys` is the only issue that can occur; it maps to `STATS_UNKNOWN_FIELD_LINE`.

---

## Changes

- DECISIONS-r9: constants renamed to the 00-architecture names (`STATE_BUDGET`, `MAX_CANDIDATES`, `POINTER_MIN`, `WEIGHT.*`, `RESUME_CAP` added); `EventKind` now imported from `contracts` (7 kinds, `decision` added) instead of a local 6-value redefinition; open-errors section scoped to `cmd`/`toolerr` rows with `ok=0` only, `cost`/`decision` never candidates (F2, F8); `ctx_resume()`'s no-`seq` reply bounded by `RESUME_CAP` (V21); added the exact per-section line formats and the `bytes >= 1` assert (M4, M9); render tie-break fixed to descending `seq` (M25); `more:` query build rule — dedup, `key`/`path` source, no query from a prompt (M11) — and its byte budget reserved up front as `STATE_BUDGET - reserved` (M12), replacing the old 64-byte assumption.
- DECISIONS-r6 D6: `ctx_resume()` called with no `seq` (§4 step 5) is now named as the on-demand path for the 2,048 B block, used by both `compactSummary: "host"` agents (after their own one-line pointer) and `compactSummary: "none"` agents (through their ADR-0009 §6 delivery path). The D1 algorithm and constants are unchanged.
