# CLI review: `context-mode setup`, `doctor`, `upgrade` (2026-10-23)

Scope: the built v2 CLI, installed the way a user installs it. Rules checked: ADR-0019 section 8 (clig.dev). Evidence: every block below is real output from this run.

## How this was run

- Build: `node build/build.mjs --out release-out`, then `npm pack` in `release-out/`, then `npm i -g --prefix <tmp>/prefix <tmp>/pack/context-mode-0.0.0-dev.tgz`.
- Temp `HOME`, `NO_COLOR=1`, no ANSI in any block except the pty block (colours stripped by hand there).
- Fake agents: `~/.codex`, `~/.claude`, `~/.gemini` directories, and a stub `claude` that exits 0 (it does not implement `plugin list`; this matters for one FAIL below).
- Node v26.8.1, npm 11.19.0, macOS. Version prints `0.0.0-dev` because this is a dev build.
- Tests after the two fixes: `node --test tests/cli/cli.test.mjs tests/setup/engine.test.mjs`: 40 pass, 0 fail. Evidence: tests/cli/cli.test.mjs.

## The user journey: 2 commands

```text
npm i -g context-mode
context-mode setup
```

What the second command shows on a TTY (real pty run, Enter at the agent list, Enter at the plan):

```text
┌  context-mode 0.0.0-dev setup
│
◆  Select agents to set up (space toggles, enter confirms)
│  ◼ claude-code (detected)
│  ...
│  ↑/↓ to navigate • Space: select • Enter: confirm
└


│
◇  Plan ───────────────────────────────────────────────────────────────────────╮
│                                                                              │
│  claude-code                                                                 │
│    run  claude plugin marketplace add                                        │
│  <tmp>/prefix/lib/node_modules/context-mode           │
│    run  claude plugin install context-mode@context-mode                      │
│    v1   /tmp  context-mode-*: v1 temp file context-mode-* under the OS temp  │
│   dir                                                                        │
│  codex                                                                       │
│    edit <tmp>/home/.codex/config.toml                 │
│  mcp_servers.context-mode                                                    │
│    v1   /tmp  context-mode-*: v1 temp file context-mode-* under the OS temp  │
│   dir                                                                        │
│  gemini  SKIPPED: gemini not on PATH                                         │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────╯
│
◆  Apply this plan?
│  ● Yes / ○ No
└


│
◇  claude-code: apply and verify ...
| claude-code: verifying                        │
■  claude-code: FAIL (list: claude plugin list does not list context-mode)
│
◇  codex: apply and verify ...
| codex: verifying/ codex: verifying                  │
◆  codex: PASS
│
◇  gemini: apply and verify ...
│
▲  gemini: SKIPPED (gemini not on PATH)
│
◇  Summary ────────────────────────────────────────────────────────────────────╮
│                                                                              │
│  AGENT         STATUS  DETAIL                                                │
│  claude-code   FAIL    list: claude plugin list does not list context-mode   │
│  (rolled back)                                                               │
│  codex         PASS                                                          │
│  gemini        SKIPPED gemini not on PATH                                    │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────╯
FAIL claude-code: list: claude plugin list does not list context-mode. Fix: context-mode setup --agen
```

Note on the FAIL for `claude-code` in this block: the stub `claude` does not list the plugin, so the `list` check fails and setup rolls that agent back. That is the designed behaviour. `codex` passes in the same run. After a FAIL the tool shows the redacted report and asks once; the default is No.

Ctrl-C at the agent list (pty): exit 130, "Cancelled; nothing changed."

```text
◆  Select agents to set up (space toggles, enter confirms)
...
└  Cancelled; nothing changed.
[exit=130]
```

## Captured output, non-interactive

### `--help`, `--version`, `help`

```text
$ context-mode --help
Usage: context-mode <command> [options]

Commands:
  setup                       Find your agents, show the plan, apply it, verify each agent
  doctor                      Check every agent; changes nothing
  upgrade                     Install the newest context-mode from npm, then repair each agent
  server [--agent <id>]       Run the MCP server on stdio (alias: mcp)
  hook --agent <id>           Run one hook call: JSON on stdin, answer on stdout
  hook <platform> <event>     v1 form of hook; still works, run context-mode setup to update it

Options:
  -h, --help                  Show this help (context-mode <command> --help for a command)
  -v, --version               Show the version

Exit codes:
  0    success
  1    a check or step failed
  2    usage error (unknown command, option or agent; an answer is needed but there is no TTY)
  130  stopped with Ctrl-C (the agent in progress is rolled back)

Examples:
  context-mode setup
  context-mode doctor --agents codex
  context-mode server --agent codex
[exit=0]
```
```text
$ context-mode --version
0.0.0-dev
[exit=0]
```
#### `setup --help`
```text
$ context-mode setup --help
Usage: context-mode setup [options]

Find your agents, show the plan, apply it, then verify each agent (MCP handshake, one hook call).
A failed agent is rolled back byte for byte. Instruction files (CLAUDE.md, AGENTS.md, ...) are never touched.

Options:
  --list             Print every supported agent and its support level; change nothing
  --dry-run          Show the plan; change nothing
  --remove           Undo every setup run: put each touched file back
  --repair           Apply again and verify (upgrade runs this)
  --agents <ids>     Only these agents, comma-separated (ids: context-mode setup --list)
  -y, --yes          Do not ask; apply
  --no-input         Never prompt; exit 2 if an answer is needed
  --json             Write only JSON to stdout
  -q, --quiet        Results only; no progress lines
  --verbose          Show every check
  --debug            Print the full debug report on failure
  --no-color         No colour (also NO_COLOR, TERM=dumb, or no TTY)
  -h, --help         Show this help

Exit codes:
  0    success
  1    a check or step failed
  2    usage error (unknown command, option or agent; an answer is needed but there is no TTY)
  130  stopped with Ctrl-C (the agent in progress is rolled back)

Examples:
  context-mode setup
  context-mode setup --yes --agents codex,claude-code
  context-mode setup --dry-run --json
[exit=0]
```
### `setup --list`
```text
$ context-mode setup --list
AGENT         SUPPORT   FOUND     INSTALL
claude-code   full      detected  marketplace
codex         full      detected  config-mcp
gemini        full      detected  extension
qwen          full      -         extension
copilot-cli   full      -         plugin
vscode        full      -         mcp-entry
kiro          full      -         mcp-entry
zcode         full      -         hooks+mcp
pi            full      -         in-process
opencode      full      -         in-process
[exit=0]
```
### `setup --dry-run` (no TTY)
```text
$ context-mode setup --dry-run
claude-code
  run  claude plugin marketplace add <tmp>/prefix/lib/node_modules/context-mode
  run  claude plugin install context-mode@context-mode
  v1   <os-tmpdir>  context-mode-*: v1 temp file context-mode-* under the OS temp dir
codex
  edit <tmp>/home/.codex/config.toml  mcp_servers.context-mode
  v1   <os-tmpdir>  context-mode-*: v1 temp file context-mode-* under the OS temp dir
gemini  SKIPPED: gemini not on PATH
[exit=0]
```
### `setup --yes --agents claude-code,codex --json`
```text
$ context-mode setup --yes --agents claude-code,codex --json
{"command":"setup","exitCode":1,"agents":[{"id":"claude-code","status":"FAIL","v1":[{"file":"<os-tmpdir>","path":"context-mode-*","reason":"v1 temp file context-mode-* under the OS temp dir"}],"changes":[{"command":["claude","plugin","marketplace","add","<tmp>/prefix/lib/node_modules/context-mode"]},{"command":["claude","plugin","install","context-mode@context-mode"]}],"checks":[{"name":"parse","ok":true},{"name":"list","ok":false,"detail":"claude plugin list does not list context-mode"},{"name":"mcp","ok":true},{"name":"hook","ok":true,"overheadP95Ms":8,"wallP95Ms":40,"bareP95Ms":32}],"reason":"list: claude plugin list does not list context-mode","rolledBack":true},{"id":"codex","status":"PASS","v1":[{"file":"<os-tmpdir>","path":"context-mode-*","reason":"v1 temp file context-mode-* under the OS temp dir"}],"changes":[{"file":"<tmp>/home/.codex/config.toml","path":"mcp_servers.context-mode","after":{"command":"<node>","args":["<tmp>/prefix/lib/node_modules/context-mode/server.mjs","--agent","codex"]}}],"checks":[{"name":"parse","ok":true},{"name":"list","ok":true},{"name":"mcp","ok":true},{"name":"hook","ok":true,"overheadP95Ms":7,"wallP95Ms":39,"bareP95Ms":32}]}],"backupDir":"<tmp>/home/.context-mode/backups/<ts>"}
[exit=1]
[stderr]
claude-code: apply and verify ...
claude-code: FAIL (list: claude plugin list does not list context-mode)
codex: apply and verify ...
codex: PASS
FAIL claude-code: list: claude plugin list does not list context-mode. Fix: context-mode setup --agents claude-code
Debug report (redacted): <tmp>/home/.context-mode/reports/setup-<ts>.md
To report it: gh issue create --repo mksglu/context-mode --title "setup FAIL: claude-code (4d17555b49f7)" --body-file "<tmp>/home/.context-mode/reports/setup-<ts>.md"
```
### `doctor`
```text
$ context-mode doctor
AGENT         STATUS  DETAIL
claude-code   FAIL    not set up, run context-mode setup
codex         PASS
gemini        SKIPPED gemini not on PATH
[exit=1]
[stderr]
FAIL claude-code: not set up, run context-mode setup. Fix: context-mode setup --agents claude-code
To report it: gh issue create --repo mksglu/context-mode --title "doctor FAIL: claude-code (b166c64d40e7)" --body-file "<report>"
```
### `doctor --json` (stdout is one JSON document; the FAIL lines are on stderr)
```text
$ context-mode doctor --json
{"command":"doctor","exitCode":1,"agents":[{"id":"claude-code","status":"FAIL","v1":[{"file":"<os-tmpdir>","path":"context-mode-*","reason":"v1 temp file context-mode-* under the OS temp dir"}],"changes":[{"command":["claude","plugin","marketplace","add","<tmp>/prefix/lib/node_modules/context-mode"]},{"command":["claude","plugin","install","context-mode@context-mode"]}],"checks":[],"reason":"not set up, run context-mode setup"},{"id":"codex","status":"PASS","v1":[{"file":"<os-tmpdir>","path":"context-mode-*","reason":"v1 temp file context-mode-* under the OS temp dir"}],"changes":[],"checks":[{"name":"parse","ok":true},{"name":"list","ok":true},{"name":"mcp","ok":true},{"name":"hook","ok":true,"overheadP95Ms":7,"wallP95Ms":40,"bareP95Ms":33}]},{"id":"gemini","status":"SKIPPED","v1":[],"changes":[],"checks":[],"reason":"gemini not on PATH"}]}
[exit=1]
[stderr]
FAIL claude-code: not set up, run context-mode setup. Fix: context-mode setup --agents claude-code
To report it: gh issue create --repo mksglu/context-mode --title "doctor FAIL: claude-code (b166c64d40e7)" --body-file "<report>"
```
### `setup --remove --yes`
```text
$ context-mode setup --remove --yes
Restored 1 file(s).
[exit=0]
```
### `upgrade --dry-run`
```text
$ context-mode upgrade --dry-run
npm i -g context-mode@latest
context-mode setup --repair --yes
[exit=0]
```
### Typos and bad input
```text
$ context-mode setpu
[exit=2]
[stderr]
context-mode: unknown command "setpu". Did you mean "setup"? Run context-mode --help.
```
```text
$ context-mode setup --dryrun
[exit=2]
[stderr]
context-mode: unknown option "--dryrun" for context-mode setup. Did you mean "--dry-run"?
Run context-mode setup --help.
```
```text
$ context-mode setup --agents cursr
[exit=2]
[stderr]
context-mode: unknown agent "cursr". Run context-mode setup --list.
Run context-mode setup --help.
```
### No TTY, answer needed
```text
$ context-mode setup
claude-code
  run  claude plugin marketplace add <tmp>/prefix/lib/node_modules/context-mode
  run  claude plugin install context-mode@context-mode
  v1   <os-tmpdir>  context-mode-*: v1 temp file context-mode-* under the OS temp dir
codex
  edit <tmp>/home/.codex/config.toml  mcp_servers.context-mode
  v1   <os-tmpdir>  context-mode-*: v1 temp file context-mode-* under the OS temp dir
gemini  SKIPPED: gemini not on PATH
[exit=2]
[stderr]
context-mode: an answer is needed and there is no TTY (or --no-input is set). Run again with --yes to apply, or with --dry-run to only see the plan.
```
### Broken config file (after fix D-CLI-REP-2)
```text
$ context-mode setup --yes --agents codex      (config.toml holds: [mcp_servers.x / command = = "bad")
codex: apply and verify ...
codex: FAIL (<tmp>/home/.codex/config.toml does not parse; left as is. Fix the file, then re-run setup)
AGENT         STATUS  DETAIL
codex         FAIL    <tmp>/home/.codex/config.toml does not parse; left as is. Fix the file, then re-run setup
[exit=1]
```

### `help` with a topic (after fix D-CLI-REP-1)

```text
$ context-mode help setpu
context-mode: no help for "setpu". Did you mean "setup"? Run context-mode --help.
[exit=2]
$ context-mode help doctor | head -2
Usage: context-mode doctor [options]
```

## Pass/fail per rule (ADR-0019 section 8)

| # | Rule | Result | Evidence |
|---|---|---|---|
| 1 | `--help` has examples | PASS | `--help` block above; golden tests `cli/help-golden` |
| 2 | `--version` prints the version only | PASS | `0.0.0-dev` and one newline |
| 3 | `-h` on every command | PASS | test `cli/help-short` |
| 4 | `help <command>` shows that command's help | PASS after fix | D-CLI-REP-1; was FAIL (printed main help) |
| 5 | Exit 0 on success | PASS | `--help`, `--list`, `--remove` |
| 6 | Exit 1 on a failed check or step | PASS | `setup --yes` with claude-code FAIL; broken config |
| 7 | Exit 2 on usage error | PASS | typo, bad flag, bad agent, no TTY with an answer needed, `help <typo>` |
| 8 | Exit 130 on Ctrl-C | PASS | pty run at the agent list |
| 9 | Exit codes are in `--help` | PASS | "Exit codes:" block on every help |
| 10 | Results on stdout, progress on stderr | PASS | `setup --yes --json` run: stdout holds the JSON; the progress lines are in the stderr block |
| 11 | `--json` writes only JSON to stdout | PASS | `setup --dry-run --json` parsed by `JSON.parse`; `setup --json --agents cursr` has empty stdout |
| 12 | Prompts only on a TTY; no TTY never hangs | PASS | `setup` and `upgrade` without TTY exit 2 at once |
| 13 | `NO_COLOR` gives no escape codes | PASS | no ESC byte in any non-pty capture; test `cli/no-color` |
| 14 | `--dry-run` writes nothing | PASS | hash of the temp HOME identical before and after |
| 15 | Ctrl-C rolls back the agent in progress | PASS | repo test `cli/pty-ctrl-c` (in the 40 passing tests); not re-run by hand mid-write |
| 16 | Error = what, why, exact fix command | FAIL | usage errors and setup FAIL pass; `doctor` prints `--body-file "<report>"`, a placeholder that does not run (open defect 2); no line or column for a parse error (open defect 3) |
| 17 | Unknown command or flag suggests the closest match | PASS | `setpu`, `--dryrun` |
| 18 | `--quiet` and `--verbose` exist; default output fits one screen per agent | PASS | flags accepted; the plan for 3 agents is 8 lines (`setup --dry-run` block) |
| 19 | `--help` starts in under 100 ms | PASS (median) | 30 runs: median 69 ms, min 49 ms, p95 187 ms. Bare `node -e 0` on the same host: median 46 ms, p95 90 ms. The CLI adds about 23 ms. The p95 is host noise; a loaded host can exceed 100 ms |
| 20 | No network call at start | PASS | `src/entries/cli.ts` reads `package.json` only before routing |
| 21 | Writes only allowlisted paths and `~/.context-mode/` | PASS | file list after `setup --yes --agents codex`: `.codex/config.toml` and `.context-mode/{backups,reports}` |
| 22 | Manual step without typing paths (`setup --print <agent>`) | PASS | golden per agent in `tests/cli/cli.test.mjs`; writes nothing (HOME snapshot equal); `--json` machine form. 2026-10-25, macOS arm64, clean temp HOME, npm-packed build: for all 10 agents, `context-mode setup --agents <id>` then `doctor` PASS, and the `--print --json` steps applied by hand then `doctor` PASS (claude 2.1.310, codex 0.164.0, copilot 1.0.103, gemini 0.65.0, opencode 1.19.4, qwen 0.26.1, pi from npm; kiro, vscode, zcode by config file only) |

Result: 20 of 21 rules pass.

## Defects fixed in this review

| ID | Defect | Fix | Test |
|---|---|---|---|
| D-CLI-REP-1 | `context-mode help setup` printed the main help; `help <typo>` exited 0 | `help <command>` routes to `<command> --help`; unknown topic is exit 2 with a hint | `cli/help-word` (red first) |
| D-CLI-REP-2 | Broken config printed `FAIL codex: codex: <path> ...` (id twice) and said "re-run setup" before "fix the file" | Reason no longer starts with the id; text reads "left as is. Fix the file, then re-run setup" | `cli/parse-fail-line` (red first) |

Both are in `docs/v2/impl/DEVIATIONS.md`. Commit: `d3638ec4`.

## Defects open

| # | Defect | Effect | Size |
|---|---|---|---|
| 1 | One run of `setup --yes --agents codex` exited 1 after about 5 s; the report file was written, the next three runs and a 12-run loop all passed (0 of 12 failed). Not reproduced; the cause is not known (a verify-step timeout under load is a guess, not a finding). | A flaky install is the worst case for a "robust" claim. | Needs a repro: run the loop on a loaded host and keep `reports/*.md`. |
| 2 | `doctor` shows `gh issue create ... --body-file "<report>"`. `doctor` writes no report file, so the command cannot run. | The "fix" line is a placeholder. | Small: write the report or drop the `--body-file` form. |
| 3 | A config that does not parse is refused, but the message has no line and column (PRD-setup, robustness table asks for both). | The user must find the error alone. | Medium: the TOML and JSON parsers must expose the position. |
| 4 | Every agent plan shows `v1  <os-tmpdir>  context-mode-*: v1 temp file`. On this host 19,981 files match the prefix in the OS temp dir. | Noise on every agent, and it looks like a v1 config problem. It is only a stale temp file. | Small: show the finding once, not per agent, or drop it from the plan. |
| 5 | The second `setup` run prints PASS but does not say "nothing changed" (PRD-setup story 7). | The user cannot tell a no-op from a write. | Small. |
| 6 | In a narrow pty (80 columns) the plan box wraps long absolute paths in the middle of the path. | Hard to copy a path. | Small. |
| 7 | `package.json` `engines` is `node >=24.15.0`. This review did not run on an older Node, so the message a user sees there is unchecked. | Unknown. | Check: install on Node 22. |

## Suggestions to make it simpler

1. Make `context-mode` with no arguments run `setup` on a TTY, and print help only without a TTY. Today a bare `context-mode` prints help, so the user must know the word `setup`.
2. Print one final line after setup: `Done. Restart <agent>. Check with: context-mode doctor`. The summary table is clear, but the captured output shows no next step line (ADR-0019 section 3, step 8, asks for one).
3. Show the plan once, before the agent list is confirmed, for the pre-selected agents. Today the user picks agents, then sees a second screen. Two screens before any write is two Enter presses a first-time user does not need when only one agent is found.
4. Fold `--no-input` into `--yes` for scripts, or document the difference in one line: `--no-input` exits 2 where `--yes` applies. Both exist now; the help says what each does, but not which one a script should use.
5. Keep `--repair` out of the main `setup --help` list; it is only for `upgrade`.
6. Put the open-issue question after the summary, not inside a boxed debug report that is 20+ lines long. Show 3 lines and the file path; keep the full text in the file.
