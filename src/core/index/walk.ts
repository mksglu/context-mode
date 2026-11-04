// impl/05 §1, Assumption A1 (no count cap), TECH-SPEC GP5 (nested .gitignore, negation, "**" zero dirs),
// GP7 #1294 (symlink containment by the shared isInside, never a string prefix), impl/00 rule 4 (no regex),
// DEVIATIONS D-M2-T6-2.
import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import type { Dirent } from "node:fs";
import { join } from "node:path";
import { CtxError } from "../contracts/errors.ts";
import { isInside } from "../project/contain.ts";

export interface WalkFile { absPath: string; relPath: string; }

interface Rule {
  base: string[];     // segments of the directory holding the .gitignore, relative to the walk root
  parts: string[];    // pattern segments
  negate: boolean;
  dirOnly: boolean;
  anchored: boolean;  // leading "/": matches from `base` only; otherwise at any depth below `base`
}

interface Found { dir: string[]; name: string; absPath: string; }

const GITIGNORE = ".gitignore";
const GIT_DIR = ".git";

export function walkDir(root: string, containmentRoot: string): WalkFile[] {
  const real = realpathSync(root);
  if (!isInside(containmentRoot, real)) throw new CtxError("OUTSIDE_ROOT", { p: root, root: containmentRoot });
  const found: Found[] = [];
  visit(real, [], [], containmentRoot, new Set([real]), found);
  found.sort(compareFound);
  return found.map((f) => ({ absPath: f.absPath, relPath: join(...f.dir, f.name) }));
}

function visit(abs: string, rel: string[], parent: Rule[], contain: string, seen: Set<string>, found: Found[]): void {
  let entries: Dirent[];
  try {
    entries = readdirSync(abs, { withFileTypes: true });
  } catch {
    return; // unreadable subdirectory: skipped (impl/05 §1 errors)
  }
  const rules = entries.some((e) => e.name === GITIGNORE && e.isFile())
    ? parent.concat(readRules(join(abs, GITIGNORE), rel))
    : parent;
  for (const e of entries) {
    if (e.name === GIT_DIR) continue;
    const path = join(abs, e.name);
    let isDir = e.isDirectory();
    let isFile = e.isFile();
    let target = path;
    if (e.isSymbolicLink()) {
      let resolved: string;
      try {
        resolved = realpathSync(path);
      } catch {
        continue; // dangling link
      }
      if (!isInside(contain, resolved)) continue;
      const st = statSync(resolved);
      isDir = st.isDirectory();
      isFile = st.isFile();
      target = resolved;
    }
    const segs = rel.concat(e.name);
    if (ignored(rules, segs, isDir)) continue;
    if (isFile) {
      found.push({ dir: rel, name: e.name, absPath: path });
    } else if (isDir) {
      const key = e.isSymbolicLink() ? target : realpathSync(path);
      if (seen.has(key)) continue; // a link back to a directory already on this walk
      seen.add(key);
      visit(path, segs, rules, contain, seen, found);
    }
  }
}

// Directory segments first (segment by segment), then file name; plain code-unit order.
function compareFound(a: Found, b: Found): number {
  const n = Math.min(a.dir.length, b.dir.length);
  for (let i = 0; i < n; i += 1) {
    if (a.dir[i] !== b.dir[i]) return a.dir[i] < b.dir[i] ? -1 : 1;
  }
  if (a.dir.length !== b.dir.length) return a.dir.length - b.dir.length;
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

function readRules(file: string, base: string[]): Rule[] {
  let body: string;
  try {
    body = readFileSync(file, "utf8");
  } catch {
    return [];
  }
  const out: Rule[] = [];
  for (const raw of body.split("\n")) {
    const rule = parseRule(raw, base);
    if (rule !== undefined) out.push(rule);
  }
  return out;
}

function parseRule(raw: string, base: string[]): Rule | undefined {
  let line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
  let end = line.length;
  while (end > 0 && line[end - 1] === " " && !(end > 1 && line[end - 2] === "\\")) end -= 1;
  line = line.slice(0, end);
  if (line.length === 0 || line.startsWith("#")) return undefined;
  const negate = line.startsWith("!");
  if (negate) line = line.slice(1);
  else if (line.startsWith("\\#") || line.startsWith("\\!")) line = line.slice(1);
  const dirOnly = line.endsWith("/");
  if (dirOnly) line = line.slice(0, -1);
  const anchored = line.startsWith("/");
  if (anchored) line = line.slice(1);
  const parts = line.split("/").filter((p) => p !== "");
  if (parts.length === 0) return undefined;
  return { base, parts, negate, dirOnly, anchored };
}

// Last matching rule wins. A negation can only re-include an entry whose parent directories were
// walked, which holds by construction: an excluded directory is never entered.
function ignored(rules: Rule[], segs: string[], isDir: boolean): boolean {
  for (let i = rules.length - 1; i >= 0; i -= 1) {
    const r = rules[i];
    if (r.dirOnly && !isDir) continue;
    if (matches(r, segs)) return !r.negate;
  }
  return false;
}

function matches(r: Rule, segs: string[]): boolean {
  if (segs.length <= r.base.length) return false;
  for (let i = 0; i < r.base.length; i += 1) if (segs[i] !== r.base[i]) return false;
  if (r.anchored) return matchSegs(r.parts, 0, segs, r.base.length);
  for (let from = r.base.length; from < segs.length; from += 1) {
    if (matchSegs(r.parts, 0, segs, from)) return true;
  }
  return false;
}

// Whole-path match: every pattern segment against every remaining path segment. "**" takes zero or
// more segments; a trailing "**" takes one or more ("everything inside", so "build/**" leaves the
// directory itself walkable and "!build/keep.txt" can re-include, DEVIATIONS D-M2-R5-1).
function matchSegs(pat: string[], p: number, segs: string[], s: number): boolean {
  if (p === pat.length) return s === segs.length;
  if (pat[p] === "**") {
    const first = p === pat.length - 1 ? s + 1 : s;
    for (let k = first; k <= segs.length; k += 1) if (matchSegs(pat, p + 1, segs, k)) return true;
    return false;
  }
  return s < segs.length && globSeg(pat[p], segs[s]) && matchSegs(pat, p + 1, segs, s + 1);
}

// One segment: "*" = zero or more characters, "?" = one character, "\x" = literal x. Left-to-right
// scan that backtracks to the last "*" on a mismatch.
function globSeg(pat: string, name: string): boolean {
  let p = 0;
  let n = 0;
  let star = -1;
  let mark = 0;
  while (n < name.length) {
    if (p < pat.length && pat[p] === "*") {
      star = p;
      mark = n;
      p += 1;
    } else if (p < pat.length && pat[p] === "\\" && p + 1 < pat.length && pat[p + 1] === name[n]) {
      p += 2;
      n += 1;
    } else if (p < pat.length && pat[p] !== "\\" && (pat[p] === "?" || pat[p] === name[n])) {
      p += 1;
      n += 1;
    } else if (star >= 0) {
      p = star + 1;
      mark += 1;
      n = mark;
    } else {
      return false;
    }
  }
  while (p < pat.length && pat[p] === "*") p += 1;
  return p === pat.length;
}
