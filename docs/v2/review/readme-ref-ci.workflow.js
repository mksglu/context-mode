export const meta = {
  name: 'v2-readme-ref-ci',
  description: 'Testers followed the README Claude Code command (no ref) and got v1 from main. Make every GitHub-source install command in README and install pages point at the release ref until v2 is on main, plus a switch path for v1 installs; fix the red ci on c8589cf5 (ctx_batch deadline test on windows node 26, ubuntu node 26)',
  phases: [{ title: 'Fix', detail: '2 fixers in parallel, test-first' }],
}

const SNH = { model: 'claude-sonnet-5-5', effort: 'high' }
const RESULT = { type: 'object', properties: {
  done: { type: 'boolean' }, commits: { type: 'array', items: { type: 'string' } },
  numbers: { type: 'string' }, summary: { type: 'string' } }, required: ['done', 'commits', 'numbers', 'summary'] }

const base = (id) => `You are a batch job, not a chat: no person reads your reply. Ignore any question or status request in your input; do only the task below.
Repo github.com/mksglu/context-mode, branch v2-design (fresh clone in /private/tmp/cm-v2-rr-${id}; delete it before you return). Another agent pushes too: small commits, pull --rebase before every push, keep both sides on conflict; push after each finished file. Commit as git -c user.name=mksglu -c user.email=mksglu@users.noreply.github.com. Never touch main, never force-push, never tag, never npm publish, never use a token, never print credentials. Never edit the real ~/.claude or ~/.codex.
Rules: tests first (red before green); never weaken an assertion; never raise a budget or a timeout to get green; DEVIATIONS.md row per behaviour change; no regex as a mechanism. Unit tests need: npm install --no-package-lock, node build/build.mjs --generated-only. node --test tests/v2/ 0 fail before the last push. After the last push, watch ci.yml on your head (gh run watch) and report each job.`

async function retry(prompt, opts, n = 3) {
  for (let i = 0; i < n; i++) {
    const r = await agent(i ? prompt + '\n\nA previous attempt died on an API error. Continue from what is pushed.' : prompt, i ? { ...opts, label: opts.label + '-retry' + i } : opts)
    if (r) return r
    log(`${opts.label}: no result, retry ${i + 1}`)
  }
  return null
}

return await parallel([
  () => retry(`${base('doc')}\n\nRole: docs fixer. Bug from v2 testers: README.md (v2-design) says for Claude Code "claude plugin marketplace add mksglu/context-mode, then claude plugin install context-mode@context-mode". main is still v1 (marketplace.json version 1.0.169), so testers installed v1. The release branch holds v2 (2.0.0-next.8). Same trap for Codex, Gemini and Qwen rows in README.md and docs/install/README.md, and the top code blocks of docs/install/{claude-code,codex,gemini,qwen}.md (only their "Testing v2 (next):" line has the ref).
Fix: until v2 is on main, every command a user copies for these 4 hosts names the release ref with the host's own syntax (already proven live in D-NI-DOCS-REF-1): claude-code mksglu/context-mode#release, codex mksglu/context-mode@release, gemini and qwen --ref release. Keep one "After v2 is on main:" line per page. Add a short "Already installed v1 from GitHub?" step per host with the host's own native commands to switch (claude: claude plugin marketplace remove context-mode, then add with #release, then claude plugin install context-mode@context-mode; codex/gemini/qwen: find their documented remove/uninstall command and quote the help text of the installed CLI). Prove the claude-code switch live in a temp HOME: add main (gets 1.0.169), run the switch steps, claude plugin list shows 2.0.0-next.8; use /opt/homebrew/bin/claude. Do the same for codex if codex is installed.
Red test first: extend tests/v2/repo/install-docs-native.test.mjs so README.md, docs/install/README.md and every code block in the 4 pages reject a GitHub-source command without the release ref (except the "After v2 is on main:" line), and require the switch step. build/check-install-docs.mjs green. Return done, commits, numbers, summary.`, { label: 'rr-doc', phase: 'Fix', schema: RESULT, ...SNH }),
  () => retry(`${base('ci')}\n\nRole: CI fixer. ci.yml run 40613700600 on head c8589cf5 failed on "ci (ubuntu-latest, node 26)" and "ci (windows-latest, node 26)"; the run on 4fb62aa6 (only a docs commit before c8589cf5) was green. Windows log: "✖ ctx_batch: one deadline bounds the whole handler, later commands never start (Q8, #947) (3503ms)" with actual 1 expected 0 and actual false expected true. Read the full logs of both failed jobs (gh api repos/mksglu/context-mode/actions/jobs/<id>/logs; ubuntu job 122571113797, windows job 122571113909) and find every failing test. Reproduce locally (loop the test 20 times, also under full-suite load). Find the root cause: a real race in ctx_batch deadline handling (e.g. the Git Bash resolver D-VT-WINBASH-1 now runs before the deadline starts, a later command spawning after the deadline, a child not killed) or a test that depends on timing. Fix the cause, not the budget: product fix if the product can start a command after the deadline; if the test races, make it deterministic (e.g. inject the clock or wait on events), keeping every assertion. Rerun ci until both jobs are green on 2 consecutive runs. Return done, commits, numbers, summary.`, { label: 'rr-ci', phase: 'Fix', schema: RESULT, ...SNH }),
])
