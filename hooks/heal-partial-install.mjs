/**
 * heal-partial-install.mjs - self-heal a partial plugin cache install.
 *
 * Failure mode this addresses:
 *
 *   The per-version plugin cache dir at
 *   ~/.claude/plugins/cache/<owner>/<plugin>/<version>/ holds only a
 *   subset of the published files. start.mjs, cli.bundle.mjs,
 *   server.bundle.mjs, package.json and several other entries from
 *   `package.json files[]` may be absent, while hooks/ and
 *   .claude-plugin/ tend to survive. The cache's
 *   .claude-plugin/plugin.json can also be a verbatim carry-forward
 *   from a prior version's install, with mcpServers.args[0] holding
 *   an absolute path under a since-deleted cache dir; MCP launch
 *   ENOENTs as a result.
 *
 *   Existing defenses don't repair this:
 *
 *     - scripts/plugin-cache-integrity.mjs (#550) exits 2 from
 *       start.mjs, but start.mjs is one of the missing files.
 *     - The #604 stale-cache-version ratchet in
 *       hooks/normalize-hooks.mjs runs from start.mjs's
 *       normalize-hooks call, same boot-time dependency.
 *     - /ctx-upgrade needs the cli.bundle.mjs the partial install lost.
 *
 *   So the cache cannot self-recover, and the only available
 *   workaround from the user side is `rm -rf <version-dir>` plus a
 *   session restart.
 *
 * What this module does:
 *
 *   Detect partial install via a cheap existsSync probe of a few
 *   launch-critical files. On a trip, re-copy the missing entries
 *   from the marketplace clone at
 *   ~/.claude/plugins/marketplaces/<owner>/ (Claude Code's canonical
 *   source for the per-version cache dir) and rewrite any
 *   carry-forward stale args[0] in plugin.json to the current
 *   pluginRoot. Both halves are mechanism-agnostic.
 *
 * Placement:
 *
 *   Lives in hooks/ rather than scripts/ because the failure mode can
 *   strip scripts/ from the cache dir. hooks/ has been intact in every
 *   observed instance, so it's the most reliable available host.
 *
 * Scope:
 *
 *   CC-only. The failure mode is specific to Claude Code's
 *   per-version cache layout at
 *   ~/.claude/plugins/cache/<owner>/<plugin>/<version>/. Other
 *   clients (Codex, Cursor, OpenCode, Kiro, ...) ship their own
 *   SessionStart wrappers under hooks/<client>/, none of which call
 *   this module. The two call sites that exist
 *   (hooks/sessionstart.mjs and start.mjs) are themselves CC-only
 *   entry points: sessionstart.mjs is wired only from
 *   hooks/hooks.json (CC's hook config), and start.mjs is invoked
 *   only by CC's .claude-plugin/plugin.json mcpServers entry. The
 *   module also enforces this at runtime: pluginRoot must match the
 *   CC cache layout (deriveMarketplaceClonePath returns null
 *   otherwise) or the function short-circuits with
 *   `skipped: "not-claude-code"`, before any further work runs.
 *
 * Contract:
 *
 *   - Pure JS, Node built-ins only.
 *   - Never throws. Returns a structured result; callers log it.
 *   - Idempotent: the cheap probe makes the healthy case a few
 *     existsSync calls, not a full files[] expansion.
 *   - Path-traversal guarded at six layers, symmetric on both ends:
 *       1. pluginRoot must match the CC cache layout, the derived
 *          marketplace path must exist and not equal pluginRoot.
 *       2. files[] entries that resolve outside rootDir are dropped.
 *       3. Directory walks use lstatSync and skip symlinks, so a
 *          symlink-to-outside in the marketplace tree can't be
 *          harvested as a regular file during manifest expansion.
 *       4. After mkdirSync(dirname(to)), realpathSync(dirname(to)) is
 *          re-checked against realpathSync(pluginRoot), catching the
 *          case where a parent component of `to` is already a
 *          symlink-to-outside that mkdirSync followed.
 *       5. Just before the destination write, the source is checked
 *          two ways: lstat(from).isSymbolicLink() drops leaf symlinks
 *          (fast path), and realpathSync(from) is required to fall
 *          under realpathSync(marketplaceClonePath). The realpath
 *          check collapses ancestor symlinks (e.g. a marketplace
 *          `scripts/` dir that's been swapped for a symlink to
 *          outside), which the leaf-lstat would miss because the
 *          leaf itself is a regular file at the symlink's resolved
 *          target.
 *       6. Just before the destination write, lstat(to) and unlink
 *          any pre-existing symlink at `to`. The write itself uses
 *          writeFileSync with `flag: "wx"` (O_CREAT | O_EXCL), which
 *          per POSIX open(2) refuses to follow a symlink at the
 *          final component. That closes the residual race window
 *          where a same-user attacker re-plants a symlink at `to`
 *          between our unlink and the open.
 *   - Source-file reads that drive rewrites are symlink-checked too.
 *     rewritePluginJsonArgs opens `.claude-plugin/plugin.json` with
 *     O_NOFOLLOW, so the open(2) call itself fails with ELOOP when
 *     the path is a symlink. Reading from the returned fd then binds
 *     subsequent reads to the inode, closing the TOCTOU window that
 *     a lstat+readFileSync(path) pair would have left open. Without
 *     this, a same-user-planted redirect would feed attacker JSON to
 *     the read, and the subsequent atomic rename would replace the
 *     symlink with a regular file containing attacker-controlled
 *     mcpServers config.
 *   - plugin.json rewrites are atomic AND symlink-safe:
 *     writeFileSync targets a tmp sibling with a 64-bit random
 *     suffix (unguessable) under O_CREAT | O_EXCL (refuses to follow
 *     a pre-planted symlink at the tmp path), then renameSync over
 *     the real path. A racing writer can't observe a torn JSON file,
 *     and a local attacker can't redirect the write via symlink.
 */

import {
  existsSync,
  readFileSync,
  readdirSync,
  lstatSync,
  mkdirSync,
  renameSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
  appendFileSync,
  openSync,
  closeSync,
  constants as fsConstants,
} from "node:fs";
import { join, dirname, resolve, sep } from "node:path";
import { homedir } from "node:os";
import { randomBytes } from "node:crypto";

/**
 * Cheap-probe partial-install detection. Runs on every session start, so
 * the healthy case must be O(few existsSync), not O(files[].length).
 *
 * A file is "launch-critical" when its absence keeps either start.mjs
 * from booting or /ctx-upgrade from running. We don't probe every file
 * in files[]; that's what the full heal does once this probe trips.
 */
export function isPartialInstall(pluginRoot) {
  if (!pluginRoot) return false;
  if (!existsSync(join(pluginRoot, "start.mjs"))) return true;
  if (!existsSync(join(pluginRoot, "package.json"))) return true;
  if (
    !existsSync(join(pluginRoot, "cli.bundle.mjs")) &&
    !existsSync(join(pluginRoot, "build", "cli.js"))
  ) {
    return true;
  }
  if (
    !existsSync(join(pluginRoot, "server.bundle.mjs")) &&
    !existsSync(join(pluginRoot, "build", "server.js"))
  ) {
    return true;
  }
  return false;
}

/**
 * Derive the marketplace clone path for a CC plugin cache pluginRoot.
 *
 * Layout (forward slashes on POSIX, backslashes on Windows):
 *   <configDir>/plugins/cache/<owner>/<plugin>/<version>/
 *   <configDir>/plugins/marketplaces/<owner>/
 *
 * Returns null when pluginRoot doesn't match the cache layout (npm-global
 * install, dev checkout, opencode cache, ...). Those don't have a
 * marketplace clone to heal from, and we'd rather skip than guess.
 */
export function deriveMarketplaceClonePath(pluginRoot) {
  if (!pluginRoot) return null;
  const fwd = String(pluginRoot).replace(/\\/g, "/");
  const trailing = fwd.endsWith("/") ? fwd : fwd + "/";
  const m = /^(.*\/plugins\/)cache\/([^/]+)\/[^/]+\/[^/]+\/$/.exec(trailing);
  if (!m) return null;
  return resolve(m[1], "marketplaces", m[2]);
}

/**
 * Walk a directory recursively, returning relative file paths from
 * baseAbs. Skips unreadable entries silently. Uses lstatSync and skips
 * symlinks so a stray symlink-to-outside in the marketplace tree can't
 * be harvested as a regular file and copied into pluginRoot. statSync
 * would dereference and silently follow the link.
 */
function listFilesRecursive(absDir, baseAbs) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(absDir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(absDir, name);
    let st;
    try {
      st = lstatSync(full);
    } catch {
      continue;
    }
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) {
      out.push(...listFilesRecursive(full, baseAbs));
    } else if (st.isFile()) {
      out.push(full.slice(baseAbs.length + 1));
    }
  }
  return out;
}

/**
 * Expand a `files[]` array against rootDir into a flat list of file paths
 * (relative to rootDir, OS-native separator). Entries that don't exist on
 * disk are silently dropped, matching the semantics of
 * scripts/plugin-cache-integrity.mjs::derivePluginManifest.
 *
 * Containment: entries whose resolved path escapes rootDir (e.g. a
 * corrupted marketplace package.json with `files: ["../outside.txt"]`)
 * are rejected, so the downstream copy loop can't be tricked into
 * reading from or writing outside the trusted root. `path.join` itself
 * does not clamp `..` segments; it normalizes them. As such, we resolve
 * and prefix-match against rootDir + sep explicitly.
 *
 * Symlinks: lstatSync + isSymbolicLink() drops top-level entries that
 * are themselves symlinks. A symlink-to-outside sitting in rootDir
 * passes the lexical resolve+startsWith check, since the symlink's own
 * path stays inside rootDir; we have to refuse symlinks outright to
 * close that bypass.
 */
function expandFilesArray(rootDir, files) {
  if (!Array.isArray(files)) return [];
  const out = new Set();
  const rootWithSep = resolve(rootDir) + sep;
  for (const entry of files) {
    if (typeof entry !== "string" || !entry) continue;
    const abs = join(rootDir, entry);
    if (!resolve(abs).startsWith(rootWithSep)) continue;
    if (!existsSync(abs)) continue;
    let st;
    try {
      st = lstatSync(abs);
    } catch {
      continue;
    }
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) {
      for (const f of listFilesRecursive(abs, rootDir)) out.add(f);
    } else if (st.isFile()) {
      out.add(entry);
    }
  }
  return [...out];
}

function readJsonSafe(path) {
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * Repair `.claude-plugin/plugin.json` mcpServers.args[0] to point at the
 * current pluginRoot. This is the carry-forward fingerprint from CC's
 * native plugin manager: when it creates a new version dir, it preserves
 * the previous version's plugin.json (including any absolute start.mjs
 * path that hooks/normalize-hooks.mjs (#604) wrote on Linux/Windows) and
 * only bumps the `version` field. The result is args[0] pointing at a
 * version dir that's typically been cleaned up by the age-gated sweep,
 * so MCP launch ENOENTs.
 *
 * We can't lean on normalize-hooks.mjs's existing rewrite path since
 * that fires from start.mjs at boot, and start.mjs is what's missing
 * (or, if present, would have already loaded plugin.json with the stale
 * path before normalize ran). The heal does the rewrite up front.
 *
 * Mirrors the rewrite logic in hooks/normalize-hooks.mjs for placeholder
 * and stale-cache-version drift shapes. The `command` field is left
 * alone (start.mjs's normalize call repairs it on the next clean boot).
 */
function rewritePluginJsonArgs(pluginRoot) {
  const pluginJsonPath = join(pluginRoot, ".claude-plugin", "plugin.json");
  if (!existsSync(pluginJsonPath)) return false;
  // Refuse to operate on plugin.json when it's a symlink, atomically.
  // O_NOFOLLOW makes open(2) fail with ELOOP when the final path
  // component is a symlink, in the same syscall that opens the fd.
  // A naive `lstatSync().isSymbolicLink() ? return false : readFileSync(path)`
  // would have a TOCTOU window between the lstat and the read where
  // a same-user attacker could swap the regular file for a symlink
  // pointing at attacker JSON, feeding the read attacker bytes; the
  // subsequent atomic rename would then replace the symlink with a
  // regular file holding attacker mcpServers config, executed at next
  // MCP launch. Reading from the fd returned by openSync(O_NOFOLLOW)
  // closes that window since the fd is bound to an inode, not a path.
  // POSIX 0700 on ~/.claude scopes this to same-user threats; the
  // defense mirrors the source/destination symlink refusals elsewhere.
  let fd;
  try {
    fd = openSync(
      pluginJsonPath,
      fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
    );
  } catch {
    return false;
  }
  let content;
  try {
    content = readFileSync(fd, "utf-8");
  } catch {
    try {
      closeSync(fd);
    } catch {
      /* ignore */
    }
    return false;
  }
  try {
    closeSync(fd);
  } catch {
    /* ignore */
  }
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    return false;
  }
  const servers = parsed?.mcpServers;
  if (!servers || typeof servers !== "object") return false;

  const safeRoot = String(pluginRoot).replace(/\\/g, "/");
  const versionM = /context-mode\/context-mode\/([0-9]+\.[0-9]+\.[0-9]+)(?:\/|$)/.exec(safeRoot);
  const currentVersion = versionM ? versionM[1] : null;
  const STALE_VERSION_RE = /context-mode\/context-mode\/([0-9]+\.[0-9]+\.[0-9]+)(?=\/)/g;
  const PLACEHOLDER = "${CLAUDE_PLUGIN_ROOT}";

  let mutated = false;
  for (const key of Object.keys(servers)) {
    const srv = servers[key];
    if (!srv || typeof srv !== "object" || !Array.isArray(srv.args)) continue;
    const before = srv.args;
    const after = before.map((a) => {
      if (typeof a !== "string") return a;
      let next = a;
      if (next.includes(PLACEHOLDER)) {
        next = next.replaceAll(PLACEHOLDER, safeRoot);
      }
      if (currentVersion) {
        const fwd = next.replace(/\\/g, "/");
        STALE_VERSION_RE.lastIndex = 0;
        let hasStale = false;
        let m;
        while ((m = STALE_VERSION_RE.exec(fwd)) !== null) {
          if (m[1] !== currentVersion) {
            hasStale = true;
            break;
          }
        }
        if (hasStale) {
          next = fwd.replace(
            STALE_VERSION_RE,
            `context-mode/context-mode/${currentVersion}`,
          );
        }
      }
      return next;
    });
    if (after.some((v, i) => v !== before[i])) {
      srv.args = after;
      mutated = true;
    }
  }

  if (!mutated) return false;
  // Atomic write with two security properties on top of atomicity:
  //   1. Unguessable tmp filename via randomBytes(8). A local attacker
  //      polling /proc/<pid>/comm can predict process.pid and pre-plant
  //      a symlink at a deterministic tmp path, redirecting our write.
  //      64 bits of randomness make that infeasible.
  //   2. O_CREAT | O_EXCL via `flag: "wx"`. open(2) with O_EXCL refuses
  //      to follow symlinks at the final path component, raising EEXIST
  //      instead. So even if the random tmp name happens to collide
  //      with a pre-existing symlink, the write fails closed rather
  //      than redirecting.
  // renameSync remains atomic on POSIX so a concurrent reader can't
  // observe a torn JSON file. On Windows the implementation maps to
  // MoveFileEx(MOVEFILE_REPLACE_EXISTING), which is atomic for
  // non-directory writes.
  const tmp = `${pluginJsonPath}.tmp-${randomBytes(8).toString("hex")}`;
  try {
    writeFileSync(tmp, JSON.stringify(parsed, null, 2), {
      encoding: "utf-8",
      flag: "wx",
    });
    renameSync(tmp, pluginJsonPath);
    return true;
  } catch {
    // Best-effort cleanup. If writeFileSync threw, tmp may not exist;
    // if renameSync threw, tmp still does. unlinkSync's own catch
    // swallows ENOENT either way.
    try {
      unlinkSync(tmp);
    } catch {
      /* ignore */
    }
    return false;
  }
}

function resolveConfigDir() {
  const envVal = process.env.CLAUDE_CONFIG_DIR;
  if (envVal && envVal.trim() !== "") {
    if (envVal.startsWith("~")) {
      return resolve(homedir(), envVal.replace(/^~[/\\]?/, ""));
    }
    return resolve(envVal);
  }
  return resolve(homedir(), ".claude");
}

function logHealResult(result) {
  try {
    const logDir = join(resolveConfigDir(), "context-mode");
    mkdirSync(logDir, { recursive: true });
    appendFileSync(
      join(logDir, "heal-partial-install.log"),
      JSON.stringify({ ts: new Date().toISOString(), ...result }) + "\n",
      "utf-8",
    );
  } catch {
    /* best effort */
  }
}

/**
 * Heal a partial install by copying missing files from the marketplace
 * clone. Best-effort and idempotent. Never throws.
 *
 * Inputs:
 *   pluginRoot           - absolute path to the cache version dir (CLAUDE_PLUGIN_ROOT).
 *   marketplaceClonePath - absolute path to the marketplace clone. Auto-derived
 *                          from pluginRoot when omitted.
 *   log                  - when true (default), appends a JSON line to
 *                          ~/.claude/context-mode/heal-partial-install.log
 *                          on every run, including skipped ones, so an
 *                          operator can grep for evidence the hook fired.
 *
 * Returns an object whose exact shape depends on the branch taken.
 * Common fields:
 *   healed:        string[]   // relative paths successfully copied (always present, [] when skipped)
 *   stillMissing:  string[]   // relative paths the heal couldn't restore (always present, [] when skipped)
 *   skipped?:      string     // reason the heal short-circuited; absent on the success path
 *   pluginRoot?:   string     // echoed back when known; absent only on the "no-plugin-root" branch
 *   pkgSource?:    string     // "marketplace" or "pluginRoot", which package.json the files[] came from; absent until the manifest read happens
 *   argsRewritten?: boolean   // whether plugin.json mcpServers.args was rewritten; present on the success path and on "files-already-present"
 *   missingBefore?: string[]  // present on the success path only; relative paths that were missing before the copy loop ran
 *
 * Branch matrix:
 *   skipped="no-plugin-root"        : {healed, stillMissing, skipped}
 *   skipped="not-claude-code"       : {healed, stillMissing, skipped, pluginRoot}
 *   skipped="not-partial"           : {healed, stillMissing, skipped, pluginRoot}
 *   skipped="no-marketplace"        : {healed, stillMissing, skipped, pluginRoot}
 *   skipped="same-as-marketplace"   : {healed, stillMissing, skipped, pluginRoot}
 *   skipped="no-files-manifest"     : {healed, stillMissing, skipped, pluginRoot, pkgSource}
 *   skipped="marketplace-empty"     : {healed, stillMissing, skipped, pluginRoot, pkgSource}
 *   skipped="files-already-present" : {healed, stillMissing, skipped, pluginRoot, pkgSource, argsRewritten}
 *   success path (no `skipped` key) : {healed, stillMissing, pluginRoot, pkgSource, argsRewritten, missingBefore}
 */
export function healPartialInstallFromMarketplace(opts = {}) {
  const pluginRoot = opts.pluginRoot ?? process.env.CLAUDE_PLUGIN_ROOT;
  const log = opts.log !== false;

  if (!pluginRoot) {
    const result = {
      healed: [],
      stillMissing: [],
      skipped: "no-plugin-root",
    };
    if (log) logHealResult(result);
    return result;
  }

  // CC-only scope check. The partial-install failure mode this module
  // addresses is specific to Claude Code's per-version cache layout at
  // ~/.claude/plugins/cache/<owner>/<plugin>/<version>/. Other clients
  // (Codex, Cursor, OpenCode, Kiro, ...) ship their own SessionStart
  // hooks under hooks/<client>/ and don't go through this module at
  // all; npm-global, npx, and dev-checkout installs don't have the
  // cache layout either. deriveMarketplaceClonePath returns null for
  // anything that isn't a CC cache pluginRoot. Bailing here keeps the
  // healthy-case fast path cheap for non-CC contexts (no isPartialInstall
  // probe, no filesystem reads) and makes the scope intent explicit in
  // the log: a "not-claude-code" line is the signal that the heal saw
  // a non-CC pluginRoot.
  const marketplaceClonePath =
    opts.marketplaceClonePath ?? deriveMarketplaceClonePath(pluginRoot);
  if (!marketplaceClonePath) {
    const result = {
      healed: [],
      stillMissing: [],
      skipped: "not-claude-code",
      pluginRoot,
    };
    if (log) logHealResult(result);
    return result;
  }

  if (!isPartialInstall(pluginRoot)) {
    const result = {
      healed: [],
      stillMissing: [],
      skipped: "not-partial",
      pluginRoot,
    };
    if (log) logHealResult(result);
    return result;
  }

  if (!existsSync(marketplaceClonePath)) {
    const result = {
      healed: [],
      stillMissing: [],
      skipped: "no-marketplace",
      pluginRoot,
    };
    if (log) logHealResult(result);
    return result;
  }

  // Path-traversal guard: refuse to heal a pluginRoot that is itself the
  // marketplace clone (would happen on a dev checkout where someone
  // symlinks the cache into the marketplace tree).
  if (resolve(pluginRoot) === resolve(marketplaceClonePath)) {
    const result = {
      healed: [],
      stillMissing: [],
      skipped: "same-as-marketplace",
      pluginRoot,
    };
    if (log) logHealResult(result);
    return result;
  }

  // Prefer the marketplace clone's package.json. The heal only runs
  // once we've established that pluginRoot is in a partial state, and
  // its package.json (when present at all) can itself be a stale
  // carry-forward from a prior version. The marketplace clone is the
  // canonical source CC extracted the cache from, so its files[] is
  // the right manifest to expand. Fall back to pluginRoot only when
  // the marketplace clone's package.json is unreadable.
  let pkg = readJsonSafe(join(marketplaceClonePath, "package.json"));
  let pkgSource = "marketplace";
  if (!pkg) {
    pkg = readJsonSafe(join(pluginRoot, "package.json"));
    pkgSource = "pluginRoot";
  }
  if (!pkg || !Array.isArray(pkg.files)) {
    const result = {
      healed: [],
      stillMissing: [],
      skipped: "no-files-manifest",
      pluginRoot,
      pkgSource,
    };
    if (log) logHealResult(result);
    return result;
  }

  // Always include package.json itself so the next boot's getLocalVersion
  // and integrity check have something to read. npm's `files[]` semantics
  // include package.json implicitly; we have to add it back manually since
  // we're expanding the array ourselves.
  const items = new Set(pkg.files);
  items.add("package.json");

  // Expand against the marketplace clone since that's the source of truth.
  // Entries that don't exist on the marketplace side are dropped.
  const expanded = expandFilesArray(marketplaceClonePath, [...items]);
  if (expanded.length === 0) {
    const result = {
      healed: [],
      stillMissing: [],
      skipped: "marketplace-empty",
      pluginRoot,
      pkgSource,
    };
    if (log) logHealResult(result);
    return result;
  }

  const missingBefore = expanded.filter((rel) => !existsSync(join(pluginRoot, rel)));
  if (missingBefore.length === 0) {
    // The cheap probe tripped but the full expansion shows everything's
    // present, e.g. start.mjs is missing but isn't in files[] anymore
    // (unlikely, but defensive). Still attempt the args rewrite in case
    // a carry-forward plugin.json drifted independently.
    const argsRewritten = rewritePluginJsonArgs(pluginRoot);
    const result = {
      healed: [],
      stillMissing: [],
      argsRewritten,
      pkgSource,
      pluginRoot,
      skipped: "files-already-present",
    };
    if (log) logHealResult(result);
    return result;
  }

  // Copy each missing item. The guards below mirror the Contract
  // block at the top of this module: layer 2 (lexical), layer 4
  // (realpath on dest), layer 5 (lstat + realpath on source), layer 6
  // (lstat + unlink on dest, plus an O_EXCL destination open). The
  // non-layered existsSync(from) guard skips entries that disappeared
  // from the marketplace between manifest expansion and this
  // iteration, so the read isn't asked to open a missing source.
  // realpathSync(pluginRoot) and realpathSync(marketplaceClonePath)
  // are cached once outside the loop; failures there just disable
  // the realpath guards for this run, leaving the lexical guards in
  // force (heal contract: never throws).
  const pluginRootWithSep = resolve(pluginRoot) + sep;
  const marketplaceWithSep = resolve(marketplaceClonePath) + sep;
  let pluginRootRealWithSep = null;
  try {
    pluginRootRealWithSep = realpathSync(pluginRoot) + sep;
  } catch {
    /* lexical guard still in force */
  }
  let marketplaceCloneRealWithSep = null;
  try {
    marketplaceCloneRealWithSep = realpathSync(marketplaceClonePath) + sep;
  } catch {
    /* lexical guard still in force */
  }
  const healed = [];
  for (const rel of missingBefore) {
    const from = join(marketplaceClonePath, rel);
    const to = join(pluginRoot, rel);
    if (!resolve(from).startsWith(marketplaceWithSep)) continue;
    if (!resolve(to).startsWith(pluginRootWithSep)) continue;
    if (!existsSync(from)) continue;
    try {
      mkdirSync(dirname(to), { recursive: true });
      if (pluginRootRealWithSep) {
        const toParentReal = realpathSync(dirname(to)) + sep;
        if (!toParentReal.startsWith(pluginRootRealWithSep)) continue;
      }
      let stFrom;
      try {
        stFrom = lstatSync(from);
      } catch {
        continue;
      }
      if (stFrom.isSymbolicLink()) continue;
      if (marketplaceCloneRealWithSep) {
        let fromReal;
        try {
          fromReal = realpathSync(from);
        } catch {
          continue;
        }
        if (!(fromReal + sep).startsWith(marketplaceCloneRealWithSep)) {
          continue;
        }
      }
      try {
        const stTo = lstatSync(to);
        if (stTo.isSymbolicLink()) unlinkSync(to);
      } catch {
        /* `to` doesn't exist yet, which is the common case */
      }
      // Read-then-write with O_CREAT | O_EXCL (Node's `wx` flag) so
      // the destination open refuses to follow a symlink at the leaf.
      // This closes the residual race window between the unlinkSync
      // above and the destination open: a same-user attacker who
      // re-plants a symlink at `to` after our unlink would have made
      // a default cpSync (or any non-EXCL open) follow it. EXCL on
      // its own implies "do not follow symlinks at the final
      // component" per POSIX open(2), so we don't need an explicit
      // O_NOFOLLOW. mode is preserved from the source so executable
      // bits on bin/* survive the copy.
      const content = readFileSync(from);
      writeFileSync(to, content, {
        flag: "wx",
        mode: stFrom.mode & 0o777,
      });
      healed.push(rel);
    } catch {
      /* best-effort: keep going so as many files as possible get restored */
    }
  }

  const argsRewritten = rewritePluginJsonArgs(pluginRoot);
  const stillMissing = expanded.filter((rel) => !existsSync(join(pluginRoot, rel)));

  const result = {
    healed,
    stillMissing,
    argsRewritten,
    pkgSource,
    missingBefore,
    pluginRoot,
  };
  if (log) logHealResult(result);
  return result;
}

// Default export for ergonomic call sites that don't need the named exports.
export default healPartialInstallFromMarketplace;
