# Revisión de PRs de `mksglu/context-mode`

Un veredicto por PR. Nada se adopta sin leer el diff y comprobar que hace lo
que dice — tres de los doce PRs adoptados hasta ahora resultaron estar rotos o
con tests que probaban lo que querían (ver `git log`).

Veredicciones: `ADOPTADO` · `ADAPTADO` (fix válido, implementación
sustituida) · `DESCARTADO` (supersedido, incorrecto o sin valor) ·
`DIFERIDO` (requiere una decisión que no es del fix) · `PENDIENTE`.

## Cribado del lote final (29 PRs, 2026-10-04)

Los 29 `PENDIENTE`/`DUDOSO` que quedaban ya tienen veredicto. El cribado fue
mecánico primero — diffs bajados a disco, no al contexto, y cada added line
cruzada contra el árbol para medir cuanto del PR ya estaba aqui. Eso resolvio
solos varios: **#1247** ya estaba al 100% (y por eso #1243 se descarto como
supersedido), y **#1228** parecia "solo tests" hasta que se vio que tocaba
`hooks/hooks.json`.

**Implementados y verificados en esta tanda** (uno a uno, nunca en lote — la
leccion del repo es que "el lote entera dejo 117 fallos"):

- **#1043** — el snapshot post-compaction mandaba llamar `ctx_search`, un
  nombre que no existe en 7 plataformas. `searchTool` ya estaba implementado
  en `src/session/snapshot.ts`; solo faltaban los callers.
- **#1228** — ningun hook declaraba timeout: uno colgado bloqueaba el CLI sin
  salida. Arreglado en las dos rutas de instalacion, no solo en la que tocaba
  upstream.
- **#996** — `buildAutoInjection` etiquetaba `source="compaction"` en la
  inyeccion de rutina, cada turno, en un repo que ya habia basado su nombre
  ("context-mode") en no mentirle al modelo.
- **#1145** — el plugin de Codex lanza `start.mjs`, que desplegaba el self-heal
  de Claude Code y creaba `~/.claude/` para quien no tiene Claude Code.

Cada uno con un test que se verifico revirtiendo el fix (si el guard no muerde,
no es un test). Suite completa: 227 archivos / 4986 tests, `npm run build` con
`assert-bundle` y `assert-asymmetric-drift` en verde.

**Siguiente tanda, en este orden** (los ADAPTAR que quedan, con dependencia
respetada):

1. #1089 → #1220 — la plugin key hardcodeada rompe el self-heal en cuanto el
   marketplace no se llama como el repo. #1220 depende de #1089: tal cual,
   reintroduce el literal.
2. #913 — prefijo de claude-code segun `CLAUDE_PLUGIN_ROOT`. Premisa ya
   confirmada en el propio codigo del fork. Toca ~8 tests existentes.
3. #1155 — ampliar la redaction de `ctx-debug.sh` (superconjunto del #1144 ya
   adoptado). Subir solo la capa node: la capa `sed` de este fork no existe
   upstream.
4. #1256 → #1241 — el racimo de atribucion de sesion. (#1040 se salio de la
   cadena: su objeto, #1036, lo resolvio el port a v2 — ver la fila.) #1241 trae un
   bug de orden: consulta el env antes que el fichero que justamente existe
   porque el env queda stale.
5. #897, #1178, #1029 — #1029 es la pieza real de Pi AbortSignal (#1182 es su
   versión más débil, ya descartada). Los tres son Windows/Pi-específicos y no
   verificables desde macOS: su valor es el de la revisión, no el de la
   ejecución.

**Los 4 DIFERIDO no son_PR de fix**, sino decisiones de producto: #1123
reintroduciría un truncado que `src/session/snapshot.ts` declara explícitamente
no tener ("Zero truncation. Zero information loss"), y #957/#1010/#1044 son
adaptadores nuevos (Devin, Hermes, Mistral Vibe) — ~3700 líneas de superficie
pura. La pregunta "¿queremos soportar X?" no la responde una revisión de diff.

## Ya resueltos antes de la revisión individual

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
- **#1128** — reemplazado por #1189 (mismo fix, con tests negativos)
- **#1122** — DIFERIDO: sin test, y #1126 (draft) argue por borrarlo: decision de producto

## Veredictos (146)

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
| 1177 | 2 | +32/-6 | next | unstable | 16 | fix(batch): export NODE_OPTIONS so compound shell commands work (#1117) | ADAPTADO — aplicado en c29b211 (tanda con 1056/907). buildBatchNodeOptionsPrefix pasa de prefijo inline NODE_OPTIONS= a export; verificado empíricamente (bash -c con for/while = syntax error antes). Supersede #934. |
| 931 | 2 | +37/-16 | next | clean | 49 | fix: surface statusline analytics import failures (#894) | ADOPTADO |
| 969 | 2 | +40/-5 | next | clean | 53 | fix(batch): re-create the fs-preload temp file if an OS cleaner removed it (#951) | ADOPTADO |
| 864 | 2 | +41/-9 | next | unstable | 53 | Hide Pi context injection from user entry | DESCARTAR — `role:"custom"` + `display:false` en el hook `context` de Pi. No verificable sin Pi instalado y este repo no tiene refs de Pi. #1002 ya se descarto por ser el diseno opuesto (mover el contexto a systemPrompt), asi que elegir aqui es elegir entre dos contratos incompatibles a ciegas |
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
| 876 | 2 | +67/-3 | next | clean | 53 | fix(omp): seed APPEND_SYSTEM.md routing instructions | DESCARTAR — `APPEND_SYSTEM.md` no aparece en ningun sitio de este fork y el propio adapter de OMP documenta lo contrario. No se puede confirmar que OMP lo descubra, y un anchor de routing que nunca se lee es peor que ninguno |
| 921 | 2 | +68/-3 | next | dirty | 53 | fix: dedupe chunks across queries in a multi-query ctx_search call | ADAPTAR — los tests ejercitan el helper aislado; el cableado al handler no esta probado |
| 986 | 2 | +78/-3 | main | clean | 74 | fix(db): replace SQLITE_BUSY busy-wait backoff with Atomics.wait sleep (#985) | DESCARTADO — ya aplicado en este fork con una implementacion mejor (celda compartida a nivel de modulo) |
| 1236 | 2 | +79/-5 | next | unstable | 3 | fix(stats): probe session schemas read-only before migration | ADOPTADO |
| 1030 | 2 | +85/-6 | next | clean | 53 | fix(db): retry transient SQLITE_IOERR instead of failing the caller | ADAPTAR — la direccion es correcta; hay que revisar que IOERR no entre al predicado de corrupcion |
| 1228 | 2 | +89/-14 | next | unstable | 0 | fix(hooks): ship default timeouts so a hung hook cannot block the CLI | ADAPTADO — timeout en las 15 entradas de `hooks/hooks.json` (PreToolUse 10s por ser el camino critico de cada tool call, resto 30s) Y en `generateHookConfig`, que upstream no toco y es la ruta de los installs standalone: sin ahi un hook colgado sigue bloqueando el CLI. Constante unica en `claude-code/hooks.ts` + test que ata ambos ficheros |
| 1086 | 2 | +90/-3 | next | clean | 40 | fix(hooks): scan quotes left to right so prose apostrophes cannot expose a command | ADOPTADO |
| 1056 | 2 | +94/-12 | next | clean | 50 | fix(db): stop mutating shared DB files across processes (close-time TRUNCATE checkpoint + default mmap) | ADAPTADO — aplicado en 9c12c7d. closeDB sin TRUNCATE + mmap opt-in; comentarios adaptados (el timer PASSIVE de #988 aquí EXISTE y está cableado). |
| 1160 | 2 | +95/-2 | next | unstable | 20 | fix(opencode): merge sibling config plugin arrays when writing opencode.jsonc | DESCARTADO — la caida de OpenCode v1 le quita el objeto: fusionar el array `plugin` de opencode.jsonc solo importa si algo escribe ese array. En v2 la key `plugin` no se lee (resuelve npm specifiers) y el install ya no la escribe. El sintoma (arrays siblings que se pisan al escribir la config) desaparece con la causa. Anotado antes como ADOPTAR bajo el supuesto de que v1 seguia vivo.|
| 1238 | 2 | +96/-4 | next | unstable | 3 | fix(fetch): keep nested fenced examples intact during extraction | DESCARTAR — src/fetch/ no existe en este fork; es solo de next |
| 1129 | 2 | +110/-9 | next | unstable | 8 | fix(hooks): pin ABI healing to the running Node | CONFLICTO — hooks/ensure-deps.mjs, que tocamos en 45d5185 |
| 929 | 2 | +110/-1 | next | clean | 49 | fix(packaging): guard packaged helper scripts | ADOPTADO |
| 1237 | 2 | +115/-9 | next | unstable | 3 | fix(executor): preserve Rust execution cwd and sandbox lifecycle | ADAPTADO — aplicado en c44dd67. Rust corre en el cwd del proyecto (cwdOverride ya respetado) y el sandbox se limpia en éxito/exit≠0/fallo-de-compilación, se retiene en background. 5 tests runIf(rust), rustc 1.98.0 presente. |
| 1116 | 2 | +118/-6 | next | clean | 32 | feat(omp): restore resume snapshot after compact | ADAPTAR — _pendingContext no se resetea en session_start, asi que un snapshot de la sesion A se inyecta en la B |
| 1239 | 2 | +141/-4 | next | unstable | 3 | fix(gemini-cli): retain sibling hooks when upgrading | APLICADO Y REVERTIDO — rompio la suite (hooks de gemini) |
| 1252 | 2 | +161/-68 | next | unstable | 1 | fix(stats): stop counting binary reads and responses as saved tokens (#1151) | ADAPTADO — aplicado en 43a7731. __cm_tb (NUL en primeros 8000B = binario = 0) en wrapper + preload + clasificación-once por primer chunk en http. Firma adaptada: 2o parámetro es keepAlive (#975), no background; CM_FS_PRELOAD_SRC conserva su nombre (#951) y gana export. |
| 1216 | 2 | +163/-4 | next | unstable | 6 | fix(cache-heal): anchor version filter and report dead installPaths (#1191) | ADAPTAR — statSync->lstatSync rompe los version dirs que sean symlink (dev builds), y el regex rechaza semver de 4 segmentos |
| 1249 | 2 | +169/-1 | next | unstable | 2 | fix(pi): decode MCP stdout incrementally so multi-byte text survives chunk boundaries | ADOPTADO |
| 1234 | 2 | +189/-41 | next | unstable | 3 | fix(codex): trust rollout content timestamp over mtime for Windows staleness check | ADOPTADO |
| 1229 | 2 | +190/-15 | next | unstable | 4 | fix: scope session-event indexing to the current project (#1214) | ADOPTADO |
| 1166 | 2 | +220/-13 | next | unstable | 18 | fix(pi): spawn a Windows-spawnable runtime and keep bridge diagnostics | ADAPTADO — aplicado en fbada86. isSpawnable (.exe/.com en win32) + spawnExitError + diag persistente en <piConfigDir>/context-mode/bridge-diag.log. El bloque decoder incremental del fork queda intacto bajo el nuevo parámetro cause. |
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
| 1155 | 3 | +181/-12 | main | unstable | 21 | Redact secrets from the debug report before it leaves the machine | ADAPTADO — aplicado (7eebf16) pero NO como el PR lo planteaba: el fork ya tiene scripts/lib/ctx-debug-redact.mjs como superconjunto. El hueco real era KEYED_VALUE_RE exigiendo key entre comillas — openai_api_key = ... en config.toml (Codex) pasaba SIN redactar, fuga confirmada empiricamente. Fix: maskAssignmentLine() + flag redacted:true en ctx-debug.sh. 2 guards muerden. |
| 1145 | 3 | +187/-11 | next | unstable | 24 | fix: skip Claude self-healing for non-Claude launches | ADAPTADO — dos mitades. (a) Los skips `no-plugin-root` y `not-claude-code` ya no loggean: son justo las ramas que prueban que NO es Claude Code, asi que escribir ahi plantaba evidencia de un install CC. (b) `isClaudeLaunch` en start.mjs, porque el plugin de Codex tambien lanza start.mjs con CONTEXT_MODE_PLATFORM=codex y creaba `~/.claude/hooks/` para quien no tiene Claude Code. Sin plataforma declarada se mantiene el heal: Claude Code nunca pone la var |
| 1040 | 3 | +214/-20 | main | clean | 58 | fix(cost): emit opencode multi-step usage as deltas (#1036) | DESCARTADO — su objeto era #1036, y #1036 ya no es una issue abierta: es codigo de este fork. El port a v2 lo encontro y lo corrigio (usageDelta), verificado contra la DB real de sesion. Ademas la premisa del PR es falsa en v2: aqui .tokens tambien es acumulado, no last-step, asi que el diff upstream no aplica. La nota de conservar el bloque de comentarios que documenta la semantica quedo satisfecha: usageDelta lo documenta junto a la tabla de valores medidos.|
| 1127 | 3 | +220/-19 | next | unstable | 27 | feat(server): make echo budgets configurable per host | ADOPTADO |
| 1019 | 3 | +228/-26 | next | clean | 53 | fix(security): honor Pi project permission settings | CONFLICTO — reaplicar a mano sobre src/security.ts |
| 1144 | 3 | +239/-10 | main | unstable | 24 | fix(ctx-debug): redact env blocks and credential-shaped keys in captured configs | ADOPTADO — ver commit |
| 1147 | 3 | +274/-34 | next | unstable | 23 | fix(exec): bound ctx_execute on Pi, which has no host-side ceiling | ADAPTAR — el diseno es lo mejor del lote; confirmar que 600s es aceptable en Pi (se quito un techo de 120s a proposito) |
| 1165 | 3 | +328/-30 | next | unstable | 19 | fix(codex): honor active sandbox state for file reads | DESCARTAR — falla cerrado sobre un flag no verificado: `status != 0` deniega, asi que sin Codex instalado rompe TODA lectura de archivos. El fail-closed deberia ser la excepcion, no el default |
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
| 1009 | 4 | +400/-14 | main | clean | 68 | fix(executor): terminate abandoned execution trees | ADAPTADO — aplicado en b7fa572. extra.signal end-to-end (wrapToolHandler reenvía args+extra), pre-abort sin spawn, killTree del root exacto + settle 1500ms, ownership.json sidecar metadata-only. Tests adaptados: bases OS_TMPDIR reales (getconf, bypass TMPDIR) y realpath en la aserción de containment (/var→/private/var). |
| 898 | 4 | +420/-318 | next | dirty | 53 | fix(store): cap oversized markdown chunks | REVERTIDO — el hunk entra, pero el lote entera dejo 117 fallos; queda pendiente reaplicar aislado |
| 991 | 4 | +435/-318 | next | dirty | 53 | fix: auto-index mid-size exec output for ctx_search without intent | ADAPTAR — tomar solo indexForSearch; el shortHash(code) relabela sources y dispara crecimiento de filas |
| 963 | 4 | +834/-389 | next | dirty | 53 | fix(store): bound FTS search result hydration for oversized rows | DIFERIDO — convierte una busqueda `limit:20` de una consulta en 21-41 en el camino de lectura mas caliente, y solo para filas legacy. `src/store.ts` divergio mucho respecto a upstream; sin timings medidos que justifiquen el coste no se toca el bus mas caliente |
| 1104 | 5 | +7/-5 | main | clean | 35 | fix(codex): route Code Mode exec through PreToolUse | ADOPTADO |
| 1158 | 5 | +44/-8 | next | unstable | 20 | fix(session): evict least-important events first | DESCARTADO — ya aplicado en este fork (eviction DESC + goal a priority 1) |
| 1161 | 5 | +51/-49 | next | unstable | 20 | fix(tool-naming): use native ctx_* names for OpenCode/KiloCode plugin tools | ADOPTADO |
| 1033 | 5 | +61/-2 | next | clean | 53 | Fix VS Code Remote-WSL project root detection (issue #1032) | ADAPTAR — el fallback sigue siendo process.cwd(), que en el escenario descrito tambien es el directorio de la app |
| 888 | 5 | +62/-74 | main | dirty | 97 | Fix/mcp singleton concurrency | ADAPTAR — revertir el hoist de boundProjectDir (cachea el project dir de un deny-checker que debe ser por-request); quitar stats.json; sin tests |
| 1034 | 5 | +75/-3 | next | clean | 53 | fix(routing): self-identify subagent routing block, add opt-out (#967) | ADOPTADO |
| 1113 | 5 | +80/-35 | next | clean | 32 | fix(detect): wait for MCP initialize before platform detect | ADAPTAR — el reorder de detect.ts es limpio; el half de server.ts abre una ventana async en la que _detectedAdapter es null |
| 1176 | 5 | +88/-8 | next | unstable | 16 | fix: make snippet and echo truncation surrogate-safe (#1163) | ADOPTADO |
| 913 | 5 | +90/-72 | next | clean | 53 | fix(standalone): use mcp__context-mode__ prefix when CLAUDE_PLUGIN_ROOT is absent | ADAPTADO — aplicado (9048f2b): TOOL_PREFIXES['claude-code'] depende de CLAUDE_PLUGIN_ROOT en runtime. Los '~8 tests' del cribado eran 14. omp NO esta en TOOL_PREFIXES pero su adapter nunca llama al namer — aniadirlo habria sido superficie especulativa, no se toco. |
| 996 | 5 | +120/-6 | main | clean | 72 | fix: honest session_state source label — "compaction" only after real compaction | ADAPTADO — `buildAutoInjection` sin default: la etiqueta se gano o no se gano. Anadido guard en runtime porque los callers de `hooks/` son `.mjs` y ahi no hay aridad: sin el, un argumento ausente interpolaba `source="undefined"`. sessionstart+opencode = "compaction" (estan tras un resume pendiente real); Pi = "active_memory" con `_pendingCompactLabel` armado en session_compact |
| 1256 | 5 | +136/-12 | next | unstable | 1 | fix(hooks): scope MCP readiness to the calling Claude Code session (#1055) | ADAPTADO — aplicado (4831468): sentinel con host PID + ownAncestorPids() con una sola llamada ps. El PR no conocia el guard #1037 (CONTEXT_MODE_ALLOW_WEBFETCH) de este fork — fusionados, ambos vivos. Fail-open sin ps, scope solo claude-code. 2 guards muerden. |
| 1241 | 5 | +154/-19 | next | unstable | 3 | fix(session): attribute MCP work to caller session | ADAPTADO — aplicado (6ab4fea) con el orden INVERTIDO respecto al PR: el upstream consultaba CLAUDE_SESSION_ID primero, contradiciendo su propio docstring (el env queda stale tras /clear). Aqui sessions/<ppid>.json primero, env despues. Su test 'prefers explicit override' fijaba el defecto y se elimino. 1 guard muerde (before-clear/after-clear). |
| 1247 | 5 | +176/-0 | next | unstable | 2 | fix(scripts): re-exec plugin shell scripts under bash for POSIX-sh callers (#1242) | ADOPTADO (ya en el arbol) — el 100% de sus lineas coincide con el codigo actual; por eso #1243 se descarto como supersedido por este |
| 1220 | 5 | +177/-4 | next | unstable | 5 | fix(heal): keep project-scope installs out of user settings.json (#1215) | ADAPTADO — aplicado (3f61585): hasUserScopeInstall() gatea enabledPlugins. Dos sitios reintroducian el literal que el PR prohibe: postinstall.mjs (resuelto derivando de #1089) y start.mjs Layer 4 en otro bloque try (re-derivacion alli tambien). 5 guards muerden. |
| 1182 | 5 | +179/-19 | main | unstable | 15 | fix(pi): Honor AbortSignal so Escape cancels in-flight | DESCARTAR — misma familia que #1029 pero mas debil: no limpia el timer en el abort (fuga) ni usa `throwIfAborted` antes de escribir. Quedate con #1029 |
| 1231 | 5 | +317/-49 | main | unstable | 4 | fix(claude-code): restore external-MCP hook routing with `mcp__.*` (#1222) | ADOPTADO (ya en el árbol) — llegó con el sync upstream 2db0d7f como f530d44 (Yi-111-a, #1222): EXTERNAL_MCP_MATCHER_PATTERN=mcp__.*, catch-all en entrada propia, heal del bare mcp__ y POST_TOOL_USE_MCP_CATCH_ALL_MATCHER, todo presente. El cribado original lo marcó accionable por el diff, no por el contenido. |
| 1111 | 5 | +332/-174 | next | unstable | 25 | fix(stats): stop heartbeat lifetime scans | ADAPTAR — lifetimeTokens queda en 0 para quien nunca llama ctx_stats: el statusline ve $0.00 permanente |
| 884 | 5 | +372/-198 | next | clean | 53 | docs: sync adapter install/usage/debugging with the code (v1.0.167) | DESCARTAR — 372 lineas de sincronizacion de docs, 0 tests, y presenta como hecho lo que son notas de campo del autor sobre hardware no especificado. La deriva real de docs se arregla leyendo el codigo, no adoptando un changelog de observaciones |
| 1167 | 5 | +1193/-572 | next | unstable | 18 | fix(windows): resolve runtime probes in-process instead of spawning where | REVERTIDO — rompe los seams de test que inyectan un where falso: el indice se construye de otra fuente. Windows-especifico e imposible de verificar en macOS |
| 1148 | 6 | +101/-10 | next | unstable | 16 | fix: bundle bin/statusline.mjs's analytics import (marketplace installs never get build/) | ADAPTAR — anadir bin/analytics.bundle.mjs a assert-bundles-committed o el guard no lo vera |
| 955 | 6 | +172/-19 | next | clean | 53 | feat(codex): load Windows guidance as a platform overlay | ADAPTAR |
| 939 | 6 | +200/-1 | main | clean | 87 | feat: add ctx_forget for per-source knowledge-base eviction | APLICADO Y REVERTIDO — rompio la suite (ctx_forget, anade registerTool en server.ts) |
| 952 | 7 | +419/-410 | main | clean | 84 | fix(stats): count only measured redirects as savings, label capture volume honestly | ADAPTAR — tomar (a) totalSavedTokens=bytesAvoided/4, (b) no plegar contentBytes, (c) el fix de renderCostExample; RECHAZAR el flip de getConversationWindowStats y los relabel, contradicen ADR-0004 |
| 1121 | 7 | +433/-214 | next | clean | 30 | fix(pi): stream context tool output | ADAPTAR — onOutput no distingue stdout de stderr y hace toString por chunk ( surrogates rotos); tomar el cambio de exit-classify aparte |
| 935 | 7 | +506/-308 | next | dirty | 53 | feat(opencode): add /ctx slash command to TUI for session stats | DESCARTAR — crea `tui.bundle.mjs`, un artefacto que el script `bundle` no produce y que `assert-bundles-committed` no rastrea (ninguno de los dos loerian); ademas 0 tests |
| 1091 | 7 | +571/-354 | main | clean | 38 | fix(search): guard FTS5 highlight on oversized rows | REVERTIDO — el lote entera dejo 117 fallos; reaplicar aislado. Usar charSafePrefix en el slice de 1500, no content.slice |
| 1084 | 7 | +583/-6 | next | clean | 28 | fix(codex): redirect broad home searches before ingestion | ADAPTAR — no enmendar un ADR dentro de un PR de feature; la sustancia es correcta |
| 1124 | 7 | +669/-647 | next | unstable | 29 | adapters: Route network commands by transfer output | DESCARTAR — borra 218 lineas de tests de un adapter y reintroduce la heuristica "por transfer output" que este fork ya sustituyo por el anchor de posicion de comando (#1227, que sigue vivo). Dos duenos de la regla de red no es una mejora |
| 1171 | 7 | +1741/-53 | main | unstable | 4 | fix(opencode): support OpenCode 2 plugin API (V1/V2 dual export) | DESCARTAR — superseded por #1194, y pone @opencode/plugin en dependencies sin que el codigo de produccion lo importe |
| 907 | 8 | +141/-31 | next | clean | 17 | fix(session): keep SessionStart truncation surrogate-safe | ADAPTADO — aplicado en c198638. hooks/safe-prefix.mjs + call sites de auto-injection/session-directive/snapshot; la nota de assert-asymmetric-drift era precautoria (pasa sin registro). |
| 1082 | 8 | +242/-33 | next | clean | 7 | mcp: name execution timeout in milliseconds | ADAPTAR — el rename sin alias daria runs sin limite; el .passthrough lo evita. Regenerar bundle;/docsgrep |
| 995 | 8 | +362/-299 | next | dirty | 53 | Fix Vitest Windows CI EPERM Hang | DESCARTAR — ademas del churn (afterEach entre imports, 6 espacios, push x3), bumpea stats.json |
| 866 | 8 | +479/-386 | next | dirty | 53 | fix(analytics): honor $CLAUDE_CONFIG_DIR in enumerateAdapterDirs (ctx_stats conversation count) | REVERTIDO — idem |
| 1029 | 8 | +613/-398 | next | dirty | 32 | fix(pi): propagate MCP cancellation to executor | ADAPTAR — la pieza real de Pi AbortSignal: `src/executor.ts` no tiene `signal` en este fork (#1164 mata el arbol del bridge, no el del executor). Hilo de AbortSignal desde registerTool hasta ctx_execute/execute_file/batch_execute. Diff invasivo: aplicarlo solo |
| 980 | 8 | +2064/-462 | next | dirty | 53 | fix(batch): enforce indexed byte and chunk budgets | DESCARTAR — depende de `src/batch-ingestion.ts`, que no existe en este fork; borra `formatCommandOutput` y deja `tests/core/echo-commands.test.ts` sin compilar; y `structuredContent` es un campo nuevo sin ningun consumidor |
| 1060 | 9 | +79/-0 | next | clean | 47 | fix(snapshot): pass platform tool name into PreCompact resume snapshot (#1028) | DESCARTAR — subconjunto estricto de #1043, que ademas trae tests |
| 1181 | 9 | +134/-35 | next | unstable | 15 | fix(session): align priority contract and minPriority filtering | ADAPTAR — la db.ts ya esta; quedan src/types.ts:140-145 con la escala INVERTIDA, el docstring de extract.ts:2442 contradictorio, y el comentario de openclaw:836 |
| 904 | 9 | +496/-343 | main | clean | 94 | fix(pi): propagate abort signals through tools | DESCARTAR — superseded por #1029, que es el mismo defecto mas general |
| 877 | 9 | +623/-307 | next | dirty | 53 | fix(omp): replace large tool results with search references | ADAPTAR — no alcanzado en detalle |
| 1043 | 10 | +111/-0 | main | clean | 57 | fix(precompact): use platform ctx_search name in resume snapshot | ADOPTADO — `searchTool` ya existia en `src/session/snapshot.ts:477`; faltaban los callers. Aplicado a los 7 hooks donde el nombre estaba mal (claude-code, codex, gemini-cli, kimi, vscode-copilot, jetbrains-copilot, copilot-cli). opencode/pi/openclaw/omp ya daban el nombre bare correcto, que es el default |
| 1089 | 10 | +136/-44 | next | clean | 30 | fix: derive context-mode registry key | ADAPTADO — aplicado tal cual (11ce066): resolveContextModePluginKey() en scripts/heal-installed-plugins.mjs deriva la key del registry e invierte el cache path a <marketplace>/<plugin>. Sin adaptacion real: el diff upstream entro limpio. 6 guards muerden. |
| 897 | 10 | +450/-392 | next | dirty | 53 | fix(claude-code): route PowerShell hooks on Windows | ADAPTAR — anade PowerShell a los 4 mapas de una vez (TOOL_ALIASES, PRE/POST matchers, hooks.json, TOOL_NAME_NORMALIZE) con 3 tests. Mecanico y consistente, pero Windows-only: no verificable en macOS, asi que su valor es el de la revision, no el de la ejecucion |
| 1178 | 10 | +644/-329 | next | dirty | 16 | feat(agy): capture user decisions and prompt events via PreInvocation hook | ADAPTAR — hook PreInvocation para `agy` (captura de decisiones del usuario): 207 lineas, 1 test. Sin test de la logica de payload, y bumpea `stats.json` — quitar ese hunk |
| 1123 | 16 | +514/-350 | main | unstable | 29 | fix: enforce the bounded resume snapshot budget | DIFERIDO — `src/session/snapshot.ts` declara "Zero truncation. Zero information loss" y su `maxBytes` esta "KEPT for backward compat but IGNORED". #1123 reintroduce el truncado a 2048B con prioridad por seccion. No es revisar un fix, es revertir un invariante declarado del fork: decision de producto |
| 1194 | 17 | +3461/-894 | next | unstable | 12 | Opencode v2 compatibility (compaction within context-mode) | DESCARTAR — el trabajo ya esta: #1171 se descarto por supersedido por este, y #1161 (ADOPTADO) ya usa los nombres `ctx_*` nativos de OpenCode. Ademas parte `plugin.ts` en core/plugin/plugin-v2 y mete `@opencode/plugin` en dependencies sin que el codigo de produccion lo importe |
| 1044 | 20 | +1831/-334 | main | clean | 54 | feat(adapters): add Mistral Vibe platform adapter | DIFERIDO — adaptador nuevo de Mistral Vibe: 1031 lineas, 6 archivos nuevos, y borra 4 lineas de tests de los existentes. Decision de producto |
| 1010 | 26 | +781/-310 | main | unstable | 10 | feat: add native Hermes Agent support | DIFERIDO — adaptador nuevo de Hermes. Ademas trae `__init__.py` en la raiz de un repo Node/TS y un `plugin.yaml` en la raiz: senal de que el PR se armo contra otra estructura. Decision de producto, no de fix |
| 957 | 32 | +2697/-369 | next | dirty | 53 | feat: add Devin CLI adapter + decision extraction | DIFERIDO — adaptador nuevo de Devin CLI: 1332 lineas, 12 archivos nuevos, 4 tests que no tocan lo existente. Superficie pura, no un fix: la pregunta es si el fork quiere soportar Devin, y eso no lo responde una revision de diff |
