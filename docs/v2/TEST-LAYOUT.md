# Test layout: one file per ADR/PRD area

Status: accepted by owner 2026-10-30. Decision record: [ADR-0024](adr/0024-test-layout-by-adr.md).

## The rule

- A test file owns one ADR or PRD area (or one TECH-SPEC GP case). The table below lists every file.
- A fix or a feature does not get a new test file. Put its red test in the file that owns its ADR area.
- Name a file after the area, never after a fix, an issue number or a feature.
- Split an area into more files only when one file would be the long pole of the parallel run. Name the parts by ADR section.
- Files run in parallel (node --test). Inside a file, tests run in order. Keep a file under the long pole (hook-fuzz, 51 s).
- Shared helpers live in tests/v2/_lib/. One copy of each. Add a helper there when two area files need the same body.
- Layers from ADR-0003 stay. A file under e2e/ never imports from src/. Tests that import src/ stay in tests/v2/.
- Frozen: e2e/live/compact-hard and bench/m2 are never edited.

## How to add a red test

1. Find the area in the table (ADR number, PRD section or GP case).
2. Open the file. Find the describe block of the matching ADR section. If there is none, add a describe block named after the section.
3. Add the test there. Name it by behaviour. Put the issue number in the test name, not in a file name.
4. Run only that file: node --test tests/v2/<file>. See it fail. Fix the code. See it pass.
5. Do not add a file. If you think the area is missing, add a row to the table and open the ADR first.

## Table

| Group | ADR / PRD | File(s) | Covers | Tests | Baseline s (sum of old files) |
|---|---|---|---|---|---|
| e2e-gp1 | TECH-SPEC GP1, ADR-0019, ADR-0023 | `e2e/cases/GP1-install.e2e.mjs` | GP1 install: node path, docs, install, uninstall, release tree, OpenCode client info (merge 6 GP1 files into one) | 29 | 7.6 |
| e2e-gp3 | TECH-SPEC GP3, ADR-0008 | `e2e/cases/GP3-hooks.e2e.mjs` | GP3 hooks: perf, enforcement, Z Code tool names (merge 3 GP3 files into one) | 23 | 2.1 |
| e2e-gp11 | TECH-SPEC GP11, ADR-0010, ADR-0011 | `e2e/cases/GP11-doctor-upgrade.e2e.mjs` | GP11 doctor, upgrade, release audit, Pi and Antigravity (merge 3 GP11 files into one) | 18 | 6.2 |
| e2e-gp-keep | TECH-SPEC GP2, GP4-GP10, GP-SEARCH, GP-SETUP | (stay in place) 10 files | one file per GP case already; stay in place | 118 | 253.0 |
| 0003-e2e-harness | ADR-0003 | (stay in place) `e2e/harness/normalize.test.mjs`, `e2e/harness/run-filter.test.mjs` | tests of the e2e harness itself (stay in place under e2e/, never import src/) | 15 | 0.2 |
| 0012-live-eval-selftests | ADR-0012 | (stay in place) `e2e/live/cache/analyze.test.mjs`, `e2e/live/compact-hard/score.test.mjs`, `e2e/live/routing/score.test.mjs` | scorers and analyzers of the live evals (stay in place; compact-hard is frozen) | 35 | 0.3 |
| 0012-live-harness | ADR-0012 | `tests/v2/0012-live-harness.test.mjs` | keyless live harness, process groups, compact eval arms, M2 bench scorer | 40 | 2.5 |
| 0012-m2-bench | ADR-0012 | `tests/v2/0012-m2-bench.test.mjs` | M2 bench fixtures runner (builds the bundle with a blocking execFileSync; own file so it cannot stall the timer tests) | 4 | 4.4 |
| 0017-v1-retention | ADR-0017 | `tests/v2/0017-v1-retention.test.mjs` | v1 vs v2 diff and the ported v1 executor and store tests | 37 | 20.4 |
| 0018-contracts | ADR-0018 | `tests/v2/0018-contracts.test.mjs` | module contracts and single-source hook file | 46 | 0.3 |
| 0018-build | ADR-0018, ADR-0019, ADR-0023 | `tests/v2/0018-build.test.mjs` | build, generated files, host manifests, npm package | 79 | 10.1 |
| 0002-store | ADR-0002, PRD-v2 section 4, GP8, GP9 | `tests/v2/0002-store.test.mjs` | single DB, schema, cleanup, checkpoint, owners, lifecycle exit | 63 | 8.5 |
| 0007-identity | ADR-0007, PRD-v2 section 5, GP7 | `tests/v2/0007-identity.test.mjs` | project and session identity, scope, containment, per-host home dirs | 86 | 6.4 |
| 0007-mcp-server | ADR-0004, ADR-0005, ADR-0007, PRD-v2 sections 6-7 | `tests/v2/0007-mcp-server.test.mjs` | MCP server, tool registry, call shapes, prompt delivery | 65 | 4.4 |
| prd8-index-search | PRD-v2 section 8, GP5 | `tests/v2/prd8-index-search.test.mjs` | chunking, index, FTS search, fetch, snippets | 201 | 8.3 |
| prd9-sandbox | PRD-v2 section 9, GP4 | `tests/v2/prd9-sandbox.test.mjs` | execute, batch, runtimes, env, cap, kill, spawn | 91 | 11.3 |
| prd12-stats-purge | PRD-v2 sections 8 and 12, GP10 | `tests/v2/prd12-stats-purge.test.mjs` | stats and purge tools | 21 | 5.8 |
| 0008-enforcement | ADR-0001, ADR-0008, PRD-v2 section 10, GP3 | `tests/v2/0008-enforcement.test.mjs` | policy: lexer, parse, decide, deny rules, unwrap, external MCP | 176 | 1.4 |
| 0016-subagent | ADR-0016 | `tests/v2/0016-subagent.test.mjs` | subagent context protection, run wrapper, VS Code tools | 56 | 1.9 |
| prd10-hooks-runtime | PRD-v2 section 10, GP3, GP6, GP7 | `tests/v2/prd10-hooks-runtime.test.mjs` | hook process: stdin, entry, dispatch, saving, errors, throttle | 280 | 23.0 |
| prd10-hook-fuzz | PRD-v2 section 10 | `tests/v2/prd10-hook-fuzz.test.mjs` | seeded hook fuzz on every host (the long pole; one file on purpose) | 22 | 51.1 |
| 0009-compaction-memory | ADR-0009, PRD-v2 section 11, GP6 | `tests/v2/0009-compaction-memory.test.mjs` | compaction, journal, resume, recall, search decision | 79 | 3.7 |
| 0020-adapters | ADR-0020, PRD-v2 section 3 | `tests/v2/0020-adapters.test.mjs` | agent adapters and the host table | 182 | 2.8 |
| 0020-plugins | ADR-0020, PRD-v2 section 3 | `tests/v2/0020-plugins.test.mjs` | OpenCode and Pi in-process plugins | 33 | 2.0 |
| 0020-hooks-all | ADR-0020 | `tests/v2/0020-hooks-all.test.mjs` | hooks and skills on every agent: one fire matrix | 26 | 27.8 |
| 0020-gates-zcode | ADR-0020 | `tests/v2/0020-gates-zcode.test.mjs` | hook gate and shape for Z Code | 23 | 24.2 |
| 0020-gates-vscode-gemini-kiro | ADR-0020 | `tests/v2/0020-gates-vscode-gemini-kiro.test.mjs` | hook gates for VS Code, Gemini CLI, Kiro | 23 | 24.1 |
| 0020-gates-pi-copilot-claude | ADR-0020 | `tests/v2/0020-gates-pi-copilot-claude.test.mjs` | hook gates for Pi, Copilot CLI, Claude Code, Codex, OpenCode | 40 | 26.0 |
| 0020-fire-hook-config | ADR-0020 | `tests/v2/0020-fire-hook-config.test.mjs` | real-agent fire tests: Claude Code, Codex, Copilot CLI, Gemini CLI, Kiro (skipped when the agent is absent) | 13 | 3.2 |
| 0020-fire-plugin-ext | ADR-0020 | `tests/v2/0020-fire-plugin-ext.test.mjs` | real-agent fire tests: OpenCode, Pi, Qwen, VS Code, Z Code (split from 0020-fire: spawnSync probes block the event loop, so one file ran slower than its longest source) | 12 | 4.0 |
| 0019-setup-engine | ADR-0019, ADR-0023, PRD-setup | `tests/v2/0019-setup-engine.test.mjs` | interactive setup engine and its no-regex rule | 73 | 34.5 |
| 0019-host-config | ADR-0019, ADR-0023, PRD-setup | `tests/v2/0019-host-config.test.mjs` | host config read/write, TOML, plugin root and swap, uninstall | 121 | 1.8 |
| 0019-cli | ADR-0019, PRD-setup | `tests/v2/0019-cli.test.mjs` | the context-mode CLI | 59 | 35.6 |
| 0010-doctor-upgrade | ADR-0010, PRD-v2 section 13, GP11 | `tests/v2/0010-doctor-upgrade.test.mjs` | doctor, upgrade, release fetch, checksums, report | 124 | 12.9 |
| 0011-v1-transition | ADR-0011, GP11 | `tests/v2/0011-v1-transition.test.mjs` | v1 detect and remove, v1 migration, merge traffic | 44 | 1.7 |
| 0013-release-main | ADR-0013, PRD-v2 section 14 | `tests/v2/0013-release-main.test.mjs` | release to main: publish, plan-main, commit, branch protection | 43 | 22.0 |
| 0013-release-plan | ADR-0013, ADR-0019, PRD-v2 section 14 | `tests/v2/0013-release-plan.test.mjs` | release plan, smoke, rollback, npm publish | 60 | 23.6 |
| 0014-repo-hygiene | ADR-0013, ADR-0014, ADR-0015 | `tests/v2/0014-repo-hygiene.test.mjs` | issue forms, workflows, README, secrets, removed files | 80 | 3.6 |
| 0023-install-docs | ADR-0023, PRD-setup | `tests/v2/0023-install-docs.test.mjs` | install docs per agent use the native install command | 44 | 0.8 |
| 0021-cache-safety | ADR-0021 | `tests/v2/0021-cache-safety.test.mjs` | prompt cache safety, prefix determinism, cache usage | 37 | 9.5 |

Groups marked "stay in place" are already one file per area; the move does not touch them. The other groups merge their source files into the one target file. 252 existing files move; the sources of every group are in review/test-layout/groups.json.

## Numbers behind the table

Baseline: review/test-layout/BASELINE.md. All 2624 test names are kept: review/test-layout/baseline-names.txt. After the move the list must match with the file column ignored (collect-names.mjs).
