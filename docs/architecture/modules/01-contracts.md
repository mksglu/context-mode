# 01 — Module spec: contracts

Owner module id: `contracts` (00-architecture §2). This module owns `src/core/contracts/*`. It imports nothing from the repo (00-architecture §2: Imports = "—"). It is the base of the DAG; every other module imports it.

Files, in build order (00-architecture §1, §3.1, §3.2, §3.3):

1. `src/core/contracts/agents.ts`
2. `src/core/contracts/types.ts`
3. `src/core/contracts/constants.ts`
4. `src/core/contracts/errors.ts`

Write them in this order: `types.ts` needs `AgentId` from `agents.ts`; `errors.ts` needs nothing from `constants.ts` but `constants.ts` is listed before `errors.ts` in 00-architecture §3 and has no dependency on it either way.

## 1. `src/core/contracts/agents.ts`

Exports:

```ts
export const AGENT_IDS = ["claude-code","codex","gemini","qwen","copilot-cli","vscode","kiro","zcode","pi","opencode"] as const;
export type AgentId = typeof AGENT_IDS[number];
```

Source: PRD-v2 §3 (10-agent table), TECH-SPEC §2, 00-architecture §3.1. Order matches the PRD §3 table top to bottom. No other export. No function: this file is data only.

E2E case: GP1 (install across all 10 adapters reads this exact list). ADR-0017 `covers`: `src/core/contracts/agents.ts`.

## 2. `src/core/contracts/types.ts`

Pure types and interfaces. No runtime code, no function bodies, no values except the re-export of `AgentId`. Copy every type from 00-architecture §3.1 verbatim:

`CanonicalEventName`, `AuxEventName`, `CanonicalHookEvent`, `ToolCall`, `ToolResultInfo`, `Decision`, `HookOutput`, `EventKind`, `JournalRow`, `NewJournalRow`, `ProjectContext`, `ProjectSourceKind`, `ToolContext`, `ToolReply`, `ToolDef<I>`, `AdapterRow`.

Rules per field, each citing its source:

| Type | Field | Rule | Source |
|---|---|---|---|
| `CanonicalHookEvent` | `event` | one of the 4 canonical events, or `"PreCompact"` | ADR-0001, PRD §10.1 |
| `CanonicalHookEvent` | `agentId` | present only on a subagent call; its presence alone marks subagent, never `agentType` | Q23 |
| `CanonicalHookEvent` | `agentType` | read only after `agentId` says this is a subagent; it then selects the tool-set row | Q23 |
| `ToolCall` | `canonicalName` | one of `"Bash"`, `"Read"`, `"Grep"`, `"WebFetch"`, a bare `ctx_*` name, or `"mcp:<server>:<tool>"` | TECH-SPEC §3.8 |
| `Decision` | `deny` variant | `reason` carries the rewritten command; there is no `allow` variant with an `updatedInput` field anywhere in this type — Claude Code ignores that field for Bash | Q3, v1 commit `4bc292fc` |
| `Decision` | `replace` variant | case C only (ADR-0016); `output` is the already-budgeted replacement text, never partial/cut text | ADR-0016, PRD §10.3 |
| `JournalRow` | `kind` | one of `EventKind` | ADR-0009 §1, GP10 (adds `"cost"`) |
| `JournalRow` | `sandbox_bytes` / `returned_bytes` | both always set by the one write path (`appendEvent`), used by `ctx_stats` saved = sandbox − returned | GP10, ADR-0009 §0 |
| `NewJournalRow` | — | `Omit<JournalRow, "seq" \| "created_at" \| "accessed_at">`: callers never set these 3 fields; the DB layer sets them | store module interface, 00-architecture §4 |
| `ProjectContext` | `projectKey` | sha256(git common dir realpath) hex, first 16 chars | A5 |
| `ProjectContext` | `source` | one `ProjectSourceKind`, never inferred by trying more than one | Q11, Q24, PRD §5 |
| `ToolDef<I>` | `alwaysLoad` | `true` only for `ctx_execute` | ADR-0006 |
| `AdapterRow` | `denyChannel` | `"deny-reason"` for hosts that read a hard deny reason; `"hint-only"` for hosts with no deny channel | ADR-0001 §4, README §6 Gaps |
| `AdapterRow` | `compactSummary` | `"host"` (Claude Code, verified): inject only `COMPACT_POINTER_LINE` after compaction, no state block — `ctx_resume()` with no `seq` returns the 2,048 B block on demand. `"none"` (every other agent): inject the 2,048 B D1 block through that agent's ADR-0009 §6 delivery path, until its LV-COMPACT live check (M3) proves the host writes its own summary | DECISIONS-r6 D6, https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/memory-r6/eval/results.md |
| `AdapterRow` | `toolNamePrefix` | Codex is `"mcp__context_mode__"` (underscore): Codex replaces every char that is not ASCII alnum or `_` with `_` in the server name; all other hosts keep the hyphen form | DECISIONS-r9 R1 |
| `AdapterRow` | `nativeTools` | `{ shell: string[]; read?: string[]; grep?: string[]; webfetch?: string[]; edit?: string[] }`; feeds the generated PreToolUse/PostToolUse matcher `^(<all nativeTools values>|<escaped toolNamePrefix>ctx_.*)$` and the in-body filter for hosts with no host-side matcher | DECISIONS-r9 R4 |
| `AdapterRow` | `execReadOnlyHint` | `boolean`; `true` only for `codex`, sets `annotations.readOnlyHint = true` on `ctx_execute`; every other row is `false` | DECISIONS-r9 R5 |

No type in this file has an optional field that is also used to pick between two runtime paths (P1): optionality here only ever means "this event/host does not carry this field," never "pick path A or B."

E2E case: GP3 (hook payload decode into `CanonicalHookEvent` for all 10 adapters), GP4 (`ToolContext`/`ToolReply` shape), GP6 (`JournalRow`/`NewJournalRow`). ADR-0017 `covers`: `src/core/contracts/types.ts`.

## 3. `src/core/contracts/constants.ts`

Exports every row of the table below, by the exact name in column 1. No other module may write a literal number for any of these values (00-architecture top rule 5).

| Export | Type | Value | Source |
|---|---|---|---|
| `SERVER_KEY` | `string` | `"context-mode"` | TECH-SPEC §3.8 rule 3 |
| `TOOL_ORDER` | `readonly string[]` | `["ctx_execute","ctx_batch","ctx_index","ctx_search","ctx_resume","ctx_stats","ctx_doctor","ctx_upgrade","ctx_purge"]` | PRD §8, Q3b |
| `OUTPUT_CAP` | `number` | `16384` | Q2, ADR-0008, ADR-0016 |
| `STATE_BUDGET` | `number` | `2048` | ADR-0009 §4 |
| `RESUME_CAP` | `number` | `2048` | ADR-0009, GP6 |
| `REPORT_CAP` | `number` | `4096` | ADR-0014 |
| `POINTER_MIN` | `number` | `640` | ADR-0009 §4 |
| `MAX_CANDIDATES` | `number` | `85` | ADR-0009 §3 |
| `WEIGHT` | `Readonly<Record<"toolerr"\|"prompt"\|"edit"\|"index", number>>` | `{toolerr:900, prompt:500, edit:400, index:200}` | ADR-0009 |
| `DECAY_HALF_LIFE_TURNS` | `number` | `4` | ADR-0009 |
| `DECAY_X1000` | `readonly number[]`, index = turn age | computed, see below | ADR-0009 |
| `EXEC_TIMEOUT_MS` | `number` | `600000` | S-TIMEOUT, Q8 |
| `KILL_GRACE_MS` | `number` | `1000` | GP4 |
| `NODE_MIN` | `string` | `"24.15.0"` | S-NODE |
| `DB_TIMEOUT_MS` | `number` | `5000` | ADR-0002, PRD §4 |
| `INDEX_WRITE_CHUNK` | `number` | `1048576` | PRD §4 |
| `INSTRUCTIONS_CAP` | `number` | `2048` | Q5 |
| `DESCRIPTION_CAP` | `number` | `1024` | Q5 |
| `SURFACE_CAP` | `number` | `8000` | Q5, Q13 |
| `HOOK_P95_MS` | `number` | `40` | G26, GS6 |
| `HOOK_CPU_OVER_NODE_MS` | `number` | `20` | GS6 |
| `HOOK_COMBINED_P95_MS` | `number` | `60` | GS6, A31 |
| `READ_HINT_BYTES` | retired | was `51200` | ADR-0008 "Read: hint to deny" retires this in favor of `OUTPUT_CAP` for both the Read deny threshold and the ranged-Read hint threshold, so there is one cap, not two |
| `REPLACE_TRIGGER_BYTES` | `number` | `4096`, overridden by env `CTX_REPLACE_TRIGGER_BYTES` if that env parses as a positive safe integer, else `4096` (D-R48-TRIGGER-1, #1326) | D-M7-SV-1 |
| `MCP_HINT_EVERY` | `number` | `10`, overridden by env `CTX_MCP_HINT_EVERY` if that env parses as a positive integer, else `10` | Q1 |
| `EXIT_SIGTERM_MS` | `number` | `2000` | GP9, #862 |
| `EXIT_SIGKILL_MS` | `number` | `5000` | GP9, #862 |
| `COLD_START_MS` | `number` | `1000` | GP4 |
| `TOOLS_TTL_MS` | `number` | `3600000` | ADR-0007 (A1) |
| `DATA_ROOT` | `string` | `"~/.context-mode"`, with `~` expanded by the caller (store module), never pre-expanded here | PRD §4 |
| `LIVE_MODEL` | `string` | `"claude-sonnet-5"` | ADR-0017 |
| `LIVE_EFFORT` | `string` | `"low"` | ADR-0017 |
| `LIVE_BUDGET_USD` | `number` | `0.25` | ADR-0017 |
| `LIVE_SKIP_LIMIT` | `number` | `3` | ADR-0013 |
| `SYNC_INDEX_MAX_BYTES` | `number` | `65536` | DECISIONS-r9 F1, `out/r9/perf-f1.md` |
| `RATIO_SECTION_DECAY` | `number` | `0.7` | ADR-0009 §4; DECISIONS-r9 §C |
| `MAX_CANDIDATES_TOTAL` | `number` | `340` | ADR-0009 §4; DECISIONS-r9 §C |
| `SEARCH_PAGE_SIZE` | `number` | `20` | ADR-0009 §8.1 rule 3; DECISIONS-r9 M15 |
| `MAX_CHUNK_BYTES` | `number` | `4096` | DECISIONS-r9 §C |
| `SNIPPET_MAX_BYTES` | `number` | `800` | DECISIONS-r9 M21 |
| `SNIPPET_CODE_MAX_BYTES` | `number` | `2048` | D-SEARCH-7 (a window with a fenced block) |
| `REQUIRE_SECURITY_ENV` | `string` | `"CONTEXT_MODE_REQUIRE_SECURITY"` | v1 `a4ab72eb` #468; DECISIONS-r9 E2 |

### `DECAY_X1000` build steps

This is the only computed constant. It is computed once, at module load, into a fixed-length array, not a function other modules call per lookup.

1. Fix `AGE_MAX = 64` (turns). This bound is not named in any source; it exists only so the exported array is finite. List under Assumptions (A-C1).
2. For `age` from `0` to `AGE_MAX`: `DECAY_X1000[age] = Math.round(1000 * (0.25 + 0.75 * Math.pow(2, -age / DECAY_HALF_LIFE_TURNS)))`.
3. Freeze the array (`Object.freeze`).
4. A caller with `age > AGE_MAX` uses `DECAY_X1000[AGE_MAX]` (the score module clamps; this file only guarantees the array covers ages 0–64).

Formula source: ADR-0009 ("decay (half-life 4 turns)"); the `0.25 + 0.75 · 2^(−age/4)` shape and the ×1000 integer scale are from 00-architecture §3.2 `DECAY_X1000[age]` row verbatim.

E2E case: GP10 (score math is unit-tested against this table), GP6 (compaction renders using it). ADR-0017 `covers`: `src/core/contracts/constants.ts`.

## 4. `src/core/contracts/errors.ts`

### 4.1 Error text table

Exports `ERROR_TEXT`, a `Readonly<Record<ErrorCode, string>>`. Every value is one line: `<cause>. Fix: <action>` (P1, PRD §13). `<v>`, `<f>`, `<ms>`, `<lang>`, `<code>`, `<host>`, `<p>`, `<root>`, `<kind>` are placeholders filled by `formatError` (§4.3), never left in the output.

```ts
export type ErrorCode =
  | "NODE_TOO_OLD" | "NO_SQLITE" | "DB_GONE" | "NO_PROJECT" | "UNKNOWN_FIELD"
  | "TIMEOUT" | "NO_RUNTIME" | "FETCH_FAILED" | "SSRF" | "OUTSIDE_ROOT"
  | "INVALID_ARGS" | "ONE_OF_INPUT" | "SPAWN_FAILED";
```

| Code | Text | Source |
|---|---|---|
| `NODE_TOO_OLD` | `Context Mode needs Node 24.15.0 or newer; you have <v>. Fix: nvm install 24, or install it from https://nodejs.org.` | S-NODE, PRD §4 |
| `NO_SQLITE` | `node:sqlite failed to load. Fix: run ctx_doctor.` | PRD §13, 5.1 step 2 |
| `DB_GONE` | `context.db is gone and its WAL file is still in place. Fix: run ctx_doctor once; it keeps the WAL file in a dated folder and starts a new index.` | ADR-0002 §3 |
| `NO_PROJECT` | `Project source <kind> is missing. Fix: run ctx_doctor.` | PRD §5, ADR-0007 d4 |
| `UNKNOWN_FIELD` | `Unknown field "<f>". Fix: use "queries".` | Q19 |
| `TIMEOUT` | `Timed out after <ms> ms. Fix: pass background: true.` | Q8, S-TIMEOUT |
| `NO_RUNTIME` | `No <lang> runtime on PATH. Fix: install it or pick another language.` | PRD §9 |
| `FETCH_FAILED` | `Fetch failed: <code>. Fix: check the URL or proxy.` | #1135 |
| `SSRF` | `Blocked private address <host>. Fix: use a public URL.` | Q19, PRD §9 |
| `OUTSIDE_ROOT` | `Path <p> is outside the project. Fix: use a path inside <root>.` | #954, #1294 |
| `INVALID_ARGS` | `Invalid argument <field>. Fix: <action>.` | DECISIONS-r9 M23 |
| `ONE_OF_INPUT` | `Pass exactly one of <names>. Fix: drop the extra field.` | DECISIONS-r9 M23 |
| `SPAWN_FAILED` | `Failed to start the process: <detail>. Fix: check the command and PATH.` | DECISIONS-r9 M23 |

`UNKNOWN_FIELD`'s literal `"queries"` is specific to `ctx_search`'s one documented unknown-key case (Q19, PRD §8); it is still the generic text for any unknown-field error in v2, because v2 has exactly one tool whose schema rejects unknown keys. Listed under Assumptions (A-C2).

### 4.2 `CtxError` class

```ts
export class CtxError extends Error {
  readonly code: ErrorCode;
  readonly vars: Record<string, string | number>;
  constructor(code: ErrorCode, vars?: Record<string, string | number>);
  toLine(): string; // same string formatError(code, vars) returns
}
```

Steps, `constructor(code, vars)`:
1. Call `super(formatError(code, vars ?? {}))` so `.message` is already the final one-line text.
2. Set `this.code = code`.
3. Set `this.vars = vars ?? {}`.

Steps, `toLine()`:
1. Return `this.message`.

`CtxError` never carries or exposes a stack-trace string to a caller outside this process; callers that turn it into a tool reply use `.message` (or `.toLine()`), never `.stack` (#1135, GP4, GP5).

### 4.3 `formatError(code, vars)`

```ts
export function formatError(code: ErrorCode, vars: Record<string, string | number>): string;
```

Inputs: `code` — one of `ErrorCode`; `vars` — the placeholder values the template in `ERROR_TEXT[code]` needs (for example `{ v: "22.1.0" }` for `NODE_TOO_OLD`).

Output: the one-line string with every `<name>` placeholder in `ERROR_TEXT[code]` replaced by `String(vars[name])`.

Steps:
1. Read `template = ERROR_TEXT[code]`.
2. Find every `<name>` token in `template` with a single left-to-right pass over the characters, one index `i` at a time, no regex:
   - When `template[i]` is not `<`, copy it to the output and move on.
   - When `template[i]` is `<`, start a token: set `j = i + 1` and read forward while `template[j]` is not `<` and not `>`.
     - If `template[j]` is `>`: the token closed. `name = template.slice(i + 1, j)`. Replace step (4) runs on this `name`. Set `i = j + 1` and continue the outer pass.
     - If `template[j]` is `<` (a second `<` before any `>`): the first `<` was not a token open, because `ERROR_TEXT` never nests one placeholder inside another. Copy the first `<` to the output as a literal character and resume the pass at `i = i + 1` (so the second `<` gets its own, fresh token attempt).
     - If `template` ends before a `>` is found (unterminated `<`): the `<` and every character after it are not a token; copy them to the output as literal characters and stop the pass.
   - `ERROR_TEXT` templates carry no escape syntax for `<` or `>` (no `\<` form): every `<` in a template either opens a real placeholder or is plain text, decided only by the rules above. A-C4 records this.
3. For each `name` found: if `vars[name]` is `undefined`, throw a plain `Error("formatError: missing var " + name + " for " + code)` — this is a build/test-time programmer error, never a path a release build can hit, so it is not in `ERROR_TEXT`.
4. Replace each `<name>` token with `String(vars[name])`.
5. Return the resulting string.

This function, not a regex, satisfies the "no regex in runtime code" rule (00-architecture top rule 4, TECH-SPEC §11) while still doing placeholder substitution.

### 4.4 Error cases

| Case | Who raises it | Code | Caller behavior |
|---|---|---|---|
| Node version below `NODE_MIN` | `server.ts` 5.1 step 2 | `NODE_TOO_OLD` | degraded mode: list only `ctx_doctor` |
| `import("node:sqlite")` throws | `server.ts` 5.1 step 2 | `NO_SQLITE` | degraded mode: list only `ctx_doctor` |
| open handle's DB path no longer exists | `store.openDb` | `DB_GONE` | hard error, no retry (ADR-0002 §3) |
| no `ProjectSourceKind` resolves | `store.resolveProject` | `NO_PROJECT` | `ctx_doctor` reports it; never guessed (PRD §5) |
| tool input has a key not in its zod schema | SDK validation in a tool handler | `UNKNOWN_FIELD` | `isError: true`, reply = this line only |
| a sandbox call exceeds `EXEC_TIMEOUT_MS` or a caller's `timeoutMs` | `sandbox.runProcess` | `TIMEOUT` | kill process tree, `isError: true` |
| `findRuntime(lang)` returns `null` | `tools-exec.ctxExecute` | `NO_RUNTIME` | `isError: true`, no spawn attempted |
| `safeFetch` network/DNS/HTTP failure | `sandbox.safeFetch`, `tools-index.ctxIndex` (url mode) | `FETCH_FAILED` | `isError: true`, one line, no stack (#1135) |
| resolved fetch target is a private/loopback address | `sandbox.safeFetch` | `SSRF` | hard deny, no fetch attempted |
| a resolved path falls outside `containmentRoot` | `store.isInside` caller (sandbox, tools-exec, tools-index) | `OUTSIDE_ROOT` | hard deny, no I/O attempted |

E2E case: `NODE_TOO_OLD`/`NO_SQLITE` → GP1 (degraded-mode row); `DB_GONE` → GP8; `NO_PROJECT` → GP1 (the "2026-07-28 client with no clientInfo" row), GP7; `UNKNOWN_FIELD` → GP5 (`ctx_search` unknown query field); `TIMEOUT` → GP4; `NO_RUNTIME` → GP4; `FETCH_FAILED` → GP4, GP5 (#1135 rows); `SSRF` → GP5 (proxy/SSRF row); `OUTSIDE_ROOT` → GP7 (#954, #1294 row), GP9 sandbox containment checks.

ADR-0017 `covers`: `src/core/contracts/errors.ts`.

## 5. Assumptions

- A-C1: `DECAY_X1000` is built for ages `0`–`64` turns. No source gives this bound; a session realistically never reaches it, and the score module clamps beyond it, so the table only needs to be finite. Reason: ADR-0009 names the formula, not an array length.
- A-C2: `UNKNOWN_FIELD`'s fixed `Fix: use "queries".` text is kept as the one generic unknown-field message, because Q19 and PRD §8 name exactly one tool (`ctx_search`) with this behavior; v2 has no second case that needs a different fix hint.
- A-C3: `formatError` throws a plain (non-`CtxError`) `Error` on a missing var, because that path is a programmer mistake caught by tests, not a user-facing error with its own line in `ERROR_TEXT`.
- A-C5: No `ERROR_TEXT` template nests one `<name>` inside another or escapes a literal `<`/`>`, so `formatError` needs no nesting or escape rule; a `<` that hits a second `<` before a `>`, or that never meets a `>`, is copied through as plain text (§4.3 step 2). Reason: no template in the table needs nesting or escaping, so the simplest scan that is still exact is enough.
- A-C1 note (intern M0 Q1): DECISIONS-r9 M6 replaces A-C1. `DECAY_X1000` is a literal 128-entry table (ages 0–127); age > 127 uses entry 127. The unit test recomputes the formula.
- A-C6 (intern M0 Q2): no build-time template check. `tests/contracts/contracts.test.mjs` formats every `ERROR_TEXT` key with all its `<name>` vars and asserts one line with `. Fix: `; A-C3 and A-C5 cover a bad template at run time.
- A-C7 (intern M0 Q7): the `nativeTools` matcher regex is built only at build time by `build/manifests.ts` `buildMatcher` (impl/13 §3 step 5, `escapeRegExp` on `toolNamePrefix` only). `src/` never builds or runs it.
- A-C8 (intern M0 Q8): `RATIO_SECTION_DECAY = 0.7` comes from ADR-0009 §4, `ratio = score · 0.7^k / bytes`; it is a design value, not a spike result.

## Changes

- `AdapterRow.compactSummary` row added to the field table (DECISIONS-r6 D6, https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/memory-r6/eval/results.md).
- A-C4: `MCP_HINT_EVERY`'s env override (`CTX_MCP_HINT_EVERY`) falls back to `10` on a non-numeric or non-positive value, since Q1 names the default and the override but not its own validation rule.
- `AdapterRow` gains `toolNamePrefix` Codex note, `nativeTools`, `execReadOnlyHint` rows; constants gain `SYNC_INDEX_MAX_BYTES`, `RATIO_SECTION_DECAY`, `MAX_CANDIDATES_TOTAL`, `SEARCH_PAGE_SIZE`, `MAX_CHUNK_BYTES`, `SNIPPET_MAX_BYTES`, `REQUIRE_SECURITY_ENV`; `ErrorCode` and the error table gain `INVALID_ARGS`, `ONE_OF_INPUT`, `SPAWN_FAILED`; §4.3 step 2 spells out the full scan algorithm for `<name>` tokens, and A-C5 states the no-nesting/no-escape rule (DECISIONS-r9).
