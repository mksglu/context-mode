// D-R44-OC-HOSTNODE-1 (#1310): an in-process plugin (OpenCode 2) runs inside a Bun-compiled host, so process.execPath is
// the host binary, not Node. Code that must run `node <file>` (the doctor hook round trip, the background launcher)
// takes a real node from PATH. With no node on PATH the host binary runs as Bun itself (BUN_BE_BUN=1).
import { findRuntime } from "./runtimes.ts";

export interface NodeLaunch { file: string; env: Record<string, string>; }

export const BUN_BE_BUN_ENV = "BUN_BE_BUN";

/** The program and env that run a Node script from this process. Node host: process.execPath, env as given. */
export function nodeLaunch(
  env: Record<string, string>,
  host: { bun: string | undefined; execPath: string } = { bun: process.versions.bun, execPath: process.execPath },
  find: (lang: string, env: NodeJS.ProcessEnv) => string | null = findRuntime,
): NodeLaunch {
  if (host.bun === undefined) return { file: host.execPath, env };
  const node = find("javascript", env);
  if (node !== null) return { file: node, env };
  return { file: host.execPath, env: { ...env, [BUN_BE_BUN_ENV]: "1" } };
}
