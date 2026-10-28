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
