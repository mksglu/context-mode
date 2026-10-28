// One source of truth for package metadata (D-PKG-META-1). The v2-design package.json is the dev package: the release
// build (build/manifests.ts) reads description, keywords, license, homepage, bugs, repository from it and takes engines
// from NODE_MIN, so the two cannot drift. Source-tree plugin manifests must carry the same version and description.
// Every listed dependency must have a v2 use. The published package stays dependency-free.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { generateManifests } from "../../../build/manifests.ts";
import { ADAPTERS } from "../../../src/adapters/table.ts";
import { NODE_MIN } from "../../../src/core/contracts/constants.ts";
import { isReleaseVersion } from "../../../scripts/release/release-tags.mjs";

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const readJson = (...p) => JSON.parse(readFileSync(path.join(REPO, ...p), "utf8"));
const pkg = readJson("package.json");

// Host keyword per adapter id (the name users search for).
const HOST_KEYWORD = { gemini: "gemini-cli", qwen: "qwen-code" };
const GENERIC_KEYWORDS = ["mcp", "context-window", "sandbox", "fts5", "pi-package"]; // pi-package: Pi package gallery tag
const RELEASE_VERSION = "2.0.0-next.8";

function release(t) {
  const dir = mkdtempSync(path.join(tmpdir(), "cm-pkg-meta-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  generateManifests(dir, RELEASE_VERSION);
  return dir;
}
const out = (dir, rel) => JSON.parse(readFileSync(path.join(dir, rel), "utf8"));

test("package-meta: dev package.json is the v2 dev package (version, engines from NODE_MIN, no v1 fields)", () => {
  assert.ok(isReleaseVersion(pkg.version), "version " + pkg.version + " is not a release version");
  assert.ok(pkg.version.startsWith("2."), "version " + pkg.version + " is not v2");
  assert.deepEqual(pkg.engines, { node: ">=" + NODE_MIN });
  assert.equal(pkg.license, "Elastic-2.0");
  assert.equal(pkg.type, "module");
  assert.equal(pkg.dependencies, undefined, "bundled packages are devDependencies; the published package has no dependencies");
  // bin/main/exports name files that exist only in the release tree; if declared they must equal the release values.
  assert.ok(pkg.bin === undefined || JSON.stringify(pkg.bin) === JSON.stringify({ "context-mode": "cli.mjs" }), "bin");
  assert.ok(pkg.main === undefined || pkg.main === "./opencode/plugin.js", "main " + pkg.main);
  assert.equal(pkg.exports, undefined, "exports points at the v1 build/ tree");
  assert.equal(pkg.packageManager, undefined, "v2 installs with npm");
});

test("package-meta: description is short, names the host count, has no unmeasured number", () => {
  assert.ok(pkg.description.length <= 160, "description is " + pkg.description.length + " chars");
  assert.ok(pkg.description.includes(ADAPTERS.length + " coding agents"), pkg.description);
  assert.ok(!pkg.description.includes("%"), "no percentage: it is not in docs/benchmarks");
  assert.ok(!pkg.description.includes("98"), "v1 claim");
  assert.ok(!/openclaw/i.test(pkg.description));
});

test("package-meta: keywords are the supported hosts plus the generic four, nothing else", () => {
  const hosts = ADAPTERS.map((r) => HOST_KEYWORD[r.id] ?? r.id);
  assert.deepEqual([...pkg.keywords].sort(), [...hosts, ...GENERIC_KEYWORDS].sort());
});

test("package-meta: homepage, repository, bugs name this repo in npm-normal form", () => {
  assert.equal(pkg.homepage, "https://github.com/mksglu/context-mode#readme");
  assert.deepEqual(pkg.repository, { type: "git", url: "git+https://github.com/mksglu/context-mode.git" });
  assert.deepEqual(pkg.bugs, { url: "https://github.com/mksglu/context-mode/issues" });
});

test("package-meta: release package.json carries the dev package.json fields, never a hand copy", (t) => {
  const rel = out(release(t), "package.json");
  for (const key of ["description", "keywords", "license", "homepage", "bugs", "repository"]) {
    assert.deepEqual(rel[key], pkg[key], key + " differs between the release build and package.json");
  }
  assert.deepEqual(rel.engines, pkg.engines);
  assert.equal(rel.version, RELEASE_VERSION, "release version comes from --version, not package.json");
  assert.deepEqual(rel.bin, { "context-mode": "cli.mjs" });
  assert.equal(rel.main, "./opencode/plugin.js");
  assert.equal(rel.dependencies, undefined);
  assert.equal(rel.devDependencies, undefined);
});

test("package-meta: generated manifests carry the one description and the release version", (t) => {
  const dir = release(t);
  const claude = out(dir, ".claude-plugin/plugin.json");
  const market = out(dir, ".claude-plugin/marketplace.json");
  const codex = out(dir, ".codex-plugin/plugin.json");
  for (const [label, m] of [["claude plugin", claude], ["codex plugin", codex], ["gemini", out(dir, "gemini-extension.json")],
    ["qwen", out(dir, "qwen-extension.json")], ["copilot", out(dir, "copilot/plugin.json")]]) {
    assert.equal(m.description, pkg.description, label + " description");
    assert.equal(m.version, RELEASE_VERSION, label + " version");
  }
  assert.equal(market.plugins[0].description, pkg.description, "marketplace description");
  assert.equal(market.plugins[0].version, RELEASE_VERSION);
});

test("package-meta: source-tree plugin manifests match package.json on version, description, keywords", () => {
  const claude = readJson(".claude-plugin", "plugin.json");
  const market = readJson(".claude-plugin", "marketplace.json");
  const codex = readJson(".codex-plugin", "plugin.json");
  for (const [label, m] of [["claude plugin.json", claude], ["codex plugin.json", codex], ["marketplace plugin", market.plugins[0]]]) {
    assert.equal(m.version, pkg.version, label + " version");
    assert.equal(m.description, pkg.description, label + " description");
    assert.deepEqual(m.keywords, pkg.keywords, label + " keywords");
  }
  assert.equal(market.metadata.version, pkg.version, "marketplace metadata version");
  assert.ok(!JSON.stringify(codex.interface ?? {}).includes("98%"), "codex interface carries the v1 claim");
});

// Import forms that name a package: a plain string test per form, no pattern engine.
function names(dep, text) {
  for (const q of ['"', "'"]) {
    for (const head of ["from " + q, "import(" + q, "require(" + q, "import " + q]) {
      if (text.includes(head + dep + q) || text.includes(head + dep + "/")) return true;
    }
  }
  return false;
}
function* files(dir) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".git" || name === "release-out") continue;
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (/\.(mjs|ts|js|cjs|yml)$/.test(name)) yield p;
  }
}
const SCAN_DIRS = ["src", "build", "scripts", "tests/v2", "e2e", ".github"];
const SELF = fileURLToPath(import.meta.url);
const SCANNED = SCAN_DIRS.flatMap((d) => [...files(path.join(REPO, d))]).filter((f) => f !== SELF).map((f) => readFileSync(f, "utf8"));
// Tools with no import: named by a package.json script, or (types) by the code they type.
const TOOL_USE = {
  typescript: () => pkg.scripts.typecheck.startsWith("tsc "),
  "@types/node": () => SCANNED.some((s) => s.includes('from "node:')),
};

test("package-meta: every dependency and devDependency has a v2 use", () => {
  const listed = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  assert.ok(listed.length > 0);
  const unused = listed.filter((dep) => !(TOOL_USE[dep] ? TOOL_USE[dep]() : SCANNED.some((s) => names(dep, s))));
  assert.deepEqual(unused, [], "no v2 use found for: " + unused.join(", "));
});
