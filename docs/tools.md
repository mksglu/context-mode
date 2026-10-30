# Tools reference

Context Mode v2 has nine MCP tools, in this fixed order (`TOOL_ORDER`, `src/core/contracts/constants.ts`).
Each tool rejects an unknown input field with `UNKNOWN_FIELD`.

| Tool | Inputs | What it does | Source |
|---|---|---|---|
| `ctx_execute` | `language`, `code`, `file?`, `intent?`, `timeoutMs?`, `background?`, `summary?` | Runs code or a shell command in a sandbox; returns only what it prints, up to `OUTPUT_CAP` (16,384 B). Default and max timeout: `EXEC_TIMEOUT_MS` (600,000 ms) | `src/core/tools/execute.ts` |
| `ctx_batch` | `commands[]`, `queries[]` | Runs the commands, indexes the output, and searches it in one call | `src/core/tools/batch.ts` |
| `ctx_index` | `path?`, `content?`, `url?`, `source?` | Indexes a file, a folder, a text or a URL into the project database | `src/core/tools/index.ts` |
| `ctx_search` | `queries[]`, `scope?` (`session`, `worktree`, `project`; default `worktree`), `source?`, `offset?`, `sort?` (`relevance`, `timeline`), `after?` | Searches the index; returns the matching parts only, `SEARCH_REPLY_HITS` (5) per reply; a `More:` line pages on with `offset` | `src/core/tools/search.ts` |
| `ctx_resume` | `session?`, `seq?` | Returns the state block (at most `RESUME_CAP`, 2,048 B), or one full row by `seq` | `src/core/tools/resume.ts` |
| `ctx_stats` | none | Shows how much output stayed out of context, per session, project and all time | `src/core/tools/stats.ts` |
| `ctx_doctor` | none | Checks the install (D1–D11, D11 is the shell); each FAIL row names its fix. A report over `REPORT_CAP` (4,096 B) is stored whole under the source `ctx_doctor:report`; the reply shows the FAIL rows and a `ctx_search` pointer. Read-only | `src/core/tools/doctor.ts` |
| `ctx_upgrade` | `mode?` (`upgrade`, `uninstall`), `confirmDelete?` | Installs, upgrades or uninstalls; replaces old context-mode entries | `src/core/tools/upgrade.ts` |
| `ctx_purge` | `session?`, `source?`, `project?` | Deletes indexed data by session, source or project | `src/core/tools/purge.ts` |

See [how-it-works.md](how-it-works.md) and [algorithms.md](algorithms.md) for how the tools work.
