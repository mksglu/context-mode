# PRD: `context-mode setup`

- Status: Draft (2026-10-22). Decision record: ADR-0019.
- Owner goal: "the most robust install tool there is". Two commands, interactive, every step verified, nothing left to the user, every failure becomes an issue report.

## Problem

| Today (v2-design, 2026-10-22) | Effect on the user |
|---|---|
| 10 install docs, 10 methods | the user must find their agent's page and its method |
| files at `~/.context-mode-app`, path written into each config | 5 agents need a `node -e` config writer; Windows needs a second form |
| no check after install | a broken install shows up later, inside the agent, with no clear cause |
| v1 users | no single upgrade command; v1 entries stay in configs |
| "does my agent work?" | no answer without reading docs |

## Users

| User | Needs |
|---|---|
| New user, one agent | two commands, done, proof it works |
| New user, several agents | one run sets up all of them |
| v1 user | one run replaces v1 entries, nothing else changes |
| User of an agent we do not support | a clear "not supported" and a way to ask for it |
| Team / CI | same result with no prompts, JSON output, exit code |
| Company with policy on prompt files | a guarantee that no instruction file is touched |

## User stories and acceptance

1. **Install.** `npm i -g context-mode && context-mode setup`. Pass: on a clean machine with any supported agent, setup ends with PASS for that agent, and the first live session in that agent shows the context-mode tools and a working hook.
2. **See what works.** Setup shows each detected agent as full, MCP only, or not supported, with a reason. `context-mode setup --list` shows the table with no changes.
3. **Choose.** Arrow-key multi-select; detected agents pre-selected.
4. **See before change.** A plan with the exact command or config diff per agent. `--dry-run` stops there.
5. **Trust the result.** Each agent is verified after the write (entry parses, agent lists it, server answers `tools/list`, hook answers its golden payload within budget, doctor checks pass). A failed agent is rolled back; the others stay.
6. **Undo.** `context-mode setup --remove` restores every touched file byte for byte.
7. **Run again.** A second run changes nothing and says so.
8. **Fix later.** `context-mode doctor` shows the same checks; on FAIL it offers "fix now". `/ctx-doctor` inside an agent prints the exact command to run.
9. **Upgrade from v1.** `npm i -g context-mode@2 && context-mode setup` finds v1 entries (per agent list in [S-V1](spikes/setup/S-V1.md)), shows them in the plan, replaces them. v1 hook commands (`context-mode hook <platform> <event>`) keep working between the install and the setup run (ADR-0019 O3). v1 entries for agents v2 does not support are offered for removal only.
10. **Report a failure.** On any FAIL setup shows a redacted debug report and asks once to open an issue (`gh issue create` or a prefilled URL). Nothing is sent without a keypress.
11. **No prompt files.** Setup, doctor and upgrade never write `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `QWEN.md`, `.github/copilot-instructions.md`, `.cursorrules` or steering files. Doctor may offer to remove a v1 routing block, with a diff and consent.
12. **Scripts.** `--yes --agents codex,gemini --json` runs with no prompts and exits non-zero on any FAIL.

## Robustness requirements

| Risk | Requirement |
|---|---|
| Config file the user broke | refuse, report the parse error with line and column, never rewrite |
| Crash or Ctrl-C mid-write | temp file + rename; lock file; next run finishes or rolls back |
| Two setups at once | lock; the second waits or exits with a clear message |
| Agent changed its config format | verify step fails, rollback, report with the agent version |
| PATH changes (nvm, fnm, Volta) | configs hold the absolute path of the installed package; doctor checks it still exists |
| Windows | no `.cmd` in configs; `node <abs path>`; paths quoted |
| No TTY | non-interactive mode, never hangs on a prompt |
| Network | setup needs none, except the agent's own install command (Claude Code marketplace, Gemini/Qwen extension); a timeout there is reported, not retried forever |
| Secrets | reports redact home dir, env values, tokens, file contents beyond context-mode keys |

## Non-goals

- No edits to instruction files (ADR-0004, D11).
- No silent issue filing.
- No support promise for agents outside the adapter table.
- No GUI.

## Metrics

| Metric | Target |
|---|---|
| Clean-machine setup PASS, per supported agent, in CI | 100% |
| Setup median time, one agent, warm npm cache | under 10 s |
| Issues per 1,000 npm downloads tagged `setup` | tracked weekly; falls release over release |
| Fault-injection cases leaving a partial file | 0 |
| Instruction files written | 0 (guard test) |

## Rollout

1. Spikes done 2026-10-22 (ADR-0019 "Results", synthesis [S-SYN](spikes/setup/S-SYN.md)): S-PATH, S-EXT PASS; S-UI PASS on macOS only; S-NPM, S-HOOK, S-V1 FAIL. ADR-0019 is Accepted (PO on delegation 2026-10-22); O2 and O3 are closed by D3 and D4; S-V1 gets one fixture test per row; S-UI pty runs on Linux and Windows; S-PATH runs nvm, fnm, Volta; S-EXT gets a golden Gemini payload. S-NPM closes at step 3, with the first real `next` publish (needs O1 first).
2. Build `setup`, `doctor` CLI, shared check registry; tests per ADR-0019.
3. Owner sets up the npm trusted publisher (O1, the only open owner step). `release.yml` job `publish-npm` (environment `npm-publish`, OIDC, `--provenance`) publishes `context-mode@2.0.0` with dist-tag `next`; the provenance check closes S-NPM. Owner tests on own machines. The git `release` branch stays only for git-based installers.
4. Owner moves `latest` by hand (one approval), only after D4 (v1 hook and `mcp` forms accepted, doctor flag, setup rewrite) is built and tested. README and one install page switch to the two commands.
5. Per-agent docs shrink to troubleshooting.

## Open questions

All closed on 2026-10-22 by the product owner (PO) on delegation; the owner reviews in the morning. Full text: ADR-0019 "Owner decisions".

1. **O1, npm trusted publisher** (S-NPM): still an owner step on npmjs.com and GitHub. Not closed by the PO.
2. **O2, hook budget rule**: closed by D3. Hook overhead (hook wall time minus bare `node -e ''` wall time, same host, same run) p95 <= 15 ms is gated; wall p95 is reported only.
3. **O3, v1 hook commands after `npm i -g context-mode@2`**: closed by D4. v2 accepts `hook <platform> <event>` and `mcp`; doctor flags "v1 form, run context-mode setup"; setup rewrites to `node "<abs>/hook.mjs" --agent <id>`.
4. **Issue filing**: closed by D6. Show the redacted report, ask once, `gh issue create` if logged in, else a prefilled URL; never send without a keypress.
5. **Package, channel, prompt UI, CLI conventions**: D1, D2, D5, D7 in ADR-0019.
