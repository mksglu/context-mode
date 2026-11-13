# ADR-0026: OMP (oh-my-pi) as a supported host

- Status: Proposed (2026-11-13).
- Scope: one ADR (Part 1) and one PRD (Part 2) in a single file, as the owner asked ("tek bir md istiyorum ama senden adr pdr birlesik").
- Keeps: ADR-0010 (doctor tells the truth), ADR-0019 (setup and npm channel), ADR-0020 (hooks and skills on every agent), ADR-0021 (prompt-cache safety, D-CACHE-PI-1), ADR-0023 (each agent's own native install), ADR-0024 (tests grouped by ADR).
- Issue: [#1332](https://github.com/mksglu/context-mode/issues/1332) (closed 2026-11-12; the owner wrote on 2026-11-09 "Give me 1-2 weeks to support this", [comment](https://github.com/mksglu/context-mode/issues/1332#issuecomment-6729645399)).
- Pinned evidence:
  - OMP source: `can1357/oh-my-pi` at commit `aa5f045f98a90f5c7bbc6b091f1e97e42263194d` (2026-11-13). Paths `types.ts`, `runner.ts`, `shared-events.ts` are under `packages/coding-agent/src/extensibility/`.
  - OMP npm: `@oh-my-pi/pi-coding-agent` 18.20.0 (`npm view @oh-my-pi/pi-coding-agent version` = 18.20.0).
  - Live binary: `omp --version` = `omp/18.20.0`, macOS arm64, temp HOME only.
  - context-mode: `main` = `fea7780d`, npm 2.1.10.
  - Pi for compare: `@earendil-works/pi-coding-agent` 1.4.0, `dist/core/extensions/types.d.ts:723,1128`.
- Labels in this file: **[src]** OMP source file:line at the commit above; **[doc]** OMP docs file at that commit; **[run]** live command in a temp HOME; **[issue]** #1332; **[cm]** context-mode file:line at `fea7780d`. A claim with no label is marked **unverified**.

---

# Part 1: ADR

## Context

1. **What OMP is.** OMP is a fork of the Pi coding agent. Binary `omp`, package `@oh-my-pi/pi-coding-agent`, runtime Bun >= 1.4.4 [src `packages/coding-agent/package.json:2-3,27-28,563-564`]. It keeps Pi's extension factory (`export default function (pi) { pi.on(...) }`) and has a shim for the old Pi imports [src `extensibility/legacy-pi-coding-agent-shim.ts:4`, `extensibility/plugins/legacy-pi-compat.ts:2735,2849`, `extensibility/extensions/loader.ts:500`].
2. **It loads our Pi bundle today.** OMP reads the manifest key `omp`, then `pi` [doc `docs/plugin-manager-installer-plumbing.md:91-95`, `docs/extension-loading.md:59,64`]. `omp plugin install context-mode` installed 2.1.10, and OMP ran our `pi/index.js` [run, lock file `~/.omp/plugins/omp-plugins.lock.json` = `{"plugins":{"context-mode":{"version":"2.1.10",...,"enabled":true}}}`].
3. **One bug destroys the user's prompt (#1332).** On OMP, `before_agent_start` gets `systemPrompt: string[]` [src `types.ts:1210-1218`]. The result type is `systemPrompt?: string[]`, "Replace policy ... Extensions chain in order" [src `types.ts:1779-1783`]. The runner turns a string result into `[result]` and that replaces the whole array [src `runner.ts:2682-2686`]. Pi passes and takes a string [Pi `types.d.ts:723,1128`]. Our entry reads the prompt with `str(v)`, which gives `""` for a non-string [cm `src/entries/pi.ts:52-54`], so we return only our payload [cm `src/entries/pi.ts:171-172`, returns at `:179` and `:190`]. Result on OMP: the base prompt, `<project-context>` / AGENTS.md and other extensions' sections are gone.
   - Live proof [run, OMP 18.20.0, fake OpenAI-compatible model, `omp -p --no-session --model fake/fake -e probe.ts "hi"`]: with a probe only, `before_agent_start` saw an array of 2 (`"RFC 2119 keywords: ..."`, `"<project-context>..."`) and the request held base, project context and AGENTS.md. With context-mode 2.1.10 installed, the array held 1 item (our payload) and the request held **no** base, **no** project context, **no** AGENTS.md.
   - Users who confirm it [issue]: @tejasach06 (OMP 18.18.0, Windows x64, context-mode 2.1.5, sent a patch), @itsmylife44 (OMP 18.18.1, macOS arm64, "I use omp every day", [comment](https://github.com/mksglu/context-mode/issues/1332#issuecomment-6725664810)), @jeffscottward (context-mode 2.1.7, OMP 18.18.9, Linux and macOS, wrapper workaround that calls the Pi handler with `systemPrompt ""` and appends to OMP's array, [comment](https://github.com/mksglu/context-mode/issues/1332#issuecomment-6862022962)).
4. **Our tools do not reach the model on OMP.** In the same run the model's tool list was the 11 OMP built-ins only, no `ctx_*` [run]. Cause, proven by a probe: OMP gives a new extension tool `loadMode: "discoverable"` by default [doc `docs/extensions.md:826`], and `tools.xdev` (default `true`) mounts such tools under `xd://` URLs, not as top-level schemas [doc `docs/settings.md:646`]. A probe with `loadMode: "essential"` put both a factory tool and a tool registered inside `before_agent_start` in the top-level list, with plain JSON Schema `parameters` [run, probe3]. Pi 1.4.0 has no `loadMode` field [Pi `types.d.ts`, grep: no hit].
5. **Doctor lies about OMP today.** The doctor output in #1332 shows `agent pi` and a D3 FAIL on `~/.pi/agent/settings.json` while it runs inside OMP [issue body]. OMP is in `UNSUPPORTED_HOSTS` [cm `src/core/contracts/constants.ts:718-719`, D-UNSUPPORTED-HOSTS-1].
6. **History (git archaeology).** v1 had an MCP-only OMP adapter that wrote `~/.omp/agent/mcp.json` and never used `before_agent_start` (v1.0.169 `src/adapters/omp/index.ts:4-19`). v1 counted `PI_CODING_AGENT_DIR` as an OMP signal (v1.0.169 `src/adapters/detect.ts:220-225`). v2 removed OMP with other agents [cm `docs/architecture/PRD.md:328`, `docs/architecture/TECH-SPEC.md:73`]; `c814ef3e` and `772c31e0` deleted the files and `build/check-removed.mjs:57,70` guards the dirs `configs/omp/` and `src/adapters/omp/`. `ee8c73ac` (2026-11-08) added the `UNSUPPORTED_HOSTS` row. No earlier v2 attempt exists.
7. **Env vars do not tell OMP from Pi.** OMP reads `PI_CONFIG_DIR` (config root dirname, default `.omp`) and `PI_CODING_AGENT_DIR` (agent dir override) [doc `docs/environment-variables.md:599-600`]. Pi reads `PI_CODING_AGENT_DIR` too [cm `src/core/project/config-dir.ts:165-169`]. Owner rule: `PI_CODING_AGENT_DIR` is never an OMP signal [cm test `tests/0010-doctor-upgrade.test.mjs:695-703`].
8. **Release speed.** OMP shipped 9 releases from 18.18.0 (2026-11-07) to 18.20.0 (2026-11-12) [src `CHANGELOG.md:84-548`]. No breaking-change section in that window touches the five events we use [src `CHANGELOG.md:90,195,394,437,511`].

## Decision

1. **OMP is the 11th `AgentId`, `omp`, with its own table row and the same bundle.** `src/adapters/table.ts` gets an `omp` row next to the Pi row [cm `table.ts:98-105`]: `installMode: "in-process"`, `projectSource: "pi:ctx.cwd"` (OMP `ctx.cwd: string` [src `types.ts:805-807`]), `hookChannel` = the same `pi/index.js`, `compactDelivery: "pi-flag"`. `build/build.mjs:63` keeps one bundle. No `src/adapters/omp/` dir (it stays blocked by `check-removed.mjs:70`); a file `src/adapters/omp.ts` is added only if decode or encode differ from `src/adapters/pi.ts`.
2. **The shape of the prompt is the mechanism. Append, never replace.** One pure helper next to `str()` in `src/entries/pi.ts`:
   - `systemPrompt` is a string (Pi, Pi-Bolt): today's bytes exactly, `base === "" ? payload : base + "\n\n" + payload`.
   - `systemPrompt` is an array (OMP): return `[...systemPrompt, payload]`. Every entry stays, in order; our payload is the last item, once.
   - Absent: `payload` (today's Pi path for `""`).
   - The check is `typeof` and `Array.isArray`. No regex. On a throw before first delivery the handler returns `{}` on both hosts; OMP then keeps its own array (the runner replaces only when `systemPrompt` is set [src `runner.ts:2682-2686`]).
   - Cache (ADR-0021, D-CACHE-PI-1): OMP rebuilds each turn from `basePreparation.systemPrompt` [src `session/agent-session.ts:9419`], and our result lives "until the next preparation" [src `types.ts:1781`]. So each turn we get the base array again, not our last return, and we append once per turn. The payload bytes stay fixed between compactions, as on Pi.
3. **Host detection uses positive, sure signals only.**
   - Inside the process (hooks): the first `before_agent_start` with an array `systemPrompt` sets the agent id to `omp`; a string keeps `pi`. Pi's type is `readonly systemPrompt: string` [Pi `types.d.ts:723`], so an array is never Pi. `src/entries/pi.ts:112,117` stop hard-coding `"pi"` and use this id.
   - Outside the process (setup, doctor): the `omp` binary on PATH, the plugin store `~/.omp/plugins/omp-plugins.lock.json` [doc `docs/plugin-manager-installer-plumbing.md:23,46-57`], and MCP clientInfo `omp-coding-agent` [cm `src/core/contracts/client-map.ts:37-42`].
   - `PI_CODING_AGENT_DIR` and `PI_CONFIG_DIR` are path inputs after OMP is known. They never select OMP. The wrong comment at `client-map.ts:40` is fixed.
   - Pi-Bolt keeps `pi install npm:context-mode` and `~/.pi/agent/settings.json` [cm `docs/install/pi.md:17`]; nothing in the OMP path reads Pi-Bolt as OMP.
4. **OMP's own native commands (ADR-0023).**
   - Install: `omp plugin install context-mode` [doc `docs/cli-reference.md` row `install`; run: `✔ Installed context-mode@2.1.10`].
   - Update context-mode: `omp plugin upgrade context-mode` [doc `docs/plugin-manager-installer-plumbing.md:126`, `docs/marketplace.md:73`].
   - Update OMP itself: `omp update` [doc `docs/cli-reference.md` subcommand table].
   - Install OMP: `curl -fsSL https://omp.sh/install | sh` (macOS, Linux) [doc `README.md:44`; run], `irm https://omp.sh/install.ps1 | iex` (Windows) [doc `README.md:91`].
   - No `@next`, no `#release`, no `npm i -g` route for OMP users.
5. **Tools come from the extension, not from MCP.** The in-process `registerTool` path stays (OMP `registerTool` has the same fields [src `types.ts:1014-1060,1963`]). On the OMP path only, each `ctx_*` tool gets `loadMode: "essential"`, so the model sees it top-level [run probe3]. The Pi path passes the same objects as today (no new field), so Pi bytes stay the same. No MCP entry is written to `~/.omp/agent/mcp.json` (v1's way, which had no hooks).
6. **Doctor names OMP and reads OMP's store.** New rows:
   - D1 host: "OMP (oh-my-pi) <version>", not "pi".
   - D3 install: context-mode in `~/.omp/plugins/omp-plugins.lock.json` with `enabled: true`. Fix line: `omp plugin install context-mode`.
   - D4 version: lock `version` vs npm latest. Fix line: `omp plugin upgrade context-mode`.
   - D-OMP-PROMPT: the bundle has the array path (build stamp). Fix line: `omp plugin upgrade context-mode`.
   - Host limits from the matrix below are named as "info" lines with what to do, in positive words.
7. **`UNSUPPORTED_HOSTS` loses the OMP row** [cm `constants.ts:718-719`]. `setup --agents omp` and `context-mode doctor` treat OMP as supported.

## Support matrix (OMP 18.20.0, context-mode with this ADR)

| # | context-mode feature | OMP status | Source |
|---|---|---|---|
| 1 | `ctx_*` tools reach the model | differs: needs `loadMode: "essential"` | [run] run3 (no `ctx_*`), probe3 (top-level); [doc] `docs/extensions.md:826`, `docs/settings.md:646` |
| 2 | Stats (`ctx_stats`, a `ctx_*` tool) | differs: same cause as row 1 | as row 1 |
| 3 | System prompt (SessionStart payload, `before_agent_start`) | differs: `string[]` in and out | [src] `types.ts:1210-1218,1779-1783`, `runner.ts:2682-2686`; [run] run2/run3; [issue] |
| 4 | PreToolUse routing (`tool_call`, `{ block, reason }`) | supported: same shape (OMP adds `input` replace and `additionalContext`) | [src] `shared-events.ts:339-343`, `types.ts:1951`; live fire open (O2) |
| 5 | PostToolUse capture (`tool_result`) | differs: result has `content`, `details`, `isError`, `additionalContext`; no `structuredContent` | [src] `types.ts:1597-1611`, `shared-events.ts:412-426` |
| 6 | UserPromptSubmit (`input`, reads `text`) | supported | [src] `types.ts:1421-1426,1945`, `runner.ts:2461`; did not fire in `-p` print mode (O2) |
| 7 | Session start (first `before_agent_start`) | supported | [run] fired in run2 and run3 |
| 8 | Compaction (`session_compact`) | supported: same name | [src] `shared-events.ts:97-102`, `session/session-maintenance.ts:2712,4819` |
| 9 | Resume after compaction, stable prompt bytes | supported: base rebuilt each turn | [src] `types.ts:1781`, `session/agent-session.ts:9419` |
| 10 | Session id and project dir (`ctx.sessionManager.getSessionId()`, `ctx.cwd`) | supported | [src] `types.ts:805-807`, `session/session-manager.ts:3257` |
| 11 | Native install of context-mode | supported: `omp plugin install context-mode` | [run] `✔ Installed context-mode@2.1.10`; [doc] `docs/cli-reference.md` |
| 12 | Native update | supported: `omp plugin upgrade context-mode`, OMP `omp update` | [doc] `docs/plugin-manager-installer-plumbing.md:126`, `docs/cli-reference.md` |
| 13 | Runtime (`node:sqlite` under Bun) | supported | [issue] doctor D2 "running under Bun 1.4.4" inside OMP |
| 14 | Doctor | missing: reports OMP as Pi | [issue] body; [cm] `constants.ts:718-719` |
| 15 | Setup (`context-mode setup --agents omp`) | missing: OMP is unsupported | [cm] `constants.ts:718-719` |
| 16 | Host detection | missing: no `omp` AgentId | [cm] `src/core/contracts/agents.ts:2` |
| 17 | Tool filter from host settings (`pi.getSettings`, `excludedTools`) | missing: no `getSettings` in OMP's API | [src] grep `getSettings` in `extensions/types.ts`: no hit |
| 18 | Skills (`pi.skills` key in our manifest) | unverified | `docs/skills.md` not read (O7) |
| 19 | No double tools (OMP imports MCP from `~/.claude.json` and other hosts) | unverified | [doc] `docs/mcp-config.md:35-44`; not run (O4) |
| 20 | Windows install and run | unverified | [doc] `README.md:91`; not run (O6) |

Counts: supported 9, differs 4, missing 4, unverified 3 (20 rows).

## Consequences

- OMP users keep the base prompt, AGENTS.md and other extensions' sections. They get our payload as one more section.
- Pi and Pi-Bolt keep the same bytes, the same tool objects and the same install. A string-path golden test pins this.
- One bundle serves both hosts. The build stays one entry; the bundle grows by one helper and one branch.
- Doctor stops sending OMP users to `pi install` and to `~/.pi/agent/settings.json`.
- About 20 places pin "10 agents" or the unsupported list. They change in the same commit (Part 2, files touched).
- OMP ships fast. A live fire test on each OMP minor guards the five event shapes; we do not follow OMP patch releases by hand.

## Alternatives rejected

1. **Treat OMP as Pi (no new AgentId).** Doctor keeps lying (ADR-0010) and setup cannot use OMP's own command (ADR-0023).
2. **A second bundle `omp/index.js`.** Two builds of the same code. OMP already reads `package.json.pi` [doc `docs/plugin-manager-installer-plumbing.md:91-95`].
3. **MCP-only, like v1 (`~/.omp/agent/mcp.json`).** No routing, no capture, no compaction payload. v1 named hooks "future work" (v1.0.169 `src/adapters/omp/index.ts:4-19`).
4. **Detect OMP with `PI_CODING_AGENT_DIR`, `process.versions.bun`, argv text or a regex.** Pi reads the same env var; Bun is not OMP-only (unverified for Pi-Bolt); argv text needs a pattern match. Owner rules forbid each one.
5. **Always add `loadMode: "essential"`.** Pi has no such field; that Pi ignores it is unverified. Adding it only on the array path keeps Pi bytes unchanged.
6. **Replace OMP's array with one joined string.** OMP turns a string into `[result]` and drops the rest [src `runner.ts:2682-2686`]. That is the #1332 bug.
7. **A new MCP tool for OMP.** Owner rule: no new MCP tool.

## Gaps as host limits (doctor names each one with a fix line)

| Gap | Doctor line (info) | Fix line |
|---|---|---|
| No `structuredContent` in OMP `tool_result` | "OMP keeps tool output in `content`; context-mode writes its notes there." | none needed |
| No `getSettings` (row 17) | "OMP has no extension settings API; context-mode reads no tool filter on OMP." | use OMP's own tool settings (exact key unverified, O10) |
| `input` does not fire in `omp -p` (row 6) | "In print mode OMP sends no prompt event; prompts are captured in interactive and RPC mode." | run `omp` without `-p` (after O2 confirms) |
| Context-mode MCP server imported from another host's config (row 19) | names the file OMP imported it from | set after O4 |
| Headless run waits for stdin [run, run4] | not a doctor line; docs note: add `< /dev/null` in scripts | `omp -p ... < /dev/null` |

---

# Part 2: PRD

## Goal

OMP users run context-mode with OMP's own install command, keep every system prompt section, see the `ctx_*` tools, and get a doctor that names OMP. Pi and Pi-Bolt do not change by one byte.

## Users

- OMP users who run context-mode today and lose their base prompt and AGENTS.md (#1332).
- Beta testers, named in #1332:
  - **@tejasach06**: OMP 18.18.0, Windows x64, context-mode 2.1.5; wrote the first patch.
  - **@itsmylife44**: OMP 18.18.1, macOS arm64, daily OMP user, "Happy to test a build".
  - **@jeffscottward**: OMP 18.18.9, Linux and macOS, context-mode 2.1.7; runs a wrapper workaround today, wants to test.
- Pi and Pi-Bolt users: they must see no change.

## Non-goals

- A new MCP tool (owner rule).
- A second bundle or an `src/adapters/omp/` dir.
- OMP's older hooks surface (`<agentDir>/hooks/pre|post/*.ts`, `docs/hooks.md`): the extension surface covers all five events.
- MCP delivery to `~/.omp/agent/mcp.json`.
- Restoring `platform-bridge.mjs` (dropped for good).
- OMP named profiles (`~/.omp/profiles/<name>/agent` [doc `docs/extension-loading.md:88`]) beyond the default profile in this first step.

## Milestones

Each step: red test -> green -> profile (before/after) -> push `lane/r64-omp` -> one DEVIATIONS row. Fix to `main` at once when green; the weekly release carries it (ship finished work at once).

| M | Step | Red test first | DEVIATIONS row |
|---|---|---|---|
| M0 | Baseline profile on `fea7780d` (see Profiling) | - | - |
| M1 | Prompt shape helper: array appends, string unchanged (#1332) | T1-T7 | D-OMP-PROMPT-1 |
| M2 | Agent id from the prompt shape; `pi.ts:112,117` use it | T8-T9 | D-OMP-HOST-1 |
| M3 | `loadMode: "essential"` on the OMP path only | T10 | D-OMP-TOOLS-1 |
| M4 | `omp` AgentId, table row, constants, remove from `UNSUPPORTED_HOSTS`, host lists in tests | T11-T14 | D-OMP-ROW-1 |
| M5 | Setup and uninstall with OMP's own verbs | T15-T16 | D-OMP-SETUP-1 |
| M6 | Doctor rows and fix lines | T17-T20 | D-OMP-DOCTOR-1 |
| M7 | Live fire test on OMP + e2e cases | T21-T23 | D-OMP-FIRE-1 |
| M8 | Docs (`docs/install/README.md`, `docs/install/omp.md`, ADR-0023 row, PRD/TECH-SPEC, 12-plugins §3.3, feature.yml) | `build/check-install-docs.mjs` red on missing `omp` | D-OMP-DOCS-1 |
| M9 | Beta build for the three testers; their logs close the open items | - | - |

## RGR test list (in existing ADR-grouped files, ADR-0024; no new test file)

`tests/0020-plugins.test.mjs`, new describe "ADR-0026 OMP system prompt shape (#1332)":

- T1: array `["BASE", "<project-context>AGENTS</project-context>", "OTHER_EXT"]` in -> out is the same 3 entries in order, then the payload; length 4; payload appears once. Red on `fea7780d` (today: one string).
- T2: string `"base"` in -> out bytes equal the `fea7780d` output (golden). Pins Pi and Pi-Bolt.
- T3: array, two turns with the same base array -> same output bytes both turns (D-CACHE-PI-1).
- T4: array, hook throws after first delivery -> base entries plus the same payload.
- T5: array, hook throws before first delivery -> `{}`.
- T6: array, compact turn -> payload rebuilt, base entries kept.
- T7: empty array -> `[payload]`.
- T8: array -> `handleHook` gets agent `omp`; string -> `pi`.
- T9: string with `PI_CODING_AGENT_DIR` set -> agent stays `pi`.
- T10: array path -> each `registerTool` call has `loadMode: "essential"`; string path -> the tool object is deep-equal to `fea7780d`.

Host lists (same commit as M4):

- T11 `tests/0018-contracts.test.mjs:35-37`: `AGENT_IDS` has 11, with `omp`.
- T12 `tests/0007-identity.test.mjs:1226-1228`: `projectSource` for `omp` is `pi:ctx.cwd`.
- T13 `tests/0010-doctor-upgrade.test.mjs:647,650-651,684,688`: `omp` is supported, not in `UNSUPPORTED_HOSTS`, in-process list `["pi","opencode","omp"]`.
- T14 `tests/0019-cli.test.mjs:222-232`: "Supported agents" lists omp; `omp` and `omp-coding-agent` leave the unsupported loop. Also `tests/0020-adapters.test.mjs:370`, `tests/prd8-index-search.test.mjs:2806`, `tests/prd10-hooks-runtime.test.mjs:1143,1938-1939`, `e2e/checks/repo-github-files.mjs:13`, `e2e/checks/windows-hosts.mjs:6,33-40`.

Setup (`tests/0019-setup-engine.test.mjs`):

- T15: `setup --agents omp` on a temp HOME with a stub `omp` plans `omp plugin install context-mode`; never `npm i -g`, never `@next`.
- T16: uninstall plans `omp plugin uninstall context-mode` (verb **unverified**, O11).

Doctor (`tests/0010-doctor-upgrade.test.mjs`):

- T17: lock file with context-mode enabled -> D1 "OMP (oh-my-pi)", D3 PASS; no line names `~/.pi`.
- T18: no lock entry -> D3 FAIL with fix line `omp plugin install context-mode`.
- T19: `PI_CODING_AGENT_DIR` alone (no `omp` binary, no lock) -> host is never `omp` (extends `:695-703`).
- T20: Pi-Bolt fixture -> host stays `pi`.

Live and e2e:

- T21 `tests/0020-fire-plugin-ext.test.mjs` (mirror of the Pi block at `:222`): OMP block, skipped when `omp` is absent. Fake model; assert the request system text holds base, `<project-context>`, AGENTS.md and the payload, and the tool list holds `ctx_*` top-level. Command runs with `< /dev/null`.
- T22 `e2e/cases/GP2-prompt-surface.e2e.mjs` (mirror of `GP2/pi-system-role-injection` at `:172`): `GP2/omp-system-prompt-append`.
- T23 `e2e/cases/GP11-doctor-upgrade.e2e.mjs` (mirror of `GP11/pi-doctor-real-paths` at `:64`): `GP11/omp-doctor-real-paths`.

## Files touched

- Entry: `src/entries/pi.ts` (helper, agent id, `loadMode`).
- Identity: `src/core/contracts/agents.ts:2`, `src/adapters/table.ts` (omp row), `src/core/contracts/client-map.ts:40` (comment), `src/core/hooks/dispatch.ts:101` (check it branches on source kind, not on `"pi"`).
- Constants `src/core/contracts/constants.ts`: `:373` read-image tools, `:628` `AGENT_HOME_DIR` (`omp: [".omp"]`), `:718-719` remove row, `:751` `HOOK_HOST_FILE` (`omp: null`), `:838` `UPGRADE_HOST_COMMAND` (`omp plugin upgrade context-mode`), `:1090-1101` `NATIVE_INSTALL` (`omp plugin install context-mode`), new OMP list and store constants.
- Setup: `src/setup/registry.ts:47,247,266-274`, `src/setup/hook-shapes.ts:73`, `build/manifests.ts:137`.
- Doctor and ops: `src/core/ops/doctor-config.ts:128-130,406,418`, `src/core/tools/doctor.ts:184`, `src/core/ops/host-write.ts:33`, `src/core/ops/uninstall.ts:145-150`, `src/core/project/config-dir.ts` (`ompAgentDirOf`).
- Build checks: `build/check-install-docs.mjs:160` (`NATIVE_HOSTS` + `omp`). `build/check-removed.mjs:57,70` stays.
- Docs: `docs/install/README.md`, new `docs/install/omp.md`, `docs/architecture/adr/ADR-0023-native-install.md:46-55`, `docs/architecture/PRD.md:328`, `docs/architecture/TECH-SPEC.md:73`, `docs/architecture/modules/12-plugins.md:62-73`, `.github/ISSUE_TEMPLATE/feature.yml:21-22`, `docs/architecture/DEVIATIONS.md`.
- Tests: the files in the RGR list. `tests/0014-repo-hygiene.test.mjs` needs no new `TEST-LAYOUT.md` row (no new file).

## DEVIATIONS rows to add (`docs/architecture/DEVIATIONS.md`, one per change)

| Id | Files | Decision |
|---|---|---|
| D-OMP-PROMPT-1 | src/entries/pi.ts, tests/0020-plugins.test.mjs | #1332: an array `systemPrompt` gets our payload appended as the last entry; a string keeps the `fea7780d` bytes. Shape check only, no regex. |
| D-OMP-HOST-1 | src/entries/pi.ts, tests/0020-plugins.test.mjs | The agent id comes from the prompt shape (array = omp). `PI_CODING_AGENT_DIR` never selects omp. |
| D-OMP-TOOLS-1 | src/entries/pi.ts, tests/0020-plugins.test.mjs | `loadMode: "essential"` on `ctx_*` tools on the OMP path only, so OMP lists them top-level. |
| D-OMP-ROW-1 | agents.ts, table.ts, constants.ts, client-map.ts, host-list tests | `omp` is the 11th AgentId; OMP leaves `UNSUPPORTED_HOSTS` (reverts the OMP part of D-UNSUPPORTED-HOSTS-1). |
| D-OMP-SETUP-1 | src/setup/registry.ts, src/core/ops/uninstall.ts, tests/0019-setup-engine.test.mjs | Setup and uninstall use OMP's own `omp plugin` verbs. |
| D-OMP-DOCTOR-1 | doctor-config.ts, doctor.ts, config-dir.ts, tests/0010-doctor-upgrade.test.mjs | Doctor names OMP and reads `~/.omp/plugins/omp-plugins.lock.json`; fix lines use OMP's commands. |
| D-OMP-FIRE-1 | tests/0020-fire-plugin-ext.test.mjs, e2e/cases/GP2, GP11 | Live OMP fire test, skipped when `omp` is absent. |
| D-OMP-DOCS-1 | docs/install/*, ADR-0023, PRD.md, TECH-SPEC.md, 12-plugins.md, feature.yml | OMP install docs with OMP's native commands; agent count 10 -> 11. |

## Profiling plan

- Before: `fea7780d`. After: each milestone head. Median of 50 runs, same machine, temp HOME, warm cache. Report median and p95.
- Measures:
  1. `before_agent_start` time per turn, Pi string path (must not move beyond noise) and OMP array path (in-process, `performance.now()` around the handler, 50 turns).
  2. Hook latency `tool_call` and `tool_result` on Pi and OMP.
  3. `context-mode setup --agents pi` and `--agents omp` (dry run, temp HOME).
  4. `context-mode doctor` wall time on a Pi fixture and an OMP fixture.
  5. `pi/index.js` size in bytes.
  6. Wall time of the edited test files (`0020-plugins` 2.0 s, `0010-doctor-upgrade` 12.9 s, `0019-cli` 35.6 s per `TEST-LAYOUT.md`) and the full `node --test "tests/**/*.test.mjs"` once at ship.
  7. OMP extension load time of `pi/index.js` (O9).
- Pass: Pi numbers within noise of the baseline; OMP array path within 10% of the Pi path.

## Docs changes

- `docs/install/README.md`: agent count 10 -> 11. Install table row: `OMP | omp plugin install context-mode | omp plugin upgrade context-mode`. Agents table row next to Pi.
- New `docs/install/omp.md`, same sections as `docs/install/pi.md` (Install, Update, Known limits, Verified):
  - Install OMP: `curl -fsSL https://omp.sh/install | sh` (macOS, Linux), `irm https://omp.sh/install.ps1 | iex` (Windows).
  - Install context-mode: `omp plugin install context-mode`.
  - Update: `omp plugin upgrade context-mode`; OMP itself: `omp update`.
  - Check: `context-mode doctor` is not on PATH for OMP users; doctor runs as the `ctx_doctor` tool inside OMP.
  - Known limits: the gap table from Part 1.
  - Verified: a table from the live run (OMP version, OS, date).

## Rollout

1. Fix to `main` per milestone, at once when green.
2. Ask the three beta testers in #1332 to test the build with `omp plugin install context-mode` after the release, and to send `ctx_doctor` output.
3. Weekly release carries it (npm + GitHub plugins together).

## Risks

- OMP changes the event shapes in a minor release (9 releases in 6 days). Guard: T21 on each OMP minor.
- Double tools if OMP imports our MCP server from `~/.claude.json` (O4).
- Pi gets an unknown field if the `loadMode` branch leaks. Guard: T10 deep-equal on the string path.
- Doctor reads the wrong dir for a named OMP profile. First step covers the default profile only.

## Open questions (unverified until a source closes each one)

- O1 (closed): `ctx_*` missing in run3 -> `loadMode: "essential"` [run probe3].
- O2: `tool_call`, `tool_result`, `session_compact`, `input` fired live on OMP 18.20.0 (needs a fake model that calls a tool, and an interactive or RPC run).
- O3: OMP accepts our extra `structuredContent` field without error at run time.
- O4: double registration through OMP's MCP import, and the OMP setting that turns the import off.
- O5: since which OMP version `systemPrompt` is `string[]` (needs full git history of `extensions/types.ts`).
- O6: Windows install and run (`irm https://omp.sh/install.ps1 | iex`); @tejasach06 can test.
- O7: OMP loads our `pi.skills` manifest entry (`docs/skills.md`).
- O8: OMP user count (stars, downloads) for the README line.
- O9: OMP load time of `pi/index.js`.
- O10: OMP's own key for a tool filter (replaces `excludedTools`).
- O11: the OMP uninstall verb (`omp plugin uninstall` or `remove`).
- O12: that Pi 1.4.0 ignores an unknown `loadMode` field (only matters if the branch leaks).
