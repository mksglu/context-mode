# 10 — Module `adapters`: implementation spec

Owner module: `adapters` (00-architecture.md §2). Follows 00-architecture.md exactly; deviations are listed under "Assumptions".

Files this module owns, in build order:

1. `src/adapters/table.ts`
2. `src/adapters/claude-code.ts`
3. `src/adapters/codex.ts`
4. `src/adapters/gemini.ts`
5. `src/adapters/qwen.ts`
6. `src/adapters/copilot-cli.ts`
7. `src/adapters/vscode.ts`
8. `src/adapters/kiro.ts`
9. `src/adapters/zcode.ts`
10. `src/adapters/pi.ts`
11. `src/adapters/opencode.ts`

Imports allowed: `contracts` only (00-architecture.md §2). No other module. `enforcement`, `hooks`, `server` read this module; this module reads nothing from them.

---

## 1. `src/adapters/table.ts`

### 1.1 Exports

```ts
export const ADAPTERS: readonly AdapterRow[];
export function getAdapter(id: AgentId): AdapterRow;
```

`AdapterRow` and `AgentId` are defined in `src/core/contracts/types.ts` / `agents.ts` (00-architecture.md §3.1). This file does not redefine them.

### 1.2 `getAdapter`

- Input: `id: AgentId`.
- Output: `AdapterRow`.
- Steps:
  1. Find the row in `ADAPTERS` whose `id === id`.
  2. `AGENT_IDS` is exhaustive (10 entries), so every `AgentId` has exactly one row; no "not found" branch exists.
- Errors: none. `AgentId` is a closed union; a value outside it is a TypeScript compile error, not a runtime case.
- Constants used: `AGENT_IDS` (`contracts/agents.ts`).
- E2E: GP1 (install/handshake, ×10 adapters) proves every id resolves. Covers: `src/adapters/table.ts`.

### 1.3 The ten rows

One row per agent, PRD §3 agent list order. `installMode`, `projectSource` and `toolNamePrefix` values are fixed below; `eventMap` values are fixed in §2–§11 per agent together with decode/encode. Columns match the `AdapterRow` fields (00-architecture.md §3.1).

`AdapterRow` gains two fields in this revision (DECISIONS-r9 R4, R5): `nativeTools: { shell: string[]; read?: string[]; grep?: string[]; webfetch?: string[]; edit?: string[] }` and `execReadOnlyHint: boolean`. Both are listed per row below the main table (§1.3a) to keep this table within line width.

| id | installMode | projectSource (Q11) | toolNamePrefix | compactDelivery | compactSummary | hookTimeoutMs | denyChannel |
|---|---|---|---|---|---|---|---|
| `claude-code` | `"marketplace"` | `"env:CLAUDE_PROJECT_DIR"` | `"mcp__plugin_context-mode_context-mode__"` | `"sessionstart"` | `"host"` | `5000` | `"deny-reason"` |
| `codex` | `"config-mcp"` | `"arg:--agent+cwd"` | `"mcp__context_mode__"` | `"sessionstart"` | `"none"` | `5000` | `"deny-reason"` |
| `gemini` | `"extension"` | `"spawn-cwd"` | `"mcp_context-mode_"` | `"pending-flag"` | `"none"` | `5000` | `"deny-reason"` |
| `qwen` | `"extension"` | `"spawn-cwd"` | `"mcp__context-mode__"` | `"sessionstart"` | `"none"` | `5000` | `"deny-reason"` |
| `copilot-cli` | `"plugin"` | `"arg:--agent+cwd"` | `"mcp_context-mode_"` | `"pending-flag"` | `"none"` | `5000` | `"deny-reason"` |
| `vscode` | `"mcp-entry"` | `"arg:workspaceFolder"` | `"mcp_context-mode_"` | `"pending-flag"` | `"none"` | `5000` | `"deny-reason"` |
| `kiro` | `"mcp-entry"` | `"arg:--agent+cwd"` | `"mcp_context-mode_"` | `"none"` | `"none"` | `5000` | `"hint-only"` |
| `zcode` | `"hooks+mcp"` | `"spawn-cwd"` | `"mcp__context-mode__"` [unverified, T-ZC] | `"sessionstart"` | `"none"` | `5000` | `"deny-reason"` |
| `pi` | `"in-process"` | `"pi:ctx.cwd"` | `""` | `"pi-flag"` | `"none"` | n/a (in-process, no spawn) | `"deny-reason"` |
| `opencode` | `"in-process"` | `"spawn-cwd"` | `""` | `"opencode-cache"` | `"none"` | n/a (in-process, no spawn) | `"deny-reason"` |

Citations: `installMode` — PRD §3 agent table. `projectSource` — PRD §5 table (Q11, ADR-0007); Kiro row — DECISIONS-r3 Q24 item 2. `toolNamePrefix` — TECH-SPEC §3.8 (Claude Code, Codex, Gemini, Qwen, OpenCode 2, VS Code, Pi rows are `[V]`; Copilot CLI, Kiro are `[U]`, S-NAMES, resolved here as Assumption A1 below). `codex` value is `"mcp__context_mode__"` (underscore, DECISIONS-r9 R1): Codex replaces every character that is not ASCII alnum or `_` with `_` in the server name (`codex-rs/codex-mcp/src/mcp/mod.rs:587-602` `sanitize_responses_api_tool_name`, `codex-mcp/src/tools.rs:22,140,146`; live `mcp__context_mode__ctx_execute` observed in 3 runs, `out/final/probe-codex.md` F1). `zcode` value is unverified — no source and no live probe name it; it is marked `[unverified, T-ZC]` and decided only by live test spec T-ZC (§1.5a), never by taste (DECISIONS-r9 R3). `compactDelivery` — PRD §11 delivery table. `denyChannel` — spike-hooks-verified.md §1 (Kiro: "any exit ≠0" with no structured decision field in the matrix; every other agent carries a `permissionDecision`/`decision`/`{block,reason}`/`Tool.Error` reason channel). `compactSummary` — DECISIONS-r6 D6, `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/memory-r6/eval/results.md` ("Resume-quality eval on real compaction points"). Rule: Claude Code is `"host"` — it writes its own compact summary, so after compaction the adapter injects one pointer line only, no state block: `context-mode: earlier work of this session is in ctx_resume (state block) and ctx_search(scope:"session", sort:"timeline").` The 2,048 B block stays available on demand through `ctx_resume()` with no `seq`. Every other agent is `"none"` — the adapter injects the 2,048 B D1 block through its own `compactDelivery` path (ADR-0009 §6) — until a per-agent live check LV-COMPACT (milestone M3) shows that agent's host writes its own summary, at which point its row flips to `"host"`. The D1 algorithm and constants (`COMPACTION_BUDGET_BYTES` etc., see `impl/06-tools-session.md`) do not change for either value.

Note (DECISIONS-r9 V9): Claude Code's `compactSummary: "host"` row stays `"host"` only until live test spec T-CMP runs (`DECISIONS-r9` V9, arms B1-B3/B5). If arm (a) of T-CMP fails, the `claude-code` row flips to `"none"` in the same commit that records the failure — no separate migration step.

### 1.3a `nativeTools` and `execReadOnlyHint` per row (DECISIONS-r9 R4, R5)

| id | nativeTools.shell | nativeTools.read | nativeTools.grep | nativeTools.webfetch | nativeTools.edit | execReadOnlyHint |
|---|---|---|---|---|---|---|
| `claude-code` | `["Bash"]` | `["Read"]` | `["Grep"]` | `["WebFetch"]` | `["Write","Edit","NotebookEdit"]` | `false` |
| `codex` | `["Bash"]` | — | — | — | `["apply_patch"]` | `true` |
| `gemini` | filtered in hook body (§1.5a), not host matcher | — | — | — | — | `false` |
| `qwen` | `["run_shell_command","Shell"]` | `["read_file"]` | `["grep_search"]` | `["web_fetch"]` | — | `false` |
| `copilot-cli` | filtered in hook body (§1.5a), not host matcher | — | — | — | — | `false` |
| `vscode` | filtered in hook body (§1.5a), not host matcher | — | — | — | — | `false` |
| `kiro` | matcher ids only (§1.5), no native-name filter | — | — | — | — | `false` |
| `zcode` | Claude names assumed `["Bash"]`, unverified (T-ZC) | — | — | — | — | `false` |
| `pi` | filtered in `enforcement.decide` (§1.5, `nativeTools` passed through, no host matcher) | — | — | — | — | `false` |
| `opencode` | filtered in `enforcement.decide` (§1.5, `nativeTools` passed through, no host matcher) | — | — | — | — | `false` |

`qwen.nativeTools.shell` lists both `run_shell_command` and `Shell` because `tool-names.ts:28,121` and this file's prior draft (`10-adapters.md:199` before this revision) disagreed on the live name; both are kept until one is retired by a live check, per DECISIONS-r9 R4 evidence note. Every other `nativeTools` value is `[]`/absent unless listed. `execReadOnlyHint = true` only for `codex`; the MCP server reads the row for the agent identified by its own `projectSource` resolution (`"arg:--agent+cwd"`) and sets `annotations.readOnlyHint = true` on `ctx_execute` only when `execReadOnlyHint` is `true` for that agent. Every agent (including Codex) keeps `readOnlyHint` on `ctx_search`, `ctx_resume`, `ctx_stats` regardless of this field (DECISIONS-r9 R5).

### 1.4 `eventMap` per row (native hook/channel name per canonical event)

| id | SessionStart | UserPromptSubmit | PreToolUse | PostToolUse | PreCompact (aux) |
|---|---|---|---|---|---|
| `claude-code` | `SessionStart` | `UserPromptSubmit` | `PreToolUse` | `PostToolUse` | — (source=`compact` on SessionStart) |
| `codex` | `SessionStart` | `UserPromptSubmit` | `PreToolUse` | `PostToolUse` | — (source on SessionStart) |
| `gemini` | — (dropped, D-FU-GCH-1; resume hint on the first `BeforeAgent` of a session, D-FU-GCH-2) | `BeforeAgent` | `BeforeTool` | `AfterTool` | `PreCompress` |
| `qwen` | `SessionStart` | `UserPromptSubmit` | `PreToolUse` | `PostToolUse` | — (source on SessionStart) |
| `copilot-cli` | `sessionStart` | `userPromptSubmitted` | `preToolUse` | `postToolUse` | — (no PreCompact hook; substitute is the next `userPromptSubmitted`/`preToolUse`) |
| `vscode` | `SessionStart` | `UserPromptSubmit` | `PreToolUse` | `PostToolUse` | — (no PreCompact hook; substitute is the next `UserPromptSubmit`) |
| `kiro` | `SessionStart` (legacy `agentSpawn`) | `UserPromptSubmit` (D-FU-RM-KIRO-1; legacy `PromptSubmit`, `userPromptSubmit` still decode) | `PreToolUse` | `PostToolUse` | none — documented gap (DECISIONS-r3 Q24 item 6) |
| `zcode` | `SessionStart` | `UserPromptSubmit` | `PreToolUse` | `PostToolUse` | — (source on SessionStart) |
| `pi` | `session_start` (compact: `session_compact`) | `input` | `tool_call` | `tool_result` | — (`session_compact` event covers it) |
| `opencode` | session hook `context` | session hook `prompt` | `execute.before` | `execute.after` | session hook `compaction` |

First-turn resume hint (D-FU-GCH-2): a row whose `eventMap` has no `SessionStart` gets the resume hint from `UserPromptSubmit` instead. It fires when all of these hold: the payload session id has no journal row yet (first turn), the `resume-hint` marker for that session is unused (`shouldHint`, once per session), and the worktree already holds a journal row of this agent (something to resume). The check runs before the turn's own prompt row is queued. A later turn of the same session never gets it (GP6/no-resume-hint-mid-session, GP6/gemini-resume-hint-first-turn-only).

Template hook files: `hooks/codex.json`, `hooks/vscode.json` and `hooks/copilot-cli.json` are templates. These hosts have no documented plugin-root variable, so the commands hold the bare `node hook.mjs` form; the install docs one-line writer fills the absolute path (D-FU-RM-TEMPLATES-1). Do not copy them by hand.

Citation: `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/spike-hooks-verified.md` §1 matrix, per-agent rows. Kiro and Copilot CLI dual-casing (`sessionStart`/`SessionStart` etc.) — spike §2 per-agent write-up.

### 1.5 Hook config format, matcher and timeout key per host

Matcher rule (DECISIONS-r9 R4): for every agent with a host-side matcher field, the matcher is generated, not hand-written. `build/manifests.ts` builds it from this row's `nativeTools` (§1.3a) and `toolNamePrefix` (§1.3) as:

```
^(<all nativeTools names, escaped, joined with |>|<escaped toolNamePrefix>ctx_.*)$
```

So the matcher always sees both the host's own built-in tool names (`Bash`, `apply_patch`, `read_file`, …) and this server's own `ctx_*` tools. A matcher built from only the own prefix never sees the calls ADR-0008 denies — those are native-tool calls, not `ctx_*` calls. Agents that filter in the hook body instead of a host matcher field (`gemini`, `copilot-cli`, `vscode`, `pi`, `opencode`) apply the same `nativeTools` set inside that body check, not a regex.

| id | Config file(s) | Shape | Matcher field | Timeout key |
|---|---|---|---|---|
| `claude-code` | plugin `hooks/hooks.json` | `{hooks:{<Event>:[{matcher,hooks:[{type:"command",command,timeout,async}]}]}}` | `matcher` regex `^(Bash|Read|Grep|WebFetch|Write|Edit|NotebookEdit|mcp__plugin_context-mode_context-mode__ctx_.*)$` | `timeout` (seconds; generated value = `hookTimeoutMs/1000`) |
| `codex` | `config.toml` `[mcp_servers.context_mode]` + `$CODEX_HOME/hooks.json` (same shape as Claude Code) | `{hooks:{<Event>:[{matcher,hooks:[{type:"command",command,timeout}]}]}}` | `matcher` regex `^(Bash|apply_patch|mcp__context_mode__ctx_.*)$` — must match native `tool_name:"Bash"` (live: `codex-rs/core/src/tools/hook_names.rs:53-55`, `out/final/probe-codex.md` F2), not only the own prefix | `timeout` (seconds) |
| `gemini` | `.gemini/settings.json` `hooks` | `{hooks:{<Event>:[{hooks:[{type:"command",command,timeout}]}]}}`, no host-side matcher field | filter in hook body: native tool name in `nativeTools` (none named, §1.3a) or `mcp_context-mode_.*` | `timeout` (ms; generated value = `hookTimeoutMs`) |
| `qwen` | `.qwen/settings.json` (Claude shape) | `{hooks:{<Event>:[{matcher,hooks:[{type:"command",command,timeout}]}]}}` | `matcher` regex `^(run_shell_command|Shell|read_file|grep_search|web_fetch|mcp__context-mode__ctx_.*)$` | `timeout` (seconds) |
| `copilot-cli` | `.github/hooks/*.json`, `~/.copilot/hooks/` | `{version:1,hooks:{<Event>:[{type:"command",command,timeoutSec}]}}`, no host-side matcher field | filter in hook body: native tool name in `nativeTools` (§1.3a) or `mcp_context-mode_.*` | `timeoutSec` (alias `timeout`; seconds) |
| `vscode` | `.github/hooks/*.json`, `~/.copilot/hooks/` | same shape as `copilot-cli` | filter in hook body (matchers are not honoured — spike §2) | `timeout` (seconds) |
| `kiro` | `.kiro/hooks/<id>.json`, `~/.kiro/hooks/` | `{version:"v1",hooks:[{name,trigger,matcher,action:{type:"command",command},timeout,enabled}]}` | `matcher` field `@mcp`, ids `mcp_context-mode_<tool>` | `timeout` (seconds) |
| `zcode` | `~/.zcode/cli/config.json` `hooks.events.<Event>` (project hooks ignored) | `{hooks:{enabled:true,events:{<Event>:[{type:"command",command,timeoutMs}]}}}` | `matcher` regex `^(Bash|mcp__context-mode__ctx_.*)$` (Claude shape, unverified — T-ZC) | `timeoutMs` (generated value = `hookTimeoutMs`) |
| `pi` | n/a — in-process `pi.on(event, handler)` | no file; `handleHook` called directly from the plugin entry | n/a (per-event, not per-tool; per-tool filtering happens inside `enforcement.decide`, fed this row's `nativeTools`) | n/a |
| `opencode` | n/a — in-process `ctx.<domain>.hook(name, cb)` | no file; `handleHook` called directly from the plugin entry | n/a (same as `pi`) | n/a |

Citation: `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/spike-hooks-verified.md` §2, per-agent write-up, for file paths, shape and timeout key/units. Matcher regex values for `claude-code`/`codex`/`qwen`/`zcode` and the Kiro `@mcp` ids — TECH-SPEC §3.8 rules 2 and 4, plus the Kiro row of §1's matrix; v1 shipped native matchers `Bash`, `WebFetch`, `Read`, `Grep`, `Agent` (v1 `hooks/hooks.json:6-91`) are the precedent for including native names alongside the own prefix. `build/manifests.ts` (owner: `build-release`, not this module) renders these rows into the actual config files from `nativeTools` + `toolNamePrefix`; this module only supplies the data.

### 1.5a Live test spec T-ZC (DECISIONS-r9 R3)

- Target: ZCode `toolNamePrefix` and native `nativeTools.shell` name, currently assumed `"mcp__context-mode__"` / `["Bash"]` from the closest verified sibling (Assumption A1), unverified.
- Method: GP3 golden-case run against a recorded ZCode `PreToolUse` payload (TECH-SPEC §3.8 rule 2: GP3 matchers are tested only against recorded payloads, never a live spike).
- Pass: the recorded payload's `tool_name`/MCP tool-name field matches this file's matcher and `toolNamePrefix` value unchanged.
- Fail: this file's `zcode` row (§1.3, §1.3a, §1.5) is corrected to the value the recorded payload actually shows, and the `[unverified, T-ZC]` mark is removed.
- Fixture: `e2e/fixtures/zcode/<ver>/pretooluse.json`, one file per ZCode release under test, written the first time a ZCode install completes in the live harness (same capture step as the Codex/Qwen fixtures in `e2e/fixtures/<agent>/<ver>/`). Until that file exists, T-ZC prints `SKIPPED` with reason "ZCode not installed", the same treatment as the Copilot CLI MCP-firing row (§9 E2E note) — never a silent pass.

### 1.5b Qwen shell name — which name is live (intern Q, S1)

`tool-names.ts:28,121` and this file's prior draft disagree on whether Qwen's native shell tool is called `run_shell_command` or `Shell`. No live Qwen probe has run yet, so neither name is dropped by taste. Smallest rule consistent with DECISIONS-r9 R4: both stay in `qwen.nativeTools.shell` (§1.3a) and in the matcher (§1.5) until a GP3 live run against a recorded Qwen `PreToolUse` payload shows which one the installed Qwen build actually sends; that run is folded into S-NAMES (TECH-SPEC §9), not a separate test id, because S-NAMES already covers "exact MCP tool names" for this agent family. The losing name is then deleted from §1.3a and §1.5 in the same commit that closes S-NAMES.


### 1.6 Prompt-delivery and skill-exposure rows (M2: S-COPILOT, S-SKILLS, S-ZCODE instructions row)

These rows are data for `ctx_doctor` and the install docs, not `AdapterRow` fields. Tags: [V] live probe, [S] pinned source, [U] unknown. An open row prints `SKIPPED` in the live harness, never `FAIL` (TECH-SPEC §9).

| id | MCP `instructions` reach the model | Skill command the user types | Spike file |
|---|---|---|---|
| `claude-code` | [V] yes (TECH-SPEC §3.1) | [V] `/ctx-stats` or `/context-mode:ctx-stats` | `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/spikes-r5/S-SKILLS.md` |
| `codex` | [V] no at session start (S-CODEX) | [S] `$ctx-stats` mention, no `/` command | `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/spikes-r5/S-SKILLS.md` |
| `gemini` | [S] yes, trusted folders only | [S] `/ctx-stats`; `disable-model-invocation` ignored | `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/spikes-r5/S-SKILLS.md` |
| `qwen` | [S] yes | [S] `/ctx-stats` | `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/spikes-r5/S-SKILLS.md` |
| `copilot-cli` | **[U] Blocked**: `copilot` not installed; exact command in the spike file | **[U] Blocked** | `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/spikes-r5/S-COPILOT.md`, `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/spikes-r5/S-SKILLS.md` |
| `vscode` | [S] yes, when its tools are in the turn's request | [S] `/ctx-stats` | `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/spikes-r5/S-SKILLS.md` |
| `kiro` | [S] no (Kiro#11096 open) | none: ask in words | `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/spikes-r5/S-SKILLS.md` |
| `zcode` | [S] no, by source (`zai-org/ZCode` @ `aac4755666d0`: MCP client never reads `instructions`); live probe **Blocked**: `zcode` not installed | [S] `/skill ctx-stats` (rewritten into a `Skill` tool call); `disable-model-invocation` not enforced | `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/spikes-r5/S-ZCODE.md`, `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/spikes-r5/S-SKILLS.md` |
| `pi` | n/a (in-process, `before_agent_start`) | [S] `/skill:ctx-stats` | `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/spikes-r5/S-SKILLS.md` |
| `opencode` | [S] yes | none: model-called `skill` tool only (ADR-0004 gap) | `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/spikes-r5/S-SKILLS.md` |

No row changes routing: every agent still gets routing from self-contained tool descriptions (ADR-0004 decision 2), and agents with "no"/[U] get nothing else (decision 4). `skills/` stays the one source (ADR-0004 decision 3); no `commands/` dir is added for ZCode.

---

## 2–11. Per-agent decode/encode

Every `src/adapters/<agent>.ts` exports exactly:

```ts
export function decode(raw: unknown): CanonicalHookEvent;
export function encode(ev: CanonicalHookEvent, d: Decision, extra?: string): HookOutput;
```

(`pi.ts` and `opencode.ts` export the same two functions; their callers are the in-process plugin entries, not a spawned `hook.mjs` — ADR-0001 §3, 00-architecture.md §2 "plugins" row.)

### Shared decode pseudocode (every agent instantiates this with its own field names, table below)

1. Read `raw.hook_event_name` (or the agent's own event-name field, §1.4) → canonical event name via a reverse lookup of this adapter's `eventMap` row. Unknown name → throw; caller (`handleHook`) catches and falls back to `allow` with empty output (00-architecture.md §5.3 step 5). This is the only error path in `decode`; it has no named error-text key because it never reaches the model or the user, only stderr.
2. Read `sessionId`, `cwd` from the fields named in the table below.
3. If a subagent field is present (table below), set `agentId`/`agentType`; else leave both `undefined` (Q23: presence of `agentId`, not `agentType`, is what marks a subagent call).
4. Per event, read the extra fields named in the table below into `source`, `prompt`, `tool`, `result`.
5. Return the populated `CanonicalHookEvent`.

### Shared encode pseudocode

1. Switch on `d.kind`:
   - `"allow"`: native stdout = `""` (or, for agents whose plain-text hook requires silence on `PromptSubmit`/`UserPromptSubmit`, exactly `""` — Kiro, GP3 fixture) exit `0`.
   - `"hint"`: write `d.text` into this agent's hint field (table below) if one exists; else (Gemini, Pi, OpenCode 2 lack a PreToolUse hint field, PRD §10.1/ADR-0001 Consequences) drop it — the hint reaches the model only through tool descriptions, never a second mechanism.
   - `"deny"`: write `d.reason` (prefixed with the rewritten command when `d.rewritten` is set) into this agent's deny field (table below); exit `2`. Never `allow` + an input-rewrite field (ADR-0001 Decision 1, PRD §10.2 — `updatedInput` is never used).
   - `"replace"`: only valid on `PostToolUse`; write `d.output` into this agent's output-replace field if one exists (Claude Code: `updatedToolOutput`); else no-op (case C has no substitute on an agent with no such field — ADR-0016 table, Q23 Kiro row: "no rewrite/replace channel either way").
2. Return `{ stdout, exitCode }`.
3. `encode` never throws; a field write for a decision this agent cannot express is a silent no-op, never a crash (PRD P1 — a dropped feature is a documented gap, not a fallback).

### 2. `src/adapters/claude-code.ts`

| | Native field |
|---|---|
| event name | `hook_event_name` |
| sessionId | `session_id` |
| cwd | `cwd` |
| subagent | `agent_id` / `agent_type` |
| SessionStart.source | `source` (`"startup"\|"resume"\|"clear"\|"compact"`) |
| UserPromptSubmit.prompt | `prompt` |
| tool (Pre/Post) | `tool_name`, `tool_input` |
| result (Post) | `tool_response`, `tool_response.is_error` |
| hint field | `hookSpecificOutput.additionalContext` |
| deny field | `hookSpecificOutput.permissionDecision="deny"` + `permissionDecisionReason` |
| replace field | `hookSpecificOutput.updatedToolOutput` (PostToolUse only) |

- Errors: none beyond the shared "unknown event name" throw.
- Constants used: none (no byte caps apply inside decode/encode; caps are applied by `sandbox.capBytes` and `tools-session.renderState` before `encode` is called).
- E2E: GP3 (hooks, ×10 adapters × 4 events), fixture `e2e/fixtures/claude-code/2.1.283/*.json`. Covers: `src/adapters/claude-code.ts`, `src/entries/hook.ts`.

### 3. `src/adapters/codex.ts`

| | Native field |
|---|---|
| event name | `hook_event_name` (Claude shape) |
| sessionId | `session_id` |
| cwd | `cwd` |
| subagent | `agent_id` / `agent_type` |
| SessionStart.source | `source` (`startup`/`resume`/`clear`/`compact`/also `fork`, mapped to the same four canonical values; `fork` → `"resume"`) |
| UserPromptSubmit.prompt | `prompt` |
| tool (Pre/Post) | `tool_name` (`Bash`, `apply_patch`, or `mcp__context_mode__ctx_*`), `tool_input` |
| result (Post) | `tool_response.is_error` |
| hint field | `hookSpecificOutput.additionalContext` |
| deny field | `hookSpecificOutput.permissionDecision="deny"` + reason, or process exit `2` |
| replace field | none — Codex has no `updatedToolOutput` equivalent; case C has no substitute (documented gap) |

Install note (DECISIONS-r9 R6): `--dangerously-bypass-hook-trust` and `sandbox_workspace_write.network_access = true` are live-harness flags for `codex exec` only (no trust prompt exists in `exec`; localhost fixtures need network) — never set for an interactive Codex session. A user approves hook trust once in the interactive CLI; `ctx_doctor` reports "Codex hooks not trusted" when the hooks file exists and no hook row was ever journaled for a Codex session (`probe-codex.md` Setup).

- Errors: shared only.
- Constants used: none.
- E2E: GP3, fixture `e2e/fixtures/codex/0.156.1/*.json`. Covers: `src/adapters/codex.ts`.

### 4. `src/adapters/gemini.ts`

| | Native field |
|---|---|
| event name | `hook_event_name` native names `SessionStart`/`BeforeAgent`/`BeforeTool`/`AfterTool`/`PreCompress` |
| sessionId | `session_id` |
| cwd | `cwd` |
| subagent | none documented — `agentId`/`agentType` stay `undefined` on Gemini (no subagent field in the matrix) |
| SessionStart.source | `source`; compact re-fire is **not** supported (spike §3 gap row) — `source==="compact"` never arrives; the `PreCompress` substitute (table §1.4) sets `metaSet` instead |
| UserPromptSubmit.prompt | `prompt` (`BeforeAgent` payload) |
| tool (Pre/Post) | `tool_name` / `original_request_name` (`BeforeTool`), `tool_input`, `mcp_context`; name sanitized to `mcp_context-mode_<tool>` (single underscore, TECH-SPEC §3.8 Gemini row) |
| result (Post) | `tool_response` (`AfterTool`) |
| hint field | **none on `BeforeTool`** (spike matrix: "NO hint field"); `AfterTool`'s `additionalContext` is the only post-hoc channel, so a `"hint"` decision on `PreToolUse` is dropped per the shared encode step 1 |
| deny field | `decision: "deny"` (or `"block"`) on `BeforeTool`; any exit code other than `0` or `1` is also a deny (spike §2, corrected) |
| replace field | none |

- Errors: shared only.
- Constants used: none.
- E2E: GP3, fixture `e2e/fixtures/gemini/51617c1/*.json`, including the GP3/LV "unrelated `mcp__` call spawns zero hooks" case adapted to Gemini's single-underscore shape (TECH-SPEC §3.8 "v1 is wrong about Gemini" finding — the matcher must be built from `mcp_context-mode_.*`, not the v1 `mcp__(?!.*context-mode)` pattern). Covers: `src/adapters/gemini.ts`.

### 5. `src/adapters/qwen.ts`

| | Native field |
|---|---|
| event name | `hook_event_name` (Claude shape) |
| sessionId | `session_id` |
| cwd | `cwd` |
| subagent | `agent_id` / `agent_type` (Claude-shape fields, accepted by the shared base) |
| SessionStart.source | `source` |
| UserPromptSubmit.prompt | `prompt` |
| tool (Pre/Post) | `tool_name` (`run_shell_command`/`read_file`/`grep_search`/`web_fetch`, or Claude aliases, or `mcp__context-mode__ctx_*`), `tool_input` |
| result (Post) | `tool_response.is_error` (+Failure event variant) |
| hint field | `hookSpecificOutput.additionalContext` (lands in the tool result per the bundle; UNVERIFIED in the spike, kept as the only channel available) |
| deny field | `hookSpecificOutput.permissionDecision="deny"` or exit `2` |
| replace field | none |

- Errors: shared only.
- Constants used: none.
- E2E: GP3, fixture `e2e/fixtures/qwen/0.25.1/*.json`. Covers: `src/adapters/qwen.ts`.

### 6. `src/adapters/copilot-cli.ts`

| | Native field |
|---|---|
| event name | dual-cased: `type`/`hookEventName` carries `sessionStart`/`SessionStart`, `userPromptSubmitted`/`UserPromptSubmit`, `preToolUse`/`PreToolUse`, `postToolUse`/`PostToolUse`(+`Failure`). Decode reads whichever casing is present; camelCase payload keys are `sessionId`/`toolName`/`toolArgs`/`toolResult`, PascalCase payload keys are `session_id`/`hook_event_name` |
| sessionId | `sessionId` or `session_id` (whichever casing the payload uses) |
| cwd | `cwd` |
| subagent | [U] no field documented; `agentId`/`agentType` stay `undefined` (S-NAMES open; same treatment as Gemini) |
| SessionStart.source | enum `startup`/`resume`/`new`; compact re-fire **not** supported (gap table: substitute is the next `userPromptSubmitted`/`preToolUse`) |
| UserPromptSubmit.prompt | not confirmed present; decode reads it when the key exists, else leaves `prompt` `undefined` |
| tool (Pre/Post) | `toolName`, `toolArgs` / `toolResult` |
| result (Post) | `toolResult` presence + any non-zero exit on the matching Pre call (fail-closed) |
| hint field | `additionalContext` |
| deny field | `permissionDecision="deny"` + `permissionDecisionReason`, or exit `2` |
| replace field | `modifiedArgs` exists but only for pre-call argument edits (`preMcpToolCall` edits `_meta` only); no post-call output-replace field — case C has no substitute |

- Errors: shared only.
- Constants used: none.
- E2E: GP3, fixture `e2e/fixtures/copilot-cli/1.0.96/*.json`; the MCP-firing row stays `[U]` until S-NAMES closes (TECH-SPEC §3.8) — GP3 marks that one sub-case `SKIPPED`, not `FAIL`, until then. Covers: `src/adapters/copilot-cli.ts`.

### 7. `src/adapters/vscode.ts`

| | Native field |
|---|---|
| event name | `hook_event_name` (shared code path with Copilot CLI, not independently live-verified) |
| sessionId | `session_id` (optional — may be absent) |
| cwd | present only if the hook config sets a `cwd` key; else falls back to the project's own `worktree` from `ProjectContext`, never a second native field (P1) |
| subagent | [U] no field documented; stays `undefined` |
| SessionStart.source | only fires with `source==="new"` (first turn); no re-fire on compact/resume (gap table) — the `UserPromptSubmit` substitute carries the pending-flag delivery |
| UserPromptSubmit.prompt | present (spike: "yes") |
| tool (Pre/Post) | native VS Code tool names (e.g. `runInTerminal`), matched by the host's own tool-name map, not Claude names — decode normalizes to `canonicalName` via the same `mcp_<server>_<tool>` sanitization as Gemini's single-underscore rule, since VS Code's wire shape is `mcp_<server>_<tool>` (TECH-SPEC §3.8) |
| result (Post) | shared path with `PreToolUse`, not independently live-verified |
| hint field | `additionalContext` |
| deny field | `permissionDecision="deny"` + reason, or exit `2` |
| replace field | none |

- Errors: shared only.
- Constants used: none.
- E2E: GP3 contract test (no live GUI driver — spike: "Live: not possible (GUI)"); TECH-SPEC GS2 names a VS Code contract E2E in place of a live run. Covers: `src/adapters/vscode.ts`.

### 8. `src/adapters/kiro.ts`

| | Native field |
|---|---|
| event name | legacy names accepted as aliases: `agentSpawn`→`SessionStart`, `userPromptSubmit`→`PromptSubmit`(canonical `UserPromptSubmit`) |
| sessionId | `session_id` (docs say present on all hooks) |
| cwd | `cwd` |
| subagent | per Q24 item 7: Kiro has no `agent_id`/`agent_type` fields documented; stays `undefined`, so `pickSubagentCase` never resolves Kiro to case A (no rewrite/replace channel either way) |
| SessionStart.source | unknown re-fire behaviour on compact/resume (spike: UNKNOWN); decode reads `source` when present, else leaves it `undefined` and the hook degrades to a plain hint |
| UserPromptSubmit.prompt | read from env var `USER_PROMPT`, not a stdin JSON field (spike §2) |
| tool (Pre/Post) | `tool_input` (`PreToolUse` example payload); tool name sanitized through the `@mcp` matcher shape, `mcp_context-mode_<tool>` |
| result (Post) | not documented beyond stderr/exit; decode sets `result.isError` from a non-zero exit it is given by the harness, never guessed |
| hint field | **none** — Kiro's hooks print plain stdout only (`"hint-only"` denyChannel, §1.3); a `"hint"` decision's text, when non-empty, is written as plain stdout with exit `0` |
| deny field | **none structured** — any non-zero exit blocks; `d.reason` is written to stderr only (plain text), never JSON |
| replace field | none |

- Decode/encode have one extra rule beyond the shared steps: on the `PromptSubmit` event, `encode` for `"allow"` must emit stdout `""` exactly, never `null`/omitted — this is the v1 regression `ff0a9a26` fixed after `98f0025f` introduced JSON-on-stdout (DECISIONS-r3 Q24 item 5). A GP3 fixture `e2e/fixtures/kiro/*/promptsubmit.json` asserts `stdout === ""` on exit `0`.
- Errors: shared only.
- Constants used: none.
- E2E: GP3, fixture `e2e/fixtures/kiro/*/*.json`, the `promptsubmit.json` stdout-empty case above (PRD §15 GP3 row). Covers: `src/adapters/kiro.ts`.

### 9. `src/adapters/zcode.ts`

| | Native field |
|---|---|
| event name | `hook_event_name`, Claude snake_case plus camelCase twins — decode reads whichever is present, snake_case first |
| sessionId | `session_id` / `sessionId` |
| cwd | `cwd` |
| subagent | `agent_id` / `agent_type` (Claude-shape fields, [U] not live-verified) |
| SessionStart.source | compact re-fire: yes; resume re-fire: UNKNOWN — decode reads `source` when present, else `undefined` |
| UserPromptSubmit.prompt | `prompt` (optional) |
| tool (Pre/Post) | `tool_name`, `tool_input` |
| result (Post) | `tool_response.is_error` (+Failure variant) |
| hint field | `hookSpecificOutput.additionalContext` |
| deny field | `hookSpecificOutput.permissionDecision="deny"` + reason, or exit `2` |
| replace field | none documented |

- Errors: shared only.
- Constants used: none.
- E2E: GP3, fixture `e2e/fixtures/zcode/*/*.json`; MCP-firing row stays `[U]` until S-ZCODE closes — same `SKIPPED`-not-`FAIL` treatment as Copilot CLI. Covers: `src/adapters/zcode.ts`.

### 10. `src/adapters/pi.ts`

In-process glue only (00-architecture.md §2 "plugins" row); `decode`/`encode` still exist so `handleHook` stays one code path across every agent (ADR-0001 Decision 3).

| | Native field |
|---|---|
| event name | `pi.on("session_start" \| "session_compact" \| "input" \| "tool_call" \| "tool_result", handler)` — the event name is the call site, not a payload field |
| sessionId | `ctx.sessionManager.getSessionId()` |
| cwd | `ctx.cwd`, read once at plugin-load time (ADR-0007 Pi row) |
| subagent | not documented; stays `undefined` |
| SessionStart.source | `"session_start"` call → `source:"startup"`; `"session_compact"` call → `source:"compact"`; there is no native `resume` signal (spike: "resume yes" is carried by `session_start` itself, no separate source value) |
| UserPromptSubmit.prompt | the `input` handler's `message` argument |
| tool (Pre/Post) | `tool_call`/`tool_result` handler argument; no native MCP — an `mcp__context-mode__ctx_*` call never reaches this handler as such, it is a plain custom `tool_call` named `ctx_execute` etc. (toolNamePrefix `""`, §1.3) |
| result (Post) | `tool_result` handler argument |
| hint field | **none on `tool_call`** ("NO hint" in the spike matrix) — a `"hint"` decision is dropped (shared encode step 1) |
| deny field | `tool_call` handler return value `{block: true, reason}` |
| replace field | `tool_result` handler can rewrite its argument — this is case C's substitute on Pi (ADR-0016 table) |

- Errors: shared "unknown event name" throw applies to the call-site name, not a payload field.
- Constants used: none.
- E2E: GP3 in-process case (`node:test` driving the Pi plugin entry directly, no spawn) plus GP-LIVE-HOOKS for G25 (does a native MCP call on Pi ever reach a hook at all — TECH-SPEC GS3). Covers: `src/adapters/pi.ts`, `src/entries/pi.ts`.

### 11. `src/adapters/opencode.ts`

In-process glue only, same reasoning as Pi.

| | Native field |
|---|---|
| event name | v2 Effect plugin call sites: session hook `"context"` (every request), session hook `"compaction"`, session hook `"prompt"`, tool hook `"execute.before"`/`"execute.after"` |
| sessionId | `sessionID` from the hook's own argument |
| cwd | no native `cwd` field; decode reads `directory` passed at plugin init instead (spike §2) — this is the one named mechanism for OpenCode 2 (projectSource `"spawn-cwd"`, §1.3), not a fallback: it is read once, at load, exactly like Pi's `ctx.cwd` |
| subagent | not documented; stays `undefined` |
| SessionStart.source | the `"context"` hook fires on every request, not only at session start — decode's caller (`handleHook`) must de-duplicate per session before treating it as `SessionStart`; `"compaction"` hook sets `source:"compact"` |
| UserPromptSubmit.prompt | the `"prompt"` session hook's own message argument; this hook cannot fail (spike: "cannot fail") — a `"deny"` decision on it is never produced, only `"allow"` |
| tool (Pre/Post) | `"execute.before"`/`"execute.after"` hook arguments; MCP firing through the codemode wrapper is `[U]` (spike: "MCP UNKNOWN") |
| result (Post) | `"execute.after"` argument |
| hint field | **none** ("NO hint" in the spike matrix) — dropped |
| deny field | `"execute.before"` throws `Tool.Error(reason)`; only this hook can fail |
| replace field | none documented |

- Errors: shared "unknown event name" throw. One extra rule: `decode` on the `"context"` session hook must be idempotent across repeated per-request firings — it is not an error path, but it means `encode`'s `"hint"`/`"deny"` results for this hook are only ever produced once per session by the caller, never by this file (the de-dup lives in `hooks/dispatch.ts`, not here).
- Constants used: none.
- E2E: GP3 in-process case plus GP-LIVE-HOOKS for G25 (same as Pi). Covers: `src/adapters/opencode.ts`, `src/entries/opencode.ts`.

---

## Assumptions

- A1: `toolNamePrefix` for `copilot-cli` and `kiro` is picked from the closest verified sibling family (Copilot family → VS Code's `mcp_<server>_<tool>`; Kiro's own `@mcp` matcher doc already names `mcp_<server>_<tool>`). TECH-SPEC §3.8 marks both `[U]`, pending S-NAMES; no spike file for S-NAMES exists yet in `https://github.com/mksglu/context-mode/tree/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/spikes-r5/`. `zcode` is no longer part of this assumption (DECISIONS-r9 R3): it is decided only by live test spec T-ZC (§1.5a), marked `[unverified, T-ZC]` in §1.3 until that test runs. The adapter's `decode`/`encode` logic is table-driven on `toolNamePrefix`, so closing S-NAMES or T-ZC later is a one-line change to §1.3, not a code change.
- A2: `hookTimeoutMs = 5000` for every spawn-based agent. `00-architecture.md` §3.2 defines no `HOOK_TIMEOUT_MS` constant and PRD §10.1/spike-hooks-verified.md leave each host's own default disputed or docs-only. 5 s sits under every host's own default (Claude Code 600 s, Gemini 60 s, Qwen/Kiro/VS Code 30–60 s, ZCode 60 s) and comfortably above `HOOK_P95_MS`/`HOOK_COMBINED_P95_MS` (40/60 ms, GS6), so it never fires on a healthy hook. Add `HOOK_TIMEOUT_MS = 5000` to `constants.ts` alongside this file.
- A3: `denyChannel: "hint-only"` is set only for Kiro, because it is the one agent in the matrix with no structured reason field for either hint or deny (plain stdout/stderr). Gemini, Pi and OpenCode 2 lack a `PreToolUse` **hint** field but do carry a structured **deny** field (`decision`, `{block,reason}`, `Tool.Error`), so they keep `"deny-reason"`; their missing hint is handled per-agent in the encode table ("dropped"), not by a second enum value.
- A4: Codex's `SessionStart.source` value `"fork"` (spike §1, Codex row) maps to canonical `"resume"`. ADR-0001's canonical `source` union has no `"fork"` value and no ADR text picks one; `"resume"` is the nearest existing value (a fork continues a prior session) and keeps the canonical type closed per `types.ts` §3.1.
- A5: T-ZC runs against `e2e/fixtures/zcode/<ver>/pretooluse.json`; it prints `SKIPPED` (not `FAIL`) until that recorded payload exists (§1.5a).
- A6: Qwen's shell name stays both `run_shell_command` and `Shell` (§1.3a, §1.5) until S-NAMES's live run names the one the installed build sends; no separate test id (§1.5b).

---
- A7 (intern M0 Q6): there is no runtime mode pick. `compactSummary` is a fixed column of `ADAPTERS` (§1.3); hooks read `getAdapter(id).compactSummary` and branch (impl/09 §5). Only a table edit after an LV-COMPACT run changes it.
- A8 (M2-T2): ADR-0004 says Copilot CLI `instructions` were "verified by live probe (Copilot CLI 1.0.60)", but no spike file, log or transcript for that probe exists; TECH-SPEC §3.7/§9 keep the row `[U]`. §1.6 follows TECH-SPEC (`[U]`, Blocked) until `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/spikes-r5/S-COPILOT.md` runs. ADR-0004's line is left as is (outside this module's files) and flagged for the next docs pass.
- A9 (M2-T2): §1.6 rows tagged [S] come from pinned source, not live runs; they are enough to close S-SKILLS for M2 (TECH-SPEC §9 asks "which agents expose ... and from which install path", answerable from source) but a live run that disagrees replaces the row in the same commit.

## Changes

- DECISIONS-r6 D6: added `compactSummary: "host" | "none"` to the `ADAPTERS` table (§1.3). Claude Code = `"host"` (one pointer line, no state block). Every other agent = `"none"` (full 2,048 B block through its ADR-0009 §6 path) until its own LV-COMPACT live check (M3) passes.
- DECISIONS-r9: R1 Codex `toolNamePrefix` to `mcp__context_mode__` (underscore) everywhere in this file (§1.3, §1.3a, §1.5, §3); R3 ZCode marked `[unverified, T-ZC]` with live test spec added (§1.5a); R4 added `nativeTools` field, rewrote all host matchers as generated from `nativeTools` + `toolNamePrefix` (§1.3a, §1.5); R5 added `execReadOnlyHint` (§1.3a); R6 added Codex install/doctor note (§3); V9 added compactSummary flip note (§1.3); intern questions closed: T-ZC fixture path and `SKIPPED` rule (§1.5a, A5), Qwen shell-name live check folded into S-NAMES (§1.5b, A6).
- M2-T2: added §1.6 (instructions + skill-exposure rows per agent) from S-COPILOT (Blocked), S-SKILLS (9/10 by source, Copilot CLI Blocked), S-ZCODE instructions row ([S] no; live probe Blocked); Assumptions A8, A9.
