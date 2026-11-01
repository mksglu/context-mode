# ADR-0019: One interactive `context-mode setup`, npm as the user channel

- Status: Accepted (PO on delegation 2026-10-22; O1 owner step open). Spike results are in "Results" (2026-10-22): 3 PASS, 3 FAIL; the follow-ups in "Results" stay open as tests.
- Owner request, 2026-10-22: install steps are too complex; setup must be interactive (in the style of the Vercel `skills` CLI), live inside doctor, verify and validate every step, leave nothing to the user, and report every failure as an issue.
- Supersedes: ADR-0011 step d (npm deprecate) and the "no `package.json` on `release`" rule (the `release` branch now carries the publishable `package.json`, S-NPM); ADR-0002 GS7 (out-tree `package.json` shape); the per-agent install docs as the main install path.
- Amends: ADR-0010 (doctor gets a CLI form that can fix), ADR-0013 (release also publishes to npm), ADR-0014 (setup failures use the same debug report).
- Keeps: ADR-0004 / D11 (no writes to instruction files), ADR-0003 (E2E-style tests only), ADR-0001 (one fixed path per agent, no runtime fallback).

## Context

Measured on 2026-10-21 and 2026-10-22 (workflows `wf_f35f080b-b7b`, `wf_42b57ac4-f63`):

- 10 install docs, each with its own method. 5 of them need a one-line `node -e` that writes a config file, because the files live at `~/.context-mode-app` and every agent must be told that path.
- The copy-paste verifiers passed 8 of 10 after three fix rounds; pi and kiro needed release-build changes.
- Windows needs a second form of every block.
- The root cause is not git or npm. It is that the user must know a path, and must know which of 10 methods is theirs.

The two reasons npm was dropped no longer hold:

| Reason (2026-10) | v2 today |
|---|---|
| Publishing by hand is tiring | `release.yml` already builds and stages; one more job publishes |
| v1 install failures: `better-sqlite3`, native builds, ABI (#514, #543, #889) | v2 has no runtime dependencies (`node:sqlite`), 24 files, nothing to compile |

## Decision

### 1. Channel

- **npm is the user channel.** Package `context-mode`, `bin: {"context-mode": "cli.mjs"}` (no `./`: npm 11.19.0 removes `"./cli.mjs"` at publish, S-NPM), `type`, `license`, `repository.url` equal to `github.com/mksglu/context-mode` (provenance needs it), no `private`, no `dependencies`, no install scripts.
- **The git `release` branch stays, for the Claude Code marketplace only.** Gemini and Qwen link the npm package dir instead (S-EXT). Users never type the branch name: `setup` runs those commands.
- Both come from one build in one `release.yml` run. The build writes `package.json` and `cli.mjs` before `SHA256SUMS`, so one hash list covers the tarball. Gate `check-npm-tarball.mjs`: `npm pack`, compare file list and hashes to `SHA256SUMS`, and fail if `npm pkg fix` would change the manifest (S-NPM).
- Publish job `publish-npm` in `release.yml` (proposal in S-NPM): cloud runner, `environment: npm-publish`, `id-token: write`, trusted publishing with `--provenance`, no npm token. It checks npm >= 11.5.1, runs after `publish-promote` (git tag first), and skips if `npm view context-mode@<version>` exists, so a rerun is safe.
- v2 is published with dist-tag `next`. CI never sets `latest`; the owner moves it by hand (one approval). Until then, v1 configs that run `npx -y context-mode mcp` keep getting v1.
- v2 accepts `mcp` as an alias of `server`, so a v1 config still starts a working server after `latest` moves; `doctor` then flags it and offers `setup`.
- `npm i -g context-mode@2` takes over the v1 `context-mode` bin, so every v1 hook command `context-mode hook <platform> <event>` then runs the v2 CLI (S-V1). How v2 handles that: Owner decision O3.

### 2. One command

```
npm i -g context-mode && context-mode setup
```

`setup`, `doctor` and `upgrade` share **one check registry** built from the adapter table (`installMode`, config paths, list commands, golden hook payloads). No second source of truth.

| Command | Form | Writes? |
|---|---|---|
| `context-mode setup` | CLI, interactive | yes, after consent |
| `context-mode doctor` | CLI, interactive | read-only; on FAIL it offers "fix now", which runs `setup` for that agent |
| `ctx_doctor` (`/ctx-doctor`) | MCP tool | read-only; prints the exact `context-mode` command to run (an MCP tool cannot prompt) |
| `context-mode upgrade` | CLI | `npm i -g context-mode@<tag>`, then `setup --repair` (no extension step for Gemini and Qwen: the link points at the updated files, S-EXT) |

### 3. Setup flow (every agent, every run)

1. **Preflight:** Node version (`node:sqlite` present), npm global prefix writable, the package's own files match `SHA256SUMS`. Setup finds its own dir with `fileURLToPath(import.meta.url)` then `realpathSync`; never `process.argv[1]` (a symlink), `npm root -g` or a PATH lookup. No `lib/` assumption: Unix `<prefix>/lib/node_modules/<pkg>`, Windows `<prefix>\node_modules\<pkg>` (S-PATH). Fail stops here with the fix.
2. **Detect:** for each adapter row, binary on PATH, its version, config dir present, existing context-mode entries (v1 or v2). The normative v1 detect list is the table in [S-V1](../spikes/setup/S-V1.md) (9 agents with v1 entries; zcode has none); each row is a test fixture. v1 files may already be changed by v1 `upgrade` (#187, #628, #738); detect must accept those shapes. Agents not in the table are listed as "not supported" (section 6).
3. **Choose:** multi-select of detected agents, pre-selected; unsupported and missing agents shown greyed with the reason.
4. **Plan:** per agent, the exact change: the agent's own command (`claude plugin install`, `codex mcp add`, `gemini extensions link <abs pkg dir> --consent`, `qwen extensions link <abs pkg dir>` with `y` on stdin because Qwen has no consent flag, `pi install npm:context-mode`, ...) or the exact config keys to add. Shown as a diff. Server and hook commands are `process.execPath` plus the absolute file (`/abs/node /abs/.../server.mjs`), never the bin name, never `npx`, never a PATH lookup. Data: `npx` hook p95 is about 235 ms against 48 ms for the absolute form; the bin shim adds 1 to 5 ms and a PATH lookup (S-HOOK); on Windows, `shell:false` spawn of the bin fails with ENOENT or EINVAL (S-PATH). Claude Code: replace v1 through the `claude plugin` CLI and re-add the marketplace at `release`; never write `installed_plugins.json` (S-V1).
5. **Consent:** one confirm for the plan. `--dry-run` stops after the plan.
6. **Apply, per agent:** take a lock (`~/.context-mode/setup.lock`); back up each file to `~/.context-mode/backups/<run-id>/`; refuse a file that does not parse (report, never "fix" it); write atomically (temp file + rename); touch only keys context-mode owns; prefer the agent's own CLI over writing its files.
7. **Verify, per agent** (all must pass, else roll back that agent from its backup and report):
   - the written entry parses and equals the plan;
   - the agent's own list command shows context-mode, where it has one; for Gemini and Qwen the listed version equals the package version and the link target exists (S-EXT);
   - the exact server command from the config answers MCP `initialize` + `tools/list` with the expected tools;
   - the exact hook command from the config, fed that agent's golden payload, returns the expected shape inside the hook budget (budget rule: Owner decision O2; the check prints the bare `node -e ""` time next to the hook time, S-HOOK);
   - the `doctor` checks for that agent pass.
8. **Summary:** table of agents, PASS / FAIL / SKIPPED with reason, what was written, backup path, and the next step (`/ctx-doctor` inside the agent).

Rules: running `setup` twice changes nothing the second time. `setup --remove` restores every touched file byte for byte from the backup. A crash mid-run leaves either the old file or the new one, never a partial one; the next run sees the lock, finishes or rolls back.

Non-interactive (no TTY, or `--yes`): same steps, no prompts, `--agents a,b`, `--json` result. CI and scripts use this.

### 4. Interface

- In the style of the Vercel `skills` CLI: arrow-key multi-select, spinners per step, a live checklist, colours that degrade to plain text (`NO_COLOR`, no TTY), every prompt answerable by flag.
- No runtime dependency. Prompt UI is `@clack/prompts` (MIT, 1.8.1 tested), a `devDependency` bundled at build time (24171 bytes minified, S-UI). Changed from "S-UI decides": clack gives the `skills` look in 10 lines with tested cancel, resize and redraw; an own `node:readline` module is 13x smaller but we would own those bugs.
- The TTY check (`stdin.isTTY && stdout.isTTY`) and the `--yes` / `--agents` / `--json` path run before any clack call: clack without a TTY exits 13. `isCancel` maps to exit 130.
- Build gates: prompt layer at most 40 KB minified; licence check in CI.

### 5. Failure reporting

- Every FAIL builds the ADR-0014 debug report: versions, OS, agent versions, the failing check, its exact error, the plan, redacted (home dir as `~`, no tokens, no env values, no file contents beyond context-mode's own keys).
- Setup shows the report and asks once: open an issue? With `gh` logged in it runs `gh issue create` with the setup issue form; else it opens the prefilled issue URL (long reports: saved to a file and the path is shown).
- **Nothing is sent without a keypress.** Silent auto-filing would send a user's machine details to a public repo without consent, and would flood the tracker with duplicates. Non-interactive runs write the report and print the command.
- Reports carry a stable fingerprint (check id + error class) so duplicates link to one issue.

### 6. "Does my agent work?"

- `context-mode setup` lists every detected agent with one of: **full** (MCP + hooks), **MCP only**, **not supported**, each with the reason.
- `context-mode setup --list` prints the same table for all supported agents without touching anything.
- A detected MCP-capable agent that is not in the adapter table is shown as "not supported yet" with an offer to open a support request (same consent rule).
- A v1 entry for an agent not in the v2 table (v1 wrote entries for cursor, jetbrains-copilot, antigravity, antigravity-cli, kimi, omp, openclaw, zed, kilo; S-V1) is shown as "v1 entry, agent not supported in v2"; setup offers removal only, with a diff and consent.
- README carries the same table, generated from the adapter table at build time.

### 7. Instruction files

`setup`, `doctor` and `upgrade` **never create or edit** instruction files: `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `QWEN.md`, `.github/copilot-instructions.md`, `.cursorrules`, steering files or any other prompt file. Routing lives in MCP server instructions and tool descriptions only (ADR-0004, D11).

Why: these files belong to the user and their team; some agents and some companies treat edits there as a policy breach; v1 issues came from such edits.

Guard: each adapter row lists the only files setup may write. A test fails if setup writes any other path. v1 wrote routing blocks into 7 files (`CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `QWEN.md`, `KIRO.md`, `.github/copilot-instructions.md`, `SYSTEM.md`; S-V1). `setup` only detects them. `doctor` reports a v1 routing block left in an instruction file and offers to remove only that block, with a diff and consent.

### 8. CLI conventions (owner, 2026-10-22: "cli best practice olmali")

`setup`, `doctor` and `upgrade` follow the Command Line Interface Guidelines (clig.dev) and POSIX/GNU flag conventions:

| Rule | Detail |
|---|---|
| Help | `-h`/`--help` on every command, with 2-3 real examples; `--version` prints the version only |
| Exit codes | 0 success, 1 a check or step failed, 2 usage error, 130 Ctrl-C; documented in `--help` |
| Streams | results to stdout, progress and logs to stderr; `--json` writes only JSON to stdout |
| Prompts | only when stdin and stdout are a TTY; every prompt has a flag; `--yes` and `--no-input` never prompt; no TTY never hangs |
| Colour | off with `NO_COLOR`, `--no-color`, `TERM=dumb` or no TTY |
| Safety | every write shows a plan first; `--dry-run` on every command that writes; destructive steps need consent or `--yes` |
| Ctrl-C | stops at once, rolls back the agent in progress, exits 130 |
| Errors | three short lines: what failed, why, the exact command that fixes it; `--debug` adds the full report |
| Typos | unknown command or flag suggests the closest match |
| Noise | `--quiet` and `--verbose`; default output fits one screen per agent |
| Speed | `--help` and `--version` start in under 100 ms; no network call at start |
| Files | writes only the paths in the adapter allowlist and `~/.context-mode/` |

Tests: golden `--help` output per command; exit code per failure class; no-TTY run never blocks; `NO_COLOR` output has no escape codes; Ctrl-C in a pty mid-write leaves files byte-identical or fully applied.

## Consequences

- Install is two commands for every agent, the same on macOS, Linux and Windows.
- 10 install docs become one page plus per-agent troubleshooting.
- `check-install-docs.mjs` changes: it allows `npm i -g context-mode` and `context-mode setup`, still bans user paths.
- npm download counts return as a metric; GitHub traffic (G23) stays as a second source.
- The release job publishes by npm trusted publishing (OIDC, provenance, no long-lived token), behind the `npm-publish` environment with the owner as required reviewer (S-NPM).
- The stored absolute path holds the node version dir under nvm, fnm, Volta and the CI toolcache, so it can go stale after a node switch. `doctor` checks that the stored path exists; `setup` and `upgrade` rewrite it (S-PATH).
- More code than a doc page. It replaces the `node -e` writers in the docs, and it reuses the adapter table and `ctx_upgrade` logic.

## Results (spikes, 2026-10-22)

Synthesis: [S-SYN](../spikes/setup/S-SYN.md). Each spike ran in its own temp HOME and prefix; nothing was published.

| Id | Result | Evidence | Pass/fail |
|---|---|---|---|
| S-NPM | Local `npm publish --dry-run --provenance --tag next` with the section 1 shape: 25 files, 911399 B packed. Tarball did not equal `SHA256SUMS` as built (`package.json` private, no `cli.mjs`); the other 22 files matched. `"./cli.mjs"` bin removed by npm 11.19.0. OIDC and provenance run only in a real Actions publish. | [S-NPM](../spikes/setup/S-NPM.md), commit a111aac0 | FAIL (pass not testable by dry-run; pass column changed to "first real `next` publish by the owner flow, provenance visible") |
| S-PATH | 6 of 6 CI layouts (ubuntu, macOS, Windows x Node 24.15.0, 26) gave the real absolute path via `import.meta.url` + `realpathSync`; `argv[1]` did not. nvm, fnm, Volta not run; Homebrew and the CI toolcache stood in. | [S-PATH](../spikes/setup/S-PATH.md), commit 68cca1e, run 39777443062 | PASS (follow-up: nvm, fnm, Volta) |
| S-HOOK | p95 absolute form: Post 47.8 ms, Pre 41.1 ms; bin shim +1 to 5 ms; `npx` about 235 ms warm. Bare `node -e ""` p95 is 31.7 ms on the same host. One host, Node 26.8.1, noisy. | [S-HOOK](../spikes/setup/S-HOOK.md), commit 284b1f82 | FAIL (40 ms rule; O2) |
| S-EXT | Gemini 0.65.0 and Qwen 0.26.0 list the linked extension, enabled, and the server answers `tools/list` (10 tools) before and after `npm i -g` of 2.0.1, with no re-link. Hook run by hand, not by a live session. Gemini allowed a curl payload that Qwen denied (cause open). | [S-EXT](../spikes/setup/S-EXT.md), commit 26cb995c | PASS (follow-up: golden Gemini payload, curl gap, live-session E2E) |
| S-UI | macOS pty: clack and readline both gave `["claude","gemini"]`; `NO_COLOR` gave 0 colour codes; clack exits 13 without a TTY. Linux and Windows pty not run. | [S-UI](../spikes/setup/S-UI.md), commit 64391d8e | PASS on macOS only (follow-up: Linux, Windows via ConPTY) |
| S-V1 | v1 detect list for 10 of 10 table rows (9 with v1 entries, zcode none), plus 9 unsupported agents and 7 instruction files. No test per row yet; per-row issue links, the kiro default-agent path and the pi `settings.json` path are not verified. | [S-V1](../spikes/setup/S-V1.md), commit 25329b29 | FAIL (tests missing; O3) |

Follow-ups before Accepted (no owner action needed): S-V1 one fixture HOME per row (v1 shape in, v2 shape out, second run no change); S-UI Linux and Windows pty; S-PATH nvm, fnm, Volta; S-EXT golden Gemini hook payload and the curl gap; S-HOOK re-run on a quiet host and on each supported Node major. Gemini `hooks.json` has no `matcher`, so its hook runs on every tool call; S-HOOK re-run counts that cost.

## Tests (ADR-0003 style)

- Per agent, clean HOME: `npm i -g <local tarball> && context-mode setup --yes --agents <id>` passes every verify step.
- Per S-V1 row, fixture HOME with the v1 shape: setup writes the v2 shape; a second run changes nothing.
- Release: the tarball gate (section 1) runs on every release build.
- Pty-driven run of the interactive flow, golden screen states.
- Fault injection, each must leave files byte-identical or fully applied: unwritable config, config that does not parse, agent binary missing, server that fails `tools/list`, kill during write, two setups at once.
- Second run: no changes. `--remove`: byte-identical restore.
- Guard: no write outside the per-agent allowlist; no instruction file touched.
- Windows CI job for the agents that run there.

## Owner decisions

On 2026-10-22 the owner delegated the npm decisions to the assistant acting as product owner (PO). Each row below is decided by PO on delegation, owner reviews in the morning. O1 is the only step that stays with the owner, because only the package owner can do it on npmjs.com.

| Id | Decision (decided by PO on delegation, owner reviews in the morning) |
|---|---|
| D1 Package | Name `context-mode`, version `2.0.0`, `bin: {"context-mode": "cli.mjs"}` (no `./`: npm 11 strips it), `type: "module"`, `engines: {"node": ">=24.15.0"}`, no `dependencies`, no install scripts, `files` = the release tree. `package.json` and `cli.mjs` are listed in `SHA256SUMS`. The npm tarball file list and hashes must equal the release `SHA256SUMS`. |
| D2 Channel | npm is the user channel. The git `release` branch stays only for git-based installers. Publish with dist-tag `next` and `--provenance` through npm trusted publishing (OIDC) from `release.yml`, environment `npm-publish`. `latest` stays on v1 until the owner moves it by hand. |
| D3 Hook budget (was O2) | Rule: hook overhead = hook wall time minus bare `node -e ''` wall time, on the same host and in the same run; overhead p95 <= 15 ms. Wall p95 is reported, not gated. `HOOK_P95_MS` stays as the reported wall target. |
| D4 v1 compatibility (was O3) | The v2 CLI accepts the v1 forms `context-mode hook <platform> <event>` and `context-mode mcp` (alias of `server`) and maps them to v2. `doctor` reports them as "v1 form, run context-mode setup". `setup` rewrites them to the absolute form `node "<abs>/hook.mjs" --agent <id>`. |
| D5 Prompt UI | `@clack/prompts` bundled at build time (devDependency only). TTY check first; no TTY = flag path. |
| D6 Issue reports | On FAIL show the redacted report and ask once. `gh issue create` if `gh` is logged in, else print a prefilled URL. Never send without a keypress. |
| D7 CLI | Follows section 8 (clig.dev): `--help` with examples, exit codes 0/1/2/130, results on stdout, progress on stderr, `--json`, `--yes`, `--no-input`, `--dry-run`, `NO_COLOR`, Ctrl-C rollback. |

| Id | Owner step | Detail |
|---|---|---|
| O1 | npm trusted publisher for `context-mode` (S-NPM) | Open. On npmjs.com: Trusted Publisher = `mksglu/context-mode`, workflow `release.yml`, environment `npm-publish`; publishing access "require 2FA, disallow tokens"; revoke old tokens. On GitHub: environment `npm-publish` with the owner as required reviewer. First publish is `2.0.0` with tag `next`; then check `npm view context-mode@2.0.0 dist.attestations`. That publish closes S-NPM. |

Closed: O2 by D3, O3 by D4.

Consequences of D3 for S-HOOK: the measured overhead (47.8 ms minus 31.7 ms = 16.1 ms on one noisy host, Post hook) is above 15 ms. The re-run on a quiet host and on each supported Node major decides; the cut of `hook.mjs` work (155 KB bundle, git lookup) continues in parallel. Doctor D5 and the setup verify step judge the overhead, not the wall time.
