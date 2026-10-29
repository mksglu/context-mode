// src/setup/codex-trust.ts
// Codex 0.164.0 runs a hooks.json hook only when config.toml holds
// [hooks.state."<codexHome>/hooks.json:<snake_event>:<group>:<handler>"] trusted_hash = "sha256:<hex>".
// The hex is sha256 of the sorted-key JSON {event_name, matcher?, hooks:[{...handler, async:false}]}; checked against
// currentHash from `codex app-server` hooks/list (D-HA-CODEX-TRUST-1). Only context-mode's own handlers are trusted.
import { createHash } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import path from "node:path";

import { spawn } from "node:child_process";

import { spawnForm, spawnShim, whichBin } from "./spawn-bin.ts";

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const TRUST_KEY = ["hooks", "state"] as const;
/** The change path every trust edit starts with (editHostConfigText joins the key path with "."). */
export const CODEX_TRUST_PATH = TRUST_KEY.join(".") + ".";
const HASH_FIELD = "trusted_hash";
const HASH_PREFIX = "sha256:";

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (!isObj(v)) return v;
  return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]));
}

/** PreToolUse -> pre_tool_use (Codex's own event key form). */
function snake(name: string): string {
  let out = "";
  for (const ch of name) {
    const upper = ch >= "A" && ch <= "Z";
    out += upper ? (out === "" ? "" : "_") + ch.toLowerCase() : ch;
  }
  return out;
}

/** The real path of `file`, also when it or its parents do not exist yet (Codex keys use the real path). */
function realFile(file: string): string {
  let dir = path.resolve(file);
  const rest: string[] = [];
  while (!existsSync(dir) && path.dirname(dir) !== dir) { rest.unshift(path.basename(dir)); dir = path.dirname(dir); }
  return path.join(realpathSync(dir), ...rest);
}

const ASK_TIMEOUT_MS = 10_000;
const ASK_TRIES = 3;
const WIN_VERBATIM_PREFIX = "\\\\?\\";

/** The `codexHome` of the first JSON line that has one (the `initialize` reply of `codex app-server`); other lines are skipped. */
export function codexHomeFromReply(out: string): string | undefined {
  for (const line of out.split("\n")) {
    let m: unknown;
    try { m = JSON.parse(line); } catch { continue; }
    if (isObj(m) && isObj(m.result) && typeof m.result.codexHome === "string" && m.result.codexHome !== "") return m.result.codexHome;
  }
  return undefined;
}

/** D-WIN-CODEX-KEY-1: the config dir exactly as Codex spells it. Codex builds each hook key from this value, and on
 *  Windows it may carry a \\?\ prefix or another drive-letter case than Node's path, so setup asks Codex instead of
 *  computing the form. No Codex on PATH, or no answer: undefined. */
export function askCodexHome(env: Record<string, string | undefined>): string | undefined {
  const bin = whichBin("codex", env);
  if (!bin) return undefined;
  const input = JSON.stringify({ id: 1, method: "initialize", params: { clientInfo: { name: "context-mode-setup", version: "2.0.0" } } }) + "\n";
  // D-TRUST-KEYDIR-2: app-server may exit with an empty stdout when stdin closes at once (seen on macOS); ask again.
  for (let i = 0; i < ASK_TRIES; i++) {
    const r = spawnShim(bin, ["app-server"], env, { input, encoding: "utf8", timeout: ASK_TIMEOUT_MS });
    const home = typeof r.stdout === "string" ? codexHomeFromReply(r.stdout) : undefined;
    if (home !== undefined) return home;
  }
  return undefined;
}

/** A dir compared the way the platform compares it: Windows ignores case, the \\?\ prefix, / vs \\ and a trailing separator. */
function sameDir(a: string, b: string, platform: NodeJS.Platform): boolean {
  if (platform !== "win32") return path.posix.normalize(a) === path.posix.normalize(b);
  const norm = (p: string): string => {
    const bare = p.startsWith(WIN_VERBATIM_PREFIX) ? p.slice(WIN_VERBATIM_PREFIX.length) : p;
    const n = path.win32.normalize(bare).toLowerCase();
    return n.length > 3 && n.endsWith("\\") ? n.slice(0, -1) : n;
  };
  return norm(a) === norm(b);
}

/** The dir that starts every key. (With no CODEX_HOME Codex uses ~/.codex as spelled, so a symlinked HOME is not resolved.)
 *   Codex's own spelling of our dir when it names that dir; else the real path of our dir. */
export function codexKeyDir(o: { dir: string; asked?: string; real: (p: string) => string }, platform: NodeJS.Platform = process.platform): string {
  return o.asked !== undefined && sameDir(o.dir, o.asked, platform) ? o.asked : o.real(o.dir);
}

/** The [hooks.state."<key>"] tables that trust every handler whose command is `command` in the hooks.json `doc`.
 *  With `env`, Codex is asked for its config dir spelling (askCodexHome). */
export function codexTrustEntries(hooksFile: string, doc: unknown, command: string, env?: Record<string, string | undefined>): [readonly string[], unknown][] {
  const out: [readonly string[], unknown][] = [];
  if (!isObj(doc) || !isObj(doc.hooks)) return out;
  const abs = path.resolve(hooksFile);
  const dir = codexKeyDir({ dir: path.dirname(abs), asked: env ? askCodexHome(env) : undefined, real: env && !env.CODEX_HOME ? (p) => path.resolve(p) : realFile });
  const real = (dir.startsWith(WIN_VERBATIM_PREFIX) ? path.win32 : path).join(dir, path.basename(abs));
  for (const [event, groups] of Object.entries(doc.hooks)) {
    if (!Array.isArray(groups)) continue;
    groups.forEach((g, gi) => {
      if (!isObj(g) || !Array.isArray(g.hooks)) return;
      g.hooks.forEach((h, hi) => {
        if (!isObj(h) || h.command !== command) return;
        const id: Json = { event_name: snake(event), hooks: [{ ...h, async: false }] };
        if (g.matcher !== undefined) id.matcher = g.matcher;
        const hash = HASH_PREFIX + createHash("sha256").update(JSON.stringify(sortKeys(id))).digest("hex");
        out.push([[...TRUST_KEY, `${real}:${snake(event)}:${gi}:${hi}`], { [HASH_FIELD]: hash }]);
      });
    });
  }
  return out;
}

// ---------- D-NI-CODEX-TRUST-1: hooks of an installed Codex plugin ----------

/** One hook as `hooks/list` reports it: Codex's own key and the hash it computes now. */
export interface PluginHook { key: string; hash: string; trusted: boolean; }

const LIST_TIMEOUT_MS = 15_000;
const PLUGIN_SOURCE = "plugin";
const TRUSTED = "trusted";

/** The hooks of plugin `pluginId` in a `hooks/list` reply (id 2). Hooks of other plugins and user hooks are left out. */
export function pluginHooksFromReply(m: unknown, pluginId: string): PluginHook[] {
  const out: PluginHook[] = [];
  if (!isObj(m) || !isObj(m.result) || !Array.isArray(m.result.data)) return out;
  for (const d of m.result.data) {
    if (!isObj(d) || !Array.isArray(d.hooks)) continue;
    for (const h of d.hooks) {
      if (!isObj(h) || h.source !== PLUGIN_SOURCE || h.pluginId !== pluginId) continue;
      if (typeof h.key !== "string" || typeof h.currentHash !== "string") continue;
      if (out.some((x) => x.key === h.key)) continue; // one entry per key, also when two cwds list it
      out.push({ key: h.key, hash: h.currentHash, trusted: h.trustStatus === TRUSTED });
    }
  }
  return out;
}

/** Ask `codex app-server` (hooks/list) for the hooks of plugin `pluginId`. The server answers only while its stdin
 *  stays open, so the requests go one after the other and the process is stopped after the reply. Undefined: no Codex
 *  on PATH, or no answer in time (the caller cannot tell, so it does not claim untrusted). */
export function listPluginHooks(env: Record<string, string | undefined>, pluginId: string, cwd: string): Promise<PluginHook[] | undefined> {
  const bin = whichBin("codex", env);
  if (!bin) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    let f;
    try { f = spawnForm(bin, ["app-server"], env as NodeJS.ProcessEnv); } catch { resolve(undefined); return; }
    const child = spawn(f.command, f.args, { env: env as NodeJS.ProcessEnv, cwd, stdio: ["pipe", "pipe", "ignore"], windowsVerbatimArguments: f.windowsVerbatimArguments, windowsHide: true });
    let buf = "";
    let done = false;
    const finish = (v: PluginHook[] | undefined): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      child.stdin.destroy();
      child.kill();
      resolve(v);
    };
    const timer = setTimeout(() => finish(undefined), LIST_TIMEOUT_MS);
    const send = (o: unknown): void => { try { child.stdin.write(JSON.stringify(o) + "\n"); } catch { finish(undefined); } };
    child.on("error", () => finish(undefined));
    child.on("close", () => finish(undefined));
    child.stdin.on("error", () => finish(undefined));
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (d: string) => {
      buf += d;
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        let m: unknown;
        try { m = JSON.parse(line); } catch { continue; }
        if (!isObj(m)) continue;
        if (m.id === 1) { send({ method: "initialized" }); send({ id: 2, method: "hooks/list", params: { cwds: [cwd] } }); }
        else if (m.id === 2) finish(pluginHooksFromReply(m, pluginId));
      }
    });
    send({ id: 1, method: "initialize", params: { clientInfo: { name: "context-mode-setup", version: "2.0.0" } } });
  });
}

/** The [hooks.state."<key>"] tables that trust every hook of the plugin that Codex does not trust now. Codex's key and
 *  currentHash are used as given: no hash is computed here. */
export function pluginTrustEntries(hooks: PluginHook[]): [readonly string[], unknown][] {
  return hooks.filter((h) => !h.trusted).map((h): [readonly string[], unknown] => [[...TRUST_KEY, h.key], { [HASH_FIELD]: h.hash }]);
}
