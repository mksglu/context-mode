# ADR-0011: Branches, release, v1 user transition, v1 cleanup, metrics

- Status: Accepted for the order (G22, 2026-10-14). Each outward step still needs its own approval. Agents marked "test first" are open.
- Decided by the owner on 2026-10-14: branch `v2` (not `next`); no data migration.
- Evidence: workflow `wf_98d74014-ea1`, topics `release` and `v1-settings`. Raw output: `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/round3-evidence.json`.

## Branches

| Branch | Content |
|---|---|
| `main` | v1, frozen. `package.json` stays at the last v1 version |
| `v2` | development. CI runs on `[main, v2]` (today `ci.yml:5-8` says `next`) |
| `release` | **built output only**: bundles, generated manifests, skills. One `package.json` in the ADR-0019 D1 shape (no `dependencies`, no `scripts`, so the npm run that Pi starts when it sees the file does nothing). Every release is a new commit with a higher `version` in `plugin.json` / `.codex-plugin/plugin.json`. Codex and Pi see only new commits, not tags; Claude Code keeps a cached copy unless the version changes |

Why `main` stays frozen: v1 `/ctx-upgrade` clones `main` and compares the `package.json` version (`cli.ts:1308-1321`). If the versions are equal, it prints "Already on latest" and builds nothing. So v1 users cannot be broken by v2 work.

When v2 is released, `main` gets the v2 source (docs, README) but keeps the frozen v1 `package.json`. v1 `/ctx-upgrade` then still does nothing.

## Release steps

Every outward step needs its own approval.

0. **CI release job** (on `v2`, triggered by tag `v2.*` or by hand):
   - build
   - `git switch --orphan release` the first time, later fetch `release`
   - copy the build output, commit `release vX.Y.Z`, push
   - `bundle.yml` stops committing bundles to `main`
1. **a) Version bump:**
   - set `"version": "2.0.0"` in `.claude-plugin/plugin.json` and `.codex-plugin/plugin.json` on `release`
   - do not set a version in the marketplace entry (v1 sets it in both places)
2. **b) Marketplace ref.** On `main`, edit only `.claude-plugin/marketplace.json` `plugins[0]`:
   - set `"source": {"source":"github","repo":"mksglu/context-mode","ref":"release"}`
   - remove its `version`
   - run `claude plugin validate .`
   - test in a clean HOME: `claude plugin marketplace add mksglu/context-mode`, then `claude plugin install context-mode@context-mode`
3. **c) Docs and release note**, with the exact update commands:

| Agent | Command |
|---|---|
| Claude Code | `claude plugin marketplace update context-mode && claude plugin update context-mode@context-mode` (auto-update is off by default for third-party marketplaces) |
| Codex | re-write `config.toml`'s `[mcp_servers.context-mode*]` block to the v2 entry, then restart Codex to pick it up (Codex has no marketplace-upgrade command for a git-sourced plugin; the config.toml rewrite is `ctx_upgrade`'s step 4, same as every other config-rewrite agent) |
| Gemini / Qwen | remove the v1 MCP entry, then `gemini extensions install https://github.com/mksglu/context-mode --ref release --auto-update` (Qwen: same form) |
| Pi | `pi install git:github.com/mksglu/context-mode@release` (source only, test first) |
| OpenCode 2 | remove the bare npm spec (`"context-mode"`) from `.plugin[]`, then add the v2 git spec: `"git+https://github.com/mksglu/context-mode.git#release"` (git spec kept for the OpenCode plugin path; `context-mode setup` writes the MCP entry, ADR-0019; test first) |
| Copilot CLI, VS Code, Kiro, ZCode | test first, then document |
| npm users | `npm uninstall -g context-mode`, then the agent's git install. On first run, `ctx_doctor` lists the v1 leftovers and `ctx_upgrade` removes them |

4. **d) npm: no deprecate (amended 2026-10-22, ADR-0019 D2; decided by PO on delegation, owner reviews in the morning).** The `npm deprecate` step is removed. v2 is published on npm instead, by `release.yml` job `publish-npm` (ADR-0013). Dist-tag plan:
   - `2.0.0` is published with dist-tag `next`. CI never sets `latest`.
   - `latest` stays on v1. Users who run `npx -y context-mode mcp` keep getting v1 until the owner moves `latest` by hand (one approval), only after the v1 compatibility forms (ADR-0019 D4) are built and tested.
   - Test with `npm i -g context-mode@next`. After `latest` moves, `npm i -g context-mode` gives v2.
   - v1 stays installable as `context-mode@1`. Nothing is deprecated, so v1 users are not warned or blocked (rule: v1 users must not give up when v2 ships).
   The git `release` branch stays for git-based installers (Claude Code marketplace). The README and the release note give the two-command install: `npm i -g context-mode && context-mode setup`.

## v1 cleanup (no data migration)

There is one pure `detectV1(agent)` per agent. It returns `{file, path, reason}` and never edits. `ctx_doctor` reports the findings; `ctx_upgrade` removes them.

| Agent | v1 footprint | Rule |
|---|---|---|
| Claude Code | `settings.json` `.hooks.*` inner hooks; `hooks/context-mode-cache-heal.{mjs,sh}` + its SessionStart entry; `~/.claude.json` `.mcpServers["context-mode"]`; data `<configDir>/context-mode/` | Remove an inner hook only when its command contains `context-mode` **and** either a v1 script name or `context-mode hook`. Drop entries left empty. Delete the cache-heal files. A user-added MCP entry or `statusLine` (`context-mode statusline`) is reported with a fix, not removed |
| Codex | `hooks.json` entries (`context-mode hook codex`, `hooks/codex/*.mjs`); `config.toml` `[mcp_servers.context-mode*]`; data `<codexHome>/context-mode/` | Remove the entries and sections. Keep `[features] hooks` |
| Gemini | `~/.gemini/settings.json` `.hooks.*` commands with `context-mode`; data `~/.gemini/context-mode/` | Remove the entries. Delete data **only after a prompt**, because Antigravity shares this dir |
| Qwen | `~/.qwen/settings.json` `.hooks.*`; data `~/.qwen/context-mode/` | Same rule as Claude Code |
| Copilot CLI | whole file `~/.copilot/hooks/context-mode.json`; data `~/.copilot/context-mode/` | Delete the file |
| VS Code | whole file `<project>/.github/hooks/context-mode.json`; data `<project>/.github/context-mode/sessions/` or `~/.vscode/context-mode/sessions/` | Delete the file and the session-data dirs (project scope). `ctx_doctor` also flags a leftover context-mode entry inside `.vscode/mcp.json`, the same way it flags a user-added MCP entry for Claude Code |
| Kiro | `~/.kiro/agents/default.json` `.hooks.*` flat entries; data `~/.kiro/context-mode/` | Kiro's hooks are flat, not nested like Claude Code's — scan the flat `.hooks.*` list for any entry whose command contains `context-mode` **and** either a v1 script name or `context-mode hook`, and flag it; do not reuse Claude Code's nested-inner-hook matcher verbatim |
| Pi | `~/.pi/agent/settings.json` `packages[]` `"npm:context-mode"`; data `~/.pi/context-mode/` | Replace with the git entry. `ctx_doctor`'s D4 check also re-scans `packages[]` for `"npm:context-mode"` **after** the git entry is added, and flags it as a leftover if still present — the git entry alone does not prove the stale npm entry was removed (same "two install trees" failure class as #901) |
| OpenCode | `"context-mode"` in `.plugin[]` of the first config found | Remove the bare npm spec (same id, v1 shape); add the v2 git spec (`git+https://...#release`); `setup` writes the MCP entry instead (ADR-0019) |
| ZCode | `~/.zcode/cli/config.json` and `~/.zcode/cli/hooks.json`, scanned for a context-mode-tagged entry (ZCode reuses the Codex-shaped config path, per #1268) | Remove the entries. (v1 claimed zero footprint here; that was wrong — report, don't claim zero) |
| All | `~/.context-mode/` (v1 content), tmp files `context-mode-*` | Delete |

Facts:
- v1 **never** wrote routing text into user instruction files, and it has no markers. Those files are only reported, never edited.
- Copilot CLI, VS Code, Codex, Gemini and Kiro v1 hooks all call the global `context-mode` bin. After `npm uninstall -g`, these hooks fail until the cleanup runs. The release note says so.
- For every one of those agents, the user must run `ctx_doctor` then `ctx_upgrade` immediately after installing v2 and before using the agent again. This is not optional polish — it is the step that closes the breakage window between the `npm uninstall -g` and the hooks working again.
- Qwen and Gemini have no CLI-native rollback command for this extension install. To roll back, the user manually re-adds the v1 MCP entry: for Gemini, `~/.gemini/settings.json` → `mcpServers.context-mode = {"command": "npx", "args": ["-y", "context-mode", "mcp"]}` (Qwen: same key under `~/.qwen/settings.json`). This is a known limitation, not an automated path; point users at the support runbook.

## Metrics (G23)

- The README badges read `stats.json` (`npm_downloads`, `stars`). The workflow `.github/workflows/readme-stats.yml` writes it each day with `GITHUB_TOKEN` only (D-README-STATS-1). It replaces `update-stats.yml`.
- The repo has no `metrics/` directory (D-REPO-NO-METRICS-1). The live-skip streak is in `e2e/live/skip-streak.json`.

## r3 decision (2026-10-14, `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/review/DECISIONS-r3.md`)

- Q14: `main` is protected by GitHub branch protection.
- ADR-0017 R3: upgrade order is install v2 → `/ctx-upgrade` → `npm uninstall -g` last.

## Amendment 2026-10-22 (ADR-0019)

Step d (npm deprecate) is removed; v2 is published on npm with dist-tag `next` (decided by PO on delegation, owner reviews in the morning). The "no `package.json` on `release`" rule and the "no npm for v2" rows above are superseded by ADR-0019 sections 1 and 2. The "npm users" row in step c is replaced by `npm i -g context-mode@next` then `context-mode setup`.

## Changes

r4 fix pass (A2, A29, A30, A37, A44, B22, B25, B28, B30, B76): Codex update is a config.toml rewrite, not a marketplace command; OpenCode cleanup/upgrade uses remove-npm-spec-then-add-git-spec; Kiro gets its own flat-hooks scan rule; Pi's stale npm `packages[]` entry is flagged even after the git entry is added; VS Code's session-data paths and `.vscode/mcp.json` are covered; ZCode gets a real footprint row instead of "none"; added the Qwen/Gemini manual-rollback note and the Gemini/Kiro hook-breakage fact; added the run-doctor-then-upgrade-immediately step.
