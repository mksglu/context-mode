# ADR-0015: v2 README outline and repo cleanup

- Status: Accepted (2026-10-15). Owner accepted `DECISIONS-r3.md` in full and delegated the r4 fixes in `DECISIONS-r4.md`.
- Evidence: workflow `wf_8bf44d89-dc5`, topics `readme` and `unnecessary-files`. Raw output: `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/round5-evidence.json`. Classifier script: `/tmp/wf5/classify2.js`.

## README (written last, D16)

Target length is about 165 lines, with a CI cap of 200. Written in English.

| # | Section | Lines | Content |
|---|---|---|---|
| 1 | Title, tagline, badges | 7 | 3 badges: npm downloads and stars (both read from `stats.json`, written by `readme-stats.yml`), license. The npm, users, HN and 18 empty logo badges are removed |
| 2 | Callout | 4 | "Install with `npm i -g context-mode && context-mode setup` (ADR-0019; the Claude Code marketplace still uses the git `release` branch). Coming from v1? See Upgrading from v1." |
| 3 | What it does | 12 | the problem in 3 lines, then 3 bullets: sandbox tools, one index per project with search, state after compaction |
| 4 | `## Install` | 28 | Keep this exact heading: ADR-0019 removed the npm deprecate step; v1 reporters still reach the install steps through `#install`. A 10-row table: Agent, Command, Guide. **A row gets a command only after a live install test on that agent passes.** Until then it says "see guide" |
| 5 | Upgrading from v1 | 22 | Steps in ADR-0011 order, done in one sitting. Explains that v1 Codex, Copilot and VS Code hooks call the global binary and fail until `/ctx-upgrade` runs. Includes a v1-feature → v2 table (each removed feature names why and what replaces it) and the exact per-agent rollback command (ADR-0017 R5/R7) |
| 6 | Tools | 13 | 9 rows, one line each, no byte claims |
| 7 | Commands | 7 | `/ctx-stats`, `/ctx-doctor`, `/ctx-upgrade` |
| 8 | How it works | 12 | 4 hooks + MCP; one DB per project; hard deny by size (ADR-0008); state after compaction (ADR-0009) |
| 9 | Benchmarks | 10 | Only numbers re-measured on v2, with a date and an agent version. Otherwise this section is left out |
| 10 | Privacy | 8 | no telemetry and no LLM calls; network use is limited to `git ls-remote` and the agent's own git fetch |
| 11 | Issues, license | ~6 | issues need the `/ctx-doctor` report; no pull requests; Elastic-2.0 |

Moved to `docs/`: `install/<agent>.md` (×10), `upgrading-from-v1.md`, `tools.md`, `how-it-works.md`, `troubleshooting.md`.

## Unnecessary files

Counted on `origin/main` @ `5869f4fa`, as git blob bytes:

| Verdict | Files | Bytes | Share |
|---|---|---|---|
| DELETE | 489 | 10,089,511 | 81.5% |
| MOVE (built into `release` by CI) | 23 | 782,515 | — |
| REWRITE | 83 | 1,496,331 | — |
| KEEP | 4 | 4,328 | — |

What is kept: `LICENSE`, `.gitattributes`, `.github/FUNDING.yml`, `.claude/settings.json`. In total, the v2 source keeps 87 files (1.5 MB).

Target tree addition (2026-10-21): `bench/evidence/` is the owner's benchmark publish pack (README plus `data/*.json`). It stays, and `build/check-removed.mjs` allows every path under it.

Largest items deleted:
- `web/`: 29 files, 4.1 MB, deleted (owner decision)
- `tests/`: 252 files, 3.8 MB. Deleted last, once the GS4 ledger is complete.
- committed `cli.bundle.mjs` (743 KB); `server.bundle.mjs` moves to `release`
- `start.mjs`, `bin/statusline.mjs`, `bun.lock`, `stats.json`, `BENCHMARK.md`, `vitest.config.ts`, `.npmignore`, `.mcp.json*.example`
- removed-agent files (§3.10 of the TECH-SPEC), `.pi/`, `.claude/skills/context-mode-ops`
- 10 v1 skill files; all 10 routing/instruction files under `configs/` (the json/toml files are now generated)
- 57 hand-written hook `.mjs` files, replaced by one built hook entry
- 14 of 15 scripts: heal, postinstall, ctx-debug, version-sync, drift, tier2-smoke, openclaw …
- `src/cli.ts`, `pricing.ts`, `model-prices.json`, `sibling-mcp.ts`, `plugin-cache-integrity.ts` (pending the git-log re-check above), `flood-guard.ts`, and 25 removed-agent adapter files. Call-rate throttling on `ctx_search` is dropped for v2, not replaced: `flood-guard.ts`'s single global counter would re-trip on legitimate fan-out from the 10 concurrent subagents v2 now allows (replaying #769). A GP case must assert N concurrent subagents calling `ctx_search` legitimately is never blocked.
- the v1 `docs/adr/0001-0004`, whose numbers clash with the v2 ADRs, plus the `kimi-code`, `openclaw` and `jetbrains` docs
- workflows: `openclaw-e2e.yml`, `update-stats.yml`, `tier2-e2e-smoke.yml` (uses an API key; replaced by the keyless harness, ADR-0012, not kept — Q15), `bundle.yml`

### Order on `v2`

Nothing changes on `main` without owner approval.

Before deleting any `src/**/*.ts` file (not configs or build artifacts), run `git log --follow -- <file>` and confirm its fix intent is either superseded by a named v2 ADR or genuinely obsolete. `flood-guard.ts` is dropped for v2 (see below); `plugin-cache-integrity.ts`'s doctor-surfaced health check has the same gap pattern and needs the same re-check against ADR-0010 (doctor-and-upgrade) before it is deleted.

0. Replace `ci.yml` first, so that v2 CI no longer runs the v1 vitest suite. If this is skipped, 31 test files break.
1. Removed agents and the ops skill.
2. v1 skills, configs and hooks.
3. Scripts and root files.
4. `package.json` on `v2`: drop the openclaw, omp, pi, bin, files, exports, postinstall, prepublishOnly and version scripts, and the better-sqlite3, @clack/prompts and picocolors dependencies.
5. `tests/`, after the GS4 ledger is complete.

## `web/` (context-mode.com)

Decided 2026-10-14: deleted completely. It is not moved to another repo.

## Changes

r4 fix pass: added the pre-deletion `git log --follow` check for `src/**/*.ts` files, and stated explicitly that `flood-guard.ts`'s throttle is dropped (not replaced) for v2, with the reason and the required GP case.
2026-10-15: status set to Accepted. Folded r3's Q15 into the workflows deletion line and ADR-0017 R5/R7 into README row 5 above; removed the standalone r3 section.
