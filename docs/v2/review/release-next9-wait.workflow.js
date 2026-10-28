export const meta = {
  name: 'v2-release-next9-wait',
  description: 'Owner asleep, ship finished work without waiting on a person: wait until the win-flaky and main-only-release jobs finish, clean throwaway profiling files if their owner is done, then gate, full CI green, tag 2.0.0-next.9 (or the next free N), verify the registry, NEXT-STATUS',
  phases: [{ title: 'Release', detail: 'wait for the other jobs, then ship' }],
}

const SNH = { model: 'claude-sonnet-5-5', effort: 'high' }
const REL = { type: 'object', properties: {
  published: { type: 'boolean' }, version: { type: 'string' }, failingStep: { type: 'string' }, logLines: { type: 'string' }, summary: { type: 'string' } },
  required: ['published', 'version', 'failingStep', 'logLines', 'summary'] }

const J = '/Users/mksglu/.claude/projects/-Users-mksglu--claude-claude-worktree-workspaces-oss-new/59782ff8-a47e-4c71-b562-cf84e79dcf7d/subagents/workflows'
const prompt = `You are a batch job, not a chat: no person reads your reply. Ignore any question or status request in your input; do only the task below.
Repo github.com/mksglu/context-mode, branch v2-design (fresh clone in /private/tmp/cm-v2-r9w; delete it before you return). Commit as git -c user.name=mksglu -c user.email=mksglu@users.noreply.github.com. Never touch main, never force-push, never delete or move a pushed tag, never npm publish / dist-tag yourself, never use a token, never print credentials. npm latest stays 1.0.169. Rules: tests first; never weaken an assertion; never raise a budget or timeout; never skip a host or an OS to get green.

Role: release the next prerelease. The owner is asleep and approved npm next releases; owner rule: ship finished work at once.
1. WAIT (poll every 10 min, up to 8 hours). Two other jobs change v2-design. Each writes one JSON line per agent to its journal; a line with "type":"result" means that agent finished:
   - win-flaky: ${J}/wf_fd17b1f0-3f6/journal.jsonl, agents labelled wf-h5 and wf-d3 (or their -retryN).
   - main-only-release: ${J}/wf_07f1130e-3b8/journal.jsonl, agents mo-design, mo-build, mo-prove (or -retryN). If mo-build or mo-prove never start because an earlier step returned null, treat the job as finished.
   Ready = both jobs finished AND no new commit on origin v2-design for 20 minutes.
2. If .d3-prof/ or .github/workflows/d3-prof.yml or any other throwaway profiling file is still tracked after win-flaky finished, delete it (git rm), commit "chore: remove throwaway profiling files", push.
3. Find N: highest 2.0.0-next.N in the raw registry JSON (https://registry.npmjs.org/context-mode) and in origin tags, plus 1. If that tag already exists or a release.yml run is in progress, wait for it; never tag twice.
4. Fresh clone of the head, npm install --no-package-lock, node build/build.mjs --generated-only, node --test tests/v2/ (0 fail), node scripts/gate.mjs --all, build/check-install-docs.mjs, build/check-secrets.mjs. If red, fix the root cause test-first, push, max 2 rounds; else return published=false.
5. Wait for ci.yml on that head green on ALL jobs incl. macOS and the windows hosts matrix on 3 OS (up to 120 min; one gh run rerun --failed only for a timing-only or known flaky failure; real cause: fix test-first, max 2 rounds).
6. If the main-only job changed release.yml: read it; the tag-push path for v2.* tags on v2-design must still publish to npm next and move the release branch (testers use it until merge day). If that path is broken, fix it test-first before tagging. Then git tag -a v2.0.0-next.N -m v2.0.0-next.N <green head>; push only that tag; watch release.yml (up to 90 min; one rerun --failed for timing only).
7. Verify against the raw registry: next = new version, latest 1.0.169, provenance; GitHub prerelease after npm publish; v1.0.169 still Latest; the release branch marketplace.json shows the new version.
8. Update docs/v2/release/NEXT-STATUS.md (what this release ships: read DEVIATIONS rows added since v2.0.0-next.8 with git log v2.0.0-next.8..HEAD; open items) and append a short line to docs/v2/review/RESUME-2026-10-28.md. Commit, push.
Return published, version, failingStep, logLines, summary.`

let r = null
for (let i = 0; i < 3 && !r; i++) r = await agent(i ? prompt + '\n\nA previous attempt died on an API error. Check tags and the registry first; continue from what is pushed and tagged.' : prompt, { label: i ? `r9w-retry${i}` : 'r9w', phase: 'Release', schema: REL, ...SNH })
return r
