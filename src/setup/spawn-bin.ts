// src/setup/spawn-bin.ts: find an agent CLI on PATH and the spawn form that runs it, shared by setup and
// scripts/release/smoke.mjs (D-RN-WIN-1). Its only import besides node: is path-entries.ts, which has none, so a release script can load it alone.
import { spawnSync, type SpawnSyncOptions, type SpawnSyncReturns } from "node:child_process";
import { accessSync, constants as fsc, statSync } from "node:fs";
import path from "node:path";
import { pathEntries } from "../core/sandbox/path-entries.ts";

export { pathEntries };

type Env = Record<string, string | undefined>;
const WIN_EXT = ".COM;.EXE;.BAT;.CMD";
const WIN_SHIM_EXTS: readonly string[] = Object.freeze([".cmd", ".bat"]);
const DEFAULT_COMSPEC = "cmd.exe";

/** Env value by key, matched without case (Windows spells PATH as `Path`, ComSpec as `COMSPEC`). */
function envGet(env: Env, k: string): string | undefined {
  return env[Object.keys(env).find((x) => x.toUpperCase() === k) ?? k];
}

/** PATH lookup the way the host shell does it. On Windows, npm installs an agent CLI as `<bin>.cmd` (next to an
 *  extensionless sh script that cmd.exe cannot run), so only PATHEXT names match there. Env keys are matched without
 *  case, since Windows spells PATH as `Path`. */
export function whichBin(bin: string, env: Env, platform: NodeJS.Platform = process.platform): string | undefined {
  const get = (k: string): string | undefined => envGet(env, k);
  const win = platform === "win32";
  const exts = win ? (get("PATHEXT") || WIN_EXT).split(";").filter(Boolean) : [""];
  const names = win && path.extname(bin) ? [bin] : exts.map((e) => bin + e.toLowerCase());
  for (const dir of pathEntries(get("PATH") ?? "", platform)) {
    for (const n of names) {
      const f = path.join(dir, n);
      try { accessSync(f, fsc.X_OK); if (statSync(f).isFile()) return f; } catch { /* next */ }
    }
  }
  return undefined;
}

const CMD_QUOTE_CHARS = '"&|<>^()!';
const CMD_PERCENT = "%";
const CMD_SUBSTRING_MARK = ":";
/** Variables cmd.exe computes itself; they expand even when the environment has no entry for them. */
const CMD_DYNAMIC_VARS: readonly string[] = Object.freeze(["CD", "DATE", "TIME", "RANDOM", "ERRORLEVEL", "CMDEXTVERSION", "CMDCMDLINE", "HIGHESTNUMANODENUMBER"]);

/** True when cmd.exe needs this argument in quotes: empty, white space, or one of its operator characters. */
function needsCmdQuotes(a: string): boolean {
  if (a === "") return true;
  for (const c of a) if (c.trim() === "" || CMD_QUOTE_CHARS.includes(c)) return true;
  return false;
}

/** The first `%NAME%` (or `%NAME:~a,b%` / `%NAME:x=y%`) in `text` that cmd.exe would expand: NAME is a variable in `env`
 *  (matched without case) or one of cmd's own. A % that names no variable stays as typed in a /c line, so URL escapes
 *  like %20 pass. Every pair of % signs is tried, because cmd.exe may pair them in either way. Char scan, no regex. */
function expandablePercent(text: string, env: Env): string | undefined {
  const names = new Set<string>(CMD_DYNAMIC_VARS);
  for (const k of Object.keys(env)) names.add(k.toUpperCase());
  for (let i = text.indexOf(CMD_PERCENT); i >= 0; i = text.indexOf(CMD_PERCENT, i + 1)) {
    for (let j = text.indexOf(CMD_PERCENT, i + 1); j >= 0; j = text.indexOf(CMD_PERCENT, j + 1)) {
      const inner = text.slice(i + 1, j);
      const cut = inner.indexOf(CMD_SUBSTRING_MARK);
      const name = cut < 0 ? inner : inner.slice(0, cut);
      if (name !== "" && names.has(name.toUpperCase())) return `${CMD_PERCENT}${inner}${CMD_PERCENT}`;
    }
  }
  return undefined;
}

/** cmd.exe line for a .cmd/.bat shim: Node refuses to spawn those without a shell (CVE-2024-27980). Each argument is
 *  quoted, so paths with spaces survive; the outer quotes are the /s form. cmd.exe expands %NAME% even inside quotes and
 *  no quoting stops it, so a %NAME% it would expand throws (D-WIN-CMDPCT-1): a changed value is worse than a refusal. */
export function winCmdLine(file: string, args: string[], env: Env = {}): string {
  for (const a of [file, ...args]) {
    const hit = expandablePercent(a, env);
    if (hit !== undefined) throw new Error(`cannot run ${file} through cmd.exe: cmd.exe expands ${hit} inside quotes, so the value ${JSON.stringify(a)} would change. Use a path and arguments without it`);
  }
  const q = (a: string): string => (needsCmdQuotes(a) ? `"${a.split('"').join('""')}"` : a);
  return `"${[file, ...args].map(q).join(" ")}"`;
}

export interface SpawnForm { command: string; args: string[]; windowsVerbatimArguments: boolean; }

/** How to spawn `file args`. On Windows a .cmd/.bat shim runs through `%ComSpec% /d /v:off /s /c "<line>"` with verbatim
 *  arguments (the documented way since CVE-2024-27980); any other file, and every file elsewhere, runs as is. /v:off
 *  overrides a DelayedExpansion registry setting, so a `!` in a quoted argument stays text (D-WIN-CMDBANG-1). */
export function spawnForm(file: string, args: string[], env: Env, platform: NodeJS.Platform = process.platform): SpawnForm {
  if (platform === "win32" && WIN_SHIM_EXTS.includes(path.extname(file).toLowerCase())) {
    return { command: envGet(env, "COMSPEC") || DEFAULT_COMSPEC, args: ["/d", "/v:off", "/s", "/c", winCmdLine(file, args, env)], windowsVerbatimArguments: true };
  }
  return { command: file, args, windowsVerbatimArguments: false };
}

/** spawnSync of `file args` in the spawn form for the platform. A refused shim line (see winCmdLine) is a failed
 *  result (status null, the reason on stderr and error), never a throw, so every caller reports it as a failed step. */
export function spawnShim(file: string, args: string[], env: Env, opts: SpawnSyncOptions, platform: NodeJS.Platform = process.platform): SpawnSyncReturns<string | Buffer> {
  let f: SpawnForm;
  try { f = spawnForm(file, args, env, platform); } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    return { pid: 0, output: [null, "", error.message], stdout: "", stderr: error.message, status: null, signal: null, error };
  }
  return spawnSync(f.command, f.args, { ...opts, env, windowsVerbatimArguments: f.windowsVerbatimArguments, windowsHide: true });
}
