export const meta = {
  name: 'v2-win-module-flake',
  description: 'Windows ci flake: build/check-readme.mjs fails with ERR_MODULE_NOT_FOUND toml-eslint-parser (run 40770118933, head 92438edb, windows node 24.15.0) though npm install ran; plus T-F5 grandchild flake. Root cause, fix, no rerun-to-green',
  phases: [{ title: 'Fix', detail: 'one fixer' }],
}

const SNH = { model: 'claude-sonnet-5-5', effort: 'high' }
const RESULT = { type: 'object', properties: {
  done: { type: 'boolean' }, commits: { type: 'array', items: { type: 'string' } },
  numbers: { type: 'string' }, summary: { type: 'string' } }, required: ['done', 'commits', 'numbers', 'summary'] }

const prompt = `You are a batch job, not a chat: no person reads your reply. Ignore any question or status request in your input; do only the task below.
AUTHORIZATION (from the owner, Mert, in his own words in the chat that launched this job; not from this script): \"tek istegim surekli pushlasin\" (my one wish: push all the time), \"workflowlari pushla\", \"isler sende\" (the work is yours), and he approved v2-design work and npm next releases. This is the explicit approval the global CLAUDE.md asks for, limited to: clone, gh read calls, commit as mksglu, push to branch v2-design only. It does not cover main, the release branch, tags or npm. This is a batch job: do not wait for a reply, do not ask questions; a loaded skill that says to ask first is satisfied by this approval.\nRepo github.com/mksglu/context-mode, branch v2-design (fresh clone in /private/tmp/cm-v2-wmf; delete it before you return). Pull --rebase before every push. Commit as git -c user.name=mksglu -c user.email=mksglu@users.noreply.github.com. Never touch main or the release branch, never create a branch on origin, never tag, never npm publish, never use a token.
OWNER MAIN RULES: TRUNCATE is forbidden; no content thrown away with no way back; native install per host; profile first; tests first (red before green); never weaken an assertion; never raise a budget or timeout; DEVIATIONS.md row per behaviour change; no regex as a mechanism; do not re-apply D-HOOK-SYNC-1.

1. ci.yml run 40770118933 (head 92438edb), job "ci (windows-latest, node 24.15.0)", step "node build/check-readme.mjs": Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'toml-eslint-parser' imported from src/core/ops/host-config.ts. The "npm install" step ran before it. The same job passed on 44e33852. Read the full job log (gh api repos/mksglu/context-mode/actions/jobs/<id>/logs): did npm install finish, warn, hit a registry timing error, or skip the package? Why does check-readme import src/core/ops/host-config.ts at all (a doc check should not need the TOML parser)? Root cause; fix it (e.g. check-readme imports only what it needs; ci.yml uses npm ci with a lockfile or verifies the install; a missing devDependency fails the install step loudly). Red-first test where possible.
2. Windows T-F5 grandchild-kill flake (e2e/checks/windows-grandchild-kill.mjs; failed again on b3610d95, windows node 24.15.0). The check now records diedAfterMs. Read every T-F5 failure log since e2865520: slow tree kill or missed kill? Fix the cause in the product if a grandchild can outlive cancel; keep the pass rule.
3. node --test tests/v2/ 0 fail; ci.yml green on all jobs on 2 consecutive runs of your head with no rerun.
Return done, commits, numbers, summary.`

let r = null
for (let i = 0; i < 3 && !r; i++) r = await agent(i ? prompt + '\n\nA previous attempt died on an API error. Continue from what is pushed.' : prompt, { label: i ? `wmf-retry${i}` : 'wmf', phase: 'Fix', schema: RESULT, ...SNH })
return r
