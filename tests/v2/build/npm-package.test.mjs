// ADR-0019 Owner decisions D1 (npm package shape) and D4 (v1 CLI forms), PO-NPM-2. Builds the real release tree
// into a scratch dir once, then checks package.json, SHA256SUMS, the npm pack tarball and cli.mjs.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const DEV = JSON.parse(readFileSync(path.join(REPO, "package.json"), "utf8")); // D-PKG-META-1: shared fields come from here
const FIXTURE = JSON.parse(readFileSync(path.join(REPO, "e2e", "fixtures", "hook-roundtrip.json"), "utf8"));
const NPM = process.platform === "win32" ? "npm.cmd" : "npm";
let out;
let scratch;

before(() => {
  scratch = mkdtempSync(path.join(tmpdir(), "cm-v2-npm-"));
  out = path.join(scratch, "out");
  const r = spawnSync(process.execPath, [path.join(REPO, "build", "build.mjs"), "--out", out, "--version", "2.0.0"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
});
after(() => rmSync(scratch, { recursive: true, force: true }));

const sums = () =>
  readFileSync(path.join(out, "SHA256SUMS"), "utf8").split("\n").filter((l) => l !== "").map((l) => [l.slice(66), l.slice(0, 64)]);
const cli = (args, input) => spawnSync(process.execPath, [path.join(out, "cli.mjs"), ...args], { encoding: "utf8", input, env: { ...process.env, NO_COLOR: "1" } });

test("[M7] build/npm-d1-shape: release-out/package.json is the D1 package (bin cli.mjs, engines, files = the tree, pi kept)", () => {
  const pkg = JSON.parse(readFileSync(path.join(out, "package.json"), "utf8"));
  const top = readdirSync(out).filter((n) => n !== "package.json").sort();
  assert.deepEqual(pkg, {
    bugs: DEV.bugs,
    description: DEV.description,
    homepage: DEV.homepage,
    keywords: DEV.keywords,
    license: DEV.license,
    bin: { "context-mode": "cli.mjs" },
    engines: { node: ">=24.15.0" },
    files: top,
    main: "./opencode/plugin.js", // ADR-0023 D-NI-OPENCODE-1: OpenCode imports the plugin by package name
    name: "context-mode",
    pi: { extensions: ["./pi/index.js"], skills: ["./pi/skills"] },
    repository: { type: "git", url: "git+https://github.com/mksglu/context-mode.git" }, // D-RN-REPO-1
    type: "module",
    version: "2.0.0",
  });
  for (const key of ["dependencies", "scripts", "private", "devDependencies", "optionalDependencies"]) assert.ok(!(key in pkg), key);
});

test("[M7] build/npm-sums-cover-entry: SHA256SUMS lists package.json and cli.mjs", () => {
  const names = sums().map(([n]) => n);
  assert.ok(names.includes("package.json"));
  assert.ok(names.includes("cli.mjs"));
});

test("[M7] build/npm-pack-equals-sums: npm pack file list and sha256 equal SHA256SUMS (plus SHA256SUMS itself)", () => {
  const dest = path.join(scratch, "pack");
  const p = spawnSync(NPM, ["pack", "--json", "--pack-destination", (spawnSync("mkdir", ["-p", dest]), dest)], { cwd: out, encoding: "utf8", shell: process.platform === "win32" });
  assert.equal(p.status, 0, p.stderr);
  const [info] = JSON.parse(p.stdout);
  assert.equal(info.name, "context-mode");
  assert.equal(info.version, "2.0.0");
  const listed = info.files.map((f) => f.path).sort();
  const expected = [...sums().map(([n]) => n), "SHA256SUMS"].sort();
  assert.deepEqual(listed, expected);
  const ex = path.join(scratch, "x");
  spawnSync("mkdir", ["-p", ex]);
  const t = spawnSync("tar", ["-xzf", path.join(dest, info.filename), "-C", ex], { encoding: "utf8" });
  assert.equal(t.status, 0, t.stderr);
  for (const [rel, hex] of sums()) {
    assert.equal(createHash("sha256").update(readFileSync(path.join(ex, "package", rel))).digest("hex"), hex, rel);
  }
  const packed = JSON.parse(readFileSync(path.join(ex, "package", "package.json"), "utf8"));
  assert.deepEqual(packed.bin, { "context-mode": "cli.mjs" }, "npm must keep the bin entry");
});

test("[M7] cli/help: --help prints usage with examples on stdout, exit 0; no args too", () => {
  for (const args of [["--help"], ["-h"], []]) {
    const r = cli(args);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Usage: context-mode <command>/);
    assert.match(r.stdout, /Examples:/);
    assert.match(r.stdout, /server/);
    assert.match(r.stdout, /hook --agent <id>/);
  }
});

test("[M7] cli/version: --version prints the package.json version", () => {
  const r = cli(["--version"]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, "2.0.0\n");
});

test("[M7] cli/unknown: an unknown command is a usage error, exit 2, message on stderr", () => {
  const r = cli(["frobnicate"]);
  assert.equal(r.status, 2);
  assert.equal(r.stdout, "");
  assert.match(r.stderr, /unknown command "frobnicate"/);
});

for (const [v1Platform, agent] of [["claude-code", "claude-code"], ["codex", "codex"]]) {
  test(`[M7] cli/hook-v1-form: "hook ${v1Platform} PreToolUse" gives the same answer as hook.mjs --agent ${agent} (D4)`, () => {
    const input = JSON.stringify(FIXTURE[agent].payload);
    const direct = spawnSync(process.execPath, [path.join(out, "hook.mjs"), "--agent", agent], { encoding: "utf8", input });
    const v1 = cli(["hook", v1Platform, FIXTURE[agent].event], input);
    const v2 = cli(["hook", "--agent", agent], input);
    assert.equal(v1.status, direct.status);
    assert.equal(v1.stdout, direct.stdout);
    assert.equal(v2.status, direct.status);
    assert.equal(v2.stdout, direct.stdout);
  });
}

test("[M7] cli/hook-v1-platform-map: every v1 platform name maps to its v2 agent id", async () => {
  const { V1_PLATFORM_AGENT } = await import("../../../src/entries/cli.ts");
  assert.deepEqual(V1_PLATFORM_AGENT, {
    "claude-code": "claude-code",
    codex: "codex",
    "copilot-cli": "copilot-cli",
    "gemini-cli": "gemini",
    kiro: "kiro",
    "qwen-code": "qwen",
    "vscode-copilot": "vscode",
  });
});

test("[M7] cli/hook-v1-unknown-platform: fails open, exit 0, empty stdout, one stderr line", () => {
  const r = cli(["hook", "nope-agent", "PreToolUse"], "{}");
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "");
  assert.match(r.stderr, /nope-agent/);
});

for (const cmd of ["server", "mcp"]) {
  test(`[M7] cli/${cmd}: "${cmd}" runs server.mjs and answers MCP initialize on stdio`, () => {
    const init = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } } };
    const r = spawnSync(process.execPath, [path.join(out, "cli.mjs"), cmd, "--agent", "claude-code"], {
      encoding: "utf8", input: JSON.stringify(init) + "\n", timeout: 20000, env: { ...process.env, HOME: scratch, USERPROFILE: scratch, CONTEXT_MODE_DIR: path.join(scratch, "cm") },
    });
    const line = r.stdout.split("\n").find((l) => l.includes('"id":1'));
    assert.ok(line, r.stderr);
    assert.equal(JSON.parse(line).result.serverInfo.name, "context-mode");
  });
}

test("[M7] cli/executable-entry: cli.mjs starts with a node shebang", () => {
  assert.ok(readFileSync(path.join(out, "cli.mjs"), "utf8").startsWith("#!/usr/bin/env node\n"));
  assert.ok(statSync(path.join(out, "cli.mjs")).size > 0);
});
