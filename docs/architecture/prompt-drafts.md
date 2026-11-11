# v2 prompt drafts: server instructions, 9 tool descriptions, 3 user skills

Status: DRAFT r3, 2026-10-15. These texts become `src/prompt/instructions.md` and `src/prompt/tools/<tool>.md`, which the build inlines into the bundle. Rules: TECH-SPEC §3.4 and ADR-0005. Lengths and lint results: TECH-SPEC §3.5 (they come from a script, not from this file).

The parameter names follow PRD §7. The `ctx_search` default scope follows README §8 and is still an open question (Q6 in the chat round).

Each text sits between an `id` marker and a ```text fence, so a script can extract it.

<!-- id: instructions -->
```text
context-mode keeps large output out of the conversation by running work in a sandbox.

For the first step of any task that counts, sums, filters or finds something in data over about 20 lines (logs, test or build output, big JSON or CSV, long files, web pages), use ctx_execute and print only the answer. A raw Bash or Read result that long fills the conversation. Search for the tool by name if it is not loaded yet.

A large tool result is indexed and replaced by its best-matching parts; ctx_search finds the rest.

Use normal tools for small output and edits. A large file's Read is denied: use offset and limit, or ctx_execute with file set.
```

<!-- id: ctx_execute -->
```text
Runs code in a sandboxed subprocess in the project directory and returns only what the code prints. Languages: shell, powershell, javascript, typescript, python, and other runtimes found on PATH. Use it when output may be long, for example tests, builds, logs, git history or API responses, and print just the lines or numbers you need. For a large file, set `file` to its local path instead of reading it: the code gets the path in the CTX_FILE environment variable, and only what the code prints comes back. Set `intent` to a short phrase when output may be large: the matching sections come back and the full output is indexed for ctx_search. Stops after `timeoutMs` (default and maximum 600000) and kills the whole process tree.
```

<!-- id: ctx_batch -->
```text
Runs several shell commands, then answers several search queries over their combined output, in one call. Use it to collect facts from more than one command at once, for example test results plus recent commits, when you need specific answers rather than the full text. Returns the matching sections and a one-line footer.
```

<!-- id: ctx_index -->
```text
Stores content so it can be searched later: a local file or folder (nested .gitignore files are respected), raw text, or a URL, which is fetched and converted to Markdown. Use it for documentation or large files you will query more than once, then use ctx_search instead of reading the content again. Returns the source label and how many chunks were stored.
```

<!-- id: ctx_search -->
```text
Searches content stored with ctx_index and earlier sandbox output in this project. Pass several queries in one call. By default it searches the current worktree; set `scope` to `project` for all worktrees or `session` for this session only. Results from the current session rank first, then by relevance, ranked with measurably better recall than plain keyword search. Set `sort` to `timeline` for oldest-first order across this session, prior sessions and memory, paged with `after`; `offset` is for relevance order only. Set `source` to `decision` to search only rows where the user answered a question. Every hit names its source. When nothing matches, the reply states the scope and how many sources are indexed.
```

<!-- id: ctx_resume -->
```text
Returns a summary of up to 2 KB for this session: the last task and user request, files changed, open errors, and search terms for ctx_search. A large row is shown as a pointer line instead of its full text; call `ctx_resume(seq: N)` with that line's number to read the full row. Call it with no `seq` to get the state block on demand. Use it after the conversation was compacted or resumed, before you repeat earlier work.
```

<!-- id: ctx_stats -->
```text
Reports the bytes context-mode kept out of the chat: a text report (bars, per tool, per agent) and a Markdown table. Show the text block to the user unchanged, in a code block. Use it when the user asks what it saved.
```

<!-- id: ctx_doctor -->
```text
Checks this context-mode install and reports a table with one row per check: version, Node and node:sqlite, host config and hooks for this agent, MCP connection, project and worktree, database health, index contents, and hook timing. Each failed row names its cause and the fix in one line. It changes nothing. Use it when the user asks whether context-mode works, or after a context-mode error.
```

<!-- id: ctx_upgrade -->
```text
Updates context-mode to the latest release for this agent and rewrites only context-mode's own entries in the host config. User entries and user settings such as hook timeouts are kept, and old entries are erased. Returns a table of what changed and whether a restart is needed. Use it only when the user asks to update context-mode.
```

<!-- id: skill_ctx-stats -->
```text
---
name: ctx-stats
description: Show how much context context-mode saved, as a detailed report.
disable-model-invocation: true
---
Call the ctx_stats tool and show the text block of its reply to the user unchanged, inside a code block so the columns stay aligned. Add one sentence under it that names the largest saving.
```

<!-- id: skill_ctx-doctor -->
```text
---
name: ctx-doctor
description: Check that context-mode is installed and working, as a table.
disable-model-invocation: true
---
Call the ctx_doctor tool and show its table to the user unchanged. If a row failed, list the fixes it names, in order.
```

<!-- id: skill_ctx-upgrade -->
```text
---
name: ctx-upgrade
description: Update context-mode to the latest release.
disable-model-invocation: true
---
Call the ctx_upgrade tool and show its table to the user. Then call ctx_doctor and show its table. If a restart is needed, say so in one sentence.
```

<!-- id: ctx_purge -->
```text
Deletes stored data: one session, one indexed source, or everything stored for this project. This cannot be undone. Use it only when the user asks to forget or reset data.
```

## Hook texts (deny reasons and hints)

impl/08 §6.1, §6.2, Assumption B2. Built by `src/core/policy/decide.ts` from `src/core/contracts/constants.ts`; `tests/policy/decide.test.mjs` checks that each block below equals what the code returns. Placeholders: `{prefix}` is the agent row's `toolNamePrefix`; `{command}`, `{url}`, `{path}`, `{size}`, `{intent}` come from the call (`{intent}` is the call's description, else `state what you need`). The ids use a hyphen, so the r3 tool-description check in `lint.mjs drafts` skips them (DEVIATIONS D-M3-E4-9).

<!-- id: deny-curl -->
```text
context-mode: This curl/wget call sends its body into the conversation.
Run it here instead; the full output is indexed and only the part that matches your intent comes back.
Tool: {prefix}ctx_execute
{"language":"shell","code":"{command}","intent":"{intent}"}
```

<!-- id: deny-http -->
```text
context-mode: This inline HTTP call sends its body into the conversation.
Run it here instead; the full output is indexed and only the part that matches your intent comes back.
Tool: {prefix}ctx_execute
{"language":"shell","code":"{command}","intent":"{intent}"}
```

<!-- id: deny-build -->
```text
context-mode: This build command sends its body into the conversation.
Run it here instead; the full output is indexed and only the part that matches your intent comes back.
Tool: {prefix}ctx_execute
{"language":"shell","code":"{command}","intent":"{intent}"}
```

<!-- id: deny-webfetch -->
```text
context-mode: WebFetch sends its body into the conversation.
Run it here instead; the full output is indexed and only the part that matches your intent comes back.
Tool: {prefix}ctx_index, then {prefix}ctx_search
{"url":"{url}"}
```

<!-- id: deny-read -->
```text
context-mode: {size}-byte file, over the one-read limit. Run ctx_execute(language, code, file="{path}") and print only the answer.
```

<!-- id: hint-bash -->
```text
context-mode: when this command's output may be long, or you need only part of it, run it with {prefix}ctx_execute and print just what you need. Short fixed output and file changes are fine here.
```

<!-- id: hint-read -->
```text
context-mode: to analyze this file rather than edit it, run code on it with {prefix}ctx_execute and file set to its path; what your code prints comes back, nothing else.
```

<!-- id: hint-grep -->
```text
context-mode: grep output can be larger than you expect. To count, filter or group matches, run the search with {prefix}ctx_execute and print the result.
```

<!-- id: hint-mcp-followup -->
```text
context-mode: tools of other MCP servers can return large payloads in full. For a page or API you can reach directly, fetch it in {prefix}ctx_execute and print what you need, or store it with {prefix}ctx_index and query it with {prefix}ctx_search.
```

<!-- id: deny-subagent-run -->
```text
context-mode: This command sends its body into the conversation.
Run the command on the line above with Bash instead. It runs the same command in the same folder, indexes the full output and prints only the part that matches your intent, with the same exit code.
```

## Changes

r10 (owner decision 2026-10-20): `instructions` cut from 1,238 to 646 chars. No hint text. It says a large tool result is indexed and replaced by its best-matching parts, and ctx_search finds the rest. The tool list moved to the tool descriptions. The routing sentence is kept (GP-LIVE-ROUTING). The hint-* blocks are removed by a separate task.

r10 (owner decision 2026-10-20): `instructions` cut from 1,238 to 658 chars: no hint text, states that a large tool result is indexed and replaced by its best-matching parts, ctx_search finds the rest; tool list moved to the tool descriptions. Routing sentence kept (GP-LIVE-ROUTING). Hint blocks (hint-*) are removed by a separate task.

r3: added the `seq` param to `ctx_resume` (PRD §7, decision A35), bumped status to r3.
r4 fix pass: checked decisions A35 and B71 — `seq` is already in the `ctx_resume` text above, and B71 found no doc fix needed here (it is a process note about round-1's own notes field). No text changed.
r6 (`DECISIONS-r6.md` D1-D3): `ctx_search` text now names `sort:"timeline"`, `after` paging, and `source:"decision"`; `ctx_resume` text drops "decisions" from the summary list and describes the pointer line, matching the 2,048 B budget rule. Both texts stay under the 1,024-char cap.
r6 (`DECISIONS-r6.md` D6): `ctx_resume` text adds the no-`seq` call: it returns the state block on demand (Claude Code's pointer line reads from it after compaction). Still under the 1,024-char cap.
r7 (`DECISIONS-r7.md` R1, R2): `ctx_search` text notes the measured recall gain over plain keyword search. Still under the 1,024-char cap (716).
r8 (`DECISIONS-r8.md` VR): `instructions` and `ctx_execute` texts state that a large file goes through `ctx_execute` with `file` set, or Read with offset/limit; a plain Read of it is now denied, not just hinted. Both texts stay under the 1,024-char cap (1,015 and 732).

r9 M3-E4 (impl/08 B2, DECISIONS-r8 doc edit 5): added the hook text blocks deny-curl, deny-http, deny-build, deny-webfetch, deny-read, hint-bash, hint-read, hint-grep, hint-mcp-followup.

M3 fix (ADR-0016 case B, DEVIATIONS D-M3-F-7): added deny-subagent-run, the case-B deny reason under the run.mjs line.
