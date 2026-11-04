// impl/07 §6 step 4c-4d: swap of <DATA_ROOT>/plugins/<agent>/current to a new <sha> dir; keep exactly one
// rollback generation (PLUGIN_ROLLBACK_GENERATIONS), delete the generation two back. DEVIATIONS D-M5-U1-6, D-M5-U4-1,
// D-M7-W3-1 (Windows cannot rename a link over a dir link: move `current` aside, then move `current.swap` in).
import { existsSync, lstatSync, readdirSync, readlinkSync, rmSync, symlinkSync, unlinkSync } from "node:fs";
import { basename, join, win32 } from "node:path";
import {
  PLUGIN_CURRENT_LINK, PLUGIN_LINK_OLD_SUFFIX, PLUGIN_LINK_TMP_SUFFIX, PLUGIN_LINK_TYPE, PLUGIN_LINK_TYPE_WIN32, UPGRADE_FETCH_DIR_PREFIX,
  UPGRADE_TRASH_SUFFIX,
} from "../contracts/constants.ts";
import { CtxError } from "../contracts/errors.ts";
import { renameWithRetry, type AtomicOptions } from "./atomic-file.ts";

export interface PluginSwapResult {
  current: string; // absolute <agentDir>/<sha> that `current` now points at
  previous: string | null; // the kept rollback generation (the dir `current` pointed at before), null on first install or no-op
  removed: string[]; // version dirs deleted (the generation two back), sorted
}

export interface PluginSwapOptions extends AtomicOptions {
  symlink?: (target: string, path: string, type: "dir" | "junction") => void; // a test fakes the OS link call
}

// The sha a link points at. POSIX writes a bare <sha>; a Windows junction holds an absolute path that readlink may
// return with a trailing separator or a \\?\ prefix, so the last path part is the sha. null when no link exists.
function linkTarget(path: string, win: boolean): string | null {
  if (!isLink(path)) return null;
  const target = readlinkSync(path);
  return win ? win32.basename(target) : target;
}

function isLink(path: string): boolean {
  return lstatSync(path, { throwIfNoEntry: false })?.isSymbolicLink() === true;
}

// A generation is a real dir in agentDir. Not a generation: the `current` link, a stale `current.swap` or
// `current.old` link, an in-flight `.fetch-<pid>` dir, or a path ctx_upgrade has moved aside for its own rollback.
function generations(agentDir: string): string[] {
  return readdirSync(agentDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((name) => !name.startsWith(UPGRADE_FETCH_DIR_PREFIX) && !name.endsWith(UPGRADE_TRASH_SUFFIX))
    .sort();
}

// A run that stopped between the two renames left `current.old` and no `current`: put the old link back, so the
// state is the one before that run. A stale `current.swap` or `current.old` next to a live `current` is removed.
function settleLinks(link: string, tmp: string, old: string, opts: PluginSwapOptions): void {
  if (isLink(tmp)) unlinkSync(tmp);
  if (!isLink(old)) return;
  if (isLink(link)) unlinkSync(old);
  else renameWithRetry(old, link, opts);
}

/**
 * Points `<agentDir>/current` at `<agentDir>/<sha>`: writes `current.swap` -> <sha>, renames `current` to
 * `current.old`, renames `current.swap` to `current`, deletes `current.old`. The same steps on every OS: Windows
 * cannot rename a link over an existing dir link (EPERM). Between the two renames `current` is missing for one
 * rename call; a stop there is undone by the next call. Then keeps <sha> and the dir `current` pointed at before,
 * and deletes every other version dir. Swapping to the sha already current changes nothing.
 * Rollback is the same call with the previous sha. DEVIATIONS D-WIN-JUNCTION-1: on win32 the link is a junction with
 * an absolute target (no privilege needed); elsewhere a `dir` symlink with the bare <sha>. DEVIATIONS D-WIN-ATOMIC-2: both renames retry a Windows
 * "file in use" error (EPERM/EBUSY/EACCES); `opts` lets a test fake the platform and the rename.
 */
export function swapPluginCurrent(agentDir: string, sha: string, opts: PluginSwapOptions = {}): PluginSwapResult {
  const next = join(agentDir, sha);
  if (!existsSync(next) || !lstatSync(next).isDirectory()) {
    throw new CtxError("PLUGIN_ROOT_MISSING", { agent: basename(agentDir), path: next });
  }
  const link = join(agentDir, PLUGIN_CURRENT_LINK);
  const tmp = link + PLUGIN_LINK_TMP_SUFFIX;
  const old = link + PLUGIN_LINK_OLD_SUFFIX;
  settleLinks(link, tmp, old, opts);
  const win = (opts.platform ?? process.platform) === "win32";
  const before = linkTarget(link, win);
  if (before === sha) return { current: next, previous: null, removed: [] };

  const symlink = opts.symlink ?? symlinkSync;
  if (win) symlink(next, tmp, PLUGIN_LINK_TYPE_WIN32);
  else symlink(sha, tmp, PLUGIN_LINK_TYPE);
  if (before !== null) renameWithRetry(link, old, opts);
  renameWithRetry(tmp, link, opts);
  if (before !== null) unlinkSync(old);

  const keep = new Set<string>([sha]);
  if (before !== null) keep.add(before);
  const removed = generations(agentDir)
    .filter((name) => !keep.has(name))
    .map((name) => join(agentDir, name));
  for (const dir of removed) rmSync(dir, { recursive: true, force: true });

  const previous = before !== null && existsSync(join(agentDir, before)) ? join(agentDir, before) : null;
  return { current: next, previous, removed };
}
