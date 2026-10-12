# Directory globstar zero-depth matching

## Context
Directory indexing supports glob-ish include/exclude filters. `docs/**/*.md`
currently requires an extra directory separator, dropping `docs/top.md` while
matching deeper Markdown files. The same error leaves direct children out of
exclusions. This differs from the zero-or-more directory meaning of globstar.

## Decision
Use a structural dynamic-programming glob matcher, as required by the
contributor regex policy. Match `**/` as an optional directory prefix, preserving
terminal `**`, single `*`, extension, depth, and symlink handling.

## Alternatives
Requiring explicit parallel patterns (`docs/*.md` and `docs/**/*.md`) shifts
the defect to every caller. Adding a glob dependency is unnecessary for this
small supported pattern grammar. Extending the old regex compiler would
violate the contributor rule.

## Consequences
Direct and nested children match a directory globstar consistently. Explicit
single-star patterns remain limited to one directory level.

## Validation
A direct Node regression against the frozen upstream revision failed with
`0 !== 1` for `docs/top.md` under `docs/**/*.md`. Added Vitest regressions cover
zero/multiple directory levels, exclusions, and single-star behavior. Full
suite/typecheck/live checks are recorded separately and are not claimed here.
