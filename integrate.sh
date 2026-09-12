#!/usr/bin/env bash
set -Eeuo pipefail

root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
cd "$root"

bun_bin="$(command -v bun || true)"
[[ -n "$bun_bin" ]] || {
  printf 'Context Mode integration requires Bun or Sandwich.\n' >&2
  exit 1
}

dry_run=0
for argument in "$@"; do
  [[ "$argument" == "--dry-run" ]] && dry_run=1
done

if [[ "$dry_run" == 0 ]]; then
  "$bun_bin" install --frozen-lockfile --ignore-scripts
  "$bun_bin" run build
  mkdir -p -- "$HOME/.local/bin"
  ln -sfn -- "$root/cli.bundle.mjs" "$HOME/.local/bin/context-mode"
  chmod +x -- "$root/audit.sh" "$root/integrate.sh" "$root/doctor.sh" "$root/update.sh" \
    "$root/scripts/configure-harnesses.mjs" "$root/scripts/doctor-harnesses.mjs"
fi

"$bun_bin" "$root/scripts/configure-harnesses.mjs" install "$@"

if [[ "$dry_run" == 0 ]]; then
  "$bun_bin" "$root/scripts/doctor-harnesses.mjs" "$@"
  printf '\nContext Mode is reconciled. Restart running OMP/Hermes clients to reload its MCP server and native hooks.\n'
fi
