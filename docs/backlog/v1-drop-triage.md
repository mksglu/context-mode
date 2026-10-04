# Triage por caída de OpenCode v1

Fecha: 2026-10-04. Contexto: el adapter de OpenCode ya está portado a v2
(`src/adapters/opencode/plugin.ts` exporta `{ id, server, setup }`), verificado
en opencode 2.0.22 con los 11 tools `ctx_*` y los 5 hooks vivos.

Fuentes: `pr-review.md` (147 veredictos) e `issue-review.md` (164 issues).

## El número que importa primero

La caída de v1 **no es una palanca grande sobre el backlog**:

| | total | toca la caída de v1 |
|---|---|---|
| Issues `PENDIENTE` | 103 | **0** (4 se re-enmarcaron, ninguna murió) |
| PRs accionables | 63 | **2** (#1160, #1040 — ambos ya cerrados) |

Las otras 99 issues pendientes son agnósticos de plataforma (linux, windows,
store, executor, sesion, stats, core). Decidir "ya no suporto v1" no las mueve.

Donde sí muerde es en dos sitios: (1) handful de ítems que quedan **muertos**,
(2) trabajo **nuevo** que la caída crea y que ningún ledger registra todavía.

> Las cifras de arriba se recalcularon contando la tabla, no copiando el
> encabezado: el encabezado decía 27/104 y la tabla tenía 28/103. La sección
> "Decidido" de este documento tiene el detalle.

## Issues: 4 vivas, contra la caída de v1

Ninguna muere. Ver la sección "Decidido" más abajo para el veredicto con nota.

**Ya cerradas por el port** (no por la decisión): #1187, #1199 (el plugin
cargaba), #1036 (el bug de contabilidad de uso). Las tres están
`RESUELTO-AQUI` en `issue-review.md`.

**Siguen abiertas y re-enmarcadas:**

| # | por qué no muere con v1 |
|---|---|
| 1085 | El hook v1 (`experimental.chat.system.transform`) ya no existe, pero el defecto sí: el port hace el mismo `splice(1, 0, …)` dentro de `SystemPart[]`. Verificar contra Qwen estricto sobre `ctx.session.hook("context")`. |
| 1255 | Detección de plataforma, agnóstico de la versión del plugin. |
| 1053 | El modo embebido sin MCP (`CONTEXT_MODE_EMBEDDED_PLUGIN_TOOLS`) es el camino del plugin en v2. |
| 1254 | El importador multi-adapter no reconoce `session.usage.updated`. Más urgente ahora que la contabilidad de uso vive en v2. |

## PRs: 2 cerradas, contra la caída de v1

### Muere — el objeto del trabajo desaparece

| # | veredicto | por qué |
|---|---|---|
| 1160 | ADOPTAR → **DESCARTADO** | Su objeto es fusionar el array `plugin` de `opencode.jsonc`. Solo importa si algo escribe ese array, y en v2 la key no se lee y el install ya no la escribe. El síntoma (arrays siblings pisándose) desaparece con la causa. |
| 1040 | ADAPTAR → **DESCARTADO** | Su objeto era #1036, que ya no es una issue abierta: es código de este fork. Además su premisa es falsa en v2 (`.tokens` también es acumulado, no last-step), así que el diff upstream no aplica. |

#935 (TUI `/ctx`) ya estaba `DESCARTAR` por un motivo independiente, y
#1001 / #1148 no son de opencode.

### Ya descartadas, pero la razón quedó obsoleta
| # | veredicto actual | nota |
|---|---|---|
| 1194 | DESCARTAR — "el trabajo ya está" | La razón era `#1161 ya usa los nombres ctx_*`. Ahora es literalmente cierta, pero por *otro* motivo: el port propio. Actualizar la nota o el ledger miente sobre por qué se descartó. |
| 1171 | DESCARTAR — superseded por #1194 | Igual. Además su crítica ("pone `@opencode/plugin` en dependencies sin que el código de producción lo importe") **quedó satisfecha**: el port lo usa con `import type` y está en devDependencies, no en dependencies. |

## Trabajo NUEVO que la caída crea (no está en ningún ledger)

Los 6 ítems, con el estado real verificado en el código (no estimado):

1. ~~**`configs/opencode/opencode.json` sirviendo `"plugin": ["context-mode"]`**~~
   **HECHO.** Borrado en `8b1d52d` y sustituido por
   `configs/opencode/plugins/context-mode.ts` (mecanismo de descubrimiento).
2. **VIVO, y es un solo sitio, no tres.** `configureAllHooks()` en
   `src/adapters/opencode/index.ts:500-513` sigue haciendo
   `settings.plugin = ["context-mode", ...]`. Con v2 esa key no se lee: lo que
   produce es una entrada que opencode ignora, y en el peor caso una
   instalación desde npm del upstream **sin portar**. `grep -rnE "settings\.plugin *="`
   devuelve **una** línea en todo `src/`. La nota anterior apuntaba a
   `src/cli.ts`, `src/lifecycle.ts` y `src/runtime.ts`: ninguno escribe la key.
3. **VIVO, y más barato de lo que decía.** Lo que sobra con v1 muerto:
   - `HOOK_TYPES` en `src/adapters/opencode/hooks.ts` — 3 nombres v1
     (`tool.execute.before`, `tool.execute.after`, `experimental.session.compacting`)
     y `REQUIRED_HOOKS`, usados por `index.ts:80,312,323,334`.
   - `createContextModePlugin` (`plugin.ts:934-982`) — **~50 líneas**, adaptador
     delgado sobre `initState()`.
   - Tipos `PluginClient` / `PluginContext` / `PluginClientApp*` (`plugin.ts:63-85`)
     — **~25 líneas**, solo los usa el factory v1.
   - El campo `server` del export dual (`plugin.ts:1276`).
   Total **~90 líneas**, no ~200. La cifra anterior era una suposición.
4. **KiloCode comparte el adapter entero — SIN RESOLVER.** Ver la sección final.
5. **VIVO, y la cifra era falsa.** `tests/opencode-plugin.test.ts` tiene **57**
   tests (no 125), todos invocando `ContextModePlugin` (8 referencias). Todos
   pasan hoy. `tests/adapters/opencode-v2.test.ts` (19 tests) es la superficie v2.
6. **PARCIAL.** El doctor ya acepta descubrimiento
   (`hasDiscoveredContextModePlugin`, `index.ts:585`), pero
   `configureAllHooks` (ítem 2) y el mensaje de `validateHooks`
   (`index.ts:415`, `Array.isArray(settings.plugin)`) siguen asumiendo v1.

## Orden sugerido

Actualizado tras la decisión. Lo de v1 ya no bloquea el resto del backlog:

1. **ítem 2** — que `configureAllHooks` deje de escribir la key `plugin`.
   Es el único sitio, son 4 líneas, y mientras siga ahí `context-mode upgrade`
   reintroduce en cada máquina una entrada que v2 no lee. Lo primero porque es
   lo único con consecuencia en el usuario.
2. **Lo que sí es agnostic de plataforma** — la lista "Siguiente tanda" de
   `pr-review.md`, que no espera a ninguna decisión de producto:
   #1089 → #1220 → #913 → #1155 → #1256 → #1241.
3. **ítems 3 y 5** — la limpieza de v1 (90 líneas + 57 tests) como un commit
   aparte. Borrado grande, no se mezcla con fixes de bug.
4. **#1085, #1255, #1053, #1254** — independientes, en cualquier orden.

## Ejecutado (2026-10-04)

- **#1036** — bug confirmado empíricamente y corregido. Se instrumentó el
  stream real de eventos con una sonda desechable. Corrección: `usageDelta()` +
  `readUsageSnapshot()` en el path v2, con 8 tests que fijan los valores medidos.
  `@opencode/plugin@2.0.22` añadido a devDependencies (solo tipos; el import es
  `import type` y el host resuelve el módulo en runtime).
- **#1036** — el port la arregló pero la fila seguía en `PENDIENTE` (la nota estaba
  escrita, el estado no). Corregido a `RESUELTO-AQUI`. El recuento del encabezado
  mentía por dos: **28 `RESUELTO-AQUI` / 103 `PENDIENTE`**, no 27/104. Verificado
  recontando la tabla, no la cifra escrita a mano.
- **#1187, #1199** — marcadas `RESUELTO-AQUI` en `issue-review.md`.
- **Config harmful** — `configs/opencode/opencode.json` borrado (en v2 hacía que opencode
  instalara el upstream sin portar desde npm). Sustituido por
  `configs/opencode/plugins/context-mode.ts`, que usa el mecanismo de descubrimiento
  que sí funciona. README actualizado en el paso de install y en el link.

## Decidido: no hay soporte de OpenCode v1 (2026-10-04)

Cerrado por decisión de producto. Dos PRs y cuatro issues revisados contra esa
decisión. Resultado: **el filtro mueve 2 PRs y 0 issues**.

### PRs que cierra la decisión

| # | veredicto | por qué |
|---|---|---|
| 1160 | ADOPTAR → **DESCARTADO** | Su objeto es fusionar el array `plugin` de `opencode.jsonc`. Solo importa si algo escribe ese array, y en v2 la key no se lee y el install ya no la escribe. El síntoma (arrays siblings pisándose) desaparece con la causa. |
| 1040 | ADAPTAR → **DESCARTADO** | Su objeto era #1036, que ya no es una issue abierta: es código de este fork. Además su premisa es falsa en v2 (`.tokens` también es acumulado, no last-step), así que el diff upstream no aplica. La nota de "conservar el bloque de comentarios que documenta la semántica" quedó satisfecha: `usageDelta()` lo documenta junto a la tabla de valores medidos. |

### Issues: ninguna muere, y conviene decir por qué

Las cuatro que nombran opencode **no son v1-only**. Descartarlas por el nombre
del hook habría sido el error:

- **#1085** — re-enmarcada. El hook v1 (`experimental.chat.system.transform`) ya no
  existe, pero el defecto **sí**: el port hace el mismo `splice(1, 0, …)` dentro de
  `SystemPart[]`. Verificar contra Qwen estricto sobre `ctx.session.hook("context")`.
- **#1053, #1255, #1254** — sin cambio. El modo embebido sin MCP, la detección de
  plataforma y el importador multi-adapter agnósticos de la versión del plugin.
  #1254 sube de urgencia: la contabilidad de uso vive ahora en v2 y el importador
  sigue sin reconocer `session.usage.updated`.

**Las otras 99 issues pendientes tampoco las mueve.** Decidir "no hay soporte de
v1" no toca linux (15), windows (7), store (6), executor (6), sesión (13),
stats (2), empaquetado (4) ni core (13). La caída de v1 no es una palanca grande
sobre el backlog: 2 de 63 PRs accionables, 0 de 103 issues.

### Dos notas del triage anterior que la verificación desmintió

Las había escrito sin comprobar y eran falsas:

- **"`tests/opencode-plugin.test.ts` = 125 tests v1"** → son **57**, y la cifra de
  125 no aparece en el fichero. Todos invocan `ContextModePlugin` (8 referencias),
  así que la conclusión (superficie v1-only) se sostiene, el número no.
- **"~200 líneas de andamiaje v1"** → sin medir. `createContextModePlugin` ocupa
  ~50 líneas (`plugin.ts:934-982`) y es un adaptador delgado sobre `initState()`.
  Lo que sí pesa es `HOOK_TYPES` en `hooks.ts` con sus 3 nombres v1, más el
  andamiaje de `PluginClient`/`PluginContext` (~40 líneas de tipos). Borrar v1 es
  mucho más barato de lo que decía este documento.

## Pendiente de decisión: KiloCode

**Sin resolver, y la pregunta sigue siendo la misma.** KiloCode es un fork de
OpenCode sobre la API v1: `getPlatform()` (`plugin.ts:346`) resuelve `kilo` antes
que `opencode`, y los dos leen el mismo factory v1. No v1 = no KiloCode. El
nombre `kilo` sobrevive en 4 sitios (env detection, `TOOL_PREFIXES`, `index.ts:86`,
tipos). Nada de eso se tocó.

Queda bloqueado hasta que decidas:

- limpieza de `HOOK_TYPES` v1 en `hooks.ts` + los tipos `PluginClient`/`PluginContext`
  (~90 líneas, no ~200)
- borrar o reescribir `tests/opencode-plugin.test.ts` (57 tests, solo v1)
- `createContextModePlugin` y el campo `server` del export dual (~50 líneas)

Lo que **no** depende de esa decisión y se puede hacer ya: el resto de la lista
de `pr-review.md` ("Siguiente tanda"), que es agnóstico de plataforma.
