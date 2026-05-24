# ADR-0004 — Stats display uses strict-compression formula

- **Status**: Accepted
- **Date**: 2026-05-24
- **PR**: #685 (v1.0.148 hotfix)
- **Supersedes**: v1.0.134 SLICE B (incidental fix in commit `ce62275`)
- **Acknowledgement**: 7-agent EM ops audit (Git Archaeologist, DB Architect,
  Math Engineer, QA Engineer, PO/UX Engineer, Edge Case Engineer,
  Architect) produced the converged verdict ratified here.

## Context

The per-conversation Section 1 `Without context-mode / With context-mode`
bar in `ctx_stats` quietly drifted from "honest compression ratio" to
"infrastructure-size accounting" across two unrelated bug cascades:

1. **v1.0.134 SLICE B (`analytics.ts:1991-1993`)** — A tactical fix for a
   degenerate-100% display bug. When `bytesReturned == 0` in fresh
   sessions, the original `pct = 1 - max(1, returned) / (avoided + returned)`
   collapsed to ~100%, even with zero avoided bytes. SLICE B added
   `eventDataBytes` to **both** sides of the ratio to prevent the
   degenerate bar:

   ```
   Without = bytesAvoided + bytesReturned + eventDataBytes
   With    = max(1, bytesReturned + eventDataBytes)
   ```

   The commit message (`ce62275`, 2026-05-15) named this a
   "bar ratio degenerate fix" — it was an UX patch, not a designed metric
   semantic. Git archaeology confirms `rule_content` duplication
   (the actual cost driver) was never considered.

2. **v1.0.148 Bug A+C+D+E+F cascade (PR #685)** — schema migration +
   per-conversation aggregator fixes finally let the formula see real
   `bytesAvoided` data after years of silent under-attribution. With
   the real signal flowing, SLICE B's eventDataBytes-on-both-sides
   formula started reporting ~56% on conversations the user knew
   should be 95%+.

The reporter's machine produced empirical evidence:
- `bytesAvoided`   = 2,898 KB (Bash/Read redirect savings + sandbox PID bursts)
- `bytesReturned`  = 140 KB (printed ctx_* output)
- `eventDataBytes` = 2,136 KB (84% of which is **496 duplicate copies of the
  same CLAUDE.md** captured by SessionStart hooks across resume cycles —
  schema's `data_hash` dedup column is populated but unused by the formula)

Under SLICE B: display says 56% kept out.
Under strict compression (this ADR): display says **95.4% kept out**.

The 49-percentage-point gap is the under-attribution SLICE B introduced.

## Decision

The per-conversation Section 1 bar MUST use the strict-compression formula:

```
if (bytesAvoided + bytesReturned == 0) {
  // Empty state — no measurable redirect activity yet.
  // Do NOT draw a degenerate bar. Emit one honest hint line:
  "No measurable redirect activity captured yet — bars will appear once
   context-mode diverts its first payload."
} else {
  Without = bytesAvoided + bytesReturned
  With    = max(1, bytesReturned)
  pct     = (1 - With / Without) * 100
}
```

**`eventDataBytes` is EXCLUDED from both sides.** Hook-captured payload
bytes are written to SessionDB for the knowledge base. They are
analytics infrastructure, not bytes that ever entered the model's
context window. Rendering them in Section 1 conflates two distinct
quantities and produces a misleading number.

`eventDataBytes` MAY still be surfaced in Section 2 (captures count,
"1,000 things — files, errors, decisions, agent runs") where it
correctly represents what the hook layer recorded.

The lifetime Section 3 / Section 4 totals (`14.7 MB kept out across
200 projects`) are **unchanged** by this ADR — they aggregate
`bytesAvoided + eventDataBytes + snapshotBytes` and the user
expectation for the lifetime tier has historically been "all the
bytes context-mode kept in storage", which is correct for those
sections. Only the per-conversation `%` bar's semantic is corrected.

## Consequences

1. **The displayed Section 1 percentage will jump from ~56% to ~95%
   for existing users on first `ctx_stats` call after v1.0.148.**
   This is a metric semantic change, not data loss; lifetime
   numbers and capture counts remain identical to v1.0.147.

2. **Empty-state handling is explicit.** Fresh sessions with no
   redirect activity see a one-line hint instead of a degenerate
   `0%` or `100%` bar. SLICE B's symptom is eliminated at the
   source, not papered over.

3. **The `data_hash` dedup column is no longer load-bearing for
   correctness** of the Section 1 display. Dedup was one candidate
   fix in the EM verdict tree (Option B, 86%); strict compression
   (this ADR) is the correct fix because the rule_content
   duplication problem only matters if you're counting
   `eventDataBytes` in the first place — and we are not.

4. **Four fixture tests in `tests/analytics/format-report*.test.ts`
   are updated** to assert the new strict-compression semantic.
   The `v1.0.134 SLICE B` describe block is renamed to
   `v1.0.148 Bug G — strict-compression formula` and now pins:
   (a) the empty-state hint, (b) honest mixed-case percentage,
   (c) honest 100% when only `bytesAvoided` exists.

5. **README and release notes updated** to reflect the new
   per-conversation percentage range. Headline marketing claims
   that previously cited ~98% lifetime savings remain valid under
   the lifetime formula; new per-conversation headline aligns
   with the strict-compression ratio.

6. **ADR-0001 (multi-writer) is preserved** — this ADR changes a
   read-side formula only. No schema additions, no locks, no
   EXCLUSIVE pragma. SQLite WAL + busy_timeout invariants remain
   intact per ADR-0001.

## Pre-fix vs post-fix on reporter's data

| Metric | v1.0.147 (broken) | v1.0.148 + SLICE B | v1.0.148 + this ADR |
|---|---|---|---|
| Without | 158 KB | 5,177 KB | **3,038 KB** |
| With | 158 KB | 2,279 KB | **140 KB** |
| % kept out | 0% (identity) | 56% (SLICE B incidental) | **95.4%** |
| Runtime multiplier | 1× | 2× | **22×** |
| Lifetime headline | 14.7 MB ✓ | 14.7 MB ✓ | 14.7 MB ✓ |

The 22× multiplier represents the actual context-window runway
extension this conversation got from context-mode's redirects —
the metric the user intuitively expected to see.
