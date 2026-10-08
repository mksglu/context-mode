import { afterEach, describe, expect, test } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { shouldRetryDependencyInstall } from "../../hooks/ensure-deps.mjs";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("hook dependency install retry", () => {
  test("retries without a failure marker and after the cooldown expires", () => {
    const root = mkdtempSync(join(tmpdir(), "ctx-deps-retry-"));
    roots.push(root);
    const nodeModules = join(root, "node_modules");
    const marker = join(nodeModules, ".ctx-install-failed");
    const now = Date.now();

    expect(shouldRetryDependencyInstall(root, now)).toBe(true);
    mkdirSync(nodeModules);
    writeFileSync(marker, "failed\n");
    utimesSync(marker, new Date(now), new Date(now));
    expect(shouldRetryDependencyInstall(root, now + 14 * 60 * 1000)).toBe(false);
    expect(shouldRetryDependencyInstall(root, now + 15 * 60 * 1000)).toBe(true);
  });
});
