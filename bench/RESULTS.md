# v2 benchmarks

## Summary (2026-10-21, v2-design `980272a5`)

Agent: Claude Code 2.1.303. Model: claude-sonnet-5-5, effort low. Keyless `claude -p`, `--max-budget-usd 0.25` per session. Each number below is explained in the section named in the last column.

| Measure | Result | Source, date | Section |
|---|---|---|---|
| Large output, what the model saw | Full output 8,893 / 19,998 / 28,003 / 60,090 bytes; model saw 152 / 187 / 182 / 190 chars; answer correct 16 of 16 (4 sizes x git and non-git x 2), no error | live proof, 2026-10-21 | Replace live proof (final) |
| Saving score, median of 3 runs | M1 94.21, M2 87.23 (target 90: M1 met, M2 not met). Per run M1/M2: 94.21/89.32, 94.21/85.83, 94.21/87.23. `guardsOk` false in all 3 runs: only the gate guard failed (layer `check-removed`); success, small-output and token guards passed. Lock hashes match `bench/saving-score.lock`. Median v2 small-task session tokens 38,178 (off arm about 36,167 to 36,196) | `bench/saving-score.mjs`, 3 runs, 2026-10-21 | Saving loop |
| Final A/B, large tasks (multi-1, big-tests, big-json, json-1; 36 sessions) | median tool_result bytes off 4,694.5, v1 2,436.5, v2 734.5; median session tokens off 55,897, v1 65,599, v2 60,390 (v2 -19.6 % vs off, -2.7 % vs v1); 12/12 pass per arm; cost off 0.607, v1 0.754, v2 0.391 USD | `bench/live/results/ab-final2.json`, 2026-10-21 | Final A/B (after final push) |
| Final A/B, small tasks (5 tasks x 3 runs; 45 sessions) | median session tokens off 36,184, v1 42,493, v2 38,210 (v2 -5.7 % vs off, +10.2 % vs v1); median tool_result bytes 31 / 31 / 8; 15/15 pass per arm; cost 0.330 / 0.537 / 0.359 USD | same | same |

Plain reading:
- v2 cuts the bytes the model reads when the output is large (734.5 vs 4,694.5, 84 % fewer; the 60 KB test case: 60,090 bytes became 190 chars). This is what the product does.
- v2 does not yet cut session tokens. On small tasks it costs a fixed 5.7 % more than no plugin (about 2,000 tokens of tool schemas and hooks; v1 costs about 6,300). On large tasks big-tests saves 28 % tokens, but multi-1 (+29 %) and big-json (+74 %) use more, because the model spends extra turns on `ctx_*` calls. These two are not tuned yet.
- The M2 score is below 90 and varies between runs (85.83 to 89.32); big-json is the noisiest task (74.51 to 86.6). `bench/saving-score-last.json` holds an older run (M2 84.02, 2026-10-20), not this median.
- Earlier tables in this file (offline replay, 20-task live A/B, Final A/B of 2026-10-20 or 2026-10-21 with 6 tasks) are kept as history. They were measured on earlier builds; where they differ from this summary, this summary is newer.

## Offline replay

Measured 2026-10-19 (run date; the clock says 2026-10-20 in the session). Node v26.8.1. Method: `bench/README.md`. Script: `bench/replay.mjs`. Aggregate JSON: `bench/offline-aggregate.json`.
This is a byte count over real transcripts. It is not a model run and it does not measure answer quality.

Corpus: 2986 transcript files, 820 sessions with at least one paired tool call, 23175 paired tool calls. 2 files over 200 MB were skipped (logged). Transcript dates 2026-05-10 to 2026-10-19. 244 image blocks in results were not counted. 1 result had no matching tool_use.
Agent: Claude Code. Most calls come from versions 2.1.283 (5693 calls), 2.1.198 (5103), 2.1.220 (2796), 2.1.150 (2643), 2.1.149 (2108). Models on the tool-call turns: claude-opus-5-5 (6178), claude-opus-4-8 (5374), claude-opus-4-7 (5342), claude-opus-5 (3541), claude-fable-5 (2047), claude-haiku-4-5-20251001 (1204), claude-sonnet-5 (80), claude-fable-5-1 (49).

"Before" = bytes the model received. "After" = bytes v2 would return: deny text for a deny, bytes before plus hint text when the hint fires, ctx tools as is, case C replace for subagent results over 16384 bytes (0 such calls fired). "With re-run bound" adds min(bytes before, 16384) for every deny, as an upper bound on the cost of the model running the denied call through ctx_execute (that reply is not in the transcript). Session median and p90 are over sessions that used the tool. Rows shown: tools with a deny, a hint, or at least 500 calls. The other tools are in the JSON; their saving is 0.

| Tool | Calls | Bytes before | Bytes after | Saving % | Saving % with re-run bound | Session median % | Session p90 % | Sessions |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Bash | 13894 | 19655778 | 20225778 | -2.9 | -4.3 | -26.8 | -0.9 | 637 |
| Read | 1506 | 4236952 | 3337293 | 21.2 | 10.4 | -32.1 | -0.7 | 181 |
| mcp:other | 708 | 1908466 | 1928186 | -1.0 | -1.0 | -9.0 | -0.1 | 13 |
| ctx_execute | 1027 | 1655378 | 1655378 | 0.0 | 0.0 | 0.0 | 0.0 | 29 |
| Agent | 977 | 1591038 | 1591038 | 0.0 | 0.0 | 0.0 | 0.0 | 27 |
| Edit | 2423 | 493991 | 493991 | 0.0 | 0.0 | 0.0 | 0.0 | 76 |
| Write | 856 | 165753 | 165753 | 0.0 | 0.0 | 0.0 | 0.0 | 75 |
| WebFetch | 67 | 56587 | 22340 | 60.5 | -39.5 | -42.1 | 30.9 | 43 |
| Grep | 1 | 171 | 355 | -107.6 | -107.6 | -107.6 | -107.6 | 1 |
| **Corpus total** | 23175 | 30798642 | 30454640 | 1.1 | -1.5 | -17.0 | 0.0 | 820 |

Counts: 599 denies (Bash 504, WebFetch 67, Read 28), 861 hints fired, 0 replaces.

What the numbers say, and what they do not:
- Corpus saving is 1.1% of bytes without the re-run bound and -1.5% with it. v2 policy alone does not cut bytes much on this corpus.
- Bash is negative. The 504 deny texts and 627 fired hints add bytes. Most Bash outputs in this corpus are small, so a hint costs more than it can save in the same call.
- Read is the one tool with a real saving (21.2%, 10.4% with the bound): 28 denies of large unranged reads. The Read size is the result size, not the disk size (approximation 1 in the README).
- Per-session medians are negative because most sessions are short and have few calls; the corpus total is dominated by a few large reads.
- Not measured: whether the model then uses ctx_execute / ctx_search and receives fewer bytes in later turns, the effect of hints on later calls, and quality. Many sessions already ran with v1 hooks or ctx tools, so "before" already holds v1 effects (README, approximation 3).

### Offline replay after D-M7-RR-1/2 (run-then-replace, no hints)

Measured 2026-10-20 with the new `bench/replay.mjs` (same method, same corpus read again: 821 sessions, 23203 paired calls, so the corpus grew by 28 calls since the table above). The script now models: main agent result over OUTPUT_CAP is replaced by `selectChunksInMemory` chunks plus the more line (real `chunkText`); no hints; denies only where kept (Read, WebFetch, user policy). "Old" = the pre-change policy code (commit before a6e86d8) run on this same corpus, so old and new share one corpus. Aggregate: `bench/offline-aggregate.json` (new, with `buckets`).

| Tool | Calls | Bytes before | Old after | Old saving % | New after | New saving % | New saving % with re-run bound |
|---|---:|---:|---:|---:|---:|---:|---:|
| Bash | 13917 | 19690450 | 20260676 | -2.9 | 19034971 | 3.3 | 3.3 |
| Read | 1506 | 4236952 | 3337293 | 21.2 | 3233077 | 23.7 | 12.9 |
| WebFetch | 67 | 56587 | 22340 | 60.5 | 22340 | 60.5 | -39.5 |
| **Corpus total** | 23203 | 30837401 | 30493625 | 1.1 | 28726463 | 6.8 | 5.2 |

New counts: 95 denies (Read 28, WebFetch 67, Bash 0), 0 hints, 152 replaces (Bash 103, Read 8, other 41). Bash has 0 denies because the replay has no user deny list and no Bash call in the corpus hit a shell-dump rule.

Saving % by result size (bytes before vs bytes after; negative = more bytes):

| Bucket | Calls | Bytes before | Old saving % | New saving % |
|---|---:|---:|---:|---:|
| <=1K | 16508 | 5424702 | -11.2 | -0.1 |
| 1-4K | 5101 | 10482240 | 0.0 | 0.2 |
| 4-16K | 1410 | 10465885 | 0.3 | 0.2 |
| 16-64K | 184 | 4464574 | 20.7 | 46.5 |
| >64K | 0 | 0 | - | - |

Per tool:

| Tool | <=1K old / new | 1-4K old / new | 4-16K old / new | 16-64K old / new |
|---|---|---|---|---|
| Bash | -16.0 / 0.0 | -0.1 / 0.0 | 0.1 / 0.0 | -0.4 / 30.3 |
| Read | -11.5 / 0.0 | -0.6 / 0.0 | -0.1 / 0.0 | 82.8 / 88.9 |
| WebFetch | -20.1 / -20.1 | 78.9 / 78.9 | 96.8 / 96.8 | - |

What this says, and what it does not:
- The corpus saving goes from 1.1% to 6.8%. The two sources: the small-output losses are gone (deny and hint bytes on outputs <= 1 KB), and Bash results of 16-64 KB now save 30.3% instead of costing bytes.
- The re-run bound for Bash is now equal to the plain saving, since no Bash call is denied and so none needs a re-run.
- Session median and p90 are 0.0 for the corpus (most sessions have no result over OUTPUT_CAP and no kept deny). The earlier -17.0 median came from hints and denies on short sessions.
- Not measured: whether the model asks ctx_search for the "more" part later (that cost is not in the transcripts), and answer quality. The replace uses the Bash `description` as intent; when it is empty the selection has no query (see the open issue in the code results).
- WebFetch is unchanged and still negative on <=1K results (53 denies).

## Live A/B

Measured 2026-10-19 (run date; the clock says 2026-10-20 in the session). Agent: Claude Code 2.1.303. Model: claude-sonnet-5-5, effort low, `--max-budget-usd 0.25` per session. Keyless harness (ADR-0012), isolation env keys from D-M7-CL-3. Method: `bench/live/README.md`. Script: `bench/live/run.mjs`. Aggregate JSON: `bench/live/results/aggregate.json`. Raw per-session rows stay outside the repo.

Design: 20 tasks with large local output (5 logs, 4 big JSON, 4 test runs, 4 big files, 3 git histories), 3 runs per task per arm, 120 sessions. Arm `on`: `--plugin-dir release-out` (v2 build). Arm `off`: `--strict-mcp-config`, no plugin. Same built-in tools in both arms. Each task is checked by script (answer must contain the expected value). Tokens come from the stream-json `result` usage. "Session input" = input + cache creation + cache read. "Fresh input" = input + cache creation. Saving % per task = 1 - median(on) / median(off) over its 3 runs; the table gives the median, min and max over the 20 tasks. Negative = the plugin arm read more.

| Measure | Result |
|---|---|
| Saving %, session input | median -6.7, min -6.9, max +29.7 |
| Saving %, fresh input | median -18.6, min -22.2, max -4.3 |
| Median session input per session | on 38612, off 36160.5 |
| Success rate | on 60/60, off 60/60 |
| List-price cost (estimate, not a bill) | on $1.4121, off $1.2744, total $2.6865 |

Observed:
- In 15 of 60 `on` sessions the model called a context-mode tool (10 of 12 JSON sessions, 5 of 12 test-run sessions, 0 elsewhere). The three JSON tasks json-1 to json-3 show +29.6 to +29.7% session input saving. All other tasks except json-4 show -6.6 to -6.9%.
- In the other `on` sessions the model used Bash, Read or Grep, as in `off`. The `on` arm then pays for the extra tool descriptions and hook text and gets no saving.
- Both arms passed every task, so no answer quality was lost or gained at this size.

What this does not show: fixtures are 0.3 to 3 MB at most, so outputs are large for a task but small for a long session. Sessions are one turn of work, so the fixed plugin overhead is not spread over many calls. Only 3 runs per task. One model, one agent version. The list-price cost is an estimate from the CLI. This run gives no support for a claim that the plugin saves tokens on single-task sessions of this kind.

## Quick A/B

Measured 2026-10-20. Agent: Claude Code 2.1.303. Model: claude-sonnet-5-5, effort low, `--max-budget-usd 0.25` per session. Isolation env keys from D-M7-CL-3. Script: `bench/live/ab-quick.mjs`. Aggregate: `bench/live/results/ab-quick.json`. Raw rows stay outside the repo.

Design: 6 tasks (first of each kind in `bench/live/tasks.mjs`: log-1, json-1, tests-1, file-1, git-1, plus a new `multi-1`: three `cat` calls on 1500-line files, one secret value in each). 3 arms: `off` (`--strict-mcp-config`, no plugin), `v1` (plugin dir `/private/tmp/cm-v2-fu-ab/v1src`, package version 1.0.169), `v2` (this branch built to `release-out`). 1 run each, 18 sessions, all in parallel. Wall time 57 s. Total cost $0.8489. Success = the answer contains every expected value.

| Arm | Sessions | Pass | Median session tokens | Median saving % vs off | ctx tool calls | Cost USD |
|---|---:|---:|---:|---:|---:|---:|
| off | 6 | 6/6 | 36220 | - | 0 | 0.1910 |
| v1 | 6 | 6/6 | 42573 | -17.5 | 1 | 0.2696 |
| v2 | 6 | 6/6 | 38262 | -5.7 | 2 | 0.3883 |

Session tokens = input + cache creation + cache read. Saving is the median over the 6 tasks of 1 - arm / off.

Per task (tokens; ctx calls; cost USD):

| Task | off | v1 | v2 |
|---|---|---|---|
| log-1 | 36191; 0; 0.0264 | 42483; 0; 0.0397 | 38122; 0; 0.0790 |
| json-1 | 54976; 0; 0.0323 | 88800; 1; 0.0556 | 58103; 1; 0.0865 |
| tests-1 | 36122; 0; 0.0253 | 42495; 0; 0.0389 | 38227; 1; 0.0799 |
| file-1 | 36163; 0; 0.0259 | 42453; 0; 0.0392 | 38207; 0; 0.0799 |
| git-1 | 36248; 0; 0.0213 | 42651; 0; 0.0350 | 38296; 0; 0.0235 |
| multi-1 | 108250; 0; 0.0598 | 74866; 0; 0.0613 | 82354; 0; 0.0396 |

What this says, and what it does not:
- v2 is 5.7% worse than off at the median and 11.8 points better than v1. On every task with a small output (log, json, tests, file, git) the fixed cost of the plugin is larger than any saving: about +1.9 K tokens over off.
- Only `multi-1`, the task with three large outputs in a row, shows a saving: v2 saves 23.9% vs off (82354 vs 108250); v1 saves 30.8% (74866). v1 is lower on this one task. One run each, so this is not a statistical result.
- v2 costs more in USD than off on 5 of 6 tasks (total $0.3883 vs $0.1910). Four v2 sessions cost about $0.08, twice the other arms; this is not explained here and one run each cannot say if it is noise or cache-write cost of the plugin prompt.
- The log, file and tests outputs here are below or near the point where Claude Code itself persists large results, so the hook may not see the full text (see the live check in the code results). This run does not prove the replace reaches the model.
- 1 run per cell, 6 tasks, 1 model. Treat all deltas as direction only.

## Cost per session

Measured 2026-10-20, same setup as Quick A/B (claude-sonnet-5-5, effort low, keyless, isolation env, sessions in parallel). 2 tasks (log-1, file-1) x 2 arms (off, v2) = 4 sessions. Usage read from the stream-json `result` event; per-call rows from the `assistant` events. Raw stream files stay outside the repo.

| Session | Cost USD | input | cache_creation | cache_read | output | turns | model calls | tools in init |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| log-1 off | 0.0197 | 4 | 3726 | 32458 | 153 | 2 | 2 | 27 |
| log-1 v2 | 0.0216 | 4 | 4390 | 34166 | 63 | 2 | 2 | 36 |
| file-1 off | 0.0199 | 4 | 3731 | 32480 | 170 | 2 | 2 | 27 |
| file-1 v2 | 0.0249 | 4 | 5077 | 33560 | 120 | 2 | 2 | 36 |

First model call, cache_creation + cache_read (= the prompt prefix): off 17976 and 17987; v2 19175 and 19185. So v2 adds about 1200 tokens to the prefix. The cause is the 9 context-mode tools (36 vs 27 tools in init): their names, descriptions and schemas. The SessionStart hook adds only one 210-byte line ("This session may have run before. Call ... ctx_resume ..."), about 35 tokens, and it is the same text in both v2 sessions.

Finding:
- Warm cache: v2 costs +$0.002 (log-1) to +$0.005 (file-1) per session, +10% to +25%. Turns and model calls are equal (2 and 2), output tokens are not higher. The extra cost is cache_creation: +664 and +1346 tokens, billed at the write rate (higher than the read rate).
- How much of the prefix is a cache write depends on what other sessions wrote first. v2 first call wrote 4184 (log) and 4810 (file) tokens, off wrote 3494 both times. The difference between the two v2 runs (626 tokens) is the part of the prefix that was not yet cached when that session started (parallel start, shared cache).
- Cold cache: in Quick A/B the v2 build was new, so no session had written its tool-list prefix before. Writing a whole ~19 K prefix at the write rate costs about $0.07, which matches the four v2 sessions at about $0.08 (off: $0.026). This is an inference from the prices and the numbers above; the Quick A/B raw rows have no per-call split, so it is not measured there. The 2 runs here (warm) do not reproduce the $0.08.
- Tokens only +6% in Quick A/B because token counts treat a cache write and a cache read the same; USD does not.

Per-session byte in our output: none found. The SessionStart text and the tool list are the same in both v2 sessions (hook output 210 bytes each, 9 plugin tools each). The tool list differs from off by design, so the first session after a plugin build or tool-description change pays the cache write once. No change to `src/` was made. Not tested: a third run after a longer pause, and cache TTL effects; one run per cell, so treat the warm numbers as direction only.

## Method check

Checked 2026-10-20 by a second reader (no new model runs). Result: no number was changed. Findings:

- Offline replay: all 9 table rows and the totals (23175 calls, 599 denies, 861 hints, 0 replaces, 1.1% and -1.5%) match `bench/offline-aggregate.json` exactly. Tool rows sum to the corpus total (23175 calls, 30798642 bytes). Negative results (Bash, mcp:other, Grep) are shown, not dropped.
- Live A/B, same tasks in both arms: 20 tasks, 3 runs each, 3 per arm per task (checked in the aggregate and in the private rows: 120 unique task/arm/run ids, 60 per arm). The aggregate medians, min and max recompute from `perTask` (median -0.0672 total, -0.1858 fresh).
- Success not lower in the `on` arm: 60/60 on, 60/60 off. Per-group counts from the private rows agree (log 15/15, json 12/12, tests 12/12, file 12/12, git 9/9 in each arm). The success check is a script on the answer, so it cannot tell a better answer from a worse one; it only shows both found the value.
- Cherry-picking: none found. All 120 sessions are in the aggregate, the `on` arm costs more ($1.4121 vs $1.2744) and reads more input, and the text says so. The claim "15 of 60 `on` sessions used a context-mode tool (10 of 12 json, 5 of 12 tests, 0 elsewhere)" matches the private rows.
- Private data: in the measurement files (`bench/`, `bench/RESULTS.md`, `https://github.com/mksglu/context-mode/tree/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/prompt/`, `e2e/live/routing/`) no home path, e-mail (other than the noreply commit identity and fixture addresses on `example.*`) or prompt text was found. Raw rows stay in the private dir. Outside this scope, `git grep` finds a home path in `docs/architecture/modules/07-tools-ops.md`, `docs/architecture/modules/11-server.md`, `https://github.com/mksglu/context-mode/tree/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/review/*` and `e2e/live/compact/results/*` (the last use a masked user name). They are not benchmark data and were not edited here; the owner should decide whether to scrub them.
- Weak points to keep in mind: (1) the routing verdict in `bench/routing-results.md` changed from FAIL to PASS because the scoring rule was changed after the first runs; the owner approved that on 2026-10-19, and both rule results are in the table, so read the PASS as "under the new rule". (2) Run 4 uses different model ids (sonnet-5-5, haiku-5-5) than runs 1-3, so it is not a like-for-like comparison. (3) Routing raw rows are not in the repo, so those tables cannot be recomputed from committed files; only the scorer and its tests are. (4) The offline replay "before" bytes already contain v1 effects (README, approximation 3). (5) Live A/B is one model, one agent version, small fixtures.

## Replace live proof

Measured 2026-10-20. Agent: Claude Code 2.1.303. Model: claude-sonnet-5-5, effort low, `--max-budget-usd 0.25` per session, keyless, isolation env keys from D-M7-CL-3. Raw stream-json stays outside the repo. No `src/` change.

Question: when the main agent runs a Bash command with a large output, does the replaced (shorter) result reach the model?

Step 1, Claude Code's own persisted-output threshold. No plugin. Task: run `seq 1 N` once. Bytes = size of the full output; "seen" = length of the `tool_result` string in stream-json.

| Full output (bytes) | tool_result seen (chars) | `<persisted-output>` |
|---:|---:|---|
| 8893 to 28893 (N 2000 to 6000) | full size minus 1 | no |
| 29893 (N 6200) | 29892 | no |
| 30893 (N 6400) | 2249 | yes |
| 31893, 32893, 33893, 35893 | 2249 | yes |
| 38893 and above (N 8000 to 20000) | 2249 to 2250 | yes |

The threshold is between 29893 and 30893 bytes, which fits a 30000 character limit. Three runs at N 7200, 7600, 7800 gave a 51 character result: the model mistyped the command and `seq` failed. Those are model noise, not a threshold effect.

Step 2, plugin arm. `--plugin-dir release-out` (built with `node build/build.mjs --out release-out`, plugin loaded as `context-mode@inline`). Outputs of 19998 bytes (N 4221) and 28003 bytes (N 5822), both below the threshold. 3 runs each, 6 sessions, in parallel. The first try had a prompt typo in 4 of 6 sessions (`seq 1 N .`); those are discarded and rerun with a clean prompt.

| Full output (bytes) | Runs | tool_result seen by model (chars) | Persisted preview | Replaced |
|---:|---:|---:|---|---|
| 19998 | 3 | 19997 | no | no |
| 28003 | 3 | 28002 | no | no |

Result: in all 6 sessions the model saw the full output (size minus the trailing newline). The main-agent replace did NOT reach the model at these sizes. stream-json showed hook events for `SessionStart` only; no PreToolUse or PostToolUse hook event appeared in the stream, and the model used Bash, not a context-mode tool. This run does not say if the hook ran and chose not to replace, or if it did not run on the Bash result. That needs a hook log (the v1 `scripts/ctx-debug.sh`, deleted in D-M7-CLN-W2-root; `ctx_doctor` replaces it) in a follow-up.

Consequence: the Quick A/B claim that v2 may be hidden by the persist threshold is not the cause for outputs of 20 to 28 KB. The plugin does not shrink them. Do not claim a live replace saving for the main agent until a session shows a shorter `tool_result` than the full output.

## Replace live proof (after r1 shape fix)

Build: v2-design, `node build/build.mjs --out release-out`. Live runs: `claude -p`, model claude-sonnet-5-5, effort low, `--plugin-dir release-out`, Bash `seq 1 N`, 2 runs per size, 6 sessions in parallel. Raw transcripts stay in the private bench folder.

| Full output (bytes) | Runs | tool_result seen by model (chars) | Persisted preview | Replaced |
|---:|---:|---:|---|---|
| 8893 (N 2000) | 2 | 8892, 8892 | no | no |
| 19998 (N 4221) | 2 | 19997, 19997 | no | no |
| 28003 (N 5822) | 2 | 28002, 28002 | no | no |

Result: in all 6 sessions the model saw the full output (size minus the trailing newline). The tool used was Bash each time. stream-json showed hook events for `SessionStart` only; no PreToolUse or PostToolUse hook event appeared. So the main-agent replace still did not shrink any Bash result after the r1 shape fix. Do not claim a live replace saving for the main agent. Next step: capture a hook log (the v1 `scripts/ctx-debug.sh`, deleted in D-M7-CLN-W2-root; `ctx_doctor` replaces it) to see if the hook runs on the Bash result.

## Saving loop

Score: `bench/saving-score.mjs` (lock `bench/saving-score.lock`). M1 = offline replay saving on the corpus. M2 = median live saving over 4 scored tasks (json-1, multi-1, big-tests, big-json), 2 runs per arm, claude-sonnet-5-5, effort low. Target: 90 for M1 and M2, with guards (success, small outputs, tokens, gate).

Checks made on v2-design:
- Lock: `bench/saving-score.mjs` (f90cccc1...) and `bench/live/score-tasks.mjs` (80bb6a49...) match the lock. Last change to the lock and both scripts is 5bd44c12, before the baseline commit 1a683ac5. No later commit touches them.
- Success: 16 of 16 sessions pass in both arms in every committed score file (baseline, r1, r2, r3, r5). The small-output guard stays at -0.32%. Median small-task session tokens: v2 38185 against off 36169.5, inside the 2% token limit.
- Selection: the replace path ranks whole chunks with BM25 (`src/core/index/select.ts`, `selectChunksInMemory`). Chunks are line-aligned (`chunkText`). The code has no head/tail cut and no regex filter on the returned text. The `slice` calls in `dispatch.ts` apply to the source label only. Not checked: how `chunkText` splits one line longer than 48 bytes.
- Number mismatches to know: (1) r5 was committed first as M2 87.66 (640dccff), then re-run to 88.9 (1d55d561); the table uses the later file. (2) For r6 and r7 the round log gives M2 89.52 and 89.09, but the round notes give 88.8 and 87.98. Neither round is merged, so v2-design has no score file for them. (3) Only the r5 file is on v2-design; r1, r2 and r3 values are from the earlier commits of `bench/saving-score-last.json`, and show M2 69.22, 79.65 and 86.41 (the log for those rounds matches), but r1 to r3 commit-time files read 67.48, 82.49 and 85.56 in the DEVIATIONS-row commits and were re-run after.
- The Summary at the top of this file and this section both hold M1/M2 numbers. The Summary is the newer one (median of 3 runs, 2026-10-21); the table below is the round history up to round 5.

| Round | Change | M1 | M2 | Merged |
|---|---|---:|---:|---|
| Baseline | v2-design before the loop | 12.03 | 2.69 | - |
| 1 | Bash replace uses Claude Code's Bash shape {stdout, stderr, interrupted}; sizes: trigger 4096, return 1024, chunk 256 | 85.72 | 69.22 | yes |
| 2 | REPLACE_RETURN_BYTES 1024 to 512 | 90.88 | 79.65 | yes |
| 3 | REPLACE_RETURN_BYTES 512 to 96, REPLACE_CHUNK_BYTES 256 to 48 | 94.76 | 86.41 | yes |
| 4 | Shorter more-line label | 94.74 | 85.78 | no (gate gp-cases failed) |
| 5 | Chunks ranked by intent plus the session's last user prompt | 94.12 | 88.90 | yes |
| 6 | Label "<tool>#" plus 8 hex of sha256(call id) | 94.10 | 89.52 (notes: 88.8) | no (does not beat best) |
| 7 | Read the full output from persistedOutputPath when stdout is cut | 94.12 | 89.09 (notes: 87.98) | no (does not beat best) |

Round 5 on v2-design (2026-10-20): M1 94.12, M2 88.9, guards pass. Later re-measure: see "Re-measure after the final push" below. The 90 target was reached for M1 and not for M2. Missing: 1.1 points.

Measured ceiling and what blocks it (M2 per task, last merged file): big-tests 99.23, multi-1 90.94, big-json 86.86, json-1 51.7.
- json-1: the off-arm output is under the 4096-byte trigger, so no replace happens. The task is in the score and cannot rise without a lower trigger, which costs the small-output guard.
- big-json: the model checks the answer with Read or ctx_execute after the replace. Round 7 showed that Claude Code gives the hook only the first 30000 chars of stdout; reading the full file fixed the missing line but the model still re-checked, and the task fell to 23.62 in that round.
- Noise: 2 runs per arm. Round 6 moved big-json from 84.19 to 76.41 and multi-1 from 91.12 to 94.2 with no relevant change. A 1 point M2 gap is inside this noise, so "90 reached" cannot be claimed or ruled out for any round.

### Re-measure after the final push (2026-10-21, `980272a5`)

Three full runs of `bench/saving-score.mjs` on v2-design `980272a5`. Lock check OK: the sha256 of `bench/saving-score.mjs` and `bench/live/score-tasks.mjs` match `bench/saving-score.lock`. Build OK. Neither score file was changed.

| Run | M1 | M2 | Median v2 small-task session tokens | guardsOk |
|---|---:|---:|---:|---|
| 1 | 94.21 | 89.32 | 38,178 | false |
| 2 | 94.21 | 85.83 | 38,178 | false |
| 3 | 94.21 | 87.23 | 38,179 | false |
| Median | 94.21 | 87.23 | 38,178 | - |

The off arm needed about 36,167 to 36,196 tokens. Guards: success, small1k and tokens passed in all 3 runs. The gate guard failed in all 3 runs (layer `check-removed` FAIL), so `guardsOk` is false. M1 meets the 90 target; M2 does not.

M2 per scored task, savingPct (json-1, multi-1, big-tests, big-json): run 1 83.48, 92.05, 99.23, 86.6; run 2 81.07, 90.6, 99.23, 74.51; run 3 71.78, 92.03, 99.23, 82.44. Tasks outside the score (log-1, tests-1, file-1, git-1): run 1 48.39, 0, 0, 60.98; run 2 96.77, 0, 0, 0; run 3 48.39, 99.82, 0, 0.

big-json is the noisiest task (74.51 to 86.6) and drives the M2 spread. The runs changed the tracked file `bench/saving-score-last.json` only in the run clone; it was not committed, so the file on v2-design still holds the older run (M2 84.02, 2026-10-20).

Two other builds were scored the same way (3 runs each, not merged into v2-design):

| Build | M1 | M2 | Median v2 small-task tokens | guardsOk |
|---|---:|---:|---:|---|
| Lever `defer` | 94.24 | 84.68 (runs 62.43, 87.77, 84.68) | 38,003 | false (gate: check-removed, then v2-unit FAIL in run 3) |
| Lever `m2`, `origin/impl/final-m2` at `1a8e9b74` | 94.26 | 82.91 (runs 79.82, 82.91, 86.41) | 38,179 | false (gate: check-removed) |

Neither lever beats the v2-design median M2 of 87.23. Lever `defer` run 1 had json-1 at -61.43 %. Lever `m2` is below 90 and varies with json-1 and big-json. Both needed `npm install --no-package-lock` because the repo has no lockfile.

## Memory

Run 2026-10-21 on v2-design (clean clone, `npm run build`, Node v26.8.1). Harness: `node e2e/live/run.mjs --only <id> --model claude-sonnet-5-5`, one case per run, effort low, keyless `claude -p`, `--max-budget-usd 0.25`. Env: `ENABLE_CLAUDEAI_MCP_SERVERS=false CLAUDE_CODE_DISABLE_AUTO_MEMORY=1 CLAUDE_CODE_DISABLE_CLAUDE_MDS=1`. No assertion was changed and no case was skipped. No code in `src` was changed.

| Case | Kind | Result | List-price $ | What it measured |
|---|---|---|---|---|
| memory-r6-eval-local | local | PASS | 0 | Last-request seq in the journal equals ground truth in both fixtures (gp6-open-error, gp6-resume-pointer). No model call. |
| memory-retrieval-local | local | PASS | 0 | `e2e/live/memory-retrieval/ci-smoke.mjs`: R2 recall@5 = 1.000 (6 of 6 queries), R2 MRR = 0.653. No model call. |
| memory-r6-resume-quality | agent | PASS | 0.0075 | Model reply `TESTS` (next action after the compacted state is to run the tests). |
| decision-q3-applied | model | PASS | 0.0435 | Model read ADR-0016 and replied `PASS` (case B denies with the rewritten command, never allow + updatedInput). |

Total live spend: 0.0510 USD list price for 2 model sessions, well under the 0.25 cap each.

### Numbers

Fixture run (synthetic journals, `ci-smoke.mjs`, N = 6 queries, 2 per type):

| Metric | R2 |
|---|---|
| recall@5, all types | 1.000 |
| recall@5, decision / errorfix / file | 1.000 / 1.000 / 1.000 |
| MRR | 0.653 |
| Timeline order-correct | 2/2 |
| Timeline paging-complete | 2/2 |
| Decision tag D3 (structural) precision / recall / false positives | 1.000 / 1.000 / 0 |

The fixture set is small. recall@5 = 1.000 on 6 queries is a smoke gate, not an estimate of real recall.

Stored results from the earlier real-data runs (not re-run here; private journals are not in this clone). Source: `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/memory-retrieval/eval/results.md`, `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/memory-r6/eval/results.md`.

| Metric | Value | Set |
|---|---|---|
| R2 recall@5 / MRR | 0.743 / 0.671 | 148 real queries, 7 projects |
| R2 decision recall@5 | 0.744 | 39 decision queries |
| R2 errorfix recall@5 | 0.890 | 91 queries |
| R2 file recall@5 | 0.000 | 18 queries (R7 raises it to 0.111) |
| Timeline order-correct and paging-complete | 43/47 | first query set, all variants, with the after cursor |
| Compaction v2 block (2,048 B budget): open-error / last-request / changed-files hit | 11/12, 12/12, 12/12 | 12 real cases, no model |

### Open items

- The 11/12 open-error hit of the compaction block (v2) and the 43/47 timeline figure are known misses from the earlier runs. This run did not reproduce them, because the real journals stay private. They are reported, not decided on.
- File-type retrieval is near 0 by text search: the later prompt shares few tokens with the earlier edit rows.
- The local cases are deterministic gates over fixtures. The two model cases (resume-quality, decision-q3) are one-shot checks at effort low, so one PASS is not a pass rate.

## Final A/B: off, v1, v2

Date 2026-10-21. Agent: real `claude` binary, keyless `-p`. Model claude-sonnet-5-5, effort low, `--max-budget-usd 0.25` per session. 3 runs x 6 tasks x 3 arms = 54 sessions, all in parallel (wall 123 s). Arm off = `--strict-mcp-config`. Arm v1 = branch main (1.0.169) as a plugin from a local dir, `npm install --omit=dev`. Arm v2 = `release-out` of v2-design. Tasks: log-1 json-1 tests-1 file-1 git-1 multi-1 (from `bench/live/score-tasks.mjs`). Harness: `node bench/live/ab-quick.mjs --v1 <dir> --runs 3 --out ab-final`. Aggregate: `bench/live/results/ab-final.json`. Raw rows stay private.

Session tokens = input + cache creation + cache read. Per task: median over 3 runs. Saving % = 1 - arm / baseline per task, then median, min, max over the 6 tasks.

| Arm | Pass | Median session tokens | Saving vs off (median / min / max) | v2 vs v1 (median / min / max) | Median tool_result bytes | ctx calls | Cost (USD) |
|---|---|---|---|---|---|---|---|
| off | 18/18 | 36,217 | - | - | 46.5 | 0 | 0.534 |
| v1 | 18/18 | 42,557 | -17.5 / -61.3 / -15.1 | - | 46.5 | 2 | 0.747 |
| v2 | 18/18 | 38,252 | -5.5 / -5.7 / +30.4 | +10.2 / +10.0 / +56.9 | 31 | 3 | 0.687 |

Total cost 1.97 USD (limit 8).

Per task, median session tokens (off / v1 / v2):

| Task | off | v1 | v2 |
|---|---|---|---|
| log-1 | 36,184 | 42,476 | 38,116 |
| json-1 | 55,048 | 88,808 | 38,294 |
| tests-1 | 36,121 | 42,491 | 38,162 |
| file-1 | 36,161 | 42,451 | 38,203 |
| git-1 | 36,246 | 42,623 | 38,307 |
| multi-1 | 108,284 | 124,653 | 97,552 |

Reading:
- Success is equal in all arms (18/18).
- The plugin adds a fixed prompt cost: about +6.3k tokens for v1 and about +2.0k for v2 on tasks where the model made no ctx call (log-1, tests-1, file-1, git-1). Median saving is therefore negative for both.
- v2 saves tokens where the output is large: json-1 +30.4% vs off (v1 -61.3%, worse), multi-1 +9.9% vs off, and tool_result bytes drop 6,819 to 583 on multi-1.
- v2 uses fewer tokens than v1 on every task (min +10.0%).
- The model called ctx tools rarely (v1 2, v2 3 of 18 sessions). Task results are small on 4 of 6 tasks: Claude Code already shortens large Bash output, so the tool_result byte medians are small (a few bytes on several tasks).
- Caveat: n=3 per cell, one date, list-price cost estimate. No number is a target. No owner decision (hook budget, T-F1, compaction) is made here.

## Compaction pointer (T-CMP)

Measured 2026-10-21. Agent: Claude Code. Model: Sonnet 5.5 (claude-sonnet-5-5), effort low, clean isolation (keyless `claude -p`, `ENABLE_CLAUDEAI_MCP_SERVERS=false CLAUDE_CODE_DISABLE_AUTO_MEMORY=1 CLAUDE_CODE_DISABLE_CLAUDE_MDS=1`, `--max-budget-usd 0.25` per session). Case: `e2e/live/cases/compact-arms.json`. The earlier T-CMP runs (50 and 60 sessions) are in D-M7-CL-1 and D-M7-CL-2 in `docs/architecture/modules/DEVIATIONS.md`.

10 sessions per arm, all arms (a to e), 50 sessions.

| Arm | Correct | `ctx_resume` / `ctx_search` call rate | Bytes returned by those tools | Cost USD |
|---|---|---|---|---|
| a | 7/10 | 0/10 | 0 | 0.8682 |
| b | 7/10 | 0/10 | 0 | 0.9114 |
| c | 7/10 | 0/10 | 0 | 0.9014 |
| d | 7/10 | 0/10 | 0 | 0.8898 |
| e | 7/10 | 0/10 | 0 | 0.9514 |

Total cost 4.5222 USD. `resume_seq` 50/50. 0 of 50 sessions touched host memory. All 15 misses are fixture session-03 (case-sensitive exactMatch).

Reading:
- The result is the same in every arm: the model never called `ctx_resume` or `ctx_search` from the pointer line, so no arm returned a byte. The arms do not differ on this case.
- Arm a stays below its gates (correct 7/10 < 0.80, call rate 0/10 < 0.70). GS11 stays FAIL. This section does not decide the compaction policy; that is an open owner decision (`https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/.impl/BLOCKED-M7.md` item 3).
- n = 10 per arm, one model, one date, one fixture set. The 15 misses come from one fixture, so they say little about other sessions.

## Replace live root cause

Measured 2026-10-21. Claude Code 2.1.303, claude-sonnet-5-5, effort low, `--max-budget-usd 0.25`, keyless, env ENABLE_CLAUDEAI_MCP_SERVERS=false CLAUDE_CODE_DISABLE_AUTO_MEMORY=1 CLAUDE_CODE_DISABLE_CLAUDE_MDS=1. Build: v2-design 96caa8a7, `node build/build.mjs --out release-out`, `--plugin-dir release-out`. Task: `seq 1 N` with Bash, then the last line.

Step 1, registration. `release-out/.claude-plugin/plugin.json` points to `hooks/claude-code.json`. PostToolUse is registered: matcher `^(Bash|Read|Grep|WebFetch|Write|Edit|NotebookEdit|mcp__plugin_context-mode_context-mode__ctx_.*)$`, command `node "${CLAUDE_PLUGIN_ROOT}/hook.mjs" --agent claude-code`, timeout 5 s. The `--debug-file` log shows `Loading hooks from plugin: context-mode`.

Step 2, hook log. A wrapper around the hook command wrote stdin, stdout, exit code and wall time for every event (temporary, not committed). In every session PostToolUse:Bash ran, exit 0, 75 to 96 ms, with `tool_response` keys `stdout, stderr, interrupted, isImage, noOutputExpected`. The hook returned `updatedToolOutput: {stdout, stderr: "", interrupted: false}`. The debug log then says `Hook PostToolUse (...) replaced tool output`.

Step 3, seen by the model (`tool_result` length in stream-json):

| Full output (bytes) | Sessions | tool_result seen (chars) | Replaced |
|---:|---:|---|---|
| 8893 (N 2000) | 4 | 152, 152, 152, 152 | yes |
| 19998 (N 4221) | 9 | 187 in all 9 | yes |
| 28003 (N 5822) | 4 | 182, 182, 182, 182 | yes |
| 13893 (N 3000) | 1 | 157 | yes |

The 19998 rows include runs with the bench flags (`--setting-sources project`, `--no-session-persistence`, `--allowedTools ...`, minimal env), each alone and all together: all 187. One more N 4221 session is not in the table: the model ran `seq 1 4221 | tail -n 1` (4 bytes, under the trigger).

Root cause of the two earlier "not replaced" tables:
- The plugin under test returned `updatedToolOutput` as a plain string. A build of 3f4a4d0b (before D-M7-SV-1) reproduces the old result exactly: seen 19997 for N 4221, and the debug log says `PostToolUse hook returned updatedToolOutput that does not match Bash's output shape: reason=schema_invalid issues=invalid_type`. Claude Code then keeps the original output. The code on v2-design since 52b01705 sends the Bash shape and works live, so the "after r1 shape fix" table most likely ran a release-out built before that commit.
- "stream-json showed SessionStart only" is not evidence that PostToolUse did not run. Without `--include-hook-events`, stream-json lists SessionStart hook events only; a session run that way here replaced (seen 187) and still showed SessionStart only.

Regression guard: `tests/hooks/replace-live-golden.test.mjs` runs the real captured payload (`e2e/fixtures/claude-code/2.1.303/PostToolUse-Bash-large.json`) through `src/entries/hook.ts` and checks the Bash shape and a result under 1/10 of the full output. It fails on 3f4a4d0b and passes on this branch.

## Replace live proof (impl/replace-live)

Independent re-run, 2026-10-21. Claude Code 2.1.303, claude-sonnet-5-5, effort low, `--max-budget-usd 0.25`, keyless, same env as above, `--include-hook-events`, `--allowedTools Bash`, `--plugin-dir release-out` built from this branch (a972e852). Task: Bash `seq 1 N`, then the last number. Two runs per size. Cwd is a git repo.

| Full output (bytes) | Runs | tool_result seen (chars) | Answer correct |
|---:|---:|---|---|
| 8893 (N 2000) | 2 | 152, 152 | 2 of 2 |
| 19998 (N 4221) | 2 | 187, 187 | 2 of 2 |
| 28003 (N 5822) | 2 | 182, 182 | 2 of 2 |

The root cause in the section above is confirmed.

Caveat found: the hook returns nothing when the session cwd is not inside a git repo (hook run by hand with a non-git cwd gives empty stdout; with a git cwd and `CLAUDE_PROJECT_DIR` set it gives the replace). In a non-git cwd the model saw the full output: 8892, 19997, 28002 chars, answers still correct. Not changed here (src/ is out of scope); it needs its own fix and DEVIATIONS row.

Gate fix: `e2e/golden/GP3/fixture-replay-claude-code-PostToolUse-Bash-large.json` was missing, so gp-cases failed on the new fixture and the saving-score gate guard was false (M2 73.71). With the golden added, gp-cases passes (GP3 21 of 21), and `tests/` passes 1079 of 1079.

`node bench/saving-score.mjs` (lock ok, score files match `bench/saving-score.lock`): M1 94.21, M2 86.18, guards success true, small1k true (-0.32), tokens true, gate true. M2 is below the 90 target; it is inside the 2-run noise range noted above.

## Replace live proof, non-git cwd

Independent check of D-M7-NG-1, 2026-10-21. Claude Code 2.1.303, claude-sonnet-5-5, effort low, `--max-budget-usd 0.25`, keyless, same env as above, `--include-hook-events`, `--allowedTools Bash`, `--plugin-dir release-out` built from this branch after the rebase on v2-design 6f467b75. Task: run `seq 1 N` with no pipe, then give the last number. Two runs per cell. (a) cwd is a temp dir outside any git repo. (b) cwd is a temp git repo.

| Cwd | Full output (bytes) | Runs | tool_result seen (chars) | Answer correct |
|---|---:|---:|---|---|
| (a) non-git | 8893 (N 2000) | 2 | 152, 152 | 2 of 2 |
| (a) non-git | 19998 (N 4221) | 2 | 187, 187 | 2 of 2 |
| (b) git | 8893 (N 2000) | 2 | 152, 152 | 2 of 2 |
| (b) git | 19998 (N 4221) | 2 | 187, 187 | 2 of 2 |

A first pass with a looser prompt let the model run `seq 1 N | tail -n 1` (4 bytes) in 6 of 8 runs. Those runs do not test the hook and are not counted. Before D-M7-NG-1 the non-git cell gave the full output (8892, 19997, 28002 chars, see above); now it gives the same replace as a git cwd.

Rebase finding: after rebasing on v2-design 6f467b75, `tests/ops/project-dir-ported.test.mjs` still asserted NO_GIT_DIR for a non-git cwd, and the saving-score gate guard failed (M2 78.22, gate false). The test now asserts the D-M7-NG-1 rule (DEVIATIONS row added). `node --test tests/`: 1196 tests, 1194 pass, 0 fail, 2 skip.

`node bench/saving-score.mjs` (lock ok): M1 94.21, M2 84.02, guards success true, small1k true (-0.32), tokens true, gate true. M2 is below the 90 target; it moves 78 to 86 between runs of the same code, which is the 2-run noise noted above.

## Replace live proof (final)

Final check on v2-design 980272a5, 2026-10-21. Claude Code 2.1.303, claude-sonnet-5-5, effort low, `--max-budget-usd 0.25`, keyless, env ENABLE_CLAUDEAI_MCP_SERVERS=false CLAUDE_CODE_DISABLE_AUTO_MEMORY=1 CLAUDE_CODE_DISABLE_CLAUDE_MDS=1, `--include-hook-events`, `--allowedTools Bash`, `--plugin-dir release-out` built from this commit. Task: run `seq 1 N` with no pipe or redirect, then give the last number. Two runs per cell, git and non-git cwd. The 60 KB cell is above Claude Code's 30 KB persist threshold.

| Full output (bytes) | Cwd | Runs | tool_result seen (chars) | Answer correct |
|---:|---|---:|---|---|
| 8893 (N 2000) | git | 2 | 152, 152 | 2 of 2 |
| 8893 (N 2000) | non-git | 2 | 152, 152 | 2 of 2 |
| 19998 (N 4221) | git | 2 | 187, 187 | 2 of 2 |
| 19998 (N 4221) | non-git | 2 | 187, 187 | 2 of 2 |
| 28003 (N 5822) | git | 2 | 182, 182 | 2 of 2 |
| 28003 (N 5822) | non-git | 2 | 182, 182 | 2 of 2 |
| 60090 (N 11866) | git | 2 | 190, 190 | 2 of 2 |
| 60090 (N 11866) | non-git | 2 | 190, 190 | 2 of 2 |

All 16 runs: no error, hook events present, the model saw the replace (under 200 chars) instead of the full output, and gave the right last number. Git and non-git cwd give the same result. The 60 KB output is also replaced. No src/ change.

## Final A/B (after final push)

Arms: off, v1 (branch main built as a local plugin, 1.0.169), v2 (build release-out). Model claude-sonnet-5-5, effort low, keyless `claude -p`, 3 runs per task and arm, all sessions in parallel. Tool: `bench/live/ab-quick.mjs` (new `--tasks` option picks the task list). Total cost $2.68 (limit $8). Data: `bench/live/results/ab-final2.json` (also `ab-final2-small.json`, `ab-final2-large.json`).

Groups: SMALL = log-1 json-1 tests-1 file-1 git-1 (45 sessions). LARGE = multi-1 big-tests big-json (own run) plus json-1 (rows from the SMALL run). `score-tasks.mjs` has four tasks: json-1, multi-1, big-tests, big-json. Saving = median over tasks of 1 - arm tokens / reference tokens. Negative = the arm used more tokens.

| Group | Arm | Median session tokens | Saving vs off | v2 vs v1 | Median tool_result bytes | Success | Cost |
|---|---|---|---|---|---|---|---|
| SMALL | off | 36184 | - | - | 31 | 15/15 | $0.330 |
| SMALL | v1 | 42493 | -17.4% | - | 31 | 15/15 | $0.537 |
| SMALL | v2 | 38210 | -5.7% | +10.2% | 8 | 15/15 | $0.359 |
| LARGE | off | 55897 | - | - | 4694.5 | 12/12 | $0.607 |
| LARGE | v1 | 65599 | -16.5% | - | 2436.5 | 12/12 | $0.754 |
| LARGE | v2 | 60390 | -19.6% | -2.7% | 734.5 | 12/12 | $0.391 |

Per task, median tokens (off / v1 / v2): log-1 36184/42424/38114; json-1 55024/64541/60386; tests-1 36121/42493/38166; file-1 36159/42453/38210; git-1 36248/42629/38296; multi-1 108290/125342/140110; big-tests 53104/59478/38359; big-json 56707/66559/98955.

Result, plainly:
- All 81 sessions passed in every arm. Success is equal.
- v2 does not save session tokens vs off in this run. It is 5.7% worse on SMALL and 19.6% worse on LARGE. The fixed plugin overhead (tool schemas and hooks) is about 2000 tokens for v2 and about 6300 for v1 on tasks with tiny output.
- v2 beats v1 on SMALL (+10.2%), and loses to v1 on LARGE (-2.7%). On LARGE, v2 wins big-tests (-28% vs off) but loses multi-1 (+29%) and big-json (+74%).
- v2 cuts the tool_result bytes the model saw (LARGE: 734.5 vs 4694.5 off), but the extra turns spent on the 5 context-mode calls cost more tokens than the bytes saved on multi-1 and big-json.
- v1 made 0 context-mode calls in all sessions, so its overhead is schema cost only. The session token count (input + cache creation + cache read) counts cached prefix reads on each turn; extra turns raise it.
- Not tuned after the run. Follow-up: look at multi-1 and big-json v2 transcripts for the cause of the extra turns.

## Final A/B 3 (after the replace and threshold work)

Date 2026-10-21. Agent 2.1.303 (Claude Code), model claude-sonnet-5-5, effort low, keyless `claude -p`, `--max-budget-usd 0.25`. Arms: off, v1 (branch main, 1.0.169, local plugin dir), v2 (build of v2-design). 3 runs per task and arm, all sessions in parallel. Total cost $2.9539 (limit 6). Data: `bench/live/results/ab-final3.json`.

SMALL = log-1 json-1 tests-1 file-1 git-1 (45 sessions). LARGE = multi-1 json-1 big-tests big-json (36 sessions; multi-1 plus the `bench/live/score-tasks.mjs` tasks). Saving = median over tasks of 1 - arm tokens / reference tokens. Negative = the arm used more tokens.

| Group | Arm | Median session tokens | Saving vs off | v2 vs v1 | Median tool_result bytes | Success | Cost |
|---|---|---|---|---|---|---|---|
| SMALL | off | 36183 | - | - | 31 | 15/15 | $0.313 |
| SMALL | v1 | 42496 | -17.4% | - | 31 | 15/15 | $0.554 |
| SMALL | v2 | 38203 | -5.6% | +10.2% | 8 | 15/15 | $0.346 |
| LARGE | off | 56624 | - | - | 4608 | 12/12 | $0.612 |
| LARGE | v1 | 65613 | -16.3% | - | 4717.5 | 12/12 | $0.783 |
| LARGE | v2 | 57947.5 | +3.8% | +17.6% | 564.5 | 12/12 | $0.345 |

Commands:
```
node bench/live/ab-quick.mjs --v1 <v1 dir> --runs 3 --tasks log-1,json-1,tests-1,file-1,git-1 --out ab-final3-small
node bench/live/ab-quick.mjs --v1 <v1 dir> --runs 3 --tasks multi-1,json-1,big-tests,big-json --out ab-final3-large
```

Reading: all 81 sessions pass in every arm. On LARGE, v2 shows the model 564.5 median bytes against 4,608 (off) and 4,717.5 (v1), and costs the least. v2 tokens are 3.8 % below off and 17.6 % below v1 (median over tasks). On SMALL, v2 uses 5.6 % more tokens than off (plugin overhead) and 10.2 % fewer than v1. json-1 is the weak task: v2 tokens stay above off (58,197 / 58,110 vs 55,036 / 55,113) because the model makes a check call. Raw rows stay private.

## Compaction push recall

Measured 2026-10-21 on branch `impl/compact-push` (DECISIONS-r11). Agent: Claude Code 2.1.303, keyless `claude -p`, effort low, `--max-budget-usd 0.25`, clean isolation (`ENABLE_CLAUDEAI_MCP_SERVERS=false CLAUDE_CODE_DISABLE_AUTO_MEMORY=1 CLAUDE_CODE_DISABLE_CLAUDE_MDS=1`). Runner: `e2e/live/compact/run.mjs` with the case-insensitive scorer. `src/` not changed.

| Run | Model | Sessions | Correct | `ctx_resume`/`ctx_search` calls | Cost USD |
|---|---|---|---|---|---|
| Shipped policy (arm a) | claude-sonnet-5-5 | 10 | 10/10 | 0 | 0.9797 |
| Shipped policy (arm a) | claude-opus-5-5 | 5 | 4/5 | 0 | 1.0264 |
| Old full block (arm b) baseline | claude-sonnet-5-5 | 10 | 10/10 | 0 | 0.9595 |

- Sonnet: no miss. Opus: one miss, session 2 (`session-02`). `resume_seq` true in all 25 sessions.
- Injected bytes: the runner does not record hook `additionalContext`. The median is not measured. The upper bound is `STATE_BUDGET` 2048 B (state block) plus `RECALL_BUDGET_BYTES` 2048 B per prompt after compaction. Tool-result bytes returned by the read tools: 0 in every session.
- n is 10 and 5, one date, three fixtures. Shipped and baseline arms tie on Sonnet, so this run does not separate them.

### No-compaction check (bench/live/ab-quick.mjs, v2 arm, 2 runs, 5 tasks)

| Arm | Pass | Median tokens | Cost USD |
|---|---|---|---|
| off | 10/10 | 36182 | 0.2368 |
| v2 | 10/10 | 38202 | 0.6993 |

v2 pass equals off. The token delta (+5.7% median) is present without compaction; the recall path adds zero hook bytes before a compaction (unit-tested), so the delta comes from the tool definitions, not from this change. Not isolated by a separate arm. Raw output: `bench/live/results/ab-quick-cmp-push.json`.
