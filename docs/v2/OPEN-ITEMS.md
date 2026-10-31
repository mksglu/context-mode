# Open items in v2

Date: 2026-10-23. Branch: v2-design. Counts and the per-issue table: `docs/v2/ISSUE-COVERAGE.md`.

## What I ran

On this commit (macOS, clean clone, `node build/build.mjs --out release-out`):

- `node e2e/cases/run.mjs`: GP1 to GP11 and the 2 extra cases, 185 pass, 0 fail. Without `release-out` built first, 40+ cases fail with "bundle exited"; build first.
- `node --test tests/v2/`: 1368 tests, 1366 pass, 0 fail, 2 skipped (GP3 copilot-cli MCP sub-case, one win32-only grandchild check).
- `node --test tests/v2/compaction tests/v2/store tests/v2/ops tests/v2/lifecycle`: 304 pass, 0 fail.
- `node build/check-removed.mjs`: clean.
- Not run: live cases (need a real agent and model key). Their numbers come from the cited docs, not from me.

## The owner's list, checked

| Area | Verdict | Evidence |
|---|---|---|
| DB (node:sqlite, locking, WAL, concurrency) | Done in tests | `src/core/store/db.ts` uses `node:sqlite` with `timeout` 5000 and WAL; `e2e/cases/GP8-concurrency.e2e.mjs` (7 pass): four writers on one DB, 0 busy errors, `integrity_check` ok; DB-gone gives `DB_GONE`; sibling DBs opened read-only (#1213). Loss: #1056 (no checkpoint or mmap check) has no test. Windows grandchild check ran on no machine here (win32 only). |
| Stats issues | Done in tests | `e2e/cases/GP10-stats.e2e.mjs` (7 pass): net-byte denominator, binary reads zero, caller-session credit, totals consistent. The heartbeat case (#1248) is in GP8 and passes. |
| Memory | Done, thin on real data | Unit tests in `tests/v2/store`, `tests/v2/compaction`; live cases 4/4 PASS (`docs/v2/benchmarks.md` "Memory"). The fixture score (recall@5 1.000, 6 queries) is a smoke gate. The stored real-data run is recall@5 0.743, MRR 0.671 (148 queries), not re-run. |
| Compaction | Partly | Correctness 10/10 per arm after re-score (`docs/v2/review/MORNING-REPORT.md`). The model never calls `ctx_resume` or `ctx_search` from the pointer (0/10). The call-rate gate was retired (`docs/v2/review/DECISIONS-r11.md` section C), so the number is not met, it is dropped. Compaction GP cases pass offline. The live probe of the pointer design is not repeated since. Round 4 (2026-10-24, merged as 2c40245e): live compact-hard main 100% in two runs (HEAD 41.65% mean), heldout 18/18; `docs/v2/spikes/compact/RESULT.md`. du merge (b558bb37): main 36/36. Lazy line units (exp/du-units) not merged: compaction main 100% twice, heldout 18/18, 222 KB PostToolUse -0.4 ms vs pre-round-3, but M2 main 84.36 < 85; the +10 ms 222 KB PostToolUse gap stays open. |
| Saving | Target met on the M2 eval | M1 94.21 met; M2 main 92.5, heldout 97.44 on 18e4a6cd (was 87.6 and 96.52; `docs/v2/spikes/m2/RESULT.md`). After D-CR2-HANDLE-1 (fbd4f781) main is 84.03, heldout 97.73 (checker, n=2): main is below 90 again. Older runs: 87.23, 88.02. Session tokens: see item 4 below. Round 4 (2c40245e): M2 main mean 86.52 (84.33-87.63, three runs) vs HEAD 80.20; under 90. du merge (b558bb37): M2 main mean 90.22 (90.15, 90.12, 90.12, 90.48), heldout 98.59; target met. |

## Open items

- Compaction round 3 (2026-10-24, `docs/v2/spikes/compact/RESULT.md`): exp/r3-combined scores 100% on compact-hard main (two runs) and heldout, but M2 main is 86.56 (< 90), so it is not merged. Head on v2-design: main 19.4%, heldout 27.8%, M2 main 78.97. To merge, combined needs about 3.5 more M2 points (json-1 is the gap) without losing the line units. Also open: ctx_resume does not read line units; `tests/v2/bench/fixtures-run.test.mjs` `run.mjs --check` fails on handle and combined (hook bytes moved > 5% vs results.json: part1 3010 vs 4817, part2 7573 vs 8293), so results.json needs a re-record or the drift a reason; the compact-hard runner kill does not reach a model-run `find /` grandchild.

| # | Item | Status | Evidence | Owner or next step |
|---|---|---|---|---|
| 1 | Claude Code hook p95 41 ms against 40 ms (GS6) | open, FAIL | `docs/v2/TECH-SPEC.md` section 1.1; `docs/v2/review/OVERNIGHT-REPORT-2026-10-19.md` item 1 | A/B of base vs b-shape, 6 rounds on one loaded host: median paired -1.75 ms (`docs/v2/spikes/m2/RESULT.md`), so the miss is load. Owner re-measures on an idle machine. No budget was changed. |
| 2 | 64 KB PostToolUse p95 62 ms against 60 ms (T-F1 Case B); 1 MiB 114 to 166 ms | open, FAIL | same files, item 2 | Move large writes to a second process, or state the budget does not apply to 1 MiB. |
| 3 | Saving M2 below 90 | met on the M2 eval at b558bb37 (du-deny merged, D-DU-DENY-1): main runs 90.15, 90.12, 90.12, 90.48, mean 90.22; heldout 98.59. Before: round 4 (2c40245e) main mean 86.52 of three runs, heldout not re-run; closed on the M2 eval at 18e4a6cd (main 92.5, heldout 97.44); open again at fbd4f781: main 84.03 after the D-CR2-HANDLE-1 handle line (checker, n=2); node-tests-1 (failed command, PostToolUseFailure) stays 0% | `docs/v2/spikes/m2/RESULT.md`;  `docs/v2/benchmarks.md` "Saving loop"; `docs/v2/LAUNCH.md` "Claims we do not make" | Owner confirms. Open: the host ignores a replace on PostToolUseFailure (2.1.303), so a failing command output cannot shrink. |
| 4 | Session tokens against direct use on short tasks | partly fixed, not closed | Prompt cut (D-FU-OI-COST-1, c70f1e20): instructions 647 to 509 chars, `ctx_execute` 732 to 484 chars, about 110 tokens saved; fixed cost still about 800 tokens on the first request. A/B pass rule met on 4 of 6 tasks; pooled change vs plain +40.9 % before, +29.5 % after, decided by cold-cache cycles (`docs/v2/spikes/fixed-cost.md`). Gateway benchmark +2.2 %. No claim of a gain. | Rerun with `--warmup 1` and n of 8 or more. The LAUNCH vs MORNING-REPORT sign mismatch for small tasks stays: re-state one number from `bench/live/results/ab-final2.json` before publishing. |
| 5 | Compaction pointer is never used by the model | open, accepted by gate change | `docs/v2/benchmarks.md` "Compaction pointer"; DECISIONS-r11 C | Owner confirms the design is final, or picks a new pointer. Round 2 (2026-10-24): compact-hard main 44.4% / heldout 16.7% vs direct 72.2%; open: a row over RECALL_BUDGET_BYTES gives empty recall (precomputed ledger lines not done), dist-* manifests 0%, see `docs/v2/spikes/compact/RESULT.md`. |
| 6 | ADR-0006 live probe (`alwaysLoad`) | done (on arm) | 30 real sessions, Opus 5.5 and Sonnet 5.5, n = 5 per cell: `ctx_execute` visible 5/5, `ctx_search` deferred 0/5, no over-routing, no under-routing, 10/10 correct per model. `docs/v2/adr/0006-claude-code-tool-loading.md` section "Live probe 2026-10-23"; `docs/v2/spikes/adr-0006-probe.md`. | The "off" arm and the remove-the-flag check stay with GP-LIVE-ROUTING before release (ADR-0012). |
| 7 | Copilot CLI MCP `instructions` field reaching the model, and tool-name prefix (S-NAMES) | open | `docs/v2/LAUNCH.md`; DEVIATIONS (copilot-cli prefix unverified); GP3 copilot-cli sub-case skipped | Live probe on a v2 build. |
| 7b | copilot-cli tool-name prefix (S-NAMES part of row 7) | fixed in code (D-HQ-COPILOT-NAMES-2): `context-mode-` from the 1.0.103 bundle | Logged-in model turn calls `context-mode-ctx_stats` |
| 8 | No install command has passed a live test | open | `docs/v2/LAUNCH.md` ("every row says see guide"). Partial passes exist in `docs/install/*.md` tables (for example OpenCode 1.19.3 `mcp list`, Gemini 0.65.0 link). | Run each guide on a clean host. |
| 9 | npm trusted publisher, `npm-publish` environment, "latest" move | owner (founder only) | Needs the npmjs.com login and two-factor. Everything else is ready: `docs/v2/NPM-OWNER-STEPS.md`, `release.yml` job `publish-npm`, `scripts/release/check-npm-tarball.mjs`. The 5 clicks and the first command: `docs/v2/FOUNDER-DECISIONS-2026-10-23.md` item 7. | Founder only; CI holds no token. |
| 10 | `release.yml` not on `main`; old `release` and `release-staging` branches on GitHub; GS10 R1, R2 branch protection | owner | `docs/v2/LAUNCH.md` "Before the first real release"; `docs/v2/review/RELEASE-REHEARSAL-2026-10-21.md` | Land the workflow with the v2 merge; delete the rehearsal branches. |
| 11 | Hook timing on macOS and Windows is not a gate | fixed | The D3 gate (budget 15 ms, unchanged) runs on all 3 OSes. Root cause of the Windows Node 24 miss: `process.stdin` loaded 28 internal modules; `readStdin` now uses async `fs.read` on fd 0 (D-CI-PERF-6). CI run 40014617348, 9 of 9 jobs pass; gate values 3 to 12 ms. Cold first spawn is printed as info, not gated (D-CI-PERF-5). Commits 5b1be9b5, de660eb5, 456e7cb8, 6d56a48c, a37a2334. | None. The 40 ms wall p95 rule is a separate item (S2). |
| 12 | OpenCode verifier environment | unconfirmed | Not found in the repo. `docs/install/opencode.md` shows one pass (1.19.3 `mcp list`, path expansion); plugin and hook paths have no live row. | Owner names the failure; then add a live row. |
| 13 | Kiro hook output | resolved (by design) | The SessionStart hook prints the resume line once per `session_id`; a repeat id or a payload with no `session_id` gives empty stdout, exit 0. Test `tests/v2/hooks/hook-entry.test.mjs` (3 kiro SessionStart cases), e2e `GP3/kiro-sessionstart-prints-once`, fixture `e2e/fixtures/kiro/cli-v3-docs-2026-10-23/SessionStart.json` (D-FU-OI-KIRO-1, a84ffb2e). Kiro itself not run: no kiro-cli login here. | None. Run a logged-in kiro-cli once to see Kiro load the line. |
| 14 | Gemini gives no resume hint at session start | fixed | D-FU-GCH-2: the hint comes on the first `BeforeAgent` of a session, once, only when the worktree has Gemini journal rows; e2e `GP6/gemini-resume-hint-first-turn-only` | None. |
| 15 | 27 map rows with no decision (adapters, tool set, scope) | not resolved | `docs/v2/ISSUE-COVERAGE.md`, "not resolved" | Owner triage. |
| 16 | 110 map rows are "removed code path" with no per-row test | resolved-untested | `docs/v2/ISSUE-COVERAGE.md`; only `check-removed` covers them as a group | Accept, or add a check per decision (D2, D3, D8, D9, D11). |
| 17 | Gate live layer runs 0 of 31 cases in `--milestone M7`; release smoke uses one model | open | `OVERNIGHT-REPORT-2026-10-19.md` item 5; `docs/v2/review/TEST-TRIAGE-r2.md` | Run `node e2e/live/run.mjs --all` before release. |
| 18 | GitHub issues are off, so the 356 open items cannot be listed or closed from v2 | owner | `gh api repos/mksglu/context-mode` shows `has_issues` false, `open_issues_count` 356 | Turn issues on at release so v1 reporters can see the outcome. |
| 19 | #1056 DB checkpoint and mmap, 5 more "partly" rows | partly | `docs/v2/ISSUE-COVERAGE.md` | Add a GP8 case for #1056. |
| 20 | #1280 turndown bundling: no commit found by archaeology | unverified | `docs/v2/review/ISSUE-OUTCOMES-r4.md` row 1280 | Check the bundle contains turndown. |
| 21 | Gateway tenant id in git history of `v2-design` (workflow rule text from 7f320e16; removed from the tree in 0e4c1af9 and 39593282) | decided: history not rewritten | The id names a tenant and grants no access: gateway admin actions need `ADMIN_KEY` (`adminOk` in the gateway repo, `src/security/caller-identity.ts`, fails closed). A force-push cannot remove old SHAs from GitHub or forks and risks other workflows' work. New gate `build/check-secrets.mjs` (CI step, gate layer 1b, `tests/v2/repo/check-secrets.test.mjs`, D-FU-OI-TENANT-1, d55d87e2). `docs/v2/FOUNDER-DECISIONS-2026-10-23.md` item 6. | None. If the founder wants the id gone: rotate the tenant on the gateway side (founder step). |

## From docs sync

Date: 2026-10-23. A docs pass compared `docs/v2` with the code on v2-design (`src/`, `build/`, `.github/workflows/release.yml`). Where the doc was wrong, the doc was fixed (commits c7e671b9, 5e72d246, d42d38c2). These rows are the cases where the code or a decision is the open part.

| # | Item | Status | Evidence | Next step |
|---|---|---|---|---|
| S1 | The root `package.json` of the repo is a v1 file: version 1.0.169, v1 description, `main` and `exports` point to `./build/adapters/opencode/plugin.js`, `pi.extensions` to `./build/adapters/pi/extension.js`, and an `omp` key. None of these paths exist (`build/` holds only scripts). The shipped `package.json` is generated by `build/manifests.ts` (`npmPackageJson`) and is correct (`pi.extensions` = `./pi/index.js`). | open, dev file only | `package.json`; `build/manifests.ts` `OUT_PACKAGE_KEYS` | Owner: reset the root file for v2 at the merge, or state it is a dev stub. No release effect. |
| S2 | ADR-0019 D3 says wall p95 is reported, not gated. TECH-SPEC GS6, `impl/09-hooks.md` 5.3 and `e2e/checks/hook-budget.mjs` (T-GS6) still compare wall p95 with 40 ms and count a miss as FAIL. Both checks exist. | open (two rules) | `docs/v2/adr/0019-interactive-setup-and-npm-channel.md` D3; `e2e/checks/hook-budget.mjs` | Owner: retire the 40 ms wall gate, or keep both. Docs now name both. |
| S4 | `impl/13-build-release.md` still holds per-bundle detail for 4 bundles in its table; the build writes 7 (`build/build.mjs` `BUNDLES`). The text now points to `BUNDLES`; the table rows for `run`, `search`, `pi`, `opencode`, `cli` are not all written out. | open (doc gap) | `docs/v2/impl/13-build-release.md` section 2.2 | Write the missing rows, or keep the pointer. |
| S5 | Older ADR and impl text still says "no npm for v2" in history and decision-log lines (ADR-0002 migration list, ADR-0011 steps, DEVIATIONS rows). These were left as the record; each live rule was amended and links to ADR-0019. | accepted | `rg "no npm" docs/v2` | None. |
| S6 | The release has not run. `release.yml` is not on `main`, `publish-npm` has never run, and no `npm view context-mode@2` result exists. Docs say "not published yet". | owner | `docs/v2/NPM-OWNER-STEPS.md`; `docs/v2/LAUNCH.md` "Release state" | See items 9 and 10. |

## Prompt cache (2026-10-25)

Result: `docs/v2/spikes/cache/RESULT.md`. Rules: ADR-0021.

| # | Item | Status | Next step |
|---|---|---|---|
| C1 | Cross-session prefix read below 0.9 on Claude Code (after-fix n=9: off min 0.718, v2 min 0.876 without the zero pair; all n=12: off 0.715, v2 0.874) and Codex (0.847 both arms) | open, host side, not v2-only | Find if the tail differs per session |
| C2 | One v2 Claude Code cross pair read 0 | open | Repeat the pair |
| C3 | No live Pi or opencode cache run | open | Run when a login exists |
| C4 | Gemini, qwen, copilot-cli, vscode, kiro, zcode unknown | open | Live two-turn run per host |
| C5 | No prefix-determinism test or dynamic-token lint in the gate | closed (D-C5-PREFIX-1) | `tests/v2/cache/prefix-determinism.test.mjs`; `build/check-prompt-static.mjs` in gate `ci-checks` and `ci.yml` |

## Hooks on every agent (2026-10-26)

Result: `docs/v2/spikes/hooks-all/RESULT.md`. Rules: ADR-0020. Merged into v2-design at 87443e30.

| # | Item | Status | Next step |
|---|---|---|---|
| H1 | vscode: hook command and MCP args have no `--workspace-folder`, so the hook gets `NO_PROJECT` (live 200,049 -> 404, fail) | closed | Re-run 2026-10-26: vscode pass 204,513 -> 560 (RESULT.md) |
| H2 | zcode: hooks are bare handlers, not matcher groups; MCP under `mcpServers`, not `mcp.servers` + `features.mcp` | closed | Re-run 2026-10-26: zcode pass 169,068 -> 443 (RESULT.md) |
| H3 | pi: hook never resolved a project (live 200,067 -> 200,067) | closed | Re-run 2026-10-26: pi pass 200,062 -> 160 (RESULT.md) |
| H4 | copilot-cli: `bash` unmapped, no replace | closed | Re-run 2026-10-26: copilot-cli pass 203,669 -> 384 (RESULT.md) |
| H5 | Doctor `hook-runs`/`hook-seen` passed on pi while the hook could not resolve a project | closed | D-HF-DOCTOR-RUNS-1: `hook-runs` sends a large shell read per host and FAILs unless the saving effect comes back with the project resolved |
| H6 | opencode saving not recorded in `ctx_stats` (0 B; no execute rows in the journal) | closed | D-HF-INPROC-JOURNAL-1 (in-process ctx_* calls write the server row), D-HF-OPENCODE-SHELL-1 (bash is routed) |
| H7 | No run used a logged-in model session; kiro CLI, zcode CLI, VS Code loader not run | open | Live session per host when a login exists. 2026-10-26 re-run: all 10 agents pass with piped payloads (RESULT.md) |
| H8 | claude-code setup fails when a shim is first on PATH | closed | D-HF-CLAUDE-SHIM-1 (setup/doctor run the real claude past a shim; the row prints `bin: <file>`) |
| H9 | gemini hooks-fast round 1: AfterTool replace had no FATAL line; the handle line hint (`queries:["cat big.log"], source:"s1"`) gave No hits | answerOk: closed (probe sent AfterTool with no BeforeAgent; Gemini CLI 0.65.0 fires BeforeAgent with the prompt first, pinned in `tests/v2/hooks/gemini-live-order.test.mjs`). Hint: open | The handle-line query is the intent; when the output holds none of its words a source-scoped ctx_search returns No hits. Shared code (`REPLACE_HANDLE_LINE`, `ctx_search` source path): needs a design call, not a gemini fix |

## Method limits

- Test evidence is a name match between the map and test files. I did not read each assertion.
- Doc numbers were not re-measured. Where two docs disagree (item 4), both are named.

## Release order (2026-10-26)

Fix: D-RN-ORDER-1. The GitHub release is now the last job of `release.yml`, after `publish-npm`.

| # | Item | Status | Next step |
|---|---|---|---|
| N5-1 | The GitHub prerelease v2.0.0-next.4 exists, but npm has no 2.0.0-next.4 (run 40496186557: publish-npm failed with E422, D-RN-REPO-1). It was made before D-RN-ORDER-1. | open, left as is on purpose | Owner decides: delete the GitHub prerelease v2.0.0-next.4, or add a note to it that points to the next version on npm. |

- Q-WIN-5 (qwen hook on Windows cmd.exe): the quoted hook path `node "${CLAUDE_PLUGIN_ROOT}/hook.mjs"` is broken under qwen's `cmd.exe /d /s /c` spawn (Node re-quotes, node.exe sees literal quotes). Qwen replaces only `${CLAUDE_PLUGIN_ROOT}`. Choices: (a) setup writes a platform-specific qwen hook file at install time (no inner quotes on win32, a short junction or 8.3 path for spaced homes); (b) a PATH launcher bin so the command has no path; (c) report upstream to qwen to spawn with windowsVerbatimArguments. Decide, then drop `todo` in tests/v2/build/qwen-hook-shell.test.mjs. See D-WIN-QWEN-SHELL-1.
- KIRO-WIN-4 (kiro hook on Windows): Kiro's open-source base runs `cmd /C <command>` without verbatim arguments, so the quoted `"node.exe" "hook.js"` string may break on a spaced node path (same class as Q-WIN-5). Not PowerShell. Kiro V3 not run on Windows. Next step: run a logged-in kiro-cli on Windows with a spaced path, or pick the Q-WIN-5 design (launcher bin / short path). Then drop `todo` in tests/v2/setup/kiro-hook-shell.test.mjs. See D-WIN-KIRO-SHELL-1.

## Hook timing on Windows (Viet round, next.17)

| # | Item | Status | Next step |
|---|---|---|---|
| W-HOOK-1 | PostToolUse on windows-latest: p50 86 ms wall against bare node 42.7 ms (hook process 48.7 ms after node bootstrap vs 30.9 ms for PreToolUse; the extra 18 ms is the journal write: node:sqlite load, open, migrations check, append). Run 41188599098, `e2e/checks/hook-phase-profile.mjs`. D5 runs the PreToolUse fixture only, so D-D5-BARE-1 does not cover it. A p95 of 346 to 589 ms was seen once on the shared runner (Defender or runner noise, one outlier batch). | open | Measure a lazy sqlite open that skips the schema check when user_version matches (needs a profile on windows-latest first); never cut the journal row. |
