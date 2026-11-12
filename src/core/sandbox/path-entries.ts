// src/core/sandbox/path-entries.ts: the directories of a PATH value and the env reader for PATH/PATHEXT, shared by findRuntime,
// the doctor and setup (spawn-bin.ts). No imports, so a release script can load it alone.

/** The directories of a PATH value. On Windows an entry may be wrapped in one pair of double quotes (cmd.exe accepts
 *  it, and `path.join` would keep the quotes), so one surrounding pair is cut off with slice; an entry that is empty
 *  after that is dropped. An unpaired quote stays as is. POSIX entries are used as they are. `delimiter` defaults to
 *  the platform's (";" on win32, ":" elsewhere). */
export function pathEntries(value: string, platform: NodeJS.Platform = process.platform, delimiter: string = platform === "win32" ? ";" : ":"): string[] {
  const win = platform === "win32";
  return value.split(delimiter).map((e) => (win && e.length >= 2 && e.startsWith('"') && e.endsWith('"') ? e.slice(1, -1) : e)).filter(Boolean);
}

/** The value of env var `name`. Windows env names ignore case, but a Bun host's process.env does not (#1371: OpenCode 2
 *  runs plugins under Bun, and a process started from PowerShell or cmd spells it `Path`). So on win32 the exact key wins,
 *  then the first key equal to `name` without case. POSIX names keep their case: the exact key only. */
export function envValue(env: Readonly<Record<string, string | undefined>>, name: string, platform: NodeJS.Platform = process.platform): string | undefined {
  const exact = env[name];
  if (exact !== undefined || platform !== "win32") return exact;
  const upper = name.toUpperCase();
  const key = Object.keys(env).find((k) => k.toUpperCase() === upper);
  return key === undefined ? undefined : env[key];
}
