# Reply to Viet: rerun on 2.0.0-next.18

Version to test: 2.0.0-next.18 (npm dist-tag next, plugin marketplace release branch). Please use a fresh CODEX_HOME.

## 1. Project resolved to the plugin cache dir

- Cause: Codex starts the plugin MCP server in the plugin dir, sends roots [] and no workspace env. The server used process.cwd(), so the plugin cache became the project. Codex sends the workspace only as `_meta["codex/sandbox-state-meta"].sandboxCwd`, to a server that declares that experimental capability.
- Fix (c988ff43): the server declares the capability and uses sandboxCwd. It never takes the dir its own bundle sits in as the project; it returns NO_PROJECT with a Fix line instead. D3 now reads the native plugin entries (`<CODEX_HOME>/plugins/cache/.../.codex-plugin/{mcp,hooks}.json`) when config.toml enables the plugin.
- Rerun: install through the native plugin route, start codex in your project dir, call ctx_index with a relative path and with an absolute path. Both must index. Run ctx_doctor and check that the project is your dir, not a plugin cache path.

## 2. Get-Content was not denied

- Cause: the shell-dump list had POSIX names only, and the POSIX parser dropped the backslashes of `C:\logs\app.log`.
- Fix (765be33d, D-PWSH-DUMP-1): a PowerShell reader finds one-file reads by Get-Content, gc, cat, type and `[IO.File]::ReadAllText(...)`. Same deny text as cat. -TotalCount, -Head, -First, -Tail, -Last, a pipe to Select-Object, Select-String or Measure-Object, or a redirect keep the call allowed.
- Rerun: `Get-Content application.log` on the 371,243-byte log. Expect the ctx_execute redirect. Then `Get-Content application.log -TotalCount 20`. Expect it to run.

## 3. D5 fixture and old D5 lines

- Cause: the shipped codex fixture had no hook_event_name, so hook.mjs logged "decode failed: codex: unknown hook event undefined". The recorded /tmp/project is not a git repository, so the hook also logged NO_GIT_DIR on each doctor run. D5 then showed those lines as current errors.
- Fix (ea4179fd, D-D5-FIXTURE-1, D-D5-PAST-1): both shipped fixtures (claude-code, codex) are the recorded native PreToolUse payloads, with ids and paths normalised. D5 sends the project worktree as cwd. A hook-errors.log line older than the doctor run shows as "past hook error" with its time. The log stays whole; nothing is cut.
- Rerun: ctx_doctor twice. D5 must add no new line to hook-errors.log. Old lines from next.17 may still show, labelled as past.

## 4. typecheck failed

- Cause: TS2769 at fts.ts:366 and a missing HookInstall type at engine.ts:283 and 297. No CI step ran tsc, so it shipped.
- Fix (04e05b34, D-TSC-GATE-1): types fixed with no any and no ts-ignore, and no behaviour change. tsc --noEmit now runs in ci.yml and in the gate v2-unit layer.
- Rerun: `npm run typecheck` on the repo at tag v2.0.0-next.18. Expect exit 0.

## 5. D5 timing 72 ms and 58 ms

- Cause: D5 timed the whole child process, so node.exe start counted against the hook. Profile on windows-latest: bare node p50 42.7 ms, PreToolUse hook p50 55.2 ms. The hook adds 12.5 ms; 42.7 ms is node start that the host pays with or without the hook.
- Fix (7b68b5b8, D-D5-BARE-1): D5 runs 3 pairs of hook and bare `node -e ""` and compares the fastest hook minus the fastest bare to the 40 ms bound. The bound is unchanged. A hook that costs more than 40 ms over bare node still fails.
- Rerun: ctx_doctor D5 on Windows Claude Desktop. Send the D5 line with its numbers if it still fails.

## Not proven

- Your exact Desktop-bundled 0.166.0-alpha.5.1 build on Windows. Proven on macOS and on windows-latest in CI.
- PostToolUse on windows-latest is p50 86 ms (40 ms over bare node, journal write). D5 does not run it. It is in OPEN-ITEMS.
- CI note: the release run missed the D3 overhead budget once on windows (16 ms vs 15 ms) and passed on rerun. The budget is unchanged.
