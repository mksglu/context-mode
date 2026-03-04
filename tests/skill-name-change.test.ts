/**
 * Skill Name Change Tests -- cm- prefix
 *
 * Verifies that skill directories were moved from doctor/upgrade/stats
 * to cm-doctor/cm-upgrade/cm-stats, and that SKILL.md frontmatter and
 * body references were updated accordingly.
 */

import { strict as assert } from "node:assert";
import { statSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = join(__dirname, "..");

let passed = 0;
let failed = 0;
const results: {
  name: string;
  status: "PASS" | "FAIL";
  time: number;
  error?: string;
}[] = [];

async function test(name: string, fn: () => void | Promise<void>) {
  const start = performance.now();
  try {
    await fn();
    const time = performance.now() - start;
    passed++;
    results.push({ name, status: "PASS", time });
    console.log(`  ✓ ${name} (${time.toFixed(0)}ms)`);
  } catch (err: any) {
    const time = performance.now() - start;
    failed++;
    results.push({ name, status: "FAIL", time, error: err.message });
    console.log(`  ✗ ${name} (${time.toFixed(0)}ms)`);
    console.log(`    Error: ${err.message}`);
  }
}

async function main() {
  console.log("\nSkill Rename Tests (cm- prefix)");
  console.log("================================\n");

  const newNames = ["cm-doctor", "cm-upgrade", "cm-stats"];
  const oldNames = ["doctor", "upgrade", "stats"];

  // Test 1: Renamed directories exist
  await test("renamed skill directories exist (cm-doctor, cm-upgrade, cm-stats)", () => {
    for (const name of newNames) {
      const dir = join(PLUGIN_ROOT, "skills", name);
      let stat;
      try {
        stat = statSync(dir);
      } catch {
        throw new Error(`Directory does not exist: skills/${name}`);
      }
      assert.ok(stat.isDirectory(), `Expected a directory at: skills/${name}`);
    }
  });

  // Test 2: Old directories are gone
  await test("old skill directories removed (doctor, upgrade, stats)", () => {
    for (const name of oldNames) {
      const dir = join(PLUGIN_ROOT, "skills", name);
      let exists = false;
      try {
        statSync(dir);
        exists = true;
      } catch {
        /* expected — directory should not exist */
      }
      assert.ok(!exists, `Old directory still exists: skills/${name}`);
    }
  });

  // Test 3: SKILL.md frontmatter name: fields match cm- prefix
  await test("SKILL.md frontmatter name: fields match cm- prefix", () => {
    for (const name of newNames) {
      const content = readFileSync(
        join(PLUGIN_ROOT, "skills", name, "SKILL.md"),
        "utf-8",
      );
      const nameLine = content.split("\n").find((l) => l.startsWith("name:"));
      assert.ok(nameLine, `No name: line found in skills/${name}/SKILL.md`);
      const value = nameLine!.split(":").slice(1).join(":").trim();
      assert.equal(
        value,
        name,
        `Expected name: ${name}, got: ${value} in skills/${name}/SKILL.md`,
      );
    }
  });

  // Test 4: Trigger: lines reference correct cm- slash commands
  await test("SKILL.md Trigger: lines reference correct cm- slash commands", () => {
    const expectedTriggers: Record<string, string> = {
      "cm-doctor": "/context-mode:cm-doctor",
      "cm-upgrade": "/context-mode:cm-upgrade",
      "cm-stats": "/context-mode:cm-stats",
    };
    for (const name of newNames) {
      const content = readFileSync(
        join(PLUGIN_ROOT, "skills", name, "SKILL.md"),
        "utf-8",
      );
      const triggerLine = content
        .split("\n")
        .find((l) => l.includes("Trigger:"));
      assert.ok(
        triggerLine,
        `No Trigger: line found in skills/${name}/SKILL.md`,
      );
      assert.ok(
        triggerLine!.includes(expectedTriggers[name]),
        `Expected Trigger containing "${expectedTriggers[name]}", got: "${triggerLine}" in skills/${name}/SKILL.md`,
      );
    }
  });

  // Test 5: Body path references updated for doctor and upgrade
  await test("SKILL.md body path references updated to cm- names", () => {
    const expectedPaths: Record<string, string> = {
      "cm-doctor": "/skills/cm-doctor",
      "cm-upgrade": "/skills/cm-upgrade",
    };
    for (const [name, expectedPath] of Object.entries(expectedPaths)) {
      const content = readFileSync(
        join(PLUGIN_ROOT, "skills", name, "SKILL.md"),
        "utf-8",
      );
      assert.ok(
        content.includes(expectedPath),
        `Expected body to contain "${expectedPath}" in skills/${name}/SKILL.md`,
      );
      // Also verify old path is NOT present
      const oldPath = expectedPath.replace("cm-", "");
      const oldPathWithContext = `remove ${oldPath})`;
      assert.ok(
        !content.includes(oldPathWithContext),
        `Old path reference "${oldPathWithContext}" still present in skills/${name}/SKILL.md`,
      );
    }
  });

  // Summary
  console.log(`\n${"=".repeat(50)}`);
  console.log(
    `Results: ${passed} passed, ${failed} failed (${passed + failed} total)`,
  );
  console.log("=".repeat(50));

  if (failed > 0) {
    console.log("\nFailed tests:");
    for (const r of results.filter((r) => r.status === "FAIL")) {
      console.log(`  ✗ ${r.name}: ${r.error}`);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
