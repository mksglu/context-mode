# ADR-0014: Issues only, with a typed `ctx_doctor` debug report; no pull requests

- Status: Accepted (2026-10-15). Owner: "PR istemiyorum; issue için v2'de çok iyi debug output; v1'de bunlar çalışmıyor". Owner accepted `DECISIONS-r3.md` Q18 (maximum debug data, only secrets stripped) in full.
- Evidence: workflow `wf_5b7e35b3-72f`, topic `templates-debug`. Raw output: `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/round4-evidence.json`. Tested drafts: `/tmp/wf4/sk/gh/{bug,config,feature}.yml`.

## Why v1 debug output fails

- `ctx-debug.sh` uses bash-only syntax and fails under POSIX sh (#1242).
- Redaction is done with regex and leaks secrets (#1141, #1144, #1155).
- The report is about 1,100 lines of raw text, with env values and paths.
- Several checks stay green on broken states (#1014, #1152).
- The form asks for a script that some v1 tarballs do not even ship (#889).

## Decision

### 1. `ctx_doctor` always answers

- The server never imports `node:sqlite` statically.
- If Node or `node:sqlite` fails the precondition, the server still completes the handshake and lists one tool, `ctx_doctor`. That tool returns the report with the failing row and a one-line fix.
- This is a degraded start, not a fallback: there is no CLI and no second script.

### 2. The report

The report is a fixed list of `key: value` lines:
- It starts with `ctx-report: 1` and ends with `digest: <sha256>`.
- Worst case is 2,652 B over 38 lines; the limit of 4,096 B holds by construction.

| Rows |
|---|
| version, commit, latest_release, agent + version, install mode, os, node + node:sqlite + fts5, MCP protocol versions |
| enforcement mode, config diff counts, v1 leftovers (up to 8 rows plus a count of the rest) |
| project source, path facts (`has_space`, `non_ascii`, `max_len`; no path text) |
| db integrity + live busy probe, index counts (an empty index is visible) |
| 4 hook round trips (median/max ms), hook error codes over 7 days (top 5 plus a count of the rest) |
| `deny_7d`: total / followed / alt_failed / abandoned, which proves whether denies were dead ends |
| checks D1–D10 |

The `v1_leftover_1..8`, `hook_error_1..5` and `check_d1..d10` keys must match `issue-intake.mjs`'s `ALLOWED_KEYS` list exactly, line by line; any key missing from either side is a bug, not a choice (closes #1144 once the diff is clean).

### 3. Redaction by structure, not regex

- Every value passes a typed scanner: int, semver, hex40, date, enum, bool, or a JSON pointer whose segments are in our own generated schema.
- A value that fails the scanner becomes `<invalid>`. It is dropped whole, never cut.
- Raw paths, env values, config values, file bodies, error messages and command lines cannot appear in this typed block; only typed facts about them pass through (for example `has_space`, `non_ascii`, `max_len` for a path, not the path text). Per Q18, the free-text sections the agent writes itself (`What happened`, `Expected`, `Steps`) may still carry real path text, logs, and transcript excerpts — only secrets are stripped there.
- Error codes come from a closed enum in `src/errors.ts`.
- `issue-intake.mjs` also runs a substring scan (no regex) over `Summary`/`What happened`/`Steps` for known secret prefixes (`github_pat_`, `sk-`, `TOKEN=`) and for path markers (`/Users/`, `/home/`, `C:\`), flagging a match for the fix comment rather than blocking the issue.
- The reporter is an AI agent (owner rule). It must send the full `ctx_doctor` report, paths, logs, versions, hook and deny journal rows, the steps, and transcript excerpts of the failing turns. Only secrets are removed: tokens, keys, `.env` values, Authorization headers. The intake files that encode this rule are in `https://github.com/mksglu/context-mode/tree/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/review/agent-issue-intake/` (`AGENT_ISSUE.md`, `BODY-FORMAT.md`, `DO-NOT-SEND.md`, `VALIDATION.md`, `issue-intake.yml` plus scripts); they must match this rule.

### 4. Storage

Two small tables, both pruned to 7 days in the same transaction:
- `hook_error_day(code, hook, day, count)`
- `deny_day(day, alt, denied, followed, alt_failed)`

A healthy hook adds 0 ms, because the error path runs only on errors.

### 5. GitHub files

| File | Content |
|---|---|
| `ISSUE_TEMPLATE/bug.yml` | Only v2 gets fixes. "Run `/ctx-doctor`, or tell the agent: call the ctx_doctor tool." Dropdown "did doctor run?" with fixed No reasons; the report textarea (`render: text`); a required `node --version` input; what happened / expected / steps (steps must name the denied tool and the alternative it gave); 2 required checkboxes. Label `bug` |
| `ISSUE_TEMPLATE/config.yml` | `blank_issues_enabled: false`; links to security advisories and to README#install |
| `ISSUE_TEMPLATE/feature.yml` | agent dropdown, problem, evidence links; "context-mode does not accept pull requests" |
| removed | `PULL_REQUEST_TEMPLATE.md`, `bug_report.yml`, `feature_request.yml`, and the `pull_request:` triggers in CI |
| `CONTRIBUTING.md` | issues only, with the doctor report |

Pull requests stay disabled in the repo settings (already off, verified).

### 6. Owner steps

1. Turn Issues back on and enable private vulnerability reporting, when v2 ships.
2. Create the labels.
3. Close the v1 issues with the label `v1-frozen` and a pointer to the v2 form.

## Tests

GP11 runs as a pure-function golden test with no key. It seeds secrets (`TOKEN=…`, `github_pat_…` in clientInfo, a HOME path with a space, a secret inside an error message) and asserts:
- none of those bytes appear in the output
- `has_space=yes`
- the report is under 4,096 B
- the digest verifies

The local harness (ADR-0012) also checks that the block reaches the model byte for byte, and checks the degraded start with `node:sqlite` blocked.

## Changes

r4 fix pass: rewrote §3's redaction row and the intake files to state the Q18 rule directly (paths/logs/command output allowed in free text, only secrets stripped) instead of carrying the old v1-style "nothing raw" wording as a superseded footnote; added the `issue-intake.mjs` substring scan and the `ALLOWED_KEYS` match requirement.
2026-10-15: status set to Accepted; folded the r3 Q18 section (maximum debug data, only secrets stripped, and the intake-file list) into §3 above and removed the standalone r3 section.
