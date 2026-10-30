// ADR-0020: hook gates for pi, Copilot CLI, Claude Code, Codex and OpenCode; hook path changes.
// Area: 0020-gates-pi-copilot-claude (docs/v2/TEST-LAYOUT.md).
// Merged by ADR-0024 from 7 files (see docs/v2/TEST-LAYOUT.md). One describe block per old file; test names are unchanged.
// pi-gate is serial because its tests call process.chdir; the other blocks use own temp dirs and explicit env, so they run concurrently.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { TOOL_ORDER } from "../../src/core/contracts/constants.ts";
import { buildRegistry, isOwnHookCommand, runDoctor, runRemove, runSetup } from "../../src/setup/index.ts";
import { createHash } from "node:crypto";
import { generateManifests } from "../../build/manifests.ts";
import { askCodexHome, codexHomeFromReply, codexKeyDir, codexTrustEntries } from "../../src/setup/codex-trust.ts";

describe("ADR-0020 pi gate (D-NI-PI-GATE-1)", () => {
  // serial: tests call process.chdir.
  // D-NI-PI-GATE-1: pi 1.4.0 loads our extension (pi/index.js, the in-process hooks) only when the packages[] entry for
  // context-mode does not filter it out. Live (temp HOME, fake OpenAI-compatible model, `pi list` showed the package in each
  // case): extensions: [], "!pi/*", "!pi/index.js", "-pi/index.js", "pi/other.js" (include list without ours) and
  // ["**","!pi/index.js"] made the real binary send the 208 KB file to the model. A project .pi/settings.json entry with such
  // a filter does the same once the project is trusted (trust.json, or defaultProjectTrust "always"). Doctor and setup must
  // FAIL with the file, the filter and a one-line fix; they never rewrite a user's filter.


  const SKIP_SH = { skip: process.platform === "win32" && "fake agent binaries are sh scripts" };

  function fakePkg(root) {
    const dir = path.join(root, "pkg");
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "server.mjs"), `
import { createInterface } from "node:readline";
const tools = ${JSON.stringify([...TOOL_ORDER])};
createInterface({ input: process.stdin }).on("line", (l) => {
  const m = JSON.parse(l);
  if (m.id === undefined) return;
  const result = m.method === "initialize"
    ? { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "context-mode", version: "2.0.0" } }
    : { tools: tools.map((name) => ({ name, inputSchema: { type: "object" } })) };
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: m.id, result }) + "\\n");
});
`);
    writeFileSync(path.join(dir, "hook.mjs"), `let s = ""; process.stdin.on("data", (d) => { s += d; }); process.stdin.on("end", () => { const p = JSON.parse(s); if (!JSON.stringify(p).includes("context-mode-doctor-hook-runs")) return; const t = "deny: run ctx_execute; ctx_search( finds the rest"; process.stderr.write(t + "\\n"); process.stdout.write(JSON.stringify({ decision: "deny", reason: t })); });\n`);
    writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "context-mode", version: "2.0.0" }));
    const skills = path.join(import.meta.dirname, "..", "..", "skills");
    for (const rel of ["skills", path.join("pi", "skills"), path.join("claude-code", "skills")]) cpSync(skills, path.join(dir, rel), { recursive: true });
    return dir;
  }

  function sandbox(t) {
    const root = mkdtempSync(path.join(tmpdir(), "cm-pigate-"));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const home = path.join(root, "home");
    const bin = path.join(root, "bin");
    mkdirSync(home, { recursive: true });
    mkdirSync(bin, { recursive: true });
    const file = path.join(bin, "pi");
    writeFileSync(file, `#!/bin/sh\ncase "$1" in\n  list) echo "User packages:"; echo "  context-mode" ;;\n  install) exit 7 ;;\nesac\nexit 0\n`);
    chmodSync(file, 0o755);
    const pkgDir = fakePkg(root);
    const agent = path.join(home, ".pi", "agent");
    const env = { PATH: [bin, "/usr/bin", "/bin"].join(path.delimiter), HOME: home, USERPROFILE: home, CM_HOOK_OVERHEAD_BUDGET_MS: "60000" };
    return { root, home, pkgDir, env, agent, user: path.join(agent, "settings.json"), trust: path.join(agent, "trust.json") };
  }

  function put(file, value) {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value, null, 2));
    return file;
  }

  async function doctor(s) {
    const doc = await runDoctor({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: ["pi"] });
    return doc.agents[0];
  }
  const regDetail = (a) => a.checks.find((c) => c.name === "hook-registered")?.detail ?? "";

  test("[D-NI-PI-GATE-1] baseline: the plain package entry, and entries that keep pi/index.js -> PASS", SKIP_SH, async (t) => {
    for (const entry of [null, { extensions: ["pi/index.js"] }, { skills: [] }, { extensions: ["!pi/other.js"] }, { extensions: ["+pi/index.js"] }]) {
      const s = sandbox(t);
      put(s.user, { packages: [entry === null ? s.pkgDir : { source: s.pkgDir, ...entry }] });
      const a = await doctor(s);
      assert.equal(a.status, "PASS", `${JSON.stringify(entry)} ${JSON.stringify(a, null, 2)}`);
    }
  });

  for (const extensions of [[], ["!pi/*"], ["!pi/index.js"], ["-pi/index.js"], ["pi/other.js"], ["**", "!pi/index.js"]]) {
    test(`[D-NI-PI-GATE-1] doctor: packages[] extensions ${JSON.stringify(extensions)} is a FAIL that names the file and the filter`, SKIP_SH, async (t) => {
      const s = sandbox(t);
      put(s.user, { packages: [{ source: s.pkgDir, extensions }] });
      const a = await doctor(s);
      assert.equal(a.status, "FAIL", JSON.stringify(a, null, 2));
      assert.ok(regDetail(a).includes(s.user) && regDetail(a).includes("extensions"), regDetail(a));
      assert.ok(regDetail(a).includes("pi/index.js"), regDetail(a));
    });
  }

  test("[D-NI-PI-GATE-1] doctor: a filter on another package is not ours -> PASS", SKIP_SH, async (t) => {
    const s = sandbox(t);
    put(s.user, { packages: [s.pkgDir, { source: "npm:other-pkg", extensions: [] }] });
    const a = await doctor(s);
    assert.equal(a.status, "PASS", JSON.stringify(a, null, 2));
  });

  test("[D-NI-PI-GATE-1] doctor: a project filter in a trusted project (trust.json) is a FAIL that names the project file", SKIP_SH, async (t) => {
    const s = sandbox(t);
    put(s.user, { packages: [s.pkgDir] });
    const ws = path.join(s.root, "project");
    put(path.join(ws, ".pi", "settings.json"), { packages: [{ source: s.pkgDir, extensions: [] }] });
    put(s.trust, { [ws]: true });
    const before = process.cwd();
    process.chdir(ws);
    try {
      const a = await doctor(s);
      assert.equal(a.status, "FAIL", JSON.stringify(a, null, 2));
      assert.ok(regDetail(a).includes(path.join(".pi", "settings.json")), regDetail(a));
    } finally { process.chdir(before); }
  });

  test("[D-NI-PI-GATE-1] doctor: the same project filter with defaultProjectTrust always is a FAIL; a distrusted project is a PASS", SKIP_SH, async (t) => {
    const ws = (s) => { const w = path.join(s.root, "project"); put(path.join(w, ".pi", "settings.json"), { packages: [{ source: s.pkgDir, extensions: [] }] }); return w; };
    const before = process.cwd();
    try {
      const a1 = sandbox(t);
      put(a1.user, { defaultProjectTrust: "always", packages: [a1.pkgDir] });
      process.chdir(ws(a1));
      const r1 = await doctor(a1);
      assert.equal(r1.status, "FAIL", JSON.stringify(r1, null, 2));
      const a2 = sandbox(t);
      put(a2.user, { defaultProjectTrust: "always", packages: [a2.pkgDir] });
      const w2 = ws(a2);
      put(a2.trust, { [w2]: false });
      process.chdir(w2);
      const r2 = await doctor(a2);
      assert.equal(r2.status, "PASS", JSON.stringify(r2, null, 2));
    } finally { process.chdir(before); }
  });

  test("[D-NI-PI-GATE-1] doctor: a project filter in a project nobody trusted is not reported (pi ignores it in print mode)", SKIP_SH, async (t) => {
    const s = sandbox(t);
    put(s.user, { packages: [s.pkgDir] });
    const ws = path.join(s.root, "project");
    put(path.join(ws, ".pi", "settings.json"), { packages: [{ source: s.pkgDir, extensions: [] }] });
    const before = process.cwd();
    process.chdir(ws);
    try {
      const a = await doctor(s);
      assert.equal(a.status, "PASS", JSON.stringify(a, null, 2));
    } finally { process.chdir(before); }
  });

  test("[D-NI-PI-GATE-1] setup: a filtered pi install is a FAIL with the same fix, and setup rewrites no user filter", SKIP_SH, async (t) => {
    const s = sandbox(t);
    const text = JSON.stringify({ packages: [{ source: s.pkgDir, extensions: ["!pi/index.js"] }] });
    put(s.user, text);
    const res = await runSetup({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: ["pi"], runId: "p1" });
    const a = res.agents[0];
    assert.equal(a.status, "FAIL", JSON.stringify(a, null, 2));
    assert.ok((a.reason ?? "").includes("extensions"), a.reason);
    assert.equal(readFileSync(s.user, "utf8"), text);
  });
});

// Independent blocks (own temp dirs, no process-wide state): they run at the same time.
describe("ADR-0020 gates (concurrent blocks)", { concurrency: true }, () => {
  describe("ADR-0020 Copilot CLI hooks enabled", { concurrency: true }, () => {
    // D-HF-COPILOT-ENABLED-1: Copilot CLI 1.0.105 does not run a hook whose key is in settings.json `disabledHooks`
    // (live-proven in tests/v2/e2e/copilot-cli-fire.test.mjs). Setup removes our own keys; doctor FAILs with a one-line fix.
    // The stub spells source relative to COPILOT_HOME, as copilot 1.0.105 does. The host here is a stub that answers `copilot --server --stdio` hooks.discover from the files in COPILOT_HOME.


    const NODE = process.execPath;
    const REPO = path.resolve(import.meta.dirname, "../..");
    const SKILLS = ["ctx-doctor", "ctx-stats", "ctx-upgrade"];
    const key = (source, event) => createHash("sha256").update(source + "\n" + event).digest("hex");

    const STUB = `
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
const args = process.argv.slice(2);
if (!args.includes("--server")) { console.log("context-mode"); process.exit(0); }
if (process.env.STUB_NO_ANSWER) process.exit(0);
const dir = process.env.COPILOT_HOME || path.join(process.env.HOME, ".copilot");
const read = (f) => { try { return JSON.parse(readFileSync(f, "utf8")); } catch { return {}; } };
let buf = Buffer.alloc(0);
process.stdin.on("data", (d) => {
  buf = Buffer.concat([buf, d]);
  const s = buf.toString("latin1"); const i = s.indexOf("\\r\\n\\r\\n"); if (i < 0) return;
  const n = Number(s.slice(0, i).split(":")[1]); if (buf.length < i + 4 + n) return;
  const m = JSON.parse(buf.slice(i + 4, i + 4 + n).toString());
  const file = path.join(dir, "hooks", "context-mode.json");
  const set = read(path.join(dir, "settings.json"));
  const doc = existsSync(file) ? read(file) : { hooks: {} };
  const hooks = Object.keys(doc.hooks || {}).map((event) => {
    const k = createHash("sha256").update(file + "\\n" + event).digest("hex");
    // hooks.discover schema: disableKey is omitted when disable-all suppresses the action
    return { id: "hook:" + k, hookType: event, origin: "user", source: path.relative(dir, file).split(path.sep).join("/"), enabled: !set.disableAllHooks && !(set.disabledHooks || []).includes(k), ...(set.disableAllHooks ? {} : { disableKey: k }) };
  });
  const body = JSON.stringify({ jsonrpc: "2.0", id: m.id, result: { hooks, warnings: [], errors: [] } });
  process.stdout.write("Content-Length: " + Buffer.byteLength(body) + "\\r\\n\\r\\n" + body);
});
`;

    function pkg(root) {
      const dir = path.join(root, "pkg");
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, "server.mjs"), `
import { createInterface } from "node:readline";
const tools = ${JSON.stringify([...TOOL_ORDER])};
createInterface({ input: process.stdin }).on("line", (l) => {
  const m = JSON.parse(l);
  if (m.id === undefined) return;
  const result = m.method === "initialize"
    ? { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "context-mode", version: "2.0.0" } }
    : { tools: tools.map((name) => ({ name, inputSchema: { type: "object" } })) };
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: m.id, result }) + "\\n");
});
`);
      writeFileSync(path.join(dir, "hook.mjs"), `let s = ""; process.stdin.on("data", (d) => { s += d; }); process.stdin.on("end", () => { const p = JSON.parse(s); if (!JSON.stringify(p).includes("context-mode-doctor-hook-runs")) return; const t = "deny: run ctx_execute; ctx_search( finds the rest"; process.stderr.write(t + "\\n"); process.stdout.write(JSON.stringify({ decision: "deny", reason: t })); });\n`);
      writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "context-mode", version: "2.0.0" }));
      generateManifests(dir);
      for (const s of SKILLS) cpSync(path.join(REPO, "skills", s), path.join(dir, "skills", s), { recursive: true });
      for (const s of SKILLS) cpSync(path.join(REPO, "skills", s), path.join(dir, "pi", "skills", s), { recursive: true }); // D-HQ-SKILLS-1: the bare-name skill dir
      return dir;
    }

    function sandbox(t, extraEnv = {}) {
      const root = mkdtempSync(path.join(tmpdir(), "cm-cop-enabled-"));
      t.after(() => rmSync(root, { recursive: true, force: true }));
      const home = path.join(root, "home");
      const bin = path.join(root, "bin");
      mkdirSync(home, { recursive: true });
      mkdirSync(bin, { recursive: true });
      writeFileSync(path.join(bin, "copilot-stub.mjs"), STUB);
      if (process.platform === "win32") writeFileSync(path.join(bin, "copilot.cmd"), `@"${NODE}" "%~dp0copilot-stub.mjs" %*\r\n`);
      else writeFileSync(path.join(bin, "copilot"), `#!/bin/sh\nexec "${NODE}" "${path.join(bin, "copilot-stub.mjs")}" "$@"\n`, { mode: 0o755 });
      const win = process.platform === "win32" ? { SystemRoot: process.env.SystemRoot, ComSpec: process.env.ComSpec } : {};
      return { root, home, pkgDir: pkg(root), settings: path.join(home, ".copilot", "settings.json"), hookFile: path.join(home, ".copilot", "hooks", "context-mode.json"),
        env: { PATH: [bin, "/usr/bin", "/bin"].join(path.delimiter), HOME: home, USERPROFILE: home, CM_HOOK_OVERHEAD_BUDGET_MS: "60000", ...win, ...extraEnv } };
    }

    const opts = (s, extra = {}) => ({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: ["copilot-cli"], ...extra });
    const why = (r) => JSON.stringify(r.agents.map((a) => [a.id, a.status, a.reason]));

    test("D-HF-COPILOT-ENABLED-1: setup removes only our own keys from disabledHooks and keeps every other setting", async (t) => {
      const s = sandbox(t);
      mkdirSync(path.dirname(s.settings), { recursive: true });
      const first = await runSetup(opts(s, { runId: "a" }));
      assert.equal(first.exitCode, 0, why(first));
      const mine = key(s.hookFile, "preToolUse");
      const theirs = "f".repeat(64);
      const user = JSON.stringify({ model: "gpt-x", disabledHooks: [theirs, mine, key(s.hookFile, "postToolUse")] }, null, 2) + "\n";
      writeFileSync(s.settings, user);
      const again = await runSetup(opts(s, { runId: "b" }));
      assert.equal(again.exitCode, 0, why(again));
      const doc = JSON.parse(readFileSync(s.settings, "utf8"));
      assert.deepEqual(doc.disabledHooks, [theirs], "only a key that is not ours stays");
      assert.equal(doc.model, "gpt-x");
      assert.ok(again.agents[0].changes.some((c) => c.file === s.settings), "the settings edit is reported");
      const third = await runSetup(opts(s, { runId: "c" }));
      assert.deepEqual(third.agents[0].changes, [], "idempotent");
      assert.equal(runRemove({ home: s.home, env: s.env }).exitCode, 0);
      assert.equal(readFileSync(s.settings, "utf8"), user, "remove puts settings.json back byte for byte");
    });

    test("D-HF-COPILOT-ENABLED-1: doctor FAILs one line when the host lists our hooks disabled, and names the fix", async (t) => {
      const s = sandbox(t);
      assert.equal((await runSetup(opts(s, { runId: "a" }))).exitCode, 0);
      writeFileSync(s.settings, JSON.stringify({ disabledHooks: [key(s.hookFile, "preToolUse")] }));
      const d = await runDoctor(opts(s));
      assert.equal(d.exitCode, 1, why(d));
      const c = d.agents[0].checks.find((x) => x.name === "hook-enabled");
      assert.equal(c.ok, false, JSON.stringify(d.agents[0].checks));
      assert.match(c.detail, /1 of 4 context-mode hooks disabled/);
      assert.match(c.detail, /disabledHooks/);
      assert.match(c.detail, /run: context-mode setup/);
      assert.equal(c.detail.includes("\n"), false);
    });

    test("D-HF-COPILOT-ENABLED-1: disableAllHooks is the user's choice: setup does not flip it, it FAILs and names the setting", async (t) => {
      const s = sandbox(t);
      mkdirSync(path.dirname(s.settings), { recursive: true });
      writeFileSync(s.settings, JSON.stringify({ disableAllHooks: true }));
      const r = await runSetup(opts(s, { runId: "a" }));
      assert.equal(r.exitCode, 1, why(r));
      assert.match(r.agents[0].reason, /disableAllHooks/);
      assert.equal(JSON.parse(readFileSync(s.settings, "utf8")).disableAllHooks, true, "the user's flag is untouched");
    });

    test("D-HF-COPILOT-ENABLED-1: doctor is green when the host lists all hooks enabled", async (t) => {
      const s = sandbox(t);
      assert.equal((await runSetup(opts(s, { runId: "a" }))).exitCode, 0);
      const d = await runDoctor(opts(s));
      assert.equal(d.exitCode, 0, why(d));
      const c = d.agents[0].checks.find((x) => x.name === "hook-enabled");
      assert.equal(c.ok, true);
      assert.notEqual(c.warn, true);
    });

    test("D-HF-COPILOT-ENABLED-1: a host that gives no answer is a WARN, never a FAIL", async (t) => {
      const s = sandbox(t, { STUB_NO_ANSWER: "1" });
      const r = await runSetup(opts(s, { runId: "a" }));
      assert.equal(r.exitCode, 0, why(r));
      const c = r.agents[0].checks.find((x) => x.name === "hook-enabled");
      assert.equal(c.ok, true);
      assert.equal(c.warn, true);
      assert.match(c.detail, /copilot did not report hook state/);
    });
  });

  describe("ADR-0020 Claude Code hooks run", { concurrency: true }, () => {
    // tests/v2/setup/claude-code-hooks-run.test.mjs
    // D-CC-HOOKS-RUN-1. Claude Code 2.1.274 (live spike): the plugin hooks never run when the plugin is installed but
    // disabled (`claude plugin list` shows "Status: disabled") or when `disableAllHooks: true` is set in a settings file.
    // Setup enables our own plugin; doctor FAILs, with a one-line fix, on both.


    const SKIP = process.platform === "win32" && "fake agent binaries are sh scripts";
    const REPO = path.resolve(import.meta.dirname, "../..");
    const PLUGIN = "context-mode@context-mode";

    // The text `claude plugin list` prints (2.1.274): a block per plugin, the Status line ends in enabled / disabled.
    const FAKE = (state) => `case "$1 $2" in
  "plugin list") if [ -f "${state}.on" ] || [ -f "${state}.off" ]; then
      echo "Installed plugins:"; echo ""; echo "  ❯ ${PLUGIN}"; echo "    Version: 2.0.0"; echo "    Scope: user"
      if [ -f "${state}.off" ]; then echo "    Status: ✘ disabled"; else echo "    Status: ✔ enabled"; fi
    fi ;;
  "plugin install") touch "${state}.on" ;;
  "plugin enable") rm -f "${state}.off"; touch "${state}.on"; echo enabled >> "${state}.log" ;;
  "plugin disable") rm -f "${state}.on"; touch "${state}.off" ;;
esac
exit 0`;

    function sandbox(t) {
      const root = mkdtempSync(path.join(tmpdir(), "cm-cc-hooks-"));
      t.after(() => rmSync(root, { recursive: true, force: true }));
      const home = path.join(root, "home");
      const bin = path.join(root, "bin");
      const pkgDir = path.join(root, "pkg");
      mkdirSync(home, { recursive: true });
      mkdirSync(bin, { recursive: true });
      mkdirSync(pkgDir, { recursive: true });
      writeFileSync(path.join(pkgDir, "server.mjs"), `
import { createInterface } from "node:readline";
const tools = ${JSON.stringify([...TOOL_ORDER])};
createInterface({ input: process.stdin }).on("line", (l) => {
  const m = JSON.parse(l);
  if (m.id === undefined) return;
  const result = m.method === "initialize"
    ? { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "context-mode", version: "2.0.0" } }
    : { tools: tools.map((name) => ({ name, inputSchema: { type: "object" } })) };
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: m.id, result }) + "\\n");
});
`);
      writeFileSync(path.join(pkgDir, "hook.mjs"), `let s = ""; process.stdin.on("data", (d) => { s += d; }); process.stdin.on("end", () => { const p = JSON.parse(s); if (!JSON.stringify(p).includes("context-mode-doctor-hook-runs")) return; const t = "deny: run ctx_execute; ctx_search( finds the rest"; process.stderr.write(t + "\\n"); process.stdout.write(JSON.stringify({ decision: "deny", reason: t })); });\n`);
      writeFileSync(path.join(pkgDir, "package.json"), JSON.stringify({ name: "context-mode", version: "2.0.0" }));
      for (const d of ["skills", path.join("claude-code", "skills")]) cpSync(path.join(REPO, "skills"), path.join(pkgDir, d), { recursive: true });
      const state = path.join(root, "claude.state");
      const cli = path.join(root, "npm", "lib", "node_modules", "@anthropic-ai", "claude-code");
      mkdirSync(cli, { recursive: true });
      writeFileSync(path.join(cli, "package.json"), JSON.stringify({ name: "@anthropic-ai/claude-code", version: "2.0.0" }));
      writeFileSync(path.join(cli, "cli.sh"), `#!/bin/sh\n${FAKE(state)}\n`);
      chmodSync(path.join(cli, "cli.sh"), 0o755);
      symlinkSync(realpathSync(path.join(cli, "cli.sh")), path.join(bin, "claude"));
      return { root, home, pkgDir, state,
        env: { PATH: [bin, "/usr/bin", "/bin"].join(path.delimiter), HOME: home, USERPROFILE: home, CM_HOOK_OVERHEAD_BUDGET_MS: "60000" } };
    }

    const opts = (s) => ({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: ["claude-code"] });
    const check = (res, name) => res.agents[0].checks.find((c) => c.name === name);

    test("claude-code: a disabled plugin is enabled by setup with the host's own command, and doctor then passes", { skip: SKIP }, async (t) => {
      const s = sandbox(t);
      writeFileSync(`${s.state}.off`, "");
      const before = await runDoctor(opts(s));
      assert.equal(before.exitCode, 1, "doctor FAILs while the plugin is disabled");
      assert.match(before.agents[0].reason, /hook-enabled: .*disabled.*claude plugin enable context-mode@context-mode/);
      const res = await runSetup({ ...opts(s), runId: "r1" });
      assert.equal(res.agents[0].status, "PASS", JSON.stringify(res.agents[0], null, 2));
      assert.equal(readFileSync(`${s.state}.log`, "utf8"), "enabled\n", "setup ran claude plugin enable once");
      const after = await runDoctor(opts(s));
      assert.equal(after.exitCode, 0, JSON.stringify(after.agents[0], null, 2));
      assert.equal(check(after, "hook-enabled").ok, true);
    });

    test("claude-code: doctor FAILs, naming the file and the key, when a settings file sets disableAllHooks", { skip: SKIP }, async (t) => {
      const s = sandbox(t);
      await runSetup({ ...opts(s), runId: "r1" });
      const file = path.join(s.home, ".claude", "settings.json");
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify({ disableAllHooks: true, model: "x" }));
      const d = await runDoctor(opts(s));
      assert.equal(d.exitCode, 1);
      assert.match(d.agents[0].reason, new RegExp(`hook-enabled: ${file.replaceAll("\\", "\\\\")} sets disableAllHooks, so Claude Code runs no hooks; remove "disableAllHooks" from it`));
      assert.equal(JSON.parse(readFileSync(file, "utf8")).disableAllHooks, true, "doctor never edits the user's own setting");
      writeFileSync(file, JSON.stringify({ disableAllHooks: false }));
      assert.equal((await runDoctor(opts(s))).exitCode, 0, "false is not a gate");
    });

    test("claude-code: a settings file that is not JSON is a doctor FAIL that names the file, not a crash or a hook-enabled guess", { skip: SKIP }, async (t) => {
      const s = sandbox(t);
      await runSetup({ ...opts(s), runId: "r1" });
      const file = path.join(s.home, ".claude", "settings.json");
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, "{ not json");
      const d = await runDoctor(opts(s));
      assert.equal(d.exitCode, 1);
      assert.ok(d.agents[0].reason.includes(file), d.agents[0].reason);
      assert.equal(readFileSync(file, "utf8"), "{ not json", "doctor never edits the user's file");
    });
  });

  describe("ADR-0020 Codex trust key dir", { concurrency: true }, () => {
    // tests/v2/setup/codex-trust-key.test.mjs
    // D-WIN-CODEX-KEY-1: the [hooks.state."<key>"] key must equal the `key` Codex prints in hooks/list. Probed on Codex 0.156.1:
    // the default ~/.codex is used as spelled (a symlinked HOME is not resolved); $CODEX_HOME is canonicalised; the key is
    // <codexHome>/hooks.json, and `codex app-server` initialize reports that codexHome. On Windows Codex may spell it
    // with a \\?\ prefix or another drive-letter case, so setup asks Codex instead of computing the form.


    const DOC = { hooks: { PreToolUse: [{ matcher: "x", hooks: [{ type: "command", command: "cmd-a" }] }] } };
    const keyOf = (entries) => entries[0][0][2];

    function tmp(t) {
      const root = realpathSync(mkdtempSync(path.join(tmpdir(), "cm-codex-key-")));
      t.after(() => rmSync(root, { recursive: true, force: true }));
      return root;
    }

    test("D-WIN-CODEX-KEY-1: codexHomeFromReply reads codexHome from the initialize reply and ignores other lines", () => {
      const out = '{"method":"x","params":{}}\n{"id":1,"result":{"codexHome":"\\\\\\\\?\\\\C:\\\\Users\\\\x\\\\.codex"}}\nnot json\n';
      assert.equal(codexHomeFromReply(out), "\\\\?\\C:\\Users\\x\\.codex");
      assert.equal(codexHomeFromReply("garbage\n"), undefined);
      assert.equal(codexHomeFromReply('{"id":1,"result":{}}\n'), undefined);
    });

    test("D-WIN-CODEX-KEY-1: windows: the dir Codex reports (\\\\?\\ prefix, other case) is the key dir when it is our dir", () => {
      const real = (p) => p;
      const asked = "\\\\?\\C:\\Users\\X\\.codex";
      assert.equal(codexKeyDir({ dir: "c:\\users\\x\\.codex", asked, real }, "win32"), asked);
      assert.equal(codexKeyDir({ dir: "C:\\Users\\x\\.codex\\", asked: "C:\\Users\\X\\.codex", real }, "win32"), "C:\\Users\\X\\.codex");
    });

    test("D-WIN-CODEX-KEY-1: windows: a dir Codex reports that is not our dir is not used", () => {
      const real = (p) => p;
      assert.equal(codexKeyDir({ dir: "C:\\home a\\.codex", asked: "C:\\home b\\.codex", real }, "win32"), "C:\\home a\\.codex");
    });

    test("D-WIN-CODEX-KEY-1: no Codex answer: the real path of our dir (D-HA-CODEX-TRUST-1)", () => {
      const real = (p) => p.replace("link", "real");
      assert.equal(codexKeyDir({ dir: "/h/link/.codex", real }, "linux"), "/h/real/.codex");
    });

    test("D-WIN-CODEX-KEY-1: the codexHome that `codex app-server` reports is the key dir", { skip: process.platform === "win32" && "fake codex is an sh script" }, (t) => {
      const root = tmp(t);
      const dir = path.join(root, "home", ".codex");
      mkdirSync(dir, { recursive: true });
      const bin = path.join(root, "bin");
      mkdirSync(bin);
      const reply = JSON.stringify({ id: 1, result: { codexHome: dir } });
      writeFileSync(path.join(bin, "codex"), `#!/bin/sh\ncat >/dev/null\necho '${reply}'\n`);
      chmodSync(path.join(bin, "codex"), 0o755);
      const entries = codexTrustEntries(path.join(dir, "hooks.json"), DOC, "cmd-a", { PATH: `${bin}:/usr/bin:/bin` });
      assert.equal(keyOf(entries), `${path.join(dir, "hooks.json")}:pre_tool_use:0:0`);
    });

    // Only a real Windows run proves the cmd.exe shim spawn, the \\?\ spelling and the TOML key escape together.
    test("D-WIN-CODEX-KEY-1: windows only: a codex.cmd shim's codexHome spelling is the key dir", { skip: process.platform !== "win32" && "needs cmd.exe" }, (t) => {
      const root = tmp(t);
      const dir = path.join(root, "home dir", ".codex");
      mkdirSync(dir, { recursive: true });
      const bin = path.join(root, "bin");
      mkdirSync(bin);
      const asked = "\\\\?\\" + dir;
      writeFileSync(path.join(bin, "codex.cmd"), `@echo ${JSON.stringify({ id: 1, result: { codexHome: asked } })}\r\n`);
      const env = { PATH: bin, SystemRoot: process.env.SystemRoot, ComSpec: process.env.ComSpec, PATHEXT: ".COM;.EXE;.BAT;.CMD" };
      const entries = codexTrustEntries(path.join(dir, "hooks.json"), DOC, "cmd-a", env);
      assert.equal(keyOf(entries), `${asked}\\hooks.json:pre_tool_use:0:0`);
    });

    // D-TRUST-KEYDIR-2: macOS CI (windows hosts matrix) failed codex doctor "hooks are not trusted". `codex app-server` sometimes
    // exits with empty stdout when stdin closes at once, so the ask returned undefined and the fallback wrote the real path
    // (/private/var/...) while Codex keys a default ~/.codex as spelled (/var/...).
    test("D-TRUST-KEYDIR-2: no CODEX_HOME and no Codex answer: the default dir is keyed as spelled, a symlinked HOME is not resolved", { skip: process.platform === "win32" && "symlink needs privilege" }, (t) => {
      const root = tmp(t);
      mkdirSync(path.join(root, "real", ".codex"), { recursive: true });
      symlinkSync(path.join(root, "real"), path.join(root, "link"));
      const spelled = path.join(root, "link", ".codex");
      const entries = codexTrustEntries(path.join(spelled, "hooks.json"), DOC, "cmd-a", { PATH: "/usr/bin:/bin" });
      assert.equal(keyOf(entries), `${path.join(spelled, "hooks.json")}:pre_tool_use:0:0`);
    });

    test("D-TRUST-KEYDIR-2: CODEX_HOME set and no Codex answer: Codex canonicalises it, so the key uses the real path", { skip: process.platform === "win32" && "symlink needs privilege" }, (t) => {
      const root = tmp(t);
      mkdirSync(path.join(root, "real", ".codex"), { recursive: true });
      symlinkSync(path.join(root, "real"), path.join(root, "link"));
      const spelled = path.join(root, "link", ".codex");
      const entries = codexTrustEntries(path.join(spelled, "hooks.json"), DOC, "cmd-a", { PATH: "/usr/bin:/bin", CODEX_HOME: spelled });
      assert.equal(keyOf(entries), `${path.join(root, "real", ".codex", "hooks.json")}:pre_tool_use:0:0`);
    });

    test("D-TRUST-KEYDIR-2: an empty reply from `codex app-server` is asked again", { skip: process.platform === "win32" && "fake codex is an sh script" }, (t) => {
      const root = tmp(t);
      const dir = path.join(root, "home", ".codex");
      mkdirSync(dir, { recursive: true });
      const bin = path.join(root, "bin");
      mkdirSync(bin);
      const seen = path.join(root, "seen");
      const reply = JSON.stringify({ id: 1, result: { codexHome: dir } });
      writeFileSync(path.join(bin, "codex"), `#!/bin/sh\ncat >/dev/null\nif [ -e "${seen}" ]; then echo '${reply}'; else : > "${seen}"; fi\n`);
      chmodSync(path.join(bin, "codex"), 0o755);
      assert.equal(askCodexHome({ PATH: `${bin}:/usr/bin:/bin` }), dir);
      assert.ok(existsSync(seen));
    });
  });

  describe("ADR-0020 OpenCode plugin gate", { concurrency: true }, () => {
    // D-HF-OPENCODE-GATE-1: OpenCode 1.19.5 loads every entry of the `plugin` list (config.plugin_origins) and skips an
    // entry whose file is missing without an error, so hooks silently do not run. Two ways our hooks stop or double:
    //  - a stale own path entry (the package moved or was upgraded): the file is gone, the hooks never run;
    //  - the native entry `context-mode@next` (opencode plugin context-mode@next --global) plus our absolute path: the
    //    plugin loads twice and every hook fires twice (two `prompt` rows per message in context.db).
    // Setup keeps exactly one working entry; doctor FAILs hook-registered with a one-line fix when it is not so.


    const REPO = path.resolve(import.meta.dirname, "../..");
    const SKILLS = ["ctx-doctor", "ctx-stats", "ctx-upgrade"];

    function pkg(root) {
      const dir = path.join(root, "pkg");
      mkdirSync(path.join(dir, "opencode"), { recursive: true });
      writeFileSync(path.join(dir, "opencode", "plugin.js"), "export default {};\n");
      writeFileSync(path.join(dir, "server.mjs"), `
import { createInterface } from "node:readline";
const tools = ${JSON.stringify([...TOOL_ORDER])};
createInterface({ input: process.stdin }).on("line", (l) => {
  const m = JSON.parse(l);
  if (m.id === undefined) return;
  const result = m.method === "initialize"
    ? { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "context-mode", version: "2.0.0" } }
    : { tools: tools.map((name) => ({ name, inputSchema: { type: "object" } })) };
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: m.id, result }) + "\\n");
});
`);
      writeFileSync(path.join(dir, "hook.mjs"), `let s = ""; process.stdin.on("data", (d) => { s += d; }); process.stdin.on("end", () => { const p = JSON.parse(s); if (!JSON.stringify(p).includes("context-mode-doctor-hook-runs")) return; const t = "deny: run ctx_execute; ctx_search( finds the rest"; process.stderr.write(t + "\\n"); process.stdout.write(JSON.stringify({ decision: "deny", reason: t })); });\n`);
      writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "context-mode", version: "2.0.0" }));
      generateManifests(dir);
      for (const s of SKILLS) cpSync(path.join(REPO, "skills", s), path.join(dir, "skills", s), { recursive: true });
      for (const s of SKILLS) cpSync(path.join(REPO, "skills", s), path.join(dir, "pi", "skills", s), { recursive: true });
      for (const s of SKILLS) cpSync(path.join(REPO, "skills", s), path.join(dir, "claude-code", "skills", s), { recursive: true });
      return dir;
    }

    function sandbox(t) {
      const root = mkdtempSync(path.join(tmpdir(), "cm-oc-gate-"));
      t.after(() => rmSync(root, { recursive: true, force: true }));
      const home = path.join(root, "home");
      const bin = path.join(root, "bin");
      mkdirSync(home, { recursive: true });
      mkdirSync(bin, { recursive: true });
      const win = process.platform === "win32" ? { SystemRoot: process.env.SystemRoot, ComSpec: process.env.ComSpec } : {};
      const file = path.join(home, ".config", "opencode", "opencode.json");
      return { root, home, file, pkgDir: pkg(root),
        env: { PATH: [bin, "/usr/bin", "/bin"].join(path.delimiter), HOME: home, USERPROFILE: home, CM_HOOK_OVERHEAD_BUDGET_MS: "60000", ...win } };
    }

    function put(s, doc) {
      mkdirSync(path.dirname(s.file), { recursive: true });
      writeFileSync(s.file, JSON.stringify(doc, null, 2) + "\n");
    }
    const plugins = (s) => JSON.parse(readFileSync(s.file, "utf8")).plugin;
    const own = (s) => path.join(s.pkgDir, "opencode", "plugin.js");
    const opts = (s) => ({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: ["opencode"] });
    const registered = (d) => d.agents[0].checks.find((c) => c.name === "hook-registered");

    test("native entry context-mode@next: setup adds no second plugin entry, doctor passes hook-registered", async (t) => {
      const s = sandbox(t);
      put(s, { plugin: ["context-mode@next"] });
      const res = await runSetup({ ...opts(s), runId: "a" });
      assert.equal(res.exitCode, 0, JSON.stringify(res.agents.map((a) => [a.id, a.status, a.reason])));
      assert.deepEqual(plugins(s), ["context-mode@next"], "one entry: the native one loads the hooks");
      const d = await runDoctor(opts(s));
      assert.equal(registered(d).ok, true, JSON.stringify(registered(d)));
    });

    test("native entry plus our path entry (loads twice): doctor FAILs hook-registered, setup drops our path entry only", async (t) => {
      const s = sandbox(t);
      put(s, { plugin: ["my-own-plugin", "context-mode@next", own(s)] });
      const d = await runDoctor(opts(s));
      const c = registered(d);
      assert.equal(c.ok, false, "two entries is a FAIL");
      assert.ok(c.detail.includes("twice") && c.detail.includes("context-mode setup"), c.detail);
      const res = await runSetup({ ...opts(s), runId: "b" });
      assert.equal(res.exitCode, 0, JSON.stringify(res.agents.map((a) => [a.id, a.status, a.reason])));
      assert.deepEqual(plugins(s), ["my-own-plugin", "context-mode@next"], "user entry and native entry kept");
      assert.equal(registered(await runDoctor(opts(s))).ok, true);
    });

    test("stale own path entry (the file is gone): doctor FAILs hook-registered, setup swaps it for the live path", async (t) => {
      const s = sandbox(t);
      const stale = path.join(s.root, "old-prefix", "node_modules", "context-mode", "opencode", "plugin.js");
      put(s, { plugin: ["my-own-plugin", stale] });
      const c = registered(await runDoctor(opts(s)));
      assert.equal(c.ok, false, "a missing plugin file never loads");
      assert.ok(c.detail.includes("missing") && c.detail.includes("context-mode setup"), c.detail);
      const res = await runSetup({ ...opts(s), runId: "c" });
      assert.equal(res.exitCode, 0, JSON.stringify(res.agents.map((a) => [a.id, a.status, a.reason])));
      assert.deepEqual(plugins(s), ["my-own-plugin", own(s)]);
      assert.equal(registered(await runDoctor(opts(s))).ok, true);
    });

    test("a user plugin that is a missing file but not ours is never touched", async (t) => {
      const s = sandbox(t);
      const theirs = path.join(s.root, "gone", "my-plugin.js");
      put(s, { plugin: [theirs] });
      await runSetup({ ...opts(s), runId: "d" });
      assert.deepEqual(plugins(s), [theirs, own(s)]);
    });

    test("remove after the native-entry setup restores the original bytes", async (t) => {
      const s = sandbox(t);
      put(s, { plugin: ["context-mode@next", own(s)] });
      const before = readFileSync(s.file, "utf8");
      const res = await runSetup({ ...opts(s), runId: "e" });
      assert.equal(res.exitCode, 0);
      assert.equal(runRemove({ home: s.home, env: s.env }).exitCode, 0);
      assert.equal(readFileSync(s.file, "utf8"), before);
    });
  });

  describe("ADR-0020 OpenCode plugin entry path", { concurrency: true }, () => {
    // OC-WIN-4 (D-WIN-OCENTRY-1): the opencode plugin entry is the absolute path of opencode/plugin.js, written bare.
    // OpenCode 1.19.4 (binary strings, resolver for config `plugin` entries): a value that is `file://`, starts with `.`,
    // is absolute, or starts with a drive letter + `:` + `\` or `/` is a file entry, and an absolute or drive-letter
    // value is turned into a file URL with pathToFileURL (so spaces and backslashes are encoded by OpenCode itself).
    // Writing a file:// URL here would be a second spelling of the same entry. This test runs on every OS with fake
    // Windows paths and fails if the entry stops being a plain absolute path under the package dir.


    const WIN_HOME = "C:\\Users\\Jane Doe";
    const WIN_PKG = "C:\\Users\\Jane Doe\\AppData\\Roaming\\npm\\node_modules\\context-mode";

    function isDriveLetterPath(s) {
      const c = s.charCodeAt(0);
      const letter = (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
      return letter && s[1] === ":" && (s[2] === "\\" || s[2] === "/");
    }

    test("OC-WIN-4: the opencode plugin entry is a bare drive-letter path OpenCode's resolver accepts", () => {
      const row = buildRegistry({ home: WIN_HOME, pkgDir: WIN_PKG, env: {} }).find((r) => r.id === "opencode");
      assert.equal(row.hookInstall.kind, "plugin-list");
      const entry = row.hookInstall.entry;
      assert.ok(entry.startsWith(WIN_PKG), "entry is under the package dir: " + entry);
      assert.ok(entry.endsWith("plugin.js"), "entry names plugin.js: " + entry);
      assert.ok(isDriveLetterPath(entry), "entry is a drive-letter path: " + entry);
      assert.ok(!entry.startsWith("file:"), "no file URL spelling: " + entry);
    });

    test("OC-WIN-4: a POSIX package dir with a space stays a bare absolute path", () => {
      const pkg = "/Users/jane doe/.npm-global/lib/node_modules/context-mode";
      const row = buildRegistry({ home: "/Users/jane doe", pkgDir: pkg, env: {} }).find((r) => r.id === "opencode");
      assert.equal(row.hookInstall.entry, path.join(pkg, "opencode", "plugin.js"));
      assert.ok(!row.hookInstall.entry.startsWith("file:"));
    });
  });

  describe("ADR-0020 hook entry survives a node or package path change", { concurrency: true }, () => {
    // Z-WIN-4 (D-WIN-HOOKMERGE-1): setup finds its own hook entries by a stable marker (hook.mjs ... --agent <id>), not by the
    // full command. When the node path or the package dir changes between runs (node upgrade, C:\ vs c:\, nvm-windows switch,
    // 8.3 short name), the old own entry is replaced, not left next to the new one. Runs on every OS: both package dirs are
    // real temp dirs, only the path text differs.


    const REPO = path.resolve(import.meta.dirname, "../..");

    function pkg(root, name) {
      const pkgDir = path.join(root, name);
      mkdirSync(pkgDir, { recursive: true });
      writeFileSync(path.join(pkgDir, "server.mjs"), `
import { createInterface } from "node:readline";
const tools = ${JSON.stringify([...TOOL_ORDER])};
createInterface({ input: process.stdin }).on("line", (l) => {
  const m = JSON.parse(l);
  if (m.id === undefined) return;
  const result = m.method === "initialize"
    ? { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "context-mode", version: "2.0.0" } }
    : { tools: tools.map((name) => ({ name, inputSchema: { type: "object" } })) };
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: m.id, result }) + "\\n");
});
`);
      writeFileSync(path.join(pkgDir, "hook.mjs"), `let s = ""; process.stdin.on("data", (d) => { s += d; }); process.stdin.on("end", () => { const t = "deny: run ctx_execute; ctx_search( finds the rest"; process.stderr.write(t + "\\n"); process.stdout.write(JSON.stringify({ decision: "deny", reason: t })); });\n`);
      writeFileSync(path.join(pkgDir, "package.json"), JSON.stringify({ name: "context-mode", version: "2.0.0" }));
      generateManifests(pkgDir);
      for (const sub of ["skills", "pi/skills", "claude-code/skills"]) {
        for (const k of ["ctx-doctor", "ctx-stats", "ctx-upgrade"]) cpSync(path.join(REPO, "skills", k), path.join(pkgDir, sub, k), { recursive: true });
      }
      return pkgDir;
    }

    // Every string value in a JSON value, in order.
    function strings(v, out = []) {
      if (typeof v === "string") out.push(v);
      else if (Array.isArray(v)) for (const x of v) strings(x, out);
      else if (v && typeof v === "object") for (const x of Object.values(v)) strings(x, out);
      return out;
    }

    const FILES = { zcode: [".zcode", "cli", "config.json"], kiro: [".kiro", "hooks", "context-mode.json"], vscode: [".copilot", "hooks", "context-mode-vscode.json"] };

    for (const agent of Object.keys(FILES)) {
      test(`Z-WIN-4: ${agent}: a second setup from another package dir replaces the old own hook entries`, async (t) => {
        const root = mkdtempSync(path.join(tmpdir(), "cm-hook-path-"));
        t.after(() => rmSync(root, { recursive: true, force: true }));
        const home = path.join(root, "home");
        mkdirSync(home, { recursive: true });
        const env = { PATH: "/usr/bin:/bin", HOME: home, USERPROFILE: home, CM_HOOK_OVERHEAD_BUDGET_MS: "60000" };
        const oldDir = pkg(root, "old pkg");
        const newDir = pkg(root, "new pkg");
        const file = path.join(home, ...FILES[agent]);
        const first = await runSetup({ home, pkgDir: oldDir, env, agents: [agent], runId: "a" });
        assert.equal(first.exitCode, 0, JSON.stringify(first.agents.map((a) => [a.id, a.status, a.reason])));
        const second = await runSetup({ home, pkgDir: newDir, env, agents: [agent], runId: "b" });
        assert.equal(second.exitCode, 0, JSON.stringify(second.agents.map((a) => [a.id, a.status, a.reason])));
        const text = readFileSync(file, "utf8");
        const own = strings(JSON.parse(text)).filter((s) => isOwnHookCommand(s, agent));
        assert.ok(own.length > 0, "own commands exist");
        for (const s of own) assert.ok(s.includes(path.join(newDir, "hook.mjs")), "only the new package dir is left: " + s);
        assert.equal(text.includes(path.join(oldDir, "hook.mjs")), false, "old package dir is gone");
      });
    }

    test("Z-WIN-4: isOwnHookCommand matches hook.mjs + --agent <id> by string split and nothing else", () => {
      const win = '"C:\\Program Files\\nodejs\\node.exe" "C:\\Users\\Jane Doe\\AppData\\Roaming\\npm\\node_modules\\context-mode\\hook.mjs" --agent zcode';
      const low = win.split("C:\\").join("c:\\");
      assert.equal(isOwnHookCommand(win, "zcode"), true);
      assert.equal(isOwnHookCommand(low, "zcode"), true, "drive letter case");
      assert.equal(isOwnHookCommand("& " + win, "zcode"), true, "powershell field");
      assert.equal(isOwnHookCommand('"/n/node" "/p/hook.mjs" --agent zcode', "zcode"), true);
      assert.equal(isOwnHookCommand(win, "kiro"), false, "other agent");
      assert.equal(isOwnHookCommand('"/n/node" "/p/hook.mjs" --agent zcode-extra', "zcode"), false, "id is a whole word");
      assert.equal(isOwnHookCommand("my-own-hook", "zcode"), false);
      assert.equal(isOwnHookCommand('node "/p/other.mjs" --agent zcode', "zcode"), false);
      assert.equal(isOwnHookCommand("context-mode hook zcode PreToolUse", "zcode"), false, "v1 command is not this marker");
      assert.equal(isOwnHookCommand(5, "zcode"), false);
    });
  });
});
