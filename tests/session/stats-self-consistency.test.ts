/**
 * #950 — ctx_stats must not contradict itself within one render.
 *
 * Three independent defects, all in the same report:
 *
 *   A. The bar and its own caption used different numerators. The bar excluded
 *      eventDataBytes; the caption and the per-chat line included it, so the
 *      same render printed "1.9 MB" and "2.7 MB" for the same thing.
 *   B. The per-chat and all-work lines summed disjoint columns, so the part
 *      could exceed the whole — and both were labelled "kept out".
 *   C. The degenerate bar was reachable. The guard only covered the fully
 *      empty case, so avoided > 0 with returned == 0 reached a Math.max(1, …)
 *      floor and rendered "100.0% kept out · 498611x longer" — numbers no
 *      measurement produced.
 *
 * Every assertion is a cross-line invariant on the rendered text, parsed back
 * into bytes. Asserting on the formatted string would hide the failure behind
 * unit rounding.
 */

import { describe, test, expect } from "vitest";

import { formatReport } from "../../src/session/analytics.js";

/** Render with a fixed clock and locale so the output is deterministic. */
function render(optsOverrides: Record<string, unknown> = {}): string {
  const now = Date.parse("2026-10-01T12:00:00Z");
  const report = {
    savings: {
      processed_kb: 0, entered_kb: 0, saved_kb: 0, pct: 0, savings_ratio: 0,
      by_tool: [], total_calls: 40, total_bytes_returned: 0,
      kept_out: 0, total_processed: 0,
    },
    session: { id: "s1", uptime_min: "4320.0" },
    continuity: {
      total_events: 1485,
      by_category: [{ category: "file", count: 1485 }],
      compact_count: 2,
      resume_ready: true,
    },
    projectMemory: {
      total_events: 1485,
      session_count: 1,
      by_category: [{ category: "file", count: 1485, label: "Files tracked" }],
    },
  } as never;

  const baseRealBytes = {
    conversation: {
      eventDataBytes: 800_000,
      bytesAvoided: 1_900_000,
      bytesReturned: 40_000,
      snapshotBytes: 0,
      contentBytes: 0,
      totalSavedTokens: 475_000,
    },
    lifetime: {
      eventDataBytes: 3_000_000,
      bytesAvoided: 5_000_000,
      bytesReturned: 900_000,
      snapshotBytes: 100_000,
      contentBytes: 0,
      totalSavedTokens: 1_250_000,
    },
  };

  return formatReport(report, "1.0.169", null, {
    now,
    locale: "en-US",
    tz: "UTC",
    cwd: "/repo",
    conversation: {
      sessionId: "s1",
      events: 1485,
      dbCount: 1,
      firstEventMs: now - 5 * 24 * 3600_000,
      lastEventMs: now,
      daysAlive: 5,
      tokens: 30_000,
      snapshotBytes: 0,
      byCategory: [{ category: "file", count: 1485, label: "Files tracked" }],
      byDay: [
        { ms: Date.parse("2026-09-28T00:00:00Z"), count: 800 },
        { ms: Date.parse("2026-09-30T00:00:00Z"), count: 685 },
      ],
    },
    realBytes: baseRealBytes,
    multiAdapter: {
      totalEvents: 1485,
      totalSessions: 1,
      totalBytes: 868_000,
      perAdapter: [
        {
          name: "claude-code",
          isReal: true,
          totalEvents: 1485,
          totalSessions: 1,
          totalBytes: 868_000,
          firstMs: now - 5 * 24 * 3600_000,
          lastMs: now,
        },
      ],
    },
    // Spread last, so a caller can replace realBytes wholesale.
    ...optsOverrides,
  } as never);
}

/** Parse a human byte figure back into bytes, through the same ladder the
 *  renderer uses, so "2.7 MB" and "868 KB" are comparable. Asserting on the
 *  formatted string would let unit rounding hide the defect. */
function toBytes(text: string): number {
  const m = /\b([\d.]+)\s(B|KB|MB|GB)\b/.exec(text);
  if (!m) throw new Error(`no byte figure in: ${text}`);
  const n = Number(m[1]);
  const unit = m[2].toUpperCase();
  const mult = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3 }[unit]!;
  return n * mult;
}


describe("the caption describes the bar it sits under (#950 defect A)", () => {
  test("the timeline caption and the Without bar report the same total", () => {
    const out = render();
    const bar = /Without context-mode\s+([\d.]+ [KMGB]+)/.exec(out);
    const caption = /How that ([\d.]+ [KMGB]+) built up/.exec(out);

    expect(bar, "the Without bar is missing").not.toBeNull();
    expect(caption, "the timeline caption is missing").not.toBeNull();
    // The old code put eventDataBytes (800 KB here) in the caption only, so
    // these differed by exactly that amount.
    expect(toBytes(caption![1])).toBe(toBytes(bar![1]));
  });

  test("eventDataBytes never moves a figure labelled kept out", () => {
    const withPayload = /This chat:\s*([\d.]+ [KMGB]+) kept out/.exec(render());
    expect(withPayload).not.toBeNull();

    // Same redirect measurement, zero hook payload: the kept-out figure must be
    // identical, because the payload never reached the model.
    const withoutPayload = /This chat:\s*([\d.]+ [KMGB]+) kept out/.exec(
      render({
        realBytes: {
          conversation: {
            eventDataBytes: 0,
            bytesAvoided: 1_900_000,
            bytesReturned: 40_000,
            snapshotBytes: 0,
            contentBytes: 0,
            totalSavedTokens: 475_000,
          },
          lifetime: {
            eventDataBytes: 0,
            bytesAvoided: 5_000_000,
            bytesReturned: 900_000,
            snapshotBytes: 100_000,
            contentBytes: 0,
            totalSavedTokens: 1_250_000,
          },
        },
      }),
    );
    expect(withoutPayload).not.toBeNull();
    expect(withPayload![1]).toBe(withoutPayload![1]);
  });
});

describe("the two totals are not presented as the same quantity (#950 defect B)", () => {
  test("the all-work line does not claim to be a kept-out figure", () => {
    // multiAdapter.totalBytes carries no bytes_avoided column, so labelling it
    // "kept out" alongside a per-chat figure that is mostly bytes_avoided is
    // how a part came to exceed a whole.
    expect(render()).not.toMatch(/All your work:.*kept out/);
  });

  test("the all-work line still reports its figure and its capture count", () => {
    const line = /All your work:\s*([\d.]+ [KMGB]+)/.exec(render());
    expect(line, "the all-work line disappeared").not.toBeNull();
    expect(render()).toMatch(/1,485 captures/);
  });
});

describe("the only-avoided case keeps its ratio but loses its artefacts (#950 defect C)", () => {
  // ADR-0004 and the v1.0.148 "Bug G" fix settled this deliberately: with
  // bytesReturned === 0 the 100% is HONEST, because every measured byte was
  // diverted and none came back. Suppressing it would revert a documented
  // decision. What was never honest were the two figures derived from the
  // Math.max(1, …) floor — a fabricated 1-byte baseline and a 498528x
  // duration multiple that no measurement produced.
  const divertedOnly = () =>
    render({
      realBytes: {
        conversation: {
          eventDataBytes: 0,
          bytesAvoided: 1_994_112,
          bytesReturned: 0,
          snapshotBytes: 0,
          contentBytes: 0,
          totalSavedTokens: 498_528,
        },
        lifetime: {
          eventDataBytes: 0,
          bytesAvoided: 5_000_000,
          bytesReturned: 0,
          snapshotBytes: 0,
          contentBytes: 0,
          totalSavedTokens: 1_250_000,
        },
      },
    });

  test("the 100% kept-out claim survives — it is a true statement", () => {
    expect(divertedOnly()).toMatch(/100\.0% kept out of context/);
  });

  test("the fabricated 1-byte baseline is not rendered as a measurement", () => {
    // Math.max(1, 0) reported 1 B of context use when the truth is none.
    expect(divertedOnly()).toMatch(/With context-mode\s+0 B/);
    expect(divertedOnly()).not.toMatch(/With context-mode\s+1 B/);
  });

  test("the inflated duration multiple is not emitted", () => {
    expect(divertedOnly()).not.toMatch(/\b\d{4,}× longer before \/compact/);
  });

  test("the absence of a multiple is stated rather than left blank", () => {
    expect(divertedOnly()).toMatch(/no duration multiple applies/);
  });

  test("a session with returned bytes still reports a real multiple", () => {
    const out = render();
    expect(out).toMatch(/kept out of context/);
    expect(out).toMatch(/your AI ran \d+× longer before \/compact fired/);
  });
});

