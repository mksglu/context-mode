# Try-it prompts: plain vs OSS v1 vs OSS v2 vs live gateway, and the README claims: pre-registration

Written and pushed before the first measured cycle. Nothing below changes after the data. Written at 2026-10-22T10:51Z.
Method and evidence schema follow `bench/evidence/gateway/prereg.md` (same harness family, same
`analyze.mjs` method, `ab.json` schema `context-mode.benchmark-evidence/2`, 95% t interval at df = n - 1).

## What this run answers

1. On the six "try it" prompts of the README, what does one task cost, in tokens and list-price USD, in four arms:
   Claude Code alone (`plain`), OSS v1, OSS v2, and the live gateway?
2. Do the numbers printed in the README for v1 hold? Each claim is checked against the bytes v1 actually returned.

## Freeze

- Claude Code: the real binary, one version, read from `claude --version` at the start and the end. A change stops the run.
- Model: `claude-opus-5-5`, passed as `--model` on every session; read back from every assistant message.
- v1: OSS `origin/main` at `a92cf6a77ac02971fb5fafe2155e5ee229491884`, fresh clone, `npm install --omit=dev`,
  plugin dir = clone root.
- v2: OSS `origin/v2-design` at `7f320e1664577c5389f37d0fbd250f867ed69fcc` (parent of the commit that adds this file; this
  file changes no code). Fresh clone, `npm install --no-package-lock`, `node build/build.mjs --out release-out --sha
  7f320e1664577c5389f37d0fbd250f867ed69fcc`, plugin dir = `release-out`.
- gateway: the live deployed gateway, default tenant settings (the harness changes no flag and reads the flags back
  before and after each run), one new disposable tenant per prompt. Owner and customer tenants are refused.
  `ANTHROPIC_BASE_URL` points to the gateway for this arm only.
- Harness: the gateway repo worktree on local branch `bench/v1-v2-gw` (never pushed), arms `plain`, `v1`, `v2`,
  `gateway`. Every run record carries the harness commit.
- Price table (USD per million tokens, list price): claude-opus-5-5: input 4, output 20, cache read 0.20, cache write
  5 min 5, cache write 1 h 8; claude-haiku-4-5: input 1, output 5, cache read 0.10, cache write 5 min 1.25, 1 h 2. A
  call on a model not in the table stops the run (fail closed).

## Prompts (verbatim; the README text without its trailing ctx-stats sentence)

| id | prompt |
|---|---|
| repo-research | Research https://github.com/modelcontextprotocol/servers — architecture, tech stack, top contributors, open issues, and recent activity. |
| git-history | Clone https://github.com/facebook/react and analyze the last 500 commits: top contributors, commit frequency by month, and most changed files. |
| web-scrape | Fetch the Hacker News front page, extract all posts with titles, scores, and domains. Group by domain. |
| large-json | Create a local server that returns a 7.5 MB JSON with 20,000 records and a secret hidden at index 13000. Fetch the endpoint, find the hidden record, and show me exactly what's in it. |
| docs-search | Fetch the React useEffect docs, index them, and find the cleanup pattern with code examples. |
| session-continuity | Start a multi-step task: Create a REST API with Express — add routes, tests, and error handling. |

## Session command (every arm)

`claude -p <prompt> --model claude-opus-5-5 --output-format stream-json --verbose --max-turns 60 --permission-mode
bypassPermissions --max-budget-usd 3`; stdin closed (`</dev/null`); fresh `CLAUDE_CONFIG_DIR` per session seeded with
the login credential only; fresh empty cwd per session; isolation env as in the v1-v2-gateway prereg. 420 s timer is
raised to 900 s here because the prompts clone and fetch from the network; the same limit applies to every arm.
`plain` and the plugin arms use `--strict-mcp-config`; plugin arms declare only their own server.

## Cycles

- Prompts 1 to 5: 1 warm-up cycle (cycle 0, recorded, not counted) plus 4 measured cycles. One cycle runs all four
  arms back to back. Order rotated by cycle: cycle c starts at arm (c mod 4) of the list plain, v1, v2, gateway and
  wraps. Over cycles 1 to 4 each arm starts once.
- session-continuity: 2 cycles, no warm-up, **demonstration only**: no interval, no verdict, no claim.
- Sessions: 5 x 5 x 4 + 2 x 4 = 108. No cycles are added after seeing data.

## Oracles (read from the transcript, never from model prose alone)

- large-json: the harness plants the hidden record value in the served data; success = that exact value appears in
  the final answer text, whole, unmodified.
- git-history: success = the final answer names the top author that `git shortlog -sn` gives over the same 500
  commits. The harness computes it from a reference clone pinned at cycle start (last 500 commits ending at the pinned
  commit). A tie at the top accepts any tied author. If the live repo moved during a cycle, the record flags it.
- repo-research, web-scrape, docs-search: success = `end_turn`, at least one fetch or tool call, non-empty final
  answer. This is a completion check, not a quality check. No quality claim is made from it.
- session-continuity: completion check only, as above.

## Metrics per session

List-price cost (client arms: from the `result` event per-model usage; gateway arm: from the gateway per-call
record, hidden calls included, each call at its own model's price; a record with fewer tokens than the client saw in
any class makes the run invalid, `ops_below_client_tokens`, and it reruns once); tokens by class; tool_result bytes
seen by the model (sum over tool_result blocks in the transcript); tool call count and names; success by oracle;
turns, exit, timed_out, rate_limited. Claude Code's `total_cost_usd` is recorded beside the list price.

## README claim check (v1 only, against v1 bytes)

Claims on `origin/main` README, each compared with the v1 arm's measured tool_result bytes and tool call count for the
same prompt (median of the 4 measured cycles, with the range):

- repo-research: "5 calls, 62 KB context (raw: 986 KB, 94% saved)"
- git-history: "1 call, 5.6 KB context"
- web-scrape: "1 call, 3.2 KB context"
- large-json: "7.5 MB raw -> 0.9 KB context (99% saved)"
- docs-search: "2 calls, 1.8 KB context"
- session-continuity: "compaction recovery with full state" (not measurable in 2 cycles; reported as INCONCLUSIVE
  unless the transcript shows a compaction and a recovery)

Verdict per claim: HOLDS when the measured median is within 25% of the claimed number, DIFFERS otherwise, with both
numbers shown. "Raw" sizes need the unrouted size of the same data; where only plain bytes can give it, the plain
arm's tool_result bytes are used and stated. A link the run did not exercise is INCONCLUSIVE.

## Rules the harness enforces

- Arm resolution from the stream-json `init` event: `plain` has no MCP server and no `mcp__` tool; `v1`/`v2`
  expose exactly the declared plugin server, connected, with at least one tool of its prefix; `gateway` has no MCP
  server and the base URL set. Model, client version and credential checked as in the v1-v2-gateway prereg.
- Plugin revision (git HEAD, package version, dirty paths) recorded per run; a dirty tree stops the run.
- Routing is not forced; the share of runs with a plugin tool call is reported per arm.

## Voids

A run is void only when arm resolution fails; the cycle reruns once; a second failure leaves it void and n is stated.
Everything else counts: wrong answer, timeout, budget reached, 429 (flagged), crash. No outlier is dropped.

## Stop rule

The harness sums the list-price value of every session it starts. At $80 total it starts no new session; rows report
the cycles they have, with n stated. No cycle is added later.

## Analysis

Prompts 1 to 5, per prompt, on measured non-void cycles (failures included): each arm against `plain`, paired by
cycle, d = arm - plain; change % = 100 x mean(d) / mean(plain) with the 95% t interval at df = n - 1 (t = 3.182 at
n = 4); verdict less / more / same by the interval; median paired difference; cycles where the arm cost less; success
as k/n; mean cost and tokens per arm. Secondary: v2 against v1. n = 4 resolves only large differences; "same" is not
proof of parity.

## Expectation (stated before the data)

We expect the plugin arms to cut tool_result bytes on the data-heavy prompts (large-json, git-history, repo-research)
and to be near plain on cost for the short ones. We do not know if the README numbers hold; we publish either way.

## Claims we will not make

- No quality claim from the completion checks.
- No claim from session-continuity.
- No claim from a "same" verdict.
- No figure for other models or clients.

## Files written

`bench/evidence/try-it/runs/<prompt>.jsonl`, one line per session, pushed after every cycle (fields as in the
v1-v2-gateway prereg). Withheld: tenant ids, session ids, prompt and answer text, local paths, the gateway host,
credentials. Raw transcripts stay private. After the run: `analyze.mjs`, `ab.json`, `index.json`, `README.md`.

## Result

Written after the run, in `README.md` and `ab.json` in this folder. This file does not change.
