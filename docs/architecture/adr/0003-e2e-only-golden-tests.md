# ADR-0003: E2E and E2E-style golden tests; v1 unit tests stay until v2 passes the kept ones

- Status: Accepted (2026-10-15). Owner accepted the r2 test-layer change (`DECISIONS-r3.md`: "doğru, tamamı ok") and delegated the r4 fixes in `DECISIONS-r4.md`.
- Related: TECH-SPEC §6 · `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/v2-test-ledger.md` · `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/review/TEST-TRIAGE-r2.md` · PRD-v2 §13 (superseded by this ADR) · ADR-0017 (E2E at every step, v1 retention)

## Context

Measured on the v1 tree at `1a1bed13`. Its `tests/` is identical to `origin/main` @ `5869f4fa`; the only diff between them is `stats.json`.

| Fact | Value |
|---|---|
| Test files (`*.test.*` / `*.spec.*`) | 210 |
| Lines | 81,072 |
| Files importing `../src/` (white-box) | 136 |
| Files that start processes (`child_process\|spawn\(\|execa\|execFile\|StdioClientTransport`) | 64 |
| Distinct bug ids cited (`#NN`–`#NNNN`) | 221: 164 closed issues, 46 merged PRs, 7 closed PRs, 1 open issue, 3 numbers that are not an issue or PR |

Most v2 requirements (B rows in the issue map) are contract breaks at a process boundary: hook stdin/stdout, MCP stdio, config files, child processes. A white-box test does not exercise those boundaries.

## Decision

**Three layers, and nothing else:**

1. **v1 kept unit tests.** `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/review/TEST-TRIAGE-r2.md` is the single source of truth for which v1 test is KEEP-PASS, PORT, or RETIRED, and for the ADR that retires or rewrites each PORT/RETIRED file. Of 209 v1 test files: 131 KEEP-PASS, 52 PORT, 26 RETIRED. v2 is built until every KEEP-PASS test passes (vitest + TS, after a mechanical import-path port where a source path moves). PORT tests are rewritten; each RETIRED test is removed with its ADR named (`no-npm-for-v2`, `no-fallback-chains`, ADR-0016, `ADR-0123-openclaw-removed`). v2 keeps the `src/` import paths and exports every KEEP-PASS file uses, or the PR that moves a path updates the test in the same diff.
2. **E2E-style** (every PR, deterministic; cases GP1–GP11, TECH-SPEC §6). The built artifacts (`server.bundle.mjs`, hook entry) run as child processes. A *fake host* drives them over stdio with recorded native payloads. No model is involved.
3. **E2E-live** (ADR-0012 keyless harness; by hand and on release-candidate tags, never on a schedule, TECH-SPEC §6.9). Model: `claude-sonnet-5`, `--effort low` (ADR-0017) — the lowest-cost setting the owner asked for. A real agent binary and a real model turn, against the real server. Asserts on the transcript and on DB rows. Per ADR-0017, an E2E case is added at every implementation step, not only before a release.

**Process-boundary rule** (layers 2 and 3 only): a test file under `e2e/` must not import from `src/`. Its inputs are processes, stdio, files and env; its outputs are the same. CI lint fails on `from "../src` or `from "../../src` under `e2e/`. Layer 1 keeps its existing `src/` imports; that is what "unit test" means there.

**Golden files:** expected outputs and DB rows are JSON files under `e2e/golden/`.
- Volatile values are normalized before comparison (TECH-SPEC §6.4).
- A golden file is changed only with `UPDATE_GOLDEN=1` locally plus a reviewed diff. CI never writes golden files.

**Pure algorithms** (chunker, ranking, gitignore matching) are tested only through tool output, for example `ctx_index` → `ctx_search` golden hits. No algorithm gets its own test entry point outside the three layers above. v2 has no truncation step (ADR-0016), so there is nothing to port for that case.

**Two runners coexist**, not one. The 131 KEEP-PASS files run on vitest+TS (`TEST-TRIAGE-r2.md`); GP1–GP11 run on `node:test` against the built artifacts. The "no npm install at runtime" rule (ADR-0002, ADR-0013, as amended by ADR-0019) covers the shipped release tree only: CI/dev tooling keeps its own `package.json` outside that tree, and that is where vitest runs. The release tree holds one `package.json` in the ADR-0019 D1 shape (no `dependencies`, no `scripts`) and no vitest.

**v2.0 exit gate:** every KEEP-PASS test passes, AND GP1–GP11 pass, AND every row of `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/v2-issue-map.md` carries a `GPn` column (or TECH-SPEC carries a reverse table naming the GP case per B row). Status 2026-10-17: every one of the 351 rows carries a verdict in the `v2 test` column (GP 170, LIVE 2, REMOVED 110, N/A 69; 0 empty). Every B-class row has a GP or LIVE case. The 147 new cases are listed with Given/When/Then in `docs/architecture/modules/14a-issue-cases.md`. The gate blocks until each named case exists and passes, not only on GP1–GP11 passing. `/release` runs layer 1, then layer 2, then layer 3, and stops on the first failure in any layer.

## Consequences

- Tests survive refactors: layers 2 and 3 only see behaviour at boundaries; layer 1 keeps the white-box coverage the KEEP-PASS files already pin, so v2 cannot silently re-break a v1 fix.
- The suite is slower than unit tests alone. The per-PR wall-clock budget is TECH-SPEC §6.7.
- Recorded native payloads become fixtures. Each one is captured from a real agent once and stored with the agent version.
- A behaviour with no external effect has no E2E test. That is intended for layers 2 and 3: if nothing outside can observe it, it is not a contract. Layer 1 can still cover internals the KEEP-PASS files already pinned.

## Alternatives considered

- **Delete all unit tests at the start.** Rejected after r2: 136 of 209 KEEP-PASS+PORT files import `src/` directly, and only 13 of 125 B-row issues have a GP replacement so far. Deleting first would drop coverage with nothing yet in place to catch the regression.
- **In-process snapshot tests for layers 2 and 3.** Rejected: they do not cross a process boundary.
- **E2E-live on every PR.** Rejected: it is non-deterministic and costly (TECH-SPEC §6.9).

## Changes

- 2026-10-17: issue map fully tagged (351/351); gate now names the cases in impl/14a.
- 2026-10-14 (r2, owner): superseded the original "delete all unit tests at the start" decision. Added the KEEP-PASS/PORT/RETIRED triage (`TEST-TRIAGE-r2.md`) and the two-runner split.
- r4: named the actual B-row-to-GP coverage count (13/125) and made it an exit-gate condition (B51, B73); stated that vitest and `node:test` coexist as two runners for two layers (B52); scoped the no-npm rule to the release tree only, since CI/dev tooling needs its own `package.json` to run vitest (B74).
- 2026-10-15: status set to Accepted; folded the r2 addendum into the body above and removed the standalone r2 section.
