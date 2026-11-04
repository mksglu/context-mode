// src/setup/codex-trust.ts
// Codex 0.164.0 runs a hooks.json hook only when config.toml holds
// [hooks.state."<codexHome>/hooks.json:<snake_event>:<group>:<handler>"] trusted_hash = "sha256:<hex>".
// The hex is sha256 of the sorted-key JSON {event_name, matcher?, hooks:[{...handler, async:false}]}; checked against
// currentHash from `codex app-server` hooks/list (D-HA-CODEX-TRUST-1). Only context-mode's own handlers are trusted.
import { createHash } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import path from "node:path";

import { spawn, spawnSync } from "node:child_process";

import { SERVER_KEY } from "../core/contracts/constants.ts";
import { spawnForm, spawnShim, whichBin } from "./spawn-bin.ts";

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const TRUST_KEY = ["hooks", "state"] as const;
/** The change path every trust edit starts with (editHostConfigText joins the key path with "."). */
export const CODEX_TRUST_PATH = TRUST_KEY.join(".") + ".";
const HASH_FIELD = "trusted_hash";
const CONTENT_HASH_FIELD = "trusted_content_hash"; // D-NI-CODEX-TRUST-4: Codex 0.166 HookStateToml (config/src/hook_config.rs)
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
export function sameDir(a: string, b: string, platform: NodeJS.Platform = process.platform): boolean {
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

/** One hook as `hooks/list` reports it: Codex's own key, the hash it computes now and its trustStatus word
 *  (trusted, untrusted, modified, managed). */
export interface PluginHook { key: string; hash: string; trusted: boolean; status: string; }

const LIST_TIMEOUT_MS = 15_000;
const EXIT_GRACE_MS = 5_000; // after hooks/list the caller waits this long at most for the codex process to exit (it may hold its cwd open)
const PLUGIN_SOURCE = "plugin";
const TRUSTED = "trusted";
const UNTRUSTED = "untrusted";

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
      const status = typeof h.trustStatus === "string" ? h.trustStatus : UNTRUSTED;
      out.push({ key: h.key, hash: h.currentHash, trusted: status === TRUSTED, status });
    }
  }
  return out;
}

/** D-CODEX-HOME-RUN-1: what one hooks/list call gave: no Codex on PATH, no answer in time, or the plugin's hooks and the
 *  config dir Codex named in its initialize reply (undefined when it named none). */
export type PluginHooksReply = { kind: "absent" } | { kind: "silent" } | { kind: "list"; hooks: PluginHook[]; codexHome: string | undefined };

/** Ask `codex app-server` (hooks/list) for the hooks of plugin `pluginId`. Undefined: no Codex on PATH, or no answer in
 *  time (the caller cannot tell, so it does not claim untrusted). */
export async function listPluginHooks(env: Record<string, string | undefined>, pluginId: string, cwd: string): Promise<PluginHook[] | undefined> {
  const r = await askPluginHooks(env, pluginId, cwd);
  return r.kind === "list" ? r.hooks : undefined;
}

/** The hooks/list call. The server answers only while its stdin stays open, so the requests go one after the other and
 *  the process is stopped after the reply. */
export function askPluginHooks(env: Record<string, string | undefined>, pluginId: string, cwd: string): Promise<PluginHooksReply> {
  const bin = whichBin("codex", env);
  if (!bin) return Promise.resolve({ kind: "absent" });
  return new Promise((resolve) => {
    let asked: string | undefined;
    const done_ = (hooks: PluginHook[] | undefined): PluginHooksReply => hooks === undefined ? { kind: "silent" } : { kind: "list", hooks, codexHome: asked };
    let f;
    try { f = spawnForm(bin, ["app-server"], env as NodeJS.ProcessEnv); } catch { resolve({ kind: "silent" }); return; }
    const child = spawn(f.command, f.args, { env: env as NodeJS.ProcessEnv, cwd, stdio: ["pipe", "pipe", "ignore"], windowsVerbatimArguments: f.windowsVerbatimArguments, windowsHide: true });
    let buf = "";
    let done = false;
    let exited = false;
    let result: PluginHook[] | undefined;
    const settle = (): void => { clearTimeout(grace); resolve(done_(result)); };
    let grace: ReturnType<typeof setTimeout> | undefined;
    const finish = (v: PluginHook[] | undefined): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      result = v;
      child.stdin.destroy();
      if (exited) { settle(); return; }
      grace = setTimeout(settle, EXIT_GRACE_MS);
      stopTree(child.pid, () => child.kill());
    };
    const timer = setTimeout(() => finish(undefined), LIST_TIMEOUT_MS);
    const send = (o: unknown): void => { try { child.stdin.write(JSON.stringify(o) + "\n"); } catch { finish(undefined); } };
    child.on("error", () => finish(undefined));
    child.on("close", () => { exited = true; if (done) settle(); else finish(undefined); });
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
        if (m.id === 1) { asked = codexHomeFromReply(line); send({ method: "initialized" }); send({ id: 2, method: "hooks/list", params: { cwds: [cwd] } }); }
        else if (m.id === 2) finish(pluginHooksFromReply(m, pluginId));
      }
    });
    send({ id: 1, method: "initialize", params: { clientInfo: { name: "context-mode-setup", version: "2.0.0" } } });
  });
}

/** D-NI-CODEX-TRUST-3: on Windows `codex` is a .cmd shim, so kill() ends the shim and leaves the real codex running with
 *  its cwd open (the next rmSync of that dir fails with EPERM). taskkill /T ends the whole tree. */
function stopTree(pid: number | undefined, kill: () => void): void {
  if (process.platform === "win32" && pid !== undefined) {
    try { spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true, stdio: "ignore", timeout: 5000 }); } catch { /* fall through to kill */ }
  }
  kill();
}

const HASH_PART_SEP = "/";

/** D-NI-CODEX-TRUST-2: Codex 0.166 reports currentHash as "<hook hash>/<plugin hash>" and trusts a hook only when
 *  trusted_hash is the hook hash alone (the full value gives "modified"). 0.156.1 reports the hook hash alone. */
export function hookHashOf(currentHash: string): string {
  const cut = currentHash.indexOf(HASH_PART_SEP);
  return cut < 0 ? currentHash : currentHash.slice(0, cut);
}

/** D-NI-CODEX-TRUST-4: the plugin hash part of a 0.166 currentHash (after the "/"), undefined for a 0.156.1 hash. */
export function contentHashOf(currentHash: string): string | undefined {
  const cut = currentHash.indexOf(HASH_PART_SEP);
  return cut < 0 ? undefined : currentHash.slice(cut + 1);
}

/** The [hooks.state."<key>"] tables that trust every hook of the plugin that Codex does not trust now. Codex's key and
 *  hashes are used: no hash is computed here. D-NI-CODEX-TRUST-4: a 0.166 hash gives trusted_hash (hook part) and
 *  trusted_content_hash (plugin part), the split Codex's own config writer makes (app-server config_manager_service.rs);
 *  without trusted_content_hash Codex pins the plugin to a one-time .hook-trust baseline, so an upgrade lists the hooks
 *  "modified". `doc` is the parsed config.toml: the other fields of an existing table (enabled) stay. */
export function pluginTrustEntries(hooks: PluginHook[], doc?: unknown): [readonly string[], unknown][] {
  const states = isObj(doc) && isObj(doc.hooks) && isObj(doc.hooks.state) ? doc.hooks.state : {};
  return hooks.filter((h) => !h.trusted).map((h): [readonly string[], unknown] => {
    const old = isObj(states[h.key]) ? states[h.key] as Json : {};
    const content = contentHashOf(h.hash);
    const row: Json = { ...old, [HASH_FIELD]: hookHashOf(h.hash) };
    if (content !== undefined) row[CONTENT_HASH_FIELD] = content;
    return [[...TRUST_KEY, h.key], row];
  });
}

/** The plugin id Codex gives our package (`codex plugin add context-mode@context-mode`). */
export const CODEX_PLUGIN_ID = `${SERVER_KEY}@${SERVER_KEY}`;
/** The one-line fix both doctors print when Codex lists our plugin hooks untrusted. */
export const CODEX_UNTRUSTED_FIX = "run: context-mode setup";

/** D-NI-CODEX-TRUST-3: the one trust check for the terminal doctor (hook-registered) and ctx_doctor (D5). Undefined when
 *  every own plugin hook is trusted, or Codex listed none (setup route: hooks.json, checked elsewhere). */
export function untrustedPluginHooksDetail(hooks: PluginHook[]): string | undefined {
  const bad = hooks.filter((h) => !h.trusted);
  if (!bad.length) return undefined;
  // D-NI-CODEX-TRUST-4: the Codex status word (untrusted, modified), most frequent first, so the line matches `/hooks`.
  const counts = new Map<string, number>();
  for (const h of bad) counts.set(h.status, (counts.get(h.status) ?? 0) + 1);
  const words = [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  const state = words.length === 1 ? words[0][0] : `${words.map(([w]) => w).join(" or ")} (${words.map(([w, n]) => `${n} ${w}`).join(", ")})`;
  return `codex lists ${bad.length} of ${hooks.length} context-mode plugin hooks ${state}, so they do not run; ${CODEX_UNTRUSTED_FIX}`;
}
