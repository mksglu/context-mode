# context-mode v2: implementation docs

These files tell an implementing agent exactly what to write. The design is final. Do not make design choices. If a doc is silent on a point and no "Assumptions" row in that module covers it: stop, ask the Lead, then record the answer as a new row in that module's "Assumptions" section before you write the code (DECISIONS-r9 G3).

Every link in this file and in each module file is relative to the file it is written in (for example `./00-architecture.md`, `../adr/0008-enforcement.md`), never an absolute path (DECISIONS-r9 G2).

## Files

| File | Module id | Owns |
|---|---|---|
| `00-architecture.md` | (all) | Source tree, module graph, shared types, constants, cross-module calls, runtime flows |
| `01-contracts.md` | contracts | `src/core/contracts/` types and constants |
| `02-store.md` | store | `src/core/store/`, `src/core/project/`, `src/core/journal/` |
| `03-sandbox.md` | sandbox | `src/core/sandbox/` |
| `04-tools-exec.md` | tools-exec | `ctx_execute`, `ctx_batch` |
| `05-tools-index.md` | tools-index | `ctx_index`, `ctx_search`, chunker, fetch |
| `06-tools-session.md` | tools-session | `ctx_resume`, `ctx_purge`, `ctx_stats`, compaction |
| `07-tools-ops.md` | tools-ops | `ctx_doctor`, `ctx_upgrade` (install, upgrade, uninstall), `detectV1` |
| `08-enforcement.md` | enforcement | shell parser, policy, subagent cases A/B/C |
| `09-hooks.md` | hooks | hook entry, dispatch per canonical event |
| `10-adapters.md` | adapters | `adapters/table.ts` and 10 decode/encode files |
| `11-server.md` | server | MCP server entry, lifecycle, prompt delivery |
| `12-plugins.md` | plugins | Pi and OpenCode 2 in-process entries |
| `13-build-release.md` | build-release | esbuild, manifests, CI, `release.yml`, `/release` skill |
| `14-tests.md` | tests | `e2e/` harness, GP1–GP11, live cases, KEEP-PASS runner |
| `14a-issue-cases.md` | tests | 147 issue-row cases (Given/When/Then) that close the ADR-0003 exit gate |
| `15-v1-transition.md` | v1-transition | R1–R8 of ADR-0017, removed-file check, README upgrade section |

## How to use them

1. Read `00-architecture.md` in full. It is the contract every module follows: names, types, constants, import rules.
2. Read the file for your module. Read no other module file unless 00 lists a call into it.
3. Implement in the TECH-SPEC §12 milestone order (M0 → M7). Inside a milestone, follow the step order in your module file. M0's step command is `npx vitest run --config tests/vitest.config.ts` (DECISIONS-r9 G5; config reads `tests/keep-pass.list.json`, `14-tests.md` §7).
4. Write the E2E case first (ADR-0017, PRD P6). Each function names its GP row or live case id and its `covers` path.
5. After each step, run:
   - `node e2e/cases/run.mjs` (GP1–GP11, no model, free).
   - `node e2e/live/run.mjs` (step mode: only cases whose `covers` match your changed files; `claude-sonnet-5 --effort low`).
6. A step is done only when both are green. Do not delete v1 `tests/`; the 131 KEEP-PASS files must stay green (ADR-0003 r2, Q1).
7. Never import `src/` from `e2e/` (GS4). Never add a constant outside `src/core/contracts/constants.ts`.
## Assumption and deviation ids (intern M0 Q10)

Each module file keeps its own `## Assumptions` list with its own prefix (`A-C` contracts, `A-S` store, `AS` sandbox, `A<n>` elsewhere). Cross-file answers go to `DEVIATIONS.md` as `D-M<n>-<k>`. There is no central registry: search `## Assumptions` and `DEVIATIONS.md`.

## Changes

- 2026-10-17: added 14a-issue-cases.md.
- 2026-10-16 (DECISIONS-r9, S8): silent-doc rule now says stop, ask the Lead, record the answer as a new Assumptions row (G3); added the relative-links rule (G2); named the M0 step command (G5).
