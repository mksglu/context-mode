# README try-it prompts: direct vs OSS v1 vs OSS v2 vs the Context Mode gateway (Opus 5.5)

On the five counted "Try It" prompts from the README, OSS plugin v1 cost **33.1% more** than Claude Code alone, and v1 cost less in 4 of 20 pairs. OSS plugin v2 cost **15.5% more**, and v2 cost less in 7 of 20 pairs. The Context Mode gateway cost **43.8% less**, and it cost less in 20 of 20 pairs. The gateway passed the task check in **15 of 20** sessions. Direct passed 20 of 20, v1 17 of 20, v2 18 of 20 (see "Success" below). Sums over pairs: [ab.json](ab.json) (`pooled`). Each prompt has its own range and verdict in the tables below. Of the 13 README numbers we could check, 2 hold and 11 differ. We wrote down the plan before the first run: [prereg.md](prereg.md), commit `f924eda2`. The first run had two faults in the harness. We fixed them in [amendment 1](prereg-amendment-1.md) and ran web-scrape, docs-search and large-json again (see "Amendment 1").

## Key facts

- **What it is:** a paired cost test of the six "Try It" prompts from the OSS README, in four arms: Claude Code alone (direct), OSS v1, OSS v2, and the live Context Mode gateway. Same day, same client, same model for all arms.
- **Who it is for:** people who read the README numbers and want to know what one prompt really costs in each setup.
- **Client:** Claude Code 2.1.303, `claude-opus-5-5`, 2026-10-22. No other model. No Codex run.
- **Measured result:** the gateway cost less than direct on 4 prompts ("less"). On large-json its range crosses zero ("same"), and it failed the record check in all 4 sessions. v1 cost more on large-json and docs-search ("more"); on the other 3 the range crosses zero ("same"). v2 cost more on web-scrape ("more"); on the other 4 the range crosses zero ("same").
- **Which runs count:** web-scrape, docs-search and large-json use only the amendment-1 runs. repo-research, git-history and session-continuity use the first run. The first-run lines of the three re-run prompts stay in [runs/](runs/) and in [ab.json](ab.json) under `superseded`, with the reason.
- **Limits:** 4 pairs per prompt, so the ranges are wide. A "same" verdict does not prove the cost is equal. The success checks for repo-research, web-scrape and docs-search are completion checks, not quality checks. Cost is the list-price value on a claude.ai login: there is no per-token invoice. session-continuity ran 2 cycles as a demonstration only: no range, no verdict, no claim.

## Results

Each cost cell gives the mean cost per prompt at list price. "Likely" gives the 95% t range of the paired difference (t = 3.182 at n = 4). "Head-to-head" counts the cycles where the arm cost less than direct. "tool_result bytes" is the mean size of all tool results the client sent to the model in one session. All rows are here: wins, losses and "same".

### Deep repo research

| | Direct | v1 | v2 | Context Mode Gateway |
|---|---:|---:|---:|---:|
| Mean cost | $0.249 | $0.342 | $0.198 | $0.176 |
| Saving vs direct | – | cost 37% more, likely 36% less to 110% more, **same** (range crosses zero) | 21% lower, likely 42% lower to 1% more, **same** (range crosses zero) | **29% lower**, likely 3 to 56%, **less** |
| Head-to-head | – | 1 of 4 | 4 of 4 | 4 of 4 |
| tool_result bytes seen | 25,089 | 33,655 | 16,249 | 5,610 |
| Tool calls (median) | 4 | 4 | 2 | 2.5 |
| Success (completion check) | 4/4 | 4/4 | 4/4 | 3/4 |

v2 against v1: 42% lower, likely 98% lower to 14% more, same. The gateway failure: in cycle 1 the client made no tool call.

### Git history analysis

| | Direct | v1 | v2 | Context Mode Gateway |
|---|---:|---:|---:|---:|
| Mean cost | $0.145 | $0.141 | $0.142 | $0.078 |
| Saving vs direct | – | 3% lower, likely 31% lower to 26% more, **same** (range crosses zero) | 2% lower, likely 45% lower to 40% more, **same** (range crosses zero) | **46% lower**, likely 11 to 81%, **less** |
| Head-to-head | – | 2 of 4 | 2 of 4 | 4 of 4 |
| tool_result bytes seen | 2,946 | 2,041 | 2,684 | 1,373 |
| Tool calls (median) | 4 | 2 | 2.5 | 2 |
| Success (top author named) | 4/4 | 4/4 | 4/4 | 4/4 |

v2 against v1: 0.3% more, likely 22% lower to 23% more, same. v1 made no plugin tool call in any measured cycle (0 of 4).

### Web scraping (amendment 1)

| | Direct | v1 | v2 | Context Mode Gateway |
|---|---:|---:|---:|---:|
| Mean cost | $0.117 | $0.153 | $0.161 | $0.060 |
| Saving vs direct | – | cost 31% more, likely 15% less to 77% more, **same** (range crosses zero) | cost **37% more**, likely 11 to 63% more, **more** | **49% lower**, likely 17 to 81%, **less** |
| Head-to-head | – | 1 of 4 | 0 of 4 | 4 of 4 |
| tool_result bytes seen | 2,371 | 3,487 | 5,938 | 0 |
| Tool calls (median) | 1.5 | 2 | 2 | 0 client, 1 edge |
| Success (completion check) | 4/4 | 4/4 | 4/4 | 4/4 |

v2 against v1: 5% more, likely 23% lower to 33% more, same. The gateway made one edge call per session (1, 1, 1, 1) and no client tool call, so the client saw 0 tool_result bytes. v1 used a plugin tool in 3 of 4 sessions; in the other one it used Bash.

### Large JSON API (amendment 1)

| | Direct | v1 | v2 | Context Mode Gateway |
|---|---:|---:|---:|---:|
| Mean cost | $0.111 | $0.213 | $0.179 | $0.065 |
| Saving vs direct | – | cost **93% more**, likely 28 to 158% more, **more** | cost 62% more, likely 9% less to 132% more, **same** (range crosses zero) | 41% lower, likely 83% lower to 0.5% more, **same** (range crosses zero) |
| Head-to-head | – | 0 of 4 | 0 of 4 | 4 of 4 |
| tool_result bytes seen | 1,596 | 4,287 | 2,659 | 674 |
| Tool calls (median) | 2 | 5 | 6 | 1 client, 0 edge |
| Success (record check) | 4/4 | 1/4 | 2/4 | **0/4** |

v2 against v1: 16% lower, likely 56% lower to 24% more, same. The record check (amendment 1) takes the record at index 13000 from the session's own tool_result and needs every value of it in the answer. Direct passed 4 of 4. Each fail of v1, of the gateway and of v2 cycle 3 missed 1 value of the record. We did not check which value. v2 cycle 1 missed 10 of 11 values; see "Success". The gateway made no edge call here: the client ran the commands.

### Documentation search (amendment 1)

| | Direct | v1 | v2 | Context Mode Gateway |
|---|---:|---:|---:|---:|
| Mean cost | $0.164 | $0.197 | $0.229 | $0.064 |
| Saving vs direct | – | cost **20% more**, likely 5 to 35% more, **more** | cost 40% more, likely 18% less to 97% more, **same** (range crosses zero) | **61% lower**, likely 53 to 70%, **less** |
| Head-to-head | – | 0 of 4 | 1 of 4 | 4 of 4 |
| tool_result bytes seen | 20,989 | 16,997 | 19,968 | 0 |
| Tool calls (median) | 4 | 3 | 5.5 | 0 client, 1.5 edge |
| Success (completion check) | 4/4 | 4/4 | 4/4 | 4/4 |

v2 against v1: 16% more, likely 26% lower to 59% more, same. The gateway made 2, 1, 2 and 1 edge calls and no client tool call.

### Session continuity (demonstration only, 2 cycles)

| | Direct | v1 | v2 | Context Mode Gateway |
|---|---:|---:|---:|---:|
| Mean cost | $0.242 | $0.333 | $0.300 | $0.149 |
| tool_result bytes seen | 1,438 | 3,006 | 2,611 | 638 |
| Success (completion check) | 2/2 | 2/2 | 2/2 | 2/2 |

No range and no verdict (prereg). No session compacted, so compaction recovery was not tested.

### Sum over all counted pairs

A sum over the 20 measured pairs of the five counted prompts (amendment-1 pairs for web-scrape, docs-search and large-json). No range: the rows are different prompts.

| Arm | Direct total | Arm total | Change | Cost less | Success |
|---|---:|---:|---:|---|---|
| v1 | $3.147 | $4.188 | +33.1% | 4 of 20 | 17 of 20 |
| v2 | $3.147 | $3.634 | +15.5% | 7 of 20 | 18 of 20 |
| Gateway | $3.147 | $1.770 | −43.8% | 20 of 20 | 15 of 20 |

Direct success: 20 of 20.

### Where the range crosses zero

With n = 4, these rows show no clear difference from direct: v1 on repo-research, git-history and web-scrape; v2 on repo-research, git-history, large-json and docs-search; the gateway on large-json. v2 against v1 crosses zero on all 5 prompts.

### Success: read this before the gateway cost

- Gateway, 5 fails in 20. large-json: 4 of 4 failed the record check, each missing 1 value of the record. repo-research cycle 1: the client made no tool call. That prompt was not re-run, so it keeps the first-run rule (client tool calls only); the gateway record shows 2 edge calls in that session.
- v1 failed 3 large-json sessions and v2 failed 2. Each fail missed 1 value, except v2 cycle 1.
- v2 large-json cycle 1: the transcript holds two answers in one session. After the first answer, the client stopped a background server task (a `task_updated` event) and ran one more turn in the same session. The run line and the check use the last result event, a short note with 10 of 11 values missing. We count it as it ran: a fail. The first answer is not scored.
- The gateway cost includes its edge calls: it comes from the gateway's per-call record, not from the client. On web-scrape the client saw 34% less cost than the record shows, on docs-search 52% less.
- A lower cost with a failed check is not a saving you can claim. On large-json the gateway cost less in 4 of 4 pairs but passed 0 of 4.

## Amendment 1

- **What went wrong.** (1) web-scrape and docs-search: the gateway failed all 8 measured sessions as `no-tool-call`. The check counted only client tool calls. But the gateway ran the fetch at its own edge, in the same request: its per-call record shows 1 or 2 edge calls and tokens the client never saw. (2) large-json: every arm failed all 16 sessions as `no-served-data-on-disk`. The check read the data from disk, but every session built the data in memory.
- **Why it matters.** Both faults were in the harness, not in the arms. Also, the first run used one gateway tenant per prompt with memory and skills on, so a later cycle could see what an earlier one wrote.
- **What changed.** A new gateway tenant for each session. Gateway edge calls count as tool calls in the completion check. The large-json check reads the record from the session's own tool_result (fails closed when there is none). Same model, client, prompts, flags, cycles and stop rule. The amendment was pushed (`c091a4cb`, last edit `da170213`) before the first new run line (`c9ba8cfd`).
- **What stays.** The 60 first-run lines of the three prompts stay in [runs/](runs/), unchanged. [ab.json](ab.json) keeps their full analysis under `superseded`, with the reason. repo-research, git-history and session-continuity were not re-run; their gateway lines used one tenant per prompt.

First run against amendment 1, measured cycles (mean cost, success):

| Prompt | Run | Direct | v1 | v2 | Gateway |
|---|---|---|---|---|---|
| Web scraping | first run (superseded) | $0.120, 4/4 | $0.146, 4/4 | $0.154, 4/4 | $0.059, 0/4 |
| Web scraping | amendment 1 | $0.117, 4/4 | $0.153, 4/4 | $0.161, 4/4 | $0.060, 4/4 |
| Documentation search | first run (superseded) | $0.162, 4/4 | $0.203, 4/4 | $0.250, 4/4 | $0.057, 0/4 |
| Documentation search | amendment 1 | $0.164, 4/4 | $0.197, 4/4 | $0.229, 4/4 | $0.064, 4/4 |
| Large JSON API | first run (superseded) | $0.118, 0/4 | $0.242, 0/4 | $0.138, 0/4 | $0.076, 0/4 |
| Large JSON API | amendment 1 | $0.111, 4/4 | $0.213, 1/4 | $0.179, 2/4 | $0.065, 0/4 |

## README claims checked

Claims from the "Try It" section of README.md at origin/main `a92cf6a7`, checked against the v1 arm. Rule (prereg): HOLDS when the measured median is within 25% of the claimed number. KB = 1,000 bytes (the verdicts are the same at 1,024). "Raw" uses the bytes the direct arm saw (prereg); this is not the size of the full data. Web scraping, large JSON and documentation search use the amendment-1 runs.

| Prompt | Claim | Measured (v1, median of 4) | Holds? |
|---|---|---|---|
| Deep repo research | 5 calls | 4 calls (range 3 to 4) | true |
| Deep repo research | 62 KB context | 32.7 KB (16.0 to 53.1) | false |
| Deep repo research | raw: 986 KB | direct saw 24.1 KB (20.9 to 31.4) | false |
| Deep repo research | 94% saved | −33.2%: v1 showed more bytes than direct (−155 to 49) | false |
| Git history analysis | 1 call | 2 calls (2 to 2) | false |
| Git history analysis | 5.6 KB context | 2.0 KB (2.0 to 2.1) | false (v1 showed less) |
| Web scraping | 1 call | 2 calls (1 to 3) | false |
| Web scraping | 3.2 KB context | 3.7 KB (2.3 to 4.2) | true |
| Large JSON API | 7.5 MB raw | direct saw 1.7 KB (1.2 to 1.8) | false |
| Large JSON API | 0.9 KB context | 3.9 KB (2.0 to 7.4) | false |
| Large JSON API | 99% saved | −175.4%: v1 showed more bytes than direct (−309 to −20) | false |
| Documentation search | 2 calls | 3 calls (3 to 3) | false |
| Documentation search | 1.8 KB context | 17.0 KB (16.9 to 17.1) | false |
| Session continuity | compaction recovery with full state | 0 compactions in 2 v1 sessions | INCONCLUSIVE |

Call counts include ToolSearch calls. Without them the medians are repo-research 3.5, git-history 2, web-scrape 1, docs-search 2. The direct arm did not dump the full data on these prompts: the model filtered it with its own commands. So the "raw" and "% saved" claims compare v1 with a direct arm that already saw little. In the first run, web scraping gave the opposite verdicts (1 call true, 3.2 KB false); those lines are superseded.

## How we measured

- **Paired runs.** Per prompt, 1 warm-up cycle (not counted) and 4 measured cycles. One cycle runs direct, v1, v2 and the gateway back to back. The start arm rotates by cycle, so each arm starts once. session-continuity: 2 cycles, no warm-up.
- **The real client.** `claude -p` with Claude Code 2.1.303 (version checked at start and end), `--model claude-opus-5-5`, `--max-turns 60`, `--permission-mode bypassPermissions`, `--max-budget-usd 3`, stdin closed, a fresh config dir and a fresh empty cwd per session, 900 s limit. Direct and the plugin arms use `--strict-mcp-config`; direct has an empty MCP map.
- **Arms we checked.** We read each arm from the session's own `init` event, not from model text. v1: origin/main `a92cf6a7`, version 1.0.169, clean tree. v2: v2-design `7f320e16` built to `release-out`, clean tree. The build's SHA256SUMS hash is `94152849` in all runs except the large-json amendment-1 run, where it is `ef323c32` (same commit, clean tree; we did not find why). Gateway: `ANTHROPIC_BASE_URL` set to the deployed gateway at `https://gateway.context-mode.com`, default tenant flags (read before and after each run, unchanged). First run: one new disposable tenant per prompt. Amendment 1: one new disposable tenant per session. Tenant ids are withheld. The gateway version was the same before and after each run. No run was void, and no cycle ran a second time.
- **The cost.** Direct, v1 and v2: list price on the token counts in each session's result event (Opus 5.5 per million tokens: input $4, output $20, cache read $0.20, cache write 5 min $5, 1 h $8). Gateway: the same prices on the gateway's per-call record for the session, hidden calls included. Each record was found, complete, and covered all tokens the client saw. `analyze.mjs` prices every row again and stops on any difference.
- **Bytes seen.** `measure-bytes.mjs` reads each private transcript once and sums the UTF-8 bytes of every tool_result block. It writes [tool-result-bytes.json](tool-result-bytes.json), with the SHA-256 of each transcript. For the gateway this is what the client sent; the gateway can change it on the way, and its record does not hold that size. Tool calls are counted from the transcript. The `tools` field in the run files counts fewer calls in some sessions; we use the transcript count. One transcript (large-json v2 cycle 1, amendment 1) holds two result events in one session; the byte sum covers both.
- **Success checks.** git-history: the answer names the top `git shortlog -sn` author over the same 500 commits. large-json, amendment 1: every value of the record at index 13000, taken from the session's own tool_result, is in the answer. The rest: end_turn, at least one tool call, a non-empty answer. Amendment 1 counts gateway edge calls as tool calls; the first run counted client tool calls only.
- **Written down first.** [prereg.md](prereg.md) was pushed as `f924eda2` at 2026-10-22T10:51Z. The first run file was pushed at 2026-10-22T11:13Z. [prereg-amendment-1.md](prereg-amendment-1.md) was pushed as `c091a4cb` at 13:38Z (last edit `da170213` at 14:49Z). The first amendment-1 run line was pushed as `c9ba8cfd` at 14:56Z.
- **Analysis.** d = arm − direct per cycle. Change = 100 × mean(d) / mean(direct), with the 95% t range at df = n − 1. Verdict "less" when the whole range is below zero, "more" when it is above zero, else "same". Every measured cycle counts, failures included. We dropped no outlier.
- **Spend.** 168 sessions (32 warm-up, 136 measured), $26.98 at list price. Of that, $8.52 is in the 60 superseded lines. Stop rule $80, not reached.

## Verify it yourself

```
git clone --branch v2-design https://github.com/mksglu/context-mode.git
cd context-mode/bench/evidence/try-it
node analyze.mjs --check   # exit 0: ab.json and index.json match the run files
node analyze.mjs           # writes them again and prints one line per prompt and per claim
```

`analyze.mjs` uses no clock, no network and no random numbers. It stops on an unresolved arm, a model or client change, a changed plugin or harness commit, a gateway record that is missing or does not cover the client, a cost that does not match its token columns, or a success flag that does not match the check result, or an amendment-1 line for a prompt the amendment did not re-run. `measure-bytes.mjs` needs the raw transcripts, which we keep private; its output holds each transcript's SHA-256. The run files hold token counts, cost, success, tool-call names and the arm evidence. We withheld answer text, session ids, tenant ids, local paths and transcripts. To run the cycles again, see [bench/gateway-ab/README.md](../../../bench/gateway-ab/README.md) and `tryit.patch`.

## Sources

- Pre-registration: [prereg.md](prereg.md) (commit `f924eda2`) and [prereg-amendment-1.md](prereg-amendment-1.md) (commit `c091a4cb`).
- Evidence: [ab.json](ab.json), [index.json](index.json), [tool-result-bytes.json](tool-result-bytes.json), run files in [runs/](runs/).
- Scripts: [analyze.mjs](analyze.mjs), [measure-bytes.mjs](measure-bytes.mjs).
- Claims: README.md "Try It" at origin/main `a92cf6a77ac02971fb5fafe2155e5ee229491884`.
- Harness: [bench/gateway-ab/](../../../bench/gateway-ab/) (`tryit.patch`).
- Method: [../v1-v2-gateway/README.md](../v1-v2-gateway/README.md).
