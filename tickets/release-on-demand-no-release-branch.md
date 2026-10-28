# Release on demand from main, drop the `release` branch

Status: decided by the owner, 2026-10-26. Not started.

## Decision
- Fixes land on `main` as soon as they are done. They pile up there.
- A release happens only when the owner says "release". The `/release` skill then runs `release.yml`: tag, build, `npm publish --provenance`, GitHub release.
- npm is the only channel. The git `release` branch goes away after v2 is `latest` on npm.

## Steps
1. Publish `2.0.0-next.1` to npm `next` (the branch can still exist then; v1 is not affected).
2. Probe: Claude Code marketplace with `source: "npm"` and `context-mode@next` in a temp HOME. Pass = plugin installs, hooks fire, skills load, an update arrives.
3. If the probe passes: ADR-0022 supersedes the `release` branch parts of ADR-0002, 0011, 0013, 0019.
   - `ctx_upgrade` (`src/core/ops/release-fetch.ts`) and `doctor` (`src/core/ops/doctor-env.ts`) read npm, not `git ls-remote release`.
   - `scripts/release/plan.mjs` and `publish.mjs` find releases by tags on `main`; no stage/promote branch moves.
   - Drop the Gemini/Qwen git-route install from `docs/install/{gemini,qwen}.md` and `docs/install/README.md`.
   - `gh release create` gets `--prerelease` while the version has `-next`.
4. When v2 is `latest`: delete the `release` branch on origin.
5. If the probe fails: keep the branch for the Claude Code marketplace only; everything else still moves to npm.

## Update 2026-10-27: follow what popular OSS plugins do (owner decision)
Checked on GitHub, each repo's `.claude-plugin/marketplace.json`:
- vercel/vercel-plugin: on `main`, `source: "./"`. Built hook `.mjs` files are in the repo on `main` (tsup output next to `hooks/src`).
- upstash/context7: on `master`, `source: "./plugins/claude/context7"` (a plugin subfolder).
- TanStack/ai, vercel-labs/agent-browser, supabase/agent-skills, cloudflare/skills: on `main`, `source: "./"`.
- oven-sh (Bun): no Claude Code marketplace found.
None of them uses a separate release branch.

Decision: when v2 is on `main`, the Claude Code marketplace lives on `main` and points at a plugin subfolder (context7 style, e.g. `./plugins/claude-code`) that holds the built files. The release workflow writes that folder in the release commit, so `main` serves the last released build. Users run `/plugin marketplace add mksglu/context-mode` and `/plugin install context-mode@context-mode` (native). The `release` branch is removed then.
Until v2 is on `main`, `release` stays as the temporary source for testing `next` (`/plugin marketplace add mksglu/context-mode#release`).

## Update 2026-10-28: only main, everything automatic (owner decision)
- Only `main` exists. No `release` branch, no other long-lived branch.
- Everything is automatic: merge into `main`, then one click (Actions > Release > Run workflow). The workflow picks the version, tags, publishes to npm, writes the GitHub release with notes from the commits, and updates what the marketplaces read. No manual step.
- Prepared now on `v2-design` (v2 is not ready for `main` yet). The `release` branch stays only for testers until merge day, then it is deleted.
- Work: `docs/v2/review/main-only-release.workflow.js`.

- Target (owner, 2026-10-28): merge v2-design into main in about 2 weeks (around 2026-11-11), then one-click release. Until then: next releases from the release branch for testers; owner docs review before the merge.

## Update 2026-10-28: context7 style, final (owner decision)
- The marketplaces on `main` point at a plugin subfolder that holds the built files, like upstash/context7 (`source: "./plugins/claude/context7"`). No npm source for the marketplace.
- The one-click release builds the subfolder and commits it to `main` itself. No manual step.
- Each host keeps its own install command (ADR-0023). Gemini CLI and Qwen Code install from the same repo; if a host cannot read a subfolder, record the evidence and the host's documented alternative here before choosing it.

- v1 is finished (owner, 2026-10-28): no v1 changes go to main before the merge, so main stays at 1.0.169 and the merge has no v1 conflicts.

## Plan 2026-10-28: main-only release (architect), see docs/v2/release/MAIN-ONLY.md
- Claude Code: marketplace on main, `./plugins/claude-code` subfolder (probe: install + update next.8 to next.9, CLI 2.1.311). npm source also works, not chosen.
- Codex: npm entry in `.agents/plugins/marketplace.json` (probe: dist-tag `next` resolved, CLI 0.156.1). Nothing built in git. Owner to confirm.
- Gemini CLI: no subfolder option; root `gemini-extension.json` + `hooks/hooks.json` point into `plugins/gemini/`; tag on the release commit, because a GitHub release makes Gemini install the tag source (code read). Install proven, run of hooks not yet.
- Qwen Code: reads the same Claude marketplace (`:context-mode`); gap: converted plugin runs with `--agent claude-code`. Fix to probe: own entry `./plugins/qwen`.
- One click: inputs channel next|latest (+ confirm_latest), version from commits since last v2 tag on main, build, smoke, npm publish, one release commit + tag on main, GitHub release after. Rollback = forward commit, no reset of main.
- Open for owner: Codex on npm; bot push to main allowed.

## Built 2026-10-28 on v2-design (not on main yet)
- One click path is in `release.yml` (jobs `route`, `main-plan`, `main-build`, `main-smoke`, `main-npm`, `main-commit`, `main-github-release`, `main-rollback`). A dispatch on `main` takes it; tag push and other refs keep the release-branch path until merge day, so testers are not affected.
- Scripts: `plan.mjs --main`, `commit-main.mjs`, `smoke.mjs --layout main`, `build/main-tree.mjs`. Tests are red-first and green; DEVIATIONS D-MO-1, D-MO-2.
- Only branch named in the main path: `main`. Rollback is a forward commit.
- Not proven until the first real run: Gemini hooks from the subfolder, Qwen install from the real repo, bot push to `main`.
- Merge-day checklist: docs/v2/release/MAIN-ONLY.md.
- Still open for owner: Codex stays on npm; allow the bot to push to `main`.
