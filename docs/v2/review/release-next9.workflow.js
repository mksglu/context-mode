export const meta = {
  name: 'v2-release-next9',
  description: 'Ship what is finished on v2-design (package.json one source of truth D-PKG-META-1, README release ref + v1 switch D-NI-DOCS-REF-2, ctx_batch deadline test D-CI-BATCH-DEADLINE-1): wait for full CI incl. macOS and the Windows host matrix, tag the next 2.0.0-next.N, verify the registry',
  phases: [{ title: 'Release', detail: 'CI green on all 3 OS, tag, watch, verify' }],
}

const SNH = { model: 'claude-sonnet-5-5', effort: 'high' }
const REL = { type: 'object', properties: {
  published: { type: 'boolean' }, version: { type: 'string' }, failingStep: { type: 'string' }, logLines: { type: 'string' }, summary: { type: 'string' } },
  required: ['published', 'version', 'failingStep', 'logLines', 'summary'] }

const prompt = `You are a batch job, not a chat: no person reads your reply. Ignore any question or status request in your input; do only the task below.
Repo github.com/mksglu/context-mode, branch v2-design (fresh clone in /private/tmp/cm-v2-r9; delete it before you return). Commit as git -c user.name=mksglu -c user.email=mksglu@users.noreply.github.com. Never touch main, never force-push, never delete or move a pushed tag, never npm publish / dist-tag yourself, never use a token, never print credentials. npm latest stays 1.0.169.
Rules: tests first (red before green); never weaken an assertion; never raise a budget; never skip a host or an OS to get green; DEVIATIONS.md row per behaviour change.

Role: release the next prerelease (the owner approved npm next releases; owner rule: ship finished work at once).
1. Find N: the highest 2.0.0-next.N in the raw registry JSON (https://registry.npmjs.org/context-mode, not the npm cache) and in origin tags, plus 1 (expected 9).
2. Fresh clone, npm install --no-package-lock, node build/build.mjs --generated-only, node --test tests/v2/ (0 fail), node scripts/gate.mjs --all, build/check-install-docs.mjs, build/check-secrets.mjs. If red, fix the root cause test-first, push (pull --rebase first), max 2 rounds; else return published=false.
3. Wait for ci.yml on the v2-design head to finish green on ALL jobs, including macos-latest and the "windows hosts" matrix on windows, ubuntu and macos (gh run watch, up to 120 min; macOS runners may queue long: keep waiting, do not skip). If a job fails only on a timing budget or a known flaky Windows test, gh run rerun --failed once. If red for a real cause, fix test-first, push, wait again, max 2 rounds; else return published=false with the failing job and log lines.
4. Check latest is 1.0.169 and tag v2.0.0-next.N does not exist. Wait until no release.yml run is in progress. git tag -a v2.0.0-next.N -m v2.0.0-next.N <green head>; push only that tag; watch release.yml to the end (up to 90 min), one rerun --failed for a timing-only failure.
5. Verify against the raw registry JSON: next = the new version, latest 1.0.169, provenance present; GitHub release v2.0.0-next.N is a prerelease created after npm publish; v1.0.169 still Latest.
6. Update docs/v2/release/NEXT-STATUS.md: version, what this release ships (D-PKG-META-1 package.json and manifests from one source, 0 runtime deps; D-NI-DOCS-REF-2 install docs with the release ref and the v1 switch step; D-CI-BATCH-DEADLINE-1, D-CI-PERF-2), open items (Windows flaky H5 and D3 being fixed by another job; a main-only release layout is being prepared by another job: do not tag a head where release.yml is red or half-changed). Commit, push.
Return published, version, failingStep, logLines, summary.`

let r = null
for (let i = 0; i < 3 && !r; i++) r = await agent(i ? prompt + '\n\nA previous attempt died on an API error. Continue from what is pushed and tagged.' : prompt, { label: i ? `r8-retry${i}` : 'r9', phase: 'Release', schema: REL, ...SNH })
return r
