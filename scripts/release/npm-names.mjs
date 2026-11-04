#!/usr/bin/env node
// D-NPM-NAMES-1 (ADR-0019): scripts/release/npm-names.json is the one list of npm names the release publishes.
//   main  = the name of the built package (build/manifests.ts writes it into release-out/package.json).
//   shims = extra names; each one depends on main at the same version and runs it (bins, OpenCode entry, pi extension).
// The bin context-mode stays in every case (ADR-0019 D1). The default config ({main:"context-mode", shims:[]}) gives
// the same publish as before: one `npm publish` in release-out; publish-shims does nothing.
// Usage:
//   node npm-names.mjs main [--config f]                            print the main name
//   node npm-names.mjs plan --tag T [--pkg dir] [--config f]        print the publish commands, one per line
//   node npm-names.mjs shim --name N --main M --version V --out dir [--bin b ...] [--pkg dir]   write one shim package
//   node npm-names.mjs publish-shims --pkg dir --version V --tag T [--config f] [--dry-run]
//        write each shim next to <pkg>, skip a name@version that npm already has, npm publish the rest.
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_CONFIG = fileURLToPath(new URL("./npm-names.json", import.meta.url));
export const BIN = "context-mode"; // ADR-0019 D1: the bin name in every config
export const PUBLISH_ARGS = ["publish", "--provenance", "--access", "public", "--tag"];
const NAME_RE = /^(@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/;

export class NpmNamesError extends Error {}

export function checkNames(cfg) {
  if (cfg === null || typeof cfg !== "object" || Array.isArray(cfg)) throw new NpmNamesError("npm-names: not an object");
  const keys = Object.keys(cfg).sort().join(",");
  if (keys !== "main,shims") throw new NpmNamesError("npm-names: keys must be main, shims (got " + keys + ")");
  if (typeof cfg.main !== "string" || !NAME_RE.test(cfg.main) || cfg.main.length > 214) throw new NpmNamesError("npm-names: bad main name " + JSON.stringify(cfg.main));
  if (!Array.isArray(cfg.shims)) throw new NpmNamesError("npm-names: shims must be an array");
  const seen = new Set([cfg.main]);
  for (const s of cfg.shims) {
    if (s === null || typeof s !== "object" || typeof s.name !== "string" || !NAME_RE.test(s.name)) throw new NpmNamesError("npm-names: bad shim " + JSON.stringify(s));
    if (seen.has(s.name)) throw new NpmNamesError("npm-names: name used twice: " + s.name);
    seen.add(s.name);
    if (!Array.isArray(s.bins) || s.bins.length === 0 || !s.bins.every((b) => typeof b === "string" && /^[a-z0-9][a-z0-9-]*$/.test(b))) {
      throw new NpmNamesError("npm-names: shim " + s.name + " needs bins, a non-empty array of command names");
    }
  }
  return cfg;
}

export const readNames = (file = DEFAULT_CONFIG) => checkNames(JSON.parse(readFileSync(file, "utf8")));

// Folder of one shim: next to the main package folder, so release-out stays equal to its SHA256SUMS.
export const shimDir = (pkg, name) => path.join(path.dirname(pkg), path.basename(pkg) + "-shims", name.replace(/^@/, "").replace("/", "__"));

// The publish plan: main first (the shims depend on it), then each shim. cwd is relative to the job's working dir.
export function plan(cfg, { tag, pkg = "release-out" }) {
  if (typeof tag !== "string" || tag === "") throw new NpmNamesError("npm-names: --tag is required");
  const argv = ["npm", ...PUBLISH_ARGS, tag];
  return [{ name: cfg.main, cwd: pkg, argv }, ...cfg.shims.map((s) => ({ name: s.name, cwd: shimDir(pkg, s.name), argv }))];
}

export const renderPlan = (steps) => steps.map((s) => `cd ${s.cwd} && ${s.argv.join(" ")}`).join("\n") + "\n";

const README = (name, main, bins) => `# ${name}

Context Mode lives at [${main}](https://www.npmjs.com/package/${main}). This package installs ${main} and gives you the ${bins.map((b) => "\`" + b + "\`").join(" and ")} command.

Source: https://github.com/mksglu/context-mode
`;

// One shim package: package.json, root.mjs (finds the main package), cli.mjs, opencode/plugin.js, pi/index.js, README.md, LICENSE.
export function writeShim({ name, main, version, bins = [BIN], out, pkg }) {
  for (const n of [name, main]) if (!NAME_RE.test(n)) throw new NpmNamesError("npm-names: bad name " + n);
  if (typeof version !== "string" || version === "") throw new NpmNamesError("npm-names: --version is required");
  const meta = pkg && existsSync(path.join(pkg, "package.json")) ? JSON.parse(readFileSync(path.join(pkg, "package.json"), "utf8")) : {};
  rmSync(out, { recursive: true, force: true });
  mkdirSync(path.join(out, "opencode"), { recursive: true });
  mkdirSync(path.join(out, "pi"), { recursive: true });
  const files = ["cli.mjs", "root.mjs", "opencode", "pi", "README.md"];
  const pj = {
    name, version, type: "module",
    description: `Context Mode, published as ${main}. This package installs ${main}.`,
    bin: Object.fromEntries(bins.map((b) => [b, "cli.mjs"])),
    main: "./opencode/plugin.js",
    exports: { ".": "./opencode/plugin.js", "./server": "./opencode/plugin.js" },
    pi: { extensions: ["./pi/index.js"] },
    files,
    dependencies: { [main]: version },
  };
  for (const k of ["engines", "license", "homepage", "bugs", "repository", "keywords"]) if (meta[k] !== undefined) pj[k] = meta[k];
  if (pkg && existsSync(path.join(pkg, "LICENSE"))) { copyFileSync(path.join(pkg, "LICENSE"), path.join(out, "LICENSE")); files.push("LICENSE"); }
  writeFileSync(path.join(out, "package.json"), JSON.stringify(pj, null, 2) + "\n");
  writeFileSync(path.join(out, "root.mjs"), `// Finds the folder of ${main}: its exports "." is ./opencode/plugin.js, one level below the root.
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const MAIN = ${JSON.stringify(main)};
export const root = path.resolve(path.dirname(createRequire(import.meta.url).resolve(MAIN)), "..");
export const fileUrl = (rel) => pathToFileURL(path.join(root, rel)).href;
`);
  writeFileSync(path.join(out, "cli.mjs"), `#!/usr/bin/env node
// Runs the CLI of ${main} with the same arguments, stdio and exit code.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { root } from "./root.mjs";

const r = spawnSync(process.execPath, [path.join(root, "cli.mjs"), ...process.argv.slice(2)], { stdio: "inherit" });
if (r.error) throw r.error;
if (r.signal) process.kill(process.pid, r.signal);
process.exit(r.status ?? 1);
`);
  writeFileSync(path.join(out, "opencode", "plugin.js"), `// OpenCode loads this package by name; the plugin is the one in ${main}.
export * from ${JSON.stringify(main)};
export { default } from ${JSON.stringify(main)};
`);
  writeFileSync(path.join(out, "pi", "index.js"), `// pi loads this extension; it runs the pi extension of ${main}.
import { fileUrl } from "../root.mjs";

export default async function contextMode(api) {
  const m = await import(fileUrl("pi/index.js"));
  return m.default(api);
}
`);
  writeFileSync(path.join(out, "README.md"), README(name, main, bins));
  return out;
}

function flags(argv) {
  const f = { bin: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") { f.dryRun = true; continue; }
    if (!a.startsWith("--") || i + 1 >= argv.length) throw new NpmNamesError("npm-names: bad argument " + a);
    const k = a.slice(2), v = argv[++i];
    if (k === "bin") f.bin.push(v); else f[k] = v;
  }
  return f;
}

const sh = (cmd, args, cwd) => spawnSync(cmd, args, { cwd, encoding: "utf8", shell: process.platform === "win32" });
const published = (name, version) => (sh("npm", ["view", `${name}@${version}`, "version"]).stdout ?? "").trim() === version;

export function main(argv) {
  const [cmd, ...rest] = argv;
  const f = flags(rest);
  const cfg = () => readNames(f.config ?? DEFAULT_CONFIG);
  if (cmd === "main") { process.stdout.write(cfg().main + "\n"); return 0; }
  if (cmd === "plan") { process.stdout.write(renderPlan(plan(cfg(), { tag: f.tag, pkg: f.pkg }))); return 0; }
  if (cmd === "shim") {
    writeShim({ name: f.name, main: f.main, version: f.version, bins: f.bin.length ? f.bin : [BIN], out: path.resolve(f.out), pkg: f.pkg && path.resolve(f.pkg) });
    console.log("wrote " + f.out);
    return 0;
  }
  if (cmd === "publish-shims") {
    const c = cfg();
    const pkg = f.pkg ?? "release-out";
    if (c.shims.length === 0) { console.log("npm-names: no shims in the config"); return 0; }
    for (const step of plan(c, { tag: f.tag, pkg }).slice(1)) {
      const s = c.shims.find((x) => x.name === step.name);
      writeShim({ name: s.name, main: c.main, version: f.version, bins: s.bins, out: path.resolve(step.cwd), pkg: path.resolve(pkg) });
      if (f.dryRun) { console.log("dry-run: " + renderPlan([step]).trim()); continue; }
      if (published(s.name, f.version)) { console.log(`npm-names: ${s.name}@${f.version} is on npm, skip`); continue; }
      const r = spawnSync(step.argv[0], step.argv.slice(1), { cwd: step.cwd, stdio: "inherit", shell: process.platform === "win32" });
      if (r.status !== 0) { console.error(`npm-names: npm publish of ${s.name} failed`); return 1; }
    }
    return 0;
  }
  console.error("usage: npm-names.mjs main|plan|shim|publish-shims [flags]");
  return 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exit(main(process.argv.slice(2))); } catch (e) { console.error(e instanceof NpmNamesError ? e.message : e); process.exit(1); }
}
