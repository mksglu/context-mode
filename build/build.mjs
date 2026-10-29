#!/usr/bin/env node
// build/build.mjs — esbuild build (docs/v2/impl/13-build-release.md §2).
// Usage: node build/build.mjs [--out <dir>] [--sha <commit>] [--version <x.y.z>]   (default release-out/)
//   --version is plan.mjs's release version, written into every manifest `version`; without it the
//   manifests keep 0.0.0-dev (D-M6-arch-3, D-M6-B2-1).
//   --sha sets BUNDLE_SHA in every bundle through the one esbuild define BUNDLE_SHA_DEFINE
//   (DEVIATIONS D-M5-arch-5, D-M5-B1-1); without it BUNDLE_SHA stays undefined (dev/test build).
//        node build/build.mjs --generated-only
//   --generated-only writes src/prompt/_generated.ts (git-ignored), keeps it and exits, so plain
//   `node --test tests/v2/` resolves the src/ import (DEVIATIONS D-M2-arch-6).
//
// Rows land with their entry (DEVIATIONS D-M0-8): server, hook (M0); run and its
// search.mjs twin (M3, impl/04 §4, D-M2-4, D-M3-X1-2); pi (M5, D-M5-arch-1). opencode.ts
// adds its row with its own step (D-M5-P2-1). Step 4 (manifests, build/manifests.ts) runs from M3
// (DEVIATIONS D-M3-arch-4). Step 5 copies the hook round-trip fixture (D-M5-arch-4).
// Step 6 copies the 3 command skills; step 7 (`claude plugin validate`) runs in release.yml's build
// job, not here (D-M6-arch-3); step 8 writes SHA256SUMS last (build/hash.mjs).
//
// Failure: one stderr line `build failed: <reason>` and exit 1 (impl/13 §1).
import { readFileSync, writeFileSync, renameSync, rmSync, mkdirSync, readdirSync, copyFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild"; // devDependency only, pinned 0.24.0 (A14); never shipped (ADR-0002 GS7)
import {
  TOOL_ORDER,
  INSTRUCTIONS_CAP,
  DESCRIPTION_CAP,
  SURFACE_CAP,
  BUNDLE_SHA_DEFINE,
  READ_DENY_FIXED_CAP,
} from "../src/core/contracts/constants.ts";
import { OUT_FILES, CODEX_PLUGIN_SKILLS, assertOutPackageJson, generateManifests } from "./manifests.ts";
import { writeHashes } from "./hash.mjs";
import { isReleaseVersion } from "../scripts/release/release-tags.mjs"; // x.y.z[-pre], D-RN-TAG-1
import { ADAPTERS, getAdapter } from "../src/adapters/table.ts";
import { renderSkill } from "../src/setup/registry.ts";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUT = "release-out";
const PROMPT_DIR = path.join(REPO_ROOT, "src", "prompt");
const GENERATED = path.join(PROMPT_DIR, "_generated.ts");
// §2.2 step 5 / D-M5-arch-4: one fixture keyed by agent id, copied verbatim.
const FIXTURE_SRC = path.join(REPO_ROOT, "e2e", "fixtures", "hook-roundtrip.json");
const FIXTURE_OUT = path.join("fixtures", "hook-roundtrip.json");
// D-M5-B1-1: --sha is a full git commit sha, the form `git ls-remote` prints (D1 compares them).
const SHA_LENGTH = 40;
const SHA_ALPHABET = "0123456789abcdef";
// D-M6-B2-1: --version is three dot-separated decimal numbers (the form plan.mjs computes).
// §2.2 step 6 / impl/13 §5: the 3 command skills, copied verbatim (D-M6-arch-6: only these ship).
const SKILLS_DIR = "skills";
const SKILL_FILE = "SKILL.md";
const COMMAND_SKILLS = Object.freeze(["ctx-stats", "ctx-doctor", "ctx-upgrade"]);

// impl/13 §2.2 step 2 table, rows whose entry exists (D-M0-8). Output paths are relative to outDir.
// run.mjs and search.mjs are one entry; the file name picks the job (D-M3-X1-2).
const BUNDLES = Object.freeze([
  { name: "server", entry: "src/entries/server.ts", out: "server.mjs" },
  // D-CI-PERF-3: the hook is spawned once per tool call, so its parse+compile time is on every call; minified.
  { name: "hook", entry: "src/entries/hook.ts", out: "hook.mjs", minify: true },
  { name: "run", entry: "src/entries/run.ts", out: "run.mjs" },
  { name: "search", entry: "src/entries/run.ts", out: "search.mjs" },
  { name: "pi", entry: "src/entries/pi.ts", out: "pi/index.js" }, // impl/13 §2.2 step 2 (D-M5-arch-1)
  { name: "opencode", entry: "src/entries/opencode.ts", out: "opencode/plugin.js" }, // impl/13 §2.2 step 2 (D-M5-P2-1)
  // ADR-0019 D1 (PO-NPM-2): the npm bin; the shebang lets the npm bin link run it.
  { name: "cli", entry: "src/entries/cli.ts", out: "cli.mjs", banner: { js: "#!/usr/bin/env node" } },
]);

// Same options for every row (impl/13 §2.2 step 2, "same").
const ESBUILD_COMMON = Object.freeze({
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  external: ["node:*"],
  splitting: false,
  metafile: true,
  logLevel: "silent",
});

// D-HNE-OLDNODE-1: process.getBuiltinModule exists from Node 22.3 / 20.16. The bundles call it at load (D-CI-PERF-3), so on an
// older Node the hook died with exit 1 ("hook errored" in Copilot CLI) before any code of ours could answer. This shim
// adds it from createRequire only when it is missing; on Node 24 it is one failed property test.
const GETBUILTIN_SHIM = 'import{createRequire as __cmRequire}from"node:module";if(typeof process.getBuiltinModule!=="function")process.getBuiltinModule=(id)=>__cmRequire(import.meta.url)(id);';

class BuildError extends Error {}

function parseArgs(argv) {
  let out = DEFAULT_OUT;
  let generatedOnly = false;
  let sha;
  let version;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--out" && i + 1 < argv.length) {
      out = argv[++i];
    } else if (argv[i] === "--sha" && i + 1 < argv.length) {
      sha = argv[++i];
      if (sha.length !== SHA_LENGTH || [...sha].some((c) => !SHA_ALPHABET.includes(c))) {
        throw new BuildError(`--sha ${sha} is not a ${SHA_LENGTH}-char lowercase hex commit sha`);
      }
    } else if (argv[i] === "--version" && i + 1 < argv.length) {
      version = argv[++i];
      if (!isReleaseVersion(version)) {
        throw new BuildError(`--version ${version} is not an x.y.z release version`);
      }
    } else if (argv[i] === "--generated-only") {
      generatedOnly = true;
    } else {
      throw new BuildError(`unknown argument ${argv[i]}`);
    }
  }
  return { outDir: path.resolve(REPO_ROOT, out), generatedOnly, sha, version };
}

function readPrompt(rel) {
  const file = path.join(PROMPT_DIR, rel);
  try {
    return { file: path.relative(REPO_ROOT, file), text: readFileSync(file, "utf8") };
  } catch {
    throw new BuildError(`missing ${path.relative(REPO_ROOT, file)}`);
  }
}

// §2.2 step 3: inline prompt md as plain string literals, enforce Q5/Q13 caps.
// SURFACE_CAP here covers the description half; the schema half is checked on the
// built server's live tools/list by docs/v2/prompt/lint.mjs (impl/13 §7 step 4),
// because the Zod-derived schemas exist only once the server bundle runs.
function writeGeneratedPrompt() {
  const instructions = readPrompt("instructions.md");
  if (instructions.text.length > INSTRUCTIONS_CAP) {
    throw new BuildError(`${instructions.file} is ${instructions.text.length} chars, over INSTRUCTIONS_CAP ${INSTRUCTIONS_CAP}`);
  }
  const descriptions = TOOL_ORDER.map((tool) => ({ tool, ...readPrompt(path.join("tools", `${tool}.md`)) }));
  let surface = 0;
  for (const d of descriptions) {
    if (d.text.length > DESCRIPTION_CAP) {
      throw new BuildError(`${d.file} is ${d.text.length} chars, over DESCRIPTION_CAP ${DESCRIPTION_CAP}`);
    }
    surface += d.text.length;
  }
  if (surface > SURFACE_CAP) {
    throw new BuildError(`src/prompt/tools/*.md total ${surface} chars, over SURFACE_CAP ${SURFACE_CAP}`);
  }
  // D-DU-DENY-1: hook text templates; one line each, fixed bytes (placeholders removed) under the cap.
  const readDeny = readPrompt(path.join("hooks", "read-deny.md"));
  const fixed = Buffer.byteLength(readDeny.text.split("{path}").join("").split("{size}").join(""));
  if (readDeny.text.includes("\n")) throw new BuildError(`${readDeny.file} must be one line`);
  if (fixed > READ_DENY_FIXED_CAP) throw new BuildError(`${readDeny.file} fixed text ${fixed} B, over READ_DENY_FIXED_CAP ${READ_DENY_FIXED_CAP}`);
  const lines = [
    "// GENERATED by build/build.mjs (impl/13 §2.2 step 3; --generated-only keeps it, D-M2-arch-6). Do not edit or commit.",
    'import type { TOOL_ORDER } from "../core/contracts/constants.ts";',
    "",
    `export const INSTRUCTIONS: string = ${JSON.stringify(instructions.text)};`,
    "",
    "export const TOOL_DESCRIPTIONS: Readonly<Record<(typeof TOOL_ORDER)[number], string>> = Object.freeze({",
    ...descriptions.map((d) => `  ${d.tool}: ${JSON.stringify(d.text)},`),
    "});",
    "",
    `export const READ_DENY_TEMPLATE: string = ${JSON.stringify(readDeny.text)};`,
    "",
  ];
  // D-RN-GEN-1: parallel test files run --generated-only while server children import this file.
  // Same bytes: no write. New bytes: temp file + rename, so a reader never sees a truncated file.
  const text = lines.join("\n");
  if (existsSync(GENERATED) && readFileSync(GENERATED, "utf8") === text) return;
  const tmp = `${GENERATED}.${process.pid}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, GENERATED);
}

// "Static imports only" (§2.2 step 2): any dynamic import() that esbuild would have to
// ship is a build failure; dynamic import of a node:* built-in stays allowed (store/db.ts).
function assertStaticImports(bundle, metafile) {
  for (const [input, info] of Object.entries(metafile.inputs)) {
    for (const imp of info.imports) {
      if (imp.kind === "dynamic-import" && !imp.path.startsWith("node:")) {
        throw new BuildError(`${bundle.name}: dynamic import of ${imp.path} in ${input}`);
      }
    }
  }
}

async function buildBundle(bundle, outDir, define) {
  const entry = path.join(REPO_ROOT, bundle.entry);
  let result;
  try {
    // A shebang must stay the first line, so the shim follows it.
    const shebang = bundle.banner === undefined ? "" : bundle.banner.js + "\n";
    const banner = { banner: { js: shebang + GETBUILTIN_SHIM } };
    const minify = bundle.minify === true ? { minify: true } : {};
    result = await esbuild.build({ ...ESBUILD_COMMON, ...banner, ...minify, define, entryPoints: [entry], outfile: path.join(outDir, bundle.out) });
  } catch (err) {
    const first = err && Array.isArray(err.errors) && err.errors.length > 0 ? err.errors[0] : undefined;
    const where = first && first.location ? ` (${first.location.file}:${first.location.line})` : "";
    throw new BuildError(`${bundle.name}: ${first ? first.text : String(err)}${where}`);
  }
  assertStaticImports(bundle, result.metafile);
}

// ADR-0002 GS7 (amended, D-FU-RM-PI-1) and ADR-0019 D1 (PO-NPM-2): no node_modules; one package.json of the D1
// shape (no dependencies, no scripts); its "files" equals the real top-level tree, so the npm tarball is exactly the
// tree SHA256SUMS lists. Runs after writeHashes (it only reads).
function assertOutTree(outDir) {
  const names = readdirSync(outDir);
  if (names.includes("node_modules")) throw new BuildError(`node_modules in ${outDir}`);
  try {
    assertOutPackageJson(JSON.parse(readFileSync(path.join(outDir, "package.json"), "utf8")));
  } catch (err) {
    throw new BuildError(`${outDir}/package.json: ${err && err.message ? err.message : String(err)}`);
  }
  const top = names.filter((n) => n !== "package.json").sort();
  if (JSON.stringify(top) !== JSON.stringify(OUT_FILES)) {
    throw new BuildError(`package.json files ${OUT_FILES.join(",")} differ from the tree ${top.join(",")}`);
  }
}

// §2.2 step 5 (D-M5-arch-4): verbatim copy, no transform; ships for the D5 round-trip self-check.
function copyFixture(outDir) {
  const dest = path.join(outDir, FIXTURE_OUT);
  mkdirSync(path.dirname(dest), { recursive: true });
  try {
    copyFileSync(FIXTURE_SRC, dest);
  } catch {
    throw new BuildError(`missing ${path.relative(REPO_ROOT, FIXTURE_SRC)}`);
  }
}

// §2.2 step 6: verbatim copy of skills/<name>/SKILL.md for the 3 command skills (impl/13 §5).
// D-HQ-SKILLS-1: gemini loads <extension>/skills and pi loads package.json pi.skills as they are, so each host
// gets its own copy, rendered from the one skills/ source with that host's real tool names (split/join).
const SKILL_HOSTS = Object.freeze(["claude-code", "gemini", "pi"]); // D-HQ-SKILLS-2: claude-code reads claude-code/skills

// ADR-0023 (D-NI-CODEX-1): the codex plugin (.codex-plugin/plugin.json "skills") reads its own rendered copy.
const SKILL_TARGETS = Object.freeze([
  ...SKILL_HOSTS.map((id) => [id, getAdapter(id).skillChannel.path]),
  ["codex", CODEX_PLUGIN_SKILLS],
]);

// D-HQ-SKILLS-3: gemini and qwen both load <extension>/skills, so that dir names the tool of every host that reads it.
function prefixesFor(dir) {
  return [...new Set(ADAPTERS.filter((r) => r.skillChannel.kind === "package" && r.skillChannel.path === dir).map((r) => r.toolNamePrefix))];
}

function copySkills(outDir) {
  for (const [id, dir] of SKILL_TARGETS) {
    const row = getAdapter(id);
    const prefixes = id === "codex" ? row.toolNamePrefix : prefixesFor(dir);
    for (const name of COMMAND_SKILLS) {
      const rel = path.join(SKILLS_DIR, name, SKILL_FILE);
      const src = path.join(REPO_ROOT, rel);
      if (!existsSync(src)) throw new BuildError(`missing ${rel}`);
      const dest = path.join(outDir, dir, name, SKILL_FILE);
      mkdirSync(path.dirname(dest), { recursive: true });
      writeFileSync(dest, renderSkill(readFileSync(src, "utf8"), prefixes));
    }
  }
}

async function main(outDir, sha, version) {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  // D-M5-arch-5: the one define; a dev/test build sets none, so BUNDLE_SHA stays undefined.
  const define = sha === undefined ? {} : { [BUNDLE_SHA_DEFINE]: JSON.stringify(sha) };
  // D-M5-P2-5: a full build deletes only the _generated.ts it wrote; one that --generated-only
  // wrote before it (gate v2-unit, parallel test files) stays.
  const keep = existsSync(GENERATED);
  try {
    writeGeneratedPrompt();
    for (const bundle of BUNDLES) await buildBundle(bundle, outDir, define);
  } finally {
    if (!keep) rmSync(GENERATED, { force: true });
  }
  generateManifests(outDir, version); // §2.2 step 4: manifests + hook configs from adapters/table.ts (impl/13 §3)
  copyFixture(outDir); // §2.2 step 5
  copySkills(outDir); // §2.2 step 6
  writeHashes(outDir); // §2.2 step 8: last, so SHA256SUMS covers the full tree
  assertOutTree(outDir); // read-only check of the finished tree (ADR-0019 D1)
}

try {
  const { outDir, generatedOnly, sha, version } = parseArgs(process.argv.slice(2));
  if (generatedOnly) writeGeneratedPrompt();
  else await main(outDir, sha, version);
} catch (err) {
  const reason = err instanceof BuildError ? err.message : String(err && err.message ? err.message : err);
  process.stderr.write(`build failed: ${reason.split("\n").join(" ")}\n`);
  process.exitCode = 1;
}
