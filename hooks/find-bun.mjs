// Resolve a bun binary from the known install locations and $PATH.
// Raw JS (not runtime.ts) so start.mjs can use it before build/ exists.
// Pure/injectable for tests.
import { join } from "node:path";
import { existsSync as realExistsSync } from "node:fs";
import { homedir as realHomedir } from "node:os";

export function findBun({
  env = process.env,
  platform = process.platform,
  home = realHomedir(),
  existsSync = realExistsSync,
} = {}) {
  const exe = platform === "win32" ? "bun.exe" : "bun";
  const delimiter = platform === "win32" ? ";" : ":";
  const candidates = [
    env.BUN_INSTALL ? join(env.BUN_INSTALL, "bin", exe) : null,
    home ? join(home, ".bun", "bin", exe) : null,
    join("/usr/local/bin", exe),
    join("/usr/bin", exe),
    ...(env.PATH || "").split(delimiter).filter(Boolean).map((dir) => join(dir, exe)),
  ];
  return candidates.find((p) => p && existsSync(p)) || null;
}
