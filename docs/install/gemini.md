# Install context-mode v2 on Gemini CLI

## Install

```sh
gemini extensions install https://github.com/mksglu/context-mode --ref release
```

Update:

```sh
gemini extensions update context-mode
```

Check: `context-mode doctor`

Until v2 is on `main`, `main` holds the old build (1.0.169), so the command above names the `release` branch (`--ref release`).

After v2 is on main: `gemini extensions install https://github.com/mksglu/context-mode`

Gemini CLI asks you to confirm the install. Restart Gemini CLI after the install and after each update.

`next` is the v2 prerelease tag on npm (`npm i -g context-mode@next` also gives the `context-mode` command for doctor). `latest` stays on the old release.

Setup is the fallback and the repair for what the native step cannot do:

```sh
context-mode setup --agents gemini
```

With no terminal (a script or CI), add `--yes`: `context-mode setup --yes --agents gemini`. Without it, setup stops with exit 2.

To do the setup step by hand, run `context-mode setup --print gemini` and follow what it prints.

### Already installed from GitHub?

You installed without `--ref release` and `gemini extensions list` shows 1.0.169. `gemini extensions uninstall` uninstalls one or more extensions. Then install again with the ref:

```sh
gemini extensions uninstall context-mode
gemini extensions install https://github.com/mksglu/context-mode --ref release
```

`gemini extensions list` must show `2.0.0-next.8` or later.

## What setup changes

- Runs `gemini extensions link` on the installed package folder, with `--consent`. It uses `link`, because `install` on a folder hangs on a trust prompt (D-INST-1).
- The extension brings the MCP server, the hooks (`hooks/hooks.json`: BeforeAgent, BeforeTool, AfterTool, PreCompress) and the skills `/ctx-doctor`, `/ctx-stats` and `/ctx-upgrade`.
- Removes old context-mode hook commands from `~/.gemini/settings.json`.
- Effect: the call runs, then a large result is replaced by a short selection that names `ctx_search` (replace). Gemini AfterTool `decision: deny` carries the selection (D-HA-GEMINI-REPLACE-1).
- A shell read of one large file (`cat big.log`) does not run: BeforeTool `decision: deny` names `mcp_context-mode_ctx_execute` instead (D-HA-GEMINI-DUMP-1). The replace hint adds the prompt words the output holds, so its `ctx_search` call returns the line you asked for (D-HA-GEMINI-HINT-1).
- Backs up each file first. A failed step is rolled back byte for byte.
- Never edits `CLAUDE.md`, `AGENTS.md` or other instruction files.

## Verify

```sh
context-mode doctor --agents gemini
GEMINI_CLI_TRUST_WORKSPACE=true gemini mcp list
```

`gemini mcp list` does not ask about trust, so in an untrusted folder it shows `Disabled`. The variable above checks the server without that step. `context-mode` must show Connected. Then run `/ctx-doctor` in Gemini CLI.

## Remove

```sh
context-mode setup --remove --agents gemini
```

It puts each touched file back. To remove the package too, see [Uninstall](./README.md#uninstall).

If you used the git route, run `gemini extensions uninstall context-mode`.

## Known limits

- `gemini extensions update context-mode` updates a git-route install. A linked install updates when you run `npm i -g context-mode@next` again.
- `hooks/hooks.json` has no SessionStart (D-FU-GCH-1). The resume hint comes on the first BeforeAgent of a session (D-FU-GCH-2).
- No live, logged-in Gemini session loaded the hooks in any run.

## Report a problem

Run `context-mode doctor --agents gemini`. A failed check prints a `gh issue create` command and a report file under `~/.context-mode/reports/`. Open the [v2 bug form](https://github.com/mksglu/context-mode/issues/new?template=bug.yml) and paste the report.

## Verified

Tested on macOS (arm64), Node 26, a clean temporary HOME, the npm-packed build of commit 5c41eb61.

| Command | Gemini CLI version | Date | Result |
|---|---|---|---|
| `context-mode setup --yes --agents gemini` | 0.65.0 | 2026-10-23 | Pass: `~/.gemini/extensions/context-mode/` (link), `extension-enablement.json` written |
| `context-mode setup --yes --agents gemini` (second run) | 0.65.0 | 2026-10-23 | Pass |
| `context-mode doctor --agents gemini` | 0.65.0 | 2026-10-23 | Pass |
| `context-mode setup --remove --yes` | 0.65.0 | 2026-10-23 | Pass: files restored (`Restored N file(s).`) |

Not run: a live, logged-in Gemini CLI session that fires the hooks. Windows commands. Evidence: [CLI report](../v2/CLI-REPORT.md), [engine tests](../../tests/v2/setup/engine.test.mjs), [DEVIATIONS](../v2/impl/DEVIATIONS.md).

Earlier git-route run, commit 05e97724, Gemini CLI 0.65.0, 2026-10-22: `gemini extensions install https://github.com/mksglu/context-mode --ref release --consent` Pass; `GEMINI_CLI_TRUST_WORKSPACE=true gemini mcp list` Pass: Connected; `tools/list` over stdio Pass: 9 tools. `gemini extensions update` and `uninstall` were not run.
