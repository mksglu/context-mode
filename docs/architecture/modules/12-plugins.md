# 12 — Module `plugins`

Follows `docs/architecture/modules/00-architecture.md` (file tree §1, module table §2, types/constants §3, interfaces §4). Line-by-line spec for the two in-process plugin entries: `src/entries/pi.ts` (Pi extension) and `src/entries/opencode.ts` (OpenCode 2 plugin). No TBDs: every open point is resolved below and listed under Assumptions.

Imports allowed (00 §2, module row `plugins`): `contracts`, `server` (`TOOLS`, `INSTRUCTIONS`), `hooks` (`handleHook`), `adapters`. Exports: `src/entries/pi.ts` default export (Pi extension object); `src/entries/opencode.ts` named exports `{id, setup}`.

Files this module owns (00 §1): `src/entries/pi.ts`, `src/entries/opencode.ts`.

## 1. Why these two files are different from every other entry

Every other agent reaches context-mode over MCP: a spawned `server.mjs` process, and a spawned `hook.mjs` process per hook event. Pi and OpenCode 2 run context-mode **in-process** (PRD §3 "in-process plugin agents (Pi, OpenCode 2) … no spawn, no MCP hop"). `src/entries/pi.ts` and `src/entries/opencode.ts` are the only two files that call `TOOLS`, `INSTRUCTIONS`, and `handleHook` as plain function imports inside the host's own process, instead of over stdio or a child process.

Both files are thin: they translate the host's own event/callback shape into a `CanonicalHookEvent` (00 §3.1), call `handleHook`, and translate the `HookOutput` back into whatever the host's callback return shape is. Neither file touches `context.db`, `decide()`, or the journal directly — `handleHook` already does that work for every agent (00 §5.3).

## 1a. `nativeTools` filtering (DECISIONS-r9 R4)

Neither Pi nor OpenCode 2 has a host-side `PreToolUse` matcher field (00 §3.1 `AdapterRow`, §1.5/§1.5a of `impl/10-adapters.md`): both are in-process, so `enforcement.decide` is the only place that sees every tool call, native or `ctx_*`. Both rows carry `nativeTools` (`impl/10-adapters.md` §1.3a) so `decide` applies the same enforcement rules to a native tool call as to a `ctx_*` call, with no separate matcher step:

- `pi.nativeTools`: no native name is listed (§1.3a of `impl/10-adapters.md`); Pi's own `Bash`-equivalent and `Read`-equivalent tools pass through `tool_call` unnamed in this revision, so `decide` treats every `tool_call` the same way regardless of `event.toolName` until a future row names them.
- `opencode.nativeTools`: same — no native name is listed; `"tool.execute.before"` passes every call through `decide` the same way.

This file never builds or reads a matcher regex; §3.4 (`tool_call`) and §4.4 (`"tool.execute.before"`) below call `handleHook`/`decide` for every event they receive, and `decide` is the only place `nativeTools` is consulted (`impl/08-enforcement.md`, not this module).

## 2. `src/core/contracts/errors.ts` entries this module uses

From 00 §3.3, verbatim, no new text:

| Key | Text |
|---|---|
| `NO_RUNTIME` | `No <lang> runtime on PATH. Fix: install it or pick another language.` |

This module raises no error of its own; `NO_RUNTIME` and every tool-call error surface from `TOOLS` handlers called through the same path as every other agent (00 §4 `ToolDef.handler`). Listed here only because `ctxDoctor` output for Pi/OpenCode names it per 00 §5.5 — no plugin-specific error text exists (Assumption A20).

## 3. `src/entries/pi.ts` — Pi extension

### 3.1 Export

```ts
import type { PiExtension } from "@pi/extension-types"; // Pi 0.85 extension-discovery API (TECH-SPEC §6.2a "Pi adapter")
export default function createPiExtension(): PiExtension;
```

`PiExtension` is Pi's own extension object shape. This file does not define that type; it imports it from `@pi/extension-types`. The object `createPiExtension()` returns has exactly these six fields (Assumption A21):

| Field | Type | Value |
|---|---|---|
| `id` | `string` | `"context-mode"` (reuses `SERVER_KEY`, 00 §3; same choice as A28 for OpenCode) |
| `name` | `string` | `"context-mode"` |
| `before_agent_start` | `(event: { sessionId: string; cwd: string }) => Promise<void>` | set in §3.2 |
| `tool_call` | `(event: { name: string; args: unknown }) => Promise<unknown>` | set in §3.3 |
| `tool_result` | `(event: { name: string; result: unknown }) => Promise<void>` | set in §3.3 |
| `session_compact` | `(event: Record<string, never>) => Promise<void>` | set in §3.4 |

No other field is set; `createPiExtension()` returns an object literal with exactly these six keys, nothing spread in from elsewhere. (A21 revised: `id`/`name` are required by Pi's extension-discovery API per TECH-SPEC §6.2a "Pi adapter" — a discoverable extension must self-identify — and the four hook keys are evidenced as before: `before_agent_start` per TECH-SPEC §3.7/ADR-0004 Q7, `tool_call`/`tool_result` per ADR-0016 Per-agent table row "Pi", `session_compact` per ADR-0009 §6. No source gives `@pi/extension-types`'s own field names for `id`/`name`/event payloads beyond what ADR text requires, so this spec fixes them to the simplest literal values and the event-payload shapes already used in §3.2–§3.4 below, rather than leaving them open. The implementing agent writes this object literal as specified; it does not need to read `@pi/extension-types` first.)

### 3.2 Session and project identity

1. `sessionId`: read from the plugin API's own session handle at `before_agent_start` time — the event payload's session id field, call it `event.sessionId` (Pi's API surfaces one; whichever field the real `PiExtension["before_agent_start"]` event carries is used as-is, never regenerated). This is the one and only sessionId source for every hook this file forwards (no per-event fallback — PRD P1). Stored once in a closure variable at `before_agent_start` and reused for every subsequent `tool_call`/`tool_result`/`session_compact` event in the same extension instance, because Pi loads one extension instance per session (Assumption A22: no source states Pi's extension lifetime explicitly; one instance per session is the only reading consistent with `ctx.cwd` being read once "at plugin-load time," PRD §7 Pi row).
2. `cwd`: read once at plugin-load time from `ctx.cwd` (PRD §7 "Pi | the extension API's `ctx.cwd` at plugin-load time"; `ProjectSourceKind = "pi:ctx.cwd"`, 00 §3.1). Passed into every `CanonicalHookEvent.cwd` field this file builds.
3. `agent`: the literal `"pi"` (`AgentId`, 00 §3.1 `AGENT_IDS`).

### 3.3 `before_agent_start(event): Promise<{ systemPrompt?: string }>`

**Inputs:** Pi's `before_agent_start` event (carries `systemPrompt`, per TECH-SPEC §3.7 Pi API evidence `core/extensions/types.ts:935`).
**Output:** `{ systemPrompt?: string }` (same field Pi results may return, `types.ts:1499`).

**Steps:**
1. On the first call for this extension instance: capture `event.sessionId` into the closure (§3.2 step 1).
2. Build `CanonicalHookEvent { event: "SessionStart", agent: "pi", sessionId, cwd, source: piSource }`, where `piSource` is `"startup"` on the first `before_agent_start` of the process and `"compact"` when this call follows a `session_compact` flag set by step 4 below (ADR-0009 §6 "Pi | `session_compact` flag, then `before_agent_start`, once"); otherwise `"resume"` is never produced by Pi (Assumption A23: ADR-0009 names only the compact path for Pi; a plain session start with no pending flag is `"startup"`, the only other `SessionStart` source this file has evidence for).
3. Call `handleHook("pi", canonicalEvent, env)` → `HookOutput { stdout, exitCode }` (00 §4 `handleHook`). For `source: "compact"`, `handleHook`'s internal path is 00 §5.3 "SessionStart: `source=compact` and `compactDelivery=sessionstart`" — but Pi's `AdapterRow.compactDelivery` is `"pi-flag"`, not `"sessionstart"` (00 §3.1 enum, row for Pi in `adapters/table.ts`), so `handleHook` takes the pending-flag branch internally: it reads and clears the `session_compact` flag (via `metaTake`, same `BEGIN IMMEDIATE` pattern as 00 §5.3's `pending-flag` agents), and when that flag was set it delivers compaction state once, picking the delivery by `AdapterRow.compactSummary` (D6, `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/review/DECISIONS-r6.md`): Pi's row is `"none"` today, so `handleHook` renders and hands back the full 2,048 B state block (D1 algorithm, unchanged) through this `pi-flag` path; this file passes `stdout` through unchanged (step 5) and does not pick the delivery mode itself. Only a future row flip to `"host"` — gated on live check LV-COMPACT (M3) proving Pi's own compactor writes a summary the model sees — would change `stdout` to the fixed pointer line instead; this file's own steps do not change either way, since `handleHook` is the one place that branches.
4. If `exitCode === 2`: this file never fails a `before_agent_start` call (there is nothing to deny at session start) — treat `stdout` as informational hint text only (same as any other agent's non-compact `SessionStart` hint, 00 §5.3 step "Else hint text about `ctx_resume`, once per session"); fold it into the returned `systemPrompt` the same way as a normal delivery (step 5).
5. If `stdout` is non-empty: return `{ systemPrompt: event.systemPrompt ? event.systemPrompt + "\n\n" + stdout : stdout }` — append, never replace, per the Pi API evidence pattern (`examples/extensions/preset.ts:386-389`, "An example that appends to it").
6. If `stdout` is empty (no compaction flag set, no hint due) and this is the extension's first `before_agent_start` for this process: return `{ systemPrompt: event.systemPrompt ? event.systemPrompt + "\n\n" + INSTRUCTIONS : INSTRUCTIONS }` — the same `instructions.md` bytes delivered once at session start (TECH-SPEC §3.7 "Pi (in-process plugin) | the same `instructions.md` bytes, appended to the system prompt in `before_agent_start` (Q7)"). `INSTRUCTIONS` is imported from `server` (00 module table row `plugins`).
7. On a second or later `before_agent_start` in the same process with empty `stdout`: return `{}` (no field) — `INSTRUCTIONS` is delivered exactly once per session, matching Q7's "same bytes… in `before_agent_start`" read together with the byte-stability rule (ADR-0009 §6: "injected bytes must be byte-identical across every request within a turn" — repeating the full instructions block on every `before_agent_start` would itself be a second, redundant injection outside that rule's scope, Assumption A24).
8. Retry: if step 3's `handleHook` call throws (e.g. DB open failure), this hook is retryable per turn per TECH-SPEC §6.2a "Pi bridge bootstrap | Retryable per turn, not per session: the next `before_agent_start` after a failed `tools/list` re-runs bootstrap" — catch the throw, return `{}` (no systemPrompt addition this turn), and do not mark instructions as delivered (step 7's "second or later" check is keyed on a successful delivery, not merely a previous call).

**E2E proof:** GP2 (`e2e/cases/GP2-*.e2e.mjs`, "Prompt surface… Pi plugin system prompt", row "identical bytes on 3 OS… injected bytes are byte-stable… across requests in the same turn", `#1264 #864 #1031`); GP6 compaction rows for the Pi delivery path (ADR-0009 Golden cases, `#996`/Q12 family); live proof via `GP-LIVE-HOOKS`/G25 ("Do hooks fire for MCP tools on… Pi…"). ADR-0017 `covers`: `src/entries/pi.ts`.

### 3.4 `tool_call(event): void`

**Inputs:** Pi's `tool_call` event, carrying the tool name and mutable `event.input`.
**Output:** none; mutates `event.input` in place (ADR-0016 Per-agent table, Pi row, "Case B: mutate `event.input` in place pre-call").

**Steps:**
1. Build `CanonicalHookEvent { event: "PreToolUse", agent: "pi", sessionId, cwd, tool: { name: event.toolName, canonicalName: mapToCanonical(event.toolName), input: event.input, callId: event.callId }, agentId: event.agentId, agentType: event.agentType, turn: event.turn }`. `mapToCanonical` is the Pi row of `adapters/table.ts`'s `eventMap`/native-name table read in reverse (00 §3.1 `AdapterRow.eventMap`); Pi registers its own tool names in-process (no `mcp__` prefix exists for Pi's own tools, TECH-SPEC §3.8 "Pi (MCP path)… not used by v2 (in-process plugin registers its own names)" — so `canonicalName` for context-mode's own tools is the bare registry name, e.g. `"ctx_execute"`, and for Pi's native tools (Bash-equivalent, Read-equivalent) is Pi's own tool-set naming, unchanged).
2. Call `handleHook("pi", canonicalEvent, env)` → `HookOutput`.
3. If `exitCode === 2`: `stdout` carries the deny reason (00 §4 `AdapterRow.denyChannel`; Pi's row is `"deny-reason"` — Assumption A25: no source states Pi's `denyChannel` value explicitly; `"deny-reason"` is the only enum member consistent with ADR-0016's Pi row, which has no separate `hint-only` channel described). Case A/B/C selection already happened inside `decide()`/`pickSubagentCase` behind `handleHook` (00 §4); this file does not re-decide.
4. If the decision was case B (ADR-0016: subagent with Bash-equivalent, no ctx tools): mutate `event.input` to the rewritten command (the `run.mjs` wrapper invocation, ADR-0016 Per-agent table, Pi row "mutate `event.input` in place pre-call"). The rewritten command string is already the full `stdout` payload from `handleHook` for this case (same encoding `adapter.encode` produces for every agent's case-B path, 00 §3.1 `encode(ev, d, extra)`).
5. If the decision was case A or a plain deny with no rewrite (not a subagent, or a subagent with ctx tools): throw inside `tool_call` with `stdout` as the error message, if Pi's API expects a thrown error to block the call (Assumption A26: no source states Pi's exact deny-signalling mechanism for a non-rewritable case; throwing is the only mechanism consistent with Pi having "a deny/block path" at all per the Per-agent requirement that case A applies everywhere ADR-0008 does). If `exitCode === 0` (allow): return without mutating `event.input`.

**E2E proof:** ADR-0016 Golden cases rows "Subagent type with `tools: Bash`… → rewritten to `run.mjs`" and "A subagent with `tools: Bash` and a user `permissions.deny` rule… still blocked"; GP3 enforcement rows. Live proof `GP-LIVE-HOOKS`/G25. ADR-0017 `covers`: `src/entries/pi.ts`.

### 3.5 `tool_result(event): void`

**Inputs:** Pi's `tool_result` event, carrying `content` and (optionally) `structuredContent`.
**Output:** none; sets both fields together (ADR-0016 Per-agent table, Pi row: "set `content` AND `structuredContent` together post-call… to avoid the drop the Pi API docs warn about").

**Steps:**
1. Build `CanonicalHookEvent { event: "PostToolUse", agent: "pi", sessionId, cwd, tool: {...}, result: { isError: event.isError, bytes: byteLength(event.content), text: event.content, exitCode: event.exitCode }, turn: event.turn }`.
2. Call `handleHook("pi", canonicalEvent, env)` → `HookOutput`.
3. Append path (journal write for a native Pi tool, not one of context-mode's own `ctx_*` tools — 00 §5.3 "Skip append for own `ctx_*` tools (server writes them)"): already performed inside `handleHook`; this file does nothing extra here.
4. Case C (ADR-0016: subagent with neither ctx tools nor Bash-equivalent): if `handleHook` signalled a `replace` decision (00 §3.1 `Decision = {kind:"replace", output}`), set **both** `event.content = replacement.output` and `event.structuredContent = { text: replacement.output }` in the same call (ADR-0016's explicit "together" requirement — setting only one risks the Pi-documented drop). `replacement.output` is carried in `stdout` for this decision kind, same encoding as every other agent's case-C path.
5. Otherwise (no replace decision): leave `event.content`/`event.structuredContent` unchanged.

**E2E proof:** ADR-0016 Golden cases "Case C" rows; GP3. Live proof `GP-LIVE-HOOKS`/G25 (LV8–LV10 pending per ADR-0016 status line "Mechanism is Proposed until live checks LV8–LV10 pass"). ADR-0017 `covers`: `src/entries/pi.ts`.

### 3.6 `session_compact(event): void`

**Inputs:** Pi's `session_compact` event (fires when Pi's own compaction runs).
**Output:** none.

**Steps:**
1. Call `handleHook("pi", { event: "PreCompact", agent: "pi", sessionId, cwd }, env)`. `"PreCompact"` is the `AuxEventName` (00 §3.1) Pi's compact signal maps to.
2. `handleHook`'s internal path for Pi sets the pending flag (`compactDelivery: "pi-flag"`, same `metaTake`-pattern store write any `pending-flag`-family agent uses, 00 §5.3) — this file passes the event through and does not read or write the flag itself.
3. No return value is read from this call; the flag is consumed later, inside §3.3 step 3, by the next `before_agent_start`.

**E2E proof:** ADR-0009 Golden cases (GP6), row for the Pi delivery path; `https://github.com/mksglu/context-mode/tree/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/spikes-r5` has no Pi-specific spike, so this path is `[U]`-flagged for a live timing check under `GP-LIVE-HOOKS` only, not a measured spike (Assumption A27: no spike file covers Pi's `session_compact` → `before_agent_start` latency; this is stated, not measured, here). ADR-0017 `covers`: `src/entries/pi.ts`.

## 4. `src/entries/opencode.ts` — OpenCode 2 plugin

### 4.1 Export

```ts
import type { Plugin } from "@opencode/plugin-types"; // OpenCode 2.x plugin API (TECH-SPEC §6.2a "OpenCode adapter")
export const id = "context-mode";
export const setup: Plugin["setup"]; // = async (app) => ({ "chat.message"?, "tool.execute.before"?, "tool.execute.after"?, "event"? })
```

The module exports `{id, setup}` per OpenCode 2.x's plugin API (TECH-SPEC §6.2a "OpenCode adapter | The plugin module exports `{id, setup}`"). `id` is the fixed server key `"context-mode"` (00 §3.2 `SERVER_KEY`), reused as the plugin id so `ctx_doctor`/`ctx_upgrade`'s `resolvePluginRoot` can find this plugin's own install path by the same key used everywhere else (Assumption A28: no source states the plugin `id` value explicitly; reusing `SERVER_KEY` is the only choice consistent with "no new name introduced," PRD core principle "Simplicity First").

### 4.2 Session and project identity

1. `sessionId`: read from the plugin API's own session handle, the field OpenCode's `setup(app)` or its returned hook callbacks carry for the active session (OpenCode's API surfaces this on every hook invocation, not only once — unlike Pi, Assumption A29: no source names the exact field; whichever session-id field the real `@opencode/plugin-types` hook payload carries is read per call, never cached across calls, because OpenCode is multi-session-per-process capable per TECH-SPEC §6.2a "Pi bridge writes" contrast implying OpenCode's plugin handles concurrent sessions in one process — this module must not assume one session per plugin instance the way §3.2 does for Pi).
2. `cwd`: read once per plugin load from the spawn `cwd` (PRD §7 "OpenCode 2 | spawn `cwd`, read by the in-process plugin at load"; `ProjectSourceKind` has no dedicated OpenCode enum member in 00 §3.1's `ProjectSourceKind` union — the closest named source is `"spawn-cwd"`, reused here, Assumption A30: 00's `ProjectSourceKind` union lists `"spawn-cwd"` for exactly this shape and gives OpenCode no separate tag).
3. `agent`: the literal `"opencode"` (`AgentId`, 00 §3.1).

### 4.3 `setup(app): Promise<PluginHooks>`

**Inputs:** OpenCode's `app` handle at plugin load.
**Output:** the plugin's hook object, registered against OpenCode's `ctx.tool.transform`/`editor.add` pattern (ADR-0016 Per-agent table, OpenCode row).

**Steps:**
1. Capture `cwd = app.directory` (or the equivalent field OpenCode's `app` handle exposes for the process's spawn cwd) once.
2. Return an object implementing the hooks in §4.4–§4.6 below, closed over `cwd`.
3. Register no `chat.message`/system-prompt hook separately from the tool-registration path: OpenCode's own `<mcp_instructions>` channel is not used here (that channel is for MCP servers; this plugin is in-process). Instead, `INSTRUCTIONS` delivery for OpenCode happens through the mechanism its `compactDelivery`/cache-stability requirement names (Q12, §4.5) — a channel the plugin registers once at `setup` time and that the host reads once per session without re-fetching per request (Assumption A31: TECH-SPEC §3.7 lists OpenCode 2 instructions delivery as "server `instructions`" for the *MCP* path only; this plugin runs in-process, so it must expose `INSTRUCTIONS` through whatever OpenCode's plugin API offers for a one-time, cache-stable system-context addition — the same requirement Q12 states for compaction state applies to the one-time instructions delivery, since both must survive without re-triggering a prompt-cache invalidation per #1002/#822; this file emits `INSTRUCTIONS` via that same `opencode-cache` channel, once, the first time any hook below fires for a session it has not seen before).

### 4.4 `"tool.execute.before"(input, output): void`

**Inputs/Output:** OpenCode's pre-tool-call hook; `output.args` is mutable (`ctx.tool.transform`/`editor.add` pattern, e.g. `tool/plugin/skill.ts:33-36` per ADR-0016).

**Steps:**
1. Build `CanonicalHookEvent { event: "PreToolUse", agent: "opencode", sessionId: readSessionId(input), cwd, tool: { name: input.tool, canonicalName: input.tool.startsWith("context-mode_") ? input.tool.slice("context-mode_".length) : input.tool, input: output.args, callId: input.callID }, agentId: input.agentId, agentType: input.agentType }`. The `context-mode_` prefix strip matches TECH-SPEC §3.8 "OpenCode 2 | `context-mode_ctx_execute` (no `mcp` prefix)".
2. If this is the first hook call for `sessionId` seen by this plugin instance: before anything else, perform the one-time `INSTRUCTIONS` delivery of §4.3 step 3 (mark `sessionId` as seen in a closure `Set<string>` so it is never repeated — Assumption A31 continued).
3. Call `handleHook("opencode", canonicalEvent, env)` → `HookOutput`.
4. Case B (ADR-0016 OpenCode row: "mutate input in-process via the `ctx.tool.transform`/`editor.add` pattern"): on a rewrite decision, set `output.args = decodedRewrittenArgs` — OpenCode's own tool args shape for its Bash-equivalent tool, holding the `run.mjs` wrapper invocation in place of the original command (same payload shape `stdout` carries for every agent's case-B path).
5. Case A plain deny (not rewritable): throw inside the hook with `stdout` as the message, OpenCode's documented way to abort a tool call from `tool.execute.before` (Assumption A32, same reasoning as §3.4 step 5 — no source names OpenCode's exact abort mechanism, and throwing from the registered hook is the only one consistent with "the plugin module exports `{id, setup}}`, per OpenCode 2.x's plugin API" giving no separate deny-return field).
6. Allow (`exitCode === 0`, no rewrite): return without mutating `output.args`.

**E2E proof:** same ADR-0016 Golden cases as §3.4; GP3. Live proof `GP-LIVE-HOOKS`/G25. ADR-0017 `covers`: `src/entries/opencode.ts`.

### 4.5 `"tool.execute.after"(input, output): void`

**Inputs/Output:** OpenCode's post-tool-call hook; `output.result` (or equivalent) mutable in-process (ADR-0016 OpenCode row: "replace result in-process via the same pattern").

**Steps:**
1. Build `CanonicalHookEvent { event: "PostToolUse", agent: "opencode", sessionId: readSessionId(input), cwd, tool: {...}, result: { isError: output.isError, bytes: byteLength(output.result), text: output.result, exitCode: output.exitCode } }`.
2. Call `handleHook("opencode", canonicalEvent, env)` → `HookOutput`.
3. Case C: on a `replace` decision, set `output.result = replacement.output` in-process (no separate `structuredContent` field exists in this hook's shape per the ADR-0016 OpenCode row, unlike Pi's §3.5 — only one field is replaced here).
4. Otherwise: leave `output.result` unchanged.
5. Skip append for context-mode's own `ctx_*` tool calls (00 §5.3 rule): `handleHook` already applies this filter internally by `tool.canonicalName`; this file passes every call through uniformly and relies on that internal filter, never re-checking the tool name here (single-path rule, PRD P1).

**E2E proof:** ADR-0016 Golden cases Case-C rows; GP3; LV10-equivalent live check once OpenCode's own LV8–LV10 analogue runs (ADR-0016 status: "Proposed until live checks LV8–LV10 pass"). ADR-0017 `covers`: `src/entries/opencode.ts`.

### 4.6 Compaction delivery — Q12 cache-stable, once

OpenCode 2's row in `adapters/table.ts` (00 §3.1 `AdapterRow`) is `compactDelivery: "opencode-cache"`. This is the one compaction channel this file implements; no second path exists for OpenCode (unlike Pi's two-step flag-then-`before_agent_start`, §3.3/§3.6).

**Mechanism** (ADR-0009 §6 OpenCode row: "live test first… delivered once, through a channel that keeps the prompt cache stable (Q12)"; OWNER-QUESTIONS-r3 Q12: "Carrier for SessionStart lines on OpenCode and Pi that keeps the prompt cache stable?"):

1. OpenCode has no `SessionStart(source=compact)` equivalent event delivered to a plugin (no source names one); instead, the plugin's own session-start detection is "first `tool.execute.before`/`tool.execute.after` seen for a `sessionId` this instance has not recorded" — the same per-session `Set<string>` gate as §4.4 step 2.
2. On that first-seen-session gate firing, **before** the `INSTRUCTIONS` delivery of §4.3 step 3: check whether a pending-compact marker exists for this session (`metaTake("pending_compact:"+sessionId)`, same `BEGIN IMMEDIATE` read-and-clear as every `pending-flag`-family agent, 00 §5.3). If present: render the compaction state (`renderState(readSessionEvents(...))`, 00 §5.4) and prepend it to whatever one-time system-context payload this file emits through the `opencode-cache` channel (so one write carries both the instructions text and, if due, the compaction block — one call, cache-stable, never re-sent).
3. If no pending-compact marker: emit only `INSTRUCTIONS` (§4.3 step 3), unchanged.
4. The combined payload (instructions, optionally plus compaction state) is computed once per session and never recomputed on a later hook call for the same `sessionId` — this is what "keeps the prompt cache stable" means operationally: the bytes sent through the `opencode-cache` channel for a given session are fixed at first-use and never re-rendered (ADR-0009 §6's general byte-stability rule, applied to OpenCode's one-shot channel instead of per-turn re-rendering since OpenCode has no separate per-turn re-injection point).

**E2E proof:** ADR-0009 Golden cases (GP6) OpenCode delivery row; ISSUE-OUTCOMES-r4 #996 regression-risk note ("Q12… is the same prompt-cache concern as #1002/#822… any session_state/compaction label change must not re-trigger prompt-cache invalidation"); live test first per ADR-0009 §6 ("live test first (r1 notes still apply)") under `GP-LIVE-HOOKS`. ADR-0017 `covers`: `src/entries/opencode.ts`.

## 5. Constants this module reads (from `src/core/contracts/constants.ts`, 00 §3.2)

None directly — every constant-governed decision (`OUTPUT_CAP`, `STATE_BUDGET`, `RESUME_CAP`, timeouts) is applied inside `handleHook`/`TOOLS`/`renderState`, which this module calls but never re-implements (single-path rule, 00 "Rules for all code"). `INSTRUCTIONS_CAP` governs the text `INSTRUCTIONS` already satisfies before this module ever sees it (owned by `server`, not `plugins`).

## Assumptions

- A20: no plugin-specific error text exists; this module surfaces only the shared `TOOLS`/`handleHook` error table.
- A21: `PiExtension`'s returned object has exactly six fields — `id`, `name`, `before_agent_start`, `tool_call`, `tool_result`, `session_compact` — with `id`/`name` fixed to the literal `"context-mode"`; no source names `@pi/extension-types`'s own field names beyond the ADR-evidenced hook keys, so this spec fixes all six now (table in §3.1) instead of leaving them open.
- A22: Pi loads one extension instance per session, so `sessionId`/`cwd` are captured once in closure and reused — the only reading consistent with `ctx.cwd` being read "at plugin-load time."
- A23: a Pi `SessionStart` with no pending compact flag is always `source: "startup"`; ADR-0009 names only Pi's compact path, giving no `"resume"` case.
- A24: `INSTRUCTIONS` is delivered to Pi exactly once per session (first `before_agent_start`), never repeated, to stay inside the byte-stability rule's intent.
- A25: Pi's `AdapterRow.denyChannel` is `"deny-reason"` — the only enum member ADR-0016's Pi row supports.
- A26: Pi signals a non-rewritable deny by throwing inside `tool_call`; no source states Pi's exact block mechanism.
- A27: Pi's `session_compact` → `before_agent_start` latency is unmeasured (no spike file); stated as a live-check-only gap. No numeric latency budget is set: ADR-0009's byte-stability rule binds bytes within a turn, not the gap between these two calls, and no 00 §3.2 constant names one. The only guarantee this file gives is ordering, already required by §3.3 step 3 and §3.6 step 3: the flag set by `session_compact` must be read and cleared by the very next `before_agent_start` call in the same process, never a later one. `GP-LIVE-HOOKS` checks that ordering holds; it does not check a time bound.
- A28: the OpenCode plugin `id` is the literal `"context-mode"`, reusing `SERVER_KEY`; no source names it directly.
- A29: OpenCode's hook payload carries `sessionId` per call (not cached in closure), because OpenCode's plugin handles more than one session per process, unlike Pi.
- A30: OpenCode's `ProjectSourceKind` reuses the existing `"spawn-cwd"` tag; 00's union has no OpenCode-specific member.
- A31: OpenCode's one-time `INSTRUCTIONS` delivery and the Q12 compaction delivery both ride the same `opencode-cache` channel, gated by a per-session "first hook call seen" check, because no separate system-prompt hook is named for OpenCode's in-process plugin.
- A32: OpenCode aborts a tool call from `tool.execute.before` by throwing inside the hook; no source names OpenCode's exact abort mechanism for a non-rewritable deny.

## Changes

- 2026-10-16 (DECISIONS-r9, S8): A27 now states the rule — no numeric latency budget for `session_compact` → `before_agent_start`; the only guarantee is ordering (flag read and cleared by the very next `before_agent_start` call), checked by `GP-LIVE-HOOKS`.
- D6 (`https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/review/DECISIONS-r6.md`; measured in `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/memory-r6/eval/results.md`): Pi's `session_compact` delivery (§3.4) now picks its output by `row.compactSummary`; Pi is `"none"` today, so `handleHook` still hands back the full 2,048 B state block.
- DECISIONS-r9 R4: added §1a — Pi and OpenCode 2 use `AdapterRow.nativeTools` inside `enforcement.decide` for every `tool_call`/`"tool.execute.before"` event; neither file builds or reads a host matcher (in-process, no matcher field exists).
