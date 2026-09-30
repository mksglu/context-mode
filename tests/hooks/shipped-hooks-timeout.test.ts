/**
 * Shipped hooks.json timeout guard (#1226).
 *
 * Every command hook the plugin ships must declare a numeric `timeout`, so a
 * hung hook script (infinite loop, blocked stdin) ends after a bounded wait
 * instead of blocking the host CLI indefinitely with no way out. Values live
 * in the shipped file itself, so `ctx upgrade` keeps them; patching the
 * plugin cache by hand is overwritten on every update.
 *
 * PreToolUse gets the tighter bound: those hooks sit on the critical path of
 * every tool call.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const hooksJson = JSON.parse(
  readFileSync(join(here, "..", "..", "hooks", "hooks.json"), "utf8"),
) as {
  hooks: Record<string, Array<{ hooks: Array<Record<string, unknown>> }>>;
};

type Entry = { event: string; command: unknown; timeout: unknown };

const entries: Entry[] = [];
for (const [event, matchers] of Object.entries(hooksJson.hooks)) {
  for (const matcher of matchers) {
    for (const hook of matcher.hooks) {
      entries.push({
        event,
        command: hook.command,
        timeout: hook.timeout,
      });
    }
  }
}

describe("shipped hooks.json declares a timeout on every hook", () => {
  it("has entries to check", () => {
    expect(entries.length).toBeGreaterThanOrEqual(10);
  });

  it.each(entries.map(entry => [entry.event, entry] as const))(
    "%s hook command carries a numeric timeout",
    (_event, entry) => {
      expect(typeof entry.timeout).toBe("number");
      expect(entry.timeout as number).toBeGreaterThan(0);
    },
  );

  it("keeps PreToolUse bounded tighter than session-lifecycle events", () => {
    const preToolUse = entries.filter(entry => entry.event === "PreToolUse");
    expect(preToolUse.length).toBeGreaterThan(0);
    for (const entry of preToolUse) {
      expect(entry.timeout as number).toBeLessThanOrEqual(10);
    }
  });
});
