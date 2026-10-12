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

## Test organization correction

Regression cases now reside in the existing directory walker suite as required by CONTRIBUTING.md. Earlier frozen revision 3f7940c2b0c0653dbdf0fc374b66b9eccb3a8d29 and its baseline receipts remain in campaign history. The reorganized suite passed 10 tests on Node23.6.0/Vitest4.1.11, and typecheck and diff whitespace checks passed. Source behavior is unchanged.
