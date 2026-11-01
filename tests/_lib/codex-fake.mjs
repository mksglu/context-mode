// Shared fake of `codex app-server` hooks/list for the trust tests (ADR-0024: one copy; ADR-0010 D5 and ADR-0019/0023 use it).
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
// It behaves like the real one: it answers over a held-open stdin and exits when stdin closes. A hook is "trusted" when
// $CODEX_HOME/config.toml holds [hooks.state."<key>"] trusted_hash = <hook hash>. FAKE_COMPOSITE=1 reports currentHash the
// Codex 0.166 way, "<hook hash>/<plugin hash>"; without it the 0.156.1 way, the hook hash alone.
export const PLUGIN_ID = "context-mode@context-mode";
export const PLUGIN_KEY = (ev) => `${PLUGIN_ID}:.codex-plugin/hooks.json:${ev}:0:0`;
export const PLUGIN_EVENTS = ["pre_tool_use", "post_tool_use", "session_start", "user_prompt_submit"];
export const OTHER_KEY = "other@x:.codex-plugin/hooks.json:pre_tool_use:0:0";
export const hashOf = (key) => "sha256:" + key.length.toString(16).padStart(64, "0");
export const FAKE_APP_SERVER = `import { readFileSync, existsSync } from "node:fs";
import { createInterface } from "node:readline";
const home = process.env.CODEX_HOME;
const hooks = ${JSON.stringify([...PLUGIN_EVENTS.map((e) => ({ key: PLUGIN_KEY(e), pluginId: PLUGIN_ID, source: "plugin" })), { key: OTHER_KEY, pluginId: "other@x", source: "plugin" }, { key: "/h/hooks.json:pre_tool_use:0:0", source: "user" }])};
const base = (k) => "sha256:" + k.length.toString(16).padStart(64, "0");
// Codex 0.166.0-alpha.5.1 reports currentHash as "<hook hash>/<plugin hash>" but trusts only a trusted_hash equal to the hook hash.
const composite = process.env.FAKE_COMPOSITE === "1";
const hash = (k) => composite ? base(k) + "/sha256:" + "ab".repeat(32) : base(k);
const rl = createInterface({ input: process.stdin });
rl.on("line", (l) => {
  const m = JSON.parse(l);
  if (m.id === 1) process.stdout.write(JSON.stringify({ id: 1, result: { codexHome: home } }) + "\\n");
  if (m.id === 2) {
    const toml = existsSync(home + "/config.toml") ? readFileSync(home + "/config.toml", "utf8") : "";
    const data = hooks.map((h) => ({ ...h, eventName: "preToolUse", currentHash: hash(h.key),
      trustStatus: toml.includes("[hooks.state." + JSON.stringify(h.key) + "]\\ntrusted_hash = " + JSON.stringify(base(h.key))) ? "trusted" : toml.includes("[hooks.state." + JSON.stringify(h.key) + "]") ? "modified" : "untrusted" }));
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
