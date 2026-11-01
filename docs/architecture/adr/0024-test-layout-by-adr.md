# ADR-0024: Test files follow ADR and PRD areas, not fixes

- Status: Accepted (2026-10-30). Move done and checked: see Result.
- Supersedes: the file-per-fix and file-per-feature practice in tests (242 files at f3c958c3).
- Keeps: ADR-0003 (layers, process-boundary rule), ADR-0017 (v1 retention), TEST-TRIAGE-r2.
- Related: docs/architecture/TEST-LAYOUT.md (the table), ADR-0018 (module map).

## Context

tests grew to 242 files. Many hold 1 to 5 tests and exist because one fix needed a red test. The owner said (2026-10-30): no v1-style flood of small files; maximum parallelism and a fast suite; files grouped by ADR and PRD; no new file per fix or feature; a clean architecture.

Git archaeology: ADR-0003 chose process-boundary tests and kept unit tests for modules. ADR-0017 kept v1 tests until v2 passes them. TEST-TRIAGE-r2 maps v1 tests to KEEP, PORT or RETIRED. None of them decides the file layout of tests, so this ADR does not reverse them.

Baseline (see https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/review/test-layout/BASELINE.md): 2398 unit tests, 188 e2e/cases tests, suite wall time 96 s on 10 cores, longest file 51 s (hook-fuzz).

## Decision

1. One test file per ADR or PRD area, or per TECH-SPEC GP case. The map is docs/architecture/TEST-LAYOUT.md.
2. A fix adds its red test to the file that owns its area, in the describe block of the matching ADR section. No new file for a fix or a feature.
3. Split an area only when a single file would be the long pole of the parallel run. Name the parts by ADR section.
4. Shared helpers: tests/_lib/, one copy of each.
5. Layers do not change. e2e/ files never import src/. Files in tests/e2e that import src/ stay in tests/.
6. The move is tests only. Every test keeps its name and its assertions. No budget or timeout goes up. src/, build/ and scripts/release/ stay as they are.
7. Check: the sorted list of test names (status and name) before and after the move must be equal. The tool was https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/review/test-layout/collect-names.mjs (a review script, deleted after the check; see git history).

## Consequences

- Fewer, larger files (242 to about 40). The parallel run keeps its wall time as long as no merged file passes the 51 s long pole.
- Reviewers find the test for an ADR in one place.
- Old doc references to individual test paths (DEVIATIONS, ISSUE-COVERAGE, e2e/cases comments) point to files that move. They are history; the move does not rewrite them. Code that names a test path must change with the move (ci.yml uses a glob, gate.mjs uses the directory: both stay valid).
- A new area needs a row in the table first.

## Result (2026-10-30, checked)

- Unit files 242 -> 34 in tests (plus e2e/harness 2 and e2e/live self-tests 3 in place); e2e/cases files 22 -> 14 after the merge of GP1, GP3 and GP11.
- Names: 2624 before, 2624 after; sorted status and name columns equal; 0 fail, 33 unit skips and 12 e2e skips unchanged.
- Full parallel run (node --test "tests/**/*.test.mjs"): 2389 tests, 0 fail, 33 skip. Wall time, 3 interleaved runs against a worktree of f3c958c3 on the same loaded machine (load average about 30): baseline 112, 102, 100 s (median 102); new 101, 100, 91 s (median 100). Not slower.
- Two fixes after the name check: the 3 live-local names were restored (tests/0012-live-harness.test.mjs), and the Copilot block of tests/0020-gates-pi-copilot-claude.test.mjs now runs its tests in order inside a block cap of 2 (D-TEST-LAYOUT-1).
- Guard: tests/0014-repo-hygiene.test.mjs fails when a *.test.mjs under tests or a case file under e2e/cases is not in docs/architecture/TEST-LAYOUT.md.
- Windows: blocks in a merged file run in order on win32 (tests/_lib/concurrency.mjs, CONC), because the 4-core runner starved timed tests when they ran at once. See D-TEST-LAYOUT-1.
