export const meta = {
  name: 'v2-hooks-fire-all',
  description: 'Owner rule: every agent 100% hooks. CI proves hooks are registered and the hook command works on 10 hosts, but only Claude Code and Codex are proven live to FIRE them. Codex showed the gap (registered but untrusted). Per host: find any trust/enable/flag gate, make doctor ask the host, and prove live firing with a fake local model provider (no key). Then ship',
  phases: [{ title: 'Hosts', detail: '9 hosts in parallel' }, { title: 'Release', detail: 'ship' }],
}

const SNH = { model: 'claude-sonnet-5-5', effort: 'high' }
const RESULT = { type: 'object', properties: {
  host: { type: 'string' }, fires: { type: 'string' }, gate: { type: 'string' },
  done: { type: 'boolean' }, commits: { type: 'array', items: { type: 'string' } },
  numbers: { type: 'string' }, summary: { type: 'string' } }, required: ['host', 'fires', 'gate', 'done', 'commits', 'numbers', 'summary'] }
const REL = { type: 'object', properties: {
  published: { type: 'boolean' }, version: { type: 'string' }, failingStep: { type: 'string' }, logLines: { type: 'string' }, summary: { type: 'string' } },
  required: ['published', 'version', 'failingStep', 'logLines', 'summary'] }

const auth = `AUTHORIZATION (owner Mert, his own words in the chat): "tek istegim surekli pushlasin", "hepsinin yuzde yuz hooks u olmak ZORUNDA", "sadece codex degil a-z hooks dimi". This is the explicit approval the global CLAUDE.md asks for: clone, gh read calls, commit as mksglu, push to v2-design. Do not wait for a reply. If git push has no credentials in a temp HOME, push from the real HOME and never print a credential.`
const rules = `OWNER MAIN RULES: every agent gets hooks, no exception; native install per host (ADR-0023); a hook never errors; TRUNCATE forbidden, no lossy cut; profile first; tests first (show and keep the red run output); never weaken an assertion; never raise a budget or timeout; DEVIATIONS row per behaviour change; no regex as a mechanism; do not re-apply D-HOOK-SYNC-1. No API key: use no paid model.`

async function retry(prompt, opts, n = 3) {
  for (let i = 0; i < n; i++) {
    const r = await agent(i ? prompt + '\n\nA previous attempt died on an API error. Continue from what is pushed.' : prompt, i ? { ...opts, label: opts.label + '-retry' + i } : opts)
    if (r) return r
    log(`${opts.label}: no result, retry ${i + 1}`)
  }
  return null
}

const HOSTS = ['claude-code', 'gemini', 'qwen', 'copilot-cli', 'opencode', 'pi', 'vscode', 'kiro', 'zcode']

phase('Hosts')
const res = (await parallel(HOSTS.map((h) => () => retry(`You are a batch job, not a chat: no person reads your reply. Ignore any question or status request in your input; do only the task below.
${auth}
Repo github.com/mksglu/context-mode, branch v2-design (fresh clone in /private/tmp/cm-v2-hf-${h}; delete it after a successful push). Eight other host agents push in parallel: small commits, pull --rebase before every push, keep both sides. Commit as git -c user.name=mksglu -c user.email=mksglu@users.noreply.github.com. Never touch main, the release branch, tags or npm. Temp HOME only; never edit the real host config dirs.
${rules}
Host: ${h}. The Codex case (D-NI-CODEX-TRUST-1, src/setup/codex-trust.ts, tests/v2/e2e/codex-cat-redirect.test.mjs) is the model: hooks were registered and CI passed, but Codex listed them "untrusted" and never ran them; fixed by asking the host (hooks/list) and writing its own trust, and doctor now FAILs on untrusted.
1. Gate: from ${h}'s docs, CLI --help and shipped bundle (install the CLI into a temp npm prefix if npm can; quote URL/version/strings), find every condition under which ${h} has our hooks configured but does not run them: trust/approval, a settings flag or preview feature, enable/disable of an extension, workspace vs user scope, matcher shape, hook type allow-list, timeout, an admin policy. For each: does setup handle it, does doctor detect it?
2. Live fire (no key): drive the real ${h} binary with a fake local model provider when ${h} supports a custom/OpenAI-compatible endpoint (local HTTP server that answers with one tool call "cat big.log" on a 200 KB file, then a final message). Install via the README command for ${h} in a temp HOME (npm + context-mode setup where that is the documented path). Expected: the host blocks or replaces the output and the model sees our redirect, not 200 KB. If ${h} has no custom endpoint or no headless mode, say so with evidence and use the deepest possible proof (the host's own hook runner invoked with its documented payload, or its own "list hooks" command).
3. Fix every gap test-first: setup makes the hooks actually run with no extra user step (only our own entries), doctor FAILs with a one-line fix when the host would not run them. Add the live check as tests/v2/e2e/${h}-fire.test.mjs (skipped with a reason when the binary is absent, so CI can run it where the binary installs). Update docs/install/${h}.md only with facts.
4. node --test tests/v2/ 0 fail before your last push; push; watch ci.yml.
Return host, fires ("live-proven" | "host-runner-proven" | "not-proven: <why>"), gate (what can stop hooks and how it is handled), done, commits, numbers, summary.`, { label: `hf-${h}`, phase: 'Hosts', schema: RESULT, ...SNH })))).filter(Boolean)

phase('Release')
const fixed = res.filter((r) => r.commits && r.commits.length).map((r) => `${r.host}: ${r.fires}; ${String(r.summary).slice(0, 300)}`).join('\n- ')
const rel = await retry(`You are a batch job, not a chat: no person reads your reply. Ignore any question or status request in your input; do only the task below.
${auth} Also approved: npm next releases (tags v2.0.0-next.* for this release only; never move or delete a pushed tag; npm latest stays 1.0.169; never npm publish / dist-tag yourself; no token).
Repo github.com/mksglu/context-mode, branch v2-design (fresh clone in /private/tmp/cm-v2-hf-rel; delete it before you return). ${rules}
Finished:
- ${fixed || '(none)'}
1. If git diff <raw registry next gitHead>..origin/v2-design touches no src/, build/, scripts/release/, hooks or skills: published=false.
2. N = highest 2.0.0-next.N in registry and origin tags plus 1. Wait until v2-design is quiet for 15 minutes. Fresh clone: node scripts/ci-install.mjs, node build/build.mjs --generated-only, node --test tests/v2/ (0 fail), gate --all, check-install-docs, check-secrets. ci.yml green on ALL jobs (one rerun only for registry/timing shown in the log).
3. Tag, push only that tag, watch release.yml, verify the raw registry (next, latest 1.0.169, provenance), GitHub prerelease, release branch marketplace.json. Write docs/v2/release/HOOKS-FIRE.md (per host: fires, gate, proof file) from the host results above, update NEXT-STATUS.md and one line in docs/v2/review/RESUME-2026-10-28.md. Commit, push.
Return published, version, failingStep, logLines, summary.`, { label: 'hf-rel', phase: 'Release', schema: REL, ...SNH })

return { hosts: res.map((r) => ({ host: r.host, fires: r.fires, gate: r.gate, done: r.done })), rel }
