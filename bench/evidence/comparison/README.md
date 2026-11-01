# Context Mode v2 against v1: what changed, with evidence

On six short Opus 5.5 tasks, v1 cost **34.6% more** than Claude Code alone and v2 cost **2.2% more**; v2 cost less than v1 on all six tasks ([v1-v2-gateway/ab.json](../v1-v2-gateway/ab.json)). On a held-out search set, v2 finds the right chunk in the top 5 for **0.98** of queries against **0.84** for v1 ([DIAGNOSIS section 8](../../v2/spikes/search/DIAGNOSIS.md#8-verbatim-fence-aware-snippets-d-search-7-2026-10-23-node-26-macos)). Install is **2 commands** ([CLI-REPORT.md](../../v2/CLI-REPORT.md#the-user-journey-2-commands)). v2 still costs more than no plugin on short tasks, and its hook misses one latency budget by 1 ms. The paid Context Mode Gateway cost **24.5% less** than direct on the same six tasks ([published file](../v1-v2-gateway/published/v3-opus55-short.json)).


## Key facts

- **What it is:** one page that puts the v1 and v2 results side by side. It adds no new run. Every number comes from a file in this repo; each row links to it.
- **Who it is for:** v1 users who want to know if v2 is worth the upgrade, and people who choose between the free plugin and the gateway.
- **Arms:** Direct = Claude Code with no plugin. v1 = context-mode 1.0.169 (branch `main`). v2 = branch `v2-design`. Context Mode Gateway = the paid plan; its rows are the published rows unless a row says otherwise.
- **Limits:** small n (8 pairs per task on cost, 4 per prompt on try-it). One model family. Gateway cost rows are from 2026-09-29 on Claude Code 2.1.283; OSS rows are from 2026-10-21 and 2026-10-22 on 2.1.303. Compare each arm with its own direct run, not dollars across columns.

## Comparison

"n/a" means the topic does not apply to that arm. "not measured" means we have no evidence file for it.

| Topic | Direct | v1 | v2 | Context Mode Gateway | Evidence |
|---|---|---|---|---|---|
| Cost, six short tasks (Opus 5.5, sum over pairs) | baseline | **+34.6%** (48 pairs, cost less in 9 of 48) | **+2.2%** (48 pairs, cost less in 23 of 48) | **−24.5%** (88 pairs, cost less in 84 of 88) | [v1-v2-gateway/README.md](../v1-v2-gateway/README.md), [ab.json](../v1-v2-gateway/ab.json) |
| v2 against v1, same six tasks | n/a | baseline | lower on 6 of 6 tasks, 18% to 28% | n/a | [v2 against v1](../v1-v2-gateway/README.md#v2-against-v1-secondary) |
| README "Try It" prompts (5 counted prompts, 20 pairs) | baseline, pass 20/20 | **+33.1%**, pass 17/20 | **+15.5%**, pass 18/20 | **−43.8%**, pass 15/20 | [try-it/README.md](../try-it/README.md), [try-it/ab.json](../try-it/ab.json) (`pooled`) |
| Fixture bytes the model sees (21 scenarios, 389.2 KB raw) | n/a | 16,616 B | tool path 56,330 B; hook path 10,585 B | not measured | [fixtures/README.md, Totals](../fixtures/README.md#totals) |
| Fixture bytes, Part 1 only (14 command outputs, 314.9 KB raw) | n/a | 5,517 B | tool 5,742 B; hook 3,019 B | not measured | [fixtures/README.md, Totals](../fixtures/README.md#totals) |
| Large-output tasks, median tool_result bytes (Sonnet 5.5) | 4,694.5 B | 2,436.5 B | 734.5 B | not measured | [data/ab-final2.json](../data/ab-final2.json) |
| Search: held-out recall@5 / MRR@10 (50 queries) | n/a | 0.84 / 0.76 | **0.98 / 0.827** | n/a | [DIAGNOSIS section 8](../../v2/spikes/search/DIAGNOSIS.md#8-verbatim-fence-aware-snippets-d-search-7-2026-10-23-node-26-macos) |
| Search: code blocks whole in replies (bench 7) | n/a | 21 / 70 | **42 / 70** | n/a | same |
| Search: p50 / p95 ms on +1 MB | n/a | 3.0 / 7.7 | 4.3-4.6 / 11.2-11.8 | n/a | same |
| Saving M2, frozen eval `bench/m2` (Sonnet 5.5, n=3 per run) | n/a | not measured | main 90.15 / 90.12 / 90.12 / 90.48, mean **90.22**; heldout 98.59 | not measured | [m2/RESULT.md, du merge](../../v2/spikes/m2/RESULT.md) |
| Compaction recall, frozen eval `e2e/live/compact-hard` (Sonnet 5.5) | main 72.2% | not measured | main 100% (36/36); heldout 18/18 (round 4) | not measured | [compact/RESULT.md, du merge](../../v2/spikes/compact/RESULT.md) |
| Hook latency, Claude Code p95 (budget 40 ms) | no hook | not measured | 41 ms, **FAIL** by 1 ms | no hook (proxy) | [OPEN-ITEMS.md item 1](../../v2/OPEN-ITEMS.md), [TECH-SPEC.md section 1.1](../../v2/TECH-SPEC.md) |
| Install | n/a | per-agent steps: npm install, then a config entry and a hook file per agent | 2 commands: `npm i -g context-mode`, `context-mode setup` | set `ANTHROPIC_BASE_URL` to the gateway | [CLI-REPORT.md](../../v2/CLI-REPORT.md), [README rollback table](../../../README.md#upgrading-from-v1), [How we measured](../v1-v2-gateway/README.md#how-we-measured) |
| Issue coverage (351 issue and PR rows) | n/a | the source of the 351 rows | resolved+tested 171, resolved-untested 110, partly 7, not resolved 27, out of scope 36 | n/a | [ISSUE-COVERAGE.md](../../v2/ISSUE-COVERAGE.md) |
| Reliability: tests and CI | n/a | not measured | CI on macOS, Ubuntu, Windows × Node 24.15.0 and 26; `tests` 1366 pass, 0 fail, 2 skipped; e2e GP1-GP11 185 pass | not measured | [ci.yml](../../../.github/workflows/ci.yml), [ISSUE-COVERAGE.md](../../v2/ISSUE-COVERAGE.md#how-this-was-counted) |
| Reliability: database | n/a | not measured | `node:sqlite`, WAL; 4 writers on one DB, 0 busy errors, `integrity_check` ok | not measured | [OPEN-ITEMS.md](../../v2/OPEN-ITEMS.md), [GP8-concurrency](../../../e2e/cases/GP8-concurrency.e2e.mjs) |
| Privacy | nothing added | not measured | no telemetry, no LLM calls, data in a local `context.db` per project | requests go through the gateway server | [README Privacy](../../../README.md#privacy), [How we measured](../v1-v2-gateway/README.md#how-we-measured) |

Notes on the rows:

- The fixture bytes rows use the Totals table. The Overview table at the top of that page shows an older v2 tool figure (49.0 KB) from before D-SEARCH-7.
- The issue coverage counts use a name match between the map and the test files. The page explains how each status was counted.
- The install row for v1 comes from the v1 rollback steps in the README. We did not time a v1 install.

## Where v2 is not better

- **Short tasks cost more than no plugin.** v2 is +2.2% over six tasks (5 of 6 verdicts "same", grep "less") and +15.5% on the try-it prompts, with a "more" verdict on web-scrape ([v1-v2-gateway](../v1-v2-gateway/README.md), [try-it](../try-it/README.md)). The tool schemas and hooks add a fixed cost of about 2,000 tokens per session ([caveats](../README.md#honest-caveats)).
- **Task checks.** On try-it, v2 passed 18 of 20 against 20 of 20 for direct ([try-it/ab.json](../try-it/ab.json)).
- **Search returns more bytes than v1.** On fixtures Part 2, v2 returns 50,588 B against 11,099 B for v1 (4.6×). v2 finds hits for every row and keeps code blocks whole, so the reply is longer ([fixtures Part 2](../fixtures/README.md#part-2-ctx_index--ctx_search-knowledge-retrieval)).
- **Search is slower than v1.** p95 11.2-11.8 ms against 7.7 ms on +1 MB ([DIAGNOSIS section 8](../../v2/spikes/search/DIAGNOSIS.md#8-verbatim-fence-aware-snippets-d-search-7-2026-10-23-node-26-macos)).
- **Hook budget.** Claude Code hook p95 is 41 ms against 40 ms. A 64 KB PostToolUse p95 is 62 ms against 60 ms ([OPEN-ITEMS.md](../../v2/OPEN-ITEMS.md)).
- **Session tokens on large tasks.** In one run v2 used 19.6% more session tokens than off ([ab-final2.json](../data/ab-final2.json)); a later run shows 3.8% fewer ([Final A/B 3](../README.md#final-ab-3-after-the-replace-and-threshold-work)). Treat this as not settled.
- **Open issues.** 27 issue rows have no decision yet ([ISSUE-COVERAGE.md](../../v2/ISSUE-COVERAGE.md)).

## Context Mode Gateway: the upgrade path

v2 is free and runs on your machine. The Context Mode Gateway is the paid plan. It sits between the agent and the model API (the agent sets `ANTHROPIC_BASE_URL` to it) and works on every request, so it needs no plugin tool calls from the model.

What we measured:

- Six short tasks: **−24.5%** cost against direct over 88 pairs, cost less in 84 of 88, all task checks pass ([published file](../v1-v2-gateway/published/v3-opus55-short.json), [v1-v2-gateway/README.md](../v1-v2-gateway/README.md)).
- Try-it prompts: **−43.8%** over 20 pairs, cost less in 20 of 20 ([try-it/ab.json](../try-it/ab.json)).
- Loss: on try-it the gateway passed the task check in 15 of 20 sessions. On large-json it failed the record check in all 4 sessions ([try-it/README.md](../try-it/README.md)).
- Drift: 12 bridge pairs on today's client gave −10.6% in sum, against −24.5% published. Twelve pairs cannot confirm or reject the published rows ([bridge check](../v1-v2-gateway/README.md#bridge-check-is-the-2026-09-29-gateway-result-still-true-today)).

Use v2 for local, private context handling at no cost. Move to the gateway when per-request cost matters most.

## Sources

- [v1-v2-gateway/](../v1-v2-gateway/), [try-it/](../try-it/), [fixtures/](../fixtures/), [data/](../data/)
- [https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/spikes/search/DIAGNOSIS.md](../../v2/spikes/search/DIAGNOSIS.md)
- [https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/ISSUE-COVERAGE.md](../../v2/ISSUE-COVERAGE.md), [https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/OPEN-ITEMS.md](../../v2/OPEN-ITEMS.md), [https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/CLI-REPORT.md](../../v2/CLI-REPORT.md)
- [README Privacy](../../../README.md#privacy), [.github/workflows/ci.yml](../../../.github/workflows/ci.yml)
