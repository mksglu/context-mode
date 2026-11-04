// src/core/sandbox/path-entries.ts: the directories of a PATH value, shared by findRuntime and by setup (spawn-bin.ts).
// No imports, so a release script can load it alone.

/** The directories of a PATH value. On Windows an entry may be wrapped in one pair of double quotes (cmd.exe accepts
 *  it, and `path.join` would keep the quotes), so one surrounding pair is cut off with slice; an entry that is empty
 *  after that is dropped. An unpaired quote stays as is. POSIX entries are used as they are. `delimiter` defaults to
 *  the platform's (";" on win32, ":" elsewhere). */
export function pathEntries(value: string, platform: NodeJS.Platform = process.platform, delimiter: string = platform === "win32" ? ";" : ":"): string[] {
  const win = platform === "win32";
  return value.split(delimiter).map((e) => (win && e.length >= 2 && e.startsWith('"') && e.endsWith('"') ? e.slice(1, -1) : e)).filter(Boolean);
}
