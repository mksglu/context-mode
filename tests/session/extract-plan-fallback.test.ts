/**
 * Issue #3 repro — extractPlan() Bug #15660 fallback.
 *
 * Symptom: extractPlan only fires on programmatic EnterPlanMode/ExitPlanMode
 * tool calls. Shift+Tab and the `/plan` slash command do NOT trigger
 * PostToolUse hooks per Claude Code Bug #15660. Result: ~60-80% of real
 * plan-mode entries invisible.
 *
 * Per /diagnose + /tdd RGR — this file reproduces the gap deterministically
 * at extractUserEvents() (the UserPromptSubmit seam). Each test starts RED;
 * the fix wires a `/plan` slash detector into extractUserEvents.
 *
 * Note: Shift+Tab capture is NOT recoverable from OSS bridge — it would
 * require an upstream Claude Code SDK change. This file does not cover it.
 */

import { describe, test, expect } from "vitest";
import { extractUserEvents } from "../../src/session/extract.js";

function planEventsOf(message: string) {
  return extractUserEvents(message).filter((e) => e.category === "plan");
}

describe("extractUserEvents — Issue #3 /plan slash detection", () => {
  test("tracer: `/plan refactor auth` emits one plan_enter event", () => {
    const events = planEventsOf("/plan refactor auth");
    expect(events.length).toBe(1);
    expect(events[0].type).toBe("plan_enter");
  });

  test("`/plan` alone (no argument) still emits plan_enter", () => {
    const events = planEventsOf("/plan");
    expect(events.length).toBe(1);
    expect(events[0].type).toBe("plan_enter");
  });

  test("leading whitespace before /plan is tolerated", () => {
    const events = planEventsOf("  /plan migrate to next");
    expect(events.length).toBe(1);
    expect(events[0].type).toBe("plan_enter");
  });

  test("plan_enter carries source hint marking slash origin", () => {
    const events = planEventsOf("/plan refactor module X");
    expect(events.length).toBe(1);
    expect(events[0].data).toMatch(/slash/i);
  });

  test("non-plan slash commands do NOT emit plan events", () => {
    expect(planEventsOf("/help").length).toBe(0);
    expect(planEventsOf("/clear").length).toBe(0);
    expect(planEventsOf("/compact").length).toBe(0);
  });

  test("the word 'plan' in prose does NOT emit plan events (no false positive)", () => {
    expect(planEventsOf("Can you plan a refactor?").length).toBe(0);
    expect(planEventsOf("Here is my plan for tomorrow").length).toBe(0);
  });

  test("`/plans` (longer slash that starts with /plan) does NOT emit", () => {
    expect(planEventsOf("/plans list").length).toBe(0);
  });

  test("uppercase `/PLAN` does NOT match — slash commands are lowercase", () => {
    expect(planEventsOf("/PLAN refactor").length).toBe(0);
  });

  test("plan_enter is priority 2 (matches programmatic EnterPlanMode shape)", () => {
    const events = planEventsOf("/plan refactor");
    expect(events[0].priority).toBe(2);
  });

  test("empty message emits no events at all", () => {
    expect(extractUserEvents("").length).toBe(0);
  });

  test("leading tab before /plan is tolerated", () => {
    const events = planEventsOf("\t/plan refactor");
    expect(events.length).toBe(1);
    expect(events[0].type).toBe("plan_enter");
  });

  test("newline after /plan acts as a word boundary (LF)", () => {
    const events = planEventsOf("/plan\nrefactor");
    expect(events.length).toBe(1);
    expect(events[0].type).toBe("plan_enter");
  });

  test("carriage return after /plan acts as a word boundary (CR)", () => {
    const events = planEventsOf("/plan\rrefactor");
    expect(events.length).toBe(1);
    expect(events[0].type).toBe("plan_enter");
  });

  test("arg longer than 120 chars is truncated in data field", () => {
    const longArg = "x".repeat(200);
    const events = planEventsOf(`/plan ${longArg}`);
    expect(events.length).toBe(1);
    expect(events[0].data.length).toBeLessThanOrEqual(150);
  });

  test("non-string input is tolerated (returns empty, no throw)", () => {
    expect(
      // @ts-expect-error — defensive: hook receives unsanitized strings
      extractUserEvents(null).length
    ).toBe(0);
  });
});
