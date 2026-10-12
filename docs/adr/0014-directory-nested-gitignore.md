# Honor nested gitignore rules during directory indexing

## Context
WalkOptions promises nearest .gitignore rules, but the walker only reads the
root file. A local ignore under docs/ therefore has no effect on indexed files.

## Decision
Read the local .gitignore as each directory is entered and carry its rules to
its descendants. Match each rule relative to its owning directory. Retain the
existing supported pattern grammar, default exclusions, and conservative lack
of negation support.

## Alternatives
Flattening all nested ignores into root exclusions would wrongly affect
siblings. A new complete gitignore parser would expand scope and dependencies.

## Consequences
Local patterns apply to their subtree, parent rules remain inherited, and
respectGitignore:false skips all ignore reads. Symlink handling and file-read
security gates remain unchanged.

## Validation
Frozen next regression: 1 fail, 2 pass. The candidate is checked with the same
fixture for nested rules, sibling independence, inheritance, and the disable
option. Live client and full-suite results are tracked separately.

## Test organization correction

Regression cases now reside in the existing directory walker suite as required by CONTRIBUTING.md. Earlier frozen revision b206aca7099bc1d818ed3d1ea80f210a74e37e47 and its baseline receipts remain in campaign history. The reorganized suite passed 7 tests on Node23.6.0/Vitest4.1.11, and typecheck and diff whitespace checks passed. Source behavior is unchanged.
