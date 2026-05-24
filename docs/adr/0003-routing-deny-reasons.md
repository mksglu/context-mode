# ADR-0003 — Routing deny reasons: redirect ≠ restriction

- **Status**: Accepted — amended 2026-05-24 (PR #683 follow-up) to drop the
  `"NOT a network restriction"` negation prescription; see §Amendment.
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

- **Opening verb**: `"redirected to <ctx_tool>"` — affirmative routing
  intent, no negation, no org-rationale (the agent's job is to act on the
  redirect, not to audit policy).
- **MUST affirm capability**: `"<ctx_tool> has full network access"`
  (positive frame of the same signal the old `NOT a network restriction`
  parenthetical tried to deliver — and the same signal the
  `for context-window efficiency` rationale prescription also tried to
  deliver before the 2026-05-24 second amendment).
- **MUST specify**: the alternative tool to use, by name, as an
  imperative call (e.g. `Call ctx_fetch_and_index(url, source) now`).
- **MUST end with**: a positive imperative retry hint —
  `"Retry the same call on a transient DNS error (EAI_AGAIN,
  ETIMEDOUT, ENETUNREACH)"`.
- **MUST NOT contain**: bare-NOT negations (`NOT a network restriction`,
  `Do NOT retry with curl`, etc.). See §Amendment below for the
  empirical rationale.
- **MUST NOT contain**: org-rationale prefaces (`for context-window
  efficiency`, `for performance`, etc.). The redirect verb + the
  capability affirmation already carry the full action signal; rationale
  is metadata, not action input. See §Second amendment below.

The word `BLOCKED` MUST NOT appear bare in CASE A. It is reserved for
true policy denial (CASE B) where the agent's correct response IS to
stop and inform the user.

### CASE B — True security / policy restriction

The action is denied per deny pattern, security gate, or unsupported
sandbox capability.

- **Opening verb**: "denied" or "blocked by security policy"
- **MUST cite**: the pattern or rule violated
- **MAY suggest**: a safe alternative

## Amendment (PR #683 follow-up, 2026-05-24)

The original CASE A rubric required the parenthetical `"this is NOT a
network / security restriction"`. Mert flagged on review that this
prescription itself violates ADR-0002 rubric #2 (affirmative beats
negation): the bare-NOT construct primes the very frame it tries to
deny (ironic process theory). `TOOL-DESCRIPTIONS-AUDIT.md §2 Probe 3`
already documented this — the NOT-parenthetical regressed Haiku
capitulation rate from 0/6 → 2/6 vs the original "blocked" wording.

PR #654 fixed the headline word (`blocked` → `redirected`) but kept the
sibling negation in the very next clause. PR #683 follow-up
(this amendment) eradicates the negation construct entirely:

- Replace `"(context-window optimization, NOT a network restriction)"`
  with the affirmative sentence `"<ctx_tool> has full network access."`
  (originally also prescribed a `"for context-window efficiency"` opening
  preface — see §Second amendment below for why that prescription was
  dropped).
- Replace `"Do NOT retry with curl/wget"` with positive
  `"Retry the same call on a transient DNS error (...)"` — the
  affirmative retry hint IS the next-action signal; the prohibition was
  redundant once the routing is correct.

## Second amendment (PR #683 mid-review, 2026-05-24)

Mert flagged on review of the first amendment: the prescribed opening
`"redirected to <ctx_tool> for context-window efficiency"` itself
carries org-rationale that the agent does not need to act. The agent's
job is to (a) understand a redirect happened, (b) make the correct next
call, (c) know it has the capability to do so, (d) know when to retry.
"For X reason" is post-hoc justification — pure prompt overhead.

Compare to HTTP 301 `Moved Permanently` — the response carries `Location:
<new-url>` and the client uses it. The server never appends
`"for SEO efficiency"` or `"for caching strategy"`. The redirect verb
+ the new target are the entire action signal.

The capability affirmation (`"<ctx_tool> has full network access"`)
already delivers the substantive content the rationale was trying to
carry — that this is a routing optimization, not a capability denial.
The rationale preface was double-encoding that signal.

The four CASE A sites in `hooks/core/routing.mjs` (L707 curl/wget,
L738 inline HTTP, L751 build tool, L804 WebFetch) all conform to the
second-amended rubric after this PR. A contract test in
`tests/core/server.test.ts` (`ADR-0003 CASE A: routing.mjs redirect
deny reasons`) locks the rule: every CASE A string MUST open with
"redirected", MUST NOT contain bare uppercase `BLOCKED`, MUST name at
least one `ctx_*` alternative, MUST NOT contain `"NOT a network"`,
MUST NOT contain `"Do NOT retry"`, MUST NOT contain
`"for context-window efficiency"` (or sibling org-rationale prefaces).

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
