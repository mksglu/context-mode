---
name: release
description: Release context-mode v2 from the v2 branch. Runs the checks and the live test, shows the next version and notes, then starts the release workflow and watches it.
disable-model-invocation: true
---
Release context-mode v2 (ADR-0013). Starting the skill is the approval for this release; the preview in step 6 is for information, not a second approval. Stop and report at the first step that fails; do not retry a failed step with a different method.

1. Check the start state. Run `git branch --show-current` and `git status --porcelain`. The branch must be `v2` and the tree must be clean; if not, stop and report what is dirty. Run `gh auth status` and `git pull --ff-only`.
2. Run the E2E cases: `node e2e/cases/run.mjs`. If a row is `FAIL`, stop and report the failing case ids.
3. Run the v1 KEEP-PASS unit tests (GS4). `npm ci` installs the dev toolchain only (ADR-0013 "Trust boundary"); users never run npm. Then run `npx vitest run`. If one of the 131 tracked tests fails, stop and show its name.
4. Run the live test: `node e2e/live/run.mjs --all` (Sonnet 5, effort low, ADR-0017) and show its table. If a row is `FAIL`, stop. Then update the live-skip streak in `e2e/live/skip-streak.json` (`{ "streak": <n> }`): if the table has one or more `SKIPPED` rows, add 1 to `streak`; if it has none, reset it to 0. If the file changed, commit it on `v2` and push. If `streak` is now `LIVE_SKIP_LIMIT` (3) or more, refuse to continue: report which cases were skipped and the note on each row.
5. v1 migration checkpoint (GS10). The cases `e2e/live/cases/v1-migration-*.json` ran in step 4 (their `covers` paths include `v1-transition`, so `--all` selects them). Do not run them again; confirm each one is `PASS` in the step 4 table, and stop if one is not.
6. Preview. Run `node scripts/release/plan.mjs --dry-run`. Show the owner the next version and the release notes. If it says there is nothing to release, stop.
7. Start the release: `gh workflow run release.yml --ref v2 -f sha=$(git rev-parse HEAD)`.
8. Follow the new run with `gh run watch` and report each job status as it changes. At the end, report in one short table: version, release commit on `release`, GitHub Release URL, live test (passed, or skipped), and the smoke-install result per agent.

`skip-live`: if the owner types `/release skip-live`, skip steps 4 and 5 (the streak file does not change) and in step 6 run `node scripts/release/plan.mjs --dry-run --skip-live`, so the release notes carry the line "Live E2E skipped for this release." Say in the final report that the live test was skipped.

This skill never runs these one-time steps: switching the marketplace to `ref: "release"`, adding workflows to `main`, and `npm deprecate`. Ask the owner about each one separately.
