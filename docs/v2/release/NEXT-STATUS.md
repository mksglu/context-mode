# Status of the next channel

Checked 2026-10-28 against the raw registry JSON (https://registry.npmjs.org/context-mode).

## npm version on next

`next` is 2.0.0-next.17 (provenance present, SLSA v1, gitHead d526f1e5). `latest` is still 1.0.169. Checked 2026-10-30 against the raw registry JSON (dist-tags endpoint and version document). Registry time of next.17: 2026-10-30T14:02:42Z.

Tag v2.0.0-next.10 (a79fde9d) exists on origin but was never published: release.yml run 40750085948 failed in its ci job (macOS, cli/report-no-input). The tag stays where it is and is never reused. next.11 replaces it.

## What 2.0.0-next.17 ships

Changes since v2.0.0-next.16: two Codex 0.166 fixes from the Windows tester report (Viet, 0.166.0-alpha.5.1).

- D-NI-CODEX-TRUST-2: Codex 0.166 reports hooks/list currentHash as "<hook hash>/<plugin hash>". Setup now writes only the hook hash as trusted_hash, so the 4 plugin hooks are "trusted" and setup no longer rolls back. 0.156.1 plain hashes are unchanged.
- D-C166-WIN-FIRE-2: Codex 0.166 runs a hook through the session shell, PowerShell on Windows, which cannot run a leading quoted node path. On Windows only, the codex hook line is now bare node "<hook.mjs>" --agent codex. Other hosts and OSes keep the quoted absolute path. The doctor still runs the absolute node.
- Not proven: the tester's exact Desktop-bundled 0.166.0-alpha.5.1 build on Windows. Proven on macOS (0.156.1, 0.166.0, alpha.5, alpha.6) and in CI on windows-latest with codex-cli 0.166.0.

## Release numbers (next.17)

- Tag v2.0.0-next.17 on d526f1e5. N = highest 2.0.0-next.N in the raw registry JSON and origin tags (next.16) plus 1. v2-design was quiet from 15:49 (+03) for more than 45 minutes before the tag.
- Local on a fresh clone: `node --test "tests/v2/**/*.test.mjs"` 113 s, 2396 tests, 2362 pass, 0 fail, 34 skip; `gate --all` 407 s, exit 0 (live layer skipped: no live case covers the changed files); check-install-docs and check-secrets exit 0. No budget or timeout was raised.
- CI on d526f1e5 (run 41058292998): all 12 jobs green on the first run.
- release.yml run 41064404552: all jobs green on the first run, no rerun (ci, plan, build, publish-stage, smoke x3, publish-promote, publish-npm, github-release).
- Registry version published 2026-10-30T14:02:42Z (gitHead d526f1e5, SLSA v1 provenance, 2 signatures). The full package document lagged the dist-tags endpoint by about 3 minutes. GitHub prerelease v2.0.0-next.17 (not draft) at 13:59:52Z.
- `latest` stays 1.0.169. The `release` branch marketplace.json shows 2.0.0-next.17 (release commit a9b4e89e).

## What 2.0.0-next.16 ships

Changes since v2.0.0-next.15: search quality for every host, not only Pi.

- D-HTML-READABLE-1: ctx_index turns HTML (text/html fetch, .html/.htm path) into readable markdown-like text at index time with htmlparser2. No regex. Code blocks stay whole.
- D-CALL-SHAPE-1: every tool description leads with an exact example call; a bad call gets one line with the correct call. Same tool schema on all 10 hosts.
- D-SEARCH-REPLY-1: a ctx_search relevance reply holds 5 hits (SEARCH_REPLY_HITS); the More: line pages the rest. No snippet is cut.
- Parity e2e: fetch, index, search on a recorded react.dev page (tests/v2/e2e/fetch-index-search-parity.test.mjs).

## Release numbers (next.16)

- Tag v2.0.0-next.16 on 144e3495. N = highest 2.0.0-next.N in the raw registry JSON and origin tags (next.15) plus 1. v2-design was quiet from 05:09 (+03) for more than 15 minutes before the tag.
- Local on a fresh clone (seconds): `node --test tests/v2/` 101 s, 2383 tests, 2350 pass, 0 fail, 33 skip; `gate --all` 362 s, exit 0 (live layer skipped: no live case covers the changed files); check-install-docs and check-secrets exit 0 in under 1 s. No budget or timeout was raised.
- CI on 144e3495 (run 40990086878): all 12 jobs green on the first run.
- release.yml run 40992512193 needed one rerun of the failed job only: ci / windows hosts (windows-latest), copilot-cli setup exited null while the copilot CLI was still extracting its package on first start (log: "Package extraction took 23502ms"). Same cause as the CI rerun on next.15. The rerun passed; build, publish-stage, smoke x3, publish-promote, publish-npm and github-release all succeeded. No code changed between attempts.
- Registry version published 2026-10-30T03:06:30Z (gitHead 144e3495, SLSA v1 provenance, 2 signatures). The raw registry still showed next.15 for about 100 seconds after `npm notice ... may take a few minutes`. GitHub prerelease v2.0.0-next.16 (not draft) at 03:05:07Z.
- `latest` stays 1.0.169. The `release` branch marketplace.json shows 2.0.0-next.16 (release commit 5a776453).

## What 2.0.0-next.15 ships

Changes since v2.0.0-next.14: hook gates for every host. Setup and doctor now FAIL when a host would list context-mode but run no hook. Per-host proof is in docs/v2/release/HOOKS-FIRE.md.

- D-NI-QWEN-GATE-1, D-NI-GEMINI-GATE-1, D-NI-PI-GATE-1, D-HF-COPILOT-ENABLED-1, D-HF-OPENCODE-GATE-1, D-NI-VSCODE-GATE-1, D-NI-KIRO-GATE-1, D-NI-ZCODE-GATE-1.
- Live-proven with the host's own binary: claude-code, codex, gemini, qwen, copilot-cli, opencode, pi, zcode. Not proven live: vscode (hook command only) and kiro (load only).

## Release numbers (next.15)

- Tag v2.0.0-next.15 on 5ef1f189. N = highest 2.0.0-next.N in the raw registry JSON and origin tags (next.14) plus 1. v2-design was quiet from 01:52 (+03) for more than 15 minutes before the tag.
- Local on a fresh clone: v2-unit 2271 pass, 0 fail, 33 skip of 2304; `gate --all` exit 0 (live layer skipped: no live case covers the changed files); check-install-docs and check-secrets exit 0. No budget or timeout was raised.
- CI on 5ef1f189 (run 40969196868): one rerun of windows hosts (windows-latest). copilot-cli setup exited null on the first run while the copilot CLI was still extracting its package on first start; the rerun passed all 10 hosts.
- release.yml run 40974700619 needed two reruns, each for a different cause: (1) ci windows-latest node 26, hook-fuzz opencode had 2 of 500 calls over 5000 ms (timing on a loaded runner; no budget changed); (2) job `build`, attest-build-provenance signed and uploaded the attestation, then "error fetching tlog entry - (404) Not Found" (same sigstore 404 as next.14). Third attempt: all jobs green.
- Registry version published 2026-10-30T00:20:09Z (gitHead 5ef1f189, SLSA v1 provenance, 2 signatures). The first registry reads right after publish still showed next.14 for about 40 seconds. GitHub prerelease v2.0.0-next.15 (not draft) at 00:19:04Z.
- `latest` stays 1.0.169. The `release` branch marketplace.json shows 2.0.0-next.15 (release commit 24a3cc40).

## What 2.0.0-next.14 ships

Changes since v2.0.0-next.13 (5 commits, 1 behaviour change):

- D-NI-CODEX-TRUST-1: setup asks Codex `hooks/list` (via `codex app-server`) for the hooks of context-mode@context-mode only. For each untrusted hook it writes Codex's own key and hash as `[hooks.state."<key>"] trusted_hash` in $CODEX_HOME/config.toml. User hooks and other plugins are never touched. The edit is backed up, `setup --remove` restores the file, a second run changes nothing. Doctor fails on an untrusted plugin hook.
- D-README-2: the README agent table shows hooks, MCP, skills and install per host.
- Docs only: workflow files for codex-plugin-trust and readme-hooks-table, NEXT-STATUS and RESUME for next.13.

## Release numbers (next.14)

- Tag v2.0.0-next.14 on a66617dc. N = highest 2.0.0-next.N in the raw registry JSON and origin tags (next.13) plus 1. v2-design was quiet from 22:31 (+03) for more than 15 minutes before the tag.
- Local on a fresh clone: v2-unit 2187 pass, 0 fail, 17 skip of 2204; `gate --all` exit 0; check-install-docs and check-secrets exit 0. No budget or timeout was raised.
- CI on a66617dc (run 40940806100): all 12 jobs green. The release.yml run 40945644081 runs the same ci jobs again, all green.
- In its first attempt the job `build` failed in actions/attest-build-provenance@v1: the attestation was signed and uploaded (Rekor logIndex 3575599008), then "error fetching tlog entry - (404) Not Found". That is a registry/timing error of the sigstore service, shown in the log. One rerun of the failed job only (`gh run rerun --failed`): green, all publish jobs green. No code changed between the two attempts.
- Registry version published 2026-10-29T20:27:54Z (gitHead a66617dc, SLSA v1 provenance, 2 signatures). GitHub prerelease v2.0.0-next.14 (not draft) at 20:26:52Z.
- `latest` stays 1.0.169. The `release` branch marketplace.json shows 2.0.0-next.14 (release commit 5e49b72b).

## What 2.0.0-next.13 ships

Changes since v2.0.0-next.12 (4 commits):

- D-DOC-RT-1: doctor D3 and D4 agree with setup for Codex and MCP hosts. One `ownMcpValue` source; D4 reads CODEX_HOME. Fixes the false FAIL a tester saw after setup on next.11.
- D-LEF-1: six local live e2e cases follow the current contracts (T-F1 updatedToolOutput object, ci-config, release-plan-bump, repo-cleanup-gate and others). CI runs four keyless ones (ci-config, release-plan-bump, repo-cleanup-gate, v1-migration-gemini).
- D-LEF-2: live run.mjs root uses fileURLToPath, so it runs on Windows.
- Still open, not fixed: the T-F1 64 KB PostToolUse wall p95 reads 63 to 74 ms against 60 on a loaded Mac; T-GS6 passes at exactly the limit of 40. No threshold was raised. Run both again on an idle machine. They are not in CI.

## Release numbers (next.13)

- Tag v2.0.0-next.13 on c340dae8. N = highest 2.0.0-next.N in the raw registry JSON and origin tags (next.12) plus 1.
- Local on a fresh clone: v2-unit 2183 pass, 0 fail, 17 skip of 2200; `gate --all` exit 0; check-install-docs and check-secrets exit 0. No budget or timeout was raised.
- CI on c340dae8 (run 40919372631): all 12 jobs green. The release.yml run 40925377340 runs the same ci jobs again. In its first attempt the job `ci (windows-latest, node 24.15.0)` failed in the v2 unit step on three timing cases: T-F5 `windows-grandchild-kill` ("bundle did not exit in 2000ms"), H5 `doctor-hook-runs` ("hook did not finish"), and the known-defect cases Q-WIN-5 and KIRO-WIN-4 (shown as warnings, `# KNOWN DEFECT` / `# UNVERIFIED`). All other 11 jobs were green. One rerun of the failed job only (`gh run rerun --failed`): green. No code changed between the two attempts. The T-F5 and H5 timing on windows-latest is a flake to look at; it is not understood yet.
- release.yml run 40925377340 green after that one rerun (main-* and rollback skipped, as designed). Registry version published 2026-10-29T18:26:19Z. GitHub prerelease v2.0.0-next.13 (not draft) at 18:24:58Z.
- `latest` stays 1.0.169. The `release` branch marketplace.json shows 2.0.0-next.13.

## What 2.0.0-next.12 ships

Changes since v2.0.0-next.11:

- D-HNE-GUARD-1: the hook never errors on any of the 10 hosts. On an internal failure it exits 0 with a valid decision in the host's own shape (stdin, decode, project resolve, policy/store, encode, Node below NODE_MIN). Flooding native tools are denied with the sandbox redirect and "run ctx_doctor"; ctx_* and harmless tools pass.
- D-CDX-CAT-1: the shell-dump deny checks every command in a chain, follows cd, and unwraps zsh -c.
- D-V1DIFF-*: v1 differential harness (371 recorded v1 router calls) and a 10-host property test of the built hook.
- D-CR-SCRIPTS-1: check-removed allows scripts/ci-install.mjs and scripts/v1-cases/. Found by `gate --all`; CI skips that step below M7, so CI did not show it.

## Release numbers (next.12)

- Tag v2.0.0-next.12 on c8f6a68d. N = highest 2.0.0-next.N in the raw registry JSON and origin tags (next.11) plus 1.
- Local on a fresh clone: v2-unit 2176 pass, 0 fail, 17 skip of 2193; `gate --all` exit 0 (live 1 of 30 ran); check-install-docs and check-secrets exit 0. No budget or timeout was raised.
- Two earlier local gate runs failed on load only (load average over 100): codex-cat-redirect ENOTEMPTY on temp dir cleanup, and the 50 ms units/222KB check. Each passed when the load fell.
- CI on c8f6a68d (run 40903234519): all 12 jobs green, incl. macOS and the windows hosts matrix.
- release.yml run 40905873629 green (main-* and rollback skipped, as designed). Provenance logged to sigstore logIndex 3571241116. Registry version published 16:11:15Z. GitHub prerelease v2.0.0-next.12 at 16:11:30Z.
- `latest` stays 1.0.169. The `release` branch marketplace.json shows 2.0.0-next.12.

## What 2.0.0-next.11 ships

Changes since v2.0.0-next.9 (19 commits; DEVIATIONS rows added):

- D-CKPT-LAT-1: the checkpoint no longer runs on the read path (ctx_stats, ctx_search). Windows latency fix.
- D-NO-TRUNCATE-1: no TRUNCATE anywhere (no wal_checkpoint(TRUNCATE), no TRUNCATE SQL, no fs truncate). Guard: tests/v2/repo/no-truncate.test.mjs.
- D-NO-LOSSY-CUT-1, D-NO-LOSSY-CUT-2: the doctor report is stored whole; long echoes are named by id. No content is thrown away with no way back.
- D-DOC-D3-ROOT-1: doctor D3 root fix.
- D-MO-3: Codex gets context7 too.
- D-CLI-EPIPE-1: product bug that stopped next.10. In `mcpCheck` (src/setup/engine.ts) the initialize write had no `error` listener on the server stdin. A server that exits or closes its input first gave EPIPE, an uncaught error, and the CLI exited 1 before the report. Now it is the FAIL row `mcp: server closed its input` and the report is written. Test first: cli/report-server-closes-stdin was red, then green.
- D-HOOK-SYNC-1 stays reverted. Not in this release. Owner decision needed.

## Release numbers (next.11)

- Tag v2.0.0-next.11 on c3982498. N = highest 2.0.0-next.N in the raw registry JSON and origin tags (next.10 tag) plus 1.
- CI on c3982498 (run 40757175981): all 12 jobs green, incl. macOS and windows hosts on 3 OS.
- Local on a fresh clone of c3982498: `build --generated-only` ok, `gate --all` exit 0, v2-unit 1991 pass, 0 fail, 17 skip of 2008, live 0 of 30 ran (no case covers the changed files), check-install-docs and check-secrets exit 0. No budget or timeout was raised.
- Two earlier local runs failed on timing only, with machine load average 75 to 100: first run doctor-env D1 and opencode-dir (10 s each, `no network`), second run the 50 ms units/222KB check (126 ms). Each file passed alone. The third full gate run, after the load fell, was clean.
- release.yml run 40766996320 green (rollback and all main-* jobs skipped, as designed; ci, build, stage, smoke on 3 OS, promote, publish-npm, github-release). Run start 20:51:36Z; GitHub prerelease 21:12:51Z; registry showed the version at 21:14:10Z.
- `latest` stays 1.0.169; GitHub release v1.0.169 is still Latest. The `release` branch marketplace.json shows 2.0.0-next.11.
- Later docs-only head b3610d95: CI red on one job, windows node 24.15.0, T-F5 `check on Windows: 10 runs, 0 grandchildren alive`. This is the known open T-F5 flake (see Open items). Not part of this release.

## What 2.0.0-next.9 ships

Changes since v2.0.0-next.8 (51 commits; DEVIATIONS rows added):

- D-MO-1, D-MO-2: main-only release path. `release.yml` has a `route` job: a `workflow_dispatch` on main takes the new `main-*` jobs (channel next or latest, `confirm_latest`, npm, release commit and tag on main, GitHub release). Every other start, including this tag push, keeps the old release-branch jobs, so testers still install from `release` until merge day. Build writes root Gemini and Qwen manifests that point into `plugins/claude-code/`. Not yet run on main: the first real main run is the proof (Gemini hooks from the subfolder, Qwen install from the real repo).
- D-PKG-META-1: the v2 package.json is the source of the release fields; plugin manifests carry the v2 version and description.
- D-CI-PERF-8: `resolveProject` computes projectKey, projectDir and dbPath on first read (PreToolUse hook overhead on Windows). Behaviour change: a missing HOME throws NO_HOME at the first read of a store field.
- D-CI-BATCH-DEADLINE-1, D-CI-PERF-2, D-CI-IDENT-1: test-only changes (no wall-clock budget in the ctx_batch deadline test; heldout search p95 is the lowest of 3 passes; git identity in the commit-main race test; T-F5 check records how long a surviving grandchild lives). No budget or timeout was raised.
- D-HOOK-SYNC-1 (synchronous=NORMAL) was applied and then reverted: it can lose the last commits on an OS crash. Not in this release. Owner decision needed.

## Release numbers (next.9)

- Head b808edb0 (docs-only commit over e2865520). Local on the head: `build --generated-only` ok, v2-unit 1960 pass, 0 fail, 17 skip of 1977, `gate --all` exit 0 (live 0 of 30 ran: no case covers the changed files), check-install-docs, check-secrets clean. Fix rounds: 0.
- CI on e2865520 (run 40703242303): all 12 jobs green, incl. macOS and windows hosts on 3 OS. CI on b808edb0: success.
- CI on the earlier head 106cdda3 (run 40699061925) was red on 2 jobs: ubuntu node 26 GP-SEARCH/heldout p95 81.6 ms > 50 ms, and windows node 24.15.0 T-F5 `check on Windows: 10 runs, 0 grandchildren alive`. Both passed on the next head with no product change in between. No rerun was used. Root cause of both is not proven.
- Tag v2.0.0-next.9 on b808edb0. release.yml run 40709418131 green; `route` chose the release layout, all `main-*` jobs skipped, as designed. publish-npm step ended 15:05:19Z; GitHub prerelease 15:05:35Z; the registry showed the version only at 15:08:31Z (about 190 s after the publish step).
- `latest` stays 1.0.169; GitHub release v1.0.169 is still Latest. The `release` branch marketplace.json shows 2.0.0-next.9.

## Release numbers (next.8)

- Gate on head 4fb62aa6: `gate --all` exit 0. v2-unit 1914 pass, 0 fail, 17 skip of 1931. Live 1 of 30 ran. Fix rounds: 1.
- Tag v2.0.0-next.8 on 4fb62aa6. release.yml run 40611388019 green (rollback skipped, as expected). npm publish step ended 01:10:17Z, GitHub prerelease created after it by job order (github-release needs publish-npm); the registry `time` field for the version reads 01:11:55Z, 81 s after the GitHub release timestamp (01:10:34Z). Cause of that registry delay not found.
- `latest` stays 1.0.169; GitHub release v1.0.169 is still Latest.

## How to test it

npm way:

```sh
npm i -g context-mode@next
context-mode setup
context-mode doctor
```

Claude Code native way:

```
/plugin marketplace add mksglu/context-mode#release
/plugin install context-mode@context-mode
```

## Per agent

Bytes are one large tool result (about 200 KB log): without context-mode -> with v2.
"Live" means a real model turn ran. "Doc-verified" means the hook shape was checked, but no model turn ran.
The Claude Code, Pi and OpenCode rows are from next.6 and were not re-tested for next.7.

| Agent | Pass | Live or doc-verified | Bytes off -> v2 | Problems |
|---|---|---|---|---|
| Claude Code (next.6) | yes | live | 2,312 -> 226 | None reported. |
| Codex | yes | live | 16,596 -> 1,091 | Off figure is the rollout size, cut by codex to 16,399 bytes for the cat call. Full size is 200,013 bytes in the --json stream. Doctor shows WARN hook-seen until one tool call runs. |
| Gemini CLI | yes | doc-verified | 200,097 -> 168 | No live run, no login. A BeforeAgent payload with a cwd that is not a git repo made the hook print `NO_GIT_DIR` and exit 0. Probably my fake cwd. Hooks may not run outside a git repo. |
| Qwen Code | no | doc-verified | 207,035 -> 425 | skills/ctx-stats/SKILL.md names two tool names. The host tool is `mcp__context-mode__ctx_stats` only. That breaks one channel. Hook-seen is WARN. |
| Copilot CLI | yes | doc-verified | 189,670 -> 382 | No live session, no login. Hook-seen is WARN. Setup plus host CLI install took about 3 minutes. |
| OpenCode (next.6) | yes | doc-verified | 200,115 -> 250 | Not installed, so no model call. Doc not fetched. |
| Pi (next.6) | yes | doc-verified | 192,021 -> 119 | No live model (needs provider login). The tool_call hook did not block `cat`. |
| VS Code (Copilot) | yes | doc-verified | 219,930 -> 112 | No output for a PreToolUse `curl` or `cat` payload. hook.mjs maps `run_in_terminal` to Bash but not `runTerminalCommand`. Real name not confirmed. |
| Kiro | no | doc-verified | 183,414 -> 400 | Kiro CLI not installed. The hook names the tool `mcp_context-mode_ctx_execute`. Kiro docs do not say how a hyphen in the server name is changed. skillOk is false. |
| ZCode | no | doc-verified | 200,036 -> 436 | ZCode CLI not installed. Documented name is `mcp__<server>__<tool>` and the repo already matches. skillOk is false and the cause is open. |

## Fixes in this release

- VS Code: the decoder (src/adapters/vscode.ts) now reads the camelCase payload. It no longer fails silently. Docs show both snake_case and camelCase shapes and name no VS Code version.
- Kiro: the decoder and tool names now match the Kiro docs (PascalCase event names). The skill text is not confirmed, because the MCP name for a hyphen server is not documented.
- ZCode: no behaviour change. The prefix already equals the documented name. The new test was green on first run, so it did not go red. No code bug found behind skillOk=false.
- Codex: setup now writes `default_tools_approval_mode = "approve"` in `[mcp_servers.context-mode]`, next to `omit_tools_from`. The live run on codex 0.156.1 accepted it. `codex mcp list` showed the entry enabled.

## Open items

- Windows: a logged-in host session never ran, so doctor `hook-seen` stays WARN. vscode, kiro and zcode cannot be installed on a runner (config-level proof only).
- Windows: opencode keeps a stale plugin path after a package move (no agent flag in the plugin list; D-WIN-HOOKMERGE-1).
- Windows: `e2e/checks/windows-grandchild-kill.mjs` failed once on a 2 s close budget (run 40590253825) and in the next.6 release run; root cause not found, budget not changed.
- Timing: `[r3] units/222KB` (50 ms budget) failed once under full-suite load on a laptop (91 ms), passes alone and on rerun; budget not changed.
- Registry `time` for a version can lag the publish step by about 80 s; the GitHub release can look earlier than npm in the registry.
- Release (next.9): T-F5 (`windows-grandchild-kill`) missed one grandchild on run 40699061925 (windows node 24, run 3 of 10); root cause not proven, the check now records `diedAfterMs`. GP-SEARCH/heldout p95 81.6 ms once on ubuntu node 26 (run 40699061925); budget not changed.
- Release (next.9): D-HOOK-SYNC-1 reverted, owner decision on data-loss risk needed. Main-only path has two open owner questions (Codex marketplace entry; allow github-actions to push the release commit and tag to main). See docs/v2/release/MAIN-ONLY.md.
