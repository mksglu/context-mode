# ADR-0023: Native install per agent

- Status: Accepted (owner main rule, 2026-10-27: "every agent uses its own native install command; users must not meet a foreign flow; DX first").
- Supersedes: the install parts of ADR-0019 (section 2 "npm i -g context-mode && context-mode setup" as the one install path, the Plan step that runs host commands for the user, and "The git `release` branch stays, for the Claude Code marketplace only").
- Amends: ADR-0019 (setup becomes fallback and repair), ADR-0020 (hooks and skills still on every agent; the native step carries them where the host can), ADR-0013 (release writes the Claude Code plugin folder).
- Keeps: ADR-0019 npm as the only release channel, one check registry, no instruction files; ADR-0010 doctor as the verifier; ADR-0004 / D11 (never write `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `QWEN.md` or other instruction files).
- Evidence: workflow `docs/v2/review/native-install.workflow.js`, research step (one agent per host, temp HOME and temp npm prefix, real host CLI where it runs without a login). Owner ticket: `tickets/release-on-demand-no-release-branch.md` (update 2026-10-27).

## Context

ADR-0019 made one flow for all agents: `npm i -g context-mode`, then `context-mode setup`. It works, but it is not what users know. A Claude Code user knows `/plugin install`. A Gemini user knows `gemini extensions install`. A Codex user knows `codex plugin add`. A second, foreign tool before the agent's own step adds friction and support load.

npm is the only release channel. The git `release` branch goes away (owner ticket). So a native command that takes an npm package is best. A GitHub source is fine only when it needs no built-files branch.

## Decision

1. **The native command is the main install path.** Each install doc starts with the host's own install command (plugin, extension or package install), copy-paste ready. No `node -e`, no foreign flow first.
2. **The native step carries what the host lets it carry**: MCP server, hooks and the 3 command skills (`ctx-doctor`, `ctx-stats`, `ctx-upgrade`). The package ships the manifest each host reads.
3. **`context-mode setup` becomes the fallback and repair** for the part a host's native step cannot do (for example a hook channel the host does not load from a plugin, or a stale plugin copy). It keeps all ADR-0019 rules: consent, backup, allow-listed files, byte-exact `--remove`, idempotent.
4. **`context-mode doctor` stays the verifier.** It checks MCP, hooks (registered, runs, seen) and skills per agent, whatever installed them. On FAIL it names the one fix: the native command, or `context-mode setup --agents <id>` for the gap.
5. **No instruction files**, on any path. Native manifests must not set a context file (for example Gemini `contextFileName`) and must not put an instruction file at the extension root.
6. **Versions stay in sync.** Every manifest with a `version` (`package.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `.codex-plugin/plugin.json`, `gemini-extension.json`, ...) is written by the version script from one value. Host update commands compare it.

### Claude Code (owner decision, 2026-10-27)

Owner decision for Claude Code (`tickets/release-on-demand-no-release-branch.md`, update 2026-10-27, follows vercel/vercel-plugin and upstash/context7):

- When v2 is on `main`, the marketplace lives on `main` (`.claude-plugin/marketplace.json`) and points at a plugin subfolder (for example `./plugins/claude-code`) that holds the built files.
- Only the release workflow writes that folder, in the release commit. So `main` serves the last released build.
- Users run:
  ```
  /plugin marketplace add mksglu/context-mode
  /plugin install context-mode@context-mode
  ```
  In a shell: `claude plugin marketplace add mksglu/context-mode` then `claude plugin install context-mode@context-mode`.
- The `release` branch is removed then.
- Until then, `#release` is the temporary source for testing `next`: `/plugin marketplace add mksglu/context-mode#release`.
- `claude plugin install <pkg>@npm` is disabled for the account (`npm_marketplace_disabled`, Claude Code 2.1.310). We do not depend on it.

## Per agent

"Ships" is what the package or repo must hold for the native step. "Gap" is what the native step cannot do; `context-mode setup` covers it, and `doctor` checks it.

| Agent | Native command | Source | Update command | Ships | Gap |
|---|---|---|---|---|---|
| claude-code | `/plugin marketplace add mksglu/context-mode` then `/plugin install context-mode@context-mode` (shell: `claude plugin marketplace add ...`, `claude plugin install ...`) | GitHub repo `main`; marketplace entry source `./plugins/claude-code` (built by release). Until v2 is on `main`: `mksglu/context-mode#release` | `claude plugin update context-mode@context-mode` (restart needed), or per-marketplace auto-update in `/plugin` | `.claude-plugin/marketplace.json` (entry name `context-mode`, same as `plugin.json`), `plugins/claude-code/` with `.claude-plugin/plugin.json` (`mcpServers.context-mode`: `node ${CLAUDE_PLUGIN_ROOT}/start.mjs`, `skills`), `hooks/hooks.json`, `skills/`, `start.mjs`, bundles | Two steps, not one. `<pkg>@npm` gated (`npm_marketplace_disabled`). Plugin trust prompt and restart after update stay. Proven: local-path marketplace installed 6 hooks, 1 MCP server, 8 skills. GitHub-source install not yet run. |
| codex | `codex plugin marketplace add mksglu/context-mode` then `codex plugin add context-mode@context-mode` | GitHub repo `main` holding `.agents/plugins/marketplace.json` with a local entry `{"source":"local","path":"./plugins/claude-code"}` pointing at the built plugin subfolder the release commit holds (owner decision 2026-10-28, context7 style; proven live, codex-cli 0.156.1, see MAIN-ONLY.md and D-MO-3). Superseded: the npm entry. No built-files branch needed. | `codex plugin marketplace upgrade context-mode` (Git marketplaces only; the plugin version changes when the release commit on `main` changes) | `.agents/plugins/marketplace.json` on `main` (version written by the version script), `.codex-plugin/plugin.json`, `.codex-plugin/mcp.json` (`CONTEXT_MODE_PLATFORM=codex`), `.codex-plugin/hooks.json` (`${PLUGIN_ROOT}/hooks/codex/*.mjs`), `skills/` in the npm tarball | Hooks from a plugin stay inactive until the user trusts them in the Codex TUI (one in-app step; exact UI path not confirmed). `${PLUGIN_ROOT}` expansion proven live in a hook command on codex-cli 0.156.1 with a root path holding a space (`codex app-server` hooks/list shows the expanded, still-quoted command); MCP args are NOT expanded (literal), so the server entry stays cwd "." with a relative path (cwd "." proven to be the plugin root). Not run on a Windows host (W-CODEX-7). Two steps. |
| gemini | `gemini extensions install https://github.com/mksglu/context-mode` | GitHub repo URL or local path only; no npm source (Gemini CLI 0.65.0). Extension root = repo root on `main`. | `gemini extensions update context-mode` (or `--all`, or install with `--auto-update`) | `gemini-extension.json` at the root (`name`, `version`, `mcpServers.context-mode` with `${extensionPath}`, no `contextFileName`), `hooks/hooks.json` in Gemini shape (BeforeTool, AfterTool, AfterModel, PreCompress, SessionStart, commands `node ${extensionPath}/hooks/gemini-cli/*.mjs`), `skills/`, GitHub topic `gemini-cli-extension` | The source is git, not npm: `main` must hold the built files Gemini runs. `${extensionPath}` inside `hooks/hooks.json` not proven by a hook run. `hooks/hooks.json` is shared with the Claude Code plugin root; the Claude Code subfolder removes that clash. Trust prompt on install. |
| qwen | `qwen extensions install https://github.com/mksglu/context-mode:context-mode` | GitHub repo (today `--ref release`); fallback: `qwen extensions link <pkg dir>` by setup | `qwen extensions update context-mode` | Extension manifest and hooks as for Gemini, at the source root | Research result did not reach this step. Must confirm a source with no `release` ref, and whether an npm source exists. |
| pi | `pi install npm:context-mode` | npm package | `pi update --extensions` | Pi package entry (in-process hooks, skills) in the npm tarball | Research result did not reach this step. Must confirm on the current Pi version. |
| opencode | add `context-mode` to the `plugin` list in `opencode.json` | npm package name (OpenCode plugin list) | OpenCode fetches the plugin package again | `opencode/plugin.js` (in-process hooks) in the npm tarball | Research result did not reach this step. MCP entry may still need setup. |
| copilot-cli | not decided | not decided | not decided | MCP config, hooks, skills | Research result did not reach this step. Today only `context-mode setup` installs it. |
| vscode | not decided | not decided | not decided | MCP config, hooks, skills | Research result did not reach this step. Today only `context-mode setup` installs it. |
| kiro | not decided | not decided | not decided | MCP config, hooks, skills | Research result did not reach this step. Today only `context-mode setup` installs it. |
| zcode | not decided | not decided | not decided | MCP config, hooks, skills | Research result did not reach this step. Today only `context-mode setup` installs it. |

Rows marked "Research result did not reach this step" come from `docs/install/*.md` and ADR-0019 as they stand; the research input for this step was cut at 14,000 characters after the gemini row. Step 2 of the workflow must confirm each such row with the host CLI before it ships a manifest, and update this table.

## What ADR-0019 keeps and loses

| ADR-0019 part | Now |
|---|---|
| `npm i -g context-mode && context-mode setup` as the install for every agent | Fallback only, for hosts with no native step and for repair |
| Setup runs the host commands (`claude plugin install`, `gemini extensions link`, ...) | The user runs the native command; setup only fills the gap or repairs |
| `release` branch kept for the Claude Code marketplace | Temporary, until v2 is on `main`; then removed |
| Gemini and Qwen link the npm package dir | Fallback; native install from the GitHub repo is the main path |
| One check registry, doctor checks, no instruction files, backups and rollback | Kept |
| npm is the only release channel | Kept |

## Consequences

- Install docs open with the native command, then the native update command, then `context-mode doctor`.
- `build/check-install-docs.mjs` must allow each host's native command and still ban `node -e` and user paths.
- The release workflow writes `plugins/claude-code/` in the release commit on `main`, and the version script writes every manifest version.
- Gemini (and maybe Qwen) read built files from git. With no `release` branch, `main` must hold them; the release commit writes them, the same as the Claude Code folder.
- Gaps (Codex hook trust, two-step marketplaces, trust prompts, restarts) are host limits. Doctor reports each one with its fix line; no doc hides them.
