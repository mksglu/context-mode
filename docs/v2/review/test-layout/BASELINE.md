# Test layout baseline

Taken 2026-10-30 on origin/v2-design head f3c958c3 (quiet for over 15 minutes; the two writer jobs hooks-fire-all and search-quality-all were finished).
Machine: Apple M1 Pro, 10 cores, macOS 14.5, Node v26.8.1. Load average at start 6.12 5.70 5.22 (other jobs ran on the machine; not idle). Load before the three suite runs: 5.14, 28.15, 39.94.

## Counts

| Item | Value | Source |
|---|---|---|
| Unit test files (tests/v2 + e2e/harness) | 242 (240 + 2) | per-file runs |
| Unit tests passed / skipped / failed | 2365 / 33 / 0 by TAP per file | baseline-perfile-unit.json |
| Full parallel run (node --test "tests/v2/**/*.test.mjs") | tests 2383, pass 2350, fail 0, skipped 33 | 3 runs |
| e2e/cases files / tests | 22 / 188 (176 pass, 12 skip, 0 fail) | node e2e/cases/run.mjs, per file in baseline-perfile-e2e.json |
| Self-tests under e2e/live (no key) | 3 files, 35 tests | analyze, compact-hard/score, routing/score |
| Live cases that need no key | ci-config, release-plan-bump, repo-cleanup-gate: PASS, 2 s | node e2e/live/run.mjs --only |
| Names in baseline-names.txt | 2624 lines: 2433 unit and live self-test leaf tests, 188 e2e/cases, 3 live-local | collect-names.mjs |
| Files in the layout plan | 245 test files in 38 groups | review/test-layout/groups.json |

The TAP count (2383) and the leaf-name count (2433) differ because the name tool also reads e2e/harness and the three live self-tests, and TAP counts suites. The name list is the reference for the move: it has one line per leaf test.

## Suite wall time

| Run | Wall s |
|---|---|
| 1 | 96 |
| 2 | 97 |
| 3 | 96 |
| Median | 96 |

Sum of per-file serial times: unit 430 s over 242 files; e2e/cases 269 s over 22 files (cases run with concurrency 1). e2e/cases wall time in one run: 265 s.
Parallel lower bound is the longest file: hook-fuzz 51.1 s. The suite takes 96 s because the 10 cores are shared by about 240 files.

## Slowest unit files (serial, s)

| File | s | Tests |
|---|---|---|
| `tests/v2/hooks/hook-fuzz.test.mjs` | 51.1 | 22 |
| `tests/v2/cli/cli.test.mjs` | 35.5 | 57 |
| `tests/v2/setup/engine.test.mjs` | 32.4 | 55 |
| `tests/v2/setup/hooks-all.test.mjs` | 27.2 | 17 |
| `tests/v2/setup/zcode-gate.test.mjs` | 20.8 | 17 |
| `tests/v2/compat/v1-v2-diff.test.mjs` | 19.2 | 3 |
| `tests/v2/release/publish.test.mjs` | 13.1 | 20 |
| `tests/v2/setup/vscode-gate.test.mjs` | 10.9 | 11 |
| `tests/v2/release/smoke.test.mjs` | 10.6 | 24 |
| `tests/v2/release/plan.test.mjs` | 9.5 | 22 |
| `tests/v2/cache/prefix-determinism.test.mjs` | 8.8 | 16 |
| `tests/v2/setup/copilot-hooks-enabled.test.mjs` | 8.7 | 5 |
| `tests/v2/setup/gemini-gate.test.mjs` | 7.4 | 8 |
| `tests/v2/hooks/hook-never-errors.test.mjs` | 6.8 | 104 |
| `tests/v2/hooks/dispatch-compact.test.mjs` | 6.0 | 15 |

## Slowest e2e/cases files (serial, s)

| File | s | Tests |
|---|---|---|
| `e2e/cases/GP9-lifecycle.e2e.mjs` | 73.0 | 15 |
| `e2e/cases/GP8-concurrency.e2e.mjs` | 63.7 | 7 |
| `e2e/cases/GP5-index-search.e2e.mjs` | 53.6 | 31 |
| `e2e/cases/GP-SETUP-npm-install.e2e.mjs` | 29.8 | 1 |
| `e2e/cases/GP4-execute.e2e.mjs` | 13.6 | 27 |
| `e2e/cases/GP11-doctor-upgrade.e2e.mjs` | 5.5 | 13 |

## CI wall time per job, last 3 green ci.yml runs on v2-design (s, job started_at to completed_at)

| Job | f3c958c3 | 144e3495 | e138e6f0 | Median |
|---|---|---|---|---|
| ci ubuntu node 24.15.0 | 509 | 546 | 547 | 546 |
| ci ubuntu node 26 | 546 | 561 | 574 | 561 |
| ci macos node 24.15.0 | 455 | 447 | 449 | 449 |
| ci macos node 26 | 736 | 735 | 852 | 736 |
| ci windows node 24.15.0 | 613 | 490 | 685 | 613 |
| ci windows node 26 | 694 | 693 | 774 | 694 |
| windows hosts ubuntu | 107 | 107 | 111 | 107 |
| windows hosts macos | 107 | 120 | 101 | 107 |
| windows hosts windows | 390 | 591 | 365 | 390 |
| setup e2e ubuntu | 41 | 31 | 32 | 32 |
| setup e2e macos | 42 | 66 | 45 | 45 |
| setup e2e windows | 83 | 78 | 87 | 83 |

Source: gh api repos/mksglu/context-mode/actions/runs/<id>/jobs. The v2 unit step in the windows node 26 job ran 637 s in the last run: the CI budget is set by the slowest runner, not by this machine.

## Acceptance for the move

- Names: sorted status and name columns of baseline-names.txt equal those of a new collect-names.mjs run (file column ignored). 33 unit skips and 12 e2e skips stay skips.
- Wall time: median of 3 full runs at most 96 s on a machine with the same load; e2e/cases at most 265 s; no job in CI above its median here.
- No file above 51.1 s.

## After the move (2026-10-30)

| Item | Before | After |
|---|---|---|
| Unit test files in tests/v2 | 240 | 34 |
| e2e/cases files | 22 | 14 |
| Test names (unit, harness, live self-tests, e2e/cases, live-local) | 2624 | 2624, sorted status and name equal |
| Full parallel run | 2383 tests, 0 fail, 33 skip | 2389 tests, 0 fail, 33 skip (guard tests +3, live-local +3, minus 0) |
| Suite wall, 3 interleaved runs, same machine, load about 30 | 112, 102, 100 s (median 102) | 101, 100, 91 s (median 100) |

The 96 s above was taken at load 5 to 6; the paired run is the fair compare. The throwaway scripts (collect-names, make-groups, groups.json, workers.json, baseline-names.txt, baseline-perfile-*.json) are deleted; git history has them (commit 492cc0b9).

