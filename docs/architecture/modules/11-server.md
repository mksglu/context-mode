# 11 — Module `server`: implementation spec

Owner: `server`. Follows `docs/architecture/modules/00-architecture.md` file tree, types and constants exactly. Sources: PRD-v2, TECH-SPEC §3, §6; ADR-0004, ADR-0006, ADR-0007; DECISIONS-r3 Q11/Q19/Q24; DECISIONS-r4 A1, B47, B48, B53; GP1, GP2, GP9.

Files this module owns, in build order:

1. `src/core/tools/registry.ts`
2. `src/prompt/instructions.md`
3. `src/prompt/tools/<tool>.md` × 9
4. `src/core/lifecycle/exit.ts`
5. `src/entries/server.ts`

Imports allowed (00 §2): `contracts`, `store`, `tools-exec`, `tools-index`, `tools-session`, `tools-ops`, `adapters`. External: `@modelcontextprotocol/server` 2.3.1, `zod`.

---

## 1. `src/core/tools/registry.ts`

### Exports

```ts
export const TOOLS: readonly ToolDef<any>[];
```

`ToolDef<I>` is defined in `src/core/contracts/types.ts` (00 §3.1): `{ name, description, schema, readOnly, alwaysLoad, handler(input, ctx) }`.

### Steps

1. Import the 9 handlers: `ctxExecute`, `ctxBatch` (tools-exec); `ctxIndex`, `ctxSearch` (tools-index); `ctxResume`, `ctxStats`, `ctxPurge` (tools-session); `ctxDoctor`, `ctxUpgrade` (tools-ops).
2. Import each tool's description text from `src/prompt/tools/<tool>.md` (build inlines the file; at dev time read it with `node:fs`).
3. Build one `ToolDef` object per tool, in the exact order of the constant `TOOL_ORDER` (`src/core/contracts/constants.ts`): `ctx_execute, ctx_batch, ctx_index, ctx_search, ctx_resume, ctx_stats, ctx_doctor, ctx_upgrade, ctx_purge`.
4. Set `readOnly: true` on `ctx_search`, `ctx_resume`, `ctx_stats` only (00 §5.1 step 3, `readOnlyHint`). All others `readOnly: false`.
5. Set `alwaysLoad: true` on `ctx_execute` only (ADR-0006 decision 2). All others `alwaysLoad: false`.
6. Freeze the array (`Object.freeze`) so no caller can mutate order at runtime.
7. Assert, at module load, that `TOOLS.map(t => t.name)` equals `TOOL_ORDER` exactly (array length 9 and same order); throw a plain `Error` on mismatch — this only runs in dev/build, never ships as a runtime check in the bundle.

### Errors

None at call time; this module has no handler of its own.

### Constants used

`TOOL_ORDER` (from `constants.ts`).

### E2E coverage

GP1 ("`tools/list` 9 tools: ctx_doctor and ctx_upgrade stay as tools... G4"); GP2 (fixed, deterministic order helps prompt caching, PR9). ADR-0017 `covers`: `src/prompt/`, `src/server.ts` (A2: PRD path is `src/entries/server.ts` / `src/core/tools/registry.ts`).

---

## 2. `src/prompt/instructions.md`

Plain Markdown text, read in full and set as `INSTRUCTIONS` (below). Content rules (not this module's code, but this module ships the file):

- States what context-mode's tools do and when to search for and use them (ADR-0004 decision 2a). Does not restate what is already in a tool description (MCP 2026-07-28 rule, ADR-0007 context).
- Follows ADR-0005 lint: no case-sensitive `MUST|NEVER|ALWAYS|CRITICAL|MANDATORY|IMPORTANT|REQUIRED|DO NOT|ONLY|ALL|ANY`; no `if in doubt|when (in doubt|uncertain|unsure)|default to`; no pseudo-XML tags.
- Byte length ≤ `INSTRUCTIONS_CAP` (2,048 chars, `constants.ts`).
- Byte-stable: no machine-dependent text (ADR-0005 context: v1's `ctx_execute` Bun-detection prefix is the named anti-pattern; this file carries no such prefix).
- Content source: `docs/architecture/prompt-drafts.md` is the draft; this file is the shipped, linted text. Writing the exact prose is out of scope for this spec (drafts.md is the source of truth); this spec only fixes where the bytes go and how they are checked.

### E2E coverage

GP2 (identical bytes on 3 OS; `lint.mjs` = 0 failures; budgets Q5; no user-role injection; byte-stable across requests in one turn). ADR-0017 `covers`: `src/prompt/`.

---

## 3. `src/prompt/tools/<tool>.md` × 9

One file per tool name in `TOOL_ORDER`: `ctx_execute.md`, `ctx_batch.md`, `ctx_index.md`, `ctx_search.md`, `ctx_resume.md`, `ctx_stats.md`, `ctx_doctor.md`, `ctx_upgrade.md`, `ctx_purge.md`.

- Each file is the full `description` field for its tool. Self-contained: a client that never sees `instructions.md` must still be able to use the tool correctly from this text alone (ADR-0004 decision 2b).
- Length ≤ `DESCRIPTION_CAP` (1,024 chars, `constants.ts`) each.
- Sum of all 9 descriptions + their Zod-derived JSON schemas ≤ `SURFACE_CAP` (8,000 chars, `constants.ts`).
- Same ADR-0005 lint rules as `instructions.md`.
- `ctx_execute.md` carries no machine-dependent prefix (fixes v1 `src/server.ts:1246`).

### E2E coverage

GP2 (budgets; lint 0 failures). ADR-0017 `covers`: `src/prompt/`.

---

## 4. `src/core/lifecycle/exit.ts`

### Exports

```ts
export function installExitGuard(opts: {
  onShutdown: () => void;
  isTTY: boolean;
}): void;
```

### Inputs

- `onShutdown`: callback that performs the server's own cleanup (`closeDb`, remove `owners/<server-id>.pid`). Supplied by `server.ts`.
- `isTTY`: pass `process.stdin.isTTY` from the caller so this module stays testable without touching real `process.stdin`.

### Output

None (side-effecting: registers process listeners).

### Steps

1. If `isTTY` is true: register nothing on stdin. Return. (TTY gate — #534, #236; a direct terminal run must not exit on idle, and the `end` listener must never be attached in this case.)
2. If `isTTY` is false: attach one `end` listener to `process.stdin`.
3. On `end`: call `onShutdown()`, then start the escalation timer in step 4.
4. Escalation: send `SIGTERM` to `process.pid` immediately on `end`. Start a timer for `EXIT_SIGTERM_MS`; if the process has not exited by then, the OS default `SIGTERM` handler is expected to have exited it — this module does not re-send `SIGTERM`. Start a second timer for `EXIT_SIGKILL_MS` from the same `end` event; if the process is still alive at that point, call `process.kill(process.pid, "SIGKILL")`.
5. Both timers are started with `.unref()` so they never hold the event loop open on their own, and both are cleared if `process.exit` already ran (listen once on `process.on("exit", ...)` to clear them).
6. No other timer, probe, or `ps`/`execFileSync` call is started by this module (PRD P5, GP9; v1's ppid-polling grandparent check, `src/lifecycle.ts`, is not carried into v2 — see Assumptions A1 below).
7. Windows parent-death: not handled in this file. Per DECISIONS-r9 F6, Windows uses the same stdin-EOF path as Unix, then `taskkill /T` of the server's own children — no Job Object; that is wired in `src/entries/server.ts` step 9b below.

### Errors

None returned; this module only sends signals and calls the supplied callback. `onShutdown` exceptions are caught by the caller (`server.ts`), not here.

### Constants used

`EXIT_SIGTERM_MS` (2000), `EXIT_SIGKILL_MS` (5000) — both from `constants.ts`.

### E2E coverage

GP9: "exit < 2 s; no spawn at boot; no `chdir`; stdin-EOF → SIGTERM (2 s) → SIGKILL (5 s) escalation... stdin is a TTY ⇒ the `end` listener never registers and the process does not exit on TTY idle" (ledger row `GP9/tty-gate`). ADR-0017 `covers`: `src/entries/server.ts` (lifecycle lives under `server`'s owned tree).

---

## 5. `src/entries/server.ts`

### Exports

```ts
export function startServer(argv: string[], env: NodeJS.ProcessEnv): Promise<void>;
export const INSTRUCTIONS: string;
```

`INSTRUCTIONS` is the full text of `src/prompt/instructions.md`, inlined by the build (00 §1, release-branch tree: "`server.mjs` — `src/entries/server.ts` bundle (prompt inlined)").

### `startServer(argv, env): Promise<void>`

No return value; this function runs for the life of the process and only resolves on clean exit.

#### Steps

1. **Resolve agent id** (ADR-0007 decision 4, DECISIONS-r3 Q11/Q24):
   a. Read `--agent <id>` from `argv`. If present and it is a member of `AGENT_IDS`, use it. Codex's `AdapterRow.projectSource` is `"arg:--agent+cwd"`: the server learns it is running under Codex from this same `--agent` flag, then reads `AdapterRow.execReadOnlyHint` for that row to drive step 4c (DECISIONS-r9 R5).
   b. Else, if `env.CLAUDE_PROJECT_DIR` is set, use `"claude-code"`.
   c. Else, use the `AdapterRow` whose `projectSource === "spawn-cwd"` and read its id the same way `--agent` would have supplied it at install time.
   d. Else: agent id is unresolved. Do not guess. Proceed to step 2 anyway — `resolveProject` (store module) will itself fail with `NO_PROJECT`, and the server still starts and serves `tools/list` so `ctx_doctor` is reachable (PRD §13; this is not a "missing input returns one line" case at startup, because startup must not exit — only the first tool call surfaces `NO_PROJECT`).
2. **Node and `node:sqlite` check:**
   a. If `process.versions.node < NODE_MIN` (compare as dotted version numbers, not strings): set a module-level flag `degraded = true`. Do not throw.
   b. Else `await import("node:sqlite")` in a `try`. On rejection: set `degraded = true`.
   c. `degraded` does not stop startup. It is read in step 5 to shrink the tool list.
3. **Build `TOOLS` for this run:**
   a. If `degraded` is `false`: the list is `TOOLS` from `registry.ts`, unchanged.
   b. If `degraded` is `true`: the list is `TOOLS.filter(t => t.name === "ctx_doctor")` only (PRD §13 — degraded mode serves only `ctx_doctor`). `ctx_doctor`'s own handler is what reports `NODE_TOO_OLD` or `NO_SQLITE`.
4. **Construct the MCP server** with `@modelcontextprotocol/server` v2.3.1:
   a. `instructions: INSTRUCTIONS` — the same bytes are returned from both the 2025-xx `initialize` path and the 2026-07-28 `server/discover` path, because both are answered from this one `INSTRUCTIONS` constant, not two separately-maintained strings (ADR-0007 decision 3, GS9).
   b. Register tools from the list built in step 3, in `TOOL_ORDER` order. Pass each tool's `_meta`: only `ctx_execute` gets `{"anthropic/alwaysLoad": true}` (ADR-0006 decision 2); none of the others carry this key.
   c. Mark `readOnlyHint` on `ctx_search`, `ctx_resume`, `ctx_stats` per their `ToolDef.readOnly` flag. Additionally, for `ctx_execute` only: set `annotations.readOnlyHint = true` when the resolved `AdapterRow.execReadOnlyHint` is `true` (codex row only — all other rows carry `execReadOnlyHint: false`; DECISIONS-r9 R5). Without this, every Codex call fails with `"MCP tool call requires approval, but approval policy is never"` under every `approval_policy`/`default_tools_approval_mode` tried (`out/final/probe-codex.md` Setup).
   d. `tools/list` and `server/discover` results both carry `resultType: "complete"`, `ttlMs: TOOLS_TTL_MS`, `cacheScope: "public"` (ADR-0007 decision 5; constant `TOOLS_TTL_MS`, Assumption A1 of `00-architecture.md`).
   e. Do not register: roots, sampling, logging, resources subscriptions, tasks, elicitation, MRTR (ADR-0007 decision 6). Do not register `ctx_route` as a listed tool — it exists only as an internal `mcp_tool` hook dispatch target used by the `hooks` module, never returned from `tools/list` (ADR-0007 decision 5, Assumption A36-equivalent note in 0007's Changes section).
5. **Stateless identity (ADR-0007 decision 4):**
   a. On every tool call, build `ToolContext` fresh from that request: `sessionId` from request `_meta` if present, else `"mcp:" + serverId` (server-id is a process-local random or PID-derived string generated once at start; `00-architecture.md` Assumption A8). This fallback is kept because a stdio server serves exactly one client — one `StdioServerTransport` per process — so two clients never share it; an unknown or empty session id reads `[]` and never falls back to "latest session" (DECISIONS-r9 F4; v1 `7e6c243a` leaked one session into another this way, PR #398).
   b. Do not cache `clientInfo`, `sessionId`, or `ProjectContext` across requests at module scope, except the one SDK-level exception named in ADR-0007 decision 4: the SDK's own initialize-time `clientInfo` cache may be read at tool-call time, only to detect a 2025-xx client (the #542/#539 fix). This read never changes routing or identity for `ctx_doctor`/`ctx_upgrade` — those two tools' agent id always comes from step 1, never from `clientInfo`.
   c. `ctx_doctor` and `ctx_upgrade` display `clientInfo` (when present) for debugging only; they do not branch logic on it.
6. **Resolve `ProjectContext` lazily:**
   a. Do not call `resolveProject` or `openDb` during steps 1–5. The first call is inside the first tool handler invocation, via `ToolContext.project` computed by the handler's caller (the per-tool dispatch wrapper this file installs around each handler, see step 7).
   b. On that first successful resolution, write `owners/<server-id>.pid` (store module, `owners.ts`) with the live PID. This file is removed in the shutdown callback (step 9).
7. **Install the dispatch wrapper** around every registered handler:
   a. Resolve `ProjectContext` via `resolveProject(agentId, { env, argv, cwd: process.cwd(), piCwd: undefined })` (store module). `agentId` is the one resolved in step 1 — resolved once per call, not cached, because it is cheap (argv/env read) and the server is stateless by design (ADR-0007 decision 4).
   b. Build `ToolContext = { project, sessionId, turn, signal, clientInfo, protocolVersion }`. `turn` and `protocolVersion` come from the request's `_meta`/negotiated version; `signal` is an `AbortSignal` wired to the SDK's own per-request cancel notification.
   c. Call the tool's `handler(input, ctx)`.
   d. On a thrown error from the handler: catch it, and return a tool result with `isError: true` and `text` equal to the error's message if it is a `CtxError` (one line, "`<cause>. Fix: <action>`"); otherwise a generic `"Internal error. Fix: run ctx_doctor."` line — never a raw stack trace to the client (stderr only, step 10).
8. **Cancel (ADR-0007 decision 6, GP4):**
   a. On the SDK's cancel notification for an in-flight request, abort that request's `AbortSignal`. The handler (tools-exec `ctx_execute`/`ctx_batch`) is responsible for tearing down its child process tree within `KILL_GRACE_MS` (1,000 ms, `constants.ts`) and returning a cancel reply; `server.ts` itself does not kill processes.
9. **Install lifecycle:**
   a. Call `installExitGuard({ onShutdown, isTTY: process.stdin.isTTY })` (module 4 above). `onShutdown` is: best-effort `closeDb` on any open `DbHandle` (wrapped in try/catch — a failed checkpoint never blocks shutdown, per store module's `closeDb` contract), best-effort remove `owners/<server-id>.pid`.
   b. Node 24.15.0 core has no API that assigns a process to a Windows Job Object without a native addon. This spec does not add a native dependency for this. So on Windows too, use the same stdin-EOF path as Unix (step 9a's `installExitGuard`, with `isTTY: process.stdin.isTTY`); do not create a Job Object. This is final, not a fallback to revisit (see Assumptions A2).
   c. Install no other timer. No `setInterval` for version checks, stats heartbeats, or sentinel refreshes (those are v1-only, `src/server.ts:4940-4960`; GS7/PRD P5 forbid them in v2 — idle server is 0% CPU). V20 (DECISIONS-r9): with stdin open and no requests for 10 s, process CPU time grows by no more than 1% of wall time, read via `process.cpuUsage()` exposed through `ctx_stats`'s debug field, or `ps`, in the test harness only.
10. **Connect the stdio transport** (`StdioServerTransport`), last. All stderr-only logging (ADR-0007 decision 6: "Logs go to stderr") happens through `console.error`, never `console.log` (stdout is the MCP channel).
11. Return a `Promise` that only resolves after `onShutdown` has run and the process is about to exit (i.e., this function's promise is the server's whole lifetime; callers `await startServer(...)` at the top level and let the process exit naturally).

#### Error cases

| Case | Behavior | Text |
|---|---|---|
| Node too old | `degraded = true`, only `ctx_doctor` served; `ctx_doctor` handler returns | `NODE_TOO_OLD`: `Context Mode needs Node 24.15.0 or newer; you have <v>. Fix: nvm install 24, or install it from https://nodejs.org.` |
| `node:sqlite` import fails | `degraded = true`, only `ctx_doctor` served | `NO_SQLITE`: `node:sqlite failed to load. Fix: run ctx_doctor.` |
| Agent id unresolved at startup | Server still starts; first tool call that needs a project fails | `NO_PROJECT`: `Project source <kind> is missing. Fix: run ctx_doctor.` |
| Handler throws a non-`CtxError` | Caught in dispatch wrapper, logged to stderr only | `"Internal error. Fix: run ctx_doctor."` |

#### Constants used

`NODE_MIN`, `TOOLS_TTL_MS`, `KILL_GRACE_MS`, `EXIT_SIGTERM_MS`, `EXIT_SIGKILL_MS` (the last two via `exit.ts`).

#### E2E coverage

- GP1: install + handshake across 10 adapters; `initialize` and `tools/list` byte/shape checks; project read after `initialize`; stale plugin-cache self-heal.
- GP2: prompt surface byte-identity across 3 OS, both protocol paths.
- GP9: lifecycle (stdin EOF, parent kill, 3 OS; TTY gate; no boot spawn; no `chdir`).
- GP4: cancel teardown bound (`KILL_GRACE_MS`), handled jointly with `tools-exec`; this module only forwards the abort signal.
- `GP1`'s sub-case named directly in ADR-0007's Tests section: "a 2026-07-28 client with no `clientInfo` at all still resolves the correct agent id for `ctx_doctor`/`ctx_upgrade`" — proven by step 1 never reading `clientInfo`.
- GP-LIVE-ROUTING: confirms `alwaysLoad` on `ctx_execute` (ADR-0006 re-probe table) with no code path in this module beyond step 4b.

ADR-0017 `covers`: `src/entries/server.ts`, `src/prompt/`.

---

## Assumptions

- A1: v1's ppid/grandparent-ppid polling (`src/lifecycle.ts`, `makeDefaultIsParentAlive`, issue #103/#311) is **not** carried into v2's `exit.ts`. `00-architecture.md` and GP9 both specify stdin-EOF plus a fixed SIGTERM/SIGKILL escalation as the lifecycle path on all OSes (DECISIONS-r9 F6 settles Windows the same way, no Job Object); PRD P5 forbids `ps`/boot probes. Reason: the architecture doc and GP9 row are unambiguous about the mechanism, and the v1 ppid-polling code is the exact `ps`-based probe P5 bans.
- A2: GP9/DECISIONS-r4 I1-17 asked for a Windows Job Object for parent-death, but named no API. Node 24.15.0 core ships no API to assign a process to a Windows Job Object without a native addon (checked against `node:child_process`, `node:process`, `node:os`), and the release ships no `node_modules` to carry one. DECISIONS-r9 F6 settles this: on Windows, use the same stdin-EOF plus SIGTERM/SIGKILL escalation as Unix (step 9b), then `taskkill /T` of the server's own children; do not create a Job Object. This is the final mechanism, not a point open for later confirmation.
- A3: the per-call `agentId` resolution in step 7a re-runs step 1's argv/env read on every tool call rather than caching it once at startup. ADR-0007 decision 4 requires statelessness and forbids caching identity at connection scope; re-reading cheap, already-parsed `argv`/`env` values is not the kind of per-connection state the ADR forbids (it forbids caching across requests, not re-deriving from already-available process state), and keeps one code path for "resolve agent id" instead of two (startup-time and per-call).

## Files written

`/Users/mksglu/.claude/claude-worktree-workspaces/oss-new/docs/architecture/modules/11-server.md`
- A4 (intern M0 Q4): `serverId = crypto.randomUUID()`, made once at start. The fallback session id is `"mcp:" + serverId`; the owner file is `owners/<serverId>.pid` with `process.pid` inside. M1 wiring: DEVIATIONS D-M1-10.
- A5 (intern M2 Q1-Q10): the names the M2 intern had to look up are fixed as built. `TOOL_ORDER` lives only in `constants.ts`; `registry.ts` builds `TOOLS` in that order and marks `readOnly` from one closed set (`ctx_search`, `ctx_resume`, `ctx_stats`). `alwaysLoad` is a registry flag on `ctx_execute` only; `server.ts` turns it into `_meta["anthropic/alwaysLoad"]` at registration. Fallback session id is exactly `"mcp:" + serverId`; `serverId` is made before the degraded check. Degraded mode serves the one tool whose name equals `"ctx_doctor"`. An unbuilt tool replies `"<name> is not built yet; milestone <Mn> builds it. Fix: use your normal tools until then."`. Exit timers are `EXIT_SIGTERM_MS` / `EXIT_SIGKILL_MS` in `constants.ts`. Schemas use zod v4 (the SDK cannot convert v3). Own-tool journal rows write `key: null` until M4 sets keys (D-M1-T10-1).
- A6 (intern M3 Q10): `tests/server/{registry,server}.test.mjs` import `src/prompt/_generated.ts`; run `node build/build.mjs --generated-only` before `node --test tests/` (the gate `v2-unit` layer does this, D-M2-arch-6). A bare `node --test` without it fails those two files; that is the fixed order, not a flake.

## Changes

- r9 (`DECISIONS-r9.md` R5, F4, V20, F6): step 4c adds `execReadOnlyHint` (Codex `ctx_execute` only); step 1a cites Codex's `projectSource: "arg:--agent+cwd"`; step 5a/9c cite F4 (session-id fallback never leaks across clients) and V20 (idle-server CPU test); Windows parent-death (step 9b, exit.ts §7, Assumptions A1/A2) now cites F6's final no-Job-Object mechanism instead of describing a Job Object as pending.
