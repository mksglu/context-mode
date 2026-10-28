// Unit tests for scripts/release/smoke.mjs (impl/13-build-release.md §11.2, DEVIATIONS D-M6-arch-5, D-M6-P3-1..3).
// Runs the real script against a local bare repo (file://) with stub agent CLIs on PATH; nothing leaves the machine.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SCRIPT = path.join(REPO, "scripts", "release", "smoke.mjs");
const GIT_ENV = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };
const POSIX = process.platform !== "win32";

function git(cwd, ...args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", env: GIT_ENV });
  assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
}

// A fake MCP server: answers the first request line with an initialize result named <name>.
const serverSrc = (name) => `process.stdin.once("data", (d) => { const m = JSON.parse(String(d).split("\\n")[0]);
process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: m.id, result: { protocolVersion: m.params.protocolVersion, capabilities: {}, serverInfo: { name: ${JSON.stringify(name)}, version: "t" } } }) + "\\n"); process.exit(0); });\n`;

// Stub CLIs (test code; they read only what smoke.mjs writes). Each records the HOME it saw in $TMPDIR/probe-<cli>.json.
const STUBS = {
  claude: `const fs = require("fs"), path = require("path"), cp = require("child_process");
const a = process.argv.slice(2), H = process.env.HOME, st = path.join(H, "stub-claude.json");
fs.writeFileSync(path.join(process.env.TMPDIR, "probe-claude.json"), JSON.stringify({ home: H, argv: a }));
const s = fs.existsSync(st) ? JSON.parse(fs.readFileSync(st, "utf8")) : {};
const save = () => fs.writeFileSync(st, JSON.stringify(s));
if (a[1] === "marketplace") { s.mkt = JSON.parse(fs.readFileSync(path.join(a[3], ".claude-plugin", "marketplace.json"), "utf8")); s.root = a[3]; save(); }
else if (a[1] === "install" && typeof s.mkt.plugins[0].source === "string") { const p = s.mkt.plugins[0]; const dir = path.join(H, ".claude", "plugins", "cache", s.mkt.name, p.name, "v");
  fs.cpSync(path.join(s.root, p.source), dir, { recursive: true }); s.id = a[2]; s.dir = dir; save(); }
else if (a[1] === "install") { const p = s.mkt.plugins[0]; const dir = path.join(H, ".claude", "plugins", "cache", s.mkt.name, p.name, "v");
  cp.execFileSync("git", ["clone", "-q", "--branch", p.source.ref, p.source.url, dir]); s.id = a[2]; s.dir = dir; save(); }
else if (a[1] === "list") process.stdout.write(JSON.stringify(s.id ? [{ id: s.id, installPath: s.dir }] : []));
else if (a[1] === "validate") process.exit(fs.existsSync(path.join(a[2], ".claude-plugin", "plugin.json")) ? 0 : 1);
else process.exit(2);`,
  codex: `const fs = require("fs"), path = require("path");
fs.writeFileSync(path.join(process.env.TMPDIR, "probe-codex.json"), JSON.stringify({ home: process.env.HOME, codexHome: process.env.CODEX_HOME }));
const lines = fs.readFileSync(path.join(process.env.CODEX_HOME, "config.toml"), "utf8").split("\\n");
const val = (k) => JSON.parse(lines.find((l) => l.startsWith(k + " = ")).slice(k.length + 3));
process.stdout.write(JSON.stringify([{ name: lines[0].slice(1, -1).split(".")[1], transport: { type: "stdio", command: val("command"), args: val("args") } }]));`,
  gemini: `process.stderr.write("not logged in\\n"); process.exit(41);`,
  // qwen: `extensions install <dir>:<plugin> --consent` copies <dir> to $HOME/.qwen/extensions/<plugin>
  qwen: `const fs = require("fs"), path = require("path");
const a = process.argv.slice(2), src = a[2].slice(0, a[2].lastIndexOf(":")), name = a[2].slice(a[2].lastIndexOf(":") + 1);
fs.cpSync(src, path.join(process.env.HOME, ".qwen", "extensions", name), { recursive: true });
process.stdout.write("Extension installed\\n");`,
};

// tmp root: bare repo with branch release-staging carrying a tiny release tree; bin dir with node + git + chosen stubs.
function fixture(t, { stubs = [], serverName = "context-mode" } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "cm-v2-smoke-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const bare = path.join(root, "remote.git");
  const seed = path.join(root, "seed");
  git(root, "init", "-q", "--bare", bare);
  git(root, "init", "-q", "-b", "release-staging", seed);
  mkdirSync(path.join(seed, ".claude-plugin"));
  writeFileSync(path.join(seed, ".claude-plugin", "plugin.json"), JSON.stringify({ name: "context-mode", version: "0.0.0-dev" }));
  writeFileSync(path.join(seed, "server.mjs"), serverSrc(serverName));
  git(seed, "add", "-A");
  git(seed, "commit", "-q", "-m", "release v0.0.0");
  git(seed, "push", "-q", bare, "release-staging");
  const bin = path.join(root, "bin");
  mkdirSync(bin);
  symlinkSync(process.execPath, path.join(bin, "node"));
  for (const name of stubs) {
    writeFileSync(path.join(bin, name), `#!${process.execPath}\n${STUBS[name]}\n`);
    chmodSync(path.join(bin, name), 0o755);
  }
  const tmp = path.join(root, "tmp");
  mkdirSync(tmp);
  // The dir on this process's PATH that holds git (git.exe on Windows). No `which`: Windows has none,
  // and Git for Windows' libexec/git-core binary needs DLLs from another dir (M7-W5).
  const gitDir = (process.env.PATH ?? "").split(path.delimiter)
    .find((d) => d !== "" && ["git", "git.exe"].some((n) => existsSync(path.join(d, n))));
  assert.ok(gitDir, "git on PATH");
  const PATH = [bin, gitDir].join(path.delimiter);
  return { root, repo: pathToFileURL(bare).href, tmp, PATH, stubs };
}

function smoke(fx, ...args) {
  // The claude stubs are scripts, not binaries: name the stub explicitly (D-FU-RF-2); PATH resolution has its own tests.
  const override = fx.stubs.includes("claude") ? { CONTEXT_MODE_SMOKE_CLAUDE: path.join(fx.root, "bin", "claude") } : {};
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: REPO, encoding: "utf8",
    env: { PATH: fx.PATH, HOME: process.env.HOME, TMPDIR: fx.tmp, ...override, ...(fx.env ?? {}) } });
  return { status: r.status, out: r.stdout, err: r.stderr };
}
const smokeHomes = (fx) => readdirSync(fx.tmp).filter((n) => n.startsWith("context-mode-smoke-"));

test("[M6] release/smoke: unknown --agent exits 1 and names the four agents", (t) => {
  const fx = fixture(t);
  const r = smoke(fx, "--ref", "release-staging", "--agent", "nope", "--repo", fx.repo);
  assert.equal(r.status, 1);
  assert.ok(r.err.includes("claude-code, codex, gemini, qwen"), r.err);
});

test("[M6] release/smoke: gemini CLI absent is SKIPPED, exit 0", (t) => {
  const fx = fixture(t);
  const r = smoke(fx, "--ref", "release-staging", "--agent", "gemini", "--repo", fx.repo);
  assert.equal(r.status, 0, r.err);
  assert.equal(r.out, "gemini: SKIPPED: gemini not available\n");
});

test("[M6] release/smoke: gemini CLI present but failing (not logged in) is SKIPPED, exit 0", { skip: !POSIX }, (t) => {
  const fx = fixture(t, { stubs: ["gemini"] });
  const r = smoke(fx, "--ref", "release-staging", "--agent", "gemini", "--repo", fx.repo);
  assert.equal(r.status, 0, r.err);
  assert.equal(r.out, "gemini: SKIPPED: gemini not available\n");
});

test("[M6] release/smoke: codex clones <repo>@<ref>, writes the config.toml entry, server answers initialize", { skip: !POSIX }, (t) => {
  const fx = fixture(t, { stubs: ["codex"] });
  const r = smoke(fx, "--ref", "release-staging", "--agent", "codex", "--repo", fx.repo);
  assert.equal(r.status, 0, r.err);
  assert.ok(r.out.startsWith("codex: PASS: "), r.out);
  const probe = JSON.parse(readFileSync(path.join(fx.tmp, "probe-codex.json"), "utf8"));
  assert.equal(probe.codexHome, path.join(probe.home, ".codex"));
  assert.ok(probe.home.startsWith(realpathSync.native(fx.tmp)), "CODEX_HOME sits in the throwaway HOME");
  assert.deepEqual(smokeHomes(fx), [], "throwaway HOME removed");
});

// D-RN-WIN-1: v2.0.0-next.1 smoke (windows-latest) failed "spawnSync codex ENOENT": npm on Windows puts only
// codex.cmd/codex.ps1 on PATH. An npm-style .cmd shim per agent CLI, in a dir whose name has a space.
function winShim(fx, name, src) {
  const dir = path.join(fx.root, "npm bin");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${name}.js`), `${src}\n`);
  writeFileSync(path.join(dir, `${name}.cmd`), `@"${process.execPath}" "%~dp0${name}.js" %*\r\n`);
  fx.PATH = [dir, path.dirname(process.execPath), fx.PATH].join(path.delimiter); // node.exe for the server handshake
  fx.env = { TEMP: fx.tmp, TMP: fx.tmp, SystemRoot: process.env.SystemRoot, ComSpec: process.env.ComSpec };
}

test("[RN] release/smoke: on Windows codex is the npm codex.cmd shim; smoke runs it and passes (D-RN-WIN-1)", { skip: POSIX && "cmd.exe is Windows only" }, (t) => {
  const fx = fixture(t);
  winShim(fx, "codex", STUBS.codex);
  const r = smoke(fx, "--ref", "release-staging", "--agent", "codex", "--repo", fx.repo);
  assert.equal(r.status, 0, r.err);
  assert.ok(r.out.startsWith("codex: PASS: "), r.out);
  assert.deepEqual(smokeHomes(fx), [], "throwaway HOME removed");
});

test("[RN] release/smoke: on Windows gemini is the npm gemini.cmd shim; smoke runs it with every argument (D-RN-WIN-1)", { skip: POSIX && "cmd.exe is Windows only" }, (t) => {
  const fx = fixture(t);
  winShim(fx, "gemini", `require("fs").writeFileSync(require("path").join(process.env.TMPDIR, "probe-gemini.json"), JSON.stringify(process.argv.slice(2)));`);
  const r = smoke(fx, "--ref", "release-staging", "--agent", "gemini", "--repo", fx.repo);
  assert.equal(r.status, 0, r.err);
  assert.ok(r.out.startsWith("gemini: PASS: "), r.out);
  assert.deepEqual(JSON.parse(readFileSync(path.join(fx.tmp, "probe-gemini.json"), "utf8")),
    ["extensions", "install", fx.repo, "--ref", "release-staging", "--auto-update", "--consent", "--skip-settings"]);
});

// D-RN-GEM-1: v2.0.0-next.2 smoke (ubuntu/macos) hung 20 min on the gemini step. gemini 0.65 relaunches itself as a
// child node process (stdio inherited, so the child holds smoke's pipes) and, without --consent, the child asks
// "workspace ... is not trusted ... Do you want to continue? [Y/n]" and waits. This stub does the same: the
// relaunched child records its argv, passes on --consent, and otherwise waits (bounded, so no process is left behind).
const geminiRelaunch = (childBody) => `const cp = require("child_process"), fs = require("fs"), path = require("path");
const a = process.argv.slice(2);
if (!process.env.STUB_GEMINI_CHILD) {
  const c = cp.spawn(process.execPath, [__filename, ...a], { stdio: "inherit", env: { ...process.env, STUB_GEMINI_CHILD: "1" } });
  c.on("exit", (code) => process.exit(code ?? 1));
} else { ${childBody} }`;
const GEMINI_065 = geminiRelaunch(`fs.writeFileSync(path.join(process.env.TMPDIR, "probe-gemini.json"), JSON.stringify(a));
  if (a.includes("--consent")) { process.stdout.write('Extension "context-mode" installed successfully and enabled.\\n'); process.exit(0); }
  process.stdout.write("The current workspace is not trusted. Do you want to continue? [Y/n]: ");
  setTimeout(() => process.exit(1), 20000);`);
const GEMINI_HANG = geminiRelaunch(`setTimeout(() => process.exit(1), 20000);`);

function geminiStub(fx, src) {
  writeFileSync(path.join(fx.root, "bin", "gemini"), `#!${process.execPath}\n${src}\n`);
  chmodSync(path.join(fx.root, "bin", "gemini"), 0o755);
}

test("[RN] release/smoke: gemini install runs with --consent and --skip-settings, so no trust prompt waits (D-RN-GEM-1)", { skip: !POSIX }, (t) => {
  const fx = fixture(t);
  geminiStub(fx, GEMINI_065);
  const t0 = Date.now();
  const r = smoke(fx, "--ref", "release-staging", "--agent", "gemini", "--repo", fx.repo);
  assert.equal(r.status, 0, r.err);
  assert.equal(r.out, `gemini: PASS: gemini extensions install ${fx.repo} --ref release-staging passed\n`);
  assert.deepEqual(JSON.parse(readFileSync(path.join(fx.tmp, "probe-gemini.json"), "utf8")),
    ["extensions", "install", fx.repo, "--ref", "release-staging", "--auto-update", "--consent", "--skip-settings"]);
  assert.ok(Date.now() - t0 < 15000, `smoke took ${Date.now() - t0} ms`);
  assert.deepEqual(smokeHomes(fx), [], "throwaway HOME removed");
});

test("[RN] release/smoke: a step whose relaunched child holds the pipes still stops at the step timeout (D-RN-GEM-1)", { skip: !POSIX }, (t) => {
  const fx = fixture(t);
  geminiStub(fx, GEMINI_HANG);
  fx.env = { CONTEXT_MODE_SMOKE_TIMEOUT_MS: "1000" };
  const t0 = Date.now();
  const r = smoke(fx, "--ref", "release-staging", "--agent", "gemini", "--repo", fx.repo);
  const ms = Date.now() - t0;
  assert.equal(r.status, 0, r.err);
  assert.equal(r.out, "gemini: SKIPPED: gemini not available\n");
  assert.ok(ms < 10000, `smoke took ${ms} ms; the 1000 ms step timeout did not hold`);
  assert.deepEqual(smokeHomes(fx), [], "throwaway HOME removed");
});

test("[M6] release/smoke: codex FAIL when the installed server does not answer as context-mode", { skip: !POSIX }, (t) => {
  const fx = fixture(t, { stubs: ["codex"], serverName: "other" });
  const r = smoke(fx, "--ref", "release-staging", "--agent", "codex", "--repo", fx.repo);
  assert.equal(r.status, 1);
  assert.ok(r.err.startsWith("codex: FAIL: "), r.err);
  assert.deepEqual(smokeHomes(fx), [], "throwaway HOME removed on failure too");
});

test("[M6] release/smoke: codex CLI absent is FAIL (codex is not a skipped leg)", (t) => {
  const fx = fixture(t);
  const r = smoke(fx, "--ref", "release-staging", "--agent", "codex", "--repo", fx.repo);
  assert.equal(r.status, 1);
  assert.ok(r.err.startsWith("codex: FAIL: codex mcp list --json"), r.err);
});

test("[M6] release/smoke: claude-code installs context-mode@context-mode from <repo>@<ref> in a throwaway HOME and validates it", { skip: !POSIX }, (t) => {
  const fx = fixture(t, { stubs: ["claude"] });
  const r = smoke(fx, "--ref", "release-staging", "--agent", "claude-code", "--repo", fx.repo);
  assert.equal(r.status, 0, r.err);
  assert.ok(r.out.startsWith("claude-code: PASS: installed context-mode@context-mode"), r.out);
  const probe = JSON.parse(readFileSync(path.join(fx.tmp, "probe-claude.json"), "utf8"));
  assert.notEqual(probe.home, process.env.HOME);
  assert.deepEqual(probe.argv.slice(0, 2), ["plugin", "validate"], "validate is the last step");
  assert.deepEqual(smokeHomes(fx), [], "throwaway HOME removed");
});

test("[M6] release/smoke: claude-code FAIL names the first failing command (bad --ref)", { skip: !POSIX }, (t) => {
  const fx = fixture(t, { stubs: ["claude"] });
  const r = smoke(fx, "--ref", "no-such-branch", "--agent", "claude-code", "--repo", fx.repo);
  assert.equal(r.status, 1);
  assert.ok(r.err.startsWith(`claude-code: FAIL: ${realpathSync(path.join(fx.root, "bin", "claude"))} plugin install context-mode@context-mode`), r.err);
  const probe = JSON.parse(readFileSync(path.join(fx.tmp, "probe-claude.json"), "utf8"));
  assert.equal(probe.argv[1], "install", "no later step ran");
});

// D-FU-RF-2: smoke runs the real claude binary (Mach-O/ELF/PE magic), never a shim script on PATH.
// A real binary for the test: a symlink to node. `claude plugin ...` then fails inside node, which proves which file ran.
function claudeOnPath(t, { shim, real }) {
  const fx = fixture(t);
  const dirs = [];
  if (shim) {
    const d = path.join(fx.root, "shimbin");
    mkdirSync(d);
    writeFileSync(path.join(d, "claude"), `#!/bin/sh\necho shim-ran > ${JSON.stringify(path.join(fx.root, "shim-ran"))}\nexit 0\n`);
    chmodSync(path.join(d, "claude"), 0o755);
    dirs.push(d);
  }
  if (real) {
    const d = path.join(fx.root, "realbin");
    mkdirSync(d);
    symlinkSync(process.execPath, path.join(d, "claude"));
    dirs.push(d);
  }
  fx.PATH = [...dirs, fx.PATH].join(path.delimiter);
  return fx;
}

test("[M6] release/smoke: claude-code skips a shim script on PATH and runs the real binary behind it", { skip: !POSIX }, (t) => {
  const fx = claudeOnPath(t, { shim: true, real: true });
  const r = smoke(fx, "--ref", "release-staging", "--agent", "claude-code", "--repo", fx.repo);
  assert.equal(r.status, 1, "the symlinked node is not a claude, so the first plugin command fails");
  assert.ok(r.err.startsWith(`claude-code: FAIL: ${realpathSync(process.execPath)} plugin marketplace add`), r.err);
  assert.ok(!existsSync(path.join(fx.root, "shim-ran")), "the shim script never ran");
});

test("[M6] release/smoke: claude-code with only a shim script on PATH fails with a clear message", { skip: !POSIX }, (t) => {
  const fx = claudeOnPath(t, { shim: true, real: false });
  const r = smoke(fx, "--ref", "release-staging", "--agent", "claude-code", "--repo", fx.repo);
  assert.equal(r.status, 1);
  assert.ok(r.err.startsWith("claude-code: FAIL: no real claude binary on PATH"), r.err);
  assert.ok(r.err.includes("shim script"), r.err);
  assert.ok(!existsSync(path.join(fx.root, "shim-ran")), "the shim script never ran");
  assert.deepEqual(smokeHomes(fx), [], "throwaway HOME removed");
});

test("[M6] release/smoke: claude-code with no claude on PATH fails with the same clear message", (t) => {
  const fx = fixture(t);
  const r = smoke(fx, "--ref", "release-staging", "--agent", "claude-code", "--repo", fx.repo);
  assert.equal(r.status, 1);
  assert.ok(r.err.startsWith("claude-code: FAIL: no real claude binary on PATH"), r.err);
});

test("[M6] release/smoke: CONTEXT_MODE_SMOKE_CLAUDE naming a missing file fails with a clear message", (t) => {
  const fx = fixture(t);
  fx.env = { CONTEXT_MODE_SMOKE_CLAUDE: path.join(fx.root, "nope") };
  const r = smoke(fx, "--ref", "release-staging", "--agent", "claude-code", "--repo", fx.repo);
  assert.equal(r.status, 1);
  assert.ok(r.err.startsWith("claude-code: FAIL: CONTEXT_MODE_SMOKE_CLAUDE "), r.err);
});

test("[M6] release/smoke: claude-code finds the native claude.exe under node_modules beside a shim (npm on Windows layout)", { skip: !POSIX }, (t) => {
  const fx = fixture(t);
  const d = path.join(fx.root, "npmbin");
  mkdirSync(path.join(d, "node_modules", "@anthropic-ai", "claude-code", "bin"), { recursive: true });
  writeFileSync(path.join(d, "claude"), "#!/bin/sh\ntouch " + JSON.stringify(path.join(fx.root, "shim-ran")) + "\n");
  chmodSync(path.join(d, "claude"), 0o755);
  symlinkSync(process.execPath, path.join(d, "node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe"));
  fx.PATH = [d, fx.PATH].join(path.delimiter);
  const r = smoke(fx, "--ref", "release-staging", "--agent", "claude-code", "--repo", fx.repo);
  assert.equal(r.status, 1);
  assert.ok(r.err.startsWith(`claude-code: FAIL: ${realpathSync(process.execPath)} plugin marketplace add`), r.err);
  assert.ok(!existsSync(path.join(fx.root, "shim-ran")));
});

// MAIN-ONLY (docs/v2/release/MAIN-ONLY.md): --layout main smokes the tree a release commit on main holds: the built
// plugin under plugins/claude-code, root manifests for Gemini and Qwen. The "remote" is a bare repo with branch main.
function mainFixture(t, opts) {
  const fx = fixture(t, opts);
  const seed = path.join(fx.root, "seed-main");
  git(fx.root, "init", "-q", "-b", "main", seed);
  const plugin = path.join(seed, "plugins", "claude-code");
  mkdirSync(path.join(plugin, ".claude-plugin"), { recursive: true });
  writeFileSync(path.join(plugin, ".claude-plugin", "plugin.json"), JSON.stringify({ name: "context-mode", version: "0.0.0-dev" }));
  writeFileSync(path.join(plugin, "server.mjs"), serverSrc(opts?.serverName ?? "context-mode"));
  mkdirSync(path.join(seed, ".claude-plugin"));
  writeFileSync(path.join(seed, ".claude-plugin", "marketplace.json"),
    JSON.stringify({ name: "context-mode", owner: { name: "o" }, plugins: [{ name: "context-mode", source: "./plugins/claude-code" }] }));
  writeFileSync(path.join(seed, "qwen-extension.json"), JSON.stringify({ name: "context-mode", mcpServers: { "context-mode": { command: "node", args: ["x/plugins/claude-code/server.mjs", "--agent", fx.qwenAgent ?? "qwen"] } } }));
  git(seed, "add", "-A");
  git(seed, "commit", "-q", "-m", "chore(release): v0.0.0");
  git(seed, "push", "-q", path.join(fx.root, "remote.git"), "main");
  return fx;
}

test("[MAIN-ONLY] release/smoke --layout main: claude-code adds the cloned repo as marketplace, installs the subfolder plugin and validates it", { skip: !POSIX }, (t) => {
  const fx = mainFixture(t, { stubs: ["claude"] });
  const r = smoke(fx, "--ref", "main", "--layout", "main", "--agent", "claude-code", "--repo", fx.repo);
  assert.equal(r.status, 0, r.err);
  assert.ok(r.out.startsWith("claude-code: PASS: installed context-mode@context-mode"), r.out);
});

test("[MAIN-ONLY] release/smoke --layout main: codex finds the server under plugins/claude-code and it answers initialize", { skip: !POSIX }, (t) => {
  const fx = mainFixture(t, { stubs: ["codex"] });
  const r = smoke(fx, "--ref", "main", "--layout", "main", "--agent", "codex", "--repo", fx.repo);
  assert.equal(r.status, 0, r.err);
  assert.ok(r.out.startsWith("codex: PASS: codex reads the context-mode entry"), r.out);
});

test("[MAIN-ONLY] release/smoke --layout main: qwen installs <clone>:context-mode and the installed server runs --agent qwen", { skip: !POSIX }, (t) => {
  const fx = mainFixture(t, { stubs: ["qwen"] });
  const r = smoke(fx, "--ref", "main", "--layout", "main", "--agent", "qwen", "--repo", fx.repo);
  assert.equal(r.status, 0, r.err);
  assert.ok(r.out.startsWith("qwen: PASS: "), r.out);
});

test("[MAIN-ONLY] release/smoke --layout main: qwen installed with another --agent is FAIL (the gap the probe found)", { skip: !POSIX }, (t) => {
  const fx = mainFixture(t, { stubs: ["qwen"] });
  fx.qwenAgent = "claude-code";
  const fx2 = mainFixture(t, { stubs: ["qwen"] });
  assert.ok(fx2);
  // rebuild the main branch with the wrong agent flag
  const seed = path.join(fx.root, "seed-main");
  writeFileSync(path.join(seed, "qwen-extension.json"), JSON.stringify({ name: "context-mode", mcpServers: { "context-mode": { command: "node", args: ["x/server.mjs", "--agent", "claude-code"] } } }));
  git(seed, "commit", "-qam", "bad");
  git(seed, "push", "-q", "-f", path.join(fx.root, "remote.git"), "main");
  const r = smoke(fx, "--ref", "main", "--layout", "main", "--agent", "qwen", "--repo", fx.repo);
  assert.equal(r.status, 1);
  assert.ok(r.err.startsWith("qwen: FAIL: "), r.err);
});

test("[MAIN-ONLY] release/smoke --layout main: qwen CLI absent is SKIPPED (tier 2)", (t) => {
  const fx = mainFixture(t);
  const r = smoke(fx, "--ref", "main", "--layout", "main", "--agent", "qwen", "--repo", fx.repo);
  assert.equal(r.status, 0, r.err);
  assert.equal(r.out, "qwen: SKIPPED: qwen not available\n");
});
