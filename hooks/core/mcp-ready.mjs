/**
 * MCP readiness sentinel — checks if MCP server has started.
 *
 * Server writes sentinel (containing its PID) after connect().
 * Hooks scan for any live sentinel to detect MCP readiness.
 *
 * Fix for #347: Claude Code spawns hooks via `bash -c "node ..."` on Linux/WSL2.
 * The intermediate shell makes process.ppid point to a transient bash PID, not
 * Claude Code. Directory-scan + PID liveness probe works regardless of spawn topology.
 *
 * Sentinel path: <tmpRoot>/context-mode-mcp-ready-<MCP_PID>
 * Scan: glob all context-mode-mcp-ready-* files, probe each PID.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SENTINEL_PREFIX = "context-mode-mcp-ready-";

/**
 * Sentinel freshness window (#844). The MCP server refreshes its sentinel's
 * mtime every 30s while alive (see `main()` in src/server.ts). A sentinel
 * touched within this window is treated as a live server even when
 * `process.kill(pid, 0)` cannot see the PID — e.g. a sandbox sharing /tmp
 * across an isolated PID namespace, where the live host PID is invisible.
 * 90s = 3x the server refresh interval, tolerant of scheduler jitter / load.
 */
const SENTINEL_FRESH_MS = 90_000;

/**
 * Resolve the temp root — hardcoded /tmp on Unix to avoid TMPDIR mismatch.
 * Tests may override via CONTEXT_MODE_MCP_SENTINEL_DIR to isolate scan from
 * leftover sentinels in the real /tmp.
 */
export function sentinelDir() {
  const override = process.env.CONTEXT_MODE_MCP_SENTINEL_DIR;
  if (override && override.length > 0) return override;
  return process.platform === "win32" ? tmpdir() : "/tmp";
}

/**
 * Build sentinel path for a given PID.
 * Used by server.ts to write its own sentinel.
 */
export function sentinelPathForPid(pid) {
  return join(sentinelDir(), `${SENTINEL_PREFIX}${pid}`);
}

/**
 * @deprecated Use sentinelPathForPid(process.pid) from server.ts.
 * Kept for backward compat during migration — tests that still
 * write sentinels with process.ppid will work for one release cycle.
 */
export function sentinelPath() {
  return join(sentinelDir(), `${SENTINEL_PREFIX}${process.ppid}`);
}

/**
 * PIDs of this process's ancestors, nearest first (#1055). One `ps` call
 * builds a pid→ppid table; the walk stops at init. Returns null when the
 * table cannot be built (Windows, ps missing, timeout) so the caller can fall
 * back to the machine-wide answer instead of guessing.
 */
function ownAncestorPids() {
  if (process.platform === "win32") return null;
  try {
    const out = execFileSync("ps", ["-A", "-o", "pid=,ppid="], {
      encoding: "utf8",
      timeout: 2000,
      stdio: ["ignore", "pipe", "ignore"],
    });
    const parentOf = new Map();
    for (const line of out.split("\n")) {
      const [pid, ppid] = line.trim().split(/\s+/).map((n) => parseInt(n, 10));
      if (!isNaN(pid) && !isNaN(ppid)) parentOf.set(pid, ppid);
    }
    const ancestors = new Set();
    let pid = process.pid;
    for (let i = 0; i < 64; i++) {
      const ppid = parentOf.get(pid);
      if (!ppid || ppid <= 1 || ancestors.has(ppid)) break;
      ancestors.add(ppid);
      pid = ppid;
    }
    return ancestors;
  } catch {
    return null;
  }
}

/**
 * Check if any MCP server is alive by scanning sentinel files.
 *
 * Scans sentinelDir() for context-mode-mcp-ready-* files, reads the PID
 * from each, and probes with kill(pid, 0). Cleans up stale sentinels
 * from crashed servers.
 *
 * Handles:
 * - PPID mismatch (WSL2 shell wrappers) — no ppid dependency
 * - Stale sentinels (SIGKILL, OOM) — PID liveness check + age threshold
 * - TMPDIR mismatch — hardcoded /tmp on Unix
 * - Shared /tmp across isolated PID namespaces (#844) — a live host PID is
 *   invisible to `kill(pid, 0)` from a sandbox, so a recently-refreshed
 *   sentinel is trusted instead of being deleted.
 *
 * `sessionScoped` (#1055): MCP tools are registered per session, so a live
 * server from a sibling session must not count. The server writes its host
 * PID (the MCP client that launched it) on the sentinel's second line. When
 * scoped, a live sentinel counts only if that host is one of this hook's
 * ancestors. Sentinels without a host line (older servers) and hosts we
 * cannot build an ancestor table for keep the machine-wide answer.
 */
export function isMCPReady({ sessionScoped = false } = {}) {
  try {
    const dir = sentinelDir();
    const files = readdirSync(dir).filter(f => f.startsWith(SENTINEL_PREFIX));
    const now = Date.now();
    let ancestors; // lazily built, only when a scoped check needs it
    for (const f of files) {
      const fullPath = join(dir, f);
      let pid;
      let hostPid;
      try {
        const [pidLine, hostLine] = readFileSync(fullPath, "utf8").split("\n");
        pid = parseInt(pidLine, 10);
        hostPid = parseInt(hostLine, 10);
      } catch {
        // Unreadable (torn mid-write) — leave it for the owner / a later scan.
        continue;
      }
      if (isNaN(pid)) continue;
      try {
        process.kill(pid, 0); // throws if the PID is not signalable from here
      } catch (err) {
        // EPERM: the process exists but is owned by another user → alive.
        if (err && err.code === "EPERM") return true;
        // ESRCH (or anything else): the PID is invisible from THIS namespace.
        // That is NOT proof the server is dead — a shared /tmp across isolated
        // PID namespaces (#844) hides a live host PID. Trust a recently
        // refreshed sentinel rather than delete a live server's marker.
        let ageMs = Infinity;
        try { ageMs = now - statSync(fullPath).mtimeMs; } catch { /* stat failed → treat as stale */ }
        if (ageMs < SENTINEL_FRESH_MS) return true;
        // Old AND unprobeable → genuinely stale (crash / OOM / SIGKILL) → clean up.
        try { unlinkSync(fullPath); } catch { /* best effort */ }
        continue;
      }
      // Same-namespace liveness confirmed.
      if (!sessionScoped || isNaN(hostPid)) return true;
      if (ancestors === undefined) ancestors = ownAncestorPids();
      if (ancestors === null || ancestors.has(hostPid)) return true;
      // A sibling session's server: keep scanning (and cleaning).
    }
    return false;
  } catch {
    return false;
  }
}
