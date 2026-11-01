# ADR-0017: An E2E test at every step, on Sonnet low; v1 users must not leave at the v2 release

- Status: Accepted (2026-10-14). Owner: "Her adımda E2E test istiyorum … Sonnet low ile en az maliyetle … v1 kullanıcıları vazgeçmemeli v2 release olduğunda."
- Related: ADR-0003 (test layers), ADR-0011 (release and v1 transition), ADR-0012 (keyless harness), ADR-0017 extends ADR-0012.

## 1. E2E at every step

**Rule:** no implementation step (one PR-sized change on `v2`, one milestone task, one ADR applied to code) is done until it has an E2E test that runs green. A step adds or changes at least one case.

| Layer | Runs | Model | Cost |
|---|---|---|---|
| E2E-style (GP1–GP11, fake host, built bundle over stdio) | every commit on `v2`, 3 OS, in CI | none | free |
| E2E-live, step scope | after each step, on the owner's Mac, by hand or by the `/release` skill | **`claude-sonnet-5`, `--effort low`** | the minimum: only the cases the step touched |
| E2E-live, full | before a release (`/release`) | `claude-sonnet-5`, `--effort low`; Opus and Haiku only for the ADR-0005/0006 routing probe | the whole case set once |

Cost rules for the live harness (ADR-0012):
- Default command flags: `--model claude-sonnet-5 --effort low --max-budget-usd 0.25 --no-session-persistence`.
- A step runs only the cases tagged with the files it changed (`e2e/live/cases/*.json` carry a `covers: [paths]` list). The harness computes the set from `git diff --name-only <base>`.
- One session per case; one prompt per case where possible; `/compact` only in compaction cases.
- The report prints the plan's rate-limit window and the list-price estimate per case, so cost drift is visible.
- No API key, no CI live run (ADR-0012).

## 2. v1 users must not leave

Goal: on release day a v1 user keeps a working setup at every moment, gets a clear one-command path, and sees value at once. Each item below is a release gate (TECH-SPEC GS10, new).

| # | Requirement | How |
|---|---|---|
| R1 | Nothing breaks before the user acts | `main` stays frozen (branch protection, Q14); v1 `/ctx-upgrade` stays a no-op; npm v1 keeps working |
| R2 | The user learns about v2 inside the agent, not only on GitHub | the last v1 build (one owner-approved v1 patch, the only change to `main`'s code) adds one line to `ctx_doctor` / `ctx_stats` output: "context-mode v2 is available: <link to Upgrading from v1>". No other v1 change |
| R3 | One command per agent, and the order keeps hooks working | install v2 first, run `/ctx-upgrade` (removes v1 entries, ADR-0011 table), and only then `npm uninstall -g` (fixes the gap where v1 Codex/Copilot/VS Code hooks call the global bin) |
| R4 | Nothing the user configured is lost | user hook timeouts, user hooks, `permissions.deny`, MCP entries they added: kept and reported, never removed (ADR-0010) |
| R5 | No v1 feature disappears without a replacement or a note | the README "Upgrading from v1" section has a table v1 feature → v2 (statusline, ctx_insight, ctx_purge scopes, the CLI). Each removed feature names why and what replaces it |
| R6 | Data: no migration, but no surprise | `ctx_doctor` shows where the v1 data is and its size; nothing is deleted without a prompt (ADR-0011) |
| R7 | Rollback works | the README gives the exact command to go back to v1 per agent; GP-live rehearses it once per release |
| R8 | The switch is rehearsed | the migration E2E (`v1-migration` case set): a temp HOME with a real v1 install per agent → v2 install → `/ctx-upgrade` → doctor clean → a routing case passes. Runs in the full live set before every release. Named case: install v2 → `/ctx-upgrade` → `npm uninstall -g` → Copilot CLI and VS Code hooks keep working (closes the R3 gap where they call the global bin) |

## Consequences

- The harness grows a `covers` tag per case and a step mode.
- One v1 patch release is needed for R2. It changes only the doctor/stats text; it needs the owner's approval like any outward step.

## Changes

r4 fix pass: added the named R8 case for the install → upgrade → uninstall → hooks-still-work sequence.
