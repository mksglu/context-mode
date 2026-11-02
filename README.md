# Context Mode

**A free, local plugin that keeps tool output out of your coding agent's context window. 10 agents, zero telemetry, free forever.**

[![npm downloads](https://img.shields.io/npm/dy/context-mode?label=npm%20downloads)](https://www.npmjs.com/package/context-mode) [![GitHub stars](https://img.shields.io/github/stars/mksglu/context-mode?style=flat&color=yellow)](https://github.com/mksglu/context-mode) [![Hacker News 570+ points](https://img.shields.io/badge/Hacker%20News-570%2B%20points-ff6600?logo=ycombinator&logoColor=white)](https://news.ycombinator.com/item?id=47193064) [![GitHub Trending](https://img.shields.io/badge/GitHub-Trending-black?logo=github)](https://github.com/uibm/trending-watcher/issues?q=%22mksglu%2Fcontext-mode%22) [![Discord](https://img.shields.io/discord/1478479412700909750?label=Discord&logo=discord&color=5865f2)](https://discord.gg/DCN9jUgN5v) [![License: ELv2](https://img.shields.io/badge/License-ELv2-blue.svg)](LICENSE)

> **Context Mode Gateway** takes the same idea from tool output to the whole conversation. It is an optional hosted service that works next to this plugin: Gateway Recall keeps long sessions searchable, and Gateway Memory shares what your agents learn across sessions and tools. The plugin stays free and local, with its source open on GitHub. [See how the Gateway works](https://contextmode.ai/docs/how-saving-works?utm_source=github&utm_medium=readme&utm_content=quote)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/readme/hero-dark.png">
  <img src="docs/assets/readme/hero-light.png" alt="Context Mode plugin: free and local, for 10 coding agents, zero telemetry, the plugin keeps your data on your machine. 99.4% of output bytes saved (median of 36 rows with 10 KB or more of raw output).">
</picture>

**Contents:** [Why](#why) · [Adoption](#adoption-stars-and-npm-downloads) · [Install](#install) · [Try it](#try-it) · [Use cases](#use-cases) · [Benchmarks](#benchmarks) · [How it works](#how-it-works) · [Tools](#tools) · [Security and privacy](#security-and-privacy) · [Context Mode Gateway](#context-mode-gateway) · [License](#license) · [Community](#community)

## Why

A coding agent reads files, runs commands and fetches pages, and every result goes into its context window.
Context Mode runs that work in a local sandbox, keeps the full output in a SQLite index on your machine, and gives the agent the part it asks for.

- **Free forever.** Use it at home and at work, free of charge, under a source-available license.
- **Runs on your machine.** The hooks, the sandbox and search run as local processes next to your agent.
- **The plugin keeps your data on your machine.** Every index lives in `~/.context-mode`: one `context.db` per project.
- **Zero telemetry.** The plugin keeps all usage data on your machine. A CI test keeps its short list of network calls fixed: see [Security and privacy](#security-and-privacy).
- **Works offline after install.** Sandbox runs, file indexing and search use local SQLite and your own runtimes.
- **Small replies.** On the 36 bench rows with 10 KB or more of raw output, the plugin's median reply is 99.4% smaller than the raw output.

## Adoption: stars and npm downloads

<table><tr>
<td width="50%"><a href="https://contextmode.ai/open-source/stats?utm_source=github&utm_medium=readme&utm_content=adoption#stars"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/readme/star-history-dark.png"><img src="docs/assets/readme/star-history-light.png" alt="Line chart of cumulative GitHub stars for mksglu/context-mode since 2026-02-23. A daily job redraws it."></picture></a></td>
<td width="50%"><a href="https://contextmode.ai/open-source/stats?utm_source=github&utm_medium=readme&utm_content=adoption#daily"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/readme/npm-downloads-dark.png"><img src="docs/assets/readme/npm-downloads-light.png" alt="Four charts of npm downloads for context-mode in a 2x2 grid: per day, per ISO week, per month and per year, since the first publish on 2026-02-23. A daily job redraws them."></picture></a></td>
</tr></table>

Hover the bars on the [interactive chart](https://contextmode.ai/open-source/stats?utm_source=github&utm_medium=readme&utm_content=adoption#daily) to read each day, week, month and year. Stars come from the GitHub GraphQL API (`starredAt`); npm downloads come from `api.npmjs.org/downloads/range`. The total up to 2026-10-29 is 683K npm downloads ([stats.json](stats.json) keeps a daily copy). A daily job redraws both charts.

- **Hacker News.** "MCP server that reduces Claude Code context consumption by 98%" reached the front page with 570+ points and 107 comments on 2026-02-28 ([thread](https://news.ycombinator.com/item?id=47193064)).
- **GitHub Trending.** A bot that watches GitHub Trending logged the repo there on 14 days from 2026-04-24 to 2026-10-17 ([uibm/trending-watcher](https://github.com/uibm/trending-watcher/issues?q=%22mksglu%2Fcontext-mode%22)).

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/readme/stargazers-dark.png">
  <img src="docs/assets/readme/stargazers-light.png" alt="Companies that stargazers of mksglu/context-mode name in their GitHub profile, Microsoft, Tencent, Alibaba, ByteDance, Google and more.">
</picture>

Starred by engineers at these companies: each name is the company field of 2 or more stargazer profiles, read with the GitHub GraphQL API on 2026-11-01 ([data](docs/assets/readme/data/stargazer-companies.json)).

## Install

The plugin needs Node 24.15.0 or later (the `engines` field in [package.json](package.json)). On Windows you also need Git for Windows: the shell tools run in Git Bash, and `context-mode doctor` checks that Git Bash is there.

Open your agent and copy its own install command. Each block also has the update, check and remove steps.
Every command installs 2.0. The npm commands use `@next`, the current 2.0 release tag; a plain `npm i -g context-mode` installs 1.x. Claude Code, Codex, Gemini CLI and Qwen Code install from GitHub, and each of their commands names the `release` branch.
The `context-mode` command (doctor, setup, remove) comes with the npm package: run `npm i -g context-mode@next` once, or use `/ctx-doctor` in the agent for the check.

<details open id="install-claude-code"><summary><b>Claude Code</b></summary>

```sh
claude plugin marketplace add mksglu/context-mode#release
claude plugin install context-mode@context-mode
```
Update: `claude plugin update context-mode@context-mode`. Check: `context-mode doctor --agents claude-code`. Remove: `context-mode setup --remove --agents claude-code`.
Hooks: yes (package) · MCP: yes · Skills: yes · Guide: [docs/install/claude-code.md](docs/install/claude-code.md#install)
</details>
<details open id="install-codex"><summary><b>Codex</b></summary>

```sh
codex plugin marketplace add mksglu/context-mode@release
codex plugin add context-mode@context-mode
```
Then run `context-mode setup --agents codex` once: it marks the plugin hooks as trusted in the Codex `config.toml`, so Codex runs them.
Update: `codex plugin marketplace upgrade context-mode`. Check: `context-mode doctor --agents codex`. Remove: `context-mode setup --remove --agents codex`.
Hooks: yes (hook file) · MCP: yes · Skills: yes · Guide: [docs/install/codex.md](docs/install/codex.md#install)
</details>
<details open id="install-gemini"><summary><b>Gemini CLI</b></summary>

```sh
gemini extensions install https://github.com/mksglu/context-mode --ref release
```
Update: `gemini extensions update context-mode`. Check: `context-mode doctor --agents gemini`. Remove: `context-mode setup --remove --agents gemini`, then `gemini extensions uninstall context-mode`.
Hooks: yes (package) · MCP: yes · Skills: yes · Guide: [docs/install/gemini.md](docs/install/gemini.md#install)
</details>
<details open id="install-qwen"><summary><b>Qwen Code</b></summary>

```sh
qwen extensions install https://github.com/mksglu/context-mode:context-mode --ref release
```
Update: `qwen extensions update context-mode`. Check: `context-mode doctor --agents qwen`. Remove: `context-mode setup --remove --agents qwen`, then `qwen extensions uninstall context-mode`.
Hooks: yes (package) · MCP: yes · Skills: yes · Guide: [docs/install/qwen.md](docs/install/qwen.md#install)
</details>
<details open id="install-pi"><summary><b>Pi</b></summary>

```sh
pi install npm:context-mode@next
```
Update: `pi update --extensions`. Check: `context-mode doctor --agents pi`. Remove: `context-mode setup --remove --agents pi`.
Hooks: yes (the plugin's own event handlers) · MCP: ctx tools built into the plugin · Skills: yes · Guide: [docs/install/pi.md](docs/install/pi.md#install)
</details>
<details open id="install-opencode"><summary><b>OpenCode</b></summary>

```sh
opencode plugin add context-mode@next
```
Update: `opencode plugin update`. Check: `context-mode doctor --agents opencode`. Remove: `opencode plugin remove context-mode@next`, then `context-mode setup --remove --agents opencode`.
Hooks: yes (the plugin's own event handlers) · MCP: yes · Skills: yes · Guide: [docs/install/opencode.md](docs/install/opencode.md#install)
</details>
<details open id="install-copilot-cli"><summary><b>Copilot CLI</b></summary>

```sh
npm i -g context-mode@next
context-mode setup --agents copilot-cli
```
Update: `context-mode upgrade`. Check: `context-mode doctor --agents copilot-cli`. Remove: `context-mode setup --remove --agents copilot-cli`.
Hooks: yes (hook file) · MCP: yes · Skills: yes · Guide: [docs/install/copilot-cli.md](docs/install/copilot-cli.md#install)
</details>
<details open id="install-kiro"><summary><b>Kiro</b></summary>

```sh
npm i -g context-mode@next
context-mode setup --agents kiro
```
Update: `context-mode upgrade`. Check: `context-mode doctor --agents kiro`. Remove: `context-mode setup --remove --agents kiro`.
Hooks: yes (hook file) · MCP: yes · Skills: yes · Guide: [docs/install/kiro.md](docs/install/kiro.md#install)
</details>
<details open id="install-vscode"><summary><b>VS Code (Copilot)</b></summary>

```sh
npm i -g context-mode@next
context-mode setup --agents vscode
```
Update: `context-mode upgrade`. Check: `context-mode doctor --agents vscode`. Remove: `context-mode setup --remove --agents vscode`.
Hooks: yes (hook file) · MCP: yes · Skills: yes · Guide: [docs/install/vscode.md](docs/install/vscode.md#install)
</details>
<details open id="install-zcode"><summary><b>ZCode</b></summary>

```sh
npm i -g context-mode@next
context-mode setup --agents zcode
```
Update: `context-mode upgrade`. Check: `context-mode doctor --agents zcode`. Remove: `context-mode setup --remove --agents zcode`.
Hooks: yes (hook file) · MCP: yes · Skills: yes · Guide: [docs/install/zcode.md](docs/install/zcode.md#install)
</details>

Already installed from GitHub on `main`? Each agent page has the steps to switch to the `release` ref: see "Already installed from GitHub?" in [Claude Code](docs/install/claude-code.md#already-installed-from-github), [Codex](docs/install/codex.md#already-installed-from-github), [Gemini CLI](docs/install/gemini.md#already-installed-from-github) and [Qwen Code](docs/install/qwen.md#already-installed-from-github).

The npm route works for every agent:

```sh
npm i -g context-mode@next
context-mode setup
```

`context-mode setup` is also the repair. It shows a plan, saves your earlier config, then applies the plan; when a step ends early, it restores the saved config.
Uninstall: `context-mode setup --remove && npm rm -g context-mode`. Details: [docs/install/README.md](docs/install/README.md).

Restart the agent, then run `context-mode doctor` (or `/ctx-doctor` in the agent). Each check prints PASS or a fix command.

Every agent gets hooks, the MCP server and the plugin skills (files in `skills/`); the last line of each block above says how.
Hooks reach each agent in one of three ways: in the plugin package (Claude Code, Gemini CLI, Qwen Code), in a hook file (Codex, Copilot CLI, Kiro, VS Code, ZCode), or in a plugin inside the agent (OpenCode, Pi).
We ran the real binary of each agent with the plugin hook: Claude Code, Codex, Gemini CLI, Qwen Code, Pi, OpenCode, Copilot CLI and ZCode. Each run used a clean temp home and a local test model, on 2.0.0-next.15.
For VS Code and Kiro, the check covers the hook setup: VS Code runs the hook command with the documented payload, and kiro-cli 2.35.2 loads all 6 hook entries.
CI runs setup, doctor, a hook and an MCP handshake for all 10 agents from the packed package on Linux, macOS and Windows. Record: [docs/architecture/release/HOOKS-FIRE.md](docs/architecture/release/HOOKS-FIRE.md).

## Try it

Paste one of these prompts into your agent after the install. Each one ran once, live, in Claude Code 2.1.312, and its answer matched the source data ([evidence and rerun steps](bench/evidence/try-it-2026-11-02/README.md)). The headline numbers in [Benchmarks](#benchmarks) use the median of 5 runs. Other agents do the same job with the same tools: `ctx_execute`, `ctx_index` and `ctx_search`.
Then run `/ctx-stats` in your agent to see how much output stayed out of the context. Every agent gets this command with the plugin skills ([skills/ctx-stats](skills/ctx-stats/SKILL.md)).
```text
On https://react.dev/reference/react/useEffect, show me the example that connects to a chat server and cleans up, and list the rules for the dependency array.
```
The hook sends WebFetch to the sandbox, and the agent searches the page for the example and the rules. 601,984 B raw, 20,860 B reached the context, 96.5% saved (2026-11-02, 2.0.0-next.26, claude-haiku-5-5).
```text
Fetch https://jsonplaceholder.typicode.com/photos. Which photo has the longest title (give its id and title), and how many photos have a title that contains the word "est"?
```
The agent runs code over 5,000 JSON records in the sandbox and gets back two answers. 1,039,898 B raw, 393 B reached the context, 99.96% saved (2026-11-02, 2.0.0-next.26, claude-haiku-5-5). The answer is two short facts, so this is the best case of the four.
```text
Here is a Linux syslog sample: https://raw.githubusercontent.com/logpai/loghub/master/Linux/Linux_2k.log. How many authentication failures does it contain, and which 3 remote hosts caused the most?
```
The agent counts failures in a 1,999-line syslog in the sandbox. 216,485 B raw, 566 B reached the context, 99.7% saved (2026-11-02, 2.0.0-next.26, claude-haiku-5-5).
```text
What are the top 10 stories on the Hacker News front page right now? Give title, points and domain for each.
```
The hook sends WebFetch to the sandbox, and the agent reads ten stories from the page. 35,087 B raw, 1,501 B reached the context, 95.7% saved (2026-11-02, 2.0.0-next.26, claude-haiku-5-5). The front page changes, so the raw size changes with each run.

## Use cases

Real tool output from public projects, run through Context Mode. Bench of 2026-11-01 on 2.0.0-next.23 (commit 16a4bcc5), median of 5 runs ([bench/results/2026-11-01-darwin-arm64.json](bench/results/2026-11-01-darwin-arm64.json)); each source is in [bench/fixtures/data/SOURCE.md](bench/fixtures/data/SOURCE.md).

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
| [Fetch a 214 KB API reply](bench/f-hook-redirect/README.md#f-bash-curl-post) | curl in Bash, replaced after it runs | 219,175 B | 291 B | 99.9% |
| [Print a 187 KB git log in Bash](bench/f-hook-redirect/README.md#f-bash-dump-post) | Bash, output replaced after it runs | 191,120 B | 204 B | 99.9% |
| [Print the same git log through a host tool](bench/d-externalize/README.md#d-real-git-log) | Host tool output over the cap, indexed whole | 191,120 B | 2,842 B | 98.5% |
| [Print a 214 KB GitHub API reply through a host tool](bench/d-externalize/README.md#d-real-github-json) | Host tool output over the cap, indexed whole | 219,175 B | 4,060 B | 98.1% |
| [Read a 45 KB log file](bench/f-hook-redirect/README.md#f-read-large-file) | Read, sent to `ctx_execute` by the hook | 46,216 B | 371 B | 99.2% |
| [Read a 60 KB source file](bench/f-hook-redirect/README.md#f-read-big-source) | Read, sent to `ctx_execute` by the hook | 61,576 B | 374 B | 99.4% |
| [Debug for a full session: 8 outputs, 3 searches](bench/g-overhead/README.md#g-session-total) | All hooks and tools | 281,261 B | 3,266 B | 98.8% |

The agent gets the part it asks for. The full output stays in the local index, and `ctx_search` reads it back.
The Context7 row has 6,917 B of raw output, under the 10 KB line of the headline rule, so the headline leaves it out.

## Benchmarks

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/readme/fig-saving-dark.png">
  <img src="docs/assets/readme/fig-saving-light.png" alt="Bar chart: median output bytes saved per category for rows of 10 KB or more. Sandbox 99.5%, Batch 93.1%, Externalize 98.3%, Hook redirect 99.8%, Session total 98.8%. The table below adds Retrieval, 77.2%.">
</picture>

Rule for every headline number in this README: rows with 10 KB or more of raw output, median of 5 runs per row, measured with `ctx_bytes` against `raw_bytes`; a category is the median of its rows; 1 KB = 1,024 B.
All 36 such rows, the six categories below: the plugin keeps a median of 99.4% of output bytes out of the context. Bench on 2.0.0-next.23 (commit 16a4bcc5 and the local edits that the file records), macOS arm64, 2026-11-01.

| Category | What runs | Rows | Median saved |
|---|---|---:|---:|
| a. Sandbox | `ctx_execute` on a file or command | 19 | 99.5% |
| b. Retrieval | `ctx_search` over the local index | 3 | 77.2% |
| c. Batch | `ctx_batch`: many commands, then search | 2 | 93.1% |
| d. Externalize | Host tool output over the cap, indexed whole | 4 | 98.3% |
| f. Hook redirect | A big Read, curl or WebFetch sent to the sandbox | 7 | 99.8% |
| g. Session total | One full scripted session | 1 | 98.8% |

Search replies (category b) carry the matching text, so they save 77.2%. Category e (long sessions) is in [Longer sessions](#longer-sessions). The full file lists every row, small ones too: [bench/results/2026-11-01-darwin-arm64.md](bench/results/2026-11-01-darwin-arm64.md).
Reproduce: `cd bench && node run.mjs`. Method and every data file: [bench/README.md](bench/README.md), [bench/evidence/](bench/evidence/README.md).

### Longer sessions

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/readme/fig-oss-dark.png">
  <img src="docs/assets/readme/fig-oss-light.png" alt="A session grows, the context stays small. The PreToolUse hook sends a tool call to ctx_execute or ctx_index; the full output goes into context.db and a small reply returns. At compaction a snapshot keeps the state, and ctx_resume and ctx_search read it back.">
</picture>

Say you debug a slow test all afternoon. The agent reads files, runs the suite and fetches docs, and each result goes into the context window. When the window is full, the host compacts it, and from then on the agent sees a short summary plus your next message.

Context Mode keeps the full output of each large tool call in `context.db` on your machine and gives the agent a small reply. At compaction, a snapshot of at most 2,048 B keeps the session state. After the compaction, the agent calls `ctx_resume` to read that snapshot back and `ctx_search` to find any earlier output by keyword.

In the bench, a scripted session of 40 tool outputs and one compaction made a 442,893 B transcript, and the `ctx_resume` block that brought the agent back was 2,019 B (row [e-long-session](bench/e-continuity/README.md#e-long-session) in [the bench file](bench/results/2026-11-01-darwin-arm64.json)).
In the same bench, one large log of 666,796 B put 3,380 B into the context, and the full log stayed in the index for `ctx_search` (row [d-synth-1m](bench/d-externalize/README.md#d-synth-1m)).

### Speed

Median of 5 runs, bench of 2026-11-01. Rows per agent and per query: [bench/results/2026-11-01-darwin-arm64.md](bench/results/2026-11-01-darwin-arm64.md).

| Measure | Result |
|---|---|
| Hook time over a bare `node` start, per agent | 7.5 ms to 12.3 ms ([g-hook-kiro](bench/g-overhead/README.md#g-hook-kiro) to [g-hook-claude-code](bench/g-overhead/README.md#g-hook-claude-code)) |
| `ctx_search`, 20 queries over 8 indexed files | 1.62 ms median, 6.70 ms max ([g-search-latency](bench/g-overhead/README.md#g-search-latency)) |
| `ctx_index`, 3 real files, 625,649 B | 150 ms per MB ([g-index-per-mb](bench/g-overhead/README.md#g-index-per-mb)) |

## How it works

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/readme/fig-flow-dark.png">
  <img src="docs/assets/readme/fig-flow-light.png" alt="One tool call, step by step: the agent runs a tool, the PreToolUse hook denies a big Read and names the ctx_execute call, the MCP server runs it in the sandbox, SQLite FTS5 keeps the output, and after compaction a state block of at most 2,048 B comes back.">
</picture>

1. Your agent calls a tool: it reads a file, runs a command or fetches a page.
2. A hook sees the call first. It sends a big read or fetch to the sandbox and gives the agent the exact call to use.
3. The sandbox runs the work on your machine and keeps the full output in a local SQLite index.
4. The agent gets the part it asked for, and calls `ctx_search` when it wants more.
5. After a compaction, the agent gets a short state block; each line points to the full record.

Timeouts, chunk sizes, ranking and storage: [Engineering details](docs/how-it-works.md#engineering-details).

## Tools

| Tool | What it does |
|---|---|
| `ctx_execute` | Runs code or a shell command in a sandbox; returns what it prints |
| `ctx_batch` | Runs many commands, indexes the output, and searches it in one call |
| `ctx_index` | Indexes a file, a text or a URL into the project database |
| `ctx_search` | Searches the local index; returns the matching parts |
| `ctx_resume` | Returns the plugin's local state block (at most 2,048 B), or one full row by `seq` |
| `ctx_stats` | Shows how much output stayed out of context |
| `ctx_doctor` | Checks the install; each check prints PASS or a fix command |
| `ctx_upgrade` | Installs, upgrades or uninstalls; replaces old context-mode entries |
| `ctx_purge` | Deletes indexed data by session, source or project |

Full reference: [docs/tools.md](docs/tools.md).

Commands in the agent: `/ctx-stats` shows the `ctx_stats` result, `/ctx-doctor` runs `ctx_doctor` (send its report with a defect report), and `/ctx-upgrade` runs `ctx_upgrade`, then `ctx_doctor`.

## Security and privacy

- The plugin keeps all its data on your machine, in `~/.context-mode`: one `context.db` per project. `ctx_purge` deletes it by session, source or project.
- The plugin has zero telemetry: usage data, events and crash reports stay on your machine. It uses the network at these call sites, each one started by you or your agent:
  - `ctx_index` of a URL the agent asks for: `src/core/sandbox/fetch.ts`. It blocks private and link-local addresses, checks each address the host name points to, connects to the address it checked, and checks again at each redirect.
  - `context-mode doctor`: `git ls-remote` to the release repository, to check for a new version (`src/core/ops/doctor-env.ts`).
  - `ctx_upgrade`: `git clone --depth 1` of the release branch (`src/core/ops/release-fetch.ts`). `context-mode upgrade`: `npm i -g context-mode@next` (`src/cli/commands.ts`).
  - The debug report: `gh issue create`, after you press a key (`src/cli/commands.ts`).
  - Install and update: your agent's own install command, npm or git.
- The guard test D-PRIVACY-NET-1 in `tests/0008-enforcement.test.mjs` scans `src` for HTTP clients, sockets, DNS lookups, git network calls and `gh` or `npm` spawns. It fails when a new call site appears outside this list, so this section stays true.
- Doctor and the debug report remove secrets by their structure before they print.

Here "sandbox" means the output stays in the sandbox, out of the context. Code from `ctx_execute` runs on your host as your user, with your environment (minus the preload variables), your files and your network; keep your agent's own permission prompts on.

## Context Mode Gateway

The plugin works on tool output, on your machine, and it is complete on its own. Context Mode Gateway is an optional hosted service that works on every request, across all your agents. Its 11 features, the full list: Context Saving, Recall, Memory, Skills, Search, Session resume, Active Context, Instructions, Protect, Prompt caching, Live and Analytics.
Teams add it for long sessions, shared memory and cost reports. The two work together.
Gateway Recall, Search and Session resume run on the Gateway server, across sessions and agents. The plugin's `ctx_search` and `ctx_resume` read the local `context.db` of one project.
With the Gateway on, your requests pass through its server; the plugin keeps its own data on your machine.

<a href="docs/assets/readme/gateway/live.mp4"><img src="docs/assets/readme/gateway/live.webp" width="100%" alt="Gateway Live screen during a session: money saved, bytes kept out per request, history kept and sent, and a feed of each request with its cost and saving"></a>

**Live.** One session as it runs: money saved this session, bytes kept out per request, history kept and sent, and a feed of each request with its cost and saving. [Full video](docs/assets/readme/gateway/live.mp4)

Docs: [How saving works](https://contextmode.ai/docs/how-saving-works?utm_source=github&utm_medium=readme&utm_content=live), [Recall](https://contextmode.ai/docs/recall?utm_source=github&utm_medium=readme&utm_content=live), [Session resume](https://contextmode.ai/docs/session-resume?utm_source=github&utm_medium=readme&utm_content=live)

<table>
<tr><td width="50%"><a href="docs/assets/readme/gateway/overview.webp"><img src="docs/assets/readme/gateway/overview-1200.webp" alt="Gateway Overview: money saved, AI spend, prompt-cache discount and cost per request over 30 days"></a><br><b>Overview.</b> What you paid and what the Gateway saved, per day, in one view.<br>Docs: <a href="https://contextmode.ai/docs/how-saving-works?utm_source=github&utm_medium=readme&utm_content=overview">How saving works</a></td><td width="50%"><a href="docs/assets/readme/gateway/analytics.webp"><img src="docs/assets/readme/gateway/analytics-1200.webp" alt="Gateway Analytics: saved money over time, split by source"></a><br><b>Analytics.</b> Where each saving comes from: hidden tools, archived old results, large outputs kept in the archive and trimmed context.<br>Docs: <a href="https://contextmode.ai/docs/how-saving-works?utm_source=github&utm_medium=readme&utm_content=analytics">How saving works</a>, <a href="https://contextmode.ai/docs/active-context?utm_source=github&utm_medium=readme&utm_content=analytics">Active Context</a></td></tr>
<tr><td width="50%"><a href="docs/assets/readme/gateway/spend.webp"><img src="docs/assets/readme/gateway/spend-1200.webp" alt="Gateway Spend: spend per day by model, cost per request and cache hit rate"></a><br><b>Spend.</b> Spend per day and per model, cost per request and the cache hit rate, to help you plan a budget.<br>Docs: <a href="https://contextmode.ai/docs/prompt-caching?utm_source=github&utm_medium=readme&utm_content=spend">Prompt caching</a></td><td width="50%"><a href="docs/assets/readme/gateway/memory.webp"><img src="docs/assets/readme/gateway/memory-top-1200.webp" alt="Gateway Memory: money saved by Recall and searches per day"></a><br><b>Memory.</b> Facts and decisions carry across sessions and agents. The screen shows what Recall saved and how many searches found an answer.<br>Docs: <a href="https://contextmode.ai/docs/memory?utm_source=github&utm_medium=readme&utm_content=memory">Memory</a>, <a href="https://contextmode.ai/docs/recall?utm_source=github&utm_medium=readme&utm_content=memory">Recall</a></td></tr>
<tr><td width="50%"><a href="docs/assets/readme/gateway/skills.webp"><img src="docs/assets/readme/gateway/skills-1200.webp" alt="Gateway Skills: import from GitHub and the list of installed skills"></a><br><b>Skills.</b> Add a skill once and all your clients use it when it helps. Import skills from GitHub and see the installed ones.<br>Docs: <a href="https://contextmode.ai/docs/skills?utm_source=github&utm_medium=readme&utm_content=skills">Skills</a></td><td width="50%"><a href="docs/assets/readme/gateway/protect.webp"><img src="docs/assets/readme/gateway/protect-1200.webp" alt="Gateway Protect: a new command rule that blocks terraform destroy"></a><br><b>Protect.</b> Rules that check each shell command before it runs. Here, a rule that stops <code>terraform destroy</code>.<br>Docs: <a href="https://contextmode.ai/docs/protect?utm_source=github&utm_medium=readme&utm_content=protect">Protect</a></td></tr>
</table>

Numbers in these screens come from the author's own account over 30 days (Oct 3 - Nov 1, 2026), so read them as one account's usage. Click an image for the full size.

Three prompts to try with the Gateway on. The line under each one names the feature it shows.
```text
Move this project from Jest to Vitest. Convert every test file, fix the config, run the suite after each batch, and tell me what is left.
```
Memory keeps the plan and the file list across a long job.
```text
Pick up where we stopped yesterday on the Jest to Vitest move. What is done, what is left, and which test was failing?
```
Recall brings back yesterday's work in a fresh session.
```text
Which date library did we choose on Tuesday, and why did we reject the other two?
```
Search finds the answer in past sessions.

<details>
<summary>Gateway features, from contextmode.ai/docs</summary>

Source: [contextmode.ai/docs](https://contextmode.ai/docs/how-saving-works?utm_source=github&utm_medium=readme&utm_content=features):

| Feature | What it does | What you get | Details |
|---|---|---|---|
| Context Saving | Folds old tool output, runs data work as code (Thinking in Code), trims tool schemas, places cache marks | A tool output over 2,048 B becomes a short pointer, with the full copy archived | Saves the most on sessions with many tool calls ([How saving works](https://contextmode.ai/docs/how-saving-works?utm_source=github&utm_medium=readme&utm_content=table)) |
| Recall | The model sees recent work and an index of older work; the agent searches the archive for the rest | Gateway, Claude Code, Opus 5.5, 200K window, 2026-10-04: mean cost per session $4.8627 to $3.0353 (-37.6% in dollars, [ab.json](https://contextmode.ai/benchmarks/recall/200k-r2/ab.json?utm_source=github&utm_medium=readme&utm_content=table)) | Cost measured in Claude Code on Claude Opus 5.5 |
| Memory | Each fact keeps two times: when it was true and when the Gateway learned it | Claude Code and Codex on one account share one store, tested end to end | The memory block goes into the first request of a new session |
| Skills | A skill catalog on the Gateway for your account; it loads the skill that matches your message | The matching skill loads on the message that needs it | Import skills from GitHub; a loaded skill joins the prompt in full |
| Search | Searches the prompts, commands and tool output that passed through, in the console and as an agent tool | Find any past prompt, command or tool output, from the console or your agent | The console searches the first 4,000 characters of each tool result ([Search](https://contextmode.ai/docs/search?utm_source=github&utm_medium=readme&utm_content=table)) |
| Session resume | One command rebuilds a conversation as a native Claude Code or Codex session | Continue a conversation in Claude Code or Codex | Restores the text, tool names and a summary; the command is valid for 15 minutes ([Session resume](https://contextmode.ai/docs/session-resume?utm_source=github&utm_medium=readme&utm_content=table)) |
| Active Context | Sets how much a thread carries before its oldest parts move to the archive: 200K, 500K or 1M tokens | Pick the window size per thread | An image older than the kept part becomes a short text note ([Active Context](https://contextmode.ai/docs/active-context?utm_source=github&utm_medium=readme&utm_content=table)) |
| Instructions | One text of at most 4,096 characters that tells every agent how to answer you | Read from the provider cache after the first request | Sets how the agent writes to you ([Instructions](https://contextmode.ai/docs/instructions?utm_source=github&utm_medium=readme&utm_content=table)) |
| Protect | A tool-call firewall: checks shell commands, file reads and writes, web fetches and tool-server calls by what they do | Each call checked before it runs | Reads the call itself, so keep your agent's sandbox on for script files and paths built at run time; opt-in |
| Prompt caching | Keeps requests cache-friendly: cache marks on the fixed part of the prompt and a cache for fetched pages | Inside the measured costs above | Uses up to 4 cache marks, the provider's maximum ([Prompt caching](https://contextmode.ai/docs/prompt-caching?utm_source=github&utm_medium=readme&utm_content=table)) |
| Live and Analytics | Shows each request and what the Gateway saved, as it happens and over time | See each request and its saving, live and over time | Covers every request that passes through the Gateway |

</details>

Gateway cost against Claude Code alone, Claude Opus 5.5, mean dollars per session at list price:

- Six short tasks (2026-09-29): 24.5% fewer dollars pooled over 176 sessions (21% to 29% per task). [v3-opus55-short.json](https://contextmode.ai/benchmarks/data/v3-opus55-short.json?utm_source=github&utm_medium=readme&utm_content=bench)
- Long Claude Code session, 200K window (2026-10-03/04): mean cost per session $4.8627 to $3.0353 (-37.6% in dollars, mean of 3 pairs). [ab.json](https://contextmode.ai/benchmarks/recall/200k-r2/ab.json?utm_source=github&utm_medium=readme&utm_content=bench)
- We fixed the rules before each run: [contextmode.ai/docs/benchmarks](https://contextmode.ai/docs/benchmarks?utm_source=github&utm_medium=readme&utm_content=bench).

Apps: Claude Code, Claude Desktop, Codex, Codex Desktop, T3 Code, OpenCode and Pi.
Setup is one command, `npx @context-mode/cli`. It signs you in and writes one config change per agent (the Gateway CLI needs Node 20.12 or later, from its npm `engines` field; the plugin needs Node 24.15.0).
The Gateway routes to Anthropic and OpenAI. The Gateway sends your requests to its server on the way to the model. It keeps a searchable record of your sessions for Recall and Search, and masks secrets and e-mail addresses when it reads archived output back. Its privacy page is at [contextmode.ai/privacy](https://contextmode.ai/privacy?utm_source=github&utm_medium=readme&utm_content=privacy).
Keep your agent's own sandbox on next to Protect. More at [contextmode.ai](https://contextmode.ai/?utm_source=github&utm_medium=readme&utm_content=more).

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
