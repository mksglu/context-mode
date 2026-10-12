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

/** Match the supported glob grammar structurally, without regex. */
function matchesGlob(value: string, pattern: string): boolean {
  // Preserve the legacy matcher's UTF-16 code-unit meaning of ?.
  const chars = value.split("");
  const glob = pattern.split("");
  let previous = new Uint8Array(chars.length + 1);
  previous[0] = 1;
  for (let i = 0; i < glob.length; i++) {
    const token = glob[i];
    const next = new Uint8Array(chars.length + 1);
    if (token === "*") {
      const globstar = glob[i + 1] === "*";
      const directories = globstar && glob[i + 2] === "/";
      if (globstar) i += directories ? 2 : 1;
      next[0] = previous[0];
      let earlierMatch = previous[0] === 1;
      for (let j = 1; j <= chars.length; j++) {
        if (directories) {
          // **/ consumes nothing, or any prefix ending at a separator.
          next[j] = previous[j] || (earlierMatch && chars[j - 1] === "/" ? 1 : 0);
          earlierMatch ||= previous[j] === 1;
        } else {
          next[j] = previous[j] || (next[j - 1] && (globstar || chars[j - 1] !== "/") ? 1 : 0);
        }
      }
    } else {
      for (let j = 1; j <= chars.length; j++) {
        const matches = token === "?" ? chars[j - 1] !== "/" : token === chars[j - 1];
        next[j] = previous[j - 1] && matches ? 1 : 0;
      }
    }
    previous = next;
  }
  return previous[chars.length] === 1;
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
    if (matchesGlob(relPosix, p)) return true;
    if (matchesGlob(basename, p)) return true;
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
