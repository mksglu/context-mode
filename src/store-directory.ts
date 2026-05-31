/**
 * walkDirectory — bounded recursive directory walker for ctx_index (#687).
 *
 * Issue: ctx_index refused directory paths via the security gate at
 * src/store.ts:845 ("refusing to index <path>: not a regular file"). The gate
 * is a TOCTOU defense from #442 round-3 and MUST be preserved — directory
 * support is layered as a separate concern here. Each file produced by
 * walkDirectory is then read via the existing per-file
 * `openSync + fstatSync.isFile()` invariant in `ContentStore.index()`.
 *
 * Reported by @matiasduartee across 4 clients × Windows 11.
 * https://github.com/anthropic-experimental/context-mode/issues/687
 *
 * Design constraints:
 *   - No new dependencies (avoid the `ignore` package — issue #687 Diagnose).
 *   - Cross-OS: path.sep / path.join everywhere, never raw "/" string ops.
 *   - Symlink cycle detection via a resolved-path Set.
 *   - Symlink-escape rejection: refuse to follow symlinks that resolve outside
 *     the rootPath (defense-in-depth alongside per-file checkFilePathDenyPolicy).
 *   - FTS5-blowup guard: hard cap maxFiles (default 200, per Architect).
 */

import {
  readdirSync,
  statSync,
  lstatSync,
  realpathSync,
  existsSync,
  readFileSync,
} from "node:fs";
import { join, extname, relative, sep, resolve } from "node:path";

export interface WalkOptions {
  /** Glob-ish include patterns. Empty/undefined means include all (subject to extensions). */
  include?: string[];
  /** Glob-ish exclude patterns. Merged with sensible defaults. */
  exclude?: string[];
  /** Max recursion depth from rootPath (0 = root only). Default 5. */
  maxDepth?: number;
  /** Hard cap on total files. Default 200 — FTS5 blow-up guard. */
  maxFiles?: number;
  /** Allowed file extensions (with leading dot). Empty/undefined means default set. */
  extensions?: string[];
  /** Apply nearest .gitignore rules during walk. Default true. */
  respectGitignore?: boolean;
  /** Follow directory symlinks. Default false (cycle hazard + escape risk). */
  followSymlinks?: boolean;
}

export interface WalkResult {
  files: string[];
  /** True when maxFiles cap was hit and traversal halted early. */
  capped: boolean;
  /** Total files discovered before cap (for reporting). */
  totalSeen: number;
}

const DEFAULT_EXCLUDES = [
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "coverage",
  ".venv",
  "__pycache__",
  ".DS_Store",
];

const DEFAULT_EXTENSIONS = [
  ".md",
  ".mdx",
  ".txt",
  ".json",
  ".yaml",
  ".yml",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".py",
  ".rs",
  ".go",
  ".sh",
];

const DEFAULT_MAX_DEPTH = 5;
const DEFAULT_MAX_FILES = 200;

// A glob with many wildcards is a ReDoS vector here: `**` compiles to `.*`
// (which crosses `/`), so a pattern like `**/**/.../Z` becomes a chain of `.*`
// groups whose `.test()` backtracks catastrophically against a `/`-segmented
// walked path that doesn't match. matchesAny runs that `.test()` in the
// long-lived server, not a child, so one hostile pattern stalls every tool.
// ctx_index include/exclude reach here straight from the tool args (unvalidated
// string arrays), so we cap the wildcard count and compile an over-cap pattern
// to a never-match regex. Legit globs (`**/*.ts`, `node_modules/**`,
// `**/secrets/**`) sit well under the cap.
const MAX_GLOB_WILDCARDS = 12;

/**
 * Convert a simple glob pattern (`*`, `**`, `?`) to a RegExp. Anchors at
 * boundaries so `node_modules` matches `node_modules` AND `node_modules/pkg`.
 * Patterns are matched against POSIX-style relative paths (forward slashes)
 * to give consistent behavior across macOS / Windows.
 */
export function globToRegExp(pattern: string): RegExp {
  // Refuse to compile a pattern past the wildcard cap; a never-match regex
  // can't backtrack (see MAX_GLOB_WILDCARDS).
  if ((pattern.match(/\*/g) ?? []).length > MAX_GLOB_WILDCARDS) return /(?!)/;
  // Escape regex metachars except glob ones.
  let re = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]!;
    if (c === "*") {
      if (pattern[i + 1] === "*") {
        re += ".*";
        i++;
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else if ("\\^$.|+()[]{}".includes(c)) {
      re += "\\" + c;
    } else {
      re += c;
    }
  }
  return new RegExp(`^${re}$`);
}

/** Match a posix-style relative path against any of the patterns. */
function matchesAny(relPosix: string, patterns: string[]): boolean {
  if (patterns.length === 0) return false;
  const basename = relPosix.split("/").pop() ?? relPosix;
  for (const p of patterns) {
    // Bare names match basename OR any path segment.
    if (!p.includes("/") && !p.includes("*")) {
      if (basename === p) return true;
      if (relPosix.split("/").includes(p)) return true;
      continue;
    }
    const re = globToRegExp(p);
    if (re.test(relPosix)) return true;
    if (re.test(basename)) return true;
  }
  return false;
}

/**
 * Parse a .gitignore file into a list of patterns. Comments and blank lines
 * are stripped. Negation (`!`) is not supported — kept conservative.
 */
function parseGitignore(rootPath: string): string[] {
  const giPath = join(rootPath, ".gitignore");
  if (!existsSync(giPath)) return [];
  try {
    const text = readFileSync(giPath, "utf-8");
    return text
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l.length > 0 && !l.startsWith("#") && !l.startsWith("!"))
      .map(l => l.replace(/^\//, "").replace(/\/$/, ""));
  } catch {
    return [];
  }
}

/**
 * Convert an absolute path under rootPath to a POSIX-style relative path
 * so glob matching is identical across macOS/Linux/Windows.
 */
function toPosixRel(rootPath: string, absPath: string): string {
  const rel = relative(rootPath, absPath);
  return rel.split(sep).join("/");
}

/**
 * Walk `rootPath` recursively under the given bounds and return absolute file
 * paths matching the filters. Pure synchronous traversal — no allocations
 * beyond the result array. Symlink cycles are detected via a resolved-path
 * Set; symlink escapes (resolving outside rootPath) are silently skipped.
 */
export function walkDirectory(rootPath: string, opts: WalkOptions = {}): string[] {
  return walkDirectoryDetailed(rootPath, opts).files;
}

/**
 * Same as walkDirectory but returns capped + totalSeen so callers can surface
 * a "capped at N files" notice in their response.
 */
export function walkDirectoryDetailed(rootPath: string, opts: WalkOptions = {}): WalkResult {
  const {
    include,
    exclude,
    maxDepth = DEFAULT_MAX_DEPTH,
    maxFiles = DEFAULT_MAX_FILES,
    extensions,
    respectGitignore = true,
    followSymlinks = false,
  } = opts;

  // Normalize rootPath to its real path so symlink-escape detection is sound.
  let rootReal: string;
  try {
    rootReal = realpathSync(rootPath);
  } catch {
    return { files: [], capped: false, totalSeen: 0 };
  }

  const exts = (extensions && extensions.length > 0 ? extensions : DEFAULT_EXTENSIONS)
    .map(e => (e.startsWith(".") ? e : "." + e).toLowerCase());
  const excludes = [
    ...DEFAULT_EXCLUDES,
    ...(exclude ?? []),
    ...(respectGitignore ? parseGitignore(rootReal) : []),
  ];
  const includes = include ?? [];

  const out: string[] = [];
  const visited = new Set<string>([rootReal]);
  let totalSeen = 0;
  let capped = false;

  function walk(absDir: string, depth: number): void {
    if (capped) return;
    if (depth > maxDepth) return;
    let entries: import("node:fs").Dirent[];
    try {
      entries = readdirSync(absDir, { withFileTypes: true });
    } catch {
      return; // unreadable directory — skip silently
    }
    for (const ent of entries) {
      if (capped) return;
      const absChild = join(absDir, ent.name);
      const relPosix = toPosixRel(rootReal, absChild);

      // Exclude check applies to both files and dirs — early prune.
      if (matchesAny(relPosix, excludes)) continue;
      // Include filter applies to files only — see below.

      // Resolve symlinks once; reject escapes; track for cycle detection.
      let isDirChild = ent.isDirectory();
      let isFileChild = ent.isFile();
      let isSymlink = false;
      try {
        const lst = lstatSync(absChild);
        isSymlink = lst.isSymbolicLink();
      } catch {
        continue;
      }

      if (isSymlink) {
        if (!followSymlinks) continue;
        let resolved: string;
        try {
          resolved = realpathSync(absChild);
        } catch {
          continue; // dangling
        }
        // Symlink-escape: refuse to follow if the resolved target leaves rootReal.
        const escapeRel = relative(rootReal, resolved);
        if (escapeRel.startsWith("..") || resolve(escapeRel) === resolved) {
          // resolve(absolute) === absolute → target is absolute outside root
          if (escapeRel.startsWith("..")) continue;
        }
        if (visited.has(resolved)) continue;
        visited.add(resolved);
        try {
          const st = statSync(resolved);
          isDirChild = st.isDirectory();
          isFileChild = st.isFile();
        } catch {
          continue;
        }
      }

      if (isDirChild) {
        walk(absChild, depth + 1);
        continue;
      }
      if (!isFileChild) continue;

      // Extension filter.
      const ext = extname(absChild).toLowerCase();
      if (!exts.includes(ext)) continue;

      // Include filter (if any): file must match at least one include pattern.
      if (includes.length > 0 && !matchesAny(relPosix, includes)) continue;

      totalSeen++;
      if (out.length >= maxFiles) {
        capped = true;
        return;
      }
      out.push(absChild);
    }
  }

  walk(rootReal, 0);
  return { files: out, capped, totalSeen };
}
