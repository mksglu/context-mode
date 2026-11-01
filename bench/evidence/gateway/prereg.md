# Opus 5.5 short tasks: direct vs OSS v1 vs OSS v2, beside the published gateway rows: pre-registration — 2026-10-21

Written and pushed before the first measured cycle. Nothing below changes after the data. Written at
2026-10-21T19:40Z.

## What this run answers

On the six short tasks of the published gateway benchmark, how much do the OSS plugin v1 and the OSS plugin v2 change
the cost of a task against Claude Code with no plugin, measured today? The gateway rows are not measured again: they
come unchanged from the published evidence. Each arm is compared only with its own direct baseline.

## Freeze

- Claude Code: the real binary (not the PATH shim), version 2.1.303. The harness reads `claude --version` at the start
  and at the end of the run. A different version at either end stops the run.
- Model: `claude-opus-5-5`, passed as `--model` on every session. The harness reads the model back from every
  assistant message.
- v1: OSS `origin/main` at `a92cf6a77ac02971fb5fafe2155e5ee229491884`, package version 1.0.169, in a fresh clone
  of its own (not any user checkout). Build: `npm install --omit=dev`. Plugin dir: the clone root (`start.mjs`).
- v2: OSS `origin/v2-design` at `8f38bdbca6d2be974d90492e683b1b3073f1b63c` (the parent of the commit that adds this
  file; this file changes no code). Fresh clone. Build: `npm install --no-package-lock`, then
  `node build/build.mjs --out release-out --sha 8f38bdbca6d2be974d90492e683b1b3073f1b63c`. Plugin dir: `release-out`.
  Later commits on `v2-design` (run files, docs) do not change the build: the harness builds from the frozen SHA.
- Workloads, fixtures, prompts and oracles: the gateway repo's `scripts/e2e/short-workloads.mjs` at gateway commit
  `408333a48d082830f5813b3f539ec03993830a89` (git blob `20b2adfb0c33c3e791a26dcd2f9c6d34ae216756`), used unchanged.
  This is the commit that produced the published rows.
- Harness: the gateway repo's `scripts/e2e/start-cost-ab.mjs` at the same commit (blob
  `28c85c27ee9a7b9b9bccd26e0811e7a908a8a7fe`; lib blob `2eb10abe89505953eb8a85a48f84df83e6b25189`), extended with arms
  `v1` and `v2` on a local branch that is never pushed. The extension is published as `bench/gateway-ab/harness.patch`
  in this repo before the first measured cycle. Every run record carries the harness commit.
- Price table (USD per million tokens, the table in the published evidence file, as of 2026-09-29, source
  https://www.anthropic.com/pricing):

  | Model | input | output | cache read | cache write 5 min | cache write 1 h |
  |---|---:|---:|---:|---:|---:|
  | claude-opus-5-5 | 4 | 20 | 0.20 | 5 | 8 |
  | claude-haiku-4-5 (alias claude-haiku-4-5-20251001) | 1 | 5 | 0.10 | 1.25 | 2 |

  A call on a model that is not in this table stops the run (fail closed).

## Published gateway rows (reused, not re-run)

Source: `/benchmarks/data/v3-opus55-short.json` (schema `context-mode.benchmark-evidence/2`, harness
`start-cost-ab`, gateway commit `408333a4`, Claude Code 2.1.283, `claude-opus-5-5`, date 2026-09-29; file SHA-256
`3298b1b2aa1af9b56abb4ecce660bb0c2ccb9ecc64de664557c03a7e6579cfce`). Pre-registration:
`/benchmarks/prereg/v3-opus55-short-prereg.md`. Cited per workload id, copied as published:

| Workload id | Pairs | Plain mean | Gateway mean | Change | 95% range | Verdict | Gateway wins | Success plain, gateway |
|---|---:|---:|---:|---:|---|---|---:|---|
| tests | 16 | $0.08731 | $0.06832 | −21.8% | −27.7 to −15.8 | less | 15 of 16 | 16/16, 16/16 |
| json | 12 | $0.08588 | $0.06751 | −21.4% | −29.9 to −12.9 | less | 12 of 12 | 12/12, 12/12 |
| log | 16 | $0.09089 | $0.07051 | −22.4% | −30.2 to −14.7 | less | 15 of 16 | 16/16, 16/16 |
| git | 16 | $0.07079 | $0.05296 | −25.2% | −33.9 to −16.5 | less | 15 of 16 | 16/16, 16/16 |
| grep | 16 | $0.09260 | $0.06599 | −28.7% | −34.1 to −23.4 | less | 16 of 16 | 16/16, 16/16 |
| edit | 12 | $0.07514 | $0.05422 | −27.8% | −42.2 to −13.5 | less | 11 of 12 | 12/12, 12/12 |

The page reads these numbers from the file, not from this table. If they differ, the file wins and the page says so.

## Arms

Same binary, same model, same task setup in every arm:

- `direct`: Claude Code alone. `--strict-mcp-config --mcp-config '{"mcpServers":{}}'`, no plugin.
- `v1`: `--plugin-dir <v1 dir>`, `--strict-mcp-config`, and an MCP map that declares only the plugin's own server,
  copied from v1's own manifest with the plugin root filled in.
- `v2`: the same as `v1`, with the v2 `release-out` dir and the server entry from v2's built manifest.

Common to every session (bridge sessions too): `claude -p <workload prompt> --model claude-opus-5-5
--output-format stream-json --verbose --max-turns 30 --permission-mode bypassPermissions --max-budget-usd 1.5`;
stdin closed (`</dev/null`); fresh `CLAUDE_CONFIG_DIR` per session, seeded with the login credential only; fresh
copy of the workload fixture per session as cwd; env `MAX_THINKING_TOKENS=0`, `ENABLE_CLAUDEAI_MCP_SERVERS=false`,
`CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`, `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1`; `CLAUDE_CODE_*`, `CLAUDECODE`, `ANTHROPIC_BASE_URL`
and `ANTHROPIC_CUSTOM_HEADERS` removed from the child env (except the gateway bridge arm, which sets the last two);
420 s harness timer (no `timeout(1)`).

Two settings differ from the 2026-09-29 run: `--max-budget-usd 1.5` and the three isolation env vars. Both apply to
every arm here, so the paired comparison is fair; they are listed as possible drift sources for the bridge check.

## Cycles

Workloads: `tests`, `json`, `log`, `git`, `grep`, `edit`.

Per workload: 1 warm-up cycle (cycle 0, recorded, not counted) and 8 measured cycles (cycles 1 to 8). One cycle runs
`direct`, `v1` and `v2` back to back. Order by cycle c: c mod 3 = 0: direct, v1, v2; = 1: v1, v2, direct; = 2: v2,
direct, v1. Over cycles 1 to 8 each order runs 3, 3 or 2 times; this imbalance is fixed now and stated. 6 workloads
x 9 cycles x 3 arms = 162 sessions. The six workloads run in parallel lanes, one lane per workload; inside a lane the
cycles run in order. No cycles are added after seeing data.

## Command (form)

```
# gateway-repo worktree, branch bench/v1-v2-gw (local only)
node scripts/e2e/start-cost-ab.mjs --model claude-opus-5-5 --arms direct,v1,v2 \
  --v1-dir <v1 clone> --v2-dir <v2 release-out> --only <workload> --n 8 --budget-usd 1.5 --cap 50 --out <file>
# rerun after an interruption: the same line with --resume <file>
```

Exact flag names are fixed by the harness patch, published before the first measured cycle. They do not change any
rule in this file.

## Rules the harness enforces

- Arm resolution is read from the stream-json `init` event of every session, never from model prose:
  - `direct`: no MCP server and no `mcp__` tool.
  - `v1` and `v2`: exactly the declared plugin server, status connected, and at least one tool with that server's
    prefix. Any other MCP server fails resolution. The tool names and count are recorded per run (v1 and v2 may expose
    different tool sets; neither count is fixed in advance).
  - Every assistant message's main model is `claude-opus-5-5` (helper calls on another model are allowed and priced
    at their own model's price).
  - Client version as frozen; the credential present (a session that reports $0.000000 with tokens counts as logged out).
  - The plugin revision (git HEAD, package version, dirty paths) recorded per run; a dirty plugin tree stops the run.
- Gate S0, per plugin version, before the first measured cycle: does `bypassPermissions` keep the plugin's
  PreToolUse hook active? Read from the transcript. The result is reported; it does not change the design.
- The tool-call names per run are recorded and the routing rate (share of runs with at least one plugin tool call) is
  published per arm. Routing is not forced.

## Voids

A run is void only when arm resolution fails (above). The reason is written in the record. The whole cycle runs once
more; a second resolution failure leaves the cycle void, and the row reports n below 8. Every other outcome counts as
measured, with its cost and its oracle result: a wrong answer, a timeout, the per-session budget reached, a 429, a
crash. A 429 is flagged `rate_limited` in the record. No outlier is dropped. Warm-up cycles and void attempts are
counted, kept in the private run folder and not in the analysis.

## Stop rule

The harness sums the list-price value of every session it starts (warm-up, void, measured, bridge). When the sum
reaches $50 it starts no new session. Rows then report the cycles they have, with n stated. No cycle is run later to
fill a gap.

## Cost basis

List price (table above) on the token counts Anthropic returned, per model, from the `result` event of each session
(per-model usage: input, output, cache read, cache write by lifetime). Cache writes whose lifetime the event does not
split are priced at the 1 hour rate, and the 5 minute figure is kept beside it as the low value. Claude Code's own
`total_cost_usd` is recorded beside it; a difference above 1% is flagged in the record, not corrected. v1 and v2 make
no model calls of their own (no Anthropic client in either source tree), so the client sees every call. The runs use a
claude.ai login: there is no per-token invoice, so the figures are a list-price equivalent. Gateway infrastructure
and local machine time are not in the cost.

## Analysis (fixed now)

For each workload, on every measured, non-void cycle (failures included):

- primary: `v1` against `direct` and `v2` against `direct`, paired by cycle. d = arm − direct per cycle. Change % =
  100 x mean(d) / mean(direct), with the 95% t interval 100 x (mean(d) ± t(0.975, n−1) x sd(d)/√n) / mean(direct)
  (t = 2.365 at n = 8). Verdict "less" when the whole interval is below zero, "more" when it is above zero, else "same";
- secondary, labelled as such: `v2` against `v1`, the same method;
- median paired difference; head-to-head: cycles where the arm cost less than `direct`;
- success per arm by the workload's oracle, as k/n;
- mean cost per arm per task, and per 1,000 tasks (mean direct − mean arm) x 1000 from unrounded means.

The gateway column shows the published row for the same workload id, against its own published plain arm. The page
states that the gateway rows are from 2026-09-29 on Claude Code 2.1.283 and the OSS rows are from 2026-10-21 or later on
Claude Code 2.1.303. The comparison across columns is "saving against each arm's own direct baseline", not dollars
across dates. All rows are shown: wins, losses and "same".

Power: with n = 8 pairs per row the interval resolves only large differences. A "same" verdict is not proof of parity.

## Bridge check (drift since 2026-09-29)

Per workload, 2 extra pairs of `plain` against `gateway` on today's client (12 pairs, 24 sessions), after the measured
cycles of that workload. Pair 1 runs plain first, pair 2 gateway first. Gateway arm: `ANTHROPIC_BASE_URL` set to the
deployed gateway, one new disposable tenant per workload, preflighted, with the admin key from the environment; owner
and customer tenants are refused. Default tenant settings: the harness changes no flag; it reads the flags back before
and after each run and records them. The deployed gateway version is read before and after each pair (version fields
only); a pair during which it changed is invalid and runs once more. Gateway cost: the gateway's per-call record for
the run's sessions, hidden calls included, each call at its own model's list price; a run whose record holds fewer
tokens than the client saw in any class is invalid (`ops_below_client_tokens`) and runs once more.

The bridge is reported as a drift check only: the two paired differences per workload, and whether each falls inside
the published 95% range. It has no verdict and is never merged into the published rows or the OSS rows.

## Expectation (stated before the data)

On these short tasks the plugin adds tool definitions to every request. The earlier 2026-10-21 quick A/B
(claude-sonnet-5-5, 3 runs per task) cost $0.747 for v1 and $0.687 for v2 against $0.534 with no plugin. We expect v1
to cost more than `direct` or the same, and v2 to cost the same or more. We publish the result either way.

## What would count against v1 or v2

A lower success rate than `direct` on any row; a "more" verdict on any row.

## Claims we will not make

- No dollar comparison across the gateway and OSS columns: different dates and client versions.
- No figure for other models, other clients or Codex.
- No byte or token-saving figure from this run as a headline: the measure is list-price cost per task.
- No claim of parity from a "same" verdict.
- No bridge number merged into a published row.

## Files written

- `bench/evidence/gateway/runs/<workload>.jsonl`, one line per session, pushed after every cycle: workload,
  cycle, arm, role (warm-up, measured, void, bridge), order, per-model token counts, usd, usd_client, success, turns,
  exit, timed_out, rate_limited, tool-call names and counts, init MCP servers and plugin tool names, model ids, client
  version, plugin revision, harness commit, void reason. Withheld: tenant ids, session ids, prompt and answer text,
  local paths, the gateway host, credentials.
- Raw transcripts stay in a private local folder and are not published.
- After the run: `analyze.mjs`, `ab.json` (schema `context-mode.benchmark-evidence/2`), `index.json` and `README.md`
  in this folder.

## Result

Written after the run, in `README.md` and `ab.json` in this folder. This file does not change.
