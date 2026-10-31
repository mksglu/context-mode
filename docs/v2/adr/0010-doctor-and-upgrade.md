# ADR-0010: `ctx_doctor` and `ctx_upgrade` stay, rebuilt for v2

- Status: Accepted (2026-10-14, owner: "doctor ve upgrade kalsın, v2'ye göre geliştirelim")
- Related: TECH-SPEC §3.9 (skills `/ctx-doctor`, `/ctx-upgrade`), §3.11 · ADR-0011 (v1 cleanup) · GP11

## Context

v1 issue titles that mention doctor: 35 (8 open). Upgrade or heal: 70 (18 open). The failure classes:

| Class | Issues |
|---|---|
| False FAIL, or PASS on a broken state | #1152 (Codex hooks on by default), #1014 (PASS on an empty index), #548 (path with a space), #712 (Gemini path) |
| Paths and versions baked into config | #711, #1005, #523, #1090 |
| Two install trees | #901 |
| User settings reverted | #1226 (hook timeouts) |
| npm, Bun, ABI | #514, #543, #889 |

Root cause: v1 doctor compares path *strings* against guesses. v1 upgrade runs npm and writes absolute versioned paths into the config.

## Decision

### `ctx_doctor`: read-only, one table row per check

Each FAIL row gives the cause and a one-line fix, in one exact string per host (so scripts can match on it and users can search it):

| Host | FAIL string |
|---|---|
| Claude Code | `FAIL claude-code: <check> — <cause>. Fix: <command>` |
| Codex | `FAIL codex: <check> — <cause>. Fix: <command>` |
| Gemini / Qwen | `FAIL gemini: <check> — <cause>. Fix: <command>` (Qwen: same string, host name swapped) |
| Copilot CLI | `FAIL copilot-cli: <check> — <cause>. Fix: <command>` |
| VS Code | `FAIL vscode: <check> — <cause>. Fix: <command>` |
| Kiro | `FAIL kiro: <check> — <cause>. Fix: <command>` |
| Pi | `FAIL pi: <check> — <cause>. Fix: <command>` |
| OpenCode 2 | `FAIL opencode: <check> — <cause>. Fix: <command>` |

`<check>` is the row id below (e.g. `D8`), `<cause>` is one line of plain English, `<command>` is copy-pasteable. Doctor never writes files, never installs anything, and never spawns on a timer — except the one exception in D8 below.

| # | Check | How |
|---|---|---|
| D1 | version: running bundle vs latest `release` commit | bundle constant; `git ls-remote`. No network gives "unknown", not FAIL |
| D2 | Node is at or above the minimum, and `node:sqlite` loads | process. Also probes for a Bun runtime (`process.versions.bun`) and reports which runtime is actually executing — the one place the GS6 fallback-chain decision (REVIEW-r4a.md item 31) has to change if the detection logic changes |
| D3 | host config for **this** agent | parse the config and compare it **as data** with what `adapters/table.ts` generates: MCP entry, 4 hooks, timeouts |
| D4 | v1 leftovers | the ADR-0011 detect function; each finding is listed with its fix |
| D5 | hook round trip | run the hook entry with the recorded fixture shipped in the bundle; check the output shape and that the hook's cost is ≤ 40 ms: hook wall minus bare `node -e ""` wall, fastest of 3 to 9 pairs, more pairs only while the estimate is over the bound (D-D5-BARE-1, D-D5-MORE-PAIRS-1) |
| D5b | double-fire | both the Claude Code `settings.json` hooks **and** VS Code's `chat.useClaudeHooks` are active for the same repo (the latter re-runs the former's hook commands). FAIL with the fix: disable one of the two |
| D6 | MCP | this process was started by the host: client name and protocol version from the request |
| D7 | project and worktree | resolved from the agent's single source: for most hosts, the MCP `roots/list` root; for Pi, the extension API's `ctx.cwd` at plugin-load time (Pi has no `roots/list`). A live check confirms the resolved path matches the host's actual cwd across worktrees; mismatch is a FAIL, not a silent wrong answer |
| D8 | `context.db` | `integrity_check`, FTS5 integrity, schema version. On `integrity_check` failure only, doctor is allowed one write: rename the corrupt `context.db`/`-wal`/`-shm` aside and recreate empty, OR — when the live writer that owns the WAL checkpoint (ADR per Q6) is the one running — attempt `healLossless` first (open readonly, `VACUUM INTO` a clean copy, atomic swap) before falling back to rename-and-recreate. This mirrors v1's lossless-heal path (`50aafdce`, `withRetry` + `healLossless` in `db-base.ts`) and is the single named exception to "doctor never writes files" |
| D9 | index | source and chunk counts per scope. An empty index is reported as such (#1014) |
| D10 | enforcement mode for this agent | rewrite, cap or hint (ADR-0008) |

**Tools, count.** `ctx_doctor` and `ctx_upgrade` (uninstall as `ctx_upgrade`'s mode, per Q16) are 2 of the project's 9 MCP tools: `ctx_execute`, `ctx_batch`, `ctx_index`, `ctx_search`, `ctx_resume`, `ctx_stats`, `ctx_doctor`, `ctx_upgrade`, `ctx_purge` (PRD-v2.md §16, TECH-SPEC §3.9/3.11). Any older text elsewhere claiming doctor/upgrade were removed, or counting 7 tools, is stale and superseded by this ADR.

### `ctx_upgrade`: one path per install mode, no fallback

All three operations — install, `ctx_upgrade`, and `ctx_doctor`'s D4/D7 checks — call one shared `resolvePluginRoot(adapter)` function. There is no per-adapter divergent copy of this logic; a path-resolution fix lands in one place.

0. **On install, and once automatically at the start of every `ctx_upgrade` run** (not only when the user types `ctx doctor` by hand), run the D1/plugin-cache-path check. This is the same check that catches the original upstream Claude Code auto-update bug (stale cached plugin dir served after a version bump) — running it only on manual `ctx doctor` let that class of bug recur silently, so it now also runs on every install/update.
1. Read the install mode from the adapter table: marketplace plugin, git checkout, or in-process plugin.
2. **Marketplace or host-managed** (Claude Code, Codex, Gemini, Qwen, Copilot CLI): print the host's own update command. ctx_upgrade does not download anything itself; it only does steps 3–5.
3. **Git checkout** (Pi, OpenCode 2, manual installs):
   - fetch the latest `release` commit into a new version dir
   - verify the bundle hash
   - switch to it atomically (rename)
   - keep the previous dir for one rollback
   - OpenCode 2 uses this same git-checkout path for upgrades too — there is no separate host-managed-plugin-spec alternative for OpenCode (that alternative is rejected: the OpenCode plugin spec stays on the git path; ADR-0019 sends users to `context-mode setup` for the npm channel)
4. **Config:** regenerate only context-mode's entries from `adapters/table.ts`.
   - Keep user keys and user-set values (#1226).
   - Remove v1 entries using the ADR-0011 rules.
   - Paths are resolved when the hook runs and never baked into the config (#711, #1005).
   - OpenCode: write to `.jsonc` when present, since OpenCode merges `.jsonc` last (#849). Strip comments with a string-aware parser (track quotes/escapes), never a naive regex over the whole file (#808) — the no-regex-as-a-reduction-mechanism rule applies here too.
5. **Never** touch user instruction files or data dirs that were not created by context-mode.
6. Return a table of the changes plus "restart needed". The `/ctx-upgrade` skill then runs `ctx_doctor`.

## Content-store retention

Rows in the content store age out by **time since last access**, not time since creation — matching Q7 (retention = age + live PID + size cap). A row is exempt from aging while a still-open session holds it, mirroring the live-PID rule used elsewhere for a running process (#1140/#1143): a session that is still open keeps its own rows warm no matter how old they are, and a row nobody has touched ages out even if it is recent.

## Windows locale (netstat)

`ctx_doctor`'s and `ctx_upgrade`'s port-owner lookup on Windows reads `netstat -ano` output. The owner lookup must key off the **remote-address column** (a listening socket's remote is always the wildcard `0.0.0.0:0` / `[::]:0`), never the `STATE` column — `STATE` is locale-translated (Windows-FR `À l'écoute`, Windows-DE `ABHÖREN`, Windows-ES `ESCUCHANDO`) and a string match against it silently matches zero rows on a non-English Windows box (fixed once already in v1: `1f70bee0`, "locale-independent Windows netstat parser", #469). GP11's golden tests add a non-English-locale fixture (e.g. the FR/DE fixtures from that commit) so this cannot regress silently in v2.

## Tests (GP11)

Cases:
- a v1 install on each agent
- a broken config
- an empty index
- a user-set hook timeout
- a path that contains a space
- two install trees
- `context.db` starts corrupt and ends healed with zero data loss on the non-corrupt rows (the D8 heal path, matching v1's lossless-heal standard from `50aafdce`)
- Windows netstat in a non-English locale (FR, DE) still finds and frees the stuck port

Golden: the doctor table, the upgrade diff, rollback, and no baked paths.

## r3 decision (2026-10-14, `docs/v2/review/DECISIONS-r3.md`)

- Q16: uninstall is a mode of `ctx_upgrade` (`mode: uninstall`). It requires the tool argument `confirmDelete: true` to remove user data; when that argument is absent, on any host, the default is `false` and user data is preserved. Either way, it always stops the server and removes the cache and context-mode's own config entries.

## Changes

r4 fix pass (A26, A38–A40, A69, B20, B37, B44, B59, B62, I2-0, I2-14): added the double-fire check (D5b), per-host FAIL strings, the shared `resolvePluginRoot`, Pi's `ctx.cwd` project resolution, the D8 corrupt-DB heal exception, the Windows-locale netstat fix, OpenCode `.jsonc` handling, `confirmDelete` for uninstall, the auto-run plugin-cache-path check, content-store retention, and the 9-tool count — replacing stale or missing text with one current design.
