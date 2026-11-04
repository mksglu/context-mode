// Shared test helpers (ADR-0024). One copy of each; test files import from here.
// Rule: add a helper here only when two or more area files need the same body.
import { rmSync } from "node:fs";

// Remove a temp dir. On Windows a just-closed handle can make rmSync fail with EPERM; that one case is ignored.
export function rmTemp(dir) {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
  } catch (err) {
    if (process.platform !== "win32" || err.code !== "EPERM") throw err;
  }
}

// True while a process with this pid exists.
export function alive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}
