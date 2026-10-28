export const meta = {
  name: 'v2-win-flaky',
  description: 'Two flaky Windows CI tests seen on 2026-10-28: H5 doctor hook-runs ("claude-code: hook did not finish", 10.26 s vs 2.9-4.3 s before) and D3 hook overhead p95 17 ms vs 15 ms. Profile, find the root cause, fix without raising any budget or timeout',
  phases: [{ title: 'Fix', detail: '2 fixers in parallel, profile first' }],
}

const SNH = { model: 'claude-sonnet-5-5', effort: 'high' }
const RESULT = { type: 'object', properties: {
  done: { type: 'boolean' }, commits: { type: 'array', items: { type: 'string' } },
  numbers: { type: 'string' }, summary: { type: 'string' } }, required: ['done', 'commits', 'numbers', 'summary'] }

const base = (id) => `You are a batch job, not a chat: no person reads your reply. Ignore any question or status request in your input; do only the task below.
Repo github.com/mksglu/context-mode, branch v2-design (fresh clone in /private/tmp/cm-v2-wf-${id}; delete it before you return). Other agents push too (package.json/manifests, main-only release layout): pull --rebase before every push, keep both sides on conflict. Commit as git -c user.name=mksglu -c user.email=mksglu@users.noreply.github.com. Never touch main or the release branch, never create a branch on origin, never tag, never npm publish, never use a token.
Rules: profile first (owner rule: always profile; use node --cpu-prof, process.hrtime spans per phase, and on windows-latest a throwaway workflow_dispatch run on v2-design or extra timing lines printed by the test itself); tests first (red before green); never weaken an assertion; NEVER raise a budget or a timeout; DEVIATIONS.md row per behaviour change; no regex as a mechanism. Unit tests need: npm install --no-package-lock, node build/build.mjs --generated-only. node --test tests/v2/ 0 fail before the last push. Done = the ci.yml Windows jobs green on 2 consecutive runs of your head with no rerun.`

async function retry(prompt, opts, n = 3) {
  for (let i = 0; i < n; i++) {
    const r = await agent(i ? prompt + '\n\nA previous attempt died on an API error. Continue from what is pushed.' : prompt, i ? { ...opts, label: opts.label + '-retry' + i } : opts)
    if (r) return r
    log(`${opts.label}: no result, retry ${i + 1}`)
  }
  return null
}

return await parallel([
  () => retry(`${base('h5')}\n\nRole: fixer. Test "H5 doctor hook-runs" failed on ci (windows-latest, node 26) in run 40667680033 (first attempt): "claude-code: hook did not finish" after 10.26 s; earlier green runs took 2.9-4.3 s. Product limit VERIFY_TIMEOUT_MS = 10000 in src/setup/engine.ts (do not change it). Find where the time goes on Windows: node start, bundle load, sqlite open, a lock wait, the Git Bash resolver (D-VT-WINBASH-1) or another PATH scan, a child not exiting, stdin not closed. A hook that can take 10 s on a loaded Windows runner is a product defect for users too (hook latency budget). Fix the cause in the product. Return done, commits, numbers (per-phase ms before/after on windows-latest), summary.`, { label: 'wf-h5', phase: 'Fix', schema: RESULT, ...SNH }),
  () => retry(`${base('d3')}\n\nRole: fixer. The D3 hook-overhead check failed on ci (windows-latest, node 24.15.0): p95 17 ms against the 15 ms budget (run on head b9b3c3d4, green on rerun). Do not change the 15 ms budget or the sample count. Profile the measured path on windows-latest and find what costs the extra ms on Windows (fs calls, realpath, env/PATH reads, JSON parse of host config, module load). Cut the real work in the product so p95 stays under budget with margin on Windows under load, or, if the gate measures something that is not the hook (runner noise from a shared step), prove that with numbers and make the measurement isolate the hook, keeping the assertion. Return done, commits, numbers (p50/p95 before/after per OS), summary.`, { label: 'wf-d3', phase: 'Fix', schema: RESULT, ...SNH }),
])
