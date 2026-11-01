# ADR-0021: Prompt-cache safety

- Status: Accepted.
- Evidence: `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/spikes/cache/RESULT.md`. Deviation: D-CACHE-PI-1.

## Context

A cache hit needs an identical prefix: tools, system prompt, then history in order. Any v2 text that edits earlier bytes makes the provider write the prefix again. Pi did this on every second turn.

## Decision

Rules the code follows:

1. `tools/list` and `initialize` are byte-identical across starts. The server never sends `list_changed`. Tool text and instructions are build-time literals with no dynamic tokens.
2. Between two compactions, the system prompt a host sees is byte-identical on every turn. Pi returns `base + payload` each turn, never `{}`.
3. Hook text is static per session. It goes through the host append channel (tool result or user turn). Where a host has only a system prompt channel, text is appended once and never edits earlier bytes.
4. A compaction in one session does not change the system payload of another session. Pending-compact markers are keyed by session id.
5. A compact turn may rewrite the prefix. It is exempt; the next call is measured and recorded.

## Guard tests

- `tests/plugins/pi-cache.test.mjs`: prompts identical on turns 1 and 2, INSTRUCTIONS once.
- `tests/plugins/opencode-cache.test.mjs`: session B payload unchanged after a compaction in session A.
- `e2e/live/cache/analyze.test.mjs`, `tests/cache/codex-usage.test.mjs`: break and hit-ratio analysis.
- `tests/cache/prefix-determinism.test.mjs`: `initialize` and `tools/list` bytes across 5 starts per agent, no `list_changed`, pi and opencode system bytes across turns.
- `build/check-prompt-static.mjs` (gate `ci-checks`, `ci.yml`): no dynamic token in instructions or tool descriptions.
- Live runs: `e2e/live/cache/run.mjs`, `e2e/live/cache/codex.mjs`.

## Consequences

Pi and compact-state text must not drift between turns. Open: cross-session read below 0.9 on two hosts in both arms (RESULT.md).
