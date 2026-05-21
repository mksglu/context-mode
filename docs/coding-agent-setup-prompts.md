# Coding-agent setup prompts

Copy one of these prompts into your coding agent and let it install context-mode in "YOLO mode" with minimal back-and-forth.

## Universal prompt

Use this when you want the agent to detect the current host automatically.

```text
Install and configure context-mode for the coding agent you are currently running in.

Work in YOLO mode:
- do the setup end-to-end without asking for confirmation unless the host UI requires a manual click
- prefer the official setup already shipped in this repository/package
- install context-mode globally if needed
- write the correct MCP config, hook config, and routing-instruction file for the current platform
- if you are running in Codex CLI, Gemini CLI, VS Code Copilot, or JetBrains Copilot, follow that platform's documented setup exactly
- copy packaged config files from the installed context-mode package instead of rewriting them by hand when possible
- preserve unrelated existing config
- after setup, verify with `ctx doctor`, `ctx stats`, or the platform's MCP status view

If something cannot be completed automatically, do everything else and finish with a short checklist of the exact manual steps still required.
```

## Codex CLI prompt

```text
Install and configure context-mode for Codex CLI in YOLO mode.

Do this end-to-end:
1. Install the official context-mode Codex plugin from the marketplace if Codex supports it in this environment.
2. Enable the required Codex hooks feature flags.
3. If plugin hooks are unavailable, fall back to the manual MCP + hooks setup in the context-mode docs.
4. Copy the packaged Codex routing instructions into the correct `AGENTS.md` location.
5. Restart or reload anything that needs it.
6. Verify that `ctx stats` works and that context-mode hooks are trusted/enabled.

Use the existing context-mode install docs as the source of truth, preserve unrelated Codex config, and only leave me manual steps if the host requires a trust/approval click.
```

## Gemini CLI prompt

```text
Install and configure context-mode for Gemini CLI in YOLO mode.

Please:
- install `context-mode` globally if needed
- update `~/.gemini/settings.json` with the context-mode MCP server and hooks, preserving unrelated settings
- copy the packaged `GEMINI.md` routing file if it is recommended for full model awareness
- avoid duplicate entries if context-mode is already configured
- restart/reload Gemini CLI if needed
- verify the setup with `/mcp list`, `ctx doctor`, or `ctx stats`

Use the official context-mode Gemini CLI config shipped with the package/repo as the source of truth and only stop for truly manual UI steps.
```

## VS Code Copilot prompt

```text
Install and configure context-mode for VS Code Copilot in YOLO mode.

Do the full setup:
- install `context-mode` globally if needed
- create or update `.vscode/mcp.json`
- create or update `.github/hooks/context-mode.json`
- copy the packaged Copilot routing instructions to `.github/copilot-instructions.md` when recommended
- preserve unrelated workspace settings
- avoid duplicating existing context-mode entries
- tell me exactly what needs a manual VS Code restart or trust click

After editing the config files, verify the setup as far as you can and finish with the shortest possible manual checklist.
```

## JetBrains Copilot prompt

```text
Install and configure context-mode for JetBrains Copilot in YOLO mode.

Do everything you can automatically:
- install `context-mode` globally if needed
- create or update `.github/hooks/context-mode.json`
- copy the packaged Copilot routing instructions to `.github/copilot-instructions.md` when recommended
- preserve unrelated project files
- avoid duplicate context-mode config
- verify with `ctx doctor` / `ctx stats` where possible

For the JetBrains MCP server entry that must be added through the IDE UI, do not stop early. Finish all file-based setup first, then give me the exact click-path and values for the remaining manual IDE step.
```

## Source docs

- Main install guide: [`/README.md`](../README.md)
- Gemini CLI config: [`/configs/gemini-cli/settings.json`](../configs/gemini-cli/settings.json)
- Codex routing rules: [`/configs/codex/AGENTS.md`](../configs/codex/AGENTS.md)
- VS Code Copilot routing rules: [`/configs/vscode-copilot/copilot-instructions.md`](../configs/vscode-copilot/copilot-instructions.md)
- JetBrains Copilot routing rules: [`/configs/jetbrains-copilot/copilot-instructions.md`](../configs/jetbrains-copilot/copilot-instructions.md)
