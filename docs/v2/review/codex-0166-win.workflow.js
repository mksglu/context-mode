export const meta = {
  name: 'v2-codex-0166-win',
  description: 'Tester (Viet) on next.15, Windows, Codex Desktop CLI 0.166.0-alpha.5.1: (1) native plugin setup writes 4 trust tables but verification still lists 4 of 4 hooks untrusted, rolls back; (2) npm+setup route: hooks trusted, hook replay denies cat, but codex exec runs native cat with no PreToolUse call at all. Root-cause both on the tester build, fix test-first, ship',
  phases: [{ title: 'Fix', detail: '2 agents in parallel' }, { title: 'Release', detail: 'ship' }],
}

const SNH = { model: 'claude-sonnet-5-5', effort: 'high' }
const RESULT = { type: 'object', properties: {
  done: { type: 'boolean' }, rootCause: { type: 'string' }, commits: { type: 'array', items: { type: 'string' } },
  numbers: { type: 'string' }, summary: { type: 'string' } }, required: ['done', 'rootCause', 'commits', 'numbers', 'summary'] }
const REL = { type: 'object', properties: {
  published: { type: 'boolean' }, version: { type: 'string' }, failingStep: { type: 'string' }, logLines: { type: 'string' }, summary: { type: 'string' } },
  required: ['published', 'version', 'failingStep', 'logLines', 'summary'] }

const auth = `This job is the owner's own request: Mert pasted the tester report into this chat and his standing words are "tek istegim surekli pushlasin" and "hepsinin yuzde yuz hooks u olmak ZORUNDA". He approved clone, gh reads, commit as mksglu and push to v2-design. Do not wait for a reply. If git push has no credentials in a temp HOME, push from the real HOME; never print a credential.`
const rules = `OWNER MAIN RULES: every agent gets hooks, no exception; native install per host (ADR-0023); a hook never errors; TRUNCATE forbidden, no lossy cut; profile first; tests first (keep the red run output); TEST LAYOUT RULE (ADR-0024, docs/v2/TEST-LAYOUT.md): put each red test inside the existing ADR area file, never create a new test file; never weaken an assertion; never raise a budget or timeout; DEVIATIONS row per behaviour change; no regex as a mechanism; do not re-apply D-HOOK-SYNC-1.`
const repo = (id) => `Repo github.com/mksglu/context-mode, branch v2-design (fresh clone /private/tmp/cm-v2-c166-${id}; delete after a successful push). Another agent pushes in parallel: pull --rebase before every push, keep both sides. Commit as git -c user.name=mksglu -c user.email=mksglu@users.noreply.github.com. Never touch main, the release branch, tags or npm. Temp HOME/USERPROFILE/CODEX_HOME only; never edit the real ~/.codex. Setup: node scripts/ci-install.mjs; node build/build.mjs --generated-only; node build/build.mjs --out release-out. node --test "tests/v2/**/*.test.mjs" 0 fail before your last push; watch ci.yml (Windows jobs matter here).`
const report = `Tester report (Windows x64 10.0.26300, Node 24.18.0, Codex Desktop bundled CLI 0.166.0-alpha.5.1, context-mode 2.0.0-next.15):
A) Native plugin route, fresh HOME/USERPROFILE/CODEX_HOME: marketplace = local checkout of release 24a3cc40; codex plugin add context-mode@context-mode (installed 2.0.0-next.15); node cli.mjs setup --yes --agents codex --json -> status FAIL, rolledBack true, hook-registered "codex lists 4 of 4 context-mode plugin hooks untrusted"; setup listed four trust-table changes; app-server hooks/list confirms 4 enabled but untrusted. Same on a second run with parent CODEX_* cleared.
B) npm + setup route: D3/D4 PASS, stats/search 5-10 ms. codex exec still runs plain and chained cat of a 371,243-byte log (host truncation only, no context-mode deny). The 4 user hooks report trusted in hooks/list. Replaying PreToolUse/Bash payloads into the published hook denies plain cat, "cd .; cat", "echo PRECHECK; cat", "ls && cat". A no-op observation hook added in the test home captured no input during native cat runs, also with --no-daemon and --enable hooks.
Our fix D-NI-CODEX-TRUST-1 (src/setup/codex-trust.ts, next.14) was built and proven on codex-cli 0.156.1 macOS.`

async function retry(prompt, opts, n = 3) {
  for (let i = 0; i < n; i++) {
    const r = await agent(i ? prompt + '\n\nA previous attempt died on an API error. Continue from what is pushed.' : prompt, i ? { ...opts, label: opts.label + '-retry' + i } : opts)
    if (r) return r
    log(`${opts.label}: no result, retry ${i + 1}`)
  }
  return null
}

const head = (id) => `You are a batch job, not a chat: no person reads your reply. Do only the task below.\n${auth}\n${repo(id)}\n${rules}\n${report}`

phase('Fix')
const [trust, fire] = await parallel([
  () => retry(`${head('trust')}
Role: route A, trust does not stick.
1. Get the tester's build: install the newest Codex CLI that matches 0.166.0-alpha.5.1 into a temp npm prefix (npm view @openai/codex versions --json; install the exact alpha if published, else the nearest 0.166 alpha, and say which). Also check the Windows build artifact (@openai/codex-win32-x64 or the platform package) for string differences.
2. Red loop on this machine with that build: fresh CODEX_HOME, local marketplace from a release-built tree, codex plugin add, setup --yes --agents codex --json; then hooks/list. Also run the same steps in the Windows CI job (add the case to the windows hosts matrix / the ADR area file for setup) so the Windows path is tested, not guessed.
3. Find why the written [hooks.state."<key>"] trusted_hash does not take: key format changed (plugin id, path separator \\ vs /, event name casing, index), hash input changed (command string, quoting of the Windows node path, CRLF), table moved, Codex reads a different config layer, or trust now needs an app-server call. Read the 0.166 bundle/source (codex-rs hooks trust code) and diff against 0.156.1. Prefer asking the host for the exact key AND hash and, if Codex exposes a trust method on app-server, use that instead of writing TOML.
4. Fix test-first in the setup ADR area file; keep 0.156.1 working (both versions in the test). Verification must not roll back when trust is in place. Return done, rootCause, commits, numbers, summary.`, { label: 'c166-trust', phase: 'Fix', schema: RESULT, ...SNH }),
  () => retry(`${head('fire')}
Role: route B, PreToolUse never fires for native shell on Codex 0.166 (trusted hooks, replay works, observation hook captured nothing).
1. Same build as the trust agent (temp npm prefix, nearest 0.166 alpha; say which). With a fake local Responses provider (as tests in the codex area do), codex exec a prompt that makes the model run "cat big.log" on macOS here and in the Windows CI job. Record which tool the model call uses in 0.166 (exec_command, unified_exec, shell_command, local_shell, a PowerShell tool on Windows, apply_patch...) and whether ANY hook event fires (add a logging-only hook in the temp home).
2. Read the 0.166 bundle/source: which tool calls dispatch PreToolUse, which event/matcher names they use, whether hooks are behind a feature flag or disabled for exec/non-interactive/Windows, whether the Desktop-bundled CLI uses a different config dir. Diff with 0.156.1.
3. Fix test-first in the codex/hooks ADR area file: register for every event and matcher 0.166 uses for shell and file reads, decode its payload, and make doctor FAIL with a one-line fix if the host build cannot fire our hook (e.g. a needed feature flag). If Codex 0.166 has no hook for that tool at all, document it with evidence, make doctor say so, and report it as a host limitation (do not claim fixed).
4. Live proof: cat big.log is denied in codex exec with 0.166 (and still with 0.156.1). Return done, rootCause, commits, numbers, summary.`, { label: 'c166-fire', phase: 'Fix', schema: RESULT, ...SNH }),
])

phase('Release')
const fixed = [trust, fire].filter((r) => r && r.commits && r.commits.length).map((r) => `${r.rootCause}: ${String(r.summary).slice(0, 400)}`).join('\n- ')
const rel = await retry(`You are a batch job, not a chat: no person reads your reply. Do only the task below.
${auth} Also approved: npm next releases (tags v2.0.0-next.* for this release only; never move or delete a pushed tag; npm latest stays 1.0.169; never npm publish / dist-tag yourself; no token).
Repo github.com/mksglu/context-mode, branch v2-design (fresh clone /private/tmp/cm-v2-c166-rel; delete it before you return). ${rules}
Finished:
- ${fixed || '(none)'}
1. If git diff <raw registry next gitHead>..origin/v2-design touches no src/, build/, scripts/release/, hooks or skills: published=false.
2. N = highest 2.0.0-next.N in registry and origin tags plus 1. Wait until v2-design is quiet for 15 minutes. Fresh clone: install, build --generated-only, node --test "tests/v2/**/*.test.mjs" (0 fail), gate --all, check-install-docs, check-secrets. ci.yml green on ALL jobs (one rerun only for registry/timing shown in the log).
3. Tag, push only that tag, watch release.yml, verify the raw registry (next, latest 1.0.169, provenance), GitHub prerelease, release branch marketplace.json. Update NEXT-STATUS.md and one line in docs/v2/review/RESUME-2026-10-28.md. Write docs/v2/review/viet/next-reply.md: what to rerun, which version. Commit, push.
Return published, version, failingStep, logLines, summary.`, { label: 'c166-rel', phase: 'Release', schema: REL, ...SNH })

return { trust, fire, rel }
