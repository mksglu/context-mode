# Filing a context-mode issue (for coding agents)

Your user asked you to report a context-mode problem. Write the issue so a maintainer's agent can replay it in one pass: the facts, the smallest repro from a fresh project, the exact output, and the cause when you found it. Follow the rules below in order. A GitHub Action scores every new issue against them, labels it `repro-ready` or `needs-info`, and keeps one comment with a checklist of what is still missing. Edit the issue body to fill that checklist; the comment updates itself.

One person maintains context-mode for 10 agents on 3 operating systems. A fix starts from the doctor report and a repro that runs in a fresh directory.

Security problems go to https://github.com/mksglu/context-mode/security/advisories/new as a private advisory.

## Rules

Follow every rule. Each one names a fact the maintainer needs to replay the bug.

1. Search for the same problem first: `gh issue list -R mksglu/context-mode --state all --search "<check id or error>"`. When one matches, add your facts there as a comment.
2. File one bug per issue.
3. Call the `ctx_doctor` tool and paste its full output unchanged in the `ctx-report` field.
4. Give the versions: context-mode, the agent, the OS and arch, and Node.
5. Write numbered repro steps that start from a fresh project (`mktemp -d`) and the agent's own install command.
6. Give the exact command and its exact output in a fenced code block.
7. Say what you expected and what happened instead.
8. Name the source file and line when you found the cause.
9. Replace every secret with `<masked>` and the home folder with `~` before you send.

Fast path: when a `ctx_doctor` row FAILs, ctx_doctor writes the whole issue body to `~/.context-mode/reports/doctor-<utc>.md` and prints a ready `gh issue create --repo mksglu/context-mode ... --body-file <that file>` line, a link to the form `.github/ISSUE_TEMPLATE/agent-report.yml`, and a `Rules:` link to this page. The file already holds every section of the form: the doctor table, versions, install route, config entries, hook errors, journal rows and env paths. Run each Fix first. When a FAIL stays, fill the `<...>` lines in What happened, Expected and Steps, show the file to the user, and send it after the user agrees. Sections 0 to 7 below say what each part means.

## 0. Before you start

1. Look for the same problem: `gh issue list -R mksglu/context-mode --state all --search "<error code or check id>"`. When an open issue matches, add your facts as a comment on it.
2. Only the 2.0 line gets fixes. The `ctx_doctor` output of a 2.0 install starts with the table header `| Check | Status | Detail | Fix |`. When the tool is absent or the output looks different, the user runs 1.x: point the user to https://github.com/mksglu/context-mode#install and stop.
3. Run every command in the agent and the project where the problem happens. To report a problem in another agent, ask the user to run `/ctx-doctor` there and hand you the table.

## 1. Collect these facts

Run each command in the user's real HOME, where the problem happened, and keep its output for the template.

| Fact | Command | Template field |
|---|---|---|
| context-mode version | row D1 of the doctor table; also `npm ls -g context-mode --depth=0` | Environment: context-mode version |
| install route | the native command from the README that installed it (for example `codex plugin add context-mode@context-mode`), or `npm i -g context-mode` | Environment: Install route |
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
   - Claude Code: `claude plugin marketplace add mksglu/context-mode` then `claude plugin install context-mode@context-mode`
   - Codex: `codex plugin marketplace add mksglu/context-mode` then `codex plugin add context-mode@context-mode`
   - Gemini CLI: `gemini extensions install https://github.com/mksglu/context-mode`
   - Qwen Code: `qwen extensions install https://github.com/mksglu/context-mode:context-mode`
   - Pi: `pi install npm:context-mode`
   - OpenCode: `opencode plugin add context-mode`
   - Copilot CLI, Kiro, VS Code, ZCode: `npm i -g context-mode` then `context-mode setup --agents <agent>`
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
npm i --prefix "$REPRO/next" context-mode
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

Save the body to a file, because multi-line Markdown breaks in shell quoting. Use these headings in this order: they are the fields of the agent-report form, and the `ctx-report` field holds the doctor output unchanged.

````
### Summary

<one line: check id or error code, and what fails>

### ctx-report

```text
<the full ctx_doctor output from the agent, unchanged: Environment lines, every row, every Detail and Fix cell>
<the full output of `context-mode doctor --agents <agent>`>
```

### What happened

<what context-mode did, with the exact error text and the byte count>
Cause (when you found it): <file and line, for example src/adapters/claude-code.ts line 120, and one sentence>

### Hook errors

<lines of hook-errors.log around the failure, UTC>

### Journal rows

<rows from the sqlite command in section 1>

### Agent config

<the agent's context-mode entries, secrets as <masked>>

### Expected

<what should happen, with the byte count>

### Steps

Reproduced: yes (2 of 2)
1. <fresh project: mktemp -d, then the agent's own install command>
2. <the prompt or the exact command>
3. <the tool call>
4. Actual: <what context-mode did, with the byte count>; the denied tool was <tool> and the alternative it gave was <tool>
5. Newest next: <version>, result: still fails or fixed

```text
<the exact command and its exact output, unchanged>
```

### Environment

context-mode version: <x.y.z>
Install route: <native command>
Agent and version: <name x.y.z>
OS and arch: <os arch>
Node version: <vXX.Y.Z>
Filed by: <your agent name, version, model id>
````

## 6. A filled example

This body scores `repro-ready`: it has the doctor report, the versions, numbered steps from a fresh project, the exact output, expected and actual, and the source line.

````
### Summary

D5 hook round trip: PostToolUse returns a string for Read, Claude Code wants an object

### ctx-report

```text
Environment: context-mode 2.0.0 (30b95f7), agent claude-code 2.1.318
Environment: linux-x64, Node 24.21.0, shell /usr/bin/zsh
| Check | Status | Detail | Fix |
|---|---|---|---|
| D1 version | PASS | 2.0.0 (30b95f7): latest on npm | |
| D5 hook round trip | PASS | ok | |
(the other rows, D2 to D11, each one unchanged)
Run in a terminal: context-mode doctor --agents claude-code
```

### What happened

Claude Code prints the warning "PostToolUse:Read hook warning" (updatedToolOutput shape) on each Read of a large file (22 times in one session). The hook sends a 180 B string; Read's output is an object.
Cause: src/adapters/claude-code.ts, the replace step writes a string for every tool.

### Hook errors

(hook-errors.log holds zero lines)

### Journal rows

| kind | tool | bytes | ok | exit_code | created_at |
|---|---|---|---|---|---|
| read | Read | 41170 | 1 | | 2026-11-04T10:02:03.000Z |

### Agent config

agent settings (enabledPlugins): ~/.claude/settings.json (1 matching lines)
    "context-mode@context-mode": true

### Expected

Read keeps its object shape; the warning stays away; the agent sees a 180 B pointer in place of 41170 B.

### Steps

Reproduced: yes (2 of 2)
1. `export REPRO=$(mktemp -d); export HOME="$REPRO/home"; mkdir -p "$HOME"; cd "$REPRO"`
2. `claude plugin marketplace add mksglu/context-mode` then `claude plugin install context-mode@context-mode`
3. `head -c 30000 /dev/urandom | base64 > big.txt; wc -c big.txt` gives 40538 B
4. Send the PostToolUse Read payload for big.txt to the hook:

```text
$ CLAUDE_PLUGIN_ROOT=$P node $P/hook.mjs --agent claude-code < payload.json
{"hookSpecificOutput":{"hookEventName":"PostToolUse","updatedToolOutput":"ctx_search(...) searches the whole output (41170 B)."}}
```

5. Newest next: 2.0.0-next.40, result: still fails

### Environment

context-mode version: 2.0.0
Install route: claude plugin install context-mode@context-mode
Agent and version: Claude Code 2.1.318
OS and arch: Linux x86_64 (WSL2)
Node version: 24.21.0
Filed by: <agent name, version, model id>
````

Show the user the title and the full body, then send after the user agrees. The user owns the GitHub account:

```sh
gh issue create -R mksglu/context-mode --title "<check id or error code>: <short summary>" --label bug --body-file body.md
```

## 7. After you send it

The intake check comments within a minute, once per issue, and edits that same comment on each later edit. When its checklist lists missing items, fix the file and run `gh issue edit <n> -R mksglu/context-mode --body-file body.md`. The label moves to `repro-ready` when the body holds the version, the steps and the output. Issue state stays with the maintainer. This repo takes issues and keeps pull requests closed.
