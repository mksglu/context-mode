#!/usr/bin/env bash
set -Eeuo pipefail

root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
cd "$root"

if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  printf 'Refusing to update a checkout with tracked changes: %s\n' "$root" >&2
  exit 1
fi

git pull --ff-only
exec "$root/integrate.sh" "$@"
