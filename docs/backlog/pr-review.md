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
| 1137 | 1 | +1/-1 | next | unstable | 25 | docs: align session continuity guidance | ADOPTADO |
| 972 | 1 | +1/-1 | next | clean | 53 | fix(gitSetupShell): do not hardcode bash location | ADOPTADO — el titulo exagera: el hardcode solo existia en el test, nunca en el producto |
| 1245 | 1 | +2/-2 | next | unstable | 2 | fix(deps): refresh express-rate-limit to pull in patched ip-address | DESCARTADO — el fix ya esta en efecto via pnpm-lock.yaml (ip-address@10.7.3, express-rate-limit@8.7.0); bun.lock es vestigial |
| 1244 | 1 | +2/-1 | main | unstable | 1 | Add website URL to plugin.json | DESCARTADO — anade websiteURL apuntando al repo abandonado; el campo no es verificable desde aqui |
| 975 | 1 | +2/-2 | main | clean | 77 | fix(ctx_execute): prevent hang when background=true without timeout | ADOPTADO — ver commit: quita el keep-alive cuando no hay timeout efectivo, que es el hang |
| 1061 | 1 | +4/-4 | next | clean | 47 | docs(readme): correct Pi session completeness from High to Full (#1021) | ADOPTADO — verificado: Pi cablea turn_end y before_agent_start, la tabla estaba mal |
| 927 | 1 | +5/-5 | main | dirty | 89 | fix(hooks): downgrade WebFetch hard-deny to once-per-session advisory | DESCARTADO — baja WebFetch de deny duro a aviso una-vez, Politica que excede #1037; el opt-out CONTEXT_MODE_ALLOW_WEBFETCH ya resuelve #1037 sin debilitar el default |
| 1132 | 1 | +7/-9 | next | unstable | 26 | docs: clarify Claude network routing guidance | ADAPTADO — acoplado con #927: soften la guia solo es honesto si el deny es suave. Se reescribe solo el marco (ADR-0003: redirigir != restringir) sin cambiar la politica |
| 1243 | 1 | +8/-0 | next | unstable | 2 | fix(scripts): re-exec ctx-debug.sh under bash when invoked by a POSIX shell | DESCARTADO — superseded por #1247 (superconjunto: 176 lineas y test; este son 8 sin test) |
| 1095 | 1 | +21/-1 | next | clean | 38 | fix(pi): strip echo preamble in collapsed renderResult | ADAPTAR — el fence no tolera el header path= de ctx_execute_file, y no trae test |
| 892 | 2 | +4/-4 | main | dirty | 97 | Fix typo in README verification instructions | DESCARTAR — la 'correccion' es peor ingles, y arrastra un stats.json rancio que baja el badge 280k |
| 920 | 2 | +8/-6 | next | clean | 53 | fix: state ctx_search throttle thresholds as absolute call numbers | ADAPTAR — el texto mejora pero los 4 tests son regex sobre el fuente |
| 948 | 2 | +10/-1 | next | clean | 53 | docs(codex): make JavaScript the default ctx_execute runtime | DESCARTAR — cambia 1 de 14 configs, convirtiendo un invariante cross-adapter en excepcion |
| 932 | 2 | +10/-4 | next | clean | 53 | fix(runPool): don't report capped when pool is larger than workload (#915) | ADOPTADO |
| 906 | 2 | +10/-0 | next | clean | 53 | docs(codex): pin platform env in manual config | ADAPTAR — anade [mcp_servers.context-mode.env] pero removeTomlSections empareja exacto y dejaria huerfana esa subtabla |
| 1250 | 2 | +16/-1 | next | unstable | 1 | fix: classify shell exit 1 with stderr as an error | ADOPTADO |
| 1059 | 2 | +17/-0 | next | clean | 47 | fix(opencode): route webfetch through the WebFetch redirect (#1052) | ADOPTADO |
| 930 | 2 | +18/-1 | next | clean | 49 | fix(docs): avoid GraphQL issue listing | DESCARTAR — no reproducible; el test grepea un markdown y solo puede fallar si alguien edita la doc |
| 1180 | 2 | +22/-0 | next | unstable | 16 | fix(pi): stamp the context-hook message with a timestamp so Radius accepts it | DESCARTADO — superseded por #1149 (mismo cambio, test mas debil) |
| 974 | 2 | +23/-1 | next | clean | 53 | fix(start.mjs): remove chdir | DESCARTAR — start.mjs:608 ya restaura el cwd antes del import; el cambio es neutro y ensancha la exposicion |
| 934 | 2 | +23/-2 | next | clean | 53 | fix(batch): export NODE_OPTIONS as a statement so compound shell commands work (#925) | DESCARTADO — superseded por #1177 (mismo fix, test que ejecuta el shell) |
| 1097 | 2 | +26/-1 | main | clean | 37 | feat(server): CONTEXT_MODE_MAX_LIMIT env-var override | ADAPTAR — commitea pr-body.md al repo y el nombre es ambiguo; sin test |
| 1062 | 2 | +28/-1 | next | clean | 47 | fix(analytics): replace time-language with byte-ratio wording (#1023) | CONFLICTO — sobre analytics.ts, que cambiamos en #950 |
| 1138 | 2 | +29/-0 | next | unstable | 25 | fix(fetch): handle HTML tables without rows | ADAPTAR — el test embebe la regla en el codigo generado, asi que ejercita una copia local |
| 1149 | 2 | +30/-0 | next | unstable | 22 | fix(pi): timestamp injected context messages for Radius | ADOPTADO — mismo fix de una linea que #1180 pero con test mas fuerte: serializa el payload como hace un gateway |
| 1177 | 2 | +32/-6 | next | unstable | 16 | fix(batch): export NODE_OPTIONS so compound shell commands work (#1117) | ADOPTAR — supersede #934; ejecuta el shell de verdad y arregla los comentarios obsoletos |
| 931 | 2 | +37/-16 | next | clean | 49 | fix: surface statusline analytics import failures (#894) | ADOPTADO |
| 969 | 2 | +40/-5 | next | clean | 53 | fix(batch): re-create the fs-preload temp file if an OS cleaner removed it (#951) | ADOPTADO |
| 864 | 2 | +41/-9 | next | unstable | 53 | Hide Pi context injection from user entry | DUDOSO — depende de si Pi acepta role:'custom' desde el hook context; no verificable aqui |
| 1002 | 2 | +43/-115 | main | clean | 66 | fix(pi): keep runtime context at system boundary | DESCARTAR — el oposto de #864: mueve el contexto a systemPrompt, lo que el propio codigo documenta que rompe el prefix cache cada turno |
| 1001 | 2 | +44/-0 | main | clean | 70 | fix(pricing): add MiniMax catalog entries | ADAPTAR — las tarifas de MiniMax-M3 estan al doble (copio los precios tachados pre-descuento) |
| 1073 | 2 | +52/-13 | next | clean | 41 | fix: update Kiro hooks config to 1.0 v1 schema | DESCARTAR — contradice el schema documentado de Kiro; ademas generateHookConfig sigue emitiendo la forma vieja |
| 922 | 2 | +53/-10 | next | clean | 53 | fix: trim the per-call ctx_batch_execute footer | ADOPTADO |
| 1235 | 2 | +60/-3 | next | unstable | 3 | fix(copilot-cli): preserve custom hooks during upgrade | ADOPTADO |
| 987 | 2 | +60/-3 | main | clean | 74 | fix(lifecycle): detect parent death on Windows via PID existence probe (#982) | ADOPTADO |
| 968 | 2 | +60/-5 | next | clean | 53 | fix(exec): add CONTEXT_MODE_DEFAULT_EXEC_TIMEOUT_MS opt-in bound for exec calls (#936) | ADOPTADO |
| 945 | 2 | +61/-0 | next | clean | 47 | fix(routing): let claude.ai Artifact URLs pass through WebFetch (#938) | ADOPTADO |
| 863 | 2 | +63/-9 | next | clean | 53 | fix(windows): run the better-sqlite3 boot-install via node, not npm.cmd+shell (#861 follow-up) | ADAPTAR — el cambio de stderr es bueno, pero los tests grepean el fuente tras quitar comentarios |
| 1118 | 2 | +65/-7 | next | clean | 31 | fix(db-base): keep SQL comments from splitting exec statements | ADOPTADO |
| 876 | 2 | +67/-3 | next | clean | 53 | fix(omp): seed APPEND_SYSTEM.md routing instructions | DUDOSO — no se puede confirmar desde el repo que OMP descubra APPEND_SYSTEM.md; el propio adapter documenta lo contrario |
| 921 | 2 | +68/-3 | next | dirty | 53 | fix: dedupe chunks across queries in a multi-query ctx_search call | ADAPTAR — los tests ejercitan el helper aislado; el cableado al handler no esta probado |
| 986 | 2 | +78/-3 | main | clean | 74 | fix(db): replace SQLITE_BUSY busy-wait backoff with Atomics.wait sleep (#985) | DESCARTADO — ya aplicado en este fork con una implementacion mejor (celda compartida a nivel de modulo) |
| 1236 | 2 | +79/-5 | next | unstable | 3 | fix(stats): probe session schemas read-only before migration | ADOPTADO |
| 1030 | 2 | +85/-6 | next | clean | 53 | fix(db): retry transient SQLITE_IOERR instead of failing the caller | ADAPTAR — la direccion es correcta; hay que revisar que IOERR no entre al predicado de corrupcion |
| 1228 | 2 | +89/-14 | next | unstable | 0 | fix(hooks): ship default timeouts so a hung hook cannot block the CLI | PENDIENTE — no alcanzado en el pre-cribado |
| 1086 | 2 | +90/-3 | next | clean | 40 | fix(hooks): scan quotes left to right so prose apostrophes cannot expose a command | ADOPTADO |
| 1056 | 2 | +94/-12 | next | clean | 50 | fix(db): stop mutating shared DB files across processes (close-time TRUNCATE checkpoint + default mmap) | ADOPTAR — corregir dos comentarios: el timer PASSIVE de #988 no existe todavia y el mmap por defecto se perdia por rendimiento |
| 1160 | 2 | +95/-2 | next | unstable | 20 | fix(opencode): merge sibling config plugin arrays when writing opencode.jsonc | ADOPTAR — anadir guarda Array.isArray en (settings.plugin ?? []) |
| 1238 | 2 | +96/-4 | next | unstable | 3 | fix(fetch): keep nested fenced examples intact during extraction | DESCARTAR — src/fetch/ no existe en este fork; es solo de next |
| 1129 | 2 | +110/-9 | next | unstable | 8 | fix(hooks): pin ABI healing to the running Node | CONFLICTO — hooks/ensure-deps.mjs, que tocamos en 45d5185 |
| 929 | 2 | +110/-1 | next | clean | 49 | fix(packaging): guard packaged helper scripts | ADOPTADO |
| 1237 | 2 | +115/-9 | next | unstable | 3 | fix(executor): preserve Rust execution cwd and sandbox lifecycle | ADOPTAR — sus 5 tests son runIf(rust): sin rustc el fix queda sin cubrir |
| 1116 | 2 | +118/-6 | next | clean | 32 | feat(omp): restore resume snapshot after compact | ADAPTAR — _pendingContext no se resetea en session_start, asi que un snapshot de la sesion A se inyecta en la B |
| 1239 | 2 | +141/-4 | next | unstable | 3 | fix(gemini-cli): retain sibling hooks when upgrading | APLICADO Y REVERTIDO — rompio la suite (hooks de gemini) |
| 1252 | 2 | +161/-68 | next | unstable | 1 | fix(stats): stop counting binary reads and responses as saved tokens (#1151) | ADOPTAR — quitar la asercion de fuente que el propio PR actualiza en vez de borrar |
| 1216 | 2 | +163/-4 | next | unstable | 6 | fix(cache-heal): anchor version filter and report dead installPaths (#1191) | ADAPTAR — statSync->lstatSync rompe los version dirs que sean symlink (dev builds), y el regex rechaza semver de 4 segmentos |
| 1249 | 2 | +169/-1 | next | unstable | 2 | fix(pi): decode MCP stdout incrementally so multi-byte text survives chunk boundaries | ADOPTADO |
| 1234 | 2 | +189/-41 | next | unstable | 3 | fix(codex): trust rollout content timestamp over mtime for Windows staleness check | ADOPTADO |
| 1229 | 2 | +190/-15 | next | unstable | 4 | fix: scope session-event indexing to the current project (#1214) | ADOPTADO |
| 1166 | 2 | +220/-13 | next | unstable | 18 | fix(pi): spawn a Windows-spawnable runtime and keep bridge diagnostics | ADOPTAR — el log de diag no tiene rotacion |
| 1093 | 2 | +265/-3 | next | clean | 38 | feat(pi): interrupt support (Esc) for in-flight ctx_* tool calls | DESCARTAR — superseded por #1164: matar el bridge no detiene el executor, que es justo el incidente que describe |
| 1092 | 2 | +362/-13 | next | clean | 38 | feat(pi): live command preview and result tail in the Pi TUI | ADOPTADO |
| 1164 | 2 | +433/-6 | main | unstable | 19 | fix(pi): propagate Pi's AbortSignal — kill the bridge server tree to stop runaway executors | ADAPTAR — portar el guard de stdin error desde #1093 y encadenar spawnExitError de #1166 |
| 1211 | 2 | +979/-53 | next | unstable | 1 | perf(analytics): stop re-reading every sidecar in getLifetimeStats | REVERTIDO — idem |
| 928 | 3 | +27/-4 | next | clean | 49 | fix: avoid deprecated gh issue project cards query | DESCARTAR — el Fixes #890 es falso (no toca pricing.js) y el defecto no se reproduce |
| 910 | 3 | +32/-2 | next | clean | 53 | fix(codex): omit empty additionalContext in hook output | DESCARTAR — duplicado exacto de #971, con tests mas debiles |
| 971 | 3 | +39/-6 | next | clean | 40 | fix(codex): omit empty hook context | ADOPTADO |
| 899 | 3 | +57/-6 | main | clean | 96 | fix: avoid false shell error captures | ADAPTAR — el regex de 3 frases no detecta npm ERR!/ELIFECYCLE/fatal: en Claude Code, que no manda tool_output |
| 973 | 3 | +71/-7 | next | clean | 53 | fix(start.mjs): allow resolve bun from $PATH | ADAPTAR — falta un test que compruebe el cableado en start.mjs, no solo el modulo puro |
| 958 | 3 | +79/-70 | next | clean | 53 | refactor(cache-heal): extract inline healScript to hooks/cache-heal.mjs | DESCARTAR — borra el template inline que #1216 edita y rompe los tests de #1216 |
| 1253 | 3 | +93/-3 | next | unstable | 1 | fix(ensure-deps): skip the cache swap when the active binary is already current (#1196) | ADAPTAR — el stamp se escribe ANTES del probe, asi que un probe fallido deja un binario roto con stamp valido |
| 970 | 3 | +100/-3 | next | clean | 53 | fix(store): add 14-day retention for the sessions/ directory (#949) | ADAPTAR — el sweep borra la propia DB del proyecto actual; replicar el patron exclude de cleanupStaleContentDBs |
| 1076 | 3 | +118/-0 | next | clean | 41 | feat: add CONTEXT_MODE_TOOLS allow-list to skip tool registration | ADAPTAR — el skip es silencioso (typo => toolset mysteriously reducido) y 2 tests reimplementan el guard |
| 1126 | 3 | +120/-122 | next | unstable | 28 | fix(pi): remove unverified tool-availability routing anchor | ADAPTAR — conservar sus tests (usan memoria real como senal) pero condicionar el anchor en vez de borrarlo; quitar CHANGELOG.md |
| 1143 | 3 | +130/-2 | next | unstable | 24 | fix(session): key cleanupOldSessions TTL off last activity, not started_at | ADOPTADO |
| 1172 | 3 | +177/-160 | next | unstable | 17 | fix(fetch): report concise subprocess errors | CONFLICTO — src/server.ts |
| 1155 | 3 | +181/-12 | main | unstable | 21 | Redact secrets from the debug report before it leaves the machine | DUDOSO — no alcanzado en el pre-cribado |
| 1145 | 3 | +187/-11 | next | unstable | 24 | fix: skip Claude self-healing for non-Claude launches | DUDOSO — no alcanzado en el pre-cribado |
| 1040 | 3 | +214/-20 | main | clean | 58 | fix(cost): emit opencode multi-step usage as deltas (#1036) | DUDOSO — no alcanzado en el pre-cribado |
| 1127 | 3 | +220/-19 | next | unstable | 27 | feat(server): make echo budgets configurable per host | ADOPTADO |
| 1019 | 3 | +228/-26 | next | clean | 53 | fix(security): honor Pi project permission settings | CONFLICTO — reaplicar a mano sobre src/security.ts |
| 1144 | 3 | +239/-10 | main | unstable | 24 | fix(ctx-debug): redact env blocks and credential-shaped keys in captured configs | ADOPTADO — ver commit |
| 1147 | 3 | +274/-34 | next | unstable | 23 | fix(exec): bound ctx_execute on Pi, which has no host-side ceiling | ADAPTAR — el diseno es lo mejor del lote; confirmar que 600s es aceptable en Pi (se quito un techo de 120s a proposito) |
| 1165 | 3 | +328/-30 | next | unstable | 19 | fix(codex): honor active sandbox state for file reads | DUDOSO — el mapeo de fallo es fail-CLOSED sobre un flag no verificado: status!=0 denies, asi que sin Codex instalado rompe toda lectura |
| 1066 | 3 | +416/-57 | main | clean | 46 | feat(omp): route broad tool calls and cap direct results | DESCARTAR — contradice a #1227 en el mismo handler y reimplementa el enrutado que ya existe en hooks/core/routing.mjs |
| 1240 | 4 | +59/-25 | next | unstable | 3 | fix: declare antigravity-cli Stop hook in the flat form agy accepts | ADOPTADO |
| 1227 | 4 | +78/-72 | next | unstable | 4 | fix(omp): allow quoted HTTP references and silent file downloads | ADAPTAR — su hasCurlWget reintroduce la forma laxa que reemplazamos con el anchor de posicion de comando |
| 1197 | 4 | +112/-116 | main | unstable | 11 | fix: reject unusable Bun shims and clarify OMP hook diagnostics | ADAPTAR — hasBunRuntime pasa de existsSync a lanzar subprocess por cada candidato; memoizar |
| 1154 | 4 | +113/-6 | next | unstable | 21 | fix(windows): suppress child process console windows | ADOPTADO |
| 988 | 4 | +117/-1 | main | clean | 74 | fix(store): opportunistic PASSIVE WAL checkpoint to bound the content-store WAL (#985) | ADOPTADO |
| 918 | 4 | +128/-104 | main | clean | 92 | fix(routing-block): remove injection-shaped framing (#911) | DESCARTAR — quita la regla ANTI-inyeccion que es lo que hace que una directiva capturada ceda al turno actual; tomar #1034 |
| 1246 | 4 | +133/-18 | next | unstable | 2 | fix(pi): isolate MCP bridges by session workspace | CONFLICTO — src/adapters/pi/, que tocamos en 391b235 |
| 871 | 4 | +294/-7 | next | clean | 53 | fix(db-base): extend withRetry to catch mid-session SQLITE_CORRUPT with lossless heal (#867) | ADAPTAR — limpia dbPath-wal/-shh en vez de backupPath-*: en multi-writer el WAL sobrevive y vuelve a corromper |
| 1209 | 4 | +330/-19 | next | unstable | 8 | fix(executor): run extensionless POSIX-shim python/node via Git Bash on Windows (#1208) | ADAPTAR — el override de commandExists acepta cualquier nombre sin probe --version; reutilizar runnableExists |
| 1009 | 4 | +400/-14 | main | clean | 68 | fix(executor): terminate abandoned execution trees | ADOPTAR — aplazar ownership.json: nada lo lee y es especulativo |
| 898 | 4 | +420/-318 | next | dirty | 53 | fix(store): cap oversized markdown chunks | REVERTIDO — el hunk entra, pero el lote entera dejo 117 fallos; queda pendiente reaplicar aislado |
| 991 | 4 | +435/-318 | next | dirty | 53 | fix: auto-index mid-size exec output for ctx_search without intent | ADAPTAR — tomar solo indexForSearch; el shortHash(code) relabela sources y dispara crecimiento de filas |
| 963 | 4 | +834/-389 | next | dirty | 53 | fix(store): bound FTS search result hydration for oversized rows | DUDOSO — convierte una busqueda limit:20 de 1 consulta en 21-41, en el camino de lectura mas caliente, por filas legacy |
| 1104 | 5 | +7/-5 | main | clean | 35 | fix(codex): route Code Mode exec through PreToolUse | ADOPTADO |
| 1158 | 5 | +44/-8 | next | unstable | 20 | fix(session): evict least-important events first | DESCARTADO — ya aplicado en este fork (eviction DESC + goal a priority 1) |
| 1161 | 5 | +51/-49 | next | unstable | 20 | fix(tool-naming): use native ctx_* names for OpenCode/KiloCode plugin tools | ADOPTADO |
| 1033 | 5 | +61/-2 | next | clean | 53 | Fix VS Code Remote-WSL project root detection (issue #1032) | ADAPTAR — el fallback sigue siendo process.cwd(), que en el escenario descrito tambien es el directorio de la app |
| 888 | 5 | +62/-74 | main | dirty | 97 | Fix/mcp singleton concurrency | ADAPTAR — revertir el hoist de boundProjectDir (cachea el project dir de un deny-checker que debe ser por-request); quitar stats.json; sin tests |
| 1034 | 5 | +75/-3 | next | clean | 53 | fix(routing): self-identify subagent routing block, add opt-out (#967) | ADOPTADO |
| 1113 | 5 | +80/-35 | next | clean | 32 | fix(detect): wait for MCP initialize before platform detect | ADAPTAR — el reorder de detect.ts es limpio; el half de server.ts abre una ventana async en la que _detectedAdapter es null |
| 1176 | 5 | +88/-8 | next | unstable | 16 | fix: make snippet and echo truncation surrogate-safe (#1163) | ADOPTADO |
| 913 | 5 | +90/-72 | next | clean | 53 | fix(standalone): use mcp__context-mode__ prefix when CLAUDE_PLUGIN_ROOT is absent | DUDOSO — no alcanzado en el pre-cribado |
| 996 | 5 | +120/-6 | main | clean | 72 | fix: honest session_state source label — "compaction" only after real compaction | DUDOSO — no alcanzado en el pre-cribado |
| 1256 | 5 | +136/-12 | next | unstable | 1 | fix(hooks): scope MCP readiness to the calling Claude Code session (#1055) | DUDOSO — no alcanzado en el pre-cribado |
| 1241 | 5 | +154/-19 | next | unstable | 3 | fix(session): attribute MCP work to caller session | DUDOSO — no alcanzado en el pre-cribado |
| 1247 | 5 | +176/-0 | next | unstable | 2 | fix(scripts): re-exec plugin shell scripts under bash for POSIX-sh callers (#1242) | PENDIENTE |
| 1220 | 5 | +177/-4 | next | unstable | 5 | fix(heal): keep project-scope installs out of user settings.json (#1215) | DUDOSO — no alcanzado en el pre-cribado |
| 1182 | 5 | +179/-19 | main | unstable | 15 | fix(pi): Honor AbortSignal so Escape cancels in-flight | DUDOSO — no alcanzado en el pre-cribado |
| 1231 | 5 | +317/-49 | main | unstable | 4 | fix(claude-code): restore external-MCP hook routing with `mcp__.*` (#1222) | ADOPTAR — tambien falta en src/adapters/codex/hooks.ts:60 y configs/codex/hooks.json:5 |
| 1111 | 5 | +332/-174 | next | unstable | 25 | fix(stats): stop heartbeat lifetime scans | ADAPTAR — lifetimeTokens queda en 0 para quien nunca llama ctx_stats: el statusline ve $0.00 permanente |
| 884 | 5 | +372/-198 | next | clean | 53 | docs: sync adapter install/usage/debugging with the code (v1.0.167) | DUDOSO — 250 lineas de observaciones de campo del autor presentadas como hecho, en hardware no especificado |
| 1167 | 5 | +1193/-572 | next | unstable | 18 | fix(windows): resolve runtime probes in-process instead of spawning where | REVERTIDO — rompe los seams de test que inyectan un where falso: el indice se construye de otra fuente. Windows-especifico e imposible de verificar en macOS |
| 1148 | 6 | +101/-10 | next | unstable | 16 | fix: bundle bin/statusline.mjs's analytics import (marketplace installs never get build/) | ADAPTAR — anadir bin/analytics.bundle.mjs a assert-bundles-committed o el guard no lo vera |
| 955 | 6 | +172/-19 | next | clean | 53 | feat(codex): load Windows guidance as a platform overlay | ADAPTAR |
| 939 | 6 | +200/-1 | main | clean | 87 | feat: add ctx_forget for per-source knowledge-base eviction | APLICADO Y REVERTIDO — rompio la suite (ctx_forget, anade registerTool en server.ts) |
| 952 | 7 | +419/-410 | main | clean | 84 | fix(stats): count only measured redirects as savings, label capture volume honestly | ADAPTAR — tomar (a) totalSavedTokens=bytesAvoided/4, (b) no plegar contentBytes, (c) el fix de renderCostExample; RECHAZAR el flip de getConversationWindowStats y los relabel, contradicen ADR-0004 |
| 1121 | 7 | +433/-214 | next | clean | 30 | fix(pi): stream context tool output | ADAPTAR — onOutput no distingue stdout de stderr y hace toString por chunk ( surrogates rotos); tomar el cambio de exit-classify aparte |
| 935 | 7 | +506/-308 | next | dirty | 53 | feat(opencode): add /ctx slash command to TUI for session stats | DUDOSO — tui.bundle.mjs es un artefacto nuevo que el script bundle no produce y el guard no rastrea |
| 1091 | 7 | +571/-354 | main | clean | 38 | fix(search): guard FTS5 highlight on oversized rows | REVERTIDO — el lote entera dejo 117 fallos; reaplicar aislado. Usar charSafePrefix en el slice de 1500, no content.slice |
| 1084 | 7 | +583/-6 | next | clean | 28 | fix(codex): redirect broad home searches before ingestion | ADAPTAR — no enmendar un ADR dentro de un PR de feature; la sustancia es correcta |
| 1124 | 7 | +669/-647 | next | unstable | 29 | adapters: Route network commands by transfer output | DUDOSO — borra 218 lineas de tests de un adapter y deja dos dueños de la regla de red |
| 1171 | 7 | +1741/-53 | main | unstable | 4 | fix(opencode): support OpenCode 2 plugin API (V1/V2 dual export) | DESCARTAR — superseded por #1194, y pone @opencode/plugin en dependencies sin que el codigo de produccion lo importe |
| 907 | 8 | +141/-31 | next | clean | 17 | fix(session): keep SessionStart truncation surrogate-safe | ADOPTAR — complementar #1176 (que ya tomamos) en los call sites que este no alcanzo; anadir el par a assert-asymmetric-drift |
| 1082 | 8 | +242/-33 | next | clean | 7 | mcp: name execution timeout in milliseconds | ADAPTAR — el rename sin alias daria runs sin limite; el .passthrough lo evita. Regenerar bundle;/docsgrep |
| 995 | 8 | +362/-299 | next | dirty | 53 | Fix Vitest Windows CI EPERM Hang | DESCARTAR — ademas del churn (afterEach entre imports, 6 espacios, push x3), bumpea stats.json |
| 866 | 8 | +479/-386 | next | dirty | 53 | fix(analytics): honor $CLAUDE_CONFIG_DIR in enumerateAdapterDirs (ctx_stats conversation count) | REVERTIDO — idem |
| 1029 | 8 | +613/-398 | next | dirty | 32 | fix(pi): propagate MCP cancellation to executor | DUDOSO — superseded en espirito por #904? no: #904 es el mas temprano y mas estrecho; #1029 es el general. Conflicto con #1121/#1082 |
| 980 | 8 | +2064/-462 | next | dirty | 53 | fix(batch): enforce indexed byte and chunk budgets | DUDOSO — borra formatCommandOutput y tests/core/echo-commands.test.ts deja de compilar; ademas structuredContent es un campo nuevo sin consumidor |
| 1060 | 9 | +79/-0 | next | clean | 47 | fix(snapshot): pass platform tool name into PreCompact resume snapshot (#1028) | DESCARTAR — subconjunto estricto de #1043, que ademas trae tests |
| 1181 | 9 | +134/-35 | next | unstable | 15 | fix(session): align priority contract and minPriority filtering | ADAPTAR — la db.ts ya esta; quedan src/types.ts:140-145 con la escala INVERTIDA, el docstring de extract.ts:2442 contradictorio, y el comentario de openclaw:836 |
| 904 | 9 | +496/-343 | main | clean | 94 | fix(pi): propagate abort signals through tools | DESCARTAR — superseded por #1029, que es el mismo defecto mas general |
| 877 | 9 | +623/-307 | next | dirty | 53 | fix(omp): replace large tool results with search references | ADAPTAR — no alcanzado en detalle |
| 1043 | 10 | +111/-0 | main | clean | 57 | fix(precompact): use platform ctx_search name in resume snapshot | PENDIENTE — no alcanzado en el pre-cribado |
| 1089 | 10 | +136/-44 | next | clean | 30 | fix: derive context-mode registry key | PENDIENTE — no alcanzado en el pre-cribado |
| 897 | 10 | +450/-392 | next | dirty | 53 | fix(claude-code): route PowerShell hooks on Windows | PENDIENTE — no alcanzado en el pre-cribado |
| 1178 | 10 | +644/-329 | next | dirty | 16 | feat(agy): capture user decisions and prompt events via PreInvocation hook | PENDIENTE — no alcanzado en el pre-cribado |
| 1123 | 16 | +514/-350 | main | unstable | 29 | fix: enforce the bounded resume snapshot budget | PENDIENTE — no alcanzado en el pre-cribado |
| 1194 | 17 | +3461/-894 | next | unstable | 12 | Opencode v2 compatibility (compaction within context-mode) | PENDIENTE — no alcanzado en el pre-cribado |
| 1044 | 20 | +1831/-334 | main | clean | 54 | feat(adapters): add Mistral Vibe platform adapter | PENDIENTE — no alcanzado en el pre-cribado |
| 1010 | 26 | +781/-310 | main | unstable | 10 | feat: add native Hermes Agent support | PENDIENTE — no alcanzado en el pre-cribado |
| 957 | 32 | +2697/-369 | next | dirty | 53 | feat: add Devin CLI adapter + decision extraction | PENDIENTE — no alcanzado en el pre-cribado |
