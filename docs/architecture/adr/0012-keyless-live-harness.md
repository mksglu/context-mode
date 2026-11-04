# ADR-0012: Live E2E = a keyless harness the owner runs in his logged-in Claude Code

- Status: Accepted (2026-10-14, owner: "API key veremem; Claude Code'da çalışan bir harness olursa arada bir kendim çalıştırırım")
- Supersedes: TECH-SPEC §6.9 (the CI job with keys), and the GS2 wording
- Evidence: workflow `wf_5b7e35b3-72f`, topic `keyless-e2e-harness`. Raw output: `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/round4-evidence.json`.

## Facts (verified live on the owner's Mac)

| Fact | Detail |
|---|---|
| No API key needed | `claude -p` runs on the Max subscription when `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL` and `ANTHROPIC_CUSTOM_HEADERS` are unset; `init.apiKeySource = "none"` |
| Cost is not a bill | `total_cost_usd` is a list-price estimate. On Haiku a deny-then-recover session is about $0.02 at list price, 2–3 s per turn |
| Hard deny can be tested headless | the reason reaches the model as an `is_error` tool result, and `permission_denials` lists the deny |
| Compaction can be tested headless | send `/compact` as a later stream-json user message; the stream shows `system/compact_boundary` |
| Codex | it is logged in with ChatGPT. `codex exec` runs with no key, using a temp `CODEX_HOME` that contains only a symlink to `auth.json` |
| Codex isolation | `--ignore-user-config` still loads `~/.codex/hooks.json` (the owner's v1 hooks), which is why the temp `CODEX_HOME` is needed |
| Installed agents | only `claude` and `codex`. The others are not installed and print `SKIPPED` |

Traps the harness must avoid:
- **`--strict-mcp-config` drops the server that ships inside the `--plugin-dir` plugin.** So it is not used.
- **The first `claude` on PATH is the claude-worktree shim.** The harness accepts only a real binary: Mach-O/ELF magic bytes, or a `package.json` named `@anthropic-ai/claude-code`.

## Decision

**Entry points.** Both run the same script.
- Terminal: `node e2e/live/run.mjs [--agents claude,codex] [--models haiku|sonnet|opus|all] [--cases routing,deny,compact,hooks]`
- In Claude Code: `/e2e-live`, from the repo-local file `.claude/commands/e2e-live.md`. It runs the script in the background, then shows `report.md`.

**Child environment.**
- Built from scratch from an allow-list: PATH, HOME, USER, SHELL, TMPDIR, LANG, TERM.
- Plus these settings:
  - `ENABLE_CLAUDEAI_MCP_SERVERS=false`
  - `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`
  - `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1`
  - a temp data dir
- Not passed: `ANTHROPIC_*`, `CLAUDE_CONFIG_DIR`. The login stays in the Keychain.

**Claude Code command.**

```
<bin> -p --input-format stream-json --output-format stream-json --verbose
  --include-hook-events --plugin-dir <build> --setting-sources project
  --no-session-persistence --model <m> --max-budget-usd <cap>
```

- cwd: a fixture git repo under `/tmp/cm-e2e/<run>/<case>`.

**Cases.**
- routing (§6.5 task set)
- deny / repeat-allow (ADR-0008 golden cases)
- compaction (ADR-0009, with `/compact` as a turn)
- hook firing (G25)

Hook timing comes from the v2 DB, because stream events carry no timestamp.

**Default run.** Haiku on Claude Code, plus Codex if it is logged in. `--models all` adds Sonnet and Opus. The report shows a table per agent and model: pass/fail against the thresholds, the first tool used, and bytes returned.

**Release (ADR-0013).** The `/release` skill runs this harness before it starts the release workflow. No signed tag. The release report records a "live test: passed / skipped" field plus a running **consecutive-skip count**. `/release` refuses to start the release workflow once that count reaches 3 skips in a row, and tells the owner to run the harness for real first — so `skip-live` cannot quietly become the permanent path and let the keyless harness rot unused.

**Agents that cannot run on the Mac** (not installed or not logged in) are listed as `SKIPPED` with the reason. GS2 is rewritten as "pass on every agent the harness could run; the rest SKIPPED with a reason". VS Code stays contract-only.

**Kiro.** Same no-key rule as every other agent: never `KIRO_API_KEY`. Kiro's live case runs only through a `kiro-cli` the owner is already logged into on the Mac, the same shape as the Codex path (a locally logged-in CLI, no secret passed by the harness). Until `kiro-cli` is installed and logged in, Kiro prints `SKIPPED` with that reason, a documented gap, not a key.

## r3 decision (2026-10-14, `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/review/DECISIONS-r3.md`)

- ADR-0017: default model `claude-sonnet-5 --effort low`; step mode runs only the cases whose `covers` match the changed files.
- Q24: Kiro's live case runs only through a locally logged-in `kiro-cli`, or is `SKIPPED` with a documented reason; never `KIRO_API_KEY`.

## Changes

r4 fix pass (B54): added the consecutive-skip count and the 3-skips-in-a-row release block, so `skip-live` cannot silently become permanent.
r5 pass: added the Kiro keyless-or-SKIPPED line (Q24).
