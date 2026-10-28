# Context Mode

[![clones](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fmksglu%2Fcontext-mode%2Fmain%2Fmetrics%2Ftraffic.json&query=%24.clones.count&label=clones&color=blue)](https://github.com/mksglu/context-mode/graphs/traffic)
[![GitHub stars](https://img.shields.io/github/stars/mksglu/context-mode?style=flat&color=yellow)](https://github.com/mksglu/context-mode/stargazers)
[![License: ELv2](https://img.shields.io/badge/License-ELv2-blue.svg)](LICENSE)

Context Mode is a free plugin that keeps large tool output out of your coding agent's context window.

## The problem

A coding agent reads files, runs commands and fetches pages. Each result goes into its context window.
A big log or a large file fills that window fast, and the agent forgets what it was doing.
Context Mode stops the big output before it lands, keeps it on disk, and gives back only the part the agent asks for.

- **Sandbox tools.** The agent runs code and commands through `ctx_execute` and `ctx_batch`. Only the result it prints comes back.
- **One index per project, with search.** Full output goes into one local SQLite file per project. `ctx_search` finds the lines the agent needs.
- **State after compaction.** When the agent compacts its context, a small state block tells it what it was doing. `ctx_resume` reads any row in full.

## Install

Use your agent's own install command. You need Node 24.15.0 or later (v2 uses the built-in `node:sqlite`).

| Agent | Install | Update |
|---|---|---|
| Claude Code | `claude plugin marketplace add mksglu/context-mode#release`, then `claude plugin install context-mode@context-mode` | `claude plugin update context-mode@context-mode` |
| Codex | `codex plugin marketplace add mksglu/context-mode@release`, then `codex plugin add context-mode@context-mode` | `codex plugin marketplace upgrade context-mode` |
| Gemini CLI | `gemini extensions install https://github.com/mksglu/context-mode --ref release` | `gemini extensions update context-mode` |
| Qwen Code | `qwen extensions install https://github.com/mksglu/context-mode:context-mode --ref release` | `qwen extensions update context-mode` |
| Pi | `pi install npm:context-mode@next` | `pi update --extensions` |
| OpenCode | `opencode plugin context-mode@next --global` | `opencode plugin context-mode@next --global --force` |

Until v2 is on `main`, `main` holds the old build (1.0.169), so the four GitHub-source rows name the `release` branch with each agent's own syntax.

After v2 is on main: `claude plugin marketplace add mksglu/context-mode`, `codex plugin marketplace add mksglu/context-mode`, `gemini extensions install https://github.com/mksglu/context-mode`, `qwen extensions install https://github.com/mksglu/context-mode:context-mode`

Already installed from GitHub without the ref? Each agent page has the steps to switch: see "Already installed from GitHub?" in [Claude Code](docs/install/claude-code.md#already-installed-from-github), [Codex](docs/install/codex.md#already-installed-from-github), [Gemini CLI](docs/install/gemini.md#already-installed-from-github) and [Qwen Code](docs/install/qwen.md#already-installed-from-github).

Copilot CLI, Kiro, VS Code and ZCode have no install command of their own for this package. Use npm, which also works for every other agent:

```sh
npm i -g context-mode@next
context-mode setup
```

`next` is the v2 prerelease tag on npm. `latest` stays on the old release. A plain `npm i -g context-mode` does not install v2.
Restart the agent, then check: `context-mode doctor` (or `/ctx-doctor` in the agent). Each check prints PASS, or FAIL with the command that fixes it.
`context-mode setup` is the fallback and the repair. It shows a plan, applies it, and rolls back an agent that fails.
Uninstall: `context-mode setup --remove && npm rm -g context-mode`. Details: [docs/install/README.md](docs/install/README.md).

**full** = setup installs the hooks and the MCP server. **MCP only** = setup adds the MCP server; the agent page says why there are no hooks.

<!-- agents:install:start (node build/readme-agents.mjs --write) -->
| Agent | Support | Guide |
|---|---|---|
| Claude Code | full | [docs/install/claude-code.md](docs/install/claude-code.md#install) |
| Codex | MCP only | [docs/install/codex.md](docs/install/codex.md#install) |
| Copilot CLI | MCP only | [docs/install/copilot-cli.md](docs/install/copilot-cli.md#install) |
| Gemini CLI | full | [docs/install/gemini.md](docs/install/gemini.md#install) |
| Kiro | MCP only | [docs/install/kiro.md](docs/install/kiro.md#install) |
| OpenCode | MCP only | [docs/install/opencode.md](docs/install/opencode.md#install) |
| Pi | full | [docs/install/pi.md](docs/install/pi.md#install) |
| Qwen Code | full | [docs/install/qwen.md](docs/install/qwen.md#install) |
| VS Code (Copilot) | MCP only | [docs/install/vscode.md](docs/install/vscode.md#install) |
| ZCode | MCP only | [docs/install/zcode.md](docs/install/zcode.md#install) |
<!-- agents:install:end -->

The table comes from `src/adapters/table.ts` and `src/setup/registry.ts`; `build/check-readme.mjs` fails when it differs.

## Tools

| Tool | What it does |
|---|---|
| `ctx_execute` | Runs code or a shell command in a sandbox; returns only what it prints |
| `ctx_batch` | Runs many commands, indexes the output, and searches it in one call |
| `ctx_index` | Indexes a file, a text or a URL into the project database |
| `ctx_search` | Searches the index; returns the matching parts only |
| `ctx_resume` | Returns the state block, or one full row by `seq` |
| `ctx_stats` | Shows how much output stayed out of context |
| `ctx_doctor` | Checks the install; each FAIL line names its fix |
| `ctx_upgrade` | Installs, upgrades or uninstalls; replaces old context-mode entries |
| `ctx_purge` | Deletes indexed data by session, source or project |

Full reference: [docs/tools.md](docs/tools.md).

## Commands

| Command | What it does |
|---|---|
| `/ctx-stats` | Calls `ctx_stats` and shows the result |
| `/ctx-doctor` | Calls `ctx_doctor`; use its report when you open an issue |
| `/ctx-upgrade` | Calls `ctx_upgrade`, then `ctx_doctor` |

## How it works

Context Mode has two parts that run inside one agent session:

- **Hooks.** Four hooks: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`. They watch each tool call and log what happens.
- **MCP server.** The nine tools above. The agent calls them to do the same work without the flood.
- **One database per project.** One `context.db` file per project holds the index and the session log.
- **Run, then replace.** A host tool result over the cap is indexed whole. The agent gets the best-matching whole chunks and a `ctx_search` line for the rest (DECISIONS-r10). A `Read` of a file over the cap with no range is denied, and the deny message names the ways to read it.
- **State after compaction.** After a compaction, the agent gets a state block of at most 2 KB. It is built from the session log.

Read more: [docs/how-it-works.md](docs/how-it-works.md), [docs/algorithms.md](docs/algorithms.md) (search and ranking),
[docs/tools.md](docs/tools.md) (tool inputs). Size limits and deny rules are in docs/algorithms.md §1, §2 and §7.

## Benchmarks

Every number links to a data file and a reproduce command: [docs/benchmarks/](docs/benchmarks/README.md).
Gateway and plugin side by side: [context-mode.com/benchmarks](https://context-mode.com/benchmarks).

## Context Mode Gateway (paid)

The Gateway is the paid plan. It sits between the agent and the model API: you set `ANTHROPIC_BASE_URL` to it, and the model needs no plugin tool calls.
On the same six short tasks it cost 24.5 % less than Claude Code alone (84 of 88 pairs cost less).
Loss: on the try-it prompts it passed the task check in 15 of 20 sessions; direct passed 20 of 20.
Requests go through the Gateway server, so it is not local only. [Measured rows](docs/benchmarks/README.md), [plans](https://context-mode.com/pricing).

## Privacy

- No telemetry. Context Mode sends no data about you or your code anywhere.
- No LLM calls. Context Mode never calls a model.
- All data stays in the `context.db` file of each project, on your machine.
- Network use: npm when you install or upgrade, `git ls-remote` in doctor (to check for a new version), and your agent's own install steps.
- `ctx_index` fetches a URL only when the agent asks for that URL.

## Docs

- [docs/install/README.md](docs/install/README.md): install, options, uninstall, troubleshooting.
- [docs/how-it-works.md](docs/how-it-works.md), [docs/algorithms.md](docs/algorithms.md) (search, ranking, size limits, deny rules), [docs/tools.md](docs/tools.md).
- [docs/benchmarks/](docs/benchmarks/README.md): all benchmarks, with data files and reproduce commands.
- [docs/v2/OPEN-ITEMS.md](docs/v2/OPEN-ITEMS.md): known gaps.

## Issues and license

Open an [issue](https://github.com/mksglu/context-mode/issues/new?template=bug.yml) with the full `/ctx-doctor` report.
Only v2 gets fixes. This repo does not take pull requests.

License: [Elastic License 2.0](LICENSE).
