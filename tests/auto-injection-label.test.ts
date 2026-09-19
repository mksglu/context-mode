/**
 * auto-injection source-label tests — fix: false `source="compaction"` label
 *
 * The wrapper was hardcoded to `source="compaction"` while the pi adapter
 * injects the block on EVERY agent start, causing models to falsely believe
 * their context was destroyed (false-loss cascade, 2026-07-24).
 *
 * Contract under test:
 *  - source is a REQUIRED parameter (fail-safe: no silent default)
 *  - routine per-turn injection is labeled "active_memory" with NO fidelity line
 *  - genuine post-compaction injection is labeled "compaction" WITH a fidelity
 *    line stating where the history lives
 *  - empty events still yield "" regardless of source
 *  - the block stays within the documented ~500-token content budget plus the
 *    (unbudgeted) wrapper/fidelity overhead
 */

import { describe, test, expect } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");

const {
  buildAutoInjection,
  estimateTokens,
  // @ts-expect-error — plain .mjs hook, no type declarations
} = await import(join(PROJECT_ROOT, "hooks", "auto-injection.mjs"));

const EVENTS = [
  { category: "decision", data: "use sqlite for session store" },
  { category: "skills", data: "lint, test" },
  { category: "intent", data: "fixing the false compaction label" },
];

describe("buildAutoInjection source label", () => {
  test('routine injection is labeled "active_memory" with no fidelity line', () => {
    const block = buildAutoInjection(EVENTS, "active_memory");
    expect(block).toContain('<session_state source="active_memory">');
    expect(block).not.toContain('source="compaction"');
    expect(block).not.toContain("compacted");
    expect(block).not.toContain("transcript");
    expect(block).toContain("use sqlite for session store");
  });

  test('post-compact injection is labeled "compaction" WITH fidelity line', () => {
    const block = buildAutoInjection(EVENTS, "compaction");
    expect(block).toContain('<session_state source="compaction">');
    expect(block).toContain("Context was compacted");
    expect(block).toContain("session transcript");
  });

  test("empty events yield empty string regardless of source", () => {
    expect(buildAutoInjection([], "active_memory")).toBe("");
    expect(buildAutoInjection([], "compaction")).toBe("");
  });

  test("source is required — no silent default label", () => {
    // Calling without a source must not produce the reassuring
    // "active_memory" label silently; the wrong usage is loud in output.
    const block = buildAutoInjection(EVENTS, undefined);
    expect(block).not.toContain('source="active_memory"');
    expect(block).not.toContain('source="compaction"');
  });

  test("block stays within content budget + wrapper overhead", () => {
    // The 500-token budget meters only content parts; the wrapper (~45 chars)
    // and the compaction fidelity line are outside that accounting. Assert
    // against the honest total: 500 + wrapper + fidelity. Small fixtures
    // only — the P2-overflow path can exceed budget by design.
    for (const source of ["active_memory", "compaction"]) {
      const block = buildAutoInjection(EVENTS, source);
      const wrapper = `<session_state source="${source}">\n\n\n\n</session_state>`;
      const fidelity =
        source === "compaction"
          ? "Context was compacted; full history persists in the session transcript."
          : "";
      const overhead = estimateTokens(wrapper + fidelity);
      expect(estimateTokens(block)).toBeLessThanOrEqual(500 + overhead);
    }
  });
});
