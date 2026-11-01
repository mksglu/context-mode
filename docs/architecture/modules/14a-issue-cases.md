# 14a — Issue-row test cases

Generated from `verdict-*.json` in https://github.com/mksglu/context-mode/tree/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/gp-gap (2026-10-17). Every row of `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/v2-issue-map.md` has one verdict in its `v2 test` column: GP 170, LIVE 2, REMOVED 110, N/A 69 (351 rows, 0 empty). This file lists the cases that are new, with their Given/When/Then. Cases already in `14-tests.md` §4 are not repeated.

Each case lives at `e2e/cases/GPn-<slug>.e2e.mjs` (LIVE: `e2e/live/cases/<id>.json`) with a golden file under `e2e/golden/GPn/`. A case is written in the milestone of its GP (TECH-SPEC §12).

| Case | Issues | Given / When / Then |
|---|---|---|
| `GP1/absolute-node-path-cursor-windows` | #1282 | Given Cursor on Windows with no npx on GUI PATH, When MCP and hooks start, Then both launch via absolute node path. |
| `GP1/adapter-bundle-static-imports` | #1201 | Given an adapter bundle copied alone to a temp directory, When it loads, Then there is no ERR_MODULE_NOT_FOUND error. |
| `GP1/bundle-no-import-attributes` | #890 | Given the built bundle, when grepped, then no with-type-json import attribute exists. |
| `GP1/clean-uninstall-no-residue` | #1058 | Given install then uninstall, When settings/hooks dirs are diffed, Then no context-mode entry, file or process remains. |
| `GP1/codex-platform-env` | #906 | Given a Codex config, When install writes it, Then CONTEXT_MODE_PLATFORM=codex is set. |
| `GP1/default-hook-timeouts` | #1228 | Given a freshly generated hooks config, When it is written at install, Then every hook entry carries a timeout value. |
| `GP1/hooks-json-one-matcher-per-tool` | #1000 | Given a generated hooks.json, when read, then every tool name matches exactly one hook entry and each hook entry carries a timeout. |
| `GP1/install-docs-per-host` | #1219 | Given the docs set, When each supported host is checked, Then each host has an install section. |
| `GP1/kiro-hooks-v1-schema` | #1073 | Given an install targeting Kiro, When the hooks config is written, Then it uses version:"v1" with a hooks array. |
| `GP1/npm-pack-includes-runtime-files` | #889 | Given npm pack, when the file list is read, then every file referenced at runtime is present. |
| `GP1/opencode-clientinfo-detect` | #1276 | Given an MCP clientInfo.name of opencode, When the server detects the adapter, Then adapter=opencode. |
| `GP1/opencode-v2-plugin-api` | #1199 | Given OpenCode 2.x, When the plugin loads, Then the default export has an id and a setup function. |
| `GP1/opencode2-plugin-dual-export` | #1171 | Given OpenCode 2.x, When the plugin loads, Then the ctx_* tools register successfully. |
| `GP1/pi-bridge-retry-next-turn` | #1098 | Given tools/list fails once, When the next before_agent_start fires, Then bootstrap runs again and tools register. |
| `GP1/pi-utf8-incremental-decode` | #1249 | Given a multi-byte UTF-8 character split across two stdout chunks on the Pi MCP bridge, When the bridge decodes it, Then the character is reassembled intact. |
| `GP1/plugin-json-unpinned-node` | #1090 | Given install under Homebrew node, When plugin.json is written, Then the command is node, not a pinned process path. |
| `GP1/stable-interpreter-path` | #1183 | Given a Node execPath under a versioned Cellar path, When install writes hook/MCP commands, Then the written command is a stable path, not pinned to that version. |
| `GP1/standalone-mcp-tool-prefix` | #913 | Given a standalone install, When the generated hook config names the ctx tools, Then every name uses the mcp__context-mode__ prefix. |
| `GP10/binary-bytes-excluded-from-savings` | #1151 | Given readFileSync of a 1MB PNG, When stats update, Then saved tokens do not include it. |
| `GP10/binary-read-zero-savings` | #1252 | Given a binary file Read, When ctx_stats totals savings, Then saved_bytes for that call is 0. |
| `GP10/ctx-call-credited-to-caller-session` | #1241 | Given a ctx_execute call in session S over a shared server, When PostToolUse runs, Then the stats row is credited to S, not the server |
| `GP10/real-savings-only` | #952 | Given bytes that were captured but not actually kept out of the model's context, When ctx_stats totals savings, Then those bytes are not counted as saved. |
| `GP10/reduction-pct-denominator` | #1025 | Given 10,001 B stdout and 3,284 B returned, When stats computed, Then denominator counts returned bytes once. |
| `GP10/reduction-pct-net-bytes` | #1042 | Given 10 KB indexed and 2 KB returned to the model, When ctx_stats computes reduction_pct, Then kept_out is 8 KB, counting returned bytes once. |
| `GP10/stats-sibling-db-readonly` | #1236 | Given a sibling session DB, When ctx_stats reads it, Then the DB is opened read-only and its mtime is unchanged afterward. |
| `GP10/stats-totals-consistent` | #950 | Given any stats render, when totals are computed, then session kept-out is at most project total, project total is at most all-time total, and zero calls give zero savings. |
| `GP10/stats-wording-bytes-not-time` | #1023 | Given stats report, When rendered, Then ratios are labelled as bytes, no time claim. |
| `GP10/usage-events-idempotent-per-turn` | #1036 | Given 3 step-finish events in one turn, When journaled, Then turn cost counted once. |
| `GP10/windows-stats-no-execsync-probes` | #1186 | Given Windows, When ctx_stats is called, Then it finishes in under 300 ms and startup spawns no synchronous probes. |
| `GP11/agy-hooks-schema-valid` | #1206 | Given a generated agy hooks.json, When it is checked against the agy schema, Then it passes. |
| `GP11/codex-effective-hooks-state` | #1153 | Given a Codex config with no [features].hooks key, When ctx doctor checks hooks, Then it reports hooks=true because `codex features list` says enabled. |
| `GP11/codex-hooks-default-true` | #1152 | Given no `[features].hooks`, When codex reports hooks true, Then doctor passes. |
| `GP11/hook-matcher-valid-regex` | #1222 | Given hooks.json, When each matcher is tested against real tool names, Then each matcher matches at least one tool; doctor checks this. |
| `GP11/jsonc-comment-boundaries` | #1271 | Given a JSONC config with a URL string containing //, When the installer edits the file, Then the URL string and existing comments are both kept intact. |
| `GP11/keep-user-hooks-on-upgrade` | #1239 #1235 | Given a user-added hook already in the agent's settings, When v2 runs upgrade, Then the user hook is still present afterward. |
| `GP11/npm-audit-zero-high-critical` | #1225 | Given a release build, When npm audit --omit=dev runs, Then it finds zero high or critical issues. |
| `GP11/opencode-merge-sibling-plugins` | #1160 | Given an opencode.json with 3 existing plugin entries, When upgrade writes the jsonc file, Then all 3 entries are still present. |
| `GP11/pi-detect-npm-managed-install` | #1035 | Given Pi installed via npm, When doctor/install runs, Then it finds the install via PI_CODING_AGENT_DIR. |
| `GP11/pi-discovery-dirs-doctor` | #1168 | Given Pi 0.85, When doctor runs, Then it reports the actual extension path. |
| `GP11/pi-doctor-real-paths` | #1266 | Given a Pi install, When ctx doctor runs, Then it checks the real ~/.pi/... paths, not a hardcoded legacy path. |
| `GP11/redact-secrets-in-debug-report` | #1144 | Given an env var holding a token-shaped value, When a doctor/debug report is built, Then the value is redacted in the output. |
| `GP11/redact-secrets-in-doctor-output` | #1141 | Given settings.json env `X_TOKEN=abc`, When doctor/debug runs, Then `abc` is absent from output. |
| `GP2/opencode-single-system-message` | #1085 | Given OpenCode, When SessionStart lines are injected, Then output.system length stays the same because lines merge into one entry. |
| `GP2/pi-hint-not-user-role` | #1263 | Given Pi, When context-mode adds a hint, Then it is a system or custom-role message, never role user. |
| `GP2/pi-system-role-injection` | #1264 #1002 #864 | Given a SessionStart event on Pi, When the context is injected, Then the message role is system, never user. |
| `GP2/stable-prefix-across-requests` | #1112 | Given a multi-request turn, When request 2 is built, Then its prefix equals request 1. |
| `GP2/tool-description-token-budget` | #1031 | Given the tool-description token budget constant, When descriptions are linted, Then total size stays under budget on every adapter. |
| `GP2/tool-schema-timeout-unit` | #1081 | Given the tool list, When the schema is read, Then the timeout description states milliseconds, or the field is named timeout_ms. |
| `GP3/antigravity-stop-hook-flat-schema` | #1240 | Given a generated hooks.json for Antigravity, When Antigravity loads it, Then it validates against Antigravity's own hook schema. |
| `GP3/codex-exec-pretooluse-matcher` | #1104 | Given a Codex tool call named exec, When PreToolUse runs, Then the hook fires for it. |
| `GP3/external-mcp-tool-routing-hint` | #1231 | Given a call to an external tool named mcp__foo__bar, When PreToolUse runs, Then the hook fires and can route/hint on it. |
| `GP3/hint-once-per-session` | #1107 #1270 #1026 | Given same session id, When 3 Reads fire, Then hint shows once and no /tmp dirs are made. |
| `GP3/hook-perf-posttool-async` | #1261 | Given a plain ls command, When hooks run, Then PreToolUse is not spawned or takes under 15 ms, and PostToolUse runs async and append-only. |
| `GP3/hook-timeout-present` | #1226 | Given a generated hook config for any adapter, Then each entry has a timeout field of 10 seconds or less. |
| `GP3/injected-message-required-fields` | #1179 | Given Pi, When context hook injects, Then message has a finite timestamp. |
| `GP3/no-empty-fields` | #910 | Given a hook event where there is nothing to report, When the adapter builds its output, Then it has no additionalContext field, not an empty one. |
| `GP3/no-updated-input-rewrite` | #1142 | Given allow rule for ctx_execute, When called without cwd, Then no permission prompt (hook returns no updatedInput). |
| `GP3/pi-injected-message-timestamp` | #1180 | Given Pi injects a context-hook message, When the message is built, Then it carries a finite numeric timestamp. |
| `GP3/pi-project-permissions-honored` | #1019 | Given a Pi project with a deny rule in its permissions file, When the hook sees a matching call, Then it denies with the policy reason |
| `GP3/pi-read-hint-parity` | #1069 | Given Pi and Claude Code, When a Read of a file over 50 KB runs, Then both emit the same hint text. |
| `GP3/powershell-routed-like-bash` | #1212 | Given tool PowerShell, When PreToolUse fires, Then it gets the same hint as Bash. |
| `GP3/powershell-same-hint-as-bash` | #1265 #897 | Given a PowerShell tool call, When PreToolUse fires, Then the same routing hint text is shown as for an equivalent Bash call. |
| `GP3/tool-name-map-opencode-webfetch` | #1052 | Given OpenCode calls `webfetch`, When PreToolUse runs, Then the WebFetch hint is emitted. |
| `GP3/tool-prefix-standalone-mcp` | #1018 | Given standalone MCP install, When hint emitted, Then it names `mcp__context-mode__*`. |
| `GP3/unrelated-mcp-tool-no-hook` | #960 | Given a call to mcp__grafana__get_datasource, when PreToolUse runs, then no hook process is spawned. |
| `GP3/v17-read-glob-deny-anchors` | #1075 | Given a deny rule for Read(~/secret/**), When ctx_execute_file reads a file under ~/secret, Then it is denied; the same holds for a //abs/** rule. |
| `GP3/webfetch-allow-claude-ai-artifacts` | #945 | Given a claude.ai artifact URL, When the WebFetch replacement mechanism runs, Then the fetch is allowed by default through the allowHosts table, with the deny staying in force for every other host. |
| `GP4/abort-signal-pi-cancel` | #1182 #1093 #904 | Given a running ctx_execute call, When the host sends an abort/cancel signal, Then the child process tree is killed and the call returns a cancel reply. |
| `GP4/background-no-timeout-hang` | #975 | Given ctx_execute called with background:true and no timeout, When the call runs, Then it returns in under 2 seconds. |
| `GP4/batch-node-options-compound-cmd` | #1177 #934 | Given a compound shell command such as a for-loop, When ctx_batch_execute runs it with NODE_OPTIONS preload set, Then the command still runs and produces correct output. |
| `GP4/batch-timeout-bounds-whole-handler` | #947 | Given a timeout of 5000 ms and a huge output, when ctx_batch_execute runs, then the reply returns within 5 seconds plus a small margin. |
| `GP4/cancel-kills-child-tree` | #1009 | Given a running ctx_execute call, When it is cancelled, Then the full child process tree is killed, including any abandoned grandchild processes. |
| `GP4/cancel-kills-child-tree-1s` | #1175 | Given running ctx_execute, When client cancels, Then child is killed within 1 s and a cancel reply returns. |
| `GP4/code-point-safe-truncation-cut` | #903 | Given text with an emoji at the cut boundary, when it is truncated, then the result has no lone surrogate. |
| `GP4/cold-start-no-path-probes` | #1159 | Given cold start, When initialize arrives, Then reply < 1 s with no PATH probes run. |
| `GP4/default-timeout-every-host` | #1147 | Given ctx_execute without timeoutMs on the Pi adapter, When the code sleeps past EXEC_TIMEOUT_MS, Then the tree is killed and the timeout exit class is returned |
| `GP4/deleted-cwd-no-ansi` | #1286 | Given a ctx_execute cwd that no longer exists, When the call runs, Then it still runs with no crash; given FORCE_COLOR=1, Then stdout has no ANSI escape codes. |
| `GP4/env-via-spawn-env` | #1117 | Given shell code `for i in 1; do echo $i; done`, When ctx_execute runs, Then output is `1`. |
| `GP4/exit1-stderr-is-error` | #1250 #1121 | Given a shell command that exits 1 and writes to stderr, When ctx_execute returns, Then isError is true. |
| `GP4/fetch-error-one-line-cause` | #1135 | Given fetch fails, When ctx_fetch_and_index returns, Then text has no stack frames. |
| `GP4/host-rpc-timeout-governs-no-default` | #936 | Given ctx_execute is called with no timeoutMs and the code loops forever, then the server itself sets no default timeout and the host's own RPC timeout governs the call. |
| `GP4/hung-execute-cancel-kills-tree` | #959 | Given ctx_execute runs sleep 999, when the host sends cancel or the timeout hits, then the child process tree is dead within 2 seconds and the tool returns an error. |
| `GP4/no-preload-marker-leak-grandchild` | #1068 | Given a batch command that spawns a node grandchild asserting empty stderr, When run via ctx_batch_execute, Then the grandchild stderr is empty and the byte count is still reported. |
| `GP4/node-options-no-leak-across-servers` | #951 | Given server A has exited, when server B runs node -v in ctx_batch_execute, then it succeeds with no MODULE_NOT_FOUND error. |
| `GP4/pi-collapsed-view-plain-text-first-line` | #1094 | Given Pi, When ctx_execute returns, Then the first line is plain text, not a code-fence opener. |
| `GP4/project-cwd-temp-dir-cleanup` | #1237 | Given a ctx_execute call, When it runs and finishes, Then it ran in the project cwd and its temp directory was cleaned up afterward. |
| `GP4/recreate-preload-temp-file` | #969 | Given the batch preload temp file is deleted by the OS, When ctx_batch_execute runs again, Then it recreates the file and still works. |
| `GP4/runpool-capped-flag` | #932 | Given fewer queued jobs than the pool's concurrency limit, When runPool runs them, Then capped is false. |
| `GP4/shell-syntax-with-spawn-env` | #925 | Given the command `if true; then echo ok; fi`, when ctx_batch_execute runs with env passed through spawn env, then the output is ok. |
| `GP4/surrogate-safe-truncation` | #1176 | Given text with an emoji sitting at the cut point, When ctx_execute truncates output, Then the result is valid UTF-8 with no lone surrogate. |
| `GP4/windows-hide-console-on-spawn` | #1154 | Given Windows, When any probe or child process spawns, Then it sets windowsHide so no console window appears. |
| `GP4/windows-inherited-path` | #1218 | Given Windows with Git Bash, When ctx_execute runs a shell command that calls `where node`, Then it resolves node the same way the parent shell's PATH would. |
| `GP4/windows-path-inherit` | #1217 | Given Windows, When ctx_execute shell runs gh --version, Then it resolves. |
| `GP4/windows-pyenv-shim` | #1208 | Given only a pyenv-win shim, When ctx_execute python runs, Then it runs, or the error names the shim. |
| `GP4/windows-shim-interpreter` | #1209 | Given Windows where the only python on PATH is a #!/bin/sh shim, When ctx_execute runs python code, Then the code runs successfully. |
| `GP5/auto-index-exec-output` | #991 | Given a 50 KB ctx_execute output with no intent set, When ctx_search runs for a term in it, Then the hit is found and labelled as a session result. |
| `GP5/batch-execute-dedup-section` | #1077 | Given two queries that hit the same chunk, When ctx_batch_execute returns, Then that chunk appears only once. |
| `GP5/batch-index-byte-budget` | #961 | Given a command that prints 100 MiB, when ctx_batch_execute runs, then indexed bytes stay under max_total_indexed_bytes and the reply states it was cut. |
| `GP5/batch-ingestion-byte-caps` | #980 | Given an indexing call over many bytes/chunks, When ctx_index/ctx_batch_execute ingest it, Then the ingested byte and chunk counts stay within the documented budget. |
| `GP5/call-row-language-code-line` | #1150 | Given Pi, When ctx_execute is called, Then call row shows language and first code line. |
| `GP5/chunk-byte-cap` | #878 | Given a 1 MB single-line paragraph, when it is indexed, then every stored chunk is at or under MAX_CHUNK_BYTES. |
| `GP5/chunk-size-cap` | #898 | Given one huge line with no natural break, When ctx_index chunks it, Then every chunk stays at or under the size cap. |
| `GP5/ctx-search-schema-declares-query` | #1230 #1207 | Given a strict MCP host, When it calls ctx_search with {query:"x"}, Then the call succeeds because query is declared in the schema. |
| `GP5/dedupe-chunks-across-queries` | #921 | Given one chunk matches two different search queries in the same call, When ctx_search returns results, Then the chunk is printed once, not twice. |
| `GP5/fetch-error-one-line` | #1172 | Given an unreachable URL, When ctx_fetch_and_index runs, Then the error is one line naming the cause, with no raw stack. |
| `GP5/fts-highlight-bytecap` | #1091 #963 | Given a 5 MB FTS row, When ctx_search highlights it, Then the reply returns in under 1s with bounded bytes. |
| `GP5/globstar-zero-depth` | #1291 | Given docs/top.md, When include docs/**/*.md, Then docs/top.md is included (** matches zero directories). |
| `GP5/http-proxy-honored` | #1039 | Given HTTPS_PROXY set, When ctx_fetch_and_index runs, Then the request goes through the proxy. |
| `GP5/negative-limit-rejected` | #1119 | Given limit=-1, When ctx_search runs, Then it errors (or clamps to 1). |
| `GP5/nested-fenced-code-intact` | #1238 | Given a markdown fence containing an inner fenced code block, When the page is chunked, Then it stays one block with the inner fence intact. |
| `GP5/nested-gitignore-negation` | #1292 | Given a/.gitignore ignoring x, when the directory is indexed, then a/x is absent. |
| `GP5/non-ascii-auto-memory-match` | #1295 | Given an instruction file with a Russian word, when auto-memory search runs that word, then a hit is returned. |
| `GP5/rowless-tables` | #1138 | Given an HTML table with a caption and no rows, When it is converted, Then the caption is kept and conversion does not throw. |
| `GP5/rowless-tables-survive` | #1136 | Given page with `<table></table>`, When fetched, Then it indexes without error. |
| `GP5/search-param-schema-match` | #1200 | Given each parameter the schema declares, When ctx_search is called with it, Then no validation error occurs. |
| `GP5/session-worktree-project-rank` | #895 | Given search hits from session, worktree and project scope, when ranked, then session hits rank above worktree hits and worktree hits rank above project hits. |
| `GP5/snippet-code-point-safe` | #1163 | Given text with emoji at a cut, When snippet returns, Then it is valid UTF-8. |
| `GP6/code-echo-default` | #1067 #1047 | Given ctx_execute on any adapter, When result returns, Then line 1 is a plain summary/output, not a code fence. |
| `GP6/hint-names-platform-tool` | #1043 | Given Codex, When the SessionStart resume hint is built, Then its text uses the mcp__...ctx_resume tool name form for that agent. |
| `GP6/no-false-shell-error-capture` | #899 | Given a Bash command that exits 0 but whose output text contains the word Error, When the journal records the event, Then no error event is written. |
| `GP6/no-resume-hint-mid-session` | #1279 | Given an already-running session, When a plugin event fires mid-session, Then no resume hint is injected (hint only fires at real session start). |
| `GP6/priority-polarity` | #1181 | Given journal events of mixed priority, When ctx_resume filters by minPriority, Then priority 1 (critical) events are always kept, under one priority polarity shared by journal and resume. |
| `GP6/sessionstart-surrogate-safe-truncation` | #907 | Given a SessionStart resume hint truncated at a point where an emoji sits, When the hint is built, Then the text is valid UTF-16 with no lone surrogate. |
| `GP7/adapter-root-path-containment` | #1017 | Given Copilot CLI cwd=/repo, When ctx_execute_file reads /repo/AGENTS.md, Then allowed. |
| `GP7/codex-session-project-dir` | #1210 | Given Codex sessions A in directory X and B in directory Y 6 minutes apart, Then session A allows only X and session B allows only Y. |
| `GP7/pi-bridge-per-session-workspace` | #1246 | Given 2 Pi sessions opened in 2 different project directories, When each session calls a ctx tool, Then each gets its own bridge scoped to the right project. |
| `GP7/symlink-dot-prefix-containment` | #1294 | Given a symlink to ./..notes, when the directory is indexed, then it is included, while a symlink to ../x is still rejected. |
| `GP7/vscode-remote-wsl-project-root` | #1033 | Given VS Code Remote-WSL where VSCODE_CWD points at the install dir, When the project root resolves, Then it resolves to the real workspace root (or a doctor error), not the install dir. |
| `GP7/workspace-folder-remote-wsl` | #1032 | Given Remote-WSL workspace in MCP roots, When ctx_execute_file reads a workspace file, Then it is allowed. |
| `GP7/worktree-containment-consistent` | #954 | Given a registered external git worktree, when ctx_execute_file and ctx_batch_execute target it, then both accept under the same containment rule. |
| `GP7/worktree-label-session-first` | #1185 | Given two worktrees, When ctx_search runs, Then hits are labelled by worktree and the caller's own session ranks first. |
| `GP8/runpool-capped-flag` | #915 | Given 2 jobs and a concurrency of 8, when runPool computes the capped flag, then capped is false. |
| `GP8/sibling-db-readonly` | #1213 | Given sibling databases, When ctx_stats runs, Then every open is read-only and modification times stay unchanged. |
| `GP8/stats-heartbeat-no-timer-db-open` | #1248 | Given 500 session databases, When the server idles 10 minutes, Then no database file is opened and nothing is written. |
| `GP9/idle-cpu-stdin-exit` | #999 | Given an idle server for 60 seconds, when CPU time is measured, then it grows by less than 1 second; when the client closes stdin, then the process exits. |
| `GP9/linux-procfs-ppid-no-spawn` | #1277 | Given Linux, When the server reads the parent PID, Then it reads /proc directly and spawns no ps process. |
| `GP9/no-chdir` | #974 #924 | Given the server starts, When it runs, Then process.cwd() stays the launch cwd — the server never calls chdir. |
| `GP9/no-chdir-server-cwd-stable` | #923 | Given the server is started in /proj, when it runs, then process.cwd() stays /proj. |
| `GP9/no-periodic-ps-spawn` | #1262 | Given a server running 1 hour, When the liveness guard ticks, Then zero child processes are spawned (stdin close or signal only). |
| `GP9/no-periodic-stats-db-scan` | #1211 #1111 | Given 1000 project DBs on disk, When the server sits idle for 60 seconds, Then it opens 0 DBs outside its own session. |
| `GP9/no-process-spawn-at-boot` | #1167 | Given Windows, When the server starts, Then zero `where` probe processes spawn before initialize. |
| `GP9/pi-reload-no-leak` | #983 | Given Pi reloads twice, when the MCP helper processes are counted, then exactly one remains. |
| `GP9/stdin-eof-exit` | #1100 | Given a server on stdio, When stdin closes, Then the process exits within 2 seconds. |
| `GP9/windows-ci-no-hang` | #995 | Given the windows-latest CI cell, When KEEP-PASS and GP1-GP11 run, Then the cell ends inside the 10 min budget with no EPERM hang |
| `GP9/windows-client-kill-exit` | #982 | Given a Windows client is killed, when 5 seconds pass, then the server process has exited. |
| `GP9/windows-parent-pid-probe` | #987 | Given Windows, When the parent PID is gone, Then the server's liveness guard detects it on its next tick and the server exits. |
| `GP9/windows-stdio-close-plugin-dir-deletable` | #953 | Given the host closes stdio, when 5 seconds pass, then the server process has exited and the plugin directory can be deleted on Windows. |

## Changes

- 2026-10-17: created; closes the ADR-0003 exit-gate gap (issue map had 0 of 351 rows with a test verdict).
