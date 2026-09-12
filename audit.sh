#!/usr/bin/env bash
set -Eeuo pipefail

root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
exec sandwich repository audit \
  --root="$root" \
  --source-remote="${CONTEXT_MODE_SOURCE_REMOTE:-ildunari}" \
  --source-url="${CONTEXT_MODE_SOURCE_URL:-https://github.com/ildunari/context-mode.git}" \
  --source-branch="${CONTEXT_MODE_SOURCE_BRANCH:-feat/hermes-native-support}" \
  --fork-remote="${CONTEXT_MODE_FORK_REMOTE:-fork}" \
  --fork-url="${CONTEXT_MODE_FORK_URL:-https://github.com/CommanderTurtle/context-mode.git}" \
  --fork-branch="${CONTEXT_MODE_FORK_BRANCH:-main}" \
  --publish-mode=force-with-lease \
  --doctor=doctor.sh \
  -- "$@"
