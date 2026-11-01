# context-mode v2: Technical Specification (golden state)

- Status: Ready for implementation r3, 2026-10-15. Replaces DRAFT r2 (2026-10-14); the final "Changes" section lists what changed, round by round.
- Decisions: `docs/architecture/README.md` · ADRs: `docs/architecture/adr/0001`–`0017` · Review: `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/review/DECISIONS-r3.md`, `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/review/DECISIONS-r4.md` · Prompt texts: `docs/architecture/prompt-drafts.md` · Prompt lint: `build/prompt-lint.mjs`
- Tags:
  - **[V]** verified; the source is cited next to it
  - **[U]** unverified; it must be checked before the milestone named next to it
  - **[D]** decided by the user
  - **[P]** proposed, waiting for the user (§10)

## 0. Sources this document is measured against

| Source | Version | How it was read |
|---|---|---|
| context-mode v1 | `origin/main` @ `5869f4fa` (2026-10-13). Its `tests/` is identical to clone `1a1bed13`; the only diff is `stats.json` | git tree; a live `initialize` + `tools/list` against `server.bundle.mjs` from that tree |
| Issues and PRs | snapshots `https://github.com/mksglu/context-mode/tree/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/data/*.json`, last one 2026-10-14 01:59 +03: 590 issues and 659 PRs in all states; 174 + 183 = 357 open, which equals the frozen `open_issues_count` | `gh`. Issues and PRs were disabled afterwards, so the API now returns "disabled" |
| Gemini CLI | `51617c1` (2026-10-12) | local clone |
| Qwen Code | `18f80f5` (2026-10-12) | local clone |
| OpenCode | `1438073` (2026-10-12) | local clone |
| Pi | `7bd01fb` (2026-10-12) | local clone |
| Codex | default branch, 2026-10-14 | GitHub API (no commit pinned) |
| Codex CLI | 0.156.1 | live probe |
| VS Code | default branch, 2026-10-14 | GitHub API |
| Claude Code | 2.1.283 | live probes; docs `code.claude.com/docs/en/mcp.md` fetched 2026-10-14 |
| Prompting guide | "Prompting best practices", platform.claude.com, fetched 2026-10-14 | — |
| MCP spec | **2026-07-28** (latest; server target, ADR-0007), clients today send `initialize` at 2025-06-18 (Codex) / 2025-11-25 (Claude Code) | modelcontextprotocol/modelcontextprotocol `schema/*/schema.ts` |

## 1. Golden state: exit criteria

v2.0.0 is released only when **all** of these hold. Each one is checked by a machine.

| ID | Criterion | Check |
|---|---|---|
| GS1 | GP1–GP11 pass on macOS, Linux and Windows | per-PR CI (§6.6) |
| GS2 | GP-LIVE-ROUTING passes its thresholds (§6.5) on the 6 required agents (§6.9); tier-2 agents pass or carry a written reason; VS Code passes the contract E2E | RC job |
| GS3 | G25 is answered: do hooks fire for MCP tools on Copilot CLI, ZCode, Pi and OpenCode 2 (GP-LIVE-HOOKS) | release job |
| GS4 | v1 tests stay: every KEEP-PASS test in `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/review/TEST-TRIAGE-r2.md` (131) passes on v2; every ledger row has a verdict; no file under `e2e/` imports `src/` | CI lint + ledger script |
| GS5 | The repo has no SKILL.md other than the 3 command skills and `.claude/skills/release`, no removed-agent path (§3.10) and no `AGENTS.md`, `GEMINI.md`, `QWEN.md`, `CLAUDE.md`, `SYSTEM.md` or `copilot-instructions.md`; `lint.mjs` passes on the built `initialize` + `tools/list` | GP2 |
| GS6 | Claude Code (mcp_tool hook): p95 ≤ 40 ms wall (`HOOK_P95_MS`). Command-hook agents: ≤ 20 ms CPU on top of bare Node (`HOOK_CPU_OVER_NODE_MS`; bare Node alone is 45.6 ms p95 on the owner's Mac). Per agent, combined wall-clock (spawn + hook body) stays ≤ 60 ms p95 (`HOOK_COMBINED_P95_MS`). Decided, not open (DECISIONS-r9 V14; test spec T-GS6, `14-tests.md` §6). Amended by ADR-0019 D3 (2026-10-22): the CI gate is hook overhead (hook wall minus bare `node -e ''` wall) p95 <= 15 ms, `e2e/checks/setup-hook-overhead.mjs`; the wall numbers are reported, not gated. The 41 ms and 62 ms results below stay open items (`OPEN-ITEMS.md` 1, 2) | GP3 bench |
| GS9 | Server passes GP1/GP2 as a 2026-07-28 stateless server (`server/discover`) and as a 2025-06-18 / 2025-11-25 `initialize` server, with identical bytes (ADR-0007) | per-PR CI |
| GS7 | Install from the npm package (`npm i -g context-mode && context-mode setup`) or from git `#release` (Claude Code marketplace); no npm install at runtime (ADR-0019 D1, D2) | GP1 |
| GS10 | v1 retention gates R1–R8 of ADR-0017 pass, incl. the v1-migration live case set | release |
| GS11 | Every implementation step has a green E2E case (ADR-0017) | CI + harness report |
| GS8 | Every item in `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/v2-not-closed.md` has an outcome: decided, closed as covered, or closed as won't-fix | review |

### 1.1 M7 sign-off status (2026-10-20, M7-S4)

Measured on `origin/v2-design` after D-M7-gate-1, D-M7-gate-2, D-M7-FT-1 and D-M7-FT-2 (macOS, Node 26, one machine, other load not checked). `gate.mjs --milestone M7`: 3 of 3 runs PASS in every layer (keep-pass 131/131, v2-unit pass 1062, fail 0, skip 2, ci-checks, gp-cases, prompt-lint, check-removed). The 2 skips are named: "GP3 copilot-cli MCP-firing sub-case" (waits for S-NAMES) and the win32-only grandchild check; they were skipped, not failed. The gate live step ran 0/31 cases and prints SKIP with a reason, so it checked no live case. Live cases ran once each through `e2e/live/run.mjs --only`: `T-GS6` FAIL, `T-F1` FAIL.

| ID | Status | Evidence |
|---|---|---|
| GS1 | PASS | gp-cases layer exit 0 (macOS); last CI run 39254594458 6/6 green |
| GS2 | PENDING release | RC job. GP-LIVE-ROUTING new rule (D-M7-RT-1), live run 4, 20 large + 20 small per model: under 0, over 0 on opus-5-5 and sonnet-5-5, over 1 on haiku-5-5, correct 40/40 on all three; largest native bytes in a large run 1521 (limit 2048) |
| GS3 | PENDING release | live `g25-mcp-hooks` prints SKIPPED (release job) |
| GS4 | PASS | keep-pass 131/131; `ci-gs4-lint.mjs` exit 0 |
| GS5 | PASS | prompt-lint PASS; `check-removed.mjs` exit 0 |
| GS6 | FAIL | `T-GS6` (n=200): cc p95 41 ms > `HOOK_P95_MS` 40; command hooks wall p95 43 ms ok, CPU over Node 20 ms ok. `T-F1` Case B 65536 B PostToolUse wall p95 62 ms > `HOOK_COMBINED_P95_MS` 60 (live run). `bench/hook-index.mjs` (50 runs x 3, loadavg 4.8 to 5.6): 64 KB p95 50.5 to 55.0 ms (before 58.4 to 82.7); 1 MiB p95 113.8 to 120.8 ms (before 150.0 to 154.7); live 1 MiB check 134 ms. Bare node p95 31 to 33 ms. Every miss is 1 to 2 ms at 64 KB and 41 ms; 1 MiB is 2x over. D-M7-FT-1, D-M7-FT-2 |
| GS7 | PASS | GP1 in gp-cases |
| GS9 | PASS | GP1/GP2 in gp-cases; prompt-lint GS9 OK |
| GS10 | R1, R2: PENDING owner (D-M7-arch-5); R3 to R8: PASS | `check-removed.mjs` exit 0; 6/6 v1-migration live cases (last full run) |
| GS11 | FAIL | DECISIONS-r11 (2026-10-21): the T-CMP call-rate gate measured the pull design and is retired; GS11 = correctness >= 0.80 in the arm with the shipped policy (anchored block + turn-boundary recall) plus the injected-bytes median, reported. Not re-run live for r11 yet. Earlier: (T-CMP not re-run in M7-S4; the first set of numbers is from M7-S3, the clean re-measure is below) `ci-config` now PASS (D-M7-CI-3, `timeout-minutes: 20`). `T-CMP` FAIL on Sonnet 5.5 low (10 sessions per arm a to e): arm a correct 7/10 < 0.80, call rate 0/10 < 0.70; Opus 5.5 low arm a correct 4/10, call rate 0/10. 0 bytes returned from `ctx_resume`/`ctx_search` in all 60 sessions. Arm d 7/10 < 0.70 gate is not met either. Cost 8.1365 USD. claude-code `compactSummary` stays `none` (D-M7-CL-1, D-M7-CL-2). T-CMP clean re-measure 2026-10-21 (Sonnet 5.5 low, clean isolation, 10 sessions per arm, all arms a to e, 50 sessions): correct 7/10 in every arm; `ctx_resume`/`ctx_search` call rate 0/10 in every arm; bytes returned 0 in all 50 sessions; cost per arm a 0.8682, b 0.9114, c 0.9014, d 0.8898, e 0.9514 USD, total 4.5222 USD; `resume_seq` 50/50; 0 of 50 sessions touched host memory; all 15 misses are fixture session-03 (case-sensitive exactMatch). Arm a still FAIL (< 0.80, < 0.70); arm d 0.70 meets its gate. Detail: `bench/RESULTS.md` "Compaction pointer". |
| GS8 | not measured | review |

M2 round 2 (2026-10-24, v2-design 18e4a6cd, `bench/m2/eval.mjs`, claude-sonnet-5-5 low, n=3): main M2 87.6 -> 92.5, heldout 96.52 -> 97.44, every oracle passed; opus-5-5 main 92.53. Changes: shape digest (D-M2-SHAPE-1/2), MCP and Grep content replace (D-M2-MCP-1), categorical one-off rows (D-M2-MCP-2). Details: `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/spikes/m2/RESULT.md`.

Saving score and live proof on `980272a5` (2026-10-21, Claude Code 2.1.303, claude-sonnet-5-5 low, keyless): median of 3 runs M1 94.21, M2 87.23 (runs 89.32, 85.83, 87.23); target 90, M2 not met; `guardsOk` false in all 3 runs because the gate guard failed (layer `check-removed`), while the success, small-output and token guards passed; lock hashes match `bench/saving-score.lock`. Final A/B (81 sessions, all pass): large tasks median tool_result bytes off 4,694.5, v1 2,436.5, v2 734.5, median session tokens off 55,897, v1 65,599, v2 60,390; small tasks median session tokens off 36,184, v1 42,493, v2 38,210. Live proof: outputs of 8,893 to 60,090 bytes reached the model as 152 to 190 chars, answer correct 16 of 16. Detail: `bench/RESULTS.md`.

M7 is not done. Open items are listed in `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/.impl/BLOCKED-M7.md`. R1, R2 stay PENDING owner.

## 2. Scope

- **[D] Agents (10):** Claude Code, Codex CLI, Gemini CLI, Qwen Code, Copilot CLI, VS Code Copilot, Kiro, ZCode, Pi, OpenCode 2.
- **[D] Removed:** agy (PRD §15.5), OMP (G20), Cursor, JetBrains, Zed, Kimi, Kilo, OpenClaw, OpenCode 1.x, Codex Desktop.
- **[D]** One `context.db` per project (G21, ADR-0002). Users install with `npm i -g context-mode && context-mode setup` (ADR-0019); the git `release` branch stays for the Claude Code marketplace (G12–G14, G22). Users get 3 command skills (`/ctx-stats`, `/ctx-doctor`, `/ctx-upgrade`) plus this repo's own `/release` skill (not shipped to users); `ctx_doctor` and `ctx_upgrade` are MCP tools; `context-mode doctor` and `context-mode upgrade` are the CLI forms that can fix (ADR-0010, ADR-0019 section 2).

The PRD was rewritten on 2026-10-15 to match this spec; no PRD line is superseded.

### 1a. M0: table ownership (ADR-0002)

One table, one owning module. No two modules write the same table.

| Table | Owning module |
|---|---|
| `events` | journal writer (hooks + `ctx_resume`, §6.2 GP6) |
| `sources` | indexer (`ctx_index` / `ctx_fetch_and_index`, §6.2 GP5) |
| `chunks` (FTS5) | indexer, read by `ctx_search` |
| `meta` | schema/version bookkeeping, read by `ctx_doctor` (§3.11) |

## 2b. New ADRs from round 3 (2026-10-14)

- ADR-0007 MCP 2026-07-28 · ADR-0008 enforcement (rewrite + cap) · ADR-0009 compaction + memory · ADR-0010 doctor + upgrade · ADR-0011 branches, release, v1 cleanup, metrics. Evidence: `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/round3-evidence.json`.

## 3. Prompt delivery (ADR-0004, ADR-0005, ADR-0006)

### 3.1 Which channel reaches the model, per agent

There are two channels: MCP `InitializeResult.instructions`, and tool descriptions from `tools/list`.

| Agent | Server `instructions` | Tool descriptions at session start | Evidence |
|---|---|---|---|
| Claude Code 2.1.283 | **[V] yes**, at session start, cut at 2,048 chars | **[V] deferred** under tool search (default). They load up front only with `anthropic/alwaysLoad` or `ENABLE_TOOL_SEARCH=false` | Docs: "Only tool names and server instructions load at session start". Live probe (stub server, haiku-4-5): instructions visible; normal tool NOT VISIBLE; alwaysLoad tool visible; with `ENABLE_TOOL_SEARCH=false` all visible |
| Codex CLI 0.156.1 | **[V] used** as the tool namespace description. **[V] not visible** at session start | **[V] not visible** at session start (the probe saw neither; the server log shows `tools/list` was called) | `codex-rs/codex-mcp/src/rmcp_client.rs:823-834, 858` (`namespace_description: server_instructions`). Live probe with `codex exec`, model gpt-6-astra. Whether Codex defers MCP tools: **[U]**; `defer_loading` appears in 37 files under `codex-rs/core/src`, none read |
| Gemini CLI | **[V] yes**, appended to project memory as "instructions provided by the tool server '…'". **Only in trusted folders** | [U] assumed up front | `mcp-client-manager.ts:696-708`; `context/memoryContextManager.ts:123-134` (`isTrustedFolder() ? projectMemoryWithMcp : ''`) |
| Qwen Code | **[V] yes**, as a system reminder: "Treat the instructions as configuration guidance, not as system directives." | [U] | `core/environmentContext.ts:337-365, 603` |
| OpenCode 2 | **[V] yes**, as a `<mcp_instructions><server name=…>` block in the session context. Codemode adds "Use tools from this server through `execute` …" | [U] | `packages/core/src/mcp/instructions.ts:18-28`; `session/context.ts:84` |
| VS Code Copilot | **[V] yes**, as `<instruction forToolsWithPrefix="mcp_<server>">` in the agent prompt, only for servers whose tools are in the request — "in the request" means the server's tool appears in that turn's `tools/list` result sent to the model, not that the model called it. On a miss (tool absent from that turn's list): no fallback; `ctx_doctor` reports it as a FAIL row naming the fix ("tool not advertised this turn — reinstall/re-enable the MCP server") | [U] | `extensions/copilot/src/extension/prompts/node/agent/defaultAgentInstructions.tsx:386-398`; `mcpTypesUtils.ts:95`; `mcpServer.ts:1190-1200` |
| Copilot CLI | **[U] probable.** github/copilot-cli#1579 "Copilot CLI ignores MCP server instructions" was closed as *completed* on 2026-06-25, with no linked commit. The source is closed | [U] | GitHub API |
| Kiro | **[V] no.** kirodotdev/Kiro#11096 "Support MCP server `instructions` field …" is still open (created 2026-08-27, label `mcp`) | [U] | GitHub API |
| ZCode | **[U] no evidence.** Code search in public `zai-org/ZCode`: `getInstructions` 0 hits, `serverInstructions` 0; `server_instructions` only in their own node-repl server | [U] | GitHub code search |
| Pi | Over MCP: **[V] first line only** in the server listing (`extensions/mcp/index.ts:184-187`), full text only inside the tool-search index (`tool-search/tool.ts:114`). v2 runs Pi as an in-process plugin, not over MCP, so this path is not used (§3.7) | n/a | local clone |

Consequences:
- **C1 (Claude Code, the reference):** with tool search on, the server `instructions` is the only context-mode text the model sees before it searches for a tool.
- **C2:** "tool descriptions are always sent" (r1 claim) is false on Claude Code and Codex. Each description must stand alone, but it cannot be relied on to route the first call.
- **C3:** Kiro has no instructions channel, and ZCode probably none. Routing there comes from tool descriptions only (Q10).

### 3.2 v1 inventory with no v2 successor

Measured on `origin/main` @ `5869f4fa`. This list is the input for the GS5 release-tree check.

| Kind | Items |
|---|---|
| `SKILL.md` (11) | `skills/{context-mode,ctx-doctor,ctx-index,ctx-insight,ctx-purge,ctx-search,ctx-stats,ctx-upgrade}`, `configs/copilot-cli/skills/context-mode`, `configs/antigravity-cli/skills/context-mode`, `.claude/skills/context-mode-ops` (maintainer, not shipped, Q4) |
| Routing files (13, 55,870 B) | `configs/claude-code/CLAUDE.md`; `configs/{codex,kilo,openclaw,opencode,pi,zed}/AGENTS.md`; `configs/{antigravity,gemini-cli}/GEMINI.md`; `configs/qwen-code/QWEN.md`; `configs/omp/SYSTEM.md`; `configs/{jetbrains,vscode}-copilot/copilot-instructions.md` |
| Manifest keys | `.claude-plugin/plugin.json:30`, `.codex-plugin/plugin.json:24`, `.cursor-plugin/plugin.json:25`, `configs/antigravity-cli/plugin.json:11-12`, `configs/copilot-cli/.github/plugin/plugin.json:20-21`, `package.json:34-36` (`pi.skills`), `package.json:68` (`files: "skills"`) |
| Code that writes routing text into user space | `src/adapters/codex/hooks.ts:70` (`ROUTING_INSTRUCTIONS_PATH`) + `config.ts:9`; `src/adapters/kimi/hooks.ts:38`; `src/adapters/qwen-code/index.ts:389-393`; `src/adapters/openclaw/plugin.ts:105, 386-438, 812-902` |
| Machine-dependent prompt text | `src/server.ts:1246` `" (Bun detected — JS/TS runs 3-5x faster)"` |
| Server `instructions` | none: `src/server.ts:143` `new McpServer({name, version})`; live `initialize` → `instructions: null` |

Out of scope for ADR-0004: `src/search/auto-memory.ts` and the adapters' instruction-file *name lists* (`["AGENTS.md"]`, etc.). They **read** the user's own files for search; they do not write routing text.

### 3.3 v2 source of truth

```
src/prompt/instructions.md          → InitializeResult.instructions (Pi: the same bytes, §3.7)
src/prompt/tools/<tool>.md (×7)     → tools/list description
```

- The build inlines these files into `server.bundle.mjs`. Runtime code never adds to or changes them (PR9).
- No other file in the repo or in user space carries routing text.
- The draft texts are in `docs/architecture/prompt-drafts.md`.

### 3.4 Rules

PR1–PR11 are listed in ADR-0005. The lint script is `build/prompt-lint.mjs`; in v2 CI it runs on the built server's live `initialize` and `tools/list` output.

### 3.5 Measured lengths and lint results (2026-10-14)

| Text | Chars | caps | doubt | tags | quoted | Budget (Q5) |
|---|---|---|---|---|---|---|
| v2 `instructions` (draft r2) | 925 | 0 | 0 | 0 | 0 | ≤ 2,048 |
| v2 `ctx_execute` | 698 | 0 | 0 | 0 | 0 | ≤ 1,024 |
| v2 other 6 descriptions | 163–400 each | 0 | 0 | 0 | 0 | ≤ 1,024 each |
| v2 all 7 descriptions | 2,353 | — | — | — | — | descriptions + schemas ≤ 8,000 (schemas not built yet) |
| v1 24 prompt files | 110,171 | 128 | 2 | 50 | — | — |
| v1 `skills/context-mode/SKILL.md` | 16,358 | 16 | 2 | 10 | 103 | — |
| v1 `.claude/skills/context-mode-ops/SKILL.md` | 24,100 | 56 | 0 | 30 | 41 | — |
| v1 11 tool descriptions (live `tools/list`) | 17,075 (+ 9,749 schema ≈ 6,706 tokens at chars/4) | 1 | 0 | — | — | 5 of 11 are longer than 2,048, so Claude Code cuts them: `ctx_execute` 3,105, `ctx_search` 3,351, `ctx_fetch_and_index` 2,240, `ctx_batch_execute` 2,128, `ctx_execute_file` 2,126 |

How to read this:
- The v1 tool descriptions are mostly fine in tone. Their problem is length and the Bun text.
- The tone problem is in the skill and routing files: "Default to context-mode for ALL commands", "When uncertain, use context-mode", `<mandatory_rule>`, and a 39-phrase trigger list.

### 3.6 Routing pilot on Opus 5.5 (evidence for ADR-0005 and ADR-0006)

Setup:
- Claude Code 2.1.283, `--model claude-opus-5-5`, gateway off (`ANTHROPIC_BASE_URL` unset, so tool search is on by default).
- `--setting-sources project --strict-mcp-config`.
- A stub server (`https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/data/pilot-routing/stub.mjs`). `ctx_execute` and `ctx_batch` really run `sh`, `node` or `python3` in the project; the other 5 tools return a stub text.
- `--allowedTools mcp__context-mode Bash Read Write Edit Glob Grep`.
- 6 tasks in a fresh git repo:
  - Small: S1 "is the tree clean", S2 "what does README.md say", S3 "create notes.txt".
  - Large: L1 6,000-line `app.log`, L2 a 4,000-line test script, L3 a 20,000-row `data.json`.
- 3 variants × 2 runs = 36 sessions. Raw streams: `https://github.com/mksglu/context-mode/tree/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/data/pilot-routing/`.

| Variant | Server instructions | `ctx_execute` alwaysLoad | Over-routing (small → ctx) | Under-routing (large → native) | Large answers correct | Bytes returned to model, 6 large runs | Cost, 12 runs |
|---|---|---|---|---|---|---|---|
| A | v2 draft (925 chars) | no | 0/6 | **5/6** | 6/6 | 3,169 | $0.95 |
| A2 | v2 draft | **yes** | **0/6** | **0/6** | 6/6 | 2,808 | $1.14 |
| B | v1 `SKILL.md` lines 20–40 (1,090 chars) | no | **2/6** (S1, both runs) | 0/6 | 6/6 | 3,777 | $0.97 |

Classification: the first tool call that is not `ToolSearch`. Correct answers: L1 667 ERROR lines; L2 5 tests failed (0, 997, 1994, 2991, 3988; the r2 pilot text missed 3988); L3 1,539 inactive / 18,461 active users (ADR-0006 re-probe, `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/spikes-r5/ADR-0006-reprobe.md`).

Findings:
1. With tool search on, the v2 instructions alone did not make Opus use the deferred ctx tools on large tasks (A). Loading `ctx_execute` up front fixed this in this sample (A2). → ADR-0006.
2. The v1 text over-routed a 1-line `git status` into the sandbox in both runs. This is the overtriggering the guide warns about.
3. **The byte savings were small in every variant.** Opus filtered in plain Bash too (`grep -c`, `jq`), so the routing choice changed the returned bytes only slightly (2,808–3,777). This pilot does not measure the case where an agent would otherwise read raw output. GP-LIVE-ROUTING needs tasks that force that case (§6.5).

Limits:
- n = 2 per cell, one model, Claude Code only.
- The session init listed two user plugins (`agents-md`, `telemetry`) that `--setting-sources project` did not turn off. 0 hook events were seen.
- An earlier 12-run pilot without `--allowedTools` had 9 permission denials and was discarded.

### 3.7 Delivery per agent

| Agent | Instructions | Routing for the first call |
|---|---|---|
| Claude Code | server `instructions` | `ctx_execute` alwaysLoad (ADR-0006, Q2) |
| Codex CLI | server `instructions` (namespace description) | tool descriptions after discovery. Routing quality is measured in GP-LIVE-ROUTING before release (Q11). No `AGENTS.md` |
| Gemini CLI | server `instructions` (trusted folders only) | tool descriptions |
| Qwen Code, OpenCode 2, VS Code Copilot | server `instructions` | tool descriptions |
| Copilot CLI | server `instructions` [U] | tool descriptions |
| Kiro, ZCode | none | tool descriptions only (Q10) |
| Pi (in-process plugin) | the same `instructions.md` bytes, appended to the system prompt in `before_agent_start` (Q7) | plugin tool descriptions (same bytes as `tools/list`) |

Pi API evidence: `before_agent_start` events carry `systemPrompt` (`core/extensions/types.ts:935`) and results may return `systemPrompt` (`types.ts:1499`). An example that appends to it: `examples/extensions/preset.ts:386-389`.

### 3.8 Tool names as each agent shows them

The same MCP tool gets a different name on each agent. This matters in two places: (a) prompt text, (b) hook matchers and hook payload decoding.

| Agent | Model-visible / hook name of `ctx_execute` (server key `context-mode`) | Evidence |
|---|---|---|
| Claude Code (plain MCP) | `mcp__context-mode__ctx_execute` | [V] pilot transcripts `out-A2-*.jsonl` in https://github.com/mksglu/context-mode/tree/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/data/pilot-routing |
| Claude Code (plugin) | `mcp__plugin_context-mode_context-mode__ctx_execute` | [V] docs plugins section: `mcp__plugin_<plugin-name>_<server-name>__<tool-name>` |
| Codex CLI | one name for model and hooks: `mcp__context_mode__ctx_execute` (underscore — Codex replaces every char outside ASCII alnum/`_` with `_` in the server name) | [V] `codex-rs/codex-mcp/src/mcp/mod.rs:587-602` (`sanitize_responses_api_tool_name`); `codex-mcp/src/tools.rs:22,140,146`; live `mcp__context_mode__ctx_execute` in 3 runs (DECISIONS-r9 R1, `out/final/probe-codex.md` F1) |
| Gemini CLI | `mcp_context-mode_ctx_execute` (**single** underscore; chars outside `[A-Za-z0-9_\-.:]` → `_`) | [V] `packages/core/src/tools/mcp-tool.ts:37, 328-330, 725-731` |
| Qwen Code | `mcp__context-mode__ctx_execute` | [V] `packages/core/src/tools/mcp-tool.ts:1209, 1241` |
| OpenCode 2 | `context-mode_ctx_execute` (no `mcp` prefix); with codemode the model calls it through `execute` → `tools["context-mode"]` | [V] `packages/core/src/tool/mcp.ts:16-17, 45`; `mcp/instructions.ts:21-23` |
| VS Code Copilot | `mcp_<server>_<tool>` | [V] comment + code `defaultAgentInstructions.tsx:390-392` |
| Pi (MCP path) | `mcp__context-mode__ctx_execute` | [V] `extensions/mcp/tools.ts:79-89` — not used by v2 (in-process plugin registers its own names) |
| Copilot CLI, Kiro, ZCode | [U] | S-NAMES (§9) |

Findings:
- **v1 is wrong about Gemini.** `src/adapters/gemini-cli/hooks.ts:52-64` says the Gemini wire shape is `mcp__<server>__<tool>` and matches `mcp__(?!.*context-mode)`. Gemini HEAD builds `mcp_<server>_<tool>` (single `_`), so that matcher cannot match MCP tools on current Gemini. [V] by source; not yet verified with a live Gemini run.
- v1 issues of this class: #1222, #960, #529, #1028/#1060 (bare `ctx_search` in a resume snapshot), #913, P56, P416, #1052.
- The pilot shows the model maps a bare name in the instructions to the prefixed tool: the v2 instructions say `ctx_execute`, and Opus called `mcp__context-mode__ctx_execute` in all 12 A2 runs.

Rules:
1. **Prompt text** (instructions, descriptions, the `ctx-stats` prompt, tool results) names tools **bare**: `ctx_execute`. Each agent shows the model its own prefixed name next to the description, so a bare name is never wrong, while a prefixed name is wrong on every other agent. Lint PR12 fails on `mcp__…ctx_`, `mcp_…ctx_`, `plugin_…ctx_`.
2. **Hooks**: each adapter row in `adapters/table.ts` holds the exact name pattern for that agent (one row per agent, one install mode per agent, PRD E14). Generated matchers are tested in GP3 against names taken from recorded native payloads, never against hand-written strings (#1222).
3. The server key is fixed: `context-mode` everywhere.
4. **Claude Code's real gate is a settings.json matcher, not a server-side filter.** `PreToolUse` hooks are selected by the `matcher` field (a regex over the tool name, e.g. `mcp__context-mode__.*`) in the generated `hooks` block of `settings.json`; there is no `type: "mcp_tool"` field anywhere in that schema (an earlier draft of this section named one; it does not exist). If the MCP server is disconnected when the model calls the tool, the host has no tool to match against, so the call either fails at the host (tool unknown) or — on hosts that keep a stale tool list — runs with no hook. GP3/LV adds a case on a live Claude Code session: disconnect the `context-mode` server mid-session, call a previously-advertised `ctx_execute`, and assert either a host-level failure or an unblocked tool run with zero hook fired (never a hook firing on a dead server).
5. **The matcher also carries the agent's own native tool names, not only the own MCP prefix** (DECISIONS-r9 R4): `AdapterRow.nativeTools` lists each agent's shell/read/grep/webfetch/edit tool names, and the generated matcher is `^(<all nativeTools names>|<escaped toolNamePrefix>ctx_.*)$`. Example — Codex: native shell arrives as host tool name `Bash` (`codex-rs/core/src/tools/hook_names.rs:53-55`, live F2), so Codex's matcher is `^(Bash|apply_patch|mcp__context_mode__ctx_.*)$`, never only `mcp__context_mode__ctx_.*`; a prefix-only matcher never sees the native `Bash` calls ADR-0008 must deny.

### 3.9 User commands as skills: `/ctx-stats`, `/ctx-doctor`, `/ctx-upgrade` [D 2026-10-14]

- No MCP prompts. Each command is one `SKILL.md` with `disable-model-invocation: true` that only calls the matching tool and shows its table (texts: `docs/architecture/prompt-drafts.md` ids `skill_ctx-*`).
- One source dir `skills/` (3 files). Manifests point at it; no per-agent copies, no routing text in skills (routing stays in instructions + tool descriptions, ADR-0004).
- [V] Claude Code 2.1.283, plugin loaded with `--plugin-dir`, plugin name `context-mode`: both `/ctx-stats` and `/context-mode:ctx-stats` ran the skill (live probe 2026-10-14, haiku-4-5). Docs: plugin skills are namespaced `/plugin-name:skill-name`; the short name works when no other command uses it.
- Skill loaders exist in source for Gemini CLI (`core/src/skills/skillLoader.ts`), Qwen (`core/src/tools/skill.ts`), OpenCode (`core/src/skill.ts`), Pi (`core/skills.ts`), Codex (`codex-rs/core`, 36 files mention SKILL.md), VS Code Copilot (`tools/node/skillTool.ts`). Whether each one exposes a skill as a `/` command, and from which install path: **[U] S-SKILLS**. Agents without user-invocable skills: the user asks in words, the model calls the tool.
- `ctx_stats`, `ctx_doctor`, `ctx_upgrade` return Markdown tables (golden in GP10, GP11).

### 3.11 `ctx_doctor` and `ctx_upgrade` (kept, rebuilt for v2) [D 2026-10-14]

v1 issue titles mentioning doctor: 35 (8 open); upgrade/heal: 70 (18 open). Main classes: false FAIL / wrong report (#1152 Codex hooks, #1014 PASS on empty index, #548 path with space, #712 Gemini path), baked paths and versions (#711, #1005, #523, #1090), two install trees (#901), user settings reverted (#1226), npm/Bun/ABI (#514, #543).

**`ctx_doctor`** (read-only, one row per check, each FAIL row = cause + one-line fix):
| Check | Source of truth |
|---|---|
| version: running bundle vs latest `#release` tag | bundle constant; `git ls-remote` (no network → "unknown", not FAIL) |
| Node ≥ minimum, `node:sqlite` loads | process. `node:sqlite` closes #1251 (native-module ABI breakage) with no native module shipped at all (r3 Q10); GP9 adds a Windows cold-start, no-network case mirroring #861 before #1251 is marked closed |
| host config for **this** agent: MCP entry + 4 hook entries match `adapters/table.ts` exactly, no v1 entries, no duplicate | the generated config, compared as data, not by path string |
| hook round-trip: run the hook entry with a recorded payload, check output + wall time ≤ 40 ms | GP3 fixture shipped in the bundle |
| MCP: this process is the one the host started (clientInfo = agent) | `initialize` |
| project + worktree resolved from the agent's one source | adapter table |
| `context.db`: two separate FAIL rows — **stale schema** (meta.schema_version < bundle's expected version; fix = run `ctx_upgrade`) and **integrity_check failure** (`PRAGMA integrity_check` returns a row other than `ok`; fix = restore from the last good state, never auto-rewrite) | DB |
| index: sources and chunk counts per scope (fixes #1014: empty index is reported, not PASS) | DB |
Never spawns per tick, never writes, never installs.

**`ctx_upgrade`** (one path per install mode, no fallback):
1. Read the install mode from the adapter table (marketplace plugin, git checkout, in-process plugin).
2. Fetch the latest `#release` tag into a new version dir; verify the bundle hash.
3. Regenerate only context-mode's entries in the host config from `adapters/table.ts`; keep user keys and user-set values (hook timeouts, #1226); delete v1 entries; paths resolved at hook run time, never baked (#711, #1005). One `resolvePluginRoot(adapter)` function, called by install, upgrade and doctor alike, generalizes the per-adapter fix v1 shipped only for Codex (`fix(codex): resolve plugin-manager root for doctor and upgrade`, #771) to all 10 agents.
4. Switch atomically (rename), keep the previous dir for one rollback; never touch user instruction files.
5. Return a table of changes + "restart needed"; the `/ctx-upgrade` skill then runs `ctx_doctor`.
Marketplace installs: the host's own update command is the path; `ctx_upgrade` reports it and only fixes config entries.

### 3.10 Removed-agent files [D]

Removed from the repo, not only from the release tree (paths from `origin/main` @ `5869f4fa`):
`.cursor-plugin/`, `.openclaw-plugin/`, `openclaw.plugin.json`, `configs/{antigravity,antigravity-cli,cursor,jetbrains-copilot,kilo,kimi,omp,openclaw,zed}/`, `hooks/{antigravity-cli,cursor,jetbrains-copilot,kimi}/`, `hooks/formatters/cursor.mjs`, `src/adapters/{antigravity,antigravity-cli,cursor,jetbrains-copilot,kimi,omp,openclaw,zed}/`, `docs/adapters/{kimi-code,openclaw}.md`, `docs/jetbrains-copilot.md`, `scripts/install-openclaw-plugin.sh`, `scripts/lib/register-openclaw-config.mjs`, `scripts/test-openclaw-e2e.sh`, `.github/workflows/openclaw-e2e.yml`, `.claude/skills/context-mode-ops/`, and the `openclaw` key in `package.json`. A CI check (GS5) fails if any of these names reappears.

## 4. Repository layout deltas

PRD §15.2 is the base. Changes:

```
src/prompt/instructions.md, src/prompt/tools/*.md     single prompt source (§3.3)
e2e/
  harness/  mcp-client.mjs   spawn server.bundle.mjs, speak MCP over stdio as a given clientInfo
            hook-runner.mjs  spawn hook entry with a recorded native payload on stdin; capture stdout, exit code, wall time
            db-dump.mjs      open context.db read-only with node:sqlite, dump normalized rows
            normalize.mjs    the volatile-field rules (§6.4)
            live/<agent>.mjs headless drivers (claude -p, codex exec, …)
  fixtures/<agent>/<agent-version>/<event>.json   recorded native hook payloads
  golden/GPn/<case>.json
  cases/GPn-<name>.e2e.mjs
  live/routing-tasks.json                          GP-LIVE-ROUTING task set
```

Proposed test runner: `node:test`. The tests run against built `.mjs` files, so no transform step is needed (Q9).

## 5. Requirement sources

- B rows (124) and M rows (33) in `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/v2-issue-map.md`. Each becomes a GP case assertion, never a unit test.
- From the 2026-10-14 rescan (`https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/v2-not-closed.md`):
  - #1299: quoted curl/wget destinations → GP3
  - #1296: project source read after `initialize` → GP1
  - #1302: Codex concurrent chats, title only → GP7
- `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/v2-test-ledger.md`: 221 bug ids cited by v1 tests, each needing a verdict (§6.8).

## 6. Test strategy (ADR-0003)

### 6.1 Layers

| Layer | Runs | Model | Deterministic | Where |
|---|---|---|---|---|
| v1 KEEP-PASS (131 tests, ADR-0003 r2) | every PR, vitest+TS | none | yes | `tests/` (kept, mechanically ported import paths only) |
| E2E-style (GP1–GP11) | every PR, 3 OS | none | yes | `e2e/cases` |
| E2E-live (GP-LIVE-ROUTING, GP-LIVE-HOOKS) | after every implementation step (step scope) and the full set before `/release`, in the keyless harness on the owner's own logged-in Claude Code (ADR-0012, ADR-0017); never CI, never a key, **no cron** | real, `claude-sonnet-5 --effort low` (Opus and Haiku only for the ADR-0005/0006 routing A/B) | no; thresholds | `e2e/live` |

Hard rule: no E2E test imports `src/`. The 131 KEEP-PASS tests keep their v1 `src/` imports (ADR-0003 r2) — that is the one named exception.

### 6.2 Golden paths

| ID | Path | Inputs | Asserts (golden unless noted) | Requirement ids (examples) |
|---|---|---|---|---|
| GP1 | Install + handshake, ×10 adapters | release tree, generated host config | config valid for the host; server starts with no npm install step at run time; `initialize` (instructions bytes) and `tools/list` (9 tools: ctx_doctor and ctx_upgrade stay as tools per Q3b, only ctx_insight drops, G4); project read after `initialize`; after a simulated Claude Code auto-update leaves a stale plugin-cache path, the next install/update detects and fixes it with no manual doctor run | #1206 #1282 #1183 #1090 #1222 #1226 #1000 #1296 |
| GP2 | Prompt surface | `initialize`, `tools/list`, Pi plugin system prompt | identical bytes on 3 OS; `lint.mjs` = 0 failures; budgets (Q5); no user-role injection; injected bytes are byte-stable (constant, not just relocated) across requests in the same turn | #1264 #864 #1031 |
| GP3 | Hooks, ×10 adapters × 4 events | `e2e/fixtures/<agent>/<ver>/*.json` | native stdout/exit code; no hints (DECISIONS-r10; only the resume line and compaction delivery remain; the resume line comes on SessionStart, and on Gemini on the first BeforeAgent of a session, D-FU-GCH-2); never empty fields; never throws; PowerShell and quoted curl/wget routed; p95 ≤ 40 ms, CI-enforced as ≤ 20 ms CPU over a bare Node spawn; an unrelated `mcp__` tool call (e.g. `mcp__grafana__get_datasource`) spawns zero hook processes; `PostToolUse` dispatch is fire-and-forget (detached write to the journal, no blocking wait on the tool result); Kiro's `e2e/fixtures/kiro/*/promptsubmit.json` asserts `stdout == ""` on exit 0 (plain-text-only hooks; no JSON on stdout — the v1 regression ff0a9a26 fixed); a `Read` with no `offset`/`limit` on a file over `OUTPUT_CAP` is denied with the ADR-0008 reason text and the real bytes never reach the model; a `Read` with `offset` or `limit` set is never denied, at any file size; a shell file dump (`cat`/`head`/`tail`/`sed -n`/`less`/`jq`/`bat`/`more`, one file, no bound) over `OUTPUT_CAP` gets the same deny, and the same command with an explicit bound (`head -n N`, `tail -n N`, `sed -n 'a,bp'`) is allowed at any size (DECISIONS-r8) | #1107 #1299 #1212 #897 #910 #1179 #1261 #960 |
| GP4 | `ctx_execute` | shell/js/python, `file`, `intent`, `timeoutMs`, cancel | exit class; output cut is code-point safe; process tree killed (Windows: `taskkill /F /T /PID`, matching v1's proven mechanism, `src/executor.ts:196-200`; no Job Object switch is adopted without an ADR); env passed via spawn env; NODE_OPTIONS does not leak; deleted cwd; PATH shims; always spawns the interpreter binary directly with `shell: false` on every OS (no git Bash / PowerShell / cmd shell choice); PowerShell/pwsh scripts are written with a UTF-8 BOM plus a console-encoding prelude, round-tripping a non-ASCII string; fetch-error path returns a one-line cause with no raw Node stack frame (#1135); no server-side default timeout when the caller omits it — the host's own RPC timeout governs, per the v1 #406 fix (`eea5877b`: dropped the Zod `.default(30_000/60_000)` because it killed long Gradle/Maven/SBT builds); the per-call `timeoutMs` override, when given, is enforced through the same `AbortSignal` mechanism used for the cancel path; this also removes `e4f4379d`'s adapter-local antigravity-cli default, since v2 has one rule (none) instead of per-adapter ones; cancel on a long-running call tears down the child process tree within 1 s and returns a cancel reply; cold start replies in < 1 s with no PATH probes | #1182 #1093 #1121 #1176 #903 #925 #1117 #951 #1068 #1286 #1209 #1218 #1135 |
| GP5 | `ctx_index` → `ctx_search` | folder with nested `.gitignore` (incl. negation patterns), HTML, Markdown, non-ASCII text, cross-session and cross-source `ctx_search` fixtures | ranked hits; `**` matches zero dirs; rowless tables; nested fences; byte caps; zero-hit reply states scope and source count; proxy env — the SSRF check runs on the resolved proxy target, in the same process as the fetch, after proxy env vars are applied, never as a separate parent pre-check (closes v1 #476's gap); non-ASCII auto-memory search tokenization (#1295); directory-walk symlink checks call `security.ts`'s path-containment function, never a separate ad hoc `..`-prefix string check; `highlight()` clips a large FTS row before rendering (#963) and stays HTML-sanitized (#341, `ceb49688`) on top of that clip — both must hold, not just the size clip; `ctx_fetch_and_index` on an unreachable URL returns only the one-line error cause (no raw Node stack), same rule as GP4's #1135 case, for consistency across tools; `sort:"timeline"` merges ContentStore, SessionDB and auto-memory, oldest first, normalized to ISO-8601 UTC, paged by `after` seq, scoped the same as relevance mode (DECISIONS-r6 D2); `offset` with `sort:"timeline"` and `after` with `sort:"relevance"` each reject as `isError INVALID_ARGS`; `source:"decision"` searches only `kind:"decision"` rows (D3); a fresh same-session hit outranks an older cross-session hit with a higher BM25 score under the current-session-first, then-RRF(k=60) order (D4, #895); golden cases for recall@5, one per query type (`decision`, `errorfix`, `timeline`), fixed to the DECISIONS-r7 measured values (BM25+RRF k=60; no MMR) (DECISIONS-r7) | #1292 #1291 #1295 #1138 #1136 #1238 #878 #898 #961 #1014 #1039 #476 #963 #341 #663 #895 |
| GP6 | Journal + resume | PostToolUse payload sequence, then a compaction, including one open-error case over the 2,048 B budget | `events` rows; `ctx_resume` ≤ 2 KB golden, mirroring the GP4 cap shape, code-echo off by default (#1047); priority polarity; `ctx_resume(seq: N)` resumes from a given pointer; a `decision` row is written only from an `AskUserQuestion` tool answer or a plain-string option echo on the next turn, never a shape classifier or an English marker list (ADR-0009 §8, DECISIONS-r6 D3); `candidates.ts` never selects a `decision` row; the one case in the D1 sweep that misses the open-error hit at B=2048 is asserted as a budget skip, not a scoring bug — if the assertion fails, the bug is fixed, B is not raised (DECISIONS-r6 D1); `adapters/table.ts` `compactSummary` column (`"host"` \| `"none"`) picks the delivery path: `"host"` injects one pointer line only, no state block, `ctx_resume()` with no `seq` returns the 2,048 B block on demand; `"none"` injects the 2,048 B D1 block through the agent's ADR-0009 §6 path; Claude Code is the only `"host"` row until LV-COMPACT (§9) proves another agent's host writes its own summary (DECISIONS-r6 D6, `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/memory-r6/eval/results.md`) | #1181 #1156 #1047 |
| GP7 | Scope | 2 worktrees × 2 sessions × 2 agents | identity shared per repo; search default per Q6; session ranks first; path containment by components; `${workspaceFolder}` resolves correctly under VS Code Remote-WSL; `sort:"timeline"` merges all 3 sources in normalized-timestamp order, cursor-paged by `after`, scope-filtered identically across sources; cross-session `sort:"relevance"` fuses BM25 + recency by RRF, not a new weighted score (ADR-0009 §8, Memory-R6) | #744 #1185 #895 #1294 #1302 |
| GP8 | Concurrency | 4 servers + hooks writing one `context.db` | 0 busy errors reach the tool result; `integrity_check` ok; no retry loop; idle CPU ≈ 0; the live-PID check for the #1248-class cleanup runs inside the cleanup transaction, never as a separate pre-check with a race window | #985 #1213 #1248 · verify-single-db |
| GP9 | Lifecycle | stdin EOF, parent kill, on 3 OS | exit < 2 s; no spawn at boot; no `chdir`; stdin-EOF → SIGTERM (2 s) → SIGKILL (5 s) escalation is preserved in any bootstrap rewrite (#862); Windows parent-death: stdin EOF, then `taskkill /F /T /PID` of own children (`shell:false`; no Job Object — DECISIONS-r9 F6, `03-sandbox.md` AS1); hosts with no stdin-EOF/ppid-change signal kill the process tree only via the Q8 timeout model, never a bare idle-shutdown timer — `a888cac6` reverted that twice (#568, #595) after it broke 12 hosts, so process accumulation on those hosts is the accepted cost, decided; stdin is a TTY ⇒ the `end` listener never registers and the process does not exit on TTY idle (#534, #236; the v2-test-ledger row for `server-stdin-eof-exit.test.ts` is `GP9/tty-gate`, not a bare `REMOVED/GP9`) | #1100 #982 #953 #1167 #923 #924 #974 #999 #568 #534 #236 |
| GP11 | Doctor + upgrade | v1 install, broken config, empty index, user-set hook timeout | doctor table golden (stale-schema and `integrity_check` failure reported as distinct rows); upgrade keeps user values, removes v1 entries, no baked paths, rollback works; with no `[features].hooks` key in Codex config, doctor still reports `hooks=true`, Codex's real default | #1152 #1014 #901 #1226 #711 #1005 #548 |
| GP10 | Stats | a known sequence of tool calls | saved = sandbox bytes − returned bytes; idempotent per call id — cost events are keyed by turn id so repeated step-finish events in one turn count once; `reduction_pct` counts returned bytes once in the denominator (unit-tested); `session_kept_out ≤ project_total ≤ alltime_total`; 0 calls ⇒ 0 savings; per agent "no data" with the reason | #1151 #1252 #1036 #1287 |
| GP-LIVE-ROUTING | real agent + model | §6.5 | over-routing and under-routing within thresholds; answers correct | ADR-0005, ADR-0006 |
| GP-LIVE-HOOKS | real agent + model | an MCP tool call | hook fired yes/no per agent | G25 |

### 6.2a Contract and unit assertions (not full GP cases)

These are narrower than a GP case — one function or one invariant each — but still never import `src/` directly except where stated as a unit test.

| Area | Assertion |
|---|---|
| Sandbox executor | The v2 executor is Node.js/TypeScript, not Rust. Stated here to close any future confusion on this point. |
| `ctx_stats` (D3) | Every sibling session DB it opens is opened read-only; its `mtime` is unchanged after a stats run. |
| `ctx_batch_execute` | An identical chunk returned by two queries inside the same batch call is deduped, not only across separate calls. |
| Config dir resolution | One `resolveConfigDir()` module, used by storage, stats, cache-heal and tests; replaces three independent reads. |
| Adapter detection (D4) | One fixed detection method per adapter, including per-session workspace resolution — not a single global method shared across adapters. |
| Hooks throttle | A session-id-keyed marker in the existing append-only journal is the ppid-keyed throttle; it stays a separate mechanism from #593's periodic external-MCP nudge. |
| Events removal | The C2 adapter's session/project scoping inherits `156aa0fd`'s project-scoped dedupe key, so removing `events.md` does not reopen the #737-class cross-project leak. |
| `ctx_execute` output | Code-fence echo-first-line is off by default; an optional `summary` arg re-enables it (r3 Q19). |
| OpenCode adapter | The plugin module exports `{id, setup}`, per OpenCode 2.x's plugin API. |
| Pi adapter | Real 0.85 extension-discovery directories are detected, not hardcoded legacy paths (#1168, split out of the shared #1135 bucket; #1150 gets its own GP5 assertion: the call row shows language + first code line). |
| `runPool` | `capped === (jobs >= concurrency)`, asserted before `runPool` is ported to v2. |
| Sandbox network (D15) | The outbound-HTTP ban from the sandbox covers any outbound HTTP, not only LLM API calls; proxy env is YES with the SSRF check from A8 (r3 Q19, #1184). |
| WebFetch replacement (D10) | Hard deny stays with v1 scope (owner rule); `#945` is not moot. `claude.ai` artifact URLs are allowed by default through the replacement mechanism, with no special-case allow entry. |
| jq filter (ctx_batch_execute / fetch pipelines) | A closed, syntactically-checkable `jq` filter whitelist (not an open "scalar" rule), plus `head -c N` capped at `OUTPUT_CAP`. Boundary cases: `curl … \| jq '.data'` (object, passes) vs `curl … \| jq 'length'` (scalar, passes) are both checked against the whitelist, not against output shape. |
| DB handle cleanup | All sqlite DB handles are closed explicitly in test teardown before process exit, so Windows EPERM hangs are resolved without skipping any kept test. |
| Pi bridge bootstrap | Retryable per turn, not per session: the next `before_agent_start` after a failed `tools/list` re-runs bootstrap. |
| Pi bridge writes | `#1205` splits into two tests: the process never spawns Bun, and the single-writer-per-file invariant (D3) holds under concurrent Pi-bridge writes. |
| Test harness portability | CI checks the v2 test harness does not hardcode `/bin/bash`; only then is #972 treated as verified-safe. |
| Pi routing hint | Removed (DECISIONS-r10). Routing text stays in the tool descriptions. |
| Adapter conformance | Per new adapter: (a) its shell-tool allow-list is reviewed (#1212); (b) its own `hooks.json` schema-conformance test runs, not just Claude Code's schema (#1240); (c) install/upgrade preserves pre-existing user hooks (#1235). |
| D7 hooks.json generation | A headless-mode GP case runs alongside the existing D7 generation test. |
| Contract tests (class B) | Non-ASCII auto-memory search tokenization (#1295, covered in GP5); `**` zero-directory glob match (#1291, GP5); a real JSONC tokenizer for config edits, never a line-based `//`-strip (#1271) — this satisfies the owner's no-regex-as-reduction-mechanism rule. |

### 6.3 Fixtures

- A native hook payload is captured once from the real agent and stored under its agent version.
- When an agent's version changes, the fixture is recaptured and the golden diff is reviewed.
- Agents not installable in CI keep their last fixture. The fixture's age is reported in the GP3 output.

### 6.4 Golden files

- Format: one JSON file per case, `{ "input": …, "stdout": …, "exit": n, "db": [rows] }`.
- Normalized before comparison:
  - ISO timestamps → `<ts>`
  - PIDs → `<pid>`
  - temp home and project paths → `<home>`, `<proj>`
  - session ids → `<sid:n>` in order of first appearance
  - durations → `<ms>`
  - `\` → `/`
- `UPDATE_GOLDEN=1` rewrites golden files locally only. CI fails if a golden file changed in the PR without a diff in `e2e/golden/` being part of the PR review.

### 6.5 GP-LIVE-ROUTING (spec)

- **Tasks:** `e2e/live/routing-tasks.json`, 10 small and 10 large, each with a machine-checkable answer.
  - Large tasks include cases where a filtering Bash command is not obvious, for example "summarize the three most frequent stack traces", so that savings are measured and not only tool choice.
- **Models:** Opus, Sonnet and Haiku on Claude Code; the default model on Codex. Other agents run if they have a headless CLI.
- **Metrics:**
  - over-routing: small task whose first non-`ToolSearch` tool is a ctx tool
  - under-routing: large task whose first tool is native
  - answer correctness
  - bytes returned to the model
- **[P] Thresholds:** over-routing ≤ 1/10, under-routing ≤ 1/10, correctness 10/10 on large tasks, per model.
- The ADR-0006 alwaysLoad flag is A/B tested here before every release.

### 6.6 CI matrix

- **[P] Per PR:** macOS, Linux, Windows × Node 24.15.0 (the minimum, S-NODE) and the current Node (26.x). The minimum is S-NODE (§9).
- **[P] Budget:** ≤ 10 minutes wall-clock per OS.
- **E2E-live:** no schedule. See §6.9.

### 6.7 Performance budgets

- Hook p95 ≤ 40 ms (G26, GP3)
- Server idle CPU ≈ 0 after 60 s (GP8, GP9)
- No process spawn at boot (#1167, GP9)

### 6.8 Deletion gate for v1 tests

- `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/v2-test-ledger.md` has 221 rows: 164 closed issues, 46 merged PRs, 7 closed PRs, 1 open issue (#45), 3 non-issues.
- Suggested buckets by title keywords (review needed): REMOVED 56 · GP4 44 · UNASSIGNED 22 · GP8 21 · GP3 19 · GP1 17 · GP9 16 · GP6 13 · GP5 7 · GP7 3 · not an issue 3.
- Each row gets exactly one verdict: `GPn/<case>`, `LIVE:<id>`, `REMOVED:<ADR|G|E id>`, or `N/A:<reason>`.
- Done 2026-10-17 for `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/v2-issue-map.md`: 351/351 rows (GP 170, LIVE 2, REMOVED 110, N/A 69). New cases: `docs/architecture/modules/14a-issue-cases.md`. Source: `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/gp-gap/verdicts.json`.
- v1 `tests/` (210 files, 81,072 lines; 136 import `../src/`; 64 start processes) is deleted in one commit, only when no row is empty and GS1 holds.

### 6.9 Live E2E: a keyless harness, not a CI job with keys (ADR-0012)

No API key for any test (owner rule). This supersedes the earlier CI-job-with-secrets design: the harness runs in the owner's own logged-in Claude Code, never in CI with stored keys.

- **Entry points**, both run the same script: a terminal command (`node e2e/live/run.mjs [--agents claude,codex] [--models haiku|sonnet|opus|all] [--cases routing,deny,compact,hooks]`), and `/e2e-live` inside Claude Code.
- **No key needed:** `claude -p` runs on the owner's Max subscription with `ANTHROPIC_API_KEY`/`ANTHROPIC_BASE_URL`/`ANTHROPIC_CUSTOM_HEADERS` unset (`init.apiKeySource = "none"`). Codex runs logged in with ChatGPT, via a temp `CODEX_HOME` holding only a symlink to the owner's real `auth.json`, with `--ignore-user-config` so `~/.codex` is never touched (that flag still loads `~/.codex/hooks.json`, which is why the symlink-only temp home is still needed).
- **Child env** is built from an allow-list (PATH, HOME, USER, SHELL, TMPDIR, LANG, TERM) plus `ENABLE_CLAUDEAI_MCP_SERVERS=false`, `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`, `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1` and a temp data dir. `ANTHROPIC_*` and `CLAUDE_CONFIG_DIR` are never passed; the login stays in the Keychain.
- **Agents actually run:** only `claude` and `codex` are installed and logged in on the owner's Mac today. Every other agent in §2's list of 10 prints `SKIPPED` with the reason (not installed / not logged in) until the owner adds it. GS2 reads as "pass on every agent the harness could run; the rest SKIPPED with a reason."
- **Cases:** routing (§6.5 task set), deny/repeat-allow (ADR-0008 golden cases), compaction (ADR-0009, `/compact` as a later stream-json turn), hook firing (G25). Hook timing is read from the v2 DB, since stream events carry no timestamp.
- **Default run:** Haiku on Claude Code, plus Codex if logged in. `--models all` adds Sonnet and Opus. The report is a table per agent/model: pass/fail against §6.5 thresholds, first tool used, bytes returned.
- **Release gate (ADR-0013):** `/release` runs this harness before starting the release workflow. The release report carries a "live test: passed/skipped" field and a running consecutive-skip count; `/release` refuses to start once that count reaches 3 skips in a row, so `skip-live` cannot quietly become permanent.
- **Traps avoided:** `--strict-mcp-config` drops the server shipped inside `--plugin-dir`, so it is not used; the harness accepts only a real `claude`/`codex` binary (Mach-O/ELF magic bytes or the right `package.json` name), not the first shim on PATH.
- **Model:** `claude-sonnet-5 --effort low` by default (ADR-0017); step mode runs only the cases whose `covers` match the changed files.

## 7. Data and evidence files

`https://github.com/mksglu/context-mode/tree/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/`:
- `v2-issue-map.md`, `map-*.md`
- `v2-not-closed.md`
- `v2-test-ledger.md`
- `spike-*.md`, `verify-single-db.md`
- `data/*.json`: issue and PR snapshots
- `data/pilot-routing/`: §3.6 raw data

## 8. Requirements on the instruction text, from the evidence

- **Claude Code** cuts at 2,048 chars, and the first part matters most. **Pi** shows only line 1. So line 1 must state what the server does on its own (PR8).
- **Qwen** frames the text as "configuration guidance, not system directives". The text must still work when read that way. That is a reason for calm, explained rules.
- **OpenCode** codemode may route all MCP tools through its own `execute`. GP-LIVE checks this on OpenCode 2 [U].

## 9. Open spikes

M0 build and CI gate: only closed spikes (`S-NODE`, `S-TIMEOUT`) and `S-CODEX` must close before M0 step 6 starts; `S-CODEX` gates it because it decides the GP-LIVE-ROUTING release scope for all 10 agents (row below). `S-COPILOT`, `S-ZCODE`, `S-NAMES`, `S-SKILLS`, `G25` are M2/M3 per their own rows and do not block M0; CI runs their harness case with `SKIPPED`, not `FAIL`, until then.

| Spike | Question | Blocks | Milestone | Updates |
|---|---|---|---|---|
| S-NODE | **Done 2026-10-15** (`https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/spikes-r5/S-NODE.md`). Minimum **Node 24.15.0**: the lowest version that passed all four checks (node:sqlite with no flag, `timeout` sleeps on SQLITE_BUSY with < 2 ms CPU in a 2-process test, FTS5 compiled in, no ExperimentalWarning). 22.14.0 and 23.11.0 lack FTS5; 22.22.2 has FTS5 but prints the warning; 22.12.0 has no node:sqlite. Not tested: 24.0–24.14, 25.x. Install hard-fails with "Node ≥ 24.15.0 required, found <version>"; no fallback | ADR-0002, §6.6 | Closed, M0 | ADR-0002, §6.6, §11 |
| S-TIMEOUT | **Done 2026-10-15** (`https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/spikes-r5/S-TIMEOUT.md`). ctx_execute default = max = 600,000 ms; process tree killed by process group (Unix, `kill(-pid)`, SIGTERM then SIGKILL) and `taskkill /F /T /PID` (Windows, no Job Object — DECISIONS-r9 F6) | §11, GP4 | Closed, M0 | §11, GP4 |
| S-COPILOT | Does Copilot CLI pass `instructions` to the model? Test with a live probe like §3.1 | §3.7 | M2 (only blocks the Copilot CLI instructions row) | §3.1, §3.7 |
| S-ZCODE | Same probe on ZCode | §3.7, Q10 | M2/M3 (blocks the ZCode instructions row and the ADR-0016 ZCode case-A row) | §3.1, §3.7, ADR-0016 |
| S-NAMES | Exact MCP tool names on Copilot CLI, Kiro, ZCode; live check of the Gemini `mcp_` finding | §3.8, GP3 | M3 (blocks the Copilot CLI/Kiro/ZCode rows of `adapters/table.ts` and GP3 hook matchers) | §3.8, `adapters/table.ts`, GP3 fixtures |
| S-SKILLS | Which agents expose a plugin/extension skill as a `/` command, and from which install path | §3.9 | M2 (only blocks the per-agent skill-exposure row, not the skill content itself) | §3.9 |
| S-CODEX | **Done 2026-10-17** (`https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/spikes-r5/S-CODEX.md`). Codex: are MCP tools deferred, and when does the namespace description become visible? Live, 3/3 probes (ChatGPT login, `gpt-6-astra`, stub MCP server): server `instructions` not seen before any tool call (probe 1, 0/1); a tool's full description/param text not stated passively with no call made, even though the tool worked (probe 2, 0/1); once the model actively called the tool, it echoed the tool's full, unpadded description text (probe 3, 1/1). **Verdict: MCP tools are deferred — full metadata reaches the model only at discovery/call time, not at session start.** | Q11 | Closed, M0 (gates the GP-LIVE-ROUTING release scope for all 10 agents, not just Codex's adapter) | §10 Q11, ADR-0004 |
| G25 | Do hooks fire for MCP tools on Copilot CLI, ZCode, Pi and OpenCode 2? | GS3 | Starts in M0 (harness case), closes in M3 (hooks are built) and gates release (GS3) | §1 GS3, ADR-0008 "Open" |
| LV-COMPACT | Per agent: does the host write its own compact summary the model sees? | `adapters/table.ts` `compactSummary` column, GP6 | M3 (one live case per agent; a pass flips that agent's row from `"none"` to `"host"`) | `adapters/table.ts`, GP6 (DECISIONS-r6 D6) |
| LV-READ-EDIT | Deny-then-edit still succeeds after a Read deny on an over-cap file? | ADR-0008 "Read" line, GP3 | M3 | `08-enforcement.md`, `14-tests.md` §6 (DECISIONS-r8, DECISIONS-r9 V1) |
| LV set (T-specs) | Full live-case list closing R9's open items — `T-T4`, `T-X2`, `T-CX`, `T-F3`, `T-ROUTE`, `T-PAR`, `T-SUB`, `T-CMP`, `T-CXC`, `T-SAVE`, `T-CAP`, `T-MEM`, `T-GS6`, `T-F1`, `T-F5` | each item's own row in DECISIONS-r9 §V | M1-M3 per row | `14-tests.md` §6 (one case per id, DECISIONS-r9) |
| O1 | Earlier-error lookup: BM25 alone beats RRF (0.72 vs 0.59 recall@5). Candidate: lower the session list's weight for `toolerr` rows | GP5 ranking weights | M2 (must be measured with `run.mjs` first; not in the design until a measurement shows a gain) | GP5 (DECISIONS-r7 O1) |
| O2 | File-by-topic lookup: recall@5 0.04 on every variant; text search cannot link a later prompt to an old edit row. Candidate without embeddings: store the turn's prompt tokens on each `edit` row | GP5 ranking weights | M2 (must be measured first; not in the design until a measurement shows a gain) | GP5 (DECISIONS-r7 O2) |

## 10. Decisions (all approved 2026-10-14)

| Q | Decision | Status |
|---|---|---|
| Q1 | v1 unit tests stay until v2 passes the 131 KEEP-PASS tests (ADR-0003 r2); `tests/` is deleted in one commit only once v2 also passes that, GS1 holds and the ledger has no empty row | **[D]** |
| Q2 | `ctx_execute` alwaysLoad on Claude Code (ADR-0006) | **[D]** |
| Q3 | **User commands = 3 skills** `/ctx-stats`, `/ctx-doctor`, `/ctx-upgrade` (§3.9); no MCP prompts | **[D]** |
| Q3b | **`ctx_doctor` and `ctx_upgrade` stay as tools, rebuilt for v2** (§3.11) | **[D]** |
| Q4 | **`.claude/skills/context-mode-ops` is removed from the repo** | **[D]** |
| Q4b | **Every file of a removed agent is removed from the repo** (§3.10) | **[D]** |
| Q5 | Budgets: instructions ≤ 2,048 chars; each description ≤ 1,024; descriptions + schemas ≤ 8,000 | **[D]** |
| Q6 | **`ctx_search` default scope = `worktree`** (PRD E3 superseded) | **[D]** |
| Q7 | Pi: same `instructions.md` bytes via `before_agent_start` | **[D]** |
| Q8 | E2E-live runs in the keyless harness (ADR-0012): every step on `claude-sonnet-5 --effort low`, the full case set before `/release`; never CI, never a key, never nightly | **[D]** |
| Q9 | **Test runner = `node:test`**; matrix 3 OS × min/current Node, ≤ 10 min per OS | **[D]** |
| Q10 | Kiro, ZCode: tool descriptions only | **[D]** |
| Q11 | **All 10 agents, Codex included, are supported and release-gated by GP-LIVE-ROUTING**; no `AGENTS.md` | **[D, closed by S-CODEX, 2026-10-17]** — live probe confirms Codex defers MCP tool metadata (name only up front, full description/instructions only at discovery/call time, `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/spikes-r5/S-CODEX.md`); the 37 `defer_loading` references under `codex-rs/core/src` (TECH-SPEC.md:86) still were not read, but the live result answers the question the spike was gating on, so the release gate no longer rests on an unconfirmed assumption |
| Q12 | Prompt texts use bare tool names only (`ctx_execute`); host-prefixed names live only in the adapter name map (§3.8, PR12) | **[D]** |

## 11. Global constants and current rules

These are the current, decided values. Round-by-round history is in §13.

- **Output cap:** one constant, `OUTPUT_CAP = 16384` bytes, for ctx tool replies, the ADR-0016 replace path (main agent and subagent) and the ADR-0008 Read deny threshold. Not the 2 KB `ctx_resume` cap, not the 4 KB doctor cap.
- **`ctx_execute` timeout:** default **600,000 ms**, max 600,000 ms (S-TIMEOUT, done; `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/spikes-r5/S-TIMEOUT.md`); longer work uses `background: true`. 600 s equals Claude Code's own Bash max (`BASH_MAX_TIMEOUT_MS`); a shorter fixed default was rejected because v1 `eea5877b` (#406) removed one for killing Gradle/Maven/SBT builds. Kills the whole process tree (Unix: process group; Windows: Job Object) and bounds the whole handler, batch included. Grep exit 1 is not an error. Languages: shell, powershell, javascript, typescript, python, plus any runtime found on PATH. Code echo is off by default; `summary` turns it back on. `ctx_search` rejects an unknown `query` field with `isError`.
- **Node minimum:** 24.15.0 (S-NODE, done 2026-10-15; `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/spikes-r5/S-NODE.md`). CI matrix: 3 OS × Node 24.15.0 and current (26.x).
- **Fetch:** honours `HTTP(S)_PROXY`/`NO_PROXY`, with an SSRF check on the resolved target host on every hop, including an allowlisted proxy.
- **Tool descriptions:** ≤ 1,024 chars each, enforced by `lint.mjs`. "No regex" is a runtime-code rule only; CI tools such as `lint.mjs` may use regex.
- **Tests:** ADR-0003 r2 + ADR-0017. The 131 v1 KEEP-PASS tests stay; every implementation step has a green E2E case; live E2E runs on `claude-sonnet-5 --effort low` in the keyless harness.
- **Compaction state (DECISIONS-r6 D1):** `B = 2,048` UTF-8 bytes; weights `open_error 900, prompt 500, edit 400, index 200`; `decay = 0.25 + 0.75 · 2^(−age/4)` (half-life 4 turns, integer table); `bonus = 1 + ⌊log2(repeat_count)⌋`; `score = w · decay · bonus`; `ratio = score · 0.7^k / bytes` (k = lines already taken from that section); budgeted lazy-greedy selection by ratio; newest prompt always pinned; a row over 640 B becomes a pointer line `#<seq> (<bytes> B) ctx_resume(seq:<seq>)`; cap 85 candidates per section. A train/held-out tuning sweep found no weight change that beat this baseline on held-out cases; the constants ship unchanged. A full actor/judge live eval (120 calls) is an open item before any future weight change.
- **`ctx_search sort:"timeline"` (D2):** merges ContentStore, SessionDB and auto-memory, each fetched up to `limit` rows before merge; scope filters all three the same way; timestamps normalized to ISO-8601 UTC; order ascending by timestamp, ties by `seq` ascending, no-`seq` rows last; paged by `after` (opaque seq cursor); `offset` is relevance-only, `after` is timeline-only, mixing either raises `isError INVALID_ARGS`; empty `queries` is allowed and returns the newest page.
- **`decision` row (D3):** written only for an `AskUserQuestion` tool answer or a plain option echo on the next turn; never a prose/shape classifier; not a compaction candidate; searchable via `ctx_search(source:"decision")`.
- **Cross-session ranking (D4):** `scope:"session"` keeps v1 BM25 unchanged; `scope:"project"`/`"global"` order current session first, then Reciprocal Rank Fusion (`k = 60`) of a BM25 list (`bm25(chunks, 5.0, 1.0)`) and a recency list, then `seq` ascending. Measured on 90 real queries: recall@5 0.48, MRR 0.41, p95 27 ms, against v1's 0.27 / 0.22 / 8.6 ms. No MMR: `λ = 0.7` gave no recall gain (0.47) at about twice the latency, so it stays out of the design (DECISIONS-r7 R1, R2).
- **Compaction delivery per agent (D6):** `adapters/table.ts` column `compactSummary: "host" | "none"`. Claude Code = `"host"`: after compaction, inject one pointer line only (no state block) — `context-mode: earlier work of this session is in ctx_resume (state block) and ctx_search(scope:"session", sort:"timeline").` — and `ctx_resume()` with no `seq` returns the 2,048 B block on demand. Every other agent = `"none"` until its LV-COMPACT live case (§9, M3) passes: inject the 2,048 B D1 block, unchanged algorithm and constants, through that agent's existing ADR-0009 §6 delivery path. The pointer line is byte-stable: no clock, no counts, bare tool names, framed as data. Evidence: `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/memory-r6/eval/results.md` run2.mjs, 20 real compaction points, 6 projects, Sonnet low actor+judge, keyless, $3.79 — not statistically significant at n=20 (sign test p ~0.69), so this is the lower-risk default, not a proven win.

## 12. Implementation plan

Milestones M0–M7 cover the current scope: 10 agents, 9 tools, single DB, enforcement, compaction, doctor/upgrade, release, v1 retention. Exit of v2.0 = every GS row in §1.

Each step is one PR. No step is done until its E2E gate runs green (ADR-0017). "Gate" names the GP case or live case and its `covers` paths (the live harness runs only the cases whose `covers` match the changed files, §6.9). "Impl file" names the `docs/architecture/modules/` file to follow for that step (ADR-0018).

### M0 — Scaffolding and open spikes

| # | Step | ADRs | Impl file | Gate |
|---|---|---|---|---|
| 1 | Build pipeline: bundle `server.bundle.mjs` and the hook entry from `src/`, inlining `src/prompt/instructions.md` and `src/prompt/tools/*.md` (§3.3); the output holds one `package.json` in the ADR-0019 D1 shape and the `cli.mjs` bundle | ADR-0002, ADR-0004 | `docs/architecture/modules/13-build-release.md` | GP1, a Claude-Code-only install case; `covers: ["src/prompt/", "build/"]` |
| 2 | E2E harness skeleton: `e2e/harness/mcp-client.mjs`, `hook-runner.mjs`, `db-dump.mjs`, `normalize.mjs` (§4) | ADR-0003 | `docs/architecture/modules/14-tests.md` | A harness-smoke GP1 case: spawn the bundle, send `initialize` + `tools/list`, assert the 9 tool names in order; `covers: ["e2e/harness/"]` |
| 3 | GP fixture recorder: capture one real Claude Code 2.1.283 payload per hook event (`SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`) into `e2e/fixtures/claude-code/2.1.283/*.json` | ADR-0001, ADR-0003 | `docs/architecture/modules/14-tests.md` | GP3 case replaying the fixture through `hook-runner.mjs`; asserts exit 0 and the native stdout shape; `covers: ["e2e/fixtures/claude-code/"]` |
| 4 | CI matrix: `ci.yml` on 3 OS × Node 24.15.0 and current, running GP1–GP3 as they exist (§6.6) | ADR-0002 (S-NODE) | `docs/architecture/modules/13-build-release.md` | The CI run itself; `covers: [".github/workflows/ci.yml"]` |
| 5 | KEEP-PASS runner: a CI job running the 131 KEEP-PASS files from `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/review/TEST-TRIAGE-r2.md` on vitest+TS, next to GP1–GP11 | ADR-0003 r2 | `docs/architecture/modules/14-tests.md` | A local case asserting the job config lists exactly 131 files; `covers: ["https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/review/TEST-TRIAGE-r2.md", "tests/"]` |
| 6 | Open spikes: S-COPILOT, S-ZCODE, S-NAMES, S-SKILLS, S-CODEX, G25 (§9 table; each names its own milestone and the doc it updates) | varies, see §9 | `docs/architecture/modules/10-adapters.md` | Spike-specific; §9 |

### M1 — Single DB and storage

Schema and migrations; the `#645` path resolver; `BEGIN IMMEDIATE` write rules; corruption rename; cleanup atomicity; WAL checkpoint-on-close.

| ADRs | Impl file | Gate |
|---|---|---|
| ADR-0002, ADR-0007 decision 4 | `docs/architecture/modules/01-contracts.md`, `docs/architecture/modules/02-store.md` | GP8 (concurrency), GP9 (lifecycle); `covers: ["src/core/store/", "src/core/journal/", "src/core/project/"]` |

### M2 — MCP surface and prompt delivery

The 9-tool `tools/list` surface; `instructions.md` + per-tool descriptions, inlined and linted; `alwaysLoad` on `ctx_execute`; dual 2026-07-28 / 2025-xx serving. S-COPILOT, S-SKILLS and the ZCode instructions row of S-ZCODE close here.

| ADRs | Impl file | Gate |
|---|---|---|
| ADR-0004, ADR-0005, ADR-0006, ADR-0007 | `docs/architecture/modules/11-server.md` | GP1, GP2; `covers: ["src/prompt/", "src/server.ts"]` |

### M3 — Enforcement and subagent protection

The shell parser (lexer + recursive descent); post-run replace for the main agent on agents that support it (DECISIONS-r10; the curl/wget/build-tool size-guess deny is removed there); user `permissions.deny`; case A/B/C subagent output budget. S-NAMES and the ZCode case-A row of S-ZCODE close here; G25 closes here (hooks exist to test).

| ADRs | Impl file | Gate |
|---|---|---|
| ADR-0008, ADR-0016 | `docs/architecture/modules/08-enforcement.md`, `docs/architecture/modules/09-hooks.md` | GP3, incl. the Read-deny golden cases and the `LV-READ-EDIT` live case (DECISIONS-r8); `covers: ["src/hooks/", "src/adapters/"]` |

### M4 — Compaction and memory

Journal write path; candidate selection; budgeted greedy render; per-agent delivery; `sort:"timeline"` paging; the `decision` row and `source:"decision"`; cross-session RRF ranking (DECISIONS-r6 D1–D4).

| ADRs | Impl file | Gate |
|---|---|---|
| ADR-0009 | `docs/architecture/modules/06-tools-session.md`, `docs/architecture/modules/05-tools-index.md` | GP6, GP5; `covers: ["src/core/compaction/"]` |
| — | — | Eval step: run `e2e/live/run.mjs` actor/judge matrix (120 calls, `claude-sonnet-5 --effort low`) before any future weight change to D1's constants; `/release` does not gate on this run until it closes |
| — | `adapters/table.ts` | M3 step: run LV-COMPACT (§9) once per agent; a pass flips that agent's `compactSummary` row from `"none"` to `"host"` (DECISIONS-r6 D6); no row changes without a passing live check |

### M5 — Doctor, upgrade and v1 cleanup

`ctx_doctor` D1–D10; `ctx_upgrade` install/upgrade/uninstall; `detectV1` per agent.

| ADRs | Impl file | Gate |
|---|---|---|
| ADR-0010, ADR-0011 | `docs/architecture/modules/07-tools-ops.md` | GP11; `covers: ["src/core/ops/"]` |

### M6 — Release automation and issue intake

Branches (`main`/`v2`/`release`); the `/release` skill; `release.yml`; issue forms and the typed debug report; README and repo cleanup.

| ADRs | Impl file | Gate |
|---|---|---|
| ADR-0011, ADR-0013, ADR-0014, ADR-0015 | `docs/architecture/modules/13-build-release.md` | The full keyless harness run (§6.9) plus a release-staging smoke install; `covers: [".github/", ".claude/skills/release/", "README.md"]` |

### M7 — v1 retention and v2.0 release

R1–R8 of ADR-0017; the v1-migration live case set; final doc sign-off.

| ADRs | Impl file | Gate |
|---|---|---|
| ADR-0017 | `docs/architecture/modules/15-v1-transition.md` | Every GS row in §1 |

## 13. Changes

- r1 → r2 (2026-10-14): "95 of 210 tests spawn processes" corrected to 64 (the r1 regex matched the bare word `spawn`; r2's is `child_process\|spawn\(\|execa\|execFile\|StdioClientTransport`); "tool descriptions are always sent" shown false on Claude Code and Codex by live probe (§3.1); instructions budget corrected from "≤ 1,500 tokens" to "≤ 2,048 chars" (Claude Code's cut is in chars); routing-skill lint counts corrected to 16 caps / 2 doubt / 10 tags / 103 quoted; GP-LIVE "20 commands" replaced by the §6.5 spec and the §3.6 pilot.
- r3 (2026-10-14, `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/review/DECISIONS-r3.md`, all 19 accepted): set the constants now in §11 (output cap, `ctx_execute` timeout shape, tool-description budget, no-regex scope) and the ADR-0003 r2 test shape (v1 tests stay, E2E at every step, live E2E on Sonnet low); demoted Q11 to pending S-CODEX.
- r4 fix pass: rewrote §6.9 from a CI-job-with-keys design to ADR-0012's keyless harness (no API key anywhere); added the fix-r4 assertions across GP1–GP11 and the doctor table; added §1a (table ownership) and §6.2a (contract/unit assertions); stated S-NODE's hard-fail path.
- r5 (2026-10-15): closed S-NODE (Node 24.15.0) and S-TIMEOUT (600,000 ms) spikes; ran the ADR-0006 re-probe and corrected the §3.6 L2/L3 ground truth.
- r3 of this spec (2026-10-15, this pass): header and ADR range brought current (0001–0017); §2 and §6.1 corrected to the no-CLI/3-skills and keyless-harness/KEEP-PASS design; §10 Q1 and Q8 corrected; §9 spikes given a milestone and a target doc each; §11–§13 restructured into one current-constants section, one implementation plan, and one final changelog.
- r6 (2026-10-16, `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/review/DECISIONS-r6.md` D1–D4): GP5 adds the `sort:"timeline"` merge/page rules and the D4 RRF (k=60) cross-session order; GP6 adds the `decision` row rule (`AskUserQuestion` answer or option echo only, never a shape classifier) and the GP6 open-error budget-skip assertion; §11 gains the full D1 compaction formula (unchanged constants — the tuning sweep did not beat the baseline on held-out cases), the D2 timeline contract, the D3 decision rule, and the D4 RRF rule; the M4 implementation step adds the 120-call actor/judge eval as an open item, not a release gate.
- D6 (2026-10-16, `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/review/DECISIONS-r6.md` D6, `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/memory-r6/eval/results.md`): GP6 adds the `adapters/table.ts` `compactSummary` column (`"host"` \| `"none"`); Claude Code injects one pointer line only, every other agent keeps the 2,048 B D1 block until its LV-COMPACT live check passes; §9 adds the LV-COMPACT spike (M3); §11 and the M4 plan state the rule and its gate.
- r9 (2026-10-16, `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/review/DECISIONS-r9.md`, role S7): §3.8 Codex row fixed to one name `mcp__context_mode__ctx_execute` (underscore, R1); §3.8 rule 4 added (matcher = native tool names + own prefix, Codex `Bash` example, R4); `covers` paths corrected to the real tree — `build/` (M0 step 1), `src/core/store/`+`src/core/journal/`+`src/core/project/` (M1), `src/core/compaction/` (M4), `src/core/ops/` (M5) (F3); GP9 and the S-TIMEOUT row drop the Windows Job Object text for `taskkill /F /T /PID` of own children, no native addon shipped (F6); GS6 (§1) marked decided, not open, with its constant names and T-GS6 cite (V14); §9 gains the LV-READ-EDIT row and one row listing every outstanding T-spec id, each pointing at its `14-tests.md` §6 case.
- r7 (2026-10-16, `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/review/DECISIONS-r7.md`): §6.2 GP5 row adds golden recall@5 cases per query type (decision, errorfix, timeline); §9 adds open spikes O1 (earlier-error lookup) and O2 (file-by-topic lookup), both M2; §11 states the measured recall@5/MRR/p95 numbers for BM25+RRF versus v1 and drops MMR, which gave no gain.
- r9 intern-question close (2026-10-16, role S1): §9 states which spikes gate M0 step 6 (`S-NODE`, `S-TIMEOUT`, `S-CODEX` only; `S-COPILOT`/`S-ZCODE`/`S-NAMES`/`S-SKILLS`/`G25` are M2/M3 and print `SKIPPED`, not `FAIL`, before then).
- M7-S1 (2026-10-19): §1.1 added: GS1–GS11 status from `gate.mjs --milestone M7` and `e2e/live/run.mjs --all`. GS5/GS10 fail on `check-removed.mjs` (22 paths), GS11 fails on live T-CMP; R1, R2 PENDING owner (D-M7-arch-5). M7 not marked done.
- M7-S2 (2026-10-19): §1.1 re-measured on d1accdd4. GS5 and GS10 R3–R8 now PASS (`check-removed.mjs` exit 0, 6/6 v1-migration cases); gate --milestone M7 all layers PASS; live --all 27/31 (4 FAIL). GS6 fails (T-GS6 Claude Code p95 46 ms, T-F1 291 ms), GS11 fails (ci-config timeout 10 vs 20, T-CMP). R1, R2 PENDING owner. M7 not marked done.
