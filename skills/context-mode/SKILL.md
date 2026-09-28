---
name: context-mode
description: |
  Process large output without spending context: run a command or read a file in a
  sandbox and return only the derived answer. Use when output would exceed a screenful —
  test runs, build logs, git history, CLI JSON, log and data files — or when a document
  must be indexed once and queried repeatedly. Native read, grep and glob own ordinary
  file work; the harness browser router owns pages.
---

# Context Mode

Large output is the cost. A 50 KB test log, a 200 KB JSON response and a 1 MB access
log each buy the same one-line answer, and only the answer needs to reach the model.
`ctx_execute` and `ctx_execute_file` run the work in a sandbox and return what you
printed. `ctx_index` and `ctx_search` keep a document server-side and hand back only
matching chunks.

## What this skill does not own

- **File work**: native `read`, `grep`, `glob` and `edit` own reading, searching and
  editing files. They are cheaper than a sandbox round trip and they are what edits
  need. Reach for `ctx_execute_file` when a file is too large to read — you want a
  count, a parse, an extraction across the whole thing — not to look at it.
- **Pages**: the harness browser router owns navigation, snapshots and interaction
  (Aside, here). context-mode names no second browser path. When a browser tool can
  write its output to a file, point it at a file and process the file.
- **Short commands**: a command with bounded output (`git status`, `pwd`, a version
  probe, a file mutation) runs directly. Wrapping it costs more than it saves.

## Which tool

| Situation | Tool |
|---|---|
| Command whose output is large or unknown | `ctx_execute(language, code)` |
| File too large to read: parse, count, extract | `ctx_execute_file(path, language, code)` — the file arrives as `FILE_CONTENT` |
| Document you will query more than once | `ctx_index(path, source)` → `ctx_search` |
| Web document you will query more than once | `ctx_fetch_and_index(url, source)` → `ctx_search` |
| Output already in context from a previous call | use it directly |
| Wipe the indexed knowledge base | `ctx_purge(confirm: true)` |

## Web content

1. A known static URL: read it with the native reader.
2. Reader fails, or the page is large enough that narrowing pays: `curl.md`.
3. A document you will query repeatedly: `ctx_fetch_and_index(url, source)`, then
   `ctx_search`. For a GitHub-hosted file, index the raw URL
   (`https://raw.githubusercontent.com/org/repo/main/CHANGELOG.md`).

## Writing sandbox code

1. **Print findings.** stdout is all that returns. No output, wasted call.
2. **Analyze, do not dump.** `console.log(JSON.stringify(data))` moves the flood one
   step downstream. Print the bug IDs, the line numbers, the counts that answer the
   question.
3. **Be specific.** "3 orders have negative quantity: 1041, 1052, 1077" beats "3 bugs".
4. **Never pass large data to `ctx_index(content: ...)`.** A parameter travels through
   context. `ctx_index(path: ...)` reads the file server-side. `content` is for small
   inline text you composed yourself.
5. **`ctx_execute_file` pre-loads the file into `FILE_CONTENT`** — a string in the
   sandbox, not in your context. Parse it there (`json.loads(FILE_CONTENT)`,
   `FILE_CONTENT.matchAll(...)`) and print only what you found.

| Work | Language |
|---|---|
| HTTP, JSON | `javascript` — native fetch, JSON.parse |
| Data analysis, CSV, stats | `python` — csv, statistics, collections, re |
| Pipes, pattern matching over files | `shell` — grep, awk, jq, find |

## Searching the index

- BM25, OR semantics: 2–4 specific technical terms per query, results matching more
  terms rank higher.
- Batch every question into one call: `ctx_search(queries: ["transform pipe",
  "refine superRefine", "coerce codec"], source: "Zod")`.
- Pass `source` whenever more than one document is indexed. Partial match works:
  `source: "Node"` finds `"Node.js v22 CHANGELOG"`.

## Large output from another tool

The pattern is the same whatever produced the data: **tool → file → server-side read →
context**. When a tool takes a `filename` or `output` parameter, use it, then
`ctx_index(path)` for repeated queries or `ctx_execute_file(path)` for a one-shot
extraction. Passing that same output back through `ctx_index(content: ...)` sends it
into context a second time.

## What the hooks do

context-mode's session hooks record tool events and token usage into a session
database, rebuild a resume snapshot before compaction, and route network calls whose
raw payload would land in context. They do not edit subagent prompts: a subagent
starts blank, so name the `ctx_` tool you want it to use in the task description.

## Anti-patterns

- `cat large-file.json` in bash → the whole file lands in context. `ctx_execute_file`.
- `npm test` in bash → the whole run lands in context. `ctx_execute`, print the failures.
- `gh pr list` unfiltered → raw JSON. `ctx_execute` with a `--jq` filter.
- `| head -20` on a large command → you lost the other 980 lines and still cannot answer.
  Capture all of it in the sandbox and print the summary.
- Narrowing `ctx_execute` output upstream of capture → `ctx_execute` captures,
  `ctx_search` filters; merging the layers drops data the index never sees. See
  `references/anti-patterns.md` §8.
- Re-indexing a response that is already in context → doubles the cost, adds nothing.
- Expecting `ctx_stats` to reset anything → it is read-only. `ctx_purge(confirm: true)`
  deletes.

## Reference files

- [JavaScript/TypeScript Patterns](./references/patterns-javascript.md)
- [Python Patterns](./references/patterns-python.md)
- [Shell Patterns](./references/patterns-shell.md)
- [Anti-Patterns & Common Mistakes](./references/anti-patterns.md)
