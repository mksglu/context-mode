# 03 — Module spec: sandbox

Owner: `sandbox`. Depends on: `contracts`, `store` (`isInside` only — 00 §2 table). Follows `docs/architecture/modules/00-architecture.md` file tree, types, constants, and the `// sandbox` block in its cross-module interfaces (00 §4).

Files, in build order (each file only imports files above it in this list, plus `contracts` and `store.isInside`):

1. `src/core/sandbox/env.ts`
2. `src/core/sandbox/runtimes.ts`
3. `src/core/sandbox/cap.ts`
4. `src/core/sandbox/kill.ts`
5. `src/core/sandbox/spawn.ts`
6. `src/core/sandbox/fetch.ts`

Rule for every file: no literal numbers — use the named constant. No regex for parsing (00 rule list, TECH-SPEC §11). `shell: false` always (PRD §8, GP4, TECH-SPEC GP4 row).

---

## 1. `src/core/sandbox/env.ts`

### Export

```ts
export function buildChildEnv(parent: NodeJS.ProcessEnv, extra?: Record<string, string>): Record<string, string>;
```

### Inputs

- `parent`: the server process's own `process.env`.
- `extra`: optional per-call overrides (e.g. a `PATH` prefix for `runtimes.ts`).

### Output

A plain string-keyed object. No `undefined` values (a child env must be all strings).

### Steps

1. Copy every key of `parent` whose value is not `undefined` into a new object `env`.
2. Delete `env.NODE_OPTIONS` (00 file-tree row: "strips `NODE_OPTIONS`, preload"; PRD §9: "env is never written into command text; `NODE_OPTIONS` and preload files never leak past the direct child").
3. Delete `env.NODE_REPL_EXTERNAL_MODULE`, `env.NODE_V8_COVERAGE`, and any key whose name starts with `NODE_` and ends with `_OPTIONS` (covers future Node preload-style vars without a second pass).
4. Delete `env.BUN_OPTIONS`, `env.DENO_OPTIONS` (same leak class, other PATH-found runtimes per GP4's "plus any runtime found on PATH").
5. If `extra` is given, assign its keys over `env` last (override wins).
6. Return `env`.

### Error cases

None. Pure function, no I/O, cannot throw.

### Constants used

None.

### E2E case

TECH-SPEC GP4 row, clause "NODE_OPTIONS does not leak". ADR-0017 `covers`: `src/core/sandbox/`.

---

## 2. `src/core/sandbox/runtimes.ts`

### Export

```ts
export function findRuntime(lang: string): string | null;
```

### Inputs

`lang`: one of `"shell" | "powershell" | "javascript" | "typescript" | "python"`, or any other string (PRD §9: "plus any runtime found on PATH").

### Output

Absolute path to the interpreter binary, or `null` if none is found on PATH.

### Steps

1. Map `lang` to a list of candidate binary names, in order:
   - `"shell"` → on Windows: `["sh.exe", "bash.exe"]` (Git Bash is reached only by PATH lookup of these names — see §2a; never a hardcoded Git-install path). On POSIX: `["sh"]`.
   - `"powershell"` → `["pwsh", "pwsh.exe", "powershell.exe"]` (try `pwsh`/`pwsh.exe` first — PowerShell 7+, cross-platform — then Windows PowerShell).
   - `"javascript"` / `"typescript"` → `["node", "node.exe"]`.
   - `"python"` → on Windows: `["python.exe", "py.exe"]`. On POSIX: `["python3", "python"]`.
   - any other `lang` → `[lang, lang + ".exe"]` on Windows, `[lang]` on POSIX.
2. Read `PATH` from `process.env.PATH` (the parent's PATH — PRD §9: "PATH = the parent's PATH"). Split on `path.delimiter` (`:` POSIX, `;` Windows).
3. On Windows, also split `process.env.PATHEXT` (fallback `.COM;.EXE;.BAT;.CMD`) for the case where a candidate name in step 1 has no extension; try each `candidate + ext` in `PATHEXT` order inside each PATH directory before moving to the next PATH directory.
4. For each PATH directory, for each candidate name (in the step-1 order), build the full path and check existence with a sync stat call. Do this **lazily**: only when `findRuntime` is actually called for that `lang` — never at server boot (PRD §9: "found by PATH lookup … lazily on first use, never at boot"; 00 rule list P5: "no boot probes").
5. On POSIX, a file found in step 4 must also pass an executable-bit check (`fs.accessSync(p, fs.constants.X_OK)`) before being accepted; a `#!/bin/sh`-shim script with the exec bit set is accepted as-is (PRD §9: "including `#!/bin/sh` shims") — do not read or parse the shebang line, the OS exec call handles it.
6. Return the first candidate that passes; if no PATH directory yields a match for any candidate, return `null`.
7. No caching across calls: PATH can change between calls (e.g. a test sets a different `PATH` per case); re-walk PATH every call. (This trades a few µs of stat calls for correctness; cold start is still < `COLD_START_MS` because this only runs on first actual exec, never at boot — step 4.)

### 2a. Windows Git Bash resolution

- `"shell"` on Windows never special-cases a Git install directory (e.g. never reads `C:\Program Files\Git\bin`). It is reached exactly like any other candidate: PATH lookup of `sh.exe` then `bash.exe`. If the user has Git Bash's `bin` directory on `PATH`, `sh.exe` is found there; if not, `findRuntime("shell")` returns `null` and the caller raises `NO_RUNTIME` (errors.ts, §3 below wires this).
- This matches PRD §9 / GP4: "PATH = the parent's PATH; runtimes are found by PATH lookup … lazily on first use, never at boot" — no OS-specific install-path probing, no registry read, no `where.exe` shell-out (that would be a spawn, forbidden by rule P4 outside the one approved `runProcess` path).

### Error cases

None inside `findRuntime` — absence is a valid `null` return, not a thrown error. The caller (`src/core/tools/execute.ts`, outside this module) turns a `null` into the `NO_RUNTIME` error text.

### Constants used

None.

### E2E case

TECH-SPEC GP4 row, clause "PATH shims"; PRD §9 "lazily on first use, never at boot" and "cold start replies in < 1 s with no PATH probes" (also proves `COLD_START_MS`, owned by `tools-exec`, not re-tested here). ADR-0017 `covers`: `src/core/sandbox/`.

---

## 3. `src/core/sandbox/cap.ts`

### Export

```ts
export function capBytes(s: string, cap: number): { text: string; cut: boolean; fullBytes: number };
```

### Inputs

- `s`: the full string to cut (process stdout/stderr joined, UTF-8).
- `cap`: byte budget; callers pass the named constant `OUTPUT_CAP` (`16384`, 00 §3.2, source Q2/ADR-0008/ADR-0016).

### Output

- `text`: `s` unchanged if its UTF-8 byte length is ≤ `cap`; otherwise the longest **prefix** of `s` whose UTF-8 byte length is ≤ `cap`, cut only at a code-point boundary (never inside a multi-byte UTF-8 sequence, never inside a UTF-16 surrogate pair).
- `cut`: `true` if `text !== s`.
- `fullBytes`: UTF-8 byte length of the original `s` (lets the caller report "N of M bytes shown").

### Steps

1. Encode `s` to a `Buffer` with `Buffer.from(s, "utf8")`. Let `fullBytes = buf.length`.
2. If `fullBytes <= cap`, return `{ text: s, cut: false, fullBytes }`.
3. Take `buf.subarray(0, cap)` as a candidate slice.
4. Walk backward from byte index `cap` while the byte at that index is a UTF-8 continuation byte (top two bits `10`), decrementing the end index. This finds the start of the code point that straddles the cut, so it can be dropped whole rather than emitting a truncated/invalid byte sequence.
5. Decode `buf.subarray(0, endIndex)` with `toString("utf8")` — Node's UTF-8 decoder replaces any still-invalid tail with U+FFFD, but step 4 already removed the straddling bytes, so this is a safety net, not the primary mechanism.
6. Return `{ text: <decoded>, cut: true, fullBytes }`.

### Error cases

None. Pure function.

### Constants used

`OUTPUT_CAP` (`16384`) — passed in by the caller, not read inside `cap.ts` (keeps `cap.ts` reusable for other caps, e.g. `REPORT_CAP`).

### E2E case

TECH-SPEC GP4 row, clause "output cut is code-point safe". ADR-0017 `covers`: `src/core/sandbox/`.

---

## 4. `src/core/sandbox/kill.ts`

### Export

```ts
export function killTree(pid: number): void;
```

### Inputs

`pid`: the PID of the process **group leader** (the direct child `spawn()` created — see §5 step 2, which always launches the child detached/as its own group leader so this function's Unix branch is always valid).

### Output

None (`void`). Best-effort; never throws past this function (a kill racing a process that already exited is expected, not an error).

### Steps

1. If `process.platform !== "win32"`:
   a. Send `SIGTERM` to the **negative** PID: `process.kill(-pid, "SIGTERM")` — negative PID is the POSIX convention for "every process in group `pid`" (PRD §9, TECH-SPEC §422 S-TIMEOUT row: "process group, `kill(-pid)`"). Wrap in `try/catch`; swallow `ESRCH` (group already gone).
   b. Start a timer for `KILL_GRACE_MS` (`1000`, 00 §3.2, source "GP4"). On fire, send `SIGKILL` the same way: `process.kill(-pid, "SIGKILL")`, same `try/catch`/`ESRCH` swallow.
   c. Do not `await` the grace timer inside `killTree` itself — `killTree` returns immediately after scheduling it; the caller (`spawn.ts`) owns waiting for the child's `"exit"` event and clears the pending `SIGKILL` timer if `"exit"` fires first.
2. If `process.platform === "win32"`:
   a. Run `taskkill /F /T /PID <pid>` (00 file-tree row, PRD §9, 00 Assumption A6: "over Job Object … because PRD/GP4 forbid a switch without its own ADR"). This is a **spawn**, but it is the one exemption inside the sandbox module itself — it is the kill mechanism, not sandboxed user code; use `child_process.execFileSync("taskkill", ["/F", "/T", "/PID", String(pid)], { stdio: "ignore" })` so no shell is invoked (still `shell:false` discipline).
   b. Wrap in `try/catch`; a non-zero exit (process already gone) is swallowed, not re-thrown.

### Error cases

None surfaced to the caller. All platform-kill failures are swallowed inside this function per step 1a/1b/2b.

### Constants used

`KILL_GRACE_MS` (`1000`).

### E2E case

TECH-SPEC GP4 row, clause "process tree killed (Windows: `taskkill /F /T /PID`, matching v1's proven mechanism … no Job Object switch)"; cancel-path clause "cancel on a long-running call tears down the child process tree within 1 s". T-F5 (GP4, Windows only): spawn a child that spawns a grandchild with no `cmd.exe` in between, call `killTree` on the top PID, assert the grandchild process is gone within `KILL_GRACE_MS`; if it fails, file a new ADR to pick a Job Object path — until then this file does not change (DECISIONS-r9 F5). ADR-0017 `covers`: `src/core/sandbox/`. Assumption A6 in 00-architecture is the ADR-level resolution of the Job-Object-vs-taskkill question — this file must never be changed to Job Object without a new ADR superseding A6.

---

## 5. `src/core/sandbox/spawn.ts`

### Export

```ts
export function runProcess(
  argv: string[],
  o: { cwd: string; env: Record<string, string>; signal: AbortSignal; timeoutMs: number; stdin?: string }
): Promise<{ stdout: Buffer; stderr: Buffer; exitCode: number | null; killed: "timeout" | "cancel" | null }>;
```

### Inputs

- `argv`: `[interpreterPath, ...args]`. `argv[0]` is always a path returned by `findRuntime` (or a caller-resolved equivalent for `file` mode) — never a shell string. This function never parses or tokenizes `argv`; the caller already split it.
- `o.cwd`: working directory for the child (the project worktree, or a caller-chosen temp dir for a one-off script file).
- `o.env`: output of `buildChildEnv()` — this function does not call `buildChildEnv` itself, so the same built env can be reused across a batch (`ctx_batch`) without rebuilding per call.
- `o.signal`: an `AbortSignal` that fires on cancel (e.g. the client disconnects, or `ctx_batch`'s own handler aborts a sibling call).
- `o.timeoutMs`: caller passes `EXEC_TIMEOUT_MS` (`600000`) unless a shorter override should apply — this module does not clamp or default the value; that policy lives in `tools-exec/execute.ts` (00 §4 cross-module table assigns timeout policy to the tool handler, not to `spawn.ts`, so `spawn.ts` stays a pure mechanism).
- `o.stdin`: optional string written to the child's stdin then closed; omitted ⇒ stdin is closed immediately with no bytes written.

### Output

A promise that resolves (never rejects — see Error cases) to:
- `stdout`, `stderr`: raw `Buffer`s, **uncapped** — `capBytes` runs in the caller after this returns, never inside `spawn.ts` (keeps this module ignorant of `OUTPUT_CAP`, which belongs to the tool-reply shape, not the process mechanism).
- `exitCode`: the child's exit code, or `null` if it was killed by a signal before exiting normally.
- `killed`: `"timeout"` if `o.timeoutMs` elapsed before exit, `"cancel"` if `o.signal` fired first, else `null`.

### Steps

1. Spawn the child with Node's `child_process.spawn(argv[0], argv.slice(1), { cwd: o.cwd, env: o.env, stdio: ["pipe", "pipe", "pipe"], shell: false, detached: process.platform !== "win32" })`.
   - `shell: false` always (00 rule list, PRD §9, GP4: "always spawns the interpreter binary directly … no git Bash / PowerShell / cmd shell choice").
   - `detached: true` on POSIX makes the child its own process-group leader, so `child.pid` is a valid group id for `killTree`'s negative-PID signal (step 1a of §4). On Windows `detached` is left `false` — Windows process groups are not POSIX groups and `killTree`'s Windows branch (`taskkill /T`) already walks the whole descendant tree by PID, not by group.
2. If `o.stdin !== undefined`, write it to `child.stdin` then call `child.stdin.end()`; if `o.stdin === undefined`, call `child.stdin.end()` immediately with no write.
3. Collect `stdout`/`stderr` by pushing each `"data"` chunk into two arrays of `Buffer`; concatenate with `Buffer.concat` once the process ends (step 6). Do not cap or decode here — raw bytes only.
4. Start a timer for `o.timeoutMs`. On fire: set a local flag `killedBy = "timeout"`, call `killTree(child.pid)`.
5. Register an `"abort"` listener on `o.signal`. On fire (and `killedBy` not already set): set `killedBy = "cancel"`, call `killTree(child.pid)`, clear the timeout timer from step 4.
6. Register `"exit"` on `child`. On fire: clear the timeout timer from step 4 (if still pending) and remove the abort listener from step 5 (if still registered) — whichever of timeout/cancel/natural-exit happens first wins and the other paths become no-ops. Resolve the promise with `{ stdout: Buffer.concat(stdoutChunks), stderr: Buffer.concat(stderrChunks), exitCode: <exit code from the event>, killed: killedBy ?? null }`.
7. Register `"error"` on `child` (covers spawn-level failures such as `ENOENT` on `argv[0]`, which should not happen because the caller only ever passes a path `findRuntime` already confirmed exists, but a TOCTOU race — e.g. the binary is deleted between the PATH check and the spawn — must still be handled, not thrown past this function). On fire: resolve with `{ stdout: Buffer.concat(stdoutChunks), stderr: Buffer.concat(stderrChunks), exitCode: null, killed: killedBy ?? null }` — the caller reads `exitCode === null` plus empty-ish output as "process did not run"; it does not get a special error field from this function (00 rule: `ToolReply` carries `isError`/`text`, computed by the tool handler, not by `spawn.ts`).

### Error cases

`runProcess` never rejects. All failure classes (spawn error, timeout, cancel) resolve with a tagged result (step 6/7) so the caller always has one code path (`await runProcess(...)`, then branch on `.killed`/`.exitCode`), matching 00 rule P1 ("one path, no fallback chains"). The caller is responsible for turning `killed: "timeout"` into the `TIMEOUT` error text (`errors.ts`: `` `Timed out after <ms> ms. Fix: pass background: true.` ``) and `exitCode !== 0` for a non-grep tool into whatever that tool's own exit-class rule says (GP4: "grep exit 1 is not an error" is a caller-side rule, not enforced here).

| Error case | Caller-side text |
|---|---|
| Step 7 `"error"` event fires (TOCTOU: `argv[0]` existed at `findRuntime` time, gone by spawn time — e.g. `ENOENT`) | `runProcess` still does not reject; it resolves `exitCode: null`, `killed: killedBy ?? null` per step 7. The caller turns that shape into `errors.ts` key `SPAWN_FAILED`: `` `Could not start <argv0>. Fix: check the runtime is still installed.` ``, `<argv0>` = `argv[0]`. |

### Constants used

None read directly (`o.timeoutMs` and `o.env` are supplied by the caller already resolved from `EXEC_TIMEOUT_MS` / `buildChildEnv`); `KILL_GRACE_MS` is used transitively through `killTree`.

### E2E case

TECH-SPEC GP4 row: "exit class; … env passed via spawn env; … deleted cwd; … cancel on a long-running call tears down the child process tree within 1 s and returns a cancel reply; cold start replies in < 1 s with no PATH probes"; PRD §9/§8 timeout clause ("default and max timeout 600,000 ms … longer work uses `background: true`"). ADR-0017 `covers`: `src/core/sandbox/`.

---

## 6. `src/core/sandbox/fetch.ts`

### Export

```ts
export function safeFetch(url: string, signal: AbortSignal): Promise<{ body: Buffer; contentType: string; finalUrl: string }>;
```

### Inputs

- `url`: the URL to fetch (from `ctx_index`'s URL-source path, outside this module).
- `signal`: caller's `AbortSignal` (same cancel path as `runProcess`).

### Output

`body` (raw bytes), `contentType` (the response's `Content-Type` header, or `""` if absent), `finalUrl` (the URL actually fetched, after following redirects — needed so the caller can label the indexed source with where the content really came from).

### Steps

1. Read proxy env in this priority order (per-scheme): for an `https:` URL, `HTTPS_PROXY` then `https_proxy`; for an `http:` URL, `HTTP_PROXY` then `http_proxy`. Read `NO_PROXY`/`no_proxy` as a comma-separated host list; if `url`'s host matches an entry (exact host or `.`-suffix match), no proxy is used for this call (PRD §9: "proxy env … is honoured").
2. Resolve the **target that will actually be connected to** for this hop: the proxy host:port if step 1 selected one, otherwise `url`'s own host. DNS-resolve that target's hostname to its IP addresses now, in this function, in the same process as the fetch — never as a separate pre-check in a different process or an earlier call (TECH-SPEC GP5 row: "the SSRF check runs on the resolved proxy target, in the same process as the fetch, after proxy env vars are applied, never as a separate parent pre-check", closing v1 #476's gap).
3. Reject (see Error cases) if any resolved address is private/loopback/link-local/unspecified per standard ranges (`127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, `::1`, `fc00::/7`, `fe80::/10`, `0.0.0.0`) — this is decision Q19's SSRF check, run on the resolved target per PRD §9.
4. Issue the HTTP(S) request with Node's `fetch()`, passing `signal`, and if step 1 selected a proxy, dispatch through it (Node's `fetch` needs an explicit proxy-aware dispatcher here — not a bare `fetch(url)` — because Node does not read `HTTP_PROXY` env itself).
5. On a redirect response (3xx with `Location`), repeat steps 1–4 for the new URL **as a new hop** — i.e. re-resolve and re-check SSRF for every hop, not just the first (PRD §9: "SSRF check running on the resolved target … per hop"). Cap redirect-following at 5 hops; exceeding it is a `FETCH_FAILED` error (step below).
6. On the final non-redirect response, read the full body into a `Buffer`, read `Content-Type` (default `""`), and return `{ body, contentType, finalUrl: <URL of the final hop> }`.

### Error cases

| Case | Behavior |
|---|---|
| Step 3 rejects (private address) | Reject the promise with a `CtxError` carrying `errors.ts` key `SSRF`: `` `Blocked private address <host>. Fix: use a public URL.` ``, `<host>` = the rejected hostname. |
| Network error, non-2xx final status, redirect cap exceeded, abort via `signal` | Reject with `CtxError` key `FETCH_FAILED`: `` `Fetch failed: <code>. Fix: check the URL or proxy.` `` (#1135), `<code>` = the HTTP status for a non-2xx response, or the low-level error code (e.g. `ECONNREFUSED`, `ABORT_ERR`) otherwise. No raw Node stack frame is included in the text (TECH-SPEC GP4/GP5: "fetch-error path returns a one-line cause with no raw Node stack frame"). |

### Constants used

None named in 00 §3.2 for this file; the private-range list in step 3 is fixed data, not a tunable constant, so it is written inline as a table in the code, not sourced from `constants.ts`.

### E2E case

TECH-SPEC GP5 row, clauses "proxy env — the SSRF check runs on the resolved proxy target, in the same process as the fetch, after proxy env vars are applied, never as a separate parent pre-check (closes v1 #476's gap)" and "`ctx_fetch_and_index` on an unreachable URL returns only the one-line error cause (no raw Node stack), same rule as GP4's #1135 case". ADR-0017 `covers`: `src/core/sandbox/`.

---

## Assumptions

- **AS1 — Windows kill mechanism is `taskkill /F /T /PID`, `shell: false`.** Parent-death on Windows is stdin EOF, then `taskkill /T` of the server's own children (not a Job Object). Reason: DECISIONS-r9 F6 — Node ships no Job Object API without a native addon, and the release ships no `node_modules` to carry one (PRD-v2.md:182); v1 shipped `taskkill` and fixed its gaps by spawning direct (`8a778ba9`, `2be94b03`, `c02b184d`). `kill.ts` §4 implements `taskkill`.
- **AS2 — `EXEC_TIMEOUT_MS` is a fixed default *and* ceiling of 600,000 ms, not "no default, host RPC timeout governs"**, even though the TECH-SPEC GP4 row's prose still describes the old v1-derived "no server-side default" model. Reason: `docs/architecture/modules/00-architecture.md` §3.2 constants table (`EXEC_TIMEOUT_MS`, "600000 (default and max)") and DECISIONS-r3 Q8 ("one fixed default timeout … 600,000 ms … default = max") are the later, settled decision; `spawn.ts` §5 takes `o.timeoutMs` as given by the caller rather than re-deciding this, so this module is correct under either reading — the assumption only matters for the caller in `tools-exec/execute.ts`, noted here so that module's author does not re-introduce "no default" from the stale GP4 prose.
- **AS3 — `spawn.ts` does not call `buildChildEnv` or `findRuntime` itself.** 00's cross-module interface list shows all four sandbox functions as siblings with no call graph between them; giving `runProcess` a bare `env: Record<string,string>` input (already built) keeps `ctx_batch` able to build one env once and reuse it across several `runProcess` calls, which the PRD's "batch included" timeout-handling language implies without stating the mechanism.
- **AS4 — `killTree`'s Windows `taskkill` call is the one exempted spawn inside the sandbox module.** The 00 rule list bans `spawn` from hooks, not from `sandbox` itself (sandbox's whole job is spawning); `taskkill` is the kill mechanism named by PRD §9/A6, so it must run as a child process. No ADR states this exemption in words, but it is the only reading under which A6's own chosen mechanism is implementable.
- AS5 (intern M0 Q5): `taskkill /F /T /PID` walks the parent-PID chain. A grandchild whose parent already exited is not reached. This is accepted: GP4/GP9 Windows cases assert only the direct tree. No Job Object (AS1).

## Changes

- r9 (`DECISIONS-r9.md` F5, F6): AS1 now states the final Windows mechanism (taskkill `/F /T /PID`, `shell:false`; stdin EOF then `taskkill /T` for parent-death, no Job Object) and drops the "even though S-TIMEOUT proposes a Job Object" text; `kill.ts` §4 E2E case adds T-F5 (grandchild-kill), gated behind a new ADR if it fails.
