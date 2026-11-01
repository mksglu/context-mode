# context-mode benchmark tables (2026-11-01-darwin-arm64)

Hardware Apple M1 Pro (10 cores, 32 GB), Darwin 23.5.0. Node v26.8.1. context-mode 2.0.0-next.23+dev at 16a4bcc5, built bundle, default settings, claude-code adapter unless a row names another. Median of 5 runs, ranges as [min-max]. Tokens are bytes / 4, an estimate. Date 2026-11-01. Reproduce: `cd bench && node run.mjs --runs 5`.

## A. Tool output processed in the sandbox (ctx_execute with `file`)

The agent runs a small script over the output; only the script's printed summary enters the context. Compared with the raw output entering the context (native) and with what the PostToolUse hook leaves of the same raw output. The summary script is the v1 benchmark script, so the summary shows what that script prints, not the answer to your question.

| Scenario | Raw KB | v1 saved | v2 ctx_execute KB | v2 saved | v2 hook KB | hook saved | exec ms |
|---|---:|---:|---:|---:|---:|---:|---:|
| [React useEffect docs](../a-sandbox/README.md#a-context7-react-docs) | 5.9 | 96% | 0.3 | 96% | 0.2 | 96% | 54 [52-56] |
| [Next.js App Router docs](../a-sandbox/README.md#a-context7-nextjs-docs) | 6.5 | 96% | 0.2 | 96% | 0.2 | 97% | 55 [54-57] |
| [Tailwind CSS docs](../a-sandbox/README.md#a-context7-tailwind-docs) | 4.0 | 95% | 0.2 | 95% | 0.2 | 95% | 53 [52-55] |
| [Page snapshot (HN)](../a-sandbox/README.md#a-playwright-snapshot) | 56.2 | 99% | 0.3 | 99% | 0.2 | 100% | 56 [53-78] |
| [Network requests](../a-sandbox/README.md#a-playwright-network) | 0.4 | 13% | 0.3 | 13% | 0.4 | 0% | 54 [51-75] |
| [PR list (Next.js)](../a-sandbox/README.md#a-github-prs) | 6.4 | 89% | 0.7 | 89% | 0.1 | 98% | 54 [52-54] |
| [Issues (React)](../a-sandbox/README.md#a-github-issues) | 58.9 | 98% | 1.1 | 98% | 0.1 | 100% | 57 [53-64] |
| [Test output (30 suites)](../a-sandbox/README.md#a-test-output) | 6.0 | 95% | 0.3 | 95% | 0.2 | 97% | 55 [51-85] |
| [TypeScript errors (50)](../a-sandbox/README.md#a-tsc-errors) | 4.9 | 93% | 0.3 | 93% | 0.1 | 97% | 54 [53-56] |
| [Build output (100+ lines)](../a-sandbox/README.md#a-build-output) | 6.4 | 94% | 0.4 | 94% | 0.2 | 97% | 54 [51-55] |
| [MCP tools (40 tools)](../a-sandbox/README.md#a-mcp-tools) | 17.0 | 96% | 0.7 | 96% | 0.2 | 99% | 54 [51-56] |
| [Access log (500 req)](../a-sandbox/README.md#a-access) | 45.1 | 100% | 0.2 | 100% | 0.1 | 100% | 56 [52-59] |
| [Git log (150+ commits)](../a-sandbox/README.md#a-git-log) | 11.6 | 99% | 0.1 | 99% | 0.1 | 99% | 55 [52-57] |
| [Analytics CSV (500 rows)](../a-sandbox/README.md#a-analytics) | 85.5 | 100% | 0.2 | 100% | 0.1 | 100% | 44 [40-91] |
| [Large JSON payload (Next.js issues, 30 items)](../a-sandbox/README.md#a-github-api-issues-large) | 214.0 | n/a | 0.8 | 100% | 0.2 | 100% | 56 [52-80] |
| [npm install log (--loglevel http)](../a-sandbox/README.md#a-npm-install-log) | 36.9 | n/a | 0.4 | 99% | 0.2 | 99% | 54 [51-55] |
| [Big source file (constants.ts, 61 KB)](../a-sandbox/README.md#a-source-big) | 60.1 | n/a | 0.5 | 99% | 0.2 | 100% | 53 [51-57] |
| [Git log (2000 commits)](../a-sandbox/README.md#a-git-log-large) | 186.6 | n/a | 0.1 | 100% | 0.2 | 100% | 57 [56-58] |
| [Browser snapshot (take_snapshot, Wikipedia SQLite page)](../a-sandbox/README.md#a-devtools-mcp-snapshot) | 133.3 | n/a | 0.5 | 100% | 0.2 | 100% | 56 [55-57] |
| [GitHub issues (gh issue list --json, vitejs/vite, 40 items)](../a-sandbox/README.md#a-gh-issue-list-vite) | 178.7 | n/a | 0.8 | 100% | 0.1 | 100% | 57 [52-61] |
| [GitHub pull requests with checks (gh pr list --json, vitejs/vite, 25 items)](../a-sandbox/README.md#a-gh-pr-list-vite) | 190.9 | n/a | 0.8 | 100% | 0.1 | 100% | 54 [51-70] |
| [Library docs (query-docs, vite build and proxy config)](../a-sandbox/README.md#a-context7-query-docs-vite) | 6.8 | n/a | 0.5 | 93% | 0.2 | 97% | 53 [50-55] |
| [Test run, 1106 tests, 25 failing (vitest run --reporter=verbose, vitejs/vite)](../a-sandbox/README.md#a-vitest-run-vite) | 61.4 | n/a | 0.4 | 99% | 0.2 | 100% | 54 [51-70] |
| [Lint report as JSON (biome lint --reporter=json, packages/vite/src)](../a-sandbox/README.md#a-biome-lint-vite) | 281.8 | n/a | 0.6 | 100% | 0.1 | 100% | 53 [53-57] |
| [Workspace install log (pnpm install --frozen-lockfile, vitejs/vite)](../a-sandbox/README.md#a-pnpm-install-vite) | 14.6 | n/a | 0.2 | 99% | 0.2 | 99% | 51 [50-57] |
| [Container logs (docker logs, mongo:8.0 --verbose)](../a-sandbox/README.md#a-docker-logs-mongo) | 59.0 | n/a | 0.6 | 99% | 0.1 | 100% | 53 [51-57] |
| [Plan output (terraform plan, 72 resources)](../a-sandbox/README.md#a-terraform-plan) | 33.3 | n/a | 0.2 | 100% | 0.2 | 99% | 55 [53-63] |
| [Commit history with file stats (git log --stat, 300 commits, vitejs/vite)](../a-sandbox/README.md#a-git-log-stat-vite) | 160.5 | n/a | 0.3 | 100% | 0.2 | 100% | 56 [53-61] |

Footnote: Hardware Apple M1 Pro (10 cores, 32 GB), Darwin 23.5.0. Node v26.8.1. context-mode 2.0.0-next.23+dev at 16a4bcc5, built bundle, default settings, claude-code adapter unless a row names another. Median of 5 runs, ranges as [min-max]. Tokens are bytes / 4, an estimate. Date 2026-11-01. Reproduce: `cd bench && node run.mjs --runs 5`.

## B. Knowledge retrieval (ctx_index + ctx_search)

The document goes into the FTS5 store; the agent asks fixed queries and gets the best chunks back. Native = the whole document entering the context. ctx_fetch_and_index is not run: it needs the network and the suite is offline. The same index path serves it (the page body is indexed the same way).

| Scenario | Raw KB | v1 saved | v2 search reply KB | v2 saved | Queries hit | Code blocks whole | Answer string in hits | index+search ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| [Supabase Edge Functions (5 examples)](../b-retrieval/README.md#b-supabase-edge-functions-5-examples) | 3.9 | 44% | 3.5 | 10% | 3/3 | 2/5 | n/a | 19 [19-21] |
| [React useEffect docs](../b-retrieval/README.md#b-react-useeffect-docs) | 5.9 | 75% | 3.3 | 45% | 3/3 | 3/5 | n/a | 21 [20-23] |
| [Next.js App Router docs](../b-retrieval/README.md#b-next-js-app-router-docs) | 6.5 | 50% | 4.4 | 32% | 3/3 | 6/9 | n/a | 19 [19-21] |
| [Tailwind CSS docs](../b-retrieval/README.md#b-tailwind-css-docs) | 4.0 | 85% | 1.4 | 65% | 2/2 | 2/6 | n/a | 19 [18-21] |
| [Skill: context-mode (main prompt)](../b-retrieval/README.md#b-skill-context-mode-main-prompt) | 16.3 | 100% | 4.4 | 73% | 3/3 | 1/8 | n/a | 23 [21-24] |
| [Skill references (4 files combined)](../b-retrieval/README.md#b-skill-references-4-files-combined) | 35.2 | 93% | 10.7 | 70% | 3/3 | 9/37 | n/a | 25 [24-26] |
| [MCP tools/list (40 tools)](../b-retrieval/README.md#b-mcp-tools-list-40-tools) | 2.5 | 60% | 1.1 | 54% | 3/3 | 0/0 | n/a | 18 [17-19] |
| [HTML docs page (sqlite.org FTS5, 215 KB)](../b-retrieval/README.md#b-html-docs-page-sqlite-org-fts5-215-kb) | 210.3 | n/a | 15.0 | 93% | 3/3 | 0/0 | 3/3 | 103 [101-109] |

Footnote: Hardware Apple M1 Pro (10 cores, 32 GB), Darwin 23.5.0. Node v26.8.1. context-mode 2.0.0-next.23+dev at 16a4bcc5, built bundle, default settings, claude-code adapter unless a row names another. Median of 5 runs, ranges as [min-max]. Tokens are bytes / 4, an estimate. Date 2026-11-01. Reproduce: `cd bench && node run.mjs --runs 5`.

## C. Batch (ctx_batch_execute equivalent: ctx_batch)

Native = the sum of the raw outputs of the same commands run as separate Bash calls. The last row has tiny outputs on purpose: the batch reply header is a fixed cost and there is nothing to save.

| Scenario | Separate raw calls KB | ctx_batch reply KB | Saved | Query sections | ms |
|---|---:|---:|---:|---:|---:|
| [Triage: tests, tsc, build, nginx log, git log (5 commands, 5 queries)](../c-batch/README.md#c-triage) | 74.1 | 6.1 | 92% | 5 | 48 [45-52] |
| [Install log and big git log (2 commands, 3 queries)](../c-batch/README.md#c-install-log) | 223.5 | 12.5 | 94% | 3 | 56 [53-60] |
| [Small outputs (3 tiny commands, 2 queries): batch has fixed overhead](../c-batch/README.md#c-small) | 0.0 | 0.1 | -326% | 2 | 56 [48-65] |

Footnote: Hardware Apple M1 Pro (10 cores, 32 GB), Darwin 23.5.0. Node v26.8.1. context-mode 2.0.0-next.23+dev at 16a4bcc5, built bundle, default settings, claude-code adapter unless a row names another. Median of 5 runs, ranges as [min-max]. Tokens are bytes / 4, an estimate. Date 2026-11-01. Reproduce: `cd bench && node run.mjs --runs 5`.

## D. Large output externalization (>100 KB kept whole in FTS5)

The script prints everything; the agent gets a capped reply with a pointer, and the full output is searchable. 'Found' counts the first, middle and last line markers returned by ctx_search. For the real files the markers are the first, middle and last line of the file.

| Scenario | Full output KB | Reply to the agent KB | Saved | Markers found | One search reply KB | exec ms | search ms |
|---|---:|---:|---:|---:|---:|---:|---:|
| [Synthetic log, about 120 KB (seeded)](../d-externalize/README.md#d-synth-120k) | 78.1 | 2.3 | 97% | 3/3 | 0.8 | 56 [54-58] | 2 [2-3] |
| [Synthetic log, about 1 MB (seeded)](../d-externalize/README.md#d-synth-1m) | 651.2 | 3.3 | 99% | 3/3 | 0.8 | 105 [98-122] | 2 [2-3] |
| [Real GitHub API payload printed whole (219 KB)](../d-externalize/README.md#d-real-github-json) | 214.0 | 4.0 | 98% | 3/3 | 4.5 | 73 [71-76] | 5 [4-7] |
| [Real git log printed whole (191 KB)](../d-externalize/README.md#d-real-git-log) | 186.6 | 2.8 | 99% | 3/3 | 4.4 | 75 [74-79] | 7 [6-8] |

Footnote: Hardware Apple M1 Pro (10 cores, 32 GB), Darwin 23.5.0. Node v26.8.1. context-mode 2.0.0-next.23+dev at 16a4bcc5, built bundle, default settings, claude-code adapter unless a row names another. Median of 5 runs, ranges as [min-max]. Tokens are bytes / 4, an estimate. Date 2026-11-01. Reproduce: `cd bench && node run.mjs --runs 5`. Synthetic inputs (seeded, no real capture): d-synth-120k, d-synth-1m.

## E. Session continuity (compaction and resume)

Native = the raw tool outputs that a transcript replay would carry. context-mode = the SessionStart(compact) state block, ctx_resume, and the UserPromptSubmit recall block. 'Recall found' means the recall block for a prompt holds a line that answers it. This measures bytes and presence of the answer, not whether a model keeps working well after compaction.

| Scenario | Events | Transcript replay KB | PostToolUse hooks left KB | SessionStart(compact) block KB | ctx_resume KB | Resume saved | Recall block KB | Recall found | resume ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| [Debugging session: 6 real outputs, then compaction](../e-continuity/README.md#e-debug-session) | 6 | 133.0 | 1.7 | 0.2 | 0.5 | 100% | 0.5 | yes | 8 [8-9] |
| [Long session: 40 synthetic outputs (seeded), then compaction](../e-continuity/README.md#e-long-session) | 40 | 432.5 | 11.5 | 0.2 | 2.0 | 100% | 2.1 | yes | 11 [11-12] |

Footnote: Hardware Apple M1 Pro (10 cores, 32 GB), Darwin 23.5.0. Node v26.8.1. context-mode 2.0.0-next.23+dev at 16a4bcc5, built bundle, default settings, claude-code adapter unless a row names another. Median of 5 runs, ranges as [min-max]. Tokens are bytes / 4, an estimate. Date 2026-11-01. Reproduce: `cd bench && node run.mjs --runs 5`. Synthetic inputs (seeded, no real capture): e-long-session.

## F. Hook redirect (flooding calls denied or replaced)

Hooks run as the claude-code adapter. For WebFetch the body size is the size of the captured page the URL serves (the fixture); the real network is not used. The deny text is all the model gets; the follow-up call in the sandbox costs what group A or B shows for the same input.

| Scenario | Would have entered KB | Entered KB | Saved | Hook acted | hook ms |
|---|---:|---:|---:|---:|---:|
| [Read of a 46 KB log (denied, routed to ctx_execute)](../f-hook-redirect/README.md#f-read-large-file) | 45.1 | 0.4 | 99% | yes | 35 [33-37] |
| [Read of a 61 KB source file (denied, routed to ctx_execute)](../f-hook-redirect/README.md#f-read-big-source) | 60.1 | 0.4 | 99% | yes | 35 [34-41] |
| [Read of a small file (allowed: nothing to save)](../f-hook-redirect/README.md#f-read-small-file) | 1.7 | 1.7 | 0% | no | 35 [34-38] |
| [WebFetch of a docs page (denied, routed to ctx_index + ctx_search)](../f-hook-redirect/README.md#f-webfetch) | 210.3 | 0.4 | 100% | yes | 35 [34-37] |
| [Bash dump of a 191 KB git log (PostToolUse replace)](../f-hook-redirect/README.md#f-bash-dump-post) | 186.6 | 0.2 | 100% | yes | 93 [91-94] |
| [Bash curl of a 219 KB API payload (allowed before, replaced after)](../f-hook-redirect/README.md#f-bash-curl-post) | 214.0 | 0.3 | 100% | yes | 100 [97-107] |
| [Read of the 89 KB vite config source (denied, routed to ctx_execute)](../f-hook-redirect/README.md#f-read-vite-config) | 89.2 | 0.4 | 100% | yes | 35 [33-38] |
| [WebFetch of the 265 KB Vite features guide (denied, routed to ctx_index + ctx_search)](../f-hook-redirect/README.md#f-webfetch-vite-docs) | 265.4 | 0.4 | 100% | yes | 35 [33-36] |

Footnote: Hardware Apple M1 Pro (10 cores, 32 GB), Darwin 23.5.0. Node v26.8.1. context-mode 2.0.0-next.23+dev at 16a4bcc5, built bundle, default settings, claude-code adapter unless a row names another. Median of 5 runs, ranges as [min-max]. Tokens are bytes / 4, an estimate. Date 2026-11-01. Reproduce: `cd bench && node run.mjs --runs 5`.

## G. Overhead (hook latency, search latency, index time, full session)

Each hook row is the median of 5 hook processes inside one run, a fresh process each (no daemon), minus the median of 5 bare `node -e ""` starts. The small payload is an allowed command, so this is the fixed cost of every tool call.

| Hook (host adapter) | Hook ms | Bare node ms | Overhead ms |
|---|---:|---:|---:|
| [claude-code](../g-overhead/README.md#g-hook-claude-code) | 37.6 [34.8-38.5] | 28.8 [27.1-29.1] | 9.5 [5.7-10.6] |
| [codex](../g-overhead/README.md#g-hook-codex) | 35.3 [34.6-37.9] | 28.5 [27.4-29.6] | 7.2 [6.1-9.1] |
| [gemini](../g-overhead/README.md#g-hook-gemini) | 37.2 [36.9-38.5] | 28.5 [28.3-30.2] | 8.6 [8.3-8.7] |
| [qwen](../g-overhead/README.md#g-hook-qwen) | 34.9 [34.2-36.3] | 28.3 [28.0-28.7] | 6.3 [6.2-7.9] |
| [copilot-cli](../g-overhead/README.md#g-hook-copilot-cli) | 37.2 [36.2-37.5] | 28.1 [27.9-29.4] | 8.2 [8.0-9.3] |
| [vscode](../g-overhead/README.md#g-hook-vscode) | 35.4 [35.0-37.3] | 29.4 [27.8-29.6] | 7.3 [5.6-7.8] |
| [kiro](../g-overhead/README.md#g-hook-kiro) | 35.8 [34.3-36.8] | 28.9 [27.4-30.7] | 6.9 [4.5-7.7] |
| [zcode](../g-overhead/README.md#g-hook-zcode) | 35.0 [34.6-36.9] | 27.9 [27.2-29.1] | 7.7 [6.5-8.3] |
| [pi](../g-overhead/README.md#g-hook-pi) | 37.0 [36.1-37.9] | 27.9 [27.7-29.7] | 8.6 [8.2-9.1] |
| [opencode](../g-overhead/README.md#g-hook-opencode) | 34.9 [34.7-36.2] | 27.7 [27.4-28.1] | 7.6 [6.7-8.2] |

| Scenario | Result |
|---|---|
| [ctx_search latency (20 queries over 8 indexed fixtures)](../g-overhead/README.md#g-search-latency) | median 1.5 [1.4-1.6] ms, worst 6.0 [5.7-9.9] ms, reply 3.7 KB |
| [ctx_index time per MB (3 real files, 0.6 MB)](../g-overhead/README.md#g-index-per-mb) | 150 [143-154] ms per MB (90 [86-92] ms for 611.0 KB) |
| [Full debugging session: 8 outputs through the hooks, 3 follow-up searches](../g-overhead/README.md#g-session-total) | raw 274.7 KB, entered 3.4 KB (hooks left 1.3 + searches 2.1), saved 99%, hook time 422 [418-439] ms |

Footnote: Hardware Apple M1 Pro (10 cores, 32 GB), Darwin 23.5.0. Node v26.8.1. context-mode 2.0.0-next.23+dev at 16a4bcc5, built bundle, default settings, claude-code adapter unless a row names another. Median of 5 runs, ranges as [min-max]. Tokens are bytes / 4, an estimate. Date 2026-11-01. Reproduce: `cd bench && node run.mjs --runs 5`.

