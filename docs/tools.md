# Tools reference

Context Mode v2 has nine MCP tools, in this fixed order (`TOOL_ORDER`, `src/core/contracts/constants.ts`).
Each tool rejects an unknown input field with `UNKNOWN_FIELD`.

| Tool | Inputs | What it does | Source |
|---|---|---|---|
| `ctx_execute` | `language`, `code`, `file?`, `intent?`, `timeoutMs?`, `background?`, `summary?` | Runs code or a shell command in a sandbox; returns only what it prints, up to `OUTPUT_CAP` (16,384 B). Default and max timeout: `EXEC_TIMEOUT_MS` (600,000 ms) | `src/core/tools/execute.ts` |
| `ctx_batch` | `commands[]`, `queries[]` | Runs the commands, indexes the output, and searches it in one call | `src/core/tools/batch.ts` |
| `ctx_index` | `path?`, `content?`, `url?`, `source?` | Indexes a file, a folder, a text or a URL into the project database. A path source is labelled relative to the project with forward slashes on every OS (`nested/notes.md`); `ctx_search` and `ctx_purge` take `source` in either slash form | `src/core/tools/index.ts` |
| `ctx_search` | `queries[]`, `scope?` (`session`, `worktree`, `project`; default `worktree`), `source?`, `offset?`, `sort?` (`relevance`, `timeline`), `after?` | Searches the index; returns the matching parts only, `SEARCH_REPLY_HITS` (5) per reply; a `More:` line pages on with `offset` | `src/core/tools/search.ts` |
| `ctx_resume` | `session?`, `seq?` | Returns the state block (at most `RESUME_CAP`, 2,048 B), or one full row by `seq` | `src/core/tools/resume.ts` |
| `ctx_stats` | none | Shows how much output stayed out of context, per session, project and all time | `src/core/tools/stats.ts` |
| `ctx_doctor` | none | Checks the install (D1–D11, D11 is the shell); each FAIL row names its fix. A report over `REPORT_CAP` (4,096 B) is stored whole under the source `ctx_doctor:report`; the reply shows the FAIL rows and a `ctx_search` pointer. Read-only | `src/core/tools/doctor.ts` |
| `ctx_upgrade` | `mode?` (`upgrade`, `uninstall`), `confirmDelete?` | Installs, upgrades or uninstalls; replaces old context-mode entries | `src/core/tools/upgrade.ts` |
| `ctx_purge` | `session?`, `source?`, `project?` | Deletes indexed data by session, source or project | `src/core/tools/purge.ts` |

## ctx_execute

Thinking in Code: the agent writes a short script instead of reading the data.
The script runs in the sandbox on your machine, and only what it prints goes into the context.

A real bench run ([a-git-log-stat-vite](../bench/a-sandbox/README.md#a-git-log-stat-vite)): 300 commits of `git log --stat` are 164,385 B. The bench script ([source](../bench/a-sandbox/usecases.mjs)) prints 268 B ([results row](../bench/results/2026-11-01-darwin-arm64.json)).

The agent calls `ctx_execute({ language: "javascript", file: "git-log-stat-vite.txt", code })` with this `code`, a short form of the bench script that prints 27 B (`commits: 300 | authors: 76`):

```js
const L = require("fs").readFileSync(process.env.CTX_FILE, "utf8").split("\n");
const authors = new Set(L.filter((l) => l.startsWith("Author: ")).map((l) => l.slice(8)));
console.log("commits:", L.filter((l) => l.startsWith("commit ")).length, "| authors:", authors.size);
```

The hosted Gateway has its own Thinking in Code tools, apart from this plugin: [Gateway](https://contextmode.ai/docs/engine/gateway?utm_source=github&utm_medium=docs&utm_content=tools-tic).

## ctx_batch

Thinking in Code for many commands at once: the agent names the commands and the questions in one call.
The output stays in the local index, and only the parts that answer the questions come back.

A real bench run ([c-install-log](../bench/c-batch/README.md#c-install-log)): an install log and a long git log are 228,881 B. One call returns 12,797 B ([results row](../bench/results/2026-11-01-darwin-arm64.json)).

```js
ctx_batch({ commands: ["cat npm-install-log.txt", "cat git-log-large.txt"], queries: ["cache miss", "feat commit"] })
```

See [how-it-works.md](how-it-works.md) and [algorithms.md](algorithms.md) for how the tools work.
