<!-- Published copy of a pre-registration from the Context Mode gateway repository. -->

Pre-registration: Opus 5.5 short tasks (v3)

- Source file: docs/verify/launch-ab-2026-09-29/v3-opus55-short-prereg.md
- Commit that added it: 6e2b65d565aa68f3eacdcece77fe72721c18573f, 2026-09-29T11:44:26Z
- The run it pre-registers started at 2026-09-29T11:44:33Z (the runner's start time in the evidence file).
- Evidence: /benchmarks/data/v3-opus55-short.json
- This copy is the file as it stood at that commit. Later commits added results and notes to it; the results are in the evidence file.
- Edits: private fields (tenant and session ids, local paths, internal host and endpoint names) and passages
  about workloads that are not in the published evidence are removed, and each such edit is marked
  [edited: ...]. Links to files that are not published are shown as plain names.

---

# v3 run, Opus 5.5 short tasks: pre-registration — 2026-09-29

Written and pushed before the first pair. No pair has run on this commit.

## Freeze

- Gateway commit: `408333a48d082830f5813b3f539ec03993830a89` ([edited: the fix's internal name and one clause removed] no re-read of this conversation's own
  memory rows). [edited: the gateway Worker's build] succeeded at
  2026-09-29T11:00:55Z.
- Real-client smoke on this commit: 8/8 requests ok before the deploy and 8/8 after, 0 upstream 4xx
  ([edited: link to an unpublished note removed]).
- Client: Claude Code 2.1.283, `claude-opus-5-5`.
- Later commits on `main` may deploy during the run. A pair counts only if the deployed commit differs from the freeze
  in `docs/`, `scripts/e2e/`, `site/` or a root `*.md` file only. The gateway bundle does not read these; `site/` is a
  separate Worker (`context-mode`). This commit widens the old rule (`docs/`, `scripts/e2e/`) by `site/` and root
  `*.md`, because `4ba8b4ce` changed the root `README.md` and the landing page is being edited in parallel. Test:
  `scripts/e2e/start-cost-ab-lib.test.mjs`, written first and seen to fail.

## Pairs

tests 16, log 16, git 16, grep 16, json 12, edit 12 (88 measured pairs). One warm-up pair per workload runs first and
is discarded. The arm order alternates by pair (even: plain then gateway; odd: gateway then plain). No pairs are added
after seeing data. Cap $30.

## Command

```
F=408333a48d082830f5813b3f539ec03993830a89
node scripts/e2e/start-cost-ab.mjs --model claude-opus-5-5 --freeze $F --only tests,log,git,grep,json,edit \
  --n 12 --n-for tests=16,log=16,git=16,grep=16 --conc 4 --cap 30 \
  --out docs/verify/launch-ab-2026-09-29/v3-opus55-short.json
python3 docs/verify/launch-ab-2026-09-29/opus55-short-table.py docs/verify/launch-ab-2026-09-29/v3-opus55-short.json
```

## Rules

- The harness reads the deployed commit with `gh api` (newest `main` commit whose [edited: the gateway Worker's build]
  check succeeded) before and after every pair. A pair during which it changed is invalid, kept in the file, and runs
  again. A deployed commit with other gateway code stops the run.
- A 429 makes the pair invalid; the harness waits, then runs it again.
- Every run: fresh `CLAUDE_CONFIG_DIR`, empty strict MCP map, no plugin. Gateway arm: one disposable tenant, preflighted.

## Cost basis

Per cost-basis.md and [edited: a cost script in the gateway repository]. Plain: the client's `total_cost_usd`.
Gateway: the sum of [edited: the gateway's per-call cost record] over the run's sessions, hidden calls included. A gateway run whose ops
rows hold fewer tokens than the client saw in any class is invalid (`ops_below_client_tokens`). List-price equivalent
(OAuth subscription credential).

## Analysis (fixed now)

On every measured valid pair, no outlier dropped:

- paired % difference, gateway against plain (mean(gw − plain) ÷ mean(plain)), with the 95% t interval. "less" or
  "more" only when the interval excludes zero; otherwise "same";
- median paired % difference;
- wins: pairs where the gateway cost less;
- success per arm (the workload's oracle).

What would count against the freeze: a lower success rate on any row, or any upstream 400.

## Result

Written after the run, below this line.
