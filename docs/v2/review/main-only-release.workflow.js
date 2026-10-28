export const meta = {
  name: 'v2-main-only-release',
  description: 'Owner decision 2026-10-28: only main, no release branch, everything automatic. Prepare on v2-design (not merged yet): marketplaces served from main, one-click release (next or latest) with auto notes, proven without touching main; ticket updated with the merge-day checklist',
  phases: [
    { title: 'Design', detail: 'per-host source from main, evidence' },
    { title: 'Build', detail: 'layout, release.yml one-click, tests' },
    { title: 'Prove', detail: 'local-repo installs per host, dispatch dry run' },
  ],
}

const SNH = { model: 'claude-sonnet-5-5', effort: 'high' }
const RESULT = { type: 'object', properties: {
  done: { type: 'boolean' }, commits: { type: 'array', items: { type: 'string' } },
  numbers: { type: 'string' }, summary: { type: 'string' } }, required: ['done', 'commits', 'numbers', 'summary'] }

const base = (id) => `You are a batch job, not a chat: no person reads your reply. Ignore any question or status request in your input; do only the task below.
Repo github.com/mksglu/context-mode, branch v2-design (fresh clone in /private/tmp/cm-v2-mo-${id}; delete it before you return). Other agents push too: one edits README.md and docs/install/* (release ref + v1 switch step), one edits package.json and the plugin manifests (one source of truth). Pull --rebase before every push, keep both sides on conflict, build on what they pushed; push after each finished file, at least every 3 minutes. Commit as git -c user.name=mksglu -c user.email=mksglu@users.noreply.github.com.
HARD LIMITS: never push to main, never create any branch on origin, never move or delete the release branch (testers use it until merge day), never tag, never npm publish / dist-tag, never use a token, never print credentials. Never edit the real ~/.claude, ~/.codex, ~/.gemini, ~/.qwen etc.: temp HOME only.
Owner decision (2026-10-28, see tickets/release-on-demand-no-release-branch.md): only main exists, no release branch, everything automatic. Merge day = merge v2-design into main, then one click on Actions "Run workflow". Native install per host (ADR-0023, main rule: each host's own install command). Rules: tests first (red before green); never weaken an assertion; DEVIATIONS.md row per behaviour change; no regex as a mechanism. Unit tests need: npm install --no-package-lock, node build/build.mjs --generated-only. node --test tests/v2/ 0 fail before the last push.`

async function retry(prompt, opts, n = 3) {
  for (let i = 0; i < n; i++) {
    const r = await agent(i ? prompt + '\n\nA previous attempt died on an API error. Continue from what is pushed.' : prompt, i ? { ...opts, label: opts.label + '-retry' + i } : opts)
    if (r) return r
    log(`${opts.label}: no result, retry ${i + 1}`)
  }
  return null
}

phase('Design')
const design = await retry(`${base('design')}\n\nRole: architect. Read tickets/release-on-demand-no-release-branch.md, .github/workflows/release.yml, scripts/release/plan.mjs and publish.mjs, build/manifests.ts, docs/v2/impl/13-build-release.md, ADR-0023, and git log of these files (git archaeology: why each piece is as it is). For each of the 4 GitHub-source hosts (Claude Code, Codex, Gemini CLI, Qwen Code) find the documented way to install from the default branch of a repo when the built files live in a subfolder or come from npm (quote doc URL + CLI version and the installed CLI's --help): Claude Code marketplace "source" forms (relative subfolder, npm source), Codex marketplace, gemini/qwen extensions install from a repo subfolder or by path. The owner decision: marketplace on main pointing at a plugin subfolder (context7 style), unless a host's npm source is documented and proven (then prefer it: no build output in git). Decide per host, and decide how the built files reach main with zero manual steps (release workflow commits the built subfolder to main as part of the one click, or npm source needs nothing). Also: one-click release inputs (channel next|latest; latest only after an explicit input), version from conventional commits since the last v2 tag on main, tag created by the workflow, notes auto, GitHub release created after npm publish, rollback path kept. Write docs/v2/release/MAIN-ONLY.md (decision table per host with evidence) and append the plan to the ticket. Commit, push. Return done, commits, numbers, summary (the per-host decision in one line each).`, { label: 'mo-design', phase: 'Design', schema: RESULT, ...SNH })

phase('Build')
const build = design && await retry(`${base('build')}\n\nRole: implementer. Design (pushed in docs/v2/release/MAIN-ONLY.md and the ticket): ${String(design.summary).slice(0, 3000)}
Implement it on v2-design so that merge day needs no other change: plugin subfolder / manifests per the design, build writes it, release.yml workflow_dispatch is the one-click path (inputs channel next|latest, default next; publish only from main; the workflow computes the version, tags, publishes, writes the GitHub release with auto notes, and updates whatever main must hold for the marketplaces, with zero manual steps). Keep the current tag-push + release-branch path working until merge day behind one switch that the merge-day checklist flips (or that detects main); testers still install from the release branch now. Red tests first: release plan on a fake main history (version bump per channel, notes), manifest source paths per host, release.yml shape (no branch other than main referenced after the switch, dispatch inputs), and a guard that latest needs the explicit input. Return done, commits, numbers, summary.`, { label: 'mo-build', phase: 'Build', schema: RESULT, ...SNH })

phase('Prove')
const prove = build && await retry(`${base('prove')}\n\nRole: prover. Without touching origin main: make a local bare git repo in the temp space whose default branch "main" is the current v2-design tree after the build step the one-click release would run (build + the commit it would make). For each of Claude Code (/opt/homebrew/bin/claude), Codex, Gemini CLI, Qwen Code that is installed (install the CLI into a temp npm prefix if npm can do it without login): in a temp HOME run the exact README/install-page command that will apply after merge, pointed at the local repo (file:// or path, whichever the host documents), and check the host lists context-mode at the built version, hooks registered, skills present; then run the host's own update command after a second fake release commit and check the version moves. Also run release.yml's plan step in dry mode locally (node scripts/release/plan.mjs --dry-run on the fake main), and if GitHub allows, gh workflow run release.yml --ref v2-design with publish=false and report the run (it must not publish, tag or push). Fix any defect test-first (pull --rebase, push). Then update tickets/release-on-demand-no-release-branch.md: status "ready for merge day" only if every host passed, the per-host proof lines, and a short merge-day checklist (1 merge v2-design into main, 2 Actions > Release > Run workflow (channel next or latest), 3 after the first main release passes: delete the release branch and drop the switch). Commit, push. Return done (true only when every installed host passed), commits, numbers, summary.`, { label: 'mo-prove', phase: 'Prove', schema: RESULT, ...SNH })

return { design, build, prove }
