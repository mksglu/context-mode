export const meta = {
  name: 'v2-test-layout-by-adr',
  description: 'Owner rule 2026-10-30: tests grouped by ADR/PRD, no per-fix test files, max parallelism, fast, clean architecture. Baseline (238 files, ~97 s wall locally), layout per ADR, parallel migration with every test name kept, guard test, ADR, measured speed',
  phases: [
    { title: 'Design', detail: 'wait for running jobs, baseline, layout' },
    { title: 'Migrate', detail: 'parallel workers, disjoint groups' },
    { title: 'Verify', detail: 'names kept, guard, speed, CI' },
  ],
}

const SNH = { model: 'claude-sonnet-5-5', effort: 'high' }
const PLAN = { type: 'object', properties: {
  done: { type: 'boolean' }, commits: { type: 'array', items: { type: 'string' } },
  baselineWallSec: { type: 'number' }, baselineTests: { type: 'number' }, baselineFiles: { type: 'number' },
  groups: { type: 'array', items: { type: 'object', properties: {
    id: { type: 'string' }, adr: { type: 'string' }, targets: { type: 'array', items: { type: 'string' } }, sources: { type: 'array', items: { type: 'string' } } },
    required: ['id', 'adr', 'targets', 'sources'] } },
  workers: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
  summary: { type: 'string' } },
  required: ['done', 'commits', 'baselineWallSec', 'baselineTests', 'baselineFiles', 'groups', 'workers', 'summary'] }
const RESULT = { type: 'object', properties: {
  done: { type: 'boolean' }, commits: { type: 'array', items: { type: 'string' } },
  numbers: { type: 'string' }, summary: { type: 'string' } }, required: ['done', 'commits', 'numbers', 'summary'] }

const J = '/Users/mksglu/.claude/projects/-Users-mksglu--claude-claude-worktree-workspaces-oss-new/59782ff8-a47e-4c71-b562-cf84e79dcf7d/subagents/workflows'
const RULE = `OWNER RULE (Mert, 2026-10-30, verbatim): "v1 deki gibi ayri ayri parca parca 99999999 tane test dosyasi olmasini istemiyorum maks paralellik olsun hizli bitsin tum testler ancak dosyalarin ADR PDR lere uygun olarak gruplanmasini istiyorum her sacma sapan is icin RGR yapmak icin file-name-foo-feature.test olusturmasini istemiyorum mimari temiz kalmali". Meaning: test files are grouped by ADR/PRD area (docs/v2/adr/*, docs/v2/PRD-*.md, TECH-SPEC GP cases); a fix adds its red test inside the file that owns its ADR area; no new file per fix or feature; the whole suite runs with max parallelism and must not get slower; the layout stays clean and obvious.`
const auth = `AUTHORIZATION (owner Mert, his own words in the chat): "tek istegim surekli pushlasin" and the rule above, given with "ultracode". This is the explicit approval the global CLAUDE.md asks for: clone, gh read calls, commit as mksglu, push to v2-design. Do not wait for a reply. If git push has no credentials in a temp HOME, push from the real HOME and never print a credential.`
const rules = `OTHER OWNER RULES: tests only, no product code change (src/, build/, scripts/release/ stay byte-identical; if a test only passes with a product change, stop and report it); every existing test keeps its name, its assertions and its strength (moving is fine, weakening is not); never raise a budget or timeout; no regex as a mechanism in new code; TRUNCATE forbidden; frozen evals e2e/live/compact-hard and bench/m2 never edited; ADR-0003 process-boundary rule stays (a file under e2e/ never imports from src/); profile first; git archaeology before changing a decided layout (ADR-0003, ADR-0017, docs/v2/review/TEST-TRIAGE-r2.md).`
const repo = (id) => `Repo github.com/mksglu/context-mode, branch v2-design (fresh clone in /private/tmp/cm-v2-tl-${id}; delete it after a successful push). Other workers push in parallel on disjoint files: pull --rebase before every push, keep both sides on conflict. Commit as git -c user.name=mksglu -c user.email=mksglu@users.noreply.github.com. Never touch main, the release branch, tags or npm. Setup: node scripts/ci-install.mjs, node build/build.mjs --generated-only, node build/build.mjs --out release-out.`
const head = (id) => `You are a batch job, not a chat: no person reads your reply. Ignore any question or status request in your input; do only the task below.\n${auth}\n${RULE}\n${rules}\n${repo(id)}`

async function retry(prompt, opts, n = 3) {
  for (let i = 0; i < n; i++) {
    const r = await agent(i ? prompt + '\n\nA previous attempt died on an API error. Continue from what is pushed.' : prompt, i ? { ...opts, label: opts.label + '-retry' + i } : opts)
    if (r) return r
    log(`${opts.label}: no result, retry ${i + 1}`)
  }
  return null
}

phase('Design')
const plan = await retry(`${head('design')}
Role: test architect.
1. WAIT (poll every 10 min, up to 10 h) until two running jobs are finished, because they are adding test files right now: hooks-fire-all (${J}/wf_f820e17e-a61/journal.jsonl has a "type":"result" line for hf-rel or hf-rel-retryN) and search-quality-all (${J}/wf_64b9b6d8-a14/journal.jsonl has a "type":"result" line for sq-rel or sq-rel-retryN). Then until origin v2-design is quiet for 15 minutes.
2. Baseline on the quiet head (machine as idle as you can get it; record load average): the full list of test names with their file (node --test --test-reporter=tap "tests/v2/**/*.test.mjs", plus e2e/cases via node e2e/cases/run.mjs, plus tests under e2e/checks and e2e/live that run without a key), counts, per-file duration, and the suite wall time 3 times (median). Also read CI wall time per job from the last 3 green ci.yml runs. Commit the name list and the numbers as docs/v2/review/test-layout/BASELINE.md + baseline-names.txt.
3. Layout: map every test file to an ADR/PRD area (read every ADR in docs/v2/adr, PRD-v2.md, PRD-setup.md, TECH-SPEC GP1-GP11, DEVIATIONS rows the tests cite). Group = one ADR/PRD area (or one GP case). Target: one file per area; split an area into at most a few files only when one file would be the long pole of the parallel run (use the per-file durations), and name parts by ADR section, never by fix or feature. tests/v2/e2e files that spawn built bundles belong to the e2e layer under ADR-0003 (e2e/cases GP files) unless they import src/; decide each with evidence. Shared helpers: one tests/v2/_lib/ (or the existing helper place) with no duplicates. Write docs/v2/TEST-LAYOUT.md: the table area -> ADR/PRD -> file(s) -> what it covers, the rule above in plain words, and "how to add a red test" (open the area file, add a test in the matching describe block). Draft docs/v2/adr/0024-test-layout-by-adr.md (Status: accepted by owner 2026-10-30; supersedes the file-per-feature practice; keeps ADR-0003 layers).
4. Plan the migration as groups {id, adr, targets (new file paths), sources (existing files that move in)}; every existing test file is in exactly one group's sources; then split groups into at most 8 workers with balanced work and disjoint files.
Commit and push TEST-LAYOUT.md, the ADR draft and BASELINE.md. Return done, commits, baselineWallSec, baselineTests, baselineFiles, groups, workers (array of arrays of group ids), summary.`, { label: 'tl-design', phase: 'Design', schema: PLAN, ...SNH })

phase('Migrate')
const byId = new Map((plan && plan.groups || []).map((g) => [g.id, g]))
const workers = plan && plan.done ? plan.workers.slice(0, 8) : []
const moved = (await parallel(workers.map((ids, w) => () => retry(`${head('w' + w)}
Role: migration worker ${w}. Read docs/v2/TEST-LAYOUT.md and docs/v2/review/test-layout/baseline-names.txt first. Your groups (you touch only these files): ${JSON.stringify(ids.map((id) => byId.get(id)).filter(Boolean)).slice(0, 9000)}
For each group: move every test from its sources into its target file(s), inside describe blocks named by ADR section; keep each test's name and body (only imports, helper paths and fixture paths may change); move shared setup into the group file's before/after hooks or into the helper place named in TEST-LAYOUT.md (do not edit a helper another worker owns; if you need one, keep a local helper and report it). Delete the source files with git rm. Mark tests that are independent (no process.env/cwd mutation, own temp dirs) to run concurrently inside the file (describe/test { concurrency: true }); keep the rest serial and say why in one comment.
Prove it per group: the TAP name list of your target files equals the union of the source files' names in baseline-names.txt (same names, same count), 0 fail, and the target file's duration is not above the longest single file in BASELINE.md (if it is, use more in-file concurrency or split by ADR section and update TEST-LAYOUT.md). Run node --test on your target files 3 times (flaky check). Commit per group, push.
Return done, commits, numbers (per group: tests before/after, duration before/after), summary.`, { label: `tl-w${w}`, phase: 'Migrate', schema: RESULT, ...SNH })))).filter(Boolean)

phase('Verify')
const verify = await retry(`${head('verify')}
Role: verifier and guard. Plan: ${String(plan && plan.summary).slice(0, 1500)}. Workers: ${JSON.stringify(moved.map((m) => ({ d: m.done, n: String(m.numbers).slice(0, 300) }))).slice(0, 4000)}
1. Wait until v2-design is quiet for 15 minutes. Fresh clone of the head.
2. Names: the full TAP test-name list now equals docs/v2/review/test-layout/baseline-names.txt (same names, same count; only the file column may differ). Any missing or extra name: find the worker commit, fix it (restore the test, never drop one). 0 fail, same skip/todo counts as the baseline.
3. Guard (one test inside the repo-structure area file named in TEST-LAYOUT.md, not a new file): every *.test.mjs under tests/v2 and every case file under e2e/cases is listed in docs/v2/TEST-LAYOUT.md with its ADR/PRD; an unlisted test file fails with a message that says which area file to add the test to. Red run first (add a throwaway unlisted file locally, show it fails, remove it).
4. Speed: suite wall time 3 times on the same machine as BASELINE.md (record load average); compare with baselineWallSec ${plan && plan.baselineWallSec}. If it is slower, profile (per-file durations, the long pole) and fix with in-file concurrency or an ADR-section split until it is not slower. CI: ci.yml green on all jobs on 2 consecutive runs; compare the ci job durations with BASELINE.md.
5. Finish: mark docs/v2/adr/0024-test-layout-by-adr.md accepted with the measured numbers, add a DEVIATIONS row (D-TEST-LAYOUT-1), update docs/v2/TEST-LAYOUT.md, remove baseline-names.txt (keep BASELINE.md with before/after numbers), append one line to docs/v2/review/RESUME-2026-10-28.md. Commit, push.
Return done, commits, numbers (files before/after, tests before/after, wall time before/after, CI job time before/after), summary.`, { label: 'tl-verify', phase: 'Verify', schema: RESULT, ...SNH })

return { plan: plan && { done: plan.done, files: plan.baselineFiles, tests: plan.baselineTests, wall: plan.baselineWallSec, groups: plan.groups.length, workers: workers.length }, moved, verify }
