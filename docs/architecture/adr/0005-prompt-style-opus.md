# ADR-0005: Prompt rules for current Claude models (Opus family), enforced by lint

- Status: Accepted (2026-10-15). Owner accepted `DECISIONS-r3.md` in full. Budget numbers: Q5 in TECH-SPEC §10, now decided.
- Related: TECH-SPEC §3.4–§3.6 · ADR-0004 · `docs/architecture/prompt-drafts.md`

## Context

Source: Anthropic, "Prompting best practices", platform.claude.com, fetched 2026-10-14. The page says it applies to current models, including Claude Opus 5.5, Opus 5, Opus 4.8, 4.7, 4.6, Sonnet 5.5, Sonnet 5, Haiku 5.5 and Haiku 4.5. Verbatim quotes:

> "If your prompts were designed to reduce undertriggering on tools or skills, these models may now overtrigger. The fix is to dial back any aggressive language. Where you might have said "CRITICAL: You MUST use this tool when...", you can use more normal prompting like "Use this tool when..."."

> "Replace blanket defaults with more targeted instructions. Instead of "Default to using [tool]," add guidance like "Use [tool] when it would enhance your understanding of the problem.""

> "Remove over-prompting. Tools that undertriggered in previous models are likely to trigger appropriately now. Instructions like "If in doubt, use [tool]" will cause overtriggering."

> "Providing context or motivation behind your instructions, such as explaining to Claude why such behavior is important, can help Claude better understand your goals and deliver more targeted responses."

v1 texts on `origin/main` @ `5869f4fa`, counted by `build/prompt-lint.mjs`. The regexes are in the script:
- caps: case-sensitive `MUST|NEVER|ALWAYS|CRITICAL|MANDATORY|IMPORTANT|REQUIRED|DO NOT|ONLY|ALL|ANY`
- doubt: `if in doubt|when (in doubt|uncertain|unsure)|default to`
- tags: pseudo-XML tags

Findings:
- 24 prompt files, 110,171 chars: caps 128, doubt 2, tags 50.
- The 11 v1 tool descriptions (live `tools/list`): caps 1, doubt 0. Their problem is length, not tone (see below).
- `skills/context-mode/SKILL.md`: caps 16, doubt 2, tags 10, quoted strings 103.
- `skills/context-mode/SKILL.md`:
  - line 26: "Default to context-mode for ALL commands." (the "Default to using [tool]" pattern)
  - line 40: "When uncertain, use context-mode." (the "If in doubt, use [tool]" pattern)
  - line 16: "Also triggers on ANY MCP tool output…"
  - its description lists 39 quoted trigger phrases
  - it wraps its rules in the pseudo-tags `<context_mode_logic><mandatory_rule>`
- `.claude/skills/context-mode-ops/SKILL.md` (lint): caps 56, tags 30, and an `<owner_operating_directive importance="ABSOLUTE" override-policy="this-supersedes-all-other-sections">` block.
- Tool descriptions:
  - 5 of 11 are longer than 2,048 chars, so Claude Code cuts them (code.claude.com/docs/en/mcp: "Claude Code truncates each tool description and each server's instructions at 2,048 characters by default").
  - `ctx_execute` starts with machine-dependent text, `" (Bun detected — JS/TS runs 3-5x faster)"` (`src/server.ts:1246`), so its bytes differ between machines.

## Decision

Every prompt text (instructions and tool descriptions) follows these rules. CI lints the built `tools/list` and `initialize` output, not the source files.

| Rule | Lint |
|---|---|
| PR1: no caps imperatives | caps regex = 0 |
| PR2: no blanket defaults or doubt clauses | doubt regex = 0 |
| PR3: every tool description says what the tool is for and why it helps (output stays out of context) | review |
| PR4: the instructions say when to use the normal tools instead | review + golden |
| PR5: no pseudo-XML directive tags | `<[a-z_]+[ >]` = 0 |
| PR6: no trigger-phrase lists | ≤ 2 quoted phrases per text |
| PR7: length budgets (Q5): instructions ≤ 2,048 chars; each description ≤ 1,024 chars; all descriptions + input schemas ≤ 8,000 chars (≈ 2,000 tokens, PRD E4) | exact char counts |
| PR8: the first line of the instructions stands alone, because Pi's MCP listing shows only that line | review |
| PR9: deterministic bytes, with no runtime-, OS- or version-dependent text | golden GP2 across the 3 CI OSes |
| PR10: no duplication; the instructions name tools but do not repeat their parameters | review |
| PR12: tool names are bare (`ctx_execute`), never host-prefixed (TECH-SPEC §3.8) | `mcp__?…ctx_`, `plugin_…ctx_`, `context-mode__ctx_` = 0 |
| PR11: every `ctx_*` name in a text exists in `tools/list` | exact |

The "no regex" principle (PRD) covers runtime code only; CI tools such as `lint.mjs` may use regex (Q17).

## Verification

- The lint is a step of GP2.
- Behaviour is checked by GP-LIVE-ROUTING (TECH-SPEC §6.5): a fixed set of small and large tasks on Opus, Sonnet and Haiku. It counts over-routing (ctx tool on a small task) and under-routing (native tool on a large task).
- The pilot run on Opus 5.5 is in TECH-SPEC §3.6.

## Alternatives considered

- **Keep emphasis but shorten it.** Rejected: the guide names emphasis itself as the cause of overtriggering.

## Changes

- r3 (`DECISIONS-r3.md`): ratified PR7's 1,024-char-per-description cap as Q13; added the Q17 CI-tooling carve-out for regex, folded into the Decision table above.
- 2026-10-15: status set to Accepted; removed the standalone r3 section now that Q13 and Q17 are in the body.
