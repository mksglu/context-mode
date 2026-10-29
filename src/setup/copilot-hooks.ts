// src/setup/copilot-hooks.ts
// D-HF-COPILOT-ENABLED-1. Copilot CLI 1.0.105 does not run a hook whose `disableKey` is in the user settings.json
// `disabledHooks` list (live-proven, tests/v2/e2e/copilot-cli-fire.test.mjs). The host reports this itself: the
// JSON-RPC method `hooks.discover` of `copilot --server --stdio` lists each hook with `enabled` and `disableKey`.
// Setup and doctor ask the host; the key is never computed here (it is a host-side content hash).
import { spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import path from "node:path";

import { spawnForm, whichBin } from "./spawn-bin.ts";

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

/** One hook as `hooks.discover` reports it. `disableKey` is absent when a settings key cannot change its state (disableAllHooks, policy). */
export interface CopilotHook { event: string; source: string; enabled: boolean; disableKey?: string; }

const ASK_TIMEOUT_MS = 15_000;
const HEADER_END = "\r\n\r\n";
const LENGTH_HEADER = "content-length";
const USER_ORIGIN = "user";

/** A path as the platform compares it: real path when it exists, Windows without case. */
function canon(p: string): string {
  let r = path.resolve(p);
  try { r = realpathSync(r); } catch { /* the file may not exist yet */ }
  return process.platform === "win32" ? r.toLowerCase() : r;
}

/** The user hooks of `hooks.discover` reply `m` that come from `file`. Copilot 1.0.105 spells `source` relative to its
 *  config dir (`hooks/context-mode.json`), so a relative source is resolved against the dir that holds `hooks/`. */
export function copilotHooksFromReply(m: unknown, file: string): CopilotHook[] {
  const out: CopilotHook[] = [];
  if (!isObj(m) || !isObj(m.result) || !Array.isArray(m.result.hooks)) return out;
  const want = canon(file);
  const base = path.dirname(path.dirname(path.resolve(file)));
  for (const h of m.result.hooks) {
    if (!isObj(h) || h.origin !== USER_ORIGIN || typeof h.source !== "string" || typeof h.hookType !== "string" || typeof h.enabled !== "boolean") continue;
    if (canon(path.isAbsolute(h.source) ? h.source : path.join(base, h.source)) !== want) continue;
    out.push({ event: h.hookType, source: h.source, enabled: h.enabled, ...(typeof h.disableKey === "string" ? { disableKey: h.disableKey } : {}) });
  }
  return out;
}

/** The body of the first complete Content-Length framed message in `buf`, and the rest. */
function frame(buf: Buffer): { body: string; rest: Buffer } | undefined {
  const end = buf.indexOf(HEADER_END);
  if (end < 0) return undefined;
  let len = -1;
  for (const line of buf.subarray(0, end).toString("latin1").split("\r\n")) {
    const at = line.indexOf(":");
    if (at > 0 && line.slice(0, at).trim().toLowerCase() === LENGTH_HEADER) len = Number(line.slice(at + 1).trim());
  }
  if (!Number.isInteger(len) || len < 0) return undefined;
  const start = end + HEADER_END.length;
  if (buf.length < start + len) return undefined;
  return { body: buf.subarray(start, start + len).toString("utf8"), rest: buf.subarray(start + len) };
}

/** Ask `copilot --server --stdio` (hooks.discover) for the user hooks in `file`. Undefined: no copilot on PATH, no
 *  answer in time, or an answer that is not a hook list (an older copilot): the caller cannot tell, so it does not claim a gate. */
export function listCopilotHooks(env: Record<string, string | undefined>, file: string, cwd: string): Promise<CopilotHook[] | undefined> {
  const bin = whichBin("copilot", env);
  if (!bin) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    let f;
    try { f = spawnForm(bin, ["--server", "--stdio", "--no-auto-update"], env as NodeJS.ProcessEnv); } catch { resolve(undefined); return; }
    const child = spawn(f.command, f.args, { env: env as NodeJS.ProcessEnv, cwd, stdio: ["pipe", "pipe", "ignore"], windowsVerbatimArguments: f.windowsVerbatimArguments, windowsHide: true });
    let buf: Buffer = Buffer.alloc(0);
    let done = false;
    const finish = (v: CopilotHook[] | undefined): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      child.stdin.destroy();
      child.kill();
      resolve(v);
    };
    const timer = setTimeout(() => finish(undefined), ASK_TIMEOUT_MS);
    child.on("error", () => finish(undefined));
    child.on("close", () => finish(undefined));
    child.stdin.on("error", () => finish(undefined));
    child.stdout.on("data", (d: Buffer) => {
      buf = Buffer.concat([buf, d]);
      const m = frame(buf);
      if (!m) return;
      buf = Buffer.from(m.rest);
      let reply: unknown;
      try { reply = JSON.parse(m.body); } catch { finish(undefined); return; }
      if (!isObj(reply) || !isObj(reply.result) || !Array.isArray(reply.result.hooks)) { finish(undefined); return; }
      finish(copilotHooksFromReply(reply, file));
    });
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "hooks.discover", params: {} });
    try { child.stdin.write(`Content-Length: ${Buffer.byteLength(body)}${HEADER_END}${body}`); } catch { finish(undefined); }
  });
}
