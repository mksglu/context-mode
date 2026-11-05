# ADR-0016: Large output must not enter a subagent's context either

- Status: Accepted as a requirement (2026-10-14, owner: "subagent'ların context'ine girmemeli … bunu fixle, MUST"). The mechanism is Proposed until live checks LV8–LV10 pass.
- Related: ADR-0008 r3 (deny scope), ADR-0012 (live harness). Replaces ADR-0008 r3 change #5 ("subagent without ctx tools → allow").

> **Update 2026-10-20 (DECISIONS-r10).** The main agent now uses the same replace as case C: when a result is larger than `OUTPUT_CAP`, `PostToolUse` indexes it and returns BM25-selected chunks plus the "more" line through `updatedToolOutput`. Hints are removed.

## Problem

A subagent has its own context window. If a big tool output lands there, the subagent fills its token limit, compacts or fails. v1 had two bad options:
- deny with a ctx alternative the subagent cannot call: a dead end (#794, #1037)
- allow: the subagent's context floods

## Rule

**The same output budget applies in every context: the main session and every subagent.** What changes per subagent is only *which* alternative the deny or the rewrite names, so that it is always one the subagent can actually call.

## How the subagent's tools are known

- A tool call is inside a subagent only when the hook payload carries `agent_id`. The main thread of a session started with `--agent <type>` also carries `agent_type`, but no `agent_id`; that thread is the main session, not a subagent. `agent_type` is used only to look up the subagent's tool-set row once `agent_id` has already said this is a subagent call.
- A custom agent: the server reads the agent's frontmatter from project agents (`.claude/agents/<type>.md`), user agents (same path, user dir), plugin agents, and `--agents` JSON, in that order, and computes its tool set as `tools:` minus `disallowedTools:`. No `tools:` line means the agent inherits all tools, MCP included, still minus anything in `disallowedTools:`. An `agent_type` not found in any of these sources goes to case B or C, never case A.
- A built-in agent type (Explore, Plan, general-purpose, …): its tool set is a fixed row in the adapter table, filled from the live check LV8. Until LV8 runs, a built-in type is treated as having no ctx tools (case B or C below), which is the safe side for the context.
- OpenCode 2: the subagent's tool set is read from its plugin manifest at spawn time, the same list the `ctx.tool.transform`/`editor.add` pattern registers against; a tool absent from that manifest is treated as not present for this agent, no fallback.
- Remote-WSL: the project root used for `agent_type`/source resolution is the path the IDE server reports over its own remote-workspace API (the same root VS Code's Remote-WSL extension resolves to), not a guess from the host OS path. #1032 is closed on this mechanism; no needs-decision rows remain.

## Three cases, one path each

| Case | Subagent has | Mechanism | Context gets |
|---|---|---|---|
| A | ctx tools | the same deny as the main session (ADR-0008) | only what ctx tools return |
| B | Bash, no ctx tools | **deny with the rewritten command** (Q3: Claude Code ignores `allow` + `updatedInput` for Bash, v1 4bc292fc). The reason carries the exact wrapper command; The command becomes `node <bundle>/run.mjs <base64 of the original>`. Before running, the wrapper decodes that payload and re-runs the full deny pipeline (shell parser + the user's `permissions.deny`) against the decoded command; a command the user has blocked stays denied even through the rewritten path. Otherwise the wrapper runs the original command unchanged (same cwd, same exit code), indexes the full output in `context.db`, and prints the chunks that best match the intent (the call's `description` field) up to the budget, then one line: `more: node <bundle>/search.mjs <source-id> "<terms>"`. The subagent can run that line with its own Bash | selected whole chunks + a follow-up it can call |
| C | neither ctx tools nor Bash | **replace after the run**: PostToolUse `updatedToolOutput` (Claude Code, all tools). The full output is indexed; the subagent sees the best-matching whole chunks up to the budget plus the source id. For Read, the deny names Read with `offset`/`limit`, which the subagent has | selected whole chunks |

No case cuts text: the wrapper and the replacement **select whole chunks** by BM25 score against the intent, under a byte budget (budgeted greedy, the same selection as ADR-0009). Nothing is truncated mid-chunk. Two chunks with an equal score break the tie by `seq` descending, the identical rule ADR-0009 §4 states for the main session.

The same applies to WebFetch and to the curl/wget/build cases of ADR-0008 in every context.

Indexing the full output (case B and C) runs on a worker thread (or child process), matching `verify-single-db.md`'s own recommendation, so one subagent's large-output indexing never inflates the wall time of a second subagent's concurrent hook call.

The deny-reason template and the `more:` line template are a drafts.md id block, so `lint.mjs` checks them against PR1/PR2/PR5/PR7 like any other model-facing text.

## Per agent

| Agent | Case A | Case B (rewrite) | Case C (replace) |
|---|---|---|---|
| Claude Code | yes | deny + rewritten command in the reason (Q3) | `updatedToolOutput`, must match the tool's output shape (LV2) |
| Copilot CLI | yes; source = hook payload field `cwd` only, missing -> doctor error, no fallback | `modifiedArgs` | `modifiedResult` |
| Pi | yes | mutate `event.input` in place pre-call (`tool_call`) | set `content` AND `structuredContent` together post-call (`tool_result`), to avoid the drop the Pi API docs warn about |
| OpenCode 2 | yes | mutate input in-process via the `ctx.tool.transform`/`editor.add` pattern (e.g. `tool/plugin/skill.ts:33-36`) | replace result in-process via the same pattern |
| Codex, Qwen | yes; Qwen Code source = `QWEN_PROJECT_DIR` only, missing -> doctor error, no cwd fallback (owner rule: no fallback chains) | rewrite supported | replace only as a reason/error text; the selected chunks go in that text |
| Gemini | yes, via a Gemini-specific external-MCP matcher derived from `mcp-tool.ts`'s `generateValidName()` (prefix `mcp_`, single-`_` join, non `[A-Za-z0-9_-.:]` chars collapsed to `_`) — this is an exception to Q1, not a reopening of it | rewrite supported | replace only as a reason/error text |
| VS Code | yes | rewrite supported | no output replacement: case C falls to the deny with an alternative the subagent has (Read `offset`/`limit`, Grep `output_mode:"count"`) |
| ZCode | Case A = `[U]`, pending G25/GP-LIVE-HOOKS | Case B = `[U]` (DOCS-only; no live verification that ZCode's PreToolUse output honors a Claude-Code-style `updatedInput` equivalent), pending S-ZCODE/GP-LIVE-HOOKS | no output replacement; the Case C fallback (Read `offset`/`limit`, Grep `output_mode:"count"`) is `[U]` until S-NAMES confirms ZCode's builtin tool names and parameter support |
| Kiro | deny (Kiro supports deny) with the alternative the subagent has; no hint-only path, because the MUST forbids large output in any context. Kiro has no rewrite/replace response channel at all (`src/adapters/kiro/index.ts:9-10`), not just for subagent output — any other part of this spec that assumes a tool-input rewrite on Kiro is false for this agent | — | — |

## Live checks (ADR-0012 harness)

| ID | Check |
|---|---|
| LV8 | Which tools do Claude Code's built-in subagent types have? Does Explore / Plan / general-purpose see MCP tools? |
| LV9 | Case B on Claude Code: a subagent with `tools: Bash, Read` runs a 5 MB output command; assert its transcript holds ≤ budget bytes from that call and the subagent used the `more:` line |
| LV10 | Case C on Claude Code: a subagent with `tools: Read, Grep, WebFetch` reads a 300 KB file and greps a large tree; assert ≤ budget bytes reached it and the task still finished |
| LV1, LV2 | from ADR-0008: `allow` + `updatedInput` on Bash, and `updatedToolOutput` shapes for Read, Grep, WebFetch |

LV1 confirms, rather than decides, that Claude Code ignores `allow` + `updatedInput` on Bash; Q3 already settled case B to deny with the rewritten command regardless of that result.

## Golden cases (GP3)

- Subagent type with `tools: Bash` + `curl -s https://x.io/big.json` → rewritten to `run.mjs`, output ≤ budget, `more:` line present
- Subagent type with `tools: Read` + Read of a 300 KB file → deny naming Read with `offset`/`limit`
- Subagent type with no `tools:` line → same deny as the main session
- Unknown built-in type before LV8 → case B or C, never a plain allow
- Two chunks with an equal BM25 score → the tie breaks by `seq` descending (matches ADR-0009 §4)
- Case B or C indexing a 5 MB output while a second simulated agent's hook call is in flight → the second call's wall time is not inflated by the first's indexing
- A Gemini external-MCP tool name generated by `generateValidName()` → the matcher in the Per agent table matches it
- A subagent with `tools: Bash` and a user `permissions.deny` rule for `rm -rf /`, with the command wrapped into `run.mjs` → still blocked, never reaches exec
- The main thread of `claude --agent x` (carries `agent_type`, no `agent_id`) → treated as the main session, not a subagent
- A subagent with `disallowedTools: mcp__*` in its frontmatter → ctx tools are excluded from its tool set, so it gets case B/C, never a case-A deny naming a tool it cannot call

## r3 decisions (2026-10-14, `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/review/DECISIONS-r3.md`)

- **Q3:** case B never uses `allow` + `updatedInput`. The deny reason carries the full rewritten wrapper command; the subagent runs it with its own Bash.
- **Q1:** case C also covers other MCP servers' tools (`mcp__<other>__*`).
- **Q2:** budget = the global `OUTPUT_CAP = 16384`.
- **Q23:** subagent detection keys on `agent_id` only; `agent_type` only selects the tool-set row; the tool set is `tools:` minus `disallowedTools:`, read from project/user/plugin agents and `--agents` JSON; an unresolved `agent_type` goes to case B/C, never case A (see "How the subagent's tools are known" above).

## Changes

r4 fix pass: split the Per agent table rows for Qwen, Copilot CLI, Pi, OpenCode 2, Gemini, VS Code and ZCode so each names its own source/mechanism and open-verification tag instead of a shared "yes"; fixed the Claude Code case B cell to match Q3 (was self-contradicting); added the deny-pipeline re-check for the `run.mjs` wrapper, the tie-break rule, the worker-thread indexing note, the Kiro no-rewrite-channel note, and the Remote-WSL/OpenCode-2 detection rows.
- 2026-10-20 (DECISIONS-r10): main agent uses the same replace as case C.
- 2026-11-05 (D-SUB-NOCTX-1, #1311): a subagent without ctx tools runs WebFetch/curl at PreToolUse; on a row with a replace channel, case C replaces a large output afterwards.
