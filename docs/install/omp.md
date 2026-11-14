# Install context-mode v2 on OMP

OMP (oh-my-pi) installs context-mode from its own plugin store, with its own commands.

## Get OMP

macOS and Linux:

```sh
curl -fsSL https://omp.sh/install | sh
```

Windows:

```powershell
irm https://omp.sh/install.ps1 | iex
```

## Install

```sh
omp plugin install context-mode
```

Update:

```sh
omp plugin upgrade context-mode
```

Check: `context-mode doctor`, or inside OMP call the `ctx_doctor` tool, or run `/skill:ctx-doctor`.

OMP itself updates with its own command:

```sh
omp update
```

To pause context-mode and keep it installed, run `omp plugin disable context-mode`. Run `omp plugin enable context-mode` to turn it on again.

OMP gets the hooks, the `ctx_*` tools and the skills `/skill:ctx-doctor`, `/skill:ctx-stats` and `/skill:ctx-upgrade` from the plugin. Restart OMP after the install.

Setup is the fallback and the repair for what the native step cannot do. It runs the same `omp plugin install context-mode`:

```sh
context-mode setup --agents omp
```

With no terminal (a script or CI), add `--yes`: `context-mode setup --yes --agents omp`. Without it, setup stops with exit 2. The `context-mode` command comes from the npm package ([Install](./README.md)).

To do the setup step by hand, run `context-mode setup --print omp` and follow what it prints.

## What setup changes

- Runs `omp plugin install context-mode`. OMP writes its plugin store (`omp-plugins.lock.json` and `package.json` under `~/.omp/plugins`).
- OMP loads the plugin inside the agent. The hooks run as its own event handlers (session_start, input, tool_call, tool_result), and the `ctx_*` tools come with the plugin. OMP needs no MCP entry.
- When OMP also imports MCP servers from other agents, setup adds `context-mode` to `disabledServers` in OMP's `mcp.json`, so the tools load once.
- Backs up each file first. A failed step is rolled back byte for byte.
- Never edits `CLAUDE.md`, `AGENTS.md` or other instruction files.

## Verify

```sh
context-mode doctor --agents omp
omp plugin list
```

`omp plugin list` must show `context-mode`. Inside OMP, `ctx_doctor` prints `agent omp`. Doctor reads the plugin store and checks that context-mode is there and enabled. When a check fails, it prints the fix: `omp plugin install context-mode`, `omp plugin enable context-mode` or `omp plugin upgrade context-mode`.

## Remove

```sh
omp plugin uninstall context-mode
```

`omp plugin uninstall` removes the plugin and its line in the plugin store. Your context-mode data stays. If you also ran setup, undo it first:

```sh
context-mode setup --remove --agents omp
```

It puts each touched file back. To remove the npm package too, see [Uninstall](./README.md#uninstall).

## Known limits

These come from how OMP works:

- OMP keeps tool output in `content` only. context-mode writes its notes there, so you need to do nothing.
- Print mode (`omp -p`) sends no prompt event. Use `omp` or `omp --mode rpc` to keep prompts.
- OMP 14.7.0 is the tested floor. On an older OMP, doctor prints the version and the fix: `omp update`.
- In a script, `omp -p` reads stdin. Add `< /dev/null` in scripts.
- OMP can import MCP servers from other agents, such as Claude Code. Then it would load context-mode twice. Setup adds `context-mode` to `disabledServers` in OMP's `mcp.json`, and doctor prints that fix when the entry is missing.

## Report a problem

Run `context-mode doctor --agents omp`, or call `ctx_doctor` inside OMP. A failed check prints a `gh issue create` command and a report file under `~/.context-mode/reports/`. Open the [v2 bug form](https://github.com/mksglu/context-mode/issues/new?template=bug.yml) and paste the report.

## Verified

Run on macOS (arm64) with OMP 18.20.0 (the latest OMP on 2026-11-13), in a clean temporary HOME.

| Command | OMP version | Date | Result |
|---|---|---|---|
| `omp plugin install context-mode` | 18.20.0 | 2026-11-13 | Pass: `Installed context-mode` |
| `omp plugin uninstall context-mode` | 18.20.0 | 2026-11-13 | Pass: `Uninstalled context-mode`, plugin store empty, data kept |
| `omp plugin disable` and `enable context-mode` | 18.20.0 | 2026-11-13 | Pass |

The CI job installs OMP 18.20.0 with its own script on Linux, macOS and Windows and runs `omp --version` and the OMP tests (D-OMP-CI-1). It runs on each push to `main`, so the merge of OMP support is its first 3-OS run. Evidence: [ADR-0026](../architecture/adr/0026-omp-host.md), [DEVIATIONS](../architecture/modules/DEVIATIONS.md).
