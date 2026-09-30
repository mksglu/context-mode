#!/usr/bin/env bash
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TARGET_SCRIPT="$REPO_ROOT/scripts/ctx-debug.sh"

CANARIES=(
  fake-dynatrace-token-abc123
  fake-sonar-token-xyz789
  fake-password-hunter2
  fake-linear-key-999
  ghp_FAKEGITHUBTOKEN000000000000
  sk-ant-fakeapikey0000000000000
  sk-faketomlkey0000000000000000
)

SCRATCH="$(mktemp -d)"
trap 'rm -rf "$SCRATCH"' EXIT

mkdir -p "$SCRATCH/home/.claude" "$SCRATCH/home/.codex" "$SCRATCH/home/.cursor" "$SCRATCH/tmp"

cat > "$SCRATCH/home/.claude/settings.json" <<'EOF'
{
  "model": "opus",
  "env": {
    "DYNATRACE_API_TOKEN": "fake-dynatrace-token-abc123",
    "SONAR_TOKEN": "fake-sonar-token-xyz789",
    "MY_PASSWORD": "fake-password-hunter2",
    "GITHUB_TOKEN": "ghp_FAKEGITHUBTOKEN000000000000",
    "ANTHROPIC_API_KEY": "sk-ant-fakeapikey0000000000000"
  }
}
EOF

cat > "$SCRATCH/home/.codex/config.toml" <<'EOF'
model = "gpt-5"
OPENAI_API_KEY = "sk-faketomlkey0000000000000000"
EOF

cat > "$SCRATCH/home/.cursor/mcp.json" <<'EOF'
{
  "mcpServers": {
    "linear": {
      "command": "npx",
      "env": {
        "LINEAR_API_KEY": "fake-linear-key-999"
      }
    }
  }
}
EOF

FIXHOME="$SCRATCH/home"
if command -v cygpath &>/dev/null; then
  FIXHOME="$(cygpath -m "$FIXHOME")"
fi

if ! HOME="$FIXHOME" TMPDIR="$SCRATCH/tmp" bash "$TARGET_SCRIPT" >/dev/null 2>&1; then
  printf 'FAIL: ctx-debug.sh exited nonzero\n'
  exit 1
fi

REPORT="$(ls "$SCRATCH/tmp"/ctx-debug-*.json 2>/dev/null | head -1)"
if [ -z "$REPORT" ] || [ ! -s "$REPORT" ]; then
  printf 'FAIL: no report JSON produced under %s\n' "$SCRATCH/tmp"
  exit 1
fi

FAILURES=0

for canary in "${CANARIES[@]}"; do
  if grep -qF -- "$canary" "$REPORT"; then
    printf 'FAIL: canary value leaked into report: %s\n' "$canary"
    FAILURES=$((FAILURES + 1))
  fi
done

VERDICT="$(node -e "
  const fs = require('fs');
  const r = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
  const cfgs = ((r.sections || {})['6. Config Files'] || {}).configs || [];
  const byName = (n) => cfgs.find((c) => c.name === n) || {};
  const claude = byName('Claude settings.json');
  const cursor = byName('Cursor mcp.json (global)');
  const codex = byName('Codex config.toml');
  const problems = [];
  if (typeof claude.content !== 'string') problems.push('claude-content-not-captured');
  if (typeof cursor.content !== 'string') problems.push('cursor-content-not-captured');
  if (typeof codex.content !== 'string') problems.push('codex-content-not-captured');
  if (typeof claude.content === 'string') {
    for (const k of ['DYNATRACE_API_TOKEN', 'SONAR_TOKEN', 'MY_PASSWORD', 'GITHUB_TOKEN', 'ANTHROPIC_API_KEY']) {
      if (!claude.content.includes(k)) problems.push('env-key-lost:' + k);
    }
    const marks = (claude.content.match(/\*\*\*REDACTED\*\*\*/g) || []).length;
    if (marks < 5) problems.push('mask-count-low:' + marks);
    if (!claude.content.includes('\"model\"')) problems.push('benign-key-lost:model');
  }
  if (typeof cursor.content === 'string') {
    if (!cursor.content.includes('LINEAR_API_KEY')) problems.push('env-key-lost:LINEAR_API_KEY');
    if (!((cursor.content.match(/\*\*\*REDACTED\*\*\*/g) || []).length)) problems.push('cursor-env-not-masked');
  }
  if (typeof codex.content === 'string') {
    if (!codex.content.includes('OPENAI_API_KEY')) problems.push('secret-key-name-lost:OPENAI_API_KEY');
  }
  console.log(problems.length ? problems.join('|') : 'OK');
" "$REPORT" 2>&1)"

if [ "$VERDICT" != "OK" ]; then
  printf 'FAIL: invariants: %s\n' "$VERDICT"
  FAILURES=$((FAILURES + 1))
fi

if [ "$FAILURES" -eq 0 ]; then
  printf 'PASS: no canary values in report; env key names preserved; values masked\n'
fi
exit "$FAILURES"
