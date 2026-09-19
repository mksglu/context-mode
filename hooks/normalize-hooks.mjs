// normalize-hooks.mjs — fixes #378
//
// Static committed files (hooks/hooks.json, .claude-plugin/plugin.json) ship
// with `${CLAUDE_PLUGIN_ROOT}` placeholder + bare `node` command. On Windows
// + Claude Code this triggers cjs/loader:1479 errors because:
//   1. bare `node` may not resolve via PATH (Git Bash, see #369)
//   2. `${CLAUDE_PLUGIN_ROOT}` resolution can hit MSYS path mangling (#372)
//   3. backslash paths get corrupted in shell quoting
//
// Our buildNodeCommand() fix handles dynamically-generated settings.json but
// not the static committed files. Solution: start.mjs detects the placeholder
// pattern on every MCP boot and rewrites with absolute paths using
// process.execPath + forward slashes. Idempotent — only rewrites when needed.
// Survives upgrades because it runs at every start.
//
// #1090: process.execPath itself can be a version-manager snapshot (Homebrew
// Cellar, nvm, asdf, mise) that a later upgrade deletes. Before persisting it
// here, resolveStableInterpreterPath() prefers a stable PATH-resolvable
// sibling that resolves to the same real binary, so the baked-in path
// survives the next upgrade instead of dangling.

import { existsSync, readFileSync, writeFileSync, realpathSync } from "node:fs";
import { resolve, delimiter } from "node:path";

const PLACEHOLDER = "${CLAUDE_PLUGIN_ROOT}";

// #604: matches a cache path segment `context-mode/context-mode/<version>`.
// Capture group is the X.Y.Z version. Used to detect command paths frozen on a
// previous-version dir that Claude Code's native plugin manager has since
// cleaned up. `/g` so a single content blob with multiple stale references is
// fully covered. Forward-slash only — callers convert beforehand.
const CACHE_VERSION_RE =
  /context-mode\/context-mode\/([0-9]+\.[0-9]+\.[0-9]+)(?=\/)/g;

/** Convert any path string to forward slashes (MSYS-safe). */
function fwd(p) {
  return String(p).replace(/\\/g, "/");
}

/** Cross-OS basename: split on either separator, take the last segment. */
function baseName(p) {
  const segments = String(p).split(/[\\/]/);
  return segments[segments.length - 1] ?? String(p);
}

// #1090: shape of a version-manager-pinned interpreter directory — Homebrew
// Cellar (`.../Cellar/node/26.8.2/bin/node`), nvm (`.../versions/node/v20.1.0/…`),
// asdf (`.../installs/nodejs/20.1.0/…`), mise, volta, etc. Matched by SHAPE
// (a `vX.Y.Z` path segment, optional `_N`/`-tag` revision suffix) rather than
// by naming each manager, so a manager we've never heard of still matches.
const VERSION_PINNED_SEGMENT_RE =
  /[\\/]v?\d+\.\d+\.\d+(?:[-_.][A-Za-z0-9]+)*[\\/]/;

function looksVersionPinned(p) {
  return VERSION_PINNED_SEGMENT_RE.test(fwd(String(p)));
}

/**
 * Issue #1090 — before PERSISTING an interpreter path into a static config
 * file (hooks.json commands, plugin.json mcpServers.command), prefer a
 * stable, PATH-resolvable equivalent over a version-manager snapshot that
 * the next upgrade (`brew upgrade node && brew cleanup`, nvm install, …)
 * will delete out from under the running config.
 *
 * This is deliberately a WRITE-TIME preference, not a read-time liveness
 * guard like `resolveJavascriptRuntime()` (#800/#803) or `resolveHookRuntime()`
 * (#841): those re-check `existsSync(execPath)` and fall back to a bare
 * command-name once the pinned path is ALREADY dead. That pattern cannot
 * help here — the process that would run the read-time check for
 * `mcpServers.command` is the MCP server itself, which is exactly what
 * fails to spawn once the pinned path is gone (see #1090). The fix has to
 * avoid ever persisting the versioned snapshot in the first place, at the
 * moment it's still alive and a stable sibling can still be found.
 *
 * `execPath` is returned UNCHANGED (pre-#1090 behaviour) unless ALL hold:
 *   1. `execPath` itself looks version-pinned — nothing to improve otherwise.
 *   2. A same-named binary exists on some PATH entry.
 *   3. Its realpath matches `execPath`'s realpath — same underlying
 *      interpreter, not merely a same-named unrelated binary.
 *   4. That PATH entry's own (unresolved) path is NOT itself version-pinned
 *      — a second Cellar/nvm snapshot earlier on PATH is not "stable".
 *
 * When no such candidate exists — e.g. plain nvm/asdf, which pin PATH itself
 * to the versioned install dir with no unversioned alias — `execPath` is
 * returned verbatim. This preserves PR #582 (bare `"node"` is not reliably
 * on PATH for those managers when Claude Code spawns a hook via `/bin/sh`).
 *
 * Never throws: any fs error during the search falls back to `execPath`.
 */
export function resolveStableInterpreterPath(execPath, deps = {}) {
  if (!execPath || typeof execPath !== "string") return execPath;
  if (!looksVersionPinned(execPath)) return execPath;

  const exists = deps.existsSync ?? existsSync;
  const realpath = deps.realpathSync ?? realpathSync;
  const pathEnv = deps.pathEnv ?? process.env.PATH ?? "";
  const name = baseName(execPath);

  let targetReal;
  try {
    targetReal = realpath(execPath);
  } catch {
    // Can't stat the very path we were handed — nothing to compare against.
    return execPath;
  }

  for (const dir of pathEnv.split(delimiter)) {
    if (!dir) continue;
    const candidate = resolve(dir, name);
    if (candidate === execPath) continue;
    if (looksVersionPinned(candidate)) continue;
    try {
      if (!exists(candidate)) continue;
      if (realpath(candidate) === targetReal) return candidate;
    } catch {
      /* unreadable/racy candidate — keep scanning */
    }
  }

  return execPath;
}

/**
 * Extract the X.Y.Z version segment from a pluginRoot under the context-mode
 * cache layout. Returns null when running from npm-global, a dev checkout, or
 * any layout that does not match the `<…>/context-mode/context-mode/<v>(/…)?`
 * pattern — callers must treat null as "no stale-path check is possible".
 */
function pluginRootVersion(pluginRoot) {
  if (!pluginRoot) return null;
  const m =
    /context-mode\/context-mode\/([0-9]+\.[0-9]+\.[0-9]+)(?:\/|$)/.exec(
      fwd(pluginRoot),
    );
  return m ? m[1] : null;
}

/**
 * Does `content` reference any context-mode cache version segment that differs
 * from `currentVersion`? Detects the #604 ratchet: already-normalized hooks.json
 * / plugin.json carrying a previous version's absolute paths forward into a
 * newer version's cache directory after Claude Code's auto-update.
 */
function hasStaleCacheVersionSegment(content, currentVersion) {
  if (!currentVersion || !content || typeof content !== "string") return false;
  const safe = fwd(content);
  CACHE_VERSION_RE.lastIndex = 0;
  let m;
  while ((m = CACHE_VERSION_RE.exec(safe)) !== null) {
    if (m[1] !== currentVersion) return true;
  }
  return false;
}

/**
 * Pure detection: does this content need to be (re-)normalized?
 *
 * Two triggers:
 *   1. Fresh content still containing the `${CLAUDE_PLUGIN_ROOT}` placeholder
 *      — the original #378 first-boot path on any host.
 *   2. (#604) Already-resolved content whose absolute paths point at a
 *      different version of the context-mode cache than the current
 *      `pluginRoot`. Breaks the ratchet that previously froze stale paths
 *      after Claude Code's native plugin manager copied a previous version's
 *      hooks.json forward.
 *
 * `pluginRoot` is optional for backwards compatibility with single-arg
 * callers; without it, only the placeholder check runs.
 */
export function needsHookNormalization(content, pluginRoot) {
  if (!content || typeof content !== "string") return false;
  if (content.includes(PLACEHOLDER)) return true;
  return hasStaleCacheVersionSegment(content, pluginRootVersion(pluginRoot));
}

/**
 * Rewrite hooks.json content. Replaces:
 *   - `node "${CLAUDE_PLUGIN_ROOT}/x.mjs"` →
 *     `"<execPath>" "<pluginRoot>/x.mjs"`  (forward slashes, double-quoted)
 *
 * Pure function — takes content + paths, returns new content.
 * Idempotent — leaves already-normalized content unchanged.
 */
export function normalizeHooksJson(content, nodePath, pluginRoot) {
  if (!needsHookNormalization(content, pluginRoot)) return content;

  const safeNode = fwd(nodePath);
  const safeRoot = fwd(pluginRoot);
  const currentVersion = pluginRootVersion(pluginRoot);

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    return content;
  }

  const hooks = parsed?.hooks;
  if (!hooks || typeof hooks !== "object") return content;

  let mutated = false;
  for (const eventName of Object.keys(hooks)) {
    const matchers = hooks[eventName];
    if (!Array.isArray(matchers)) continue;
    for (const matcher of matchers) {
      const inner = matcher?.hooks;
      if (!Array.isArray(inner)) continue;
      for (const h of inner) {
        if (typeof h?.command !== "string") continue;

        const hasPlaceholder = h.command.includes(PLACEHOLDER);
        // #604: also rewrite when the command holds a stale absolute path under
        // a previous-version cache dir (Claude Code's auto-update ratchet).
        const hasStale = hasStaleCacheVersionSegment(h.command, currentVersion);
        if (!hasPlaceholder && !hasStale) continue;

        let next = h.command;
        if (hasPlaceholder) {
          // Replace placeholder with absolute root (forward-slash).
          next = next.replaceAll(PLACEHOLDER, safeRoot);
          // Replace bare `node ` prefix with quoted execPath. Match both
          // `node ` and `node\t` at start, with optional surrounding whitespace.
          next = next.replace(/^\s*node\s+/, `"${safeNode}" `);
        }
        if (hasStale) {
          // Re-point every `context-mode/context-mode/<old-version>/…` segment
          // to the current pluginRoot's version. Operates on the forward-slash
          // form so MSYS-mangled paths heal as well.
          next = fwd(next).replace(
            CACHE_VERSION_RE,
            `context-mode/context-mode/${currentVersion}`,
          );
        }
        h.command = next;
        mutated = true;
      }
    }
  }

  if (!mutated) return content;

  // Preserve 2-space indent (matches committed format).
  return JSON.stringify(parsed, null, 2);
}

/**
 * Rewrite plugin.json mcpServers. Replaces:
 *   - `command: "node"` → `command: "<execPath-fwd>"`
 *   - `args: ["${CLAUDE_PLUGIN_ROOT}/start.mjs"]` →
 *     `args: ["<pluginRoot-fwd>/start.mjs"]`
 *
 * Idempotent.
 */
export function normalizePluginJson(content, nodePath, pluginRoot) {
  if (!needsHookNormalization(content, pluginRoot)) return content;

  const safeNode = fwd(nodePath);
  const safeRoot = fwd(pluginRoot);
  const currentVersion = pluginRootVersion(pluginRoot);

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    return content;
  }

  const servers = parsed?.mcpServers;
  if (!servers || typeof servers !== "object") return content;

  let mutated = false;
  for (const name of Object.keys(servers)) {
    const srv = servers[name];
    if (!srv || typeof srv !== "object") continue;

    if (Array.isArray(srv.args)) {
      const before = srv.args;
      const after = before.map((a) => {
        if (typeof a !== "string") return a;
        let next = a;
        if (next.includes(PLACEHOLDER)) {
          next = next.replaceAll(PLACEHOLDER, safeRoot);
        }
        // #604: same auto-update ratchet hits plugin.json args (see #523).
        if (hasStaleCacheVersionSegment(next, currentVersion)) {
          next = fwd(next).replace(
            CACHE_VERSION_RE,
            `context-mode/context-mode/${currentVersion}`,
          );
        }
        return next;
      });
      if (after.some((v, i) => v !== before[i])) {
        srv.args = after;
        mutated = true;
      }
    }

    if (srv.command === "node" && mutated) {
      // Only swap bare `node` when we also rewrote args — otherwise we'd
      // touch user-customized server entries unrelated to placeholders.
      srv.command = safeNode;
    }
  }

  if (!mutated) return content;
  return JSON.stringify(parsed, null, 2);
}

/**
 * Apply normalization to hooks/hooks.json ONLY (not plugin.json).
 *
 * Why a narrow variant exists (#711 + #414 / #528):
 *   - plugin.json is read by Claude Code's plugin manager and carried forward
 *     into NEW versioned cache dirs on auto-update. Baking absolute paths into
 *     it during /ctx-upgrade poisons the next version (#711).
 *   - hooks/hooks.json lives in the per-version dir and is read by the SAME
 *     Node process that needs to spawn a child. On Windows + Git Bash, Claude
 *     Code fires SessionStart/PreToolUse BEFORE MCP boot — the unresolved
 *     `${CLAUDE_PLUGIN_ROOT}` placeholder yields MODULE_NOT_FOUND for the
 *     first hook fire after /ctx-upgrade (#414).
 *
 * So /ctx-upgrade calls THIS narrow function (hooks.json only) to close the
 * Windows first-hook-fire window without re-introducing #711.
 *
 * Options:
 *   - pluginRoot:     absolute path to plugin install dir
 *   - nodePath:       process.execPath (the Node binary running this script)
 *   - jsRuntimePath:  optional — resolved Bun ≥1.0 path (#738). When set, the
 *                     rewrite uses this instead of nodePath so hook invocations
 *                     gain Bun's ~40-60ms cold-start advantage. Falls back to
 *                     nodePath when omitted (back-compat).
 *   - platform:       process.platform. Triggers a write on:
 *                       • "win32" / "linux" — the original #378 path
 *                         (#369/#372 MSYS / nvm fixes), AND
 *                       • any platform when jsRuntimePath !== nodePath
 *                         (#738 — bun swap is a perf optimisation that should
 *                         not be gated by the historical Windows-only check;
 *                         issue was filed from macOS).
 *
 * Best-effort — never throws.
 */
export function normalizeHooksJsonOnly({ pluginRoot, nodePath, jsRuntimePath, platform }) {
  const effectiveRuntime = jsRuntimePath || nodePath;
  // #378 path: always normalize on Windows/Linux to heal placeholder + bare-node.
  // #738 path: also fire on macOS when we have a real bun swap to perform — the
  // legacy gate skipped darwin because system node was reliable there, but bun
  // resolution is the new perf-win that the gate now needs to allow through.
  const isPlatformGated = platform !== "win32" && platform !== "linux";
  const hasBunSwap = jsRuntimePath && jsRuntimePath !== nodePath;
  if (isPlatformGated && !hasBunSwap) return;
  if (!pluginRoot || !effectiveRuntime) return;

  try {
    const hooksPath = resolve(pluginRoot, "hooks", "hooks.json");
    if (existsSync(hooksPath)) {
      const original = readFileSync(hooksPath, "utf-8");
      if (needsHookNormalization(original, pluginRoot)) {
        // #1090: prefer a stable, PATH-resolvable equivalent over a
        // version-manager snapshot before baking it into hooks.json.
        const stableRuntime = resolveStableInterpreterPath(effectiveRuntime);
        const next = normalizeHooksJson(original, stableRuntime, pluginRoot);
        if (next !== original) {
          writeFileSync(hooksPath, next, "utf-8");
        }
      }
    }
  } catch {
    /* best effort */
  }
}

/**
 * Apply normalization to hooks.json and plugin.json on startup.
 *
 * Options:
 *   - pluginRoot:     absolute path to plugin install dir (e.g. __dirname of start.mjs)
 *   - nodePath:       process.execPath
 *   - jsRuntimePath:  optional Bun ≥1.0 path (#738) — used for hooks.json only,
 *                     never for plugin.json (the MCP server itself must stay on
 *                     Node — better-sqlite3 ABI, #543)
 *   - platform:       process.platform ("win32" and "linux" trigger plugin.json
 *                     rewrite for #378; hooks.json also rewrites on darwin when
 *                     `jsRuntimePath` !== `nodePath` for #738)
 *
 * Best-effort — never throws.
 */
export function normalizeHooksOnStartup({ pluginRoot, nodePath, jsRuntimePath, platform }) {
  // Delegate the hooks.json branch to the narrow helper so /ctx-upgrade and
  // boot share one implementation. plugin.json normalization stays here —
  // start.mjs and postinstall still need it; /ctx-upgrade must NOT (#711).
  normalizeHooksJsonOnly({ pluginRoot, nodePath, jsRuntimePath, platform });

  // plugin.json rewrite: ALWAYS uses nodePath (MCP server must stay on Node,
  // #543). Bun resolution is irrelevant here — `jsRuntimePath` is consumed
  // exclusively by the hooks.json branch above.
  if (platform !== "win32" && platform !== "linux") return;
  if (!pluginRoot || !nodePath) return;

  // .claude-plugin/plugin.json
  try {
    const pluginPath = resolve(pluginRoot, ".claude-plugin", "plugin.json");
    if (existsSync(pluginPath)) {
      const original = readFileSync(pluginPath, "utf-8");
      if (needsHookNormalization(original, pluginRoot)) {
        // #1090: same stable-path preference as the hooks.json branch above —
        // plugin.json's mcpServers.command has no self-heal once it dangles,
        // since the MCP server that would run the heal is what fails to spawn.
        const stableNode = resolveStableInterpreterPath(nodePath);
        const next = normalizePluginJson(original, stableNode, pluginRoot);
        if (next !== original) {
          writeFileSync(pluginPath, next, "utf-8");
        }
      }
    }
  } catch {
    /* best effort */
  }
}
