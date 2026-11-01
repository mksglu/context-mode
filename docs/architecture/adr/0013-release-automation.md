# ADR-0013: Maximum release automation: one `/release` command

- Status: Accepted r2 (2026-10-14). Owner: releases are frequent; no SSH signing; one local skill does the release; workflows may go to `main`.
- Evidence: workflow `wf_8bf44d89-dc5`, topic `release-automation`: 16 findings verified, 5 unverified, 1 refuted. Raw output: `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/round5-evidence.json`.

## Today (v1)

- 5 workflows. Only `bundle.yml` and `update-stats.yml` push to the repo.
- The release itself is a manual runbook in the ops skill: `npm version`, push tags, `gh release create`, `npm publish`, branch sync, issue comments, Discord.

## Facts that shape the design

| Fact | Consequence |
|---|---|
| A push or tag made with `GITHUB_TOKEN` starts no other workflow; `workflow_dispatch` is the exception | build, publish and smoke must be jobs of **one** run |
| A push made by the owner does start workflows | the owner's signed tag can be the trigger |
| `claude plugin marketplace add` + `install` and `claude plugin validate` work in a clean HOME with no login | a keyless install smoke test can run in CI. It needs the npm package `@anthropic-ai/claude-code`; the npm package named `claude` is not Claude Code |
| `codex plugin marketplace add owner/repo@ref` also works with no login | same, for Codex |
| release-please and changesets assume an npm package or a manifest at the branch tip | they do not fit a `release` branch that holds only build output. A dependency-free script of about 50 lines is used instead |
| Pull requests are already disabled on the repo | no PR workflows and no Dependabot PRs |
| GitHub disables scheduled workflows after 60 days with no repo activity | the daily `readme-stats.yml` commit keeps the schedules alive [U] |

## Design

### The owner's one act per release

Type `/release` in Claude Code (repo skill `.claude/skills/release/SKILL.md`). Starting the skill is the approval. It runs the tests, the live harness (or `skip-live`), shows the version and notes, then starts `release.yml` with `gh workflow run` and watches it. No signed tag, no approval click.

### `release.yml` (on `v2`)

Trigger: `workflow_dispatch` only (input `sha`, or `mode: rollback`). The `/release` skill starts it; `workflow_dispatch` runs even when started from a token.

`release.yml` runs under a concurrency group (one key, e.g. `release`), so two `/release` runs can never race the same `release` branch ref. `publish` writes its commit to a **staging ref** (`release-staging`) first; `smoke` tests installs from that staging ref; only after smoke passes does `publish` fast-forward `release` to the staging commit. A failed smoke run leaves `release` untouched — users never see a broken build.

| Job | What it does |
|---|---|
| ci | GP1–GP11 on macOS, Linux and Windows (reuses `ci.yml`) |
| plan | `scripts/release/plan.mjs`: next version from Conventional Commits since the `Source-Commit:` trailer of the current `release` head (`!` → major, `feat` → minor, `fix`/`perf` → patch); release notes with `git-cliff` |
| build | bundles, every manifest generated from `adapters/table.ts`, 3 skills, the ADR-0019 D1 `package.json` and `cli.mjs`; checks the tree; `claude plugin validate`; `SHA256SUMS`; build provenance attestation |
| publish (stage) | commit to `release-staging` with the `Source-Commit:` trailer, tag `v2.x.y` as a draft |
| smoke | clean-HOME installs from `@release-staging`: Claude Code plugin install, Codex `config.toml` install + MCP handshake, Gemini extension (if the CLI installs) |
| publish (promote) | only on smoke success: fast-forward `release` to the `release-staging` commit, publish the GitHub Release with the notes and `SHA256SUMS` |
| publish-npm | (ADR-0019 D2, decided by PO on delegation, owner reviews in the morning) after promote, so the git tag exists first. Cloud runner, `environment: npm-publish`, `permissions: id-token: write`, npm >= 11.5.1, trusted publishing (OIDC), no npm token. Runs `check-npm-tarball.mjs` (`npm pack`; file list and hashes equal `SHA256SUMS`; `npm pkg fix` changes nothing), then `npm publish --provenance --tag next`. Skips if `npm view context-mode@<version>` exists, so a rerun is safe. Never sets `latest`. Owner step O1 (trusted publisher on npmjs.com) must be done first |

### Other workflows

On `main` (one owner-approved commit; `package.json` is not touched):
- `weekly.yml`: install smoke from `@release`, a check that repo settings have not drifted, `npm audit` of a v2 checkout
- removed at the same time: `bundle.yml`, `update-stats.yml`, `openclaw-e2e.yml`, `tier2-e2e-smoke.yml`

On `v2`:
- `ci.yml` on every push

### Done by hand, once

- create the `v2` branch
- the marketplace `ref: "release"` switch (G22 b, one approval)
- ~~`npm deprecate` with the owner's OTP~~ removed (ADR-0019 D2): v2 is published on npm by `publish-npm`. Still by hand: O1 (trusted publisher on npmjs.com) and moving `latest` from v1 to v2 (one approval).

## Decided 2026-10-14

- Releases are frequent, so there is no per-release live-test gate in CI. The skill runs the live harness by default; `skip-live` is allowed and is written into the release notes.
- `weekly.yml` goes to `main` (owner: "main'e ekleyelim").
- No signed tags, no `release` environment approval.

## r3 decision (2026-10-14, `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/review/DECISIONS-r3.md`)

- Q14: branch protection on `main`. The protection rule is set once by a checked-in script, `scripts/release/branch-protection.mjs`, run by hand with a repo-admin token (not CI — changing protection rules needs a human with admin rights). It calls `gh api repos/$REPO/branches/main/protection -X PUT` with:

  ```json
  {
    "required_status_checks": { "strict": true, "contexts": ["ci"] },
    "enforce_admins": true,
    "required_pull_request_reviews": null,
    "restrictions": null,
    "allow_force_pushes": false,
    "allow_deletions": false
  }
  ```

  (no required PR review, since pull requests are disabled on the repo; the push protection is what keeps `main` frozen).
- ADR-0017: `/release` runs the full live set on Sonnet low, incl. the v1-migration cases.

## Trust boundary (dev-time npm install)

`SKILL.md`'s step 2 runs `npm install` for the dev toolchain only (lint, build, tests) — this is separate from the no-install-time-npm rule, which covers how v2 is *installed by users* (no dependencies, no install scripts; ADR-0019), not how the repo's own dev dependencies are managed. The release skill does not run `npm audit` on every release: dev dependencies are not shipped (the `build` job ships bundles and a `package.json` with no `dependencies`), so a dev-dependency CVE cannot reach an installed user. `weekly.yml` already runs `npm audit` of a v2 checkout on `main` on a schedule; that is where dependency drift is caught, not in the release's trust boundary.

## Amendment 2026-10-22 (ADR-0019)

Job `publish-npm` added to `release.yml`; the build writes `package.json` and `cli.mjs` before `SHA256SUMS`. The "no `package.json`" rule in the build row no longer holds (decided by PO on delegation, owner reviews in the morning).

## Changes

r4 fix pass (A2, A45, A70, B56): smoke job now installs Codex via `config.toml` + handshake instead of a non-existent marketplace command; added the concurrency group and the staging-ref publish/smoke/promote flow; added the branch-protection script and its exact settings block; added the explicit trust-boundary statement for the dev-time `npm install`.
