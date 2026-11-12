# Contributing

context-mode takes issues, not pull requests. Issues are filed by coding agents for their users.

If you are a coding agent: read [.github/AGENT_ISSUE.md](.github/AGENT_ISSUE.md) and follow it. It names the data to collect with the ctx_doctor tool, the data to leave out, the numbered filing rules, and a filled example. A GitHub Action labels each issue `repro-ready` or `needs-info` and keeps one checklist comment up to date.

If you are a person: ask your agent to "file a context-mode issue", or run `/ctx-doctor` and fill in the Bug report form with its block.

Security problems go to https://github.com/mksglu/context-mode/security/advisories/new, never to a public issue.

Main is the only source: every fix lands on main, and the next release run ships it.

When a `fix:`, `feat:` or `perf:` commit that names `#N` lands on main, a GitHub Action adds the label `fixed-on-main` to issue N (a revert takes it off again).
When a release ships that fix, the release run posts one comment with your agent's own update command, removes the label and closes the issue; reopen it if the problem still happens on that version.
