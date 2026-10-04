# Triage por caída de OpenCode v1

Fecha: 2026-10-04. Contexto: el adapter de OpenCode ya está portado a v2
(`src/adapters/opencode/plugin.ts` exporta `{ id, server, setup }`), verificado
en opencode 2.0.22 con los 11 tools `ctx_*` y los 5 hooks vivos.

Fuentes: `pr-review.md` (147 veredictos) e `issue-review.md` (164 issues).

## El número que importa primero

La caída de v1 **no es una palanca grande sobre el backlog**:

| | total | toca la caída de v1 |
|---|---|---|
| Issues `PENDIENTE` | 106 | **7** |
| PRs no adoptados | 111 | **6** |

Las otras 98 issues pendientes son agnósticos de plataforma (linux, windows,
store, executor, sesion, stats, core). Decidir "ya no suporto v1" no las mueve.

Donde sí muerde es en dos sitios: (1) handful de ítems que quedan **muertos**,
(2) trabajo **nuevo** que la caída crea y que ningún ledger registra todavía.

## Issues: 7 abiertas, contra la caída de v1

### Cerrar ahora — la caída las resolvió

| # | título | por qué |
|---|---|---|
| 1199 | `OpenCode 2.x plugin fails to load (needs a V2 adapter: { id, effect \| setup })` | Es literalmente el error que desbloqueamos. El `setup` ya existe y el plugin carga. → `RESUELTO-AQUI` |
| 1187 | `[Feature]: Opencode V2 support` | Ídem. → `RESUELTO-AQUI` |

### Aplican — re-enmarcar, no descartar

| # | título | estado tras el port |
|---|---|---|
| 1036 | opencode adapter appends cumulative turn cost once per step, over-counting multi-step turns | **CONFIRMADO y corregido.** Medido en vivo: un turno de 3 pasos emitió `session.usage.updated` con `tokens.input` subiendo 1279918 → 1280031 → 1280078. El payload es el acumulado del turno y el evento dispara **una vez por paso**, así que insertarlo literal sobreregistra ~3x. Corregido con `usageDelta()`. Ojo: en v1 el bug era solo de `.cost` (tokens era last-step); en v2 **ambos** lados son acumulados y ambos necesitan delta. |
| 1085 | `[OpenCode adapter] experimental.chat.system.transform injects extra system-role messages` | El hook v1 ya no existe, pero el defecto **no**: el port hace el mismo `splice(1, 0, …)` dentro de `SystemPart[]`. Reetiquetar a `ctx.session.hook("context")` y verificar contra Qwen estricto. |
| 1255 | `"opencode" missing from the MCP clientInfo map` — platform detection silently resolves | Aplica tal cual. La detección de plataforma no cambió. |
| 1053 | `isMCPReady() gate swallows all redirects in plugin-only embedded mode` | Aplica: el modo embebido sin MCP (`CONTEXT_MODE_EMBEDDED_PLUGIN_TOOLS`) sigue siendo el caminho del plugin en v2. |
| 1254 | `ctx_stats reports OpenCode as "Skipped / no real chat activity"` | Aplica, y con más urgency: el importador multi-adapter no reconoce los eventos v2. |

### Descartar

Ninguna de las 7. Ni una sola muere por la caída de v1 — o se cierra, o se
re-enmarca. Esto es lo contrario de lo que el enunciado sugiere, y conviene
decirlo antes de borrar nada.

## PRs: 6 abiertas, contra la caída de v1

### Muere — el objeto del trabajo desaparece

| # | título | veredicto actual | nuevo |
|---|---|---|---|
| 1160 | `fix(opencode): merge sibling config plugin arrays when writing opencode.jsonc` | ADAPTAR | **DESCARTAR.** Arregla la escritura de la key `plugin` (v1) al fusionar configs. Si v1 deja de escribirse, no hay array que fusionar. |
| 935 | `feat(opencode): add /ctx slash command to TUI for session stats` | DESCARTAR | **DESCARTAR (doble).** Además de lo que ya se dijo del artefacto, es un TUI plugin de opencode — y los TUI plugins son justo lo que se eliminó al migrar a v2. |

### Sube de prioridad

| # | título | por qué |
|---|---|---|
| 1040 | `fix(cost): emit opencode multi-step usage as deltas (#1036)` | Era `ADAPTAR` de media prioridad; con #1036 siendo ahora código nuestro, es el fix que lo cierra. Mantener la regla del ledger: conservar el bloque de comentarios que documenta `.tokens` = last-step / `.cost` = acumulado. La honestidad de las etiquetas es invariante de este fork. |

### Sin cambio

| # | título | por qué |
|---|---|---|
| 1001 | `fix(pricing): add MiniMax catalog entries` | Agnóstico de plataforma. Las tarifas de MiniMax-M3 están al doble, y este fork corre con MiniMax. Barato, independiente. |
| 1148 | `fix: bundle bin/statusline.mjs's analytics import` | Empaquetado, no opencode. |

### Ya descartadas, pero la razón quedó obsoleta

| # | veredicto actual | nota |
|---|---|---|
| 1194 | DESCARTAR — "el trabajo ya está" | La razón era `#1161 ya usa los nombres ctx_*`. Ahora es literalmente cierta, pero por *otro* motivo: el port propio. Actualizar la nota o el ledger miente sobre por qué se descartó. |
| 1171 | DESCARTAR — superseded por #1194 | Igual. Además su crítica ("pone `@opencode/plugin` en dependencies sin que el código de producción lo importe") sigue siendo válida: el port evita el import de runtime, pero `@opencode/plugin` debe ser **devDependency** para el typecheck de los tipos `Plugin`/`Context`. Hoy no lo está. |

## Trabajo NUEVO que la caída crea (no está en ningún ledger)

Esto es lo que ningún ledger registra y es el coste real de la decisión:

1. **`configs/opencode/opencode.json` sigue sirviendo `"plugin": ["context-mode"]`.**
   En v2 esa entrada hace que opencode intente instalar `context-mode` desde npm
   — la versión **sin portar** de upstream. Un usuario que siga la doc del repo
   recibe el plugin roto. Hay que cambiarlo a instalación por descubrimiento
   (`plugins/context-mode.{ts,js}`) o documentar el shim.

2. **`ctx_upgrade` / el path de install siguen escribiendo la key `plugin` v1**
   en la config del usuario. Con v1 muerto, `context-mode upgrade` reintroduce
   una entrada que v2 no lee. `src/cli.ts`, `src/lifecycle.ts`, `src/runtime.ts`.

3. **Nombres de hook v1 vivos en el código:**
   `src/adapters/types.ts`, `src/adapters/opencode/{plugin,index,hooks}.ts`
   siguen exportando `OPENCODE_HOOK_NAMES` con `tool.execute.before`,
   `chat.message`, `experimental.session.compacting`. Con v1 muerto, el mapa
   `Hooks` de v1 y `createContextModePlugin` sobran (~200 líneas de
   `plugin.ts` + el andamiaje de tipos).

4. **KiloCode comparte el adapter entero.** `src/adapters/opencode/index.ts:86`
   declara `Extract<PlatformId, "opencode" | "kilo">` y `getPlatform()` resuelve
   `kilo` antes que `opencode`. KiloCode es un fork de OpenCode con la API v1.
   **Caer de v1 = perder KiloCode.** Es decisión de producto, no técnica, y no
   está escrita en ningún sitio. Decidirlo explícitamente antes de tocar código.

5. **125 tests v1 se quedan sin consumidor.** `tests/opencode-plugin.test.ts`
   ejercita exclusivamente `ContextModePlugin()` con la firma v1
   (`{ directory, client: { app: { log } } }`) y un hook map v1. Al caer v1 hay
   que borrarlos o reescribirlos contra `setup(ctx)`. `tests/adapters/opencode-v2.test.ts`
   (11 tests) es la superficie v2 y ya existe.

6. **`ctx_upgrade` y el doctor Asumen el array `plugin`.** El doctor ya se
   corrigió para aceptar descubrimiento (`hasContextModePlugin` →
   `hasDiscoveredContextModePlugin` en `src/adapters/opencode/index.ts`), pero
   el mensaje y el resto del path de install siguen asumiendo v1.

## Orden sugerido

1. Decidir KiloCode (ítem 4). Bloquea todo lo demás: cambia el alcance del
   andamiaje v1 que hay que tirar.
2. #1036 + PR #1040 — el único bug **introducido** por el port. Primero.
3. Marcar #1187 y #1199 como `RESUELTO-AQUI` en `issue-review.md`.
4. Correr `configs/opencode/opencode.json` (ítem 1) antes de que alguien más lo
   lea y ejecute la instrucción equivocada.
5. Luego la limpieza de v1 (ítems 2, 3, 5, 6) como un commit aparte, porque
   borra ~200 líneas y =~125 tests y no debe mezclarse con fixes de bug.
6. #1085, #1255, #1053, #1254 — independientes, en cualquier orden.


## Ejecutado (2026-10-04)

- **#1036** — bug confirmado empíricamente y corregido. Se instrumentó el
  stream real de eventos con una sonda desechable. Corrección: `usageDelta()` +
  `readUsageSnapshot()` en el path v2, con 8 tests que fijan los valores medidos.
  `@opencode/plugin@2.0.22` añadido a devDependencies (solo tipos; el import es
  `import type` y el host resuelve el módulo en runtime).
- **#1187, #1199** — marcadas `RESUELTO-AQUI` en `issue-review.md`. Resumen actualizado a
  27 / 104.
- **Config harmful** — `configs/opencode/opencode.json` borrado (en v2 hacía que opencode
  instalara el upstream sin portar desde npm). Sustituido por
  `configs/opencode/plugins/context-mode.ts`, que usa el mecanismo de descubrimiento
  que sí funciona. README actualizado en el paso de install y en el link.

## Pendiente de decisión: KiloCode

Todo lo de abajo queda **bloqueado** hasta que decidas KiloCode:

- #1160 → DESCARTAR (el objeto, la fusión del array `plugin` v1, desaparece)
- limpieza de `OPENCODE_HOOK_NAMES` y el `Hooks` map v1 (~200 líneas)
- borrar o reescribir `tests/opencode-plugin.test.ts` (125 tests, solo v1)
- `ctx_upgrade` / install dejando de escribir la key v1
