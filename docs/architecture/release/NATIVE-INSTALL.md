# Native install per host (ADR-0023)

Checked 2026-10-25 on macOS arm64, Node 26.8.1, a temp HOME, branch v2-design at ff4cf578.
npm dist-tags at check time: `latest` 1.0.169, `next` 2.0.0-next.5.
The npm name was the source only where the host takes an npm package (pi, opencode). For the other hosts the source was the `npm pack` of `release-out`, unpacked into a folder, because the GitHub source has no built files (see Open items).

| Host | Native install | Update | Verified | Sources |
|---|---|---|---|---|
| claude-code | `claude plugin marketplace add mksglu/context-mode` + `claude plugin install context-mode@context-mode` | `claude plugin update context-mode@context-mode` | Partly. Local packed folder: install OK, `claude mcp list` Connected, 3 skills with one prefix, hooks registered, doctor PASS. No logged-in session. | docs/install/claude-code.md |
| codex | `codex plugin marketplace add mksglu/context-mode` + `codex plugin add context-mode@context-mode` | `codex plugin marketplace upgrade context-mode` | Partly. codex-cli 0.156.1, local packed folder (must be a git repo): plugin installed and enabled, `codex mcp list` enabled, doctor PASS after D-NI-CODEX-DOCTOR-1. No logged-in session. | docs/install/codex.md, DEVIATIONS D-NI-CODEX-DOCTOR-1 |
| gemini | `gemini extensions install https://github.com/mksglu/context-mode` | `gemini extensions update context-mode` | Partly. A large `cat` is not denied before it runs: by design, Gemini has AfterTool replace (D-M7-RR-1). AfterTool with 200 000 B output gave a 140 B answer. | docs/install/gemini.md, DEVIATIONS D-M7-RR-1 |
| qwen | `qwen extensions install https://github.com/mksglu/context-mode:context-mode` | `qwen extensions update context-mode` | Partly. Qwen 0.26.1, local packed folder: extension enabled, MCP Connected, skills, PreToolUse deny on a large `cat`. | docs/install/qwen.md |
| pi | `pi install npm:context-mode@next` | `pi update --extensions` | Pass (live A/B: 185 813 B to 177 B). | docs/install/pi.md |
| opencode | `opencode plugin add context-mode@next` (1.19: `opencode plugin context-mode@next --global`) | `opencode plugin update` (1.19: `opencode plugin context-mode@next --global --force`) | Not yet. 2.0.0-next.5 has no `main`; the next npm release has it (D-NI-OPENCODE-1). | docs/install/opencode.md |
| vscode | none of its own; `npm i -g context-mode@next` + `context-mode setup --agents vscode` | `context-mode upgrade` | Pass (live A/B: 200 101 B to 358 B). | docs/install/vscode.md |
| copilot-cli | none of its own; `npm i -g context-mode@next` + `context-mode setup --agents copilot-cli` | `context-mode upgrade` | Skill prefix fixed (D-N5-SKILL-1, test green). No live run. | docs/install/copilot-cli.md |
| kiro | none of its own; `npm i -g context-mode@next` + `context-mode setup --agents kiro` | `context-mode upgrade` | Skill prefix fixed (D-N5-SKILL-1). CLI not installed here, no live run. | docs/install/kiro.md |
| zcode | none of its own; `npm i -g context-mode@next` + `context-mode setup --agents zcode` | `context-mode upgrade` | Skill prefix fixed (D-N5-SKILL-1). CLI not installed here, no live run. | docs/install/zcode.md |

## Open items

- claude-code, codex, gemini and qwen install from the GitHub repo. The repo root has no built files (no `server.mjs`, `hook.mjs`, hooks). Without a built-files branch these commands cannot work, and npm is the only release channel. Not tested as written. Needs an owner decision.
- `npm ci` fails: the repo has no `package-lock.json`.
- No host was run in a logged-in session that fires the hooks, so doctor `hook-seen` stays a WARN.

Gate: `node scripts/gate.mjs --all --quick` exit 0. `node --test tests/`: 1666 pass, 0 fail, 5 skip.
