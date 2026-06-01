#!/usr/bin/env node
import * as esbuild from "esbuild";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vendorRoot = resolve(repoRoot, ".codex-plugin", "vendor");

// Codex marketplace installs can start without node_modules. server.bundle.mjs
// injects physical Turndown module paths into a sandbox subprocess, so the
// Codex artifact needs physical pure-JS vendor bundles next to the plugin.
const vendorEntries = [
  {
    packageName: "turndown",
    outfile: resolve(vendorRoot, "turndown.cjs"),
  },
  {
    packageName: "turndown-plugin-gfm",
    outfile: resolve(vendorRoot, "turndown-plugin-gfm.cjs"),
  },
];

await mkdir(vendorRoot, { recursive: true });

for (const { packageName, outfile } of vendorEntries) {
  await esbuild.build({
    entryPoints: [require.resolve(packageName)],
    bundle: true,
    platform: "node",
    target: "node18",
    format: "cjs",
    outfile,
    minify: true,
  });
}
