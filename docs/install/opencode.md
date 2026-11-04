# Install context-mode v2 on OpenCode

## Install

```sh
opencode plugin add context-mode
```

Update:

```sh
opencode plugin update
```

OpenCode 1.19 (`opencode-ai`) installs with `opencode plugin context-mode --global` and updates with `opencode plugin context-mode --global --force`. On OpenCode 2 that form is an error (`Unknown subcommand`, `Unrecognized flag: --global`).

Check: `context-mode doctor`

Two OpenCode lines exist: `opencode-ai` (1.19.x, stops at 1.19.5) and `@opencode/cli` (2.x, binary `opencode`; latest 2.2.5). The install command differs: `plugin add` on 2.x, `plugin <module> --global` on 1.19. One plugin serves both: OpenCode 1.19 and KiloCode call `server`; OpenCode 2 reads `exports["./server"]` and calls `setup(ctx)` (D-OC2-SETUP-1). On 2.x, `ctx_*` tools register through `ctx.tool.transform`, and the hooks through `ctx.tool.hook` (execute.before, execute.after), `ctx.session.hook` (prompt, context, compaction) and `ctx.event.subscribe` (session.step.ended).

OpenCode loads the plugin from the npm package `main`. `2.0.0-next.5` has no `main`, so OpenCode refuses it; the next npm release has it (D-NI-OPENCODE-1). The MCP entry may still need the fallback below.

`npm i -g context-mode` also gives the `context-mode` command for doctor.

Setup is the fallback and the repair for what the native step cannot do:

```sh
context-mode setup --agents opencode
```

With no terminal (a script or CI), add `--yes`: `context-mode setup --yes --agents opencode`. Without it, setup stops with exit 2.

To do the setup step by hand, run `context-mode setup --print opencode` and follow what it prints.

## What setup changes

- Adds `mcp.context-mode` (`type: local`, `enabled: true`) to `~/.config/opencode/opencode.json`. Other keys stay.
- Adds the package directory to the `plugin` list (OpenCode 2 refuses a file path, D-OC2-ENTRY-1) in the same file. It runs the hooks as the plugin's own event handlers inside OpenCode (execute.before, execute.after, prompt, context, compaction).
- Writes the skills `/ctx-doctor`, `/ctx-stats` and `/ctx-upgrade` to `~/.config/opencode/skills/<name>/SKILL.md`.
- Effect: a large shell or read call is denied, and the reason names `ctx_execute` (deny + redirect).
- Backs up each file first. A failed step is rolled back byte for byte.
- Never edits `CLAUDE.md`, `AGENTS.md` or other instruction files.

## Verify

```sh
context-mode doctor --agents opencode
opencode mcp list --pure          # OpenCode 1.19
opencode mcp list --standalone    # OpenCode 2
```

`context-mode` must show as connected. Then run `/ctx-doctor` in OpenCode.

## Remove

```sh
opencode plugin remove context-mode
```

Then put back what setup changed (OpenCode 1.19 has no `plugin remove`, so use this line there too):

```sh
context-mode setup --remove --agents opencode
```

It puts each touched file back. To remove the package too, see [Uninstall](./README.md#uninstall).

## Known limits

- Setup adds the hooks plugin to the `plugin` list in `~/.config/opencode/opencode.json`. On its first start after that, OpenCode installs `@opencode-ai/plugin` into `~/.config/opencode` (30-60 s on OpenCode 1.19.4, needs the network). Setup checks the server with `opencode mcp list --pure`, so it does not wait on that install (D-HF-OPENCODE-LIST-1).

- OpenCode loads every entry of the `plugin` list and skips an entry whose file is missing, with no error. After `opencode plugin add context-mode` (OpenCode 2, key `plugins`) or `opencode plugin context-mode --global` (1.19, key `plugin`) the config holds `context-mode`; setup then adds no path entry and removes an own path entry (a second one loads the plugin twice). A path entry of ours whose file is gone is replaced. `context-mode doctor --agents opencode` FAILs `hook-registered` for both cases and names `context-mode setup` (D-HF-OPENCODE-GATE-1). On OpenCode 2 with no entry the fix line is `opencode plugin add context-mode` (D-OC2-NATIVE-CMD-1).

## Report a problem

Run `context-mode doctor --agents opencode`. A failed check prints a `gh issue create` command and a report file under `~/.context-mode/reports/`. Open the [v2 bug form](https://github.com/mksglu/context-mode/issues/new?template=bug.yml) and paste the report.

## Verified

Tested on macOS (arm64), Node 26, a clean temporary HOME, the npm-packed build of commit 5c41eb61.

| Command | OpenCode version | Date | Result |
|---|---|---|---|
| `context-mode setup --yes --agents opencode` | 1.19.4 | 2026-10-23 | Pass: `~/.config/opencode/opencode.json` written |
| `context-mode setup --yes --agents opencode` (second run) | 1.19.4 | 2026-10-23 | Pass |
| `context-mode doctor --agents opencode` | 1.19.4 | 2026-10-23 | Pass |
| `context-mode setup --remove --yes` | 1.19.4 | 2026-10-23 | Pass: files restored (`Restored N file(s).`) |

Read, not run: the 1.19.4 plugin resolver treats a `file://` value, an absolute path and a drive-letter path (`C:\\` or `C:/`) as a file entry and converts it with `pathToFileURL`, so setup writes the bare absolute path on Windows too (D-WIN-OCENTRY-1). On macOS a path with spaces showed as `file:///.../home%20dir/...` in `opencode debug config`.

Live fire (OpenCode 1.19.5, macOS arm64, temp HOME, fake local OpenAI-compatible provider, no key): the plugin installed with `opencode plugin context-mode --global` replaced the output of `cat big.log` (192 KB) with a 160-byte `ctx_execute` redirect. Test: `tests/e2e/opencode-fire.test.mjs`, skipped when `opencode` is not on PATH. Not run: Windows commands. Evidence: [CLI report](https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/CLI-REPORT.md), [engine tests](../../tests/0019-setup-engine.test.mjs), [DEVIATIONS](../architecture/modules/DEVIATIONS.md).

Live fire (OpenCode 2.2.5 `@opencode/cli`, macOS arm64, temp HOME, fake local provider, no key): the built package directory in the `plugin` list loaded with no warning, the model request listed `ctx_execute`, `ctx_search` and `ctx_stats`, and `cat big.log` was replaced with the `ctx_execute` redirect. Before the fix the 2.2.5 loader logged `failed to load plugin ... app.tool is not a function`. Test: `tests/0020-fire-plugin-ext.test.mjs` (`CM_OPENCODE2_DIR`; CI installs 1.19.5 and 2.2.5 on all 3 OS). The doctor reads the host version and runs `mcp list --standalone` on 2.x (D-OC2-DOCTOR-1). Not run: Windows commands.
