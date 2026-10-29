# Install context-mode v2 on Codex

## Install

```sh
codex plugin marketplace add mksglu/context-mode@release
codex plugin add context-mode@context-mode
```

Update:

```sh
codex plugin marketplace upgrade context-mode
```

Check: `context-mode doctor`

Until v2 is on `main`, `main` holds the old build (1.0.169), so the commands above name the `release` branch (`@release`).

After v2 is on main: `codex plugin marketplace add mksglu/context-mode`, then `codex plugin add context-mode@context-mode`

The plugin brings the MCP server, the hooks and the skills. Codex runs a hook only when it is trusted. Checked on Codex 0.156.1 in a clean HOME: after `codex plugin add`, `hooks/list` shows all 6 plugin hooks `untrusted`, and `context-mode setup` writes no trust for them (it writes nothing under `~/.codex` when the plugin is enabled). Codex 0.156.1 help names the switch `--dangerously-bypass-hook-trust` ("Run enabled hooks without requiring persisted hook trust"). So after the plugin install, trust the hooks in the Codex TUI, or use the route below. Restart Codex after the install.

Route where the hooks run with no extra step (npm + setup, no plugin): `context-mode setup --agents codex` writes `~/.codex/hooks.json` and one `[hooks.state]` trust table per hook in `config.toml` (D-TRUST-KEYDIR-2). The same probe shows `trusted` for all 4 hooks.

`next` is the v2 prerelease tag on npm (`npm i -g context-mode@next` also gives the `context-mode` command for doctor). `latest` stays on the old release.

Setup is the fallback and the repair for what the native step cannot do:

```sh
context-mode setup --agents codex
```

With no terminal (a script or CI), add `--yes`: `context-mode setup --yes --agents codex`. Without it, setup stops with exit 2.

To do the setup step by hand, run `context-mode setup --print codex` and follow what it prints.

### Already installed from GitHub?

You added `mksglu/context-mode` without `@release` and `codex plugin list` shows 1.0.169. `codex plugin remove` uninstalls a plugin and removes its local cache; `codex plugin marketplace remove` removes a configured marketplace source by name. Then add it again with `@release`:

```sh
codex plugin remove context-mode@context-mode
codex plugin marketplace remove context-mode
codex plugin marketplace add mksglu/context-mode@release
codex plugin add context-mode@context-mode
```

`codex plugin list` must show `2.0.0-next.8` or later.

## What setup changes

- Adds a `[mcp_servers.context-mode]` table to `~/.codex/config.toml` (or `$CODEX_HOME/config.toml`).
- Writes the hooks to `~/.codex/hooks.json` (SessionStart, UserPromptSubmit, PreToolUse, PostToolUse) and one `[hooks.state]` trust table per hook in `config.toml`, so Codex runs them (D-HA-CODEX-TRUST-1).
- Writes the skills `/ctx-doctor`, `/ctx-stats` and `/ctx-upgrade` to `~/.codex/skills/<name>/SKILL.md`.
- Effect: a large shell or read call is denied, and the reason names `ctx_execute` (deny + redirect).
- Backs up each file first. A failed step is rolled back byte for byte.
- Never edits `CLAUDE.md`, `AGENTS.md` or other instruction files.

## Verify

```sh
context-mode doctor --agents codex
codex mcp list
```

`context-mode` must show as enabled. The Auth column may say `Unsupported`: that is normal, because the server needs no login. Then run `/ctx-doctor` in Codex.

## Remove

```sh
context-mode setup --remove --agents codex
```

It puts each touched file back. To remove the package too, see [Uninstall](./README.md#uninstall).

## Known limits

- Open product bug: after `codex plugin add` the plugin hooks stay untrusted, and doctor `hook-registered` still passes. Do not read that PASS as hooks firing. Fix path: setup writes trust for the plugin hooks, or doctor fails on `untrusted`.
- After `codex plugin add`, `context-mode doctor` checks the plugin (`codex plugin list` shows it enabled) and setup writes nothing under `~/.codex`, so the hooks never run twice (D-NI-CODEX-DOCTOR-1).
- Codex 0.156.1 reads a local marketplace folder only when it is a git repo.
- The `release` branch at `2.0.0-next.5` had no `.codex-plugin` folder (it was built before ADR-0023). From `2.0.0-next.8` the folder is there, so the install above carries the MCP server and the hooks.
- The shipped `hooks/codex.json` is a template: the writer fills the path; do not copy hooks/codex.json by hand.

## Report a problem

Run `context-mode doctor --agents codex`. A failed check prints a `gh issue create` command and a report file under `~/.context-mode/reports/`. Open the [v2 bug form](https://github.com/mksglu/context-mode/issues/new?template=bug.yml) and paste the report.

## Verified

Tested on macOS (arm64), Node 26, a clean temporary HOME, the npm-packed build of commit 5c41eb61.

| Command | Codex version | Date | Result |
|---|---|---|---|
| `codex plugin marketplace add <npm-packed dir>` + `codex plugin add context-mode@context-mode` | 0.156.1 | 2026-10-25 | Pass: `codex plugin list` shows installed, enabled; `codex mcp list` shows context-mode enabled |
| `context-mode doctor --agents codex` after the plugin install | 0.156.1 | 2026-10-25 | Pass: list, mcp, hook, hook-registered, hook-runs, skills (hook-seen WARN) |
| `context-mode setup --yes --agents codex` | 0.164.0 | 2026-10-23 | Pass: `~/.codex/config.toml` written |
| `context-mode setup --yes --agents codex` (second run) | 0.164.0 | 2026-10-23 | Pass |
| `context-mode doctor --agents codex` | 0.164.0 | 2026-10-23 | Pass |
| `context-mode setup --remove --yes` | 0.164.0 | 2026-10-23 | Pass: files restored (`Restored N file(s).`) |

Not run: a live, logged-in Codex session that fires the hooks. Windows commands. Evidence: [CLI report](../v2/CLI-REPORT.md), [engine tests](../../tests/v2/setup/engine.test.mjs), [DEVIATIONS](../v2/impl/DEVIATIONS.md).
