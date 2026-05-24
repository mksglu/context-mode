# ADR-0003 — Routing deny reasons: redirect ≠ restriction

- **Status**: Accepted
- **Date**: 2026-05-24
- **PR**: #683 (substitutes #654)
- **Motivating bug**: kerneltoast / @noctivoro / Mert reproduced on Opus 4.6
- **Reviewers**: owner Mert

## Context

`hooks/core/routing.mjs` returns deny reasons for intercepted Bash, Read,
Grep, and WebFetch calls. These reasons are displayed to the agent at
runtime and shape the agent's next-action decision. PR #654
(`kerneltoast`) reproduced that the bare word `"blocked"` in WebFetch's
deny reason (`"WebFetch blocked"`) was misread by Opus 4.6 as a
network / security restriction, causing the agent to capitulate to
training data instead of using the redirected tool.

The intent of the routing layer is to **redirect** the agent to a
context-efficient alternative (`ctx_fetch_and_index` for WebFetch,
`ctx_execute` for large-output Bash). It is NOT a security gate, and
its denial text MUST NOT read like one.

There is a real, separate set of denials in `routing.mjs` that ARE
security restrictions: the deny-pattern check (curl to private IPs,
sensitive-path reads, etc.). Those denials are correct to read like
restrictions — they are restrictions.

The bug PR #654 caught was that a single deny-reason string in CASE A
was using the vocabulary of CASE B. The fix is to formalize the
distinction so any future hook author cannot make the same mistake.

## Decision

Routing deny reasons MUST distinguish two cases:

### CASE A — Routing redirect

The action is supported, via a different tool, for context-window or
efficiency reasons.

- **Opening verb**: "redirected"
- **MUST state**: "this is NOT a network / security restriction"
- **MUST specify**: the alternative tool to use
- **MUST end with**: an imperative next-action — e.g. "retry if it fails
  with a transient error (EAI_AGAIN, ETIMEDOUT, ENETUNREACH)"

The word `BLOCKED` MUST NOT appear bare in CASE A. It is reserved for
true policy denial (CASE B) where the agent's correct response IS to
stop and inform the user.

### CASE B — True security / policy restriction

The action is denied per deny pattern, security gate, or unsupported
sandbox capability.

- **Opening verb**: "denied" or "blocked by security policy"
- **MUST cite**: the pattern or rule violated
- **MAY suggest**: a safe alternative

## Consequences

- PR #654's wording fix (`"blocked"` → `"redirected"`) becomes formal
  policy.
- PR #683 already lands the wording change at
  `hooks/core/routing.mjs:804` and adds the `EAI_AGAIN | ETIMEDOUT |
  ETIMEOUT | ENETUNREACH | EPERM` transient-DNS retry hint to both
  `routing.mjs` (WebFetch denial) and `src/server.ts:2783-2795`
  (`ctx_fetch_and_index` subprocess fetch failure) so the two surfaces
  speak with one voice.
- Existing `routing.mjs` deny reasons audited for CASE A / CASE B
  classification:
  - L707 (curl / wget redirect) — CASE A
  - L738 (inline HTTP redirect) — CASE A
  - L803 (WebFetch redirect) — CASE A
  - L652, L844, L862, L873, L894 (security deny patterns) — CASE B
- Test substring expectations in `tests/hooks/*` updated where they
  asserted the literal word `"blocked"` for CASE A paths.
- A future contract test on `routing.mjs` deny reasons (similar to PR
  #683's `tool description style contract`) is out of scope here but
  recommended as a follow-up — the rule is already mechanically
  checkable.

## Alternatives considered

- **Keep "blocked" everywhere; document the convention.** Rejected —
  documentation doesn't change LLM behaviour, the wording does. PR
  #654's empirical reproduction is the disqualifying evidence.
- **Remove the denial path entirely; just silently invoke the
  alternative tool.** Rejected — the agent needs to know its tool call
  was rerouted (for telemetry, for the user-visible audit trail, and so
  it can adjust its plan).
- **Use the same wording in both cases, distinguish by exit code.**
  Rejected — the agent reads the prose, not the exit code, when
  deciding whether to retry or capitulate.

## References

- PR #654 (kerneltoast) — original bug report and reproduction
- PR #683 — implementation + ADR
- ADR-0002 — Tool description voice and structure (companion ADR,
  same PR)
- `TOOL-DESCRIPTIONS-AUDIT.md` §2 — PR #654 verdict and probe evidence
