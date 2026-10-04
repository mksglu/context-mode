# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Layout: single-context

This is a single-context repo — one `CONTEXT.md` and one `docs/adr/` at the root. There is no `CONTEXT-MAP.md` and no per-package `src/<context>/` split.

```
/
├── CONTEXT.md
├── docs/
│   ├── adr/
│   │   ├── 0001-sessiondb-multi-writer.md
│   │   ├── 0002-tool-description-style.md
│   │   ├── 0003-routing-deny-reasons.md
│   │   └── 0004-stats-strict-compression-formula.md
│   └── agents/
└── src/
```

## Before exploring, read these

- **`CONTEXT.md`** at the repo root, when it exists.
- **`docs/adr/`**: read ADRs that touch the area you're about to work in. The four existing ADRs cover session DB multi-writer behaviour, MCP tool description style, routing deny reasons, and the stats strict-compression formula.

If `CONTEXT.md` does not exist yet, **proceed silently**. Don't flag its absence; don't suggest creating it upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates it lazily when terms or decisions actually get resolved.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders), but worth reopening because…_
