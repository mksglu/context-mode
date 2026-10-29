# Install context-mode v2 on VS Code (Copilot)

## Install

```sh
npm i -g context-mode@next
context-mode setup --agents vscode
```

Update:

```sh
context-mode upgrade
```

Check: `context-mode doctor`

VS Code (Copilot) has no install command of its own that takes the package, so setup is the install path here. `next` is the v2 prerelease tag on npm (`npm i -g context-mode@next` also gives the `context-mode` command for doctor). `latest` stays on the old release.

With no terminal (a script or CI), add `--yes`: `context-mode setup --yes --agents vscode`. Without it, setup stops with exit 2.

Restart VS Code (Copilot) after setup.

To do the setup step by hand, run `context-mode setup --print vscode` and follow what it prints.

## What setup changes

- Adds the `context-mode` entry (key `servers`) to the VS Code user-profile `mcp.json`. Other servers stay. Windows: `%APPDATA%\Code\User\mcp.json`. macOS: `~/Library/Application Support/Code/User/mcp.json`. Linux: `$XDG_CONFIG_HOME/Code/User/mcp.json`, else `~/.config/Code/User/mcp.json`.
- Writes the hooks to `~/.copilot/hooks/context-mode-vscode.json` (SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, PreCompact).
- Writes the skills `/ctx-doctor`, `/ctx-stats` and `/ctx-upgrade` to `~/.agents/skills/<name>/SKILL.md` (Copilot CLI keeps its own set in `~/.copilot/skills`, with its own tool name).
- Effect: a large shell or read call is denied, and the reason names `ctx_execute` (deny + redirect).
- Backs up each file first. A failed step is rolled back byte for byte.
- Never edits `CLAUDE.md`, `AGENTS.md` or other instruction files.

## Verify

```sh
context-mode doctor --agents vscode
```

Open VS Code, open the MCP server list, and run `/ctx-doctor` in Copilot agent mode.

## Remove

```sh
context-mode setup --remove --agents vscode
```

It puts each touched file back. To remove the package too, see [Uninstall](./README.md#uninstall).

## Known limits

- Setup writes one hook file: `~/.copilot/hooks/context-mode-vscode.json`, shape `{ version: 1, hooks: { <Event>: [{ type: "command", command, timeout }] } }` with `version: 1`, `type: "command"` and `timeout` 5 (seconds), for SessionStart, UserPromptSubmit, PreToolUse, PostToolUse and PreCompact. The command is `"<node>" "<package>/hook.mjs" --agent vscode` (absolute paths). Other entries in that file stay. Setup does not write project hooks under `.github/hooks/`.
- VS Code loads that hook file only while `chat.useHooks` is not `false`, `chat.hookFilesLocations` (if you set it) lists `"~/.copilot/hooks": true`, the workspace is trusted, and an administrator policy (`allowManagedHooksOnly`, `strictPluginOnlyCustomization` in `managed-settings.json`) does not block user hook files. `context-mode doctor --agents vscode` fails with the file and the fix for the settings and policy cases; it cannot read workspace trust.
- VS Code itself was not run. The path follows the VS Code source (`userDataPath.ts`, default profile `mcp.json`); the docs page does not state it. Code - Insiders, VSCodium and named profiles are not written.
- The shipped `hooks/vscode.json` is a template: the writer fills the path; do not copy hooks/vscode.json by hand.

## Report a problem

Run `context-mode doctor --agents vscode`. A failed check prints a `gh issue create` command and a report file under `~/.context-mode/reports/`. Open the [v2 bug form](https://github.com/mksglu/context-mode/issues/new?template=bug.yml) and paste the report.

## Verified

Tested on macOS (arm64), Node 26, a clean temporary HOME, the npm-packed build of commit 5c41eb61.

| Command | VS Code (Copilot) version | Date | Result |
|---|---|---|---|
| `context-mode setup --yes --agents vscode` | not installed | 2026-10-23 | Pass: `~/.vscode/mcp.json` written (old path; later versions write the user-profile `mcp.json`) |
| `context-mode setup --yes --agents vscode` (second run) | not installed | 2026-10-23 | Pass |
| `context-mode doctor --agents vscode` | not installed | 2026-10-23 | Pass |
| `context-mode setup --remove --yes` | not installed | 2026-10-23 | Pass: files restored (`Restored N file(s).`) |

VS Code (Copilot) was not installed, so a Pass here means the config entry and the MCP handshake checked out, not that VS Code (Copilot) loaded the server. See [CLI report](../v2/CLI-REPORT.md) and the [engine tests](../../tests/v2/setup/engine.test.mjs), [DEVIATIONS](../v2/impl/DEVIATIONS.md). Windows commands are not run.
