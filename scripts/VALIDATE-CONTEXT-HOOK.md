# Validate Pi context-hook injection

This checklist validates the runtime assumption behind the Pi adapter cache fix: dynamic context should be delivered as a trailing message, while the system prompt remains stable.

## What to verify

For at least two consecutive Pi turns with this branch installed:

1. `before_agent_start` returns no `systemPrompt` override.
2. The provider payload keeps the same first/system message hash between turns.
3. The `context` hook appends one trailing `user` message for the turn.
4. The trailing message contains the context-mode routing anchor.
5. After a compaction/resume path, the trailing message contains `session_resume`.
6. The dynamic trailing message is not persisted into the saved session history for future turns.

## Minimal instrumentation

Add temporary local logging around the Pi adapter hooks while validating:

```ts
// inside before_agent_start after context assembly
console.error("[context-mode/pi] before_agent_start", {
  returnedSystemPrompt: false,
  pendingContextBytes: _pendingContext.length,
});

// inside context hook after event.messages.push(...)
console.error("[context-mode/pi] context", {
  beforeCount,
  afterCount: event.messages.length,
  trailingRole: event.messages.at(-1)?.role,
  hasRoutingAnchor: String(event.messages.at(-1)?.content ?? "").includes("context-mode active"),
  hasResume: String(event.messages.at(-1)?.content ?? "").includes("session_resume"),
});
```

When provider debug output is available, also hash the first/system message in the payload for each turn and confirm the hash does not change.

## Expected result

Example successful shape:

```text
Turn 1: systemHash=<same> messages=2→3 trailing=user routing=true resume=false
Turn 2: systemHash=<same> messages=2→3 trailing=user routing=true resume=false
After compact/resume: systemHash=<same> messages=2→3 trailing=user routing=true resume=true
```

The important cache precondition is the stable prefix: the system message and existing conversation prefix must remain unchanged, while context-mode dynamic content moves to the request-local trailing message.
