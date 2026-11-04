# context-mode v2.0 — PRD

- Status: Accepted for implementation (2026-10-15)
- Owner: Mert · Branch: `v2`
- Sources: ADR-0001–0017 (`docs/architecture/adr/`); accepted decisions `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/review/DECISIONS-r3.md` and `DECISIONS-r4.md`; `docs/architecture/TECH-SPEC.md`; spikes `https://github.com/mksglu/context-mode/tree/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/spikes-r5/`

## 1. Goal

Every open issue and PR gets one explicit outcome. Every real bug becomes a golden-path (GP) test that v2 must pass.

Current outcome counts, from `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/review/ISSUE-OUTCOMES-r4.md` (329 merged rows, deduplicated from the 357 open issues and PRs the original scan started from):

| Verdict | Rows |
|---|---|
| closed-by-design | 159 |
| covered-by-test | 111 |
| wont-fix | 55 |
| merged | 2 |
| unverified | 1 |
| needs-decision | 0 |

"Done" for v2.0: every `closed-by-design` row has its code deleted; every `covered-by-test` row has a green GP case; every `wont-fix` row has a written reason; the single `unverified` row (#1301, OpenCode retrieval-only mode) gets a decision before release; every item is closed with a comment naming its outcome.

## 2. Principles

- **P1 One path.** No fallback chains. A missing input gives a one-line error that names the fix.
- **P2 Same code on every agent.** Agents differ only in transport.
- **P3 Claude Code's event model is the canonical contract** (ADR-0001). Adapters translate to and from it.
- **P4 Hooks are pure.** No DB, no network, no spawn.
- **P5 Idle server = 0% CPU.** No timers that scan, no boot-time probes, no `ps`.
- **P6 Test first.** Every case gets a green E2E test before its code (ADR-0017).

## 3. Agents and architecture

v2.0 ships exactly 10 agents (TECH-SPEC §2):

| Agent | Install mode |
|---|---|
| Claude Code | marketplace plugin |
| Codex CLI | `config.toml` MCP entry |
| Gemini CLI | extension |
| Qwen Code | extension |
| Copilot CLI | plugin |
| VS Code Copilot | MCP entry |
| Kiro | MCP entry |
| ZCode | hooks + MCP |
| Pi | in-process plugin |
| OpenCode 2 | in-process plugin |

No other agent ships in v2.0. No CLI and no `cli.mjs` entry (ADR-0002, ADR-0010): install, update and diagnosis run through each host's own mechanism and through the `ctx_doctor`/`ctx_upgrade` tools.

```
 hooks+mcp agents (Claude Code, Codex, Gemini, Qwen, Copilot CLI, VS Code, Kiro, ZCode)
   │ hook stdin JSON                 │ MCP stdio
   ▼                                 ▼
 hook entry                       server entry
   adapter.decode                    core/tools registry -> sandbox . store . project . policy
   core/policy -> hint | deny | rewrite
   core/journal.append (one shared context.db per project)
   adapter.encode

 in-process plugin agents (Pi, OpenCode 2)
   plugin adapter -> same core/policy, core/journal, core/tools (no spawn, no MCP hop)
```

Three layers, one build (esbuild, static imports only):

1. **core/** — knows no agent: tools, sandbox, store, project, journal, policy, stats, lifecycle.
2. **adapters/** — pure translation plus install/doctor data. No business logic.
3. **entries/** — `server.mjs`, `hook.mjs`, one plugin entry each for Pi and OpenCode 2.

### 3.1 Module map

| Module | Job |
|---|---|
| core/tools | One file per tool: zod schema, handler, description. One registry read by the MCP server and by both plugin adapters |
| core/sandbox | spawn, env, PATH, timeout, cancel, kill tree, Windows shell, containment |
| core/store | `node:sqlite`, FTS5, chunking, budgets, paging (ADR-0002) |
| core/project | ProjectContext: project key, worktree path, containment root (ADR-0007) |
| core/journal | Rows in `context.db`, one write path (ADR-0009 §0) |
| core/policy | Deny/hint/rewrite decision for a canonical tool call (ADR-0008) |
| core/stats | On-demand stats from the journal, read-only |
| core/lifecycle | Exit on stdin EOF, no timers, no chdir, lazy discovery |
| adapters/table.ts | One row per agent: install mode, project source, event-name map, tool-name map |
| adapters/\<agent\>.ts | decode/encode only, 30–80 lines (ADR-0001) |

Nothing host-specific is written by hand twice: every manifest, hook config, matcher and tool-name map is generated from `adapters/table.ts` at build time.

### 3.2 Repository layout

```
src/
  core/                    # knows no agent
    tools/registry.ts      # the ONLY tool list; MCP server and both plugins read it
    contracts/             # types and constants (DECISIONS-r9 F3; 00-architecture.md §1 is the source tree)
    store/ journal/ project/ sandbox/ compaction/ ops/ policy/ stats/ lifecycle/
  adapters/
    table.ts               # ONE row per agent
    claude-code.ts codex.ts gemini.ts qwen.ts copilot-cli.ts vscode.ts kiro.ts zcode.ts
    pi.ts opencode.ts      # in-process plugin glue -> same core calls
  entries/
    server.ts hook.ts pi.ts opencode.ts
build/
  manifests.ts             # generates every host manifest + hooks config from adapters/table.ts
e2e/
  harness/ fixtures/ golden/ cases/ live/
release branch (CI build output only: no package.json, no node_modules)
  server.mjs hook.mjs pi/index.js opencode/plugin.js + generated manifests
```

No `.claude/skills/context-mode-ops`, no per-agent routing file, and no path belonging to a removed agent (§17) exists anywhere in this tree.

## 4. Storage (ADR-0002)

One SQLite file per project: `~/.context-mode/projects/<git-common-dir-hash>/context.db`.

- Tables: `events`, `sources`, `chunks` (FTS5), `meta`. Every row carries `session_id`, `worktree`, `agent`.
- Engine: `node:sqlite` with `{timeout: 5000}`. Every write starts `BEGIN IMMEDIATE`. Index writes land in ~1 MB chunks. No added retry loop on top of the 5000 ms timeout: measured with 8 writers, 4 FTS readers and a 20 MB indexer, 0 busy errors (`https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/verify-single-db.md`).
- Schema: on open, read `PRAGMA user_version`. A stale version runs its migration once inside `BEGIN IMMEDIATE` before any other writer proceeds, then bumps the version. `ctx_doctor` reports a stale-schema mismatch separately from an `integrity_check` failure.
- Liveness: each server writes `owners/<server-id>.pid` next to `context.db`.
- WAL checkpoint: every server runs a best-effort `checkpoint(TRUNCATE)` on its own close, in a try/catch so a failed checkpoint never blocks shutdown. No election, no single-writer lock (decision Q6).
- Retention: a row ages out by time since its last access, not since creation, plus a live-owner-PID check and a size cap. A row stays warm while its session is still open (decision Q7; the exact size-cap number, Q7b, is still open).
- Corruption: on `SQLITE_CORRUPT`, only `ctx_doctor` renames `context.db`, `-wal` and `-shm` aside (timestamp suffix) and recreates empty, or runs a lossless heal first (`VACUUM INTO` a clean copy, atomic swap) when the checkpoint owner is the one running. The file is never deleted. Any other writer whose path has vanished gets a hard error naming `ctx_doctor` as the fix.
- Cleanup: a project DB with no live owner PID is deleted inside the same lock as the liveness check, so a server cannot start in the gap (closes #880's race class).
- Minimum Node: **24.15.0** (spike S-NODE, `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/spikes-r5/S-NODE.md`): the lowest version measured with `node:sqlite` unflagged, a sleeping `timeout` on `SQLITE_BUSY`, FTS5 compiled in, and no experimental warning. Install hard-fails below this version; no fallback.
- Distribution (ADR-0019 D2): npm package `context-mode` (dist-tag `next`, `latest` stays on v1 until the owner moves it) is the user channel; the CI-built git `release` branch stays for the Claude Code marketplace. One command: `npm i -g context-mode && context-mode setup`. No npm install at runtime: the package has no dependencies and no install scripts.

## 5. Project and session identity (ADR-0007)

- The server is stateless across MCP connections: no per-connection state; the agent and the session come from request `_meta` and from hook payloads.
- Project source, one named mechanism per host, no fallback chain (decision Q11, Q24):

| Host | Project source |
|---|---|
| Claude Code | `CLAUDE_PROJECT_DIR` env |
| Codex CLI | `--agent <id>` flag baked into the MCP entry at install time |
| Copilot CLI | same `--agent <id>` mechanism |
| Kiro | same `--agent <id>` mechanism |
| VS Code Copilot (incl. Remote-WSL) | `${workspaceFolder}` launch arg, read from the IDE's own remote-workspace API |
| Gemini CLI, Qwen Code, ZCode | spawn `cwd` |
| Pi | the extension API's `ctx.cwd` at plugin-load time |
| OpenCode 2 | spawn `cwd`, read by the in-process plugin at load |

A missing source is reported by `ctx_doctor`; it is never guessed.

- MCP `roots` is never used (deprecated in spec 2026-07-28, SEP-2577).
- Key = git common dir: every worktree of one repo shares a project (#744). Each event and each indexed source also stores its own worktree path; commands run in the session's own worktree.
- Identity for `ctx_doctor`/`ctx_upgrade` comes only from the `--agent <id>` install-time flag, never from `clientInfo`/`_meta` — the 2026-07-28 spec makes `clientInfo` optional and non-behavioural. `clientInfo` is read only to detect a 2025-xx client and for display in the debug report and `ctx_stats`.

## 6. MCP protocol (ADR-0007)

- The server implements MCP spec **2026-07-28** and also serves 2025-03-26 … 2025-11-25 clients through the SDK's own version negotiation: one server, one tool set, answered in the version the client asked for.
- Instructions reach both kinds of client with the same bytes: `InitializeResult.instructions` for 2025-xx clients, `DiscoverResult.instructions` for 2026-07-28 clients.
- Every result carries `resultType: "complete"`. `tools/list` returns the 9 tools (§8) in a fixed order, with `ttlMs` and `cacheScope: "public"`.
- Not used: roots, sampling, logging, resource subscriptions, tasks, elicitation, MRTR. Errors come back as a tool result with `isError: true` and a one-line fix. Logs go to stderr.
- `ctx_route` is an internal `mcp_tool` hook-dispatch target. It is not listed in `tools/list`.

## 7. Prompt delivery (ADR-0004, ADR-0005, ADR-0006)

- One prompt source in the repo: `src/prompt/instructions.md` and `src/prompt/tools/<tool>.md`. The build inlines them. No other file, in the repo or in user space, carries routing text.
- No per-agent routing file (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `QWEN.md`, `SYSTEM.md`, `copilot-instructions.md`) and no routing `SKILL.md`. Three command skills stay: `/ctx-stats`, `/ctx-doctor`, `/ctx-upgrade` (§8). They hold no routing text; each only calls its own tool.
- Rules, checked by `build/prompt-lint.mjs` against the built `initialize` and `tools/list` output (ADR-0005 PR1–PR12):
  - no caps imperatives, no blanket defaults, no "if in doubt" clauses, no pseudo-XML directive tags, no more than 2 quoted trigger phrases per text.
  - instructions ≤ 2,048 chars; each tool description ≤ 1,024 chars; all descriptions plus schemas ≤ 8,000 chars (decision Q5, Q13).
  - the first line of the instructions stands alone, because Pi's listing shows only that line.
  - deterministic bytes, no runtime/OS/version-dependent text, checked on 3 CI operating systems.
  - tool names in prompt text are always bare (`ctx_execute`), never host-prefixed; each agent shows the model its own prefixed name next to the description.
- `ctx_execute` carries `_meta: {"anthropic/alwaysLoad": true}` on Claude Code, so its description and schema are in context from turn one; the other 8 tools stay deferred behind tool search (ADR-0006). Re-probed 2026-10-15 on Opus 5.5 and Sonnet 5 (`https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/spikes-r5/ADR-0006-reprobe.md`): it moved Opus from 3/3 to 1/3 under-routing on large tasks with no added over-routing; it made no measurable difference on Sonnet. Kept, because it helps Opus and costs nothing on either model; Sonnet under-routing is handled by the enforcement rules in §10, not by tool loading.
- Agents that ignore `instructions` (Kiro; ZCode, unconfirmed) get routing from tool descriptions only. No steering file is added for them (decision Q10).
- Pi runs as an in-process plugin, not over MCP: it gets the same `instructions.md` bytes through its `before_agent_start` hook (decision Q7).

## 8. Tools

Nine tools, in this fixed order: `ctx_execute`, `ctx_batch`, `ctx_index`, `ctx_search`, `ctx_resume`, `ctx_stats`, `ctx_doctor`, `ctx_upgrade`, `ctx_purge` (decision Q3b). `ctx_insight` is removed; there is no CLI kept for it.

Common contract:
- First line of every result is a one-line summary. No code echo by default; `ctx_execute` takes an optional `summary` flag to re-enable it.
- One global output cap, **`OUTPUT_CAP = 16,384` bytes**, for every tool reply, the §10 subagent-replace path and the §10 deny threshold (decision Q2). It is not the 2 KB `ctx_resume` cap and not the 4,096 B `ctx_doctor` report cap (§13).
- `readOnlyHint: true` on `ctx_search`, `ctx_resume`, `ctx_stats`, so plan mode allows them; `ctx_execute` is not read-only.
- Errors: one line naming the cause, never a raw Node stack.

Per tool:
- **ctx_execute** `{language, code, file?, intent?, timeoutMs?, background?, summary?}`. Default and max timeout **600,000 ms** (10 minutes; spike S-TIMEOUT, decision Q8): when the caller omits `timeoutMs` the default applies, and it is also the ceiling; longer work uses `background: true`. Kills the whole process tree on timeout or cancel (Unix: process group, `kill(-pid)`; Windows: `taskkill /F /T /PID`, the proven v1 mechanism — no switch to a Job Object without its own ADR). Always spawns the interpreter binary directly, `shell:false`, on every OS: no git Bash / PowerShell / cmd shell choice. Languages: shell, powershell, javascript, typescript, python, plus any runtime found on PATH. Grep exit 1 is not an error.
- **ctx_batch** `{commands[], queries[]}`. Queries search the whole session scope; an identical chunk returned twice inside one batch call is deduped.
- **ctx_index** `{path | content | url, source?}`. Honours `HTTP(S)_PROXY`/`NO_PROXY`; the SSRF check runs on the resolved target, in the fetch process, after proxy env is applied — never as a separate pre-check (decision Q19, closes #476's gap). Nested `.gitignore` with negations (#1292); `**` matches zero or more directories (#1291).
- **ctx_search** `{queries[], scope?: "session"|"worktree"|"project", source?, offset?, sort?: "relevance"|"timeline", after?}`. Default scope **`worktree`** (decision Q6): an agent sees its own worktree's sessions by default (#1185); `scope:"project"` reads every worktree of the repo; `scope:"session"` reads only this session. Ranking inside a scope: `scope:"session"` keeps v1 BM25 as is; `scope:"project"`/`"global"` orders current session first, then Reciprocal Rank Fusion (k = 60) of a BM25 list and a recency list, then `seq` ascending (DECISIONS-r6 D4, #895). No MMR: it gave no gain over RRF and about twice the latency, measured on 90 real queries (recall@5 0.48 vs v1 0.27 for BM25+RRF; MMR 0.47) (DECISIONS-r7 R1, R2). `sort:"timeline"` (DECISIONS-r6 D2) merges ContentStore, SessionDB and auto-memory, oldest first by normalized ISO-8601 UTC time, paged by `after`; `offset` is relevance-only, `after` is timeline-only, and mixing them is `isError INVALID_ARGS`. A journal row gets `kind:"decision"` only from an `AskUserQuestion` tool answer or a plain option echo on the next turn, never a classifier or a marker-word list (DECISIONS-r6 D3); `source:"decision"` searches those rows only. Zero hits states the scope and the source count. An unknown `query` field is rejected with `isError` (decision Q19).
- **ctx_resume** `{session?, seq?: number}`. ≤ 2 KB summary built from the journal (§11). `ctx_resume(seq:N)` is a primary-key read of one pointer row, used both for resume and for an oversized item from the compaction state.
- **ctx_stats** — see §12.
- **ctx_doctor**, **ctx_upgrade** — kept as tools, rebuilt for v2; see §13. Uninstall is a mode of `ctx_upgrade` (decision Q16), not a separate tool or a CLI command.
- **ctx_purge** `{session | source | project}`.

## 9. Sandbox (core/sandbox)

- `spawn(argv, {env})`: env is never written into command text; `NODE_OPTIONS` and preload files never leak past the direct child.
- PATH = the parent's PATH; runtimes are found by PATH lookup, including `#!/bin/sh` shims, lazily on first use, never at boot.
- PowerShell/pwsh scripts carry a UTF-8 BOM plus a console-encoding prelude, so a non-ASCII string round-trips.
- Containment: path checks by path components, never a string prefix; every worktree of the project is inside the containment root (#954, #1294).
- Outbound HTTP from the sandbox is denied, the same rule as §10; proxy env (`HTTP(S)_PROXY`/`NO_PROXY`) is honoured, with the SSRF check running on the resolved target (decision Q19).
- Cold start replies in under 1 second, with no PATH probes at boot.

## 10. Hooks and enforcement (ADR-0001, ADR-0008, ADR-0016)

### 10.1 Canonical events

Claude Code's own hook schema is the reference contract (ADR-0001): four canonical events.

| Canonical event | Job |
|---|---|
| SessionStart | journal hint; `ctx_resume` hint |
| UserPromptSubmit | journal: user request |
| PreToolUse | hint / deny / rewrite |
| PostToolUse | journal: tool call, bytes, `ctx_*` credit |

`PreCompact`, `Stop`, `SubagentStop`, `SessionEnd` and `Notification` exist in Claude Code but are out of canonical scope; they are used only where an agent has no other path for one named job (for example, the compaction delivery table in §11 for Gemini, Copilot CLI and VS Code). A tool error is read from the `is_error` field already inside `PostToolUse`'s own payload; it is not a separate event.

One hook entry per host; host config (`hooks.json`, `settings.json`, TOML) is generated from `adapters/table.ts`, and every entry carries a timeout. Claude Code's real gate is a `settings.json` matcher — a regex over the tool name in the generated `hooks` block — not a server-side filter: an unrelated `mcp__` tool call spawns zero hook processes.

### 10.2 Deny, rewrite, allow

Deny scope stays v1's in full (decision Q5): the user's own deny rules also check `ctx_execute`/`ctx_execute_file`/`ctx_batch_execute` input; a shell-command parser (lexer + recursive descent, no regex) unwraps `sudo`, `env`, `time`, `nice`, `timeout`, `xargs`, `command`, `bash -c`/`sh -c` and `$()`/backticks before reading argv0, so curl/wget behind any of those is still caught (#1221, #166).

| Case | Rule |
|---|---|
| WebFetch | deny; alternative: `ctx_fetch_and_index` + `ctx_search` |
| curl/wget whose body reaches the tool output | deny |
| curl/wget writing to a file, or ending in a bounded sink (`head -c N`, `wc`, `grep -c`, a scalar `jq`) | allow (#166, #1125) |
| inline HTTP in a shell command | deny |
| build tools (gradle, mvn, sbt) | deny; the alternative is `ctx_execute` with `intent`, full output, nothing cut |
| Read, no `offset`/`limit`, file > `OUTPUT_CAP` (16,384 B) | deny; alternative: the same `Read` call with `offset`/`limit`, or `ctx_execute` with `file` |
| Read with `offset` or `limit`, any size | hint, once per session — never denied |
| other Bash, Grep | hint, once per session |
| large output from another MCP server's tool (`mcp__<other>__*`) | routed under the §10.3 rules; the hint re-fires every 10 calls by default, env-tunable (decision Q1) |

- A real hard deny, with a reason that carries the rewritten command. `allow` + `updatedInput` is never used: Claude Code ignores it for Bash (v1 commit `4bc292fc`, decision Q3).
- Parse errors (a construct the shell parser does not handle: `[[`, `((`, `case`, functions, process substitution): deny when a user deny rule could match the command; allow only when the curl/HTTP rule is the only one that could apply (decision Q4).
- Denies are stateless per call, so every call inside a parallel batch is checked; hints are "once per session", keyed by `session_id`.

### 10.3 Subagents (ADR-0016)

Owner rule: large output must not enter a subagent's context either. The same `OUTPUT_CAP` applies in the main session and in every subagent; only the named alternative changes, so it is one the subagent can actually call.

| Case | Subagent has | Mechanism |
|---|---|---|
| A | ctx tools | same deny as the main session |
| B | Bash, no ctx tools | deny with the rewritten command; a wrapper re-applies the full deny pipeline, then indexes the full output and returns the best-matching whole chunks under the budget plus a `more:` follow-up |
| C | neither ctx tools nor Bash | the tool's output is replaced after the run with the best-matching whole chunks under the budget (Claude Code: `updatedToolOutput`) |

Subagent detection keys on the hook payload's `agent_id` only; `agent_type` only selects the tool-set row once `agent_id` says this is a subagent call (decision Q23). The tool set is `tools:` minus `disallowedTools:`, read from project, user and plugin agents and from `--agents` JSON; an unresolved `agent_type` goes to case B or C, never case A.

No case cuts text mid-chunk: selection is a budgeted greedy pick of whole chunks, scored by BM25 against the call's `intent`. It shares its greedy shape with the compaction selection in §11, not its scoring formula.

## 11. Compaction and state (ADR-0009)

The post-compaction block is a deterministic function of this session's journal rows in `context.db`. No LLM, no regex; no text is ever cut: whole items are selected, or an item becomes a pointer (`ctx_resume(seq:N)`).

- One write path: the server writes journal rows from its own `ctx_*` handlers at return time; hooks write rows only for other adapters' host tools.
- Rows (`events` table): `prompt`, `edit`, `cmd`, `toolerr`, `index`, each keyed by `session_id` and `seq`.
- Candidates: last request (pinned), open errors (resolved once the same command or input later succeeds), changed files, earlier requests, indexed sources — at most 85 candidates per section. A `decision` row (below) is never a candidate; the prompt row already carries the text.
- Score: `weight (open error 900, prompt 500, edit 400, index 200) × decay (0.25 + 0.75 · 2^(−age/4), half-life 4 turns) × bonus (1 + ⌊log2(repeat_count)⌋)`, integers only. Ratio for selection: `score × 0.7^k / bytes`, where k is lines already taken from that section.
- Selection: budgeted lazy greedy by ratio, budget **2,048 UTF-8 bytes**. An item over 640 B is never cut; it becomes a pointer line `#<seq> (<bytes> B) ctx_resume(seq:<seq>)`. The same rows give byte-identical output, computed once per turn, never re-rendered mid-turn. These constants are unchanged from a deterministic 12-case sweep and a 6/6 train, 6/6 held-out tuning sweep (DECISIONS-r6 D1): no tested variant beat the baseline on held-out cases. A full actor/judge live eval (120 calls) is an open item before any future weight change; one golden case (GP6) asserts the one measured miss is a budget skip, not a scoring bug.
- A journal row gets `kind:"decision"` only from an `AskUserQuestion` tool answer or a plain option echo of its option list on the next user turn — never from message shape or an English marker-word list (DECISIONS-r6 D3). It is searchable with `ctx_search(source:"decision")` and is not a compaction candidate.
- `compactSummary` column (`adapters/table.ts`): `"host"` or `"none"`, per agent (DECISIONS-r6 D6).
  - `"host"` (Claude Code only, verified): the host writes its own compact summary. After compaction, inject one pointer line only, no state block: `context-mode: earlier work of this session is in ctx_resume (state block) and ctx_search(scope:"session", sort:"timeline").` The 2,048 B block stays on demand: `ctx_resume()` with no `seq` returns it.
  - `"none"` (every other agent, until a live check): inject the 2,048 B block (D1 formula, unchanged) through that agent's own ADR-0009 §6 delivery path.
  - LV-COMPACT (milestone M3) is the per-agent live check: it proves a host writes its own summary before that agent's row flips to `"host"`.
- Delivery, one path per agent (how the block or pointer line reaches the model):
  - Claude Code, Codex, Qwen, ZCode: computed inside `SessionStart(source=compact)`.
  - Gemini, Copilot CLI, VS Code: the compaction hook writes a pending flag; the next prompt hook delivers it exactly once.
  - Pi: a `session_compact` flag, then `before_agent_start`, once.
  - OpenCode 2, Pi: delivered once, through a channel that keeps the prompt cache stable (decision Q12).
  - Kiro: not supported — no compaction signal of any kind. A documented gap, not an open question.
- No injected memory and no role/intent classifier. Auto-memory is only a search source inside `ctx_search`.

## 12. Stats

- `ctx_stats` computes on demand: it reads the journal read-only. No lifetime cache, no timer, no all-DB scan on a heartbeat.
- One formula: **saved = bytes produced in the sandbox − bytes returned to the model**. Cost events are keyed by turn id so a repeated step-finish event in one turn counts once; `reduction_pct` counts returned bytes once in the denominator.
- Per agent: "no data" with the reason, when there is none. 0 calls gives 0 savings.

## 13. Doctor and upgrade (ADR-0010)

`ctx_doctor` is read-only, one table row per check (D1–D10: version, Node/`node:sqlite`, host config, v1 leftovers, hook round trip, double-fire, MCP, project source, `context.db` integrity, index counts, enforcement mode). Each FAIL line reads `FAIL <host>: <check> — <cause>. Fix: <command>`. The report is ≤ 4,096 B.

The server never imports `node:sqlite` statically: if Node or `node:sqlite` fails the precondition, the server still completes the handshake and lists one tool, `ctx_doctor`, which returns the report with the failing row and its fix.

`ctx_upgrade` covers install, upgrade, and uninstall as one of its modes (decision Q16, Q21):
- One shared `resolvePluginRoot(adapter)` function for install, upgrade and the doctor path checks — no per-adapter divergent copy.
- Runs the plugin-cache-path check automatically at the start of install and of every upgrade, not only on a manual `ctx_doctor` run.
- Marketplace/host-managed agents (Claude Code, Codex, Gemini, Qwen, Copilot CLI): prints the host's own update command; `ctx_upgrade` does not download anything itself.
- Git-checkout agents (Pi, OpenCode 2, manual installs): fetch the latest `release` commit, verify the bundle hash, switch atomically, keep the previous dir for one rollback.
- Config: regenerates only context-mode's own entries from `adapters/table.ts`; keeps user keys and values; paths are resolved at hook-run time, never baked in.
- Uninstall needs `confirmDelete: true` to remove user data; without it, user data is kept. Either way it always stops the server and removes the cache and context-mode's own config entries.
- Never touches a user instruction file or a data dir it did not create.
- Content-store retention follows the age + live-PID + size-cap rule of §4.

## 14. Release, branches and v1 transition (ADR-0011, ADR-0013, ADR-0017)

- `main`: v1, frozen, protected by GitHub branch protection (decision Q14). `v2`: development. `release`: built output only. It carries the one publishable `package.json` (ADR-0019 D1: `bin`, `type`, `engines`, `files`, `pi`; no `dependencies`, no `scripts`).
- One release command, `/release` (repo skill): it runs the tests and the live harness (§15), shows the version and notes, then starts `release.yml` (`workflow_dispatch`), which builds, publishes to a `release-staging` ref, smoke-tests installs from it, and only then fast-forwards `release`.
- v1 users must not leave (ADR-0017 R1–R8, release gate):
  - `main` stays frozen, so v1's own `/ctx-upgrade` keeps being a no-op.
  - The install order is **install v2 → run `/ctx-upgrade` → only then `npm uninstall -g`** (ADR-0011) — this order keeps Codex/Copilot CLI/VS Code hooks, which call the global npm binary, working through the switch.
  - Nothing the user configured (hook timeouts, `permissions.deny`, added MCP entries) is removed, only reported.
  - The README names a per-agent rollback command.
  - The switch itself is rehearsed as a named live case before every release.
- v1 cleanup has one pure `detectV1(agent)` per agent that only reports; `ctx_upgrade` removes what it finds. There is no data migration, ever.

## 15. E2E tests at every step (ADR-0003, ADR-0017, TECH-SPEC §6)

- Two layers only: **E2E-style** (GP1–GP11, built artifacts driven over stdio by a fake host, no model, every PR on macOS, Linux and Windows) and **E2E-live** (a real agent and a real model turn, by hand and on release-candidate tags, never on a schedule).
- v1 unit tests are not deleted up front: the 131 `KEEP-PASS` files, of 209 reviewed (`https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/review/TEST-TRIAGE-r2.md`), keep running on vitest until v2 passes them; 52 are ported; 26 are retired with their ADR named. v1's `tests/` tree is deleted in one commit, only once every row has a verdict and GP1–GP11 are green on all 3 OS.
- No implementation step is done without a green E2E case (ADR-0017): E2E-style runs free on every commit; E2E-live runs after each step, on the owner's Mac, on **`claude-sonnet-5 --effort low`**, against only the cases the step touched; the full live set runs once before each release, with Opus and Haiku added only for the routing probe (§7).
- Live E2E needs no API key (ADR-0012): `claude -p` runs on the owner's own subscription with `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL` and `ANTHROPIC_CUSTOM_HEADERS` unset; Codex runs logged in with ChatGPT through a temp `CODEX_HOME` holding only a symlink to the real `auth.json`. Only agents actually installed and logged in on the owner's Mac run; the rest print `SKIPPED` with a reason. `/release` refuses to start once 3 runs in a row were skipped.
- Golden paths GP1–GP11 cover: install and handshake, the prompt surface, hooks, `ctx_execute`, `ctx_index`/`ctx_search`, the journal and `ctx_resume`, scope, concurrency, lifecycle, doctor/upgrade, and stats (TECH-SPEC §6.2). `GP-LIVE-ROUTING` and `GP-LIVE-HOOKS` are live-only.
- CI matrix: macOS, Linux and Windows, each on Node 24.15.0 (the minimum, S-NODE) and the current Node line.

## 16. Issues and debug reports (ADR-0014)

- Issues only; pull requests stay disabled. `ctx_doctor` always answers, even in a degraded start.
- The typed `ctx-report` (≤ 4,096 B, 38 lines) carries version, Node/sqlite/FTS5, protocol versions, enforcement mode, v1 leftovers, path facts, DB integrity, hook timings, deny-vs-follow counts and the D1–D10 checks. Every value passes a typed scanner (int, semver, hex40, date, enum, bool, or a JSON pointer against our own schema); a value that fails the scanner becomes `<invalid>`.
- The reporter is an AI agent (owner rule, decision Q18): the issue form requires the full report plus paths, logs, versions, journal rows, the steps, and transcript excerpts of the failing turns. Only secrets (tokens, `.env` values, Authorization headers) are stripped.
- Templates: `bug.yml` (doctor report required, agent dropdown, steps must name the denied tool and the alternative it gave), `config.yml` (blank issues disabled), `feature.yml`. No `PULL_REQUEST_TEMPLATE.md`.

## 17. Removed in v2

Bun and `bun:sqlite`, better-sqlite3, `ensure-deps` and every heal script, `start.mjs`'s chdir/heal flow, snapshot injection, the `<context_window_protection>` block, per-agent `AGENTS.md`/`CLAUDE.md` templates, the routing `SKILL.md` and the maintainer-only ops skill, statusline, `ctx_insight`, HTTP daemon mode, the lifetime stats timer and all-DB scan, `ps` liveness, the global MCP-ready sentinel, the search call-rate throttle (`flood-guard.ts`, dropped and not replaced — it would re-trip on legitimate fan-out from concurrent subagents), runtime `npm install`, and the `web/` marketing site (deleted, not moved elsewhere).

Removed agents: Cursor, JetBrains Copilot, Kimi, Codex Desktop, OpenClaw, OMP (Oh-My-Pi), Antigravity/agy, OpenCode 1.x, Zed. Every file for a removed agent is deleted from the repo, not only from the release tree; a CI check fails if any of those paths reappear.

## 18. Milestones

Every milestone names its own E2E gate (ADR-0017): no milestone's work counts as done without a green case for it.

- **M0 Spikes and scaffolding.** Close the open spikes: S-COPILOT, S-ZCODE, S-NAMES, S-SKILLS, S-CODEX, G25 (TECH-SPEC §9). Build the E2E/live harness scaffolding (`e2e/harness/`, `e2e/live/`) and the fixture set. Gate: one no-op case runs green on each layer.
- **M1 Core.** store, sandbox, lifecycle, the 9 tools and their GP cases. Gate: GP4, GP5, GP8, GP9 green.
- **M2 Reference adapters.** Hook entry, journal, policy, Claude Code and Codex. Owner checkpoint at the end: confirm the hook contract, the journal schema, and the policy decision shape. Gate: GP1–GP3 and GP6 green on both agents.
- **M3 Other hooks+MCP adapters.** Gemini, Qwen, Copilot CLI, VS Code, Kiro, ZCode. Gate: GP1–GP3 green on each; S-NAMES, S-COPILOT and S-ZCODE closed.
- **M4 Plugin adapters.** Pi, OpenCode 2. Gate: GP1–GP3 green in-process; G25 answered for both.
- **M5 Doctor, upgrade and stats.** `ctx_doctor`, `ctx_upgrade` (incl. uninstall), `ctx_stats`. Gate: GP10 and GP11 green.
- **M6 Docs and README.** Gate: `lint.mjs` passes and the README stays under its line cap.
- **M7 Release and close-out.** Run the full live set (§15), rehearse the v1-migration case (§14), close every issue and PR with its outcome. Gate: every exit criterion in TECH-SPEC §1 holds.

## 18a. Implementation specification

The module structure, dependency rules, constants, and per-module file map for implementers live in [`docs/architecture/modules/README.md`](impl/README.md), under [ADR-0018](adr/0018-implementation-architecture.md). Start there before writing code for any milestone above.

## 19. Changes

- 2026-10-22 (ADR-0019): the 2026-10-13 "no npm, no CLI" rule is replaced. npm is the user channel and `context-mode setup|doctor|upgrade` is the CLI. See `PRD-setup.md`.
- 2026-10-13: dropped the v1.x line (fixes land only in v2); no skills beyond the 3 commands; Antigravity/agy removed; v2.0 scope fixed at 10 agents.
- 2026-10-14 (r3, `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/review/DECISIONS-r3.md`): accepted Q1–Q24 and D1 — output cap, timeout value, deny scope and mechanism, Node minimum, project-source rule, search default, uninstall mode, and the rest, folded into §4–§16 above.
- 2026-10-14/15 (r4 fix pass, recorded in each ADR's own Changes section): corrected citations, closed cross-ADR contradictions (the §10/§11 selection-formula claim, Q6 checkpoint ownership, Kiro's seven open findings), added the missing per-host rows.
- 2026-10-15 (r5 spikes): S-NODE (Node 24.15.0), S-TIMEOUT (600,000 ms), and the ADR-0006 alwaysLoad re-probe on Opus 5.5 and Sonnet 5 — all folded into §4, §7 and §8 above.
- 2026-10-15: this document rewritten as one consistent design, with history moved into this section.
- 2026-10-16 (DECISIONS-r9, S8): §3.2 tree matches 00-architecture.md §1 (`src/core/store/`, `src/core/journal/`, `src/core/project/`, `src/core/compaction/`, `src/core/ops/`), closing F3.
- 2026-10-16 (r6, `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/review/DECISIONS-r6.md` D1–D4): §8 `ctx_search` row rewritten for the D2 timeline contract, the D3 `decision` rule and the D4 RRF (k=60) cross-session order; §11 compaction gains the full D1 formula with its constants unchanged and the `decision` row rule.
- 2026-10-16 (r6, `DECISIONS-r6.md` D6): §11 compaction delivery now depends on `adapters/table.ts` column `compactSummary`. Claude Code = `"host"`: inject one pointer line only. Every other agent = `"none"`: inject the 2,048 B D1 block, unchanged, through its ADR-0009 §6 path, until LV-COMPACT (M3) proves that agent's host writes its own summary. See `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/memory-r6/eval/results.md`.
- 2026-10-16 (r7, `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/review/DECISIONS-r7.md` R1, R2): §8 `ctx_search` row states the measured recall gain for BM25+RRF (k=60) over v1 (0.48 vs 0.27) and drops MMR, which gave no gain.
- 2026-10-16 (r8, `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/review/DECISIONS-r8.md` VR): §10.2 Read row changed from hint to deny. An unranged Read of a file over `OUTPUT_CAP` is now denied; a ranged Read (`offset`/`limit`) stays a hint and is never denied.
