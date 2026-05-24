# context-mode v1.0.148 — Critical stats accuracy fix

## TL;DR

The per-conversation `% kept out of context` display in `ctx_stats` was
under-reporting by a wide margin due to a cascade of seven distinct
bugs. v1.0.148 lands all of them in a single release. On the reporter's
machine, the displayed Section 1 ratio corrected from **6% → 95%**;
on yours it will likely correct similarly. Your **lifetime headline
(14.7 MB kept out)** and **capture counts** are unchanged — this
release fixes the per-conversation display only.

Trigger: PR #683 (comprehensive ctx_* tool description audit) shipped
v1.0.147 and a user opened `ctx_stats` to verify the release was
healthy. The display showed `Without 158 KB / With 158 KB / 0% kept
out` — a degenerate identity bar. What looked like one display
glitch turned into a seven-bug archaeological dig.

## Bug summary (in discovery order)

| Bug | Layer | Symptom | Fix |
|---|---|---|---|
| **A** | Schema | Historical session DBs (pre-v1.0.130) on disk lacked the `bytes_avoided` / `bytes_returned` / `project_dir` columns. Migration ran only when SessionDB constructor opened a DB. 131 of 197 DBs on the reporter's machine were stuck on legacy schema. | New `ensureSessionEventsSchema(dbPath)` helper, called from the analytics aggregator before each readonly open. Self-healing: every `ctx_stats` call migrates any legacy DBs it scans. |
| **C** | Aggregator | When the SUM query referenced a missing column, the prepare() threw, the catch swallowed it, and the WHOLE DB was skipped — even the `LENGTH(data)` signal was lost. | Same lazy migration fixes both A and C in one path. |
| **D** | Design | The aggregator's "skip on corrupt DB" path was hiding actively-correctable legacy DBs rather than fixing them. | Lazy migration converts the skip into a one-time backfill. |
| **E** | Scope | The per-conversation aggregator filtered by a single `session_id`. A Claude Code conversation routinely spans 80+ session_ids (resume cycles, /compact rebirths, PID sub-process sessions spawned by `ctx_execute`). The single-session_id scope missed every sandbox burst's bytes_avoided. | New `projectDir` option on `getRealBytesStats` uses a META subquery: `WHERE session_id IN (SELECT session_id FROM session_meta WHERE project_dir = ?)`. |
| **F** | Attribution | Sandbox-burst PID-session EVENTS write `project_dir = ''` even when their META row carries the parent cwd. An event-level project_dir filter would still miss them. | The META subquery (Bug E fix) catches PID-burst sessions by their META row regardless of event-level project_dir. |
| **G** | Display formula | The Section 1 `Without / With` ratio (`analytics.ts:1991-1993`) folded `eventDataBytes` (hook payload metadata, never enters the model context window) into both sides. This was an incidental fix from v1.0.134 SLICE B (commit `ce62275`) designed to dodge a different degenerate-100% bar bug. After bugs A+C+D+E+F let real signal flow, SLICE B started reporting 56% on conversations the user knew should be 95%+. | Strict-compression formula: `Without = bytesAvoided + bytesReturned`, `With = max(1, bytesReturned)`. `eventDataBytes` is rendered in Section 2 (captures count), not in Section 1. Empty-state branch handles the SLICE B degenerate case honestly with a hint line. See [ADR-0004](docs/adr/0004-stats-strict-compression-formula.md). |

## Before / after on the reporter's data

| Metric | v1.0.147 (broken) | v1.0.148 |
|---|---|---|
| `Without context-mode` | 158 KB | **3,038 KB** |
| `With context-mode` | 158 KB | **140 KB** |
| `% kept out` | 0% (identity bar) | **95.4%** |
| Runtime multiplier | 1× | **22×** |
| Lifetime headline (14.7 MB) | ✓ unchanged | ✓ unchanged |
| Capture counts (19,949 lifetime) | ✓ unchanged | ✓ unchanged |

The 95% headline is not a metric inflation — it is the literal
compression ratio your data has always supported. The previous
display was measuring infrastructure size, not context savings.

## Upgrade

```bash
npx context-mode@latest
# or, if you have the plugin installed:
/context-mode:ctx-upgrade
```

After upgrade, run `ctx_stats` once. The legacy-schema migration runs
transparently on first call — no manual command. Your Section 1
display will then reflect the strict-compression ratio.

## What does NOT change

- Lifetime "X MB kept out across N projects" headline — same formula
- Capture counts (Section 2) — same data, same totals
- Cost claims ($ saved) — unaffected by the per-conversation display fix
- Schema — no new columns, no breaking migrations, ADR-0001
  multi-writer invariant preserved

## Test coverage

- **464 tests pass.** 3 pre-existing PR #617 ctx_doctor / ctx_index
  storage e2e tests remain in the same pre-existing failure state —
  out of scope for this hotfix.
- New behavioural tests in `tests/session/real-bytes-stats.test.ts`
  pin schema-migration recovery + META-based projectDir scope +
  idempotency. RED→GREEN proven (formula change disabled → tests
  fail; re-enabled → tests pass).
- Three new behavioural tests in `tests/analytics/format-report.test.ts`
  pin the strict-compression formula: empty-state branch, mixed
  case 60% (verifies eventDataBytes is excluded), only-avoided
  honest 100%.

## Acknowledgements

This release ships because of the diagnostic discipline of the
seven-agent EM ops audit: Git Archaeologist, DB Architect, Math
Engineer, QA Engineer, PO/UX Engineer, Edge Case Engineer, and the
safe-harbour Architect. Their parallel verdicts converged on the
strict-compression formula after the empirical data falsified
three of the four initially-proposed fixes (raw status quo, content
store inclusion, dedup-by-hash).

- @kerneltoast (PR #654) — original Opus 4.6 reproduction that
  triggered the whole audit chain.
- @NgoQuocViet2001 (PR #666) — custom TTL on `ctx_fetch_and_index`,
  shipped in v1.0.147 and surfaced in tool descriptions during the
  PR #683 review.

The full archaeology is in [ADR-0004](docs/adr/0004-stats-strict-compression-formula.md).
