# 02 — Module spec: store

Owner: `store` (per `00-architecture.md` §1/§2). This file is the exact, line-by-line spec for every file that module owns. Build in the order listed below; each file depends only on files above it.

Sources: ADR-0002 (schema, write rules, corruption, cleanup, distribution), DECISIONS-r3 Q6/Q7, DECISIONS-r4 A14/A34/A57/A58/A71/B2/B35, ADR-0009 §0/§1 (journal shape), ADR-0010 D8 (doctor's one write exception), PRD-v2 §4, TECH-SPEC S-NODE, `00-architecture.md` A5.

All constants below are names from `src/core/contracts/constants.ts`. All error text is defined once in `src/core/contracts/errors.ts` and only referenced here by name.

## 0. Constants this module needs (add to `constants.ts`)

| Name | Value | Source |
|---|---|---|
| `NODE_MIN_VERSION` | `"24.15.0"` | ADR-0002 Consequences, S-NODE |
| `DB_TIMEOUT_MS` | `5000` | ADR-0002 decision 2 |
| `PROJECT_KEY_HEX_LEN` | `16` | `00-architecture.md` A5 |
| `SCHEMA_VERSION` | `1` | ADR-0002 decision 2 (migrations run via `PRAGMA user_version`) |
| `INDEX_WRITE_BATCH_BYTES` | `1_000_000` | ADR-0002 decision 2 ("chunks of about 1 MB") |
| `MAX_CHUNK_BYTES` | `4096` | ADR-0002 r3 Q7, v1 per-chunk cap |
| `RETENTION_IDLE_DAYS` | `30` | Assumption A-S1 below |
| `RETENTION_SIZE_CAP_BYTES` | `524_288_000` (500 MB) | Assumption A-S2 below (Q7b) |
| `OUTPUT_CAP` | `16384` | ADR-0008/ADR-0016 Q2 (store only reads this; owned by `sandbox`) |
| `OWNER_PID_STALE_CHECK_MS` | `0` (no wait; liveness is checked at call time, never polled) | ADR-0002 decision 4 |
| `PROJECT_DEAD_IDLE_DAYS` | `14` | DECISIONS-r9 V22 (Q8 #1024): project-level sweep threshold, distinct from the row-level `RETENTION_IDLE_DAYS` (30) |

## 1. `src/core/contracts/errors.ts` additions (store's entries)

Each entry is `{ code, text(args) => string }`. One line, names the fix, no stack.

| Code | Text |
|---|---|
| `ERR_NODE_VERSION` | `` `Node ${NODE_MIN_VERSION} or newer is required, found ${found}.` `` |
| `ERR_DB_VANISHED` | `` `context.db is missing or was renamed by ctx_doctor. Run ctx_doctor to repair ${projectKey}.` `` |
| `ERR_DB_CORRUPT` | `` `context.db failed integrity_check. Run ctx_doctor to repair ${projectKey}.` `` |
| `ERR_SCHEMA_STALE` | `` `context.db schema is version ${found}, expected ${SCHEMA_VERSION}. Run ctx_doctor to migrate ${projectKey}.` `` |
| `ERR_GIT_COMMON_DIR` | `Could not resolve the git common directory for this path. Run context-mode inside a git repository.` |
| `ERR_PATH_ESCAPE` | `` `${path} is outside the project root ${root}.` `` |
| `ERR_CLEANUP_LOCKED` | `Cleanup could not acquire the write lock; a live owner holds it.` (never surfaced to a tool caller — cleanup retries internally, see §7 step 4) |

## 2. `src/core/project/resolve.ts`

```ts
export interface ProjectContext {
  gitCommonDir: string;   // realpath, no trailing slash
  projectKey: string;     // first PROJECT_KEY_HEX_LEN hex chars of sha256(gitCommonDir)
  worktree: string;       // realpath of cwd's worktree root
}
export function resolveProject(cwd: string): ProjectContext;
```

Steps:
1. Run `git rev-parse --path-format=absolute --git-common-dir` with cwd = `cwd`, `shell:false` (via `sandbox/spawn.ts`'s `runProcess`, not a raw `exec`).
2. If the process exits non-zero or stdout is empty → throw `CtxError(ERR_GIT_COMMON_DIR)`.
3. `gitCommonDir = realpath(stdout.trim())`, strip trailing slash.
4. `projectKey = sha256(gitCommonDir).hex().slice(0, PROJECT_KEY_HEX_LEN)`.
5. Run `git rev-parse --path-format=absolute --show-toplevel` with the same cwd for `worktree`; realpath it.
6. Return `{ gitCommonDir, projectKey, worktree }`.

Non-git dir (D-M7-NG-1, owner decision 2026-10-21): one fixed rule, not a fallback path. When no `.git` is found walking up from the project dir to the filesystem root, the project is `realpath(dir)`: `projectKey = sha256(realpath(dir))[0..PROJECT_KEY_HEX_LEN)`, `worktree = containmentRoot = realpath(dir)`, no git process runs. A nested non-git dir is its own project. The home dir and the filesystem root are projects too (no rule in this doc or ADR-0005 forbids it). `NO_GIT_DIR` stays only for a project dir that does not exist. The project source per agent (PRD §5) is unchanged.

Project source per agent (D-FU-PS-1, owner decision 2026-10-21, ADR-0001: one fixed order per agent, no runtime fallback path). `src.cwd` is the payload `cwd` on the hook path (`handleHook` step 3) and `process.cwd()` on the server path.

| Agent | `ProjectSourceKind` | Order (first present, non-empty value wins) | All missing |
|---|---|---|---|
| claude-code | `env:CLAUDE_PROJECT_DIR` | 1. `CLAUDE_PROJECT_DIR` 2. `src.cwd` (payload `cwd`, a common hook input field) 3. `process.cwd()` | never (step 3 always has a dir) |
| codex, copilot-cli, kiro | `arg:--agent+cwd` | `src.cwd` | `NO_PROJECT` |
| vscode | `arg:workspaceFolder` | argv value after `--workspace-folder` | `NO_PROJECT` |
| gemini, qwen, zcode, opencode | `spawn-cwd` | `src.cwd` | `NO_PROJECT` |
| pi | `pi:ctx.cwd` | `src.piCwd` | `NO_PROJECT` |

When `resolveProject` throws in `handleHook` step 3 (`NO_PROJECT`, or `NO_GIT_DIR` for a dir that does not exist), the hook answers allow and writes one stderr line `hooks: no project: <code> <message>`.

E2E: GP7 (scope — identity shared per repo, two worktrees resolve the same `projectKey`). ADR-0017 `covers`: `src/core/project/`.

## 3. `src/core/project/contain.ts`

```ts
export function isInside(root: string, p: string): boolean;
```

Steps:
1. `root = realpath(root)`, `p = realpath(p)` (symlinks resolved; never a string prefix check).
2. Split both on the platform path separator into component arrays.
3. Return true only if every component of `root` equals the component at the same index in `p`, in order, and `p` has no fewer components than `root`.
4. Never use `p.startsWith(root)` — that passes for `/root-evil` against root `/root` (A61, TECH-SPEC).

Error case: none — this is a pure predicate, callers throw `ERR_PATH_ESCAPE` using the inputs when it returns false.

E2E: GP5 (directory-walk symlink-escape case), GP7 (path containment by components). `covers`: `src/core/project/contain.ts`.

## 4. `src/core/project/config-dir.ts`

```ts
export function resolveConfigDir(): string; // ~/.context-mode, expanded, created if absent
```

Steps:
1. Read `HOME` (Unix) or `USERPROFILE` (Windows) from `process.env`; if absent, throw `CtxError` with a one-line fix naming the missing env var.
2. Join with `.context-mode`.
3. `mkdir(dir, { recursive: true })` if it does not exist.
4. Return the realpath.

This is the one function every other module calls for the config dir (TECH-SPEC "Config dir resolution" row) — storage, stats, cache-heal and tests all import this, none read `HOME` directly again.

E2E: GP1 (install), GP11 (doctor). `covers`: `src/core/project/config-dir.ts`.

## 5. `src/core/store/schema.ts`

```ts
export const SCHEMA_VERSION: number; // = SCHEMA_VERSION constant
export function applyMigrations(db: DatabaseSync, fromVersion: number): void;
export const DDL: string; // full CREATE TABLE/INDEX statements, versioned by migration step
```

### 5.1 DDL (version 1, applied by migration step 1)

Naming (DECISIONS-r9 M14): the `sources`/`chunks` tables below are "ContentStore". The `events` table above is "SessionDB" — it is read for other sessions in the same `context.db` by `readSessionEvents` (§11). "Auto-memory" is not a table here: it is the host's own memory files for this project, read through `resolveConfigDir` (§2), Claude Code only today, empty elsewhere. `05-tools-index.md` §6 uses these three names; this file is where their storage lives.

```sql
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000; -- mirrors DB_TIMEOUT_MS, SQLite also needs this pragma, not just the driver option

CREATE TABLE IF NOT EXISTS events (
  seq         INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  TEXT NOT NULL,
  worktree    TEXT NOT NULL,
  agent       TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('prompt','edit','cmd','toolerr','index','cost')),
  tool        TEXT,
  key         TEXT,
  path        TEXT,
  ok          INTEGER,
  exit_code   INTEGER,
  bytes       INTEGER,
  body        TEXT,
  turn        INTEGER NOT NULL,
  ts          INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_session_kind_seq ON events(session_id, kind, seq);
CREATE INDEX IF NOT EXISTS idx_events_session_kind_key_seq ON events(session_id, kind, key, seq);

CREATE TABLE IF NOT EXISTS sources (
  id          TEXT PRIMARY KEY,       -- source id handed back to the caller (ctx_index/ctx_search "more:" line)
  session_id  TEXT NOT NULL,
  worktree    TEXT NOT NULL,
  agent       TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('path','url','text')),
  origin      TEXT NOT NULL,          -- the path/URL/label the caller passed
  bytes_total INTEGER NOT NULL,
  created_ts  INTEGER NOT NULL,
  created_at  TEXT NOT NULL,          -- ISO-8601 UTC mirror of created_ts, DECISIONS-r9 M16: the one per-source timestamp ADR-0009 §8.1 rule 4 reads across sources/events/auto-memory
  accessed_ts INTEGER NOT NULL        -- bumped on every ctx_search hit against this source; drives retention
);
CREATE INDEX IF NOT EXISTS idx_sources_accessed ON sources(accessed_ts);

CREATE VIRTUAL TABLE IF NOT EXISTS chunks USING fts5(
  source_id UNINDEXED,
  session_id UNINDEXED,
  worktree UNINDEXED,
  agent UNINDEXED,
  seq UNINDEXED,      -- order within the source
  body,
  tokenize = 'porter unicode61 remove_diacritics 2'  -- DECISIONS-r9 V24 (Q10 #1295); porter added by D-SEARCH-3 (schema v3, `title` column too); schema v4 adds `chunks_tri` (trigram) and `chunks_vocab` (D-SEARCH-4); see `src/core/store/schema.ts`: folds Cyrillic and accented Latin to base form; CJK has no word breaks under unicode61 and stays open, see Notes below
);

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

Notes:
- Every data row carries `session_id`, `worktree`, `agent` (ADR-0002 decision 1) — `chunks` carries them as `UNINDEXED` FTS5 columns so `fts.ts` can filter before ranking without a join.
- `chunks.body` is capped at `MAX_CHUNK_BYTES` per row by the caller (`index/chunk.ts`, owned by `tools-index`); `schema.ts` does not enforce this, it is a write-time contract documented here because the column exists in this module.
- `meta` holds single-key values, e.g. `pending_compact:<session_id>` (ADR-0009 §6) and `owner_checkpoint_at` bookkeeping; no other module creates tables here.
- `chunks.tokenize` (DECISIONS-r9 V24): GP5 case is CJK text keeps no diacritics to strip and `unicode61` draws no word boundaries inside it, so a CJK query still under- or over-matches; issue #1295 stays open with this limitation noted, nothing here claims to fix it.

### 5.2 `applyMigrations(db, fromVersion)`

Inputs: open `DatabaseSync` handle, the value read from `PRAGMA user_version`.
Output: none (mutates `db`); on return, `PRAGMA user_version` equals `SCHEMA_VERSION`.

Steps:
1. If `fromVersion === SCHEMA_VERSION`, return immediately (no transaction opened).
2. If `fromVersion > SCHEMA_VERSION`, throw `CtxError(ERR_SCHEMA_STALE, { found: fromVersion })` — a newer DB than this server understands is the same stale-schema class, never silently accepted.
3. `db.exec('BEGIN IMMEDIATE')`.
4. For each migration step with `version > fromVersion`, in ascending order, run its SQL (version 1's step is the full `DDL` above; future versions append `ALTER`/`CREATE` steps here, never edit the v1 block).
5. `db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`)`.
6. `db.exec('COMMIT')`. On any thrown error between step 3 and here, `db.exec('ROLLBACK')` then rethrow — never leave `user_version` bumped without the DDL applied.

E2E: GP8 (schema version checked under concurrency — only one of 4 servers runs this body; the others see `fromVersion === SCHEMA_VERSION` on their own open and skip it, because step 3's `BEGIN IMMEDIATE` serializes the first writer's commit before the next writer's `PRAGMA user_version` read). `covers`: `src/core/store/schema.ts`.

## 6. `src/core/store/db.ts`

```ts
export interface DbHandle {
  raw: DatabaseSync;
  projectKey: string;
  path: string;
}
export function openDb(project: ProjectContext): DbHandle;
export function withWrite<T>(db: DbHandle, fn: (raw: DatabaseSync) => T): T;
export function closeDb(db: DbHandle): void;
```

### 6.1 `openDb(project)`

Inputs: `ProjectContext` from `resolve.ts`.
Output: `DbHandle`.

Steps:
1. Check `process.version` against `NODE_MIN_VERSION` (semver compare, no regex — split on `.`, compare numerically). If below, throw `CtxError(ERR_NODE_VERSION, { found: process.version })`.
2. `dir = join(resolveConfigDir(), 'projects', project.projectKey)`; `mkdir(dir, { recursive: true })`.
3. `path = join(dir, 'context.db')`.
4. If `path` does not exist on disk but `path + '-wal'` or `path + '-shm'` does (a prior `ctx_doctor` rename left siblings without the main file, or a half-written rename) → throw `CtxError(ERR_DB_VANISHED, { projectKey })`.
5. `raw = new DatabaseSync(path, { timeout: DB_TIMEOUT_MS })` (node:sqlite).
6. `fromVersion = raw.prepare('PRAGMA user_version').get().user_version`.
7. `applyMigrations(raw, fromVersion)` (schema.ts, §5.2).
8. Return `{ raw, projectKey: project.projectKey, path }`.

Error cases:
- Step 1 → `ERR_NODE_VERSION`.
- Step 4 → `ERR_DB_VANISHED`.
- `node:sqlite` throws `SQLITE_CORRUPT` while opening or on step 6's read → catch, throw `CtxError(ERR_DB_CORRUPT, { projectKey })`. Do not rename here — only `ctx_doctor` renames (ADR-0002 decision 3; step belongs to `tools-ops`, not this file).
- Step 7 throws `ERR_SCHEMA_STALE` → propagate unchanged.

### 6.2 `withWrite(db, fn)`

Inputs: `DbHandle`, a function that receives the raw handle and performs writes.
Output: `fn`'s return value.

Steps:
1. `db.raw.exec('BEGIN IMMEDIATE')` (ADR-0002 decision 2; every write transaction starts this way, no exceptions, no added retry loop on top of `DB_TIMEOUT_MS` — ADR-0002 decision 2, confirmed against B35: the `{timeout: DB_TIMEOUT_MS}` sleep-on-busy is the only defense, by the owner's explicit 8-writer/0-busy-error measurement overriding the v1 `withRetry` precedent).
2. Run `fn(db.raw)`, capture result or thrown error.
3. On success: `db.raw.exec('COMMIT')`, return the result.
4. On thrown error: `db.raw.exec('ROLLBACK')`, rethrow the original error unchanged (never wrap it — the caller's error text is the one that reaches the tool result).

Error case: if `BEGIN IMMEDIATE` itself throws `SQLITE_BUSY` after `DB_TIMEOUT_MS` of sleeping, propagate that error unchanged — no second attempt.

### 6.3 `closeDb(db)`

Steps:
1. `try { db.raw.exec("PRAGMA wal_checkpoint(TRUNCATE)") } catch { /* best-effort, never block shutdown */ }` — every server checkpoints on its own close, no election (r3 Q6 corrected by r4 B2, citing v1 939c5ca8).
2. `db.raw.close()`.
3. Never throws.

E2E: GP8 (4 servers + hooks writing one `context.db`; 0 busy errors reach the tool result; `integrity_check` ok; no retry loop). GP9 (close-on-shutdown path runs this). `covers`: `src/core/store/db.ts`.

## 7. `src/core/store/owners.ts`

```ts
export function writeOwnerPid(configDir: string, projectKey: string, serverId: string): void;
export function removeOwnerPid(configDir: string, projectKey: string, serverId: string): void;
export function listLiveOwners(configDir: string, projectKey: string): string[]; // server ids with a live PID
```

Files live at `<configDir>/projects/<projectKey>/owners/<serverId>.pid`, next to `context.db`, not inside it (ADR-0002 decision 2, per-server liveness tracked separately from the shared data file).

### 7.1 `writeOwnerPid`
1. `mkdir(.../owners, { recursive: true })`.
2. Write the file with `process.pid` as its only content (UTF-8, no trailing newline requirement).
3. Called once at server start, after `openDb` succeeds.

### 7.2 `removeOwnerPid`
1. `rm` the file if it exists; ignore `ENOENT`.
2. Called in the shutdown path, before `closeDb`.

### 7.3 `listLiveOwners`
1. `readdir(.../owners)`, filter `*.pid`.
2. For each, read the PID, check liveness with `process.kill(pid, 0)` wrapped in try/catch (no `ps` spawn — PRD P5, GP9 idle-CPU rule extends to never shelling out for a liveness check).
3. A PID that throws `ESRCH` is dead: delete its `.pid` file as a side effect of this read (self-healing a crashed server's leftover file) and exclude it from the result.
4. Return the server ids (filename stem) whose PID answered live.

E2E: GP8 (the live-PID check for the cleanup race). `covers`: `src/core/store/owners.ts`.

## 8. `src/core/store/cleanup.ts`

```ts
export function cleanupProject(db: DbHandle, configDir: string): { deletedSources: number; deletedProject: boolean };
export function sweepDeadProjects(configDir: string): string[]; // projectKeys deleted
```

### 8.1 `cleanupProject(db, configDir)` — row-level retention inside the open project's own DB

Steps, all inside one `withWrite`:
1. `cutoff = now() - RETENTION_IDLE_DAYS * 86_400_000`.
2. Delete rows from `sources` where `accessed_ts < cutoff` AND the source's `session_id` has no live owner (query `owners/` via `listLiveOwners`; a session tied to a live server is never deleted regardless of age — PRD §4 "a row stays warm while its session is still open").
3. For each deleted `sources.id`, `DELETE FROM chunks WHERE source_id = ?`.
4. Size cap: compute `totalBytes = SUM(bytes_total) FROM sources`. While `totalBytes > RETENTION_SIZE_CAP_BYTES`, delete the single oldest-`accessed_ts` source not tied to a live session (same live-owner exemption as step 2), delete its chunks, subtract its `bytes_total`, repeat.
5. Return counts.

### 8.2 `sweepDeadProjects(configDir)` — whole-project deletion, the #880 race fix

Steps:
1. `readdir(<configDir>/projects)`.
2. For each `projectKey` directory, acquire an exclusive lock scoped to that directory: open (or create) `<dir>/.cleanup.lock` with `O_CREAT | O_EXCL`-then-retry semantics is not used — instead, open `context.db` with `openDb`-equivalent access and run the live-PID check and the delete **inside the same `withWrite` transaction** (ADR-0002 decision 4: "the live-PID check runs inside the same transaction/lock as the delete itself, not as a separate step").
3. Inside that transaction: call `listLiveOwners`. GP8 named case (DECISIONS-r9 V22, Q8 #1024): a live owner PID, whatever the age of `accessed_ts`, is never deleted — `ROLLBACK` (via returning early so `withWrite` commits a no-op) and skip this project. This is the whole rule; there is no separate age check when an owner is live.
4. If `listLiveOwners` is empty: GP8's other named case — a dead PID (no live owner) with the project's most recent `accessed_ts` older than `PROJECT_DEAD_IDLE_DAYS` (14 days) is deleted. A dead PID whose project was touched inside that window is not deleted (skip this project, same as step 3). When both conditions hold (dead PID, past the window): `closeDb`, then delete the whole `<configDir>/projects/<projectKey>` directory (`context.db`, `-wal`, `-shm`, `owners/`) recursively.
5. A project can never be deleted between step 3's check and step 4's delete because no other process can open a write transaction on the same file while this one holds `BEGIN IMMEDIATE` — step 3 and step 4 run in the same critical section, not two.
6. Return the list of deleted `projectKey`s.

Error cases:
- `openDb` throws `ERR_DB_CORRUPT` for a project mid-sweep → skip that project (log, do not delete; a corrupt DB is `ctx_doctor`'s job, never cleanup's).
- Any other project's sweep failure does not abort the loop for the remaining projects.

E2E: GP8 ("the live-PID check for the #1248-class cleanup runs inside the cleanup transaction, never as a separate pre-check with a race window"). `covers`: `src/core/store/cleanup.ts`.

## 9. `src/core/store/fts.ts`

```ts
export function insertChunks(db: DbHandle, sourceId: string, session: SessionIdentity, rows: string[]): void;
export function queryChunks(db: DbHandle, opts: {
  terms: string;
  session_id: string;
  scope: 'session' | 'project';
  limit: number;
}): Array<{ sourceId: string; seq: number; snippet: string; score: number }>;
export function highlight(row: string, terms: string, maxBytes: number): string;
```

### 9.1 `insertChunks`
1. Caller has already split `rows` into ≤ `MAX_CHUNK_BYTES` pieces (owned by `index/chunk.ts`); this function only writes.
2. `withWrite`: for each row, in batches whose cumulative UTF-8 byte size stays under `INDEX_WRITE_BATCH_BYTES`, `INSERT INTO chunks(source_id, session_id, worktree, agent, seq, body) VALUES (...)`, committing each full batch as one `withWrite` call (ADR-0002 decision 2, "index writes go in chunks of about 1 MB" — this is the batch boundary, not a single giant transaction).
3. Also upserts the matching `sources` row's `bytes_total` (sum of row byte lengths) and `accessed_ts = created_ts = now()` on first insert.

### 9.2 `queryChunks`
1. Build the FTS5 `MATCH` query from `terms`: pass the caller's terms through FTS5's own query syntax unescaped for bareword/column matches — no regex pre-processing (owner's no-regex rule).
2. `SELECT source_id, seq, body, bm25(chunks) AS score FROM chunks WHERE chunks MATCH :terms AND session_id = :session_id [AND ... project scope expands to all sessions sharing worktree] ORDER BY score LIMIT :limit`. `bm25()` is ascending-better in SQLite FTS5, so `ORDER BY score` (not `DESC`) gives best-first.
3. For `scope: 'project'`, drop the `session_id` filter and instead filter `worktree = :worktree`, ranking the current session's own rows first via `ORDER BY (session_id = :session_id) DESC, score` (GP7: "session ranks first").
4. For each row, call `highlight(row.body, terms, MAX_CHUNK_BYTES)` to build `snippet`.
5. Return the mapped array.

### 9.3 `highlight(row, terms, maxBytes)`
1. Split the stored text into blocks (fenced code, paragraphs), score each block against the query terms (BM25-style, identifiers count as whole symbol and as parts), take the best block as the window and add whole neighbour blocks while they fit `maxBytes` (800 B for prose; 2048 B when the window holds a fence, `SNIPPET_CODE_MAX_BYTES`). Cuts fall on code-point boundaries (D-SEARCH-7; was clip-first, #963).
2. No entity encoding: the text is returned as stored (D-SEARCH-7; was `< > &` escape, #341). A fence over the code budget returns its best whole lines with the fence lines and `[lines a-b of N]`.
3. Return the slice. No regex-based tag stripping; no escape map.

Error cases: none thrown — a query that matches nothing returns `[]`; the caller (`tools-index`'s `ctx_search`) is responsible for the "zero-hit reply states scope and source count" text.

E2E: GP5 (`highlight()` clips before sanitize, both hold; ranked hits; byte caps), GP7 (session ranks first). `covers`: `src/core/store/fts.ts`.

## 10. `src/core/journal/append.ts`

```ts
export interface AppendEventInput {
  session_id: string; worktree: string; agent: string;
  kind: 'prompt' | 'edit' | 'cmd' | 'toolerr' | 'index' | 'cost';
  tool?: string; key?: string; path?: string;
  ok?: boolean; exit_code?: number; bytes?: number; body?: string;
  turn: number;
}
export function appendEvent(db: DbHandle, input: AppendEventInput): number; // returns seq
```

Steps:
1. `withWrite`: `INSERT INTO events(session_id, worktree, agent, kind, tool, key, path, ok, exit_code, bytes, body, turn, ts) VALUES (...)` with `ts = now()` computed inside the write (not passed in, so two writers never disagree on clock source).
2. `ok` stored as `0`/`1`/`NULL`.
3. Return `db.raw.prepare('SELECT last_insert_rowid() AS seq').get().seq` (read inside the same transaction, before commit).
4. `kind: 'cost'` rows additionally require a `turn` that is idempotent per call — the caller (owned by `tools-session`, not this file) is responsible for de-duplicating repeated step-finish events by `turn`; `appendEvent` itself never deduplicates (ADR-0009 §0: "One write path into the one shared context.db" — single entry point, no dedup logic here since the compaction/stats consumers do their own idempotency per GP10).
5. This is the one journal write path (ADR-0009 §0): the server calls it at handler-return time for its own `ctx_*` calls; hooks call it for other adapters' host tools (`PostToolUse`/`PostToolUseFailure`). Both paths use `resolve.ts`'s `resolveProject` for path resolution — never a second resolver.

Error cases: `withWrite`'s own errors propagate unchanged (no retry, no swallow — PreToolUse-path callers run this detached per the architecture rule "Journal writes from hooks are detached", meaning the hook does not block on the result, not that `appendEvent` itself retries or hides failures).

E2E: GP6 (`events` rows). `covers`: `src/core/journal/append.ts`.

## 11. `src/core/journal/read.ts`

```ts
export function readSessionEvents(db: DbHandle, session_id: string, kind?: AppendEventInput['kind']): EventRow[];
export function readEventBySeq(db: DbHandle, seq: number): EventRow | undefined;
```

### 11.1 `readSessionEvents`
1. `SELECT * FROM events WHERE session_id = :session_id [AND kind = :kind] ORDER BY seq ASC` — read-only, no transaction needed (SQLite readers never block on `BEGIN IMMEDIATE` writers under WAL).
2. An empty `session_id` returns `[]` (ADR-0009 §2: "An empty id means nothing is injected" — this file is where that guard lives for every caller).
3. An unknown `session_id` (no matching rows) also returns `[]`; this function never falls back to "the latest session" for either an empty or an unknown id (DECISIONS-r9 F4, `11-server.md:180`). The stdio transport's own fallback session id, `"mcp:" + serverId`, is passed in here like any other `session_id` — one `StdioServerTransport` per process means that fallback id is never shared between two clients, so it never collides with another session's rows (v1 regression `7e6c243a`, PR #398: a global-latest-session fallback leaked one session's events into another's).

### 11.2 `readEventBySeq`
1. `SELECT * FROM events WHERE seq = :seq` — this is the primary-key read behind `ctx_resume(seq:N)` (ADR-0009 §4: "a primary-key read of the whole row, so a pointer is never a dead end").
2. Returns `undefined` if no row — the caller (`tools-session`'s `ctx_resume`) turns that into its own one-line "no such pointer" text; this file never throws for a missing row.

E2E: GP6 (`ctx_resume(seq: N)` resumes from a given pointer). `covers`: `src/core/journal/read.ts`.

## Implementation order

1. `errors.ts` additions (§1) — needed by everything below.
2. `project/resolve.ts`, `project/contain.ts`, `project/config-dir.ts` (§2–4) — no dependency on store internals.
3. `store/schema.ts` (§5).
4. `store/db.ts` (§6) — depends on schema.ts and config-dir.ts.
5. `store/owners.ts` (§7) — depends on config-dir.ts only.
6. `store/cleanup.ts` (§8) — depends on db.ts and owners.ts.
7. `store/fts.ts` (§9) — depends on db.ts.
8. `journal/append.ts`, `journal/read.ts` (§10–11) — depend on db.ts.

## Assumptions

- A-S1: `RETENTION_IDLE_DAYS = 30`. ADR-0002 Q7/PRD §4 require "age since last access" but name no number; 30 days matches the owner's existing session-TTL lineage cited in DECISIONS-r4 I2-14 (939c5ca8) and is written here so `cleanup.ts` has a concrete cutoff.
- A-S2: `RETENTION_SIZE_CAP_BYTES = 524_288_000` (500 MB), decided, not a placeholder. DECISIONS-r9 S3 (intern question): no owner/user message sets this value; Q7b stays open at DECISIONS-r4 A71 and no later round changes it. The smallest rule consistent with the docs is to keep the one number already named in this file's own constants table (§0) and state it as fixed, so `cleanup.ts` has one real cap and no second number is introduced. If the owner sets a different cap later, change only this line and the §0 row; both cite the same value by name, never by literal, elsewhere in the codebase.
- A-S3: `ctx_doctor`'s lossless `healLossless` (`VACUUM INTO` before rename-and-recreate) described in ADR-0010 D8 and PRD-v2.md:122 is **not** implemented in this module. ADR-0002 §3 and DECISIONS-r4 A57 state the named decision as hard-error + rename-aside only, with no mid-session self-heal; D8's `healLossless` branch belongs to `tools-ops`'s `ctx_doctor` file (`00-architecture.md` owner column), not `store`, and is out of scope for this spec. `store/db.ts` only ever renames-aside-and-fails-over to `ctx_doctor`; it never runs `VACUUM INTO` itself.
- A-S4: `events.turn` and `sources.accessed_ts`/`created_ts` are stored as integer Unix milliseconds (`Date.now()`), matching ADR-0009's "age = current turn − item turn" integer arithmetic; no ADR states the unit explicitly.
- A-S5: `owners/<serverId>.pid` liveness check uses `process.kill(pid, 0)` (signal-0 probe), not a `ps` spawn, to satisfy PRD P5 (idle server/liveness checks must not spawn processes); ADR-0002 names the file but not the liveness mechanism.
- A-S6 (intern M0 Q3): "CJK stays open" means issue #1295 stays open. `chunks` uses `unicode61 remove_diacritics 2` and nothing else; there is no CJK code path. GP5 asserts Cyrillic and accented Latin only, no CJK case.
- A-S7 (intern M0 Q9): the two thresholds are independent. `cleanupProject` (rows, `RETENTION_IDLE_DAYS`) runs on the open project; `sweepDeadProjects` (whole project, dead owner and last access older than `PROJECT_DEAD_IDLE_DAYS`) runs on the others. A dead project goes whole, young rows too. Caller and "last access": DEVIATIONS D-M1-11.
- A-S8: names, signatures, error keys and DDL columns in this file are reconciled with `00-architecture.md` in DEVIATIONS D-M1-1 to D-M1-9; where they differ, those rows win.
- A-S9 (intern M1 Q1-Q3): every path the store canonicalizes uses `realpathSync.native` (D-M1-R1). `withWrite` runs `COMMIT` inside its `try`; any catch (also in `applyMigrations`) runs `ROLLBACK` only while `db.isTransaction` is true, then re-throws the first error (D-M1-T5-1, review-M1 #2-#3).
- A-S10 (intern M1 Q4-Q5; Q5 tokenizer: A-S6): `sources.id` is `INTEGER PRIMARY KEY AUTOINCREMENT` (D-M1-4), never a caller string. From M2, `ftsInsert` takes the row without `id` and returns the new id (D-M2-1).
- A-S11 (intern M1 Q6): the store does not pick an event `kind`. Own `ctx_*` rows: the handler names kind/key/path (D-M2-2). Host-tool rows: impl/09 §4.6 step 2 (clean Read/Grep/WebFetch write no row).
- A-S12 (intern M1 Q7-Q10): every `*_ts`, `created_at`/`accessed_at` INTEGER is UTC epoch ms from `Date.now()`; `sources.created_at` TEXT is its ISO mirror (A-S4). Read-only open of a missing file: one read-write open creates and migrates it first (D-M1-T5-1). Row retention vs dead-project sweep: A-S7, D-M1-11. Orphan `-wal`/`-shm` with no `context.db`: the store throws `DB_GONE` and deletes nothing; only `ctx_doctor` D8 renames the three files aside (impl/07).

## Changes

- DECISIONS-r9: §5.1 names ContentStore/SessionDB/auto-memory (M14); `sources.created_at` added (M16); §8.1 adds the GP8 live-PID named case (V22); §5.1 `chunks.tokenize` set to `unicode61 remove_diacritics 2` with the CJK note (V24); §11.1 `readSessionEvents` never falls back to the latest session (F4); Assumptions A-S2 settles `RETENTION_SIZE_CAP_BYTES` as decided, not a placeholder (intern question).
