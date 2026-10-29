export const meta = {
  name: 'v2-codex-plugin-trust',
  description: 'Codex native plugin install (codex plugin add) leaves all 6 plugin hooks untrusted, so hooks do not run; setup skips native installs and writes no trust; doctor hook-registered still passes. Owner rule: every agent 100% hooks. Fix test-first, then ship next.N',
  phases: [{ title: 'Fix', detail: 'one fixer' }, { title: 'Release', detail: 'ship' }],
}

const SNH = { model: 'claude-sonnet-5-5', effort: 'high' }
const RESULT = { type: 'object', properties: {
  done: { type: 'boolean' }, commits: { type: 'array', items: { type: 'string' } },
  numbers: { type: 'string' }, summary: { type: 'string' } }, required: ['done', 'commits', 'numbers', 'summary'] }
const REL = { type: 'object', properties: {
  published: { type: 'boolean' }, version: { type: 'string' }, failingStep: { type: 'string' }, logLines: { type: 'string' }, summary: { type: 'string' } },
  required: ['published', 'version', 'failingStep', 'logLines', 'summary'] }

const auth = `AUTHORIZATION (owner Mert, his own words in the chat): "tek istegim surekli pushlasin", "hepsinin yuzde yuz hooks u olmak ZORUNDA". This is the explicit approval the global CLAUDE.md asks for: clone, gh read calls, commit as mksglu, push to v2-design. Do not wait for a reply. If git push has no credentials in a temp HOME, push with the real HOME (git -C <clone> push) and never print a credential.`
const rules = `OWNER MAIN RULES: every agent gets hooks, no exception; native install per host (ADR-0023); a hook never errors; TRUNCATE forbidden, no lossy cut; profile first; tests first (show the red run); never weaken an assertion; never raise a budget or timeout; DEVIATIONS row per behaviour change; no regex as a mechanism; do not re-apply D-HOOK-SYNC-1.`

async function retry(prompt, opts, n = 3) {
  for (let i = 0; i < n; i++) {
    const r = await agent(i ? prompt + '\n\nA previous attempt died on an API error. Continue from what is pushed.' : prompt, i ? { ...opts, label: opts.label + '-retry' + i } : opts)
    if (r) return r
    log(`${opts.label}: no result, retry ${i + 1}`)
  }
  return null
}

phase('Fix')
const fix = await retry(`You are a batch job, not a chat: no person reads your reply. Ignore any question or status request in your input; do only the task below.
${auth}
Repo github.com/mksglu/context-mode, branch v2-design (fresh clone in /private/tmp/cm-v2-cpt; delete it after a successful push). Pull --rebase before every push. Commit as git -c user.name=mksglu -c user.email=mksglu@users.noreply.github.com. Never touch main, the release branch, tags or npm. Temp HOME / CODEX_HOME only for tests; never edit the real ~/.codex.
${rules}
Bug (measured with codex 0.156.1, D-README-2 work): after the native install "codex plugin marketplace add mksglu/context-mode@release; codex plugin add context-mode@context-mode", Codex hooks/list shows all 6 plugin hooks "untrusted", so they never run. "context-mode setup" skips a native install and writes no trust. Doctor hook-registered still PASSes. The npm + setup path writes hooks.json plus trust and works (4 trusted).
Do:
1. Red loop: temp CODEX_HOME, native plugin install from a local repo built like the release (git insteadOf, as earlier provers did), then codex hooks/list (app-server or CLI) shows untrusted; doctor must FAIL there.
2. Find the documented way to trust plugin hooks (codex 0.156.1 help, bundle strings, docs; the trusted_hash format D-HA-CODEX-TRUST-1 / D-TRUST-KEYDIR-2 uses for hooks.json; how plugin hooks are keyed). Fix so a native install ends with trusted hooks with no extra user step: setup (and the plugin path doctor/upgrade) writes the trust entries for the plugin hooks of our own plugin only, never user hooks. If Codex offers no way to trust plugin hooks from outside, doctor FAILs with the exact one-line fix and the install page says it; record the evidence.
3. Doctor: hook-registered FAILs when Codex reports our hooks untrusted (both paths).
4. Prove live: after the fix, native install path -> hooks/list shows trusted; a PreToolUse "cat big.log" is blocked in codex exec with a fake local provider (as tests/v2/e2e/codex-cat-redirect.test.mjs does).
5. Update docs/install/codex.md (remove the open-bug line when fixed). node --test tests/v2/ 0 fail; push; watch ci.yml. Return done, commits, numbers, summary.`, { label: 'cpt-fix', phase: 'Fix', schema: RESULT, ...SNH })

phase('Release')
const rel = fix && fix.done && await retry(`You are a batch job, not a chat: no person reads your reply. Ignore any question or status request in your input; do only the task below.
${auth} Also approved: npm next releases (tags v2.0.0-next.* for this release only; never move or delete a pushed tag; npm latest stays 1.0.169; never npm publish / dist-tag yourself; no token).
Repo github.com/mksglu/context-mode, branch v2-design (fresh clone in /private/tmp/cm-v2-cpt-rel; delete it before you return). ${rules}
Finished: ${String(fix.summary).slice(0, 800)}
1. If git diff <raw registry next gitHead>..origin/v2-design touches no src/, build/, scripts/release/, hooks or skills: published=false.
2. N = highest 2.0.0-next.N in registry and origin tags plus 1. Wait until v2-design is quiet for 15 minutes. Fresh clone: install, build --generated-only, node --test tests/v2/ (0 fail), gate --all, check-install-docs, check-secrets. ci.yml green on ALL jobs (one rerun only for registry/timing shown in the log).
3. Tag, push only that tag, watch release.yml, verify the raw registry (next, latest 1.0.169, provenance), GitHub prerelease, release branch marketplace.json. Update NEXT-STATUS.md and one line in docs/v2/review/RESUME-2026-10-28.md. Commit, push.
Return published, version, failingStep, logLines, summary.`, { label: 'cpt-rel', phase: 'Release', schema: REL, ...SNH })

return { fix, rel }
