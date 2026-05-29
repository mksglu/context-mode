import { lstatSync, mkdirSync, writeFileSync, realpathSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";

/**
 * Thrown when a project-config write would follow a symlink whose real target
 * escapes the project root. The cli setup/upgrade flow recognizes this via
 * `isSymlinkEscapeError` and downgrades it to a warn-and-skip, so one symlinked
 * adapter path doesn't abort the whole run. Any other write failure stays fatal.
 */
export class SymlinkEscapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SymlinkEscapeError";
  }
}

/** True for a `SymlinkEscapeError` regardless of which bundle constructed it. */
export function isSymlinkEscapeError(err: unknown): boolean {
  return (
    err instanceof SymlinkEscapeError ||
    (err instanceof Error && err.name === "SymlinkEscapeError")
  );
}

/**
 * Returns true if `target` is a symlink whose real path resolves outside
 * `root`. A non-symlink or a not-yet-existing path returns false (nothing to
 * follow, so the write is safe). A symlink we can't resolve (dangling) returns
 * true: we can't prove it stays in-tree, so we refuse it.
 *
 * We allow an in-root symlink because following it can only land inside the
 * project, where the config was headed anyway. An escaping symlink is the real
 * threat (a planted `.cursor/hooks.json -> ~/.bashrc` would clobber an arbitrary
 * file), so it's the only case we reject.
 */
export function symlinkEscapesRoot(target: string, root: string): boolean {
  let st;
  try {
    st = lstatSync(target);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw err;
  }
  if (!st.isSymbolicLink()) return false;
  const rootResolved = resolve(root);
  let real;
  try {
    real = realpathSync(target);
  } catch {
    return true; // dangling or unresolvable, so we can't prove containment
  }
  return real !== rootResolved && !(real + sep).startsWith(rootResolved + sep);
}

/**
 * Write a project-local config file without following a symlink that would
 * redirect the write out of the project.
 *
 * Several adapters write config at a cwd-relative path (e.g. `.cursor/hooks.json`,
 * `opencode.json`). A cloned/malicious repo can plant a symlink at that path,
 * either the final component or the directory we write into (e.g.
 * `.cursor -> /tmp/evil`), so a plain `writeFileSync` (flag "w" follows symlinks)
 * would truncate an arbitrary file such as `~/.bashrc`. We lstat both
 * attacker-controllable, project-local components (the immediate parent dir and
 * the final file) and refuse any whose real target escapes `projectRoot`. A
 * symlink that stays inside the project is followed normally, since a dotfile
 * manager or an intra-repo layout legitimately points config there.
 *
 * Only the immediate parent is checked here, not arbitrary ancestors; a caller
 * writing more than one level deep (Copilot's `.github/hooks`) guards the extra
 * ancestor itself. The lstat-then-write window is a same-uid TOCTOU (accepted
 * class); the goal is to stop a pre-planted on-disk symlink, not a racing local
 * attacker.
 */
export function writeProjectConfigSafely(
  filePath: string,
  content: string,
  projectRoot: string = process.cwd(),
): void {
  const abs = resolve(filePath);
  const dir = dirname(abs);

  // Check the parent dir before mkdir, so an escaping dir-symlink can't make us
  // create directories through the link as a side effect before we bail.
  if (symlinkEscapesRoot(dir, projectRoot)) {
    throw new SymlinkEscapeError(
      `context-mode: refusing to write ${filePath}: its directory is a symlink escaping the project`,
    );
  }
  mkdirSync(dir, { recursive: true });

  if (symlinkEscapesRoot(abs, projectRoot)) {
    throw new SymlinkEscapeError(
      `context-mode: refusing to write ${filePath}: target is a symlink escaping the project`,
    );
  }

  writeFileSync(abs, content, "utf-8");
}
