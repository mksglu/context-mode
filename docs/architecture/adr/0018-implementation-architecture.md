# ADR-0018: One architecture contract, one file per module, for the implementing agent

- Status: Accepted (2026-10-15).
- Related: ADR-0001–0017 (all, this ADR is their module map); TECH-SPEC §12 (milestone order); `docs/architecture/modules/00-architecture.md` (the contract this ADR adopts); `docs/architecture/modules/README.md` (the per-module file map).

## Context

The design for v2.0 is final across ADR-0001–0017, `PRD-v2.md`, `TECH-SPEC.md`, `DECISIONS-r3.md`, `DECISIONS-r4.md`, and the closed spikes in `https://github.com/mksglu/context-mode/tree/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/spikes-r5/`. An implementing agent still has to turn that design into a source tree: file paths, import rules, exported signatures, constants, and error text. Left open, each module writer would pick these again, and the picks would drift between modules (P1, "one path").

`docs/architecture/modules/00-architecture.md` already states the source tree, the module graph, the shared types and constants, and the cross-module call surface, built from the ADRs above. `docs/architecture/modules/README.md` already lists one file per module (`01-contracts.md` … `15-v1-transition.md`) and the read order. Those two files need a decision record: that they are binding, not advisory, and that no later doc may re-open a choice they already made.

## Decision

1. **`docs/architecture/modules/00-architecture.md` is the architecture contract.** Every module writer follows it. It fixes:
   - The source tree in its §1 (`src/`, `build/`, `e2e/`, `.github/`, the release-branch output list).
   - The module graph in its §2: 15 modules (`contracts`, `store`, `sandbox`, `tools-index`, `tools-exec`, `tools-session`, `adapters`, `enforcement`, `tools-ops`, `hooks`, `server`, `plugins`, `build-release`, `tests`, `v1-transition`), each with a fixed "Imports" cell. A module may import only the modules named in its own cell plus `node:*` built-ins. The graph has no cycle: `contracts → store → sandbox → tools-index → tools-exec`; `adapters → enforcement → hooks`; all tool modules → `server` → `plugins`.
   - The shared types in its §3.1 (`src/core/contracts/types.ts`, `agents.ts`).
   - Every named constant in its §3.2 (`src/core/contracts/constants.ts`). No module defines a literal number or string that duplicates a constant; no module adds a constant outside this file (ADR-0008, ADR-0009, ADR-0016, ADR-0017 all draw their numbers from this one table).
   - The error-text table in its §3.3 (`src/core/contracts/errors.ts`). Every error is one line, `<cause>. Fix: <action>` (P1).
   - The cross-module call surface in its §4: the only functions one module may call on another.
2. **Dependency rule.** A module's "Imports" cell in `00-architecture.md` §2 is exhaustive. CI (`build-release`'s lint step, TECH-SPEC §6.6) fails the build on any import edge not in that table. `e2e/` never imports `src/` (GS4).
3. **Implementers follow `docs/architecture/modules/` file by file.** `docs/architecture/modules/README.md` is the read order:
   - Read `00-architecture.md` in full before touching any module.
   - Read only the one file for the module being built (`01-contracts.md` … `15-v1-transition.md`); read another module's file only when `00-architecture.md` §4 names a call into it.
   - Build in the TECH-SPEC §12 milestone order (M0 → M7); inside a milestone, follow the step order the module file gives.
   - Write the E2E case before the code (ADR-0017, P6); every function in a module file names the GP row or live case id that proves it, and its ADR-0017 `covers` path.
   - A step is done only when `node e2e/cases/run.mjs` and the step-scoped `node e2e/live/run.mjs` are both green (ADR-0017).
4. **No design choice re-opens here.** Where a module file is silent, the implementer follows that file's own "Assumptions" section, not a new guess. A gap neither `00-architecture.md` nor a module file covers is a doc bug: fix the doc, then the code.

## Consequences

- One source of truth for file paths, types, and constants removes the drift risk between module writers working in parallel (per the global rule to parallelize subagent work).
- CI gains one more gate: the import-edge check against `00-architecture.md` §2. A module that imports outside its cell fails the build, not a later review.
- A change to the architecture (a new module, a new constant, a new cross-module call) is a change to `00-architecture.md` first, then this ADR's "Changes" section, then the module files it touches. The architecture is never changed inside a module's own implementation file.
- `docs/architecture/modules/00-architecture.md` and `docs/architecture/modules/README.md` are now binding documents under this ADR; they are versioned the same as any other ADR-governed doc and carry their own "Changes" sections for future fix passes.

## Changes

- Initial (2026-10-15): adopts `docs/architecture/modules/00-architecture.md` and `docs/architecture/modules/README.md` as binding, closing the gap between the accepted ADRs and a buildable source tree.
