# Filing a context-mode issue (for coding agents)

Your user asked you to report a context-mode problem. Work as if the issue came to you: what facts would you need, what is the smallest way to reproduce it, and what would the fix start from? Collect exactly those, in this order. A GitHub Action reads every new issue, checks the headings and the doctor report, and comments with a list of what is missing. A body that follows section 5 passes that check.

One person maintains context-mode for 10 agents on 3 operating systems. A fix starts from the doctor report and a repro that runs in a fresh directory.

Security problems go to https://github.com/mksglu/context-mode/security/advisories/new as a private advisory.

## 0. Before you start

1. Look for the same problem: `gh issue list -R mksglu/context-mode --state all --search "<error code or check id>"`. When an open issue matches, add your facts as a comment on it.
2. Only the 2.0 line gets fixes. The `ctx_doctor` output of a 2.0 install starts with the table header `| Check | Status | Detail | Fix |`. When the tool is absent or the output looks different, the user runs 1.x: point the user to https://github.com/mksglu/context-mode#install and stop.
3. Run every command in the agent and the project where the problem happens. To report a problem in another agent, ask the user to run `/ctx-doctor` there and hand you the table.

## 1. Collect these facts

Run each command in the user's real HOME, where the problem happened, and keep its output for the template.

| Fact | Command | Template field |
|---|---|---|
| context-mode version | row D1 of the doctor table; also `npm ls -g context-mode --depth=0` | Environment: context-mode version |
| install route | the native command from the README that installed it (for example `codex plugin add context-mode@context-mode`), or `npm i -g context-mode@next` | Environment: Install route |
| agent and version | `claude --version`, `codex --version`, `gemini --version`, `qwen --version`, `pi --version`, `opencode --version` (run your own) | Environment: Agent and version |
| OS and arch | `uname -sm` (macOS, Linux); `$env:OS` and `$env:PROCESSOR_ARCHITECTURE` in PowerShell | Environment: OS and arch |
| Node version | `node --version` | Environment: Node version |
| doctor, from the agent | call the `ctx_doctor` tool (it takes an empty argument object); on Claude Code the user can run `/ctx-doctor` | ctx-report |
| doctor, from the terminal | `context-mode doctor --agents <agent>`; add `--debug` to print the redacted report to stderr | ctx-report, after the agent table |
| hook errors | `tail -n 50 ~/.context-mode/hook-errors.log` (PowerShell: `Get-Content $HOME\.context-mode\hook-errors.log -Tail 50`) | What happened |
| journal rows | the sqlite command below | What happened |

Paste both doctor outputs whole: every row, with every Detail and Fix cell word for word. The Detail cell names the exact cause (for example row D1 gives the installed version, the short bundle sha and why the latest version is unknown), and the Fix cell gives the command that checks it by hand. A terminal doctor and an agent doctor can differ (for example D5 hooks and D6 MCP), and the difference often names the cause.

`hook-errors.log` holds one JSON line per hook failure: `ts` (UTC time), `agent`, `stage`, `label` (the error code), `message`, `stack`. Copy the lines whose `ts` falls in the minutes around the failure, and keep each line whole.

The journal lives in the project database under `~/.context-mode`. Read it with a read-only open, and only the columns below (they hold sizes, kinds and codes; the `body`, `path` and `key` columns stay closed because they hold file text and commands):

```sh
DB=$(ls -t ~/.context-mode/projects/*/context.db | head -n 1)
sqlite3 -readonly "$DB" "SELECT seq, datetime(created_at/1000,'unixepoch') AS utc, kind, tool, ok, exit_code, bytes, returned_bytes FROM events ORDER BY seq DESC LIMIT 20;"
```

Read files under `~/.context-mode` only. Read the host config, agent logs and transcripts only to answer a question from the maintainer, and quote one line then.

## 2. Reproduce from a clean state

Run these steps yourself before you file, in a new shell session with a temporary home, so the maintainer's agent can replay them byte for byte. The new session keeps the user's real HOME unchanged.

1. Temp home and project:
   ```sh
   export REPRO=$(mktemp -d); export HOME="$REPRO/home"; mkdir -p "$HOME" "$REPRO/proj"; cd "$REPRO/proj"
   ```
   (PowerShell: set `$env:USERPROFILE` to a new folder.) Agent logins live under HOME; steps that need a model call say so under Steps and name the agent. The doctor, setup and hook steps run with the agent logged out.
2. Install with the agent's own native command, then run the terminal doctor:
   - Claude Code: `claude plugin marketplace add mksglu/context-mode#release` then `claude plugin install context-mode@context-mode`
   - Codex: `codex plugin marketplace add mksglu/context-mode@release` then `codex plugin add context-mode@context-mode`
   - Gemini CLI: `gemini extensions install https://github.com/mksglu/context-mode --ref release`
   - Qwen Code: `qwen extensions install https://github.com/mksglu/context-mode:context-mode --ref release`
   - Pi: `pi install npm:context-mode@next`
   - OpenCode: `opencode plugin add context-mode@next`
   - Copilot CLI, Kiro, VS Code, ZCode: `npm i -g context-mode@next` then `context-mode setup --agents <agent>`
   - Check: `context-mode doctor --agents <agent>`
3. The smallest file or command that shows the defect, with sizes in place of content:
   ```sh
   head -c 300000 /dev/urandom | base64 > big.txt; wc -c big.txt
   ```
4. The exact prompt, one short line you write yourself, and the exact tool call with placeholders for values, for example `Bash {"command":"cat big.txt"}`.
5. Expected and Actual, each with a byte count: `wc -c` of the file, the size of the tool result, the deny or redirect text, the error code. Name the tool that was denied and the alternative it gave, and what happened when the agent used the alternative.
6. Run it twice and write `Reproduced: yes (2 of 2)`, or the real count.

Delete the temp home when you finish: `rm -rf "$REPRO"`.

## 3. Check the newest next release

The fix may exist already. Before you file:

```sh
npm view context-mode dist-tags --json
npm i --prefix "$REPRO/next" context-mode@next
"$REPRO/next/node_modules/.bin/context-mode" doctor --agents <agent>
```

Run the smallest repro from section 2 on that version. Write the result in Steps as `Newest next: <version>, result: still fails or fixed`. When it passes there, tell the user to update with the agent's own update command from the README and stop.

## 4. Redact

The issue is public. Replace these before you send:

- keys, tokens, cookies, Authorization headers, `.env` values: `<key>`, `<token>`, `<secret>`; this covers `sk-`, `github_pat_` and `TOKEN=` values
- emails: `<email>`
- your home folder: `~`; user name: `<user>`; host name: `<host>`; the user's project folder: `<project>`
- file contents, stack frames that show file text, session files and screenshots stay out; describe them in one sentence

Check the file before you send it:

```sh
grep -n -F -e 'sk-' -e 'github_pat_' -e 'TOKEN=' -e '/Users/' -e '/home/' -e '@' body.md
```

Each hit gets a replacement or a reason to keep it. The doctor table is typed and already clean; paste it unchanged, because the check reads it line by line.

## 5. Fill in this template

Save the body to a file, because multi-line Markdown breaks in shell quoting. The headings, their order and their text below are what the intake check reads.

````
### Summary

<one line: check id or error code, and what fails>

### ctx-report

<the table from ctx_doctor in the agent, whole: every Detail and Fix cell word for word>

<the table from `context-mode doctor --agents <agent>`, whole>

### What happened

Error code and text: <for example E_DB_BUSY context.db is locked by another writer>
Hook errors (hook-errors.log, UTC):
<lines>
Journal rows (events, newest first):
<rows>

### Expected

<what should happen, with the byte count>

### Steps

Reproduced: yes (2 of 2)
1. <setup commands, with sizes>
2. <the prompt>
3. <the tool call>
4. Actual: <what context-mode did, with the byte count>; the denied tool was <tool> and the alternative it gave was <tool>
5. Newest next: <version>, result: still fails or fixed

### Environment

context-mode version: <x.y.z>
Install route: <native command>
Agent and version: <name x.y.z>
OS and arch: <os arch>
Node version: <vXX.Y.Z>
Filed by: <your agent name, version, model id>
````

Show the user the title and the full body, then send after the user agrees. The user owns the GitHub account:

```sh
gh issue create -R mksglu/context-mode --title "<check id or error code>: <short summary>" --label bug --body-file body.md
```

## 6. After you send it

The intake check comments within a minute. When it lists missing items, fix the file and run `gh issue edit <n> -R mksglu/context-mode --body-file body.md`; the check runs again on each edit and reopens the issue when the body passes. This repo takes issues and keeps pull requests closed. Put your analysis of the cause, if you have one, as a short paragraph under What happened.
