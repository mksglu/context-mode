// tests/v2/cli/cli.test.mjs
// Spec: docs/v2/adr/0019-interactive-setup-and-npm-channel.md sections 4-8 and Owner decisions D4-D7.
// E2E style: build the real release tree once, copy the bundled cli.mjs next to a fake server.mjs and hook.mjs
// (the CLI finds its siblings from its own path), then drive `context-mode` with a temp HOME and a temp PATH.
// Interactive runs go through a real pty (python3 pty, tests/v2/cli/pty-run.py).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ADAPTERS } from "../../../src/adapters/table.ts";
import { TOOL_ORDER } from "../../../src/core/contracts/constants.ts";
import { vscodeUserDirOf } from "../../../src/core/project/config-dir.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..", "..");
const GOLDEN = path.join(REPO, "e2e", "golden", "cli");
const PTY = path.join(HERE, "pty-run.py");
const ESC = "\x1b";
let scratch;
let out;

before(() => {
  scratch = mkdtempSync(path.join(tmpdir(), "cm-v2-cli-"));
  out = path.join(scratch, "out");
  const r = spawnSync(process.execPath, [path.join(REPO, "build", "build.mjs"), "--out", out, "--version", "2.0.0"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
});
after(() => rmSync(scratch, { recursive: true, force: true }));

const FAKE_SERVER = `
import { createInterface } from "node:readline";
import { closeSync } from "node:fs";
if (process.env.CM_FAKE_BROKEN) process.exit(3);
// CM_FAKE_NOSTDIN: a server that closes its input and then answers initialize. The CLI's next write hits a closed pipe
// (EPIPE), the same thing a server that dies right after start does on a fast or loaded host.
if (process.env.CM_FAKE_NOSTDIN) { try { closeSync(0); } catch { /* Windows may refuse; the server then never reads again anyway */ } process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "context-mode", version: "2.0.0" } } }) + "\\n"); await new Promise((r) => setTimeout(r, 30000)); process.exit(0); } // never reads again: no tools/list answer on any OS
const tools = ${JSON.stringify([...TOOL_ORDER])};
const delay = process.env.CM_FAKE_SLOW ? 4000 : 0;
const rl = createInterface({ input: process.stdin });
rl.on("line", (l) => {
  const m = JSON.parse(l);
  if (m.id === undefined) return;
  const result = m.method === "initialize"
    ? { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "context-mode", version: "2.0.0" } }
    : { tools: tools.map((name) => ({ name, inputSchema: { type: "object" } })) };
  setTimeout(() => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: m.id, result }) + "\\n"), delay);
});
`;
const FAKE_HOOK = `let s = ""; process.stdin.on("data", (d) => { s += d; }); process.stdin.on("end", () => { const p = JSON.parse(s); if (!JSON.stringify(p).includes("context-mode-doctor-hook-runs")) return; const t = "deny: run ctx_execute; ctx_search( finds the rest"; process.stderr.write(t + "\\n"); process.stdout.write(JSON.stringify({ decision: "deny", reason: t })); });\n`;

/** A fake installed package: the real bundled cli.mjs next to fake server.mjs and hook.mjs. */
function makePkg(dir) {
  mkdirSync(dir, { recursive: true });
  copyFileSync(path.join(out, "cli.mjs"), path.join(dir, "cli.mjs"));
  writeFileSync(path.join(dir, "server.mjs"), FAKE_SERVER);
  writeFileSync(path.join(dir, "hook.mjs"), FAKE_HOOK);
  writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "context-mode", version: "2.0.0", type: "module" }));
  cpSync(path.join(REPO, "skills"), path.join(dir, "skills"), { recursive: true }); // ADR-0020: package ships skills/
  cpSync(path.join(REPO, "skills"), path.join(dir, "pi", "skills"), { recursive: true }); // D-HQ-SKILLS-1: pi prefix is ""
  cpSync(path.join(REPO, "skills"), path.join(dir, "claude-code", "skills"), { recursive: true }); // D-HQ-SKILLS-2
  return dir;
}

function sandbox(t) {
  const root = mkdtempSync(path.join(scratch, "sb-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, "home");
  const bin = path.join(root, "bin");
  mkdirSync(home, { recursive: true });
  mkdirSync(bin, { recursive: true });
  const pkg = makePkg(path.join(root, "pkg"));
  // D-HL-GATE-1: timing is not under test in the cli tests (the D3 gate has its own tests and e2e check): same CI-only
  // knob as the engine, hooks-all and zcode-shape sandboxes, so a loaded host does not flip a PASS row.
  const env = { PATH: [bin, "/usr/bin", "/bin"].join(path.delimiter), HOME: home, USERPROFILE: home, NO_COLOR: "1", LOG: path.join(root, "calls.log"), CM_HOOK_OVERHEAD_BUDGET_MS: "60000" };
  return { root, home, bin, pkg, env };
}

function fakeBin(s, name, script) {
  const file = path.join(s.bin, name);
  writeFileSync(file, `#!/bin/sh\n${script}\n`);
  chmodSync(file, 0o755);
}

function run(s, args, { env = {}, input = "", timeout = 60_000 } = {}) {
  const r = spawnSync(process.execPath, [path.join(s.pkg, "cli.mjs"), ...args], { encoding: "utf8", input, timeout, env: { ...s.env, ...env } });
  assert.equal(r.error, undefined, `context-mode ${args.join(" ")} did not finish: ${r.error}`);
  return r;
}

function pty(s, args, steps, { env = {}, timeout = 40 } = {}) {
  const spec = { argv: [process.execPath, path.join(s.pkg, "cli.mjs"), ...args], env: { ...s.env, TERM: "xterm-256color", ...env }, steps, timeout };
  const r = spawnSync("python3", ["-I", PTY, JSON.stringify(spec)], { encoding: "utf8", timeout: (timeout + 20) * 1000 });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}

/** Every file under dir with its bytes, so a test can prove nothing changed. */
function snapshot(dir) {
  const outMap = {};
  const walk = (d) => {
    if (!existsSync(d)) return;
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f); else outMap[path.relative(dir, f)] = readFileSync(f, "utf8");
    }
  };
  walk(dir);
  return outMap;
}

const CODEX_V1 = `model = "o3"\n\n[mcp_servers.context-mode]\ncommand = "context-mode"\n`;
function codexHome(s, text = CODEX_V1) {
  const f = path.join(s.home, ".codex", "config.toml");
  mkdirSync(path.dirname(f), { recursive: true });
  writeFileSync(f, text);
  return f;
}

// ---------- D7: help, exit codes, streams ----------

for (const [name, args] of [["main", ["--help"]], ["setup", ["setup", "--help"]], ["doctor", ["doctor", "--help"]], ["upgrade", ["upgrade", "--help"]]]) {
  test(`[M7] cli/help-golden: context-mode ${args.join(" ")} equals e2e/golden/cli/help-${name}.txt`, (t) => {
    const s = sandbox(t);
    const r = run(s, args);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stderr, "");
    assert.equal(r.stdout, readFileSync(path.join(GOLDEN, `help-${name}.txt`), "utf8"));
    assert.match(r.stdout, /Examples:/);
    assert.match(r.stdout, /Exit codes:[\s\S]*0[\s\S]*1[\s\S]*2[\s\S]*130/);
  });
}

test("[M7] cli/help-word: `context-mode help <command>` prints that command's help; an unknown topic is exit 2", (t) => {
  const s = sandbox(t);
  for (const cmd of ["setup", "doctor", "upgrade"]) {
    const r = run(s, ["help", cmd]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, readFileSync(path.join(GOLDEN, `help-${cmd}.txt`), "utf8"));
  }
  const bad = run(s, ["help", "setpu"]);
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /Did you mean "setup"/);
});

test("[M7] cli/parse-fail-line: a broken config says the agent id once (what, why, fix)", (t) => {
  const s = sandbox(t);
  const f = codexHome(s, '[mcp_servers.x\ncommand = = "bad"\n');
  const r = run(s, ["setup", "--yes", "--agents", "codex"]);
  assert.equal(r.status, 1);
  assert.equal(readFileSync(f, "utf8"), '[mcp_servers.x\ncommand = = "bad"\n');
  assert.doesNotMatch(r.stderr, /codex: codex:/);
  assert.doesNotMatch(r.stdout, /codex: codex:/);
  assert.match(r.stderr, /FAIL codex: .*does not parse.*Fix: context-mode setup --agents codex/);
});

test("[M7] cli/help-short: -h works on every command and writes nothing", (t) => {
  const s = sandbox(t);
  for (const cmd of ["setup", "doctor", "upgrade"]) {
    const r = run(s, [cmd, "-h"]);
    assert.equal(r.status, 0);
    assert.match(r.stdout, new RegExp(`Usage: context-mode ${cmd}`));
  }
  assert.deepEqual(snapshot(s.home), {});
});

test("[M7] cli/typo-command: an unknown command suggests the closest one, exit 2", (t) => {
  const s = sandbox(t);
  const r = run(s, ["setpu"]);
  assert.equal(r.status, 2);
  assert.equal(r.stdout, "");
  assert.match(r.stderr, /unknown command "setpu"/);
  assert.match(r.stderr, /Did you mean "setup"\?/);
});

test("[M7] cli/typo-flag: an unknown flag suggests the closest one, exit 2, nothing written", (t) => {
  const s = sandbox(t);
  codexHome(s);
  const before = snapshot(s.home);
  const r = run(s, ["setup", "--dryrun"]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /unknown option "--dryrun"/);
  assert.match(r.stderr, /Did you mean "--dry-run"\?/);
  assert.deepEqual(snapshot(s.home), before);
});

test("[M7] cli/exit-usage: unknown agent in --agents and a missing flag value are usage errors (2)", (t) => {
  const s = sandbox(t);
  const a = run(s, ["setup", "--yes", "--agents", "codexx"]);
  assert.equal(a.status, 2);
  assert.match(a.stderr, /unknown agent "codexx"/);
  assert.match(a.stderr, /Did you mean "codex"\?/);
  const b = run(s, ["setup", "--agents"]);
  assert.equal(b.status, 2);
  assert.match(b.stderr, /--agents needs a value/);
});

test("[M7] cli/exit-ok: setup --yes --agents codex applies, verifies, exit 0; results on stdout", (t) => {
  const s = sandbox(t);
  const f = codexHome(s);
  const r = run(s, ["setup", "--yes", "--agents", "codex"]);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(r.stdout, /codex\s+PASS/);
  const toml = readFileSync(f, "utf8");
  assert.match(toml, /model = "o3"/, "user keys kept");
  assert.ok(toml.includes(path.join(s.pkg, "server.mjs").replaceAll("\\", "\\\\")), "server path (TOML-escaped)");
});

test("[M7] cli/exit-fail: a failing verify step is exit 1, the agent is rolled back byte for byte", (t) => {
  const s = sandbox(t);
  const f = codexHome(s);
  const r = run(s, ["setup", "--yes", "--agents", "codex"], { env: { CM_FAKE_BROKEN: "1" } });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /codex\s+FAIL/);
  assert.equal(readFileSync(f, "utf8"), CODEX_V1);
  // D7 errors: what failed, why, the exact command that fixes it.
  assert.match(r.stderr, /Fix: context-mode setup --agents codex/);
  assert.equal(existsSync(path.join(s.home, ".context-mode", "setup.lock")), false);
});

test("[M7] cli/json: --json writes only one JSON document to stdout", (t) => {
  const s = sandbox(t);
  codexHome(s);
  const r = run(s, ["setup", "--yes", "--json", "--agents", "codex"]);
  assert.equal(r.status, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  assert.equal(j.exitCode, 0);
  assert.equal(j.agents[0].id, "codex");
  assert.equal(j.agents[0].status, "PASS");
});

test("[WIN] cli/home-rule: setup uses the D-M1-T3-1 home rule (HOME, then USERPROFILE), the same as hooks and server (D-WIN-HOME-1)", (t) => {
  const s = sandbox(t);
  codexHome(s);
  const env = { ...s.env, USERPROFILE: s.home };
  delete env.HOME; // a Windows shell with no HOME: the, USERPROFILE: the profile dir is the only home
  const r = spawnSync(process.execPath, [path.join(s.pkg, "cli.mjs"), "setup", "--dry-run", "--agents", "codex"], { encoding: "utf8", timeout: 60_000, env });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.includes(path.join(s.home, ".codex", "config.toml")), `plan must edit ${s.home}/.codex/config.toml, got:\n${r.stdout}`);
});

test("[WIN] cli/home-rule: HOME and USERPROFILE differ (Git Bash, MSYS): win32 plans under USERPROFILE, POSIX under HOME (D-WIN-HOME-2, GEM-WIN-3, PI-WIN-4)", (t) => {
  const s = sandbox(t);
  codexHome(s);
  const other = path.join(s.root, "msys-home"); // a second home the host never reads on Windows
  mkdirSync(other, { recursive: true });
  const win = process.platform === "win32";
  const env = { ...s.env, HOME: win ? other : s.home, USERPROFILE: win ? s.home : other };
  const r = spawnSync(process.execPath, [path.join(s.pkg, "cli.mjs"), "setup", "--dry-run", "--agents", "codex"], { encoding: "utf8", timeout: 60_000, env });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.includes(path.join(s.home, ".codex", "config.toml")), `plan must edit ${s.home}/.codex/config.toml, got:\n${r.stdout}`);
  assert.ok(!r.stdout.includes(other), `plan must not touch the other home ${other}`);
});

test("[WIN] cli/home-rule: zcode plans config.json and skills under the os.homedir() home when HOME and USERPROFILE differ (Z-WIN-6, D-WIN-ZCODE-HOME-1)", (t) => {
  // ZCode CLI (zai-org/ZCode 3c5b2276): resolvePath("~/.zcode/cli") = join(homedir(), ...), skills roots = join(homedir(), ".zcode", "skills"); no HOME read.
  const s = sandbox(t);
  const other = path.join(s.root, "msys-home");
  mkdirSync(other, { recursive: true });
  const win = process.platform === "win32";
  const env = { ...s.env, HOME: win ? other : s.home, USERPROFILE: win ? s.home : other };
  const r = spawnSync(process.execPath, [path.join(s.pkg, "cli.mjs"), "setup", "--dry-run", "--agents", "zcode"], { encoding: "utf8", timeout: 60_000, env });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.includes(path.join(s.home, ".zcode", "cli", "config.json")), `plan must edit ${s.home}/.zcode/cli/config.json, got:\n${r.stdout}`);
  assert.ok(!r.stdout.includes(other), `plan must not touch the other home ${other}`);
});

test("[M7] cli/dry-run: setup --dry-run shows the plan and writes nothing", (t) => {
  const s = sandbox(t);
  codexHome(s);
  const before = snapshot(s.home);
  const r = run(s, ["setup", "--dry-run", "--agents", "codex"]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /codex/);
  assert.match(r.stdout, /config\.toml/);
  assert.deepEqual(snapshot(s.home), before);
});

test("[M7] cli/no-tty: setup without --yes and without a TTY never blocks: plan shown, exit 2, nothing written", (t) => {
  const s = sandbox(t);
  codexHome(s);
  const before = snapshot(s.home);
  for (const args of [["setup"], ["setup", "--no-input"], ["setup", "--remove"]]) {
    const r = run(s, args, { timeout: 15_000 });
    assert.equal(r.status, 2, `${args.join(" ")}: ${r.stderr}`);
    assert.match(r.stderr, /--yes/);
  }
  assert.deepEqual(snapshot(s.home), before);
});

test("[M7] cli/no-color: NO_COLOR output has no escape codes (help, list, setup fail, doctor)", (t) => {
  const s = sandbox(t);
  codexHome(s);
  for (const [args, env] of [[["--help"], {}], [["setup", "--list"], {}], [["setup", "--yes", "--agents", "codex"], { CM_FAKE_BROKEN: "1" }], [["doctor"], {}], [["setup", "--list"], { NO_COLOR: "", TERM: "dumb" }], [["doctor", "--no-color"], { NO_COLOR: "" }]]) {
    const r = run(s, args, { env });
    assert.ok(!r.stdout.includes(ESC) && !r.stderr.includes(ESC), `${args.join(" ")} printed an escape code`);
  }
});

test("[M7] cli/list: setup --list prints every supported agent with its support level and writes nothing", (t) => {
  const s = sandbox(t);
  codexHome(s);
  const before = snapshot(s.home);
  const r = run(s, ["setup", "--list"]);
  assert.equal(r.status, 0, r.stderr);
  for (const a of ADAPTERS) assert.match(r.stdout, new RegExp(`^${a.id}\\s`, "m"));
  assert.match(r.stdout, /HOOKS/);
  assert.ok(!r.stdout.includes("MCP only"));
  for (const a of ADAPTERS) assert.match(r.stdout, new RegExp(`^${a.id}\\s+${a.hookChannel.kind}\\s`, "m"));
  assert.match(r.stdout, /^codex\s+.*detected/m);
  assert.deepEqual(snapshot(s.home), before);
  const j = JSON.parse(run(s, ["setup", "--list", "--json"]).stdout);
  assert.equal(j.agents.length, ADAPTERS.length);
  for (const a of j.agents) assert.equal(a.hooks, ADAPTERS.find((x) => x.id === a.id).hookChannel.kind);
});

test("[M7] cli/remove: setup --remove --yes puts every touched file back byte for byte", (t) => {
  const s = sandbox(t);
  const f = codexHome(s);
  assert.equal(run(s, ["setup", "--yes", "--agents", "codex"]).status, 0);
  assert.notEqual(readFileSync(f, "utf8"), CODEX_V1);
  const r = run(s, ["setup", "--remove", "--yes"]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readFileSync(f, "utf8"), CODEX_V1);
});

// ---------- doctor ----------

test("[M7] cli/doctor: read-only; old entry reported with the exact command; PASS after setup", (t) => {
  const s = sandbox(t);
  codexHome(s);
  const before = snapshot(s.home);
  const r = run(s, ["doctor"]);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /codex\s+FAIL/);
  assert.match(r.stdout + r.stderr, /old context-mode entry, run: context-mode setup/);
  assert.match(r.stderr, /Fix: context-mode setup --agents codex/);
  assert.deepEqual(snapshot(s.home), before, "doctor must not write");
  assert.equal(run(s, ["setup", "--yes", "--agents", "codex"]).status, 0);
  const ok = run(s, ["doctor", "--json"]);
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.equal(JSON.parse(ok.stdout).agents.find((a) => a.id === "codex").status, "PASS");
});

// ---------- upgrade ----------

test("[M7] cli/upgrade: npm i -g context-mode@<tag>, then the new package runs setup --repair", { skip: process.platform === "win32" && "fake npm is an sh script" }, (t) => {
  const s = sandbox(t);
  const f = codexHome(s);
  const root = path.join(s.root, "npmroot");
  cpSync(s.pkg, path.join(root, "context-mode"), { recursive: true });
  fakeBin(s, "npm", `echo "npm $*" >> "$LOG"\nif [ "$1" = root ]; then echo "${root}"; fi\nexit 0`);
  const dry = run(s, ["upgrade", "--dry-run", "--tag", "next"]);
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /npm i -g context-mode@next/);
  assert.equal(existsSync(s.env.LOG), false, "--dry-run runs nothing");
  const r = run(s, ["upgrade", "--yes", "--tag", "next"]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const log = readFileSync(s.env.LOG, "utf8");
  assert.match(log, /npm i -g context-mode@next/);
  assert.match(readFileSync(f, "utf8"), new RegExp(path.join(root, "context-mode", "server.mjs").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("[US] cli/upgrade-tag: with no --tag, upgrade stays on the dist-tag of the running version (D-US-1)", (t) => {
  const s = sandbox(t);
  writeFileSync(path.join(s.pkg, "package.json"), JSON.stringify({ name: "context-mode", version: "2.0.0-next.900", type: "module" }));
  const next = run(s, ["upgrade", "--dry-run"]);
  assert.equal(next.status, 0, next.stderr);
  assert.match(next.stdout, /^npm i -g context-mode@next$/m);
  const pinned = run(s, ["upgrade", "--dry-run", "--tag", "latest"]);
  assert.match(pinned.stdout, /^npm i -g context-mode@latest$/m, "--tag wins");
  writeFileSync(path.join(s.pkg, "package.json"), JSON.stringify({ name: "context-mode", version: "2.0.1", type: "module" }));
  assert.match(run(s, ["upgrade", "--dry-run"]).stdout, /^npm i -g context-mode@latest$/m);
});

test("[M7] cli/upgrade-fail: npm failing is exit 1 with the command to retry", (t) => {
  const s = sandbox(t);
  fakeBin(s, "npm", `echo "E404" >&2\nexit 1`);
  const r = run(s, ["upgrade", "--yes"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Fix: npm i -g context-mode@latest/);
});

// ---------- D6 issue report ----------

test("[M7] cli/report-no-input: a FAIL without a TTY writes the redacted report, prints the command, sends nothing", (t) => {
  const s = sandbox(t);
  codexHome(s);
  fakeBin(s, "gh", `echo "gh $*" >> "$LOG"\nexit 0`);
  const r = run(s, ["setup", "--yes", "--agents", "codex"], { env: { CM_FAKE_BROKEN: "1" } });
  assert.equal(r.status, 1, r.stderr); // release.yml next.10 failed here with no report; stderr shows why
  assert.ok(!existsSync(s.env.LOG) || !readFileSync(s.env.LOG, "utf8").includes("issue"), "never sends without a keypress");
  const dir = path.join(s.home, ".context-mode", "reports");
  const [file] = readdirSync(dir);
  const report = readFileSync(path.join(dir, file), "utf8");
  assert.ok(!report.includes(s.home), "home dir is redacted");
  assert.match(report, /fingerprint: [0-9a-f]{12}/);
  assert.match(report, /codex/);
  assert.match(r.stderr, /gh issue create --repo mksglu\/context-mode/);
});

test("[M7] cli/report-server-closes-stdin: a server that closes its input is a FAIL row with a report, not a crash (D-CLI-EPIPE-1)", (t) => {
  const s = sandbox(t);
  codexHome(s);
  for (let i = 0; i < (process.platform === "win32" ? 1 : 5); i++) { // win32 waits the 10 s verify timeout per run
    const r = run(s, ["setup", "--yes", "--agents", "codex"], { env: { CM_FAKE_NOSTDIN: "1" } });
    assert.equal(r.status, 1, r.stderr);
    assert.ok(!r.stderr.includes("node:events") && !r.stderr.includes("Unhandled"), r.stderr); // a thrown error, not a FAIL row
    assert.match(r.stderr, /codex: FAIL \(mcp: /, r.stderr);
    // POSIX: closeSync(0) closes the read end for certain, so the CLI write is an EPIPE. Windows keeps the pipe: it times out.
    if (process.platform !== "win32") assert.match(r.stderr, /mcp: server closed its input/, r.stderr);
    assert.match(r.stderr, /Debug report \(redacted\)/, r.stderr);
    assert.match(r.stderr, /gh issue create --repo mksglu\/context-mode/);
    assert.ok(readdirSync(path.join(s.home, ".context-mode", "reports")).length >= 1);
  }
});

// ---------- pty: interactive flow, D6 consent, Ctrl-C ----------

const hasPython = spawnSync("python3", ["-c", "import pty"]).status === 0 && process.platform !== "win32";

test("[M7] cli/pty-interactive: multi-select, plan, confirm, live checklist, summary table", { skip: !hasPython }, (t) => {
  const s = sandbox(t);
  const f = codexHome(s);
  const r = pty(s, ["setup"], [
    { expect: "Select agents", send: "\r" },
    { expect: "Apply", send: "y" },
  ]);
  assert.deepEqual(r.pending, [], r.out);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /codex/);
  assert.match(r.out, /PASS/);
  assert.match(readFileSync(f, "utf8"), /server\.mjs/);
});

test("[M7] cli/pty-cancel: Escape at the agent prompt cancels with exit 130, nothing written", { skip: !hasPython }, (t) => {
  const s = sandbox(t);
  codexHome(s);
  const before = snapshot(s.home);
  const r = pty(s, ["setup"], [{ expect: "Select agents", send: "\x1b" }]);
  assert.equal(r.code, 130, r.out);
  assert.deepEqual(snapshot(s.home), before);
});

test("[M7] cli/pty-report: on FAIL the report is shown and asked once; n sends nothing, y runs gh issue create", { skip: !hasPython }, (t) => {
  const s = sandbox(t);
  codexHome(s);
  fakeBin(s, "gh", `echo "gh $*" >> "$LOG"\nexit 0`);
  const no = pty(s, ["setup", "--agents", "codex"], [{ expect: "Apply", send: "y" }, { expect: "Open an issue", send: "n" }], { env: { CM_FAKE_BROKEN: "1" } });
  assert.equal(no.code, 1, no.out);
  assert.match(no.out, /fingerprint/);
  assert.ok(!existsSync(s.env.LOG) || !readFileSync(s.env.LOG, "utf8").includes("issue create"));
  const yes = pty(s, ["setup", "--agents", "codex"], [{ expect: "Apply", send: "y" }, { expect: "Open an issue", send: "y" }], { env: { CM_FAKE_BROKEN: "1" } });
  assert.equal(yes.code, 1, yes.out);
  assert.match(readFileSync(s.env.LOG, "utf8"), /gh issue create --repo mksglu\/context-mode/);
});

test("[M7] cli/pty-ctrl-c: Ctrl-C mid-apply exits 130 and leaves files byte-identical or fully applied", { skip: !hasPython }, (t) => {
  const s = sandbox(t);
  const f = codexHome(s);
  const r = pty(s, ["setup", "--yes", "--agents", "codex"], [{ expect: "codex", send: "\x03", delay: 1.0 }], { env: { CM_FAKE_SLOW: "1" } });
  assert.equal(r.code, 130, r.out);
  const now = readFileSync(f, "utf8");
  assert.ok(now === CODEX_V1 || now.includes(path.join(s.pkg, "server.mjs")), `half-applied file:\n${now}`);
  assert.equal(existsSync(path.join(s.home, ".context-mode", "setup.lock")), false, "lock released");
});

// ---------- setup --print (owner 2026-10-25: users never type paths, JSON or scripts) ----------

/** Absolute paths in --print output become <NODE>, <PKG>, <HOME> so one golden fits every machine. */
function normPaths(text, s) {
  let t = text;
  // D-WIN-VSCODE-MCP-1: VS Code's user dir differs per OS (%APPDATA%\\Code\\User, Library/Application Support/Code/User,
  // ~/.config/Code/User). The golden holds the tag; the dir itself is asserted by tests/v2/project/vscode-user-dir.test.mjs.
  for (const home of [realpathSync(s.home), s.home]) {
    const dir = vscodeUserDirOf(s.env, home);
    t = t.replaceAll(JSON.stringify(dir).slice(1, -1), "<VSCODE_USER>").replaceAll(dir, "<VSCODE_USER>");
  }
  // The CLI finds its package dir through realpath (macOS: /var -> /private/var), so map that form first.
  for (const [p, tag] of [[realpathSync(s.pkg), "<PKG>"], [s.pkg, "<PKG>"], [realpathSync(s.home), "<HOME>"], [s.home, "<HOME>"], [process.execPath, "<NODE>"]]) {
    t = t.replaceAll(JSON.stringify(p).slice(1, -1), tag).replaceAll(p, tag);
  }
  // D-HA-CODEX-TRUST-1: a codex trust hash covers the hook command, which holds this sandbox's paths; the golden
  // holds the tag, and cli/print-apply proves the printed hash makes doctor PASS.
  t = t.replace(/trusted_hash = "sha256:[0-9a-f]{64}"/g, 'trusted_hash = "sha256:<HASH>"');
  if (process.platform === "win32") {
    // The goldens hold the POSIX form. On Windows the same step has `\` (`\\` inside TOML/JSON strings) after a
    // tag, and shellWord single-quotes a word with a backslash. Map both back; the product output is right as is.
    t = t.replace(/(<(?:PKG|NODE|HOME|VSCODE_USER)>)((?:\\{1,2}[^\s"'\\]+)+)/g, (_m, tag, rest) => tag + rest.replace(/\\{1,2}/g, "/"));
    t = t.replace(/'(<(?:PKG|NODE|HOME|VSCODE_USER)>[^'\s]*)'/g, "$1");
  }
  return t;
}

/** A fake agent CLI: logs every call; `... list` prints context-mode once an install command ran. */
function fakeAgentBin(s, name) {
  const script = `echo "${name} $*" >> "$LOG"\ncase "$*" in *list*) [ -f "$LOG.done" ] && echo context-mode;; *) touch "$LOG.done";; esac\nexit 0`;
  if (name !== "claude") return fakeBin(s, name, script);
  // OPEN-ITEMS H8: setup runs only the real Claude Code, so the fake lives in npm's layout for @anthropic-ai/claude-code.
  const pkg = path.join(s.root, "npm", "lib", "node_modules", "@anthropic-ai", "claude-code");
  mkdirSync(pkg, { recursive: true });
  writeFileSync(path.join(pkg, "package.json"), JSON.stringify({ name: "@anthropic-ai/claude-code", version: "2.0.0" }));
  writeFileSync(path.join(pkg, "cli.sh"), `#!/bin/sh\n${script}\n`);
  chmodSync(path.join(pkg, "cli.sh"), 0o755);
  if (!existsSync(path.join(s.bin, name))) symlinkSync(path.join(pkg, "cli.sh"), path.join(s.bin, name));
}

for (const a of ADAPTERS) {
  test(`[M7] cli/print-golden: setup --print ${a.id} equals e2e/golden/cli/print-${a.id}.txt and writes nothing`, (t) => {
    const s = sandbox(t);
    const before = snapshot(s.home);
    const r = run(s, ["setup", "--print", a.id]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stderr, "");
    assert.equal(normPaths(r.stdout, s), readFileSync(path.join(GOLDEN, `print-${a.id}.txt`), "utf8"));
    assert.deepEqual(snapshot(s.home), before, "--print must not write");
    assert.equal(existsSync(path.join(s.home, ".context-mode")), false, "no state dir");
  });

  test(`[M7] cli/print-apply: the --print --json step for ${a.id}, applied by hand, makes doctor PASS`, { skip: process.platform === "win32" && "fake agent CLIs are sh scripts" }, (t) => {
    const s = sandbox(t);
    const r = run(s, ["setup", "--print", a.id, "--json"]);
    assert.equal(r.status, 0, r.stderr);
    const j = JSON.parse(r.stdout);
    assert.equal(j.command, "setup");
    assert.equal(j.print.agent, a.id);
    assert.equal(j.print.verify, `context-mode doctor --agents ${a.id}`);
    assert.ok(j.print.steps.length >= 1);
    assert.equal(existsSync(path.join(s.home, ".context-mode")), false, "--json --print writes nothing");
    for (const step of j.print.steps) {
      if (step.kind === "config") {
        assert.ok(path.isAbsolute(step.file) && step.file.startsWith(s.home), step.file);
        mkdirSync(path.dirname(step.file), { recursive: true });
        writeFileSync(step.file, step.block);
      } else if (step.kind === "hook") {
        // ADR-0020: the hook block goes next to the user's keys (zcode and opencode share the config file).
        assert.ok(path.isAbsolute(step.file) && step.file.startsWith(s.home), step.file);
        mkdirSync(path.dirname(step.file), { recursive: true });
        const cur = existsSync(step.file) ? JSON.parse(readFileSync(step.file, "utf8")) : {};
        writeFileSync(step.file, JSON.stringify({ ...cur, ...JSON.parse(step.block) }, null, 2) + "\n");
      } else if (step.kind === "skill") {
        assert.ok(path.isAbsolute(step.file) && step.file.startsWith(s.home), step.file);
        mkdirSync(path.dirname(step.file), { recursive: true });
        writeFileSync(step.file, step.block);
      } else {
        assert.equal(step.kind, "run");
        fakeAgentBin(s, step.argv[0]);
        const c = spawnSync(step.argv[0], step.argv.slice(1), { env: s.env, input: step.input ?? "", encoding: "utf8" });
        assert.equal(c.status, 0, c.stderr);
      }
    }
    const d = run(s, ["doctor", "--agents", a.id, "--json"]);
    assert.equal(d.status, 0, d.stdout + d.stderr);
    assert.equal(JSON.parse(d.stdout).agents.find((x) => x.id === a.id).status, "PASS");
  });
}

test("[M7] cli/print-same-source: --print run steps equal the commands setup runs (one registry row)", { skip: process.platform === "win32" && "fake agent CLIs are sh scripts" }, (t) => {
  for (const a of ADAPTERS) {
    const s = sandbox(t);
    const steps = JSON.parse(run(s, ["setup", "--print", a.id, "--json"]).stdout).print.steps.filter((x) => x.kind === "run");
    if (!steps.length) continue;
    fakeAgentBin(s, steps[0].argv[0]);
    const r = run(s, ["setup", "--yes", "--agents", a.id]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const ran = readFileSync(s.env.LOG, "utf8").trim().split("\n").filter((l) => !/ list$/.test(l));
    assert.deepEqual(ran, steps.map((x) => x.argv.join(" ")), a.id);
  }
});

test("[M7] cli/print-usage: --print needs a known agent and cannot mix with other setup modes (exit 2)", (t) => {
  const s = sandbox(t);
  const typo = run(s, ["setup", "--print", "codx"]);
  assert.equal(typo.status, 2);
  assert.match(typo.stderr, /unknown agent "codx"\. Did you mean "codex"\?/);
  assert.equal(run(s, ["setup", "--print"]).status, 2);
  for (const extra of [["--remove"], ["--list"], ["--dry-run"], ["--repair"], ["--agents", "codex"]]) {
    const r = run(s, ["setup", "--print", "codex", ...extra]);
    assert.equal(r.status, 2, extra.join(" "));
    assert.match(r.stderr, /--print cannot be used with/);
  }
  assert.equal(existsSync(path.join(s.home, ".context-mode")), false);
});

// D-INST-7: new-user test round 2. A PASS row says what was checked; the plan line for a report-only finding says
// nothing is to be done; --print says the agent, not its id, restarts.
test("[M7] cli/pass-detail: a PASS row in the setup and doctor table names the checks that ran", (t) => {
  const s = sandbox(t);
  codexHome(s, `model = "o3"\n`);
  const r = run(s, ["setup", "--yes", "--agents", "codex"]);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(r.stdout, /codex\s+PASS\s+checked: .*mcp.*hook/);
  const d = run(s, ["doctor", "--agents", "codex"]);
  assert.equal(d.status, 0, d.stderr + d.stdout);
  assert.match(d.stdout, /codex\s+PASS\s+checked: .*mcp.*hook/);
});

// D-HL-GATE-1: cli tests check what setup and doctor print, not hook timing (timing is gated by the D3 engine
// tests and e2e/checks/setup-hook-overhead.mjs). A loaded host (the full suite in parallel) must not flip a PASS row.
test("[M7] cli/host-load: a hook slowed by host load still gives a PASS row in a cli functional test", (t) => {
  const s = sandbox(t);
  writeFileSync(path.join(s.pkg, "hook.mjs"), "Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 40);\n" + FAKE_HOOK);
  codexHome(s, `model = "o3"\n`);
  const r = run(s, ["setup", "--yes", "--agents", "codex"]);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(r.stdout, /codex\s+PASS\s+checked: .*mcp.*hook/);
});

// OPEN-ITEMS H8: a wrapper first on PATH (claude-worktree shim) is skipped; doctor names the claude it ran.
test("[H8] cli/doctor-bin: setup and doctor skip a claude shim first on PATH and print the real binary they used", { skip: process.platform === "win32" && "fake agent CLIs are sh scripts" }, (t) => {
  const s = sandbox(t);
  const pkg = path.join(s.root, "npm", "lib", "node_modules", "@anthropic-ai", "claude-code");
  mkdirSync(pkg, { recursive: true });
  writeFileSync(path.join(pkg, "package.json"), JSON.stringify({ name: "@anthropic-ai/claude-code", version: "2.0.0" }));
  const real = path.join(pkg, "cli.sh");
  writeFileSync(real, `#!/bin/sh\ncase "$*" in *list*) [ -f "$LOG.done" ] && echo context-mode;; *) touch "$LOG.done";; esac\nexit 0\n`);
  chmodSync(real, 0o755);
  symlinkSync(real, path.join(s.bin, "claude"));
  const shims = path.join(s.root, "shims");
  mkdirSync(shims);
  writeFileSync(path.join(shims, "claude"), `#!/bin/sh\ntouch "${path.join(s.root, "shim-ran")}"\nexit 1\n`);
  chmodSync(path.join(shims, "claude"), 0o755);
  const env = { PATH: [shims, s.env.PATH].join(path.delimiter) };
  const r = run(s, ["setup", "--yes", "--agents", "claude-code"], { env });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const d = run(s, ["doctor", "--agents", "claude-code"], { env });
  assert.equal(d.status, 0, d.stderr + d.stdout);
  assert.match(d.stdout, new RegExp(`claude-code\\s+PASS\\s+checked: .*; bin: ${realpathSync(real).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m"));
  assert.equal(existsSync(path.join(s.root, "shim-ran")), false, "the shim never ran");
});

test("[M7] cli/print-text: --print never names a bare agent id as the thing to restart, and says what to do with a missing file", (t) => {
  const s = sandbox(t);
  const cfg = run(s, ["setup", "--print", "codex"]);
  assert.match(cfg.stdout, /Then restart the agent and check it: context-mode doctor --agents codex/);
  assert.match(cfg.stdout, /If the folder or file is missing, create it/);
  assert.match(cfg.stdout, /These paths are for this machine/);
  const cmd = run(s, ["setup", "--print", "claude-code"]);
  assert.doesNotMatch(cmd.stdout, /restart claude-code/);
});
