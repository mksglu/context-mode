# Pi context hook concurrency analysis

This PR adds a module-level `_pendingContext` buffer so `before_agent_start` can build dynamic Pi context without mutating `systemPrompt`, and the later `context` hook can append that context as a trailing user message.

## Current Pi runtime assumption

The implementation relies on Pi's current process model:

- One interactive Pi session runs in one extension host process.
- Subagents are launched as separate OS processes, so their module-level state is isolated.
- Pi calls `before_agent_start` before the `context` hook for a provider request.
- The `context` hook receives the mutable `event.messages` array that is used for that request.

Under this model, `_pendingContext` is scoped to a single in-flight agent request in the process. The `context` hook clears it immediately after appending the trailing message, so the context is one-shot and does not persist into session history.

## Why this is not uniquely riskier than existing state

The Pi adapter already uses module-level process state for `_sessionId`, `_db`, `_dbPath`, `_mcpBridge`, and cached injection helpers. If Pi were to run multiple unrelated sessions in the same process, those existing singletons would also need to become per-session state.

`_pendingContext` follows the same current adapter contract. It is reset at the start of `before_agent_start` and also reset in the catch path to avoid stale context if context assembly fails.

## Hypothetical multi-session-per-process risk

If a future Pi runtime multiplexes multiple independent sessions through the same extension process and interleaves their hooks, one session's pending context could overwrite another session's pending context before the `context` hook consumes it.

That future runtime would require refactoring the adapter's module-level state into a keyed structure, for example:

```ts
const stateBySession = new Map<string, SessionState>();
```

The key should come from Pi's stable session identity, and it should cover `_sessionId`, DB handles, MCP bridge state, and pending context together.

## Validation target

The regression tests in `tests/pi-extension.test.ts` verify the important current-runtime behavior:

- `before_agent_start` does not return a modified `systemPrompt`.
- The later `context` hook appends a trailing `user` message.
- Resume context reaches that trailing message.
- Existing system/user messages are preserved unchanged, which keeps the provider prefix stable.
