# Performance

Every number here is copied from a measured source in this repo. Each row names the source, the date and the agent version.
A number with no measured source is not written here. Budgets come from `src/core/contracts/constants.ts` and TECH-SPEC §1 (GS6).

## Hook latency (GS6)

Source: `docs/architecture/TECH-SPEC.md` §1.1 (M7 sign-off status, M7-S4). Measured 2026-10-20 on `origin/v2-design`, macOS, Node 26, one machine, other load not checked.
Agent: Claude Code (agent version not stated in the source). GS6 status: **FAIL**.

| Measure | Measured | Budget | Result |
|---|---|---|---|
| Claude Code `mcp_tool` hook, p95 wall (`T-GS6`, n=200) | 41 ms | `HOOK_P95_MS` 40 ms | FAIL |
| Command hooks, p95 wall (`T-GS6`) | 43 ms | `HOOK_COMBINED_P95_MS` 60 ms | pass |
| Command hooks, CPU over bare Node (`T-GS6`) | 20 ms | `HOOK_CPU_OVER_NODE_MS` 20 ms | pass |
| `T-F1` Case B, 65536 B PostToolUse, p95 wall (live run) | 62 ms | `HOOK_COMBINED_P95_MS` 60 ms | FAIL |
| `bench/hook-index.mjs`, 64 KB, p95 (50 runs x 3, loadavg 4.8 to 5.6) | 50.5 to 55.0 ms (before the fix: 58.4 to 82.7 ms) | none set for this script | as measured |
| `bench/hook-index.mjs`, 1 MiB, p95 | 113.8 to 120.8 ms (before the fix: 150.0 to 154.7 ms) | `HOOK_COMBINED_P95_MS` 60 ms | about 2x over |
| Live 1 MiB check | 134 ms | `HOOK_COMBINED_P95_MS` 60 ms | over |
| Bare Node, p95 | 31 to 33 ms | reference only | - |

The misses at 64 KB and in `T-GS6` are 1 to 2 ms over the budget. The 1 MiB case is about 2x over. Open items: `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/.impl/BLOCKED-M7.md`; fixes so far: D-M7-FT-1, D-M7-FT-2 in `docs/architecture/modules/DEVIATIONS.md`.

## Context bytes

Final A/B (`bench/live/results/ab-final.json`, `bench/RESULTS.md`, 2026-10-20, Claude Code 2.1.303, claude-sonnet-5-5 low, 54 sessions): median tool_result bytes off 46.5, with the plugin 31. On multi-1 the tool_result bytes drop from 6,819 to 583. Median session tokens: off 36,217; with the plugin 38,252.

Saving score, median of 3 runs (`bench/saving-score.mjs`, 2026-10-21, `980272a5`): M1 94.21, M2 87.23, `guardsOk` false (gate guard). Final A/B (`bench/live/results/ab-final2.json`, 2026-10-21): large tasks median tool_result bytes off 4,694.5, with the plugin 734.5.

See `bench/RESULTS.md` for the offline replay (byte count over real transcripts) and the live runs, and `bench/routing-results.md` for live routing.
A short summary is in the README "Benchmarks" section and in `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/LAUNCH.md`.
