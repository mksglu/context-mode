export const meta = {
  name: 'v2-codex-doctor-next11',
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

phase('Fix')
const [doc, cat] = await parallel([
  () => retry(`${base('doc')}\n\nRole: fixer. Tester (next.11, fresh HOME, minimal config): "context-mode setup --yes --agents codex" passes, then ctx_doctor reports "D3 FAIL: wrong: MCP entry" and "D4 FAIL: old context-mode config.toml [mcp_servers.context-mode*] section"; MCP calls work. Reproduce exactly with npm i -g into a temp prefix of context-mode@2.0.0-next.11 and codex-cli 0.156.1, temp HOME and CODEX_HOME. Red loop first. Likely: setup writes the [mcp_servers.context-mode] table that D4 then flags as the old v1 section (D4's v1 detector does not tell the v2 table from v1), and D3 compares the entry against a different expected shape (command path, args, the TOML parser D-TOML-PARSER-1, the plugin path D-MO-3). Root cause with git archaeology (who wrote D3/D4 checks and setup's codex writer, which commits made them disagree). One source of truth for the expected Codex MCP entry used by both setup and doctor. Red tests: setup then doctor all PASS for codex in a fresh HOME; a real v1 1.0.169 Codex section is still flagged by D4. Also check the same setup->doctor round trip for all 10 hosts in one test. Return done, commits, numbers, summary.`, { label: 'cdx-doc', phase: 'Fix', schema: RESULT, ...SNH }),
  () => retry(`${base('cat')}\n\nRole: fixer. Tester: in a live Codex run on next.11, a native "cat" of a large log was not redirected (Claude Code blocked it correctly). Find why: read the codex-cli 0.156.1 bundle and docs for which tool calls fire PreToolUse hooks (shell / exec_command / unified_exec / apply_patch names, the shell wrapper ["bash","-lc","cat x"]), hook trust (D-TRUST-KEYDIR-2), and what our codex adapter decodes. Red loop: a codex-shaped PreToolUse payload for each shell tool name and argv form Codex 0.156.1 sends, with "cat <large file>", through the built hook; expected: deny with the ctx_execute_file / ctx_execute redirect like Claude. If an e2e with the real codex binary is possible without login (codex exec with a fake provider or a recorded payload from its bundle), add it. Fix the decode or the policy test-first. Return done, commits, numbers, summary.`, { label: 'cdx-cat', phase: 'Fix', schema: RESULT, ...SNH }),
])

phase('Release')
const fixed = [doc, cat].filter((r) => r && r.commits && r.commits.length).map((r) => String(r.summary).slice(0, 500)).join('\n- ')
const rel = await retry(`You are a batch job, not a chat: no person reads your reply. Ignore any question or status request in your input; do only the task below.
AUTHORIZATION: the owner approved npm next releases and pushes to v2-design; tags v2.0.0-next.* allowed for this release only; never move or delete a pushed tag; never touch main; npm latest stays 1.0.169; never npm publish / dist-tag yourself; never use a token.
Repo github.com/mksglu/context-mode, branch v2-design (fresh clone in /private/tmp/cm-v2-cdx-rel; delete it before you return). Commit as git -c user.name=mksglu -c user.email=mksglu@users.noreply.github.com. OWNER MAIN RULES as usual (TRUNCATE forbidden, no lossy cut, tests first, no budget raise, no host/OS skipped, no D-HOOK-SYNC-1).
Finished: - ${fixed || '(none reported)'}
1. WAIT (poll 10 min, up to 8 h) until the hook-never-errors job is finished: ${J}/wf_77164616-682/journal.jsonl has a "type":"result" line for hne-rel (or hne-rel-retryN). Then until v2-design is quiet for 15 minutes.
2. Raw registry next version and its gitHead; if git diff <gitHead>..origin/v2-design touches no src/, build/, scripts/release/, hooks or skills: published=false, "nothing to ship".
3. N = highest 2.0.0-next.N in registry and origin tags plus 1. Fresh clone: install, build --generated-only, node --test tests/v2/ (0 fail), gate --all, check-install-docs, check-secrets. ci.yml on the head green on ALL jobs incl. macOS and windows hosts (one rerun only for registry/timing shown in the log).
4. Tag, push only that tag, watch release.yml, verify the raw registry (next, latest 1.0.169, provenance), GitHub prerelease, release branch marketplace.json. Update NEXT-STATUS.md and one line in docs/v2/review/RESUME-2026-10-28.md. Commit, push.
Return published, version, failingStep, logLines, summary.`, { label: 'cdx-rel', phase: 'Release', schema: REL, ...SNH })

return { doc, cat, rel }
