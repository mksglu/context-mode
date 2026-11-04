// impl/03 §2, §2a, PRD §9: runtimes are found by PATH lookup, lazily on first use, never at boot.
// No cache (PATH may change between calls), no install-path probing, no where/which spawn.
import { accessSync, constants as fsConstants, statSync } from "node:fs";
import path from "node:path";
import { GIT_BASH_RELATIVE, GIT_BIN, PATHEXT_DEFAULT, WIN_SHELL_LANGS } from "../contracts/constants.ts";
import { CtxError } from "../contracts/errors.ts";
import { pathEntries } from "./path-entries.ts";

const PATHEXT_SEPARATOR = ";";
// DEVIATIONS D-M2-R3-2: the only files Windows CreateProcess starts with shell:false. Node refuses
// .bat/.cmd without a shell (EINVAL), so a PATHEXT hit on them is not a runtime. An extensionless
// file is a `#!/bin/sh` shim (pyenv-win, #1208/#1209); runProcess starts it through sh.exe.
const WIN_STARTABLE_EXT: readonly string[] = Object.freeze([".exe", ".com"]);

// Read per call, not at load: the platform decides the lookup rules of each call.
function isWin(): boolean {
  return process.platform === "win32";
}

/** Step 1: candidate binary names for `lang`, in lookup order. */
function candidates(lang: string): string[] {
  const win = isWin();
  switch (lang) {
    case "shell":
      // D-VT-WINBASH-1: on Windows the shell never comes from a PATH lookup of bash.exe (see findGitBash).
      return win ? [] : ["sh"];
    case "powershell":
      return ["pwsh", "pwsh.exe", "powershell.exe"];
    case "javascript":
    case "typescript":
      return ["node", "node.exe"];
    case "python":
      // D-M2-R3-2: the bare name last, so a pyenv-win `python` shim is found when no .exe is.
      return win ? ["python.exe", "py.exe", "python"] : ["python3", "python"];
    default:
      return win ? [lang, lang + ".exe"] : [lang];
  }
}

/** Step 3: on Windows a name with no extension is tried with each PATHEXT entry, then bare (D-M2-R3-2). */
function fileNames(name: string, pathExt: string[]): string[] {
  if (!isWin() || path.extname(name) !== "") return [name];
  return [...pathExt.map((ext) => name + ext), name];
}

/** Steps 4-5: a regular file; on POSIX it must carry the exec bit, on Windows it must be startable. */
function isRunnable(full: string): boolean {
  const st = statSync(full, { throwIfNoEntry: false });
  if (st === undefined || !st.isFile()) return false;
  if (isWin()) {
    const ext = path.extname(full).toLowerCase();
    return ext === "" || WIN_STARTABLE_EXT.includes(ext);
  }
  try {
    accessSync(full, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Absolute interpreter path for `lang`, or null when no PATH directory has one. Re-walks PATH every call.
 * `env` is the env the child will get (default: this process); its PATH and PATHEXT drive the walk.
 * DEVIATIONS D-M7-W2-1: on Windows a startable PATHEXT hit (.exe/.com) anywhere in the walk wins over an
 * extensionless shim; the first shim seen is returned only when the whole walk finds no such hit.
 */
export function findRuntime(lang: string, env: NodeJS.ProcessEnv = process.env): string | null {
  if (isWin() && WIN_SHELL_LANGS.includes(lang)) return findGitBash(env);
  // W-CODEX-6: a Windows PATH entry may be wrapped in double quotes; the shared helper cuts them off.
  const dirs = pathEntries(env.PATH ?? "", process.platform, path.delimiter);
  const pathExt = isWin()
    ? (env.PATHEXT ?? PATHEXT_DEFAULT).split(PATHEXT_SEPARATOR).filter((e) => e !== "")
    : [];
  const names = candidates(lang);
  let shim: string | null = null;
  for (const dir of dirs) {
    for (const name of names) {
      for (const file of fileNames(name, pathExt)) {
        const full = path.join(dir, file);
        if (!isRunnable(full)) continue;
        if (!isWin() || path.extname(full) !== "") return full;
        if (shim === null) shim = full;
      }
    }
  }
  return shim;
}

/**
 * DEVIATIONS D-VT-WINBASH-1: on Windows the shell is Git Bash, found from the installed Git, never from a
 * bash.exe on PATH. %LOCALAPPDATA%\\Microsoft\\WindowsApps\\bash.exe is an App Execution Alias (node cannot
 * spawn it: EACCES) and C:\\Windows\\System32\\bash.exe is the WSL launcher (a different filesystem).
 * Git for Windows installs <root>\\cmd\\git.exe, <root>\\bin\\git.exe, <root>\\mingw64\\bin\\git.exe and
 * <root>\\bin\\bash.exe (git-for-windows/build-extra installer layout; the installer puts <root>\\cmd on PATH).
 * So the git.exe found on PATH names the root: the first of GIT_BASH_RELATIVE (../bin/bash.exe, then
 * ../../bin/bash.exe, from the dir of git.exe) that is a file wins. No Git, or Git without bash.exe: null.
 */
function findGitBash(env: NodeJS.ProcessEnv): string | null {
  const git = findRuntime(GIT_BIN, env);
  if (git === null) return null;
  for (const rel of GIT_BASH_RELATIVE) {
    const full = path.resolve(path.dirname(git), ...rel);
    if (isRunnable(full)) return full;
  }
  return null;
}

/** The error a null from findRuntime(lang) becomes: Windows shell languages name the Git for Windows fix. */
export function noRuntimeError(lang: string): CtxError {
  return isWin() && WIN_SHELL_LANGS.includes(lang) ? new CtxError("NO_GIT_BASH") : new CtxError("NO_RUNTIME", { lang });
}
