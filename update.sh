#!/usr/bin/env bash
set -Eeuo pipefail

root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
cd "$root"

if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  printf 'Refusing to update a checkout with tracked changes: %s\n' "$root" >&2
  exit 1
fi

source_remote="${CONTEXT_MODE_SOURCE_REMOTE:-ildunari}"
source_branch="${CONTEXT_MODE_SOURCE_BRANCH:-feat/hermes-native-support}"
branch="$(git branch --show-current)"
[[ -n "$branch" ]] || {
  printf 'Context Mode update requires a checked-out branch.\n' >&2
  exit 1
}
git remote get-url "$source_remote" >/dev/null 2>&1 || {
  printf 'Context Mode source remote is unavailable: %s\n' "$source_remote" >&2
  exit 1
}
git fetch --prune "$source_remote"
remote_ref="refs/remotes/$source_remote/$source_branch"
git show-ref --verify --quiet "$remote_ref" || {
  printf 'Context Mode remote branch is unavailable: %s/%s\n' \
    "$source_remote" "$source_branch" >&2
  exit 1
}

if git merge-base --is-ancestor "$remote_ref" HEAD; then
  printf 'Context Mode already contains %s/%s.\n' \
    "$source_remote" "$source_branch"
elif git merge-base --is-ancestor HEAD "$remote_ref"; then
  git merge --ff-only "$remote_ref"
else
  unmatched="$(git cherry HEAD "$remote_ref" | awk '$1 == "+" { print $2 }')"
  if [[ -n "$unmatched" ]]; then
    printf 'Context Mode has new remote changes that need review:\n%s\n' \
      "$unmatched" >&2
    exit 1
  fi
  git merge-tree --write-tree HEAD "$remote_ref" >/dev/null || {
    printf 'Patch-equivalent Context Mode histories do not merge cleanly.\n' >&2
    exit 1
  }
  git merge --no-ff --no-edit "$remote_ref"
fi
exec "$root/integrate.sh" "$@"
