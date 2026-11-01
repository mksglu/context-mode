# GP-LIVE-ROUTING results (TECH-SPEC 6.5)

Date 2026-10-19. Claude Code 2.1.303, built plugin (`release-out`, `--plugin-dir`), keyless `claude -p`, `env -i` allow-list, effort low, `--max-budget-usd 0.4` per call. Runner: `e2e/live/routing/run.mjs`, tasks: `e2e/live/routing/tasks.mjs` (10 small, 10 large, 9 forced-Read T4 tasks). 2 runs per task and model. Score = first non-ToolSearch tool for runs 1-3 (old rule); see the rescore section for the deterministic rule.

Lint: `node build/prompt-lint.mjs --out release-out` = PR1-12, GS5, GS9 OK (before and after the text change).

## Thresholds (per model): over <= 1/10, under <= 1/10, large correct 10/10, T4 >= 8/10

Counts below are out of 20 runs (2 per task), so the 1/10 limit is 2/20.

| Run | Prompt | Model | Over (small) | Under (large) | Correct large | Correct small |
|---|---|---|---|---|---|---|
| 1 | draft (1015 chars) | opus-5-5 | 0/20 | 10/20 FAIL | 18/20 | 20/20 |
| 1 | draft | sonnet-5 | 0/20 | 20/20 FAIL | 18/20 | 20/20 |
| 1 | draft | haiku-4-5 | 0/20 | 18/20 FAIL | 17/20 | 18/20 |
| 3 | improved (1238 chars) | opus-5-5 | 0/20 | 8/20 FAIL | 20/20 | 20/20 |
| 3 | improved | sonnet-5 | 0/20 | 9/20 FAIL | 20/20 | 19/20 |
| 3 | improved | haiku-4-5 | 0/20 | 3/20 FAIL | 20/20 | 20/20 |

Run 1 task L3 had an ambiguous fixture (`ConnectionReset` text matched other types), so its L3 misses are a task bug, fixed before run 3. An intermediate run (run 2, same improved prompt, old L3) gave under 8/11/6 of 20 and over 0/0/1.

## T4 (forced Read of a large file, 9 tasks x 2 runs per model, run 3)

| Model | Answer reached | Read denied |
|---|---|---|
| opus-5-5 | 18/18 | 16/18 |
| sonnet-5 | 18/18 | 16/18 |
| haiku-4-5 | 17/18 | 18/18 |

T4 PASS (every model >= 8/10 equivalent), counting ranged Read, `ctx_execute(file)` and bounded shell search as success (DECISIONS-r9 V1).

## Change between runs

`src/prompt/instructions.md` (and `drafts.md`): the sentence "Search for and use these tools when output may be longer than about 20 lines..." became a task-based trigger: use the tools for the first step of any task that counts, sums, filters or finds something in data longer than about 20 lines, start with `ctx_execute` and print only the answer, with the reason (raw result fills the conversation), and search for the tool by name if not loaded. No caps, no doubt clause, no tags; 1238 chars <= 2048.

## Verdict

- Over-routing: PASS on all models.
- Correctness: PASS (large 20/20 all models in run 3; small 19/20 for sonnet, one miss).
- T4: PASS.
- Under-routing: FAIL on all three models in both runs. Improved from 48/60 to 20/60 of under-routed runs, but opus (8/20) and sonnet (9/20) are far over the limit.
- Reading the misses: nearly all are Bash-first with a filtering command (`grep -c`, `jq`, `awk`) that returns a few bytes (large-task bytes returned to the model: 1.5 KB opus, 2.7 KB sonnet, 6 KB haiku in run 3). The scorer counts tool choice, not bytes, so these are scored as failures although savings were reached. Two ways forward, owner decision: (a) score "first tool native AND bytes returned > 2048" as under-routing; (b) accept the tool-choice threshold and add more prompt pressure, which ADR-0005 rules (no caps, no "if in doubt") limit. Not done: the task allowed one prompt improvement and one re-run.

Raw run data stays in the private dir (derived data only).

## Rescore with the deterministic scorer (owner decision 2026-10-19)

Scorer: `e2e/live/routing/score.mjs` (pure function, 15 node:test cases in `score.test.mjs`). It looks at the tool and the returned bytes.
1. `ROUTE_BYTES` = 2048 (TECH-SPEC 6.5, ADR-0008).
2. Class is fixed from the fixture bytes: large if the full native output is > 2048 bytes, else small. Never from the model run.
3. Each call has a class (ctx if the name has `ctx_`, else native) and bytes = UTF-8 length of its tool_result (text blocks joined, other blocks by JSON length).
4. Under-routed (large) = native bytes summed over all calls > 2048. A filtered native command with a few bytes is not under-routing.
5. Over-routed (small) = any ctx call.
6. Per run: class, firstTool, nativeBytes, ctxBytes, underRouted, overRouted, correct. Limits unchanged: under <= 2/20, over <= 2/20 per model.

Old tool-only rule = the first non-ToolSearch tool must be ctx (large) and must not be ctx (small).

### Existing raw data, no model calls (`node e2e/live/routing/run.mjs --rescore <raw.json>`)

The old raw rows kept one total of returned bytes per run, not per call. Rescore puts all of it on the first native call, so native bytes are an upper bound. No row is undecidable (no mixed run has a total over 2048). Under = out of 20 large runs, over = out of 20 small runs.

| Raw run | Model | Old rule under | Old rule over | New rule under | New rule over | Correct (of 40) |
|---|---|---|---|---|---|---|
| 1 (draft) | opus-5-5 | 10 | 0 | 0 | 0 | 38 |
| 1 | sonnet-5 | 20 | 0 | 0 | 0 | 38 |
| 1 | haiku-4-5 | 18 | 0 | 0 | 0 | 35 |
| 2 | opus-5-5 | 8 | 0 | 0 | 0 | 38 |
| 2 | sonnet-5 | 11 | 0 | 0 | 0 | 37 |
| 2 | haiku-4-5 | 6 | 1 | 0 | 1 | 35 |
| 3 (improved) | opus-5-5 | 8 | 0 | 0 | 0 | 40 |
| 3 | sonnet-5 | 9 | 0 | 0 | 0 | 39 |
| 3 | haiku-4-5 | 3 | 0 | 0 | 0 | 40 |

Largest native bytes in any large run of runs 1-3: 594 (no native-only run was near 2048).

### Live re-run 4 (new rule, built plugin, keyless, effort low, `--max-budget-usd 0.4` per call, 2 runs per task, 10 small + 10 large per model)

Models: claude-opus-5-5, claude-sonnet-5-5, claude-haiku-5-5 (runs 1-3 used sonnet-5 and haiku-4-5; the ids changed, so run 4 is not a like-for-like model comparison).

| Model | Under (new) | Over (new) | Correct large | Correct small | Under (old rule, same rows) | Max native bytes, one large run | Verdict |
|---|---|---|---|---|---|---|---|
| opus-5-5 | 0/20 | 0/20 | 20/20 | 20/20 | 8/20 | 41 | PASS |
| sonnet-5-5 | 0/20 | 0/20 | 20/20 | 20/20 | 11/20 | 1521 | PASS |
| haiku-5-5 | 0/20 | 1/20 | 20/20 | 20/20 | 8/20 | 638 | PASS |

Haiku over-route: S7 (7-line file) used Read, then `ctx_execute`. Opus made no tool call on S3 and S9 (4 runs) and answered correctly; that is neither over nor under.

The T4 forced-Read tasks were not re-run (task scope: the 10 + 10 set).

## Verdict (updated)

Under-routing: PASS on all three models under the new rule. Under the old rule the same rows still fail (8/11/8 of 20), because a native `grep -c`, `jq` or `awk` that returns a few bytes counts as a miss there. The new rule matches the intent (savings reached when native output returned to the model is <= 2048 bytes). Over-routing: PASS. Correctness: PASS.

## GP-LIVE-ROUTING run 5 (646-char instructions)

Runner: e2e/live/routing/run.mjs, scorer score.mjs, 2 runs per task, effort low, budget 0.25 USD per session. Models: claude-opus-5-5, claude-sonnet-5-5, claude-haiku-5-5.

| Model | Under | Over | Correct large | Correct small | Max native bytes, one run | No tool call | Verdict |
|---|---|---|---|---|---|---|---|
| opus-5-5 | 0/20 | 0/20 | 20/20 | 20/20 | 41 | 3 | PASS |
| sonnet-5-5 | 0/20 | 0/20 | 20/20 | 20/20 | 610 | 2 | PASS |
| haiku-5-5 | 0/20 | 0/20 | 20/20 | 20/20 | 122 | 0 | PASS |

T4 forced-Read tasks excluded from the tally (same as run 4). Raw rows kept outside the repo.
