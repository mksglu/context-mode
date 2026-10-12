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
