# context-mode — launch notes

## The problem

AI coding agents lose time and money on three things:

1. **Context fills up.** A tool call can return tens of KB of raw text (logs,
   docs, search results). That text eats the agent's context window, so it
   has less room to think.
2. **Work is lost after compaction.** When an agent's context is cut down,
   earlier tool output and decisions can disappear.
3. **Cost.** Every token in context costs money and time, on every turn,
   not just once.

context-mode is an MCP server plus hooks that keeps large tool output out
of the agent's context, stores it, and lets the agent search it back on
demand.

## Who it is for

Teams and solo builders who run AI coding agents (Claude Code, Codex CLI,
Gemini CLI, Qwen Code, Copilot CLI, VS Code Copilot, Kiro, ZCode, Pi,
OpenCode 2) on real codebases, where tool output is large: logs, test
runs, search results, docs.

## Business value

- Aims at less tool output in context per turn. Measured so far: the model reads
  84% fewer tool_result bytes on large-output tasks (734.5 vs 4,694.5 median), and a
  60 KB output shows as 190 chars. Session tokens are not lower yet: v2 uses more
  tokens than no plugin on small and on large tasks (see "Measured numbers").
- No text is thrown away: output is indexed, not deleted, so the agent can
  always search back for the exact bytes it needs.
- One shared store per project, so work survives a context compaction.

## 10 supported agents (v2.0 scope)

| Agent | Install mode |
|---|---|
| Claude Code | marketplace plugin (works after the owner-only ADR-0011 step b: `marketplace.json` source -> github ref `release` on `main`; until then `claude mcp add`) |
| Codex CLI | `config.toml` MCP entry |
| Gemini CLI | extension |
| Qwen Code | extension |
| Copilot CLI | plugin |
| VS Code Copilot | MCP entry |
| Kiro | MCP entry |
| ZCode | hooks + MCP |
| Pi | in-process plugin |
| OpenCode 2 | in-process plugin |

Source: `PRD-v2.md` §3, `docs/v2/TECH-SPEC.md` §2.

## What is new in v2 vs v1

| Area | v1 | v2 |
|---|---|---|
| Fallback paths | Each adapter had its own runtime fallback for host differences | One path per feature; no fallback chains (PRD P1) |
| Agents | Grew ad hoc, adapter by adapter | Fixed scope of 10 agents, same code path on each (PRD P2) |
| Hooks | Could touch DB or network | Hooks are pure: no DB, no network, no spawn (PRD P4) |
| Idle cost | Timers and boot-time probes ran in the background | Idle server uses 0% CPU: no scanning timers, no boot probes (PRD P5) |
| Tests | Tests written after code, case by case | Every case gets a green end-to-end test before its code (PRD P6) |
| Issue backlog | 357 open issues/PRs, no single outcome per item | Every issue given one explicit outcome: 159 closed-by-design, 111 covered-by-test, 55 wont-fix, 2 merged, 1 unverified pending a release decision (329 deduplicated rows, source: `docs/v2/review/ISSUE-OUTCOMES-r4.md` via `PRD-v2.md` §1) |

## Measured numbers

Only measured numbers, each with its source, date and agent version. The old
v1 savings figures (from the removed `BENCHMARK.md`) are gone: no
file in this repo measures them now.

| Number | Value | Source, date, agent |
|---|---|---|
| Large output, what the model saw | full output 8,893 / 19,998 / 28,003 / 60,090 bytes; model saw 152 / 187 / 182 / 190 chars; answer correct 16 of 16 (4 sizes x git and non-git cwd x 2), no error | `docs/v2/benchmarks.md` "Replace live proof (final)", v2-design `980272a5`, 2026-10-21, Claude Code 2.1.303, claude-sonnet-5-5 low |
| Final A/B, large tasks: median tool_result bytes | off 4,694.5; v1 2,436.5; v2 734.5 (36 sessions: multi-1, big-tests, big-json, json-1; 3 runs x 3 arms) | `bench/live/results/ab-final2.json`, `docs/v2/benchmarks.md`, 2026-10-21, claude-sonnet-5-5 low |
| Final A/B, large tasks: median session tokens | off 55,897; v1 65,599; v2 60,390; v2 -19.6 % vs off, -2.7 % vs v1; pass 12/12 per arm; cost 0.607 / 0.754 / 0.391 USD | same |
| Final A/B, small tasks: median session tokens | off 36,184; v1 42,493; v2 38,210; v2 -5.7 % vs off, +10.2 % vs v1; pass 15/15 per arm; median tool_result bytes 31 / 31 / 8; cost 0.330 / 0.537 / 0.359 USD (45 sessions, log-1 json-1 tests-1 file-1 git-1) | same |
| Final A/B, per task tokens (off / v1 / v2) | big-tests 53,104 / 59,478 / 38,359; multi-1 108,290 / 125,342 / 140,110; big-json 56,707 / 66,559 / 98,955 | same |
| Saving score, median of 3 runs | M1 94.21, M2 87.23; target 90 (M1 met, M2 not met); `guardsOk` false in all 3 runs (only the gate guard failed: layer `check-removed`); lock hashes match | `bench/saving-score.mjs`, v2-design `980272a5`, 2026-10-21; `docs/v2/benchmarks.md` "Saving loop" |
| Final A/B total cost, all 81 sessions | 2.68 USD (list price, estimate) | `bench/live/results/ab-final2.json`, 2026-10-21 |
| Offline replay (old policy with hints): bytes v2 would return vs bytes the model got | 1.1% saving; -1.5% with the re-run bound (23175 tool calls, 820 sessions) | `docs/v2/benchmarks.md`, 2026-10-19, Claude Code transcripts mostly 2.1.149 to 2.1.283, Node v26.8.1 |
| Earlier live A/B (20 tasks x 3 runs, before the replace changes), session input saving (median, min, max) | -6.7%, -6.9%, +29.7%; pass on 60/60, off 60/60 | `docs/v2/benchmarks.md`, 2026-10-19, Claude Code 2.1.303 |
| Live routing, run 4 (new rule) | under 0/20 on all 3 models; over 0/20 opus-5-5, 0/20 sonnet-5-5, 1/20 haiku-5-5; correct 40/40 each | `docs/v2/prompt/results.md`, 2026-10-19, Claude Code 2.1.303 |
| Memory live cases | 4/4 PASS; fixture R2 recall@5 1.000 on 6 queries (smoke gate, not an estimate); model spend 0.0510 USD | `docs/v2/benchmarks.md` "Memory", 2026-10-21, claude-sonnet-5-5 low |
| Memory, stored real-data run (not re-run) | R2 recall@5 0.743, MRR 0.671 (148 queries); decision recall@5 0.744 (39 queries); timeline 43/47 | `tickets/memory-retrieval/eval/results.md` via `docs/v2/benchmarks.md` |
| Compaction pointer, `T-CMP` | correct 7/10 in every arm a to e; `ctx_resume`/`ctx_search` call rate 0/10; 0 bytes returned in 50 sessions; total 4.5222 USD | `docs/v2/benchmarks.md` "Compaction pointer", 2026-10-21, Sonnet 5.5 low |
| Claude Code hook p95 (GS6) | 41 ms; budget `HOOK_P95_MS` 40 ms: FAIL | `docs/v2/TECH-SPEC.md` §1.1, 2026-10-20, macOS, Node 26 |
| 64 KB PostToolUse hook p95 (`T-F1` Case B) | 62 ms; budget `HOOK_COMBINED_P95_MS` 60 ms: FAIL | same |
| v2 issue backlog resolved | 329 deduplicated rows (from 357 open issues/PRs), one outcome each | `PRD-v2.md` §1, `docs/v2/review/ISSUE-OUTCOMES-r4.md` |

What these runs show: v2 cuts the bytes the model reads when the output is large
(median tool_result bytes 734.5 against 4,694.5 with no plugin; a 60 KB output became
190 chars and the answer stayed right in 16 of 16 runs). It does not yet cut session
tokens. On small tasks the plugin adds a fixed prompt cost (about +2.0k tokens for v2,
+6.3k for v1), so v2 uses 5.7 % more tokens than no plugin there. On large tasks the
median is 19.6 % more, because multi-1 (+29 %) and big-json (+74 %) need extra turns for
`ctx_*` calls; big-tests saves 28 %. Those two tasks are not tuned yet. v2 uses fewer
tokens than v1 on small tasks (+10.2 %) and 2.7 % more on large ones.
Caveats: n=3 per cell, one model, one date, list-price cost. Full caveats are in
`docs/v2/benchmarks.md`. More hook numbers: `docs/performance.md`.

## Claims we do not make

- We do not claim v2 saves session tokens. The final A/B (2026-10-21) shows
  -5.7% on small tasks and -19.6% on large tasks against no plugin (v2 used
  more); only big-tests saved tokens (28%). What v2 cuts is the bytes the model
  reads from large output (`docs/v2/benchmarks.md`).
- We do not claim the saving score reached its target. M2 is 87.23 (median of 3
  runs) against 90, and `guardsOk` was false in all 3 runs.
- We do not claim the compaction pointer works. In `T-CMP` the model never
  called `ctx_resume` or `ctx_search` from it (0/10 in every arm).
- We do not claim v2 meets its hook latency budget. GS6 is FAIL
  (`docs/v2/TECH-SPEC.md` §1.1).
- We do not claim v2 has confirmed that Copilot CLI's MCP `instructions` field
  reaches the model. ADR-0004 records a live probe on Copilot CLI 1.0.60 with
  v1; no v2 build has run that check yet.
- We do not claim any install command works yet. Every row of the
  `README.md` install table says "see guide", because no agent has passed a
  live install test (`docs/install/README.md`).
- We do not claim zero data loss as a design choice: the design bans
  truncation and cutting a reply mid-item as a *reduction mechanism*
  (`docs/v2/impl/DEVIATIONS.md`, D-M2-T5-1, D-M2-T10-6); we do not claim
  this has been proven for every code path yet, only for the ones listed
  in `DEVIATIONS.md`.
- We do not claim `context-mode setup` has passed a live test on every
  agent. The CLI exists (ADR-0019, `docs/v2/CLI-REPORT.md`) and its offline
  and clean-HOME tests pass; the npm package is not published yet
  (`NPM-OWNER-STEPS.md`).

## Short copy for a release post

**context-mode v2 keeps large tool output out of your AI agent's context.**
Logs, search results, and docs get stored and indexed instead of filling
the context window. Your agent searches back for the exact text it needs,
on any of 10 supported agents, with one code path and no fallback chains.

## Release state (2026-10-23)

- Rehearsed three times on `release-staging` and `release` (`docs/v2/review/RELEASE-REHEARSAL-2026-10-21.md`). No tag, no GitHub Release, no npm publish has happened.
- `release.yml` has the job `publish-npm` (ADR-0019 D2). It needs the owner steps in `NPM-OWNER-STEPS.md` first.
- npm dist-tag plan: v2 goes out as `next`; `latest` stays on v1 until the owner moves it.

## Before the first real release

Two owner steps. Neither touches a rehearsal branch by hand.

1. A `release` branch from the rehearsal (2026-10-21) may still exist on GitHub. Leave it. `plan.mjs` takes the last release from the newest annotated `v2+` tag pushed to `origin`, not from the branch head. A `release` or `release-staging` commit with no pushed tag is a rehearsal: `plan.mjs` plans `2.0.0` over all history, and `publish.mjs --promote` replaces that branch with the staged commit. Promote still refuses to drop any tagged release (D-FU-RF-1).
2. `release.yml` can only be dispatched from `main`: GitHub lists a `workflow_dispatch` workflow only if the file is on the default branch. It is not on `main` yet. The owner step is: land `.github/workflows/release.yml` on `main` together with the v2 merge, then run `/release` (it calls `gh workflow run release`). Until that merge, run the same scripts locally, in this order, as in the rehearsal:

        node scripts/release/plan.mjs --dry-run
        node build/build.mjs --out release-out --sha <sha> --version <version>
        node scripts/release/publish.mjs --stage --version <version> --source-commit <sha>
        node scripts/release/smoke.mjs --ref release-staging --agent claude-code
        node scripts/release/smoke.mjs --ref release-staging --agent codex
        node scripts/release/publish.mjs --promote --version <version> --notes "<notes>"

`smoke.mjs` needs the real `claude` binary on `PATH` (a native file, not a shim script). It prints `no real claude binary on PATH` if none is found.
