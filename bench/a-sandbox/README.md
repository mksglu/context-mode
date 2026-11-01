# A. Tool output processed in the sandbox (ctx_execute with `file`)

The agent runs a small script over the output; only the script's printed summary enters the context. Compared with the raw output entering the context (native) and with what the PostToolUse hook leaves of the same raw output. The summary script is the v1 benchmark script, so the summary shows what that script prints, not the answer to your question.

Run this group: `cd bench && node run.mjs a-sandbox`. Latest tables: [results/2026-11-01-darwin-arm64.md](../results/2026-11-01-darwin-arm64.md).

## a-context7-react-docs

React useEffect docs

- Command: `node run.mjs a-context7-react-docs`
- Input: `fixtures/data/context7-react-docs.md`, 6075 B, sha256 c0ee0d81f97dd86973cb8355a37ffa58eb1a3efad82371e2128ccdd75c9f3d4f

## a-context7-nextjs-docs

Next.js App Router docs

- Command: `node run.mjs a-context7-nextjs-docs`
- Input: `fixtures/data/context7-nextjs-docs.md`, 6658 B, sha256 b687675406d856b451d05ccb702c345a47849969295d19b2b21d2fede213620b

## a-context7-tailwind-docs

Tailwind CSS docs

- Command: `node run.mjs a-context7-tailwind-docs`
- Input: `fixtures/data/context7-tailwind-docs.md`, 4102 B, sha256 d0307fa05b356fbd45451317ffeb324dcbf959577772a9da0b7c87d9c98d7a02

## a-playwright-snapshot

Page snapshot (HN)

- Command: `node run.mjs a-playwright-snapshot`
- Input: `fixtures/data/playwright-snapshot.txt`, 57521 B, sha256 ff62ad78ab7fff91de94fb3e5a4c38cd4b030aa01c4cdc3b305705e46dad1bec

## a-playwright-network

Network requests

- Command: `node run.mjs a-playwright-network`
- Input: `fixtures/data/playwright-network.txt`, 400 B, sha256 016b08806075962abb8b0ebd160d9cb5c5ca3aa0055dd4a10ef52894b1ffed20

## a-github-prs

PR list (Next.js)

- Command: `node run.mjs a-github-prs`
- Input: `fixtures/data/github-prs.json`, 6561 B, sha256 c8aba6ce93e3302b6ca8660a4c3b1d4c0a044878386e8f240b222f369d1454ef

## a-github-issues

Issues (React)

- Command: `node run.mjs a-github-issues`
- Input: `fixtures/data/github-issues.json`, 60310 B, sha256 2765ceace4b127b15ece4309eb1c91279f85b6107562a498a551657411cb182b

## a-test-output

Test output (30 suites)

- Command: `node run.mjs a-test-output`
- Input: `fixtures/data/test-output.txt`, 6185 B, sha256 bc0fd4973ba5a401025c7979d05183f6c7f2a5d7b0f4d4d023b4e933f2e06b0d

## a-tsc-errors

TypeScript errors (50)

- Command: `node run.mjs a-tsc-errors`
- Input: `fixtures/data/tsc-errors.txt`, 5023 B, sha256 3ebc05d31d9ac68d3b950d05546f29b01586322660c38c8c94c4447c60cc359f

## a-build-output

Build output (100+ lines)

- Command: `node run.mjs a-build-output`
- Input: `fixtures/data/build-output.txt`, 6594 B, sha256 0e6a2387c978b36d37a4a3bc9030d0d0467ad43b8acd99d4a85a607fdc2e885e

## a-mcp-tools

MCP tools (40 tools)

- Command: `node run.mjs a-mcp-tools`
- Input: `fixtures/data/mcp-tools.json`, 17362 B, sha256 290dac23e92d735bfc532c6e757df79725217e4871326cdffcb878c0ada973ef

## a-access

Access log (500 req)

- Command: `node run.mjs a-access`
- Input: `fixtures/data/access.log`, 46216 B, sha256 6e4fa9285b3435ff5f1bb28938124737a0e39035a2f535003b69c46f9e5ff085

## a-git-log

Git log (150+ commits)

- Command: `node run.mjs a-git-log`
- Input: `fixtures/data/git-log.txt`, 11895 B, sha256 d767dbdb990c98070c617a9c8d2263d267c596d3ecfcda4cc0a79743815e45ae

## a-analytics

Analytics CSV (500 rows)

- Command: `node run.mjs a-analytics`
- Input: `fixtures/data/analytics.csv`, 87517 B, sha256 6dae0fc8f09d26e767e58ab0ba2a53aaaa014ddc7a2027aa3ca2f80111a19e54

## a-github-api-issues-large

Large JSON payload (Next.js issues, 30 items)

- Command: `node run.mjs a-github-api-issues-large`
- Input: `fixtures/data/github-api-issues-large.json`, 219175 B, sha256 bd2bdb943de007b7bb57d4e4a53a01ad801cf57606a3228682b39d05eb8a5e16

## a-npm-install-log

npm install log (--loglevel http)

- Command: `node run.mjs a-npm-install-log`
- Input: `fixtures/data/npm-install-log.txt`, 37761 B, sha256 54fe053a4c8ece97a96bef23b019a9120a230af1e17eddd70d4a046dd48a9af0

## a-source-big

Big source file (constants.ts, 61 KB)

- Command: `node run.mjs a-source-big`
- Input: `fixtures/data/source-big.ts`, 61576 B, sha256 7b4ba6812418434b9c682875de2454668ed98f3e0791f9e2b528ac034ec6e725

## a-git-log-large

Git log (2000 commits)

- Command: `node run.mjs a-git-log-large`
- Input: `fixtures/data/git-log-large.txt`, 191120 B, sha256 028317819bc1a93fcfbeeba2d5ffea829fe4c439e3889d688f76fbb11bb913ad

## a-devtools-mcp-snapshot

Browser snapshot (take_snapshot, Wikipedia SQLite page)

- Command: `node run.mjs a-devtools-mcp-snapshot`
- Input: `fixtures/data/devtools-mcp-snapshot.txt`, 136514 B, sha256 93903f7b076c2086f45b487395eb4a72f99f1820d146dbb1d822108a275fd259

## a-gh-issue-list-vite

GitHub issues (gh issue list --json, vitejs/vite, 40 items)

- Command: `node run.mjs a-gh-issue-list-vite`
- Input: `fixtures/data/gh-issue-list-vite.json`, 182943 B, sha256 05eca692a67494a13e1d9025c5b2f3a767897dd5ca0ed9bb5b540520523a8201

## a-gh-pr-list-vite

GitHub pull requests with checks (gh pr list --json, vitejs/vite, 25 items)

- Command: `node run.mjs a-gh-pr-list-vite`
- Input: `fixtures/data/gh-pr-list-vite.json`, 195471 B, sha256 8cdc8086bc300aa2148977f0ef93ddd5ead40b4d33f8d1756673cbbf66a56879

## a-context7-query-docs-vite

Library docs (query-docs, vite build and proxy config)

- Command: `node run.mjs a-context7-query-docs-vite`
- Input: `fixtures/data/context7-query-docs-vite.txt`, 6917 B, sha256 576bc7940657b02bb38d8a1ace44e713cdb1e54059b832ef050e24863024b4f2

## a-vitest-run-vite

Test run, 1106 tests, 25 failing (vitest run --reporter=verbose, vitejs/vite)

- Command: `node run.mjs a-vitest-run-vite`
- Input: `fixtures/data/vitest-run-vite.txt`, 62909 B, sha256 d089c367e8ef502da66114fdf07ab6452aa3a080917f870c18a36baadc62fd41

## a-biome-lint-vite

Lint report as JSON (biome lint --reporter=json, packages/vite/src)

- Command: `node run.mjs a-biome-lint-vite`
- Input: `fixtures/data/biome-lint-vite.json`, 288523 B, sha256 50a1b9134671cf9311edb8bcad99b2caacea444d5ef7419788fc97b5b6e002af

## a-pnpm-install-vite

Workspace install log (pnpm install --frozen-lockfile, vitejs/vite)

- Command: `node run.mjs a-pnpm-install-vite`
- Input: `fixtures/data/pnpm-install-vite.txt`, 14988 B, sha256 50fdc94bb8c081bf8ecc56b73b679cf82dbee3b7bba50bc7b6f25a4c47ef42dd

## a-docker-logs-mongo

Container logs (docker logs, mongo:8.0 --verbose)

- Command: `node run.mjs a-docker-logs-mongo`
- Input: `fixtures/data/docker-logs-mongo.txt`, 60374 B, sha256 d4810c22ef63d6cc27d933e0fd89163ad3fb313f957ed8b907a1eeaae5ae9d1a

## a-terraform-plan

Plan output (terraform plan, 72 resources)

- Command: `node run.mjs a-terraform-plan`
- Input: `fixtures/data/terraform-plan.txt`, 34081 B, sha256 127d2218bf3fdeaec6514bb6a9cf4f1011e717e3dc434f7c959a683b629d56f4

## a-git-log-stat-vite

Commit history with file stats (git log --stat, 300 commits, vitejs/vite)

- Command: `node run.mjs a-git-log-stat-vite`
- Input: `fixtures/data/git-log-stat-vite.txt`, 164385 B, sha256 b520fe995fbf968ee726fc1a8eb1bca799b1e2d3a6f1230b4f218dcf86122f36
