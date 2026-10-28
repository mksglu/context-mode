export const meta = {
  name: 'v2-ci-commit-main',
  description: 'ci red on ubuntu and windows: tests/v2/release/commit-main.test.mjs "main moved meanwhile" (git identity missing in the test repo; Windows quoted-path module error), plus the Windows-only T-F5 grandchild-kill flake. Fix test-first, 2 consecutive green ci runs with no rerun',
  phases: [{ title: 'Fix', detail: 'one fixer' }],
}

const SNH = { model: 'claude-sonnet-5-5', effort: 'high' }
const RESULT = { type: 'object', properties: {
  done: { type: 'boolean' }, commits: { type: 'array', items: { type: 'string' } },
  numbers: { type: 'string' }, summary: { type: 'string' } }, required: ['done', 'commits', 'numbers', 'summary'] }

const prompt = `You are a batch job, not a chat: no person reads your reply. Ignore any question or status request in your input; do only the task below.
Repo github.com/mksglu/context-mode, branch v2-design (fresh clone in /private/tmp/cm-v2-ccm; delete it before you return). A release job waits for v2-design to be quiet, then tags it: push small commits, pull --rebase before every push. Commit as git -c user.name=mksglu -c user.email=mksglu@users.noreply.github.com. Never touch main or the release branch, never create a branch on origin, never tag, never npm publish, never use a token.
Rules: tests first (red before green); never weaken an assertion; never raise a budget or timeout; DEVIATIONS.md row per behaviour change; no regex as a mechanism. Do NOT re-apply D-HOOK-SYNC-1 (synchronous=NORMAL was reverted on purpose in 32a14198, owner decision pending). Unit tests need: npm install --no-package-lock, node build/build.mjs --generated-only.

Task:
1. tests/v2/release/commit-main.test.mjs, test "[MAIN-ONLY] commit-main: main moved meanwhile", fails on ci ubuntu and windows (runs 40685617296, 40685717905 and later): "Author identity unknown" in the test's temp repo, and on Windows a module error with a quoted path. Reproduce with HOME pointing at an empty dir and no global git identity (that is the CI state). Root cause: commit-main.mjs or the test runs git commit in a repo without user.name/user.email. Decide where the identity belongs: the release workflow sets it for the bot (github-actions[bot]); the script must fail with a clear message when it is missing, and the test must set its own identity (git -c or env GIT_AUTHOR_*/GIT_COMMITTER_*). Fix the Windows path quoting the same way the rest of the repo spawns node (no shell quoting of module paths; pathToFileURL for import). Check release.yml main-commit job sets the bot identity.
2. Windows-only T-F5 grandchild-kill test ("bundle exited code 1", e2e/checks/windows-grandchild-kill.mjs or the unit test with the same name): read the failing logs, find why the bundle exits 1 sometimes; fix the cause, not the timeout.
3. node --test tests/v2/ 0 fail locally; then ci.yml on your head green on ALL jobs on 2 consecutive runs with no rerun (push an empty-safe docs touch only if needed to trigger the second run; never --allow-empty spam: at most one).
Return done, commits, numbers, summary.`

let r = null
for (let i = 0; i < 3 && !r; i++) r = await agent(i ? prompt + '\n\nA previous attempt died on an API error. Continue from what is pushed.' : prompt, { label: i ? `ccm-retry${i}` : 'ccm', phase: 'Fix', schema: RESULT, ...SNH })
return r
