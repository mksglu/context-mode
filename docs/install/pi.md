# Install context-mode v2 on Pi

## Install

```sh
pi install npm:context-mode@next
```

Update:

```sh
pi update --extensions
```

Check: `context-mode doctor`

Pi gets the hooks and the skills from the package. Restart Pi after the install.

`next` is the v2 prerelease tag on npm (`npm i -g context-mode@next` also gives the `context-mode` command for doctor). `latest` stays on the old release.

Setup is the fallback and the repair for what the native step cannot do:

```sh
context-mode setup --agents pi
```

With no terminal (a script or CI), add `--yes`: `context-mode setup --yes --agents pi`. Without it, setup stops with exit 2.

To do the setup step by hand, run `context-mode setup --print pi` and follow what it prints.

## What setup changes

- Runs `pi install` on the installed package folder. It writes `~/.pi/agent/settings.json`.
- Pi gets the extension (`pi/index.js`), which runs the hooks in process (session_start, input, tool_call, tool_result), and the shipped skills `/ctx-doctor`, `/ctx-stats` and `/ctx-upgrade`. Pi needs no MCP entry.
- Effect: the call runs, then a large result is replaced by a short selection that names `ctx_search` (replace). tool_result sets new content and details.
- Backs up each file first. A failed step is rolled back byte for byte.
- Never edits `CLAUDE.md`, `AGENTS.md` or other instruction files.

## Verify

```sh
context-mode doctor --agents pi
pi list
```

The package must be listed, and its `packages[]` entry in `settings.json` must not filter out `pi/index.js` (an `extensions` list such as `[]` or `["!pi/index.js"]`). Pi then lists the package but loads no hook; doctor reports the file and the filter as a FAIL. The same filter in `.pi/settings.json` counts once Pi trusts the project. In a run with no login, Pi loads the extension and its hooks print a `hooks: no project: NO_PROJECT` line before the "No API key" error. That line shows the extension loaded.

## Remove

```sh
context-mode setup --remove --agents pi
```

It puts each touched file back. To remove the package too, see [Uninstall](./README.md#uninstall).

## Known limits

- Pi has no `/ctx-doctor` or `/ctx-upgrade` command (D-FU-RM-DOCS-1). Use `context-mode doctor` in a shell.
- The hooks were fired live with Pi 1.4.0 against a fake local model (`tests/v2/e2e/pi-fire.test.mjs`): `cat` of a 192 KB log reached the model as a short `ctx_execute` redirect. A real logged-in Pi session was not run. The git-route runs below used commit 05e97724; setup no longer uses that route.

## Report a problem

Run `context-mode doctor --agents pi`. A failed check prints a `gh issue create` command and a report file under `~/.context-mode/reports/`. Open the [v2 bug form](https://github.com/mksglu/context-mode/issues/new?template=bug.yml) and paste the report.

## Verified

Tested on macOS (arm64), Node 26, a clean temporary HOME, the npm-packed build of commit 5c41eb61.

| Command | Pi version | Date | Result |
|---|---|---|---|
| `context-mode setup --yes --agents pi` | 1.4.0 | 2026-10-23 | Pass: `~/.pi/agent/settings.json` (`packages`) written |
| `context-mode setup --yes --agents pi` (second run) | 1.4.0 | 2026-10-23 | Pass |
| `context-mode doctor --agents pi` | 1.4.0 | 2026-10-23 | Pass |
| `context-mode setup --remove --yes` | 1.4.0 | 2026-10-23 | Pass: files restored (`Restored N file(s).`) |

Not run: a logged-in Pi session (the live check uses a fake local model). Windows commands. Evidence: [CLI report](../v2/CLI-REPORT.md), [engine tests](../../tests/v2/setup/engine.test.mjs), [DEVIATIONS](../v2/impl/DEVIATIONS.md).

Earlier git-route run, commit 05e97724, Pi 1.4.0, 2026-10-22: `pi install git:github.com/mksglu/context-mode@release` Pass; `pi list` Pass; `pi update --extensions` Pass; `pi remove` Pass; `/ctx-doctor` in Pi Fail (the command does not exist, D-FU-RM-DOCS-1).
