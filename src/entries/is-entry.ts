import { realpathSync } from "node:fs";

// D-HNE-CLI-ENTRY-1: import.meta.main exists from Node 24.2. On Node 22 it is undefined and the CLI ran nothing (exit 0,
// no output). Without it, the process is the entry when argv[1] and this file are the same real file (npm bin link too).
export function isEntry(main: boolean | undefined, argv1: string | undefined, self: string): boolean {
  if (main !== undefined) return main;
  if (argv1 === undefined || argv1 === "") return false;
  try {
    return realpathSync(argv1) === realpathSync(self);
  } catch {
    return false;
  }
}
