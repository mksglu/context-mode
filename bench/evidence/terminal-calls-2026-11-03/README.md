# Terminal calls, 2026-11-03

Live calls of `ctx_index`, `ctx_search`, `ctx_resume`, `ctx_stats`, `ctx_doctor` and `ctx_purge`, shown in the README in the form the Claude Code terminal shows them.

- Date: 2026-11-03
- Version: Context Mode 2.0.0-next.36 (built from commit 8facf27 with `node build/build.mjs --out release-out --version 2.0.0-next.36 --sha <commit>`)
- Agent: Claude Code MCP client form (`setup --agents claude-code` first); the calls go over stdio MCP to `release-out/server.mjs`
- Data: a copy of `docs/how-it-works.md` (11,577 B) in a new temp project folder, with a new temp HOME
- Order: `ctx_index`, `ctx_search`, `ctx_resume`, `ctx_stats`, `ctx_doctor`, `ctx_purge`, one `tools/call` each

`calls.json` holds each call's input, its full reply text and its byte counts. Run it again:

```sh
node build/build.mjs --out release-out --version 2.0.0-next.36 --sha $(git rev-parse HEAD)
node bench/evidence/terminal-calls-2026-11-03/calls-live.mjs . bench/evidence/terminal-calls-2026-11-03/calls.json
```
