# Remove dangling cache breadcrumbs before replacing them

## Context
The SessionStart hook replaces stale cached versions with forwarding links.
On the measured Node23.6/macOS runtime, rmSync with recursive/force returns
without removing a dangling symbolic link. The subsequent symlink creation
then fails with EEXIST, leaving pinned sessions unable to resolve their hooks.
The upstream existing stale-breadcrumb integration test reproduces this.

## Decision
Use unlinkSync to remove known symbolic links, retaining recursive rmSync for
real filesystem entries. In the Windows lstat failure fallback, try unlink
before falling back to recursive removal. Existing best-effort error handling
and directory age gates stay in place.

## Alternatives
Only retrying symlink creation leaves the occupying link in place. Removing
real directories with unlink would fail. Broadly replacing cache cleanup would
expand beyond the broken link replacement path.

## Consequences
The forwarding link can be recreated when its former target disappeared.
Fresh real versions remain protected; a dangling link is repaired immediately.
No installed user cache was touched during validation.

## Validation
The frozen hook suite with an added fresh-dangling case fails2tests and passes
32tests on Node23.6/macOS. Candidate34tests pass, including subprocess runs of
the actual SessionStart hook against owned temporary cache/home/project trees.
Typecheck and diff whitespace checks pass. Live Claude model-loop verification
is unavailable because its OAuth token returned401; no provider fallback used.
