# 00 — Architecture contract (context-mode v2)

Every module writer follows this file. Sources: PRD-v2 §3–§18, TECH-SPEC §1–§12, ADR-0001–0017, DECISIONS-r3 (Qn), DECISIONS-r4 (An), spikes-r5.

Rules for all code:
- One path, no fallback chains (PRD P1). A missing input returns one line that names the fix.
- Hooks are pure: no DB open on the PreToolUse path, no network, no spawn (PRD P4). Journal writes from hooks are detached (GP3, A32).
- Idle server = 0% CPU: no timers, no boot probes, no `ps` (PRD P5, GP9).
- No regex in runtime code for parsing or reduction (TECH-SPEC §11). CI scripts may use regex.
- Every constant comes from `src/core/contracts/constants.ts`. No literal numbers elsewhere.
- `e2e/` never imports `src/` (GS4).

## 1. Source tree

Owner column = module id (§2).

### src/

| Path | Purpose | Owner |
|---|---|---|
| `src/core/contracts/types.ts` | Shared types (§3.1) | contracts |
| `src/core/contracts/constants.ts` | Every named constant (§3.2) | contracts |
| `src/core/contracts/errors.ts` | `CtxError` class + error text table | contracts |
| `src/core/contracts/agents.ts` | `AGENT_IDS` tuple, `AgentId` type | contracts |
| `src/core/project/resolve.ts` | `resolveProject()` → `ProjectContext` (git common dir hash) | store |
| `src/core/project/contain.ts` | `isInside(root, p)` by path components | store |
| `src/core/project/config-dir.ts` | `resolveConfigDir()` the one config-dir reader (§6.2a) | store |
| `src/core/store/db.ts` | `openDb()`, `withWrite()`, close + checkpoint | store |
| `src/core/store/schema.ts` | DDL, `SCHEMA_VERSION`, migrations | store |
| `src/core/store/owners.ts` | `owners/<server-id>.pid` write/remove, live-PID check | store |
| `src/core/store/cleanup.ts` | retention + dead-project delete inside one lock | store |
| `src/core/store/fts.ts` | FTS5 insert, BM25 query, `highlight()` clip + sanitize | store |
| `src/core/journal/append.ts` | `appendEvent()` the one journal write path | store |
| `src/core/journal/read.ts` | `readSessionEvents()`, `readEventBySeq()` | store |
| `src/core/sandbox/spawn.ts` | `runProcess()` argv spawn, `shell:false`, env | sandbox |
| `src/core/sandbox/runtimes.ts` | lazy PATH lookup per language | sandbox |
| `src/core/sandbox/kill.ts` | `killTree(pid)` Unix group / Windows `taskkill /F /T /PID` | sandbox |
| `src/core/sandbox/env.ts` | `buildChildEnv()` strips `NODE_OPTIONS`, preload | sandbox |
| `src/core/sandbox/cap.ts` | `capBytes()` code-point safe cut at `OUTPUT_CAP` | sandbox |
| `src/core/sandbox/fetch.ts` | `safeFetch()` proxy + SSRF per hop | sandbox |
| `src/core/tools/registry.ts` | `TOOLS` array, fixed order of 9 | server |
| `src/core/tools/execute.ts` | `ctx_execute` | tools-exec |
| `src/core/tools/batch.ts` | `ctx_batch` | tools-exec |
| `src/core/tools/run-wrapper.ts` | subagent case-B wrapper body (`run.mjs`) | tools-exec |
| `src/core/tools/index.ts` | `ctx_index` (path, content, url) | tools-index |
| `src/core/tools/search.ts` | `ctx_search` | tools-index |
| `src/core/index/chunk.ts` | Markdown/HTML/text chunker (~1 MB write batches) | tools-index |
| `src/core/index/walk.ts` | dir walk, nested `.gitignore`, `**` glob | tools-index |
| `src/core/index/select.ts` | `selectChunks()` budgeted greedy, BM25 vs intent | tools-index |
| `src/core/tools/resume.ts` | `ctx_resume` | tools-session |
| `src/core/tools/purge.ts` | `ctx_purge` | tools-session |
| `src/core/tools/stats.ts` | `ctx_stats` | tools-session |
| `src/core/compaction/candidates.ts` | candidate sections, ≤ 85 each | tools-session |
| `src/core/compaction/score.ts` | integer score + decay table | tools-session |
| `src/core/compaction/render.ts` | `renderState()` lazy greedy ≤ 2,048 B | tools-session |
| `src/core/tools/doctor.ts` | `ctx_doctor` D1–D10 + `ctx-report` | tools-ops |
| `src/core/tools/upgrade.ts` | `ctx_upgrade` install/upgrade/uninstall | tools-ops |
| `src/core/ops/plugin-root.ts` | `resolvePluginRoot(adapter)` | tools-ops |
| `src/core/ops/host-config.ts` | JSONC/TOML read, merge own entries, keep user keys | tools-ops |
| `src/core/ops/detect-v1.ts` | `detectV1(agent)` pure report | tools-ops |
| `src/core/ops/report.ts` | typed scanner, `ctx-report` ≤ 4,096 B | tools-ops |
| `src/core/policy/lexer.ts` | shell lexer state machine | enforcement |
| `src/core/policy/parse.ts` | recursive descent → simple commands | enforcement |
| `src/core/policy/unwrap.ts` | unwrap `sudo env time nice timeout xargs command bash -c sh -c $() \`\`` | enforcement |
| `src/core/policy/decide.ts` | `decide(call)` → `Decision` | enforcement |
| `src/core/policy/subagent.ts` | case A/B/C pick | enforcement |
| `src/core/policy/user-deny.ts` | read user `permissions.deny` | enforcement |
| `src/core/hooks/dispatch.ts` | `handleHook(agent, raw)` per canonical event | hooks |
| `src/core/hooks/throttle.ts` | once-per-session hint marker | hooks |
| `src/core/hooks/detached.ts` | fire-and-forget journal write | hooks |
| `src/core/lifecycle/exit.ts` | stdin EOF → SIGTERM 2 s → SIGKILL 5 s; TTY gate | server |
| `src/adapters/table.ts` | one row per agent (§3.1 `AdapterRow`) | adapters |
| `src/adapters/{claude-code,codex,gemini,qwen,copilot-cli,vscode,kiro,zcode}.ts` | `decode`/`encode`, 30–80 lines | adapters |
| `src/adapters/{pi,opencode}.ts` | in-process glue (event mapping only) | adapters |
| `src/entries/server.ts` | MCP server entry | server |
| `src/entries/hook.ts` | hook entry | hooks |
| `src/entries/pi.ts` | Pi plugin entry | plugins |
| `src/entries/opencode.ts` | OpenCode 2 plugin entry, exports `{id, setup}` | plugins |
| `src/prompt/instructions.md` | server instructions bytes | server |
| `src/prompt/tools/<tool>.md` ×9 | tool descriptions | server |
| `skills/ctx-stats/SKILL.md`, `skills/ctx-doctor/SKILL.md`, `skills/ctx-upgrade/SKILL.md` | 3 command skills | build-release |

### build/, CI, repo

| Path | Purpose | Owner |
|---|---|---|
| `build/build.mjs` | esbuild: 7 bundles (server, hook, run, search, pi, opencode, cli), inline prompt md; the hook bundle is minified (D-CI-PERF-4); writes the ADR-0019 D1 `package.json` out | build-release |
| `build/manifests.ts` | generate every manifest + hook config from `adapters/table.ts` | build-release |
| `build/hash.mjs` | `SHA256SUMS` over the release tree | build-release |
| `build/check-removed.mjs` | GS5: fail if a removed path or routing file exists | v1-transition |
| `.github/workflows/ci.yml` | 3 OS × Node 24.15.0 + 26.x; GP1–GP11 + KEEP-PASS + lint | build-release |
| `.github/workflows/release.yml` | `workflow_dispatch`: build → stage → smoke → promote | build-release |
| `.github/ISSUE_TEMPLATE/{bug.yml,feature.yml,config.yml}` | issue forms (ADR-0014) | build-release |
| `.claude/skills/release/SKILL.md` | `/release` repo skill | build-release |
| `build/prompt-lint.mjs` | PR1–PR12 lint, calls `lintPromptText` (§4) for PR1/PR2 | build-release |
| `README.md` | outline + "Upgrading from v1" table (R5, R7) | v1-transition |
| `tests/` | v1 tests; 131 KEEP-PASS on vitest | tests |

### e2e/

| Path | Purpose | Owner |
|---|---|---|
| `e2e/harness/mcp-client.mjs` | spawn bundle, speak MCP stdio as a given clientInfo | tests |
| `e2e/harness/hook-runner.mjs` | spawn hook entry with payload; stdout, exit, wall ms | tests |
| `e2e/harness/db-dump.mjs` | read-only `node:sqlite` dump | tests |
| `e2e/harness/normalize.mjs` | volatile-field rules (TECH-SPEC §6.4) | tests |
| `e2e/harness/live/<agent>.mjs` | headless drivers | tests |
| `e2e/fixtures/<agent>/<ver>/<event>.json` | recorded native payloads | tests |
| `e2e/golden/GPn/<case>.json` | golden outputs | tests |
| `e2e/cases/GPn-<name>.e2e.mjs` | `node:test` cases | tests |
| `e2e/cases/run.mjs` | runs all GP cases | tests |
| `e2e/live/run.mjs` | keyless live harness (exists) | tests |
| `e2e/live/cases/*.json` | live cases with `covers` | tests |
| `e2e/live/routing-tasks.json` | 10 small + 10 large tasks | tests |
| `e2e/live/cases/v1-migration-*.json` | R8 case set | v1-transition |

### release branch (CI output only)

```
server.mjs            src/entries/server.ts bundle (prompt inlined)
hook.mjs              src/entries/hook.ts bundle (minified, D-CI-PERF-4)
cli.mjs               src/entries/cli.ts bundle, npm bin (ADR-0019 D1)
package.json          ADR-0019 D1 shape: name, version, bin, type, engines, files, pi
run.mjs               subagent case-B wrapper
pi/index.js           Pi plugin
opencode/plugin.js    OpenCode 2 plugin
fixtures/hook-roundtrip.json   D5 fixture
skills/ctx-{stats,doctor,upgrade}/SKILL.md
.claude-plugin/plugin.json  .codex-plugin/plugin.json  gemini-extension.json  qwen-extension.json
copilot/plugin.json  hooks/<agent>.json (generated)
SHA256SUMS
```
One `package.json` in the ADR-0019 D1 shape (no `dependencies`, no `scripts`), no `node_modules` (ADR-0002 GS7 as amended, ADR-0019).

## 2. Modules

Import graph is a DAG. A module may import only the modules in its "Imports" cell. `node:*` built-ins are always allowed. External deps: `@modelcontextprotocol/server` 2.3.1 (server only), `zod` (tools-*, server).

| Id | Owns | Imports | Exports |
|---|---|---|---|
| contracts | `src/core/contracts/*` | — | types §3.1, constants §3.2, `CtxError` |
| store | `src/core/{project,store,journal}/*` | contracts | `resolveProject`, `isInside`, `resolveConfigDir`, `openDb`, `withWrite`, `closeDb`, `appendEvent`, `readSessionEvents`, `readEventBySeq`, `ftsInsert`, `ftsQuery`, `metaGet/Set/Take` |
| sandbox | `src/core/sandbox/*` | contracts, store (`isInside` only) | `runProcess`, `killTree`, `findRuntime`, `buildChildEnv`, `capBytes`, `safeFetch` |
| tools-index | `src/core/tools/{index,search}.ts`, `src/core/index/*` | contracts, store, sandbox | `ctxIndex`, `ctxSearch`, `selectChunks`, `indexText` |
| tools-exec | `src/core/tools/{execute,batch,run-wrapper}.ts` | contracts, store, sandbox, tools-index | `ctxExecute`, `ctxBatch`, `runWrapperMain` |
| tools-session | `src/core/tools/{resume,purge,stats}.ts`, `src/core/compaction/*` | contracts, store | `ctxResume`, `ctxPurge`, `ctxStats`, `renderState` |
| adapters | `src/adapters/*` | contracts | `ADAPTERS`, `getAdapter`, per-agent `decode`/`encode` |
| enforcement | `src/core/policy/*` | contracts, adapters (row data only) | `decide`, `parseShell`, `pickSubagentCase` |
| tools-ops | `src/core/tools/{doctor,upgrade}.ts`, `src/core/ops/*` | contracts, store, sandbox, adapters | `ctxDoctor`, `ctxUpgrade`, `resolvePluginRoot`, `detectV1`, `buildReport` |
| hooks | `src/core/hooks/*`, `src/entries/hook.ts` | contracts, adapters, enforcement, store (journal + meta only), tools-session (`renderState`), tools-index (`selectChunks`, `indexText`) | `handleHook`, hook `main()` |
| server | `src/core/tools/registry.ts`, `src/core/lifecycle/*`, `src/entries/server.ts`, `src/prompt/*` | contracts, store, tools-exec, tools-index, tools-session, tools-ops, adapters | `TOOLS`, `startServer`, `INSTRUCTIONS` |
| plugins | `src/entries/{pi,opencode}.ts` | contracts, server (`TOOLS`, `INSTRUCTIONS`), hooks (`handleHook`), adapters | Pi extension default, OpenCode `{id, setup}` |
| build-release | `build/*` (except check-removed), workflows, skills, issue forms, lint | adapters (via esbuild at build time) | bundles, manifests |
| tests | `e2e/*` except v1-migration, `tests/` runner config | none from `src/` | GP cases, harness |
| v1-transition | `build/check-removed.mjs`, `README.md`, `e2e/live/cases/v1-migration-*` | tools-ops (`detectV1` behavior via E2E only) | R1–R8 gates |

No cycle: contracts → store → sandbox → tools-index → tools-exec; adapters → enforcement → hooks; all tools → server → plugins.

## 3. Shared types and constants

### 3.1 Types (`src/core/contracts/types.ts`, `agents.ts`)

```ts
export const AGENT_IDS = ["claude-code","codex","gemini","qwen","copilot-cli","vscode","kiro","zcode","pi","opencode"] as const; // TECH-SPEC §2
export type AgentId = typeof AGENT_IDS[number];

export type CanonicalEventName = "SessionStart" | "UserPromptSubmit" | "PreToolUse" | "PostToolUse"; // ADR-0001, PRD §10.1
export type AuxEventName = "PreCompact"; // only for pending_compact on gemini, copilot-cli, vscode (ADR-0009 §6)

export interface CanonicalHookEvent {
  event: CanonicalEventName | AuxEventName;
  agent: AgentId;
  sessionId: string;
  cwd: string;
  agentId?: string;        // subagent marker; presence = subagent (Q23)
  agentType?: string;      // selects tool-set row only
  source?: "startup" | "resume" | "clear" | "compact"; // SessionStart
  prompt?: string;         // UserPromptSubmit
  tool?: ToolCall;         // Pre/PostToolUse
  result?: ToolResultInfo; // PostToolUse
  turn?: number;
}

export interface ToolCall {
  name: string;            // host name as received, e.g. mcp__context-mode__ctx_execute
  canonicalName: string;   // "Bash" | "Read" | "Grep" | "WebFetch" | "ctx_execute" | ... | "mcp:<server>:<tool>"
  input: Record<string, unknown>;
  callId?: string;
}

export interface ToolResultInfo { isError: boolean; bytes: number; text?: string; exitCode?: number; }

export type Decision =
  | { kind: "allow" }
  | { kind: "hint"; text: string; onceKey: string }
  | { kind: "deny"; reason: string; rewritten?: string }       // ADR-0008: reason carries the rewrite; never allow+updatedInput (Q3)
  | { kind: "replace"; output: string };                        // case C, PostToolUse updatedToolOutput (ADR-0016)

export interface HookOutput { stdout: string; exitCode: 0 | 2; } // native shape produced by adapter.encode

export type EventKind = "prompt" | "edit" | "cmd" | "toolerr" | "index" | "cost" | "decision"; // ADR-0009 §1 + GP10 + DECISIONS-r6 D3
export interface JournalRow {
  seq: number; session_id: string; worktree: string; agent: AgentId;
  kind: EventKind; tool: string | null; key: string | null; path: string | null;
  ok: 0 | 1; exit_code: number | null; bytes: number; body: string; turn: number;
  sandbox_bytes: number; returned_bytes: number; created_at: number; accessed_at: number;
}
export type NewJournalRow = Omit<JournalRow, "seq" | "created_at" | "accessed_at">;

export interface ProjectContext {
  projectKey: string;      // sha256(git common dir realpath) hex, first 16 chars
  projectDir: string;      // ~/.context-mode/projects/<projectKey>
  dbPath: string;          // <projectDir>/context.db
  worktree: string;        // realpath of this worktree root
  containmentRoot: string; // git common dir parent; all worktrees inside (#954, #1294)
  agent: AgentId;
  source: ProjectSourceKind;
}
export type ProjectSourceKind = "env:CLAUDE_PROJECT_DIR" | "arg:--agent+cwd" | "arg:workspaceFolder" | "spawn-cwd" | "pi:ctx.cwd";

export interface ToolContext { project: ProjectContext; sessionId: string; turn: number; signal: AbortSignal; clientInfo?: { name: string; version: string }; protocolVersion: string; }
export interface ToolReply { text: string; isError: boolean; sandboxBytes: number; }
export interface ToolDef<I> { name: string; description: string; schema: import("zod").ZodType<I>; readOnly: boolean; alwaysLoad: boolean; handler(input: I, ctx: ToolContext): Promise<ToolReply>; }

export interface AdapterRow {
  id: AgentId;
  installMode: "marketplace" | "config-mcp" | "extension" | "plugin" | "mcp-entry" | "hooks+mcp" | "in-process";
  projectSource: ProjectSourceKind;
  toolNamePrefix: string;  // e.g. claude-code/vscode/kiro "mcp__context-mode__", codex "mcp__context_mode__" (underscore — DECISIONS-r9 R1), gemini "mcp_context-mode_", opencode "context-mode_"
  nativeTools: { shell: string[]; read?: string[]; grep?: string[]; webfetch?: string[]; edit?: string[] }; // DECISIONS-r9 R4; feeds the PreToolUse/PostToolUse matcher and in-body filters
  execReadOnlyHint: boolean; // DECISIONS-r9 R5; true only for codex, sets annotations.readOnlyHint on ctx_execute
  eventMap: Partial<Record<CanonicalEventName | AuxEventName, string>>; // canonical → native name
  compactDelivery: "sessionstart" | "pending-flag" | "pi-flag" | "opencode-cache" | "none";
  compactSummary: "host" | "none";  // "host": host writes its own compact summary (verified by LV-COMPACT, M3); "none": inject the 2,048 B D1 block via the ADR-0009 §6 path. DECISIONS-r6 D6.
  hookTimeoutMs: number;
  denyChannel: "deny-reason" | "hint-only";
  decode(raw: unknown): CanonicalHookEvent;
  encode(ev: CanonicalHookEvent, d: Decision, extra?: string): HookOutput;
}
```

`nativeTools` values (DECISIONS-r9 R4): `claude-code` shell `["Bash"]`, read `["Read"]`, grep `["Grep"]`, webfetch `["WebFetch"]`, edit `["Write","Edit","NotebookEdit"]`; `codex` shell `["Bash"]`, edit `["apply_patch"]`; `qwen` shell `["run_shell_command","Shell"]`, read `["read_file"]`, grep `["grep_search"]`, webfetch `["web_fetch"]`; `zcode` same as `claude-code`, marked unverified (T-ZC); `gemini`/`copilot-cli`/`vscode` carry the same per-agent set but filter inside the hook body, not via a host matcher (no host-side matcher field to fill); `kiro`/`pi`/`opencode` empty `{shell:[]}` (no native-tool gate; enforcement runs through `decide()` directly). The generated matcher (`build/manifests.ts`) is `^(<all nativeTools[] values for the row, alternated>|<escaped toolNamePrefix>ctx_.*)$`.

### 3.2 Constants (`src/core/contracts/constants.ts`)

| Name | Value | Source |
|---|---|---|
| `SERVER_KEY` | `"context-mode"` | TECH-SPEC §3.8 rule 3 |
| `TOOL_ORDER` | `["ctx_execute","ctx_batch","ctx_index","ctx_search","ctx_resume","ctx_stats","ctx_doctor","ctx_upgrade","ctx_purge"]` | PRD §8, Q3b |
| `OUTPUT_CAP` | `16384` B | Q2, ADR-0008, ADR-0016 |
| `STATE_BUDGET` | `2048` B | ADR-0009 §4 |
| `COMPACT_POINTER_LINE` | `"context-mode: earlier work of this session is in ctx_resume (state block) and ctx_search(scope:\"session\", sort:\"timeline\")."` | DECISIONS-r6 D6; byte-stable, no clock, no counts |
| `RESUME_CAP` | `2048` B | ADR-0009, GP6 |
| `REPORT_CAP` | `4096` B | ADR-0014 |
| `POINTER_MIN` | `640` B | ADR-0009 §4 |
| `MAX_CANDIDATES` | `85` per section | ADR-0009 §3 |
| `WEIGHT` | `{toolerr:900, prompt:500, edit:400, index:200}` — kept untuned; DECISIONS-r6 D1 measured a sweep and found no setting beats this on held-out cases | ADR-0009, DECISIONS-r6 D1 |
| `DECAY_HALF_LIFE_TURNS` | `4`; table `DECAY_X1000[age]` = round(1000·(0.25+0.75·2^(−age/4))) | ADR-0009 |
| `EXEC_TIMEOUT_MS` | `600000` (default and max) | S-TIMEOUT, Q8 |
| `KILL_GRACE_MS` | `1000` (cancel teardown bound) | GP4 |
| `NODE_MIN` | `"24.15.0"` | S-NODE |
| `DB_TIMEOUT_MS` | `5000` | ADR-0002, PRD §4 |
| `INDEX_WRITE_CHUNK` | `1048576` B | PRD §4 |
| `INSTRUCTIONS_CAP` | `2048` chars | Q5 |
| `DESCRIPTION_CAP` | `1024` chars | Q5 |
| `SURFACE_CAP` | `8000` chars (descriptions + schemas) | Q5, Q13 |
| `HOOK_P95_MS` | `40` (Claude Code wall) | G26, GS6 |
| `HOOK_CPU_OVER_NODE_MS` | `20` | GS6 |
| `HOOK_COMBINED_P95_MS` | `60` | GS6, A31 |
| `READ_MAX_LINES` | `200` (hint text only, not enforced) | DECISIONS-r8 |
| `SYNC_INDEX_MAX_BYTES` | `65536` B; output at or under this size is chunked, indexed and selected inside the hook (sync); above it, chunk in memory and select by BM25, return `replace`, FTS5 write detached | DECISIONS-r9 F1, `out/r9/perf-f1.md` |
| `RATIO_SECTION_DECAY` | `0.7` | ADR-0009 §4; DECISIONS-r9 §C |
| `MAX_CANDIDATES_TOTAL` | `340` | ADR-0009 §4; DECISIONS-r9 §C |
| `SEARCH_PAGE_SIZE` | `20` per source, before merge | ADR-0009 §8.1 rule 3; DECISIONS-r9 M15 |
| `MAX_CHUNK_BYTES` | `4096` B | DECISIONS-r9 §C |
| `SNIPPET_MAX_BYTES` | `800` B; ⌊`OUTPUT_CAP` / `SEARCH_PAGE_SIZE`⌋ = 819, minus room for the label | DECISIONS-r9 M21 |
| `SNIPPET_CODE_MAX_BYTES` | `2048` B; a window that holds a fenced block | D-SEARCH-7 |
| `REQUIRE_SECURITY_ENV` | `"CONTEXT_MODE_REQUIRE_SECURITY"` | v1 `a4ab72eb` #468; DECISIONS-r9 E2 |
| `MCP_HINT_EVERY` | `10` (env `CTX_MCP_HINT_EVERY`) | Q1 |
| `EXIT_SIGTERM_MS` | `2000`; `EXIT_SIGKILL_MS` `5000` | GP9, #862 |
| `COLD_START_MS` | `1000` | GP4 |
| `TOOLS_TTL_MS` | `3600000` | ADR-0007 (Assumption A1) |
| `DATA_ROOT` | `~/.context-mode` | PRD §4 |
| `LIVE_MODEL`/`LIVE_EFFORT`/`LIVE_BUDGET_USD` | `"claude-sonnet-5"`/`"low"`/`0.25` | ADR-0017 |
| `LIVE_SKIP_LIMIT` | `3` | ADR-0013 |
| `RRF_K` | `60` | ADR-0009 §8.3/§9 (DECISIONS-r7 R1); Cormack et al., SIGIR '09 |
| `SEARCH_P95_MS` | `30` | ADR-0009 §9 (DECISIONS-r7 R5); measured 27 ms, `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/memory-retrieval/eval/results.md` |

### 3.3 Error text (`errors.ts`)

All errors are one line: `<cause>. Fix: <action>` (P1, PRD §13). Table keys are used verbatim:

| Key | Text |
|---|---|
| `NODE_TOO_OLD` | `Context Mode needs Node 24.15.0 or newer; you have <v>. Fix: nvm install 24, or install it from https://nodejs.org.` |
| `NO_SQLITE` | `node:sqlite failed to load. Fix: run ctx_doctor.` |
| `DB_GONE` | `context.db is gone and its WAL file is still in place. Fix: run ctx_doctor once; it keeps the WAL file in a dated folder and starts a new index.` |
| `NO_PROJECT` | `Project source <kind> is missing. Fix: run ctx_doctor.` |
| `UNKNOWN_FIELD` | `Unknown field "<f>". Fix: use "queries".` (Q19) |
| `TIMEOUT` | `Timed out after <ms> ms. Fix: pass background: true.` |
| `NO_RUNTIME` | `No <lang> runtime on PATH. Fix: install it or pick another language.` |
| `FETCH_FAILED` | `Fetch failed: <code>. Fix: check the URL or proxy.` (#1135) |
| `SSRF` | `Blocked private address <host>. Fix: use a public URL.` |
| `OUTSIDE_ROOT` | `Path <p> is outside the project. Fix: use a path inside <root>.` |
| `INVALID_ARGS` | `Invalid argument <field>. Fix: <action>.` (`ctx_search` `offset` with `sort:"timeline"`, or `after` with `sort:"relevance"`; DECISIONS-r9 M23) |
| `ONE_OF_INPUT` | `Pass exactly one of <names>. Fix: drop the extra field.` (DECISIONS-r9 M23) |
| `SPAWN_FAILED` | `Failed to start the process: <detail>. Fix: check the command and PATH.` (DECISIONS-r9 M23) |

## 4. Cross-module interfaces

```ts
// store
resolveProject(agent: AgentId, src: { env: NodeJS.ProcessEnv; argv: string[]; cwd: string; piCwd?: string }): ProjectContext;
isInside(root: string, p: string): boolean;
resolveConfigDir(agent: AgentId, env: NodeJS.ProcessEnv): string;
openDb(project: ProjectContext, opts?: { readOnly?: boolean }): Promise<DbHandle>; // dynamic import("node:sqlite")
withWrite<T>(db: DbHandle, fn: (db: DbHandle) => T): T;       // BEGIN IMMEDIATE ... COMMIT
closeDb(db: DbHandle): void;                                  // checkpoint(TRUNCATE) in try/catch
appendEvent(db: DbHandle, row: NewJournalRow): number;        // returns seq
readSessionEvents(db: DbHandle, sessionId: string): JournalRow[];
readEventBySeq(db: DbHandle, seq: number): JournalRow | null;
ftsInsert(db: DbHandle, src: SourceRow, chunks: Chunk[]): void;
ftsQuery(db: DbHandle, q: string, scope: SearchScope, ctx: ProjectContext, sessionId: string, limit: number, offset: number): Hit[];
ftsQueryTimeline(db: DbHandle, scope: SearchScope, ctx: ProjectContext, sessionId: string, limit: number, after: number | null, source?: string): Hit[]; // DECISIONS-r6 D2; merges ContentStore + SessionDB + auto-memory, oldest first
// ctx_search gains sort?: "relevance" | "timeline" (default "relevance") and after?: number (timeline only); source:"decision" is a reserved label over kind:"decision" journal rows (DECISIONS-r6 D2, D3)
// Ranking = BM25 per scope fused with RRF (RRF_K=60), no MMR step; the decision tag stays structural (§8.2); measured, not preference — DECISIONS-r7, https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/memory-retrieval/eval/results.md
metaSet(db, key: string, v: string): void; metaTake(db, key: string): string | null; // DELETE ... RETURNING

// sandbox
runProcess(argv: string[], o: { cwd: string; env: Record<string,string>; signal: AbortSignal; timeoutMs: number; stdin?: string }): Promise<{ stdout: Buffer; stderr: Buffer; exitCode: number | null; killed: "timeout" | "cancel" | null }>;
killTree(pid: number): void;
findRuntime(lang: string): string | null;
buildChildEnv(parent: NodeJS.ProcessEnv, extra?: Record<string,string>): Record<string,string>;
capBytes(s: string, cap: number): { text: string; cut: boolean; fullBytes: number };
safeFetch(url: string, signal: AbortSignal): Promise<{ body: Buffer; contentType: string; finalUrl: string }>;

// tools-index
indexText(db: DbHandle, ctx: ProjectContext, sessionId: string, source: string, text: string, kind: "md"|"html"|"text"): { sourceId: number; chunks: number };
selectChunks(db: DbHandle, sourceId: number, intent: string, budget: number): { text: string; more: string | null };

// tools-session
renderState(rows: JournalRow[], turn: number): string;        // deterministic, ≤ STATE_BUDGET

// enforcement
decide(ev: CanonicalHookEvent, row: AdapterRow, userDeny: string[]): Decision;
parseShell(cmd: string): ParseResult; // { ok: true; commands: SimpleCommand[] } | { ok: false; construct: string }
pickSubagentCase(ev: CanonicalHookEvent, toolSet: string[] | null): "A" | "B" | "C";

// adapters
getAdapter(id: AgentId): AdapterRow;
ADAPTERS: readonly AdapterRow[];

// tools-ops
resolvePluginRoot(adapter: AdapterRow, env: NodeJS.ProcessEnv): string;
detectV1(agent: AgentId, home: string): V1Finding[];

// hooks
handleHook(agent: AgentId, raw: unknown, env: NodeJS.ProcessEnv): Promise<HookOutput>;

// server
TOOLS: readonly ToolDef<any>[]; INSTRUCTIONS: string;
startServer(argv: string[], env: NodeJS.ProcessEnv): Promise<void>;

// build-release
export interface LintResult { rule: "PR1" | "PR2"; ok: boolean; matches: string[]; } // one entry per check
export function lintPromptText(text: string): LintResult[]; // ADR-0005: PR1 caps regex, PR2 doubt regex; owner of build/prompt-lint.mjs §4 checks PR1/PR2; E2E: GP2; ADR-0017 covers: build/prompt-lint.mjs
```

## 5. Runtime flows

### 5.1 MCP server start (`server.mjs`) — GP1, GP9; covers `src/entries/server.ts`
1. Read `--agent <id>` from argv; else `claude-code` if `CLAUDE_PROJECT_DIR` set; else the row whose `projectSource` is `spawn-cwd` passed via `--agent` at install. Unknown → still serve; doctor reports `NO_PROJECT` (ADR-0007 d4).
2. Check `process.versions.node >= NODE_MIN` and `await import("node:sqlite")`. On failure: degraded mode, list only `ctx_doctor` (PRD §13).
3. Create MCP server with `instructions = INSTRUCTIONS`; register `TOOLS` in `TOOL_ORDER`; `ctx_execute` gets `_meta {"anthropic/alwaysLoad": true}` (ADR-0006); `readOnlyHint` on search/resume/stats; `annotations.readOnlyHint = true` on `ctx_execute` only when `getAdapter(agent).execReadOnlyHint` is true (codex only — DECISIONS-r9 R5; without it every codex call fails with `"MCP tool call requires approval, but approval policy is never"`). Serve `server/discover` and `initialize` with the same bytes (ADR-0007, GS9).
4. Install lifecycle (`exit.ts`): if stdin not TTY, on `end` → close DB → exit; escalate SIGTERM 2 s, SIGKILL 5 s. No timers otherwise, no `chdir`, no spawn.
5. Project and DB open lazily on the first tool call. Write `owners/<server-id>.pid` then.

### 5.2 A tool call — GP4/GP5/GP6
1. SDK validates input with zod; unknown key → `isError` `UNKNOWN_FIELD`.
2. Build `ToolContext` (session from request `_meta`, else `"mcp:"+server-id`).
3. Handler runs under `AbortSignal` (cancel) and `EXEC_TIMEOUT_MS`.
4. Reply text = summary line + body, cut by `capBytes(…, OUTPUT_CAP)`.
5. Server appends one journal row (`withWrite`, `appendEvent`) with `sandbox_bytes`, `returned_bytes` (one write path, ADR-0009 §0).
6. Errors: `isError: true`, one line from §3.3, never a stack.

### 5.3 Hook call — GP3; covers `src/core/hooks/`, `src/adapters/`
1. Host spawns `node <root>/hook.mjs --agent <id>`; read stdin JSON.
2. `adapter.decode(raw)` → `CanonicalHookEvent`.
3. Per event:
   - **SessionStart**: `source=compact` and `compactDelivery=sessionstart` → if `compactSummary=="host"` (Claude Code), return only `COMPACT_POINTER_LINE`, no state block; `ctx_resume()` with no `seq` still returns the full `STATE_BUDGET` block on demand. If `compactSummary=="none"` (every other agent, until its LV-COMPACT check passes at M3), open DB, `renderState(readSessionEvents)`, return the state block as context (DECISIONS-r6 D6). Else hint text about `ctx_resume`, once per session.
   - **UserPromptSubmit**: detached `appendEvent(kind:"prompt")`; if `pending-flag` agent, `metaTake("pending_compact:"+sid)` in `BEGIN IMMEDIATE` → deliver state once.
   - **PreToolUse**: no DB. `decide()` → allow / hint (throttled) / deny with rewrite. Read (and, on hosts with no Read tool, a one-file shell dump): deny when the call has no `offset`/`limit` (no bound argument for a shell dump) and `fs.stat(file).size > OUTPUT_CAP`; a ranged Read or a bounded dump is always allowed; no truncation (DECISIONS-r8 VR). Subagent (`agentId` present) → `pickSubagentCase`.
   - **PostToolUse**: detached append (`cmd`/`edit`/`toolerr` from `is_error`); case C → `selectChunks` and `replace`. Skip append for own `ctx_*` tools (server writes them). `AskUserQuestion` reply with a JSON `tool_response.answers` → also append `kind:"decision"` (DECISIONS-r6 D3 rule 1); no structural match → no `decision` row (fail-safe).
   - **PreCompact** (gemini, copilot-cli, vscode): `metaSet("pending_compact:"+sid,"1")`.
4. `adapter.encode` → native stdout and exit code; Kiro prompt hook prints `""` (GP3).
5. Any thrown error → allow with empty stdout, exit 0; log to stderr. Never block the host.

### 5.4 Compaction and resume — GP6; covers `src/core/compaction/`
1. Journal rows accrue via 5.2 step 5 and 5.3.
2. Trigger per `compactDelivery` (PRD §11). Kiro: none.
3. `renderState`: candidates (≤ 85/section; `kind:"decision"` rows are never a candidate — the `prompt` row already carries the text, DECISIONS-r6 D3) → integer score `WEIGHT × DECAY_X1000[age] × repeat` → lazy greedy by score/size within `STATE_BUDGET`; item > `POINTER_MIN` → `#<seq> (<bytes> B) ctx_resume(seq:<seq>)`; ties by seq desc; sections fixed order, lines in seq order.
4. `ctx_resume(seq:N)` = `readEventBySeq`; `ctx_resume()` = summary ≤ `RESUME_CAP`. The D1 algorithm and constants in step 3 are unchanged by delivery mode; only the SessionStart payload (5.3) differs by `compactSummary` (DECISIONS-r6 D6).

### 5.5 Install, upgrade, uninstall — GP1, GP11; covers `src/core/tools/upgrade.ts`, `src/core/ops/`
1. Install: host's own mechanism from the `release` branch (marketplace, extension, `config.toml` entry, git checkout). Node < `NODE_MIN` → hard fail.
2. `ctx_upgrade` (mode `upgrade` default): `resolvePluginRoot` → stale plugin-cache check → marketplace agents: print host update command; git-checkout agents: fetch latest `release`, verify `SHA256SUMS`, rename into place, keep previous dir. Regenerate only own entries from `adapters/table.ts`; keep user keys/timeouts (#1226); remove v1 entries from `detectV1`. Return change table + "restart needed".
3. Mode `uninstall`: remove own config entries and cache; remove `~/.context-mode/projects/*` only with `confirmDelete: true` (Q16).
4. `/ctx-upgrade` skill then calls `ctx_doctor`.

### 5.6 Release — ADR-0013; covers `.github/`, `.claude/skills/release/`
1. Owner types `/release` on `v2`. Skill runs `node e2e/cases/run.mjs`, KEEP-PASS, and `node e2e/live/run.mjs --all`; refuses if live skipped `LIVE_SKIP_LIMIT` times in a row.
2. Skill shows version + notes, dispatches `release.yml`.
3. `release.yml` (concurrency group `release`): build → commit to `release-staging` with `Source-Commit:` trailer, draft tag `v2.x.y` → smoke clean-HOME installs → fast-forward `release`, publish GitHub Release with `SHA256SUMS`.
4. `main` stays frozen (R1).

## Assumptions

- A1: `TOOLS_TTL_MS = 3600000`. ADR-0007 requires `ttlMs` but gives no value; the tool list changes only on upgrade, and upgrade already needs a restart (§5.5), so one hour keeps re-lists rare (DECISIONS-r9 F7).
- A3: Tool set is the 9 tools of PRD §8 (`ctx_batch`, `ctx_index` absorbing fetch). Old names `ctx_fetch_and_index`/`ctx_batch_execute` in ADR text map to these.
- A4: Case-B wrapper ships as `run.mjs` in the release root (ADR-0016 "`node <bundle>/run…`").
- A5: `projectKey` = first 16 hex chars of sha256 of the git common dir realpath; ADR-0002 names the hash but not its length.
- A6: Kill on Windows is `taskkill /F /T /PID` (PRD §8, GP4) over Job Object (S-TIMEOUT), because PRD/GP4 forbid a switch without its own ADR; Node has no Job Object API, so one would need a native addon the release cannot ship. Parent-death on Windows: stdin EOF, then `taskkill /T` of own children (DECISIONS-r9 F6).
- A7: `cost` event kind added for GP10 turn-keyed stats; ADR-0009 lists only 5 kinds.
- A8: DB opens on a non-MCP session use session id `"mcp:"+server-id` when request `_meta` has none; this is the fallback session id itself, kept (not "latest session") because a stdio server serves one client, so two clients never share it, and an unknown or empty session id reads `[]` (DECISIONS-r9 F4; v1 `7e6c243a`, PR #398, where falling back to the global latest session leaked one session into another).
- A14: ADR-0005's caps/doubt regex rules (PR1, PR2) are each one check, so `lintPromptText` returns one `LintResult` per rule, not a single pass/fail. `build/prompt-lint.mjs` §4 step 4 calls it once per tool/instructions text and fails the run on any `ok: false` row. This owning function was missing before this edit.

## Changes

- `AdapterRow` gains `compactSummary: "host" | "none"`, `nativeTools`, `execReadOnlyHint`; `COMPACT_POINTER_LINE` constant added; §5.3/§5.4 flows now branch by `compactSummary` (DECISIONS-r6 D6, https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/memory-r6/eval/results.md); `toolNamePrefix` comment fixes Codex to underscore form; `READ_HINT_BYTES` retired, `READ_MAX_LINES` added, §5.3 PreToolUse now denies an unranged Read (or a one-file shell dump with no bound) over `OUTPUT_CAP` instead of hinting (DECISIONS-r8); new constants `SYNC_INDEX_MAX_BYTES`, `RATIO_SECTION_DECAY`, `MAX_CANDIDATES_TOTAL`, `SEARCH_PAGE_SIZE`, `MAX_CHUNK_BYTES`, `SNIPPET_MAX_BYTES`, `REQUIRE_SECURITY_ENV`; §3.3 gains `INVALID_ARGS`, `ONE_OF_INPUT`, `SPAWN_FAILED`; A1 cites §5.5, A2 removed (source tree is §1 alone), A6 and A8 get their Windows-kill and session-id reasoning (DECISIONS-r9).
