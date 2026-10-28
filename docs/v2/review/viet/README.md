# Tester reports on 2.0.0-next.8 (Viet, 2026-10-28)

## 1. ctx_stats / ctx_search take ~1.45 s each on Windows
Windows x64 build 26300, Node 24.18.0, next.8. Fresh HOME, empty project, one MCP server, sequential calls: ctx_index a short string, ctx_stats twice, ctx_search, ctx_stats.
Stock: ctx_index 61 ms, ctx_stats 1469 / 1487 ms, ctx_search 1473 ms, ctx_stats 1462 ms.
Timing-only trace: 1439-1460 ms inside `PRAGMA wal_checkpoint(TRUNCATE)` (src/core/store/db.ts:171 at next.8). First two checkpoints 0.67 ms and 0.29 ms, last one 1.16 ms. Skipping only that checkpoint in a diagnostic run: 6-9 ms.
Repro (tester's method): fresh temp HOME/USERPROFILE/CODEX_HOME/CLAUDE_CONFIG_DIR and an empty project, spawn `node server.mjs --agent codex`, MCP initialize, then tools/call in order: ctx_index {content:"LATENCY_SENTINEL answer=731", source:"latency-source"}, ctx_stats, ctx_stats, ctx_search {queries:["LATENCY_SENTINEL"]}, ctx_stats; time each call. Trace mode patches DatabaseSync.prototype.exec via --import to time `PRAGMA wal_checkpoint(TRUNCATE)` only.

## 2. ctx_doctor D3 "wrong: hook entries" after a Claude marketplace install
Claude marketplace install on next.8: D3 fails with "wrong: hook entries", but the large-file Read hook works. The same hook files pass in a flat cache and fail under `.../context-mode/2.0.0-next.8/`. The plugin-root resolver stops at the parent folder: src/core/ops/plugin-root.ts line 32 at v2.0.0-next.8.
