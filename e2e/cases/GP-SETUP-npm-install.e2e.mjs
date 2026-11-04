// GP-SETUP-npm-install: npm pack -> npm i -g (temp prefix, temp HOME) -> context-mode setup --yes --json for every
// agent on the fake-binary path -> second run changes nothing -> doctor passes -> setup --remove restores the HOME
// tree byte for byte. ADR-0019 D1/D2/D4/D7. Black box: spawns the packed bin only, no src/ import (GS4).
// The agent CLIs (claude, codex, gemini, qwen, copilot, pi, opencode) are fakes: a node script behind a shim that keeps
// its state outside HOME, so the only HOME writes are the ones setup makes. Real CLIs are not installed (network, auth).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { vscodeMcpFile } from "../harness/vscode-user-dir.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const WIN = process.platform === "win32";
const VERSION = "2.0.0";
const STATE_DIR = ".context-mode";

// Agents with a fake CLI: setup finds the bin on PATH. Config-file agents (vscode, kiro, zcode) need no CLI.
const CLI_AGENTS = [
  { id: "claude-code", bin: "claude" }, { id: "codex", bin: "codex" }, { id: "gemini", bin: "gemini" },
  { id: "qwen", bin: "qwen" }, { id: "copilot-cli", bin: "copilot" }, { id: "pi", bin: "pi" }, { id: "opencode", bin: "opencode" },
];
const FILE_AGENTS = ["vscode", "kiro", "zcode"];
const ALL_AGENTS = [...CLI_AGENTS.map((a) => a.id), ...FILE_AGENTS];

// The fake CLI. argv: <agent> <host args...>. State lives in FAKE_STATE, never in HOME.
const FAKE_CLI = `import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
const [agent, ...args] = process.argv.slice(2);
const state = path.join(process.env.FAKE_STATE, agent);
const home = process.env.HOME;
const has = (w) => args.includes(w);
const fileHolds = (f) => existsSync(f) && readFileSync(f, "utf8").includes("context-mode");
if (has("list")) {
  const own = agent === "codex" ? fileHolds(path.join(home, ".codex", "config.toml"))
    : agent === "opencode" ? fileHolds(path.join(home, ".config", "opencode", "opencode.json")) : existsSync(state);
  if (own) console.log("context-mode");
} else if (has("uninstall") || has("remove")) {
  rmSync(state, { force: true });
} else if (has("install") || has("link") || (agent === "copilot" && has("add"))) {
  mkdirSync(path.dirname(state), { recursive: true });
  writeFileSync(state, args.join(" "));
}
`;

function sha(file) { return createHash("sha256").update(readFileSync(file)).digest("hex"); }

function walk(dir, base = dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? walk(p, base) : [path.relative(base, p).split(path.sep).join("/")];
  });
}

/** HOME file map (relative path -> sha256), without setup's own state dir. */
function snapshot(home) {
  const m = new Map();
  for (const rel of walk(home)) if (!rel.startsWith(STATE_DIR + "/")) m.set(rel, sha(path.join(home, rel)));
  return m;
}

function writeJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
}

const v1Hooks = (event, platform) => ({ hooks: { PreToolUse: [{ matcher: "*", hooks: [{ type: "command", command: `context-mode hook ${platform} ${event}` }] }] } });

test("[M6] GP-SETUP/npm-pack-install-setup-twice-remove: the packed npm bin sets up every agent, is idempotent, and --remove restores HOME", { timeout: 600_000 }, (t) => {
  const tmp = mkdtempSync(path.join(tmpdir(), "cm-setup-e2e-"));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const home = path.join(tmp, "home");
  const prefix = path.join(tmp, "prefix");
  const fakeBin = path.join(tmp, "fakebin");
  const fakeState = path.join(tmp, "fakestate");
  const outDir = path.join(tmp, "out");
  const packDir = path.join(tmp, "pack");
  // D-HF-CLAUDE-SHIM-1: setup runs only the real Claude Code (a native binary or a file of the
  // @anthropic-ai/claude-code package), so the claude fake lives in that package's dir, which is on PATH.
  const claudePkg = path.join(tmp, "fakepkg", "node_modules", "@anthropic-ai", "claude-code");
  for (const d of [home, prefix, fakeBin, fakeState, packDir, claudePkg]) mkdirSync(d, { recursive: true });
  writeFileSync(path.join(claudePkg, "package.json"), JSON.stringify({ name: "@anthropic-ai/claude-code", version: "2.0.0" }));

  // ---- build + pack ----
  execFileSync(process.execPath, [path.join(REPO_ROOT, "build", "build.mjs"), "--out", outDir, "--version", VERSION], { cwd: REPO_ROOT, stdio: "pipe" });
  const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: "utf8", shell: WIN, windowsHide: true, ...opts });
  const pathKey = Object.keys(process.env).find((k) => k.toLowerCase() === "path") ?? "PATH";
  const binDir = WIN ? prefix : path.join(prefix, "bin");
  const env = {
    ...process.env, HOME: home, USERPROFILE: home, FAKE_STATE: fakeState,
    npm_config_cache: path.join(tmp, "npm-cache"), npm_config_userconfig: path.join(tmp, "npmrc"),
    npm_config_update_notifier: "false", npm_config_audit: "false", npm_config_fund: "false",
    [pathKey]: [fakeBin, claudePkg, binDir, process.env[pathKey] ?? ""].join(path.delimiter),
  };
  delete env.CLAUDE_PROJECT_DIR;
  delete env.XDG_CONFIG_HOME; delete env.OPENCODE_CONFIG_DIR; // D-WIN-OPENCODE-DIR-1: the fake CLI and setup both use <home>/.config/opencode
  // D3 timing is gated once, by e2e/checks/setup-hook-overhead.mjs (DEVIATIONS D-CI-PERF-1). This functional case
  // lifts the product's timing knob so shared-runner jitter cannot fail setup or doctor; every other check still runs.
  env.CM_HOOK_OVERHEAD_BUDGET_MS = "60000";
  const packed = JSON.parse(sh("npm", ["pack", "--json", "--pack-destination", packDir], { cwd: outDir, env, shell: WIN }))[0];

  // D1: the tarball file list equals the release tree, and package.json is a SHA256SUMS row.
  const sums = new Map(readFileSync(path.join(outDir, "SHA256SUMS"), "utf8").trim().split("\n").map((l) => { const [h, ...r] = l.split("  "); return [r.join("  "), h]; }));
  assert.deepEqual([...packed.files.map((f) => f.path)].sort(), [...sums.keys(), "SHA256SUMS"].sort(), "tarball files = SHA256SUMS rows + SHA256SUMS");
  assert.ok(sums.has("package.json") && sums.has("cli.mjs"), "package.json and cli.mjs are listed in SHA256SUMS");

  // ---- npm i -g into the temp prefix ----
  sh("npm", ["i", "-g", "--prefix", prefix, "--no-audit", "--no-fund", path.join(packDir, packed.filename)], { env, stdio: "pipe" });
  const pkgDir = WIN ? path.join(prefix, "node_modules", "context-mode") : path.join(prefix, "lib", "node_modules", "context-mode");
  const installed = walk(pkgDir).sort();
  assert.deepEqual(installed, [...sums.keys(), "SHA256SUMS"].sort(), "installed tree = release tree");
  for (const [rel, h] of sums) assert.equal(sha(path.join(pkgDir, rel)), h, `installed ${rel} hash = SHA256SUMS`);
  const pkg = JSON.parse(readFileSync(path.join(pkgDir, "package.json"), "utf8"));
  assert.equal(pkg.version, VERSION);
  assert.equal(pkg.dependencies, undefined, "D1: no dependencies");
  assert.equal(pkg.scripts, undefined, "D1: no install scripts");

  const cm = (args, opts = {}) => {
    try {
      const stdout = sh(WIN ? path.join(prefix, "context-mode.cmd") : path.join(binDir, "context-mode"), args, { env, stdio: ["ignore", "pipe", "pipe"], ...opts });
      return { code: 0, stdout };
    } catch (e) { return { code: e.status, stdout: `${e.stdout ?? ""}`, stderr: `${e.stderr ?? ""}` }; }
  };
  assert.equal(cm(["--version"]).stdout.trim(), VERSION, "the npm bin runs and reports the version");

  // ---- fake agent CLIs ----
  writeFileSync(path.join(tmp, "fake-cli.mjs"), FAKE_CLI);
  for (const { id, bin } of CLI_AGENTS) {
    const shim = path.join(id === "claude-code" ? claudePkg : fakeBin, WIN ? `${bin}.cmd` : bin);
    if (WIN) writeFileSync(shim, `@"${process.execPath}" "${path.join(tmp, "fake-cli.mjs")}" ${bin === "copilot" ? "copilot" : id} %*\r\n`);
    else { writeFileSync(shim, `#!/bin/sh\nexec "${process.execPath}" "${path.join(tmp, "fake-cli.mjs")}" ${bin === "copilot" ? "copilot" : id} "$@"\n`); chmodSync(shim, 0o755); }
  }

  // ---- seed HOME: user files setup must keep or restore; v1 hook commands (D4) ----
  mkdirSync(path.join(home, ".codex"), { recursive: true });
  writeFileSync(path.join(home, ".codex", "config.toml"), 'model = "mine"\n');
  writeJson(path.join(home, ".codex", "hooks.json"), v1Hooks("pretooluse", "codex"));
  writeJson(path.join(home, ".claude", "settings.json"), { model: "mine", ...v1Hooks("pretooluse", "claude-code") });
  writeJson(path.join(home, ".gemini", "settings.json"), { theme: "mine", ...v1Hooks("beforetool", "gemini-cli") });
  writeJson(path.join(home, ".config", "opencode", "opencode.json"), { theme: "mine" });
  writeJson(vscodeMcpFile(home, env), { servers: { mine: { command: "x" } } });
  const before = snapshot(home);

  // ---- setup ----
  const agentsArg = ALL_AGENTS.join(",");
  const first = cm(["setup", "--yes", "--agents", agentsArg, "--json"]);
  assert.equal(first.code, 0, `setup exit code; stdout=${first.stdout} stderr=${first.stderr}`);
  const r1 = JSON.parse(first.stdout.trim().split("\n").pop());
  assert.deepEqual(r1.agents.map((a) => a.id).sort(), [...ALL_AGENTS].sort());
  for (const a of r1.agents) {
    assert.equal(a.status, "PASS", `${a.id}: ${a.reason ?? ""}`);
    assert.ok(a.checks.length >= 2, `${a.id}: verify steps ran`);
    for (const c of a.checks) assert.equal(c.ok, true, `${a.id} ${c.name}: ${c.detail ?? ""}`);
    assert.ok(a.checks.some((c) => c.name === "mcp"), `${a.id}: mcp tools/list step`);
  }
  const hooked = r1.agents.filter((a) => a.checks.some((c) => c.name === "hook"));
  assert.ok(hooked.length >= 5, "hook step ran for the hook agents");
  for (const a of hooked) {
    const h = a.checks.find((c) => c.name === "hook");
    for (const k of ["overheadP95Ms", "wallP95Ms", "bareP95Ms"]) assert.ok(Number.isFinite(h[k]) && h[k] >= 0, `${a.id}: hook ${k} recorded`);
    t.diagnostic(`${a.id} hook overhead p95 ${h.overheadP95Ms} ms (wall ${h.wallP95Ms}, bare ${h.bareP95Ms}); gated by e2e/checks/setup-hook-overhead.mjs`);
  }
  // D4: the v1 hook command became the absolute form; no v1 command remains.
  const codexHooks = readFileSync(path.join(home, ".codex", "hooks.json"), "utf8");
  assert.ok(!codexHooks.includes("context-mode hook"), "codex v1 hook form rewritten");
  assert.ok(codexHooks.includes("hook.mjs") && codexHooks.includes("--agent codex"), "codex hook is node <abs>/hook.mjs --agent codex");
  assert.ok(!readFileSync(path.join(home, ".claude", "settings.json"), "utf8").includes("context-mode hook"), "claude v1 hook dropped (the plugin ships its own)");
  const afterFirst = snapshot(home);

  // ---- second run: nothing changes ----
  const second = cm(["setup", "--yes", "--agents", agentsArg, "--json"]);
  assert.equal(second.code, 0, `second setup; ${second.stdout} ${second.stderr}`);
  const r2 = JSON.parse(second.stdout.trim().split("\n").pop());
  for (const a of r2.agents) {
    assert.equal(a.status, "PASS", `${a.id} second run: ${a.reason ?? ""}`);
    assert.deepEqual(a.changes, [], `${a.id}: second run plans no change`);
  }
  assert.deepEqual(snapshot(home), afterFirst, "second run leaves every HOME file byte for byte as it was");

  // ---- doctor is green and read-only ----
  const doc = cm(["doctor", "--agents", agentsArg, "--json"]);
  assert.equal(doc.code, 0, `doctor; ${doc.stdout} ${doc.stderr}`);
  assert.deepEqual(snapshot(home), afterFirst, "doctor writes nothing");

  // ---- --remove restores the pre-setup HOME ----
  const rm = cm(["setup", "--remove", "--yes", "--json"]);
  assert.equal(rm.code, 0, `remove; ${rm.stdout} ${rm.stderr}`);
  const restored = snapshot(home);
  assert.deepEqual([...restored.keys()].sort(), [...before.keys()].sort(), "same file set as before setup");
  for (const [rel, h] of before) assert.equal(restored.get(rel), h, `${rel} restored byte for byte`);
  assert.deepEqual(walk(fakeState), [], "every fake CLI install was undone");
});
