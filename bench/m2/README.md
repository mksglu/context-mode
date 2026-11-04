# bench/m2: frozen M2 eval (main + heldout)

M2 = live saving: UTF-8 bytes of tool_result content the model saw, arm v2 (`--plugin-dir <release-out>`)
vs arm off (no plugin). Per workload: median over v2 runs of `100 * (offRef - v2) / offRef`. Score: median over
workloads. Same byte count as `bench/saving-score.mjs` (frozen, `bench/saving-score.lock`).

Oracle gate: each workload has a task oracle (the final answer holds every expected string). A v2 run that fails
it counts `min(0, saving)`, so a failed task never adds saving. A workload with no passing off run is invalid.

- `main/tasks.mjs`: the 4 SCORE_TASKS of `bench/live/score-tasks.mjs` (re-exported, cannot drift).
- `heldout/tasks.mjs`: 7 workloads (Read of a large source file, Read of a CSV, a non-ctx MCP tool, an HTML page
  over local HTTP, a real `node --test` run, a JSON-lines log, Grep content). Do not tune on it.

## Eval command

```sh
npm install --no-package-lock && node build/build.mjs --generated-only && node build/build.mjs --out release-out
node bench/m2/eval.mjs --set main    --release-out release-out --runs 3   # or --set heldout
```

Live: real `claude` binary, model claude-sonnet-5-5, effort low, n=3 per arm, `--max-budget-usd 1` per session,
fresh `CLAUDE_CONFIG_DIR` and `HOME` per session with only the login credential copied (no API key, ADR-0012).
`--keep <dir>` keeps the raw transcripts (keep them outside the repo).

## Baseline (v2-design at f0e4ca00, Claude Code 2.1.303)

| Set | Score | Per workload (off bytes -> v2 bytes, saving %) |
|---|---|---|
| main | 87.6 | json-1 800->788 1.5; multi-1 6894->583 91.54; big-tests 25653->197 99.23; big-json 2424->396 83.66 |
| heldout | 96.52 | read-src 43236->1383 96.8; read-csv 37929->575 98.48; mcp-1 40012->40012 0; http-1 26092->648 97.52; node-tests-1 10447->10447 0; jsonl-1 460->16 96.52; grep-1 16890->16890 0 |

All 42 sessions per set passed the oracle in both arms. Full rows: `baseline-main.json`, `baseline-heldout.json`.

## Leak sources (from the transcripts)

1. Non-ctx MCP output is not touched: mcp-1 40,012 B in, 40,012 B seen. The hook matcher in
   `hooks/claude-code.json` lists only Bash, Read, Grep, WebFetch, Write, Edit, NotebookEdit and ctx tools.
2. Grep replace is dropped: grep-1 16,890 B in, 16,890 B seen. The PostToolUse hook returns `updatedToolOutput`
   as a string; Claude Code checks it against the Grep output shape and keeps the original (same cause as
   D-M7-SV-1, which fixed only Bash).
3. Bash with a non-zero exit is not touched: node-tests-1 10,447 B in, 10,447 B seen. A failed command fires no
   PostToolUse event (the transcript holds PreToolUse only), and the plugin registers no PostToolUseFailure hook.

Main set: the median of 4 is the mean of big-json (83.66) and multi-1 (91.54). json-1 output is small (800 B)
and cannot move much. In big-json the replaced Bash output (205 B) did not hold the answer, so the model ran
ctx_execute after it (186 B more).
