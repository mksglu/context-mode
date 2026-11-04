# context-mode benchmark tables (2026-11-01-darwin-arm64)

Hardware Apple M1 Pro (10 cores, 32 GB), Darwin 23.5.0. Node v26.8.1. context-mode 2.0.0-next.23+dev at d4c98b3c (dirty tree), built bundle, default settings, claude-code adapter unless a row names another. Median of 5 runs, ranges as [min-max]. Tokens are bytes / 4, an estimate. Date 2026-11-01. Reproduce: `cd bench && node run.mjs --runs 5`.

## A. Tool output processed in the sandbox (ctx_execute with `file`)

The agent runs a small script over the output; only the script's printed summary enters the context. Compared with the raw output entering the context (native) and with what the PostToolUse hook leaves of the same raw output. The summary script is the v1 benchmark script, so the summary shows what that script prints, not the answer to your question.

| Scenario | Raw KB | v1 saved | v2 ctx_execute KB | v2 saved | v2 hook KB | hook saved | exec ms |
|---|---:|---:|---:|---:|---:|---:|---:|
| [Browser snapshot (take_snapshot, Wikipedia SQLite page)](../a-sandbox/README.md#a-devtools-mcp-snapshot) | 133.3 | n/a | 0.5 | 100% | 0.2 | 100% | 71 [65-85] |
| [GitHub issues (gh issue list --json, vitejs/vite, 40 items)](../a-sandbox/README.md#a-gh-issue-list-vite) | 178.7 | n/a | 0.8 | 100% | 0.1 | 100% | 65 [57-81] |
| [GitHub pull requests with checks (gh pr list --json, vitejs/vite, 25 items)](../a-sandbox/README.md#a-gh-pr-list-vite) | 190.9 | n/a | 0.8 | 100% | 0.1 | 100% | 79 [72-94] |
| [Library docs (query-docs, vite build and proxy config)](../a-sandbox/README.md#a-context7-query-docs-vite) | 6.8 | n/a | 0.5 | 93% | 0.2 | 97% | 65 [58-71] |
| [Test run, 1106 tests, 25 failing (vitest run --reporter=verbose, vitejs/vite)](../a-sandbox/README.md#a-vitest-run-vite) | 61.4 | n/a | 0.4 | 99% | 0.2 | 100% | 60 [57-65] |
| [Lint report as JSON (biome lint --reporter=json, packages/vite/src)](../a-sandbox/README.md#a-biome-lint-vite) | 281.8 | n/a | 0.6 | 100% | 0.1 | 100% | 65 [58-73] |
| [Workspace install log (pnpm install --frozen-lockfile, vitejs/vite)](../a-sandbox/README.md#a-pnpm-install-vite) | 14.6 | n/a | 0.2 | 99% | 0.2 | 99% | 59 [59-61] |
| [Container logs (docker logs, mongo:8.0 --verbose)](../a-sandbox/README.md#a-docker-logs-mongo) | 59.0 | n/a | 0.6 | 99% | 0.1 | 100% | 62 [58-70] |
| [Plan output (terraform plan, 72 resources)](../a-sandbox/README.md#a-terraform-plan) | 33.3 | n/a | 0.2 | 99% | 0.2 | 99% | 62 [56-66] |
| [Commit history with file stats (git log --stat, 300 commits, vitejs/vite)](../a-sandbox/README.md#a-git-log-stat-vite) | 160.5 | n/a | 0.3 | 100% | 0.2 | 100% | 66 [63-79] |

Footnote: Hardware Apple M1 Pro (10 cores, 32 GB), Darwin 23.5.0. Node v26.8.1. context-mode 2.0.0-next.23+dev at d4c98b3c (dirty tree), built bundle, default settings, claude-code adapter unless a row names another. Median of 5 runs, ranges as [min-max]. Tokens are bytes / 4, an estimate. Date 2026-11-01. Reproduce: `cd bench && node run.mjs --runs 5`.

## F. Hook redirect (flooding calls denied or replaced)

Hooks run as the claude-code adapter. For WebFetch the body size is the size of the captured page the URL serves (the fixture); the real network is not used. The deny text is all the model gets; the follow-up call in the sandbox costs what group A or B shows for the same input.

| Scenario | Would have entered KB | Entered KB | Saved | Hook acted | hook ms |
|---|---:|---:|---:|---:|---:|
| [Read of the 89 KB vite config source (denied, routed to ctx_execute)](../f-hook-redirect/README.md#f-read-vite-config) | 89.2 | 0.4 | 100% | yes | 44 [39-55] |
| [WebFetch of the 265 KB Vite features guide (denied, routed to ctx_index + ctx_search)](../f-hook-redirect/README.md#f-webfetch-vite-docs) | 265.4 | 0.4 | 100% | yes | 41 [36-43] |

Footnote: Hardware Apple M1 Pro (10 cores, 32 GB), Darwin 23.5.0. Node v26.8.1. context-mode 2.0.0-next.23+dev at d4c98b3c (dirty tree), built bundle, default settings, claude-code adapter unless a row names another. Median of 5 runs, ranges as [min-max]. Tokens are bytes / 4, an estimate. Date 2026-11-01. Reproduce: `cd bench && node run.mjs --runs 5`.

