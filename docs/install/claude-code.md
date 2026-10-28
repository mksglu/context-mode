# Install context-mode v2 on Claude Code

## Install

```sh
claude plugin marketplace add mksglu/context-mode#release
claude plugin install context-mode@context-mode
```

Update:

```sh
claude plugin update context-mode@context-mode
```

Check: `context-mode doctor`

Until v2 is on `main`, `main` holds the old build (1.0.169), so the commands above name the `release` branch (`#release`).

After v2 is on main: `claude plugin marketplace add mksglu/context-mode`, then `claude plugin install context-mode@context-mode`

Restart Claude Code after the install and after each update.

`next` is the v2 prerelease tag on npm (`npm i -g context-mode@next` also gives the `context-mode` command for doctor). `latest` stays on the old release.

Setup is the fallback and the repair for what the native step cannot do:

```sh
context-mode setup --agents claude-code
```

With no terminal (a script or CI), add `--yes`: `context-mode setup --yes --agents claude-code`. Without it, setup stops with exit 2.

To do the setup step by hand, run `context-mode setup --print claude-code` and follow what it prints.

### Already installed from GitHub?

You added `mksglu/context-mode` without `#release` and `claude plugin list` shows 1.0.169. `claude plugin marketplace remove` removes a configured marketplace and its plugins. Then add the marketplace again with `#release`:

```sh
claude plugin marketplace remove context-mode
claude plugin marketplace add mksglu/context-mode#release
claude plugin install context-mode@context-mode
```

`claude plugin list` must show `2.0.0-next.8` or later.

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
context-mode setup --remove --agents claude-code
```

It puts each touched file back. To remove the package too, see [Uninstall](./README.md#uninstall).

## Known limits

- The setup route adds the package folder from npm as a marketplace. The native route adds `mksglu/context-mode` from GitHub; use one of the two, not both.
- No live, logged-in Claude Code session fired the hooks in any run.
- `claude mcp add` by hand adds the MCP server only, with no hooks. Use `context-mode setup --print claude-code` instead.

## Report a problem

Run `context-mode doctor --agents claude-code`. A failed check prints a `gh issue create` command and a report file under `~/.context-mode/reports/`. Open the [v2 bug form](https://github.com/mksglu/context-mode/issues/new?template=bug.yml) and paste the report.

## Verified

Tested on macOS (arm64), Node 26, a clean temporary HOME, the npm-packed build of commit 5c41eb61.

| Command | Claude Code version | Date | Result |
|---|---|---|---|
| `context-mode setup --yes --agents claude-code` | 2.1.309 | 2026-10-23 | Pass: `~/.claude/settings.json` (`extraKnownMarketplaces`, `enabledPlugins`) and `~/.claude.json` written |
| `context-mode setup --yes --agents claude-code` (second run) | 2.1.309 | 2026-10-23 | Pass |
| `context-mode doctor --agents claude-code` | 2.1.309 | 2026-10-23 | Pass |
| `context-mode setup --remove --yes` | 2.1.309 | 2026-10-23 | Pass: files restored (`Restored N file(s).`) |

Not run: a live, logged-in Claude Code session that fires the hooks. Windows commands. Evidence: [CLI report](../v2/CLI-REPORT.md), [engine tests](../../tests/v2/setup/engine.test.mjs), [DEVIATIONS](../v2/impl/DEVIATIONS.md).
