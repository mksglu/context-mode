# 09 — Module `hooks`

Follows `docs/architecture/modules/00-architecture.md` (file tree §1, module table §2, types/constants §3, interfaces §4). This file is the line-by-line spec for the hook entry: decode → policy → journal → encode, for every canonical event, on every agent. No TBDs: every open point is resolved below and listed under Assumptions.

Imports allowed (00 §2): `contracts`, `adapters`, `enforcement`, `store` (journal + meta only), `tools-session` (`renderState`), `tools-index` (`selectChunks`, `indexText`). Exports: `handleHook`, hook `main()`.

## 0. Files this module owns (00 §1, build order)

| Path | Purpose |
|---|---|
| `src/core/hooks/dispatch.ts` | `handleHook(agent, raw, env)` per canonical event |
| `src/core/hooks/throttle.ts` | once-per-session hint marker |
| `src/core/hooks/detached.ts` | fire-and-forget journal write |
| `src/entries/hook.ts` | hook entry, `main()` |

## 1. Errors this module uses (00 §3.3)

Hooks never surface a `CtxError` to the host (§5 step 5 below). Internally, a thrown `CtxError` is caught and logged to stderr only; `DB_GONE` and `NO_PROJECT` are the two keys this module can hit (DB open, project resolve).

## 2. `src/core/hooks/throttle.ts`

### 2.1 Export

```ts
export function shouldHint(db: DbHandle, sessionId: string, onceKey: string): boolean;
```

### 2.2 Steps

1. Read the `hints` meta row for key `"hint:" + sessionId + ":" + onceKey` with `metaTake`-shaped read (peek only, no delete): if present and its stored count is a multiple of `MCP_HINT_EVERY` away from 0, treat as "fire" (step 3 recomputes).
2. Count-based keys (`large-output-mcp` row, PRD §10.2 "re-fires every 10 calls") use a stored integer count: `count = (count ?? 0) + 1`; fire when `count % MCP_HINT_EVERY === 1` (fires on the 1st, 11th, 21st, … call). `MCP_HINT_EVERY` is read from `constants.ts`, itself `env.CTX_MCP_HINT_EVERY` at build/resolve time (Q1 names the env override; `constants.ts` reads it once at process start — Assumption A20, no source says re-read per call).
3. Plain once-per-session keys (`read-50kb`, `bash-grep-hint`) use a boolean row: fire only when the row does not exist yet; after firing, write it with value `"1"`.
4. Every write in steps 2–3 happens inside the same `withWrite` transaction as the journal append for that hook call (§4 step 3), so a crash between "decided to hint" and "wrote the marker" cannot double-fire or never-fire across a retry.
5. Return `true` when step 2 or 3 decided to fire; `false` otherwise.
6. Keying is `session_id` only (DECISIONS-r9 E5, ADR-0008 item 7): there is no `ppid` fallback. `shouldHint` is called with `ev.sessionId` taken straight from the decoded event; if the adapter's `decode` produced no `sessionId` (empty or absent in the raw payload), `dispatch.ts` never calls `shouldHint` at all and the call gets zero hints (no "latest session" guess, no ppid-derived key). Two different `ppid`s sharing one `session_id` share one marker and fire once between them.

## 3. `src/core/hooks/detached.ts`

### 3.1 Export

```ts
export function appendDetached(project: ProjectContext, sessionId: string, row: NewJournalRow): void; // fire-and-forget
```

### 3.2 Steps

1. Call `openDb(project)` and `appendEvent` inside `withWrite`, but do not `await` the promise chain from the caller's perspective: the function itself is `async` internally but its exported signature returns `void` and the caller (`dispatch.ts`) never `await`s it (00 rule: "Journal writes from hooks are detached", GP3, A32).
2. Catch every error inside the promise chain; on failure, write one line to stderr (`"hooks: journal write failed: " + err.message`) and return. A journal-write failure never surfaces to the host process or delays its exit code (§5 step 5).
3. `closeDb` is **not** called here: the hook process exits right after `adapter.encode` runs (§5.3 step 4 below), and `node:sqlite`'s own process-exit flush covers the common case; no explicit checkpoint is attempted from a detached write, because waiting on one would turn "detached" into "blocking" (Assumption A21 — ADR-0009 §0 is silent on whether a detached hook write closes its own handle).

## 4. `src/core/hooks/dispatch.ts`

### 4.1 Export

```ts
export async function handleHook(agent: AgentId, raw: unknown, env: NodeJS.ProcessEnv): Promise<HookOutput>;
```

### 4.2 `handleHook` steps — covers `src/core/hooks/dispatch.ts`, proves GP3

1. `const row = getAdapter(agent)`. Unknown `agent` id (not in `AGENT_IDS`) → return `row.encode`-shaped minimal output: `{ stdout: "", exitCode: 0 }` built from Claude Code's own encode function as the universal fallback shape (Assumption A22: `AGENT_IDS` is a closed tuple set at build time from `adapters/table.ts`, so this branch is unreachable in a built release — kept only so a corrupt bundle fails open, per step 11 of §4.3 below, not as a real runtime path).
2. `let ev: CanonicalHookEvent; try { ev = row.decode(raw); } catch (err) { console.error("hooks: decode failed: " + err.message); return row.encode({ event: "PreToolUse", agent, sessionId: "", cwd: "", turn: 0 } as CanonicalHookEvent, { kind: "allow" }); }` — decode never blocks the host (§5 step 5; the dummy event is discarded immediately, its `encode` call only needs to produce the native "allow" shape for this agent).
3. Resolve `project = resolveProject(agent, { env, argv: process.argv, cwd: ev.cwd, piCwd: undefined })`. On throw (`NO_PROJECT`): skip all DB-touching steps below (no journal write, no state render) and go straight to step 10 with `decision = { kind: "allow" }` — a hook with no resolvable project never denies or hints (fail open, same rule as step 11).
4. Dispatch on `ev.event`:
   - `"SessionStart"` → §4.3.
   - `"UserPromptSubmit"` → §4.4.
   - `"PreToolUse"` → §4.5.
   - `"PostToolUse"` → §4.6.
   - `"PreCompact"` → §4.7.
   - any other string → treat as `"PreToolUse"` with `decision = { kind: "allow" }` (defensive default; no source names a fifth canonical value reaching `dispatch.ts`).
5. Each sub-section below returns a `Decision` (and, for `PreToolUse`/`PostToolUse` case B/C, an `extra` string).
6. `return row.encode(ev, decision, extra)`.

### 4.3 `SessionStart`

1. `if (ev.source === "compact" && row.compactDelivery === "sessionstart")`:
   1. `if (row.compactSummary === "host")` (D6: the host already writes its own compact summary; verified only for Claude Code today): `decision = { kind: "hint", text: POINTER_LINE, onceKey: "compact-state" }`, where `POINTER_LINE` is the fixed, byte-stable string `"context-mode: earlier work of this session is in ctx_resume (state block) and ctx_search(scope:\"session\", sort:\"timeline\")."`. No state block is rendered or opened here; `ctx_resume()` with no `seq` still computes and returns the 2,048 B block on demand, on its own call path, not from this step. Skip steps 2–3 below.
   2. `else` (`row.compactSummary === "none"`: the host has no own summary, or LV-COMPACT (M3) has not yet verified it for this agent): `openDb(project)`.
   3. `rows = readSessionEvents(db, ev.sessionId)`; `text = renderState(rows, ev.turn ?? 0)` (tools-session export, 00 §4; proves GP6); `decision = { kind: "hint", text, onceKey: "compact-state" }` — the full 2,048 B block (D1 algorithm, unchanged), delivered through this agent's existing ADR-0009 §6 `sessionstart` path.
   4. `onceKey` is set in both branches so a second `SessionStart(compact)` inside the same session id (should not happen per ADR-0009 "exactly once") would still be throttled by §2 if it somehow fired twice (Assumption A23: ADR-0009 says "once" but does not say what guards a duplicate event; reusing the throttle marker is the one mechanism this module already owns).
   5. Go to §4.2 step 6.
2. Else (`ev.source` is `"startup" | "resume" | "clear"`, or this agent's delivery is not `sessionstart`): `fire = shouldHint(db, ev.sessionId, "resume-hint")` (requires `openDb` first; if `openDb` throws `DB_GONE`, treat as `fire = false`, no hint — step 3 of §4.2 already caught non-project cases, this catches a DB that vanished after project resolution).
3. `if (fire)`: `decision = { kind: "hint", text: "This session may have run before. Call ctx_resume for a summary of what happened.", onceKey: "resume-hint" }`. Else `decision = { kind: "allow" }`.
4. No journal row is written for `SessionStart` (it is read-only against the journal; PRD §10.1 lists its job as "journal hint; ctx_resume hint" — hint, not write).

### 4.4 `UserPromptSubmit`

1. `appendDetached(project, ev.sessionId, { session_id: ev.sessionId, worktree: project.worktree, agent, kind: "prompt", tool: null, key: null, path: null, ok: 1, exit_code: null, bytes: Buffer.byteLength(ev.prompt ?? ""), body: ev.prompt ?? "", turn: ev.turn ?? 0, sandbox_bytes: 0, returned_bytes: 0 })` (ADR-0009 §1 row kind `prompt`).
2. `if (row.compactDelivery === "pending-flag")`:
   1. `openDb(project)`.
   2. Inside `withWrite` (`BEGIN IMMEDIATE`): `pending = metaTake(db, "pending_compact:" + ev.sessionId)` — a `DELETE … RETURNING` so this fires exactly once even under a retried hook call (ADR-0009 §6).
   3. `if (pending && row.compactSummary === "host")` (D6; none of today's pending-flag agents — gemini, copilot-cli, vscode — are verified, so this branch is not live until a future LV-COMPACT pass flips one of their rows): `decision = { kind: "hint", text: POINTER_LINE, onceKey: "pending-compact" }` (same fixed string as §4.3 step 1.1; no state block).
   4. `else if (pending)` (`row.compactSummary === "none"`, the current case for every pending-flag agent): `rows = readSessionEvents(db, ev.sessionId); text = renderState(rows, ev.turn ?? 0); decision = { kind: "hint", text, onceKey: "pending-compact" }` — the full 2,048 B block, through this agent's existing ADR-0009 §6 `pending-flag` path.
   5. `else`: fall through to step 3.
3. `decision = { kind: "allow" }` when no pending-compact delivery fired.
4. Go to §4.2 step 6.

### 4.5 `PreToolUse`

1. No DB open on this path (00 rule: "no DB open on the PreToolUse path", PRD P4). All state this step needs — `userDeny` rules — comes from `userDeny = readUserDeny(env, agent)` (`enforcement`'s `user-deny.ts`, synchronous, reads the host's already-loaded policy file bytes, no DB).
2. `decision0 = decide(ev, row, userDeny)` (`enforcement` export, 00 §4). For Read (and, on hosts with no Read tool, a one-file shell dump), `decide()` now returns `deny` when the call has no `offset`/`limit` (no bound argument for a dump) and the file is over `OUTPUT_CAP`; a ranged Read or a bounded dump stays `allow` (DECISIONS-r8 VR; rule logic owned by `enforcement`, 08-enforcement.md step 6).
3. `if (ev.agentId)` (subagent marker, Q23): `subCase = pickSubagentCase(ev, toolSetForAgentType(ev.agentType))`. `toolSetForAgentType` resolution (frontmatter / built-in row / plugin manifest) is `enforcement`'s own responsibility per ADR-0016 "How the subagent's tools are known"; this module only calls `pickSubagentCase` and never resolves tool sets itself.
   - Case A: `decision = decision0` unchanged (same deny as the main session).
   - Case B: if `decision0.kind === "deny"`, rewrite its reason to the `run.mjs` wrapper command: `wrapped = "node " + resolvePluginRoot(row, env) + "/run.mjs " + base64(ev.tool.input.command) + " " + base64(JSON.stringify(userDeny)) + " " + base64(ev.tool.description ?? "")`; `decision = { kind: "deny", reason: denyTemplateFor(ev, row, wrapped), rewritten: wrapped }`. If `decision0.kind !== "deny"` (an `allow` for a subagent with Bash but no ctx tools still must not let a large output through unchecked) — Case B's budget enforcement happens on `PostToolUse` instead (§4.6 step 4), because `PreToolUse` cannot know the output size yet; `decision` stays `decision0` here.
   - Case C: if `decision0.kind === "deny"`, downgrade to the Case-C "no output replacement" alternative text only where the agent's table row says Case C has no replace channel (VS Code, Kiro, ADR-0016 Per-agent table): `decision = { kind: "deny", reason: caseCNoReplaceAlternative(ev, row) }`. Otherwise `decision = decision0`; the real Case-C work (selecting chunks) happens on `PostToolUse` (§4.6 step 5), since `PreToolUse` runs before the tool executes and has no output to replace yet.
4. `if (decision.kind === "hint")`: `fire = shouldHint(dbOpenedLazilyJustForThrottle, ev.sessionId, decision.onceKey)` — this is the one `PreToolUse` sub-step allowed to touch the DB, and only the throttle marker table, never the journal; it is still "no DB open on the PreToolUse path" in spirit-breaking terms per 00's own exception list, because `shouldHint` is read/write against `meta`, not against `events`, and both ADR-0008 ("hints once per session, keyed by session_id in context.db") and 00's hooks-import row (`store (journal + meta only)`) name `meta` as an explicit, listed exception to the no-DB rule (Assumption A24: 00's P4 bullet and its own import grant for `meta` are read together, since a literal "hints once per session in context.db" is impossible with zero DB access). `if (!fire)`: `decision = { kind: "allow" }`.
5. Go to §4.2 step 6.

### 4.6 `PostToolUse`

1. `isOwnTool = ev.tool.canonicalName.startsWith("ctx_")`. `if (isOwnTool)`: skip steps 2–3 entirely (server already wrote this row at handler-return time, ADR-0009 §0); go to step 6 with `decision = { kind: "allow" }`.
2. Else: `kind: EventKind = ev.result.isError ? "toolerr" : (ev.tool.canonicalName === "Write" || ev.tool.canonicalName === "Edit" ? "edit" : (ev.tool.canonicalName === "Bash" ? "cmd" : "toolerr"))`. A non-error Read/Grep/WebFetch produces no row at all (ADR-0009 §1 only names `prompt`/`edit`/`cmd`/`toolerr`/`index`; a clean non-Bash, non-edit tool call has no kind to fall into, so none is written — Assumption A25, consistent with "failures from host tools" being the stated reason PostToolUseFailure exists).
3. `key` for `cmd`: canonical command via the quote-aware whitespace-fold state machine shared with `enforcement`'s lexer (ADR-0009 §1 "a quote-aware state machine that only folds whitespace outside quotes" — this module calls `enforcement`'s exported lexer tokenizer and re-joins tokens with single spaces, rather than owning a second copy, per the DAG: `hooks` already imports `enforcement`). `key` for `toolerr`: `ev.tool.canonicalName + ":" + stableJson(ev.tool.input)`. `exit_code`: parse `ev.result.text`'s first line with `startsWith("Exit code ")` and a digit loop (ADR-0009 §1); `null` if no such line. `path`: `ev.tool.input.file_path ?? ev.tool.input.path ?? null`.
4. `appendDetached(project, ev.sessionId, { session_id: ev.sessionId, worktree: project.worktree, agent, kind, tool: ev.tool.canonicalName, key: key ?? null, path, ok: ev.result.isError ? 0 : 1, exit_code, bytes: ev.result.bytes, body: (ev.result.text ?? "").slice(0, POINTER_MIN), turn: ev.turn ?? 0, sandbox_bytes: ev.result.bytes, returned_bytes: ev.result.bytes })` — `body` is capped at `POINTER_MIN` (640 B) bytes here only to bound the journal row's own storage; this is unrelated to and does not substitute for the `ctx_resume` pointer mechanism, which reads the full tool-result text from the host, not from this capped copy (Assumption A26: no source bounds the journal's stored `body` size for a non-`ctx_*` row, and an unbounded copy of every large Read/Grep output would defeat ADR-0016's own purpose).
5. Subagent Case B/C completion (deferred from §4.5 step 3):
   - Case B, `decision0.kind` was `allow` at `PreToolUse` and the real output is now known: `if (ev.result.bytes > OUTPUT_CAP)`, run the DECISIONS-r9 F1 split on `ev.result.bytes` against `SYNC_INDEX_MAX_BYTES` (`65536`, 00 §3.2):
     - `ev.result.bytes <= SYNC_INDEX_MAX_BYTES`: `sourceId = indexText(db, project, ev.sessionId, "subagent:" + ev.tool.canonicalName + ":" + ev.turn, ev.result.text, "text").sourceId` (chunked and written to FTS5 inline, inside this hook call); `selected = selectChunks(db, sourceId, ev.tool.description ?? "", OUTPUT_CAP)`; `decision = { kind: "replace", output: selected.text + (selected.more ? "\n" + selected.more : "") }`.
     - `ev.result.bytes > SYNC_INDEX_MAX_BYTES`: chunk `ev.result.text` in memory with the same chunker `indexText` uses internally (no DB write yet); run `selectChunks`'s in-memory form (`05-tools-index.md` §5) — BM25 over the in-memory chunks against `ev.tool.description ?? ""`, capped to `OUTPUT_CAP` — and set `decision = { kind: "replace", output: selected.text + (selected.more ? "\n" + selected.more : "") }` from that result. The FTS5 write of the full chunk set then runs through `appendDetached`'s same fire-and-forget path (§3), never blocking this `decision`. No byte of `ev.result.text` is dropped: the in-memory selection reads whole chunks, it is the detached write that lands them in `sources`/`chunks` after the hook has already answered.
     - `else` (`ev.result.bytes <= OUTPUT_CAP`): `decision = { kind: "allow" }` (output already under budget, nothing to replace, nothing indexed).
   - Case C: same split on `ev.result.bytes` against `OUTPUT_CAP` then `SYNC_INDEX_MAX_BYTES` as Case B above (Case C has no pre-check equivalent to Case B's `allow`-at-`PreToolUse` step, since Case C's whole mechanism is post-run replacement); `decision = { kind: "replace", output: selected.text + (selected.more ? "\n" + selected.more : "") }` or `{ kind: "allow" }` under `OUTPUT_CAP`.
   - Case A, or no subagent marker: `decision = { kind: "allow" }` (the main session's own large-output handling for non-`ctx_*` tools is a hint, not a replace — ADR-0016 scopes the replace mechanism to subagents only; the main session relies on the tool's own size being whatever the host tool already returns).
6. Go to §4.2 step 6.

### 4.7 `PreCompact`

Only reached for `row.compactDelivery === "pending-flag"` agents (gemini, copilot-cli, vscode); other agents' adapters never emit this event into `dispatch.ts` because their `eventMap` has no entry for it (`decode` would not produce `event: "PreCompact"` — Assumption A27, consistent with ADR-0001 "the adapter never picks between paths at runtime").

1. `openDb(project)`.
2. Inside `withWrite`: `metaSet(db, "pending_compact:" + ev.sessionId, "1")`.
3. `decision = { kind: "allow" }`.
4. Go to §4.2 step 6.

## 5. `src/entries/hook.ts` — `main()`

Covers GP3, proves the hook round-trip fixture (`e2e/fixtures/<agent>/<ver>/<event>.json` → `e2e/cases/GP3-*.e2e.mjs`).

### 5.1 Export

```ts
export async function main(argv: string[], env: NodeJS.ProcessEnv): Promise<never>; // calls process.exit
```

### 5.2 Steps

1. Parse `--agent <id>` from `argv`. Missing or not in `AGENT_IDS` → print nothing to stdout, `process.exit(0)` (fail open per §4.2 step 1's own fallback — a hook entry that cannot identify its agent still must never block the host).
2. Read stdin fully to a UTF-8 string (`process.stdin` piped, never a TTY for a hook invocation — no TTY gate here, that gate belongs to `server.ts`'s lifecycle per 00 §5.1 step 4, a different entry point).
3. `let raw: unknown; try { raw = JSON.parse(stdinText); } catch { process.stdout.write(""); process.exit(0); }` (malformed JSON from the host → allow, empty stdout, exit 0; same fail-open rule).
4. `const out = await handleHook(agentId, raw, env);` wrapped in its own `try/catch`: any throw out of `handleHook` (should not happen — `dispatch.ts` §4.2 steps 2/3 already catch decode/project failures internally) is caught here as the last line of defense: `console.error("hooks: " + err.message); process.stdout.write(""); process.exit(0)` (00 §5.3 step 5: "Any thrown error → allow with empty stdout, exit 0; log to stderr. Never block the host.").
5. `process.stdout.write(out.stdout); process.exit(out.exitCode);`
6. Kiro special case: `row.denyChannel` or `agent === "kiro"` on a `UserPromptSubmit` event writes exactly `""` to stdout regardless of `decision.kind` (GP3: "Kiro's `promptsubmit.json` asserts `stdout == ""` on exit 0; plain-text-only hooks; no JSON on stdout" — v1 regression `ff0a9a26`). This rule lives inside `adapters/kiro.ts`'s `encode`, not in `hook.ts` itself (DAG: `hook.ts` only calls `row.encode`, it never special-cases an agent by name — Assumption A28, keeping the one-path rule of ADR-0001 §3).

### 5.3 Wall-time budget (GS6, TECH-SPEC §1)

- Matcher gate (DECISIONS-r9 R4): the hook process spawns for the agent's `nativeTools` set (00 §3.1 `AdapterRow.nativeTools`) plus its own `toolNamePrefix`-scoped `ctx_*` calls — `^(<all nativeTools names>|<escaped toolNamePrefix>ctx_.*)$` — never for only `mcp__context-mode__.*` (that matcher never sees the native calls ADR-0008 denies). Claude Code's own prefix is `mcp__context-mode__` (hyphen, R3); Codex's is `mcp__context_mode__` (underscore, R1).
- Claude Code: p95 ≤ `HOOK_P95_MS` (40 ms) wall, measured end-to-end by `hook-runner.mjs`.
- Command-hook agents (every other agent, spawning this same `hook.mjs` for every matched native tool call): bare Node p95 is 45.6 ms (S-TIMEOUT measurement, ADR-0008 "Open"); this module's own code on top of bare-Node spawn stays ≤ `HOOK_CPU_OVER_NODE_MS` (20 ms CPU), enforced in CI as a bench assertion in GP3, not a wall-clock one (ADR-0008 "Open": the end-to-end 40 ms wall number is unratified for these agents; only the 20 ms CPU-over-bare-Node delta and the combined `HOOK_COMBINED_P95_MS` = 60 ms ceiling are settled, GS6/A31). No step in §4 opens a second process, spawns a child, or starts a timer — the entire dispatch is synchronous DB I/O plus the two in-process calls (`renderState`, `selectChunks`) already specced by `tools-session`/`tools-index`.
- Start-up cost of `hook.mjs` (D-CI-PERF-3, D-CI-PERF-4): the hook is spawned once per matched tool call, so its parse and compile time is on every call. Two measured changes keep that time down. (1) The hook code takes `node:fs` through `process.getBuiltinModule("node:fs")`, not a static import, because a static ESM import loads 30 extra internal modules. (2) The hook bundle alone is built with esbuild `minify: true` (155 KB to 91 KB). Local overhead median over bare Node is about 8 to 12 ms (60 interleaved pairs, machine under load). The CI gate is the D3 check `e2e/checks/setup-hook-overhead.mjs`: overhead p95 <= `OVERHEAD_P95_MS` = 15 ms on all three OS. The 40 ms wall target stays a reported number (ADR-0019 D3); `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/OPEN-ITEMS.md` item 1 tracks the 41 ms measurement.
- `PreToolUse` opens the DB only for the throttle marker (§4.5 step 4); it never opens it for the journal (00 rule P4), which is the one thing keeping this path inside the CPU budget: a `meta` row touch is a single-row lookup, not a journal scan.

## 6. Journal rows this module writes (ADR-0009 §1, cross-reference to `store`)

| Kind | Written by | Key fields |
|---|---|---|
| `prompt` | §4.4 step 1 | `body` = full prompt text, `bytes` = its length |
| `cmd` | §4.6 step 2–4, `canonicalName === "Bash"` | `key` = canonical command string |
| `edit` | §4.6 step 2–4, `canonicalName` in `{Write, Edit}` | `path` = the edited file |
| `toolerr` | §4.6 step 2–4, any other tool, or a failed Bash/edit | `key` = `tool + ":" + stableJson(input)` |

`index` rows (ADR-0009 §1) are written by `tools-index`'s `indexText`, not by this module directly — `dispatch.ts` only calls it (§4.5 step 3 Case B deferred path, §4.6 step 5), it never constructs an `index`-kind row itself.

## 7. Compaction trigger paths per agent (ADR-0001 delivery table, ADR-0009 §6)

| Agent | Trigger event this module reads | Where in §4 |
|---|---|---|
| Claude Code, Codex, Qwen, ZCode | `SessionStart(source=compact)` | §4.3 step 1 |
| Gemini, Copilot CLI, VS Code | `PreCompact` sets the flag; next `UserPromptSubmit` delivers it | §4.7, then §4.4 step 2 |
| Pi | `session_compact` flag (Pi's own event, mapped by `adapters/pi.ts`'s in-process glue to this module's `PreCompact`/`UserPromptSubmit`-equivalent calls — `pi.ts` is the adapter, this module stays agent-agnostic per §4.7's note) then `before_agent_start` | §4.7-equivalent, then §4.4-equivalent |
| OpenCode 2 | its own cache-stable channel (Q12); mapped the same way as Pi, through `adapters/opencode.ts` | §4.7-equivalent, then §4.4-equivalent |
| Kiro | none — no compaction signal exists; `dispatch.ts` never receives a `PreCompact`-mapped event for this agent, so §4.7 is simply never reached | not reached (documented gap, ADR-0009 §6) |

## 8. E2E proof and ADR-0017 `covers`

| Function / path | GP3 row (TECH-SPEC §6.2) | Live case |
|---|---|---|
| `handleHook` dispatch, all 4 events × 10 adapters | "Hooks, ×10 adapters × 4 events … native stdout/exit code; hint once per session; never empty fields; never throws" | `S-NODE`/`ADR-0006-reprobe` adjacent; no dedicated live id beyond GP3 fixtures |
| `shouldHint` throttle | GP3 "hint once per session" row | — |
| `appendDetached` | GP3 "`PostToolUse` dispatch is fire-and-forget" row | — |
| `PreToolUse` deny/rewrite/hint, `decide`/`pickSubagentCase` calls | ADR-0008 Golden cases, ADR-0016 Golden cases (GP3) | LV1, LV2, LV8–LV10 |
| `PreCompact`/pending-flag delivery | ADR-0009 "Golden cases (GP6)" | `[V]` live note in ADR-0009 §6 |
| Kiro `stdout == ""` | GP3 Kiro fixture row | — |
| Wall-time budget | TECH-SPEC §1 GS6 row, "GP3 bench" | T-GS6 (DECISIONS-r9 V14): bench asserts `HOOK_P95_MS` ≤ 40 ms wall for Claude Code and `HOOK_CPU_OVER_NODE_MS` ≤ 20 ms CPU plus `HOOK_COMBINED_P95_MS` ≤ 60 ms wall for every command-hook agent, n ≥ 200 runs per agent, scorer = p95 of recorded durations |
| §4.6 step 5 output split | DECISIONS-r9 F1 | T-F1: fixture pair at `SYNC_INDEX_MAX_BYTES` (65536) exactly and at 1 MB; asserts inline FTS5 write below the cap, detached write above it, and `decision.output` byte-identical in both paths to the in-memory `selectChunks` result |
| §5.3 matcher gate (native `nativeTools` ∪ own prefix) | DECISIONS-r9 R4 | T-CX: Codex fixture asserts `tool_name: "Bash"` is matched by the generated matcher and that `mcp__context_mode__ctx_execute` (underscore) is matched, not `mcp__context-mode__` |

ADR-0017 `covers`: `src/core/hooks/`, `src/entries/hook.ts`.

## 9. Constants this module reads (`constants.ts`, 00 §3.2)

`MCP_HINT_EVERY`, `OUTPUT_CAP`, `SYNC_INDEX_MAX_BYTES`, `POINTER_MIN`, `HOOK_P95_MS`, `HOOK_CPU_OVER_NODE_MS`, `HOOK_COMBINED_P95_MS`, `READ_MAX_LINES`. No other constant in the table is read by `hooks`.

## Assumptions

- A20: `MCP_HINT_EVERY` (env `CTX_MCP_HINT_EVERY`) is read once at process start from `constants.ts`, not re-read per hook call; no source says otherwise.
- A21: a detached journal write does not call `closeDb`; it relies on process-exit flush, so a detached write is never allowed to block the hook's own exit.
- A22: the unknown-`agent` branch in `handleHook` is unreachable in a built release (agent ids come from a closed, build-time tuple); kept only as a fail-open guard against a corrupt bundle.
- A23: a duplicate `SessionStart(compact)` inside one session reuses the `shouldHint` marker as its own duplicate guard; ADR-0009 states "once" but names no mechanism.
- A24: `PreToolUse`'s "no DB open" rule (P4) and ADR-0008's "hints keyed by session_id in context.db" are read together as: `meta` access is the one listed, allowed exception on this path; `events` (the journal) is still forbidden here.
- A25: a clean (non-error) Read/Grep/WebFetch produces no journal row at all; ADR-0009 §1 names no `EventKind` it would fall into.
- A26: a non-`ctx_*` journal row's stored `body` is capped at `POINTER_MIN` (640 B); this is a storage bound only, unrelated to the full-text `ctx_resume`/pointer mechanism which reads from the host's own result, not from this copy.
- A27: an adapter whose `eventMap` has no `PreCompact` entry never produces a `PreCompact`-shaped `CanonicalHookEvent`; `dispatch.ts` has no agent-name branch for this, it is purely adapter-table-driven.
- A28: the Kiro `stdout == ""` rule lives inside `adapters/kiro.ts`'s `encode`, never as an agent-name special case inside `hook.ts` or `dispatch.ts`.
- A29 (intern M3 Q2, Q3, Q9): the hook entry sets `process.exitCode` and never calls `process.exit`, so detached journal/index writes land first (D-M3-H2-8). There is no `caseCNoReplaceAlternative`: case C keeps the PreToolUse decision, the replace happens at PostToolUse, and an adapter with no replace channel drops it in `encode` (D-M3-H2-4). PreToolUse calls the real export `readUserDeny(project.worktree, agent)` and opens the DB only for the hint throttle marker (D-M3-H2-7).

## Changes

- `READ_HINT_BYTES` retired, `READ_MAX_LINES` added; §4.5 step 2 now denies an unranged Read (or unbounded one-file shell dump) over `OUTPUT_CAP` instead of hinting (DECISIONS-r8).
- D6 (`https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/review/DECISIONS-r6.md`; measured in `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/memory-r6/eval/results.md`): `SessionStart` (§4.3 step 1) and the pending-flag path (§4.4 step 2) now branch on `row.compactSummary`; `"host"` sends the fixed pointer line only, `"none"` sends the full 2,048 B block through the agent's existing ADR-0009 §6 path.
- DECISIONS-r9: §5.3 matcher gate now reads `nativeTools` plus `toolNamePrefix` (R4), not a hardcoded `mcp__context-mode__.*`; §4.6 step 5 splits on `SYNC_INDEX_MAX_BYTES` for in-memory chunk selection above it (F1); §2.2 adds the session-id-only throttle keying with no-session-id = no hint (E5); §8 table adds T-GS6, T-F1, T-CX test specs for V14/F1/R4.
