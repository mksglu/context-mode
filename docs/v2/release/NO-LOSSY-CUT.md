# No lossy cut (owner main rule, D-NO-LOSSY-CUT-1 / D-NO-LOSSY-CUT-2)

Rule: a reply may be bounded only when the full content is stored first (indexed) and the reply tells the agent how to get the rest.
A cut that drops content with no way back is forbidden.

`tests/v2/repo/no-truncate.test.mjs` reads this file. Every `capBytes(` call in `src/` must have one `capBytes` row below
(same file, same count) with verdict `lossless`. `capBytes` is only a final guard. `tests/v2/tools/no-lossy-cut.test.mjs`
proves it cuts nothing real: the budget math keeps head, chunks and pointer under OUTPUT_CAP, and an echo of caller input
(intent, query, label) longer than ECHO_MAX_BYTES is named by position, `...` or source handle instead of echoed.

## capBytes call sites

| Site | Kind | Full content stored and reachable | Verdict |
|---|---|---|---|
| src/core/tools/search.ts:43 | capBytes final guard | Search reads the index. Whole chunks only, paging line names the next call. Oversize query is not echoed in the reply. | lossless |
| src/core/tools/execute.ts:161 | capBytes final guard | Output is indexed first; reply = head + whole chunks + `ctx_search(...)` pointer. Pointer cannot exceed cap (a long intent shows as `...`). | lossless |
| src/core/tools/stats.ts:93 | capBytes final guard | Fixed-size table; size is bounded by the agent count, far under OUTPUT_CAP (test). Nothing is dropped. | lossless |
| src/core/tools/batch.ts:266 | capBytes final guard | Every command output is indexed; each query gets a share of whole chunks; footer pointer fixed. A long query is named `query N`. | lossless |
| src/core/tools/index.ts:146 | capBytes final guard | One-line reply. Content is stored whole; a label over ECHO_MAX_BYTES is shown as its handle `sN`. | lossless |
| src/core/tools/run-wrapper.ts:147 | capBytes final guard | run.mjs output is indexed first; pointer `more: node search.mjs <id> "<terms>"` (terms shown whole; shell budget reserves it). | lossless |
| src/core/tools/run-wrapper.ts:169 | capBytes final guard | search.mjs returns whole chunks of one stored source with the budget OUTPUT_CAP. | lossless |

## Other places that shorten content

| Site | What it does | Full content stored and reachable | Verdict |
|---|---|---|---|
| src/core/ops/report.ts (buildReport, buildReportHead), src/core/tools/doctor.ts | Doctor report over REPORT_CAP (4096 B). Before: cut with a "truncated" line, rows lost. Now: whole report stored under `ctx_doctor:report`; reply = header + FAIL rows + `REPORT_POINTER` (`ctx_search` with the three status words). | yes | fixed (D-NO-LOSSY-CUT-1) |
| REPORT_CAP = 4096 | Reason (ADR-0014): a report pasted into a GitHub issue stays small and under the issue-URL limit. Kept: the reply is still <= 4096 B. | n/a | kept |
| src/core/index/select.ts moreLine | Intent echo in the pointer. Over ECHO_MAX_BYTES it shows `[...]`, like the ctx_batch footer. | yes (caller holds intent) | fixed (D-NO-LOSSY-CUT-2) |
| src/core/tools/batch.ts answer | Query echo in `## <q>` header. Over ECHO_MAX_BYTES it shows `query N`. | yes | fixed (D-NO-LOSSY-CUT-2) |
| src/core/tools/index.ts handler | Label echo in the "Indexed ..." line. Over ECHO_MAX_BYTES it shows the source handle. | yes (stored whole; `source` accepts the handle) | fixed (D-NO-LOSSY-CUT-2) |
| src/core/tools/execute.ts:125, src/core/tools/run-wrapper.ts:84, src/core/hooks/dispatch.ts:481 | Source label = tool + first line of the code, at most SOURCE_LABEL_MAX_CHARS (80). A label is an id (a name for the source), not content. The full code/output is stored as the chunks. | yes | keep: id, not content |
| src/core/store/fts.ts:392, :438 and src/core/store/snippet.ts (clipLine, buildSnippet) | Search hit shows a snippet around the match (SNIPPET_MAX_BYTES). The row stays in the index; paging and `source` filter reach the rest. A snippet is a view of a hit, not the reply content. | yes | lossless |
| src/core/hooks/dispatch.ts:440 (selectChunksInMemory) | Hook replace: whole chunks selected, full output indexed first, handle line + `moreLine` pointer. | yes | lossless |
| src/core/tools/search.ts:106 (JSON_SOURCE_MAX_BYTES) | JSON rows view is skipped for a source over 8 MB; the normal chunk search still answers. Nothing is cut. | yes | lossless |
| src/cli/commands.ts:158 (URL_BODY_MAX) | Prefilled GitHub issue URL body. GitHub rejects long URLs. The report file is written whole and the URL text says to attach it. This is CLI text for a person, not tool reply. | yes (report file) | keep, pointer in text ("cut; attach the report file") |
