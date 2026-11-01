# Founder decisions, 2026-10-23

Status: decided on the founder's mandate. The founder reviews this file.
Source: the 7 open items the founder listed on 2026-10-23. Table of all open items: `docs/v2/OPEN-ITEMS.md`.

## Items 1 to 5: result

1. **Hook time on macOS and Windows: fixed.** The D3 gate (p95 of hook overhead, budget 15 ms, unchanged) now runs on all 3 OSes. A real Windows Node 24.15.0 miss (16 ms) came from `process.stdin` loading 28 internal modules. `readStdin` now reads fd 0 with async `fs.read`. CI run 40014617348, all 9 jobs pass. Gate values (claude-code / codex): Windows Node 24 8 / 9 ms, Windows Node 26 12 / 11, macOS Node 24 5 / 3, macOS Node 26 6 / 7, ubuntu 5 / 4 and 5 / 3. The first spawn of a new bundle copy costs more (macOS up to 27 ms on CI, Windows 9 to 23 ms); it is printed as "cold" info, never gated. Evidence: commits 5b1be9b5, de660eb5, 456e7cb8, 6d56a48c, a37a2334; DEVIATIONS D-CI-PERF-5 and D-CI-PERF-6.
2. **Kiro SessionStart empty output: not a bug.** The resume line prints once per `session_id`. A repeat id, or a payload with no `session_id`, gives empty stdout and exit 0. A first run prints the line. No `src/` change. Evidence: commit a84ffb2e; tests in `tests/hooks/hook-entry.test.mjs`; e2e `GP3/kiro-sessionstart-prints-once`. Kiro itself was not run (no kiro-cli login).
3. **Gemini resume hint: back.** The hint comes on the first prompt of a session, once, and only when the worktree has Gemini journal rows. Evidence: commit 831368b1; DEVIATIONS D-FU-GCH-2; e2e `GP6/gemini-resume-hint-first-turn-only`.
4. **ADR-0006 live probe: done.** 30 real sessions, Opus 5.5 and Sonnet 5.5, 5 per cell. `ctx_execute` is visible at start (5/5 each), `ctx_search` is deferred (0/5), no over-routing, no under-routing, 10/10 correct per model. Only the "on" arm ran; the "off" comparison stays with GP-LIVE-ROUTING. Evidence: `docs/v2/adr/0006-claude-code-tool-loading.md` (section "Live probe 2026-10-23"), `docs/v2/spikes/adr-0006-probe.md`.
5. **Short tasks cost: partly fixed, not closed.** The prompt cut (instructions 647 to 509 chars, `ctx_execute` 732 to 484 chars) saves about 110 tokens. Fixed cost is still about 800 tokens on the first request. The A/B pass rule (v2 not above before on 6 of 6 tasks) is met on 4 of 6. Pooled change vs plain fell from +40.9 % to +29.5 %, but cold-cache cycles decide that A/B. The gateway benchmark number is +2.2 %. We make no claim of a gain. Evidence: commits c70f1e20, 4470439d; `docs/v2/spikes/fixed-cost.md`; DEVIATIONS D-FU-OI-COST-1. Next step: rerun with `--warmup 1` and n of 8 or more.

## Item 6: owner tenant id in git history

**Decision: do not rewrite `v2-design` history.**

Facts:

- The id is `t_` plus 8 hex digits. It is in rule text of workflow files, from commit 7f320e16 on. It left the tree in commits 0e4c1af9 and 39593282.
- The id names a tenant. It does not grant access. Every gateway admin action needs the admin key. In the gateway repo (read only), `src/security/caller-identity.ts`, function `adminOk`, compares the `x-context-mode-key` header (or `?key=`) with `env.ADMIN_KEY`. It fails closed: with no `ADMIN_KEY` set, nobody is admin. The same file explains why a tenant uuid alone gets no write access to another tenant: only a bearer credential, the admin key, harness traffic or an HMAC-signed session token proves an identity.
- A force-push does not remove the id. GitHub keeps old commits reachable by SHA and in forks and cached views. Other workflows push to this branch now; a force-push could lose their work.

Action taken:

- The tree is clean now.
- New gate `build/check-secrets.mjs`. It fails when a tracked text file holds `t_` plus 8 hex digits as a whole word. It prints path and line, never the match. It runs as a CI step ("No tenant id in tracked files") and in `scripts/gate.mjs` layer 1b. Test: `tests/repo/check-secrets.test.mjs` (4 cases). DEVIATIONS D-FU-OI-TENANT-1. Commit d55d87e2.

If the founder wants the id gone for good: rotate the tenant on the gateway side. This is a founder step and needs the gateway deploy. Do not rewrite history.

## Item 7: npm trusted publisher

**Founder only.** The step needs the npmjs.com login and two-factor. CI holds no token. Everything else is ready:

- Steps: `docs/v2/NPM-OWNER-STEPS.md`.
- Workflow: `.github/workflows/release.yml`, job `publish-npm` (environment `npm-publish`, OIDC, `--provenance`, `--tag next`, never `latest`).
- Tarball gate: `scripts/release/check-npm-tarball.mjs` (tarball must equal `SHA256SUMS`).

The 5 clicks:

1. npmjs.com, sign in as owner, open package `context-mode`, Settings, Trusted Publisher.
2. Pick GitHub Actions. Enter user `mksglu`, repository `context-mode`, workflow file `release.yml`, environment `npm-publish`. Save.
3. Publishing access: "Require two-factor authentication and disallow tokens".
4. Revoke the old automation tokens.
5. GitHub repo Settings, Environments, New environment `npm-publish`, add the owner as required reviewer. No secrets.

Do the first publish within 2 days of click 2, or the config expires.

First command after the clicks (the workflow file must be on the default branch before this works; see OPEN-ITEMS row 10):

```sh
gh workflow run release.yml -f publish=true
```

Approve the `npm-publish` environment when asked. Then check:

```sh
npm view context-mode@2.0.0 dist.attestations
npm view context-mode dist-tags
```

`next` must be 2.0.0. `latest` must stay the v1 version. Moving `latest` is a separate manual step (NPM-OWNER-STEPS section 5).
