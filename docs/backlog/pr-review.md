# Revisión de PRs de `mksglu/context-mode`

Un veredicto por PR. Nada se adopta sin leer el diff y comprobar que hace lo
que dice — tres de los doce PRs adoptados hasta ahora resultaron estar rotos o
con tests que probaban lo que querían (ver `git log`).

Veredicciones: `ADOPTADO` · `ADAPTADO` (fix válido, implementación
sustituida) · `DESCARTADO` (supersedido, incorrecto o sin valor) ·
`DIFERIDO` (requiere una decisión que no es del fix) · `PENDIENTE`.

Ya resueltos antes de la revisión individual:
- **#924** — ADOPTADO — ADAPTADO — el fix era correcto pero sus tests incluian `expect(src).toContain("best effort")`
- **#1035** — ADOPTADO
- **#1041** — ADOPTADO — ADAPTADO — el PR calculaba el bloque condicional y nunca lo interpolaba: la opt-in no hacia nada
- **#1042** — ADOPTADO — ADAPTADO — el fix era correcto pero sus tests grepeaban el fuente y testeaban una copia local de la formula
- **#1087** — ADOPTADO
- **#1153** — ADOPTADO
- **#1170** — ADOPTADO
- **#1183** — ADOPTADO
- **#1189** — ADOPTADO
- **#1218** — ADOPTADO
- **#1224** — ADOPTADO
- **#1230** — ADOPTADO

- **#1207** — reemplazado por #1230 (mismo fix, menor)
- **#1128** — reemplazado por #1189 (mismo fix, con tests negatives)
- **#1122** — DIFERIDO: sin test, y #1126 (draft) argue por borrarlo: decision de producto

## Pendientes (146)

| PR |-arch | +add/-del | base | merge | act. | título | veredicto |
|---|---|---|---|---|---|---|---|
| 1137 | 1 | +1/-1 | next | unstable | 25 | docs: align session continuity guidance | PENDIENTE |
| 972 | 1 | +1/-1 | next | clean | 53 | fix(gitSetupShell): do not hardcode bash location | PENDIENTE |
| 1245 | 1 | +2/-2 | next | unstable | 2 | fix(deps): refresh express-rate-limit to pull in patched ip-address | PENDIENTE |
| 1244 | 1 | +2/-1 | main | unstable | 1 | Add website URL to plugin.json | PENDIENTE |
| 975 | 1 | +2/-2 | main | clean | 77 | fix(ctx_execute): prevent hang when background=true without timeout | PENDIENTE |
| 1061 | 1 | +4/-4 | next | clean | 47 | docs(readme): correct Pi session completeness from High to Full (#1021) | PENDIENTE |
| 927 | 1 | +5/-5 | main | dirty | 89 | fix(hooks): downgrade WebFetch hard-deny to once-per-session advisory | PENDIENTE |
| 1132 | 1 | +7/-9 | next | unstable | 26 | docs: clarify Claude network routing guidance | PENDIENTE |
| 1243 | 1 | +8/-0 | next | unstable | 2 | fix(scripts): re-exec ctx-debug.sh under bash when invoked by a POSIX shell | PENDIENTE |
| 1095 | 1 | +21/-1 | next | clean | 38 | fix(pi): strip echo preamble in collapsed renderResult | PENDIENTE |
| 892 | 2 | +4/-4 | main | dirty | 97 | Fix typo in README verification instructions | PENDIENTE |
| 920 | 2 | +8/-6 | next | clean | 53 | fix: state ctx_search throttle thresholds as absolute call numbers | PENDIENTE |
| 948 | 2 | +10/-1 | next | clean | 53 | docs(codex): make JavaScript the default ctx_execute runtime | PENDIENTE |
| 932 | 2 | +10/-4 | next | clean | 53 | fix(runPool): don't report capped when pool is larger than workload (#915) | PENDIENTE |
| 906 | 2 | +10/-0 | next | clean | 53 | docs(codex): pin platform env in manual config | PENDIENTE |
| 1250 | 2 | +16/-1 | next | unstable | 1 | fix: classify shell exit 1 with stderr as an error | PENDIENTE |
| 1059 | 2 | +17/-0 | next | clean | 47 | fix(opencode): route webfetch through the WebFetch redirect (#1052) | PENDIENTE |
| 930 | 2 | +18/-1 | next | clean | 49 | fix(docs): avoid GraphQL issue listing | PENDIENTE |
| 1180 | 2 | +22/-0 | next | unstable | 16 | fix(pi): stamp the context-hook message with a timestamp so Radius accepts it | PENDIENTE |
| 974 | 2 | +23/-1 | next | clean | 53 | fix(start.mjs): remove chdir | PENDIENTE |
| 934 | 2 | +23/-2 | next | clean | 53 | fix(batch): export NODE_OPTIONS as a statement so compound shell commands work (#925) | PENDIENTE |
| 1097 | 2 | +26/-1 | main | clean | 37 | feat(server): CONTEXT_MODE_MAX_LIMIT env-var override | PENDIENTE |
| 1062 | 2 | +28/-1 | next | clean | 47 | fix(analytics): replace time-language with byte-ratio wording (#1023) | PENDIENTE |
| 1138 | 2 | +29/-0 | next | unstable | 25 | fix(fetch): handle HTML tables without rows | PENDIENTE |
| 1149 | 2 | +30/-0 | next | unstable | 22 | fix(pi): timestamp injected context messages for Radius | PENDIENTE |
| 1177 | 2 | +32/-6 | next | unstable | 16 | fix(batch): export NODE_OPTIONS so compound shell commands work (#1117) | PENDIENTE |
| 931 | 2 | +37/-16 | next | clean | 49 | fix: surface statusline analytics import failures (#894) | PENDIENTE |
| 969 | 2 | +40/-5 | next | clean | 53 | fix(batch): re-create the fs-preload temp file if an OS cleaner removed it (#951) | PENDIENTE |
| 864 | 2 | +41/-9 | next | unstable | 53 | Hide Pi context injection from user entry | PENDIENTE |
| 1002 | 2 | +43/-115 | main | clean | 66 | fix(pi): keep runtime context at system boundary | PENDIENTE |
| 1001 | 2 | +44/-0 | main | clean | 70 | fix(pricing): add MiniMax catalog entries | PENDIENTE |
| 1073 | 2 | +52/-13 | next | clean | 41 | fix: update Kiro hooks config to 1.0 v1 schema | PENDIENTE |
| 922 | 2 | +53/-10 | next | clean | 53 | fix: trim the per-call ctx_batch_execute footer | PENDIENTE |
| 1235 | 2 | +60/-3 | next | unstable | 3 | fix(copilot-cli): preserve custom hooks during upgrade | PENDIENTE |
| 987 | 2 | +60/-3 | main | clean | 74 | fix(lifecycle): detect parent death on Windows via PID existence probe (#982) | PENDIENTE |
| 968 | 2 | +60/-5 | next | clean | 53 | fix(exec): add CONTEXT_MODE_DEFAULT_EXEC_TIMEOUT_MS opt-in bound for exec calls (#936) | PENDIENTE |
| 945 | 2 | +61/-0 | next | clean | 47 | fix(routing): let claude.ai Artifact URLs pass through WebFetch (#938) | PENDIENTE |
| 863 | 2 | +63/-9 | next | clean | 53 | fix(windows): run the better-sqlite3 boot-install via node, not npm.cmd+shell (#861 follow-up) | PENDIENTE |
| 1118 | 2 | +65/-7 | next | clean | 31 | fix(db-base): keep SQL comments from splitting exec statements | PENDIENTE |
| 876 | 2 | +67/-3 | next | clean | 53 | fix(omp): seed APPEND_SYSTEM.md routing instructions | PENDIENTE |
| 921 | 2 | +68/-3 | next | dirty | 53 | fix: dedupe chunks across queries in a multi-query ctx_search call | PENDIENTE |
| 986 | 2 | +78/-3 | main | clean | 74 | fix(db): replace SQLITE_BUSY busy-wait backoff with Atomics.wait sleep (#985) | PENDIENTE |
| 1236 | 2 | +79/-5 | next | unstable | 3 | fix(stats): probe session schemas read-only before migration | PENDIENTE |
| 1030 | 2 | +85/-6 | next | clean | 53 | fix(db): retry transient SQLITE_IOERR instead of failing the caller | PENDIENTE |
| 1228 | 2 | +89/-14 | next | unstable | 0 | fix(hooks): ship default timeouts so a hung hook cannot block the CLI | PENDIENTE |
| 1086 | 2 | +90/-3 | next | clean | 40 | fix(hooks): scan quotes left to right so prose apostrophes cannot expose a command | PENDIENTE |
| 1056 | 2 | +94/-12 | next | clean | 50 | fix(db): stop mutating shared DB files across processes (close-time TRUNCATE checkpoint + default mmap) | PENDIENTE |
| 1160 | 2 | +95/-2 | next | unstable | 20 | fix(opencode): merge sibling config plugin arrays when writing opencode.jsonc | PENDIENTE |
| 1238 | 2 | +96/-4 | next | unstable | 3 | fix(fetch): keep nested fenced examples intact during extraction | PENDIENTE |
| 1129 | 2 | +110/-9 | next | unstable | 8 | fix(hooks): pin ABI healing to the running Node | PENDIENTE |
| 929 | 2 | +110/-1 | next | clean | 49 | fix(packaging): guard packaged helper scripts | PENDIENTE |
| 1237 | 2 | +115/-9 | next | unstable | 3 | fix(executor): preserve Rust execution cwd and sandbox lifecycle | PENDIENTE |
| 1116 | 2 | +118/-6 | next | clean | 32 | feat(omp): restore resume snapshot after compact | PENDIENTE |
| 1239 | 2 | +141/-4 | next | unstable | 3 | fix(gemini-cli): retain sibling hooks when upgrading | PENDIENTE |
| 1252 | 2 | +161/-68 | next | unstable | 1 | fix(stats): stop counting binary reads and responses as saved tokens (#1151) | PENDIENTE |
| 1216 | 2 | +163/-4 | next | unstable | 6 | fix(cache-heal): anchor version filter and report dead installPaths (#1191) | PENDIENTE |
| 1249 | 2 | +169/-1 | next | unstable | 2 | fix(pi): decode MCP stdout incrementally so multi-byte text survives chunk boundaries | PENDIENTE |
| 1234 | 2 | +189/-41 | next | unstable | 3 | fix(codex): trust rollout content timestamp over mtime for Windows staleness check | PENDIENTE |
| 1229 | 2 | +190/-15 | next | unstable | 4 | fix: scope session-event indexing to the current project (#1214) | PENDIENTE |
| 1166 | 2 | +220/-13 | next | unstable | 18 | fix(pi): spawn a Windows-spawnable runtime and keep bridge diagnostics | PENDIENTE |
| 1093 | 2 | +265/-3 | next | clean | 38 | feat(pi): interrupt support (Esc) for in-flight ctx_* tool calls | PENDIENTE |
| 1092 | 2 | +362/-13 | next | clean | 38 | feat(pi): live command preview and result tail in the Pi TUI | PENDIENTE |
| 1164 | 2 | +433/-6 | main | unstable | 19 | fix(pi): propagate Pi's AbortSignal — kill the bridge server tree to stop runaway executors | PENDIENTE |
| 1211 | 2 | +979/-53 | next | unstable | 1 | perf(analytics): stop re-reading every sidecar in getLifetimeStats | PENDIENTE |
| 928 | 3 | +27/-4 | next | clean | 49 | fix: avoid deprecated gh issue project cards query | PENDIENTE |
| 910 | 3 | +32/-2 | next | clean | 53 | fix(codex): omit empty additionalContext in hook output | PENDIENTE |
| 971 | 3 | +39/-6 | next | clean | 40 | fix(codex): omit empty hook context | PENDIENTE |
| 899 | 3 | +57/-6 | main | clean | 96 | fix: avoid false shell error captures | PENDIENTE |
| 973 | 3 | +71/-7 | next | clean | 53 | fix(start.mjs): allow resolve bun from $PATH | PENDIENTE |
| 958 | 3 | +79/-70 | next | clean | 53 | refactor(cache-heal): extract inline healScript to hooks/cache-heal.mjs | PENDIENTE |
| 1253 | 3 | +93/-3 | next | unstable | 1 | fix(ensure-deps): skip the cache swap when the active binary is already current (#1196) | PENDIENTE |
| 970 | 3 | +100/-3 | next | clean | 53 | fix(store): add 14-day retention for the sessions/ directory (#949) | PENDIENTE |
| 1076 | 3 | +118/-0 | next | clean | 41 | feat: add CONTEXT_MODE_TOOLS allow-list to skip tool registration | PENDIENTE |
| 1126 | 3 | +120/-122 | next | unstable | 28 | fix(pi): remove unverified tool-availability routing anchor | PENDIENTE |
| 1143 | 3 | +130/-2 | next | unstable | 24 | fix(session): key cleanupOldSessions TTL off last activity, not started_at | PENDIENTE |
| 1172 | 3 | +177/-160 | next | unstable | 17 | fix(fetch): report concise subprocess errors | PENDIENTE |
| 1155 | 3 | +181/-12 | main | unstable | 21 | Redact secrets from the debug report before it leaves the machine | PENDIENTE |
| 1145 | 3 | +187/-11 | next | unstable | 24 | fix: skip Claude self-healing for non-Claude launches | PENDIENTE |
| 1040 | 3 | +214/-20 | main | clean | 58 | fix(cost): emit opencode multi-step usage as deltas (#1036) | PENDIENTE |
| 1127 | 3 | +220/-19 | next | unstable | 27 | feat(server): make echo budgets configurable per host | PENDIENTE |
| 1019 | 3 | +228/-26 | next | clean | 53 | fix(security): honor Pi project permission settings | PENDIENTE |
| 1144 | 3 | +239/-10 | main | unstable | 24 | fix(ctx-debug): redact env blocks and credential-shaped keys in captured configs | PENDIENTE |
| 1147 | 3 | +274/-34 | next | unstable | 23 | fix(exec): bound ctx_execute on Pi, which has no host-side ceiling | PENDIENTE |
| 1165 | 3 | +328/-30 | next | unstable | 19 | fix(codex): honor active sandbox state for file reads | PENDIENTE |
| 1066 | 3 | +416/-57 | main | clean | 46 | feat(omp): route broad tool calls and cap direct results | PENDIENTE |
| 1240 | 4 | +59/-25 | next | unstable | 3 | fix: declare antigravity-cli Stop hook in the flat form agy accepts | PENDIENTE |
| 1227 | 4 | +78/-72 | next | unstable | 4 | fix(omp): allow quoted HTTP references and silent file downloads | PENDIENTE |
| 1197 | 4 | +112/-116 | main | unstable | 11 | fix: reject unusable Bun shims and clarify OMP hook diagnostics | PENDIENTE |
| 1154 | 4 | +113/-6 | next | unstable | 21 | fix(windows): suppress child process console windows | PENDIENTE |
| 988 | 4 | +117/-1 | main | clean | 74 | fix(store): opportunistic PASSIVE WAL checkpoint to bound the content-store WAL (#985) | PENDIENTE |
| 918 | 4 | +128/-104 | main | clean | 92 | fix(routing-block): remove injection-shaped framing (#911) | PENDIENTE |
| 1246 | 4 | +133/-18 | next | unstable | 2 | fix(pi): isolate MCP bridges by session workspace | PENDIENTE |
| 871 | 4 | +294/-7 | next | clean | 53 | fix(db-base): extend withRetry to catch mid-session SQLITE_CORRUPT with lossless heal (#867) | PENDIENTE |
| 1209 | 4 | +330/-19 | next | unstable | 8 | fix(executor): run extensionless POSIX-shim python/node via Git Bash on Windows (#1208) | PENDIENTE |
| 1009 | 4 | +400/-14 | main | clean | 68 | fix(executor): terminate abandoned execution trees | PENDIENTE |
| 898 | 4 | +420/-318 | next | dirty | 53 | fix(store): cap oversized markdown chunks | PENDIENTE |
| 991 | 4 | +435/-318 | next | dirty | 53 | fix: auto-index mid-size exec output for ctx_search without intent | PENDIENTE |
| 963 | 4 | +834/-389 | next | dirty | 53 | fix(store): bound FTS search result hydration for oversized rows | PENDIENTE |
| 1104 | 5 | +7/-5 | main | clean | 35 | fix(codex): route Code Mode exec through PreToolUse | PENDIENTE |
| 1158 | 5 | +44/-8 | next | unstable | 20 | fix(session): evict least-important events first | PENDIENTE |
| 1161 | 5 | +51/-49 | next | unstable | 20 | fix(tool-naming): use native ctx_* names for OpenCode/KiloCode plugin tools | PENDIENTE |
| 1033 | 5 | +61/-2 | next | clean | 53 | Fix VS Code Remote-WSL project root detection (issue #1032) | PENDIENTE |
| 888 | 5 | +62/-74 | main | dirty | 97 | Fix/mcp singleton concurrency | PENDIENTE |
| 1034 | 5 | +75/-3 | next | clean | 53 | fix(routing): self-identify subagent routing block, add opt-out (#967) | PENDIENTE |
| 1113 | 5 | +80/-35 | next | clean | 32 | fix(detect): wait for MCP initialize before platform detect | PENDIENTE |
| 1176 | 5 | +88/-8 | next | unstable | 16 | fix: make snippet and echo truncation surrogate-safe (#1163) | PENDIENTE |
| 913 | 5 | +90/-72 | next | clean | 53 | fix(standalone): use mcp__context-mode__ prefix when CLAUDE_PLUGIN_ROOT is absent | PENDIENTE |
| 996 | 5 | +120/-6 | main | clean | 72 | fix: honest session_state source label — "compaction" only after real compaction | PENDIENTE |
| 1256 | 5 | +136/-12 | next | unstable | 1 | fix(hooks): scope MCP readiness to the calling Claude Code session (#1055) | PENDIENTE |
| 1241 | 5 | +154/-19 | next | unstable | 3 | fix(session): attribute MCP work to caller session | PENDIENTE |
| 1247 | 5 | +176/-0 | next | unstable | 2 | fix(scripts): re-exec plugin shell scripts under bash for POSIX-sh callers (#1242) | PENDIENTE |
| 1220 | 5 | +177/-4 | next | unstable | 5 | fix(heal): keep project-scope installs out of user settings.json (#1215) | PENDIENTE |
| 1182 | 5 | +179/-19 | main | unstable | 15 | fix(pi): Honor AbortSignal so Escape cancels in-flight | PENDIENTE |
| 1231 | 5 | +317/-49 | main | unstable | 4 | fix(claude-code): restore external-MCP hook routing with `mcp__.*` (#1222) | PENDIENTE |
| 1111 | 5 | +332/-174 | next | unstable | 25 | fix(stats): stop heartbeat lifetime scans | PENDIENTE |
| 884 | 5 | +372/-198 | next | clean | 53 | docs: sync adapter install/usage/debugging with the code (v1.0.167) | PENDIENTE |
| 1167 | 5 | +1193/-572 | next | unstable | 18 | fix(windows): resolve runtime probes in-process instead of spawning where | PENDIENTE |
| 1148 | 6 | +101/-10 | next | unstable | 16 | fix: bundle bin/statusline.mjs's analytics import (marketplace installs never get build/) | PENDIENTE |
| 955 | 6 | +172/-19 | next | clean | 53 | feat(codex): load Windows guidance as a platform overlay | PENDIENTE |
| 939 | 6 | +200/-1 | main | clean | 87 | feat: add ctx_forget for per-source knowledge-base eviction | PENDIENTE |
| 952 | 7 | +419/-410 | main | clean | 84 | fix(stats): count only measured redirects as savings, label capture volume honestly | PENDIENTE |
| 1121 | 7 | +433/-214 | next | clean | 30 | fix(pi): stream context tool output | PENDIENTE |
| 935 | 7 | +506/-308 | next | dirty | 53 | feat(opencode): add /ctx slash command to TUI for session stats | PENDIENTE |
| 1091 | 7 | +571/-354 | main | clean | 38 | fix(search): guard FTS5 highlight on oversized rows | PENDIENTE |
| 1084 | 7 | +583/-6 | next | clean | 28 | fix(codex): redirect broad home searches before ingestion | PENDIENTE |
| 1124 | 7 | +669/-647 | next | unstable | 29 | adapters: Route network commands by transfer output | PENDIENTE |
| 1171 | 7 | +1741/-53 | main | unstable | 4 | fix(opencode): support OpenCode 2 plugin API (V1/V2 dual export) | PENDIENTE |
| 907 | 8 | +141/-31 | next | clean | 17 | fix(session): keep SessionStart truncation surrogate-safe | PENDIENTE |
| 1082 | 8 | +242/-33 | next | clean | 7 | mcp: name execution timeout in milliseconds | PENDIENTE |
| 995 | 8 | +362/-299 | next | dirty | 53 | Fix Vitest Windows CI EPERM Hang | PENDIENTE |
| 866 | 8 | +479/-386 | next | dirty | 53 | fix(analytics): honor $CLAUDE_CONFIG_DIR in enumerateAdapterDirs (ctx_stats conversation count) | PENDIENTE |
| 1029 | 8 | +613/-398 | next | dirty | 32 | fix(pi): propagate MCP cancellation to executor | PENDIENTE |
| 980 | 8 | +2064/-462 | next | dirty | 53 | fix(batch): enforce indexed byte and chunk budgets | PENDIENTE |
| 1060 | 9 | +79/-0 | next | clean | 47 | fix(snapshot): pass platform tool name into PreCompact resume snapshot (#1028) | PENDIENTE |
| 1181 | 9 | +134/-35 | next | unstable | 15 | fix(session): align priority contract and minPriority filtering | PENDIENTE |
| 904 | 9 | +496/-343 | main | clean | 94 | fix(pi): propagate abort signals through tools | PENDIENTE |
| 877 | 9 | +623/-307 | next | dirty | 53 | fix(omp): replace large tool results with search references | PENDIENTE |
| 1043 | 10 | +111/-0 | main | clean | 57 | fix(precompact): use platform ctx_search name in resume snapshot | PENDIENTE |
| 1089 | 10 | +136/-44 | next | clean | 30 | fix: derive context-mode registry key | PENDIENTE |
| 897 | 10 | +450/-392 | next | dirty | 53 | fix(claude-code): route PowerShell hooks on Windows | PENDIENTE |
| 1178 | 10 | +644/-329 | next | dirty | 16 | feat(agy): capture user decisions and prompt events via PreInvocation hook | PENDIENTE |
| 1123 | 16 | +514/-350 | main | unstable | 29 | fix: enforce the bounded resume snapshot budget | PENDIENTE |
| 1194 | 17 | +3461/-894 | next | unstable | 12 | Opencode v2 compatibility (compaction within context-mode) | PENDIENTE |
| 1044 | 20 | +1831/-334 | main | clean | 54 | feat(adapters): add Mistral Vibe platform adapter | PENDIENTE |
| 1010 | 26 | +781/-310 | main | unstable | 10 | feat: add native Hermes Agent support | PENDIENTE |
| 957 | 32 | +2697/-369 | next | dirty | 53 | feat: add Devin CLI adapter + decision extraction | PENDIENTE |
