# Main-only release: decision per host

Owner decision 2026-10-28 (tickets/release-on-demand-no-release-branch.md): only `main` exists, no `release` branch, no manual step. Merge day = merge `v2-design` into `main`, then one click on Actions > Release > Run workflow. Each host keeps its own install command (ADR-0023).

Checked 2026-10-28 with a temp HOME per probe (never the real home). CLI versions: Claude Code 2.1.311, Codex 0.156.1, Gemini CLI 0.66.0, Qwen Code 0.26.2.

## Decision table

| Host | Install command (unchanged) | Source on `main` | Built files come from | Proof |
|---|---|---|---|---|
| Claude Code | `claude plugin marketplace add mksglu/context-mode`, `claude plugin install context-mode@context-mode` | `.claude-plugin/marketplace.json`, entry source `./plugins/claude-code` (relative subfolder, context7 style) | The release commit on `main` holds `plugins/claude-code/` | Probe: local git marketplace with subfolder source: install ok, then a version bump committed to the marketplace, `claude plugin marketplace update` + `claude plugin update` went 2.0.0-next.8 to 2.0.0-next.9. Docs: https://code.claude.com/docs/en/plugins/marketplace-reference.md (relative path rule: starts with `./`, resolves from the marketplace root). |
| Codex | `codex plugin marketplace add mksglu/context-mode`, `codex plugin add context-mode@context-mode` | `.agents/plugins/marketplace.json` with an npm entry; the workflow writes the version (or the dist-tag `next`) | npm. Nothing built goes to git for Codex. | Probe: npm entry installed the real npm tarball; version `next` (dist-tag) resolved to 2.0.0-next.8 (`codex plugin list`: installed, enabled). Already decided in ADR-0023. |
| Gemini CLI | `gemini extensions install https://github.com/mksglu/context-mode` | Repo root of the tagged release commit: small `gemini-extension.json` and `hooks/hooks.json` that point into `plugins/gemini/` | The release commit on `main` holds `plugins/gemini/` | See "Gemini" below. Subfolder install is not offered by the CLI. |
| Qwen Code | `qwen extensions install mksglu/context-mode:context-mode` (name after the colon = marketplace plugin) | Same `.claude-plugin/marketplace.json` as Claude | The release commit on `main` | See "Qwen" below. One gap: agent flag. |

Why Claude uses the subfolder and not npm: the npm source form is documented and works (probe: `{"source":"npm","package":"context-mode","version":"next"}` installed 2.0.0-next.8, Claude Code 2.1.311, local marketplace). The owner ticket (final update 2026-10-28) says no npm source for the marketplace, and Gemini and Qwen need built files in git anyway, so one mechanism is simpler. Switching Claude to npm later is a one-line change in the manifest generator. Owner: the ticket line "No npm source for the marketplace" is read as Claude only; Codex keeps npm because it is already decided and proven (ADR-0023). Say so if you want Codex on a subfolder too.

## Gemini (0.66.0)

`gemini extensions install --help`: `<source>`, `--ref`, `--auto-update`, `--pre-release`, `--consent`, `--skip-settings`. No subfolder option.
- Extension root = the root of the cloned or downloaded source. Install from a repo without `gemini-extension.json` at the root fails: "Configuration file not found at .../gemini-extension.json" (probe, install from `https://github.com/mksglu/context-mode`).
- Code read (bundle `downloadFromGitHubRelease`): if the repo has a GitHub release, Gemini installs the release, not the branch head. `--pre-release` lists prereleases, else `releases/latest`. It takes a release asset named `<platform>.<arch>.*` or `<platform>.*`, or the only asset; else the tag source tarball (`tarball_url`). Today `latest` is v1.0.169, so a plain install gives v1 until a v2 release is `latest`. That fits the rule: v2 `next` releases are prereleases; Gemini users on `next` use `--pre-release`.
- Consequence: the tag must point at the release commit that holds the built subfolder and the root manifest. Tag on the release commit on `main`: the tag tarball then installs.
- Probe: a root `gemini-extension.json` whose `mcpServers` args use `${extensionPath}${/}plugins/context-mode/server.mjs` installed ("installed successfully and enabled"; files copied with the subfolder). Run-time of the hooks from the subfolder is not proven yet. Step to prove it: smoke gemini on the release commit (existing `smoke.mjs --agent gemini`, tier 2).
- Not proven: the GitHub-release install path against a real v2 release. First `next` release after merge proves it.

## Qwen (0.26.2)

- `qwen extensions install <source>` accepts a GitHub URL, `owner/repo`, a local path, an archive, and `<source>:<plugin>` for a marketplace plugin (probe: `qwen extensions install <dir>:context-mode` converted the Claude plugin from the relative subfolder and installed it).
- If the source holds `.claude-plugin/marketplace.json`, Qwen asks which plugin to install (probe), so it reads the Claude marketplace on `main`. The `:context-mode` suffix avoids the prompt.
- Gap found: the converted plugin keeps the Claude args `--agent claude-code`. Qwen must run with `--agent qwen`. A plugin dir with its own `qwen-extension.json` and no marketplace file installed with `--agent qwen` (probe, archive). Fix to test next: a second marketplace entry whose source is `./plugins/qwen` holding `qwen-extension.json`. Do not ship the Qwen command in docs until a probe shows `--agent qwen` after the install from a marketplace entry.

## Built files on main with zero manual steps

The workflow, as the last step of the one click, makes one commit on `main`: `plugins/*` (generated), the Codex pin, `gemini-extension.json`, root `hooks/hooks.json`, version in `package.json`. Author: github-actions bot. Message: `chore(release): vX.Y.Z`. Tag `vX.Y.Z` (annotated) on that commit. The `Source-Commit:` trailer and `release-staging` go away: the tag range replaces them.

Files that change when the build step is written (for later steps, not done here): `.github/workflows/release.yml`, `scripts/release/plan.mjs` (range = last `v2.*` tag reachable from `main`), `scripts/release/publish.mjs` (`--stage`/`--promote` become `--commit-main`, tag), `scripts/release/rollback.mjs`, `scripts/release/smoke.mjs` (no `--ref release-staging`: smoke runs on a local clone of the built commit by path, proven for Claude and Codex), `src/core/contracts/constants.ts` (`RELEASE_BRANCH`), `build/manifests.ts` (output into `plugins/`).

## One-click release (inputs and order)

Inputs:
- `channel`: `next` (default) or `latest`.
- `confirm_latest`: text; the job `plan` fails unless channel is `latest` and this input equals `latest`.
- `mode`: `release` (default) or `rollback`; `sha` for rollback.
- `dry_run`: plan and build only.

Order (each step needs the one before it):
1. `ci` (reused workflow) on the `main` head.
2. `plan`: version from conventional commits since the last `v2.*` tag on `main` (first release 2.0.0, as now). `next` adds `-next.N`. Notes grouped from the same commits. Reads only; no side effect.
3. `build`: build, `SHA256SUMS`, artifact.
4. `smoke`: Claude and Codex (tier 1), Gemini and Qwen (tier 2), on a local git clone of the built tree.
5. `publish-npm`: dist-tag from `channel` (`next` or `latest`), provenance. First irreversible step, so it is after smoke.
6. `commit-main`: the release commit (above), tag, one push of both with `git push origin main vX.Y.Z`. If `main` moved: rebase the generated paths and retry up to 3 times. A failure after step 5 is a re-run with the same version (`resume`: skip npm if the version exists, check the tarball hash equals `SHA256SUMS`).
7. `github-release`: after step 6, with notes and `SHA256SUMS`. `next` = prerelease and not Latest; `latest` = Latest. Never before npm (D-RN-ORDER-1, run 40496186557).

Why this order, from git history: 6136a9c0 (GitHub release only after npm), 21d8e438/e2bee539 (a pushed tag as version), 7d377219 (last release = newest v2 tag; the same idea now reads tags on `main`), 1dd34d92 (npm only through OIDC and provenance, tag `next`, never `latest` by default).

Rollback (a forward commit, `main` is never reset or force-pushed): `mode=rollback sha=<release commit>` makes a commit that restores the generated paths and the Codex pin from that release commit, no tag; the commit message names the sha. npm: `npm dist-tag add context-mode@<good> next|latest` stays an owner action (needs npm login; the workflow has no token for it by design). Users on Claude: `claude plugin update`; Codex: `codex plugin marketplace upgrade`; Gemini and Qwen: `extensions update`.

## What the ticket still needs from the owner

- Confirm Codex stays on npm (above).
- Confirm that `main` allows the bot push (no branch protection on the release commit, or a bypass for github-actions).

## Built on v2-design (state 2026-10-28)

Done and tested, not yet on `main`: `plan.mjs --main`, `build/main-tree.mjs` (Claude subfolder, Codex npm pin, root Gemini and Qwen manifests), `commit-main.mjs` (release commit, tag, push; rollback), `smoke.mjs --layout main` with a Qwen leg, and the `route` + `main-*` jobs in `release.yml` (DEVIATIONS D-MO-1, D-MO-2). One copy of the built plugin (`plugins/claude-code/`) serves all three hosts; the design's `plugins/gemini/` was dropped for that reason.

## Merge-day checklist

1. Merge `v2-design` into `main` (no other change needed: the dispatch on `main` takes the main path by itself).
2. In repo settings: allow github-actions to push to `main` (branch protection bypass for the bot). Without it `main-commit` fails; npm is already published then, so re-run: the npm step skips an existing version.
3. Actions > Release > Run workflow on `main`, channel `next`. Check: tag `vX-next.N` on `main`, `plugins/claude-code/` on `main`, npm `next`, GitHub prerelease.
4. Probe the installs from a temp HOME: `claude plugin marketplace add mksglu/context-mode`, `codex plugin marketplace add mksglu/context-mode`, `gemini extensions install https://github.com/mksglu/context-mode --pre-release`, `qwen extensions install mksglu/context-mode:context-mode`. Record the Gemini hook run and the Qwen `--agent` result.
5. Delete the `release` and `release-staging` branches. Then delete the old jobs (`plan`, `build`, `publish-*`, `smoke`, `github-release`, `rollback`) and the `route` job from `release.yml`, `publish.mjs --stage/--promote`, `rollback.mjs`, `RELEASE_BRANCH`, and the old-path tests. Update the `/release` skill.
6. Stable: Run workflow with channel `latest` and `confirm_latest` = `latest`.
