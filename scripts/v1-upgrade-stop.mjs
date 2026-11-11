#!/usr/bin/env node
// scripts/v1-upgrade-stop.mjs — package.json `build` of the dev tree (#1363, ADR-0011, DEVIATIONS D-V1-UPGRADE-STOP-1).
// A 1.0.x `context-mode upgrade` (and 1.0.x ctx_upgrade) clones `main`, runs `npm install` and then this `build` script there,
// and only then copies files over the install. This script is that build step: it writes nothing and exits 1, so the
// 1.0.x upgrade takes its own "NOT updated" path and the install stays whole. It names the native install command.
// Contributors build with `npm run build:release` (node build/build.mjs --out release-out). Not in the release tree.
const lines = [
  "context-mode 2 updates with your agent's own install command.",
  "For a global npm install: npm i -g context-mode",
  "Guide: https://github.com/mksglu/context-mode/blob/main/docs/install/README.md",
  "To build this checkout: npm run build:release (node build/build.mjs --out release-out)",
];
process.stderr.write(lines.join("\n") + "\n");
process.exitCode = 1;
