// D-R47-READ-MEDIA-1 (#1321, #1324): is this Read target a file the host shows as an image or document block?
// D-CI-PERF-3: node:fs through getBuiltinModule; a static ESM import of node:fs also loads fs/promises, readline and streams.
const { closeSync, openSync, readSync } = process.getBuiltinModule("node:fs") as typeof import("node:fs");
import { extname } from "node:path";
import type { AgentId } from "../contracts/agents.ts";
import { READ_MEDIA_BY_AGENT, READ_MEDIA_SNIFF_BYTES, READ_MEDIA_TYPES } from "../contracts/constants.ts";

function head(abs: string): Buffer | null {
  let fd: number | null = null;
  try {
    fd = openSync(abs, "r");
    const buf = Buffer.alloc(READ_MEDIA_SNIFF_BYTES);
    const n = readSync(fd, buf, 0, READ_MEDIA_SNIFF_BYTES, 0);
    return buf.subarray(0, n);
  } catch {
    return null;
  } finally {
    if (fd !== null) closeSync(fd);
  }
}

/** True when the extension and the first bytes name one media type this agent's read tool returns as a block. */
export function isMediaRead(agent: AgentId, abs: string): boolean {
  const types = READ_MEDIA_BY_AGENT[agent] ?? [];
  if (types.length === 0) return false;
  const ext = extname(abs).toLowerCase();
  const named = types.filter((t) => (READ_MEDIA_TYPES[t].exts as readonly string[]).includes(ext));
  if (named.length === 0) return false;
  const bytes = head(abs);
  if (bytes === null) return false;
  return named.some((t) => READ_MEDIA_TYPES[t].sig.every((s) => s.bytes.every((b, i) => bytes[s.at + i] === b)));
}
