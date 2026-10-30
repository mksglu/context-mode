# Do the hooks fire on every host

Owner rule: every agent gets hooks, no exception. This file lists, per host, whether the host's own binary was seen to run our hook, which gate can stop it, and which file proves it. Written for v2.0.0-next.15 (tag on 5ef1f189).

All live runs use a temp HOME, no login, no API key, and a fake local model provider. No paid model was used. The model asks for `cat` on a 190 to 210 KB file. A hook that fires makes the model see a redirect to `ctx_execute` (under 400 bytes) and not the file.

"Gate" means a host setting or state that stops the hook while the host still lists context-mode as installed. Doctor FAILs on each gate listed.

| Host | Fires | Proof level | Gate that doctor checks | Proof file |
|---|---|---|---|---|
| claude-code | yes | live, claude 2.1.274, plugin installed with `claude plugin marketplace add` and `claude plugin install` | none new (D-CC-HOOKS-RUN-1) | tests/v2/e2e/claude-code-fire.test.mjs |
| codex | yes | live, `codex exec` against a fake Responses provider | untrusted plugin hooks (D-NI-CODEX-TRUST-1, setup writes the trust key and hash) | tests/v2/e2e/codex-cat-redirect.test.mjs, tests/v2/setup/codex-trust-key.test.mjs |
| gemini | yes | live, gemini 0.66.0, extension linked with `gemini extensions link` | D-NI-GEMINI-GATE-1 | tests/v2/e2e/gemini-fire.test.mjs, tests/v2/setup/gemini-gate.test.mjs |
| qwen | yes | live, qwen 0.26.4, extension linked with `qwen extensions link` | `disableAllHooks` and one more setting (D-NI-QWEN-GATE-1) | tests/v2/e2e/qwen-fire.test.mjs |
| copilot-cli | yes | live, copilot CLI, custom provider with COPILOT_OFFLINE | settings.json `disabledHooks` (D-HF-COPILOT-ENABLED-1); setup removes our key | tests/v2/e2e/copilot-cli-fire.test.mjs |
| opencode | yes | live, opencode 1.19.5, installed with `opencode plugin context-mode@next --global` | plugin list entry that points to a missing file (D-HF-OPENCODE-GATE-1) | tests/v2/e2e/opencode-fire.test.mjs, tests/v2/setup/opencode-plugin-gate.test.mjs |
| pi | yes | live, pi 1.4.0, installed with `pi install <package>` | packages[] extensions filter (D-NI-PI-GATE-1) | tests/v2/e2e/pi-fire.test.mjs, tests/v2/setup/pi-gate.test.mjs |
| zcode | yes | live, zcode CLI 0.17.0 built from source (no npm package) | invalid key in config.json drops the whole file (D-NI-ZCODE-GATE-1) | tests/v2/e2e/zcode-fire.test.mjs, tests/v2/setup/zcode-gate.test.mjs |
| vscode | not proven live | hook command only | `chat.useHooks`, `hookFilesLocations`, managed policy (D-NI-VSCODE-GATE-1) | tests/v2/e2e/vscode-fire.test.mjs, tests/v2/setup/vscode-gate.test.mjs |
| kiro | not proven live (load only) | host loads all 6 entries | disabled entry (D-NI-KIRO-GATE-1) | tests/v2/e2e/kiro-fire.test.mjs, tests/v2/setup/kiro-gate.test.mjs |

## Not proven

- vscode: the real VS Code 1.144.0 never sent a request to the fake provider (no sign-in, headless chat did not start). The installed 1.105.0 has no hooks code. The deepest proof is the exact PreToolUse command that setup wrote, run with the documented payload (run_in_terminal, cat of a 208 KB log). It returns a deny with the ctx_execute redirect, under 4000 bytes. This proves our command, not VS Code's own runner.
- kiro: the real kiro-cli 2.35.2 logs `hooks.reload.loaded read=6 registered=6`, so it parsed every entry. No hook was seen to fire: every engine needs a real login before the first model call, and no fake local provider works. The loader counts an `enabled: false` entry as registered, so the enabled flag is covered by unit tests only.

Both stay open. They are not hidden behind a skip: the live tests print the reason when the binary is absent.

## Windows

The CI job `windows hosts` runs setup, doctor, the hook and an MCP handshake for all 10 hosts from the packed package on Windows, macOS and Linux. All 10 pass on the release run. Two known Windows shell defects (Q-WIN-5 qwen, KIRO-WIN-4 kiro, D-WIN-QWEN-SHELL-1 and D-WIN-KIRO-SHELL-1) are still marked as known and need a design decision.
