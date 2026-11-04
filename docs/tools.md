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
| `ctx_upgrade` | `mode?` (`upgrade`, `uninstall`), `confirmDelete?` | Installs, upgrades or uninstalls; replaces old contextmode entries | `src/core/tools/upgrade.ts` |
| `ctx_purge` | `session?`, `source?`, `project?` | Deletes indexed data by session, source or project | `src/core/tools/purge.ts` |

## ctx_execute

Thinking in Code: the agent writes a short script instead of reading the data.
The script runs in the sandbox on your machine, and only what it prints goes into the context.

A real bench run ([a-git-log-stat-vite](../bench/a-sandbox/README.md#a-git-log-stat-vite)): 300 commits of `git log --stat` are 164,385 B. The bench script ([source](../bench/a-sandbox/usecases.mjs)) prints 268 B ([results row](../bench/results/2026-11-01-darwin-arm64.json)).

A real call from the Try-it run (Claude Code 2.1.312, Context Mode 2.0.0-next.26, [04-api-json.json](../bench/evidence/try-it-2026-11-02/04-api-json.json)), as the terminal shows it. The data is 1,039,898 B; the agent gets 254 B:

```text
⏺ context-mode - ctx_execute (MCP)(language: "javascript", c…jsonplaceholder.typicode.com/photos\");
  if (!res.ok) throw new Error(\"HTTP \" + res.status);
  const photos = await res.json();
  let longest = null;
  for (const p of photos) {
    if (!longest || p.title.length > longest.title.length) longest = p;
  }
  const withEst = photos.filter(p => p.title.includes(\"est\")).length;
  const ties = photos.filter(p => p.title.length === longest.title.length).map(p => p.id);
  console.log(JSON.stringify({ total: photos.length, longest…nd count of titles containing \"est\"")
  ⎿  exit 0 · 239 B
     {
       "total": 5000,
       "longest": {
         "id": 653,
         "title": "temporibus commodi et fugit doloremque re…rit exercitationem necessitatibus aut",
         "length": 86
       },
       "longestTieIds": [
         653
       ],
       "titlesContainingEst": 892
     }
```

The hosted Gateway has its own Thinking in Code tools, apart from this plugin: [Gateway](https://contextmode.ai/docs/engine/gateway?utm_source=github&utm_medium=docs&utm_content=tools-tic).

## ctx_batch

Thinking in Code for many commands at once: the agent names the commands and the questions in one call.
The output stays in the local index, and only the parts that answer the questions come back.

A real bench run ([c-install-log](../bench/c-batch/README.md#c-install-log)): an install log and a long git log are 228,881 B. One call returns 12,797 B ([results row](../bench/results/2026-11-01-darwin-arm64.json)).

A live call with the same two files and two of those queries (Context Mode 2.0.0-next.36, 2026-11-03, [2026-11-03-ctx-batch.json](../bench/evidence/thinking-in-code/2026-11-03-ctx-batch.json)), in the form the Claude Code terminal shows it. The commands print 228,881 B; the agent gets 8,667 B:

```text
⏺ context-mode - ctx_batch (MCP)(commands: ["cat npm-install… queries: ["cache miss","feat commit"])
  ⎿  ## cache miss
     js.org/@esbuild%2fwin32-x64 282ms (cache miss)
     npm http fetch GET 200 https://registry.npmjs.org/@esbuild%2flinux-s390x 79ms (cache miss)
     npm http fetch GET 200 https://registry.npmjs.org/@esbuild%2fopenbsd-x64 101ms (cache miss)
     npm http fetch GET 200 https://registry.npmjs.org/@esbuild%2fwin32-arm64 99ms (cache miss)
     npm http fetch GET 200 https://registry.npmjs.org/@esbuild%2fdarwin-arm64 99ms (cache miss)
     … +95 lines (ctrl+o to expand)
```

See [how-it-works.md](how-it-works.md) and [algorithms.md](algorithms.md) for how the tools work.
