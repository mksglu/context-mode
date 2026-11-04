# Fixture source, daily-use rows

Kept apart from SOURCE.md: that file is itself a bench input (f-read-small-file), so its hash is pinned in the committed results.

Real captures on a public project, run on 2026-11-01 on macOS arm64 (Apple M1 Pro). Project: github.com/vitejs/vite at 90bc034a (2026-10-30). Home paths replaced by /home/user, work paths by /work; `scripts/check-secrets` reports clean. Tools that did not run here and were skipped: kubectl against a cluster (no cluster; `kubectl get --local` is not a flag), browser-use and Stagehand (need a model API key).

| File | Source and command | Bytes | sha256 |
|---|---|---:|---|
| devtools-mcp-snapshot.txt | Chrome DevTools MCP chrome-devtools-mcp 1.12.0 (headless Chrome 156.0.8078.74), tool `take_snapshot` on https://en.wikipedia.org/wiki/SQLite | 136514 | 93903f7b076c2086f45b487395eb4a72f99f1820d146dbb1d822108a275fd259 |
| gh-issue-list-vite.json | `gh issue list -R vitejs/vite --state open --limit 40 --json number,title,state,author,labels,createdAt,updatedAt,comments,body,url`, gh 2.39.1; /Users/<name> paths in issue bodies replaced by /home/user | 182943 | 05eca692a67494a13e1d9025c5b2f3a767897dd5ca0ed9bb5b540520523a8201 |
| gh-pr-list-vite.json | `gh pr list -R vitejs/vite --state open --limit 25 --json number,title,author,labels,createdAt,additions,deletions,changedFiles,statusCheckRollup,body`, gh 2.39.1 | 195471 | 8cdc8086bc300aa2148977f0ef93ddd5ead40b4d33f8d1756673cbbf66a56879 |
| context7-query-docs-vite.txt | Context7 MCP @upstash/context7-mcp 4.4.4, tool `query-docs`, libraryId /vitejs/vite, query "How do I configure vite build options, server proxy and plugins in vite.config.ts?" | 6917 | 576bc7940657b02bb38d8a1ace44e713cdb1e54059b832ef050e24863024b4f2 |
| vitest-run-vite.txt | `vitest run --reporter=verbose` (vitest 5.0.5, Node 26.8.1) in vitejs/vite at 90bc034 (2026-10-30). 25 tests in create-vite fail on this machine; the log is kept as run | 62909 | d089c367e8ef502da66114fdf07ab6452aa3a080917f870c18a36baadc62fd41 |
| biome-lint-vite.json | `biome lint --reporter=json` (Biome 2.6.4) on packages/vite/src of vitejs/vite at 90bc034, default rules, no project config applied | 288523 | 50a1b9134671cf9311edb8bcad99b2caacea444d5ef7419788fc97b5b6e002af |
| pnpm-install-vite.txt | `pnpm install --frozen-lockfile` (pnpm 12.15.0) in vitejs/vite at 90bc034, empty store; home path replaced by /home/user | 14988 | 50fdc94bb8c081bf8ecc56b73b679cf82dbee3b7bba50bc7b6f25a4c47ef42dd |
| docker-logs-mongo.txt | `docker logs` of a `mongo:8.0` container (MongoDB 8.0.23, image mongo@sha256:f93b9015...) started with `--setParameter logLevel=1`, Docker 29.6.2 | 60374 | d4810c22ef63d6cc27d933e0fd89163ad3fb313f957ed8b907a1eeaae5ae9d1a |
| terraform-plan.txt | `terraform plan` (Terraform v1.17.1 darwin_arm64) on a local-only config: providers hashicorp/local ~> 2.5 and hashicorp/random ~> 3.6, 8 services x 3 envs, 72 resources to add | 34081 | 127d2218bf3fdeaec6514bb6a9cf4f1011e717e3dc434f7c959a683b629d56f4 |
| git-log-stat-vite.txt | `git log -n 300 --stat --date=iso` of vitejs/vite at 90bc034 (2026-10-30), git 2.39.5 | 164385 | b520fe995fbf968ee726fc1a8eb1bca799b1e2d3a6f1230b4f218dcf86122f36 |
| vite-config.ts | packages/vite/src/node/config.ts of vitejs/vite at 90bc034, as is | 91362 | 65a62e65875835fbdd66ae3b0b1de9638dc1c046f9688422922a239ca72dce84 |
| vite-docs-features.html | https://vite.dev/guide/features.html as served (curl), captured 2026-11-01 | 271731 | 1dca10c0a7b348c1b9ddb46733cfde706f46bee0554175716a415fe8609187c8 |
