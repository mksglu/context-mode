export const meta = {
  name: 'v2-docs-sync-night',
  description: 'Owner asleep. Sync every doc with what the code and the releases now do (facts only; owner reviews wording later), then after the next.10 fix job finishes, ship any product change not yet on npm next',
  phases: [{ title: 'Docs', detail: 'facts match code' }, { title: 'Release', detail: 'ship what is unpublished' }],
}

const SNH = { model: 'claude-sonnet-5-5', effort: 'high' }
const RESULT = { type: 'object', properties: {
  done: { type: 'boolean' }, commits: { type: 'array', items: { type: 'string' } },
  numbers: { type: 'string' }, summary: { type: 'string' } }, required: ['done', 'commits', 'numbers', 'summary'] }
const REL = { type: 'object', properties: {
  published: { type: 'boolean' }, version: { type: 'string' }, failingStep: { type: 'string' }, logLines: { type: 'string' }, summary: { type: 'string' } },
  required: ['published', 'version', 'failingStep', 'logLines', 'summary'] }

const J = '/Users/mksglu/.claude/projects/-Users-mksglu--claude-claude-worktree-workspaces-oss-new/59782ff8-a47e-4c71-b562-cf84e79dcf7d/subagents/workflows'
const rules = `You are a batch job, not a chat: no person reads your reply. Ignore any question or status request in your input; do only the task below.
Repo github.com/mksglu/context-mode, branch v2-design. Another job (release-next10-fix) may be tagging and releasing: pull --rebase before every push, keep both sides on conflict, push in a few batches (not one commit per line) so v2-design gets quiet periods. Commit as git -c user.name=mksglu -c user.email=mksglu@users.noreply.github.com. Never touch main, never force-push, never move or delete a pushed tag (v2.0.0-next.10 stays), never npm publish / dist-tag yourself, never use a token. npm latest stays 1.0.169.
OWNER MAIN RULES: TRUNCATE is forbidden and no content is thrown away with no way back (tests/v2/repo/no-truncate.test.mjs, docs/v2/release/NO-LOSSY-CUT.md). Native install per agent (ADR-0023): every install/update command is the host's own. Profile first. Tests first (red before green); never weaken an assertion; never raise a budget or timeout; DEVIATIONS.md row per behaviour change; no regex as a mechanism; do not re-apply D-HOOK-SYNC-1. Never state a number that is not measured in docs/benchmarks or a CI log you read.`

async function retry(prompt, opts, n = 3) {
  for (let i = 0; i < n; i++) {
    const r = await agent(i ? prompt + '\n\nA previous attempt died on an API error. Check tags and the registry first; continue from what is pushed.' : prompt, i ? { ...opts, label: opts.label + '-retry' + i } : opts)
    if (r) return r
    log(`${opts.label}: no result, retry ${i + 1}`)
  }
  return null
}

phase('Docs')
const docs = await retry(`${rules}
Fresh clone in /private/tmp/cm-v2-ds; delete it before you return.
Role: docs sync. The owner reviews the final wording by hand later; your job is FACTS: every doc must match what the code, the CLIs and the releases do today. Do not rewrite style or marketing text; fix what is wrong, missing or stale.
Scope: README.md, docs/install/*.md (10 hosts + README), docs/v2/release/*.md (NEXT-STATUS, MAIN-ONLY, WINDOWS, NO-LOSSY-CUT), tickets/*.md, docs/v2/DEVIATIONS.md vs docs/v2/impl/DEVIATIONS.md (one place or clearly split), docs/benchmarks/* claims vs their raw data, package.json description/keywords vs README, plugin manifest descriptions, skills text that names tools or commands, doctor check names (D1..D11 incl. D11 shell) where docs list them, CHANGELOG or release notes if the repo has them.
Changes since next.8 to check docs for: D-VT-WINBASH-1 (Windows needs Git for Windows; doctor D11 shell), D-TOML-PARSER-1, D-PKG-META-1 (0 runtime deps, Node >=24.15.0), D-NI-DOCS-REF-2 (release ref + "Already installed from GitHub?" switch), D-CKPT-LAT-1, D-NO-TRUNCATE-1, D-NO-LOSSY-CUT-1/-2 (doctor report over 4096 B is indexed, ctx_search pointer), D-DOC-D3-ROOT-1, D-MO-1/2/3 (main-only one-click release, context7 subfolder plugins/claude-code for Claude, Codex, Gemini, Qwen), D-CI-* rows. Also: Gemini and Qwen update commands ask Y/n — say so on their pages. The "After v2 is on main:" lines must match the context7 layout (MAIN-ONLY.md).
Method: for each doc claim about a command, flag, path, version, tool name or number, check it against the code (grep), the installed CLI --help (claude, codex, gemini, qwen if installed) or the raw data; write a table docs/v2/review/DOCS-SYNC-2026-10-28.md (file:line, claim, evidence, action). Fix what is wrong. Keep build/check-install-docs.mjs and tests/v2/repo/* green; if a doc fact has no test and can drift (e.g. doctor check list, Node minimum, host list), add a red-first test that reads it from the code constant.
List anything you could not verify, and wording questions for the owner, at the end of the table (do not decide marketing text).
node --test tests/v2/ 0 fail before the last push; ci.yml on your head green. Return done, commits, numbers (claims checked, fixed, unverified), summary.`, { label: 'ds-docs', phase: 'Docs', schema: RESULT, ...SNH })

phase('Release')
const rel = await retry(`${rules}
Fresh clone in /private/tmp/cm-v2-ds-rel; delete it before you return.
Role: ship finished work (owner rule: ship finished work at once; owner approved npm next releases).
1. WAIT (poll every 10 min, up to 8 h) until the release-next10-fix job is finished: its journal ${J}/wf_592abcba-f42/journal.jsonl has a "type":"result" line for n10-rel (or n10-rel-retryN), or for n10-fix with done=false (then that job will not release). Then wait until origin v2-design has no new commit for 15 minutes.
2. Read the raw registry JSON (https://registry.npmjs.org/context-mode): the current next version and its gitHead. If git diff --stat <that gitHead>..origin/v2-design touches src/, build/, scripts/release/, hooks or skills (a product change), a release is due; docs-only or tests-only changes: return published=false, reason "nothing to ship".
3. N = highest 2.0.0-next.N in the registry and origin tags plus 1 (never reuse an existing tag, published or not). Fresh clone: npm install --no-package-lock, node build/build.mjs --generated-only, node --test tests/v2/ (0 fail), node scripts/gate.mjs --all, build/check-install-docs.mjs, build/check-secrets.mjs. Red: fix the root cause test-first, push, max 2 rounds.
4. ci.yml on the head green on ALL jobs incl. macOS and the windows hosts matrix on 3 OS (up to 120 min; one rerun --failed only for a registry or timing failure you can show from the log). Check the v2.* tag path in release.yml still publishes to npm next and moves the release branch.
5. git tag -a v2.0.0-next.N -m v2.0.0-next.N <green head>; push only that tag; watch release.yml (up to 120 min). If its ci job fails in a test that passed in ci.yml on the same commit: read the log, find the cause; one rerun only if it is registry/timing.
6. Verify the raw registry: next = new version, latest 1.0.169, provenance; GitHub prerelease; v1.0.169 still Latest; release branch marketplace.json shows it. Update docs/v2/release/NEXT-STATUS.md and append one line to docs/v2/review/RESUME-2026-10-28.md. Commit, push.
Return published, version, failingStep, logLines, summary.`, { label: 'ds-rel', phase: 'Release', schema: REL, ...SNH })

return { docs, rel }
