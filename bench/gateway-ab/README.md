# Gateway A/B harness with OSS plugin arms

`harness.patch` extends the gateway repo's `start-cost-ab` harness (the one that produced the published
`v3-opus55-short.json`) with the arms `v1`, `v2` and `gateway` beside `plain` (alias `direct`). The pre-registration is
`bench/evidence/gateway/prereg.md`.

- Base: gateway commit `408333a48d082830f5813b3f539ec03993830a89`. The harness files are restored from that commit
  unchanged (`scripts/e2e/start-cost-ab*.mjs`, `short-workloads.mjs`, `unified-ab.mjs`, `tenant-preflight.mjs`,
  `steer-ab-lib.mjs`, `mitm-forward.mjs`, `billed-basis.mjs`). The patch applies on top of that restore.
- New files: `scripts/e2e/oss-arms-lib.mjs` (pure: arm parsing, cycle order, strict MCP map from the plugin's own
  manifest, stream parse, list price from the result event, arm resolution, evidence document),
  `scripts/e2e/oss-arms-lib.test.mjs` (10 tests), `scripts/e2e/start-cost-ab-arms.mjs` (the runner).
  `start-cost-ab.mjs` gets 3 lines: with `--arms` it runs the new runner; without it, the old two-arm grid is unchanged.
- Patch: `git format-patch` of harness commit `f7a22f4b` on top of the restore commit `2f588ccf` (local branch, not
  pushed). SHA-256 `1fff7b68a2bede2bb2e13830a5e2c7b647c7336671c46db28891e6614334c625`. It holds no secret, tenant id,
  host or personal path.

## Build the plugin trees

```
git clone https://github.com/mksglu/context-mode.git v1 && git -C v1 checkout a92cf6a77ac02971fb5fafe2155e5ee229491884
(cd v1 && npm install --omit=dev)                                   # plugin dir: v1
git clone --branch v2-design https://github.com/mksglu/context-mode.git v2 && git -C v2 checkout 8f38bdbca6d2be974d90492e683b1b3073f1b63c
(cd v2 && npm install --no-package-lock && node build/build.mjs --out release-out --sha 8f38bdbca6d2be974d90492e683b1b3073f1b63c)
                                                                    # plugin dir: v2/release-out
```

Both trees must be clean (`git status --porcelain` empty). The harness stops on a dirty tree.

## Run

In a worktree of the gateway repo at the base commit, with the patch applied and committed (the harness refuses an
uncommitted `scripts/e2e`):

```
node scripts/e2e/start-cost-ab.mjs --arms direct,v1,v2 \
  --v1-dir <v1> --v2-dir <v2>/release-out \
  --model claude-opus-5-5 --claude <absolute path of the real claude binary> --client-version 2.1.303 \
  --only <workload> --n 8 --warmup 1 --budget-usd 1.5 --cap 50 \
  --bridge 2 --gw <deployed gateway URL> \
  --out <public evidence.json> --private <private run folder>
# after an interruption: the same line with --resume
```

- `--bridge N` adds N plain-vs-gateway pairs per workload after its cycles. They need the admin key in the environment
  (`CM_ADMIN_KEY`). Each workload gets one new disposable tenant; owner tenants are refused; the tenant is preflighted
  before any live turn. The harness changes no tenant flag; it reads them back before and after each gateway run.
- `--arms direct,v1,v2,gateway` puts the gateway in every cycle (used for the smoke).
- `--gw` is needed: the default host in the gateway repo's test config no longer serves the gateway.
- `--private` holds full records (with tenant and session ids) and raw stream-json transcripts. Never publish it.
- `--out` is the public evidence file: schema `context-mode.benchmark-evidence/2`, arms `plain`, `v1`, `v2`
  (and `gateway`), per cycle per arm the cost, client cost, token columns, success, tool-call names and the arm
  resolution evidence. No prompt, answer, tenant id, session id, host or local path.

## What makes a run count

Read from the run's own stream-json `init` event, never from model prose:

- `plain`, `gateway`: no MCP server, no `mcp__` tool, no plugin besides the client's builtins.
- `v1`, `v2`: exactly the server named in the plugin's own manifest, status `connected`, at least one tool with its
  prefix, no other `mcp__` tool, and the one non-builtin plugin is `context-mode` at the arm's dir with the manifest's
  version.
- Every arm: client version as pinned, every main-thread message on the pinned model, not logged out.
- `gateway` also: the gateway's per-call record for the session found and complete, with at least the client's tokens
  in every class; the deployed version the same before and after the cycle.

A cycle with any unresolved arm is void and runs once more. Cost: list price on the result event's per-model token
counts; Claude Code's own total is kept beside it and a gap above 1% is flagged. Gateway cost: the gateway's per-call
record (hidden calls included). A model outside the price table stops the run.

## Smoke (2026-10-21)

`smoke/edit-haiku45-4arms.json`: workload `edit`, arms plain, v1, v2, gateway, 1 cycle, `claude-haiku-4-5-20251001`,
Claude Code 2.1.303. All four arms resolved by their init event; the gateway run also by its per-call record
(3 calls, record tokens cover the client's). Observed:

- v1 (1.0.169): server `context-mode` connected, 11 `ctx_*` tools.
- v2 (`release-out` at 8f38bdbc, manifest version `0.0.0-dev`): server `context-mode` connected, 9 `ctx_*` tools.
- Neither plugin arm called a plugin tool in this run (Read and Edit only).
- The new tenant read back `memory: true, skills: true` (gateway defaults) before and after the run.
- One cycle is not a result. It shows only that each arm resolves and is priced. Total spend $0.09.
