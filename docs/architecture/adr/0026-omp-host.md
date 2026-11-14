# ADR-0026: OMP (oh-my-pi) as a supported host

- Status: Accepted (2026-11-14). Owner, 2026-11-14: "omp suresi onemli degil ok, omp yi main e gonder". P5 (doctor wall with OMP on PATH) stays over its +10% line after D-OMP-DOCTOR-PERF-1 (one `omp plugin list` per doctor call): main 571 ms, lane 850 ms median. The rest is the OMP row's own verify checks (plugin list, hook run, MCP check) that every CLI host row runs. The owner accepts this result.
- Scope: one ADR (Part 1) and one PRD (Part 2) in one file, as the owner asked ("tek bir md istiyorum ama senden adr pdr birlesik").
- Keeps: ADR-0010 (doctor tells the truth), ADR-0019 (setup), ADR-0020 (hooks and skills on every agent), ADR-0021 (prompt-cache safety, D-CACHE-PI-1), ADR-0023 (each agent's own native install), ADR-0024 (tests grouped by ADR).
- Issue: [#1332](https://github.com/mksglu/context-mode/issues/1332).
- Pinned evidence:
  - OMP source: `can1357/oh-my-pi` at `aa5f045f98a90f5c7bbc6b091f1e97e42263194d`. A **[src]** path without a leading `packages/`, `scripts/` or `docs/` is under `packages/coding-agent/src/`.
  - OMP npm and binary: `@oh-my-pi/pi-coding-agent` 18.20.0, `omp --version` = `omp/18.20.0`, macOS arm64, temp HOME only.
  - context-mode: `main` = `fea7780d`, npm 2.1.10.
  - Pi for compare: real Pi CLI 1.4.0 (temp HOME), Pi package 1.5.2 `dist/core/extensions/types.d.ts` and `dist/core/pi-manifest.js`.
  - Proof logs (r64/r65 host research, owner workspace, outside this repo): `omp-hooks-proof.md`, `omp-r64.md`, `omp-v2-fit.md`, `omp-r65-events.md`, `omp-r65-tools.md`, `omp-r65-config.md`, `omp-r65-platform.md`.
- Labels: **[src]** OMP source file:line; **[doc]** OMP docs file:line; **[run]** live command in a temp HOME (proof log named); **[issue]** #1332; **[cm]** context-mode file:line at `fea7780d`; **[Pi]** Pi package file.

## For reviewers

What this document decides:

1. OMP becomes the 11th agent, `omp`. It has its own thin entry `omp/index.js` (OMP reads the `omp` manifest key first) and shares the Pi code. Pi does not change by one byte.
2. On OMP we add our text as one more system prompt block. OMP's base prompt, AGENTS.md and other extensions stay (fixes #1332).
3. The 9 `ctx_*` tools register with `loadMode: "essential"`, so OMP lists them as normal tools. Pi sends the same bytes as today.
4. Every OMP user step uses OMP's own commands: `omp plugin install context-mode`, `omp plugin upgrade context-mode`, `omp plugin uninstall context-mode`, `omp update`.
5. Doctor and `ctx_upgrade` say `agent omp`, read `~/.omp`, and never write under `~/.pi`. OMP support reaches `main` as one whole change.

Questions for OMP users (please answer in #1332):

1. Which OMP version do you run? Is 14.7.0 or later a good minimum for you?
2. Do you run OMP on Windows? Did `irm https://omp.sh/install.ps1 | iex` work for you?
3. Do you use OMP mostly in the interactive TUI, in RPC mode (`omp --mode rpc`), or in print mode (`omp -p`)?
4. Do you let OMP import MCP servers from Claude Code or other hosts (`enabledProviders` in `~/.omp/agent/config.yml`)?
5. Do you call skills such as `/skill:ctx-doctor` in OMP?

---

# Part 1: ADR

## Context

1. **What OMP is.** OMP is a fork of the Pi coding agent. Binary `omp`, package `@oh-my-pi/pi-coding-agent`, runtime Bun >= 1.4.4 [src `packages/coding-agent/package.json:2-3`; doc `README.md:100`]. It keeps Pi's extension factory (`export default function (pi) { pi.on(...) }`) and loads old Pi modules through a shim [src `extensibility/extensions/loader.ts:500`, `extensibility/plugins/legacy-pi-compat.ts:2735`].
2. **It loads our Pi bundle today.** OMP reads the manifest key `omp`, and only when it is absent, `pi` (whole object, no merge) [src `extensibility/plugins/installer.ts:71,108`, `extensibility/plugins/loader.ts:194`; doc `docs/plugin-manager-installer-plumbing.md:91-95`]. Our package has only `pi` [cm `build/manifests.ts:253`], so OMP runs `pi/index.js`, and every row says `agent=pi` [run `omp-r65-config.md` "Data paths": `select agent,count(*) from events` -> `pi|4`].
3. **One bug destroys the user's prompt (#1332).** On OMP >= 14.7.0, `before_agent_start` gets `systemPrompt: string[]` [src `extensibility/extensions/types.ts:1210-1218`]. The result type is `systemPrompt?: string[]` with a replace policy [src `extensibility/extensions/types.ts:1779-1783`]. The runner turns a string result into `[result]`, and that replaces the whole array [src `extensibility/extensions/runner.ts:2682-2686`]. Our entry reads the prompt with `str(v)`, which gives `""` for a non-string [cm `src/entries/pi.ts:52-54`], so we return only our payload [cm `src/entries/pi.ts:171-172`].
   - [run `omp-hooks-proof.md` §6d]: system message 7921 chars with a probe only (RFC 2119 rules, `<project-context>`, AGENTS.md present); 592 chars with context-mode 2.1.10 (all gone, only our payload).
   - [issue] @tejasach06 (OMP 18.18.0, Windows x64, sent a patch), @itsmylife44 (OMP 18.18.1, macOS arm64, daily user), @jeffscottward (OMP 18.18.9, Linux and macOS, runs a wrapper that appends to OMP's array).
4. **Our tools do not reach the model as tools.** OMP gives a new extension tool `loadMode: "discoverable"` [doc `docs/extensions.md:826`], and `tools.xdev` (default on) mounts it under `xd://` [doc `docs/settings.md:646`; src `tools/essential-tools.ts:45-48`, `tools/xdev.ts:86-89`]. [run `omp-r65-tools.md` §2]: top-level tools = 11 OMP built-ins; `ctx_*` appear only as `xd://ctx_*` text. Our 592-char prompt never says `xd://`.
5. **Doctor and upgrade do not tell the truth on OMP.** [run `omp-r65-tools.md` §6]: `ctx_doctor` prints `agent pi` and `D3 host config FAIL ... ~/.pi/agent/settings.json ... Fix: pi install npm:context-mode` while `~/.pi` does not exist. `ctx_upgrade` prints `host update | pi update --extensions`, a false `plugin root` row (`.../context-mode/pi` vs `.../context-mode`), and creates `~/.pi/agent/settings.json` (sha1 diff). Cause: OMP is in `UNSUPPORTED_HOSTS` [cm `src/core/contracts/constants.ts:718-719`] and the Pi branches [cm `src/core/tools/doctor.ts:184`, `src/core/ops/host-write.ts:33`].
6. **History.** v1 had an MCP-only OMP adapter with no hooks (v1.0.169 `src/adapters/omp/index.ts:4-19`) and used `PI_CODING_AGENT_DIR` as an OMP signal (v1.0.169 `src/adapters/detect.ts:220-225`). v2 removed it [cm `docs/architecture/PRD.md:328`]; `build/check-removed.mjs:57,70` guards `configs/omp/` and `src/adapters/omp/` [cm]. `ee8c73ac` added the `UNSUPPORTED_HOSTS` row. Pi-Bolt is a Pi build, not an AgentId (`b7ff6a87`, `739e86ef`) [run `omp-r65-platform.md` §6].
7. **Env vars do not tell OMP from Pi.** OMP reads `PI_CONFIG_DIR` and `PI_CODING_AGENT_DIR` [src `packages/utils/src/dirs.ts:4-5`; doc `docs/environment-variables.md:599-600`]; Pi reads `PI_CODING_AGENT_DIR` too [cm `src/core/project/config-dir.ts:167`].
8. **Release speed.** OMP shipped 9 releases from 18.18.0 to 18.20.0 in 6 days [src `packages/coding-agent/CHANGELOG.md:84-548`]. 342 published versions use the array form [run `omp-r65-platform.md` §2].

### Hook events, live proof (OMP 18.20.0)

context-mode 2.1.10 subscribes five events [cm `src/entries/pi.ts:167-225`]. Each one fires on OMP 18.20.0, and our handler runs. Runs: temp HOME, fake OpenAI-compatible model, `omp -p --no-session --model faketools/fake ... < /dev/null` (print), `omp --mode rpc` with a driver (RPC), and a pty driver (interactive).

| Event | Fires live | Our handler | Difference vs Pi | Evidence |
|---|---|---|---|---|
| `tool_call` | yes; `{block, reason}` stops the tool | read of a 108,894 B file denied; model got the `ctx_execute` hint | same shape | [run] `omp-hooks-proof.md` §1, §6a; [src] `extensibility/extensions/runner.ts:2367-2368` |
| `tool_result` | yes; returned `content` reaches the model | `seq 1 40000` output replaced; `events` and `sources` rows written | no `structuredContent`; a returned one is dropped with no error | [run] `omp-hooks-proof.md` §2, §6b; [src] `extensibility/extensions/runner.ts:2286-2297`, `extensibility/shared-events.ts:412-418` |
| `input` | RPC (`source: "rpc"`) and interactive (`source: "interactive"`); never in print mode | `prompt` row written (RPC and TUI) | print mode has no `emitInput` caller | [run] `omp-hooks-proof.md` §3, §6c; `omp-r65-events.md` O2b; [src] `modes/rpc/rpc-mode.ts:1909`, `modes/controllers/input-controller.ts:1089` |
| `session_compact` | yes, after an RPC compact | sets the compact flag; next turn sends INSTRUCTIONS only, as on Pi | no `reason` key; no handler reads it | [run] `omp-r65-events.md` O2a; [src] `session/session-maintenance.ts:2711-2715` |
| `before_agent_start` | yes, every prompt; twice on the first RPC prompt | runs; wipes OMP's prompt today (#1332) | `string[]` in and out; Pi has `string` | [run] `omp-hooks-proof.md` §5, §6d; `omp-r65-events.md` O2c; [src] `session/agent-session.ts:618,9413-9432` |

## Decision

1. **OMP is the 11th `AgentId`, `omp`, with a thin own entry.**
   - `src/core/contracts/agents.ts:2` gets `"omp"` after `"pi"`. `src/adapters/table.ts` gets an `omp` row next to the Pi row [cm `src/adapters/table.ts:98-106`]: `installMode: "in-process"`, `projectSource: "pi:ctx.cwd"` (OMP `ctx.cwd` is a string [src `extensibility/extensions/types.ts:805-807`]), `toolNamePrefix: ""`, `compactDelivery: "pi-flag"`, `hookChannel: { kind: "in-process", path: "omp/index.js" }`, `skillChannel: { kind: "package", path: "skills" }` (Decision 9).
   - `package.json` gets `"omp": { "extensions": ["./omp/index.js"] }` next to `pi` [cm `build/manifests.ts:229-253`]. `omp/index.js` is a few lines: it imports the Pi factory and calls it with `agent: "omp"`. One bundle; the package grows by under 1 KB.
   - [run, this ADR, copy of the r64 home]: package with both keys and the wrapper -> `omp -p ... < /dev/null` exit 0, wrapper log `loaded:omp-entry`, model saw the tool result. [Pi `dist/core/pi-manifest.js:10-20`]: Pi 1.5.2 reads only `pkg.pi`, so the `omp` key leaves Pi as it is.
   - The agent id comes from the entry file the host loaded. This is a sure, positive signal: no shape sniffing, env, argv or regex.
   - No `src/adapters/omp/` dir (blocked by `build/check-removed.mjs:70` [cm]). The `omp` row reuses `src/adapters/pi.ts` decode, encode and `checkPermission`.
2. **Append, never replace (#1332).** One pure helper next to `str()` [cm `src/entries/pi.ts:52-54`]:
   - Array (OMP >= 14.7.0): return `[...event.systemPrompt, payload]`. Every block stays, in order; our payload is the last block, once.
   - String (Pi, Pi-Bolt, OMP < 14.7.0): today's bytes exactly, `base === "" ? payload : base + "\n\n" + payload`.
   - Absent: `payload`. A throw before first delivery returns `{}`; OMP then keeps its own array [src `extensibility/extensions/runner.ts:2682-2686`].
   - The helper uses `Array.isArray` and `typeof`. It runs on both entries, so the shape, not the entry, picks the return form.
   - Rebuild from `event.systemPrompt` on every call. OMP re-runs the hook when the base changes after an override [src `session/agent-session.ts:9413-9432`]; a rebuild gives the right bytes on each run and never appends twice.
   - Cache (ADR-0021): OMP rebuilds the base each turn [src `session/agent-session.ts:9419`]. Earlier blocks stay byte-equal; the payload bytes stay fixed between compactions, as on Pi.
3. **Tools: `loadMode: "essential"` on every `ctx_*` tool, on both hosts (M3).** `piTool()` [cm `src/entries/pi.ts:146-153`] sets the field with no host check.
   - [run `omp-r65-tools.md` §2, §3]: OMP top-level tools 11 -> 20; tools array 17,537 -> 25,714 B (+8,177 B, cached prefix). All 9 tools run: `ctx_execute` (shell, javascript, file), `ctx_batch`, `ctx_index` (content, path, URL), `ctx_search`, `ctx_resume`, `ctx_stats`, `ctx_doctor`, `ctx_purge`.
   - [run `omp-r65-tools.md` §5a, §5c]: real Pi 1.4.0 raw request 14,014 B, byte-identical with and without the field, turns 1-3; no warning. OMP tools and system bytes stable on turns 1-3 and across runs.
   - OMP adds a required intent field `i` to each schema and removes it before `execute()`; our zod schemas need no change [run `omp-r65-tools.md` §3].
4. **One `before_agent_start` per prompt on OMP (O2c).** Cause: we register tools inside the first `before_agent_start` [cm `src/entries/pi.ts:156-163,170`]; that changes OMP's base, and OMP runs the hook again [src `session/agent-session.ts:618,9413-9432`]. Effect today: one extra SessionStart call, and `turn += 1` [cm `src/entries/pi.ts:169`] gives prompt 2 `turn=3` [run `omp-r65-events.md` O2c].
   - The OMP entry registers the 9 tools at load. [run `omp-r65-events.md` O2c probe]: registration at load -> one call per prompt in RPC; [run `omp-r65-tools.md` §5c]: load-time registration with `essential` keeps tool bytes stable on turns 1-3.
   - The Pi entry keeps registration where it is (no Pi change).
   - The turn counter moves to the start of a new prompt (`event.prompt` seen for the first time in this agent run), so a re-run never counts twice on any host.
5. **Host detection outside the process (setup, doctor CLI).** Sure signals only: the `omp` binary on PATH, the plugin store `~/.omp/plugins/omp-plugins.lock.json` [src `packages/utils/src/dirs.ts:714-718,733`], MCP clientInfo `omp-coding-agent` [cm `src/core/contracts/client-map.ts:42`]. `PI_CODING_AGENT_DIR` and `PI_CONFIG_DIR` never select OMP. The wrong comment at `src/core/contracts/client-map.ts:37-41` is fixed. Pi-Bolt stays `pi`.
6. **OMP's own native commands (ADR-0023).** [run `omp-r65-platform.md` §7, `omp-r65-config.md` O11]:
   - Install OMP: `curl -fsSL https://omp.sh/install | sh` (macOS, Linux), `irm https://omp.sh/install.ps1 | iex` (Windows) [doc `README.md:44,88-91`].
   - Install: `omp plugin install context-mode` [run `✔ Installed context-mode@2.1.10`; doc `docs/marketplace.md:71`].
   - Update: `omp plugin upgrade context-mode` [doc `docs/plugin-manager-installer-plumbing.md:126`]. OMP itself: `omp update` [doc `docs/cli-reference.md:309`].
   - Remove: `omp plugin uninstall context-mode` [run `✔ Uninstalled context-mode`; lock becomes `{"plugins":{},"settings":{}}`; data root kept]. Pause: `omp plugin disable|enable context-mode` [run].
   - No `@next`, no `#release`, no `npm i -g` route for OMP users.
7. **Doctor names OMP (ADR-0010).** Inside OMP, `ctx_doctor` prints `agent omp`. New D3 check: context-mode in `~/.omp/plugins/omp-plugins.lock.json` with `"enabled": true` and in `~/.omp/plugins/package.json`. Fix lines:
   - not installed: `omp plugin install context-mode`;
   - disabled: `omp plugin enable context-mode`;
   - old version: `omp plugin upgrade context-mode`;
   - OMP below 14.7.0: info `OMP <v> is older than the tested floor 14.7.0. Update it with: omp update`.
   - The pass line names Pi's list form for Pi and `omp plugin list` for OMP [cm `src/core/tools/doctor.ts:184-185`].
   - D2 node: OMP 18.20.0 reports `v26.3.0` under Bun 1.4.4, which passes `NODE_MIN` 24.15.0 [run `omp-r65-platform.md` §5b]. An older OMP whose Bun reports less gets the D2 fix `omp update`.
8. **`ctx_upgrade` on OMP writes nothing under `~/.pi`.** `hostConfigPath("omp")` returns `null` (OMP has no MCP entry from us) [cm `src/core/ops/host-write.ts:28-38`], so `regenerateHostConfig` returns no rows [cm `:75-87`]. `hostUpdateCommand("omp")` gives `omp plugin upgrade context-mode` [cm `src/core/project/config-dir.ts:147`]. The plugin root of an in-process row is the package dir (the dir of `package.json`), not the entry dir, so `<pkg>/omp` and `<pkg>` are one install [cm `src/core/ops/plugin-root.ts:186-187,193`, `src/core/tools/upgrade.ts:49-59`].
9. **Skills (O7).** OMP has no `skills` manifest field [src `extensibility/plugins/types.ts:27-49`]. It scans `<pluginRoot>/skills/*/SKILL.md` [src `discovery/omp-plugins.ts:65-80`]. [run `omp-r65-config.md` O7]: `omp skill list --json` lists our 3 skills from root `skills/`, which name the Claude tools today. The `omp` row's `skillChannel` is `skills` with prefix `""`, so the build renders root `skills/` with the bare `ctx_*` name too, through the existing joined-names rule [cm `build/build.mjs:252-264`, `src/setup/registry.ts:85-91`]. Pi keeps `pi/skills`.
10. **Tool filter (O10).** OMP has no `getSettings` [src `extensibility/extensions/types.ts:1856`]. OMP documents `pi.pi` (package exports) on the extension API [doc `docs/extensions.md:308-313`]. On OMP, `excludedTools` reads `contextMode.excludeTools` from `api.pi.settings` global settings, merged with project settings, per call [run `omp-r65-config.md` O10: `cm:{"excludeTools":["read"]}` read from `~/.omp/agent/config.yml`]. The user key is the same as on Pi. A missing or bad value gives `[]`, as on Pi [cm `src/entries/pi.ts:70-80`].
11. **MCP import from other hosts (O4).** Default OMP 18.20.0 does not import `~/.claude.json` MCP servers: no spawn, no second set [run `omp-r65-config.md` O4]. User sources are opt-in through `enabledProviders` or `CLAUDE_CONFIG_DIR` [src `capability/index.ts:51-60,419-429`, `discovery/claude.ts:65-69,86-99`]. With opt-in, OMP spawned our server and the model saw 9 more `xd://mcp__context_mode_ctx_*` tools [run].
    - Doctor reads these JSON keys. When OMP would import a `context-mode` server and `~/.omp/agent/mcp.json` `disabledServers` lacks it, doctor prints info: `OMP also imports context-mode from <file>. Add "context-mode" to disabledServers in ~/.omp/agent/mcp.json.`
    - `context-mode setup --agents omp` adds that entry (merge, keep other keys) only in that case; uninstall removes only our name [doc `docs/mcp-config.md:96,433-448`; run: `disabledServers` -> no spawn].
12. **Data paths and Pi + OMP on one machine.** Data root stays `~/.context-mode` with `CONTEXT_MODE_DATA_DIR` [cm `src/core/contracts/constants.ts:192`]; one `context.db` per project for all agents [run `omp-r65-config.md` "Data paths"]. Rows from OMP carry `agent=omp`, so stats, resume and doctor tell OMP from Pi. Pi reads `~/.pi`, OMP reads `~/.omp`; each in-process doctor checks only its own host; the CLI doctor lists each host it finds.
13. **Input modes (O2b).** `input` fires in RPC and interactive mode; print mode makes no prompt row (host limit, docs line). The first-turn payload is the same in all three modes [run `omp-r65-events.md` "First-turn session payload"].
14. **Compaction (O2a).** The Pi `pi-flag` path runs unchanged on OMP [cm `src/core/hooks/dispatch.ts:162-177`, `src/adapters/table.ts:102`]: after `session_compact`, the next turn sends OMP's base + INSTRUCTIONS, no resume hint; OMP's own `<summary>` is in a user message [run `omp-r65-events.md` O2a].
15. **Minimum OMP version (O5): 14.7.0** (2026-05-05, first `systemPrompt: string[]`) [run `omp-r65-platform.md` §2, npm tarballs 14.6.6 `string`, 14.7.0 `string[]`; doc `packages/coding-agent/CHANGELOG.md` 14.7.0 Breaking Changes]. Tests pin 18.20.0.
16. **Windows (O6).** Same code on all OS: home `%USERPROFILE%\.omp` [src `packages/utils/src/dirs.ts:29,115-117`], install script with SHA-256 check [src `scripts/install.ps1:18-21,36,318-345`]. The CI job (Part 2) proves it on `windows-latest`.
17. **`UNSUPPORTED_HOSTS` loses the OMP row** [cm `src/core/contracts/constants.ts:718-719`].

## Support matrix (OMP >= 14.7.0, tested on 18.20.0, with this ADR)

| # | Feature | Status | Evidence |
|---|---|---|---|
| 1 | System prompt kept, our payload appended once | supported (M1) | [run] `omp-hooks-proof.md` §6d; [src] `extensibility/extensions/runner.ts:2682-2686` |
| 2 | `ctx_*` as top-level tools | supported (M3) | [run] `omp-r65-tools.md` §2 |
| 3 | All 9 `ctx_*` calls run | supported (M3) | [run] `omp-r65-tools.md` §3 |
| 4 | Tools and prompt bytes stable turn to turn | supported (M3) | [run] `omp-r65-tools.md` §5c |
| 5 | One `before_agent_start` per prompt, right turn numbers | supported (M2) | [run] `omp-r65-events.md` O2c |
| 6 | Own agent id `omp` in rows, stats, resume | supported (M2) | [run] this ADR, wrapper load |
| 7 | PreToolUse routing (`tool_call` block) | supported (M7) | [run] `omp-hooks-proof.md` §1, §6a |
| 8 | PostToolUse capture (`tool_result` replace, index) | supported (M7) | [run] `omp-hooks-proof.md` §2, §6b |
| 9 | `structuredContent` in tool results | host limit: OMP keeps `content` only; doctor info "OMP keeps tool output in content; context-mode writes its notes there." User does nothing | [src] `extensibility/extensions/runner.ts:2286-2297` |
| 10 | Prompt capture (`input`) in RPC and interactive | supported (M7) | [run] `omp-r65-events.md` O2b |
| 11 | Prompt capture in print mode (`omp -p`) | host limit: no event; docs line "Print mode sends no prompt event. Use omp or omp --mode rpc to keep prompts." | [src] `modes/rpc/rpc-mode.ts:1909`, `modes/controllers/input-controller.ts:1089` |
| 12 | Session start and resume hint | supported (M1) | [run] `omp-r65-events.md` first-turn payload |
| 13 | Compaction, next-turn payload | supported (M7) | [run] `omp-r65-events.md` O2a |
| 14 | Session id and project dir | supported (M2) | [src] `extensibility/extensions/types.ts:805-807`, `session/session-manager.ts:3257` |
| 15 | Install with `omp plugin install context-mode` | supported (M5) | [run] `omp-r64.md` install log |
| 16 | Update: `omp plugin upgrade context-mode`, `omp update` | supported (M6) | [doc] `docs/plugin-manager-installer-plumbing.md:126`, `docs/cli-reference.md:309` |
| 17 | Remove, disable, enable with `omp plugin` verbs | supported (M5) | [run] `omp-r65-config.md` O11 |
| 18 | `context-mode setup --agents omp` | supported (M5) | [cm] `src/setup/registry.ts:247` |
| 19 | Doctor names OMP, reads `~/.omp`, OMP fix lines | supported (M6) | [run] `omp-r65-tools.md` §6 |
| 20 | `ctx_upgrade` text, no write under `~/.pi` | supported (M6) | [run] `omp-r65-tools.md` §6 |
| 21 | Tool filter `contextMode.excludeTools` | supported (M2) | [run] `omp-r65-config.md` O10 |
| 22 | Skills with OMP tool names | supported (M4) | [run] `omp-r65-config.md` O7 |
| 23 | No double tools from MCP import | supported (M6) | [run] `omp-r65-config.md` O4 |
| 24 | Runtime: `node:sqlite` and `NODE_MIN` under Bun | supported (M6) | [run] `omp-r65-platform.md` §5b; [issue] D2 |
| 25 | OMP below 14.7.0 | host limit: doctor info "OMP <v> is older than the tested floor 14.7.0. Update it with: omp update" | [run] `omp-r65-platform.md` §2 |
| 26 | Windows install and run | supported (M7, CI `windows-latest`) | [src] `scripts/install.ps1:18-21`; [doc] `README.md:88-91` |
| 27 | Pi and OMP on one machine | supported (M4) | [run] `omp-r65-config.md` "Data paths" |
| 28 | Scripts with `omp -p` | host limit: OMP reads stdin; docs line "Add < /dev/null in scripts." | [run] `omp-r64.md` run4 (140 s wait) |

Counts: 28 rows; supported 24, host limit 4, unverified 0.

## Consequences

- OMP users keep the base prompt, AGENTS.md and other extensions' sections, and get our payload as one more block.
- OMP users see `ctx_*` as normal tools; each request carries +8,177 B of tool schema (cached prefix).
- Pi and Pi-Bolt send the same bytes and install the same way. Golden tests pin this.
- One bundle serves both hosts; `omp/index.js` is a wrapper.
- About 20 places pin "10 agents" or the unsupported list; they change in M4 and in the docs sweep (D-OMP-DOCS-2).
- A live OMP fire test in CI on 3 OS guards the event shapes on each OMP pin bump.

## Alternatives rejected

1. **OMP as Pi (no new AgentId).** Rows say `pi`, doctor lies (ADR-0010), setup cannot use OMP's verbs (ADR-0023).
2. **A full second bundle `omp/index.js`.** +2.2 MB for the same code. The wrapper gives the same signal for under 1 KB.
3. **Agent id from the prompt shape alone.** OMP < 14.7.0 sends a string and would be counted as Pi; the entry file is sure on every version.
4. **MCP only, like v1 (`~/.omp/agent/mcp.json`).** No routing, no capture, no compaction payload.
5. **Detect OMP with `PI_CODING_AGENT_DIR`, `process.versions.bun`, argv or a regex.** Owner rules forbid each one.
6. **`loadMode` on the OMP path only.** A branch and a test per Pi release; Pi ignores the field byte for byte (Decision 3).
7. **Ask the model to call `write xd://ctx_*`.** A new prompt text that a fake model cannot prove; top-level tools need no text.
8. **Write `disabledServers` on every OMP install.** A file write most users never need; doctor names the case when it is real.
9. **A new MCP tool for OMP.** Owner rule: no new MCP tool.

---

# Part 2: PRD

## Goal

OMP users install context-mode with OMP's own command, keep every system prompt block, see the `ctx_*` tools, and get a doctor that names OMP. Pi and Pi-Bolt do not change by one byte.

## Users

- OMP users who lose their base prompt and AGENTS.md today (#1332).
- Beta testers named in #1332: **@tejasach06** (Windows x64), **@itsmylife44** (macOS arm64), **@jeffscottward** (Linux, macOS).
- Pi and Pi-Bolt users: they see no change.

## Non-goals

- A new MCP tool. A `src/adapters/omp/` dir. OMP's old `hooks/pre|post` surface.
- An MCP entry in `~/.omp/agent/mcp.json`. `platform-bridge.mjs` (dropped for good).
- OMP named profiles (`~/.omp/profiles/<name>/agent` [doc `docs/extension-loading.md:88`]) beyond the default profile.

## Milestones

Each step: red test -> green -> profile (before/after) -> push `lane/r64-omp` -> one DEVIATIONS row. Build runs only the changed test files; the full suite runs once at ship.

| M | Step | Files (origin/main) | Tests | DEVIATIONS |
|---|---|---|---|---|
| M0 | Baseline profile on `fea7780d` | - | P1-P7 | - |
| M1 | Prompt helper: array appends, string unchanged | `src/entries/pi.ts:52-54,167-191` | T1-T7 | D-OMP-PROMPT-1 |
| M2 | Shared factory takes `agent`; OMP entry registers tools at load; turn once per prompt; OMP tool filter | `src/entries/pi.ts:66-80,92,112,117,156-170` | T8-T13 | D-OMP-ENTRY-1, D-OMP-TURN-1, D-OMP-FILTER-1 |
| M3 | `loadMode: "essential"` in `piTool()` | `src/entries/pi.ts:146-153` | T14 | D-OMP-TOOLS-1 |
| M4 | `omp` AgentId, table row, constants, manifest `omp` key, wrapper, skills, host lists | `src/core/contracts/agents.ts:2`, `src/adapters/table.ts:98-106,117,142`, `src/core/contracts/constants.ts:373,628-630,718-719,751,838,1096`, `src/core/contracts/client-map.ts:37-42`, `src/core/project/resolve.ts:43-44,64`, `src/core/ops/doctor-hook.ts:86-88`, `build/manifests.ts:229-253,284`, `build/build.mjs:252-264` | T15-T22 | D-OMP-ROW-1, D-OMP-MANIFEST-1, D-OMP-SKILLS-1 |
| M5 | Setup and uninstall with `omp plugin` verbs | `src/setup/registry.ts:47,247,261-270`, `src/setup/engine.ts:1178`, `src/core/ops/uninstall.ts:145-150` | T23-T26 | D-OMP-SETUP-1 |
| M6 | Doctor rows, fix lines, `ctx_upgrade`, MCP-import info | `src/core/tools/doctor.ts:184-185`, `src/core/ops/host-write.ts:28-38`, `src/core/project/config-dir.ts:147`, `src/core/ops/plugin-root.ts:186-193`, `src/core/tools/upgrade.ts:49-63` | T27-T35 | D-OMP-DOCTOR-1, D-OMP-UPGRADE-1 |
| M7 | Live OMP fire block, e2e cases, CI job on 3 OS | `tests/0020-fire-plugin-ext.test.mjs:162`, `e2e/cases/GP2-prompt-surface.e2e.mjs:172`, `e2e/cases/GP3-hooks.e2e.mjs`, `e2e/cases/GP11-doctor-upgrade.e2e.mjs:64`, `.github/workflows/ci.yml:88-96,189-190` | T36-T51 | D-OMP-FIRE-1, D-OMP-CI-1 |
| M8 | Docs: 10 -> 11 agents, `docs/install/omp.md`, issue forms | `build/check-install-docs.mjs:160`, docs list below | T52 | D-OMP-DOCS-1 |
| M9 | Beta for @tejasach06 @itsmylife44 @jeffscottward from the lane build | - | their `ctx_doctor` output | - |

## RGR tests (existing ADR-grouped files only, ADR-0024; no new test file)

Each test is red on `fea7780d` or pins today's Pi bytes.

`tests/0020-plugins.test.mjs` [cm `docs/architecture/TEST-LAYOUT.md:51`], new describe "ADR-0026 OMP entry (#1332)":

- T1: array `["BASE", "<project-context>AGENTS</project-context>", "OTHER"]` -> same 3 blocks in order, then the payload; length 4; payload once.
- T2: string `"base"` -> bytes equal the `fea7780d` output (golden; Pi and Pi-Bolt).
- T3: array, two turns, same base -> same output bytes (D-CACHE-PI-1).
- T4: array, hook throws after first delivery -> base blocks plus the same payload.
- T5: array, hook throws before first delivery -> `{}`.
- T6: array, compact turn -> base kept, payload = INSTRUCTIONS only, no resume hint (O2a).
- T7: empty array -> `[payload]`.
- T8: re-run in one prompt with a grown base -> output = new base + payload once; one turn counted (O2c).
- T9: OMP entry -> `handleHook` gets `omp`; Pi entry -> `pi`.
- T10: Pi entry with `PI_CODING_AGENT_DIR` and `PI_CONFIG_DIR` set -> stays `pi`.
- T11: OMP entry calls `registerTool` 9 times at load; Pi entry calls it in the first `before_agent_start` (unchanged).
- T12: two prompts -> turns 1 and 2 on both entries.
- T13: OMP entry, `api.pi.settings` with `contextMode.excludeTools: ["read"]` -> `read` result kept; no settings -> `[]`.
- T14: each registered tool has `loadMode: "essential"`; every other field deep-equals `fea7780d`.

Build and host lists (same commit as M4):

- T15 `tests/0018-build.test.mjs`: `package.json` has `omp.extensions = ["./omp/index.js"]`; `pi` key unchanged; `omp/index.js` in `OUT_FILES` and under 1 KB [cm `tests/0018-build.test.mjs:538`].
- T16 `tests/0018-build.test.mjs`: rendered root `skills/ctx-doctor/SKILL.md` names `ctx_doctor` bare as one of the joined names; `pi/skills` unchanged.
- T17 `tests/0018-contracts.test.mjs:37`: `AGENT_IDS` has 11, with `omp`.
- T18 `tests/prd10-hooks-runtime.test.mjs:2754`: `ADAPTERS` has 11.
- T19 `tests/0007-identity.test.mjs:1226-1228`: `projectSource` for `omp` is `pi:ctx.cwd`.
- T20 `tests/0010-doctor-upgrade.test.mjs:647,650-651,684,688`: `omp` is supported, not in `UNSUPPORTED_HOSTS`; in-process list `["pi","opencode","omp"]`.
- T21 `tests/0019-cli.test.mjs:222-232`: "Supported agents" lists omp; `omp` and `omp-coding-agent` leave the unsupported loop.
- T22 `tests/0020-adapters.test.mjs`: the `omp` row uses the Pi decode and encode; `toolNamePrefix` is `""`.

Setup (`tests/0019-setup-engine.test.mjs` [cm `docs/architecture/TEST-LAYOUT.md:58`]):

- T23: `setup --agents omp` with a stub `omp` plans `omp plugin install context-mode`; never `npm i -g`, never `@next`.
- T24: uninstall plans `omp plugin uninstall context-mode`.
- T25: `enabledProviders: [claude]` plus a `context-mode` entry in `~/.claude.json` -> setup merges `disabledServers: ["context-mode"]` and keeps other keys; import off -> no write.
- T26: uninstall removes only our name from `disabledServers`.

Doctor and upgrade (`tests/0010-doctor-upgrade.test.mjs` [cm `docs/architecture/TEST-LAYOUT.md:61`]):

- T27: lock with context-mode enabled -> `agent omp`, D3 PASS; no line names `~/.pi`.
- T28: no lock entry -> D3 FAIL, fix `omp plugin install context-mode`.
- T29: lock `"enabled": false` -> D3 FAIL, fix `omp plugin enable context-mode`.
- T30: OMP version 14.6.6 -> info with `omp update`.
- T31: `PI_CODING_AGENT_DIR` alone, no `omp`, no lock -> host is never `omp` (extends `:695-703`).
- T32: Pi-Bolt fixture -> host stays `pi`.
- T33: `ctx_upgrade` on an OMP fixture -> host row `omp plugin upgrade context-mode`; no plugin-root row; no file under `~/.pi` (tree hash before = after).
- T34: MCP import on and `disabledServers` without us -> info line with the file name and the fix.
- T35: Pi fixture -> doctor and upgrade output equal `fea7780d` (golden).

Live fire, `tests/0020-fire-plugin-ext.test.mjs` [cm `docs/architecture/TEST-LAYOUT.md:57`], OMP block next to the Pi block [cm `tests/0020-fire-plugin-ext.test.mjs:162,171`], skipped when `omp` is absent. Fixtures: the proof harness moved into the test (fake OpenAI-compatible model on port 0, first reply = one tool call picked by a prompt keyword, second = text that echoes the last tool message, a request with no tools = summary text; it saves each request). Temp HOME, `startup.setupWizard: false` in `config.yml` [src `modes/settings.ts:1270-1280`], `< /dev/null` in print mode, package installed with `omp plugin link <built dir>` [run `omp-r65-config.md` manifest test]:

- T36: print `"hi"` -> system holds the RFC 2119 base, `<project-context>`, AGENTS.md, then the payload once (today 592 chars).
- T37: tools in request 1 = 11 built-ins + 9 `ctx_*`; `ctx_stats` call returns the stats table.
- T38: `R64BIGREAD` (108,894 B read) -> tool message is the `ctx_execute` hint; deny -> marker file absent.
- T39: `R64BIG` (`seq 1 40000`) -> tool message ends with the `ctx_search` hint; `events` and `sources` rows with `agent=omp`.
- T40: RPC prompt -> `prompt` row with the text; print mode -> no row (pins the host limit).
- T41: RPC compact (`keepRecentTokens: 1`) then a prompt -> system = base + INSTRUCTIONS; user message holds OMP's `<summary>`.
- T42: RPC two prompts -> one `before_agent_start` per prompt; rows `turn` 1 and 2.
- T43: `ctx_upgrade` in OMP -> no `~/.pi` dir after the run.

E2E (existing GP files):

- T44 `GP2/omp-system-prompt-append` in `e2e/cases/GP2-prompt-surface.e2e.mjs` (mirror of `:172`).
- T45 `GP3/omp-tool-call-block`, T46 `GP3/omp-tool-result-replace`, T47 `GP3/omp-input-captured`, T48 `GP3/omp-compact-resume` in `e2e/cases/GP3-hooks.e2e.mjs`.
- T49 `GP11/omp-doctor-real-paths` in `e2e/cases/GP11-doctor-upgrade.e2e.mjs` (mirror of `:64`): `ctx_doctor` names OMP and `~/.omp`.
- T50 `GP11/omp-upgrade-no-pi-write`: `ctx_upgrade` prints OMP verbs and leaves `~/.pi` absent.
- T51 `GP1/omp-native-install` in `e2e/cases/GP1-install.e2e.mjs`: `omp plugin install`, `upgrade`, `uninstall` lines from `docs/install/omp.md` run in a temp HOME.

Docs check:

- T52 `build/check-install-docs.mjs`: red while `NATIVE_HOSTS` [cm `build/check-install-docs.mjs:160`] has `omp` and `docs/install/omp.md` is missing.

Total: 52 tests (T1-T52) in 15 existing files (10 under `tests/`, 4 GP files under `e2e/cases/`, `build/check-install-docs.mjs`), plus profile runs P1-P7.

## CI job (M7, `.github/workflows/ci.yml`, job `ci`, after the OpenCode steps [cm `.github/workflows/ci.yml:17-24,88-96`])

The `ci` matrix already runs macOS, Ubuntu and Windows. OMP installs with its own script, pinned, unattended, into `runner.temp` [src `scripts/install.sh:6,20`, `scripts/install.ps1:18-21,36`; run `omp-r65-platform.md` §3: exit 0 in 10.4 s, HOME untouched]. `irm | iex` cannot pass flags, so Windows uses the scriptblock form of the same script. The download host can fail; each step retries 3 times, and `omp --version` then fails the job, so a missing `omp` never turns into a silent skip in CI.

```yaml
      # D-OMP-CI-1: the real OMP 18.20.0 on all 3 OS for the omp fire tests (tests/0020-fire-plugin-ext).
      # OMP's own install script, prebuilt binary, SHA-256 checked by the script. Temp dir, no login, no key.
      - name: omp 18.20.0 (native install script) for the omp fire tests (D-OMP-CI-1)
        if: runner.os != 'Windows'
        shell: bash
        env:
          PI_INSTALL_DIR: ${{ runner.temp }}/omp-bin
        run: |
          for i in 1 2 3; do curl -fsSL https://omp.sh/install | sh -s -- --binary --ref v18.20.0 && break; sleep 20; done
          echo "$PI_INSTALL_DIR" >> "$GITHUB_PATH"
      - name: omp 18.20.0 (native install script, Windows) for the omp fire tests (D-OMP-CI-1)
        if: runner.os == 'Windows'
        shell: pwsh
        env:
          PI_INSTALL_DIR: ${{ runner.temp }}\omp-bin
        run: |
          foreach ($i in 1..3) { try { & ([scriptblock]::Create((irm https://omp.sh/install.ps1))) -Binary -Ref v18.20.0; break } catch { Start-Sleep 20 } }
          "$env:PI_INSTALL_DIR" | Out-File -FilePath $env:GITHUB_PATH -Encoding utf8 -Append
      - run: omp --version
        name: omp version (D-OMP-CI-1)
```

The existing step `node --test "tests/**/*.test.mjs"` then runs T36-T43 on 3 OS x 2 Node versions. The `windows-hosts` job step name "10 agents" [cm `.github/workflows/ci.yml:189-190`] becomes "11 agents", and `e2e/checks/windows-hosts.mjs` gets an `omp` host that installs with the script above, not npm.

## Profiling plan (rule: profile always)

Method: median of 50 runs (p90 too), same machine, temp HOME, warm cache, runs interleaved before/after. Before = `fea7780d` (M0). After = each milestone head. Baselines below are from macOS arm64 [run `omp-r65-platform.md` §5, `omp-r65-tools.md` §5c].

| P | Metric | How | Baseline | Pass |
|---|---|---|---|---|
| P1 | OMP `loadExtensions` | `PI_TIMING=1 omp -p --no-session ... < /dev/null`, OMP's own timer [src `sdk.ts:1237`] | 54.8 ms (p90 57.3) | <= 60 ms and <= +10% |
| P2 | OMP startup Total delta vs `--no-extensions` | same | +64 ms (402.0 vs 337.6) | <= +70 ms |
| P3 | `before_agent_start` in OMP's runtime | probe that imports our entry, 50 calls | median 0.23 ms, first 12-15 ms | median <= 0.5 ms |
| P4 | `before_agent_start` on Pi, string path | same probe under Pi | M0 measures | within noise (<= +5%) |
| P5 | `context-mode doctor` wall, OMP present | `node cli.mjs doctor < /dev/null` | 630 ms (p90 763) | <= +10%; result 850 ms after D-OMP-DOCTOR-PERF-1, accepted by the owner on 2026-11-14 (see Status) |
| P6 | Bytes: `pi/index.js`, `omp/index.js`, request size | `wc -c`; saved requests | 2,230,634 B; Pi request 14,014 B; OMP tools 17,537 B | Pi request equal; OMP tools 25,714 B; wrapper < 1 KB |
| P7 | Wall time of edited test files and full suite once | `node --test` | `0020-plugins` 2.0 s, `0010-doctor-upgrade` 12.9 s, `0019-setup-engine` 34.5 s [cm `docs/architecture/TEST-LAYOUT.md:51,58,61`] | <= +10% per file |

## DEVIATIONS rows (`docs/architecture/DEVIATIONS.md`, one per change)

| Id | Files | Decision |
|---|---|---|
| D-OMP-PROMPT-1 | `src/entries/pi.ts`, `tests/0020-plugins.test.mjs` | #1332: an array `systemPrompt` gets our payload as the last block; a string keeps the `fea7780d` bytes. Shape check, no regex. |
| D-OMP-ENTRY-1 | `src/entries/pi.ts`, `tests/0020-plugins.test.mjs` | The factory takes the agent id from its entry: `omp/index.js` passes `omp`. Env never selects OMP. |
| D-OMP-TURN-1 | `src/entries/pi.ts`, `tests/0020-plugins.test.mjs` | The OMP entry registers tools at load; the turn counts once per prompt (OMP re-runs `before_agent_start`). |
| D-OMP-FILTER-1 | `src/entries/pi.ts`, `tests/0020-plugins.test.mjs` | On OMP, `contextMode.excludeTools` comes from `api.pi.settings`, per call. |
| D-OMP-TOOLS-1 | `src/entries/pi.ts`, `tests/0020-plugins.test.mjs` | `loadMode: "essential"` on every `ctx_*` tool; Pi request bytes equal. |
| D-OMP-ROW-1 | `agents.ts`, `table.ts`, `constants.ts`, `client-map.ts`, `resolve.ts`, `doctor-hook.ts`, host-list tests | `omp` is the 11th AgentId; it leaves `UNSUPPORTED_HOSTS` (OMP part of D-UNSUPPORTED-HOSTS-1 reverted). |
| D-OMP-MANIFEST-1 | `build/manifests.ts`, `build/build.mjs`, `tests/0018-build.test.mjs` | `package.json` gets `omp.extensions` and the `omp/index.js` wrapper; `pi` key unchanged. |
| D-OMP-SKILLS-1 | `src/adapters/table.ts`, `build/build.mjs`, `tests/0018-build.test.mjs` | Root `skills/` also names the bare `ctx_*` tools, for OMP. |
| D-OMP-SETUP-1 | `src/setup/registry.ts`, `src/setup/engine.ts`, `src/core/ops/uninstall.ts`, `tests/0019-setup-engine.test.mjs` | Setup and uninstall use `omp plugin` verbs; `disabledServers` only when OMP imports us. |
| D-OMP-DOCTOR-1 | `doctor.ts`, `doctor-config.ts`, `config-dir.ts`, `tests/0010-doctor-upgrade.test.mjs` | Doctor names OMP, reads the OMP lock file, prints OMP verbs. |
| D-OMP-UPGRADE-1 | `upgrade.ts`, `host-write.ts`, `plugin-root.ts`, `tests/0010-doctor-upgrade.test.mjs` | `ctx_upgrade` on OMP writes nothing under `~/.pi`; plugin root = package dir. |
| D-OMP-FIRE-1 | `tests/0020-fire-plugin-ext.test.mjs`, `e2e/cases/GP1`, `GP2`, `GP3`, `GP11` | Live OMP fire test and e2e cases. |
| D-OMP-CI-1 | `.github/workflows/ci.yml`, `e2e/checks/windows-hosts.mjs` | OMP 18.20.0 from its own script on 3 OS. |
| D-OMP-DOCS-1 | `docs/install/*`, ADR-0023, PRD, TECH-SPEC, `12-plugins.md`, issue forms | OMP install docs with OMP's verbs; 10 -> 11 agents. |

## Docs changes (M8)

- `docs/install/README.md`: 10 -> 11 agents; row `OMP | omp plugin install context-mode | omp plugin upgrade context-mode`.
- New `docs/install/omp.md`, same sections as `docs/install/pi.md`:
  - Install OMP: `curl -fsSL https://omp.sh/install | sh`; Windows `irm https://omp.sh/install.ps1 | iex`.
  - Install: `omp plugin install context-mode`. Update: `omp plugin upgrade context-mode`; OMP: `omp update`. Remove: `omp plugin uninstall context-mode`.
  - Check: run `ctx_doctor` inside OMP, or `/skill:ctx-doctor`.
  - Known limits: the 4 host-limit rows.
  - Verified: OMP version, OS, date from the CI run.
- `docs/architecture/PRD.md`, `TECH-SPEC.md`, `modules/01-contracts.md`, `modules/12-plugins.md`, ADR-0023 native table: add OMP.
- `.github/ISSUE_TEMPLATE/feature.yml`, `bug.yml`, `agent-report.yml`, `.github/scripts/issue-intake.mjs`: add OMP, so the labels come on their own.

## Rollout

Owner rule (verbatim): "OMP icin patch yapmak yasak ancak ki ancak OMP destegi gelirse o zaman hata ortadan kalkar."

1. M1-M8 land on `lane/r64-omp`. Each green step pushes the lane, so no work is lost. No step goes to `main` alone; the #1332 prompt fix too waits for the whole.
2. When M1-M8 are green (full `node --test` once, T36-T51 on a live `omp`, the CI job green on 3 OS, P1-P7 in the pass line), OMP support reaches `main` in one merge after the owner says yes. Ship it at once when it is whole.
3. M9: ask @tejasach06, @itsmylife44 and @jeffscottward to install the beta with `omp plugin install context-mode` and send `ctx_doctor` output.

## Risks

- OMP changes event shapes in a minor release. Guard: the CI job; bump the pin with T36-T43 green.
- A later Pi release checks unknown tool fields. Guard: the Pi fire test with the real Pi CLI (T14 golden; the Pi CLI needs a native install step in CI, today the Pi fire test skips there [cm `tests/0020-fire-plugin-ext.test.mjs:171`]).
- OMP renames `api.pi.settings`. Guard: T13; a missing value gives `[]`.
- The download host for OMP is down. Guard: retry, then a red CI job with a clear step name.

## Open questions (only what this step cannot close)

- O-A: Does a real model call `ctx_*` well on OMP? A fake model cannot prove it. M9 beta logs close it.
- O-B: Why print mode runs `before_agent_start` once even when the base changes. Not needed: Decision 4 removes the re-run on every mode; T42 pins RPC.
- O-C: Windows path form of `ctx.cwd` and Bun path handling. The M7 CI job on `windows-latest` proves it.
- O-D: Pi CLI fire test in CI. Add Pi's own install step in M7 so T14 runs live, not only as a golden.
- O-E: OMP adoption numbers for the README. Binary installs are not public; npm counts are low.
