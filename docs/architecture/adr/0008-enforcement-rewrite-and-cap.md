# ADR-0008: Enforcement = v1's rule set, with the mechanisms that caused its issues replaced

- Status: Accepted (2026-10-15). Owner: "v1'deki gibi olsun ama issue'lar da fixlensin." Owner accepted `DECISIONS-r3.md` in full and delegated the r4 fixes in `DECISIONS-r4.md`. This replaces r2's generic size-prediction deny on every Bash call. The GS6 hook-budget number (see "Open" below) is still unratified and stays open.
- Sources: v1 `hooks/core/routing.mjs` @ `5869f4fa` (lines 670–900); issue titles from `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/data/isall.json`; round-4 evidence `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/round4-evidence.json` (parser timing, `mcp_tool` hook, live deny on Haiku).

> **Amended 2026-10-20 (DECISIONS-r10).** On agents whose adapter row supports replace, the main agent runs the call first. If the result is larger than `OUTPUT_CAP`, `PostToolUse` indexes it and returns BM25-selected chunks plus the "more" line through `updatedToolOutput` (same path as ADR-0016 case C). The Bash deny and rewrite rows in the table below (curl/wget, inline HTTP, build tools) were size guesses; they are removed on those agents. Kept: WebFetch deny, user `permissions.deny`, the Read deny, and subagent rules. All hints (the Grep, other Bash and ranged-Read hint rows, and change #7 "once per session" hint keys) are removed. Agents with no replace keep their current single path (ADR-0001).

## Same scope as v1

| Tool / case | v1 | v2 |
|---|---|---|
| WebFetch | deny → `ctx_fetch_and_index` + `ctx_search` | **deny**, same alternative |
| curl/wget whose body goes to stdout | `modify` to an `echo` (works as a deny) | **deny** |
| inline HTTP in a shell command (`fetch(`, `requests.get(` …) | `modify` to an `echo` | **deny** |
| build tools (gradle, mvn, sbt) | `modify` to an `echo` that suggests `… \| tail -30` | **deny**; the alternative is `ctx_execute` with `intent` (no `tail`, nothing cut) |
| Read, no `offset`/`limit`, file > `OUTPUT_CAP` (16384 B) | hint | **deny**; alternative is the same `Read` call with `offset`/`limit`, or `ctx_execute` with `file` |
| Read, `offset`/`limit` given, any size | hint (once per session) | hint (once per session) — never denied, this is the escape hatch |
| Grep, other Bash | hint, once per session | hint, once per session |
| user `permissions.deny` | deny, incl. ctx_execute / ctx_execute_file / ctx_batch_execute input | deny, same scope (Q5) |
| large output of other MCP servers' tools (`mcp__<other>__*`) | routed (#529) | routed: ADR-0016 case C replace; hints as PRD:103 (Q1) |

No new deny categories are added. The r2 deny of any Bash call whose predicted output is too large is dropped, so ordinary commands behave as they did in v1.

**Read is the one line in this table that changed from v1's behaviour (see "Read: hint to deny" below).** v1 only ever hinted on Read (#1267: the hint re-fires on every over-size Read and never blocks it), so Read carried 62% of all large-output bytes in the 322k-call measurement (`https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/final-review/e1-deny.mjs`) while the deny rules above caught 0.11% of large bytes total (REVIEW-final.md A2). v2 denies the first Read of an over-size file and names the ranged-Read alternative in the deny reason; because `offset`/`limit` reads are never denied, Read-before-Edit still works — the model just reads a slice instead of the whole file.

### Read: hint to deny

- Rule: on `canonical === "Read"`, if `!input.offset && !input.limit` and the real file size is `> OUTPUT_CAP` (reusing the existing cap, not a separate `READ_HINT_BYTES` — Q2 below), return `{kind:"deny", reason: "context-mode: this file is {size} bytes, more than the {cap} byte limit for one read. Pick one: read part of it with Read(file_path, offset, limit), for example limit 200; or run code on it with ctx_execute(language, code, file=\"{path}\"), which gives your code the path in CTX_FILE and returns only stdout, up to {cap} bytes; or search it with a bounded command such as grep -n or tail.", onceKey: none}`. This is a stateless per-call deny (ADR-0008 item 7), not a once-per-session hint, because the real bytes must never reach the model even on retry.
- Escape hatch: any Read call that already sets `offset` or `limit` is never denied, regardless of file size — this is what keeps `#1267`-style loops from becoming a dead end and what keeps the read-before-edit workflow legal (v1 issue history, see `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/review/out/read-fix/archaeology-read.md`).
- `READ_MAX_LINES = 200` is text only, named in the deny reason as the example `limit`. It is not enforced: on denied reads the median line is 48,848 B, so a 200-line slice still exceeds `OUTPUT_CAP` in 30.8% of them (`DECISIONS-r8.md`). It is a suggestion in the reason string, nothing more.
- Shell file dumps on hosts with no `Read` tool get the same test: the command parser (no regex) reads argv0 for `cat`, `head`, `tail`, `sed -n`, `less`, `jq`, `bat`, `more` on one file argument, runs `fs.stat` on it, and applies the same size test and reason as Read. A dump with an explicit bound (`head -n N`, `tail -n N`, `sed -n 'a,bp'`) is the shell form of a ranged Read and is allowed.
- Non-goal: this does not predict size before the call; the hook has the real byte count already (`PreToolUse` for Claude Code's `Read` fires after the file is resolved but the server denies before it is returned to the model — same point v1 denied WebFetch at, item 10 above). No new deny categories, no regex: the rule is `size > OUTPUT_CAP && !offset && !limit`, an `if`, not a pattern.
- Open (new): `READ_HINT_BYTES` (`51200`, `impl/01-contracts.md:84`) is retired in favor of `OUTPUT_CAP` for the deny threshold, so there is one cap, not two. The hint on ranged reads keeps using `OUTPUT_CAP` too, for the same reason.
- Decided (T4, `DECISIONS-r9.md` V1): test spec `T-T4` counts all three named paths as recovery — a ranged `Read`, `ctx_execute(file)`, or a bounded shell search (`grep`, `tail`, …) — because the deny reason text already names all three. Milestone M1, n = 10 forced whole-file `Read` + 10 edits; pass if recovery by any named path ≥ 8/10, the correct answer ≥ 9/10, and the edit is done ≥ 9/10.

## What changes, and which issues each change fixes

| # | v1 mechanism | v2 mechanism | Fixes |
|---|---|---|---|
| 1 | Regexes over a quote-stripped string | Own shell parser: lexer state machine + recursive descent, no regex, about 12 KB, 1.26 ms in the server. The decision looks at each simple command's argv0 and parsed flags | #1221 (curl inside quotes, grep patterns, heredocs), #1106 (regex matched argument words) |
| 2 | Any curl/wget in a compound command → the whole command replaced | Decide per pipeline. Allow when the body does not reach the tool output: written to a file (`-o file`, `-O`, `>`), or the pipeline ends in a bounded sink (`head -c N`, `wc`, `grep -c`, `jq` with a scalar …). Deny only when the body reaches stdout | #1269, #1125, #166, #792, #817 |
| 3 | `modify` to an `echo` command | A real deny with a reason (each agent's native field, ADR-0001 adapter table) | #1134 (Codex auto-review flagged the echo as instruction drift) |
| 4 | `isMCPReady()`: a machine-global PID marker file | Claude Code: the PreToolUse hook is `type:"mcp_tool"`, so it runs only while this session's server is connected; otherwise the tool runs. Pi, OpenCode 2: in-process, availability is known. Other agents: the server writes a `ready` row (agent, worktree, pid, heartbeat every 30 s) in `context.db`; the hook denies only if a row for the same agent and worktree is younger than 60 s | #1055, #1053, #347, #173, #230. Live check LV7: two concurrent sessions of a command-hook agent in one worktree |
| 5 | Subagents denied although they cannot call ctx tools | Subagents get the same output budget; the deny or rewrite names an alternative the subagent can call (ADR-0016). Never a plain allow | #794, #1037 |
| 6 | WebFetch denied for every URL | A host table that is never denied (the claude.ai artifact hosts). A user policy file with an `allowHosts` list | #1006, #984, #938, #908, #843 |
| 7 | Deny/hint state "once per process"; parallel batches slip through | Stateless per call for denies, so every call in a parallel batch is checked. Hints "once per session" are keyed by `session_id` in `context.db` | #1003, #1267 |
| 8 | Routing text injected into subagent prompts | No injection; routing lives in the tool descriptions (ADR-0004) | #967, #832 |
| 9 | Build-tool alternative cut the output with `tail -30` | `ctx_execute` with `intent`: full output indexed, the matching part returned | (owner rule: no truncation) |

## Deny message

Built from the input; the original text is kept as-is:

```
context-mode: <what> sends its body into the conversation.
Run it here instead; the full output is indexed and only the part that matches your intent comes back.
Tool: <exact tool name for this agent>
{"language":"shell","code":<original command>,"intent":<the description field, or "state what you need">}
```

- The exact tool name comes from the adapter table (TECH-SPEC §3.8), so `ToolSearch select:` loads the deferred tool in one step.
- For WebFetch the message names `ctx_fetch_and_index` with the URL, then `ctx_search`.
- **[V] live on Haiku:** the deny reached the model as an `is_error` tool result, and the model used the exact alternative.

**Bash-command-redirect-deny row, per adapter:**

| Adapter | `modifiedArgs` support |
|---|---|
| Claude Code | yes (ADR-0001 adapter table) |
| Codex | yes |
| Copilot CLI | **unverified** — confirm live before release |

Until confirmed, Copilot CLI uses the plain deny-with-reason path (no `modifiedArgs`), same as any adapter without rewrite support.

## Cross-reference: large-output selection (ADR-0016)

ADR-0016's wrapper/replacement text describes its chunk selection as "the same selection as ADR-0009." Precisely: it shares the greedy-shape with ADR-0009 (budgeted lazy greedy, whole items only, nothing cut); the scoring formula differs (ADR-0016 ranks by BM25 against the stated intent, ADR-0009 scores by `weight x recency x repeat` — see ADR-0009 §3). Both pass through `OUTPUT_CAP = 16384` (Q2).

## Parse errors

(DECISIONS-r9 P1/P2) Only five constructs raise `ParseError(code)`: process substitution (`<( )`/`>( )`), an
unterminated quote, an unterminated heredoc, `coproc`, `select`, and nesting past `MAX_NEST_DEPTH` (`32`). Result
(Q4) for each: deny when a user `permissions.deny` rule could match the command; allow only when the curl/HTTP
rule is the only rule that could apply. `[[ ]]`, `(( ))`, `case`/`esac`, and function definitions are **not**
`ParseError` — the parser reads inside them: a `[[ ]]`/`(( ))` body is skipped (never a command), and every
`case` branch body and every function body is parsed as a nested command list and checked by the normal curl/
HTTP/build rules (`impl/08-enforcement.md` §2.2, §2.3). GP3 lists every code and its verdict.

## New scope beyond v1 parity (Q5)

v1 only detected curl/wget directly (`routing.mjs:735-765`). v2 unwraps `sudo`, `env`, `time`, `nice`, `timeout`, `xargs`, `command`, `bash -c`/`sh -c` strings and `$( )`/backticks before it reads argv0, so curl/wget behind any of those wrappers is also caught. The #166 silent/verbose curl checks stay (v1 `routing.mjs:745-765`). User `permissions.deny` also checks `ctx_execute`/`ctx_execute_file`/`ctx_batch_execute` input.

## Golden cases (GP3)

| Input | Expected | Issue |
|---|---|---|
| `curl -s https://x.io/a.json` | deny | — |
| `curl -sL -o out.bin https://x.io/f` | allow | #166 |
| `curl -s https://x.io \| head -c 200` | allow | #1125 |
| `git log --grep="curl"` | allow | #1221 |
| `cat <<EOF … curl … EOF` (curl only in the heredoc body) | allow | #1221 |
| `npm ci && curl -s https://x.io/a.json && npm test` | deny; the alternative runs the whole command in `ctx_execute` | #1269 |
| `./gradlew build` | deny; the alternative has no `tail` | — |
| WebFetch of a claude.ai artifact URL | allow | #1006 |
| WebFetch from a subagent without ctx tools | per ADR-0016 case B/C, never a plain allow | #794 |
| Claude Code with the server not connected | the tool runs | #173 |
| Read of a 300 KB file | deny (unranged) | — |
| Read of a 300 KB file with `limit: 200` | allow | — |
| `[[ -f a.txt ]] && echo ok` | allow, no ParseError | — |
| `echo $((1+1))` | allow | — |
| `deploy() { curl -s https://x.io/a.json; }; deploy` | deny | — |
| `case "$1" in x) curl -s https://x.io/a.json;; esac` | deny | — |
| `echo "curl \"https://x.io/a.json\""` | allow | — |
| `diff <(curl -s https://x.io/a.json) <(echo x)` | deny | — |
| `FOO=1 curl -s https://x.io/a.json` | deny | — |
| `grep x <<< "$(curl -s https://x.io/a.json)"` | deny | — |
| `echo "unterminated` | `ParseError`, Q4 verdict | — |
| user deny `Read(//etc/**)` against `/etc/hosts` | deny | intern Q3 #1075 |
| user deny `Read(~/secret/**)` against `$HOME/secret/a` | deny | intern Q3 #1075 |
| user deny `Read(./x/**)` against `/x/a` | allow | intern Q3 #1075 |
| 10 synthetic large `curl`, 10 `wget`, 5 build outputs, each `> OUTPUT_CAP` | deny 25/25 (M1) | A1c |
| `sudo curl -s https://x.io/a.json` | deny | wrapper: `sudo` |
| `env FOO=1 curl -s https://x.io/a.json` | deny | wrapper: `env` |
| `time curl -s https://x.io/a.json` | deny | wrapper: `time` |
| `nice -n 10 curl -s https://x.io/a.json` | deny | wrapper: `nice` |
| `timeout 5 curl -s https://x.io/a.json` | deny | wrapper: `timeout` |
| `echo url \| xargs curl -s` | deny | wrapper: `xargs` |
| `command curl -s https://x.io/a.json` | deny | wrapper: `command` |
| `bash -c "curl -s https://x.io/a.json"` | deny | wrapper: `bash -c` |
| `sh -c "curl -s https://x.io/a.json"` | deny | wrapper: `sh -c` |
| `echo "$(curl -s https://x.io/a.json)"` | deny | wrapper: `$( )` |
| `` echo `curl -s https://x.io/a.json` `` | deny | wrapper: backticks |

## Open

- **Hook budget (GS6) — decided (`DECISIONS-r9.md` V14):** bare Node is 45.6 ms p95 on the owner's Mac, so command hooks cannot meet a flat "p95 ≤ 40 ms wall". Claude Code uses `mcp_tool` dispatch (no process spawn) and keeps `HOOK_P95_MS = 40` (`00-architecture.md` §3.2) as its wall-clock budget. Command-hook agents (every agent that spawns a process per hook call) instead meet `HOOK_CPU_OVER_NODE_MS = 20` (CPU time over bare Node, not wall clock) and `HOOK_COMBINED_P95_MS = 60` (wall clock, process start included). Test spec `T-GS6` (`14-tests.md` §6) measures both. This line is a dated decision; it does not go back to "Proposal."
- **Route hint ordering (A3, A7) — decided (`DECISIONS-r9.md` V6):** test spec `T-ROUTE` (`impl/08-enforcement.md` §6.4, `14-tests.md` §6) is the live check for hint/deny ordering across routed tool calls; no further owner input is needed.
- **Parallel batches and subagent output (A5, A6) — decided (`DECISIONS-r9.md` V7):** test specs `T-PAR` (parallel-batch denies, `impl/08-enforcement.md` item 7) and `T-SUB` (subagent output budget, item 5) close these; see `14-tests.md` §6.
- LV7 (above), and deny compliance on Opus and Sonnet, run in the live harness (ADR-0012).
- **Gap (cross-reference, owned by TECH-SPEC §9 G25 row):** OpenCode 2 has no v1 hook-fix history to validate against, so GP-LIVE-HOOKS for OpenCode 2 needs purpose-built test cases rather than regression replays of old issues.

## Cross-reference: Claude Code Case B (ADR-0016)

ADR-0016's adapter table cell for Claude Code Case B is "`updatedInput` + `allow` (LV1)". Per Q3 (below) and v1 commit `4bc292fc`, Claude Code ignores `updatedInput` on Bash, so this cell should read: deny with the rewritten command in the reason text (no `updatedInput`), matching the "Deny message" section above. The "LV1" label in that row should be removed — LV1 as described (allow + updatedInput) is already known-failing on Claude Code, not merely unverified. (Edit owned by ADR-0016; recorded here because ADR-0008 is the decision's other related doc.)

## Changes

- 2026-10-20 (DECISIONS-r10): main agent gets post-run replace; size-guess Bash deny/rewrite removed where replace is supported; all hints removed.
- 2026-10-16 (DECISIONS-r9): parser scope narrowed to five `ParseError` codes (P1/P2), `[[`/`((`/`case`/function
  now parsed not rejected (P1, P4 golden cases); GS6 hook budget decided (V14: `HOOK_P95_MS`/`HOOK_CPU_OVER_NODE_MS`/`HOOK_COMBINED_P95_MS` from `00-architecture.md` §3.2, no longer "Proposal"); A3/A7 route-hint ordering closed by `T-ROUTE` (V6); A5/A6 parallel-batch and subagent-output items closed by `T-PAR`/`T-SUB` (V7).
- 2026-10-14 (fix-r4, owners.adr-b): Q5 reworded as new scope, not v1 parity, with per-wrapper GP3 cases (A6); Copilot CLI added to the per-adapter deny-row with its `modifiedArgs` support marked unverified (A13); the ADR-0016 selection claim and Case B table cell corrected by cross-reference (A33, B3); GS6 hook budget routed to the owner as an open question (B46); OpenCode 2 G25 gap cross-referenced (B18).
- 2026-10-15: status set to Accepted. Folded r3's Q4 into "Parse errors" and Q5 (scope + GP3 wrapper cases) into a new "New scope beyond v1 parity" section and the GP3 table; Q2 (`OUTPUT_CAP = 16384`) was already in the "Cross-reference" section above; Q19's routing-parity and hint-ordering lines are owned by PRD §7 and ADR-0006, not repeated here. Removed the standalone r3 section.
