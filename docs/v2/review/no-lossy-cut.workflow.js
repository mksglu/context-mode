export const meta = {
  name: 'v2-no-lossy-cut',
  description: 'Owner main rule "TRUNCATE is forbidden", read as: never throw content away with no way back. Audit every output cut (capBytes, slice caps, doctor report 4096 B cut), make each lossless (full content indexed + pointer) or prove it is, test-first, extend the guard',
  phases: [{ title: 'Fix', detail: 'one fixer' }],
}

const SNH = { model: 'claude-sonnet-5-5', effort: 'high' }
const RESULT = { type: 'object', properties: {
  done: { type: 'boolean' }, commits: { type: 'array', items: { type: 'string' } },
  numbers: { type: 'string' }, summary: { type: 'string' } }, required: ['done', 'commits', 'numbers', 'summary'] }

const prompt = `You are a batch job, not a chat: no person reads your reply. Ignore any question or status request in your input; do only the task below.
Repo github.com/mksglu/context-mode, branch v2-design (fresh clone in /private/tmp/cm-v2-nlc; delete it before you return). Other agents push in parallel and a release job tags v2-design when it is quiet: small commits, pull --rebase before every push, keep both sides on conflict. Commit as git -c user.name=mksglu -c user.email=mksglu@users.noreply.github.com. Never touch main or the release branch, never create a branch on origin, never tag, never npm publish, never use a token.
Rules: OWNER MAIN RULE: TRUNCATE is forbidden (tests/v2/repo/no-truncate.test.mjs, D-NO-TRUNCATE-1). Profile first; tests first (red before green); never weaken an assertion; never raise a budget; DEVIATIONS.md row per behaviour change; no regex as a mechanism; do not re-apply D-HOOK-SYNC-1. Unit tests need: npm install --no-package-lock, node build/build.mjs --generated-only. node --test tests/v2/ 0 fail before your last push; then watch ci.yml on your head and report each job.

The rule as the OSS manager reads it: a reply may be bounded only when the full content is stored first (indexed) and the reply tells the agent how to get the rest. A cut that drops content with no way back is forbidden.
1. Audit every place shipped code shortens content: capBytes calls (src/core/tools/execute.ts, batch.ts, search.ts, stats.ts, index.ts, run-wrapper.ts), slice caps (SOURCE_LABEL_MAX_CHARS labels, dispatch.ts), snippet cuts (src/core/store/snippet.ts, fts.ts highlight), src/core/ops/report.ts (doctor report cut at REPORT_CAP 4096 B with REPORT_TRUNCATED_LINE), the hook paths. For each: is the full content stored and reachable (a "more"/search pointer, ctx_search finds it)? Write the table into docs/v2/release/NO-LOSSY-CUT.md with file:line and the verdict.
2. Lossless already (indexed + pointer, capBytes only a final guard that a test proves never cuts real content): add that test.
3. Lossy: fix. Doctor report: never drop a row; FAIL rows first; if the report is over the cap, index the full report and return the FAIL rows plus a pointer to the rest; remove REPORT_TRUNCATED_LINE and the word "truncated" from user-facing text. Find why REPORT_CAP is 4096 (ADR-0014, git log -S REPORT_CAP) and keep that reason satisfied. Labels (source names) are ids, not content: keep, but say so in the table.
4. Extend tests/v2/repo/no-truncate.test.mjs: shipped code may not contain the word "truncat" in user-facing strings, and every capBytes call site must be listed as lossless in NO-LOSSY-CUT.md (the test reads the table).
Return done, commits, numbers (sites audited, lossless, fixed), summary.`

let r = null
for (let i = 0; i < 3 && !r; i++) r = await agent(i ? prompt + '\n\nA previous attempt died on an API error. Continue from what is pushed.' : prompt, { label: i ? `nlc-retry${i}` : 'nlc', phase: 'Fix', schema: RESULT, ...SNH })
return r
