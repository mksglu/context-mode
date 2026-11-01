# ADR-0002: One context.db per project; git-only distribution

- Status: Accepted (G21 and G22 approved 2026-10-14)
- Related: README §4, §7, §10 · `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/verify-single-db.md` · `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/spike-distribution-verified.md`

## Context

- v1 keeps separate session and content DBs in each agent's config directory, and its stats code scans all of them (#1248, #1111 in `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/v2-issue-map.md`).
- v1 ships through npm, with runtime installs and heal scripts. About 10 of the open v1 issues were native-binding or ABI failures (first issue scan, 2026-10-12).
- `verify-single-db.md` measured, on Node v26.8.1:
  - **C1:** node:sqlite with `timeout` sleeps on SQLITE_BUSY. A 2.5 s wait cost about 4 ms of CPU.
  - The #985 CPU spin came from a bug in v1's own `withRetry` busy loop (`src/db-base.ts:446`), not from the retry concept itself. v1 kept `withRetry` after fixing #985 (065799f8: "WAL + busy_timeout + withRetry(SQLITE_BUSY) is the right defense for multi-writer SQLite").
  - 8 writers, 4 FTS readers and a 20 MB indexer, all using `BEGIN IMMEDIATE`, gave 0 busy errors in this measurement.

## Decision

1. **One SQLite file per project:** `~/.context-mode/projects/<git-common-dir-hash>/context.db`.
   - Tables: `events`, `sources`, `chunks` (FTS5), `meta`.
   - Every row carries `session_id`, `worktree` and `agent`.
   - Storage keeps multi-writer, one file per project (unlike single-writer-per-file designs some v1-era docs describe); only who runs the WAL checkpoint (Q6, below) changed from v1.
2. **Engine and write rules:**
   - Engine: node:sqlite with `{timeout: 5000}`.
   - Every write transaction starts with `BEGIN IMMEDIATE`.
   - Index writes go in chunks of about 1 MB.
   - No added retry loop on top of `{timeout: 5000}`: `verify-single-db.md`'s 8-writer measurement (0 busy errors) is the owner's basis for not porting v1's extra `withRetry` loop, even though 065799f8 kept one in v1. This is a stated override of that precedent, not an oversight: the measured write pattern here (chunked ~1 MB writes, `BEGIN IMMEDIATE`) did not hit SQLITE_BUSY without it.
   - Schema versioning: on open, read `PRAGMA user_version`; if it is behind the server's expected value, run the pending migration steps once inside a `BEGIN IMMEDIATE` transaction before any other writer proceeds, then bump `user_version`. `ctx_doctor` distinguishes a stale-schema mismatch from a `PRAGMA integrity_check` failure and reports each with a different message.
   - Per-server liveness is tracked separately from the data file, in `owners/<server-id>.pid` next to `context.db`. This file records which server processes are live; it is not part of the shared `context.db` and is not itself multi-writer data.
3. **Corruption:** on `SQLITE_CORRUPT`, the process renames `context.db`, `context.db-wal` and `context.db-shm` aside (timestamp suffix). The DB file is never deleted.
   - Only `ctx_doctor` performs this rename. Any other live writer whose open handle's path has vanished (because `ctx_doctor` renamed it aside) gets a hard error naming `ctx_doctor` as the fix.
   - This trades v1's mid-session self-heal (lossless VACUUM-INTO rebuild, added across 50aafdce/a5c449df/8a1607e9) for hard-error + `ctx_doctor`, per owner rule P1 ("no fallback chains, hard deny"). That is a named decision, not a silent loss of capability.
4. **Cleanup:** a DB file for a project with no live owner PID is eligible for deletion. The live-PID check runs inside the same transaction/lock as the delete itself, not as a separate step, so a server cannot start between the check and the delete and have its file removed out from under it (closes the #880 race class). This path has a contract test asserting the check and the delete are atomic.
5. **Distribution:** CI builds a git `#release` branch. *Amended by ADR-0019 D2 (2026-10-22): the build is also published to npm as `context-mode` with dist-tag `next`, and `context-mode setup` is the CLI. The "no npm publish, no CLI" words no longer hold; "no npm install at runtime" still holds (no dependencies, no install scripts).*
   - GS7 (amended 2026-10-22, D-FU-RM-PI-1; *superseded by the next bullet, which drops `private: true`*): the `#release` tree has no `node_modules`. It may hold ONE `package.json`, with only `name`, `version`, `private: true`, `type: "module"` and a `pi` key (`extensions: ["./pi/index.js"]`, `skills: ["./skills"]`). It has no `dependencies` and no `scripts`, so the `npm install` that Pi runs on a git install does nothing. Pi reads `pi.extensions` from this file to find the extension. `build/build.mjs` fails the build on any other key.
   - GS7 (amended again 2026-10-22, ADR-0019 D1; decided by PO on delegation, owner reviews in the morning): the `#release` tree and the npm tarball carry one `package.json`: `name: "context-mode"`, `version` (2.0.0 first), `type: "module"`, `bin: {"context-mode": "cli.mjs"}` (no `./`), `engines: {"node": ">=24.15.0"}`, `license`, `repository.url`, `files` = the release tree, the `pi` key, and no `private`, no `dependencies`, no `scripts`. `package.json` and `cli.mjs` are listed in `SHA256SUMS`; the tarball file list and hashes equal `SHA256SUMS`. `build/build.mjs` fails the build on any other key.
6. **Migration order (G22):**
   1. version bump
   2. marketplace `ref:"release"`
   3. docs and release note
   4. ~~`npm deprecate`~~ removed (ADR-0019 D2): v2 is published on npm with dist-tag `next`

   Each outward step is approved separately.

## Consequences

- No cross-DB scans: stats read one file.
- Node versions that lack a stable `node:sqlite` with `timeout` are not supported. The minimum is **Node 24.15.0** (spike S-NODE, `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/spikes-r5/S-NODE.md`): the lowest version measured with node:sqlite unflagged, a sleeping busy `timeout`, FTS5 and no warning.

## Alternatives considered

- **Keep two DBs.** Rejected: `verify-single-db.md` found no benefit.
- **better-sqlite3.** Rejected: its native ABI breaks were a recurring v1 failure class, patched by `ensure-deps.mjs`'s self-heal chain across 13+ commits over two years (6a7a6b2e through 28d58774) — one point-fix per host/runtime combination, the exact fallback-chain shape owner rule P1 forbids. node:sqlite removes both the native dependency and that self-heal chain (closed-by-design, r3 Q10).

## r3 decision (2026-10-14, `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/docs/v2/review/DECISIONS-r3.md`)

- Q6: every server attempts a best-effort WAL checkpoint on its own close (v1 939c5ca8: `closeDB()` runs `wal_checkpoint(TRUNCATE)` unconditionally in a try/catch); there is no election between servers over who checkpoints. GP8 covers the 4-writer case under this rule, and GP8/GP9 must run on real, non-skipped Windows CI — the parent-death lifecycle guard in v1 was Linux/Bun-only (#982, #1100, #1101).
- Q7: retention = age + live owner PID + a size cap. The size cap number is still open (Q7b): no v1 commit introduces a total-index size cap, only a per-chunk `MAX_CHUNK_BYTES=4096` limit, so that number cannot be reused as a total-index cap without the owner setting it explicitly.
- Q10: minimum Node 24.15.0 (S-NODE, 2026-10-15).

## Changes

- r4: corrected Q6 (no election, cites 939c5ca8), corrected the multi-writer summary (A14), added corruption/cleanup/schema-versioning subsections (A7, A34, A57, A58), kept the write-side with no added retry loop as a stated override of 065799f8 (B35), and reopened the retention size cap as Q7b after finding its #962 citation unrelated (A71).
