/**
 * Codex CLI marketplace discovery — layout contract.
 *
 * These tests pin what Codex CLI v0.130.0 actually does, not what we wish
 * it did. Every assertion mirrors a specific line in the Codex Rust source
 * under refs/platforms/codex/codex-rs/core-plugins/src/marketplace.rs.
 *
 * THE FAILURE MODES WE'RE PINNING (proven against Codex v0.130.0/v0.131.0):
 *
 *   Before this fix, `codex plugin marketplace add <repo>` succeeded but
 *   the plugin never appeared in /plugin. Why? Codex deserializes our
 *   marketplace.json fine (any string is a valid Path variant), but
 *   `resolve_local_plugin_source_path` at marketplace.rs:502-518 does:
 *
 *     let Some(path) = path.strip_prefix("./") else { error };
 *     if path.is_empty() { error };  // ← rejects "./" with empty-string error
 *
 *   That error is then caught silently at marketplace.rs:446-452 via
 *   `warn!(... skipping marketplace plugin that failed to resolve)` and
 *   the plugin is dropped. Exit code stays 0, marketplace entry exists in
 *   ~/.codex/config.toml, but the plugins vec is empty.
 *
 *   The first workaround used `./plugins/context-mode` plus a git symlink to
 *   `..`, making the resolved plugin root the repository root on Unix. On
 *   native Windows, Git commonly checks symlinks out as regular files
 *   containing the target text (`..`), so `codex plugin add` failed with
 *   `missing plugin.json`.
 *
 *   So the contract Codex enforces is:
 *     1. marketplace.json MUST be at .agents/plugins/marketplace.json OR
 *        .claude-plugin/marketplace.json (MARKETPLACE_MANIFEST_RELATIVE_PATHS
 *        constant at marketplace.rs:21). Codex tries them in that order.
 *     2. A local plugin source cannot reference the marketplace root
 *        (`"./"` is rejected as an empty local path), so repo-root plugins
 *        must avoid `source: "local"` + symlink shims.
 *     3. A git URL source with `url: "./"` is resolved relative to the
 *        marketplace root, cloned into Codex's staging directory, and installed
 *        from that materialized repo root. That root contains
 *        `.codex-plugin/plugin.json`, so install works without symlinks.
 *     4. `${CODEX_PLUGIN_ROOT}` placeholders are NOT interpolated — upstream
 *        openai/codex#19582 is OPEN. So our shipped manifests must work
 *        without any variable substitution.
 */

import { describe, test } from "vitest";
import { strict as assert } from "node:assert";
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO_ROOT = resolve(__dirname, "..", "..");

/**
 * The set of marketplace manifest paths Codex actually reads, in priority
 * order. Sourced verbatim from
 * `refs/platforms/codex/codex-rs/core-plugins/src/marketplace.rs:21`:
 *
 *   const MARKETPLACE_MANIFEST_RELATIVE_PATHS: &[&str] = &[
 *       ".agents/plugins/marketplace.json",
 *       ".claude-plugin/marketplace.json",
 *   ];
 *
 * `.codex-plugin/marketplace.json` is NOT in this list — Codex never reads it.
 */
const CODEX_MARKETPLACE_PATHS = [
  ".agents/plugins/marketplace.json",
  ".claude-plugin/marketplace.json",
] as const;

interface RawPluginSourceObject {
  source: "local" | "url" | "git-subdir";
  path?: string;
  url?: string;
  ref?: string;
  sha?: string;
}

interface RawPluginEntry {
  name: string;
  source: string | RawPluginSourceObject;
  policy?: Record<string, unknown>;
  category?: string;
}

interface RawMarketplaceManifest {
  name: string;
  interface?: { displayName?: string };
  plugins: RawPluginEntry[];
}

function requireObjectSource(
  plugin: RawPluginEntry,
): RawPluginSourceObject {
  assert.equal(
    typeof plugin.source,
    "object",
    `Plugin '${plugin.name}' should use an object source so the intent is explicit.`,
  );
  return plugin.source as RawPluginSourceObject;
}

describe("Codex marketplace discovery contract — v0.130.0", () => {
  test("ships .agents/plugins/marketplace.json (Codex's primary read path)", () => {
    const agentsPath = join(REPO_ROOT, ".agents/plugins/marketplace.json");
    assert.ok(
      existsSync(agentsPath),
      `Missing ${agentsPath}. Codex tries MARKETPLACE_MANIFEST_RELATIVE_PATHS in order: ` +
        `[.agents/plugins/marketplace.json, .claude-plugin/marketplace.json]. ` +
        `Without the .agents/ file Codex falls back to .claude-plugin which has a different schema ` +
        `(source: "./" string) that fails its strip_prefix non-empty check.`,
    );
  });

  test("Codex-canonical marketplace manifest parses cleanly + has at least one plugin", () => {
    const path = join(REPO_ROOT, ".agents/plugins/marketplace.json");
    const raw = readFileSync(path, "utf-8");
    const manifest = JSON.parse(raw) as RawMarketplaceManifest;
    assert.equal(typeof manifest.name, "string", "manifest.name required (marketplace.rs:697)");
    assert.ok(manifest.name.length > 0, "manifest.name must be non-empty");
    assert.ok(
      Array.isArray(manifest.plugins),
      "manifest.plugins must be an array (marketplace.rs:700)",
    );
    assert.ok(
      manifest.plugins.length >= 1,
      "manifest.plugins must contain at least one entry",
    );
  });

  test("does not rely on a local source symlink shim for the repo-root plugin", () => {
    const path = join(REPO_ROOT, ".agents/plugins/marketplace.json");
    const manifest = JSON.parse(readFileSync(path, "utf-8")) as RawMarketplaceManifest;
    for (const plugin of manifest.plugins) {
      const source = requireObjectSource(plugin);
      assert.notEqual(
        source.source,
        "local",
        `Plugin '${plugin.name}' must not use a local source path. The old ` +
          `./plugins/${plugin.name} symlink checked out as a regular '..' file on Windows.`,
      );
    }
  });

  test("uses a relative git self-clone so Codex installs from the materialized repo root", () => {
    const path = join(REPO_ROOT, ".agents/plugins/marketplace.json");
    const manifest = JSON.parse(readFileSync(path, "utf-8")) as RawMarketplaceManifest;
    for (const plugin of manifest.plugins) {
      const source = requireObjectSource(plugin);
      assert.equal(
        source.source,
        "url",
        `Plugin '${plugin.name}' should use Codex's git URL source path, not a local symlink.`,
      );
      assert.equal(
        source.url,
        "./",
        `Plugin '${plugin.name}' should clone the installed marketplace root itself.`,
      );
      assert.equal(
        source.path,
        undefined,
        `Plugin '${plugin.name}' must install from the cloned repo root, not a subdir.`,
      );

      const pluginJson = join(REPO_ROOT, ".codex-plugin", "plugin.json");
      assert.ok(
        existsSync(pluginJson),
        `Plugin '${plugin.name}' self-clones the marketplace root, but ${pluginJson} is missing. ` +
          `Codex's PluginStore would report missing plugin.json after materialization.`,
      );
    }
  });

  test("old Windows-hostile plugins/context-mode symlink shim is gone", () => {
    const shim = join(REPO_ROOT, "plugins", "context-mode");
    assert.ok(
      !existsSync(shim),
      `${shim} must not exist. Git symlinks often checkout as a regular '..' file on ` +
        `native Windows, which makes Codex install fail with missing plugin.json.`,
    );
  });

  test("no ${CODEX_PLUGIN_ROOT} / ${CLAUDE_PLUGIN_ROOT} placeholders in Codex-facing manifests (upstream openai/codex#19582)", () => {
    // Codex does NOT interpolate these placeholders in plugin manifest
    // values — proven by zero `interpolat*`/`expand_env*`/`envsubst*` in
    // codex-rs/core-plugins/src/. Any placeholder in our manifests would
    // be passed through literally and break MCP server spawn / hook exec.
    const filesToCheck = [
      ".agents/plugins/marketplace.json",
      ".codex-plugin/plugin.json",
      ".codex-plugin/mcp.json",
      ".codex-plugin/hooks.json",
    ];
    for (const rel of filesToCheck) {
      const absPath = join(REPO_ROOT, rel);
      if (!existsSync(absPath)) continue; // optional files are OK to skip
      const content = readFileSync(absPath, "utf-8");
      assert.doesNotMatch(
        content,
        /\$\{CODEX_PLUGIN_ROOT\}|\$\{CLAUDE_PLUGIN_ROOT\}/,
        `${rel} contains a \${CODEX_PLUGIN_ROOT}/\${CLAUDE_PLUGIN_ROOT} placeholder. ` +
          `Codex never interpolates these (openai/codex#19582 OPEN). The literal string ` +
          `would be passed to MCP spawn / hook exec verbatim and fail.`,
      );
    }
  });

  test(".codex-plugin/marketplace.json is removed (dead path — Codex never reads it)", () => {
    const deadPath = join(REPO_ROOT, ".codex-plugin/marketplace.json");
    assert.ok(
      !existsSync(deadPath),
      `${deadPath} still exists. Codex's MARKETPLACE_MANIFEST_RELATIVE_PATHS at ` +
        `marketplace.rs:21 does NOT include this path — keeping it ships dead bytes and ` +
        `misleads contributors into editing the wrong file.`,
    );
  });
});
