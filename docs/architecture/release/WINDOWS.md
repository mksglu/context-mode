# Windows host matrix

Job: `windows hosts` in `.github/workflows/ci.yml`, script `e2e/checks/windows-hosts.mjs`. It runs on windows-latest, ubuntu-latest and macos-latest.
Per OS it packs the build, runs `npm i -g` into a prefix with a space in the path, installs each host CLI that npm can install without login, then for each of the 10 agents (own HOME with a space) runs: setup, doctor, the host's hook payload for a 200 KB shell `cat` through the platform shell, and an MCP initialize + tools/list from the written host config.

Last green windows-latest run: CI run 40590253825 (head c3039618), job `windows hosts (windows-latest)`: 10 agents x 5 steps, 0 fail. ubuntu-latest: green on the same run. macos-latest: see the CI run of the head commit (the macOS runner queue was slow when this file was written).

## Per host

HOME below is `%USERPROFILE%`. Native install is the host's own command (ADR-0023, docs/architecture/release/NATIVE-INSTALL.md). On Windows the matrix path is `npm i -g context-mode` then `context-mode setup --yes --agents <id>`, which runs the host's own install command where the host has one.

| Host | Windows paths setup writes | Native install on Windows | Windows CLI in the matrix | Open items |
|---|---|---|---|---|
| claude-code | `%USERPROFILE%\.claude\plugins\cache\...` (copy the host makes), `%USERPROFILE%\.claude\settings.json` | `claude plugin marketplace add <dir>` + `claude plugin install context-mode@context-mode` (run by setup) | `@anthropic-ai/claude-code` 2.1.312 | No logged-in session; hook-seen stays WARN. |
| codex | `%USERPROFILE%\.codex\config.toml`, `hooks.json`, `skills\` (or `%CODEX_HOME%`) | `codex plugin marketplace add` + `codex plugin add` | `@openai/codex` 0.165.0 | Codex ignores HOME on Windows (Rust `dirs`); the matrix sets CODEX_HOME inside the test HOME (D-WIN-CODEXHOME-E2E-1). A user with a normal profile needs nothing. |
| gemini | `%USERPROFILE%\.gemini\extensions\context-mode`, `settings.json` | `gemini extensions link <dir> --consent` (run by setup; D-INST-1) | `@google/gemini-cli` 0.66.0 | gemini 0.66.0 exits 0xC0000409 after a successful link; setup accepts it only when `extensions list` shows the extension (D-WIN-EXITCRASH-1). Gemini runs hooks through PowerShell (GEM-WIN-5). |
| qwen | `%USERPROFILE%\.qwen\extensions\context-mode`, `settings.json` | `qwen extensions link <dir>` (run by setup; `y` on stdin) | `@qwen-code/qwen-code` 0.26.2 | none |
| copilot-cli | `%USERPROFILE%\.copilot\mcp-config.json`, `hooks\context-mode.json` (or `%COPILOT_HOME%`) | `copilot mcp add context-mode -- <node> <server>` | `@github/copilot` 1.0.104 | none |
| pi | `%USERPROFILE%\.pi\agent\settings.json`, `current` junction under the plugin dir | `pi install <dir>` | `@earendil-works/pi-coding-agent` 1.4.0 | `current` is a junction on Windows (D-WIN-JUNCTION-1); no admin right needed. |
| opencode | `%USERPROFILE%\.config\opencode\opencode.json` (`plugin`, `mcp`), or `%OPENCODE_CONFIG_DIR%` / `%XDG_CONFIG_HOME%\opencode` | `opencode plugin add context-mode@next` (npm package; 1.19: `opencode plugin context-mode@next --global`) | `opencode-ai` 1.19.4 | Stale plugin path after a package move: the plugin list has no agent flag to key on (D-WIN-HOOKMERGE-1 open item). |
| vscode | `%APPDATA%\Code\User\mcp.json`, `%USERPROFILE%\.copilot\hooks\context-mode-vscode.json` | none of its own; `npm i -g context-mode` + `context-mode setup --agents vscode` | none: VS Code is a desktop app. The runner cannot install it, so the matrix checks the written config, the hook line and the MCP handshake. | Not loaded by VS Code itself. |
| kiro | `%USERPROFILE%\.kiro\settings\mcp.json`, `hooks\context-mode.json` (or `%KIRO_HOME%`) | none of its own; `npm i -g context-mode` + `context-mode setup --agents kiro` | none: Kiro CLI has no npm package. Same config-level proof as vscode. | Not loaded by Kiro itself. |
| zcode | `%USERPROFILE%\.zcode\cli\config.json`, `%USERPROFILE%\.zcode\skills` | none of its own; `npm i -g context-mode` + `context-mode setup --agents zcode` | none: ZCode CLI has no npm package. Same config-level proof. | Not loaded by ZCode itself. |

## What the matrix does not prove

- No host ran in a logged-in session that fires its hooks, so doctor `hook-seen` is a WARN. Hook commands are run exactly as the config holds them, through the shell the host uses.
- vscode, kiro and zcode cannot be installed on a runner. The job log says so on each `cli-install` line.
- Other jobs own the Windows bash resolver (shell language, ctx_batch) and the Codex TOML parser; this matrix does not test them.
- `e2e/checks/windows-grandchild-kill.mjs` (ci, windows-latest) failed once with "bundle did not exit in 2000ms" on run 40590253825 and was green on the 6 runs before it; treated as a timing flake of a 2 s close budget, not changed here.
