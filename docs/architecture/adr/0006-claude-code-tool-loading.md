# ADR-0006: Claude Code tool loading: instructions carry routing; `ctx_execute` loads up front

- Status: Accepted (2026-10-15), after the re-probe below. Live probe 2026-10-23 on Opus 5.5 and Sonnet 5.5 confirmed it; no amendment. Q2 in TECH-SPEC §10
- Related: ADR-0004 · TECH-SPEC §3.1 and §3.6

## Context

Claude Code docs (code.claude.com/docs/en/mcp, fetched 2026-10-14):
- "Tool search keeps MCP context usage low by deferring tool definitions until Claude needs them. Only tool names and server instructions load at session start"
- "Tool search is enabled by default"
- "Server instructions help Claude understand when to search for your tools"
- Tool descriptions and instructions are cut at 2,048 chars (`CLAUDE_CODE_MAX_MCP_DESCRIPTION_LENGTH`, v2.1.280+).
- A server can mark a single tool with `_meta: {"anthropic/alwaysLoad": true}`. Whoever configures the server can override this per server.

Live probe, 2026-10-14, Claude Code 2.1.283, model `claude-haiku-4-5-20251001`. A stub MCP server sent an instructions phrase, a normal tool, and a tool marked `anthropic/alwaysLoad: true`. The model was asked to quote the phrases.

| Setting | Instructions | Normal tool description | alwaysLoad tool description |
|---|---|---|---|
| `ENABLE_TOOL_SEARCH=true` (user settings), 2 runs | visible | **NOT VISIBLE** | visible |
| `ENABLE_TOOL_SEARCH=false` | visible | visible | visible |

## Decision

1. The instructions are written for tool search. They say what kind of work the tools do and when to search for and use them (ADR-0004).
2. `ctx_execute` carries `_meta: {"anthropic/alwaysLoad": true}`, so its full description and schema are in context from the first turn. All other tools stay deferred.

## Consequences

- One description (≤ 1,024 chars, PR7) is always in context in Claude Code.
- The most common routing decision (run a command in the sandbox instead of Bash) needs no tool-search step.
- Other agents ignore `_meta`, so the change is harmless there.
- GP-LIVE-ROUTING compares "alwaysLoad on" with "alwaysLoad off" before release. If "off" routes as well as "on", the flag is removed.

## Alternatives considered

- **No alwaysLoad:** every context-mode call needs a ToolSearch step first.
- **alwaysLoad on all 9 tools:** about 8,000 chars always in context, which undoes the purpose of tool search.

## r3 decision (2026-10-14, `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/review/DECISIONS-r3.md`)

- Q19: re-probe alwaysLoad on Opus and Sonnet in the keyless harness before Accepted. Confirmed (fix-r4, B68): this re-probe must run before release sign-off; this ADR carries no v1-behavior risk forward, so no other doc change is needed here.

## Re-probe 2026-10-15 (Opus 5.5 and Sonnet 5, effort low)

24 real sessions, keyless (`https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/spikes-r5/ADR-0006-reprobe.md`). Over-routing = small task whose first tool is ctx; under-routing = large task whose first tool is native.

| Model | alwaysLoad | Over-routing | Under-routing | Correct answers |
|---|---|---|---|---|
| Opus 5.5 | off | 0/3 | 3/3 | 6/6 |
| Opus 5.5 | on | 0/3 | **1/3** | 6/6 |
| Sonnet 5 | off | 0/3 | 3/3 | 6/6 |
| Sonnet 5 | on | 0/3 | 3/3 | 6/6 |

Decision: keep alwaysLoad on `ctx_execute`. It moved Opus to the sandbox on 2 of 3 large tasks, cost no over-routing on either model, and did not hurt Sonnet. It does not fix Sonnet: under-routing on Sonnet is handled by ADR-0008 enforcement (deny), not by tool loading. One run per cell; the live harness repeats this A/B before each release.

## Live probe 2026-10-23 (Opus 5.5 and Sonnet 5.5, keyless harness, ADR-0012)

30 real sessions, n = 5 per model per case (large, small, description quote). Raw counts: `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/spikes/adr-0006-probe.md`.

| Measure | Opus 5.5 | Sonnet 5.5 |
|---|---|---|
| `ctx_execute` description visible at start | 5/5 | 5/5 |
| `ctx_search` description visible at start (deferred) | 0/5 | 0/5 |
| Large task, ctx tool first | 4/5 | 3/5 |
| Large task, under-routed (bytes rule) | 0/5 | 0/5 |
| Small task, over-routed | 0/5 | 0/5 |
| Correct answers | 10/10 | 10/10 |

Result: Decision 1 and 2 hold on both models. `ctx_execute` is loaded up front, the other tools stay deferred, and there was no over-routing. Status stays Accepted. Only the "on" arm ran, so the "off" comparison and the remove-the-flag check stay with GP-LIVE-ROUTING. Sonnet used the sandbox first on 3/5 large tasks here, where the 2026-10-15 re-probe saw 0/3; the sample, scoring rule and effort differ, so this is not claimed as a gain from alwaysLoad.
