/**
 * Issue #6 (new PRD) — extractExitPlanMode metadata.
 *
 * SDK ExitPlanModeOutput at sdk-tools.d.ts:2222 carries the `plan` text
 * (ExitPlanModeInput at :342 carries `allowedPrompts`). PRD says
 * tool_input.plan but verification confirms the plan text lives in the
 * OUTPUT; the extractor reads both defensively.
 *
 * The existing plan_exit event already captures allowedPrompts and
 * approval/rejection. This RGR appends two metadata tokens to the
 * event data:
 *   - plan_bytes:NN     length of the plan string
 *   - plan_hash:XXXXXXXX 8-char FNV-1a hex of the plan content
 *
 * Plan adoption telemetry depends on a stable hash so the platform can
 * dedupe identical plans across sessions and count plan_mode_authorized
 * writes against the same plan id.
 */

import { describe, test, expect } from "vitest";
import { extractEvents } from "../../src/session/extract.js";

function planExitEventsOf(toolInput: Record<string, unknown>, toolResponse: string = "") {
  return extractEvents({
    tool_name: "ExitPlanMode",
    tool_input: toolInput,
    tool_response: toolResponse,
  }).filter((e) => e.type === "plan_exit");
}

describe("extractPlan ExitPlanMode metadata — Issue #6 (new PRD)", () => {
  test("tracer: tool_input.plan present → plan_bytes + plan_hash in data", () => {
    const events = planExitEventsOf({
      plan: "Refactor auth module and add MFA support to login flow.",
    });
    expect(events.length).toBe(1);
    expect(events[0].data).toMatch(/plan_bytes:\d+/);
    expect(events[0].data).toMatch(/plan_hash:[0-9a-f]{8}/);
  });

  test("tool_response.plan fallback when input.plan missing", () => {
    const events = planExitEventsOf(
      {},
      JSON.stringify({ plan: "Migrate to TypeScript", allowedPrompts: [] }),
    );
    expect(events.length).toBe(1);
    expect(events[0].data).toMatch(/plan_bytes:\d+/);
    expect(events[0].data).toMatch(/plan_hash:[0-9a-f]{8}/);
  });

  test("plan_bytes equals plan length (chars)", () => {
    const plan = "hello world plan";
    const events = planExitEventsOf({ plan });
    const match = events[0].data.match(/plan_bytes:(\d+)/);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBe(plan.length);
  });

  test("identical plans produce identical hashes", () => {
    const plan = "Refactor auth module";
    const events1 = planExitEventsOf({ plan });
    const events2 = planExitEventsOf({ plan });
    const h1 = events1[0].data.match(/plan_hash:([0-9a-f]{8})/)?.[1];
    const h2 = events2[0].data.match(/plan_hash:([0-9a-f]{8})/)?.[1];
    expect(h1).toBeDefined();
    expect(h2).toBeDefined();
    expect(h1).toBe(h2);
  });

  test("different plans produce different hashes (sanity check)", () => {
    const a = planExitEventsOf({ plan: "plan A" });
    const b = planExitEventsOf({ plan: "plan B different content" });
    const ha = a[0].data.match(/plan_hash:([0-9a-f]{8})/)?.[1];
    const hb = b[0].data.match(/plan_hash:([0-9a-f]{8})/)?.[1];
    expect(ha).not.toBe(hb);
  });

  test("no plan in input or response → still emits plan_exit, no plan_bytes", () => {
    const events = planExitEventsOf({});
    expect(events.length).toBe(1);
    expect(events[0].data).not.toMatch(/plan_bytes:/);
  });

  test("regression: existing allowedPrompts detail still present", () => {
    const events = planExitEventsOf({
      plan: "x",
      allowedPrompts: [{ prompt: "Edit src/auth.ts" }],
    });
    expect(events.length).toBe(1);
    expect(events[0].data).toMatch(/allowed/i);
    expect(events[0].data).toMatch(/plan_bytes:1/);
  });

  test("regression: plan_approved event still fires on approval response", () => {
    const events = extractEvents({
      tool_name: "ExitPlanMode",
      tool_input: { plan: "x" },
      tool_response: "approved by user",
    });
    expect(events.some((e) => e.type === "plan_approved")).toBe(true);
  });

  test("regression: EnterPlanMode still emits plan_enter", () => {
    const events = extractEvents({
      tool_name: "EnterPlanMode",
      tool_input: {},
      tool_response: "",
    });
    expect(events.some((e) => e.type === "plan_enter")).toBe(true);
  });

  test("very large plan (10 KB) is handled without throwing", () => {
    const plan = "X".repeat(10000);
    const events = planExitEventsOf({ plan });
    expect(events.length).toBe(1);
    expect(events[0].data).toMatch(/plan_bytes:10000/);
  });
});
