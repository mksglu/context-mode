# Benchmarks

What Context Mode v2 does: when a tool result is large, the model gets the best-matching whole chunks and a short pointer instead of the full text. These pages show the measured result. Every number comes from a file in [data/](data/). Longer method notes: [docs/v2/benchmarks.md](../v2/benchmarks.md).

Setup for all live runs unless a section says otherwise: Claude Code 2.1.303, model `claude-sonnet-5-5`, effort `low`, keyless `claude -p`, `--max-budget-usd 0.25` per session, env `ENABLE_CLAUDEAI_MCP_SERVERS=false CLAUDE_CODE_DISABLE_AUTO_MEMORY=1 CLAUDE_CODE_DISABLE_CLAUDE_MDS=1`. Build step: `npm install --no-package-lock` then `node build/build.mjs --out release-out`.

## v2 against v1: one page

All v1 and v2 results side by side, with the losses and the gateway as the upgrade path: [v2-vs-v1/README.md](v2-vs-v1/README.md).

## Cost per task: direct vs v1 vs v2 vs the gateway (Opus 5.5)

Six short tasks from the published gateway benchmark, 8 pairs per task, 2026-10-21, Claude Code 2.1.303, `claude-opus-5-5`, plan pushed first. Summed over 48 pairs, v1 cost 34.6% more than direct and v2 cost 2.2% more. The published gateway rows (2026-09-29, Claude Code 2.1.283) cost 24.5% less over 88 pairs. Full tables, intervals, losses and the bridge drift check: [v1-v2-gateway/README.md](v1-v2-gateway/README.md). Evidence: [v1-v2-gateway/ab.json](v1-v2-gateway/ab.json).

## README try-it prompts: direct vs v1 vs v2 vs the gateway (Opus 5.5)

The six "Try It" prompts from the OSS README, 4 pairs per prompt (session-continuity: 2, demonstration only), 2026-10-22, Claude Code 2.1.303, `claude-opus-5-5`, plan pushed first. Summed over 20 pairs, v1 cost 33.1% more than direct, v2 cost 15.5% more and the gateway cost 43.8% less. Direct passed the task check in 20 of 20 sessions, v1 17 of 20, v2 18 of 20 and the gateway 15 of 20. Of 14 README numbers checked, 2 hold. Full tables, ranges, losses and the claim check: [try-it/README.md](try-it/README.md). Evidence: [try-it/ab.json](try-it/ab.json).

## Headline: bytes the model sees, and cost

Large-output tasks (multi-1, big-tests, big-json, json-1), 3 runs per task and arm, 2026-10-21. Source: [data/ab-final2.json](data/ab-final2.json).

| Arm | Median tool_result bytes | Cost USD (12 sessions) | Pass |
|---|---:|---:|---:|
| off (no plugin) | 4,695 | 0.607 | 12/12 |
| v1 | 2,437 | 0.754 | 12/12 |
| v2 | 735 | 0.391 | 12/12 |

(The file holds 4,694.5, 2,436.5 and 734.5.) v2 shows the model 84 % fewer bytes than off. v2 cost is the lowest of the three on these tasks. Session tokens are a different story, see the caveats.

## 1. Replace live proof

Question: does the model see the short result instead of the full output? Date 2026-10-21, commit `980272a5`. Task: Bash `seq 1 N`, then give the last number. 2 runs per cell, 16 runs, git and non-git cwd. Source: [data/replace-live-proof.json](data/replace-live-proof.json).

| Full output (bytes) | Model saw (chars), git and non-git | Correct |
|---:|---:|---:|
| 8,893 | 152 | 4/4 |
| 19,998 | 187 | 4/4 |
| 28,003 | 182 | 4/4 |
| 60,090 | 190 | 4/4 |

16 of 16 correct, no error. Cost: not recorded per run (each run capped at 0.25 USD). Reproduce: build `release-out`, then run `claude -p --model claude-sonnet-5-5 --effort low --max-budget-usd 0.25 --plugin-dir release-out --include-hook-events --allowedTools Bash` with a prompt that asks to run `seq 1 N` with no pipe and report the last number. There is no committed script for this proof.

Caveat: 2 runs per cell. Earlier builds showed no replace; the cause (wrong output shape) is in docs/v2/benchmarks.md "Replace live root cause".

## 2. Final A/B: off, v1, v2

Date 2026-10-21. 81 sessions, 3 runs per task and arm, all pass. Source: [data/ab-final2.json](data/ab-final2.json) (total cost 2.6797 USD).
Tasks: small = log-1, json-1, tests-1, file-1, git-1. Large = multi-1, big-tests, big-json (own run) plus json-1 (rows from the small run).
Reproduce (v1 = branch `main` built as a local plugin):

```
node bench/live/ab-quick.mjs --v1 <v1 dir> --runs 3 --tasks log-1,json-1,tests-1,file-1,git-1 --out ab-final2-small
node bench/live/ab-quick.mjs --v1 <v1 dir> --runs 3 --tasks multi-1,big-tests,big-json --out ab-final2-large
```

| Group | Arm | Median session tokens | Saving vs off | Median tool_result bytes | Cost USD |
|---|---|---:|---:|---:|---:|
| Small | off | 36,184 | - | 31 | 0.330 |
| Small | v1 | 42,493 | -17.4 % | 31 | 0.537 |
| Small | v2 | 38,210 | -5.7 % | 8 | 0.359 |
| Large | off | 55,897 | - | 4,694.5 | 0.607 |
| Large | v1 | 65,599 | -16.5 % | 2,436.5 | 0.754 |
| Large | v2 | 60,390 | -19.6 % | 734.5 | 0.391 |

Negative saving = the arm used more tokens than off. Per task tokens (off / v1 / v2): big-tests 53,104 / 59,478 / 38,359; multi-1 108,290 / 125,342 / 140,110; big-json 56,707 / 66,559 / 98,955.

## 3. Saving loop (score M1 and M2)

Score: `bench/saving-score.mjs` (locked by `bench/saving-score.lock`). M1 = offline byte saving. M2 = live saving in tool_result bytes the model saw, median over json-1, multi-1, big-tests, big-json. Target 90. Source: [data/saving-loop.json](data/saving-loop.json); the 2026-10-20 score file is [data/saving-score-last-2026-10-20.json](data/saving-score-last-2026-10-20.json) (M2 84.02, 2 runs per arm).
Reproduce: `node bench/saving-score.mjs`. Cost: not recorded.

| Round | Change | M1 | M2 | Merged |
|---|---|---:|---:|---|
| Baseline | before the loop | 12.03 | 2.69 | - |
| 1 | Bash shape fix, return 1024 B | 85.72 | 69.22 | yes |
| 2 | return 512 B | 90.88 | 79.65 | yes |
| 3 | return 96 B, chunk 48 B | 94.76 | 86.41 | yes |
| 4 | shorter more-line | 94.74 | 85.78 | no |
| 5 | rank by intent plus last prompt | 94.12 | 88.90 | yes |
| 6 | label with call id hash | 94.10 | 89.52 | no |
| 7 | read persisted output | 94.12 | 89.09 | no |

Re-measure on `980272a5`, 2026-10-21, 3 runs: M1 94.21 in all; M2 89.32, 85.83, 87.23 (median 87.23). Target 90: M1 met, M2 not met. `guardsOk` was false in all 3 runs because the gate layer `check-removed` failed.

M2 eval round 2 (`bench/m2/eval.mjs`, v2-design 18e4a6cd, 2026-10-24, claude-sonnet-5-5 low, n=3): main 92.5 (was 87.6), heldout 97.44 (was 96.52); claude-opus-5-5 main 92.53. See `docs/v2/spikes/m2/RESULT.md`.

Re-measure on `c3275a1e` (v2-design), 2026-10-21, 3 runs, lock OK (score files match `bench/saving-score.lock`), `guardsOk` true in all 3: M1 94.26 in all; M2 87.53, 88.02, 88.25 (median 88.02); smallTok 38157.5, 38201.5, 38187.5. Per task (run 1 / 2 / 3): json-1 83.94 / 82.84 / 76.15; multi-1 91.12 / 91.77 / 92.03; big-tests 99.23 in all; big-json 77.93 / 84.27 / 84.48. Target 90: M1 met, M2 not met (88.02). Earlier levers on the same score: `text` M2 85.25 (3 runs, 78.28 to 86), `trigger` M2 85.96; neither merged.

## 4. Offline replay, before and after

Date 2026-10-20 (aggregate date), Node v26.8.1. Real Claude Code transcripts: 821 sessions, 23,203 paired tool calls. A byte count, not a model run. Source: [data/offline-replay.json](data/offline-replay.json). Reproduce: `node bench/replay.mjs`.

Corpus: 30,837,401 bytes before, 28,726,463 after, 6.8 % saving (5.2 % with the re-run bound). The old policy with hints gave 1.1 %.

| Result size | Calls | Bytes before | Saving after |
|---|---:|---:|---:|
| <=1 KB | 16,508 | 5,424,702 | -0.1 % |
| 1-4 KB | 5,101 | 10,482,240 | 0.2 % |
| 4-16 KB | 1,410 | 10,465,885 | 0.2 % |
| 16-64 KB | 184 | 4,464,574 | 46.5 % |

The saving sits in results over 16 KB. Small results are unchanged. The "before" bytes already hold v1 effects in some sessions.

## 5. Memory live results

Date 2026-10-21. Source: [data/memory-live.json](data/memory-live.json). Reproduce: `node e2e/live/run.mjs --only <case id> --model claude-sonnet-5-5`. Cost 0.0510 USD, 2 model sessions, 1 run per case.

| Case | Result |
|---|---|
| memory-r6-eval-local | PASS |
| memory-retrieval-local (recall@5 1.000 on 6 queries, MRR 0.653) | PASS |
| memory-r6-resume-quality | PASS |
| decision-q3-applied | PASS |

The recall figure is a smoke gate on 6 synthetic queries. It is not an estimate of real recall.

## 6. T-CMP (compaction pointer), clean run

Date 2026-10-21. 10 sessions per arm, arms a to e, 50 sessions, cost 4.5222 USD. Source: [data/t-cmp.json](data/t-cmp.json). Reproduce: `node e2e/live/compact/run.mjs --runs 10 --model claude-sonnet-5-5 --effort low`.

Result (re-scored with a case-insensitive answer key, commit 6abd2114): correct 10/10 in every arm. The first scoring was case-sensitive and gave 7/10; the 15 misses were one fixture (session-03) and were a scoring error. The model made 0 `ctx_resume` or `ctx_search` calls from the pointer, so the call-rate gate (0 < 0.70) still fails for arm a and the gate is open. The model answered right without the pointer on this fixture set, so this run cannot show that the pointer helps.

Update 2026-10-21 (`c3275a1e`): compaction push recall is merged (state block with decisions, turn-boundary recall). Live T-CMP: sonnet-5-5 10/10 correct, opus-5-5 4/5 (miss: session-02; n is 5). The call-rate gate is retired per `docs/v2/review/DECISIONS-r11.md` section C, so the 0 < 0.70 call-rate result above is no longer a gate.

## Honest caveats

- Small n: 3 runs per cell in the A/B, 2 per cell in the replace proof and the score, 10 per arm in T-CMP (one fixture set), 1 per memory case. One model, one agent version.
- M2 noise: the same code scored 78 to 89 in different runs. A gap of 1 to 2 points is not a result. big-json moves most (74.51 to 86.6).
- Fixed cost: on tasks with tiny output the plugin adds about 2,000 tokens for v2 and about 6,300 for v1 (tool schemas and hooks). So v2 is 5.7 % above off on small tasks.
- v2 does not cut session tokens on large tasks in this run (+19.6 % vs off). multi-1 and big-json used extra turns for `ctx_*` calls. Not tuned yet.
- Costs are list-price estimates from the CLI, not a bill.
- Raw per-session rows stay private; only aggregates are published.

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

- [Hooks: bytes saved on 10 agents](hooks-saving/README.md): 99.7%–99.9% less output on a 200 KB log, 2026-10-26.
