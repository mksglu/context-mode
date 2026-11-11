// impl/02 §3, TECH-SPEC GP7 "path containment by components" (A61, #954, #1294), DEVIATIONS D-M1-T3-4.
// One shared containment predicate for every tool. Never a string-prefix check.
// D-CI-PERF-3: node:fs through getBuiltinModule; a static ESM import of node:fs also loads fs/promises, readline and streams.
const { lstatSync, realpathSync } = process.getBuiltinModule("node:fs") as typeof import("node:fs");
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

// D-M1-T3-4: a path that cannot be realpath'd (missing, no access) cannot be proven inside: false.
function real(p: string): string | undefined {
  try {
    // .native: the OS realpath also folds letter case on case-insensitive volumes (macOS, Windows),
    // so "/Repo" and "/repo" compare as the same components (review-M1 #1).
    return realpathSync.native(p);
  } catch {
    return undefined;
  }
}

function components(p: string): string[] {
  return p.split(sep).filter((c) => c !== "");
}

/** True only if realpath(p) has every component of realpath(root), in order, at the same index. */
export function isInside(root: string, p: string): boolean {
  const r = real(root);
  const q = real(p);
  if (r === undefined || q === undefined) return false;
  const rc = components(r);
  const qc = components(q);
  if (qc.length < rc.length) return false;
  for (let i = 0; i < rc.length; i += 1) {
    if (rc[i] !== qc[i]) return false;
  }
  return true;
}

// D-R48-OWN-FILE-1 (#1326): the realpath of a fixed dir (project root, agent config dir) is asked on every Read the
// hooks check; only a found realpath is kept, so a dir made later is still seen.
const rootReal = new Map<string, string>();
function realRoot(root: string): string | undefined {
  const hit = rootReal.get(root);
  if (hit !== undefined) return hit;
  const r = real(root);
  if (r !== undefined) rootReal.set(root, r);
  return r;
}

/** isInside for several fixed roots: one realpath of `p`, the roots' realpaths kept. True when any root holds `p`. */
export function isInsideAny(roots: readonly string[], p: string): boolean {
  if (roots.length === 0) return false;
  const q = real(p);
  if (q === undefined) return false;
  const qc = components(q);
  return roots.some((root) => {
    const r = realRoot(root);
    if (r === undefined) return false;
    const rc = components(r);
    return qc.length >= rc.length && rc.every((c, i) => c === qc[i]);
  });
}

/** D-R54-OWN-FILE-LINK-1 (#1345): true when `p` as the tool gave it, or `cwd` when `p` is relative, has a ".."
 *  component. path.resolve folds ".." by text, but the OS folds it after a link, so such a path is not "as written". */
export function hasParentStep(cwd: string, p: string): boolean {
  const parts = isAbsolute(p) ? components(p) : [...components(cwd), ...components(p)];
  return parts.includes("..");
}

/** D-R54-OWN-FILE-LINK-1 (#1345): true when the path as written (path.resolve, no realpath) has every component of a
 *  root, in order. A link the user made under the root counts. The caller passes a path with no ".." step
 *  (hasParentStep on the raw tool path, before resolve); a ".." left in `p` still gives false.
 *  This grants no access: use it only for "is this the agent's own file" (own-file.ts), never for containment. */
// The roots are fixed dirs (agent config dir, shared skill dir): their resolved components are kept, the same way
// rootReal keeps their realpaths, so a project-file Read pays only the walk of `p` (review r54 perf finding).
const rootParts = new Map<string, string[]>();
function lexicalRoot(root: string): string[] {
  let rc = rootParts.get(root);
  if (rc === undefined) {
    rc = components(resolve(root));
    rootParts.set(root, rc);
  }
  return rc;
}

export function isLexicallyInsideAny(roots: readonly string[], p: string): boolean {
  if (roots.length === 0) return false;
  const raw = components(p);
  if (raw.includes("..")) return false;
  // An absolute POSIX path needs no path.resolve: only "." steps are left to drop. Windows paths go through resolve.
  const qc = sep === "/" && isAbsolute(p) ? raw.filter((c) => c !== ".") : components(resolve(p));
  return roots.some((root) => {
    const rc = lexicalRoot(root);
    return qc.length >= rc.length && rc.every((c, i) => c === qc[i]);
  });
}

/**
 * D-M2-R7-1 (#954): the deepest dir that holds every path, by realpath components.
 * A path that cannot be realpath'd holds no files and is left out.
 */
export function commonRoot(paths: string[]): string {
  const reals = paths.map(real).filter((r): r is string => r !== undefined);
  if (reals.length === 0) throw new RangeError("commonRoot needs at least one existing path");
  const first = reals[0];
  let n = components(first).length;
  for (const r of reals) {
    const rc = components(r);
    const fc = components(first);
    let i = 0;
    while (i < n && i < rc.length && rc[i] === fc[i]) i += 1;
    n = i;
  }
  let q = first;
  while (components(q).length > n && dirname(q) !== q) q = dirname(q);
  return q;
}

/** D-SEC-V1-LINK-1: true when `p` sits lexically under `root` and some step below `root` on the way to `p` is a
 *  symlink or junction (lstat, so the link itself is seen, never its target). A missing step ends the walk. */
export function reachedThroughLink(root: string, p: string): boolean {
  const rel = relative(root, p);
  const steps = components(rel);
  if (rel === "" || steps[0] === ".." || rel === p) return false;
  let at = root;
  for (const step of steps) {
    at = join(at, step);
    try {
      if (lstatSync(at).isSymbolicLink()) return true;
    } catch {
      return false;
    }
  }
  return false;
}
