# Filing a context-mode issue (for coding agents)

You are a coding agent (Claude Code, Codex, Gemini CLI, Qwen Code, Pi, OpenCode, Copilot) and your user asked you to report a context-mode problem. This file tells you what to collect, how to collect it, what to leave out, and the exact body to send. A GitHub Action reads every new issue and checks it against this format, so a body that follows it gets triaged and one that does not gets a comment that lists what is missing.

Why it is strict: one person maintains context-mode for 10 agents on 3 operating systems. A fix starts from the doctor report and a repro that runs in a fresh directory. Free text without them cannot be acted on.

## 1. Before you write anything

1. Search for the same problem: `gh issue list -R mksglu/context-mode --state all --search "<error code or check id>"`. If an open issue matches, add a comment with your ctx-report block to that issue instead of opening a new one.
2. Only v2 gets fixes. If the ctx_doctor tool does not exist in this agent, or its output does not start with `ctx-report: 1`, the user runs v1. Tell the user to install v2 (https://github.com/mksglu/context-mode#install) and stop; v1 issues are closed as `v1-frozen`.
3. Work in the agent and the project where the problem happens. If the user asks you to report a problem in a different agent, ask the user to run `/ctx-doctor` there and give you the block.

## 2. What to collect, and how

| Item | How you get it | Where it goes |
|---|---|---|
| ctx-report block | Call the `ctx_doctor` tool with `{"report":"issue"}`. Copy its fenced block unchanged, from `ctx-report: 1` to the `digest:` line. On Claude Code the user can also run `/ctx-doctor`. | section `Report` |
| why there is no report | If ctx_doctor cannot run, pick one reason from the list in section `Report status` | section `Report status` |
| Node version | `node --version` | section `Node` |
| filing agent | your own name, version and model id, for example `claude-code 2.1.283 claude-opus-5-5`. Use your CLI's `--version` output. | section `Filed by` |
| context-mode error line | the one line the tool result showed, starting with its code, for example `E_DB_BUSY`. Send the code and the fixed text that follows it; leave out any path or command that appears after it. | section `What happened` |
| repro | see section 4 | section `Steps to reproduce` |

The ctx-report block already holds the data the maintainer needs and nothing private: version and commit, agent and agent version (from MCP clientInfo), install mode, OS, Node and node:sqlite and FTS5, MCP protocol versions, enforcement mode, config differences as counts, v1 leftovers, project source and path facts (`has_space`, `non_ascii`, `max_len`), database integrity, index counts, hook round trips, hook error codes over 7 days, the deny summary, checks D1 to D10, and in issue mode the last 20 hook decisions and the last 10 hook errors as typed rows. Every value in it passed a typed scanner, so you do not need to clean it, and an edited block fails the digest check.

Get this data only through ctx_doctor. Reading `context.db`, the hook journal or the host config yourself puts paths, commands and file text into your context and into a public issue, and it is the leak that v1 issue #1141 reported.

## 3. What you leave out

These can hold secrets or private code, and the issue is public:

- settings files, `.env` files, MCP config files, `claude mcp list` or `codex mcp list` output
- agent debug logs, transcripts, session files, stack traces
- file contents, command output, `ctx_search` or `ctx_execute` results
- the user's prompts as typed; write a minimal prompt of your own instead (section 4)
- absolute paths, user names, host names, repo names of the user's project, IP addresses, emails
- tokens, keys, cookies, environment variable values
- screenshots

If a detail seems needed and it is on this list, describe it in one sentence with placeholders (`<home>`, `<project>`, `<token>`) and ask the user before you send it.

## 4. Steps to reproduce

Write steps that a maintainer's agent can run in a new empty directory, in the same style as the project's golden tests:

1. Setup: the commands that create the directory and files, with sizes instead of content (for example `head -c 300000 /dev/urandom | base64 > big.txt`).
2. Agent and mode: which agent, which install mode (from the report).
3. The prompt: one short prompt you wrote that triggers the problem in that directory.
4. The tool call: tool name and the input shape, with values replaced by placeholders, for example `Bash {"command":"curl -s <url>"}`.
5. Observed: what context-mode did (deny, rewrite, allow, hint, error code) and, for a deny, which alternative it named and what happened when the agent used it.
6. Expected: what should have happened instead.

Run the steps once yourself in a temporary directory before you send them if the user agrees; say in the body whether you did (`Reproduced: yes|no`).

## 5. The body

Create the issue with a body file, because multi-line Markdown breaks in shell quoting:

```
gh issue create -R mksglu/context-mode --title "<check id or error code>: <short summary>" --label bug --body-file <file>
```

Use these headings, in this order, with this exact text. The web form produces the same headings, so both paths are checked the same way.

````
### Report status

yes

### Report

```ctx-report
ctx-report: 1
...
digest: <64 hex>
```

### Node

v24.11.0

### Filed by

claude-code 2.1.283 claude-opus-5-5

### What happened

E_DB_BUSY context.db is locked by another writer

### Expected

The search returns results.

### Steps to reproduce

Reproduced: yes
1. ...

### Checks

- [x] The report comes from ctx_doctor in the agent and project where the problem happens, or Report status names why not.
- [x] I searched existing issues for the same code.
- [x] The body holds none of the items in "What you leave out".
- [x] The user read this body before I sent it.
````

`Report status` is `yes`, or one of these lines, and then `Report` holds `_No response_`:

- `no: ctx_doctor is not in the tool list`
- `no: the context-mode MCP server is failed or not connected`
- `no: ctx_doctor returned an error` (put its one error line in `What happened`)

Show the user the full body and the title before you run `gh issue create`, and send it only after the user agrees. The user owns the GitHub account the issue comes from.

## 6. After you send it

The intake check comments within a minute. If it lists missing items, fix the body with `gh issue edit <n> -R mksglu/context-mode --body-file <file>`; the check runs again on every edit and reopens the issue when the body passes. Pull requests are closed on this repo, so do not offer a patch; put your analysis of the cause, if you have one, as a short paragraph under `What happened`.
