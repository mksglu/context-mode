// GP11 — release build audit (14a GP11/npm-audit-zero-high-critical, DEVIATIONS D-M6-arch-1): the release
// tree ships zero runtime dependencies, so npm audit --omit=dev has nothing to find. covers: build/build.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OUT = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".."), "release-out");

function names(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    out.push(e.name);
    if (e.isDirectory()) names(path.join(dir, e.name), out);
  }
  return out;
}

// D-FU-RM-PI-1 (ADR-0002 GS7 amended) + ADR-0019 D1 (PO-NPM-2): one root package.json is allowed, the D1 npm shape
// (name, version, bin, type, engines, files, pi). It must carry no dependency key, no scripts and no private (D1
// publishes it); no package.json below the root.
// D-RN-REPO-1: repository (npm provenance needs repository.url to match the source repo).
// D-PKG-META-1: description, keywords, license, homepage, bugs are copied from the repo package.json.
const ALLOWED_ROOT_KEYS = ["bin", "bugs", "description", "engines", "files", "homepage", "keywords", "license", "main", "name", "pi", "repository", "type", "version"]; // main: D-NI-OPENCODE-1
const DEV = JSON.parse(readFileSync(path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".."), "package.json"), "utf8"));

test("[M6] GP11/npm-audit-zero-high-critical: release-out has no runtime dependencies, no node_modules, no nested package.json (#1225)", () => {
  assert.ok(existsSync(OUT), "release-out missing (run build/build.mjs first)");
  const all = names(OUT);
  assert.equal(all.filter((n) => n === "package.json").length, existsSync(path.join(OUT, "package.json")) ? 1 : 0, "package.json below the release-out root");
  assert.ok(!all.includes("node_modules"), "node_modules in release-out");
  assert.ok(!all.includes("package-lock.json"), "package-lock.json in release-out");
  const rootPkg = path.join(OUT, "package.json");
  if (existsSync(rootPkg)) {
    const pkg = JSON.parse(readFileSync(rootPkg, "utf8"));
    assert.deepEqual(Object.keys(pkg).sort(), ALLOWED_ROOT_KEYS, "release-out/package.json keys");
    for (const k of ["dependencies", "optionalDependencies", "peerDependencies", "bundleDependencies", "bundledDependencies", "scripts"]) {
      assert.ok(!(k in pkg), `release-out/package.json has ${k}`);
    }
    assert.ok(!("private" in pkg), "release-out/package.json has private (ADR-0019 D1 publishes it)");
    assert.deepEqual(pkg.bin, { "context-mode": "cli.mjs" }, "release-out/package.json bin");
    assert.deepEqual(pkg.engines, { node: ">=24.15.0" }, "release-out/package.json engines");
    assert.deepEqual(pkg.repository, { type: "git", url: "git+https://github.com/mksglu/context-mode.git" }, "release-out/package.json repository");
    for (const k of ["description", "keywords", "license", "homepage", "bugs"]) assert.deepEqual(pkg[k], DEV[k], `release-out/package.json ${k} differs from package.json`);
  }
});
