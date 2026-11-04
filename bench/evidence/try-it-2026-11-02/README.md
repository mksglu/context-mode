# Try it prompts, live run of 2026-11-02

These files back the "Try it" section of the main README. Each prompt ran once in a fresh, empty project folder, and each answer passed a check against the source data (git, the GitHub search API, node and grep).

Setup: Context Mode 2.0.0-next.26 from the `release` branch, Claude Code 2.1.312, model `claude-haiku-5-5`, a separate HOME for the run. The init event lists 9 ctx tools, the MCP server connected and the SessionStart hook ran.

| Prompt | Raw | Reached the context | Saved | Route |
|---|---:|---:|---:|---|
| [03-docs-page](03-docs-page.json) | 601,984 B | 20,860 B | 96.5% | ctx tools (the hook sent WebFetch to the sandbox) |
| [04-api-json](04-api-json.json) | 1,039,898 B | 393 B | 99.96% | ctx tools |
| [06-large-log](06-large-log.json) | 216,485 B | 566 B | 99.7% | ctx tools |
| [07-web-page](07-web-page.json) | 35,087 B | 1,501 B | 95.7% | ctx tools (the hook sent WebFetch to the sandbox) |
| [01-repo-history](01-repo-history.json) | 359,090 B | 486 B | 99.9% | Bash with a pipe |
| [02-issues](02-issues.json) | 68,984 B | 1,639 B | 97.6% | Bash with a pipe |
| [05-test-suite](05-test-suite.json) | 71,119 B | 1,495 B | 97.9% | Bash with a pipe |
| [08-codebase-question](08-codebase-question.json) | 2,612,115 B | 4,882 B | 99.8% | Bash with a pipe |

Raw is the size of the source data, measured with a direct command outside the run. "Reached the context" is the sum of tool results in the stream-json. Saved is 1 - context / raw. The README shows the four prompts where the agent used the ctx tools. In the other four, the agent cut the data with its own shell pipe.

Each `<id>.json` holds a `summary` (prompt, verdict, reason, bytes, tool calls, turns, cost, wall time) and the `stream` of the run. Paths are replaced with `/HOME` and `/TMP`, and thinking signatures read `[removed]`. [spend.log](spend.log) has the cost per run: 0.0278 USD for all eight.

## Rerun

Use a separate HOME so your own settings stay as they are, then install with the native Claude Code commands:

```sh
export HOME="$(mktemp -d)"
claude plugin marketplace add mksglu/context-mode#release
claude plugin install context-mode@context-mode
mkdir -p "$HOME/work" && cd "$HOME/work"
claude -p "$(node -e 'console.log(require(process.argv[1]).find(p=>p.id==="04-api-json").prompt)' "$OLDPWD/prompts.json")" \
  --model claude-haiku-5-5 --output-format stream-json --verbose > 04-api-json.jsonl
```

Run the command from this folder. Swap the id for any prompt in [prompts.json](prompts.json). Then run `/ctx-stats` in an interactive session to see the saved bytes, and compare the answer with the `reason` field of the matching summary. Live pages (Hacker News, GitHub issues) change, so counts move between runs.
