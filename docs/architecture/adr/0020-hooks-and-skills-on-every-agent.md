# ADR-0020: Hooks and skills on every agent

- Status: Accepted (owner rule 2026-10-25: "every agent gets hooks, no exception, or saving does not work").
- Amends: ADR-0019 (setup now writes the hook channel and the skill channel for every agent), impl/10 §1.3 (two new required row fields).
- Keeps: ADR-0001 (one defined channel per agent, no runtime fallback), ADR-0004 / D11 (no instruction files), ADR-0016 (deny before replace only where the host has no replace).

## Context

On v2-design (7950da1f) setup wrote hooks for 4 of 10 agents (claude-code, gemini, qwen through their package, pi in process).
Codex, Copilot CLI, VS Code, Kiro, ZCode and OpenCode got the MCP server and no hooks on a fresh HOME
(docs/install/*.md "Writes no hooks" lines). Without hooks, no PostToolUse output reaches the store, so saving does not work.
Skills shipped only where the package dir is the host's plugin dir (claude-code, pi).

## Decision

1. Every `AdapterRow` has two required fields, `hookChannel` and `skillChannel`. The type has no optional form,
   and a CI test fails when a row lacks either one or names an empty path.
2. `context-mode setup` writes both channels for every agent. It writes only allow-listed files, keeps the
   backup and byte-exact rollback, is idempotent, and `--remove` removes both. `--print <id>` prints both steps.
3. `context-mode doctor` checks per agent: hook registered, hook runs (sample event through `hook.mjs`), hook seen
   (a journal row from this agent; none yet is WARN "not seen yet, run one tool call", never PASS), skill present.
4. Dispatch uses the strongest effect the host allows: replace the output where the host has a replace field;
   else deny on PreToolUse and redirect to the ctx tool; else rewrite the input.
5. One channel per agent. No second hook path, no instruction file, no fallback.

## Per agent

Effects: R = replace output, D = deny with reason, W = rewrite input, I = inject context. "Saving" is the effect the
dispatch uses for a large output on that host.

| Agent | Hook channel (setup writes) | Events | Effects | Saving | Skill channel (setup writes) |
|---|---|---|---|---|---|
| claude-code | plugin `hooks/claude-code.json` via `.claude-plugin/plugin.json` `hooks` (marketplace install) | SessionStart, UserPromptSubmit, PreToolUse, PostToolUse | R D W I | R (`updatedToolOutput`) | plugin `skills/<name>/SKILL.md` (shipped in the package) |
| codex | `$CODEX_HOME/hooks.json` (merge, user groups kept) + `[hooks.state."<key>"] trusted_hash` in `config.toml` | SessionStart, UserPromptSubmit, PreToolUse, PostToolUse | D W I (R for MCP tools only) | D + redirect | `$CODEX_HOME/skills/<name>/SKILL.md` |
| gemini | extension `hooks/hooks.json` (linked package dir) | BeforeAgent, BeforeTool, AfterTool, PreCompress | R D I | R (AfterTool `decision: "deny"` + `reason`) | extension `skills/<name>/SKILL.md` (linked package dir) |
| qwen | extension `config.hooks` -> `hooks/qwen.json` (linked package dir) | SessionStart, UserPromptSubmit, PreToolUse, PostToolUse | D I | D + redirect | `~/.qwen/skills/<name>/SKILL.md` |
| copilot-cli | `~/.copilot/hooks/context-mode.json` | sessionStart, userPromptSubmitted, preToolUse, postToolUse | R D I (W via `modifiedArgs`, unverified) | R (postToolUse `modifiedResult`, D-HA-COPILOT-REPLACE-1) | `~/.copilot/skills/<name>/SKILL.md` |
| vscode | `~/.copilot/hooks/context-mode-vscode.json` | SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, PreCompact | D I | D + redirect | `~/.copilot/skills/<name>/SKILL.md` (shared with copilot-cli, one file set) |
| kiro | `~/.kiro/hooks/context-mode.json` | SessionStart, UserPromptSubmit, PreToolUse, PostToolUse | D (exit 2, plain text) I (stdout) | D + redirect | `~/.kiro/skills/<name>/SKILL.md` |
| zcode | `~/.zcode/cli/config.json` `hooks` (merge, `hooks.enabled: true`) | SessionStart, UserPromptSubmit, PreToolUse, PostToolUse | D I | D + redirect | `~/.zcode/skills/<name>/SKILL.md` |
| pi | in process: `pi install <pkgDir>` (package `pi.extensions`) | session_start, input, tool_call, tool_result | R D | R (`tool_result` rewrite) | package `pi.skills` (shipped in the package) |
| opencode | in process: `opencode.json` `plugin` list entry -> `<pkgDir>/opencode/plugin.js` | context, prompt, execute.before, execute.after, compaction | D W | D + redirect | `~/.config/opencode/skills/<name>/SKILL.md` |

Skills are rendered from the single source `skills/` with the agent's own tool name prefix (`toolNamePrefix`).

## Sources

- https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/spike-hooks-verified.md §2 (hook files, shapes, outputs per host).
- Host CLIs installed to a temp prefix on 2026-10-25: claude 2.1.310, codex-cli 0.164.0 (`hooks/list` probe, trust states),
  qwen 0.26.1, gemini-cli, copilot, opencode, pi. Gemini bundle has a `SKILL.md` loader; the OpenCode binary has the
  `{skill,skills}` and `skills/**/SKILL.md` globs.
- code.claude.com/docs/en/hooks, /skills, /plugins-reference (fetched 2026-10-25).

## Open (tests, not exceptions)

- A live logged-in run per agent that shows a hook fire. Until then doctor's "seen" check is WARN on a fresh HOME.
- Skill dirs for qwen, copilot-cli, vscode, kiro and zcode are from host docs and bundles; a live run must list the skill.
- gemini skills ship in the linked extension dir as is, so they name the bare `ctx_stats`, not the host name
  `mcp_context-mode_ctx_stats`. A live gemini session must show which name the model gets before the extension
  skills are rendered per agent (no gemini login on the test machine, 2026-10-26).
- codex and gemini fire proofs (D-HA-CODEX-TRUST-1, D-HA-GEMINI-REPLACE-1) come from `hooks/list` and docs-shaped
  payloads piped into the hook, not from a model turn. Headless path to run: `codex exec --json` with a temp
  CODEX_HOME, and `gemini -p` with a temp HOME, once a login is copied into the temp HOME.

## Consequences

- docs/install/*.md lose the "Writes no hooks" lines; each page names its hook file and skill dir.
- DEVIATIONS.md gets one row per behaviour change (D-HA-*).
