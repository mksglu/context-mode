# Install context-mode v2 on Claude Code

## Install

```sh
claude plugin marketplace add mksglu/context-mode
claude plugin install context-mode@context-mode
```

Update:

```sh
claude plugin update context-mode@context-mode
```

Check: `context-mode doctor`

Restart Claude Code after the install and after each update.

`npm i -g context-mode` also gives the `context-mode` command for doctor.

Setup is the fallback and the repair for what the native step cannot do:

```sh
context-mode setup --agents claude-code
```

With no terminal (a script or CI), add `--yes`: `context-mode setup --yes --agents claude-code`. Without it, setup stops with exit 2.

To do the setup step by hand, run `context-mode setup --print claude-code` and follow what it prints.

## What setup changes

- Runs `claude plugin marketplace add` on the installed package folder, then `claude plugin install context-mode@context-mode`.
- The plugin brings the MCP server, the hooks (`hooks/claude-code.json`: SessionStart, UserPromptSubmit, PreToolUse, PostToolUse) and the skills `/ctx-doctor`, `/ctx-stats` and `/ctx-upgrade`.
- Removes old context-mode hook commands from `~/.claude/settings.json`.
- Effect: the call runs, then a large result is replaced by a short selection that names `ctx_search` (replace).
- Backs up each file first. A failed step is rolled back byte for byte.
- Never edits `CLAUDE.md`, `AGENTS.md` or other instruction files.

## Verify

```sh
context-mode doctor --agents claude-code
claude plugin list
```

`context-mode@context-mode` must be listed and enabled. Then run `/ctx-doctor` in Claude Code.

## Remove

```sh
claude plugin marketplace remove context-mode
```

`claude plugin marketplace remove` removes the marketplace and its plugins. If you also ran setup, undo it first:

```sh
context-mode setup --remove --agents claude-code
```

It puts each touched file back. To remove the package too, see [Uninstall](./README.md#uninstall).

## Known limits

- The setup route adds the package folder from npm as a marketplace. The native route adds `mksglu/context-mode` from GitHub; use one of the two, not both.
- Verified live on Claude Code 2.1.274 without a login: `claude -p` against a local fake Anthropic endpoint ran our hook and the model saw the `ctx_search(` redirect for a 200 KB file (`tests/e2e/claude-code-fire.test.mjs`). A logged-in session was not run.
- Hooks do not run when the plugin is disabled (`claude plugin enable context-mode@context-mode`; setup does this for you) or when `disableAllHooks` is `true` in a Claude Code settings file. Doctor fails with the fix for both; it never edits your settings.
- `claude mcp add` by hand adds the MCP server only, with no hooks. Use `context-mode setup --print claude-code` instead.
- Skill and rule files under `~/.claude` (or `$CLAUDE_CONFIG_DIR`), such as `skills/<skill>/references/*.md`, rule files and `CLAUDE.md`, reach the model whole at any size (#1326).
- A tool output over 4,096 bytes comes back as a short search pointer. To get larger outputs whole, set `CTX_REPLACE_TRIGGER_BYTES` (a positive integer of bytes, for example `8192`) in the environment Claude Code starts from. A higher value saves less context: 8192 saves about 23% of tool bytes against 42% at 4096 on our bench.

## Report a problem

Run `context-mode doctor --agents claude-code`. A failed check prints a `gh issue create` command and a report file under `~/.context-mode/reports/`. Open the [v2 bug form](https://github.com/mksglu/context-mode/issues/new?template=bug.yml) and paste the report.

To keep the data of each Claude Code profile apart, set `CONTEXT_MODE_DATA_DIR` to its own folder, for example in the `env` block of that profile's `settings.json`. Unset, the data stays in `~/.context-mode`.

## Verified

Tested on macOS (arm64), Node 26, a clean temporary HOME, the npm-packed build of commit 5c41eb61.

| Command | Claude Code version | Date | Result |
|---|---|---|---|
| `context-mode setup --yes --agents claude-code` | 2.1.309 | 2026-10-23 | Pass: `~/.claude/settings.json` (`extraKnownMarketplaces`, `enabledPlugins`) and `~/.claude.json` written |
| `context-mode setup --yes --agents claude-code` (second run) | 2.1.309 | 2026-10-23 | Pass |
| `context-mode doctor --agents claude-code` | 2.1.309 | 2026-10-23 | Pass |
| `context-mode setup --remove --yes` | 2.1.309 | 2026-10-23 | Pass: files restored (`Restored N file(s).`) |

Not run: a live, logged-in Claude Code session that fires the hooks. Windows commands. Evidence: [CLI report](https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/CLI-REPORT.md), [engine tests](../../tests/0019-setup-engine.test.mjs), [DEVIATIONS](../architecture/modules/DEVIATIONS.md).
