# ADR-0025: Stored source in the sandbox, and the open issues of 2.1.4

- Status: Proposed (2026-11-06).
- Scope: one ADR and one PRD in a single file, as the owner asked ("Bu konu ve acik issueler icin tek bir md olacak sekilde ADR+PDR yazalim").
- Keeps: ADR-0008 (enforcement and the one OUTPUT_CAP), ADR-0016 (large output stays out of the context), ADR-0010 (doctor is the verifier), ADR-0013 and ADR-0019 (npm is the release channel), ADR-0020 (hooks on every agent), ADR-0023 (native install per agent), ADR-0024 (tests by ADR area), the TRUNCATE rule.
- Issues: [#1325](https://github.com/mksglu/context-mode/issues/1325), [#1321](https://github.com/mksglu/context-mode/issues/1321), [#1324](https://github.com/mksglu/context-mode/issues/1324), [#1323](https://github.com/mksglu/context-mode/issues/1323), [#1322](https://github.com/mksglu/context-mode/issues/1322); host audit rows vscode-2, copilot-cli-1, copilot-cli-2, copilot-cli-7.

## Context

Three groups of work are open on 2.1.4.

1. **Lossless read of a stored source (#1325, mkaring, enhancement).** A large MCP result goes to the store and the agent gets a pointer such as `ctx_search({queries:[""], source:"s81"})`. ctx_search is ranked: it gives the top chunks and a snippet of each. That is right for finding a fact. It is the wrong tool to count, filter or join over every record of a 48 KB JSON result with 80 records. The reporter's workaround opens `context.db` by hand and reads internal tables (`sources`, `chunks_content`), which can change on any update.
2. **Blockers.** Four bug reports stop real work today: images and PDFs blocked by the Read deny on Claude Code and Pi, a Codex hook decode error, and a wrong Codex doctor verdict.
3. **Host audit.** Copilot CLI and VS Code share one hooks folder, and Copilot CLI has no plugin manifest of its own.

## Decision

1. **Stored source enters the sandbox, never the context (#1325).** `ctx_execute` gets an optional `source` input. It takes the short pointer (`s81`) or the full label (`mcp:<server>:<tool>:#<tool-use-id>`). The server writes the full stored text, chunks joined in order, to a temp file in the run's own sandbox folder, and gives the script its path in `CTX_SOURCE` (and on stdin for `shell`). The file is read only, in the same project scope, under a size cap, and no user path is used, so no path escape is possible. Only what the script prints enters the context, through the normal OUTPUT_CAP path (Thinking in Code; the TRUNCATE rule keeps the stored source whole). Owner rule: no new MCP tool. The tool count does not change. Rejected: a `ctx_get` tool, because it adds a new tool (owner rule: no new tools) and would also return the whole text into the context.
2. **The large-read deny applies to text only (#1321, #1324).** The Read deny (ADR-0008 step 6, `src/core/policy/decide.ts` `read()`) checks the file type first. Images, PDFs and other binary or media files that the host renders itself (the host sends them as an image or document block, never as file bytes in the text) pass through. Text over OUTPUT_CAP keeps the deny, on every host with the same rule.
3. **Codex `Stop` decodes as a known event (#1323).** The Claude-shape decoder accepts `Stop` and answers it with the empty allow reply. Setup and `ctx_upgrade` remove a context-mode `Stop` entry they find from an older install. Doctor D5 shows a past decode error as WARN with the event name, so a user sees it.
4. **Codex doctor reads the full plugin list (#1322).** The host list command runs with a 16 MiB buffer. When the list command itself fails (ENOBUFS, timeout, exit code), doctor reports that error by name and does not take the legacy-entry path.
5. **One shared Copilot hooks file (vscode-2).** Copilot CLI and VS Code both load every JSON file in `~/.copilot/hooks`. Setup writes one file, `context-mode.json`, for both. The hook reads the tool prefix of the caller (`context-mode-` for Copilot CLI, `mcp_context-mode_` for VS Code) and serves both from one entry. Setup removes the second file (`context-mode-vscode.json`) when it finds both.
6. **Copilot CLI native plugin manifest (copilot-cli-1, -2, -7).** `build/manifests.ts` generates `.github/plugin/plugin.json`, which Copilot reads before `.claude-plugin/`. It starts the server with `--agent copilot-cli`, names the Copilot hooks file, and lists only files that ship. `copilot plugin install mksglu/context-mode` is the native install (ADR-0023). Doctor reads Copilot's own plugin list.
7. **Release practice.** All blocker fixes ship together in one patch release. After that, releases go out on a quiet weekly rhythm, npm and the GitHub plugins together. Issue comments say the fix is on main and ships in the next patch; they name no cadence or date.

## Consequences

- An agent can aggregate over a stored result with one `ctx_execute` call. The answer is exact and the context stays small.
- The reporter's direct read of `context.db` becomes unneeded; internal tables stay free to change.
- Visual work (screenshots, mockups, charts, PDFs) works with context-mode on, on Claude Code and Pi.
- Codex users stop seeing `unknown hook event Stop` after `ctx_upgrade`.
- Doctor gives a true verdict on Codex installs with many plugins.
- A user with both Copilot CLI and VS Code gets each hook once, with the right tool names.
- Copilot CLI users install with their own command.

## Per issue

### #1325 Lossless read of a stored source (enhancement, planned after the current bugs)

- Labels: `enhancement`, planned after the blocker patch.
- Input: `ctx_execute({language, code, source: "s81" | "<label>"})`. `source` and `file` can both be set; `source` fills `CTX_SOURCE`.
- Paging and limits: the temp file holds the whole source up to a size cap (default 64 MiB, the store's own source cap if lower). Over the cap the call returns a clear error with the source size and the cap. Inside the script the agent pages as it likes (`readline`, `json.load`); paging is a script concern, never a context concern.
- Scope: the current project and worktree database only. Sources from other sessions of the same project resolve. No cross-project read.
- Security: the source id resolves by id or exact label in the project DB, never as a path; the temp file sits in the run's sandbox folder, read only (mode 0400), and goes away with the run folder. No path escape is possible because no user path is used.
- Doctor: D9 reports "stored sources readable in sandbox: yes". A doctor self-test writes a small source, reads it through `source`, and compares the byte count.
- Tool count: unchanged. `source` is an input of the existing `ctx_execute`. GP2 tool-description budget: the `ctx_execute` description grows by one short line at most.
- Docs: the routing text names the `source` input next to the ctx_search pointer, so the pointer line reads "search it, or pass source to ctx_execute to process all of it".
- Why ctx_search stays ranked: it answers "find", where the top chunks are the right answer and the reply must fit the context. Returning every chunk from search would put the whole text into the context and break ADR-0016.
- Side note from the issue: sandbox Python on Windows prints with `cp1252`. Sandbox runs set `PYTHONUTF8=1` (small, same release as `source`).

### #1321 Claude Code: Read deny blocks images and PDFs (blocker)

Reporter's data: unranged Read of a 339,869 B PNG is denied; the deny text points to ctx_execute, which returns text only. Fix: decision 2. Red test in `tests/` under the ADR-0008 Read deny block with a PNG and a PDF over OUTPUT_CAP: both allow; a text file over OUTPUT_CAP: deny.

### #1324 Pi: read on images over 50 KB blocked (blocker)

Same root cause as #1321 (comment by aron-intframe: `read()` in `decide.ts` checks size, never type). Same fix and the same red test, on the Pi row with the reporter's 51,571 B PNG.

### #1323 Codex Stop hook decode failure (blocker)

Reporter's data: `codex: unknown hook event Stop` at decode on each completed turn, Codex 0.166.0-alpha.6, context-mode 2.1.4. Fix: decision 3. Red test with the reporter's `Stop` payload through the Codex adapter.

### #1322 Codex doctor legacy entry with a large plugin list (blocker)

Reporter's data: `codex plugin list` over 1 MiB gives ENOBUFS; doctor says "old context-mode entry, run: context-mode setup". Fix: decision 4. Red test with a stub `codex` that prints 2.16 MB with the plugin enabled: doctor PASS. A stub that exits non-zero: doctor names the list error.

### vscode-2 Shared ~/.copilot/hooks

Fix: decision 5. Test: setup for `vscode,copilot-cli` on a temp HOME leaves one hook file; a sample event from each host gets a deny text with its own tool prefix. Doctor D5b checks that `~/.copilot/hooks` holds one context-mode file.

### copilot-cli-1, -2, -7 Copilot CLI native plugin manifest

Fix: decision 6. Test: the build writes `.github/plugin/plugin.json`; every file it names exists in the release output; the MCP args carry `--agent copilot-cli`; the hooks key names the Copilot hooks file.

---

# PRD

## Problem

Users on 2.1.4 meet four blockers (images and PDFs blocked, a Codex hook error, a wrong Codex doctor verdict) and two Copilot install gaps. Power users who poll MCP tools have no supported way to compute over a whole stored result.

## Users

- Claude Code and Pi users who read screenshots, mockups and PDFs.
- Codex Desktop and Codex CLI users, also with many plugins installed.
- Users with both Copilot CLI and VS Code Copilot.
- Agent loops that aggregate over large MCP results (#1325).

## Requirements

1. R1: Read of an image, PDF or other host-rendered binary file passes the Read deny on every host; text over OUTPUT_CAP stays denied.
2. R2: Codex `Stop` decodes and gets the empty allow reply; upgrade removes an older context-mode `Stop` entry.
3. R3: Codex doctor gives PASS with a plugin list over 1 MiB and names a list command error by name.
4. R4: One Copilot hooks file serves Copilot CLI and VS Code with the right tool prefix for each.
5. R5: The build ships `.github/plugin/plugin.json` for Copilot CLI with working MCP args and hooks.
6. R6 (after the patch): `ctx_execute` takes `source` (no new tool); the script gets the full stored text as a read-only file path in `CTX_SOURCE`; only printed output enters the context.
7. R7: Each change has one DEVIATIONS row quoting its issue, a red test in the ADR-grouped test files, a doctor check that catches the case, and a profiling number before and after (hook p95 for R1 and R2, doctor wall time for R3).
8. R8: R1 to R5 ship in one patch release. Comments on the fixed issues say the fix is on main and ships in the next patch.

## Non-goals

- Any new MCP tool for stored sources (owner rule: no new tools). `ctx_get` is rejected for this reason.
- An unranked mode for ctx_search.
- Cross-project source reads.
- A setting to change OUTPUT_CAP per file type.

## Acceptance tests

| Id | Test | Pass |
|---|---|---|
| A1 | PNG 339,869 B and 51,571 B, PDF 200 KB, unranged Read on claude-code and pi rows | allow |
| A2 | Text file 40 KB, unranged Read | deny with the ctx_execute pointer |
| A3 | Codex `Stop` payload from #1323 through `hook.mjs --agent codex` | exit 0, empty allow, no hook-errors.log line |
| A4 | Stub `codex plugin list` of 2.16 MB with the plugin enabled | doctor PASS |
| A5 | Stub `codex plugin list` that exits 1 | doctor names the list error; no legacy-entry line |
| A6 | `setup --agents vscode,copilot-cli` on a temp HOME | one file in `~/.copilot/hooks`; each host gets its own prefix |
| A7 | Release output `.github/plugin/plugin.json` | every named file exists; args carry `--agent copilot-cli`; hooks present |
| A8 (R6) | Store the 48,757 B, 80-record JSON from #1325; `ctx_execute({source:"s81", code:"count queue.satisfied == false"})` | exact count, reply under OUTPUT_CAP, context gets only the count |
| A9 (R6) | `source` from another project, or over the size cap | clear error, no read |
| G | `node build/build.mjs --generated-only`, `npx tsc --noEmit`, `node --test "tests/**/*.test.mjs"`, `node build/build.mjs --out release-out`, `node e2e/cases/run.mjs --milestone M6` | all green, 0 fail |
