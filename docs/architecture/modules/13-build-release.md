# 13 — Module `build-release`

Follows `docs/architecture/modules/00-architecture.md` (file tree §1, module table §2, types/constants §3, interfaces §4). This file is the line-by-line spec for `build/build.mjs`, `build/manifests.ts`, `build/hash.mjs`, `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `.github/ISSUE_TEMPLATE/*`, `.claude/skills/release/SKILL.md`, `skills/ctx-{stats,doctor,upgrade}/SKILL.md`, and `build/prompt-lint.mjs`.

Imports allowed (00 §2): `adapters` (`ADAPTERS`, `getAdapter`), via esbuild at build time only — build scripts run in plain Node, not inside the bundle. Exports: bundles, manifests (build artifacts, not TS exports). Build scripts are CommonJS-free ES modules run with plain `node`, no bundler needed to run them.

Implementation order inside this module (ADR-0017, TECH-SPEC §12 milestone order): `ci.yml` replacement first (GS5 note in 00 §1 "Replace `ci.yml` first"), then `build.mjs` + `manifests.ts` + `hash.mjs`, then the 3 command skills, then issue forms, then `lint.mjs`, then `release.yml` + `.claude/skills/release/SKILL.md`, then the branch-protection script.

## 1. `src/core/contracts/errors.ts` entries this module uses

Build scripts do not call `CtxError`/`errorText` (that table is for runtime tool replies, PRD §13). A build script that fails writes one line to stderr and exits 1:

| Key (build.mjs only, not in `errors.ts`) | Text | Used in |
|---|---|---|
| (none) | `build failed: <reason>` | `build.mjs` catch-all |
| (none) | `release tree check failed: <path> must not exist` | `check-removed.mjs` (owned by `v1-transition`, not this module — listed for context only) |

## 2. `build/build.mjs` — esbuild build

### 2.1 Signature

```ts
// build/build.mjs — plain Node script, no exports (invoked as `node build/build.mjs [--out <dir>]`)
async function main(outDir: string): Promise<void>;
```

**Inputs:** `--out <dir>` (default `release-out/`, a scratch dir; CI copies its contents onto the `release` branch tree).
**Output:** none (writes files to `outDir`); exit 0 on success, 1 on failure (stderr line above).

### 2.2 Steps

1. Import `esbuild` (devDependency only; never shipped — ADR-0002/GS7 as amended: no `node_modules` and no `dependencies` on `release`). Pin the exact version `esbuild@0.24.0` in the dev `package.json` (`"esbuild": "0.24.0"`, no `^`/`~` range) — see Assumption A14.
2. Build the bundles listed in `build/build.mjs` `BUNDLES` (today 7: server, hook, run, search, pi, opencode, cli; the hook bundle is minified, D-CI-PERF-4) with esbuild, **static imports only** — no dynamic `import()` of anything the bundle itself must ship, so esbuild can tree-shake and inline everything into one file (the one documented exception is `import("node:sqlite")` inside `store/db.ts`, a Node built-in, never bundled, already dynamic for the degraded-start path of ADR-0014 §1 — esbuild leaves `node:*` specifiers untouched by default and that stays true here):
   | Bundle | Entry | Output | Target |
   |---|---|---|---|
   | server | `src/entries/server.ts` | `<outDir>/server.mjs` | `node24`, format `esm`, platform `node`, bundle `true`, external `["node:*"]` |
   | hook | `src/entries/hook.ts` | `<outDir>/hook.mjs` | same |
   | run wrapper | `src/core/tools/run-wrapper.ts` | `<outDir>/run.mjs` | same (A4: case-B wrapper ships as `run.mjs` in the release root) |
   | pi | `src/entries/pi.ts` | `<outDir>/pi/index.js` | same |
   | opencode | `src/entries/opencode.ts` | `<outDir>/opencode/plugin.js` | same, exports `{id, setup}` kept (esbuild `format: "esm"` preserves named exports) |

   (5 esbuild calls produce the "4 bundles" named in 00 §1's `build.mjs` row plus the `run.mjs` wrapper that ADR-0016/A4 requires; the row's "4 bundles" count is server, hook, pi, opencode — `run.mjs` is the wrapper, counted separately per A4.)
3. **Inline prompt md:** before the `server` build, read `src/prompt/instructions.md` and every `src/prompt/tools/<tool>.md` (9 files, one per `TOOL_ORDER` entry), and write a generated `src/prompt/_generated.ts` (deleted after build) exporting `INSTRUCTIONS` and a `TOOL_DESCRIPTIONS: Record<ToolName,string>` map, both as plain string literals — this is what "inline prompt md" means: the `.md` bytes become string constants so `server.mjs` never reads a file at runtime. Enforce `INSTRUCTIONS.length <= INSTRUCTIONS_CAP` and each tool description `<= DESCRIPTION_CAP`, and the combined descriptions+schemas size `<= SURFACE_CAP` (Q5, Q13); over cap → the error line above and exit 1, naming the offending file.
4. Call `generateManifests(outDir)` (§3 below).
5. Copy `e2e/fixtures/<agent>/<ver>/hook-roundtrip.json`'s canonical fixture (the one referenced by D5) to `<outDir>/fixtures/hook-roundtrip.json` verbatim (no transform) — ships for the D5 round-trip self-check some hosts run after install.
6. Copy the 3 generated skill dirs `skills/ctx-{stats,doctor,upgrade}/SKILL.md` (written once, by hand, in step order — see §5) into `<outDir>/skills/...` verbatim.
7. Run `claude plugin validate <outDir>` (ADR-0013 build job row) via `runProcess`-style `spawnSync`; non-zero exit → error line `build failed: claude plugin validate` and exit 1.
8. Call `writeHashes(outDir)` (`build/hash.mjs`, §4) last, after every other file is in place, so `SHA256SUMS` covers the full tree.

**E2E proof:** GP2 (`lint.mjs` passes on the built `initialize` + `tools/list`, GS5); GP1 (install from `release`, GS7). ADR-0017 `covers`: `build/build.mjs`.

## 3. `build/manifests.ts` — manifest generation

### 3.1 Signature

```ts
export function generateManifests(outDir: string): void;
```

**Inputs:** `outDir`, the same scratch dir `build.mjs` passes.
**Output:** none; writes files.
**Steps:**
1. Import `ADAPTERS` from `src/adapters/table.ts` (00 §2 adapters module; this is the one call this module makes into another module, at build time, per the module table's "Imports: adapters (via esbuild at build time)").
2. For every row in `ADAPTERS` whose `installMode` needs a generated host file, write exactly one file, using only fields already on `AdapterRow` (00 §3.1) plus the fixed `SERVER_KEY` constant — no new per-agent literal strings outside this function:
   | `installMode` | Output file | Content built from |
   |---|---|---|
   | `marketplace` (claude-code) | `<outDir>/.claude-plugin/plugin.json` | `name: SERVER_KEY`, `version` (passed in from `plan.mjs`'s computed version at release time; `build.mjs` alone writes a placeholder `"0.0.0-dev"` so a non-release build still validates), `mcpServers.<SERVER_KEY> = {command:"node", args:["server.mjs","--agent","claude-code"]}` |
   | `config-mcp` (codex) | documented only — Codex has no generated manifest file; `ctx_upgrade` writes `config.toml` directly at install/upgrade time (A2, `tools-ops` module). `manifests.ts` emits nothing for this row | — |
   | `extension` (gemini, qwen) | `<outDir>/gemini-extension.json` / `<outDir>/qwen-extension.json` | `name`, `version`, `mcpServers.<SERVER_KEY> = {command:"node", args:["server.mjs","--agent","<id>"]}` |
   | `plugin` (copilot-cli) | `<outDir>/copilot/plugin.json` | same shape as `extension`, keyed by `AdapterRow.toolNamePrefix`-neutral name |
   | `hooks+mcp` (vscode, kiro, zcode) | `<outDir>/hooks/<agent>.json` | one entry per `CanonicalEventName`/`AuxEventName` key present in `row.eventMap`, each pointing at `node hook.mjs --agent <id>`, timeout `row.hookTimeoutMs`; each entry's `matcher` field is built, not typed, by `buildMatcher(row)` (DECISIONS-r9 R4): `` `^(${[...Object.values(row.nativeTools).flat(), escapeRegExp(row.toolNamePrefix) + "ctx_.*"].join("|")})$` `` — e.g. Codex's `nativeTools` (`shell:["Bash"], edit:["apply_patch"]`) plus `toolNamePrefix` `"mcp__context_mode__"` (R1) yields `^(Bash|apply_patch|mcp__context_mode__ctx_.*)$` |
   | `mcp-entry` (copilot-cli falls here too if not plugin-shaped — resolved per A2/ADR-0011 table; no second file for the same row) | — | — |
   | `in-process` (pi, opencode) | no manifest file; `pi/index.js` and `opencode/plugin.js` are the install artifact themselves | — |
3. Every written file is deterministic: keys written in a fixed order (the order `AGENT_IDS` lists each agent, then alphabetical keys inside one object) so two builds of the same inputs produce byte-identical output (needed for `SHA256SUMS` to be meaningful and for the GS5 `lint.mjs` byte check).
4. On an `AdapterRow` whose `installMode` matches none of the table rows above: throw `Error("manifest: unknown installMode " + row.installMode)` — this is a build-time hard stop, not a runtime `CtxError` (no user ever sees it; it means `adapters/table.ts` added a row this file does not yet know how to render).
5. `function buildMatcher(row: AdapterRow): string` (DECISIONS-r9 R4), exported from `build/manifests.ts` for reuse by the `08-enforcement.md` fixture builder and GP3 case files: `Object.values(row.nativeTools).flat()` collects every native tool name across `shell`/`read`/`grep`/`webfetch`/`edit` (missing keys contribute `[]`), `escapeRegExp` (Node has none built in; use the one-line `s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")` already used by `08-enforcement.md` §5.1) escapes `row.toolNamePrefix` only, and the two lists join into `^(<names>|<escaped prefix>ctx_.*)$`. Step 2's `hooks+mcp` row calls `buildMatcher(row)` for each hook file's `matcher` field; no other row type uses it.

**E2E proof:** GP1 (install from `release` works per agent); `tests/plugins/codex-manifest.test.ts`-style KEEP-PASS case must stay green per Q1/ADR-0003 (confirm the equivalent v2 case exists before deleting the v1 one, ADR-0015 git-log-follow rule). ADR-0017 `covers`: `build/manifests.ts`, `src/adapters/table.ts` (read-only).

## 4. `build/hash.mjs` — `SHA256SUMS`

### 4.1 Signature

```ts
export function writeHashes(outDir: string): void;
```

**Steps:**
1. Walk `outDir` recursively (plain `fs.readdirSync` recursion, no glob library — TECH-SPEC §11 "no regex in runtime code" does not bind build scripts, but no new dependency is added for a walk this small).
2. For every file except `SHA256SUMS` itself: `crypto.createHash("sha256").update(bytes).digest("hex")`.
3. Sort entries by relative POSIX path (forward slashes, so Windows and POSIX builds match byte-for-byte — this is what makes the `smoke` job's and the `/release` skill's local verification meaningful across OSes).
4. Write `<outDir>/SHA256SUMS` as lines `"<hex>  <relative/path>\n"` (two spaces, `sha256sum`-compatible format), no trailing blank line.

**E2E proof:** GP1 (`ctx_upgrade` verifies `SHA256SUMS` before rename, 00 §5.5 step 2). ADR-0017 `covers`: `build/hash.mjs`.

## 5. The 3 user command skills

These are hand-written markdown files (not generated by `build.mjs`); `build.mjs` only copies them (§2 step 6). Content is frozen from `docs/architecture/prompt-drafts.md` ids `skill_ctx-stats`, `skill_ctx-doctor`, `skill_ctx-upgrade` — copy verbatim, do not reword (same PR1–PR12 lint rule as tool descriptions, ADR-0005).

| File | `name:` frontmatter | Body (verbatim from drafts.md) |
|---|---|---|
| `skills/ctx-stats/SKILL.md` | `ctx-stats` | "Call the ctx_stats tool and show its table to the user unchanged. Add one sentence under the table that names the largest saving." |
| `skills/ctx-doctor/SKILL.md` | `ctx-doctor` | "Call the ctx_doctor tool and show its table to the user unchanged. If a row failed, list the fixes it names, in order." |
| `skills/ctx-upgrade/SKILL.md` | `ctx-upgrade` | "Call the ctx_upgrade tool and show its table to the user. Then call ctx_doctor and show its table. If a restart is needed, say so in one sentence." |

Each file's frontmatter is only `name:`; no `description:` field is added beyond what `drafts.md` ships, because these are user-typed slash commands, not the MCP tool descriptions bound by `DESCRIPTION_CAP` (that cap applies to `src/prompt/tools/*.md` only, §2 step 3).

**E2E proof:** GP-LIVE routing case that types `/ctx-stats`, `/ctx-doctor`, `/ctx-upgrade` and asserts the named tool was called (`e2e/live/cases/*.json`, `covers: ["skills/ctx-stats/", "skills/ctx-doctor/", "skills/ctx-upgrade/"]`). ADR-0017 `covers`: `skills/ctx-{stats,doctor,upgrade}/SKILL.md`.

## 6. `.github/ISSUE_TEMPLATE/{bug.yml,feature.yml,config.yml}`

Content is fixed by ADR-0014 §5 table; written once, not generated. Exact required fields per file:

### 6.1 `bug.yml`
- `name: Bug report`, `labels: [bug]`.
- Dropdown "Did you run `/ctx-doctor`?" with fixed options including a "No" branch with reasons (closed set, no free text for this field).
- Textarea bound to key `report` with `render: text`, label "Paste the full ctx_doctor report here" (the typed, redacted block from ADR-0014 §2/§3 — the agent pastes it unedited, Q18).
- Required text input `node_version` ("Run `node --version`").
- Three free-text textareas: "What happened", "Expected", "Steps" — label the Steps field so it asks the agent to name the denied tool and the alternative it gave (ADR-0014 §5).
- Two required checkboxes: (1) "I ran `/ctx-doctor` or asked the agent to call the `ctx_doctor` tool", (2) "I am an AI agent filing this on behalf of a user, or I pasted the full agent transcript" (owner rule: issues are AI-agent-authored, maximum debug data).

### 6.2 `config.yml`
- `blank_issues_enabled: false`.
- `contact_links`: one entry to GitHub security advisories, one to `README.md#install`.

### 6.3 `feature.yml`
- `name: Feature request`, no `labels` default beyond GitHub's own.
- Agent dropdown listing the 10 `AGENT_IDS` values.
- Textareas: "Problem", "Evidence links".
- A non-editable markdown block: "context-mode does not accept pull requests. File the idea; the owner implements it."

### 6.4 Removed (same commit)
`PULL_REQUEST_TEMPLATE.md`, `bug_report.yml`, `feature_request.yml`, and any `pull_request:` trigger block in any workflow file (ADR-0014 §5 "removed" row).

**E2E proof:** GP11 (`issue-intake.mjs`'s `ALLOWED_KEYS` match against `ctx_doctor`'s report keys, ADR-0014 §2); no live case needed (GitHub template YAML has no runtime behavior to drive). ADR-0017 `covers`: `.github/ISSUE_TEMPLATE/`.

## 7. `build/prompt-lint.mjs` — PR1–PR12 lint

### 7.1 Signature

```ts
async function main(): Promise<void>; // node build/prompt-lint.mjs, exit 1 on any failed PR rule
```

**Steps:**
1. Build the `server` bundle in-memory the same way `build.mjs` step 2 does (or require `build.mjs` to have already run into a known `outDir` — this script takes `--out <dir>` matching `build.mjs`'s output; it does not rebuild).
2. Spawn `node <outDir>/server.mjs --agent claude-code` over stdio using the same `e2e/harness/mcp-client.mjs` helper `tests` owns (read-only use, no import of `src/`).
3. Send `initialize` (and, per GS9, also a `server/discover` 2026-07-28 request on a second connection) and `tools/list`; capture both response bytes.
4. Check PR1–PR12 (the frozen-wording / cap rules named across 00 §3.2 and the tool-spec files, e.g. 04-tools-exec.md §2.2's "this text is frozen, do not alter wording"): for each tool, description text equals the corresponding `src/prompt/tools/<tool>.md` byte-for-byte (after the build's string-literal inlining, §2 step 3); `INSTRUCTIONS` length `<= INSTRUCTIONS_CAP`; each description `<= DESCRIPTION_CAP`; combined surface `<= SURFACE_CAP`; `TOOL_ORDER` is respected in the `tools/list` array; the two `initialize`/`server/discover` byte streams are identical for shared fields (GS9).
5. Also assert GS5's repo-shape half here (the byte-check half; the file-existence half is `build/check-removed.mjs`, owned by `v1-transition`): no `SKILL.md` ships in the built tree other than the 3 command skills and nothing under `.claude/skills/release/` leaks into `outDir` (release skill stays repo-only, never shipped to users).
6. Any failed check: print the rule id (`PR1`.."PR12", or `GS5`, `GS9`) and the mismatch, exit 1. All pass: print `lint: PR1-12, GS5, GS9 OK` and exit 0.

**E2E proof:** GP2 (named directly in 00 §1's `lint.mjs` row: "`lint.mjs` passes on the built `initialize` + `tools/list`"). ADR-0017 `covers`: `build/prompt-lint.mjs`.

## 8. `.github/workflows/ci.yml`

Replaces the existing file first (00 §1 Order-on-`v2` step 0; skipping this breaks 31 v1 vitest files).

```yaml
name: ci
on:
  push:
    branches: [main, v2]
jobs:
  ci:
    strategy:
      matrix:
        os: [macos-latest, ubuntu-latest, windows-latest]
        node: ["24.15.0", "26"]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: ${{ matrix.node }} }
      - run: npm install
      - run: node build/build.mjs --out release-out
      - run: node build/prompt-lint.mjs --out release-out
      - run: node e2e/cases/run.mjs
      - run: npx vitest run   # KEEP-PASS, GS4: must stay green, never deleted here
      - run: npm run lint     # existing lint config, if present
```

- Matrix is 3 OS × 2 Node lines (`24.15.0`, the `NODE_MIN` floor, and `26`, latest tested per S-NODE) — GS1's "GP1–GP11 pass on macOS, Linux and Windows" is satisfied because `e2e/cases/run.mjs` runs on every cell.
- No `pull_request:` trigger (pull requests are disabled on the repo, ADR-0014 §5).
- This is the `ci` job `release.yml`'s own `ci` job reuses by `workflow_call` or by duplicating the matrix (§9 below names it as a reused job; the simplest correct form — since GitHub Actions `workflow_call` needs the callee to declare `on: workflow_call` — is for `ci.yml` to also declare `workflow_call` as a trigger alongside `push`, and for `release.yml`'s `ci` job to be `uses: ./.github/workflows/ci.yml`).

**E2E proof:** GS1 itself (every GP case run under this workflow is the proof). ADR-0017 `covers`: `.github/workflows/ci.yml`.

## 9. `.github/workflows/release.yml`

Trigger: `workflow_dispatch` only, inputs `sha` (string, optional, defaults to the branch tip) and `mode` (`choice`: `release` | `rollback`, default `release`) — per ADR-0013 "Trigger: `workflow_dispatch` only (input `sha`, or `mode: rollback`)".

```yaml
name: release
on:
  workflow_dispatch:
    inputs:
      sha: { description: "commit to release", required: false, type: string }
      mode: { description: "release or rollback", required: false, type: choice, options: [release, rollback], default: release }
concurrency:
  group: release
  cancel-in-progress: false
jobs:
  ci:
    uses: ./.github/workflows/ci.yml
  plan:
    needs: ci
    runs-on: ubuntu-latest
    outputs:
      version: ${{ steps.plan.outputs.version }}
      notes: ${{ steps.plan.outputs.notes }}
    steps:
      - uses: actions/checkout@v4
        with: { ref: ${{ inputs.sha || github.sha }}, fetch-depth: 0 }
      - id: plan
        run: node scripts/release/plan.mjs >> "$GITHUB_OUTPUT"
  build:
    needs: plan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { ref: ${{ inputs.sha || github.sha }} }
      - uses: actions/setup-node@v4
        with: { node-version: "24.15.0" }
      - run: npm install
      - run: node build/build.mjs --out release-out -- --version ${{ needs.plan.outputs.version }}
      - run: node build/hash.mjs --out release-out
      - run: node build/prompt-lint.mjs --out release-out
      - run: npx claude plugin validate release-out
      - uses: actions/attest-build-provenance@v1
        with: { subject-path: "release-out/**" }
      - uses: actions/upload-artifact@v4
        with: { name: release-out, path: release-out }
  publish-stage:
    needs: [plan, build]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { ref: release-staging, fetch-depth: 0 }
        continue-on-error: true   # first release: branch does not exist yet
      - uses: actions/download-artifact@v4
        with: { name: release-out, path: release-out }
      - run: node scripts/release/publish.mjs --stage --version ${{ needs.plan.outputs.version }} --source-commit ${{ inputs.sha || github.sha }}
        # commits release-out/* onto release-staging with trailer "Source-Commit: <sha>"; pushes; tags v<version> --annotate --no-sign (draft: not pushed as a ref yet, kept local to this job's checkout then pushed as refs/tags draft)
  smoke:
    needs: publish-stage
    strategy:
      matrix: { os: [macos-latest, ubuntu-latest, windows-latest] }
    runs-on: ${{ matrix.os }}
    steps:
      - run: node scripts/release/smoke.mjs --ref release-staging --agent claude-code
      - run: node scripts/release/smoke.mjs --ref release-staging --agent codex
      - run: node scripts/release/smoke.mjs --ref release-staging --agent gemini
        continue-on-error: true   # tier-2 per GS2; failure here does not fail the job
  publish-promote:
    needs: smoke
    if: ${{ inputs.mode != 'rollback' }}
    runs-on: ubuntu-latest
    steps:
      - run: node scripts/release/publish.mjs --promote --version ${{ needs.plan.outputs.version }} --notes "${{ needs.plan.outputs.notes }}"
        # fast-forwards release to release-staging's commit; pushes the draft tag as a real ref; no GitHub release (D-RN-ORDER-1:
        # job github-release runs publish.mjs --github-release after publish-npm)
  rollback:
    needs: build
    if: ${{ inputs.mode == 'rollback' }}
    runs-on: ubuntu-latest
    steps:
      - run: node scripts/release/rollback.mjs --sha ${{ inputs.sha }}
        # resets release to the given prior commit (hard, force-with-lease); no smoke re-run, no new tag
```

- Concurrency group `release`, `cancel-in-progress: false` (ADR-0013: "two `/release` runs can never race the same `release` branch ref" — the second queued run waits, it is not cancelled, so a run already past `publish-promote` is never interrupted).
- `publish-stage` only ever writes `release-staging`; `publish-promote` is the only job that ever fast-forwards `release`; a `smoke` failure means `publish-promote`'s `needs: smoke` is unmet and `release` stays untouched — this is the "a failed smoke run leaves `release` untouched" guarantee (ADR-0013).
- `rollback` mode skips `smoke`/`publish-promote` entirely and goes straight from `build`'s `ci`+`plan` prerequisites to a hard reset — this answers "rollback" from the task: it is `mode: rollback` on this same workflow, not a separate workflow file, matching ADR-0013's single-workflow trigger line.
- `plan.mjs`, `publish.mjs`, `smoke.mjs`, `rollback.mjs` are owned by this module as `scripts/release/*.mjs`; they are not listed as separate rows in 00 §1 and are added here as Assumption A9 (below) because `release.yml`'s steps cannot be inline shell for logic this stateful (git trailer parsing, Conventional-Commits version bump, SHA256SUMS-verified smoke install).

**E2E proof:** 00 §5.6 (the full flow); GS7 (`GP1`, install-from-git-no-npm, is what `smoke.mjs` runs per agent); GS10 (v1-migration live case set runs as part of the owner's `/release` skill step before this workflow is dispatched, not inside the workflow itself — ADR-0017 keeps live cases off CI, "No API key, no CI live run"). ADR-0017 `covers`: `.github/workflows/release.yml`, `scripts/release/plan.mjs`, `scripts/release/publish.mjs`, `scripts/release/smoke.mjs`, `scripts/release/rollback.mjs`.

## 10. `scripts/release/plan.mjs`

### 10.1 Signature

```ts
async function main(): Promise<void>; // prints "version=<v>\nnotes<<EOF\n<notes>\nEOF\n" to stdout for $GITHUB_OUTPUT
```

**Steps:**
1. `git log <release-staging-or-release-head>..HEAD --format=%s` to collect commit subjects since the current `release` head's `Source-Commit:` trailer (read the trailer off the `release` branch's latest commit with `git log -1 --format=%B release -- .` and parse the `Source-Commit: <sha>` line; if `release` does not exist yet, treat the range as "all history up to HEAD" for a `0.1.0` first release).
2. Classify the highest bump across those subjects by Conventional Commits prefix: any subject containing `!` after the type/scope (e.g. `feat!:`, `fix(core)!:`) → major; else any `feat:` → minor; else any `fix:`/`perf:` → patch; else no version-worthy commit → exit 1 with `release failed: no releasable commits since <prior sha>`.
3. Read the current version from the last `release`-branch `.claude-plugin/plugin.json` (or `0.0.0` if `release` does not exist) and bump by the classification from step 2 (semver bump, plain arithmetic, no dependency).
4. Generate notes with `git-cliff` (devDependency) over the same commit range, Keep-a-Changelog style grouped by type.
5. Print `version=<x.y.z>` and a multi-line `notes` block in `$GITHUB_OUTPUT` heredoc form (GitHub Actions multi-line output syntax).

**E2E proof:** local case `e2e/cases/run.mjs` entry of `kind: "local"` (per `e2e/live/run.mjs`'s own case schema, reused for a non-live local script check) that seeds a fake git history and asserts the bump math; no live model needed. ADR-0017 `covers`: `scripts/release/plan.mjs`.

## 11. `scripts/release/publish.mjs`, `smoke.mjs`, `rollback.mjs`

### 11.1 `publish.mjs`

```ts
async function main(args: { stage: boolean; promote: boolean; version?: string; sourceCommit?: string; notes?: string }): Promise<void>;
```
- `--stage`: `git switch --orphan release-staging` the first time a `release-staging` branch does not exist remotely, else `git fetch origin release-staging && git switch release-staging`; delete everything in the working tree except `.git`; copy in the downloaded `release-out` artifact; `git add -A`; commit message `release vX.Y.Z` with a trailer line `Source-Commit: <sourceCommit>`; `git tag -a v<version> -m "v<version>"` (annotated, local only — not pushed yet, this is the "draft tag"); `git push origin release-staging --force-with-lease`.
- `--promote`: `git fetch origin release-staging`; `git push origin release-staging:release --force-with-lease` (fast-forward `release` to the exact `release-staging` commit — using `--force-with-lease` here is safe because this is the only job that ever writes `release`, serialized by the workflow's `concurrency.group: release`); `git push origin v<version>` (push the previously-local annotated tag now that smoke passed). No GitHub release here (D-RN-ORDER-1).
- `--github-release`: `gh release create v<version> --verify-tag --title v<version> --notes "<notes>" release-out/SHA256SUMS` (a prerelease adds `--prerelease --latest=false`). Refuses when the tag is not on the remote. `release.yml` job `github-release` runs it after `publish-npm` succeeds, or when `publish-npm` was not asked for, so a failed npm publish leaves no GitHub release (D-RN-ORDER-1).

### 11.2 `smoke.mjs`

```ts
async function main(args: { ref: string; agent: AgentId }): Promise<void>; // exit 1 on failure
```
Steps, per the ADR-0013 `smoke` job table row, run inside a throwaway `HOME` (`fs.mkdtempSync`) so the host install step 7 copies to a clean HOME per `e2e/live/run.mjs`'s own `ENABLE_CLAUDEAI_MCP_SERVERS=false`-style isolation pattern:
1. `claude-code`: `claude plugin marketplace add mksglu/context-mode --ref <ref>` then `claude plugin install context-mode@context-mode`; assert the plugin dir exists and `claude plugin validate` of the installed copy passes.
2. `codex`: write a `config.toml` `[mcp_servers.context-mode]` block pointing at the installed `server.mjs` (A2: Codex is a plain config entry, not a marketplace flow) under the throwaway `CODEX_HOME`; run `codex mcp list` (or the documented Codex handshake command) and assert the server answers `initialize`.
3. `gemini`: attempt `gemini extensions install https://github.com/mksglu/context-mode --ref <ref> --auto-update`; if the Gemini CLI is not installed/logged in on the runner, this step's non-zero exit is caught and reported as `SKIPPED: gemini not available`, not a hard failure (mirrors 00 §5.2's "agents actually run" rule — tier-2 per GS2 — matching the `continue-on-error: true` on this matrix leg in `release.yml`).
4. On any non-skipped failure: print the agent id and the first failing command's stderr line, exit 1.

### 11.3 `rollback.mjs`

```ts
async function main(args: { sha: string }): Promise<void>;
```
1. `git fetch origin release`.
2. Verify `sha` is an ancestor of the current `release` tip (`git merge-base --is-ancestor <sha> release`) — refuses to roll forward by accident.
3. `git push origin <sha>:release --force` (hard reset of the branch ref to a known-good prior commit — no smoke re-run, per ADR-0013's rollback input being named but not given its own gated flow; a rollback target was already smoke-tested when it was first promoted).
4. Print the rolled-back-to sha and the current `release` tip for the operator's log.

**E2E proof (all three):** the `smoke` and `publish-promote`/`rollback` jobs of `release.yml` are themselves the proof (ADR-0013's design is "one run" — there is no separate unit-test layer for git-plumbing scripts this small; TECH-SPEC §11's "no regex" rule is satisfied since none of these scripts parse with regex). ADR-0017 `covers`: `scripts/release/publish.mjs`, `scripts/release/smoke.mjs`, `scripts/release/rollback.mjs`.

## 12. `scripts/release/branch-protection.mjs`

### 12.1 Signature

```ts
async function main(): Promise<void>; // run by hand with a repo-admin token (gh auth), never in CI
```

**Steps:**
1. `gh api repos/$REPO/branches/main/protection -X PUT --input -` with this exact JSON body (ADR-0013 r3 Q14, A70):
   ```json
   {
     "required_status_checks": { "strict": true, "contexts": ["ci"] },
     "enforce_admins": true,
     "required_pull_request_reviews": null,
     "restrictions": null,
     "allow_force_pushes": false,
     "allow_deletions": false
   }
   ```
2. Print the API response's `url` and `enforce_admins.enabled` fields so the operator confirms by eye.
3. This script is also what `weekly.yml` (on `main`) diffs against: `weekly.yml`'s drift check runs `gh api repos/$REPO/branches/main/protection` (`GET`) and compares the same four fields (`required_status_checks.contexts`, `enforce_admins.enabled`, `allow_force_pushes`, `allow_deletions`) byte-for-byte against the JSON block above, which this script and `weekly.yml` both import from one shared `scripts/release/branch-protection-settings.json` file so the two can never drift apart silently.

**E2E proof:** none live (admin-token-gated, run by hand per ADR-0013 "Done by hand, once"); `weekly.yml`'s drift check is the standing proof that the setting has not regressed. ADR-0017 `covers`: `scripts/release/branch-protection.mjs`, `scripts/release/branch-protection-settings.json`.

## 13. `.claude/skills/release/SKILL.md` — the `/release` repo skill

Not shipped to users (release-only, repo-local skill, excluded from the built tree per §7 step 5). Frontmatter `name: release`. Body, as numbered steps an agent follows when the owner types `/release`:

1. Confirm the current branch is `v2` and `git status --porcelain` is empty; if not, stop and report what is dirty.
2. Run `node e2e/cases/run.mjs`. Any `FAIL` row stops here; report the failing case ids.
3. Run `npx vitest run` (KEEP-PASS, GS4). Any failure among the 131 tracked tests stops here.
4. Run `node e2e/live/run.mjs --all`. Count `SKIPPED` rows; if the count has reached `LIVE_SKIP_LIMIT` (3) or more, refuse to continue and report which cases were skipped and why (ADR-0013 "refuses if live skipped `LIVE_SKIP_LIMIT` times in a row" — tracked as a running count read from `metrics/live-skip-streak.json`, incremented on an `--all` run with any `SKIPPED` row and reset to 0 on a run with zero `SKIPPED` rows).
5. Run the v1-migration live case set (`e2e/live/cases/v1-migration-*.json`) explicitly, as part of the same `--all` invocation (these cases carry `covers` paths that include `v1-transition`, so `--all` already selects them; this step is a named checkpoint, not a second invocation) — GS10.
6. If all of steps 2–5 pass: compute the version and notes preview by running `node scripts/release/plan.mjs` locally (dry run, no push) and show the owner the version bump and the notes.
7. On the owner's go-ahead (the act of running `/release` already is the approval, ADR-0013 "Starting the skill is the approval" — step 6's preview is informational, not a second confirmation gate), dispatch: `gh workflow run release.yml -f sha=$(git rev-parse HEAD)`.
8. Watch the run with `gh run watch` and stream its job statuses back to the owner; on completion, report the published version and a link to the GitHub Release.
9. `skip-live` flag: if the owner types `/release skip-live`, skip steps 4–5 and write that choice into the eventual release notes (ADR-0013 "`skip-live` is allowed and is written into the release notes" — pass a `--skip-live` marker through to `plan.mjs`'s notes text as an explicit line, e.g. "Live E2E skipped for this release.").

**E2E proof:** this skill's steps are rehearsed by the owner, not by an automated case (it is the thing that triggers the automated layers below it); `release.yml`'s `ci`+`smoke` jobs are the proof that what the skill dispatches actually works. ADR-0017 `covers`: `.claude/skills/release/SKILL.md`.

## 14. `.github/workflows/weekly.yml`

Named in ADR-0013 §Other workflows; it goes on `main` (owner: "main'e ekleyelim"), owned by this module since it is CI/release-adjacent plumbing, not product code. The README badge counts come from `.github/workflows/readme-stats.yml` (`stats.json`, D-README-STATS-1); there is no traffic workflow (D-REPO-NO-METRICS-1).

### 14.2 `weekly.yml`
```yaml
name: weekly
on:
  schedule: [{ cron: "0 4 * * 1" }]
  workflow_dispatch: {}
jobs:
  weekly:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: node scripts/release/smoke.mjs --ref release --agent claude-code
      - run: node scripts/release/smoke.mjs --ref release --agent codex
      - env: { GH_TOKEN: ${{ secrets.GITHUB_TOKEN }} }
        run: node scripts/release/check-branch-protection.mjs   # diff against branch-protection-settings.json, §12 step 3
      - uses: actions/setup-node@v4
        with: { node-version: "24.15.0" }
      - run: npm install && npm audit --audit-level=high
```

**E2E proof:** the workflow runs for real on `main` on a schedule; there is no GP/live case (they run outside the `v2` CI surface by design — ADR-0013 keeps them off `v2`). ADR-0017 `covers`: `.github/workflows/weekly.yml`, `scripts/release/check-branch-protection.mjs`.

## Assumptions

- A9: `scripts/release/{plan,publish,smoke,rollback}.mjs`, `branch-protection.mjs`, `branch-protection-settings.json`, `check-branch-protection.mjs` are added as files this module owns, under `scripts/release/`. 00 §1 names `release.yml`'s jobs (plan/build/publish/smoke) and ADR-0013's branch-protection script by filename but 00's file tree table has no `scripts/` row; `scripts/` is the natural home (it already exists in the repo for other one-off tooling) and keeps `release.yml`'s YAML free of multi-step inline shell that 00's "no regex / staged git plumbing" needs real control flow for.
- A10: `release.yml`'s `ci` job reuses `ci.yml` via `workflow_call`, so `ci.yml` declares both `on: push` and `on: workflow_call`. ADR-0013 says only "reuses `ci.yml`" without naming the GitHub Actions mechanism; `workflow_call` is the only reuse mechanism that runs the identical job definition rather than duplicating the matrix.
- A11: `plan.mjs`'s version source when `release` does not exist yet is `0.0.0` bumped to `0.1.0` is replaced by the plugin manifest's literal first value `"2.0.0"` (ADR-0011 §Release steps 1a: "set `version: 2.0.0`... the first time"). The very first `/release` run is therefore a special case the owner runs once by hand, matching ADR-0011's "Each outward step is approved separately" — `plan.mjs` detects "no `release` branch" and prints version `2.0.0` instead of computing a bump, rather than failing.
- A12: `LIVE_SKIP_LIMIT` streak tracking (§13 step 4) is stored in `e2e/live/skip-streak.json` on `v2` (committed by the skill run only when the file changed) because ADR-0013 names the limit but not where the running count persists across separate `/release` invocations.
- A13: `check-removed.mjs` (GS5 file-existence half) stays owned by `v1-transition` per 00 §1's module table; this file's §7 `lint.mjs` only implements the byte-level half (GS5's `lint.mjs` clause + GS9), not the file-existence half, to avoid owning across the module boundary 00 §2 draws.
- A14 (S7): `build/build.mjs` step 2 names no esbuild version. No ADR or impl file pins one. Decided here with the smallest rule consistent with GS7 (no `node_modules`, no `dependencies` on `release`, dev-only tool): pin the exact version `esbuild@0.24.0` (current stable at doc time) as a dev dependency, no range operator, so a `npm install` on two machines builds byte-identical output. A version bump is a separate, reviewed change, never an automatic range update.
- A15 (S7): the CI matrix's exact Node "current" line (§9/§13, "3 OS × Node 24.15.0 and current") is `24.15.0` (the `NODE_MIN` floor) and `26` (latest tested, per S-NODE) — already named at §9; this row only cross-references it so §2.2 readers do not re-ask the question.

## Changes

- r9 (2026-10-16, `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/review/DECISIONS-r9.md`, role S7): §3 step 2 `hooks+mcp` row and new step 5 add `buildMatcher(row)` (DECISIONS-r9 R4) as the exact function `build/manifests.ts` exports to render each hook file's `matcher` from `row.nativeTools` plus the escaped `row.toolNamePrefix`, with the Codex example `^(Bash|apply_patch|mcp__context_mode__ctx_.*)$` (R1 prefix); §2.2 step 1 pins `esbuild@0.24.0` exact, no range (A14); Assumptions A15 cross-references the already-decided CI Node matrix (`24.15.0` + `26`) for the §2.2 question.
