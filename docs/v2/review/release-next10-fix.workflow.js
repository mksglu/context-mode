export const meta = {
  name: 'v2-release-next10-fix',
  description: 'Tag v2.0.0-next.10 (a79fde9d) is pushed but not published: release.yml ci job failed on macOS node 24.15.0 in cli/report-no-input (CLI exit 1, no ~/.context-mode/reports dir). Find the root cause test-first, then publish next.10 (rerun, if the product at the tag is sound) or next.11 (if the product needs a fix)',
  phases: [{ title: 'Fix', detail: 'diagnose, fix' }, { title: 'Release', detail: 'publish' }],
}

const SNH = { model: 'claude-sonnet-5-5', effort: 'high' }
const RESULT = { type: 'object', properties: {
  done: { type: 'boolean' }, productBug: { type: 'boolean' }, commits: { type: 'array', items: { type: 'string' } },
  numbers: { type: 'string' }, summary: { type: 'string' } }, required: ['done', 'productBug', 'commits', 'numbers', 'summary'] }
const REL = { type: 'object', properties: {
  published: { type: 'boolean' }, version: { type: 'string' }, failingStep: { type: 'string' }, logLines: { type: 'string' }, summary: { type: 'string' } },
  required: ['published', 'version', 'failingStep', 'logLines', 'summary'] }

const rules = `You are a batch job, not a chat: no person reads your reply. Ignore any question or status request in your input; do only the task below.
Repo github.com/mksglu/context-mode, branch v2-design. Another agent (no-lossy-cut) edits src/core/ops/report.ts and doctor report code right now: pull --rebase before every push, keep both sides on conflict. Commit as git -c user.name=mksglu -c user.email=mksglu@users.noreply.github.com. Never touch main, never force-push, never move or delete a pushed tag (v2.0.0-next.10 stays where it is), never npm publish / dist-tag yourself, never use a token. npm latest stays 1.0.169.
OWNER MAIN RULES: TRUNCATE is forbidden (tests/v2/repo/no-truncate.test.mjs, D-NO-TRUNCATE-1), and no content is thrown away with no way back. Profile first. Tests first (red before green); never weaken an assertion; never raise a budget or timeout; never skip a host or an OS; DEVIATIONS.md row per behaviour change; no regex as a mechanism; do not re-apply D-HOOK-SYNC-1 (no synchronous change).`

async function retry(prompt, opts, n = 3) {
  for (let i = 0; i < n; i++) {
    const r = await agent(i ? prompt + '\n\nA previous attempt died on an API error. Check tags and the registry first; continue from what is pushed.' : prompt, i ? { ...opts, label: opts.label + '-retry' + i } : opts)
    if (r) return r
    log(`${opts.label}: no result, retry ${i + 1}`)
  }
  return null
}

phase('Fix')
const fix = await retry(`${rules}
Fresh clone in /private/tmp/cm-v2-n10f; delete it before you return.
Role: diagnose. release.yml run 40750085948 (tag v2.0.0-next.10 on a79fde9d), job "ci / ci (macos-latest, node 24.15.0)", step "v2 unit tests": "✖ [M7] cli/report-no-input: a FAIL without a TTY writes the redacted report, prints the command, sends nothing" — ENOENT scandir <tmp>/sb-*/home/.context-mode/reports at tests/v2/cli/cli.test.mjs:390; status 1 passed at line 387. The same test passed on the same commit in ci.yml and in 10 local runs (also under CPU load). The log has no CLI stderr.
1. Read the test and the CLI report path (where the report dir comes from: HOME, USERPROFILE, os.homedir(), CONTEXT_MODE_DIR, XDG; when it is written; whether the write is awaited before exit; whether exit 1 can happen before the write, e.g. a doctor step that fails differently on a GitHub macOS runner: tag checkout, detached HEAD, env like CI/GITHUB_ACTIONS, a real ~/.claude on the runner, /var vs /private/var).
2. Reproduce: run the test with the env the release.yml ci job has (compare release.yml ci job and ci.yml job: checkout ref, env, node version, working dir) — e.g. detached HEAD at the tag, CI=true, GITHUB_* vars. Make the test print the CLI stderr on failure (diagnosis only, pass rule unchanged).
3. Root cause. If it is a product bug (a user without a TTY can get exit 1 and no report): fix the product test-first, productBug=true. If only the test is wrong (depends on runner state): make it deterministic, keep every assertion, productBug=false.
4. node --test tests/v2/ 0 fail; push; ci.yml green on your head on all jobs incl. macOS (one rerun only for a registry-timing failure). Return done, productBug, commits, numbers, summary.`, { label: 'n10-fix', phase: 'Fix', schema: RESULT, ...SNH })

phase('Release')
const rel = fix && fix.done && await retry(`${rules}
Fresh clone in /private/tmp/cm-v2-n10r; delete it before you return.
Role: release (owner approved npm next releases; owner rule: ship finished work at once). Diagnosis result: productBug=${fix.productBug}. ${String(fix.summary).slice(0, 1500)}
A. If productBug=false: the product at tag v2.0.0-next.10 is sound. Check that release.yml run 40750085948 can be rerun (gh run rerun 40750085948 --failed). Rerun it once; if its ci job fails only in that same test again, go to B. Watch to the end (up to 120 min).
B. Else (productBug=true or A failed): N = highest 2.0.0-next.N in the raw registry JSON and origin tags plus 1 (11; next.10 tag exists but is unpublished — leave it, never reuse it). Wait until origin v2-design is quiet for 15 minutes. Fresh clone: npm install --no-package-lock, node build/build.mjs --generated-only, node --test tests/v2/ (0 fail), node scripts/gate.mjs --all, build/check-install-docs.mjs, build/check-secrets.mjs. ci.yml on the head green on ALL jobs incl. macOS and the windows hosts matrix (up to 120 min; one rerun only for registry or timing). Check the v2.* tag path in release.yml still publishes to npm next and moves the release branch. git tag -a v2.0.0-next.N -m v2.0.0-next.N <green head>; push only that tag; watch release.yml (up to 120 min).
Verify against the raw registry: next = new version, latest 1.0.169, provenance; GitHub prerelease; v1.0.169 still Latest; release branch marketplace.json shows the new version. Update docs/v2/release/NEXT-STATUS.md (ships: D-CKPT-LAT-1 Windows checkpoint latency, D-NO-TRUNCATE-1, D-DOC-D3-ROOT-1, D-MO-3 Codex context7, plus anything else since v2.0.0-next.9; note if next.10 is an unpublished tag) and append one line to docs/v2/review/RESUME-2026-10-28.md. Commit, push.
Return published, version, failingStep, logLines, summary.`, { label: 'n10-rel', phase: 'Release', schema: REL, ...SNH })

return { fix, rel }
