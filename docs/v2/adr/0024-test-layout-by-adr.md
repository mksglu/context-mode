# ADR-0024: Test files follow ADR and PRD areas, not fixes

- Status: Accepted by owner (2026-10-30).
- Supersedes: the file-per-fix and file-per-feature practice in tests/v2 (242 files at f3c958c3).
- Keeps: ADR-0003 (layers, process-boundary rule), ADR-0017 (v1 retention), TEST-TRIAGE-r2.
- Related: docs/v2/TEST-LAYOUT.md (the table), ADR-0018 (module map).

## Context

tests/v2 grew to 242 files. Many hold 1 to 5 tests and exist because one fix needed a red test. The owner said (2026-10-30): no v1-style flood of small files; maximum parallelism and a fast suite; files grouped by ADR and PRD; no new file per fix or feature; a clean architecture.

Git archaeology: ADR-0003 chose process-boundary tests and kept unit tests for modules. ADR-0017 kept v1 tests until v2 passes them. TEST-TRIAGE-r2 maps v1 tests to KEEP, PORT or RETIRED. None of them decides the file layout of tests/v2, so this ADR does not reverse them.

Baseline (see docs/v2/review/test-layout/BASELINE.md): 2398 unit tests, 188 e2e/cases tests, suite wall time 96 s on 10 cores, longest file 51 s (hook-fuzz).

## Decision

1. One test file per ADR or PRD area, or per TECH-SPEC GP case. The map is docs/v2/TEST-LAYOUT.md.
2. A fix adds its red test to the file that owns its area, in the describe block of the matching ADR section. No new file for a fix or a feature.
3. Split an area only when a single file would be the long pole of the parallel run. Name the parts by ADR section.
4. Shared helpers: tests/v2/_lib/, one copy of each.
5. Layers do not change. e2e/ files never import src/. Files in tests/v2/e2e that import src/ stay in tests/v2/.
6. The move is tests only. Every test keeps its name and its assertions. No budget or timeout goes up. src/, build/ and scripts/release/ stay as they are.
7. Check: the sorted list of test names (status and name) before and after the move must be equal. The tool is docs/v2/review/test-layout/collect-names.mjs.

## Consequences

- Fewer, larger files (242 to about 40). The parallel run keeps its wall time as long as no merged file passes the 51 s long pole.
- Reviewers find the test for an ADR in one place.
- Old doc references to individual test paths (DEVIATIONS, ISSUE-COVERAGE, e2e/cases comments) point to files that move. They are history; the move does not rewrite them. Code that names a test path must change with the move (ci.yml uses a glob, gate.mjs uses the directory: both stay valid).
- A new area needs a row in the table first.
