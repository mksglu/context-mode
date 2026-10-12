# Recognize parent components when filtering directory symlinks

## Context
The walker treats every relative target beginning with '..' as leaving its
root. A legitimate contained directory named '..notes' therefore cannot be
indexed through a symlink alias selected by an include filter.

## Decision
Recognize the exact '..' component, either alone or followed by the platform
path separator. Keep the root normalization, realpath resolution, cycle
tracking, include filters and explicit followSymlinks opt-in.

## Alternatives
Keeping the prefix test rejects legitimate filenames. Lexically normalizing
symlink input without resolving its target would change confinement semantics.

## Consequences
Contained dot-prefixed targets can be traversed when callers opt in. Actual
parent-directory targets remain rejected. This is a filename correctness fix;
no broader security-boundary or cross-drive behavior is claimed.

## Validation
Frozen next regression fixture1pass1fail. Candidate includes this fixture and
the existing directory walker suite. The fixture selects the alias path, so
traversing the real directory cannot conceal the missed link. An actual parent
link is the rejection control. Exact check outcomes are recorded separately.

## Test organization correction
The regression cases now reside in the existing `tests/store-directory.test.ts` suite, as required by CONTRIBUTING.md. The earlier frozen implementation revision 5f71f27031db0b82362db2895357ade14c0f4103 and its baseline evidence are retained in campaign history. Node24.19.0/Vitest4.1.11 organized directory suite: 6 pass, 0 fail, 0 skip. TypeScript `tsc --noEmit` passes. Generated bundles from unrelated local build activity are excluded from this correction. No live client behavior is claimed.
