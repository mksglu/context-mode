#!/usr/bin/env node
// Sync version from package.json to all manifest files.
// Runs automatically via npm `version` lifecycle hook.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Single source of truth for the set of manifests whose version must track
// package.json. Exported so tests/scripts/version-sync.test.ts can derive its
// lockstep + `git add` coverage assertions from this exact list instead of a
// hand-copied duplicate — the duplication is what let manifests silently drift
// across releases (#768; cf. the .cursor-plugin v1.0.111 incident). Any entry
// added here is automatically (a) version-synced below, (b) lockstep-asserted,
// and (c) checked for presence in the npm `version` `git add` list.
export const TARGETS = [
  ".claude-plugin/plugin.json",
  ".claude-plugin/marketplace.json",
  ".cursor-plugin/plugin.json",
  ".codex-plugin/plugin.json",
  // .codex-plugin/marketplace.json is intentionally absent — Codex CLI
  // reads marketplaces from .agents/plugins/marketplace.json (or
  // .claude-plugin/marketplace.json for Claude-compat). See
  // refs/platforms/codex/codex-rs/core-plugins/src/marketplace.rs:21
  // (MARKETPLACE_MANIFEST_RELATIVE_PATHS).
  //
  // .agents/plugins/marketplace.json has no top-level `version` field
  // (per the Codex serde schema at marketplace.rs:694-700 — only `name`,
  // `interface`, and `plugins[]`), so it doesn't need version-syncing.
  // Per-plugin `version` lives in .codex-plugin/plugin.json which is
  // already in this list.
  ".openclaw-plugin/openclaw.plugin.json",
  ".openclaw-plugin/package.json",
  "openclaw.plugin.json",
  ".pi/extensions/context-mode/package.json",
  // Antigravity CLI (agy) plugin bundle manifest — agy installs it via
  // `agy plugin install configs/antigravity-cli`. Without this entry it would
  // freeze at its pinned version on the next bump (cf. the .cursor-plugin
  // v1.0.111 drift the version-sync test guards against).
  "configs/antigravity-cli/plugin.json",
  // GitHub Copilot CLI plugin bundle manifest — installed via
  // `copilot plugin install <repo>:configs/copilot-cli`. Same drift guard as
  // the agy bundle above: without this it freezes at its pinned version on the
  // next bump (cf. the .cursor-plugin v1.0.111 drift the version-sync test guards).
  "configs/copilot-cli/.github/plugin/plugin.json",
];

function syncManifests() {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const version = pkg.version;

  console.log(`→ syncing version ${version} to manifests...`);

  const failures = [];
  for (const file of TARGETS) {
    try {
      const content = JSON.parse(readFileSync(file, "utf8"));
      if (content.version !== undefined) content.version = version;
      if (content.metadata?.version !== undefined) content.metadata.version = version;
      if (content.plugins) {
        for (const p of content.plugins) {
          if (p.version !== undefined) p.version = version;
        }
      }
      writeFileSync(file, JSON.stringify(content, null, 2) + "\n");
      console.log(`  ✓ ${file}`);
    } catch (e) {
      // Fail loud, don't skip: a listed target that can't be read/written is a
      // manifest that will ship stale. Silently warning-and-continuing (the
      // pre-#768 behavior) is exactly how a renamed/missing manifest drifts
      // forever without anyone noticing until a user files an install bug.
      console.error(`  ✗ ${file} — ${e.message}`);
      failures.push(file);
    }
  }

  // Hermes requires a root YAML manifest. Keep it in release lockstep without
  // adding a YAML dependency to this release script.
  try {
    const file = "plugin.yaml";
    const raw = readFileSync(file, "utf8");
    if (!/^version:\s*["']?[^\n"']+["']?\s*$/m.test(raw)) throw new Error("version field missing");
    writeFileSync(file, raw.replace(/^version:\s*.*$/m, `version: "${version}"`));
    console.log(`  ✓ ${file}`);
  } catch (e) {
    console.error(`  ✗ plugin.yaml — ${e.message}`);
    failures.push("plugin.yaml");
  }

  if (failures.length > 0) {
    console.error(
      `version-sync: FAIL — ${failures.length} manifest(s) could not be synced: ${failures.join(", ")}`,
    );
    process.exit(1);
  }

  console.log(`✓ all manifests at v${version}`);
}

// Only run the sync when executed directly (npm `version` hook). When imported
// (e.g. by the test that reads TARGETS as the source of truth), do nothing.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  syncManifests();
}

// Note: package.json's `omp` block intentionally has no `version` field.
// The OMP loader stamps `manifest.version = pluginPkg.version` from the
// top-level package.json:version at load time (see
// refs/platforms/oh-my-pi/packages/coding-agent/src/extensibility/plugins/
// loader.ts:87), so a duplicate would just drift on every release without
// adding any signal. The `pi` block follows the same upstream rule.
