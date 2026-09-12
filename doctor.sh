#!/usr/bin/env bash
set -Eeuo pipefail

root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
bun_bin="$(command -v bun || true)"
[[ -n "$bun_bin" ]] || {
  printf 'Context Mode doctor requires Bun or Sandwich.\n' >&2
  exit 1
}

exec "$bun_bin" "$root/scripts/doctor-harnesses.mjs" "$@"
