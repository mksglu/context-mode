# 15 — Module `v1-transition`: implementation spec

Follows `00-architecture.md` §1 (source tree), §2 (module table, row `v1-transition`), §5.5 (install/upgrade/uninstall flow), §5.6 (release flow). Sources: ADR-0011, ADR-0017 (R1–R8), ADR-0010 (doctor/upgrade), ADR-0015 (README outline, repo cleanup), DECISIONS-r3 Q14/Q16, DECISIONS-r4 (A2, A29, A30, A37, A44, B22, B25, B28, B30, B76), README.md §6.

This module owns three files only (00 §1, row `v1-transition`):

| File | Purpose |
|---|---|
| `build/check-removed.mjs` | CI gate: fail if a removed v1 path or routing file still exists on `v2` |
| `README.md` §5 "Upgrading from v1" | the v1→v2 switch steps, the feature table, the rollback table |
| `e2e/live/cases/v1-migration-*.json` | R8 live case set |

It imports nothing from `src/` (00 rule "`e2e/` never imports `src/`", GS4; `build/check-removed.mjs` is a CI script, not part of the module DAG in §2, so it has no "Imports" cell). Its only runtime dependency is `detectV1`, owned by `tools-ops` (`src/core/ops/detect-v1.ts`), and this module never calls it directly — it is exercised only through the `ctx_doctor`/`ctx_upgrade` tool calls the live cases drive end to end (00 §2 row `v1-transition`: "Imports: tools-ops (`detectV1` behavior via E2E only)").

Write in this order:

1. `build/check-removed.mjs` (no dependency on the others)
2. `e2e/live/cases/v1-migration-*.json` (needs the removed-path list from step 1 for its own assertions)
3. `README.md` §5 (restates the commands already fixed in steps 1–2, so write it last)

A fourth deliverable is **not** a file in this repo: the one v1 patch (R2) that changes `main`'s frozen `package.json`-era source. It ships as its own npm release, outside the `v2`/`release` branches, and needs the owner's separate approval (00-architecture.md rule "every outward step needs its own approval", ADR-0011 "Release steps"). §1 below is its spec; the code lives on `main` at v1's own file paths, not under `docs/architecture/modules`.

---

## 1. The v1 patch line (R2) — spec only, ships as a v1 release, not v2 code

**Covers:** ADR-0017 R2. **Proof case:** none in `e2e/` (v1's own test suite proves it; v2's `tests/` never imports it). This is the one R-row with no E2E-live case, because it runs on `main`'s v1 code before v2 exists for the user.

### 1.1 What changes

Exactly one line is added to each of v1's two existing output paths:

- `ctx_doctor`'s output (v1's doctor report, whatever file currently builds it on `main`)
- `ctx_stats`'s output (v1's stats report)

### 1.2 Exact text

```
context-mode v2 is available: https://github.com/mksglu/context-mode/blob/main/README.md#upgrading-from-v1
```

This is Assumption A1 (§7 below): ADR-0011 names the sentence ("context-mode v2 is available: <link to Upgrading from v1>") but not the literal URL. The link target is `README.md`'s §5 heading, anchored by GitHub's own heading-to-anchor rule (`## Upgrading from v1` → `#upgrading-from-v1`), because ADR-0011 §"d) npm deprecate" already names the README as "the main channel" and gives no second doc.

### 1.3 Steps

1. Append the line in §1.2, verbatim, as the last line of `ctx_doctor`'s printed report.
2. Append the same line, verbatim, as the last line of `ctx_stats`'s printed report.
3. No other line in either report changes. This is "the only v1 change" (ADR-0017 R2: "the last v1 build (one owner-approved v1 patch, the only change to `main`'s code)").
4. Cut `package.json`'s `version` field: **do not bump it.** ADR-0011 "Why `main` stays frozen": v1's own `/ctx-upgrade` compares `package.json` version against `main`'s; if they are equal it does nothing. Bumping the version here would make v1's own upgrade command try to rebuild from `main`, which breaks R1 ("`main` stays frozen").
5. Publish this single patch to npm under the current v1 major/minor, as a new patch version (so `npm install -g context-mode` picks it up, but v1's own `main`-vs-`package.json` check in step 4 still reports "already on latest" for everything else).

### 1.4 Errors

None — this is a static string addition to an existing report, not a new code path.

### 1.5 Constants used

None (this file lives outside `src/core/contracts/constants.ts`'s reach; it is v1 code).

---

## 2. `build/check-removed.mjs`

**Covers:** ADR-0015 "Unnecessary files" (the DELETE list), ADR-0011 v1-cleanup table (file-level removals), GS5 ("fail if a removed path or routing file exists"). **Proof case:** `e2e/live/cases/repo-cleanup-gate.json` (local kind, §3.3 below) — note this single case belongs to this file's own proof, listed separately from the `v1-migration-*` set because it runs against the `v2` repo tree itself, not an installed agent.

### 2.1 Export

This is a CLI script (`node build/check-removed.mjs`), not a module with TypeScript exports. Its contract:

```ts
// conceptual signature; the file has no exports, it is a process entry point
function main(repoRoot: string): never; // process.exit(0) or process.exit(1)
```

### 2.2 Inputs

- `repoRoot`: `process.cwd()`. The script assumes it runs from the repository root (CI `ci.yml` always invokes it there).
- An internal, hard-coded `REMOVED_PATHS: string[]` array — the exact list from ADR-0015 "Unnecessary files" §"Largest items deleted" plus ADR-0011's per-agent v1-footprint "file"/"data" column paths that are config/script files (not user data dirs, which cannot be checked from a repo tree — see §2.4).

### 2.3 Steps

1. Build `REMOVED_PATHS` as a literal array of repo-relative globs, one entry per bullet in ADR-0015 "Largest items deleted":
   - `web/`
   - `start.mjs`, `bin/statusline.mjs`, `bun.lock`, `stats.json`, `BENCHMARK.md`, `vitest.config.ts`, `.npmignore`, `.mcp.json*.example`
   - `.pi/`, `.claude/skills/context-mode-ops`
   - `configs/**/*.json`, `configs/**/*.toml` (the 10 v1 skill files and all v1 routing/instruction files under `configs/`)
   - `src/cli.ts`, `src/pricing.ts`, `src/model-prices.json`, `src/sibling-mcp.ts`, `src/plugin-cache-integrity.ts`, `src/flood-guard.ts`
   - `docs/adr/0001.md`, `docs/adr/0002.md`, `docs/adr/0003.md`, `docs/adr/0004.md` (the v1 ADR numbers that clash with the v2 set)
   - `docs/kimi-code.md`, `docs/openclaw.md`, `docs/jetbrains.md`
   - `.github/workflows/openclaw-e2e.yml`, `.github/workflows/update-stats.yml`, `.github/workflows/tier2-e2e-smoke.yml`, `.github/workflows/bundle.yml`
2. For each glob in `REMOVED_PATHS`: resolve it against `repoRoot` with `fs.readdirSync`/`fs.existsSync` (no shell glob call — no regex rule, 00-architecture.md rule 4, applies to this CI script too per ADR-0015's own instruction to treat these as literal path checks, not pattern matches; a trailing `/**/*.ext` entry is split into its literal directory part, checked with `fs.existsSync`, then its files listed and matched by literal suffix comparison, never a regex).
3. If any path in `REMOVED_PATHS` still exists on disk: collect it into a `found: string[]` list. Do not stop at the first hit — report all of them in one run.
4. Separately, scan every file under `src/`, `build/`, and the repo root for the literal substrings `"ctx_fetch_and_index"` and `"ctx_batch_execute"` (the two retired tool names, ADR Assumption A3 in 00-architecture.md) using plain `String.prototype.includes`, never a regex. Any hit is a "routing file" violation and is added to `found`.
5. If `found` is empty: print `"check-removed: clean"` and `process.exit(0)`.
6. If `found` is non-empty: print one line per entry — `"check-removed: still present: <path>"` — then `process.exit(1)`.

### 2.4 Error cases

| Cause | Behaviour |
|---|---|
| A path in `REMOVED_PATHS` still exists | printed as `still present: <path>`, exit 1 (this is the gate's purpose, not an exception) |
| A retired tool-name substring is found in any scanned file | printed as `still present: <path>` with the file's path, exit 1 |
| `repoRoot` is not a git repository root (no `.git`) | the script does not special-case this; `fs.existsSync` checks simply all report "not found" and the script exits 0. This is intentional — a CI misconfiguration that runs the script from the wrong directory is caught by the surrounding `ci.yml` step failing for an unrelated reason, not by this script (00 rule "one path, no fallback chains": this script has exactly one job, checking paths, and does not also validate its own working directory) |

### 2.5 Constants used

None. This script has no entry in `src/core/contracts/constants.ts` — its `REMOVED_PATHS` list is literal data owned by this file alone, not a cross-module constant (nothing else in the codebase reads it).

---

## 3. `e2e/live/cases/v1-migration-*.json` — the R8 case set

**Covers:** ADR-0017 R8, ADR-0011 (v1 cleanup table, rollback facts), ADR-0010 (D4 check). **Runs:** only in `node e2e/live/run.mjs --all` (README §6: "the full live set before every release"), never in step mode, because every case here needs a temp `HOME` with a planted v1 install, not a diff against changed files.

Each file follows the shape already used by `e2e/live/cases/*.json` (§"`e2e/live/run.mjs`" in the sources): `{ id, covers, kind, prompt|run, tools, expect }`. `kind: "model"` cases drive the installed agent through `claude` (or another agent's live driver, per ADR-0012); `kind: "local"` cases run a Node script directly.

### 3.1 Setup shared by every case in this set (`e2e/live/cases/v1-migration-setup.mjs`, a helper the harness's `kind:"local"` cases call, not a case file itself)

```ts
export function plantV1Install(agentId: AgentId, home: string): void;
```

**Steps:**
1. Create `home` as a fresh temp directory (the harness's caller is responsible for this; `plantV1Install` never deletes an existing directory — one path, no fallback chain).
2. Write the exact v1 footprint files named in ADR-0011's "v1 cleanup" table for `agentId` (e.g. for Claude Code: `settings.json` with a `.hooks.*` inner hook whose command contains `context-mode hook`; `~/.claude.json` with `.mcpServers["context-mode"]`; a non-empty `<configDir>/context-mode/` data dir).
3. Return nothing; the caller (the case's `run` array) points the real agent binary at `home` via its home-directory env var (`HOME` for Claude Code/Codex/Gemini/Qwen/Copilot CLI/VS Code/Kiro/ZCode; the agent-specific equivalent for Pi and OpenCode 2, per each adapter's `resolveConfigDir`).

**Errors:** `plantV1Install` throws (uncaught, process exits non-zero) if `agentId` is not one of the 10 `AGENT_IDS` — this is a harness-authoring bug, not a runtime condition to handle gracefully.

**Constants used:** none — the planted file contents are literal fixtures mirroring ADR-0011's table, not shared runtime constants.

### 3.2 Case files, one per agent whose v1 hooks call the global bin (ADR-0011 "Facts": Copilot CLI, VS Code, Codex, Gemini, Kiro)

| Case id | covers | Steps proved |
|---|---|---|
| `v1-migration-claude-code` | `docs/architecture/adr/0011`, `src/core/ops/detect-v1.ts`, `src/core/tools/upgrade.ts` | plant v1 Claude Code install → install v2 → `/ctx-upgrade` → `ctx_doctor` reports clean (no D4 FAIL) → a routing case (an existing GP3-style prompt) still passes |
| `v1-migration-codex` | same | same sequence for Codex's `config.toml` rewrite path |
| `v1-migration-gemini` | same | same sequence; also asserts the data-dir-delete prompt fires (ADR-0011 "Delete data only after a prompt, because Antigravity shares this dir") and is declined by default (no silent delete) |
| `v1-migration-copilot-cli` | same | plant v1 install → install v2 → `/ctx-upgrade` → `npm uninstall -g` → Copilot CLI hook still fires and `handleHook` still runs (the named R8 case: "closes the R3 gap where they call the global bin", ADR-0017 R8) |
| `v1-migration-vscode` | same | same sequence as `v1-migration-copilot-cli`, for VS Code; also asserts both session-data paths (`.github/context-mode/sessions/` and the `~/.vscode/...` fallback, DECISIONS-r4 B28) are reported by `ctx_doctor`, and the `.vscode/mcp.json` leftover entry is flagged |
| `v1-migration-kiro` | same | plant Kiro's flat-hooks fixture (DECISIONS-r4 A37: scan `~/.kiro/agents/*.json` `name == context-mode`, flag `.kiro/steering/KIRO.md` for manual review, never auto-delete it) → `/ctx-upgrade` → `ctx_doctor` clean except the flagged steering doc |

### 3.3 Supporting local case

| Case id | covers | kind | run |
|---|---|---|---|
| `repo-cleanup-gate` | `build/check-removed.mjs` | `local` | `["node", "build/check-removed.mjs"]`; `expect: {}` (exit 0 required) |

### 3.4 Case JSON shape (example, `v1-migration-copilot-cli`)

```json
{
  "id": "v1-migration-copilot-cli",
  "covers": ["docs/architecture/adr/0011-release-and-v1-transition.md", "src/core/ops/detect-v1.ts", "src/core/tools/upgrade.ts"],
  "kind": "model",
  "prompt": "A temp HOME has a v1 Copilot CLI install (hooks/context-mode.json calling the global bin). Install context-mode v2, run /ctx-upgrade, then run `npm uninstall -g context-mode`. Confirm the Copilot CLI hook still runs successfully afterward. Reply with one line: PASS or FAIL.",
  "tools": ["Bash", "Read"],
  "expect": { "firstLineStartsWith": "PASS" }
}
```

### 3.5 Error cases

None at the JSON-file level — a case file is data, not code. The harness (`e2e/live/run.mjs`, already built) is the only reader; its own error handling (SKIPPED on no agent binary, FAIL on a non-matching first line) already covers every failure mode for this set, per the source already in the repo.

### 3.6 Constants used

None owned by this module. The harness constants (`--model claude-sonnet-5 --effort low --budget 0.25`) are `e2e/live/run.mjs`'s own defaults (tests module), reused here, not redefined.

---

## 4. `README.md` §5 "Upgrading from v1"

**Covers:** ADR-0015 (README outline row 5, ~22 lines), ADR-0011 (release-step commands, v1-cleanup table, rollback facts), ADR-0017 R3/R5/R7. **Proof case:** `e2e/live/cases/spikes-applied.json`-style local assertion is not enough on its own for this section's content; the live proof is the `v1-migration-*` set in §3, which exercises the commands this section documents.

### 4.1 Steps to write the section

1. Write the exact heading `## Upgrading from v1` (ADR-0015 row 5; this exact string is what `#upgrading-from-v1` anchors to for the v1 patch's link, §1.2).
2. First paragraph (2–3 lines): state the order from ADR-0017 R3 / DECISIONS-r3 ADR-0017-R3: **install v2 first → run `/ctx-upgrade` → only then `npm uninstall -g context-mode` last.** State the reason in one sentence: Copilot CLI, VS Code, Codex, Gemini and Kiro v1 hooks call the global `context-mode` binary, and running `npm uninstall -g` before `/ctx-upgrade` breaks those hooks until the upgrade finishes (ADR-0011 "Facts").
3. Per-agent install/update command table — copy verbatim from ADR-0011 "c) Docs and release note" table, one row per agent, **only for a row whose live command has actually passed a live install test** (ADR-0015 row 4 rule, reapplied here per row 5's own instruction "done in one sitting" — a row without a passing live case says "see guide" instead of a command, same rule as the Install section).
4. v1 feature → v2 table. One row per v1 feature that is removed outright (no direct replacement) or changed, each naming why and what replaces it:

   | v1 feature | Status in v2 | Why / replacement |
   |---|---|---|
   | `statusline` (`context-mode statusline`) | Removed | no `statusline` command in the v2 CLI (ADR-0019 has `setup`, `doctor`, `upgrade`); `ctx_doctor`/`ctx_stats` give the same numbers inside the agent |
   | `ctx_insight` | Removed | folded into `ctx_stats`'s existing numbers; no separate tool in the 9-tool set (README §4) |
   | `ctx_purge` scopes | Changed | kept, but scopes now match v2's three-level `SearchScope` (`session`/`worktree`/`project`) instead of v1's ad-hoc scope strings |
   | the CLI (`context-mode <cmd>`) | Replaced | ADR-0019: v2 ships a small CLI, `context-mode setup|doctor|upgrade` (the v1 forms `hook <platform> <event>` and `mcp` are accepted, D4). Every other v1 CLI action maps to an MCP tool or a skill (`/ctx-stats`, `/ctx-doctor`, `/ctx-upgrade`) |
   | call-rate throttling on search (`flood-guard.ts`) | Removed, not replaced | a single global counter re-trips on legitimate fan-out from v2's concurrent subagents (ADR-0015, replaying #769); no replacement is planned |

5. Rollback table — one row per agent, the exact command to reinstall v1:

   | Agent | Rollback command |
   |---|---|
   | Claude Code | `npm install -g context-mode` (reinstall the last v1 npm version), then `claude plugin uninstall context-mode@context-mode` to remove the v2 marketplace entry |
   | Codex | revert `config.toml`'s `[mcp_servers.context-mode*]` block to the v1 entry (`npx -y context-mode mcp`), then restart Codex |
   | Gemini | `gemini extensions uninstall context-mode`, then add the v1 entry by hand in `~/.gemini/settings.json`: `"mcpServers": {"context-mode": {"command": "npx", "args": ["-y", "context-mode", "mcp"]}}` (ADR-0011 "Facts": no CLI-native rollback exists for this install path) |
   | Qwen | same as Gemini, under `~/.qwen/settings.json` (ADR-0011 "Facts") |
   | Copilot CLI | `npm install -g context-mode`, then recreate `~/.copilot/hooks/context-mode.json` from the v1 release's own install step |
   | VS Code | `npm install -g context-mode`, then recreate `<project>/.github/hooks/context-mode.json` from the v1 release's own install step |
   | Kiro | `npm install -g context-mode`, then recreate the flat `.hooks.*` entries in `~/.kiro/agents/default.json` from the v1 release's own install step |
   | Pi | remove the git entry from `~/.pi/agent/settings.json` `packages[]`, then re-add `"npm:context-mode"` |
   | OpenCode 2 | remove the git spec from `.plugin[]`, then re-add the bare `"context-mode"` npm spec |
   | ZCode | `npm install -g context-mode`, then recreate the Codex-shaped `~/.zcode/cli/hooks.json` entry from the v1 release's own install step |
6. Close the section with one line pointing at the support runbook for the two agents with no scripted rollback (Gemini, Qwen), per ADR-0011 "Facts" last bullet.

### 4.2 Error cases

None — this is documentation prose, not code.

### 4.3 Constants used

None.

---

## 5. Order of implementation for this module

1. `build/check-removed.mjs` (§2) — no dependency on anything else in this module.
2. `e2e/live/cases/v1-migration-setup.mjs` helper, then the six `v1-migration-*` case files and `repo-cleanup-gate.json` (§3) — depends on `check-removed.mjs` existing so `repo-cleanup-gate` has something to run.
3. `README.md` §5 (§4) — written last because it restates exactly the commands the first two steps already fixed as literal strings; writing it last avoids restating a command that step 1 or 2 later corrects.
4. The v1 patch (§1) is scheduled independently, after `README.md` §5 exists (so its link target is real), and needs the owner's separate release approval before it ships.

---

## 6. v1 env vars: kept or ignored (DECISIONS-r9 E2, E3)

`README.md` §5's feature table lists each v1 env var's v2 fate so an upgrading user does not guess:

| v1 env var | v2 fate | Why |
|---|---|---|
| `CONTEXT_MODE_REQUIRE_SECURITY` | kept, same name, now `REQUIRE_SECURITY_ENV` (00-architecture.md §3.2 constant) | E2: fail-closed opt-in. `=1` and the user's policy file cannot be read/parsed → deny every PreToolUse with `"context-mode: your deny rules could not be read. Fix: run ctx_doctor."`; unset → allow and log to stderr. |
| `CONTEXT_MODE_BASH_NUDGE_MIN_COMMAND_BYTES` | ignored (not ported) | E3: v2 hints once per session (ADR-0008 item 7); a size threshold cannot re-nudge a small call, and v1's denies never depended on command size either. |

## 7. Assumptions

| # | Assumption | Reason |
|---|---|---|
| A1 | The v1 patch's doctor/stats line links to `https://github.com/mksglu/context-mode/blob/main/README.md#upgrading-from-v1`. | ADR-0011 names the sentence but not the URL; README.md is already named as "the main channel" in the same ADR, and GitHub's own anchor rule gives this exact fragment for the `## Upgrading from v1` heading. |
| A2 | `build/check-removed.mjs`'s `REMOVED_PATHS` list is the literal set from ADR-0015's "Largest items deleted" bullets, not every one of the "489 files / 10,089,511 bytes" counted there. | ADR-0015 gives a full byte count but only enumerates the largest items by name; checking every one of 489 files would require a second, unwritten ledger (ADR-0015 itself defers `tests/` deletion "once the GS4 ledger is complete" — that ledger is out of this module's scope). |
| A3 | `plantV1Install`'s fixture content is the literal file/path text from ADR-0011's v1-cleanup table per agent, not a byte-for-byte copy of any real v1 release artifact. | ADR-0011's table is the only source of truth for "what a v1 install leaves behind" available to this spec; no v1 fixture file is named in the sources list. |
| A4 | Rollback commands for Copilot CLI, VS Code, Kiro and ZCode reinstall v1 via `npm install -g context-mode` plus hand-recreating the hook file "from the v1 release's own install step". | ADR-0011 marks these agents "test first, then document" and gives no rollback command; since their forward-install path is exactly "the agent's git install" after `npm uninstall -g` (ADR-0011 "npm users" row), the symmetric rollback is reinstalling the npm package that still carries the original install logic — the same reasoning ADR-0011 uses explicitly for Pi and OpenCode 2 (reverse the exact forward-install edit). |
| A5 | The `repo-cleanup-gate` live case belongs to this module's case set even though its `id` does not match the `v1-migration-*` glob in 00-architecture.md §1. | 00's row for this module names `build/check-removed.mjs` as an owned file; a file with no proof case would violate this task's own rule ("every function names the E2E case that proves it"), so one local case is added under this module rather than left uncovered. |

## Changes

- 2026-10-16 (DECISIONS-r9, S8): added §6 naming each v1 env var's v2 fate (E2 `CONTEXT_MODE_REQUIRE_SECURITY` kept as `REQUIRE_SECURITY_ENV`, E3 `CONTEXT_MODE_BASH_NUDGE_MIN_COMMAND_BYTES` ignored); renumbered old §6 Assumptions to §7 and fixed its one cross-reference.
- 2026-10-19 (M7-S1): sign-off run recorded in TECH-SPEC §1.1. `check-removed.mjs` FAIL (22 paths), live T-CMP FAIL, R1/R2 PENDING owner. M7 stays open in `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/.impl/progress.json`.
- 2026-10-19 (M7-S2): second-pass DEVIATION blocks copied into DEVIATIONS.md (T9-1/2, F5-1, CA-1, W3-1, CX-1/2, W4-1). `check-removed.mjs` exit 0 and the 6 `v1-migration-*` live cases PASS, so R3–R8 PASS; R1, R2 PENDING owner (D-M7-arch-5). TECH-SPEC §1.1 lists GS6 and GS11 FAIL; M7 stays open in `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/.impl/progress.json`.
