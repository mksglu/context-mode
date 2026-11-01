# Issue and PR coverage in v2

Date: 2026-10-23. Branch: v2-design.

## Counts per status

| Status | Rows |
|---|---|
| resolved+tested | 171 |
| resolved-untested | 110 |
| partly | 7 |
| not resolved | 27 |
| out of scope | 36 |
| Total | 351 |

## How this was counted

- The GitHub tracker of mksglu/context-mode has issues turned off. `gh issue list`, `gh pr list` and the issues API return empty lists, and the repo reports `open_issues_count` 356. So no live list was possible. The source is `tickets/v2-issue-map.md` (173 issues and 178 PRs, 351 rows), the same list used by `docs/v2/impl/14a-issue-cases.md` and `docs/v2/review/ISSUE-OUTCOMES-r4.md`.
- ISSUE-OUTCOMES-r4 holds 329 deduplicated rows with a verdict: wont-fix 55, covered-by-test 111, closed-by-design 159, merged 2, unverified 1. The map has more rows because it does not merge duplicates. Two views, not one list.
- "resolved+tested": the map names a test case, and a test file in `e2e/` or `tests/` contains the case slug or the issue number. This is a name match. I did not run each case alone and I did not read each assertion.
- "resolved-untested": 110 rows are REMOVED (the code path is gone, by decision D2, D3, D8, D9, D11 or ADR-0008). `node build/check-removed.mjs` prints "clean", but no test checks one row each. 4 more rows have a GP case in the map with no test file found by name.
- "partly": 6 rows tagged "docs" in the map (docs/install/*.md exist, no per-row check) and #1056.
- "not resolved": 27 rows with no decision (open-question or not-decided in the map). v2 does not handle them yet.
- "out of scope": duplicates, rejected, not-a-bug, deferred past 2.0, new adapters.
- Test runs on this commit (macOS, Node v26.8.1): GP1 to GP11 e2e, 185 pass, 0 fail. `node --test tests/`: 1368 tests, 1366 pass, 0 fail, 2 skipped (GP3 copilot-cli sub-case, one win32-only check). `build/check-removed.mjs`: clean.
- Not run: live cases (they need a real agent and a model key).

## Rows

### resolved+tested (171)

| # | Title | v2 change or reason | Evidence |
|---|---|---|---|
| 1282 | Cursor MCP spawn fails, bare npx not on PATH | GP1/absolute-node-path-cursor-windows | e2e/cases/GP1-absolute-node-path.e2e.mjs |
| 1263 | Pi injects memory as role:"user" | GP2/pi-hint-not-user-role | e2e/cases/GP2-prompt-surface.e2e.mjs; tests/adapters/pi.test.mjs |
| 1262 | parent-liveness spawns `ps` every 30 s | GP9/no-periodic-ps-spawn | e2e/cases/GP9-lifecycle.e2e.mjs; e2e/golden/GP9/no-periodic-ps-spawn.json |
| 1261 | Pre/PostToolUse hooks cost 55-70 ms CPU per Bash | GP3/hook-perf-posttool-async | e2e/cases/GP3-hook-perf.e2e.mjs |
| 1248 | stats heartbeat reopens every session DB each minute | GP8/stats-heartbeat-no-timer-db-open | e2e/cases/GP8-concurrency.e2e.mjs; e2e/golden/GP8/stats-heartbeat-no-timer-db-open.json |
| 1226 | hooks.json has no default timeouts | GP3/hook-timeout-present | e2e/cases/GP3-hooks.e2e.mjs; e2e/golden/GP3/hook-timeout-present.json |
| 1225 | vulnerable ip-address dep chain | GP11/npm-audit-zero-high-critical | e2e/cases/GP11-doctor-upgrade.e2e.mjs; e2e/cases/GP11-release-audit.e2e.mjs |
| 1222 | bare `mcp__` matcher matches nothing (CC 2.1.195) | GP11/hook-matcher-valid-regex | e2e/cases/GP11-doctor-upgrade.e2e.mjs; tests/ops/doctor-config.test.mjs |
| 1219 | No docs for Codex Desktop install | GP1/install-docs-per-host | e2e/cases/GP1-install-docs.e2e.mjs |
| 1217 | ctx_execute shell has PATH stripped to /usr/bin:/bin | GP4/windows-path-inherit | e2e/cases/GP4-execute.e2e.mjs; tests/sandbox/env.test.mjs |
| 1213 | stats opens every session DB read-write | GP8/sibling-db-readonly | e2e/cases/GP10-stats.e2e.mjs; e2e/cases/GP8-concurrency.e2e.mjs |
| 1212 | PowerShell tool not routed; Bash nudge once | GP3/powershell-routed-like-bash | tests/adapters/qwen.test.mjs |
| 1210 | Codex Windows project dir falls back to plugin cache | GP7/codex-session-project-dir | tests/hooks/hook-entry.test.mjs |
| 1208 | ctx_execute python/node fails with shell-script shims | GP4/windows-pyenv-shim | e2e/cases/GP4-execute.e2e.mjs; tests/sandbox/runtimes.test.mjs |
| 1206 | agy rejects hooks.json (grouped Stop) | GP11/agy-hooks-schema-valid | e2e/cases/GP11-pi-agy.e2e.mjs |
| 1201 | OpenClaw capture breaks computed import paths | GP1/adapter-bundle-static-imports | e2e/cases/GP1-install.e2e.mjs; e2e/golden/GP1/adapter-bundle-static-imports.json |
| 1200 | ctx_search rejects singular `query` | GP5/search-param-schema-match | e2e/cases/GP5-index-search.e2e.mjs; e2e/golden/GP5/search-param-schema-match.json |
| 1199 | OpenCode 2.x plugin fails to load | GP1/opencode-v2-plugin-api | e2e/cases/GP1-install.e2e.mjs; tests/plugins/opencode.test.mjs |
| 1186 | Windows ctx_stats 4 s + 1.6 s execSync probes; coexistence detector | GP10/windows-stats-no-execsync-probes | e2e/cases/GP10-stats.e2e.mjs |
| 1185 | multi-agent context isolation per worktree | GP7/worktree-label-session-first | e2e/cases/GP7-scope.e2e.mjs; e2e/golden/GP7/worktree-label-session-first.json |
| 1069 | Pi does not route read/grep, only bash HTTP | GP3/pi-read-hint-parity | e2e/cases/GP3-hooks.e2e.mjs; tests/adapters/pi.test.mjs |
| 1075 | `//` and `~/` permission anchors never match; deny fails open | GP3/v17-read-glob-deny-anchors | tests/policy/user-deny.test.mjs |
| 1077 | ctx_* calls verbose in Codex; batch repeats sections per query | GP5/batch-execute-dedup-section | e2e/cases/GP5-index-search.e2e.mjs; e2e/golden/GP5/batch-execute-dedup-section.json |
| 1081 | timeout unit (ms) missing from schema | GP2/tool-schema-timeout-unit | e2e/cases/GP2-prompt-surface.e2e.mjs; e2e/golden/GP2/tool-schema-timeout-unit.json |
| 1085 | OpenCode extra system message breaks Qwen single-system templates | GP2/opencode-single-system-message | e2e/cases/GP2-prompt-surface.e2e.mjs; tests/adapters/opencode.test.mjs |
| 1090 | plugin.json command pinned to versioned node path | GP1/plugin-json-unpinned-node | e2e/cases/GP1-release-tree.e2e.mjs |
| 1094 | Pi collapsed view shows only code fence | GP4/pi-collapsed-view-plain-text-first-line | e2e/cases/GP4-execute.e2e.mjs; tests/adapters/pi.test.mjs |
| 1098 | Pi bridge failure after init is sticky | GP1/pi-bridge-retry-next-turn | e2e/cases/GP1-install.e2e.mjs; tests/plugins/pi.test.mjs |
| 1100 | Server orphaned after session close (100% CPU) | GP9/stdin-eof-exit | e2e/cases/GP9-lifecycle.e2e.mjs; e2e/golden/GP9/stdin-eof-exit.json |
| 1107 | guidanceOnce keyed on ppid never throttles; 2149 tmp dirs | GP3/hint-once-per-session | tests/hooks/dispatch.test.mjs; tests/hooks/throttle.test.mjs |
| 1112 | Pi ephemeral tail injection breaks prompt cache | GP2/stable-prefix-across-requests | e2e/cases/GP2-prompt-surface.e2e.mjs |
| 1117 | NODE_OPTIONS prefix breaks `for`/`while` | GP4/env-via-spawn-env | e2e/cases/GP4-execute.e2e.mjs; e2e/golden/GP4/env-via-spawn-env-no-node-options-leak.json |
| 1119 | ctx_search negative limit | GP5/negative-limit-rejected | e2e/cases/GP5-index-search.e2e.mjs; e2e/golden/GP5/negative-limit-rejected.json |
| 1135 | fetch error returns raw Node crash stack | GP4/fetch-error-one-line-cause | e2e/cases/GP5-index-search.e2e.mjs; e2e/golden/GP5/fetch-error-one-line-cause.json |
| 1136 | empty `<table>` crashes turndown | GP5/rowless-tables-survive | e2e/cases/GP5-index-search.e2e.mjs; e2e/golden/GP5/rowless-tables-survive.json |
| 1141 | ctx-debug.sh dumps secrets; template requires pasting | GP11/redact-secrets-in-doctor-output | tests/ops/report.test.mjs |
| 1142 | hook cwd rewrite defeats permission allowlist | GP3/no-updated-input-rewrite | tests/hooks/dispatch.test.mjs |
| 1150 | Pi renderCall drops args | GP5/call-row-language-code-line | e2e/cases/GP5-index-search.e2e.mjs; tests/adapters/opencode.test.mjs |
| 1151 | binary/HTTP bytes counted as saved tokens | GP10/binary-bytes-excluded-from-savings | tests/tools/stats.test.mjs |
| 1152 | doctor says Codex hooks off when default on | GP11/codex-hooks-default-true | e2e/cases/GP11-doctor-upgrade.e2e.mjs; tests/ops/doctor-config.test.mjs |
| 1159 | Windows runtime probes take 30 s before initialize | GP4/cold-start-no-path-probes | e2e/cases/GP4-execute.e2e.mjs |
| 1163 | snippet slicing makes lone surrogates → 500s | GP5/snippet-code-point-safe | e2e/cases/GP5-index-search.e2e.mjs; e2e/golden/GP5/snippet-code-point-safe.json |
| 1168 | Pi paths hardcoded to legacy ~/.pi dirs | GP11/pi-discovery-dirs-doctor | e2e/cases/GP11-doctor-upgrade.e2e.mjs; e2e/cases/GP11-pi-agy.e2e.mjs |
| 1175 | ctx_execute ignores Esc / no progress | GP4/cancel-kills-child-tree-1s | e2e/cases/GP4-execute.e2e.mjs; e2e/golden/GP4/cancel-kills-child-tree-1s.json |
| 1179 | Pi context message without timestamp → 400 | GP3/injected-message-required-fields | tests/adapters/pi.test.mjs |
| 1068 | cm-fs preload marker leaks to grandchild stderr | GP4/no-preload-marker-leak-grandchild | e2e/cases/GP4-execute.e2e.mjs; e2e/golden/GP4/no-preload-marker-leak-grandchild.json |
| 1067 | pi collapsed row shows ```javascript fence | GP6/code-echo-default | e2e/cases/GP6-journal-resume.e2e.mjs |
| 1058 | Uninstall leaves cache-heal hook, cache dir, live MCP | GP1/clean-uninstall-no-residue | e2e/cases/GP1-uninstall.e2e.mjs |
| 1052 | OpenCode `webfetch` alias missing | GP3/tool-name-map-opencode-webfetch | e2e/cases/GP3-hooks.e2e.mjs; tests/adapters/opencode.test.mjs |
| 1047 | Configurable execution echo + summary arg | GP6/code-echo-default | e2e/cases/GP6-journal-resume.e2e.mjs |
| 1039 | ctx_fetch_and_index strips HTTP(S)_PROXY | GP5/http-proxy-honored | e2e/cases/GP5-index-search.e2e.mjs; e2e/golden/GP5/http-proxy-honored.json |
| 1037 | WebFetch denied for subagents without ctx_* | LIVE:T-SUB | e2e/live/cases/subagent-cap.json |
| 1036 | OpenCode cumulative cost appended per step | GP10/usage-events-idempotent-per-turn | e2e/cases/GP10-stats.e2e.mjs; tests/store/cost-dedup.test.mjs |
| 1032 | VS Code Remote-WSL root = VS Code install dir | GP7/workspace-folder-remote-wsl | e2e/cases/GP7-scope.e2e.mjs; e2e/golden/GP7/workspace-folder-remote-wsl.json |
| 1031 | Tool descriptions ~6.2K tokens | GP2/tool-description-token-budget | e2e/cases/GP2-prompt-surface.e2e.mjs; e2e/golden/GP2/tool-description-token-budget.json |
| 1026 | Bash nudge once-per-session vs periodic | GP3/hint-once-per-session | tests/hooks/dispatch.test.mjs; tests/hooks/throttle.test.mjs |
| 1025 | reduction_pct double-counts returned bytes | GP10/reduction-pct-denominator | e2e/cases/GP10-stats.e2e.mjs; tests/tools/stats.test.mjs |
| 1023 | "ran N× longer" is byte ratio shown as time | GP10/stats-wording-bytes-not-time | e2e/cases/GP10-stats.e2e.mjs; tests/tools/stats.test.mjs |
| 1018 | CC tool naming assumes plugin install | GP3/tool-prefix-standalone-mcp | tests/hooks/dispatch.test.mjs |
| 1017 | Copilot CLI / Codex root = plugin install dir | GP7/adapter-root-path-containment | e2e/cases/GP7-scope.e2e.mjs; e2e/golden/GP7/adapter-root-path-containment.json |
| 1003 | Denies defeated by parallel batches; no WebFetch opt-out | LIVE:T-PAR | e2e/live/cases/parallel-batch.json |
| 1000 | PreToolUse double-fires; no PostToolUse timeout | GP1/hooks-json-one-matcher-per-tool | e2e/cases/GP1-install.e2e.mjs; e2e/golden/GP1/hooks-json-one-matcher-per-tool.json |
| 999 | start.mjs busy-loop, 23 instances | GP9/idle-cpu-stdin-exit | e2e/cases/GP9-lifecycle.e2e.mjs; e2e/golden/GP9/idle-cpu-stdin-exit.json |
| 983 | Pi reload leaks MCP helper | GP9/pi-reload-no-leak | e2e/cases/GP9-lifecycle.e2e.mjs; tests/adapters/pi.test.mjs |
| 982 | Windows MCP orphans spin after session end | GP9/windows-client-kill-exit | e2e/cases/GP9-lifecycle.e2e.mjs |
| 961 | RFC: indexed byte/chunk budgets for batch | GP5/batch-index-byte-budget | e2e/cases/GP5-index-search.e2e.mjs; e2e/golden/GP5/batch-index-byte-budget.json |
| 960 | PreToolUse `mcp__` matcher hits all MCP tools | GP3/unrelated-mcp-tool-no-hook | e2e/cases/GP3-hooks.e2e.mjs; e2e/golden/GP3/unrelated-mcp-tool-no-hook.json |
| 959 | Pi: hung ctx_execute cannot be aborted | GP4/hung-execute-cancel-kills-tree | e2e/cases/GP4-execute.e2e.mjs; e2e/golden/GP4/hung-execute-cancel-kills-tree.json |
| 954 | execute_file rejects external worktrees, batch accepts | GP7/worktree-containment-consistent | e2e/cases/GP7-scope.e2e.mjs; e2e/golden/GP7/worktree-containment-consistent.json |
| 953 | Codex Desktop Win keeps one MCP server per task, os error 32 | GP9/windows-stdio-close-plugin-dir-deletable | e2e/cases/GP9-lifecycle.e2e.mjs |
| 951 | Stale cm-fs-preload-<pid>.js via NODE_OPTIONS leak | GP4/node-options-no-leak-across-servers | e2e/cases/GP4-execute.e2e.mjs; e2e/golden/GP4/node-options-no-leak-across-servers.json |
| 950 | ctx_stats self-contradicts (part > whole) | GP10/stats-totals-consistent | tests/tools/stats.test.mjs; e2e/cases/GP10-stats.e2e.mjs |
| 947 | batch timeout does not bound indexing/search | GP4/batch-timeout-bounds-whole-handler | e2e/cases/GP4-execute.e2e.mjs; e2e/golden/GP4/batch-timeout-bounds-whole-handler.json |
| 936 | stdio ctx_execute hangs, no server timeout | GP4/host-rpc-timeout-governs-no-default | e2e/cases/GP4-execute.e2e.mjs; e2e/golden/GP4/host-rpc-timeout-governs-no-default.json |
| 925 | Wrapper breaks commands starting with if/for/( | GP4/shell-syntax-with-spawn-env | e2e/cases/GP4-execute.e2e.mjs; e2e/golden/GP4/shell-syntax-with-spawn-env.json |
| 923 | start.mjs chdir breaks terminal cwd | GP9/no-chdir-server-cwd-stable | e2e/cases/GP9-lifecycle.e2e.mjs; e2e/golden/GP9/no-chdir-server-cwd-stable.json |
| 915 | runPool `capped` true when jobs < concurrency | GP8/runpool-capped-flag | e2e/cases/GP8-concurrency.e2e.mjs; e2e/golden/GP8/runpool-capped-flag.json |
| 903 | SessionStart truncation splits UTF-16 surrogates | GP4/code-point-safe-truncation-cut | e2e/cases/GP4-execute.e2e.mjs; e2e/golden/GP4/code-point-safe-truncation-cut.json |
| 895 | ctx_search ranks stale cross-session above fresh | GP5/session-worktree-project-rank | e2e/cases/GP5-index-search.e2e.mjs; e2e/golden/GP5/session-worktree-project-rank.json |
| 890 | omp: `with {type:"json"}` import breaks validator | GP1/bundle-no-import-attributes | e2e/cases/GP1-install.e2e.mjs; e2e/golden/GP1/bundle-no-import-attributes.json |
| 889 | tarball missing scripts/*.mjs | GP1/npm-pack-includes-runtime-files | e2e/cases/GP1-release-tree.e2e.mjs |
| 878 | chunkMarkdown oversized paragraphs | GP5/chunk-byte-cap | e2e/cases/GP5-index-search.e2e.mjs; e2e/golden/GP5/chunk-byte-cap.json |
| 1295 | Unicode auto-memory word boundaries | GP5/non-ascii-auto-memory-match | e2e/cases/GP5-index-search.e2e.mjs; e2e/golden/GP5/non-ascii-auto-memory-match.json |
| 1294 | contained dot-prefixed symlink targets (`..notes`) | GP7/symlink-dot-prefix-containment | e2e/cases/GP7-scope.e2e.mjs; e2e/golden/GP7/symlink-dot-prefix-containment.json |
| 1292 | nested .gitignore in dir walks | GP5/nested-gitignore-negation | e2e/cases/GP5-index-search.e2e.mjs; e2e/golden/GP5/nested-gitignore-negation.json |
| 1291 | globstar zero-depth (`docs/**/*.md`) | GP5/globstar-zero-depth | e2e/cases/GP5-index-search.e2e.mjs; e2e/golden/GP5/globstar-zero-depth.json |
| 1286 | executor: deleted cwd + FORCE_COLOR plain | GP4/deleted-cwd-no-ansi | e2e/cases/GP4-execute.e2e.mjs; e2e/golden/GP4/deleted-cwd-no-ansi.json |
| 1279 | OpenCode: no resume injection into running session | GP6/no-resume-hint-mid-session | e2e/cases/GP6-journal-resume.e2e.mjs; tests/hooks/dispatch-compact.test.mjs |
| 1277 | procfs parent PID on Linux | GP9/linux-procfs-ppid-no-spawn | e2e/cases/GP9-lifecycle.e2e.mjs; e2e/golden/GP9/linux-procfs-ppid-no-spawn.json |
| 1276 | detect OpenCode from MCP clientInfo | GP1/opencode-clientinfo-detect | e2e/cases/GP1-opencode-clientinfo.e2e.mjs; tests/adapters/client-map.test.mjs |
| 1271 | JSONC comment boundaries | GP11/jsonc-comment-boundaries | tests/ops/host-config.test.mjs |
| 1270 | once-per-session guidance for big Read | GP3/hint-once-per-session | tests/hooks/dispatch.test.mjs; tests/hooks/throttle.test.mjs |
| 1266 | Pi doctor uses real Pi paths | GP11/pi-doctor-real-paths | e2e/cases/GP11-pi-agy.e2e.mjs; tests/ops/doctor-config.test.mjs |
| 1265 | route PowerShell tool + Bash nudge cadence | GP3/powershell-same-hint-as-bash | tests/policy/decide.test.mjs |
| 1264 | Pi: inject context as system role | GP2/pi-system-role-injection | e2e/cases/GP2-prompt-surface.e2e.mjs; tests/adapters/pi.test.mjs |
| 1252 | stats: don't count binary reads as saved | GP10/binary-read-zero-savings | e2e/cases/GP10-stats.e2e.mjs; tests/tools/stats.test.mjs |
| 1250 | shell exit 1 + stderr = error | GP4/exit1-stderr-is-error | e2e/cases/GP4-execute.e2e.mjs; e2e/golden/GP4/exit1-stderr-is-error.json |
| 1249 | Pi: incremental UTF-8 decode of MCP stdout | GP1/pi-utf8-incremental-decode | e2e/cases/GP1-install.e2e.mjs; tests/plugins/pi.test.mjs |
| 1246 | Pi: MCP bridge per session workspace | GP7/pi-bridge-per-session-workspace | e2e/cases/GP7-scope.e2e.mjs; tests/adapters/pi.test.mjs |
| 1241 | attribute MCP work to caller session | GP10/ctx-call-credited-to-caller-session | e2e/cases/GP10-stats.e2e.mjs |
| 1240 | antigravity Stop hook flat form | GP3/antigravity-stop-hook-flat-schema | e2e/cases/GP3-hooks.e2e.mjs; e2e/golden/GP3/antigravity-stop-hook-flat-schema.json |
| 1239 | gemini: keep sibling hooks on upgrade | GP11/keep-user-hooks-on-upgrade | tests/ops/host-config.test.mjs; tests/tools/upgrade.test.mjs |
| 1238 | fetch: nested fenced code intact | GP5/nested-fenced-code-intact | e2e/cases/GP5-index-search.e2e.mjs; e2e/golden/GP5/nested-fenced-code-intact.json |
| 1237 | executor: Rust cwd + sandbox lifecycle | GP4/project-cwd-temp-dir-cleanup | e2e/cases/GP4-execute.e2e.mjs; e2e/golden/GP4/project-cwd-temp-dir-cleanup.json |
| 1236 | stats: probe session schema read-only | GP10/stats-sibling-db-readonly | e2e/cases/GP10-stats.e2e.mjs; tests/tools/stats.test.mjs |
| 1235 | copilot-cli: keep custom hooks on upgrade | GP11/keep-user-hooks-on-upgrade | tests/ops/host-config.test.mjs; tests/tools/upgrade.test.mjs |
| 1231 | restore external MCP routing `mcp__.*` | GP3/external-mcp-tool-routing-hint | tests/policy/external-mcp-ported.test.mjs |
| 1230 | ctx_search schema declares `query` | GP5/ctx-search-schema-declares-query | e2e/cases/GP5-index-search.e2e.mjs; e2e/golden/GP5/ctx-search-schema-declares-query.json |
| 1228 | default hook timeouts | GP1/default-hook-timeouts | e2e/cases/GP1-install.e2e.mjs; e2e/golden/GP1/default-hook-timeouts.json |
| 1218 | win32 shell scripts: restore inherited PATH | GP4/windows-inherited-path | e2e/cases/GP4-execute.e2e.mjs; tests/sandbox/env.test.mjs |
| 1211 | analytics: stop re-reading every sidecar | GP9/no-periodic-stats-db-scan | e2e/cases/GP9-lifecycle.e2e.mjs; e2e/golden/GP9/no-periodic-stats-db-scan.json |
| 1209 | Windows: run extensionless shim python/node via Git Bash | GP4/windows-shim-interpreter | e2e/cases/GP4-execute.e2e.mjs; tests/sandbox/runtimes.test.mjs |
| 1207 | ctx_search accepts singular `query` | GP5/ctx-search-schema-declares-query | e2e/cases/GP5-index-search.e2e.mjs; e2e/golden/GP5/ctx-search-schema-declares-query.json |
| 1189 | curl/wget only in command position | GP3/p4-parser-coverage | tests/policy/parse.test.mjs ("P4:" cases) |
| 1183 | persist stable interpreter path, not versioned | GP1/stable-interpreter-path | e2e/cases/GP1-release-tree.e2e.mjs |
| 1182 | Pi: honor AbortSignal, Esc cancels | GP4/abort-signal-pi-cancel | e2e/cases/GP4-execute.e2e.mjs |
| 1181 | align priority contract + minPriority | GP6/priority-polarity | e2e/cases/GP6-journal-resume.e2e.mjs |
| 1180 | Pi: timestamp context-hook message | GP3/pi-injected-message-timestamp | e2e/cases/GP3-hooks.e2e.mjs; tests/adapters/pi.test.mjs |
| 1177 | batch: export NODE_OPTIONS for compound cmds | GP4/batch-node-options-compound-cmd | e2e/cases/GP4-execute.e2e.mjs; e2e/golden/GP4/batch-node-options-compound-cmd.json |
| 1176 | surrogate-safe truncation | GP4/surrogate-safe-truncation | e2e/cases/GP4-execute.e2e.mjs; e2e/cases/GP6-journal-resume.e2e.mjs |
| 1172 | fetch: concise subprocess errors | GP5/fetch-error-one-line | e2e/cases/GP5-index-search.e2e.mjs; e2e/golden/GP5/fetch-error-one-line-cause.json |
| 1171 | OpenCode 2 plugin API (V1/V2 dual export) | GP1/opencode2-plugin-dual-export | e2e/cases/GP1-install.e2e.mjs; tests/plugins/opencode.test.mjs |
| 1167 | Windows: in-process runtime probes, no `where` | GP9/no-process-spawn-at-boot | e2e/cases/GP9-lifecycle.e2e.mjs |
| 1160 | opencode: merge sibling plugin arrays | GP11/opencode-merge-sibling-plugins | tests/ops/host-config.test.mjs; tests/ops/host-write.test.mjs |
| 1154 | Windows: windowsHide on probes | GP4/windows-hide-console-on-spawn | e2e/cases/GP4-execute.e2e.mjs; tests/sandbox/runtimes.test.mjs |
| 1153 | Codex: read effective hooks feature | GP11/codex-effective-hooks-state | tests/tools/doctor.test.mjs; tests/ops/doctor-config.test.mjs |
| 1147 | bound ctx_execute on Pi | GP4/default-timeout-every-host | e2e/cases/GP4-execute.e2e.mjs; tests/adapters/opencode.test.mjs |
| 1144 | ctx-debug: redact env blocks + secret keys | GP11/redact-secrets-in-debug-report | tests/ops/report.test.mjs |
| 1143 | cleanup TTL off last activity | GP8/v22-project-cleanup | e2e/cases/GP8-concurrency.e2e.mjs; tests/store/cleanup.test.mjs |
| 1138 | HTML tables without rows | GP5/rowless-tables | e2e/cases/GP5-index-search.e2e.mjs; e2e/golden/GP5/rowless-tables-survive.json |
| 1128 | curl/wget pipe + multiline bounds | GP3/p4-parser-coverage | tests/policy/parse.test.mjs ("P4:" cases) |
| 1124 | route network cmds by transfer output | GP3/p4-parser-coverage | tests/policy/parse.test.mjs ("P4:" cases) |
| 1121 | pi: stream ctx_execute progress + stderr exit classify | GP4/exit1-stderr-is-error | e2e/cases/GP4-execute.e2e.mjs; e2e/golden/GP4/exit1-stderr-is-error.json |
| 1111 | stats: stop heartbeat lifetime scans | GP9/no-periodic-stats-db-scan | e2e/cases/GP9-lifecycle.e2e.mjs; e2e/golden/GP9/no-periodic-stats-db-scan.json |
| 1104 | codex: Code Mode `exec` in PreToolUse matcher | GP3/codex-exec-pretooluse-matcher | e2e/cases/GP3-hooks.e2e.mjs; e2e/golden/GP3/codex-exec-pretooluse-matcher.json |
| 1093 | pi: Esc interrupt for ctx_* calls | GP4/abort-signal-pi-cancel | e2e/cases/GP4-execute.e2e.mjs |
| 1091 | search: guard FTS5 highlight on big rows (#878) | GP5/fts-highlight-bytecap | e2e/cases/GP5-index-search.e2e.mjs; e2e/golden/GP5/fts-highlight-bytecap.json |
| 1087 | security: `//` and `~/` anchors in permission patterns (#1075) | GP3/v17-read-glob-deny | tests/policy/user-deny.test.mjs |
| 1086 | routing: scan quotes left to right | GP3/p4-parser-coverage | tests/policy/parse.test.mjs ("P4:" cases) |
| 1073 | Kiro hooks 1.0 v1 schema | GP1/kiro-hooks-v1-schema | e2e/cases/GP1-install.e2e.mjs; e2e/golden/GP1/kiro-hooks-v1-schema.json |
| 1043 | precompact: platform ctx_search name | GP6/hint-names-platform-tool | tests/hooks/dispatch.test.mjs |
| 1042 | stats: net returned bytes in reduction_pct | GP10/reduction-pct-net-bytes | e2e/cases/GP10-stats.e2e.mjs; tests/tools/stats.test.mjs |
| 1035 | pi: detect npm-managed install | GP11/pi-detect-npm-managed-install | e2e/cases/GP11-doctor-upgrade.e2e.mjs; tests/ops/detect-v1.test.mjs |
| 1033 | VS Code Remote-WSL project root | GP7/vscode-remote-wsl-project-root | e2e/cases/GP7-scope.e2e.mjs; e2e/golden/GP7/vscode-remote-wsl-project-root.json |
| 1019 | security: honor Pi project permissions | GP3/pi-project-permissions-honored | e2e/cases/GP3-hooks.e2e.mjs; tests/adapters/pi.test.mjs |
| 1009 | executor: kill abandoned trees on cancel | GP4/cancel-kills-child-tree | e2e/cases/GP4-execute.e2e.mjs; e2e/golden/GP4/cancel-kills-child-tree-1s.json |
| 1002 | pi: context at system boundary | GP2/pi-system-role-injection | e2e/cases/GP2-prompt-surface.e2e.mjs; tests/adapters/pi.test.mjs |
| 995 | Windows vitest EPERM hang | GP9/windows-ci-no-hang | e2e/cases/GP1-install.e2e.mjs; e2e/cases/GP9-lifecycle.e2e.mjs |
| 991 | auto-index 5-100 KB exec output | GP5/auto-index-exec-output | e2e/cases/GP5-index-search.e2e.mjs; e2e/golden/GP5/auto-index-exec-output.json |
| 987 | Windows parent death via PID probe (#982) | GP9/windows-parent-pid-probe | e2e/cases/GP9-lifecycle.e2e.mjs |
| 980 | batch: indexed byte/chunk budgets | GP5/batch-ingestion-byte-caps | e2e/cases/GP5-index-search.e2e.mjs; e2e/golden/GP5/batch-ingestion-byte-caps.json |
| 975 | background=true w/o timeout hangs | GP4/background-no-timeout-hang | e2e/cases/GP4-execute.e2e.mjs; e2e/golden/GP4/background-no-timeout-hang.json |
| 974 | start.mjs: remove chdir | GP9/no-chdir | e2e/cases/GP9-lifecycle.e2e.mjs; e2e/golden/GP9/no-chdir-server-cwd-stable.json |
| 970 | sessions/ 14-day retention | GP8/v22-project-cleanup | e2e/cases/GP8-concurrency.e2e.mjs; tests/store/cleanup.test.mjs |
| 969 | re-create fs-preload temp file | GP4/recreate-preload-temp-file | e2e/cases/GP4-execute.e2e.mjs; e2e/golden/GP4/recreate-preload-temp-file.json |
| 963 | bound FTS hydration for big rows | GP5/fts-highlight-bytecap | e2e/cases/GP5-index-search.e2e.mjs; e2e/golden/GP5/fts-highlight-bytecap.json |
| 952 | stats: count only real savings | GP10/real-savings-only | tests/tools/stats.test.mjs |
| 945 | WebFetch allow claude.ai artifacts | GP3/webfetch-allow-claude-ai-artifacts | tests/policy/decide.test.mjs |
| 934 | batch NODE_OPTIONS as statement | GP4/batch-node-options-compound-cmd | e2e/cases/GP4-execute.e2e.mjs; e2e/golden/GP4/batch-node-options-compound-cmd.json |
| 932 | runPool capped flag | GP4/runpool-capped-flag | e2e/cases/GP8-concurrency.e2e.mjs; e2e/golden/GP8/runpool-capped-flag.json |
| 924 | restore CWD in start.mjs | GP9/no-chdir | e2e/cases/GP9-lifecycle.e2e.mjs; e2e/golden/GP9/no-chdir-server-cwd-stable.json |
| 921 | dedupe chunks across queries | GP5/dedupe-chunks-across-queries | e2e/cases/GP5-index-search.e2e.mjs; e2e/golden/GP5/dedupe-chunks-across-queries.json |
| 913 | standalone mcp__context-mode__ prefix | GP1/standalone-mcp-tool-prefix | e2e/cases/GP1-install.e2e.mjs; e2e/golden/GP1/standalone-mcp-tool-prefix.json |
| 910 | codex omit empty additionalContext | GP3/no-empty-fields | tests/hooks/dispatch.test.mjs |
| 907 | SessionStart surrogate-safe truncation | GP6/sessionstart-surrogate-safe-truncation | e2e/cases/GP6-journal-resume.e2e.mjs |
| 906 | codex config pin platform env | GP1/codex-platform-env | e2e/cases/GP1-install.e2e.mjs; e2e/golden/GP1/codex-platform-env.json |
| 904 | Pi abort signal propagation | GP4/abort-signal-pi-cancel | e2e/cases/GP4-execute.e2e.mjs |
| 899 | no false shell error capture | GP6/no-false-shell-error-capture | tests/hooks/dispatch.test.mjs |
| 898 | cap oversized markdown chunks | GP5/chunk-size-cap | e2e/cases/GP5-index-search.e2e.mjs; e2e/golden/GP5/chunk-size-cap.json |
| 897 | Claude Code PowerShell hooks (Win) | GP3/powershell-same-hint-as-bash | tests/policy/decide.test.mjs |
| 864 | Pi hidden context injection | GP2/pi-system-role-injection | e2e/cases/GP2-prompt-surface.e2e.mjs; tests/adapters/pi.test.mjs |

### resolved-untested (110)

| # | Title | v2 change or reason | Evidence |
|---|---|---|---|
| 1280 | turndown missing, silent bg install fails | REMOVED:D2 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1274 | OpenCode resume snapshot injected into other session | REMOVED:D9 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1269 | curl detector aborts whole compound command | REMOVED:ADR-0008 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1267 | Read tip re-injected every Read >50 KB (`??` fallback) | REMOVED:D11 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1259 | intent classifier replayed as live directive on Pi | REMOVED:D9 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1255 | opencode missing from clientInfo map, wrong store | REMOVED:D3 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1254 | ctx_stats skips OpenCode (v1 layout only) | REMOVED:D3 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1251 | ensure-deps npm retry storm, console windows | REMOVED:D2 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1242 | ctx-debug.sh fails under POSIX sh | REMOVED:D2 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1221 | OMP hard-blocks curl in quotes/grep | REMOVED:ADR-0008 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1215 | project-scope plugin enabled globally by heal | REMOVED:D2 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1214 | server takes every project's events.md | REMOVED:D8 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1205 | Pi bridge on Bun spins, disk I/O error | REMOVED:D2 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1198 | ctx_* events credited to latest session | REMOVED:D8 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1196 | ensure-deps re-codesigns .node every hook | REMOVED:D2 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1193 | Bun seed writes ABI-mismatched cache | REMOVED:D2 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1191 | healScript version filter unanchored | REMOVED:D2 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1188 | ensure-deps dlopen then rebuild, SIGSEGV | REMOVED:D2 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1184 | fetch via Firecrawl API | REMOVED:D15 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1078 | cache-heal gates on wrong plugin key | REMOVED:D2 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1096 | healScript statSync ELOOP | REMOVED:D2 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1099 | OMP deny points to ctx_execute that is not registered | REMOVED:ADR-0008 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1105 | better-sqlite3 ABI rebuild loop | REMOVED:D2 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1106 | curl regex matches `which curl` | REMOVED:ADR-0008 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1125 | curl pipe to head still redirected, block dropped | REMOVED:ADR-0008 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1130 | CLAUDE.md says blocked, code does not block | REMOVED:D11 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1131 | CLAUDE.md continuity contradicts routing block | REMOVED:D11 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1134 | Codex auto-review rejects echo rewrite | REMOVED:ADR-0008 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1139 | Windows npm install better-sqlite3 crashes | REMOVED:D2 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1140 | cleanupOldSessions evicts active sessions | REMOVED:D6 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1156 | eviction deletes critical events first | REMOVED:D8 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1173 | infinite compaction loop burns quota | REMOVED:D9 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1174 | start.mjs background npm install dies silently | REMOVED:D2 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1055 | isMCPReady counts sibling sessions → WebFetch denied | REMOVED:ADR-0008 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1053 | isMCPReady swallows redirects in OpenCode embedded mode | REMOVED:ADR-0008 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1049 | cache-heal re-injects duplicate absolute-path hook | REMOVED:D2 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1028 | PreCompact snapshot uses bare ctx_search | REMOVED:D9 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1024 | Stale DB cleanup deletes live idle sessions (WAL mtime) | REMOVED:D6 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1022 | Resume snapshot ignores maxBytes (196 KB) | REMOVED:D9 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1021 | README says Pi hooks High not Full | REMOVED:D16 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1006 | WebFetch deny breaks claude.ai artifact URLs | REMOVED:ADR-0008 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1005 | ctx upgrade writes old-version paths (bun) | REMOVED:D2 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1004 | buildRulesSection inlines AGENTS.md into resume | REMOVED:D9 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 992 | Bun SQLITE_IOERR wedge; doctor green | REMOVED:D2 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 985 | Multi-session contention on shared DB, busy-wait | REMOVED:D3 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 979 | Headless CC still denied (dead formatter) | REMOVED:D7 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 967 | Injected <context_window_protection> trips auto-mode classifier | REMOVED:D11 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 964 | Env knob to disable SessionStart routing block | REMOVED:D11 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 956 | prebuild-install deprecated warning | REMOVED:D2 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 949 | sessions/ has no retention | REMOVED:D6 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 946 | Agent-prompt injection blocked by auto-mode classifier | REMOVED:ADR-0008 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 941 | Codex guidance: JS default, not only | REMOVED:D11 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 940 | OS-specific Codex guidance overlay | REMOVED:D11 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 938 | WebFetch redirect breaks claude.ai artifact URLs | REMOVED:ADR-0008 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 911 | session_continuity framing trips auto-mode classifier | REMOVED:D9 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 908 | Configurable redirect exclusions per domain | REMOVED:ADR-0008 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 905 | Pi bridge Bun SQLITE_IOERR | REMOVED:D2 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 902 | Resume snapshot stale, priority eviction | REMOVED:D8 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 894 | Statusline stuck, build/ missing | REMOVED:D17 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 880 | cleanupStaleContentDBs race poisons store (Pi) | REMOVED:D3 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 873 | omp install does not copy SYSTEM.md | REMOVED:D11 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 865 | ctx_stats ignores $CLAUDE_CONFIG_DIR | REMOVED:D3 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1293 | unlink dangling cache breadcrumbs | REMOVED:D2 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1290 | session-db bundle off PreToolUse path | REMOVED:D8 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1281 | report missing fetch deps / failed bg installs | REMOVED:D2 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1278 | bound dep-install retries, hide Win consoles | REMOVED:D2 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1272 | subagent routing via SubagentStart | REMOVED:D11 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1256 | MCP readiness per Claude session | REMOVED:D8 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1253 | ensure-deps skip cache swap | REMOVED:D2 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1245 | refresh express-rate-limit (ip-address CVE) | REMOVED:D2 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1234 | codex: rollout timestamp over mtime (Windows) | REMOVED:D4 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1229 | scope session-event indexing to project | REMOVED:D8 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1227 | OMP: allow quoted HTTP refs, silent downloads | REMOVED:ADR-0008 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1224 | ensure-deps backoff after failed install | REMOVED:D2 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1220 | heal: keep project-scope installs out of user settings | REMOVED:D2 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1216 | cache-heal version filter anchor | REMOVED:D2 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1197 | reject unusable Bun shims | REMOVED:D2 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1194 | OpenCode v2 dual support + non-LLM compaction | REMOVED:D9 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1170 | Pi: keep context across tool-loop requests | REMOVED:D11 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1166 | Pi bridge: spawnable runtime on Windows | REMOVED:D2 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1161 | OpenCode/Kilo native ctx_* names | REMOVED:D11 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1158 | evict least-important events first | REMOVED:D8 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1148 | bundle statusline analytics import | REMOVED:D17 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1137 | docs: session continuity wording | REMOVED:D11 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1129 | pin ABI healing to running Node | REMOVED:D2 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1126 | Pi: remove unverified routing anchor | REMOVED:D11 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1123 | enforce resume snapshot budget | REMOVED:D9 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1122 | Pi: routing anchor once per session | REMOVED:D11 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1118 | db-base: SQL comments split exec | REMOVED:D2 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1116 | omp: resume snapshot after compact | REMOVED:D9 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1113 | detect: wait MCP initialize | REMOVED:ADR-0008 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1089 | derive plugin registry key for heal | REMOVED:D2 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1066 | omp: route broad calls, cap results 16 KiB | REMOVED:ADR-0008 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1034 | self-identify subagent routing block | REMOVED:D11 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 1030 | retry transient SQLITE_IOERR | REMOVED:D3 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 996 | session_state label "compaction" | REMOVED:D9 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 988 | opportunistic PASSIVE WAL checkpoint | REMOVED:D3 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 986 | Atomics.wait instead of busy-wait | REMOVED:D2 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 973 | find bun on $PATH | REMOVED:D2 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 958 | extract cache-heal script | REMOVED:D2 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 955 | codex Windows guidance overlay | REMOVED:D11 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 948 | codex AGENTS.md JS default | REMOVED:D11 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 931 | statusline import failure msg | REMOVED:D17 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 929 | packaging guard helper scripts | REMOVED:D2 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 927 | WebFetch deny → advisory | REMOVED:ADR-0008 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 918 | routing block injection framing | REMOVED:D11 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 876 | OMP seed APPEND_SYSTEM.md | REMOVED:D11 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 871 | withRetry heal on SQLITE_CORRUPT | REMOVED:D3 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 866 | honor CLAUDE_CONFIG_DIR in stats | REMOVED:D3 (code path removed) | build/check-removed.mjs clean; no per-row test |
| 863 | Windows better-sqlite3 install via node | REMOVED:D2 (code path removed) | build/check-removed.mjs clean; no per-row test |

### partly (7)

| # | Title | v2 change or reason | Evidence |
|---|---|---|---|
| 1285 | Cursor Windows PATH docs | N/A:docs | docs/install/*.md exist; no per-row check |
| 1283 | Gaia badge in README | N/A:docs | docs/install/*.md exist; no per-row check |
| 1056 | db: no cross-process TRUNCATE checkpoint / mmap | GP8/verify-single-db | e2e/cases/GP8-concurrency.e2e.mjs sibling-db-readonly covers read-only opens; no test for checkpoint or mmap |
| 930 | marketing skill REST query | N/A:docs | docs/install/*.md exist; no per-row check |
| 928 | avoid gh projectCards query | N/A:docs | docs/install/*.md exist; no per-row check |
| 892 | README typo | N/A:docs | docs/install/*.md exist; no per-row check |
| 884 | docs sync adapters v1.0.167 | N/A:docs | docs/install/*.md exist; no per-row check |

### not resolved (27)

| # | Title | v2 change or reason | Evidence |
|---|---|---|---|
| 1258 | DeepSeek Harness support | N/A:open-question | no decision recorded in tickets/v2-issue-map.md |
| 1204 | index-time preview + ctx_page tool | N/A:open-question | no decision recorded in tickets/v2-issue-map.md |
| 1079 | cleanupStaleSources(14) drops unchanged sources by age | N/A:open-question | no decision recorded in tickets/v2-issue-map.md |
| 1162 | start-http.mjs lacks turndown install (systemd) | N/A:open-question | no decision recorded in tickets/v2-issue-map.md |
| 1048 | Plan mode blocks ctx_batch_execute | N/A:open-question | no decision recorded in tickets/v2-issue-map.md |
| 993 | Windows hook commands fail under PowerShell | N/A:open-question | no decision recorded in tickets/v2-issue-map.md |
| 962 | RFC: bound trigram/vocab growth for logs/JSONL | N/A:open-question | no decision recorded in tickets/v2-issue-map.md |
| 944 | Codex external-file check reads wrong settings | N/A:open-question | no decision recorded in tickets/v2-issue-map.md |
| 914 | index --source bare label vs indexDirectory | N/A:open-question | no decision recorded in tickets/v2-issue-map.md |
| 901 | upgrade updates one tree, doctor reads other (Win) | N/A:open-question | no decision recorded in tickets/v2-issue-map.md |
| 874 | OMP tool_result never replaces output | N/A:open-question | no decision recorded in tickets/v2-issue-map.md |
| 867 | Self-heal only at open-time, mid-session corrupt | N/A:open-question | no decision recorded in tickets/v2-issue-map.md |
| 1287 | stats: say why adapter Skipped | N/A:deferred-not-decided | no decision recorded in tickets/v2-issue-map.md |
| 1275 | batch: query pointers instead of repeated excerpts | N/A:tool-design-not-decided | no decision recorded in tickets/v2-issue-map.md |
| 1247 | re-exec scripts under bash for sh callers | N/A:not-decided | no decision recorded in tickets/v2-issue-map.md |
| 1165 | Codex: honor sandbox state for file reads | N/A:not-decided | no decision recorded in tickets/v2-issue-map.md |
| 1127 | configurable echo budgets | N/A:not-decided | no decision recorded in tickets/v2-issue-map.md |
| 1097 | CONTEXT_MODE_MAX_LIMIT env | N/A:rejected-not-decided | no decision recorded in tickets/v2-issue-map.md |
| 1082 | `timeout` -> `timeoutMs` | N/A:not-decided | no decision recorded in tickets/v2-issue-map.md |
| 1076 | CONTEXT_MODE_TOOLS allow-list | N/A:not-decided | no decision recorded in tickets/v2-issue-map.md |
| 1041 | opt-in proxy for ctx_fetch_and_index | N/A:not-decided | no decision recorded in tickets/v2-issue-map.md |
| 1040 | opencode cost as deltas | N/A:not-decided | no decision recorded in tickets/v2-issue-map.md |
| 1001 | MiniMax pricing rows | N/A:not-decided | no decision recorded in tickets/v2-issue-map.md |
| 939 | ctx_forget tool | N/A:not-decided | no decision recorded in tickets/v2-issue-map.md |
| 922 | trim batch footer | N/A:not-decided | no decision recorded in tickets/v2-issue-map.md |
| 920 | throttle message numbers | N/A:not-decided | no decision recorded in tickets/v2-issue-map.md |
| 877 | OMP replace large results w/ refs | N/A:not-decided | no decision recorded in tickets/v2-issue-map.md |

### out of scope (36)

| # | Title | v2 change or reason | Evidence |
|---|---|---|---|
| 1268 | Native ZCode adapter | N/A:deferred-post-v2.0 | reason in map: deferred-post-v2.0 |
| 1192 | integrate with pi-blackhole | N/A:deferred-post-v2.0 | reason in map: deferred-post-v2.0 |
| 1187 | OpenCode V2 support | N/A:duplicate-of-#1199 | duplicate; follows the parent row |
| 1083 | Codex agent greps ~/.codex and ingests own history | N/A:deferred-post-v2.0 | reason in map: deferred-post-v2.0 |
| 1088 | Show input/progress live for ctx_execute | N/A:deferred-post-v2.0 | reason in map: deferred-post-v2.0 |
| 1101 | same as 1100 | N/A:duplicate-of-#1100 | duplicate; follows the parent row |
| 1065 | Hosted Insights D1 SQL vars / owner team | N/A:rejected | reason in map: rejected |
| 1063 | "Is the project abandoned?" | N/A:not-a-bug | reason in map: not-a-bug |
| 1050 | Pi single-row collapsed rendering | N/A:deferred-post-v2.0 | reason in map: deferred-post-v2.0 |
| 1046 | LongHorizon-Harness integration | N/A:rejected | reason in map: rejected |
| 1045 | neuforge-pay token metering | N/A:rejected | reason in map: rejected |
| 1016 | Clean uninstall command | N/A:deferred-v2.0-scope | reason in map: deferred-v2.0-scope |
| 1014 | No way to count docs per source; doctor PASS on empty index | N/A:deferred-v2.0-scope | reason in map: deferred-v2.0-scope |
| 984 | WebFetch no exemption for artifact URLs | N/A:duplicate-of-#1006 | duplicate; follows the parent row |
| 919 | Support CommandCode CLI | N/A:deferred-post-v2.0 | reason in map: deferred-post-v2.0 |
| 891 | Emacs Lisp runtime | N/A:deferred-post-v2.0 | reason in map: deferred-post-v2.0 |
| 45 | Beta testers wanted | N/A:not-a-bug | reason in map: not-a-bug |
| 1284 | native Qoder plugin | N/A:new-adapter-out-of-scope | reason in map: new-adapter-out-of-scope |
| 1244 | website URL in codex plugin.json | N/A:trivial-metadata | reason in map: trivial-metadata |
| 1243 | ctx-debug.sh re-exec under bash | N/A:duplicate-of-1247 | duplicate; follows the parent row |
| 1178 | agy PreInvocation capture decisions | N/A:deferred-rebuild-on-journal | reason in map: deferred-rebuild-on-journal |
| 1164 | Pi: AbortSignal kill bridge tree | N/A:duplicate-of-1182 | duplicate; follows the parent row |
| 1155 | redact secrets from debug report | N/A:duplicate-of-1144 | duplicate; follows the parent row |
| 1149 | Pi: timestamp injected context | N/A:duplicate-of-1180 | duplicate; follows the parent row |
| 1095 | pi: strip echo preamble in collapsed render | N/A:pi-client-ui-cosmetic | reason in map: pi-client-ui-cosmetic |
| 1092 | pi: live call preview + result tail | N/A:ui-polish-deferred | reason in map: ui-polish-deferred |
| 1084 | codex: redirect broad home searches | N/A:rejected-design | reason in map: rejected-design |
| 1044 | Mistral Vibe adapter | N/A:new-adapter-out-of-scope | reason in map: new-adapter-out-of-scope |
| 1029 | pi: MCP cancel to executor | N/A:duplicate-of-1093 | duplicate; follows the parent row |
| 1010 | Hermes Agent support | N/A:new-adapter-out-of-scope | reason in map: new-adapter-out-of-scope |
| 972 | test: no hardcoded /bin/bash | N/A:ci-test-harness-contract | reason in map: ci-test-harness-contract |
| 971 | codex: omit empty hook context | N/A:duplicate-of-910 | duplicate; follows the parent row |
| 968 | default exec timeout env | N/A:design-rejected-v1-406-kept | reason in map: design-rejected-v1-406-kept |
| 957 | Devin CLI adapter | N/A:new-adapter-out-of-scope | reason in map: new-adapter-out-of-scope |
| 935 | opencode /ctx TUI command | N/A:defer-reject | reason in map: defer-reject |
| 888 | MCP singleton concurrency | N/A:stale-empty-issue | reason in map: stale-empty-issue |
