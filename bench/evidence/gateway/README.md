# Opus 5.5 short tasks: direct vs OSS v1 vs OSS v2 vs the Context Mode gateway

On six short coding tasks, the OSS plugin v1 cost **34.6% more** than Claude Code alone, and v1 cost less in 9 of 48 pairs. The OSS plugin v2 cost **2.2% more**, and v2 cost less in 23 of 48 pairs. The published gateway rows on the same six tasks cost **24.5% less**, and the gateway cost less in 84 of 88 pairs. All 144 measured sessions passed their task check. Each arm is compared only with its own direct run on the same day. Sums over pairs: [ab.json](ab.json) (`pooled`) and the [published gateway file](published/v3-opus55-short.json). Each row has its own interval and verdict in the tables below. We wrote down the plan before the first run: [prereg.md](prereg.md), commit `bcc45e33`.

## Key facts

- **What it is:** a paired cost test of Claude Code with no plugin, with OSS v1 and with OSS v2. The six tasks come from the published gateway benchmark. The gateway rows are the published rows. We did not run them again.
- **Who it is for:** people who want to choose between the OSS plugin and the gateway, from cost per task.
- **Clients:** OSS rows: Claude Code 2.1.303, `claude-opus-5-5`, 2026-10-21. Gateway rows: Claude Code 2.1.283, `claude-opus-5-5`, 2026-09-29. No Codex run. No other model.
- **Measured result:** 2026-10-21. v1 cost more than direct on 5 of 6 tasks ("more" verdict). On grep the result was "same". v2 cost less than direct on grep ("less" verdict) and showed no clear difference on the other 5 ("same"). v2 cost less than v1 on all 6 tasks ("less" verdict, secondary result).
- **Limits:** 8 pairs per OSS row, so the intervals are wide. A "same" verdict does not prove the cost is equal. The gateway rows are from another date and another client version: compare savings against each arm's own direct run, not dollars across columns. Cost is the cash cost on API billing, or the list-price value on a Claude plan. The runs used a claude.ai login, so there is no per-token invoice.

## Results

Each cell gives the mean cost per task at list price. "Likely" gives the 95% t range of the paired difference. "Head-to-head" counts the pairs where the arm cost less than its own direct run. The gateway column shows the published direct mean, then the published gateway mean (2026-09-29, Claude Code 2.1.283). All rows are here: wins, losses and "same".

### Agentic Coding

Everyday agent steps: search the code, ask the repo history, make an edit.

| Category and task | Direct | v1 | v2 | Context Mode Gateway | Saving vs own direct | Head-to-head | Evidence |
|---|---:|---:|---:|---:|---|---|---|
| Code search (grep over 150 files) | $0.093 | $0.099 | $0.077 | $0.093 → $0.066 | v1: cost 7% more, likely 7% less to 22% more, **same**<br>v2: **17% lower**, likely 6 to 28%, **less**<br>Gateway: **29% lower**, likely 23 to 34%, **less** | v1 4 of 8<br>v2 7 of 8<br>Gateway 16 of 16 | [JSON](ab.json) · [runs](runs/grep.jsonl) · [gateway JSON](published/v3-opus55-short.json) |
| One-line edit | $0.057 | $0.095 | $0.068 | $0.075 → $0.054 | v1: cost **66% more**, likely 31 to 100% more, **more**<br>v2: cost 19% more, likely 14% less to 52% more, **same**<br>Gateway: **28% lower**, likely 14 to 42%, **less** | v1 0 of 8<br>v2 2 of 8<br>Gateway 11 of 12 | [JSON](ab.json) · [runs](runs/edit.jsonl) · [gateway JSON](published/v3-opus55-short.json) |
| Repo history question (git log, 320 commits) | $0.052 | $0.087 | $0.062 | $0.071 → $0.053 | v1: cost **66% more**, likely 30 to 102% more, **more**<br>v2: cost 19% more, likely 13% less to 52% more, **same**<br>Gateway: **25% lower**, likely 16 to 34%, **less** | v1 0 of 8<br>v2 2 of 8<br>Gateway 15 of 16 | [JSON](ab.json) · [runs](runs/git.jsonl) · [gateway JSON](published/v3-opus55-short.json) |

### Large Tool-Output Handling

A command prints far more than the model needs.

| Category and task | Direct | v1 | v2 | Context Mode Gateway | Saving vs own direct | Head-to-head | Evidence |
|---|---:|---:|---:|---:|---|---|---|
| One large log | $0.077 | $0.104 | $0.075 | $0.091 → $0.071 | v1: cost **34% more**, likely 9 to 58% more, **more**<br>v2: 3% lower, likely 24% less to 17% more, **same**<br>Gateway: **22% lower**, likely 15 to 30%, **less** | v1 2 of 8<br>v2 5 of 8<br>Gateway 15 of 16 | [JSON](ab.json) · [runs](runs/log.jsonl) · [gateway JSON](published/v3-opus55-short.json) |
| One large JSON file | $0.073 | $0.095 | $0.076 | $0.086 → $0.068 | v1: cost **31% more**, likely 9 to 52% more, **more**<br>v2: cost 5% more, likely 21% less to 31% more, **same**<br>Gateway: **21% lower**, likely 13 to 30%, **less** | v1 2 of 8<br>v2 4 of 8<br>Gateway 12 of 12 | [JSON](ab.json) · [runs](runs/json.jsonl) · [gateway JSON](published/v3-opus55-short.json) |

### Test-Driven Debugging

Run the tests, fix the code, run them again.

| Category and task | Direct | v1 | v2 | Context Mode Gateway | Saving vs own direct | Head-to-head | Evidence |
|---|---:|---:|---:|---:|---|---|---|
| npm test fix loop, short | $0.075 | $0.096 | $0.078 | $0.087 → $0.068 | v1: cost **27% more**, likely 7 to 48% more, **more**<br>v2: cost 4% more, likely 18% less to 27% more, **same**<br>Gateway: **22% lower**, likely 16 to 28%, **less** | v1 1 of 8<br>v2 3 of 8<br>Gateway 15 of 16 | [JSON](ab.json) · [runs](runs/tests.jsonl) · [gateway JSON](published/v3-opus55-short.json) |

### All six tasks together

A sum over pairs, not a mean of rows. No interval: the rows are different tasks.

| Arm | Pairs | Direct total | Arm total | Change | Cost less |
|---|---:|---:|---:|---:|---|
| v1 (2026-10-21) | 48 | $3.419 | $4.601 | +34.6% | 9 of 48 |
| v2 (2026-10-21) | 48 | $3.419 | $3.493 | +2.2% | 23 of 48 |
| Gateway (published, 2026-09-29) | 88 | $7.398 | $5.585 | −24.5% | 84 of 88 |

### Per 1,000 tasks

(mean direct − mean arm) × 1,000, from unrounded means. A negative number means the arm cost more.

| Task | v1 | v2 | Gateway (published) |
|---|---:|---:|---:|
| Code search | −$7 | $16 | $27 |
| One-line edit | −$38 | −$11 | $21 |
| Repo history question | −$35 | −$10 | $18 |
| One large log | −$26 | $3 | $20 |
| One large JSON file | −$22 | −$4 | $18 |
| npm test fix loop, short | −$20 | −$3 | $19 |

### v2 against v1 (secondary)

v2 cost less than v1 on every task: grep 23% lower (likely 14 to 32%), edit 28% lower (likely 14 to 43%), git 28% lower (likely 12 to 44%), log 28% lower (likely 13 to 43%), json 20% lower (likely 4 to 35%), tests 18% lower (likely 1 to 35%). All six verdicts are "less".

### Success and plugin tool use

- Task checks: direct 48 of 48, v1 48 of 48, v2 48 of 48. Gateway (published): 88 of 88, direct 88 of 88.
- Sessions that called a plugin tool at least once: v1 0 of 48. v2 13 of 48 (json 6 of 8, log 6 of 8, grep 1 of 8, other tasks 0 of 8). We did not force any tool.
- v1 lists 11 plugin tools. v2 lists 9. On these short tasks, the extra tool definitions are part of every request. That is the likely cause of most of the v1 cost. We did not measure the cause directly.

## Bridge check: is the 2026-09-29 gateway result still true today?

This is a drift check, not a result. We ran 2 extra direct-vs-gateway pairs per task on today's client (Claude Code 2.1.303, `claude-opus-5-5`). The published rows used Claude Code 2.1.283 on 2026-09-29. Two pairs give no interval and no verdict. We do not merge them into any row.

Pair 1 ran direct first, pair 2 gateway first. Each cell gives direct → gateway cost and the change. "Published" is the published change with its 95% range.

| Task | Published | Pair 1 (direct first) | Pair 2 (gateway first) | Inside the range |
|---|---|---|---|---|
| npm test fix loop, short | −21.8% (−27.7 to −15.8) | $0.0804 → $0.0624, −22.3% | $0.0805 → $0.0618, −23.2% | 2 of 2 |
| One large JSON file | −21.4% (−29.9 to −12.9) | $0.0559 → $0.0416, −25.5% | $0.0818 → $0.0683, −16.5% | 2 of 2 |
| Repo history question | −25.2% (−33.9 to −16.5) | $0.0679 → $0.0556, −18.1% | $0.0428 → $0.0211, −50.7% | 1 of 2 |
| Code search | −28.7% (−34.1 to −23.4) | $0.0947 → $0.1120, +18.3% | $0.0850 → $0.0668, −21.4% | 0 of 2 |
| One-line edit | −27.8% (−42.2 to −13.5) | $0.0479 → $0.0322, −32.8% | $0.0481 → $0.0596, +24.1% | 1 of 2 |
| One large log | −22.4% (−30.2 to −14.7) | $0.0820 → $0.1531, +86.7% | $0.0936 → $0.0351, −62.6% | 0 of 2 |

What it says about drift:

- **tests, json:** both pairs fall inside the published range. We see no sign of drift on these two tasks.
- **git:** the gateway cost less in both pairs. One pair is inside the range. The other saved more than the range.
- **grep, edit, log:** the gateway cost more in one pair and less in the other. Two pairs cannot tell drift from noise here.
- **All 12 pairs:** the gateway cost less in 9 of 12. 6 of 12 fall inside the published range. Sum over the 12 pairs: direct $0.861, gateway $0.770 (−10.6%). The published sum over 88 pairs was −24.5%.
- The 3 gateway sessions that cost more than their direct run wrote more tokens to the prompt cache than the other gateway session of the same task (grep 11,638 vs 6,365, log 17,258 vs 2,427, edit 5,482 vs 2,145). We did not measure why.

All 24 bridge sessions passed their task check. Each task used one new disposable tenant (tenant ids withheld). The harness changed no flag. It read `memory: true, skills: true` (the defaults) before and after each gateway run. The gateway version was the same before and after each pair, so no pair ran again. The gateway's per-call record was found and complete for all 12 gateway runs and covered all the tokens the client saw. Its cost was within 0.002% of the client's own total.

Twelve pairs cannot confirm or reject the published rows. A real check needs a new pre-registered run on today's client.

## How we measured

- **Paired runs.** Per task, 1 warm-up cycle (not counted) and 8 measured cycles. One cycle runs direct, v1 and v2 back to back. The order rotates by cycle (3/3/2 split over 8 cycles). Each task ran in its own lane.
- **The real client.** `claude -p` with Claude Code 2.1.303 (the real binary, version checked at start and end), `--model claude-opus-5-5`, `--max-turns 30`, `--permission-mode bypassPermissions`, `--max-budget-usd 1.5`, stdin closed, a fresh config dir and a fresh copy of the task files per session, `--strict-mcp-config`. Direct has an empty MCP map. v1 and v2 declare only the plugin's own server.
- **Arms we checked.** We read each arm from the session's own `init` event, not from model text. v1: origin/main `a92cf6a7`, version 1.0.169, clean tree. v2: v2-design `8f38bdbc` built to `release-out`, clean tree. No run was void, and no cycle ran a second time.
- **The cost.** List price on the token counts in each session's result event (Opus 5.5 per million tokens: input $4, output $20, cache read $0.20, cache write 5 min $5, 1 h $8). Claude Code's own total is kept beside it. No session had a gap above 1%. `analyze.mjs` prices every row again from its token columns and stops on any difference.
- **Written down first.** [prereg.md](prereg.md) was pushed as `bcc45e33` at 2026-10-21T19:47Z. The first run file was pushed at 2026-10-21T20:13Z.
- **Analysis.** d = arm − direct per cycle. Change = 100 × mean(d) / mean(direct), with the 95% t interval (t = 2.365 at n = 8). Verdict "less" when the whole interval is below zero, "more" when it is above zero, else "same". Every measured cycle counts. We dropped no outlier.
- **Gateway rows.** Copied from `/benchmarks/data/v3-opus55-short.json` (SHA-256 `3298b1b2…`, checked by `analyze.mjs`). Same tasks, same prompts and the same checks (gateway commit `408333a4`). `analyze.mjs` runs the same method on the published pairs. It gets the same change, interval, verdict and wins on all 6 rows (interval ends differ by 0.0 points).
- **Bridge.** Same client flags as above. The gateway arm sets `ANTHROPIC_BASE_URL` to the deployed gateway at `https://gateway.context-mode.com`. Gateway cost comes from the gateway's per-call record, hidden calls included, at list price. The run files do not hold the host.
- **Spend.** 186 sessions (18 warm-up, 144 measured, 24 bridge), $14.83 at list price.
- **Not done.** Gate S0 (does `bypassPermissions` keep the plugin hook active?) has no saved result for this run. We report it as INCONCLUSIVE. It does not change the cost figures.

## Verify it yourself

```
git clone --branch v2-design https://github.com/mksglu/context-mode.git
cd context-mode/bench/evidence/gateway
node analyze.mjs --check   # exit 0: ab.json and index.json match the run files
node analyze.mjs           # writes them again and prints one line per task
```

`analyze.mjs` uses no clock, no network and no random numbers. It stops on a changed gateway file, an unresolved arm, a model or client change, or a cost that does not match its token columns. The run files hold token counts per session, cost, success, tool-call names and the arm evidence. We withheld prompts, answers, session ids, tenant ids, local paths and transcripts. The run files do not hold the gateway host. We name it once, under How we measured. To run the cycles again, see [bench/gateway-ab/README.md](../../../bench/gateway-ab/README.md) and `harness.patch`.

## Sources

- Pre-registration: [prereg.md](prereg.md) (commit `bcc45e33`).
- Evidence: [ab.json](ab.json), [index.json](index.json), run files in [runs/](runs/).
- Analysis script: [analyze.mjs](analyze.mjs).
- Published gateway evidence: [published/v3-opus55-short.json](published/v3-opus55-short.json) (copy of https://context-mode.com/benchmarks/data/v3-opus55-short.json) and its pre-registration [published/v3-opus55-short-prereg.md](published/v3-opus55-short-prereg.md).
- Harness: [bench/gateway-ab/](../../../bench/gateway-ab/).
