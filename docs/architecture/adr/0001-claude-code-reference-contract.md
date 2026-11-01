# ADR-0001: Claude Code is the reference contract

- Status: Accepted (2026-10-13)
- Related: PRD-v2 §6 and §15.3 · README §6 · `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/spike-hooks-verified.md` · ADR-0004

## Context

v2 supports 10 agents (README §3). Their hook events, payloads and decision fields differ; `spike-hooks-verified.md` has one row per agent. v1 handled these differences inside each adapter with runtime fallbacks, so a bug could not be traced to a single code path.

## Decision

1. The canonical hook contract is the Claude Code hook schema:
   - Events: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`.
   - Decisions:
     - `allow`: no output.
     - `hint`: `additionalContext`.
     - `deny`: comes only from the user's policy file.
   - A tool error is read from the `is_error` / error field already inside the `PostToolUse` payload (`https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/spike-hooks-verified.md`). This is not a separate event; there is no distinct "tool failed" event in the canonical contract.
   - `PreCompact`, `Stop`, `SubagentStop`, `SessionEnd` and `Notification` exist in Claude Code but are out of this canonical scope. They are used only where the per-agent gap table (README §6 "Gaps") names them for a specific agent; otherwise the adapter does not read them. This is a stated omission, not an oversight.
2. The canonical tool contract is the server's MCP `tools/list` and `tools/call` surface. It is byte-identical for every agent (ADR-0005, rule PR9).
3. An adapter only does two things:
   - decodes native input into the canonical form
   - encodes the canonical result into native output

   It holds no prompt text, no routing logic and no state. Target size: 30–80 lines.
4. When an agent lacks an event or a field, the adapter maps it to exactly **one** documented native mechanism (README §6 "Gaps"). The adapter never picks between paths at runtime.

## Consequences

- Each agent has one behaviour path, so a failure points to one adapter function.
- Gaps are accepted, not patched over. Example: Gemini, Pi and OpenCode 2 have no hint on allow. On those agents the hint exists only in the tool descriptions.
- Adapters are tested by E2E-style golden files built from recorded native payloads (ADR-0003, GP3).

## Alternatives considered

- **Our own neutral schema.** Rejected: it would add a translation layer for the reference agent as well.
- **Extra per-agent features.** Rejected: they break the one-path rule (P1).

## Changes

- r4: named the real error-detection mechanism (`is_error` field inside `PostToolUse`, not a separate event) and added the out-of-scope event list (`PreCompact`, `Stop`, `SubagentStop`, `SessionEnd`, `Notification`) so their absence reads as a decision.
