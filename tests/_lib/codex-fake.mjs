// Shared fake of `codex app-server` hooks/list for the trust tests (ADR-0024: one copy; ADR-0010 D5 and ADR-0019/0023 use it).
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
// It behaves like the real one: it answers over a held-open stdin and exits when stdin closes. A hook is "trusted" when
// $CODEX_HOME/config.toml holds [hooks.state."<key>"] trusted_hash = <hook hash>. FAKE_COMPOSITE=1 reports currentHash the
// Codex 0.166 way, "<hook hash>/<plugin hash>"; without it the 0.156.1 way, the hook hash alone.
// D-NI-CODEX-TRUST-4 (rust-v0.166.0 hooks/src/engine/plugin_trust.rs matches_hash): with FAKE_COMPOSITE=1 a hook is trusted
// when trusted_hash is the hook hash and trusted_content_hash is the plugin hash; with no trusted_content_hash Codex compares
// the plugin hash with a one-time legacy baseline (<home>/.hook-trust/<sha>, never updated). FAKE_CONTENT sets the plugin
// hash now (default "ab"x32), FAKE_LEGACY_BASELINE the baseline (default: the plugin hash now, a fresh install).
export const PLUGIN_ID = "context-mode@context-mode";
export const PLUGIN_KEY = (ev) => `${PLUGIN_ID}:.codex-plugin/hooks.json:${ev}:0:0`;
export const PLUGIN_EVENTS = ["pre_tool_use", "post_tool_use", "session_start", "user_prompt_submit"];
export const OTHER_KEY = "other@x:.codex-plugin/hooks.json:pre_tool_use:0:0";
export const hashOf = (key) => "sha256:" + key.length.toString(16).padStart(64, "0");
// D-CODEX-HOME-RUN-1: with CODEX_HOME unset the home is <HOME>/.codex, and with HOME unset too it is <FAKE_OS_PROFILE>/.codex
// (the real Codex then takes the OS profile, not USERPROFILE). FAKE_IGNORE_CODEX_HOME=1 models a Codex that answers for
// another home than CODEX_HOME. FAKE_PLUGIN_BY_HOME=1 lists the context-mode plugin hooks only when <home>/config.toml switches
// the plugin on (a disabled or missing plugin lists none, as Codex does). FAKE_SILENT=1 exits at the first request, no answer.
export const FAKE_APP_SERVER = `import { readFileSync, existsSync } from "node:fs";
import { createInterface } from "node:readline";
const profile = process.env.HOME || process.env.FAKE_OS_PROFILE;
const home = process.env.CODEX_HOME && process.env.FAKE_IGNORE_CODEX_HOME !== "1" ? process.env.CODEX_HOME : profile ? profile + "/.codex" : undefined;
const hooks = ${JSON.stringify([...PLUGIN_EVENTS.map((e) => ({ key: PLUGIN_KEY(e), pluginId: PLUGIN_ID, source: "plugin" })), { key: OTHER_KEY, pluginId: "other@x", source: "plugin" }, { key: "/h/hooks.json:pre_tool_use:0:0", source: "user" }])};
const base = (k) => "sha256:" + k.length.toString(16).padStart(64, "0");
// Codex 0.166.0-alpha.5.1 reports currentHash as "<hook hash>/<plugin hash>" but trusts only a trusted_hash equal to the hook hash.
const composite = process.env.FAKE_COMPOSITE === "1";
const content = process.env.FAKE_CONTENT || "sha256:" + "ab".repeat(32);
const baseline = process.env.FAKE_LEGACY_BASELINE || content;
const hash = (k) => composite ? base(k) + "/" + content : base(k);
// The [hooks.state."<key>"] table of config.toml as { field: value } (one "name = <json>" per line), or undefined.
const stateOf = (toml, k) => {
  const head = "[hooks.state." + JSON.stringify(k) + "]\\n";
  const at = toml.indexOf(head);
  if (at < 0) return undefined;
  const out = {};
  for (const l of toml.slice(at + head.length).split("\\n[")[0].split("\\n")) {
    const i = l.indexOf(" = ");
    if (i > 0) out[l.slice(0, i)] = JSON.parse(l.slice(i + 3));
  }
  return out;
};
const statusOf = (toml, k) => {
  const st = stateOf(toml, k);
  if (st === undefined || st.trusted_hash === undefined) return "untrusted";
  if (st.trusted_hash !== base(k)) return "modified";
  if (!composite) return "trusted";
  const pinned = st.trusted_content_hash !== undefined ? st.trusted_content_hash : baseline;
  return pinned === content ? "trusted" : "modified";
};
const rl = createInterface({ input: process.stdin });
rl.on("line", (l) => {
  if (process.env.FAKE_SILENT === "1") process.exit(0);
  const m = JSON.parse(l);
  if (m.id === 1) process.stdout.write(JSON.stringify({ id: 1, result: { codexHome: home } }) + "\\n");
  if (m.id === 2) {
    const toml = existsSync(home + "/config.toml") ? readFileSync(home + "/config.toml", "utf8") : "";
    const pluginHere = process.env.FAKE_PLUGIN_BY_HOME !== "1" || toml.includes(${JSON.stringify(`[plugins."${"context-mode@context-mode"}"]
enabled = true`)});
    const data = hooks.filter((h) => pluginHere || h.pluginId !== ${JSON.stringify(PLUGIN_ID)}).map((h) => ({ ...h, eventName: "preToolUse", currentHash: hash(h.key),
      trustStatus: statusOf(toml, h.key) }));
    process.stdout.write(JSON.stringify({ id: 2, result: { data: [{ cwd: process.cwd(), hooks: data }] } }) + "\\n");
  }
});
rl.on("close", () => process.exit(0));
`;

// A temp dir with a `codex` on it that answers `app-server` with FAKE_APP_SERVER (sh script; callers skip on win32).
// Returns the bin dir to put first on PATH. FAKE_COMPOSITE is read from the env the process gets.
export function fakeCodexBin(root, nodePath) {
  const bin = join(root, "codex-bin");
  mkdirSync(bin, { recursive: true });
  const app = join(root, "fake-app-server.mjs");
  writeFileSync(app, FAKE_APP_SERVER);
  const file = join(bin, "codex");
  writeFileSync(file, `#!/bin/sh\ncase "$1" in\n  app-server) exec "${nodePath}" "${app}" ;;\nesac\nexit 0\n`);
  chmodSync(file, 0o755);
  return bin;
}

// config.toml text that trusts every context-mode plugin hook the way Codex wants it: the hook hash alone (both 0.156.1 and 0.166).
export function trustedToml() {
  return PLUGIN_EVENTS.map((ev) => `[hooks.state.${JSON.stringify(PLUGIN_KEY(ev))}]\ntrusted_hash = ${JSON.stringify(hashOf(PLUGIN_KEY(ev)))}\n`).join("\n");
}
