/**
 * #1173 — the post-compaction restore must not be able to re-trigger
 * compaction.
 *
 * A compaction wrote a snapshot, the host compacted, SessionStart re-injected
 * a guide derived from the same accumulated event set, and the context was
 * immediately back over the threshold. Each cycle cost a full model turn until
 * the quota was gone. The enabling condition is measurable without a host:
 * buildSessionDirective grew linearly with the event count, because every
 * section capped the length of one entry but never the number of entries.
 *
 * Measured before the fix: 100 error events → 15 665 bytes, 1000 → 153 365
 * (9.8x). After: 1 983 → 1 984 (1.00x).
 */

import { describe, test, expect } from "vitest";

import {
  buildSessionDirective,
  groupEvents,
} from "../../hooks/session-directive.mjs";

const namer = (name: string) => name;

const errorEvent = {
  type: "error_tool",
  category: "error",
  data: "E".repeat(400),
  priority: 2,
  created_at: "2026-01-01 00:00:00",
};

const envEvent = (i: number) => ({
  type: "env",
  category: "env",
  data: `export SEGMENTO_${i}=/segmento/${i}/bin`,
  priority: 2,
  created_at: "2026-01-01 00:00:00",
});

const directiveFor = (events: unknown[]) =>
  buildSessionDirective("compact", groupEvents(events as never[]), namer);

const sizeFor = (count: number, make: (i: number) => unknown) =>
  Buffer.byteLength(
    directiveFor(Array.from({ length: count }, (_, i) => make(i))),
  );

describe("the post-compaction guide is bounded by event count", () => {
  test("growth is sub-linear, not proportional", () => {
    const at100 = sizeFor(100, () => errorEvent);
    const at5000 = sizeFor(5000, () => errorEvent);

    // Before the fix this ratio was ~50x. A per-item character cap cannot
    // produce this property on its own; the sections have to be capped.
    expect(at5000).toBeLessThan(at100 * 3);
  });

  test("a thousand error events stay well under the restore budget", () => {
    // The budget in hooks/sessionstart.mjs is 20 000 characters.
    expect(sizeFor(1000, () => errorEvent)).toBeLessThan(20_000);
  });

  test("the environment section is capped and says what it dropped", () => {
    const block = directiveFor(
      Array.from({ length: 1000 }, (_, i) => envEvent(i)),
    );

    expect(
      (block.match(/export SEGMENTO_\d+/g) || []).length,
    ).toBeLessThanOrEqual(12);
    // Silently dropping data is its own defect: the model has to be able to
    // find the rest.
    expect(block).toMatch(/earlier variables/);
    expect(block).toContain('source: "session-events"');
  });

  test("the errors section is capped and says what it dropped", () => {
    const block = directiveFor(Array.from({ length: 1000 }, () => errorEvent));

    expect((block.match(/- E{100,}/g) || []).length).toBeLessThanOrEqual(12);
    expect(block).toMatch(/earlier errors/);
  });

  test("a short session is unaffected — nothing is dropped below the cap", () => {
    const block = directiveFor(
      Array.from({ length: 3 }, (_, i) => envEvent(i)),
    );

    expect((block.match(/export SEGMENTO_\d+/g) || []).length).toBe(3);
    expect(block).not.toMatch(/earlier variables/);
  });
});
