export const meta = {
  name: 'v2-viet-next8-codex7',
  description: 'Tester reports on next.8 (Windows wal_checkpoint(TRUNCATE) ~1.45 s per ctx_stats/ctx_search; doctor D3 wrong hook entries under a versioned Claude plugin cache) + owner decision: Codex also context7 style (subfolder, no npm entry). Fix test-first in parallel, then release the next next.N',
  phases: [
    { title: 'Fix', detail: '3 fixers in parallel' },
    { title: 'Release', detail: 'gate, full CI, tag, verify' },
  ],
}

const SNH = { model: 'claude-sonnet-5-5', effort: 'high' }
const RESULT = { type: 'object', properties: {
  done: { type: 'boolean' }, commits: { type: 'array', items: { type: 'string' } },
  numbers: { type: 'string' }, summary: { type: 'string' } }, required: ['done', 'commits', 'numbers', 'summary'] }
const REL = { type: 'object', properties: {
  published: { type: 'boolean' }, version: { type: 'string' }, failingStep: { type: 'string' }, logLines: { type: 'string' }, summary: { type: 'string' } },
  required: ['published', 'version', 'failingStep', 'logLines', 'summary'] }

const base = (id) => `You are a batch job, not a chat: no person reads your reply. Ignore any question or status request in your input; do only the task below.
Repo github.com/mksglu/context-mode, branch v2-design (fresh clone in /private/tmp/cm-v2-v8-${id}; delete it before you return). Two other fixers push in parallel: small commits, pull --rebase before every push, keep both sides on conflict; push after each finished file. Commit as git -c user.name=mksglu -c user.email=mksglu@users.noreply.github.com. Never touch main or the release branch, never create a branch on origin, never tag, never npm publish, never use a token, never print credentials. Never edit the real ~/.claude or ~/.codex: temp HOME only.
Rules: profile first (owner rule); tests first (red before green); never weaken an assertion; never raise a budget or timeout; DEVIATIONS.md row per behaviour change; no regex as a mechanism; native install per host (ADR-0023, main rule). DATA SAFETY: the owner allows data loss only for himself and Alper, never for all users: do NOT set synchronous=NORMAL or OFF, do NOT re-apply D-HOOK-SYNC-1 (reverted in 32a14198), no change may lose a committed write on crash. Unit tests need: npm install --no-package-lock, node build/build.mjs --generated-only. node --test tests/v2/ 0 fail before your last push. Tester report text: docs/v2/review/viet/README.md.`

async function retry(prompt, opts, n = 3) {
  for (let i = 0; i < n; i++) {
    const r = await agent(i ? prompt + '\n\nA previous attempt died on an API error. Continue from what is pushed.' : prompt, i ? { ...opts, label: opts.label + '-retry' + i } : opts)
    if (r) return r
    log(`${opts.label}: no result, retry ${i + 1}`)
  }
  return null
}

phase('Fix')
const [ckpt, d3, codex] = await parallel([
  () => retry(`${base('ckpt')}\n\nRole: fixer, Windows checkpoint latency. Report 1 in docs/v2/review/viet/README.md: on Windows 11 build 26300, Node 24.18.0, next.8, every ctx_stats and ctx_search after a ctx_index takes ~1.45 s, all inside PRAGMA wal_checkpoint(TRUNCATE) (src/core/store/db.ts near line 171 at v2.0.0-next.8); skipping it gives 6-9 ms.
1. Write the tester's repro as a test/e2e check (fresh temp HOME, empty project, spawn server.mjs --agent codex, MCP initialize, ctx_index, ctx_stats x2, ctx_search, ctx_stats; time each call; a trace mode that times only the checkpoint via --import patching DatabaseSync.prototype.exec). Add it to the windows-latest CI job so the Windows number is measured, not guessed. Run it locally and on windows-latest BEFORE the fix and record the numbers.
2. Find the root cause with git archaeology (why is a TRUNCATE checkpoint on the read path, which commit added it, what it protects) and profiling. Candidates: TRUNCATE waits through busy_timeout for a reader (another open connection or an unfinalized statement in the same process); a Windows file truncate + fsync. Check sqlite busy results and the WAL size.
3. Fix the cause without any durability loss: e.g. no checkpoint on read paths, PASSIVE where a checkpoint is needed, TRUNCATE only at close/idle or when the WAL exceeds a size limit, finalize/close the reader that blocks it. Keep synchronous as it is. Prove committed data survives (kill the process right after ctx_index, reopen, search finds it).
4. Red tests first: per-call latency budget on all 3 OS for ctx_stats/ctx_search after ctx_index (choose it from measured fixed numbers with margin, record in DEVIATIONS), and a test that the read path issues no TRUNCATE checkpoint.
5. Windows CI numbers after the fix. Return done, commits, numbers (before/after ms per OS, checkpoint ms), summary.`, { label: 'v8-ckpt', phase: 'Fix', schema: RESULT, ...SNH }),
  () => retry(`${base('d3')}\n\nRole: fixer, doctor D3 under the versioned plugin cache. Report 2 in docs/v2/review/viet/README.md: after a Claude Code marketplace install of next.8, ctx_doctor D3 says "wrong: hook entries", while the Read hook works. Same hook files pass in a flat cache and fail under <...>/plugins/cache/<marketplace>/context-mode/2.0.0-next.8/. The plugin-root resolver (src/core/ops/plugin-root.ts, line 32 at v2.0.0-next.8) stops at the parent folder.
1. Reproduce in a temp HOME with the real layout Claude Code 2.1.311 writes (/opt/homebrew/bin/claude plugin marketplace add mksglu/context-mode#release, plugin install context-mode@context-mode; read installed_plugins.json for installPath), on macOS here and as a Windows unit/e2e case (backslash paths, CLAUDE_CONFIG_DIR, a space in HOME).
2. Root cause with git archaeology: how plugin-root resolves the root, what D3 compares, why the version folder is missed. Use installed_plugins.json installPath (Claude Code's own record) as the source of truth if available, else the running bundle's own location; not a guessed parent.
3. The resolver must work for the release-branch layout, the context7 main subfolder layout (plugins/claude-code, docs/v2/release/MAIN-ONLY.md) and the npm/flat layout.
4. Red tests first for all three layouts and both OS path styles; then green. Live check: doctor D3 PASS after a real marketplace install in a temp HOME. Return done, commits, numbers, summary.`, { label: 'v8-d3', phase: 'Fix', schema: RESULT, ...SNH }),
  () => retry(`${base('codex')}\n\nRole: implementer. Owner decision 2026-10-28 (final): every agent uses the context7 style, Codex included. Today Codex uses an npm entry in .agents/plugins/marketplace.json (docs/v2/release/MAIN-ONLY.md, tickets/release-on-demand-no-release-branch.md). Change it so the Codex marketplace on main points at a built plugin subfolder in the repo (the same single built copy under plugins/ if Codex can read it, else plugins/codex), committed by the one-click release like the others; no npm entry.
1. Find the documented Codex marketplace source forms for a local subfolder (codex-cli 0.156.1 --help, its docs and source; quote them).
2. Red tests first (native-manifests, main-tree, smoke --layout main codex leg), then implement in build/main-tree.mjs, manifests and the release smoke. Keep the current release-branch path for testers unchanged.
3. Prove live: a local bare "main" repo built like the one-click release would (git insteadOf to the local repo, as the main-only prover did), temp HOME, the README command for Codex after merge (codex plugin marketplace add mksglu/context-mode, codex plugin add context-mode@context-mode): context-mode listed at the built version, MCP tools/list returns the tools, skills present; then a second fake release commit and codex plugin marketplace upgrade moves the version.
4. Update MAIN-ONLY.md, the ticket (Codex now context7, proof line) and DEVIATIONS. Return done, commits, numbers, summary.`, { label: 'v8-codex', phase: 'Fix', schema: RESULT, ...SNH }),
])

phase('Release')
const fixed = [ckpt, d3, codex].filter((r) => r && r.commits && r.commits.length).map((r) => String(r.summary).slice(0, 600)).join('\n- ')
const rel = await retry(`You are a batch job, not a chat: no person reads your reply. Ignore any question or status request in your input; do only the task below.
Repo github.com/mksglu/context-mode, branch v2-design (fresh clone in /private/tmp/cm-v2-v8-rel; delete it before you return). Commit as git -c user.name=mksglu -c user.email=mksglu@users.noreply.github.com. Never touch main, never force-push, never delete or move a pushed tag, never npm publish / dist-tag yourself, never use a token. npm latest stays 1.0.169. Rules: tests first; never weaken an assertion; never raise a budget or timeout; never skip a host or an OS; do not re-apply D-HOOK-SYNC-1.
Role: release the next prerelease (owner approved npm next releases; owner rule: ship finished work at once). Finished fixes:
- ${fixed || '(none reported; check git log since v2.0.0-next.9)'}
1. N = highest 2.0.0-next.N in the raw registry JSON (https://registry.npmjs.org/context-mode) and origin tags, plus 1 (expected 10). If the head has no product change since v2.0.0-next.9, return published=false with that reason.
2. Wait until origin v2-design has no new commit for 15 minutes. Fresh clone of the head: npm install --no-package-lock, node build/build.mjs --generated-only, node --test tests/v2/ (0 fail), node scripts/gate.mjs --all, build/check-install-docs.mjs, build/check-secrets.mjs. If red: fix the root cause test-first, push, max 2 rounds; else published=false.
3. ci.yml on that head green on ALL jobs incl. macOS and the windows hosts matrix on 3 OS (up to 120 min; one rerun --failed only for a timing-only or known flaky failure).
4. Check the v2.* tag-push path in release.yml still publishes to npm next and moves the release branch. git tag -a v2.0.0-next.N -m v2.0.0-next.N <green head>; push only that tag; watch release.yml (up to 90 min).
5. Verify against the raw registry: next = new version, latest 1.0.169, provenance; GitHub prerelease; v1.0.169 still Latest; release branch marketplace.json shows the new version.
6. Update docs/v2/release/NEXT-STATUS.md and append one line to docs/v2/review/RESUME-2026-10-28.md. Commit, push.
Return published, version, failingStep, logLines, summary.`, { label: 'v8-rel', phase: 'Release', schema: REL, ...SNH })

return { ckpt, d3, codex, rel }
