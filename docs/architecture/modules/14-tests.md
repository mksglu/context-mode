# 14 — Module `tests`

Changes (DECISIONS-r6): GP6 now carries the D1 open-error golden case; added `memory-r6-eval-local.json` and `memory-r6-resume-quality.json` live cases for the compaction fixtures; no case checks a prose `decision` row, per D3. Per D6 (`https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/memory-r6/eval/results.md`): GP6 adds one case per `compactSummary` mode (`"host"`, `"none"`); added `LV-COMPACT-<agent>.e2e.mjs`, one live case per agent, run in M3.

Changes (DECISIONS-r7): GP5 adds one golden recall@5 case per query type (`decision`, `errorfix`, `timeline`), fixed to the measured BM25+RRF (k=60, no MMR) numbers; the existing `e2e/live/cases/memory-retrieval-local.json` live case is cited as the free deterministic check for the same numbers.

Changes (DECISIONS-r8): GP3 adds four golden cases for the Read-deny rule — unranged `Read` over `OUTPUT_CAP` denied with the ADR-0008 reason text; ranged `Read` (`offset` or `limit` set) over `OUTPUT_CAP` never denied; unbounded shell dump (`cat`/`head`/`tail`/`sed -n`/`less`/`jq`/`bat`/`more`, one file) over `OUTPUT_CAP` denied; bounded shell dump (`head -n N`, `tail -n N`, `sed -n 'a,bp'`) never denied; added `LV-READ-EDIT.e2e.mjs`, one live case: `Read` denied on an over-cap file, then `Read` with `offset`/`limit` on the same file, then `Edit` on the same file, asserting the edit still succeeds (T3).

Owner: `tests` (see `00-architecture.md` §2). Scope: everything under `e2e/` except `e2e/live/cases/v1-migration-*.json` (owner: `v1-transition`, spec'd separately), plus the `tests/` v1 runner config. This module imports nothing from `src/` except the 131 KEEP-PASS files, which keep their existing `src/` imports (ADR-0003 r2, TECH-SPEC §6.1 hard rule).

Sources: TECH-SPEC §6 (all), ADR-0003, ADR-0012, ADR-0017, DECISIONS-r4, `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/review/TEST-TRIAGE-r2.md`, `e2e/live/run.mjs` (already on disk — this spec keeps its CLI contract), `00-architecture.md` §1 e2e/ table.

## 1. File list, in build order

| # | Path | Purpose |
|---|---|---|
| 1 | `e2e/harness/normalize.mjs` | normalize rules (§3) |
| 2 | `e2e/harness/mcp-client.mjs` | spawn bundle, speak MCP stdio |
| 3 | `e2e/harness/hook-runner.mjs` | spawn hook entry, capture stdout/exit/ms |
| 4 | `e2e/harness/db-dump.mjs` | read-only `node:sqlite` dump |
| 5 | `e2e/harness/live/<agent>.mjs` | headless drivers (claude, codex; others SKIPPED) |
| 6 | `e2e/fixtures/<agent>/<ver>/<event>.json` | recorded native hook payloads |
| 7 | `e2e/golden/GPn/<case>.json` | golden files |
| 8 | `e2e/cases/GP1-install.e2e.mjs` … `GP11-doctor-upgrade.e2e.mjs` | one file per GP id (§4) |
| 9 | `e2e/cases/run.mjs` | runs all GP cases, exits non-zero on first fail |
| 10 | `e2e/live/cases/*.json` | live case definitions with `covers` (§6) |
| 11 | `e2e/live/routing-tasks.json` | 10 small + 10 large tasks |
| 12 | `tests/vitest.config.ts` | KEEP-PASS runner config (§5) |
| 13 | `tests/keep-pass.list.json` | the 131-file list, generated from `TEST-TRIAGE-r2.md` |

`e2e/live/run.mjs` already exists on disk with the CLI contract this spec uses; do not change its flags.

## 2. `e2e/harness/mcp-client.mjs`

```ts
export function spawnBundle(bundlePath: string, env?: Record<string,string>): McpClient;
export interface McpClient {
  request(method: string, params?: object): Promise<object>;   // JSON-RPC over stdio
  notify(method: string, params?: object): void;
  close(): Promise<void>;                                       // stdin EOF, wait for exit, ≤ 2s timeout
}
```

Steps for `spawnBundle`:
1. `spawn(process.execPath, [bundlePath], { stdio: ["pipe","pipe","pipe"], env })`.
2. Wrap stdout in a newline-delimited JSON-RPC reader; buffer partial lines across `data` events.
3. Return `McpClient` whose `request()` writes one JSON-RPC line to stdin and resolves on the matching `id` reply.
4. `close()` ends stdin, waits for `exit`; if no exit inside `GP9_EXIT_MS` (from `constants.ts`), kill and throw `"mcp-client: bundle did not exit in <ms>ms"`.

Error case: a reply with no matching pending `id` → throw `"mcp-client: unmatched reply id <id>"`. This is a harness bug, never a product assertion target.

## 3. `e2e/harness/normalize.mjs`

```ts
export function normalize(value: unknown): unknown;
```

Inputs: any JSON-shaped value captured from a GP case (stdout, DB rows, tool replies).
Output: the same shape, with volatile fields replaced.

Steps (apply in this order, deepest value first, TECH-SPEC §6.4):
1. Walk the value depth-first.
2. For each string leaf, apply regex-free string replacement passes (this file is CI/test code, not runtime code, so ADR's no-regex rule does not apply — TECH-SPEC §11 only binds `src/`):
   - ISO-8601 timestamp pattern → `<ts>`.
   - a run of digits that matches a live PID captured earlier in the same run → `<pid>`.
   - the harness's own temp HOME path prefix → `<home>`; the temp project path prefix → `<proj>`.
   - a session id string → `<sid:n>`, where `n` is the 0-based order of first appearance of that exact string in this normalize call (a `Map<string,number>` keyed per call, not per process).
   - a duration-shaped number field (key name ends in `Ms` or `_ms`) → `<ms>`.
   - every `\` → `/`.
3. Return the walked copy. The input is never mutated.

Error case: none — `normalize()` never throws; an unrecognized shape passes through unchanged.

## 4. `e2e/cases/GPn-<name>.e2e.mjs`

One file per GP id. Each file is a `node:test` suite. Shared shape:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
```

| File | GP id | Case source (TECH-SPEC §6.2 row) | covers (ADR-0017 `covers` path) |
|---|---|---|---|
| `GP1-install.e2e.mjs` | GP1 | install + handshake, ×10 adapters | `src/adapters/`, `build/manifests.ts`, `src/core/ops/plugin-root.ts` |
| `GP2-prompt-surface.e2e.mjs` | GP2 | `initialize`, `tools/list`, Pi system prompt | `src/prompt/`, `build/prompt-lint.mjs` |
| `GP3-hooks.e2e.mjs` | GP3 | hooks ×10 adapters × 4 events; Read-deny and shell-dump-deny golden cases (DECISIONS-r8); DECISIONS-r9 adds the E1-E5 v1-carve-out cases (newline/CR bypass E1, malformed-policy fail-closed E2, no nudge-size exemption E3, structurally-bounded command set E4, session-id-only throttle E5) and the P4 parser-coverage cases (`[[ -f a.txt ]] && echo ok` allow; `echo $((1+1))` allow; `deploy() { curl -s https://x.io/a.json; }; deploy` deny; `case "$1" in x) curl -s https://x.io/a.json;; esac` deny; `echo "curl \"https://x.io/a.json\""` allow; `diff <(curl -s https://x.io/a.json) <(echo x)` deny; `FOO=1 curl -s https://x.io/a.json` deny; `grep x <<< "$(curl -s https://x.io/a.json)"` deny; `echo "unterminated` → `ParseError`); V8 adds 25 offline GP3 fixtures (10 synthetic large `curl`, 10 `wget`, 5 oversize build outputs), threshold 25/25 deny, no live model; V17 adds the three `Read` glob-deny cases (`Read(//etc/**)` vs `/etc/hosts` deny, `Read(~/secret/**)` vs `$HOME/secret/a` deny, `Read(./x/**)` vs `/x/a` allow) | `src/core/hooks/`, `src/entries/hook.ts`, `src/core/policy/` |
| `GP4-execute.e2e.mjs` | GP4 | `ctx_execute` | `src/core/tools/execute.ts`, `src/core/sandbox/` |
| `GP5-index-search.e2e.mjs` | GP5 | `ctx_index` → `ctx_search`; one golden recall@5 case per query type (`decision`, `errorfix`, `timeline`), fixed to the DECISIONS-r7 measured values (BM25+RRF k=60; no MMR); V23 adds `ctx_search(offset:-1, after:-1, queries:[])` each returning a zod `isError`, never a throw (`.int().nonnegative()`); V24 adds a Cyrillic and an accented-Latin recall case under `unicode61 remove_diacritics 2` (CJK stays open, #1295) | `src/core/tools/{index,search}.ts`, `src/core/index/` |
| `GP6-journal-resume.e2e.mjs` | GP6 | journal + resume; golden case for the DECISIONS-r6 D1 miss (open-error row dropped only by a budget skip, never by a scoring bug); one case for `compactSummary:"host"` (pointer line only, no state block, `ctx_resume()` with no `seq` returns the 2,048 B block on demand) and one case for `compactSummary:"none"` (2,048 B D1 block injected through the agent's ADR-0009 §6 path), per DECISIONS-r6 D6 | `src/core/journal/`, `src/core/tools/resume.ts`, `src/core/compaction/`, `adapters/table.ts` |
| `LV-COMPACT-<agent>.e2e.mjs` | LV-COMPACT | live case, one per agent (M3): confirms the host writes its own compact summary the model sees; when true, flips `adapters/table.ts` `compactSummary` row for that agent from `"none"` to `"host"` (DECISIONS-r6 D6) | `adapters/table.ts` |
| `LV-READ-EDIT.e2e.mjs` | LV-READ-EDIT | live case (M3): deny an unranged `Read` on an over-cap file, then `Read` the same file with `offset`/`limit`, then `Edit` the same file; asserts the edit still succeeds after the deny (DECISIONS-r8 T3) | `src/core/policy/` |
| `GP7-scope.e2e.mjs` | GP7 | scope, 2 worktrees × 2 sessions × 2 agents | `src/core/project/` |
| `GP8-concurrency.e2e.mjs` | GP8 | 4 servers + hooks, one DB; V22 adds the project-cleanup case (live owner PID + last access > 14 days: not deleted; dead PID + old: deleted) | `src/core/store/` |
| `GP9-lifecycle.e2e.mjs` | GP9 | stdin EOF, parent kill, 3 OS; V20 adds a 10 s idle-stdin case asserting process CPU time grows ≤ 1% of wall time (`process.cpuUsage` via `ctx_stats` debug field or `ps`) | `src/core/lifecycle/exit.ts` |
| `GP10-stats.e2e.mjs` | GP10 | known call sequence; V18 adds a zero-call session returning zero rows with `isError:false`; V19 adds the per-tool-rows-sum-to-total assertion for the same known sequence | `src/core/tools/stats.ts` |
| `GP11-doctor-upgrade.e2e.mjs` | GP11 | v1 install, broken config, empty index | `src/core/tools/{doctor,upgrade}.ts`, `src/core/ops/` |

Each case file, per case inside it:

**Inputs**: the fixture or payload named in the TECH-SPEC §6.2 "Inputs" column for that GP id (e.g. GP3 reads `e2e/fixtures/<agent>/<ver>/<event>.json`; GP5 builds a fixture folder with nested `.gitignore` incl. negation patterns, HTML, Markdown, non-ASCII text).

**Steps (numbered, generic shape every case file follows):**
1. Build the fixture tree under a per-test temp dir (`node:fs.mkdtempSync`).
2. Spawn the subject (bundle via `mcp-client.mjs`, or hook entry via `hook-runner.mjs`) with that fixture as `cwd`/input.
3. Collect stdout, exit code, elapsed ms, and (for DB-touching cases) a `db-dump.mjs` read.
4. Call `normalize()` on the collected value.
5. Load `e2e/golden/GPn/<case>.json`; if `process.env.UPDATE_GOLDEN === "1"`, write the normalized value there and pass.
6. `assert.deepStrictEqual(normalized, golden)`.
7. Assert any non-golden invariant listed in the TECH-SPEC §6.2 "Asserts" cell for that GP id (e.g. GP8's "0 busy errors reach the tool result", GP9's TTY gate) as a separate `assert` inside the same `test()` block, not a new golden file.

**Error cases (exact text, one per case file that owns the behavior):**
- GP1: a host config write that would escape the resolved plugin root → `"install: refused to write outside plugin root: <path>"`.
- GP4: `ctx_execute` on a deleted cwd → the one-line cause with no raw Node stack (per #1135): `"execute: cwd not found: <cwd>"`.
- GP5: unreachable fetch URL → `"index: fetch failed: <cause>"` (one line, no stack, same rule as GP4 #1135).
- GP9: no exit inside the SIGTERM/SIGKILL budget → test fails with `"lifecycle: process did not exit after SIGKILL (<ms>ms)"`.

Every other GP id surfaces its product error text from the module spec that owns it (e.g. GP11 doctor rows); this file only asserts that text matches the golden file — it does not define new error strings.

**Constants used:** `OUTPUT_CAP` (GP4/GP5 byte caps), `GP9_EXIT_MS` (lifecycle budget), `HOOK_P95_MS` (GP3 perf bench threshold), `CTX_RESUME_CAP_BYTES` (GP6 golden shape cap). All four come from `src/core/contracts/constants.ts`; no literal numbers in case files.

## 5. `e2e/cases/run.mjs`

```ts
export default function runAll(): Promise<number>; // exit code
```

Steps:
1. `readdirSync("e2e/cases")`, filter `*.e2e.mjs`, sort by filename (GP1 → GP11 order).
2. `node:test run()` over the sorted file list, one process, 3 OS via CI matrix (§7), not spawned per-file.
3. Print a pass/fail line per GP id.
4. Exit `1` if any case failed, else `0`.

Error case: an empty `e2e/cases` dir (`readdirSync` returns `[]`) → print `"run: no GP case files found in e2e/cases"` and exit `1`; never silently pass.

## 6. `e2e/live/cases/*.json` — case file format

One JSON file per live case (ADR-0017 §1, ADR-0012 "Cases").

```ts
interface LiveCase {
  id: string;               // e.g. "routing-small-01", "deny-curl", "compact-turn"
  kind: "agent" | "local";  // "local": runs via spawnSync, no model call (ADR-0017 table row 1 local checks)
  covers: string[];         // path prefixes; step mode selects this case when `git diff --name-only <base>` touches any prefix
  prompt?: string;          // required when kind === "agent"
  run?: string[];           // required when kind === "local"; argv, e.g. ["node", "e2e/cases/run.mjs"]
  tools?: string[];         // allowedTools list passed to --allowedTools, kind === "agent" only
  expect: {
    firstLineStartsWith?: string;  // kind === "agent": first line of result text
    jsonField?: string;            // kind === "local": field name in stdout JSON
    equals?: unknown;               // kind === "local": expected value of that field
  };
}
```

Rules:
- `covers` paths are repo-relative prefixes, matched with `changed.some(f => f.startsWith(p))` — this is `run.mjs`'s existing matcher (line 37); case files must use prefixes that match that logic, not globs.
- `kind: "agent"` cases run through `run.mjs`'s `bin` branch (model call, cost tracked); `kind: "local"` cases run through its `spawnSync` branch (free, e.g. a KEEP-PASS smoke or a GP-case-run smoke) — this is the ADR-0017 table's "local" row, used for cheap step-mode checks that do not need a model.
- Step mode (ADR-0003, ADR-0012, ADR-0017): default `run.mjs` invocation with no `--all` computes `changed` from `git diff --name-only <base>` plus untracked files, and selects only cases whose `covers` intersects `changed`. `--all` runs every case (full pre-release set).
- `e2e/live/routing-tasks.json`: an array of 20 objects `{ id, size: "small"|"large", prompt, expect }`, 10 each, each with a machine-checkable `expect` (TECH-SPEC §6.5). Referenced by `routing` cases via their `prompt` field — a routing case's `prompt` field is populated from this file at case-build time, not duplicated by hand.

Error case: a case file missing `covers` → the loader (inside `run.mjs`, already written) calls `.some()` on `undefined` and throws; this spec's case files must always include `covers`, even `[]"`, never omit it.

**DECISIONS-r6 live cases.** `e2e/live/cases/memory-r6-eval-local.json` (kind `local`, free) runs deterministic checks from `e2e/live/memory-r6` over the synthetic fixtures in `e2e/live/memory-r6/fixtures/` — no transcript text, no model call. `e2e/live/cases/memory-r6-resume-quality.json` (kind `agent`) checks resume quality from one synthetic fixture, through the `run.mjs` `bin` branch. Both cover `src/core/compaction/` and `src/core/tools/search.ts`, so step mode runs them whenever those paths change. Per DECISIONS-r6 D3, no case here checks a `decision` row from free prose; `candidates.ts` does not select `decision` rows, so no golden file changes for D3.

**DECISIONS-r9 live case specs (T-specs).** One `e2e/live/cases/<id>.json` per id below, `kind: "agent"` unless noted; `covers` and `expect` per its own row in `DECISIONS-r9.md` §V (milestone, n, threshold, scorer there; this file fixes only the id → filename map so no implementer guesses a name):
`e2e/live/cases/gs6-hook-budget.json` (T-GS6, `kind: "local"`, runs `hook-runner.mjs` bench, `jsonField: "p95Ms"`), `e2e/live/cases/case-b-index.json` (T-F1, `kind: "local"`), `e2e/live/cases/windows-grandchild-kill.json` (T-F5, `kind: "local"`, Windows only), `e2e/live/cases/no-fake-savings.json` (T-F3), `e2e/live/cases/route-switch.json` (T-ROUTE), `e2e/live/cases/parallel-batch.json` (T-PAR), `e2e/live/cases/subagent-cap.json` (T-SUB). Each id string inside its JSON file's `id` field is the bare id above (e.g. `"T-GS6"`), so a failing-case report line names the id directly, matching the §9 trace-id row below.

**DECISIONS-r7 live case.** `e2e/live/cases/memory-retrieval-local.json` (kind `local`, free) runs `e2e/live/memory-retrieval/ci-smoke.mjs`, a deterministic recall@5 smoke check fixed to the DECISIONS-r7 measured values (BM25+RRF k=60; no MMR), over the 90-query fixture set from `e2e/live/memory-retrieval`. Covers `src/core/tools/search.ts` and `https://github.com/mksglu/context-mode/tree/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/memory-retrieval/`, so step mode runs it whenever those paths change. The GP5 golden cases for the `decision`/`errorfix`/`timeline` query types (§4 table) cite the same DECISIONS-r7 numbers.

## 7. KEEP-PASS v1 runner

`tests/keep-pass.list.json`:

```ts
type KeepPassList = string[]; // 131 relative paths under tests/, session/, adapters/, hooks/
```

Steps to generate it:
1. Read `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/review/TEST-TRIAGE-r2.md` §"Table per test file" source data (`tests-1.json`, `tests-2.json`, 209 rows).
2. Filter rows with verdict `KEEP-PASS` (131 rows, per TEST-TRIAGE-r2 totals: `session/` 49, `adapters/` 30, `hooks/` 15, `tests/` 37).
3. Write the 131 relative paths, sorted, to `tests/keep-pass.list.json`. This file is the single source of truth GS4's CI lint reads — do not re-derive the list at CI time from the markdown.

M0 step command (DECISIONS-r9 G5, exact string, no variant): `npx vitest run --config tests/vitest.config.ts`.

`tests/vitest.config.ts`:
1. `test.include` = the paths from `tests/keep-pass.list.json`, read at config-load time with `JSON.parse(readFileSync(...))`.
2. These files keep their existing `v1` `src/` import paths unchanged (TECH-SPEC §6.1 named exception) — `vitest.config.ts` does not remap import paths; the module paths these 131 files import must still exist at those paths in `src/` after the v2 rewrite, or the PR that moves a path updates the test in the same diff (TEST-TRIAGE-r2 §"QA round-1" rule).
3. No other test file runs under this config; PORT/RETIRED files are not listed and are excluded by construction.

CI lint (GS4, `.github/workflows/ci.yml` step, owned by `build-release` but reads this module's list): fail if any row in `TEST-TRIAGE-r2.md`'s 221-row ledger (`https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/v2-test-ledger.md`, TECH-SPEC §6.8) has no verdict, or if `e2e/` imports `src/` anywhere except the 131 KEEP-PASS paths.

Deletion gate (TECH-SPEC §6.8): v1 `tests/` (210 files) is deleted in one commit only when every ledger row has a verdict and GS1 (GP1–GP11 pass on 3 OS) holds. This module's file set already reflects the post-deletion state; the deletion commit itself is a `build-release`/repo-wide step, not a file this module owns.

## 8. CI matrix

`.github/workflows/ci.yml` is owned by `build-release`, but its test job calls this module's files, so the contract is fixed here:
1. Matrix: `{os: [macos-latest, ubuntu-latest, windows-latest]} × {node: ["24.15.0", "26.x"]}` — 24.15.0 is the S-NODE minimum (`https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/spikes-r5/S-NODE.md`), 26.x is "current".
2. Per cell: `npm`-free build (ADR-0002, GS7) → run `tests/vitest.config.ts` (KEEP-PASS) → run `e2e/cases/run.mjs` (GP1–GP11) → run `build/prompt-lint.mjs`.
3. Stop the cell on first failing layer (TEST-TRIAGE-r2 exit gate: KEEP-PASS, then GP cases, then lint).
4. Budget: ≤ 10 minutes wall-clock per OS (TECH-SPEC §6.6, tag **[P]**).
5. E2E-live never runs in this matrix (TECH-SPEC §6.6, §6.9; ADR-0012): no key is ever present in CI.

## 9. GP-to-E2E traceability

Every function in every other module's `impl/NN-*.md` file must name, in its own file, the GP case or live case id that proves it, and its ADR-0017 `covers` path — this module supplies the case ids and `covers` values those other files cite:

| GP id | covers (from §4 table) |
|---|---|
| GP1–GP11 | as listed in §4 |
| GP-LIVE-ROUTING | `e2e/live/routing-tasks.json`, any `src/adapters/`, `src/core/policy/` change |
| GP-LIVE-HOOKS | `src/core/hooks/`, `src/entries/hook.ts` |
| T-GS6, T-F1, T-F5, T-F3, T-ROUTE, T-PAR, T-SUB (DECISIONS-r9 §V) | `e2e/live/cases/<id-slug>.json` named in §6 "DECISIONS-r9 live case specs"; each case's own `id` field is the bare id, so a report line reads the id directly, with no lookup table needed at run time |

## Assumptions

- A1: `e2e/live/run.mjs` already exists on disk (not written by this spec); this file documents its JSON case-file contract rather than redefining the script, since TECH-SPEC §6.9 and ADR-0017 both describe behavior the script already implements (verified by reading the file).
- A2: `e2e/cases/GPn-<name>.e2e.mjs` file names use the GP id plus a short slug (e.g. `GP1-install.e2e.mjs`) because `00-architecture.md` names the pattern `GPn-<name>.e2e.mjs` but not the exact slugs; slugs above are taken from the TECH-SPEC §6.2 "Path" column, lower-kebab-cased.
- A3: `tests/keep-pass.list.json` is introduced (not named in `00-architecture.md`) as the single generated source for the 131-file KEEP-PASS list, because GS4 needs one machine-readable list and TEST-TRIAGE-r2.md is prose; `tests/vitest.config.ts` reads this JSON rather than parsing the markdown at CI time.
- A4: normalize.mjs may use regex, since TECH-SPEC §11's no-regex rule binds runtime code under `src/`, and `00-architecture.md` line 9 states "CI scripts may use regex"; `e2e/harness/` is CI/test code.
- A5: the `v1-migration-*` case files (R8, owned by `v1-transition`) are out of this file's scope per `00-architecture.md` §1's e2e/ table row; this spec's §6 format still applies to them, since ADR-0017 gives one `LiveCase` shape for every live case.
- A6 (S7): GP3 needs 40 recorded native hook payloads (10 adapters × 4 canonical events) under `e2e/fixtures/<agent>/<ver>/<event>.json`. As of this doc, `e2e/fixtures/` does not exist on disk (checked: no such path in the repo) — 0 of 40 fixtures are recorded. All 40 must be captured live, one per adapter per event, before any `GP3-hooks.e2e.mjs` case can run; `GP1-install.e2e.mjs` (handshake) can run first with no fixtures since it needs none. The capture step is a one-time manual run per adapter (DECISIONS-r9 item 1/2 work) that writes the file; no synthetic/hand-written fixture is allowed (§4 "never against hand-written strings", #1222).

## Changes

- 2026-10-17: issue-row cases moved to 14a-issue-cases.md (147 cases); every issue-map row now has a verdict.
- r9 (2026-10-16, `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/review/DECISIONS-r9.md`, role S7): §6 adds the DECISIONS-r9 T-spec id-to-filename map (T-GS6, T-F1, T-F5, T-F3, T-ROUTE, T-PAR, T-SUB); §7 adds the exact G5 M0 command `npx vitest run --config tests/vitest.config.ts`; §9 adds a trace-id row for the same T-spec set; Assumptions A6 answers the GP3 fixture-recorder question — 0 of 40 fixtures exist, all must be captured live before any GP3 case runs; §4 GP3 row adds the E1-E5 v1-carve-out golden cases, the P4 parser-coverage golden cases (closes task item 8: `[[`/`((`/function-body/`case`/process-substitution/here-string/`VAR=` deny-or-allow cases), the V8 offline 25-fixture GP3 set, and the V17 `Read` glob-deny set; §4 GP5 row adds V23 (zod non-negative int rejection) and V24 (FTS5 diacritics-folding); §4 GP8 row adds V22 (project-cleanup PID/age case); §4 GP9 row adds V20 (idle-stdin CPU case); §4 GP10 row adds V18 (zero-call stats) and V19 (per-tool sum-to-total).
