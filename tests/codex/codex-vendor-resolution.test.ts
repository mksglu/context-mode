import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, test } from "vitest";

const REPO_ROOT = resolve(__dirname, "..", "..");
const CODEX_START = resolve(REPO_ROOT, ".codex-plugin", "plugin-start.mjs");

describe("Codex-only marketplace vendor resolution", () => {
  test("maps pure-JS runtime deps to .codex-plugin/vendor without node_modules", async () => {
    const start = await import(`${pathToFileURL(CODEX_START).href}?t=${Date.now()}`);
    expect(start.assertCodexPluginArtifact(REPO_ROOT)).toEqual([]);

    const installed = start.installCodexVendorResolver(REPO_ROOT) as {
      map: Record<string, string>;
      restore: () => void;
    };
    try {
      const requireFromServer = createRequire(resolve(REPO_ROOT, "server.bundle.mjs"));
      expect(requireFromServer.resolve("turndown")).toBe(installed.map.turndown);
      expect(requireFromServer.resolve("turndown-plugin-gfm")).toBe(
        installed.map["turndown-plugin-gfm"],
      );

      expect(typeof requireFromServer("turndown")).toBe("function");
      expect(typeof requireFromServer("turndown-plugin-gfm").gfm).toBe("function");
    } finally {
      installed.restore();
    }
  });

  test("installs resolver idempotently for repeated calls", async () => {
    const start = await import(`${pathToFileURL(CODEX_START).href}?t=${Date.now()}`);

    const first = start.installCodexVendorResolver(REPO_ROOT) as {
      map: Record<string, string>;
      restore: () => void;
    };
    const second = start.installCodexVendorResolver(REPO_ROOT) as {
      map: Record<string, string>;
      restore: () => void;
    };

    try {
      expect(second).toBe(first);
      const requireFromServer = createRequire(resolve(REPO_ROOT, "server.bundle.mjs"));
      expect(requireFromServer.resolve("turndown")).toBe(first.map.turndown);
    } finally {
      first.restore();
    }
  });

  test("keeps Codex bootstrap isolated from shared lifecycle state", () => {
    const source = readFileSync(CODEX_START, "utf8");

    expect(source).not.toContain("../start.mjs");
    expect(source).not.toContain("installed_plugins");
    expect(source).not.toContain("settings.json");
    expect(source).not.toContain(".claude");
    expect(source).not.toContain("plugins/cache");
  });
});
