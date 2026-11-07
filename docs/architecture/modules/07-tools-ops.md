# 07 — Module `tools-ops`

Owner of `src/core/tools/{doctor,upgrade}.ts` and `src/core/ops/*` (00-architecture.md §1, §2). Imports: `contracts`, `store`, `sandbox`, `adapters`. Exports: `ctxDoctor`, `ctxUpgrade`, `resolvePluginRoot`, `detectV1`, `buildReport`.

Sources: ADR-0010, ADR-0011, DECISIONS-r3 Q16/Q21, DECISIONS-r4 A5/A26/A29/A30/A37/A38–A40/A44/B20/B22/B25/B28/B30/B37/B44/B59/B62/B76/I2-0/I2-14, PRD-v2 §13, TECH-SPEC §3.11/§6.2 (GP1, GP11), 00-architecture.md §3–§5.6.

All files in this module follow 00-architecture.md's rules: one path, no fallback; no literal numbers (use `constants.ts`); no regex for parsing (string-aware scanners only); every constant named from `src/core/contracts/constants.ts`.

## 0. Shared types this module adds to `types.ts`

These are not in 00-architecture.md §3.1; ADR-0010/0011 require them and 00 does not name them, so they are added here (see **Assumptions**, A-T1).

```ts
export type DoctorCheckId = "D1" | "D2" | "D3" | "D4" | "D5" | "D5b" | "D6" | "D7" | "D8" | "D9" | "D10";
export interface DoctorRow {
  id: DoctorCheckId;
  label: string;                 // e.g. "version", "context.db"
  status: "PASS" | "FAIL" | "UNKNOWN";
  detail: string;                // the <cause>, plain English, one line
  fixCommand?: string;           // the <command>; omitted when status is PASS
}
export interface V1Finding { file: string; path: string; reason: string; } // ADR-0011 §"v1 cleanup"
export type UpgradeMode = "upgrade" | "uninstall";
export interface UpgradeChangeRow { area: string; before: string; after: string; }
export interface HostConfigEdit { path: string; before: unknown; after: unknown; } // one key changed
```

## 1. `src/core/ops/plugin-root.ts`

### Export
```ts
export function resolvePluginRoot(adapter: AdapterRow, env: NodeJS.ProcessEnv): string;
```

### Purpose
Single function that finds the on-disk root of the installed plugin/extension for one agent. Called by install, `ctx_upgrade`, and `ctx_doctor`'s D1/D4/D7 checks — never a per-adapter copy (ADR-0010 "one path per install mode, no fallback"; TECH-SPEC §3.11 generalizes v1's Codex-only fix #771 to all 10 agents).

### Inputs
- `adapter: AdapterRow` — from `getAdapter(id)` (module `adapters`).
- `env: NodeJS.ProcessEnv` — process env at call time.

### Output
`string` — absolute, realpath'd plugin root directory. Never cached across calls (PRD §13: "paths resolved when the hook runs and never baked into config", #711, #1005).

### Steps
1. Switch on `adapter.installMode`:
   - `"marketplace"` → read the host's own plugin-cache path convention (Claude Code: `~/.claude/plugins/cache/<marketplace>/context-mode`). Resolve via `env.HOME`, never a literal baked path.
   - `"config-mcp"` / `"mcp-entry"` / `"hooks+mcp"` → read the command/args already written into that agent's host config (module `ops/host-config.ts`) and take the dirname of the resolved script path.
   - `"extension"` (Gemini/Qwen) → the extension's own install dir under the agent's extensions root.
   - `"plugin"` (git checkout: Pi, OpenCode 2) → `<DATA_ROOT>/plugins/<agent>/current` (a symlink maintained by step 4 of §2 below).
   - `"in-process"` → the directory of the currently executing bundle (`import.meta.url` dirname at build time; no filesystem probe).
2. `fs.realpathSync` the result. If the path does not exist, throw `CtxError("PLUGIN_ROOT_MISSING", ...)` (new error key, §4 of this file).
3. Return the realpath string. Caller is responsible for any caching scope (none allowed beyond one request).

### Errors
| Key | Text |
|---|---|
| `PLUGIN_ROOT_MISSING` | `Plugin root for <agent> not found at <path>. Fix: run ctx_upgrade.` |

### E2E proof
GP1 ("after a simulated Claude Code auto-update leaves a stale plugin-cache path, the next install/update detects and fixes it with no manual doctor run", #1090/#1222/#1226) and GP11 ("two install trees", #901). `covers`: `src/core/ops/plugin-root.ts` (00-architecture.md A2 path convention).

## 2. `src/core/ops/host-config.ts`

### Export
```ts
export interface HostConfigResult { text: string; format: "json" | "jsonc" | "toml"; edits: HostConfigEdit[]; }
export function readHostConfig(agent: AgentId, path: string): { text: string; format: "json" | "jsonc" | "toml" };
export function mergeOwnEntries(agent: AgentId, current: string, format: "json" | "jsonc" | "toml", row: AdapterRow): HostConfigResult;
export function stripJsonComments(text: string): string; // string-aware, no regex (TECH-SPEC §3.11, #808)
```

### Purpose
One read/merge path per config format. Regenerates only context-mode's own entries; keeps every other key and every user-set value (ADR-0010 §4, #1226).

### Inputs/Outputs
- `readHostConfig(agent, path)` — reads the file at `path` (already resolved by `resolveConfigDir`, module `store`). Output: raw text plus detected format. `.jsonc` detected by file extension, per agent (OpenCode: `.jsonc` wins over `.json` when both exist, #849).
- `mergeOwnEntries(agent, current, format, row)` — returns the new file text plus a list of what changed (`edits`), for `ctx_upgrade`'s change table.

### Steps (`mergeOwnEntries`)
1. Parse `current` with the format's parser. For `"jsonc"`, first call `stripJsonComments` (character scanner that tracks `"`, `\`, and `//`/`/* */` state — never a whole-file regex, closing #808).
2. Compute the target context-mode block from `adapters/table.ts`'s `row` (MCP entry command/args, 4 hook entries, `row.hookTimeoutMs`).
3. For each target key:
   - If the current file has no value at that key path → write the target value, record one `HostConfigEdit`.
   - If the current file has a value that **matches the v1 shape** (per ADR-0011's per-agent table, module `ops/detect-v1.ts`) → replace it, record the edit.
   - If the current file has a **user-set** value that differs from both the v1 shape and the target (e.g. a custom hook timeout, #1226) → keep the user's value, do not record an edit.
4. Serialize back in the original format. For `"jsonc"`, only the edited keys are touched; untouched text (including comments) is preserved byte-for-byte outside the edited spans.
5. Return `{ text, format, edits }`.

### Errors
| Key | Text |
|---|---|
| `CONFIG_PARSE_FAILED` | `<agent> config at <path> did not parse as <format>. Fix: fix the syntax error and re-run ctx_upgrade.` |

### E2E proof
GP11 ("a broken config"), GP1 ("config valid for the host"), ADR-0010 §4 ("OpenCode `.jsonc` handling"). `covers`: `src/core/ops/host-config.ts`.

## 3. `src/core/ops/detect-v1.ts`

### Export
```ts
export function detectV1(agent: AgentId, home: string): V1Finding[];
```

### Purpose
One pure function per agent's v1 footprint. Never edits anything (ADR-0011 "v1 cleanup"). `ctx_doctor`'s D4 reads it to report; `ctx_upgrade` reads it to remove.

### Inputs
- `agent: AgentId`.
- `home: string` — the agent's home/config root (e.g. `env.HOME`, `~/.claude`, `~/.codex`), passed in by the caller so the function stays pure and testable.

### Output
`V1Finding[]` — zero or more `{ file, path, reason }` rows. Empty array means "no v1 footprint found", never a guess.

### Steps
1. Switch on `agent`. For each, read the fixed file(s) from the ADR-0011 table below and test the fixed rule — no shared regex matcher across agents (ADR-0011: Kiro's flat `.hooks.*` list needs its own scan, not Claude Code's nested-inner-hook matcher):

| Agent | File(s) read | Rule tested |
|---|---|---|
| `claude-code` | `settings.json`; `hooks/context-mode-cache-heal.{mjs,sh}`; `~/.claude.json` | inner hook command contains `"context-mode"` **and** (a v1 script name **or** `"context-mode hook"`); cache-heal files exist; `.mcpServers["context-mode"]` exists |
| `codex` | `hooks.json`; `config.toml` | entry contains `"context-mode hook codex"` or path `hooks/codex/*.mjs`; `[mcp_servers.context-mode*]` section exists |
| `gemini` | `~/.gemini/settings.json` | `.hooks.*` command contains `"context-mode"` |
| `qwen` | `~/.qwen/settings.json` | same rule as `claude-code` |
| `copilot-cli` | `~/.copilot/hooks/context-mode.json` | file exists |
| `vscode` | `<project>/.github/hooks/context-mode.json`; `.vscode/mcp.json` | file exists; MCP entry named `context-mode` exists |
| `kiro` | `~/.kiro/agents/default.json` | flat `.hooks.*` entry whose command contains `"context-mode"` **and** (a v1 script name **or** `"context-mode hook"`) |
| `pi` | `~/.pi/agent/settings.json` | `packages[]` contains `"npm:context-mode"` — re-tested **after** the git entry is added too (so a stale npm entry left alongside the new git entry is still flagged, closing the #901 "two install trees" class) |
| `opencode` | first config found with `.plugin[]` | `.plugin[]` contains the bare string `"context-mode"` |
| `zcode` | `~/.zcode/cli/config.json`; `~/.zcode/cli/hooks.json` | entry tagged `context-mode` (ZCode reuses the Codex config shape, #1268) |

2. For every agent, also test the `All` row: `~/.context-mode/` exists; any `context-mode-*` file exists under the OS temp dir.
3. Push one `V1Finding` per positive test; `reason` is the plain-English rule that matched (used verbatim in the doctor FAIL row and the upgrade change table).
4. Return the collected list. Never delete, never write.

### Errors
None — this function cannot fail; a file that does not exist is simply not a finding.

### E2E proof
`e2e/live/cases/v1-migration-*.json` (ADR-0017 R8: "a temp HOME with a real v1 install per agent → v2 install → `/ctx-upgrade` → doctor clean"), GP11 ("a v1 install on each agent"). `covers`: `src/core/ops/detect-v1.ts`.

## 4. `src/core/ops/report.ts`

### Export
```ts
export function buildReport(rows: DoctorRow[]): string;
```

### Purpose
The one typed scanner that renders the `ctx_doctor` table and caps it, so the cap logic lives in one place for both the tool reply and the bug-report template (ADR-0014).

### Inputs
`rows: DoctorRow[]` — in the fixed order D1→D10 (D5b sits between D5 and D6).

### Output
`string` — a Markdown table, "| Check | Status | Detail | Fix |" header, one row per `DoctorRow`, cut by `capBytes(text, REPORT_CAP)` (constant, §5 below). `fixCommand` renders only when `status === "FAIL"`.

### Steps
1. Build the header row and one row per `DoctorRow` in input order (caller already supplies them in D1…D10 order; this function does not re-sort).
2. For each `FAIL` row, render the exact string from ADR-0010: `` FAIL <host>: <check> — <cause>. Fix: <command> `` where `<host>` is the current agent's id, `<check>` is `row.id`, `<cause>` is `row.detail`, `<command>` is `row.fixCommand`.
3. Join rows with `\n`.
4. `capBytes(text, REPORT_CAP)` — code-point safe cut (module `sandbox`, re-exported here only as a call, not a copy). If cut, append one line: `(report truncated at 4096 B; run ctx_doctor again after the first fix)`.
5. Return the capped text.

### Errors
None.

### E2E proof
GP11 ("doctor table golden"), PRD §13 ("report is ≤ 4,096 B"). `covers`: `src/core/ops/report.ts`.

## 5. `src/core/tools/doctor.ts`

### Export
```ts
export const ctxDoctor: ToolDef<Record<string, never>>; // no input fields; unknown key -> UNKNOWN_FIELD
export function runDoctorChecks(ctx: ToolContext, adapter: AdapterRow): Promise<DoctorRow[]>;
```

### Purpose
`ctx_doctor` MCP tool. Read-only. Runs D1–D10 in order, returns the `buildReport` table. The 7th of the 9 fixed tools (`TOOL_ORDER[6]`).

### Inputs
`ctx: ToolContext` (built by server per 00-architecture.md §5.2 step 2: `project`, `sessionId`, `turn`, `signal`, `clientInfo`, `protocolVersion`).

### Output
`ToolReply { text, isError: false, sandboxBytes }` — `text` is `buildReport(rows)`. `isError` is `false` even when rows contain FAIL entries (a FAIL row is data, not a tool error; ADR-0010 "never writes files… except the one exception in D8").

### Steps (`ctxDoctor.handler`)
1. Resolve `adapter = getAdapter(ctx.project.agent)` (module `adapters`).
2. `rows = await runDoctorChecks(ctx, adapter)`.
3. `text = buildReport(rows)`.
4. Return `{ text, isError: false, sandboxBytes: Buffer.byteLength(text) }`.

### Steps (`runDoctorChecks`) — one sub-step per check, in fixed order

**D1 — version.** Compare the running bundle's embedded version constant against the latest commit on branch `release` via `git ls-remote <repo> release` (module `sandbox`'s `runProcess`, argv form, `shell:false`). No network reachable → status `"UNKNOWN"`, detail `"no network"`, no FAIL (ADR-0010 D1).

**D2 — Node and `node:sqlite`.** Read `process.version` against `NODE_MIN`. Below it → FAIL, detail `"Context Mode needs Node <NODE_MIN> or newer; you have <v>"`, fix `"nvm install 24, or install it from https://nodejs.org"` (#1328 D-NODE-OLD-1) (same cause text as `errors.ts` `NODE_TOO_OLD`, reused verbatim). `await import("node:sqlite")` fails → FAIL, detail `"node:sqlite failed to load"`, fix `"run ctx_doctor"` (reuses `NO_SQLITE`). Also read `process.versions.bun`; when present, detail notes `"running under Bun <v>"` even on PASS (00-architecture.md §1: "the one place the GS6 fallback-chain decision has to change if detection logic changes").

**D3 — host config.** `readHostConfig(adapter.id, resolveConfigDir(...))` then diff **as data** (parsed objects, never string compare) against what `mergeOwnEntries` would generate: the MCP entry, the 4 hook entries, `adapter.hookTimeoutMs`. Mismatch on any of the 3 → FAIL, detail names which of the 3 is wrong, fix `"run ctx_upgrade"`.

**D4 — v1 leftovers.** `findings = detectV1(adapter.id, home)`. Any findings → FAIL, one row per finding is folded into one `DoctorRow` whose `detail` lists each `reason` (joined `"; "`), fix `"run ctx_upgrade"`.

**D5 — hook round trip.** Load the bundled fixture (`fixtures/hook-roundtrip.json`, release tree) and run the hook entry (module `sandbox`'s `runProcess`) with it as stdin. Check: output parses as the adapter's native shape, and wall time ≤ `HOOK_P95_MS`. Either check fails → FAIL.

**D5b — double-fire.** Only when `adapter.id === "vscode"` or `adapter.id === "claude-code"` and the repo has both a `.claude/settings.json` hooks block **and** a VS Code `chat.useClaudeHooks` setting active for the same repo root → FAIL, detail `"both Claude Code hooks and VS Code chat.useClaudeHooks are active for this repo"`, fix `"disable chat.useClaudeHooks or the Claude Code hooks block"`.

**D5 Codex trust sub-case (R6, DECISIONS-r9).** For `adapter.id === "codex"` only: if the hooks file exists on disk but no hook row was ever journaled for any Codex session (module `store`'s event log, filtered `agent:"codex"`), D5's `detail` is `"Codex hooks not trusted"` instead of the round-trip detail, status `"UNKNOWN"` (not FAIL — this is a one-time interactive-CLI trust step, not a broken install). Live-harness callers of `codex exec` pass `--dangerously-bypass-hook-trust` to skip the prompt (S1 `10-adapters.md` §3 `codex.ts` install note); `ctx_doctor` itself never passes this flag.

**D6 — MCP.** Read `ctx.clientInfo.name` and `ctx.protocolVersion` from the live request. Missing both → status `"UNKNOWN"` (per PRD §13 note: `clientInfo` is optional and non-behavioural), never FAIL on this alone.

**D7 — project and worktree.** Compare `ctx.project.source` against the adapter's declared `projectSource`; for `pi`, confirm the resolved path matches `piCwd` captured at plugin-load time. Mismatch → FAIL, detail `"resolved project source <got> does not match the host's actual cwd"`, fix `"restart the agent in the correct directory"`.

**D8 — `context.db`.** Two independent sub-checks, each its own row-worthy state but folded under one `DoctorRow` id `"D8"` with two possible FAIL causes (PRD §13.118/122 keeps them distinct by cause text):
   1. Read `meta.schema_version` (module `store`). If less than the bundle's expected `SCHEMA_VERSION` → FAIL, detail `"stale schema (v<got>, expected v<want>)"`, fix `"run ctx_upgrade"`.
   2. Run `PRAGMA integrity_check`. A row other than `"ok"` → FAIL, detail `"integrity_check failed"`, fix `"run ctx_doctor --fix"` is **not offered as a separate CLI** (PRD §13, Q16: no CLI) — the fix text is `"doctor will heal context.db on the next run"`, and this one FAIL is the trigger for the heal action in step 7 below, the sole write exception.
   If both pass → PASS, detail includes source/chunk counts is **not** D8's job (that is D9).

**D9 — index.** Count rows in `sources` and `chunks` for the current `ctx.project.projectKey`. Zero of either → reported, not silently PASS (closes #1014): status `"PASS"` but detail states `"0 sources, 0 chunks indexed"` — empty is a valid state, not a failure, but it must never read as healthy-and-populated.

**D10 — enforcement mode.** Read the enforcement mode this agent resolves to (module `enforcement`, read-only query of `adapter.denyChannel` plus ADR-0008 mode table) and report it as `detail` on a PASS row; never FAIL (there is no wrong mode, only a reported one).

7. **D8 heal exception.** After all 10 rows are built, if D8's integrity_check sub-check failed: this is the one place `ctx_doctor` writes.
   - If this process is the one holding the WAL checkpoint ownership (module `store`'s `owners.ts` live-PID check) → attempt `healLossless`: open `context.db` read-only, `VACUUM INTO` a new temp file, atomic rename over the original. On success, update D8's row to `status: "PASS"`, `detail: "healed (lossless)"`.
   - Else, or if `healLossless` itself throws → rename `context.db`, `context.db-wal`, `context.db-shm` aside with a timestamp suffix, recreate an empty `context.db` via `openDb`. Update D8's row to `status: "FAIL"` still (so the user sees it happened), `detail: "healed by recreate — old data kept at context.db.<ts>.bak"`.
8. Return the 11 rows (D1, D2, D3, D4, D5, D5b, D6, D7, D8, D9, D10) in that fixed order.

### Errors
`ctxDoctor.handler` itself cannot return `isError: true` under this spec — every failure mode becomes a `FAIL` row instead, per ADR-0010 ("doctor always answers, even in a degraded start", PRD §13.312). The only thrown exception is an `UNKNOWN_FIELD` zod validation error from an unrecognized input key, handled by the server before the handler runs (00-architecture.md §5.2 step 1).

### Constants used
`NODE_MIN`, `HOOK_P95_MS`, `REPORT_CAP` (via `buildReport`), `OUTPUT_CAP` (final reply is still capped a second time by the server per §5.2 step 4, since `REPORT_CAP` 4096 B < `OUTPUT_CAP` 16384 B this second cap never triggers — stated so no one adds a redundant check).

### E2E proof
GP11 full row (doctor table golden: stale-schema and integrity_check failure as distinct rows; D8 heal "zero data loss on non-corrupt rows"; D9 empty-index; D5b double-fire; "with no `[features].hooks` key in Codex config, doctor still reports `hooks=true`"). `covers`: `src/core/tools/doctor.ts` (mapped from TECH-SPEC's `src/doctor/` per 00-architecture.md A2).

## 6. `src/core/tools/upgrade.ts`

### Export
```ts
export interface CtxUpgradeInput { mode?: UpgradeMode; confirmDelete?: boolean; }
export const ctxUpgrade: ToolDef<CtxUpgradeInput>;
```
`mode` defaults to `"upgrade"` when omitted. `confirmDelete` defaults to `false`.

### Purpose
`ctx_upgrade` MCP tool. Covers install-time config generation (called once automatically right after install, outside the MCP tool surface, by the install script — see step 0 below), in-session upgrade, and uninstall as `mode: "uninstall"` (Q16, Q21). The 8th of the 9 fixed tools.

### Inputs
`input: CtxUpgradeInput`, `ctx: ToolContext`.

### Output
`ToolReply { text, isError: false, sandboxBytes }` — `text` is a Markdown table of `UpgradeChangeRow[]` plus the literal trailing line `"restart needed"` (ADR-0010 §4 step 6; PRD §13).

### Steps (`ctxUpgrade.handler`)
1. `adapter = getAdapter(ctx.project.agent)`.
2. **Step 0 (always, both modes):** run D1's plugin-cache-path check inline (not a separate tool call) — `resolvePluginRoot(adapter, process.env)` then compare against the bundle's own install dir; if they differ, this is the stale-cache class (the upstream Claude Code auto-update bug, I2-0) and step 4 below corrects it as part of the same run. This runs on every `ctx_upgrade` call, not only a manual `ctx_doctor`.
3. If `input.mode === "uninstall"` → go to **Uninstall steps** below. Else continue.
4. **Upgrade steps**, by `adapter.installMode`:
   - `"marketplace"` or any host-managed mode (`claude-code`, `codex`, `gemini`, `qwen`, `copilot-cli`): do not fetch anything. Build one `UpgradeChangeRow` whose `area` is `"host update"`, `before` is `""`, `after` is the exact command string from ADR-0011's table (e.g. for `codex`: `"rewrite config.toml's [mcp_servers.context-mode*] block to the v2 entry, then restart Codex"`). Skip to step 4d (config) — host-managed agents still get their own config entries regenerated by `ctx_upgrade` itself per ADR-0010 §4 ("ctx_upgrade does not download anything itself; it only does steps 3–5" i.e. config regen onward).
   - `"plugin"` (git checkout: `pi`, `opencode`): 
     a. `runProcess(["git", "fetch", "origin", "release"], {...})` into a new version dir under `<DATA_ROOT>/plugins/<agent>/<sha>`.
     b. Verify the bundle hash against `SHA256SUMS` in the fetched tree. Mismatch → throw `CtxError("BUNDLE_HASH_MISMATCH", ...)`.
     c. Atomically `fs.rename` the `current` symlink (from `resolvePluginRoot`'s `"plugin"` case) to point at the new dir.
     d. Keep the previous dir on disk (do not delete) — exactly one rollback generation; a second upgrade deletes the generation two back.
   - `opencode` additionally: this is the same git-checkout path, never an npm spec for the plugin entry (ADR-0010 §3(c); the npm channel is `context-mode upgrade`, ADR-0019).
5. **Config regeneration** (all modes reach this step): `current = readHostConfig(adapter.id, resolveConfigDir(...))`; `result = mergeOwnEntries(adapter.id, current.text, current.format, adapter)`; write `result.text` back to the same path. For OpenCode specifically, write to the `.jsonc` path when one exists (format already selected by `readHostConfig`, #849).
6. **v1 removal**: `findings = detectV1(adapter.id, home)`. For each finding whose rule says "remove" (every ADR-0011 row except the Claude-Code/VS-Code "report, don't remove" exceptions for a user-added MCP entry/`statusLine`/`.vscode/mcp.json` entry): delete the file or strip the entry, add one `UpgradeChangeRow` per removal (`area: finding.file`, `before: finding.reason`, `after: "removed"`). For the report-only exceptions: add one `UpgradeChangeRow` with `after` equal to the fix text, and do not touch the file.
7. Build the final table: step 4's rows + step 5's `result.edits` (as rows) + step 6's rows.
8. Return `{ text: table + "\n\nrestart needed", isError: false, sandboxBytes }`.

### Steps (Uninstall, `mode === "uninstall"`)
1. Stop the server: write a stop marker read by the owning process (module `store`'s `owners.ts`); the current process, if it is the owner, closes its own DB and exits after replying.
2. Remove the cache: delete `resolvePluginRoot(adapter, env)`'s directory tree (for `"plugin"` mode, delete both `current` and any kept rollback generation).
3. Remove context-mode's own config entries: same `mergeOwnEntries` call as upgrade step 5, but with an empty target row (so every context-mode key is dropped, not regenerated).
4. If `input.confirmDelete === true`: also delete `~/.context-mode/projects/<ctx.project.projectKey>` (this project's data only — never another project's, per `isInside` containment, module `store`). `input.confirmDelete` absent or `false` → user data at `~/.context-mode/` is left untouched; add one `UpgradeChangeRow` noting `"user data kept (confirmDelete not set)"`.
5. These three areas (stop, cache, own-config-entries) always run regardless of `confirmDelete` (DECISIONS-r3 Q21: "a contract test asserting all three, not just one").
6. Return the change table + `"restart needed"`.

### Errors
| Key | Text |
|---|---|
| `BUNDLE_HASH_MISMATCH` | `Fetched bundle hash does not match SHA256SUMS. Fix: run ctx_upgrade again.` |
| `CONFIG_PARSE_FAILED` | (re-thrown from `host-config.ts`, §2 above) |

### Constants used
`DATA_ROOT`, `OUTPUT_CAP` (final reply cap, server-side per §5.2 step 4).

### E2E proof
GP11 ("upgrade keeps user values, removes v1 entries, no baked paths, rollback works"), `e2e/live/cases/v1-migration-*.json` (ADR-0017 R8: "install v2 → `/ctx-upgrade` → doctor clean → a routing case passes" and the named case "install v2 → `/ctx-upgrade` → `npm uninstall -g` → Copilot CLI and VS Code hooks keep working"). `covers`: `src/core/tools/upgrade.ts`.

## 7. Implementation order for this module

1. `ops/plugin-root.ts` — no dependents yet depend on it being wrong; build and unit-test first.
2. `ops/host-config.ts` — depends on `plugin-root.ts` only for path resolution context, not a call.
3. `ops/detect-v1.ts` — pure, independent; can be built in parallel with 1–2.
4. `ops/report.ts` — depends on nothing in this module; needs `sandbox.capBytes` only.
5. `tools/doctor.ts` — depends on 1–4 plus `store`, `sandbox`, `adapters`.
6. `tools/upgrade.ts` — depends on 1–3 plus `store`, `sandbox`, `adapters`; built last because it is the only function in this module that writes.

This order matches 00-architecture.md's file-tree listing order (`doctor.ts`, `upgrade.ts`, then `ops/*`) only in *presentation*; build order is dependency order, listed above.

## 8. `ctx_stats` decisions owned here (DECISIONS-r9 V5, V18, V19; function lives in `06-tools-session.md`)

- V5: the savings number shown to the user comes only from `ctx_stats` output (measured byte counts the server already tracked). No tool-description or hint text tells the model about savings. A scorer must never read a savings claim out of model-generated text; it reads `ctx_stats`'s own reply. Test spec T-F3 (`14-tests.md` §6).
- V18 (GP10, issue #1248): `ctx_stats` called in a session with zero prior tool calls returns a reply with zero rows and `isError: false` (an empty session is valid, not an error — same pattern as D9's "0 sources, 0 chunks" above).
- V19 (GP10, issue #950): for a known call sequence, the sum of every per-tool row's count equals the total row's count exactly; no double-count, no dropped call.

## Assumptions

- A-T1: `DoctorRow`, `V1Finding`, `UpgradeMode`, `UpgradeChangeRow`, `HostConfigEdit` are added to `types.ts` here because ADR-0010/0011 require these shapes (doctor row, v1 finding `{file,path,reason}`, upgrade change table) but 00-architecture.md §3.1 does not list them. Kept consistent with 00's existing naming style (PascalCase interfaces, `AgentId`-keyed fields).
- A-T2: `PLUGIN_ROOT_MISSING`, `BUNDLE_HASH_MISMATCH`, `CONFIG_PARSE_FAILED` are added to `errors.ts`'s key table because they are specific to this module and not in 00-architecture.md §3.3's list, which covers only the tools-exec/tools-index error set.
- A-T3: `ctx_doctor`'s zod schema is `z.object({}).strict()` (no fields) so any input key triggers `UNKNOWN_FIELD`; ADR-0010 and PRD §13 describe no doctor arguments.
- A-T4: `ctx_upgrade`'s zod schema is `z.object({ mode: z.enum(["upgrade","uninstall"]).optional(), confirmDelete: z.boolean().optional() }).strict()`; Q16 names only `confirmDelete`, and `mode` is needed to select uninstall per Q16 ("a mode of `ctx_upgrade`"). `"install"` is not a selectable mode here because 00-architecture.md §5.5 step 1 shows install happening before the server/tool exists; this tool only ever runs as upgrade or uninstall once the server is live.
- A-T5: D8 is modeled as one `DoctorRow` carrying either of two FAIL causes (stale-schema, integrity_check), per TECH-SPEC §3.11's "two separate FAIL rows" language read against ADR-0010's single `D8` id — TECH-SPEC's "two rows" is satisfied by one row id whose `detail` names which of the two failed, since ADR-0010 numbers D8 as one check and PRD §13 lists D1–D10 as ten ids, not eleven.
- A-T6: `covers` paths in this file use the PRD/00-architecture source tree (`src/core/tools/doctor.ts`, `src/core/tools/upgrade.ts`, `src/core/ops/*`), not TECH-SPEC §13's `src/doctor/`/`src/upgrade/`, matching 00-architecture.md's own Assumption A2.

- A-intern-M5 (answers to `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/.impl/intern-M5.md` Q1-Q10, read against `src/core/ops/*`, `src/core/tools/{doctor,upgrade}.ts`). Each answer is the rule now in force; the DEVIATIONS row is its source.
  - Q1 plugin root: marketplace mode takes the one child of `~/.claude/plugins/cache/` that holds a `context-mode` dir; zero or several is `PLUGIN_ROOT_MISSING`, never a pick. Config modes read `OWN_MCP_ENTRY[agent]`. Every path is realpath'd; a realpath failure is an error, not a second lookup (D-M5-O1-1).
  - Q2 host config shape: `readHostConfig` returns `{agent, text, format, path}`; `path` is the file read (OpenCode `.jsonc` wins over `.json`, #849); a missing file reads as `{}`. `writeHostConfigEdit` edits spans so comments stay; a TOML section is rewritten whole (D-M5-O1-3, D-M5-O1-4).
  - Q3 check order: `DOCTOR_CHECK_ORDER` (D1..D5, D5b, D6..D10) is the order of the table. D8 heal is the only write and runs after every row is built, so the other rows report the state before the heal (D-M5-D5-1).
  - Q4 version check: D1 compares `BUNDLE_SHA` (esbuild define, `build.mjs --sha`) with `git ls-remote RELEASE_REPO_URL RELEASE_BRANCH`. Equal: PASS. Different: FAIL "update available". No network: UNKNOWN. No `--sha`: dev build (D-M5-arch-5, D-M5-B1-1).
  - Q5 v1 data: `V1_DATA_ROOT_ENTRIES` (`content/`, `platform.json`) mark v1 data inside `DATA_ROOT`; v2 entries (`projects/`, `plugins/`) never match. Temp files give one finding for the dir at the first `context-mode-*` match (D-M5-O2-1, D-M5-O2-4).
  - Q6 plugin helpers: Pi `checkPermission` and OpenCode `toCanonicalTool` live on the adapter row, not in `types.ts`; Pi deny adds `role:"custom"`, `content`, `timestamp` (#1263, #1180) (D-M5-A1-1; impl/10 §10/§11, impl/12).
  - Q7 cost rows: schema v2 (`SCHEMA_VERSION = 2`) adds the partial unique index `events(session_id, turn) WHERE kind = 'cost'`; the writer uses `INSERT OR IGNORE` and returns the kept row's `seq` on a duplicate (D-M5-arch-2, D-M5-S1-1).
  - Q8 texts: every label, detail and fix text is a constant in `constants.ts` (`DOCTOR_LABEL`, `REPORT_HEADER`, `REPORT_TRUNCATED_LINE`, `DOCTOR_FAIL_LINE`, ...). A new text is a new constant plus a GP11 golden change, never a literal in `doctor.ts` (D-M5-C2-1).
  - Q9 merge scope: `mergeOwnEntries` owns the MCP entry (`OWN_MCP_ENTRY[agent].key`) and OpenCode `plugin[]` / Pi `packages[]` only. Hook entries belong to the build manifests (`build/manifests.ts`); D3 compares against those. Every other key is kept (D-M5-O1-4).
  - Q10 v1 hook file: a `context-mode.json` hook file is v1 only if a command contains `context-mode hook`; an MCP entry is v1 only if its command or an `args` item is the bare `context-mode` bin. v2 commands run `hook.mjs`/`server.mjs` and never match (D-M5-O2-3).

## Changes

- 2026-10-16 (DECISIONS-r9, S8): added D5's Codex-trust sub-case (R6: `"Codex hooks not trusted"` detail, status `UNKNOWN`, `--dangerously-bypass-hook-trust` is a live-harness flag only, never passed by `ctx_doctor` itself); added §8 naming the three `ctx_stats` decisions this module cites (V5 savings-from-`ctx_stats`-only, V18 zero-rows `isError:false`, V19 per-tool rows sum to total).

---

Files written: `/Users/mksglu/.claude/claude-worktree-workspaces/oss-new/docs/architecture/modules/07-tools-ops.md`
