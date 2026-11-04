# context-mode benchmark tables (2026-10-31-darwin-arm64)

Hardware Apple M1 Pro (10 cores, 32 GB), Darwin 23.5.0. Node v26.8.1. context-mode 2.0.0-next.8 at da0a30e8, built bundle, default settings, claude-code adapter unless a row names another. Median of 5 runs, ranges as [min-max]. Tokens are bytes / 4, an estimate. Date 2026-10-31. Reproduce: `cd bench && node run.mjs --runs 5`.

## A. Tool output processed in the sandbox (ctx_execute with `file`)

The agent runs a small script over the output; only the script's printed summary enters the context. Compared with the raw output entering the context (native) and with what the PostToolUse hook leaves of the same raw output. The summary script is the v1 benchmark script, so the summary shows what that script prints, not the answer to your question.

| Scenario | Raw KB | v1 saved | v2 ctx_execute KB | v2 saved | v2 hook KB | hook saved | exec ms |
|---|---:|---:|---:|---:|---:|---:|---:|
| [React useEffect docs](../a-sandbox/README.md#a-context7-react-docs) | 5.9 | 96% | 0.3 | 95% | 0.2 | 96% | 58 [56-59] |
| [Next.js App Router docs](../a-sandbox/README.md#a-context7-nextjs-docs) | 6.5 | 96% | 0.3 | 96% | 0.2 | 97% | 57 [56-59] |
| [Tailwind CSS docs](../a-sandbox/README.md#a-context7-tailwind-docs) | 4.0 | 95% | 0.2 | 95% | 0.2 | 95% | 57 [57-59] |
| [Page snapshot (HN)](../a-sandbox/README.md#a-playwright-snapshot) | 56.2 | 99% | 0.3 | 99% | 0.2 | 100% | 60 [58-62] |
| [Network requests](../a-sandbox/README.md#a-playwright-network) | 0.4 | 13% | 0.4 | 9% | 0.4 | 0% | 61 [58-129] |
| [PR list (Next.js)](../a-sandbox/README.md#a-github-prs) | 6.4 | 89% | 0.7 | 89% | 0.1 | 98% | 79 [64-87] |
| [Issues (React)](../a-sandbox/README.md#a-github-issues) | 58.9 | 98% | 1.1 | 98% | 0.1 | 100% | 59 [57-61] |
| [Test output (30 suites)](../a-sandbox/README.md#a-test-output) | 6.0 | 95% | 0.3 | 94% | 0.2 | 97% | 59 [57-61] |
| [TypeScript errors (50)](../a-sandbox/README.md#a-tsc-errors) | 4.9 | 93% | 0.4 | 93% | 0.1 | 97% | 57 [56-61] |
| [Build output (100+ lines)](../a-sandbox/README.md#a-build-output) | 6.4 | 94% | 0.4 | 94% | 0.2 | 97% | 56 [55-61] |
| [MCP tools (40 tools)](../a-sandbox/README.md#a-mcp-tools) | 17.0 | 96% | 0.7 | 96% | 0.2 | 99% | 57 [55-59] |
| [Access log (500 req)](../a-sandbox/README.md#a-access) | 45.1 | 100% | 0.2 | 100% | 0.1 | 100% | 59 [57-69] |
| [Git log (150+ commits)](../a-sandbox/README.md#a-git-log) | 11.6 | 99% | 0.1 | 99% | 0.1 | 99% | 58 [55-60] |
| [Analytics CSV (500 rows)](../a-sandbox/README.md#a-analytics) | 85.5 | 100% | 0.2 | 100% | 0.1 | 100% | 47 [45-66] |
| [Large JSON payload (Next.js issues, 30 items)](../a-sandbox/README.md#a-github-api-issues-large) | 214.0 | n/a | 0.8 | 100% | 0.2 | 100% | 57 [57-61] |
| [npm install log (--loglevel http)](../a-sandbox/README.md#a-npm-install-log) | 36.9 | n/a | 0.4 | 99% | 0.2 | 99% | 58 [55-59] |
| [Big source file (constants.ts, 61 KB)](../a-sandbox/README.md#a-source-big) | 60.1 | n/a | 0.5 | 99% | 0.2 | 100% | 57 [56-73] |
| [Git log (2000 commits)](../a-sandbox/README.md#a-git-log-large) | 186.6 | n/a | 0.1 | 100% | 0.2 | 100% | 61 [58-66] |

Footnote: Hardware Apple M1 Pro (10 cores, 32 GB), Darwin 23.5.0. Node v26.8.1. context-mode 2.0.0-next.8 at da0a30e8, built bundle, default settings, claude-code adapter unless a row names another. Median of 5 runs, ranges as [min-max]. Tokens are bytes / 4, an estimate. Date 2026-10-31. Reproduce: `cd bench && node run.mjs --runs 5`.

## B. Knowledge retrieval (ctx_index + ctx_search)

The document goes into the FTS5 store; the agent asks fixed queries and gets the best chunks back. Native = the whole document entering the context. ctx_fetch_and_index is not run: it needs the network and the suite is offline. The same index path serves it (the page body is indexed the same way).

| Scenario | Raw KB | v1 saved | v2 search reply KB | v2 saved | Queries hit | Code blocks whole | Answer string in hits | index+search ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| [Supabase Edge Functions (5 examples)](../b-retrieval/README.md#b-supabase-edge-functions-5-examples) | 3.9 | 44% | 4.4 | -12% | 2/3 | 5/5 | n/a | 21 [20-23] |
| [React useEffect docs](../b-retrieval/README.md#b-react-useeffect-docs) | 5.9 | 75% | 4.7 | 20% | 2/3 | 3/5 | n/a | 22 [21-26] |
| [Next.js App Router docs](../b-retrieval/README.md#b-next-js-app-router-docs) | 6.5 | 50% | 7.0 | -8% | 2/3 | 9/9 | n/a | 22 [21-37] |
| [Tailwind CSS docs](../b-retrieval/README.md#b-tailwind-css-docs) | 4.0 | 85% | 4.3 | -7% | 2/2 | 6/6 | n/a | 20 [19-25] |
| [Skill: context-mode (main prompt)](../b-retrieval/README.md#b-skill-context-mode-main-prompt) | 16.3 | 100% | 6.2 | 62% | 3/3 | 3/8 | n/a | 23 [22-24] |
| [Skill references (4 files combined)](../b-retrieval/README.md#b-skill-references-4-files-combined) | 35.2 | 93% | 10.6 | 70% | 3/3 | 9/37 | n/a | 26 [25-28] |
| [MCP tools/list (40 tools)](../b-retrieval/README.md#b-mcp-tools-list-40-tools) | 2.5 | 60% | 1.2 | 50% | 3/3 | 0/0 | n/a | 21 [19-21] |
| [HTML docs page (sqlite.org FTS5, 215 KB)](../b-retrieval/README.md#b-html-docs-page-sqlite-org-fts5-215-kb) | 210.3 | n/a | 15.0 | 93% | 3/3 | 0/0 | 3/3 | 114 [109-118] |

Footnote: Hardware Apple M1 Pro (10 cores, 32 GB), Darwin 23.5.0. Node v26.8.1. context-mode 2.0.0-next.8 at da0a30e8, built bundle, default settings, claude-code adapter unless a row names another. Median of 5 runs, ranges as [min-max]. Tokens are bytes / 4, an estimate. Date 2026-10-31. Reproduce: `cd bench && node run.mjs --runs 5`.

## C. Batch (ctx_batch_execute equivalent: ctx_batch)

Native = the sum of the raw outputs of the same commands run as separate Bash calls. The last row has tiny outputs on purpose: the batch reply header is a fixed cost and there is nothing to save.

| Scenario | Separate raw calls KB | ctx_batch reply KB | Saved | Query sections | ms |
|---|---:|---:|---:|---:|---:|
| [Triage: tests, tsc, build, nginx log, git log (5 commands, 5 queries)](../c-batch/README.md#c-triage) | 74.1 | 6.1 | 92% | 5 | 51 [48-53] |
| [Install log and big git log (2 commands, 3 queries)](../c-batch/README.md#c-install-log) | 223.5 | 12.5 | 94% | 3 | 58 [57-62] |
| [Small outputs (3 tiny commands, 2 queries): batch has fixed overhead](../c-batch/README.md#c-small) | 0.0 | 0.1 | -574% | 2 | 56 [52-59] |

Footnote: Hardware Apple M1 Pro (10 cores, 32 GB), Darwin 23.5.0. Node v26.8.1. context-mode 2.0.0-next.8 at da0a30e8, built bundle, default settings, claude-code adapter unless a row names another. Median of 5 runs, ranges as [min-max]. Tokens are bytes / 4, an estimate. Date 2026-10-31. Reproduce: `cd bench && node run.mjs --runs 5`.

## D. Large output externalization (>100 KB kept whole in FTS5)

The script prints everything; the agent gets a capped reply with a pointer, and the full output is searchable. 'Found' counts the first, middle and last line markers returned by ctx_search. For the real files the markers are the first, middle and last line of the file.

| Scenario | Full output KB | Reply to the agent KB | Saved | Markers found | One search reply KB | exec ms | search ms |
|---|---:|---:|---:|---:|---:|---:|---:|
| [Synthetic log, about 120 KB (seeded)](../d-externalize/README.md#d-synth-120k) | 78.1 | 14.3 | 82% | 3/3 | 0.8 | 59 [57-71] | 2 [2-4] |
| [Synthetic log, about 1 MB (seeded)](../d-externalize/README.md#d-synth-1m) | 651.2 | 15.3 | 98% | 3/3 | 0.8 | 106 [104-112] | 3 [3-4] |
| [Real GitHub API payload printed whole (219 KB)](../d-externalize/README.md#d-real-github-json) | 214.0 | 16.0 | 93% | 3/3 | 4.5 | 82 [78-83] | 5 [5-5] |
| [Real git log printed whole (191 KB)](../d-externalize/README.md#d-real-git-log) | 186.6 | 14.8 | 92% | 3/3 | 4.4 | 85 [81-97] | 8 [8-9] |

Footnote: Hardware Apple M1 Pro (10 cores, 32 GB), Darwin 23.5.0. Node v26.8.1. context-mode 2.0.0-next.8 at da0a30e8, built bundle, default settings, claude-code adapter unless a row names another. Median of 5 runs, ranges as [min-max]. Tokens are bytes / 4, an estimate. Date 2026-10-31. Reproduce: `cd bench && node run.mjs --runs 5`. Synthetic inputs (seeded, no real capture): d-synth-120k, d-synth-1m.

## E. Session continuity (compaction and resume)

Native = the raw tool outputs that a transcript replay would carry. context-mode = the SessionStart(compact) state block, ctx_resume, and the UserPromptSubmit recall block. 'Recall found' means the recall block for a prompt holds a line that answers it. This measures bytes and presence of the answer, not whether a model keeps working well after compaction.

| Scenario | Events | Transcript replay KB | PostToolUse hooks left KB | SessionStart(compact) block KB | ctx_resume KB | Resume saved | Recall block KB | Recall found | resume ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| [Debugging session: 6 real outputs, then compaction](../e-continuity/README.md#e-debug-session) | 6 | 133.0 | 1.7 | 0.2 | 0.5 | 100% | 0.5 | yes | 10 [9-10] |
| [Long session: 40 synthetic outputs (seeded), then compaction](../e-continuity/README.md#e-long-session) | 40 | 432.5 | 11.5 | 0.2 | 2.0 | 100% | 2.1 | yes | 18 [12-19] |

Footnote: Hardware Apple M1 Pro (10 cores, 32 GB), Darwin 23.5.0. Node v26.8.1. context-mode 2.0.0-next.8 at da0a30e8, built bundle, default settings, claude-code adapter unless a row names another. Median of 5 runs, ranges as [min-max]. Tokens are bytes / 4, an estimate. Date 2026-10-31. Reproduce: `cd bench && node run.mjs --runs 5`. Synthetic inputs (seeded, no real capture): e-long-session.

## F. Hook redirect (flooding calls denied or replaced)

Hooks run as the claude-code adapter. For WebFetch the body size is the size of the captured page the URL serves (the fixture); the real network is not used. The deny text is all the model gets; the follow-up call in the sandbox costs what group A or B shows for the same input.

| Scenario | Would have entered KB | Entered KB | Saved | Hook acted | hook ms |
|---|---:|---:|---:|---:|---:|
| [Read of a 46 KB log (denied, routed to ctx_execute)](../f-hook-redirect/README.md#f-read-large-file) | 45.1 | 0.4 | 99% | yes | 42 [39-76] |
| [Read of a 61 KB source file (denied, routed to ctx_execute)](../f-hook-redirect/README.md#f-read-big-source) | 60.1 | 0.4 | 99% | yes | 38 [38-42] |
| [Read of a small file (allowed: nothing to save)](../f-hook-redirect/README.md#f-read-small-file) | 1.7 | 1.7 | 0% | no | 40 [37-42] |
| [WebFetch of a docs page (denied, routed to ctx_index + ctx_search)](../f-hook-redirect/README.md#f-webfetch) | 210.3 | 0.4 | 100% | yes | 40 [37-47] |
| [Bash dump of a 191 KB git log (PostToolUse replace)](../f-hook-redirect/README.md#f-bash-dump-post) | 186.6 | 0.2 | 100% | yes | 107 [105-118] |
| [Bash curl of a 219 KB API payload (allowed before, replaced after)](../f-hook-redirect/README.md#f-bash-curl-post) | 214.0 | 0.3 | 100% | yes | 114 [113-149] |

Footnote: Hardware Apple M1 Pro (10 cores, 32 GB), Darwin 23.5.0. Node v26.8.1. context-mode 2.0.0-next.8 at da0a30e8, built bundle, default settings, claude-code adapter unless a row names another. Median of 5 runs, ranges as [min-max]. Tokens are bytes / 4, an estimate. Date 2026-10-31. Reproduce: `cd bench && node run.mjs --runs 5`.

## G. Overhead (hook latency, search latency, index time, full session)

Each hook row is the median of 5 hook processes inside one run, a fresh process each (no daemon), minus the median of 5 bare `node -e ""` starts. The small payload is an allowed command, so this is the fixed cost of every tool call.

| Hook (host adapter) | Hook ms | Bare node ms | Overhead ms |
|---|---:|---:|---:|
| [claude-code](../g-overhead/README.md#g-hook-claude-code) | 42.6 [41.5-45.0] | 32.3 [30.6-33.4] | 10.6 [8.2-12.2] |
| [codex](../g-overhead/README.md#g-hook-codex) | 40.3 [39.9-41.5] | 32.3 [31.6-33.0] | 7.8 [7.3-9.9] |
| [gemini](../g-overhead/README.md#g-hook-gemini) | 43.6 [41.0-48.7] | 32.5 [31.7-33.6] | 11.1 [8.9-15.4] |
| [qwen](../g-overhead/README.md#g-hook-qwen) | 40.8 [37.5-49.8] | 31.0 [30.7-38.6] | 9.1 [6.7-18.8] |
| [copilot-cli](../g-overhead/README.md#g-hook-copilot-cli) | 40.8 [40.5-41.6] | 30.8 [30.0-31.3] | 9.9 [9.8-11.3] |
| [vscode](../g-overhead/README.md#g-hook-vscode) | 38.6 [37.7-38.8] | 30.9 [30.0-31.8] | 7.5 [6.2-8.6] |
| [kiro](../g-overhead/README.md#g-hook-kiro) | 38.2 [37.9-49.8] | 31.4 [30.6-35.9] | 7.6 [6.6-18.3] |
| [zcode](../g-overhead/README.md#g-hook-zcode) | 39.6 [39.0-44.0] | 31.1 [30.5-33.1] | 9.0 [6.8-10.9] |
| [pi](../g-overhead/README.md#g-hook-pi) | 41.1 [40.1-44.9] | 31.1 [30.3-35.8] | 9.2 [9.0-10.8] |
| [opencode](../g-overhead/README.md#g-hook-opencode) | 38.6 [37.9-61.5] | 30.9 [30.8-39.4] | 7.7 [6.6-22.1] |

| Scenario | Result |
|---|---|
| [ctx_search latency (20 queries over 8 indexed fixtures)](../g-overhead/README.md#g-search-latency) | median 1.9 [1.8-3.1] ms, worst 7.3 [6.8-8.1] ms, reply 3.7 KB |
| [ctx_index time per MB (3 real files, 0.6 MB)](../g-overhead/README.md#g-index-per-mb) | 167 [165-181] ms per MB (100 [99-108] ms for 611.0 KB) |
| [Full debugging session: 8 outputs through the hooks, 3 follow-up searches](../g-overhead/README.md#g-session-total) | raw 274.7 KB, entered 3.4 KB (hooks left 1.3 + searches 2.1), saved 99%, hook time 472 [459-540] ms |

Footnote: Hardware Apple M1 Pro (10 cores, 32 GB), Darwin 23.5.0. Node v26.8.1. context-mode 2.0.0-next.8 at da0a30e8, built bundle, default settings, claude-code adapter unless a row names another. Median of 5 runs, ranges as [min-max]. Tokens are bytes / 4, an estimate. Date 2026-10-31. Reproduce: `cd bench && node run.mjs --runs 5`.

