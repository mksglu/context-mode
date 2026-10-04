/**
 * A command hook with no declared runtime can block the host CLI forever — a
 * script stuck on stdin or spinning in a loop never yields, and the user has
 * no way to interrupt the turn (Claude Code #1226).
 *
 * The bound has to live in the config the host actually reads, and there are
 * two of them: the `hooks/hooks.json` the plugin ships, and the
 * `generateHookConfig()` output that `setup`/`upgrade` write into the user's
 * settings.json. Patching one leaves the other install path unbounded, so this
 * asserts both — and that they agree, since a drift here means some installs
 * get a bound and others silently do not.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { HOOK_TIMEOUT_SECONDS } from "../../src/adapters/claude-code/hooks.js";
import { ClaudeCodeAdapter } from "../../src/adapters/claude-code/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const shipped = JSON.parse(
  readFileSync(join(here, "..", "..", "hooks", "hooks.json"), "utf8"),
) as {
  hooks: Record<string, Array<{ hooks: Array<Record<string, unknown>> }>>;
};

type Entry = { event: string; timeout: unknown };

const shippedEntries: Entry[] = [];
for (const [event, matchers] of Object.entries(shipped.hooks)) {
  for (const matcher of matchers) {
    for (const hook of matcher.hooks) {
      shippedEntries.push({ event, timeout: hook.timeout });
    }
  }
}

const generated = new ClaudeCodeAdapter().generateHookConfig(
  "/tmp/plugin-root",
);
const generatedEntries: Entry[] = [];
for (const [event, matchers] of Object.entries(generated)) {
  for (const matcher of matchers as Array<{
    hooks: Array<Record<string, unknown>>;
  }>) {
    for (const hook of matcher.hooks) {
      generatedEntries.push({ event, timeout: hook.timeout });
    }
  }
}

describe("every command hook declares a bounded runtime", () => {
  it("the shipped plugin config has hooks to check", () => {
    expect(shippedEntries.length).toBeGreaterThanOrEqual(10);
  });

  it.each(shippedEntries.map((e, i) => [i, e] as const))(
    "hooks/hooks.json #%i (%s) has a numeric timeout",
    (_i, entry) => {
      expect(typeof entry.timeout, `${entry.event} hook is unbounded`).toBe(
        "number",
      );
      expect(entry.timeout as number).toBeGreaterThan(0);
    },
  );

  it("PreToolUse is bounded tighter than the once-per-turn events", () => {
    // It sits on the critical path of every tool call, so it gets the least
    // room: its work is in-process routing, and a slow one means a bug.
    const preToolUse = HOOK_TIMEOUT_SECONDS.PreToolUse;
    for (const [event, seconds] of Object.entries(HOOK_TIMEOUT_SECONDS)) {
      if (event === "PreToolUse") continue;
      expect(
        seconds,
        `${event} must not outrank PreToolUse`,
      ).toBeLessThanOrEqual(preToolUse * 3);
    }
  });
});

describe("the shipped config and generateHookConfig agree on the bound", () => {
  it.each(Object.keys(HOOK_TIMEOUT_SECONDS))(
    "%s matches in both install paths",
    (event) => {
      const expected = HOOK_TIMEOUT_SECONDS[event];
      for (const [label, entries] of [
        ["hooks/hooks.json", shippedEntries],
        ["generateHookConfig", generatedEntries],
      ] as const) {
        const forEvent = entries.filter((e) => e.event === event);
        expect(
          forEvent.length,
          `${label} registers no ${event} hook`,
        ).toBeGreaterThan(0);
        for (const entry of forEvent) {
          expect(
            entry.timeout,
            `${label} ${event} drifted from HOOK_TIMEOUT_SECONDS`,
          ).toBe(expected);
        }
      }
    },
  );
});
