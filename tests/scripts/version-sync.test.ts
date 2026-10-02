/**
 * version-sync tests — guards the cross-manifest version invariant.
 *
 * The npm `version` lifecycle calls `scripts/version-sync.mjs` to copy
 * `package.json:version` into every shipped manifest. When a new plugin
 * surface is added (Cursor, Codex, OMP, Pi, …), it MUST be added to BOTH:
 *
 *   1. `scripts/version-sync.mjs` → `targets[]` (so the value gets written)
 *   2. `package.json` → `scripts.version` `git add` list (so it is staged
 *      by the npm `version` hook into the release commit)
 *
 * If either is missing, the manifest will drift on every release. This
 * has happened in real life — `.cursor-plugin/plugin.json` got stuck at
 * v1.0.111 because it was in the targets list but the cursor adapter
 * landed before its manifest version was bumped. End-to-end test below
 * runs version-sync against a temp scratch repo and asserts every
 * manifest is rewritten.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, cpSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
// Single source of truth — the same array the script iterates at release time.
// Importing it (rather than re-declaring the list) is what makes the lockstep
// and git-add coverage assertions below exhaustive: a manifest added to the
// script is automatically covered, so it can never silently drift again (#768).
import { TARGETS } from "../../scripts/version-sync.mjs";

const REPO_ROOT = resolve(__dirname, "..", "..");
const SCRIPT_SRC = readFileSync(resolve(REPO_ROOT, "scripts/version-sync.mjs"), "utf8");
const PKG_JSON = JSON.parse(readFileSync(resolve(REPO_ROOT, "package.json"), "utf8")) as {
  scripts: { version: string };
};

describe("scripts/version-sync.mjs targets", () => {
  it("syncs the root Hermes plugin manifest", () => {
    expect(SCRIPT_SRC).toContain('const file = "plugin.yaml"');
    expect(PKG_JSON.scripts.version).toContain("plugin.yaml");
  });
  it("includes .codex-plugin/plugin.json", () => {
    expect(SCRIPT_SRC).toContain('".codex-plugin/plugin.json"');
  });

  it("includes configs/antigravity-cli/plugin.json (agy native bundle)", () => {
    expect(SCRIPT_SRC).toContain('"configs/antigravity-cli/plugin.json"');
  });

  it("includes configs/copilot-cli/.github/plugin/plugin.json (Copilot CLI bundle)", () => {
    expect(SCRIPT_SRC).toContain('"configs/copilot-cli/.github/plugin/plugin.json"');
  });

  it("does NOT include .codex-plugin/marketplace.json (Codex never reads that path)", () => {
    // Codex CLI's MARKETPLACE_MANIFEST_RELATIVE_PATHS constant
    // (refs/platforms/codex/codex-rs/core-plugins/src/marketplace.rs:21)
    // lists only `.agents/plugins/marketplace.json` and `.claude-plugin/
    // marketplace.json`. Shipping `.codex-plugin/marketplace.json` is dead
    // weight and historically misled contributors into editing the wrong
    // file. The actual Codex marketplace at `.agents/plugins/marketplace.json`
    // has no top-level `version` field per the Codex serde schema
    // (marketplace.rs:694-700 — only `name`, `interface`, `plugins[]`), so
    // version-sync doesn't need to touch it.
    expect(SCRIPT_SRC).not.toContain('"\.codex-plugin/marketplace.json"');
  });
});

describe("package.json `version` script `git add` list", () => {
  it("includes .codex-plugin/plugin.json", () => {
    expect(PKG_JSON.scripts.version).toContain(".codex-plugin/plugin.json");
  });

  it("includes configs/antigravity-cli/plugin.json (agy native bundle)", () => {
    expect(PKG_JSON.scripts.version).toContain("configs/antigravity-cli/plugin.json");
  });

  it("includes configs/copilot-cli/.github/plugin/plugin.json (Copilot CLI bundle)", () => {
    expect(PKG_JSON.scripts.version).toContain("configs/copilot-cli/.github/plugin/plugin.json");
  });

  it("does NOT include .codex-plugin/marketplace.json (file is removed — Codex never reads it)", () => {
    expect(PKG_JSON.scripts.version).not.toContain(".codex-plugin/marketplace.json");
  });
});

describe("version-sync TARGETS is the single source of truth (#768)", () => {
  // Root-cause guard for #768. Prior drifts (cursor stuck at v1.0.111, plus
  // the codex / pi / agy / copilot additions) all shared one shape: a manifest
  // was added to ONE hand-maintained copy of the list but not the others
  // (script targets[], package.json `git add`, and the test's own SHIPPED[]).
  // These assertions derive everything from the script's exported TARGETS so a
  // new manifest is covered the moment it is added to the script — there is no
  // second list to forget.
  it("exports a non-empty TARGETS array", () => {
    expect(Array.isArray(TARGETS)).toBe(true);
    expect(TARGETS.length).toBeGreaterThan(0);
  });

  it("stages EVERY target in the npm `version` lifecycle `git add` list", () => {
    // If version-sync rewrites a manifest but the `version` hook never stages
    // it, the change is dropped from the release commit and the manifest drifts
    // on the next bump (exactly the .cursor-plugin v1.0.111 incident).
    const gitAdd = PKG_JSON.scripts.version;
    const missing = TARGETS.filter((t) => !gitAdd.includes(t));
    expect(missing, `targets missing from package.json \`version\` git add list: ${missing.join(", ")}`).toEqual([]);
  });

  it("keeps EVERY target in lockstep with package.json version", () => {
    const pkg = JSON.parse(readFileSync(resolve(REPO_ROOT, "package.json"), "utf8")) as {
      version: string;
    };
    const drifted: string[] = [];
    for (const manifest of TARGETS) {
      const content = JSON.parse(readFileSync(resolve(REPO_ROOT, manifest), "utf8")) as {
        version?: string;
        metadata?: { version?: string };
        plugins?: Array<{ version?: string }>;
      };
      const reported =
        content.version ?? content.metadata?.version ?? content.plugins?.[0]?.version;
      if (reported !== pkg.version) drifted.push(`${manifest} (${String(reported)})`);
    }
    expect(drifted, `manifests not at v${pkg.version}: ${drifted.join(", ")}`).toEqual([]);
  });
});

describe("shipped manifests are in lockstep with package.json", () => {
  // Catches drift like `.cursor-plugin/plugin.json` stuck at v1.0.111
  // while package.json was at v1.0.118 — happened because the cursor
  // manifest was missing from the npm `version` lifecycle `git add` list
  // so even though version-sync rewrote it, the change was never staged.
  const pkg = JSON.parse(readFileSync(resolve(REPO_ROOT, "package.json"), "utf8")) as {
    version: string;
  };
  // Per-manifest named cases, derived from the same TARGETS source of truth so
  // there is no hand-copied list to fall out of sync. .codex-plugin/
  // marketplace.json is intentionally absent from TARGETS — Codex never reads
  // that path; see marketplace.rs:21.
  for (const manifest of TARGETS) {
    it(`${manifest} matches package.json version`, () => {
      const content = JSON.parse(readFileSync(resolve(REPO_ROOT, manifest), "utf8")) as {
        version?: string;
        metadata?: { version?: string };
        plugins?: Array<{ version?: string }>;
      };
      const reported = content.version ?? content.metadata?.version ?? content.plugins?.[0]?.version;
      expect(reported, `${manifest} has no recognizable version field`).toBeDefined();
      expect(reported).toBe(pkg.version);
    });
  }
});

describe("version-sync end-to-end", () => {
  it("rewrites every manifest (including .cursor-plugin and .codex-plugin) to the package.json version", () => {
    // Copy a minimal subset of the repo into a scratch dir, then run
    // version-sync there and assert every target ends up at the same version.
    const scratch = mkdtempSync(join(tmpdir(), "version-sync-test-"));
    try {
      // Mirror the directory structure version-sync expects — derived from
      // TARGETS so a target in a new directory doesn't silently skip the e2e.
      const dirs = new Set<string>(["scripts"]);
      for (const t of TARGETS) {
        const dir = t.split("/").slice(0, -1).join("/");
        if (dir) dirs.add(dir);
      }
      for (const d of dirs) mkdirSync(join(scratch, d), { recursive: true });

      // Copy the actual manifests (drives a real, not synthetic, assertion).
      // Derived from TARGETS so the e2e set never drifts from what the script
      // actually rewrites. .codex-plugin/marketplace.json is intentionally
      // absent from TARGETS — Codex never reads that path; see marketplace.rs:21.
      const manifests = TARGETS;
      for (const m of manifests) {
        cpSync(resolve(REPO_ROOT, m), join(scratch, m));
      }
      cpSync(resolve(REPO_ROOT, "scripts/version-sync.mjs"), join(scratch, "scripts/version-sync.mjs"));
      cpSync(resolve(REPO_ROOT, "plugin.yaml"), join(scratch, "plugin.yaml"));

      // Write a synthetic package.json with a fresh version we can detect.
      const TEST_VERSION = "9.9.9-test";
      writeFileSync(
        join(scratch, "package.json"),
        JSON.stringify({ name: "context-mode", version: TEST_VERSION }, null, 2),
      );

      const result = spawnSync("node", ["scripts/version-sync.mjs"], {
        cwd: scratch,
        encoding: "utf8",
      });
      expect(result.status).toBe(0);

      for (const m of manifests) {
        const content = JSON.parse(readFileSync(join(scratch, m), "utf8"));
        const checks: Array<{ path: string; value: unknown }> = [];
        if (content.version !== undefined) checks.push({ path: "version", value: content.version });
        if (content.metadata?.version !== undefined) {
          checks.push({ path: "metadata.version", value: content.metadata.version });
        }
        if (Array.isArray(content.plugins)) {
          for (let i = 0; i < content.plugins.length; i++) {
            const p = content.plugins[i] as { version?: string };
            if (p.version !== undefined) {
              checks.push({ path: `plugins[${i}].version`, value: p.version });
            }
          }
        }
        for (const c of checks) {
          expect(c.value, `${m}.${c.path} should be ${TEST_VERSION}`).toBe(TEST_VERSION);
        }
      }
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });
});
