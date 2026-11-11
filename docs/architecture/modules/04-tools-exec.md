# 04 — Module `tools-exec`

Follows `docs/architecture/modules/00-architecture.md` (file tree §1, module table §2, types/constants §3, interfaces §4). This file is the line-by-line spec for `ctx_execute`, `ctx_batch`, and the subagent case-B wrapper (`run.mjs`). No TBDs: every open point is resolved below and listed under Assumptions if the source left it open.

Imports allowed (00 §2): `contracts`, `store`, `sandbox`, `tools-index`. Exports: `ctxExecute`, `ctxBatch`, `runWrapperMain`.

## 1. `src/core/contracts/errors.ts` entries this module uses

All from 00 §3.3, verbatim, no new text:

| Key | Text |
|---|---|
| `UNKNOWN_FIELD` | `Unknown field "<f>". Fix: use "queries".` |
| `TIMEOUT` | `Timed out after <ms> ms. Fix: pass background: true.` |
| `NO_RUNTIME` | `No <lang> runtime on PATH. Fix: install it or pick another language.` |
| `FETCH_FAILED` | `Fetch failed: <code>. Fix: check the URL or proxy.` |
| `OUTSIDE_ROOT` | `Path <p> is outside the project. Fix: use a path inside <root>.` |

## 2. `src/core/tools/execute.ts` — `ctx_execute`

### 2.1 Schema (zod)

```ts
import { z } from "zod";
export const ExecuteInput = z.object({
  language: z.enum(["shell", "powershell", "javascript", "typescript", "python"]).or(z.string()), // any PATH runtime (TECH-SPEC §8)
  code: z.string().min(1),
  file: z.string().optional(),
  intent: z.string().optional(),
  timeoutMs: z.number().int().positive().max(EXEC_TIMEOUT_MS).optional(),
  background: z.boolean().optional(),
  summary: z.boolean().optional(),
}).strict(); // .strict() rejects an unknown field → ZodError, caught and mapped to UNKNOWN_FIELD
export type ExecuteInput = z.infer<typeof ExecuteInput>;
```

- `language` is `z.string()` broadened to any PATH runtime, per TECH-SPEC §8 ("plus any runtime found on PATH"); the five named values are the only ones with a built-in `runtimes.ts` lookup table entry (ADR text gives no exhaustive list — Assumption A9).
- `timeoutMs` max is `EXEC_TIMEOUT_MS` (`constants.ts`, 600000): a caller cannot ask for longer than the ceiling (Q8). Omitted → default `EXEC_TIMEOUT_MS` (Q8: default = max = 600000, not v1's no-default #406 behavior — v2 intentionally reverses that commit per the owner's Q8 ruling).

### 2.2 Description (from `drafts.md` id `ctx_execute`, verbatim, used as-is in `registry.ts`; do not alter wording)

> Runs code in a sandboxed subprocess in the project directory and returns only what the code prints. Languages: shell, powershell, javascript, typescript, python, and other runtimes found on PATH. Use it when output may be long, for example tests, builds, logs, git history or API responses, and print just the lines or numbers you need. For a large file, set `file` to its local path instead of reading it: the code gets the path in the CTX_FILE environment variable, and only what the code prints comes back. Set `intent` to a short phrase when output may be large: the matching sections come back and the full output is indexed for ctx_search. Stops after `timeoutMs` (default 120000) and kills the whole process tree.

This is one of the two paths named in the Read deny reason (ADR-0008 "Read: hint to deny", `08-enforcement.md` step 6): a denied Read of a file over `OUTPUT_CAP` points here, with `file` set and the real content never entering the conversation; stdout stays capped at `OUTPUT_CAP` same as any other call. Test spec T-CAP (DECISIONS-r9 V12, milestone M2): 10 cases where the answer sits past the 16,384 B cap; scorer is the answer key plus "a paging or filter call is present" in the transcript, gate correct ≥ 9/10.

This text is frozen (ADR-0005, PR1–PR12 lint); do not fix the "default 120000" mismatch with the 600000 constant in this file — that correction belongs to the prompt-drafts owner, not to this module (Assumption A10). `registry.ts` sets `readOnly: false` (TECH-SPEC §8).

### 2.3 `ctxExecute(input, ctx): Promise<ToolReply>`

**Inputs:** `input: ExecuteInput`, `ctx: ToolContext` (00 §3.1).
**Output:** `ToolReply { text, isError, sandboxBytes }`.

**Steps:**
1. Parse `input` with `ExecuteInput.safeParse`. On failure: `isError: true`, `text = errorText("UNKNOWN_FIELD", { f: firstUnknownKey })` if the Zod issue is `unrecognized_keys`; any other parse failure returns the first Zod issue message as-is (no mapped key — this path is schema-shape, not a named error case).
2. Resolve the working directory: `ctx.project.worktree`.
3. If `input.file` is set: call `isInside(ctx.project.containmentRoot, resolve(ctx.project.worktree, input.file))`. False → return `isError: true`, `text = errorText("OUTSIDE_ROOT", { p: input.file, root: ctx.project.containmentRoot })`.
4. Resolve the runtime binary: `findRuntime(input.language)`. `null` → return `isError: true`, `text = errorText("NO_RUNTIME", { lang: input.language })`.
5. Build argv for the resolved runtime (00 §4 `runProcess`), per language:
   - `shell`: on POSIX, `[sh, "-c", input.code]`; on Windows, `[sh.exe equivalent found by findRuntime, "-c", input.code]` — no `cmd.exe`/git-Bash choice (TECH-SPEC §8).
   - `powershell`: `[pwsh_or_powershell_path, "-NoProfile", "-NonInteractive", "-Command", preludeAndCode]`, where `preludeAndCode` prepends a UTF-8 BOM and a console-encoding prelude line (`[Console]::OutputEncoding = [System.Text.Encoding]::UTF8`) ahead of `input.code` (TECH-SPEC §8, S-TIMEOUT process-tree note).
   - `javascript`/`typescript`: write `input.code` to a temp file under the OS temp dir (not the project dir) with extension `.mjs`/`.ts`, argv `[node_path, tmpFile]`.
   - `python`: write `input.code` to a temp `.py` file, argv `[python_path, tmpFile]`.
   - any other PATH runtime: argv `[runtimePath, "-c", input.code]` if the runtime is known to accept `-c` (shell-family), else `[runtimePath, tmpFileWithCode]` (Assumption A9, same fallback the lazy lookup table uses per language family).
   - Always `shell: false` (TECH-SPEC §8); never route through a parent shell.
6. Build env via `buildChildEnv(process.env, { CTX_FILE: input.file ? resolve(ctx.project.worktree, input.file) : undefined })` (strips `NODE_OPTIONS` and preload vars per `sandbox/env.ts`).
7. Compute the effective timeout: `input.timeoutMs ?? EXEC_TIMEOUT_MS`.
8. Call `runProcess(argv, { cwd: ctx.project.worktree, env, signal: ctx.signal, timeoutMs: effectiveTimeout, stdin: undefined })`.
9. On `background: true`: step 8 runs detached — return immediately after spawn with `text = `started in background, pid ${pid}`` (literal template, `${pid}` = the child's numeric PID as a decimal string, no other text, no trailing punctuation, lowercase per ADR-0005), `isError: false`, `sandboxBytes: 0` (no cap/intent/index path applies; the process is not awaited). This is the frozen reply text (DECISIONS-r9 S5 close-out, item "background reply text"): PRD/TECH-SPEC name `background: true` as "stays" (Q9) but left the exact shape open; this template is now the decision, not a placeholder.
10. Await the awaited (non-background) call. If `killed === "timeout"`: return `isError: true`, `text = errorText("TIMEOUT", { ms: effectiveTimeout })`.
11. If `killed === "cancel"` (ctx.signal aborted): return `isError: true`, `text = "Cancelled."` within `KILL_GRACE_MS` of the abort (GP4 cancel case; no named error-table key — cancel is not a caller mistake).
12. Combine `stdout` + `stderr` into one text (stderr appended only if `exitCode !== 0`, so a clean Grep-exit-1 case with stdout-only output is not polluted — Grep exit 1 is explicitly not an error, TECH-SPEC §8/GP4).
13. Compute `fullBytes = Buffer.byteLength(combined)`.
14. If `fullBytes <= OUTPUT_CAP` and `!input.intent`: `text = summaryLine(exitCode, fullBytes) + "\n" + (input.summary ? echoBlock(input.code) + "\n" : "") + combined`; `sandboxBytes = fullBytes`; done (no indexing needed — nothing was cut).
15. Else (`fullBytes > OUTPUT_CAP` or `input.intent` given): call `indexText(db, ctx.project, ctx.sessionId, source, combined, "text")` where `source = "ctx_execute:" + <code's first line, capped at 80 chars>` — this is the one indexing call this path makes (ADR-0016 case-B/C reuse; here it is the direct-call path, not the wrapper). `sourceId` comes back.
16. Call `selectChunks(db, sourceId, input.intent ?? "", OUTPUT_CAP - summaryReserve)` where `summaryReserve` is the byte length of the summary line template filled in with known values (exitCode, counts) — reserved so the final `capBytes` cut in step 17 never needs to re-cut mid-chunk.
17. `text = summaryLine(exitCode, fullBytes) + "\n" + selected.text + (selected.more ? "\n" + selected.more : "")`. Apply `capBytes(text, OUTPUT_CAP)` as the final safety net (code-point safe cut, GP4); `sandboxBytes = fullBytes`.
18. Catch block around steps 5–17 for a fetch-shaped failure (child process reporting a network error pattern is out of scope here — this applies only when the runtime itself cannot be spawned after `findRuntime` already resolved a path, e.g. permission denied): return `isError: true`, `text` = the raw OS error's one-line `message` only, never a stack (`#1135` pattern, TECH-SPEC GP4).

**`summaryLine(exitCode, fullBytes)`:** `` `exit ${exitCode} · ${fullBytes} B` `` — first line of every reply (TECH-SPEC §8 common contract: "First line of every result is a one-line summary"). Code echo is never added unless `input.summary === true`, in which case `echoBlock(code)` = the original `code` fenced as ` ```<language>\n<code>\n``` ` (Q19: "Code echo removed, `summary` added").

**E2E proof:** GP4 (`e2e/cases/GP4-*.e2e.mjs`), rows: exit class, output-cut code-point safety, process-tree kill (`#1182 #1093 #1121 #1176 #903 #925 #1117 #951 #1068 #1286 #1209 #1218 #1135`), plus `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/spikes-r5/S-TIMEOUT.md` live timing. ADR-0017 `covers`: `src/core/tools/execute.ts`.

## 3. `src/core/tools/batch.ts` — `ctx_batch`

### 3.1 Schema

```ts
export const BatchInput = z.object({
  commands: z.array(z.string().min(1)).min(1),
  queries: z.array(z.string().min(1)).min(1),
}).strict();
export type BatchInput = z.infer<typeof BatchInput>;
```

### 3.2 Description (from `drafts.md` id `ctx_batch`, verbatim)

> Runs several shell commands, then answers several search queries over their combined output, in one call. Use it to collect facts from more than one command at once, for example test results plus recent commits, when you need specific answers rather than the full text. Returns the matching sections and a one-line footer.

`readOnly: false` (TECH-SPEC §8 lists only search/resume/stats/doctor-adjacent tools as read-only; `ctx_batch` runs commands, so it is not read-only — Assumption A12, consistent with 00's `readOnlyHint` list which omits it).

### 3.3 `ctxBatch(input, ctx): Promise<ToolReply>`

**Inputs:** `input: BatchInput`, `ctx: ToolContext`.
**Output:** `ToolReply`.

**Steps:**
1. Parse with `BatchInput.safeParse`. Unknown key → `errorText("UNKNOWN_FIELD", { f: key })`, same as §2.3 step 1.
2. Every entry in `commands` runs as `language: "shell"` through the same argv/env/kill machinery as `ctxExecute` steps 5–11, each with `timeoutMs = EXEC_TIMEOUT_MS` (no per-command override field exists on this schema — batch commands cannot ask for a longer timeout than the one shared ceiling; TECH-SPEC §8 gives `ctx_batch` only `{commands[], queries[]}`, no `timeoutMs`). Commands run **sequentially**, in array order (no concurrency primitive is named in any source; running them one at a time keeps the "handler, batch included" timeout bound in Q8 simple and auditable — Assumption A13). The whole batch handler is bounded by `EXEC_TIMEOUT_MS` total, enforced by one shared `AbortSignal`/timer wrapping the loop (Q8: "bounds the whole handler, batch included").
3. If a command fails to spawn (`NO_RUNTIME`-shaped: shell itself missing — effectively unreachable since shell is always resolvable, but checked for parity) or times out mid-batch: stop the loop, keep the output collected so far, and continue to indexing (a partial batch still indexes what ran; TECH-SPEC gives no "abort and discard" rule, and "no truncation" favors keeping partial data — Assumption A14).
4. Concatenate each command's combined stdout+stderr (same stderr-only-on-nonzero-exit rule as §2.3 step 12) into one text, each block headed by a one-line `$ <command>` marker line so chunk boundaries in step 6 stay command-aligned.
5. Call `indexText(db, ctx.project, ctx.sessionId, "ctx_batch:" + ctx.turn + ":" + n, combinedText, "text")` → `sourceId`; `n` is the next free serial for that turn, so each call has its own label (D-BATCH-OWN-SOURCE-1; older `ctx_batch:<turn>` labels stay readable by `source`).
6. For each entry in `input.queries` (in order): call `ftsQuery(db, query, "session", ctx.project, ctx.sessionId, limit, 0)` scoped to this batch's `sourceId` only (not the whole session index — a batch's queries answer this call's own commands, per "Queries search the whole session scope" in TECH-SPEC §8 read together with "one call": the session scope is searched, but results are filtered to rows whose `source` matches this call's `sourceId` first, falling back to the wider session scope only if that filtered set is empty — Assumption A15, reconciling TECH-SPEC §8's "whole session scope" wording with the natural reading that a batch call primarily answers from its own commands).
7. Dedupe: if the same chunk id is the top hit for two different queries, it is included once in the reply body, listed under the first query it matched (TECH-SPEC §8: "an identical chunk returned twice inside one batch call is deduped").
8. Build `text = summaryLine + "\n"` then, per query, a `## <query>` heading followed by its matching chunk(s) up to a per-query share of `OUTPUT_CAP` (equal division: `OUTPUT_CAP / queries.length`, rounded down, same budgeted-greedy selection as `selectChunks` — Assumption A16, no other split rule is given), then a one-line footer: `` `more: ctx_search({ queries: [...], source: "<sourceId>" })` `` naming the follow-up tool call (TECH-SPEC §8: "Returns the matching sections and a one-line footer").
9. `summaryLine` = `` `${commands.length} command(s), ${queries.length} querie(s), exit ${lastExitCode}` ``.
10. Apply `capBytes(text, OUTPUT_CAP)` as the final cut. `sandboxBytes` = sum of every command's `fullBytes`.
11. Any per-command `TIMEOUT`/error text is inlined into that command's block in place of its output, not surfaced as the whole call's `isError` — only a schema-validation failure (step 1) sets the call-level `isError: true`.

**E2E proof:** GP4 batch rows share the GP4 case file (`e2e/cases/GP4-*.e2e.mjs`); no separate GPn id exists for `ctx_batch` in TECH-SPEC §6.2 — it is covered under GP4's `ctx_execute` row set since the schema and kill/cap mechanics are shared (Assumption A17). ADR-0017 `covers`: `src/core/tools/batch.ts`.

## 4. `src/core/tools/run-wrapper.ts` — subagent case-B wrapper body, bundled as `run.mjs`

Implements ADR-0016 case B: a subagent with Bash but no ctx tools gets a deny whose reason carries `node <bundle>/run.mjs <base64>`. This file is that wrapper's logic; `build/build.mjs` bundles it to the release-root `run.mjs` (00 §1 Assumption A4).

### 4.1 Export

```ts
export function runWrapperMain(argv: string[], env: NodeJS.ProcessEnv): Promise<never>; // calls process.exit
```

### 4.2 Steps

1. Read `argv[2]` as the base64 payload. Missing → print `"Usage: run.mjs <base64>"` to stderr, `process.exit(1)`.
2. Decode: `Buffer.from(argv[2], "base64").toString("utf8")` → the original command string.
3. Re-run the full deny pipeline against the decoded command: `parseShell(decoded)` then `decide()` with the same `userDeny` rules the hook read at call time, passed through a second base64 field in `argv[3]` (the deny rules snapshot, itself base64 JSON) — the wrapper never re-reads host config; it only re-checks what the hook already loaded, so no new file I/O or fallback path is introduced (ADR-0016: "the wrapper decodes that payload and re-runs the full deny pipeline... against the decoded command; a command the user has blocked stays denied").
4. If `decide()` returns `{ kind: "deny" }`: print the deny reason to stderr, `process.exit(1)` — never runs the command.
5. Otherwise: resolve `ctx.project` the same way `resolveProject` does for a non-MCP session (00 Assumption A8: session id `"mcp:" + server-id` when no `_meta`; here the wrapper has no MCP `_meta` at all, so it uses `env.CLAUDE_PROJECT_DIR` / cwd the same way `resolveProject`'s `spawn-cwd` source does).
6. Run the decoded command exactly as `ctxExecute` would for `language: "shell"` (§2.3 steps 5–12), same cwd, same exit code, timeout `EXEC_TIMEOUT_MS`.
7. `indexText(db, project, sessionId, "run.mjs:" + decoded.slice(0, 80), combinedOutput, "text")` → `sourceId`.
8. `selectChunks(db, sourceId, originalIntentField ?? "", OUTPUT_CAP - summaryReserve)` — `originalIntentField` is the tool call's `description` field, passed through as `argv[4]` (ADR-0016: "the call's `description` field").
9. Print to stdout: `summaryLine(exitCode, fullBytes) + "\n" + selected.text`, then one line: `` `more: node <bundle>/search.mjs <source-id> "<terms>"` `` where `<bundle>` is `resolvePluginRoot`'s directory and `<terms>` is the `description` field re-quoted (ADR-0016 exact template).
10. `process.exit(exitCode ?? 0)` — the subagent's Bash tool sees the real exit code of the original command (ADR-0016: "same cwd, same exit code").
11. If the decoded command itself times out: print `errorText("TIMEOUT", { ms: EXEC_TIMEOUT_MS })` to stdout as the sole content, `process.exit(124)` (the POSIX timeout convention, picked because no source names a wrapper-specific timeout exit code — Assumption A18).

Indexing in steps 7–8 runs on a worker thread / child process per ADR-0016 ("so one subagent's large-output indexing never inflates the wall time of a second subagent's concurrent hook call") — `run-wrapper.ts` spawns the indexing via `node:worker_threads` rather than inline on the main thread that is also printing stdout (Assumption A19: ADR-0016 names the requirement, not the exact API; `worker_threads` is the only built-in matching "worker thread (or child process)" without adding a dependency).

**E2E proof:** ADR-0016's Golden cases (GP3) first two rows — "Subagent type with `tools: Bash` + `curl -s https://x.io/big.json` → rewritten to `run.mjs`, output ≤ budget, `more:` line present" and the deny-pipeline re-check row ("a user `permissions.deny` rule for `rm -rf /` ... wrapped into `run.mjs` → still blocked, never reaches exec"); live proof LV9. ADR-0017 `covers`: `src/core/tools/run-wrapper.ts`.

## 5. Constants this module reads (from `src/core/contracts/constants.ts`, 00 §3.2)

`OUTPUT_CAP`, `EXEC_TIMEOUT_MS`, `KILL_GRACE_MS`. No other constant in this table is read by `tools-exec`.

## Assumptions

- A9: `language` accepts any PATH runtime string beyond the five named ones; the five get a dedicated lookup entry, others fall back to a `-c`-or-tempfile heuristic. No source gives an exhaustive runtime list.
- A10: the shipped `ctx_execute` description text keeps its stale "default 120000" wording (frozen prompt text, ADR-0005 lint); the real default is `EXEC_TIMEOUT_MS` = 600000 per Q8. Not fixed here; out of this module's scope.
- A11 (closed, DECISIONS-r9 S5): `background: true` reply text is frozen: `` `started in background, pid ${pid}` `` — no other field, no punctuation after the PID. No source gave an exact string before this decision; this is now the decided text, not an open choice.
- A12: `ctx_batch` is not `readOnlyHint` (it runs commands); 00's `readOnlyHint` list omits it, used as confirmation.
- A13: batch commands run sequentially, in array order, under one shared timeout for Q8's "bounds the whole handler, batch included."
- A14: a batch stops on the first failing/timing-out command but still indexes the partial output collected so far.
- A15: `ctx_batch` query scope is "this call's commands first, session-wide only if empty," reconciling TECH-SPEC §8's "whole session scope" with a batch call naturally answering its own commands.
- A16: per-query reply budget inside `ctx_batch` is `OUTPUT_CAP / queries.length`, floor-divided; no other split rule is given.
- A17: `ctx_batch` has no separate GPn id; it shares GP4's case file since TECH-SPEC §6.2 lists no GP row naming `ctx_batch` alone.
- A18: the wrapper's own timeout exit code is 124 (POSIX `timeout` convention); no source names one.
- A19: step-7/8 indexing runs via `node:worker_threads`, the only built-in matching ADR-0016's "worker thread (or child process)" note without a new dependency.
- A20: error key placement and priority. `00-architecture.md` §3.3 is the one canonical table for keys shared across modules; it already holds `ONE_OF_INPUT`, `INVALID_ARGS`, `SPAWN_FAILED` (DECISIONS-r9 M23). A key used by only one module (`PLUGIN_ROOT_MISSING`, `CONFIG_PARSE_FAILED`, both `tools-ops`-only) stays defined in that module's own file (`07-tools-ops.md` §2/§4, A-T2) and is not duplicated into 00 §3.3. Priority order when a handler could match more than one key: (1) schema/shape errors first (`UNKNOWN_FIELD`, `ONE_OF_INPUT`, `INVALID_ARGS` — zod or an explicit field check, before any I/O); (2) resource-resolution errors (`OUTSIDE_ROOT`, `PLUGIN_ROOT_MISSING`, `CONFIG_PARSE_FAILED`); (3) execution errors (`SPAWN_FAILED`, `NO_RUNTIME`, `TIMEOUT`). This module (`tools-exec`) only ever reaches keys already listed in §1 above; it does not add a new key.
- A21 (intern M3 Q1, Q4-Q8): `run.mjs` runs only a routing deny; a user deny rule, `POLICY_UNREADABLE_LINE` and `PARSE_ERROR_DENY_LINE` still refuse (D-M3-X1-1). `run.mjs` and `search.mjs` are two output names of one entry `src/entries/run.ts`; `search.mjs <source-id> "<terms>"` (D-M3-X1-2). Agent is always `RUN_WRAPPER_AGENT` (`claude-code`); project dir is the wrapper cwd (D-M3-X1-3). `PLAIN_OUTPUT_ENV` lives only in `constants.ts` (D-M3-X1-4). No `worker_threads` indexer: `run.mjs` is already its own process (D-M3-X1-5, replaces A19). The `more:` line prints only when `selectChunks` left chunks out (D-M3-X1-6).

## Changes

- r8 (`DECISIONS-r8.md` VR): §2.2 description text now matches `drafts.md`'s `ctx_execute` wording (large file via `file`/`CTX_FILE`, not read first); added the note that a denied Read points here.
- r9 (`DECISIONS-r9.md` V12): §2.3 cites test spec T-CAP (M2, 16,384 B cap, correct ≥ 9/10) for the Read-deny-to-`ctx_execute` path.
- DECISIONS-r9 (S4 intern question): added A20, naming the canonical-vs-module-local split for error keys (`ONE_OF_INPUT`/`INVALID_ARGS`/`SPAWN_FAILED` in 00 §3.3; `PLUGIN_ROOT_MISSING`/`CONFIG_PARSE_FAILED` in `07-tools-ops.md`) and the match priority order.
- r9 (S5 close-out): §2.3 step 9 and A11 freeze the background reply text to `` `started in background, pid ${pid}` ``; closes the open intern question on exact format.
