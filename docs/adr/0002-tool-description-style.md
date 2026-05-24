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
<1-line headline, <= 120 chars, imperative-positive>

WHEN:
  - <bulleted positive trigger conditions>

WHEN NOT:
  - <bulleted positive disambiguation from sibling tools>

RETURNS:
  <what the agent sees back, 1-3 lines>

EXAMPLE: <one canonical call with realistic params>
```

The legacy alias `WHEN TO USE:` is accepted as a transitional form (see
`ctx_index`) but new tools MUST use `WHEN:`.

### Canonical structure (locked rubric — PR #683 WS3)

Future contributors do **not** get to re-invent section names. The
contract test in `tests/core/server.test.ts` enforces every rule below
on every commit; this section is the source of truth.

1. **Section order MUST be**
   `WHEN -> WHEN NOT -> RETURNS -> EXAMPLE`.
   Positive selection cues precede negative disambiguation (audit
   rubric #2). A tool MAY omit `WHEN NOT:` when it has no sibling-tool
   ambiguity, but every other canonical section is mandatory.

2. **Bullets MUST use markdown `- ` only.** Numeric (`1.`, `1-`),
   asterisk (`* `), and unicode (`•`) bullets are rejected. Numbering
   inside a routing-target description is also rejected because each
   bullet should be independently true, not sequenced. Numbered
   hierarchies live in `hooks/routing-block.mjs` (priority order in a
   system-prompt injection is a different prompt surface, governed by
   ADR-0003 sibling concerns).

3. **Section headers MUST be UPPERCASE + colon at the start of a
   line.** The token uniformity matters because GPT, Gemini, Llama,
   and Claude tokenize lowercase / mixed-case section names
   differently — uppercase headers are the only shape that hits a
   single token across families.

4. **Two-space bullet indent under each header.** Example shape:
   ```
   WHEN:
     - First positive cue
     - Second positive cue
   ```
   The contract test does not assert the literal indent count (LLMs
   are tolerant of 2 vs 4) but every shipped description in
   `src/server.ts` uses two-space indent for visual uniformity.

5. **One blank line between sections.**

6. **One canonical `EXAMPLE:` per tool.** Tools with two valid input
   shapes (e.g. `ctx_purge` per-session vs per-project) MAY include
   two EXAMPLE lines back-to-back. Keep them adjacent so the
   description does not interleave examples with other sections.

7. **Carve-outs (per-tool, allow-listed in the contract test):**
   - `ctx_purge`: `DESTRUCTIVE`, `SCOPES`, `CONTRACT`. Justified by
     Probe 4 empirical evidence — heavy framing on this tool
     preserves parameter fidelity on small models. `DESTRUCTIVE` here
     is accurate user-facing signaling, distinct from the
     cross-LLM-bias negative framing the rubric forbids.

### Cross-LLM rationale

The audit ran 38 A/B trials × 6 probes across Haiku and Sonnet. The
canonical structure above is the lowest common denominator that:

- Hits a single token across **Claude, GPT, Gemini, Llama** families
  for every section header (uppercase + colon).
- Avoids tokens flagged by Constitutional AI-style RLHF priors
  (`FORBIDDEN`, `BLOCKED`, `NEVER`, `MANDATORY`).
- Eliminates negative-example leakage (emoji bullets — rubric #4,
  Probe 3).
- Leaves room for accurate signaling where empirically required
  (Probe 4 `ctx_purge` carve-out).

The structure is locked to make future PRs ungameable: a contributor
proposing a new tool either adheres to it (contract test passes) or
opens a new ADR amending this one (contract test fails until the
allow-list is updated).

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
- `ctx_purge` — rewritten in PR #683 WS2 with carve-outs (`DESTRUCTIVE`,
  `SCOPES`, `CONTRACT`) that preserve the parameter-fidelity discipline
  Probe 4 measured (5/5 vs 3/5 on Haiku). The rewrite still meets the
  canonical `WHEN / WHEN NOT / RETURNS / EXAMPLE` structure; the carve-out
  headers coexist with it. The empirical-validation gate is documented in
  `tests/core/server.test.ts` `ALLOWED_EXTRA_SECTIONS`.

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
- `ctx_purge` is rewritten in PR #683 WS2 with carve-out headers
  (`DESTRUCTIVE`, `SCOPES`, `CONTRACT`) allow-listed by the contract
  test's `ALLOWED_EXTRA_SECTIONS`. The rewrite preserves Probe 4's
  parameter-fidelity discipline (accurate DESTRUCTIVE signal + explicit
  SCOPES + CONTRACT block) while still meeting the canonical
  `WHEN / WHEN NOT / RETURNS / EXAMPLE` structure.
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
