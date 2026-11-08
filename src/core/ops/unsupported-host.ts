// src/core/ops/unsupported-host.ts: D-UNSUPPORTED-HOSTS-1. Which known unsupported host (constants.UNSUPPORTED_HOSTS) runs the server.
import { AGENT_IDS } from "../contracts/agents.ts";
import { SUPPORTED_AGENTS_DOCS_URL, UNSUPPORTED_HOSTS, V1_PATH_SEPS, type UnsupportedHost } from "../contracts/constants.ts";

/** The supported agents, linked to the install docs: the tail of every "not supported" and "unknown agent" line. */
export const SUPPORTED_AGENTS_LINE = `Supported agents: ${AGENT_IDS.join(", ")} (${SUPPORTED_AGENTS_DOCS_URL}).`;
/** D-UNSUPPORTED-HOSTS-1: the one positive line for a known unsupported host. */
export function UNSUPPORTED_HOST_LINE(name: string): string { return `${name} is not a supported host today. The MCP server runs here; hooks are not checked. ${SUPPORTED_AGENTS_LINE}`; }
export function UNSUPPORTED_SETUP_LINE(name: string): string { return `${name} is not a supported host today. Setup writes nothing for it. ${SUPPORTED_AGENTS_LINE}`; }

export interface HostSignals { clientName?: string; bundleDir?: string; env?: NodeJS.ProcessEnv; }

function segmentsOf(dir: string): string[] {
  let parts = [dir];
  for (const sep of V1_PATH_SEPS) parts = parts.flatMap((p) => p.split(sep));
  return parts;
}

function hasRun(parts: readonly string[], run: readonly string[]): boolean {
  for (let i = 0; i + run.length <= parts.length; i++) if (run.every((seg, k) => parts[i + k] === seg)) return true;
  return false;
}

/** The unsupported host that runs this server, or undefined. A clientInfo.name that names a supported or unlisted client wins over env vars
 *  (Claude Code in a Cursor terminal inherits CURSOR_TRACE_ID and is still Claude Code). */
export function unsupportedHostOf(sig: HostSignals): UnsupportedHost | undefined {
  if (sig.clientName !== undefined && sig.clientName !== "") {
    const n = sig.clientName.toLowerCase();
    const hit = UNSUPPORTED_HOSTS.find((h) => h.clientNames.includes(n));
    if (hit !== undefined) return hit;
  }
  if (sig.bundleDir !== undefined) {
    const parts = segmentsOf(sig.bundleDir);
    const hit = UNSUPPORTED_HOSTS.find((h) => h.pluginPaths.some((p) => hasRun(parts, p)));
    if (hit !== undefined) return hit;
  }
  if (sig.clientName !== undefined && sig.clientName !== "") return undefined;
  const env = sig.env;
  if (env === undefined) return undefined;
  return UNSUPPORTED_HOSTS.find((h) => h.envVars.some((v) => env[v] !== undefined && env[v] !== ""));
}

/** A name typed after setup --agents / --print: the host id, a client name or a binary. */
export function unsupportedHostByName(name: string): UnsupportedHost | undefined {
  const n = name.toLowerCase();
  return UNSUPPORTED_HOSTS.find((h) => h.id === n || h.clientNames.includes(n) || h.binaries.includes(n));
}
