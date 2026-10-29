# Install context-mode v2 on Kiro

## Install

```sh
npm i -g context-mode@next
context-mode setup --agents kiro
```

Update:

```sh
context-mode upgrade
```

Check: `context-mode doctor`

Kiro has no install command of its own that takes the package, so setup is the install path here. `next` is the v2 prerelease tag on npm (`npm i -g context-mode@next` also gives the `context-mode` command for doctor). `latest` stays on the old release.

With no terminal (a script or CI), add `--yes`: `context-mode setup --yes --agents kiro`. Without it, setup stops with exit 2.

Restart Kiro after setup.

To do the setup step by hand, run `context-mode setup --print kiro` and follow what it prints.

## What setup changes

- Adds the `context-mode` entry to `~/.kiro/settings/mcp.json`. Other servers stay.
- Writes the hooks to `~/.kiro/hooks/context-mode.json` (SessionStart, UserPromptSubmit, PreToolUse, PostToolUse). PreToolUse and PostToolUse each get two entries: matcher `@mcp` (context-mode tools) and matcher `shell` (the `execute_bash` tool).
- Writes the skills `/ctx-doctor`, `/ctx-stats` and `/ctx-upgrade` to `~/.kiro/skills/<name>/SKILL.md`.
- Effect: a large shell or read call is denied, and the reason names `ctx_execute` (deny + redirect). The hook exits 2 and writes the reason to stderr; Kiro blocks the call and gives that text to the agent. Kiro cannot replace a tool's output, so this is the saving effect.
- Backs up each file first. A failed step is rolled back byte for byte.
- Never edits `CLAUDE.md`, `AGENTS.md` or other instruction files.

## Verify

```sh
context-mode doctor --agents kiro
```

Run `/ctx-doctor` in Kiro. Run `kiro-cli doctor -a` if the tools do not show.

## Remove

```sh
context-mode setup --remove --agents kiro
```

It puts each touched file back. To remove the package too, see [Uninstall](./README.md#uninstall).

## Known limits

- Kiro CLI 2.35.2 (V3 engine, macOS tarball from cli.kiro.dev) loaded all 6 hook entries setup wrote (`hooks.reload.loaded {"read":6,"registered":6}` in `~/.kiro/logs/<run>/kiro.log`). No run showed Kiro fire one: the first model call needs a real `kiro-cli login`, and a fake key stops at "could not load the available models".
- Kiro counts a hook with `"enabled": false` as loaded but does not run it. If you turned one of ours off, `context-mode doctor` fails hook-registered and names it; `context-mode setup` turns it back on. Your own hooks in the same file stay as they are.
- The hook file is read by the V3 engine. The Classic engine does not read `~/.kiro/hooks/`.

## Report a problem

Run `context-mode doctor --agents kiro`. A failed check prints a `gh issue create` command and a report file under `~/.context-mode/reports/`. Open the [v2 bug form](https://github.com/mksglu/context-mode/issues/new?template=bug.yml) and paste the report.

## Verified

Tested on macOS (arm64), Node 26, a clean temporary HOME, the npm-packed build of commit 5c41eb61.

| Command | Kiro version | Date | Result |
|---|---|---|---|
| `context-mode setup --yes --agents kiro` | not installed | 2026-10-23 | Pass: `~/.kiro/settings/mcp.json` written |
| `context-mode setup --yes --agents kiro` (second run) | not installed | 2026-10-23 | Pass |
| `context-mode doctor --agents kiro` | not installed | 2026-10-23 | Pass |
| `context-mode setup --remove --yes` | not installed | 2026-10-23 | Pass: files restored (`Restored N file(s).`) |

Kiro was not installed, so a Pass here means the config entry and the MCP handshake checked out, not that Kiro loaded the server. See [CLI report](../v2/CLI-REPORT.md) and the [engine tests](../../tests/v2/setup/engine.test.mjs), [DEVIATIONS](../v2/impl/DEVIATIONS.md). Windows commands are not run.
