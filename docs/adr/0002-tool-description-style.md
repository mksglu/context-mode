# ADR-0002 — Tool description voice and structure

- **Status**: Accepted
- **Date**: 2026-05-24
- **PR**: #683 (substitutes #654)
- **Supersedes**: organic, undocumented description drift
- **Reviewers**: owner Mert, empirical A/B (38 trials × 6 probes on Haiku + Sonnet)

## Context

`context-mode` registers 11 `ctx_*` MCP tools via `server.registerTool()` in
`src/server.ts`. Each tool description is read by every host LLM
(Claude / GPT / Gemini / Llama / …) at tool-selection time. Over many releases
the corpus drifted toward forbidding language — `MANDATORY:`, `NEVER`,
`Do NOT`, `REFUSAL RULES`, `DESTRUCTIVE`, `NON-NEGOTIABLE`, `PREFER` — because
descriptions were patched defensively after each misroute. There was no
documented style guide and no contract test, so each new tool inherited
whichever voice the previous author preferred.

PR #654 (kerneltoast) surfaced the cost of that drift: the single
hortatory word `"blocked"` in a routing deny reason was misread by
Opus 4.6 as a safety/network restriction, causing the agent to capitulate
to training data instead of using the redirected tool.

A full audit (see `TOOL-DESCRIPTIONS-AUDIT.md`) ran 38 A/B trials across
6 empirical probes on Haiku and Sonnet against the current descriptions
and proposed rewrites. Findings:

- Heavy forbidding framing degrades tool selection on some tools (mild
  but reproducible).
- Heavy framing **improves** parameter fidelity on small models for
  complex-contract tools (`ctx_purge` Probe 4: 5/5 vs 3/5). The
  intuition that "softer == safer" is wrong for at least one tool, so
  rewrites cannot be one-size-fits-all and **must be probe-gated**.
- PR #654's `"blocked"` → `"redirected"` wording fix is genuinely
  corrective on Opus 4.6 (6/6 → 0/6 capitulation on the stress probe),
  invisible on Sonnet (6/6 capitulate either way), and mildly regressive
  on Haiku without a paired imperative.
- ✅ / ❌ emoji bullets inside descriptions tokenize inconsistently across
  Llama / Gemini families and act as negative-example leakage (rubric #4).

## Decision

All `ctx_*` tool descriptions registered via `server.registerTool()`
**MUST** follow this structure:

```text
<1-line role definition>

WHEN:
  - <bulleted positive trigger conditions>

WHEN NOT (optional):
  - <bulleted positive disambiguation from sibling tools>

RETURNS:
  <what the agent sees back>

EXAMPLE:
  <one concrete call with realistic params>
```

The legacy alias `WHEN TO USE:` is accepted as a transitional form (see
`ctx_index`) but new tools MUST use `WHEN:`.

### Forbidden tokens

Descriptions MUST NOT contain:

| Token | Rationale |
|---|---|
| `MANDATORY:` (as opener) | Developer-policy phrasing, not a selection cue. |
| `BLOCKED` | Reserved for ADR-0003 CASE B (real policy restriction). |
| `PREFER X OVER Y` | Frames the choice as a tradeoff; use positive `WHEN:` instead. |
| `Do NOT use/read/pull` | Affirmative beats negative (rubric #2). |
| `Never use` | Same — express as `WHEN NOT:`. |
| `SESSION STATE` clause | Skill/role persistence is a routing-block.mjs concern. |
| `✅` / `❌` emoji bullets | Tokenizer inconsistency across LLM families + negative-example leakage. |

### Allowed imperative hierarchy (RFC 2119)

The MUST / SHOULD / MAY hierarchy is preserved ONLY for **post-call
obligations** on the agent — never for tool-selection cues.

- **MUST**: post-call obligation. Example (allowed): `ctx_upgrade` says
  "you MUST run the returned shell command and display the output as a
  checklist." This is a post-call contract, not a selection nudge.
- **SHOULD**: strong preference with allowed exceptions.
- **MAY**: optional capability.

Selection cues use the `WHEN:` / `WHEN NOT:` structure instead.

### Length

Descriptions SHOULD be ≤ 1,000 characters. Hard cap 1,500.

### Exemptions

- `ctx_stats`, `ctx_doctor`, `ctx_insight` — minimal one-line descriptions
  by design (diagnostic / GUI affordances, not routing targets).
- `ctx_upgrade` — `MUST` is permitted per the post-call obligation rule
  above.
- `ctx_purge` — rewrite deferred per Probe 4 empirical evidence (see
  Consequences). A naïve rewrite would regress parameter fidelity on
  Haiku (5/5 → 3/5). The follow-up rewrite PR must run a tri-LLM probe
  (Haiku / Sonnet / Opus) and gate merge on that probe.

## Consequences

- PR #683 rewrites the six tools where the audit showed clear voice
  drift: `ctx_execute`, `ctx_execute_file`, `ctx_batch_execute`,
  `ctx_search`, `ctx_index`, `ctx_fetch_and_index`.
- A new contract test in `tests/core/server.test.ts` (`tool description
  style contract (#683 ADR-0002)`) parses every `server.registerTool()`
  block and enforces the forbidden-token list + WHEN: requirement on
  every commit. Cheap (no LLM call), runs on every commit, catches
  drift before merge.
- Voice-of-trainer text (`THINK IN CODE`, `MANDATORY routing rules`)
  lives in `hooks/routing-block.mjs` and `CLAUDE.md`, not in tool
  descriptions. That layer is correct because it runs as system-prompt
  injection, where exhortations belong.
- `ctx_purge` rewrite is a separate PR with a tri-LLM probe gate.
  Documented inline in `EXEMPT_FROM_FORBIDDEN_TOKENS` so future authors
  see the empirical rationale, not just a quiet skip.
- New `ctx_*` tools added in future PRs MUST cite this ADR in the PR
  description and pass the contract test.

## Alternatives considered

- **Status quo (no style policy).** Rejected — PR #654 evidence shows
  organic drift directly causes user-visible bugs (Opus 4.6 capitulation).
- **Single hortatory voice across all descriptions.** Rejected — Probe 4
  evidence: heavy framing helps `ctx_purge` and hurts `ctx_execute`.
  One-size-fits-all is empirically wrong.
- **Per-tool author discretion.** Rejected — that's what we already had,
  and it produced the bug.
- **Rewrite all 11 in one PR.** Rejected — large diff, hard to revert,
  blocks on style debates, and would regress `ctx_purge` per Probe 4.
  PR #683 explicitly defers `ctx_purge`.

## References

- `TOOL-DESCRIPTIONS-AUDIT.md` (§3 audit table, §5 probe evidence, §6
  verbatim rewrites)
- `GRILL-Q1-VERDICT.md` (SESSION STATE drop rationale)
- ADR-0003 — Routing deny reasons MUST distinguish redirect from
  restriction (sibling decision, also from PR #683)
