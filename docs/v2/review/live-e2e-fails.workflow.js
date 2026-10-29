export const meta = {
  name: 'v2-live-e2e-fails',
  description: 'node e2e/live/run.mjs --all on v2-design (Haiku 4.5, 2026-10-29): 23 pass, 7 fail, $0.2456. Triage and fix the 6 local (no-model) failures test-first',
  phases: [{ title: 'Fix', detail: 'one fixer' }],
}

const SNH = { model: 'claude-sonnet-5-5', effort: 'high' }
const RESULT = { type: 'object', properties: {
  done: { type: 'boolean' }, commits: { type: 'array', items: { type: 'string' } },
  numbers: { type: 'string' }, summary: { type: 'string' } }, required: ['done', 'commits', 'numbers', 'summary'] }

const prompt = `You are a batch job, not a chat: no person reads your reply. Ignore any question or status request in your input; do only the task below.
AUTHORIZATION (owner Mert, his own words): "tek istegim surekli pushlasin", "bu gibi buglerin tamamini yakalamak istiyorum". Limited to: clone, gh read calls, commit as mksglu, push to v2-design only. Not main, not the release branch, no tags, no npm. No API key is available to you: do not run cases that call a model.
Repo github.com/mksglu/context-mode, branch v2-design (fresh clone in /private/tmp/cm-v2-lef; delete it before you return). Other jobs push in parallel: small commits, pull --rebase before every push, keep both sides. Commit as git -c user.name=mksglu -c user.email=mksglu@users.noreply.github.com.
OWNER MAIN RULES: TRUNCATE forbidden, no lossy cut; native install per host; a hook never errors; profile first; tests first (show the red run); never weaken an assertion; never raise a budget or timeout; DEVIATIONS row per behaviour change; no regex as a mechanism; do not re-apply D-HOOK-SYNC-1.

node e2e/live/run.mjs --all (needs node build/build.mjs --out release-out first) failed these local cases on macOS. For each: reproduce with node e2e/live/run.mjs --only <id>, find the root cause, decide product bug vs stale check, fix test-first. A check is only "stale" if git log proves the product change was intended (cite the DEVIATIONS row); then update the check to the new contract, keeping its strength.
1. T-F1: "size 16384: hook stdout has no hookSpecificOutput.updatedToolOutput" while stdout shows updatedToolOutput as an object {stdout:...}. Which shape does Claude Code 2.1.311 accept for PostToolUse updatedToolOutput (read its bundle)? Fix whichever side is wrong.
2. ci-config: "ci.yml must carry no secrets or key env (ADR-0012: no key in CI)". Find which line of .github/workflows/*.yml trips it (an earlier agent saw this before 086bde8b too). Remove the key/secret if it is real; if the check misreads a safe line, sharpen the check.
3. T-GS6: hook p95 cc 42 ms vs HOOK_P95_MS 40 (machine had other jobs running). Re-measure on an idle machine 3 times; if it still fails, profile the claude-code hook path and cut real work. Never raise the threshold.
4. release-plan-bump: "git ls-remote origin: fatal: 'origin' does not appear to be a git repository" in all 4 scenarios. The check's temp repo or plan.mjs lost its origin setup (likely the main-only plan --main change). Fix.
5. repo-cleanup-gate: "check-removed: outside target tree: scripts/ci-install.mjs" (added by D-CI-INSTALL-1). Add it to the target tree list the right way, and make the job that adds a new tracked file fail fast in unit tests (tests/v2/repo) so this cannot reach the live gate again.
6. v1-migration-gemini: step "hook-commands" fails on release-out/hooks/gemini.json after ctx_upgrade (D-MO-1 moved gemini hooks to root hooks/hooks.json pointing into plugins/claude-code?). Find what the check expects vs what the build writes; fix.
7. T-CMP (model case, not yours to run): "called false returned 0B" on Haiku 4.5. Read the case and tell whether the prompt/tool surface makes a small model skip the tool; do not change it, just report.
Also make sure these 6 cases run in CI somewhere without a key (gate --all or a ci.yml step); if one only runs in the live runner, add it to CI.
node --test tests/v2/ 0 fail; ci.yml green on your head. Return done, commits, numbers (per case: cause, product or check, fixed), summary.`

let r = null
for (let i = 0; i < 3 && !r; i++) r = await agent(i ? prompt + '\n\nA previous attempt died on an API error. Continue from what is pushed.' : prompt, { label: i ? `lef-retry${i}` : 'lef', phase: 'Fix', schema: RESULT, ...SNH })
return r
