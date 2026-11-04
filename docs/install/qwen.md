# Install context-mode v2 on Qwen Code

## Install

```sh
qwen extensions install https://github.com/mksglu/context-mode:context-mode
```

Update:

```sh
qwen extensions update context-mode
```

Check: `context-mode doctor`

Qwen Code asks you to confirm the install, and `qwen extensions update` asks the same question (`Do you want to continue? [Y/n]`). Answer `Y`. Restart Qwen Code after the install and after each update.

`npm i -g context-mode` also gives the `context-mode` command for doctor.

Setup is the fallback and the repair for what the native step cannot do:

```sh
context-mode setup --agents qwen
```

With no terminal (a script or CI), add `--yes`: `context-mode setup --yes --agents qwen`. Without it, setup stops with exit 2.

To do the setup step by hand, run `context-mode setup --print qwen` and follow what it prints.

## What setup changes

- Runs `qwen extensions link` on the installed package folder and answers its prompt with `y`.
- The extension brings the MCP server and the hooks (`hooks/qwen.json`: SessionStart, UserPromptSubmit, PreToolUse, PostToolUse).
- The extension brings the skills `/ctx-doctor`, `/ctx-stats` and `/ctx-upgrade` (`skills/<name>/SKILL.md`). Qwen Code loads them from the fixed path `<extension>/skills`, shared with Gemini CLI, so each skill names both tools: `mcp_context-mode_ctx_*` or `mcp__context-mode__ctx_*`. Setup writes no skill file to `~/.qwen/skills`.
- Removes old context-mode hook commands from `~/.qwen/settings.json`.
- Effect: a large shell or read call is denied, and the reason names `ctx_execute` (deny + redirect).
- Backs up each file first. A failed step is rolled back byte for byte.
- Never edits `CLAUDE.md`, `AGENTS.md` or other instruction files.

## Verify

```sh
context-mode doctor --agents qwen
qwen extensions list
```

`context-mode` must be listed. `qwen mcp list` must show it Connected. Then run `/ctx-doctor` in Qwen Code, and `/hooks` to see the four context-mode hooks.

## Remove

```sh
qwen extensions uninstall context-mode
```

`qwen extensions uninstall` removes the extension. If you also ran setup, undo it first:

```sh
context-mode setup --remove --agents qwen
```

It puts each touched file back. To remove the package too, see [Uninstall](./README.md#uninstall).

## Known limits

- `qwen extensions update context-mode` updates a git-route install. A linked install updates when you run `npm i -g context-mode` again.
- Qwen runs no hook while `"disableAllHooks": true` is in `~/.qwen/settings.json`, `<project>/.qwen/settings.json` or the system settings file, or while the extension is disabled for the project (`Enabled (Workspace): false` in `qwen extensions list`). Doctor fails and names the file and the fix. Setup never edits your settings file.
- No logged-in Qwen session ran `/ctx-doctor`, `/hooks` or the other three hooks.

## Report a problem

Run `context-mode doctor --agents qwen`. A failed check prints a `gh issue create` command and a report file under `~/.context-mode/reports/`. Open the [v2 bug form](https://github.com/mksglu/context-mode/issues/new?template=bug.yml) and paste the report.

## Verified

Tested on macOS (arm64), Node 26, a clean temporary HOME, the npm-packed build of commit 5c41eb61.

| Command | Qwen Code version | Date | Result |
|---|---|---|---|
| `context-mode setup --yes --agents qwen` | 0.26.0 | 2026-10-23 | Pass: `~/.qwen/extensions/context-mode/` (link), `extension-store/state.json` written |
| `context-mode setup --yes --agents qwen` (second run) | 0.26.0 | 2026-10-23 | Pass |
| `context-mode doctor --agents qwen` | 0.26.0 | 2026-10-23 | Pass |
| `context-mode setup --remove --yes` | 0.26.0 | 2026-10-23 | Pass: files restored (`Restored N file(s).`) |

Live: Qwen Code 0.26.4 (`-o stream-json`, fake local OpenAI-compatible provider, no login) calls `run_shell_command` with `cat` of a 192 KB file; the model receives the `ctx_execute` redirect (210 bytes), and 4814 bytes of truncated output when `disableAllHooks` is true ([qwen-fire test](../../tests/e2e/qwen-fire.test.mjs)).

Not run: a logged-in Qwen Code session. Windows commands. Evidence: [CLI report](https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/CLI-REPORT.md), [engine tests](../../tests/0019-setup-engine.test.mjs), [DEVIATIONS](../architecture/modules/DEVIATIONS.md).
