## What

Adds a `CONTEXT_MODE_MAX_LIMIT` environment variable that overrides the hardcoded per-query cap of 2 results in `ctx_search`. The change is surgical (3 lines added, 1 modified) and applies to the L2670 region of `src/server.ts` where the cap is currently computed via `Math.min(limit, 2)`.

Defaults to 2 when the variable is unset, malformed, or out of range. Clamps valid values to the [2, 50] range.

## Why

The hardcoded 2-result cap has been a flood-guard (preventing accidental context bloat on large codebases) but it also blocks legitimate deep dives that need more than 2 hits per query. The env-var escape hatch keeps the flood-guard on by default and lets operators opt in for specific sessions.

## Defaults

- Unset: defaults to 2 (no behavior change).
- Non-numeric value: defaults to 2 via `Number.isFinite` guard.
- Value `< 2` (including 0 or negative): clamped to 2.
- Value `> 50`: clamped to 50.

## Refs

- Cap region: `src/server.ts` L2667-L2670
- Env-var name: `CONTEXT_MODE_MAX_LIMIT`
- Clamp range: `[2, 50]`
- Rationale: opt-in per-session override, default unchanged.
