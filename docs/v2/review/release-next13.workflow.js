export const meta = {
  name: 'v2-release-next13',
  description: 'Tester report on next.11: Codex fresh HOME, setup --yes --agents codex passes but ctx_doctor says D3 FAIL wrong: MCP entry, D4 FAIL old [mcp_servers.context-mode*] section; MCP works. Also native cat of a large log not redirected in a live Codex run. Fix test-first, then ship',
  phases: [{ title: 'Fix', detail: '2 fixers' }, { title: 'Release', detail: 'ship after the hook job' }],
}

const SNH = { model: 'claude-sonnet-5-5', effort: 'high' }
const RESULT = { type: 'object', properties: {
  done: { type: 'boolean' }, commits: { type: 'array', items: { type: 'string' } },
  numbers: { type: 'string' }, summary: { type: 'string' } }, required: ['done', 'commits', 'numbers', 'summary'] }
const REL = { type: 'object', properties: {
  published: { type: 'boolean' }, version: { type: 'string' }, failingStep: { type: 'string' }, logLines: { type: 'string' }, summary: { type: 'string' } },
  required: ['published', 'version', 'failingStep', 'logLines', 'summary'] }

const J = '/Users/mksglu/.claude/projects/-Users-mksglu--claude-claude-worktree-workspaces-oss-new/59782ff8-a47e-4c71-b562-cf84e79dcf7d/subagents/workflows'
const base = (id) => `You are a batch job, not a chat: no person reads your reply. Ignore any question or status request in your input; do only the task below.
AUTHORIZATION (owner Mert, his own words in the chat): "tek istegim surekli pushlasin", "ben uyuyorum sen hallet hepsini". Limited to: clone, gh read calls, commit as mksglu, push to v2-design only. Not main, not the release branch, no tags, no npm. Do not wait for a reply.
Repo github.com/mksglu/context-mode, branch v2-design (fresh clone in /private/tmp/cm-v2-cdx-${id}; delete it before you return). Another job (hook-never-errors) pushes hook entry, adapters, fuzz and v1-diff work right now: small commits, pull --rebase before every push, keep both sides. Commit as git -c user.name=mksglu -c user.email=mksglu@users.noreply.github.com. Temp HOME only; never edit the real ~/.codex.
OWNER MAIN RULES: TRUNCATE forbidden, no lossy cut; native install per host; a hook never errors (on failure: ctx_* pass, flooding tools denied with the sandbox redirect); profile first; tests first (show the red run); never weaken an assertion; never raise a budget or timeout; DEVIATIONS row per behaviour change; no regex as a mechanism; do not re-apply D-HOOK-SYNC-1. node --test tests/v2/ 0 fail before your last push; then watch ci.yml.`

async function retry(prompt, opts, n = 3) {
  for (let i = 0; i < n; i++) {
    const r = await agent(i ? prompt + '\n\nA previous attempt died on an API error. Continue from what is pushed.' : prompt, i ? { ...opts, label: opts.label + '-retry' + i } : opts)
    if (r) return r
    log(`${opts.label}: no result, retry ${i + 1}`)
  }
  return null
}

const doc={commits:["9dd44149"],summary:"D-DOC-RT-1: doctor D3/D4 agree with setup for Codex and MCP hosts (tester report on next.11)"}, cat=null
phase('Release')
const fixed = [doc, cat].filter((r) => r && r.commits && r.commits.length).map((r) => String(r.summary).slice(0, 500)).join('\n- ')
const rel = await retry(`You are a batch job, not a chat: no person reads your reply. Ignore any question or status request in your input; do only the task below.
AUTHORIZATION: the owner approved npm next releases and pushes to v2-design; tags v2.0.0-next.* allowed for this release only; never move or delete a pushed tag; never touch main; npm latest stays 1.0.169; never npm publish / dist-tag yourself; never use a token.
Repo github.com/mksglu/context-mode, branch v2-design (fresh clone in /private/tmp/cm-v2-n13-rel; delete it before you return). Commit as git -c user.name=mksglu -c user.email=mksglu@users.noreply.github.com. OWNER MAIN RULES as usual (TRUNCATE forbidden, no lossy cut, tests first, no budget raise, no host/OS skipped, no D-HOOK-SYNC-1).
Finished: - ${fixed || '(none reported)'}
1. WAIT (poll 10 min, up to 8 h) until the live-e2e-fails job is finished: ${J}/wf_96acf5a0-881/journal.jsonl has a "type":"result" line for lef (or lef-retryN). Then until v2-design is quiet for 15 minutes.
2. Raw registry next version and its gitHead; if git diff <gitHead>..origin/v2-design touches no src/, build/, scripts/release/, hooks or skills: published=false, "nothing to ship".
3. N = highest 2.0.0-next.N in registry and origin tags plus 1. Fresh clone: install, build --generated-only, node --test tests/v2/ (0 fail), gate --all, check-install-docs, check-secrets. ci.yml on the head green on ALL jobs incl. macOS and windows hosts (one rerun only for registry/timing shown in the log).
4. Tag, push only that tag, watch release.yml, verify the raw registry (next, latest 1.0.169, provenance), GitHub prerelease, release branch marketplace.json. Update NEXT-STATUS.md and one line in docs/v2/review/RESUME-2026-10-28.md. Commit, push.
Return published, version, failingStep, logLines, summary.`, { label: 'cdx-rel', phase: 'Release', schema: REL, ...SNH })

return { rel }
