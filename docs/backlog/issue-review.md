# Registro de issues de `mksglu/context-mode`

Estado de los 163 issues abiertos al 2026-10-04, clasificados y
cruzados con las PRs que este fork ya adoptó.

- `RESUELTO-AQUI` — corregido directamente en `fix/backlog-takeover`, con el commit.
- `CUBIERTO-POR-PR` — la issue tiene una PR de las 34 adoptadas aquí.
- `RUIDO` — duplicado, pregunta o promoción; no se corrige con código.
- `PENDIENTE` — requiere trabajo.

## Resumen

- **CUBIERTO-POR-PR**: 29 — la issue tiene una PR de las 34 adoptadas aquí.
- **RESUELTO-AQUI**: 25 — corregido directamente en `fix/backlog-takeover`, con el commit.
- **RUIDO**: 3 — duplicado, pregunta o promoción; no se corrige con código.
- **PENDIENTE**: 106 — requiere trabajo.

## Pendientes por subsistema

- adaptadores: 35
- linux: 16
- core/otros: 13
- sesion: 13
- windows: 7
- executor: 6
- store: 6
- empaquetado: 4
- hooks/seguridad: 3
- stats: 2
- macos: 1

## Detalle

| # | subsistema | tipo | com. | estado | nota | título |
|---|---|---|---|---|---|---|
| 873 | adaptadores | bug | 2 | PENDIENTE |  | [BUG] omp plugin install does not copy SYSTEM.md routing instructions |
| 878 | adaptadores | bug | 2 | PENDIENTE |  | #chunkMarkdown allows oversized single paragraphs, bypassing MAX_CHUNK_BYTES |
| 880 | adaptadores | bug | 2 | RESUELTO-AQUI | fix(store)idem (0cd77b6) | [Bug]: cleanupStaleContentDBs race with parallel Pi MCP servers poisons ContentStore singleton (permanent disk |
| 890 | adaptadores | bug | 0 | PENDIENTE |  | omp plugin install fails: `with { type: "json" }` import in pricing.js breaks oh-my-pi extension validator (7  |
| 902 | adaptadores | bug | 0 | RESUELTO-AQUI | fix(session) eviccion invertida (4e4acc0) | Resume/PreCompact snapshot serves stale data on long sessions -- priority-based eviction deletes newer events  |
| 905 | adaptadores | bug | 0 | CUBIERTO-POR-PR |  | Pi bridge Bun/bun:sqlite same-turn ctx_index -> ctx_search fails with SQLITE_IOERR |
| 908 | adaptadores | feature | 1 | PENDIENTE |  | [Feature]: Configurable redirect exclusions (per-domain fetch passthrough, e.g. claude.ai) |
| 911 | adaptadores | bug | 6 | PENDIENTE |  | Injected session_continuity/priority_instructions framing trips Claude Code's auto-mode classifier (Auto-Mode  |
| 925 | adaptadores | bug | 0 | PENDIENTE |  | Shell execution wrapper breaks commands that start with compound shell syntax |
| 936 | adaptadores | bug | 1 | CUBIERTO-POR-PR |  | Claude Code stdio ctx_execute can hang indefinitely without server-side timeout |
| 938 | adaptadores | bug | 1 | RESUELTO-AQUI | fix(routing) claude.ai artifact (d05b6cd) | WebFetch PreToolUse redirect has no exception for claude.ai/code/artifact URLs — ctx_fetch_and_index only ever |
| 940 | adaptadores | feature | 0 | PENDIENTE |  | Feature: move OS-specific Codex guidance into an installer-managed OS overlay |
| 941 | adaptadores | bug | 0 | PENDIENTE |  | Make JavaScript the default, not the only ctx_execute language in Codex guidance |
| 944 | adaptadores | bug | 0 | PENDIENTE |  | [Bug]: Codex external-file check uses ~/.codex/settings.json instead of effective permission profile |
| 946 | adaptadores | bug | 3 | PENDIENTE |  | Agent-prompt injection gets third-party plugins' subagent dispatches blocked by Claude Code's auto-mode classi |
| 947 | adaptadores | bug | 5 | PENDIENTE |  | [Bug]: ctx_batch_execute timeout does not bound indexing/search, so Claude Code agents can hang for hours |
| 979 | adaptadores | bug | 0 | RESUELTO-AQUI | fix(hooks) gate headless en el modulo vivo (af8ad84) | Claude Code headless mode still denied by active PreToolUse formatter |
| 983 | adaptadores | bug | 0 | PENDIENTE |  | [Bug]: Pi reload leaks foreground MCP helper after sub-context starts |
| 984 | adaptadores | bug | 1 | PENDIENTE |  | WebFetch redirect has no exemption for claude.ai/code/artifact URLs, breaks artifact fetches |
| 1006 | adaptadores | bug | 1 | PENDIENTE |  | WebFetch deny is unconditional: claude.ai artifact URLs are unreachable via the suggested ctx_* replacements ( |
| 1017 | adaptadores | bug | 1 | PENDIENTE |  | [Bug]: Copilot CLI resolves ctx_execute_file project root to plugin install |
| 1018 | adaptadores | bug | 0 | PENDIENTE |  | [Bug]: claude-code tool naming assumes the plugin install, so standalone-MCP sessions get routing guidance nam |
| 1021 | adaptadores | docs | 0 | RESUELTO-AQUI | docs(readme) Pi es Full no High (f49c16d) | README table is wrong about Pi's hook support - it's actually Full, not High |
| 1023 | adaptadores | bug | 1 | PENDIENTE |  | [Bug]: Analytics "ran Nx longer before /compact" metric is a byte ratio presented as time |
| 1028 | adaptadores | bug | 1 | CUBIERTO-POR-PR |  | PreCompact resume snapshot uses bare `ctx_search`, not the platform tool name |
| 1031 | adaptadores | feature | 0 | RESUELTO-AQUI | fix(session) filtro de prioridad invertido (8875f28) | [Feature]: ctx_* tool descriptions are ~80% steering prose — ~6.2K tokens of tool definitions per call on Pi |
| 1046 | adaptadores | bug | 0 | RUIDO |  | Possible complementary direction: LongHorizon-Harness for sustained agent tasks |
| 1047 | adaptadores | feature | 0 | PENDIENTE |  | [Feature]: Make execution echoes configurable and support compact invocation summaries |
| 1048 | adaptadores | bug | 2 | PENDIENTE |  | Claude Code plan mode blocks ctx_batch_execute: no read-only gather path since the #851 annotations |
| 1050 | adaptadores | feature | 2 | PENDIENTE |  | Feature: zero-gap single-row collapsed rendering for Pi tools |
| 1052 | adaptadores | bug | 0 | CUBIERTO-POR-PR |  | [Bug]: OpenCode webfetch alias missing - TOOL_ALIASES maps "fetch" but opencode tool is "webfetch" |
| 1053 | adaptadores | bug | 1 | PENDIENTE |  | [Bug]: isMCPReady() gate swallows all redirects in plugin-only embedded mode (OpenCode) |
| 1078 | adaptadores | bug | 0 | RESUELTO-AQUI | fix(db) erratas | [Bug]: cache-heal gates on "context-mode@context-mode" but the registry key is "context-mode@claude-context-mo |
| 1083 | adaptadores | feature | 1 | PENDIENTE |  | [Feature]: Codex root-context hygiene for recursive home searches and routing escapes |
| 1088 | adaptadores | feature | 1 | PENDIENTE |  | [Feature]: show tool input in `pi` with `Tool output: expanded` |
| 1098 | adaptadores | bug | 0 | PENDIENTE |  | [Bug]: Pi bridge failures after initialize are sticky for the extension lifetime |
| 1099 | adaptadores | bug | 0 | PENDIENTE |  | OMP: denial redirects to ctx_execute when no context-mode device is registered |
| 1107 | adaptadores | bug | 1 | PENDIENTE |  | guidanceOnce throttle keyed on process.ppid never throttles under Claude Code (tip re-injected on every call) |
| 1117 | adaptadores | bug | 0 | PENDIENTE |  | NODE_OPTIONS command prefix breaks bash compound commands (for, while, if) |
| 1130 | adaptadores | bug | 0 | PENDIENTE |  | configs/claude-code/CLAUDE.md says curl/wget/WebFetch are blocked, but v1.0.169 only denies on security policy |
| 1131 | adaptadores | bug | 0 | RESUELTO-AQUI | docs(claude-code) directivas capturadas no atan (efa5297) | Session Continuity in configs/claude-code/CLAUDE.md contradicts the routing block injected by hooks/routing-bl |
| 1134 | adaptadores | bug | 0 | CUBIERTO-POR-PR |  | [Bug]: Codex auto-review rejects curl/wget echo redirect as untrusted instruction drift |
| 1142 | adaptadores | bug | 1 | RESUELTO-AQUI | fix(hooks) allow pairing en modify (af8ad84) | [Bug]: Claude Code cwd rewrite on ctx_execute defeats the permissions allowlist — every shell call prompts |
| 1152 | adaptadores | bug | 0 | RESUELTO-AQUI | fix(codex) hooks efectivos (6bb2836) | [Bug]: Doctor reports hooks disabled when Codex enables them by default |
| 1173 | adaptadores | bug | 2 | RESUELTO-AQUI | fix(session) restaurar post-compactacion acotado (e5b75d4) | [Bug]:  v1.0.169 can enter an infinite compaction loop and exhaust Claude Code token quota |
| 1179 | adaptadores | bug | 0 | RESUELTO-AQUI | fix(pi) timestamp en el mensaje inyectado (391b235) | [Bug]: Pi context hook pushes a message without timestamp, Radius provider rejects with 400 |
| 1187 | adaptadores | feature | 3 | PENDIENTE |  | [Feature]: Opencode V2 support |
| 1192 | adaptadores | feature | 0 | PENDIENTE |  | [Feature]: integrate with pi-blackhole |
| 1205 | adaptadores | bug | 2 | PENDIENTE |  | [Bug]: Pi bridge on Bun spins on unfinalized statements — ~150k/day "invalid database connection pointer" per  |
| 1206 | adaptadores | bug | 0 | CUBIERTO-POR-PR |  | [Bug]: Antigravity CLI (agy) rejects the plugin hooks.json — Stop is declared grouped, agy expects a flat hand |
| 1215 | adaptadores | bug | 0 | PENDIENTE |  | [Bug]: A project-scope Claude plugin install enables context-mode globally (start.mjs writes enabledPlugins an |
| 1219 | adaptadores | bug | 0 | PENDIENTE |  | Cannot find a documented way to install context-mode in Codex Desktop |
| 1222 | adaptadores | bug | 0 | CUBIERTO-POR-PR |  | Claude Code: bare `mcp__` hook matchers match nothing since CC v2.1.195 (exact-match semantics) |
| 1255 | adaptadores | bug | 0 | PENDIENTE |  | [Bug]: "opencode" missing from the MCP clientInfo map and probed 14th of 15 — platform detection silently reso |
| 1258 | adaptadores | feature | 0 | PENDIENTE |  | [Feature]: Please release a version compatible with DeepSeekHarness as soon as possible. |
| 45 | core/otros | bug | 100 | PENDIENTE |  | Beta testers wanted — 15 platforms × 3 operating systems |
| 915 | core/otros | bug | 0 | PENDIENTE |  | runPool: `capped` is true when jobs.length < concurrency (not a real cap) |
| 919 | core/otros | feature | 0 | PENDIENTE |  | [Feature]: Support for CommandCode CLI |
| 960 | core/otros | bug | 0 | PENDIENTE |  | PreToolUse `mcp__` matcher routes observe-only MCP tools — add per-tool exclusion |
| 962 | core/otros | bug | 1 | PENDIENTE |  | RFC: bound trigram and vocabulary growth for logs, JSONL, and high-entropy sources |
| 999 | core/otros | bug | 1 | PENDIENTE |  | MCP sidecar (start.mjs) CPU busy-loop — 23 concurrent instances at 284%+ CPU contributed to host system crash |
| 1037 | core/otros | bug | 0 | RESUELTO-AQUI | feat(routing) opt-out CONTEXT_MODE_ALLOW_WEBFETCH (9e3c8b4) | PreToolUse routing denies WebFetch/curl for subagents that cannot reach the MCP server |
| 1045 | core/otros | feature | 0 | RUIDO |  | Feature Suggestion: Optional token metering & paid API key support via `neuforge-pay` |
| 1063 | core/otros | feature | 2 | PENDIENTE |  | [Feature]: 请问这个项目不迭代了吗？是出什么事情了吗 |
| 1065 | core/otros | bug | 0 | RUIDO |  | Insights: D1 too-many-SQL-variables on team/org + owner cannot be assigned to a team |
| 1068 | core/otros | bug | 0 | PENDIENTE |  | The cm-fs preload writes its marker to child stderr, and grandchildren inherit it into test assertions |
| 1077 | core/otros | bug | 1 | PENDIENTE |  | [Bug]: Your tool itself offsets token saved by it because of things like this. |
| 1106 | core/otros | bug | 0 | RESUELTO-AQUI | fix(hooks) curl/wget en posicion de comando (ae9c1c4) | PreToolUse curl/wget regex still matches unquoted argument words, not the command (residual of #63) |
| 1125 | core/otros | bug | 1 | PENDIENTE |  | curl/wget rule ignores pipe targets: `curl … \| head -c 200` is redirected, and the rest of a multi-line block |
| 1151 | core/otros | bug | 1 | CUBIERTO-POR-PR |  | [Bug]: Binary file and HTTP reads are reported as saved model tokens |
| 1163 | core/otros | bug | 0 | CUBIERTO-POR-PR |  | extractSnippet + 6 echo paths slice UTF-16 code units without surrogate-pair awareness → lone surrogates → det |
| 1184 | core/otros | feature | 0 | PENDIENTE |  | [Feature]: Fetch URL content with firecrawl |
| 1185 | core/otros | feature | 0 | PENDIENTE |  | Feature request: Multi-agent context isolation support |
| 1225 | core/otros | bug | 0 | PENDIENTE |  | Update vulnerable ip-address dependency chain |
| 889 | empaquetado | bug | 1 | CUBIERTO-POR-PR |  | [Bug]: v1.0.168 tarball missing all scripts/*.mjs (postinstall, heal-*, plugin-cache-integrity) — ctx doctor a |
| 951 | empaquetado | bug | 0 | CUBIERTO-POR-PR |  | [Bug] ctx_batch_execute crashes node/npm/npx: stale cm-fs-preload-<pid>.js (NODE_OPTIONS leak) + worker accumu |
| 956 | empaquetado | feature | 0 | PENDIENTE |  | [Feature]: npm warn deprecated prebuild-install@7.1.3: No longer maintained. |
| 1016 | empaquetado | feature | 0 | PENDIENTE |  | [Feature]: a clean way to uninstall and remove configs |
| 1032 | empaquetado | bug | 0 | CUBIERTO-POR-PR |  | VS Code Remote-WSL project root incorrectly anchored to VS Code install directory |
| 1090 | empaquetado | bug | 0 | RESUELTO-AQUI | fix(hooks) ruta de interprete estable (ca422f6) | plugin.json mcpServers.command pinned to process.execPath has no liveness guard — and the MCP server cannot se |
| 1105 | empaquetado | bug | 0 | PENDIENTE |  | better-sqlite3 ABI rebuild loop: ensure-deps.mjs resolves node/npm via ambient PATH instead of process.execPat |
| 1191 | empaquetado | bug | 0 | PENDIENTE |  | healScript version filter `/^\d+\.\d+/` is unanchored — `<version>.bak-*` is accepted as a version dir, and a  |
| 891 | executor | feature | 0 | PENDIENTE |  | [Feature]: runtime/executor support for emacs lisp |
| 923 | executor | bug | 2 | CUBIERTO-POR-PR |  | start.mjs: process.chdir(__dirname) changes MCP subprocess CWD, breaking gnome-terminal new-tab directory |
| 954 | executor | bug | 0 | PENDIENTE |  | [Bug]: ctx_execute_file rejects registered external Git worktrees while ctx_batch_execute accepts them as cwd |
| 1079 | executor | bug | 1 | PENDIENTE |  | cleanupStaleSources(14) expires sources by age alone, even when the file is unchanged — intended? |
| 1081 | executor | bug | 0 | PENDIENTE |  | Execution timeout units are absent from the public tool schema |
| 1175 | executor | bug | 0 | PENDIENTE |  | [Bug]: ctx_execute cannot be cancelled with Esc mid-run; no intermediate progress visible |
| 1242 | executor | bug | 0 | PENDIENTE |  | [Bug]: ctx-debug.sh fails under POSIX sh (process substitution) - add a bash re-exec guard or rewrite |
| 894 | hooks/seguridad | bug | 1 | CUBIERTO-POR-PR |  | [Bug]: statusline stuck on hardcoded "saves ~98%" — published 1.0.168 ships without build/, renderer swallows  |
| 967 | hooks/seguridad | bug | 2 | CUBIERTO-POR-PR |  | Auto-mode permission classifier denies ~40% of subagent spawns due to injected <context_window_protection> blo |
| 1000 | hooks/seguridad | bug | 0 | PENDIENTE |  | Redundant PreToolUse matchers double-fire on ctx_execute/ctx_execute_file/ctx_batch_execute; no timeout on hot |
| 1003 | hooks/seguridad | bug | 0 | PENDIENTE |  | PreToolUse denies and nudges are defeated by parallel tool batches; WebFetch deny has no opt-out |
| 1075 | hooks/seguridad | bug | 0 | RESUELTO-AQUI | fix(security) anchors // y ~/ (12b3713) | [Bug]: permission patterns anchored with // or ~/ never match — ctx_execute_file blocks allowed paths and the  |
| 1141 | hooks/seguridad | bug | 0 | CUBIERTO-POR-PR |  | [Bug]: ctx-debug.sh dumps plaintext secrets from settings.json — bug_report.yml requires pasting this into pub |
| 1226 | hooks/seguridad | bug | 0 | PENDIENTE |  | hooks.json ships without default timeouts - ctx upgrade silently reverts manual timeout patch |
| 865 | linux | bug | 1 | PENDIENTE |  | ctx_stats conversation count ignores $CLAUDE_CONFIG_DIR — enumerateAdapterDirs hardcodes ~/.claude |
| 874 | linux | bug | 1 | PENDIENTE |  | [BUG] OMP plugin tool_result captures metadata but never replaces output — bytes_avoided always 0 |
| 895 | linux | bug | 1 | PENDIENTE |  | ctx_search ranks stale cross-session memory above fresh same-session captures |
| 959 | linux | bug | 6 | PENDIENTE |  | Pi adapter: hung ctx_execute cannot be aborted; Esc/Ctrl+C does nothing |
| 1036 | linux | bug | 1 | PENDIENTE |  | opencode adapter appends cumulative turn cost once per step, over-counting multi-step turns |
| 1067 | linux | bug | 0 | PENDIENTE |  | pi adapter: collapsed tool status line shows the code-echo fence line (```javascript) instead of actual output |
| 1069 | linux | bug | 1 | PENDIENTE |  | Pi adapter does not enforce mandatory context-mode routing for read-only tools |
| 1085 | linux | bug | 0 | PENDIENTE |  | [OpenCode adapter] `experimental.chat.system.transform` injects extra system-role messages - strict Qwen singl |
| 1094 | linux | bug | 0 | PENDIENTE |  | [Bug]: Pi adapter: ctx_execute renders blank in collapsed TUI — shows only code fence opening |
| 1112 | linux | bug | 0 | CUBIERTO-POR-PR |  | Pi adapter: ephemeral context injection invalidates Anthropic prompt cache once per turn |
| 1150 | linux | bug | 0 | PENDIENTE |  | Pi adapter: renderCall drops tool args — every ctx_* call row renders as a bare tool name |
| 1162 | linux | bug | 0 | PENDIENTE |  | fetch-index/turndown missing on systemd-daemon (Linux) installs — boot-time node_modules installer only lives  |
| 1168 | linux | bug | 0 | RESUELTO-AQUI | fix(pi) installs gestionados (93058f4) | [Bug]: Pi adapter hardcodes legacy Pi paths — `~/.pi/settings.json` and `~/.pi/extensions/context-mode/` do no |
| 1188 | linux | bug | 0 | PENDIENTE |  | ensure-deps.mjs: skipProbe path dlopens better-sqlite3 in-process, then rebuilds that same .node in place — SI |
| 1193 | linux | bug | 2 | PENDIENTE |  | [Bug]: Bun seed writes an ABI-mismatched better_sqlite3 cache entry; fast path then trusts it (1.0.169, Linux) |
| 1199 | linux | bug | 2 | PENDIENTE |  | OpenCode 2.x plugin fails to load (needs a V2 adapter: { id, effect\|setup }) |
| 1201 | linux | bug | 0 | PENDIENTE |  | [Bug]: OpenClaw 2026.9.x — adapter fails to load from the plugin capture (computed import paths), unhandled re |
| 1221 | linux | docs | 0 | CUBIERTO-POR-PR |  | [Bug]: OMP adapter hard-blocks curl/wget/fetch( inside quotes, grep patterns and heredocs (Pi fix from #625 ne |
| 1254 | linux | bug | 0 | PENDIENTE |  | [Bug]: ctx_stats reports OpenCode as "Skipped / no real chat activity" — multi-adapter importer only knows the |
| 1174 | macos | bug | 0 | CUBIERTO-POR-PR |  | start.mjs background install of turndown/better-sqlite3 dies on the #1139 Arborist "edgesOut" crash on macOS — |
| 1196 | macos | bug | 2 | PENDIENTE |  | ensure-deps: fast path re-copies and re-codesigns better_sqlite3.node on every hook call (macOS disk churn) |
| 1213 | macos | bug | 0 | CUBIERTO-POR-PR |  | Stats path opens every session DB (not read-only), causing sustained fsevents/AV load on macOS |
| 867 | sesion | bug | 0 | PENDIENTE |  | ContentStore self-heals DB corruption only at open-time (lossy recreate) — mid-session SQLITE_CORRUPT on a hel |
| 903 | sesion | bug | 0 | PENDIENTE |  | SessionStart injection truncates UTF-16 surrogate pairs, producing orphan high surrogates that break the host  |
| 949 | sesion | bug | 0 | PENDIENTE |  | sessions/ directory has no retention — grows unbounded (content/ prunes at 14d, sessions/ never) |
| 964 | sesion | feature | 0 | PENDIENTE |  | Feature request: env knob to disable the SessionStart routing-block injection |
| 992 | sesion | bug | 1 | RESUELTO-AQUI | fix(store)idem (0cd77b6) | [Bug] Bun: live ContentStore/SessionDB handle wedges to permanent SQLITE_IOERR (disk I/O error) on healthy dis |
| 1004 | sesion | bug | 0 | PENDIENTE |  | buildRulesSection() if/else branches are identical — rule_content bodies inlined verbatim into <session_resume |
| 1022 | sesion | bug | 2 | PENDIENTE |  | [Bug]: Resume snapshot ignores byte budget — advertises <2KB, injects ~196KB |
| 1024 | sesion | bug | 3 | RESUELTO-AQUI | fix(store) no borrar DBs con owner vivo (0cd77b6) | [Bug]: Stale content DB cleanup deletes live-but-idle sessions (WAL mtime only, no liveness check) |
| 1026 | sesion | bug | 1 | PENDIENTE |  | Bash routing nudge is hardcoded once-per-session; external-MCP nudge next to it is periodic + configurable |
| 1049 | sesion | bug | 0 | PENDIENTE |  | SessionStart cache-heal re-injects a duplicate hook with an absolute path when an existing hook is registered  |
| 1055 | sesion | bug | 1 | PENDIENTE |  | isMCPReady() counts sibling sessions' servers: WebFetch/curl denied in concurrent sessions whose own MCP serve |
| 1058 | sesion | bug | 1 | PENDIENTE |  | Uninstall leaves SessionStart hook, cache dir, and running MCP process behind |
| 1100 | sesion | bug | 0 | PENDIENTE |  | Session close (SIGTERM/SIGHUP/Ctrl+D) does not terminate the MCP server — orphan bun process leaks CPU and gro |
| 1101 | sesion | bug | 0 | PENDIENTE |  | Session close (SIGTERM/SIGHUP/Ctrl+D) does not terminate the MCP server — orphan bun process leaks CPU and gro |
| 1140 | sesion | bug | 1 | CUBIERTO-POR-PR |  | cleanupOldSessions(7) evicts active sessions — started_at is never refreshed by ensureSession/resume |
| 1156 | sesion | bug | 0 | RESUELTO-AQUI | fix(session) eviccion invertida (4e4acc0) | [Bug]: evictLowestPriority deletes the most critical events first (ORDER BY priority ASC on a 1=critical scale |
| 1198 | sesion | bug | 0 | PENDIENTE |  | MCP server credits ctx_* events to the most recently started session, not the caller |
| 1214 | sesion | bug | 0 | CUBIERTO-POR-PR |  | [Bug]: the MCP server takes every project's pending events.md into its own store, so resume snapshots are lost |
| 950 | stats | bug | 5 | RESUELTO-AQUI | fix(stats) tres contradicciones en un render (95416cd/eb47446) | [Bug]: ctx_stats self-contradicts within one render — per-chat 'kept out' (2.7 MB) exceeds all-projects total  |
| 1014 | stats | bug | 0 | PENDIENTE |  | No supported way to assert a source is populated: doctor says PASS on an empty index, ctx_stats measures sessi |
| 1025 | stats | bug | 0 | RESUELTO-AQUI | fix(stats) reduction_pct (4c0d600) | [Bug]: Returned content bytes double-counted in reduction_pct denominator |
| 1096 | stats | bug | 0 | PENDIENTE |  | start.mjs healScript: version-directory filter still uses `statSync` (follows symlinks) — the one instance #64 |
| 1248 | stats | bug | 1 | CUBIERTO-POR-PR |  | [Bug]: stats heartbeat re-opens every session DB each minute (getLifetimeStats) — constant disk writes that gr |
| 914 | store | bug | 0 | PENDIENTE |  | Single-file `index --source <label>` stores a bare label (inconsistent with indexDirectory) — is a fix welcome |
| 961 | store | bug | 0 | PENDIENTE |  | RFC: add indexed byte/chunk budgets and separate batch display from indexed input |
| 1039 | store | bug | 1 | CUBIERTO-POR-PR |  | [Bug]: ctx_fetch_and_index silently ignores HTTP_PROXY/HTTPS_PROXY — fetch subprocess strips all proxy env var |
| 1119 | store | bug | 1 | PENDIENTE |  | [Bug]: ctx_search accepts a negative limit and returns an arbitrary result count |
| 1135 | store | bug | 0 | PENDIENTE |  | [Bug]: ctx_fetch_and_index returns raw Node crash stack as the error text |
| 1136 | store | bug | 0 | PENDIENTE |  | [Bug]: ctx_fetch_and_index crashes on pages containing an empty <table> (turndown-plugin-gfm isHeadingRow) |
| 1200 | store | bug | 0 | RESUELTO-AQUI | fix(search) query singular en el schema (08fecd7) | [Bug]: ctx_search rejects singular 'query' param despite schema declaring it valid |
| 1204 | store | bug | 0 | PENDIENTE |  | Index-time preview after the pointer line, and a ctx_page tool to walk an indexed source |
| 901 | windows | bug | 2 | PENDIENTE |  | [Bug]: \upgrade\ only updates one of two parallel install trees on Windows; \doctor\ reads the other |
| 953 | windows | bug | 1 | PENDIENTE |  | [Bug]: Codex Desktop on Windows retains one context-mode MCP server per task; cache cleanup hits os error 32 |
| 982 | windows | bug | 5 | CUBIERTO-POR-PR |  | Windows: MCP server child orphans & CPU-spins on session end (parent-death guard is Linux/Bun-only) |
| 985 | windows | bug | 2 | RESUELTO-AQUI | perf(db) Atomics.wait en vez de busy-wait (7c1e241) | Multi-session contention on shared per-project content DB → busy-wait CPU spin & event-loop hang (Windows) |
| 993 | windows | bug | 1 | PENDIENTE |  | [Bug]: Windows hook commands fail under PowerShell (missing call operator `&`) |
| 1005 | windows | bug | 1 | PENDIENTE |  | [Bug]: ctx upgrade freezes the NEW version dir's hooks.json onto the OLD version's paths on macOS (bun runtime |
| 1139 | windows | bug | 1 | CUBIERTO-POR-PR |  | Windows: `npm install better-sqlite3` inside plugin dir crashes npm (Arborist "edgesOut" null) — documented re |
| 1159 | windows | feature | 0 | CUBIERTO-POR-PR |  | [Feature]: Defer runtime discovery until needed: Windows where probes consume 30s before MCP initialize |
| 1186 | windows | bug | 1 | CUBIERTO-POR-PR |  | Windows: ctx_stats takes ~4 s per call (uncached multi-adapter SQLite scan) and ~1.6 s of blocking execSync pr |
| 1208 | windows | bug | 0 | PENDIENTE |  | ctx_execute fails to spawn python/node on Windows when only shell-script shims are on PATH (misleading 'not fo |
| 1210 | windows | bug | 0 | CUBIERTO-POR-PR |  | Codex on Windows: project dir falls back to the plugin cache 5 minutes after the newest Codex session starts ( |
| 1212 | windows | bug | 0 | PENDIENTE |  | PreToolUse routing doesn't recognize the PowerShell tool, and the Bash nudge only fires once per session |
| 1217 | windows | bug | 0 | RESUELTO-AQUI | fix(omp) hooks hermanos al upgrade (0935dc9-ish) | Windows: shell-language ctx_execute/ctx_batch_execute scripts run with stripped PATH (/usr/bin:/bin only), bre |
| 1251 | windows | bug | 0 | PENDIENTE |  | Windows: hooks/ensure-deps.mjs retries `npm install better-sqlite3` once per hook with no backoff and no `wind |
