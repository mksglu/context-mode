# Context Mode

**A free, local plugin that keeps tool output out of your coding agent's context window. 10 agents, zero telemetry, free forever.**

[![npm downloads](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fapi.npmjs.org%2Fdownloads%2Fpoint%2Flast-year%2Fcontext-mode&query=%24.downloads&label=npm%20downloads%2C%20last%20365%20days&color=blue)](https://www.npmjs.com/package/context-mode) [![GitHub stars](https://img.shields.io/github/stars/mksglu/context-mode?style=flat&color=yellow)](https://github.com/mksglu/context-mode) [![Hacker News 570+ points](https://img.shields.io/badge/Hacker%20News-570%2B%20points-ff6600?logo=ycombinator&logoColor=white)](https://news.ycombinator.com/item?id=47193064) [![GitHub Trending](https://img.shields.io/badge/GitHub-Trending-black?logo=github)](https://github.com/uibm/trending-watcher/issues?q=%22mksglu%2Fcontext-mode%22) [![Discord](https://img.shields.io/discord/1478479412700909750?label=Discord&logo=discord&color=5865f2)](https://discord.gg/DCN9jUgN5v) [![License: ELv2](https://img.shields.io/badge/License-ELv2-blue.svg)](LICENSE)

> **Context Mode Gateway** takes the same idea from tool output to the whole conversation. It is an optional hosted service that works next to this plugin: Recall keeps long sessions searchable, and Memory shares what your agents learn across sessions and tools. The plugin stays free and local, with its source open on GitHub. [See how the Gateway works](https://contextmode.ai/docs/how-saving-works?utm_source=github&utm_medium=readme&utm_content=quote)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/readme/hero-dark.png">
  <img src="docs/assets/readme/hero-light.png" alt="Context Mode: free and local, for 10 coding agents, zero telemetry, your data stays on your machine. 99.4% of output bytes saved (median of 36 rows with 10 KB or more of raw output).">
</picture>

**Contents:** [Why](#why) · [Install](#install) · [Supported agents](#supported-agents) · [Use cases](#use-cases) · [Benchmarks](#benchmarks) · [How it works](#how-it-works) · [Tools](#tools) · [Security and privacy](#security-and-privacy) · [Context Mode Gateway](#context-mode-gateway) · [Star history](#star-history) · [License](#license) · [Community](#community)

## Why

A coding agent reads files, runs commands and fetches pages, and every result goes into its context window.
Context Mode runs that work in a local sandbox, keeps the full output in a SQLite index on your machine, and gives the agent the part it asks for.

- **Free forever.** Use it at home and at work, free of charge, under a source-available license.
- **Runs on your machine.** The hooks, the sandbox and search run as local processes next to your agent.
- **Your data stays on your machine.** Every index lives in `~/.context-mode`: one `context.db` per project.
- **Zero telemetry.** The plugin sends zero usage data. A CI test keeps its short list of network calls fixed: see [Security and privacy](#security-and-privacy).
- **Works offline after install.** Sandbox runs, file indexing and search use local SQLite and your own runtimes.
- **Small replies.** On the 36 bench rows with 10 KB or more of raw output, the median reply is 99.4% smaller than the raw output.

## Install

> [!IMPORTANT]
> You need Node 24.15.0 or later. On Windows you also need Git for Windows: the shell tools run in Git Bash, and `context-mode doctor` check D11 (shell) checks for it.

Open your agent and copy its own install command. Each block also has the update, check and remove steps.

<details id="install-claude-code"><summary><b>Claude Code</b></summary>

```sh
claude plugin marketplace add mksglu/context-mode#release
claude plugin install context-mode@context-mode
```
Update: `claude plugin update context-mode@context-mode`. Check: `context-mode doctor --agents claude-code`. Remove: `context-mode setup --remove --agents claude-code`. Guide: [docs/install/claude-code.md](docs/install/claude-code.md).
</details>
<details id="install-codex"><summary><b>Codex</b></summary>

```sh
codex plugin marketplace add mksglu/context-mode@release
codex plugin add context-mode@context-mode
```
Update: `codex plugin marketplace upgrade context-mode`. Check: `context-mode doctor --agents codex`. Remove: `context-mode setup --remove --agents codex`. Guide: [docs/install/codex.md](docs/install/codex.md).
</details>
<details id="install-gemini"><summary><b>Gemini CLI</b></summary>

```sh
gemini extensions install https://github.com/mksglu/context-mode --ref release
```
Update: `gemini extensions update context-mode`. Check: `context-mode doctor --agents gemini`. Remove: `context-mode setup --remove --agents gemini`, then `gemini extensions uninstall context-mode`. Guide: [docs/install/gemini.md](docs/install/gemini.md).
</details>
<details id="install-qwen"><summary><b>Qwen Code</b></summary>

```sh
qwen extensions install https://github.com/mksglu/context-mode:context-mode --ref release
```
Update: `qwen extensions update context-mode`. Check: `context-mode doctor --agents qwen`. Remove: `context-mode setup --remove --agents qwen`, then `qwen extensions uninstall context-mode`. Guide: [docs/install/qwen.md](docs/install/qwen.md).
</details>
<details id="install-pi"><summary><b>Pi</b></summary>

```sh
pi install npm:context-mode@next
```
Update: `pi update --extensions`. Check: `context-mode doctor --agents pi`. Remove: `context-mode setup --remove --agents pi`. Guide: [docs/install/pi.md](docs/install/pi.md).
</details>
<details id="install-opencode"><summary><b>OpenCode</b></summary>

```sh
opencode plugin add context-mode@next
```
Update: `opencode plugin update`. Check: `context-mode doctor --agents opencode`. Remove: `opencode plugin remove context-mode@next`, then `context-mode setup --remove --agents opencode`. Guide: [docs/install/opencode.md](docs/install/opencode.md).
</details>
<details id="install-copilot-cli"><summary><b>Copilot CLI</b></summary>

```sh
npm i -g context-mode@next
context-mode setup --agents copilot-cli
```
Update: `context-mode upgrade`. Check: `context-mode doctor --agents copilot-cli`. Remove: `context-mode setup --remove --agents copilot-cli`. Guide: [docs/install/copilot-cli.md](docs/install/copilot-cli.md).
</details>
<details id="install-kiro"><summary><b>Kiro</b></summary>

```sh
npm i -g context-mode@next
context-mode setup --agents kiro
```
Update: `context-mode upgrade`. Check: `context-mode doctor --agents kiro`. Remove: `context-mode setup --remove --agents kiro`. Guide: [docs/install/kiro.md](docs/install/kiro.md).
</details>
<details id="install-vscode"><summary><b>VS Code (Copilot)</b></summary>

```sh
npm i -g context-mode@next
context-mode setup --agents vscode
```
Update: `context-mode upgrade`. Check: `context-mode doctor --agents vscode`. Remove: `context-mode setup --remove --agents vscode`. Guide: [docs/install/vscode.md](docs/install/vscode.md).
</details>
<details id="install-zcode"><summary><b>ZCode</b></summary>

```sh
npm i -g context-mode@next
context-mode setup --agents zcode
```
Update: `context-mode upgrade`. Check: `context-mode doctor --agents zcode`. Remove: `context-mode setup --remove --agents zcode`. Guide: [docs/install/zcode.md](docs/install/zcode.md).
</details>

Today `main` holds the old build (1.0.169), so the four GitHub-source commands name the `release` branch in each agent's own syntax.
Already installed from GitHub on `main`? Each agent page has the steps to switch to the `release` ref: see "Already installed from GitHub?" in [Claude Code](docs/install/claude-code.md#already-installed-from-github), [Codex](docs/install/codex.md#already-installed-from-github), [Gemini CLI](docs/install/gemini.md#already-installed-from-github) and [Qwen Code](docs/install/qwen.md#already-installed-from-github).
<!--
After v2 is on main: `claude plugin marketplace add mksglu/context-mode`, `codex plugin marketplace add mksglu/context-mode`, `gemini extensions install https://github.com/mksglu/context-mode`, `qwen extensions install https://github.com/mksglu/context-mode:context-mode`
`next` is the v2 prerelease tag on npm.
Agent note, native install then update per agent: claude-code: `claude plugin marketplace add mksglu/context-mode#release`, then `claude plugin install context-mode@context-mode`; update `claude plugin update context-mode@context-mode`. codex: `codex plugin marketplace add mksglu/context-mode@release`, then `codex plugin add context-mode@context-mode`; update `codex plugin marketplace upgrade context-mode`. gemini: `gemini extensions install https://github.com/mksglu/context-mode --ref release`; update `gemini extensions update context-mode`. qwen: `qwen extensions install https://github.com/mksglu/context-mode:context-mode --ref release`; update `qwen extensions update context-mode`. pi: `pi install npm:context-mode@next`; update `pi update --extensions`. opencode: `opencode plugin add context-mode@next`; update `opencode plugin update`.
-->

The npm route works for every agent:

```sh
npm i -g context-mode@next
context-mode setup
```

`next` is the prerelease tag on npm and `latest` points to the old release, so add `@next`.
`context-mode setup` is also the repair. It shows a plan, applies it, and rolls back an agent that fails.
Uninstall: `context-mode setup --remove && npm rm -g context-mode`. Details: [docs/install/README.md](docs/install/README.md).

> [!TIP]
> Restart the agent, then run `context-mode doctor` (or `/ctx-doctor` in the agent). Each check prints PASS, or FAIL with the command that fixes it.

## Supported agents

Every agent gets hooks, the MCP server and the skills. The Install column is the agent's own install command, or the npm route for the other four agents.

<!-- agents:install:start (node build/readme-agents.mjs --write) -->
| Agent | Hooks | MCP | Skills | Install | Guide |
|---|---|---|---|---|---|
| Claude Code | yes, package | yes | yes | `claude plugin install context-mode@context-mode` | [docs/install/claude-code.md](docs/install/claude-code.md#install) |
| Codex | yes, hook file | yes | yes | `codex plugin add context-mode@context-mode` | [docs/install/codex.md](docs/install/codex.md#install) |
| Copilot CLI | yes, hook file | yes | yes | npm + `context-mode setup` | [docs/install/copilot-cli.md](docs/install/copilot-cli.md#install) |
| Gemini CLI | yes, package | yes | yes | `gemini extensions install https://github.com/mksglu/context-mode --ref release` | [docs/install/gemini.md](docs/install/gemini.md#install) |
| Kiro | yes, hook file | yes | yes | npm + `context-mode setup` | [docs/install/kiro.md](docs/install/kiro.md#install) |
| OpenCode | yes, the plugin's own event handlers | yes | yes | `opencode plugin add context-mode@next` | [docs/install/opencode.md](docs/install/opencode.md#install) |
| Pi | yes, the plugin's own event handlers | plugin inside the agent | yes | `pi install npm:context-mode@next` | [docs/install/pi.md](docs/install/pi.md#install) |
| Qwen Code | yes, package | yes | yes | `qwen extensions install https://github.com/mksglu/context-mode:context-mode --ref release` | [docs/install/qwen.md](docs/install/qwen.md#install) |
| VS Code (Copilot) | yes, hook file | yes | yes | npm + `context-mode setup` | [docs/install/vscode.md](docs/install/vscode.md#install) |
| ZCode | yes, hook file | yes | yes | npm + `context-mode setup` | [docs/install/zcode.md](docs/install/zcode.md#install) |
<!-- agents:install:end -->

Hooks reach each agent in one of three ways: in the plugin package (Claude Code, Gemini CLI, Qwen Code), in a hook file (Codex, Copilot CLI, Kiro, VS Code, ZCode), or in a plugin inside the agent (OpenCode, Pi).
For 8 agents, on 2.0.0-next.15, we watched the real agent binary run our hook in a clean temp home, logged out, with zero API keys.
VS Code and Kiro are at an earlier step: the VS Code hook command works with the documented payload, and kiro-cli 2.35.2 loads all 6 hook entries.
CI runs setup, doctor, a hook and an MCP handshake for all 10 agents from the packed package on Linux, macOS and Windows. Record: [docs/architecture/release/HOOKS-FIRE.md](docs/architecture/release/HOOKS-FIRE.md).

## Use cases

Real tool output from public projects, run through Context Mode. Bench of 2026-11-01 on 2.0.0-next.23, median of 5 runs ([bench/results/2026-11-01-darwin-arm64.json](bench/results/2026-11-01-darwin-arm64.json)); each source is in [bench/fixtures/data/SOURCE.md](bench/fixtures/data/SOURCE.md).

| What you do | Tool | Raw | Reaches the context | Saved |
|---|---|---:|---:|---:|
| [Read a browser page](bench/a-sandbox/README.md#a-devtools-mcp-snapshot) | Chrome DevTools MCP `take_snapshot` | 136,514 B | 463 B | 99.7% |
| [List 40 issues](bench/a-sandbox/README.md#a-gh-issue-list-vite) | GitHub CLI `gh issue list --json` | 182,943 B | 850 B | 99.5% |
| [List 25 pull requests with checks](bench/a-sandbox/README.md#a-gh-pr-list-vite) | GitHub CLI `gh pr list --json` | 195,471 B | 776 B | 99.6% |
| [Look up library docs](bench/a-sandbox/README.md#a-context7-query-docs-vite) | Context7 `query-docs` | 6,917 B | 473 B | 93.2% |
| [Run 1,106 tests](bench/a-sandbox/README.md#a-vitest-run-vite) | Vitest `vitest run --reporter=verbose` | 62,909 B | 429 B | 99.3% |
| [Lint a source folder](bench/a-sandbox/README.md#a-biome-lint-vite) | Biome `biome lint --reporter=json` | 288,523 B | 577 B | 99.8% |
| [Install a workspace](bench/a-sandbox/README.md#a-pnpm-install-vite) | pnpm `pnpm install --frozen-lockfile` | 14,988 B | 199 B | 98.7% |
| [Install packages](bench/a-sandbox/README.md#a-npm-install-log) | npm `npm install --loglevel http` | 37,761 B | 435 B | 98.8% |
| [Read container logs](bench/a-sandbox/README.md#a-docker-logs-mongo) | Docker `docker logs` | 60,374 B | 587 B | 99.0% |
| [Plan 72 resources](bench/a-sandbox/README.md#a-terraform-plan) | Terraform `terraform plan` | 34,081 B | 166 B | 99.5% |
| [Read 300 commits with file stats](bench/a-sandbox/README.md#a-git-log-stat-vite) | git `git log --stat` | 164,385 B | 268 B | 99.8% |
| [Read an 89 KB source file](bench/f-hook-redirect/README.md#f-read-vite-config) | Read, sent to `ctx_execute` by the hook | 91,362 B | 375 B | 99.6% |
| [Fetch a 265 KB docs page](bench/f-hook-redirect/README.md#f-webfetch-vite-docs) | WebFetch, sent to `ctx_index` and `ctx_search` | 271,731 B | 439 B | 99.8% |
| [Fetch a 219 KB API reply](bench/f-hook-redirect/README.md#f-bash-curl-post) | curl in Bash, replaced after it runs | 219,175 B | 291 B | 99.9% |
| [Debug for a full session: 8 outputs, 3 searches](bench/g-overhead/README.md#g-session-total) | All hooks and tools | 281,261 B | 3,266 B | 98.8% |

The agent gets the part it asks for. The full output stays in the local index, and `ctx_search` reads it back.

## Benchmarks

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/readme/fig-saving-dark.png">
  <img src="docs/assets/readme/fig-saving-light.png" alt="Bar chart: median output bytes saved per category for rows of 10 KB or more. Sandbox 99.5%, Batch 93.1%, Externalize 98.3%, Hook redirect 99.8%, Session total 98.8%.">
</picture>

Rule for every headline number in this README: rows with 10 KB or more of raw output, median of 5 runs per row, measured with `ctx_bytes` against `raw_bytes`; a category is the median of its rows.
All 36 such rows: a median of 99.4% of output bytes stay out of the context. Bench on 2.0.0-next.23, macOS arm64, 2026-11-01.

| Category | What runs | Rows | Median saved |
|---|---|---:|---:|
| a. Sandbox | `ctx_execute` on a file or command | 19 | 99.5% |
| c. Batch | `ctx_batch`: many commands, then search | 2 | 93.1% |
| d. Externalize | Host tool output over the cap, indexed whole | 4 | 98.3% |
| f. Hook redirect | A big Read, curl or WebFetch sent to the sandbox | 7 | 99.8% |
| g. Session total | One full scripted session | 1 | 98.8% |

Search replies (category b) return text on purpose. The full file lists them with every row, small ones too: [bench/results/2026-11-01-darwin-arm64.md](bench/results/2026-11-01-darwin-arm64.md).
Reproduce: `cd bench && node run.mjs`. Method and every data file: [bench/README.md](bench/README.md), [bench/evidence/](bench/evidence/README.md).

### Longer sessions

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/readme/fig-oss-dark.png">
  <img src="docs/assets/readme/fig-oss-light.png" alt="A session grows, the context stays small. The PreToolUse hook sends a tool call to ctx_execute or ctx_index; the full output goes into context.db and a small reply returns. At compaction a snapshot keeps the state, and ctx_resume and ctx_search read it back.">
</picture>

Each tool call: the hook sends large output to the sandbox or the index, the full copy goes into `context.db`, and the agent gets a small reply. At compaction, a snapshot of at most 2,048 B keeps the state, and `ctx_resume` and `ctx_search` read it back.

- Long session, 40 outputs, then compaction: a 432.5 KB transcript, a 2.0 KB `ctx_resume` block ([bench/results/2026-11-01-darwin-arm64.json](bench/results/2026-11-01-darwin-arm64.json), row [e-long-session](bench/e-continuity/README.md#e-long-session)).
- One large log: 666,796 B of output, 3,380 B reach the context (row [d-synth-1m](bench/d-externalize/README.md#d-synth-1m)).

### Speed

Median of 5 runs, bench of 2026-11-01. Rows per agent and per query: [docs/performance.md](docs/performance.md).

| Measure | Result |
|---|---|
| Hook time over a bare `node` start, per agent | 7.5 ms to 12.3 ms |
| `ctx_search`, 20 queries over 8 indexed files | 1.62 ms median, 6.70 ms max |
| `ctx_index`, 3 real files, 0.6 MB | 150 ms per MB |

## How it works

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/readme/fig-flow-dark.png">
  <img src="docs/assets/readme/fig-flow-light.png" alt="One tool call, step by step: the agent runs a tool, the PreToolUse hook denies a big Read and names the ctx_execute call, the MCP server runs it in the sandbox, SQLite FTS5 keeps the output, and after compaction a state block of at most 2,048 B comes back.">
</picture>

Context Mode has three parts: hooks, an MCP server with nine tools, and one SQLite database per project. All three run on your machine, and the data stays in `~/.context-mode`.

**Hooks.** The hooks listen to four events: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`. Gemini CLI, VS Code and OpenCode also send a compaction event; each host keeps its own event names. `PreToolUse` checks rules in a fixed order: the user's deny list, WebFetch, curl and HTTP or build commands, then Read and shell dumps. Context Mode denies a full-file `Read` of a file over 16,384 B, and the deny message names the exact `ctx_execute` call to use. A `Read` with a range still runs. A hook always exits 0: on any error it gives the host's "allow" reply and writes one log line, so your agent keeps working. Spawned hooks time out after 5,000 ms.

**Sandbox execution.** `ctx_execute` writes the script to a temp folder and runs it as a local subprocess: shell, PowerShell, JavaScript, TypeScript, Python, or any runtime found on `PATH`. It spawns the runtime directly from an argument list, in the project folder. The default and maximum timeout is 600,000 ms; on timeout it kills the whole process group (`taskkill /F /T` on Windows). The child gets the parent environment minus the preload variables (`NODE_OPTIONS`, `BUN_OPTIONS`, `DENO_OPTIONS` and similar). The agent gets what the script prints, cut on a whole character.

**Index and search.** Each output goes into SQLite FTS5 twice: a Porter-stemmed table for words, and a trigram table for paths, names and parts of words. `ctx_search` ranks each table with BM25 and joins the two lists with Reciprocal Rank Fusion: a hit scores 1/(60 + rank) in each list. On zero matches, it tries a spelling fix from the indexed words. Search covers one of three scopes: this session, this worktree (the default) or the whole project. Chunks are at most 4,096 B. A Markdown chunk stays inside one heading section and carries its heading path as its title. A code block that fits in a chunk stays whole; a bigger one splits on blank lines, and each piece repeats the fence. A reply snippet is at most 800 B, or a whole code block up to 2,048 B.

**Large output, run and replace.** When a host tool returns more than the cap, `PostToolUse` indexes the whole output and replaces it. The agent gets the best-matching whole chunks and one `ctx_search` line for the rest. Context Mode keeps the full text in the local index.

**Session continuity.** The hooks log each prompt, edit, command, tool error, index, cost and decision. After a compaction the agent gets a state block of at most 2,048 B built from that log. Every line stays whole: a long line becomes a `ctx_resume(seq)` pointer that reads the full row. On the next prompt, a recall block of at most 2,048 B brings back the log rows that match it by BM25, always as whole rows. The same rows always give the same bytes.

**Storage.** Context Mode uses Node's built-in `node:sqlite`, so the install compiles zero native modules. Each project gets one `context.db` under `~/.context-mode` on your machine. The database runs in WAL mode. On close it always runs a PASSIVE checkpoint. Context Mode builds a new database under a temp name, then moves it into place in one step, so the file on disk is always complete, even after a crash. Busy timeout: 5,000 ms.

## Tools

| Tool | What it does |
|---|---|
| `ctx_execute` | Runs code or a shell command in a sandbox; returns what it prints |
| `ctx_batch` | Runs many commands, indexes the output, and searches it in one call |
| `ctx_index` | Indexes a file, a text or a URL into the project database |
| `ctx_search` | Searches the index; returns the matching parts |
| `ctx_resume` | Returns the state block, or one full row by `seq` |
| `ctx_stats` | Shows how much output stayed out of context |
| `ctx_doctor` | Checks the install; each FAIL line names its fix |
| `ctx_upgrade` | Installs, upgrades or uninstalls; replaces old context-mode entries |
| `ctx_purge` | Deletes indexed data by session, source or project |

Full reference: [docs/tools.md](docs/tools.md).

Commands in the agent: `/ctx-stats` shows the `ctx_stats` result, `/ctx-doctor` runs `ctx_doctor` (send its report with a defect report), and `/ctx-upgrade` runs `ctx_upgrade`, then `ctx_doctor`.

## Security and privacy

- All data stays on your machine, in `~/.context-mode`: one `context.db` per project. `ctx_purge` deletes it by session, source or project.
- The plugin has zero telemetry: it sends zero usage data, events or crash reports. It uses the network at these call sites, each one started by you or your agent:
  - `ctx_index` of a URL the agent asks for: `src/core/sandbox/fetch.ts`. It blocks private and link-local addresses, checks each address the host name points to, connects to the address it checked, and checks again at each redirect.
  - `context-mode doctor`: `git ls-remote` to the release repository, to check for a new version (`src/core/ops/doctor-env.ts`).
  - `ctx_upgrade`: `git clone --depth 1` of the release branch (`src/core/ops/release-fetch.ts`). `context-mode upgrade`: `npm i -g context-mode@next` (`src/cli/commands.ts`).
  - The debug report: `gh issue create`, after you press a key (`src/cli/commands.ts`).
  - Install and update: your agent's own install command, npm or git.
- The guard test D-PRIVACY-NET-1 in `tests/0008-enforcement.test.mjs` scans `src` for HTTP clients, sockets, DNS lookups, git network calls and `gh` or `npm` spawns. It fails when a new call site appears outside this list, so this section stays true.
- Doctor and the debug report remove secrets by their structure before they print.

> [!NOTE]
> Here "sandbox" means the output stays in the sandbox, out of the context. Code from `ctx_execute` runs on your host as your user, with your environment (minus the preload variables), your files and your network; keep your agent's own permission prompts on.

## Context Mode Gateway

The plugin works on tool output, on your machine, and it is complete on its own. Context Mode Gateway is an optional hosted service that works on every request, across all your agents: Recall, Memory, Skills, Search and Protect.
Teams add it for long sessions, shared memory and cost reports. The two work together.

<a href="docs/assets/readme/gateway/live.mp4"><img src="docs/assets/readme/gateway/live.webp" width="100%" alt="Gateway Live screen during a session: money saved, bytes kept out per request, history kept and sent, and a feed of each request with its cost and saving"></a>

**Live.** One session as it runs: money saved this session, bytes kept out per request, history kept and sent, and a feed of each request with its cost and saving. [Full video](docs/assets/readme/gateway/live.mp4)

Docs: [How saving works](https://contextmode.ai/docs/how-saving-works?utm_source=github&utm_medium=readme&utm_content=live), [Recall](https://contextmode.ai/docs/recall?utm_source=github&utm_medium=readme&utm_content=live), [Session resume](https://contextmode.ai/docs/session-resume?utm_source=github&utm_medium=readme&utm_content=live)

<a href="docs/assets/readme/gateway/overview.webp"><img src="docs/assets/readme/gateway/overview-1200.webp" alt="Gateway Overview: money saved, AI spend, prompt-cache discount and cost per request over 30 days" width="100%"></a>

**Overview.** What you paid and what the Gateway saved, per day, in one view.

Docs: [How saving works](https://contextmode.ai/docs/how-saving-works?utm_source=github&utm_medium=readme&utm_content=overview)

<a href="docs/assets/readme/gateway/analytics.webp"><img src="docs/assets/readme/gateway/analytics-1200.webp" alt="Gateway Analytics: saved money over time, split by source" width="100%"></a>

**Analytics.** Where each saving comes from: hidden tools, archived old results, large outputs kept in the archive and trimmed context.

Docs: [How saving works](https://contextmode.ai/docs/how-saving-works?utm_source=github&utm_medium=readme&utm_content=analytics), [Active Context](https://contextmode.ai/docs/active-context?utm_source=github&utm_medium=readme&utm_content=analytics)

<a href="docs/assets/readme/gateway/spend.webp"><img src="docs/assets/readme/gateway/spend-1200.webp" alt="Gateway Spend: spend per day by model, cost per request and cache hit rate" width="100%"></a>

**Spend.** Spend per day and per model, cost per request and the cache hit rate, to help you plan a budget.

Docs: [Prompt caching](https://contextmode.ai/docs/prompt-caching?utm_source=github&utm_medium=readme&utm_content=spend)

<a href="docs/assets/readme/gateway/memory.webp"><img src="docs/assets/readme/gateway/memory-top-1200.webp" alt="Gateway Memory: money saved by Recall and searches per day" width="100%"></a>

**Memory.** Facts and decisions carry across sessions and agents. The screen shows what Recall saved and how many searches found an answer.

Docs: [Memory](https://contextmode.ai/docs/memory?utm_source=github&utm_medium=readme&utm_content=memory), [Recall](https://contextmode.ai/docs/recall?utm_source=github&utm_medium=readme&utm_content=memory)

<a href="docs/assets/readme/gateway/skills.webp"><img src="docs/assets/readme/gateway/skills-1200.webp" alt="Gateway Skills: import from GitHub and the list of installed skills" width="100%"></a>

**Skills.** Add a skill once and all your clients use it when it helps. Import skills from GitHub and see the installed ones.

Docs: [Skills](https://contextmode.ai/docs/skills?utm_source=github&utm_medium=readme&utm_content=skills)

<a href="docs/assets/readme/gateway/protect.webp"><img src="docs/assets/readme/gateway/protect-1200.webp" alt="Gateway Protect: a new command rule that blocks terraform destroy" width="100%"></a>

**Protect.** Rules that check each shell command before it runs. Here, a rule that stops <code>terraform destroy</code>.

Docs: [Protect](https://contextmode.ai/docs/protect?utm_source=github&utm_medium=readme&utm_content=protect)

Numbers in these screens come from the author's own account over 30 days (Oct 3 - Nov 1, 2026), so read them as one account's usage. Click an image for the full size.

<details>
<summary>Gateway features, from contextmode.ai/docs</summary>

Source: [contextmode.ai/docs](https://contextmode.ai/docs/how-saving-works?utm_source=github&utm_medium=readme&utm_content=features):

| Feature | What it does | What you get | Details |
|---|---|---|---|
| Context Saving | Folds old tool output, runs data work as code (Thinking in Code), trims tool schemas, places cache marks | Tool schemas 102,784 B to 33,611 B per request (-67.3%); a tool output over 2,048 B becomes a pointer of about 285 B, with the full copy archived | Saves the most on sessions with many tool calls; A/B measured in Claude Code |
| Recall | The model sees recent work and an index of older work; the agent searches the archive for the rest | 200K window, 2026-10-04: mean cost per session $4.86 to $3.04 (-37.6%) | Cost measured in Claude Code on Claude Opus 5.5 |
| Memory | Each fact keeps two times: when it was true and when the Gateway learned it | Claude Code and Codex on one account share one store, tested end to end | The memory block goes into the first request of a new session |
| Skills | A skill catalog on the Gateway for your account; it loads the skill that matches your message | The matching skill loads on the message that needs it | Import skills from GitHub; a loaded skill joins the prompt in full |
| Search | Searches the prompts, commands and tool output that passed through, in the console and as an agent tool | Find any past prompt, command or tool output, from the console or your agent | The console searches the first 4,000 characters of each tool result |
| Session resume | One command rebuilds a conversation as a native Claude Code or Codex session | Continue a conversation in Claude Code or Codex | Restores the text, tool names and a summary; the command is valid for 15 minutes |
| Active Context | Sets how much a thread carries before its oldest parts move to the archive: 200K, 500K or 1M tokens | Pick the window size per thread | An image older than the kept part becomes a short text note |
| Instructions | One text of at most 4,096 characters that tells every agent how to answer you | Read from the provider cache after the first request | Sets how the agent writes to you |
| Protect | A tool-call firewall: checks shell commands, file reads and writes, web fetches and tool-server calls by what they do | Each call checked before it runs | Reads the call itself, so keep your agent's sandbox on for script files and paths built at run time; opt-in |
| Prompt caching | Keeps requests cache-friendly: cache marks on the fixed part of the prompt and a cache for fetched pages | Inside the measured costs above | Uses up to 4 cache marks, the provider's maximum |
| Live and Analytics | Shows each request and what the Gateway saved, as it happens and over time | See each request and its saving, live and over time | Covers every request that passes through the Gateway |

</details>

Gateway cost against Claude Code alone, Claude Opus 5.5, mean dollars per session at list price:

- Six short tasks (2026-09-29): 24.5% cheaper pooled over 176 sessions (21% to 29% per task). [v3-opus55-short.json](https://contextmode.ai/benchmarks/data/v3-opus55-short.json?utm_source=github&utm_medium=readme&utm_content=bench)
- Long Claude Code session, 200K window (2026-10-03/04): mean cost per session $4.86 to $3.04 (-37.6%). [ab.json](https://contextmode.ai/benchmarks/recall/200k-r2/ab.json?utm_source=github&utm_medium=readme&utm_content=bench)
- We fixed the rules before each run: [contextmode.ai/docs/benchmarks](https://contextmode.ai/docs/benchmarks?utm_source=github&utm_medium=readme&utm_content=bench).

Apps: Claude Code, Claude Desktop, Codex, Codex Desktop, T3 Code, OpenCode and Pi.
Setup is one command, `npx @context-mode/cli`. It signs you in and writes one config change per agent (it needs Node 20.12 or later).
The Gateway routes to Anthropic and OpenAI. Requests pass through the Gateway server on their way to the model.
Keep your agent's own sandbox on next to Protect. More at [contextmode.ai](https://contextmode.ai/?utm_source=github&utm_medium=readme&utm_content=more).

## Star history

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/readme/star-history-dark.png">
  <img src="docs/assets/readme/star-history-light.png" alt="Line chart of cumulative GitHub stars for mksglu/context-mode since 2026-02-23. A daily job redraws it.">
</picture>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/readme/stargazers-dark.png">
  <img src="docs/assets/readme/stargazers-light.png" alt="Companies that stargazers of mksglu/context-mode name in their GitHub profile, Microsoft, Tencent, Alibaba, ByteDance, Google and more.">
</picture>

Starred by engineers at these companies: each name is the company field of 2 or more stargazer profiles, read with the GitHub GraphQL API on 2026-11-01 ([data](docs/assets/readme/data/stargazer-companies.json)).

GitHub stars over time, from the stargazers API (GraphQL, `starredAt`). A daily job redraws the chart; the date it was read is in the chart caption.

- **npm downloads.** The badge at the top shows npm downloads of the package over the last 365 days, read from the npm API ([stats.json](stats.json) keeps a daily copy).
- **Hacker News.** "MCP server that reduces Claude Code context consumption by 98%" reached the front page with 570+ points and 107 comments on 2026-02-28 ([thread](https://news.ycombinator.com/item?id=47193064)).
- **GitHub Trending.** A bot that watches GitHub Trending logged the repo there on 14 days from 2026-04-24 to 2026-10-17 ([uibm/trending-watcher](https://github.com/uibm/trending-watcher/issues?q=%22mksglu%2Fcontext-mode%22)).

## License

[Elastic License 2.0](LICENSE) (ELv2), a source-available license. You may use, copy, change and share the code, and use it at work, free of charge.
The license keeps three uses for the licensor:

1. Offering the software to others as a hosted or managed service that gives them a large part of its features.
2. Moving, changing, turning off or getting around the license key functions, or removing or hiding what the license key protects.
3. Changing, removing or hiding the licensor's license, copyright or other notices.

We chose ELv2 so the source stays open to all and the hosted service stays with the project.

## Community

Report a defect on [Discord](https://discord.gg/DCN9jUgN5v) with the full `/ctx-doctor` report.
The maintainer writes every change; send ideas and defect reports on Discord.

Docs: [docs/install/README.md](docs/install/README.md) (install, options, uninstall), [docs/how-it-works.md](docs/how-it-works.md), [docs/algorithms.md](docs/algorithms.md) (search, ranking, size limits, deny rules), [docs/tools.md](docs/tools.md), [bench/evidence/](bench/evidence/README.md).
