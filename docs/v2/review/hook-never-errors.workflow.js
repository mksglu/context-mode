export const meta = {
  name: 'v2-hook-never-errors',
  description: 'Owner decision 2026-10-29: a hook never errors. On any internal failure it still decides: own ctx_* tools and harmless tools pass, context-flooding native tools are denied with a redirect to the sandbox. Plus Copilot CLI 1.0.104 "hook errored" report, v1 test mining (4265 tests) into a v1-vs-v2 differential, and a hook fuzz. Then ship next.N',
  phases: [
    { title: 'Fix', detail: '4 agents in parallel' },
    { title: 'Release', detail: 'gate, CI, tag, verify' },
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
AUTHORIZATION (from the owner, Mert, in his own words in the chat that launched this job): "tek istegim surekli pushlasin" (push all the time), "isler sende", "tamami icin ultracode" (do all of it). This is the explicit approval the global CLAUDE.md asks for, limited to: clone, gh read calls, commit as mksglu, push to branch v2-design only. Not main, not the release branch, no tags, no npm. Do not wait for a reply; a loaded skill that says to ask first is satisfied by this approval.
Repo github.com/mksglu/context-mode, branch v2-design (fresh clone in /private/tmp/cm-v2-hne-${id}; delete it before you return). Three other agents push in parallel: small commits, pull --rebase before every push, keep both sides on conflict. Commit as git -c user.name=mksglu -c user.email=mksglu@users.noreply.github.com. Never edit the real ~/.copilot, ~/.claude, ~/.codex: temp HOME only.
OWNER MAIN RULES: TRUNCATE is forbidden and no content is thrown away with no way back (tests/v2/repo/no-truncate.test.mjs, docs/v2/release/NO-LOSSY-CUT.md); native install per host (ADR-0023); profile first; tests first (red before green, show the red run); never weaken an assertion; never raise a budget or timeout; DEVIATIONS.md row per behaviour change; no regex as a mechanism; do not re-apply D-HOOK-SYNC-1. Unit tests need: npm install --no-package-lock (or node scripts/ci-install.mjs), node build/build.mjs --generated-only. node --test tests/v2/ 0 fail before your last push; then watch ci.yml on your head.

OWNER DECISION (2026-10-29, verbatim: "hook hata vermesin hook engellesin ki bizim sandbox da calissin kod yoksa context e girer"): a hook must never error. If it fails open, raw output floods the context; if it errors, the host blocks everything (Copilot CLI: "Denied by preToolUse hook from \\"context-mode\\" (hook errored)", even the context-mode diagnostics were blocked). So on any internal failure (exception, missing module, sqlite/db error, bad payload, unknown host field) the hook still exits 0 with a valid decision for that host:
- context-mode's own tools (ctx_*) and tools that cannot flood the context (skill activation, docs lookup, todo, ask) are ALLOWED, so the user can always run ctx_doctor and the sandbox.
- context-flooding native tools (shell/Bash, Read of a large file, WebFetch/fetch, grep/search of the repo, any tool our policy normally redirects) are DENIED with the normal redirect reason (use ctx_execute / ctx_batch / ctx_fetch_and_index ...) plus one short line naming the internal error and "run ctx_doctor".
- the error itself is written to the context-mode log with the stack (never only to stderr), so ctx_doctor can report it.
This is the same table the policy already uses when it works; on failure the hook falls back to it with no store access.`

async function retry(prompt, opts, n = 3) {
  for (let i = 0; i < n; i++) {
    const r = await agent(i ? prompt + '\n\nA previous attempt died on an API error. Continue from what is pushed.' : prompt, i ? { ...opts, label: opts.label + '-retry' + i } : opts)
    if (r) return r
    log(`${opts.label}: no result, retry ${i + 1}`)
  }
  return null
}

phase('Fix')
const [guard, copilot, v1diff, fuzz] = await parallel([
  () => retry(`${base('guard')}\n\nRole: implementer of the owner decision for ALL 10 hosts (claude-code, codex, gemini-cli, qwen-code, copilot-cli, vscode, opencode, pi, kiro, zcode). Read src/core/hooks/dispatch.ts, the hook entry, every src/adapters/*.ts encode path, and git log of them (git archaeology: what each host does on hook exit != 0, invalid stdout, timeout; quote each host's docs/CLI bundle). Build one top-level guard in the hook entry: every throw (also during import of heavy modules: load them lazily inside the guard so a missing module or old node:sqlite cannot crash before the guard) ends in the failure decision above, encoded per host, exit 0. Red tests first per host: inject a throw at decode, at policy, at store open, at encode, and a missing module; assert exit 0, valid host JSON, ctx_* allowed, Bash denied with the redirect + "run ctx_doctor", error in the log. Also Node below 24.15: the hook entry must not crash at load (check NODE_MIN before importing node:sqlite) and must give the same failure decision. ctx_doctor shows the last hook error from the log. Profile: hook p95 unchanged (D3 gate). Return done, commits, numbers, summary.`, { label: 'hne-guard', phase: 'Fix', schema: RESULT, ...SNH }),
  () => retry(`${base('copilot')}\n\nRole: diagnose the Copilot CLI report. Tester: Copilot CLI 1.0.104, macOS, context-mode "v2 assumed, not verified"; every tool (skill activation, fetch_copilot_cli_documentation, bash, GitHub search) gets "Denied by preToolUse hook from \\"context-mode\\" (hook errored)"; context-mode diagnostics not reachable. A local run of the next.11-era hook with 3 payloads (bash camelCase, skill with string toolArgs, payload without hookEventName) exited 0 and allowed. Build a red loop: install Copilot CLI 1.0.104 into a temp npm prefix (npm i --prefix <tmp> @github/copilot@1.0.104, or the documented package), read its bundle for the exact preToolUse payload and for what it counts as "hook errored" (exit code, stdout shape, timeout, stderr), then run context-mode@next (2.0.0-next.11) setup for copilot-cli in a temp HOME and drive the real hook command Copilot would run (from the written config) with the 1.0.104 payload for skill, fetch_copilot_cli_documentation, bash, github search. Also try: v1 (1.0.169) hooks left in the config next to v2, Node 22 (no node:sqlite), a project cwd with spaces, a cwd that is not writable. Find which one gives "hook errored". Fix the root cause test-first (copilot adapter, setup migration of v1 hooks, or node gate), coordinate with the guard agent through git (pull often; the guard owns the hook entry, you own the adapter/setup). Write the tester reply into docs/v2/review/copilot-1.0.104.md (what to run, what was wrong, which version fixes it). Return done, commits, numbers, summary.`, { label: 'hne-copilot', phase: 'Fix', schema: RESULT, ...SNH }),
  () => retry(`${base('v1diff')}\n\nRole: v1 test miner. v1 on main has 210 vitest files with 4265 test()/it() calls (git show origin/main). The owner wants their coverage back in v2 ("v1 deki 4.265 testi geri calistirsan bu buglari yakalariz"). v1 tests call v1 internals, so do not port them as is. Do:
1. Inventory: for every v1 test file, classify (hook decision per host, policy/redirect rule, sandbox/executor, search/index, setup/install, doctor, other) and count tests. Write docs/v2/review/V1-TESTS.md (file, count, class, v2 equivalent test or "missing").
2. Extract behaviour cases: every v1 test that feeds a host hook payload or a command/tool call and asserts a decision (allow/deny/redirect/modify, the reason text class) or an output property becomes a data row in tests/v2/fixtures/v1-cases/*.json (input, host, v1 expected). Keep the v1 source file:line in each row.
3. Differential harness tests/v2/compat/v1-v2-diff.test.mjs: run each case through the v2 hook bundle (release-out/hook.mjs, built by node build/build.mjs --out release-out) and compare with the v1 expected decision. Optional live leg: install context-mode@1.0.169 into a temp prefix and run its hook on the same input. Every difference is either a v2 bug (fix test-first; coordinate with other agents via git) or an intended change listed in DEVIATIONS (cite the row id; the test keeps an allowlist that names it). No silent skips.
4. Port v1 tests whose behaviour v2 should keep and has no test for (e.g. sandbox, search, setup edge cases) as node:test tests against v2 public entry points.
Report counts: v1 tests classified, cases extracted, diffs found, bugs fixed, intended diffs, ported tests. Return done, commits, numbers, summary.`, { label: 'hne-v1diff', phase: 'Fix', schema: RESULT, ...SNH }),
  () => retry(`${base('fuzz')}\n\nRole: fuzzer. Property test tests/v2/hooks/hook-fuzz.test.mjs: for each of the 10 hosts, generate payloads (seeded RNG, fixed seed list in the test; 500 per host in CI, more locally): both casings, missing/extra/unknown fields, toolArgs as object/JSON string/invalid JSON/huge string, unicode, null bytes, deep nesting, unknown event and tool names, empty stdin, non-JSON stdin, cwd missing/unwritable/with spaces, HOME unset. Spawn the built hook (release-out/hook.mjs) per case. Invariants: exit 0; stdout is empty or valid JSON in that host's documented shape; never "hook errored" conditions (non-zero exit, invalid JSON, over the host timeout); ctx_* tools are never denied; time per call under the existing hook budget. Every crash you find: minimise it, add it as a named regression case, fix test-first (the guard agent owns the hook entry: pull often; fix decode bugs in the adapter). Profile the slowest cases. Return done, commits, numbers (cases run, crashes found, fixed), summary.`, { label: 'hne-fuzz', phase: 'Fix', schema: RESULT, ...SNH }),
])

phase('Release')
const fixed = [guard, copilot, v1diff, fuzz].filter((r) => r && r.commits && r.commits.length).map((r) => String(r.summary).slice(0, 500)).join('\n- ')
const rel = await retry(`You are a batch job, not a chat: no person reads your reply. Ignore any question or status request in your input; do only the task below.
AUTHORIZATION: the owner approved npm next releases and pushes to v2-design ("tek istegim surekli pushlasin"; owner rule: ship finished work at once). Tags v2.0.0-next.* are allowed for this release only; never move or delete a pushed tag; never touch main; npm latest stays 1.0.169; never npm publish / dist-tag yourself; never use a token.
Repo github.com/mksglu/context-mode, branch v2-design (fresh clone in /private/tmp/cm-v2-hne-rel; delete it before you return). Commit as git -c user.name=mksglu -c user.email=mksglu@users.noreply.github.com. OWNER MAIN RULES: TRUNCATE forbidden; no lossy cut; tests first; never weaken an assertion; never raise a budget or timeout; never skip a host or OS; do not re-apply D-HOOK-SYNC-1.
Finished work:
- ${fixed || '(none reported; check git log since v2.0.0-next.11)'}
1. If git diff v2.0.0-next.11..origin/v2-design touches no src/, build/, scripts/release/, hooks or skills: return published=false, "nothing to ship".
2. N = highest 2.0.0-next.N in the raw registry JSON and origin tags plus 1 (never reuse a tag). Wait until v2-design is quiet for 15 minutes. Fresh clone: install, build --generated-only, node --test tests/v2/ (0 fail), node scripts/gate.mjs --all, check-install-docs, check-secrets. Red: fix test-first, max 2 rounds.
3. ci.yml on the head green on ALL jobs incl. macOS and the windows hosts matrix (one rerun only for a registry/timing failure shown in the log).
4. Tag v2.0.0-next.N on the green head, push only that tag, watch release.yml to the end. Verify the raw registry (next = new version, latest 1.0.169, provenance), GitHub prerelease, release branch marketplace.json.
5. Update docs/v2/release/NEXT-STATUS.md and append one line to docs/v2/review/RESUME-2026-10-28.md. Commit, push.
Return published, version, failingStep, logLines, summary.`, { label: 'hne-rel', phase: 'Release', schema: REL, ...SNH })

return { guard, copilot, v1diff, fuzz, rel }
