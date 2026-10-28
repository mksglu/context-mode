# Install context-mode v2

Use your agent's own install command. Each line below is the native command, then the native update command. After it, run the check: `context-mode doctor`.

`next` is the v2 prerelease tag on npm. `latest` stays on the old release until the owner moves it. The agents with no install command of their own use the npm route: `npm i -g context-mode@next`, then `context-mode setup`.

## Requirements

- Node 24.15.0 or later. v2 uses the built-in `node:sqlite`.
- On Windows: Git for Windows. The shell tools (`ctx_execute` with `shell`, `bash` or `sh`, and `ctx_batch`) run in Git Bash. Without it they return `NO_GIT_BASH`, and `context-mode doctor` check D11 (shell) fails.
- At least one supported agent. Run `context-mode setup --list` to see which ones work.

## Install

| Agent | Install | Update |
|---|---|---|
| Claude Code | `claude plugin marketplace add mksglu/context-mode#release`, then `claude plugin install context-mode@context-mode` | `claude plugin update context-mode@context-mode` |
| Codex | `codex plugin marketplace add mksglu/context-mode@release`, then `codex plugin add context-mode@context-mode` | `codex plugin marketplace upgrade context-mode` |
| Gemini CLI | `gemini extensions install https://github.com/mksglu/context-mode --ref release` | `gemini extensions update context-mode` |
| Qwen Code | `qwen extensions install https://github.com/mksglu/context-mode:context-mode --ref release` | `qwen extensions update context-mode` |
| Pi | `pi install npm:context-mode@next` | `pi update --extensions` |
| OpenCode | `opencode plugin context-mode@next --global` | `opencode plugin context-mode@next --global --force` |
| Copilot CLI, Kiro, VS Code, ZCode | `npm i -g context-mode@next`, then `context-mode setup --agents <id>` | `context-mode upgrade` |

Until v2 is on `main`, `main` holds the old build (1.0.169), so the four GitHub-source rows name the `release` branch with each agent's own syntax.

After v2 is on main: `claude plugin marketplace add mksglu/context-mode`, `codex plugin marketplace add mksglu/context-mode`, `gemini extensions install https://github.com/mksglu/context-mode`, `qwen extensions install https://github.com/mksglu/context-mode:context-mode`

Already installed from GitHub without the ref? Each agent page has the steps to switch: see "Already installed from GitHub?" in [Claude Code](claude-code.md#already-installed-from-github), [Codex](codex.md#already-installed-from-github), [Gemini CLI](gemini.md#already-installed-from-github) and [Qwen Code](qwen.md#already-installed-from-github).

Fallback for any agent, and the only route for Copilot CLI, Kiro, VS Code and ZCode:

```sh
npm i -g context-mode@next
context-mode setup
```

Check, on every agent:

```sh
context-mode doctor
```

Restart your agent after an install or an update. Then run `/ctx-doctor` in the agent.

The native step carries the MCP server, the hooks and the skills `/ctx-doctor`, `/ctx-stats` and `/ctx-upgrade` where the host lets it. `context-mode setup` is the fallback and the repair for the part it cannot do ([ADR-0023](../v2/adr/ADR-0023-native-install.md)). Doctor names the one fix on a FAIL.

With no terminal (a script or CI), add `--yes` to setup: `context-mode setup --yes`. Setup asks one question, and with no terminal it stops with exit 2 instead.

## What setup does (fallback and repair)

1. Finds each agent: its command on `PATH` or its config folder.
2. Shows the plan: for each agent, the exact command it will run or the exact file change.
3. Asks once, then applies. `--yes` skips the question.
4. Checks each agent: the config entry, old context-mode entries, an MCP handshake, one hook call.
5. Rolls back any agent that fails, and prints a `gh issue create` command with a report file.

Setup backs up every file it touches under `~/.context-mode/backups`. It writes only the files in the plan. It never edits `CLAUDE.md`, `AGENTS.md` or other instruction files.

Run it again at any time. A second run changes nothing (checked in [Verified](#verified)).

## Options

| Command | Use |
|---|---|
| `context-mode setup --list` | Print every supported agent and whether it is found. Changes nothing. |
| `context-mode setup --dry-run` | Show the plan. Changes nothing. |
| `context-mode setup --agents codex` | Set up only this agent. |
| `context-mode setup --print codex` | Print the manual step for one agent, with paths filled in. Changes nothing. |
| `context-mode setup --yes --agents codex,claude-code` | Do not ask; only these agents. |
| `context-mode setup --json` | JSON only on stdout, for scripts. |
| `context-mode doctor` | Check every agent. Changes nothing. |
| `context-mode upgrade` | Run `npm i -g context-mode@<tag>`, then `setup --repair`. |

Exit codes: 0 success, 1 a check or step failed, 2 usage error or an answer is needed with no TTY, 130 Ctrl-C.

## Agents

Each page gives one command, what setup changes, how to check it, how to remove it, known limits and what was checked. To do it by hand, run `context-mode setup --print <id>`: it prints the exact step, with your paths filled in.

| Agent | Page | What setup runs | Checked in a clean HOME |
|---|---|---|---|
| Claude Code | [claude-code.md](./claude-code.md) | `claude plugin marketplace add` + `plugin install` | yes, 2.1.309 |
| Codex | [codex.md](./codex.md) | writes `~/.codex/config.toml`, `~/.codex/hooks.json`, skills | yes, 0.164.0 |
| Copilot CLI | [copilot-cli.md](./copilot-cli.md) | `copilot mcp add`, writes hooks and skills | yes, 1.0.103 |
| Gemini CLI | [gemini.md](./gemini.md) | `gemini extensions link --consent` | yes, 0.65.0 |
| Kiro | [kiro.md](./kiro.md) | writes `~/.kiro/settings/mcp.json`, hooks and skills | config only: Kiro not installed |
| OpenCode | [opencode.md](./opencode.md) | writes `opencode.json` (MCP and plugin), skills | yes, 1.19.4 |
| Pi | [pi.md](./pi.md) | `pi install <package folder>` | yes, 1.4.0 |
| Qwen Code | [qwen.md](./qwen.md) | `qwen extensions link` | yes, 0.26.0 |
| VS Code (Copilot) | [vscode.md](./vscode.md) | writes the user-profile `mcp.json` (`Code/User`), hooks and skills | config only: VS Code not run |
| ZCode | [zcode.md](./zcode.md) | writes `~/.zcode/cli/config.json` (MCP and hooks), skills | config only: ZCode not installed |

"Checked in a clean HOME" means the command ran on macOS with a temporary HOME against the npm-packed build, the agent CLI was installed in a temporary prefix, and setup, a second setup, doctor and remove all passed. It does not mean a logged-in agent session fired the hooks: no run did that. No page is checked on Windows.

The git `release` branch goes away: npm is the only release channel ([ADR-0023](../v2/adr/ADR-0023-native-install.md)).


## Hooks, skills and saving

Every agent gets hooks and the skills `/ctx-doctor`, `/ctx-stats`, `/ctx-upgrade` ([ADR-0020](../v2/adr/0020-hooks-and-skills-on-every-agent.md)). Each agent has one hook channel and one saving effect. R = the call runs, then a large result is replaced. D = a large call is denied and the reason names `ctx_execute`.

"Live saving" is the bytes of one large tool result that reach the model: without context-mode -> with v2. No run used a logged-in model session: each run piped the host's documented payload into the installed hook or plugin. Full runs: [hooks-all RESULT](../v2/spikes/hooks-all/RESULT.md).

| Agent | Hook channel | Skills | Effect | Live saving (bytes off -> v2) | Date | Host version | Doc-verified |
|---|---|---|---|---|---|---|---|
| Claude Code | plugin `hooks/claude-code.json` | plugin `skills/` | R | pass: 196,149 -> 286 | 2026-10-26 | 2.1.309 | yes |
| Codex | `~/.codex/hooks.json` + trust tables in `config.toml` | `~/.codex/skills` | D | pass: 217,858 -> 392 | 2026-10-26 | 0.164.0 | partly: the docs page has no skills directory |
| Gemini CLI | extension `hooks/hooks.json` | extension `skills/` | R | pass: 168,875 -> 343 | 2026-10-26 | 0.65.0 | partly: AfterTool deny text names `ctx_search`, host name is `mcp_context-mode_ctx_search` |
| Qwen Code | extension `hooks/qwen.json` | extension `skills/` | D | pass: 212,544 -> 332 | 2026-10-26 | 0.26.1 | partly: no headless hook list |
| Copilot CLI | `~/.copilot/hooks/context-mode.json` | `~/.copilot/skills` | R | pass: 203,669 -> 384 | 2026-10-26 | 1.0.103 | partly: MCP tool-name prefix not checked |
| VS Code (Copilot) | `~/.copilot/hooks/context-mode-vscode.json` | `~/.agents/skills` | D | pass: 204,513 -> 560 | 2026-10-26 | not run | partly: no loader run |
| Kiro | `~/.kiro/hooks/context-mode.json` | `~/.kiro/skills` | D | pass: 183,551 -> 242 | 2026-10-26 | not installed | partly: stdin payload from adapter, not docs |
| ZCode | `~/.zcode/cli/config.json` `hooks` | `~/.zcode/skills` | D | pass: 169,068 -> 443 | 2026-10-26 | not installed | partly: skills dir not in docs |
| Pi | in process `pi/index.js` | package `skills/` | R | pass: 200,062 -> 160 | 2026-10-26 | 0.73.1 | yes: docs shipped in the installed package |
| OpenCode | in process `opencode/plugin.js` | `~/.config/opencode/skills` | D | pass: 198,645 -> 235 | 2026-10-26 | not installed | partly: plugin tool name unproven live |

## From source

Use this to test a build from a clone. The repo root is the dev package: it has no `bin`, so `npm i -g .` gives no `context-mode` command. The user package is the release tree.

```sh
npm install --no-package-lock
node build/build.mjs --out release-out
npm i -g ./release-out
context-mode --version
```

Then run `context-mode setup` as above. `context-mode --version` must print a version. If it does not, see [Troubleshooting](#troubleshooting).

## Updating

```sh
context-mode upgrade
```

`upgrade` installs the newest version on the tag you are on (`next` for a `-next` version), then runs `setup --repair`. Add `--tag <tag>` to pick a tag. Restart your agent after it.

If you update with npm yourself (`npm i -g context-mode@next`), most agents need nothing more: they run the npm files. Per agent:

| Agent | After `npm i -g` |
|---|---|
| Claude Code | Claude Code runs its own copy of the plugin. Run `context-mode setup --repair`, or `claude plugin update context-mode@context-mode`. `context-mode doctor` fails with this fix line while the copy is old. |
| Codex, Copilot CLI, Gemini CLI, Kiro, OpenCode, Pi, Qwen Code, VS Code, Z Code | Nothing. Restart the agent. |

Run `context-mode doctor` to check. It changes nothing.

## Uninstall

```sh
context-mode setup --remove
npm rm -g context-mode
```

`setup --remove` puts each touched file back. It reports what it restored.

## Troubleshooting

`context-mode: command not found` after `npm i -g`: npm put the command in a folder that is not on your `PATH`. Run `npm prefix -g`. Add its `bin` folder (`Scripts` on Windows) to `PATH`, open a new shell, and run `context-mode --version`. If the install was from a clone, you must install `./release-out`, not the repo root (see [From source](#from-source)).

Run `context-mode doctor`. It checks each agent and changes nothing. On a TTY, a failed agent gets one question: fix now.

A failed check prints the agent, the reason, a fix command, and a `gh issue create` command. The report file is under `~/.context-mode/reports/`. Open the [v2 bug form](https://github.com/mksglu/context-mode/issues/new?template=bug.yml) and paste it.

## Verified

Tested on macOS (arm64), Node 26, a clean temporary HOME per run, npm-packed build of commit 5c41eb61. Seven agent CLIs were installed in a temporary prefix: Claude Code 2.1.309, Codex 0.164.0, Copilot CLI 1.0.103, Gemini CLI 0.65.0, OpenCode 1.19.4, Pi 1.4.0, Qwen Code 0.26.0.

| Step | Date | Result |
|---|---|---|
| `context-mode setup --yes --agents <all seven>` | 2026-10-23 | Pass: 7 of 7 |
| the same command again | 2026-10-23 | Pass: no change |
| `context-mode doctor --agents <all seven>` | 2026-10-23 | Pass: 7 of 7 |
| `context-mode setup --remove --yes` | 2026-10-23 | Pass: touched files restored (`Restored N file(s).`) |

The first run failed, and the failures were real defects. All four are fixed and logged in [DEVIATIONS](../v2/impl/DEVIATIONS.md):

| Defect | Row |
|---|---|
| `gemini extensions install <folder>` hangs on a trust prompt; Qwen needs `link` with `y` on stdin | D-INST-1 |
| Gemini 0.65.0 prints its extension list to stderr, so the list check failed | D-INST-2 |
| The npm package had no `.claude-plugin/marketplace.json`, and Claude Code needs an `owner` object in it | D-INST-3 |
| Install-docs checker had no rule for CLI flags or page content | D-INST-4 |

Open: Kiro, VS Code and ZCode were not installed, so their rows prove the config entry and handshake only. No logged-in agent session fired a hook. Evidence: [CLI report](../v2/CLI-REPORT.md), [engine tests](../../tests/v2/setup/engine.test.mjs), [manifest tests](../../tests/v2/build/manifests.test.mjs).
