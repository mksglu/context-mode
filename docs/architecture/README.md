# context-mode v2 — entry point for implementers (status: ready for implementation, 2026-10-15)

This is the map. Start here, then follow the links.

## 1. Status

- v2 is ready for implementation. The owner accepted `DECISIONS-r3.md` in full ("doğru, tamamı ok") and delegated the r4 fixes in `DECISIONS-r4.md`. All 17 ADRs are Accepted (one, ADR-0016, is Accepted as a requirement; its mechanism stays Proposed until live checks LV8–LV10 pass).
- Three spikes are closed: S-NODE, S-TIMEOUT, and the ADR-0006 re-probe (`https://github.com/mksglu/context-mode/tree/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/spikes-r5/`).
- Five spikes stay open and gate specific milestones (§9 below).
- No work starts on `main`. `v2` work happens on its own branch named `v2`; `main` stays frozen until release (ADR-0011).

## 2. Doc map

| Doc | What it is |
|---|---|
| [`PRD-v2.md`](PRD-v2.md) | The product plan. |
| [`TECH-SPEC.md`](TECH-SPEC.md) | The build spec: test strategy, prompt delivery, tool names per agent, open spikes, decisions. |
| `adr/0001`–`0019` | One decision each. Table below. |
| [`docs/architecture/modules/`](impl/README.md) | Per-module implementation files for `src/`: exact paths, signatures, pseudocode, constants. Binding under ADR-0018. |
| [`review/DECISIONS-r3.md`](review/DECISIONS-r3.md) | Owner answers to the round-3 open questions (Q1–Q24). |
| [`review/DECISIONS-r4.md`](review/DECISIONS-r4.md) | Round-4 fixes, one row per root cause, merged from 4 reviewers. |
| `review/` (other files) | Round outputs: `REVIEW-r2/r3/r4a.md`, `BOTTLENECKS-r3/r4.md`, `ISSUE-OUTCOMES-r2/r3/r4.md`, `TEST-TRIAGE-r2.md`, `OWNER-QUESTIONS-r3/r4.md`, raw data under `review/out/`. |
| `https://github.com/mksglu/context-mode/tree/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/spikes-r5/` | Spike write-ups: `S-NODE.md`, `S-TIMEOUT.md`, `ADR-0006-reprobe.md`. |
| `review/agent-issue-intake/` | The issue form and the rules an AI agent must follow to file one (ADR-0014). Proposed, needs an explicit owner accept before it merges to `main`. |

### ADRs

| ADR | Summary | Status |
|---|---|---|
| 0001 | Claude Code is the reference contract; other agents adapt to it. | Accepted |
| 0002 | One `context.db` per project; git `release` branch for the Claude Code marketplace. The "no npm" rule is replaced by ADR-0019. | Accepted (GS7 amended) |
| 0003 | Three test layers: v1 KEEP-PASS unit tests, E2E-style GP1–GP11, E2E-live. | Accepted |
| 0004 | No per-agent routing files or skills; routing ships as MCP `instructions` + tool descriptions. | Accepted |
| 0005 | Prompt text follows plain, non-caps rules, checked by `lint.mjs`. | Accepted |
| 0006 | On Claude Code, `ctx_execute` loads up front; routing text carries the rest. | Accepted (after re-probe) |
| 0007 | Builds to MCP spec 2026-07-28; still serves older clients. | Accepted |
| 0008 | Enforcement keeps v1's deny rules; replaces the mechanisms that caused v1's bugs, including a Read deny (was hint-only). | Accepted (GS6 hook-budget number still open) |
| 0009 | State after compaction: a deterministic, budgeted pick from the session journal. | Accepted |
| 0010 | `ctx_doctor` and `ctx_upgrade` stay, rebuilt with one path per install mode. | Accepted |
| 0011 | Branch, release, and v1-to-v2 transition order. | Accepted for the order; some agent rows still open |
| 0012 | Live E2E runs keyless, in the owner's own logged-in Claude Code. | Accepted |
| 0013 | One `/release` command drives the whole release. | Accepted |
| 0014 | Issues only, no pull requests; `ctx_doctor` gives a typed debug report. | Accepted |
| 0015 | README outline and the file-deletion list for repo cleanup. | Accepted |
| 0016 | A subagent must never receive a large tool output either. | Accepted as a requirement; mechanism proposed |
| 0017 | An E2E case at every step, on `claude-sonnet-5 --effort low`; v1 users keep a working setup through the switch. | Accepted |
| 0018 | One architecture contract (`docs/architecture/modules/00-architecture.md`), one file per module; implementers follow `docs/architecture/modules/` file by file. | Accepted |
| 0019 | One interactive `context-mode setup`; npm (`context-mode`, dist-tag `next`) is the user channel; the git `release` branch stays for the Claude Code marketplace. | Accepted |
| 0025 | Stored source enters the `ctx_execute` sandbox (#1325); the open 2.1.4 blockers (#1321, #1322, #1323, #1324) and Copilot host audit rows ship in one patch. ADR and PRD in one file. | Proposed |

## 2a. Glossary

GS = global success gate (TECH-SPEC §1). G = gap row (TECH-SPEC §9). Q = DECISIONS-r3 question. D = DECISIONS-r6 decision. R = DECISIONS-r7/r9 row. GP = golden-path E2E case (TECH-SPEC §5). LV = live check. T = test spec.

GS6 = hook budget: `HOOK_P95_MS` 40, `HOOK_CPU_OVER_NODE_MS` 20, `HOOK_COMBINED_P95_MS` 60.

## 3. Agents (10)

Claude Code, Codex CLI, Gemini CLI, Qwen Code, Copilot CLI, VS Code Copilot, Kiro, ZCode, Pi, OpenCode 2.

## 4. Tools (9) and skills (3)

| Tool | Job |
|---|---|
| `ctx_execute` | Run shell, PowerShell, JS/TS or Python in the sandbox; absorbs `execute_file`. |
| `ctx_batch` | Run several commands and a follow-up search in one call. |
| `ctx_index` | Store content in the FTS5 store; absorbs `fetch_and_index`. |
| `ctx_search` | Query the stored content. |
| `ctx_resume` | Fetch one stored row by its key, whole. |
| `ctx_stats` | Show usage numbers. |
| `ctx_doctor` | Read-only health report, one row per check. |
| `ctx_upgrade` | Update the install; also runs uninstall. |
| `ctx_purge` | Clear stored data by scope. |

Skills (user commands only, no routing text, `disable-model-invocation: true`): `/ctx-stats`, `/ctx-doctor`, `/ctx-upgrade`.

## 5. Key numbers

| Name | Value | Source |
|---|---|---|
| Minimum Node | 24.15.0 | S-NODE spike, ADR-0002 |
| `ctx_execute` default and max timeout | 600,000 ms | S-TIMEOUT spike, TECH-SPEC §10 Q8 |
| Global output cap (`OUTPUT_CAP`) | 16,384 B | DECISIONS-r3 Q2, ADR-0008, ADR-0016 |
| Compaction-state budget | 2,048 B (separate from `OUTPUT_CAP`) | ADR-0009 |
| `ctx_doctor` report cap | 4,096 B | ADR-0014 |
| `ctx_resume` cap | 2 KB | ADR-0009 |
| Storage | One `context.db` per project (git common dir hash), node:sqlite, WAL | ADR-0002 |
| Hook budget | 40 ms wall, measured in CI (G26). The command-hook CPU sub-budget (GS6) is still open | TECH-SPEC §7, ADR-0008 "Open" |
| Tool description cap | 1,024 chars each; instructions ≤ 2,048 chars; descriptions + schemas ≤ 8,000 chars | ADR-0005 |
| Cross-session rank fusion | RRF, k = 60; current session first, then RRF, then `seq` ascending. Measured: recall@5 0.48 vs v1's 0.27 (90 real queries). No MMR: no gain over RRF | DECISIONS-r6 D4; DECISIONS-r7 R1, R2 |
| `sort:"timeline"` page cursor | `after` (opaque seq); `offset` is relevance-only | DECISIONS-r6 D2 |
| `decision` row trigger | `AskUserQuestion` answer, or an option echo next turn — never message shape | DECISIONS-r6 D3 |
| v1 extracted `category` values | 19, not 26 (the "26" was uncounted commit text) | DECISIONS-r6 D5 |
| `compactSummary` (`adapters/table.ts`) | `"host"` or `"none"`, per agent. Claude Code = `"host"`: one pointer line, no state block. Every other agent = `"none"`: the 2,048 B D1 block, until LV-COMPACT (M3) flips its row | DECISIONS-r6 D6 |

## 5a. v1 memory → v2

| v1 | v2 | Why |
|---|---|---|
| Resume snapshot, no real cap (up to ~196 KB) | Hard 2,048 B block; big rows become `ctx_resume(seq)` pointers | #1022, #1173; DECISIONS-r6 D1 |
| Priority-based eviction | Append-only journal; nothing evicted before read | #902 |
| Auto-injected `role`/`rule`/`intent`/`constraint`/`goal` memory, re-sent every turn | No injected memory; not extracted | #856, #1263 |
| `decision` from message shape (comma, 15–500 chars) | Only `AskUserQuestion` answers and option echoes; `ctx_search(source:"decision")` | #535, #856; DECISIONS-r6 D3 |
| 17 other extracted categories (`file`, `git`, `error`, `task`, `env`, …) | Journal kinds (`edit`, `cmd`, `toolerr`, `prompt`, `index`) keep the facts; category labels are gone | DECISIONS-r6 D5 |
| Cross-project timeline/memory | Scoped to the current project; use `scope:"global"` + `sort:"relevance"` for other projects | #663, #664, #1214 |
| `sort:"timeline"`, no paging | Kept; adds the `after` cursor | DECISIONS-r6 D2 |
| Memory role tag `user` (Pi) | System/tool role only | #1263 |

v1 rows are not migrated into v2 categories. v2 users are not asked to give up v1: each agent keeps a rollback command (§6, PRD §14) through the switch.

## 6. Running the keyless E2E-live harness

No API key is ever used (ADR-0012).

```
node e2e/live/run.mjs                 # step mode: only cases whose "covers" list touches your changed files
node e2e/live/run.mjs --all           # the full case set — run this before a release
node e2e/live/run.mjs --model claude-sonnet-5 --effort low --budget 0.25   # defaults shown; override if needed
```

- Default model is `claude-sonnet-5`, effort `low` — the lowest-cost setting (ADR-0017).
- Step mode compares against `--base HEAD` by default; pass `--base <ref>` to diff against another ref.
- Agents not installed or not logged in print `SKIPPED` with a reason; this is expected, not a failure.
- `/release` runs `--all` before it starts the release workflow, and refuses to start after 3 skipped live runs in a row.

## 7. Open spikes

| Spike | Question | Milestone |
|---|---|---|
| S-COPILOT | Does Copilot CLI pass `instructions` to the model? | M2 |
| S-ZCODE | Same question on ZCode. | M2/M3 |
| S-NAMES | Exact MCP tool names on Copilot CLI, Kiro, ZCode. | M3 |
| S-SKILLS | Which agents expose a skill as a `/` command. | M2 |
| S-CODEX | Are Codex's MCP tools deferred, and when does the model see them? | M0 (gates GP-LIVE-ROUTING for all 10 agents) |
| G25 | Do hooks fire for MCP tools on Copilot CLI, ZCode, Pi and OpenCode 2? | Starts M0, closes M3, gates release |

S-NODE, S-TIMEOUT and the ADR-0006 re-probe are closed; see `https://github.com/mksglu/context-mode/tree/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/spikes-r5/`.

## Changes

- 2026-10-16 (r9, `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/review/DECISIONS-r9.md`, S8): §1 names the v2 code branch `v2` (G1); new §2a glossary for GS/G/Q/D/R/GP/LV/T and the GS6 hook-budget numbers (G4).
- 2026-10-16 (r6, `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/review/DECISIONS-r6.md`): §5 gains the RRF, timeline-cursor and decision-trigger rows and the corrected v1 category count (19, not 26); new §5a table maps each v1 memory feature to its v2 replacement.
- 2026-10-16 (r7, `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/review/DECISIONS-r7.md`): §5 RRF row gains the measured recall@5 numbers (0.48 vs v1's 0.27) and states that MMR gave no gain.
- 2026-10-16 (r8, `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/review/DECISIONS-r8.md`): ADR-0008 row now reads "replaces the mechanisms that caused v1's bugs, including a Read deny (was hint-only)"; deny rules now stop 87.64% of large-output bytes, up from 0.11%.
