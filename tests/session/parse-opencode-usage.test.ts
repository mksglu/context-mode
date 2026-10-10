/**
 * parseOpencodeUsage — opencode per-turn token+cost capture.
 *
 * Ground truth: context-mode-platform/docs/prds/2026-06-paid-observability/
 * adapter-matrix/opencode.md. opencode tracks usage per assistant *message*;
 * the assistant token shape (refs platforms/opencode .../session/message.ts) is
 * info.tokens = { input, output, reasoning, cache: { read, write } } with
 * info.cost (USD) and info.modelID / info.providerID. The usage-bearing payload
 * reaches a plugin via the `message.updated` bus event, whose
 * event.properties.info is the full Message.
 *
 * These tests pin the field mapping, native-USD pass-through, model_id
 * composition, the wrapper-unwrapping (bus event vs bare message), and the
 * zero->null contract before the value flows into buildAgentUsageEvent.
 *
 * LAST-STEP-SNAPSHOT CAVEAT: message-level `.tokens` is the last step's usage
 * (overwritten per step-finish — processor.ts:718), while `.cost` is cumulative
 * (processor.ts:717). We prefer native `.cost` so billed $ is exact even though
 * the token snapshot is imprecise — asserted below. NO regex; pure algorithmic
 * parse.
 */

import { describe, it, expect } from "vitest";
import {
  parseOpencodeUsage,
  parseOpencodeV2StepUsage,
  buildAgentUsageEvent,
} from "../../src/session/extract.js";

/** Minimal opencode `message.updated` bus-event fixture. */
function busEvent(overrides?: {
  role?: string;
  modelID?: string;
  providerID?: string;
  model?: string;
  cost?: unknown;
  tokens?: unknown;
}) {
  const info: Record<string, unknown> = {
    role: overrides?.role ?? "assistant",
    cost: "cost" in (overrides ?? {}) ? overrides?.cost : 0.0123,
    tokens:
      "tokens" in (overrides ?? {})
        ? overrides?.tokens
        : {
            input: 1200,
            output: 340,
            reasoning: 50,
            cache: { read: 4096, write: 80 },
          },
  };
  if (overrides?.modelID !== undefined) info.modelID = overrides.modelID;
  if (overrides?.providerID !== undefined) info.providerID = overrides.providerID;
  if (overrides?.model !== undefined) info.model = overrides.model;
  // default model identity when caller does not override anything
  if (
    overrides?.modelID === undefined &&
    overrides?.providerID === undefined &&
    overrides?.model === undefined
  ) {
    info.modelID = "claude-sonnet-4";
    info.providerID = "anthropic";
  }
  return { type: "message.updated", properties: { info } };
}

describe("parseOpencodeUsage", () => {
  it("maps tokens.input/output and cache.read/write to the canonical buckets", () => {
    const counts = parseOpencodeUsage(busEvent());
    expect(counts).not.toBeNull();
    expect(counts).toMatchObject({
      input_tokens: 1200,
      output_tokens: 340,
      cache_read_tokens: 4096, // tokens.cache.read
      cache_creation_tokens: 80, // tokens.cache.write
    });
  });

  it("composes model_id as `${providerID}/${modelID}` when both present", () => {
    const counts = parseOpencodeUsage(busEvent());
    expect(counts?.model_id).toBe("anthropic/claude-sonnet-4");
  });

  it("falls back to bare modelID when providerID absent", () => {
    const counts = parseOpencodeUsage(
      busEvent({ modelID: "gpt-5", providerID: undefined }),
    );
    expect(counts?.model_id).toBe("gpt-5");
  });

  it("falls back to a single `model` string (older refs shape)", () => {
    const counts = parseOpencodeUsage(
      busEvent({ model: "openrouter/qwen", modelID: undefined, providerID: undefined }),
    );
    expect(counts?.model_id).toBe("openrouter/qwen");
  });

  it("passes native cumulative .cost through as native_cost_usd (exact billed $)", () => {
    const counts = parseOpencodeUsage(busEvent({ cost: 0.0123 }));
    expect(counts?.native_cost_usd).toBe(0.0123);
  });

  it("yields null native_cost_usd when .cost is absent/non-finite (catalog fallback)", () => {
    expect(parseOpencodeUsage(busEvent({ cost: undefined }))?.native_cost_usd).toBeNull();
    expect(parseOpencodeUsage(busEvent({ cost: NaN }))?.native_cost_usd).toBeNull();
  });

  it("accepts the bare Message (no event/properties wrapper)", () => {
    const bare = (busEvent().properties as { info: unknown }).info;
    const counts = parseOpencodeUsage(bare);
    expect(counts).not.toBeNull();
    expect(counts?.input_tokens).toBe(1200);
  });

  it("accepts the doubly-wrapped { event: { properties: { info } } } shape", () => {
    const counts = parseOpencodeUsage({ event: busEvent() });
    expect(counts?.input_tokens).toBe(1200);
    expect(counts?.model_id).toBe("anthropic/claude-sonnet-4");
  });

  it("rejects explicit non-assistant role", () => {
    expect(parseOpencodeUsage(busEvent({ role: "user" }))).toBeNull();
  });

  it("returns null when tokens object is missing", () => {
    expect(parseOpencodeUsage(busEvent({ tokens: undefined }))).toBeNull();
  });

  it("returns null for an all-zero token turn (zero->null contract)", () => {
    const counts = parseOpencodeUsage(
      busEvent({ tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } } }),
    );
    expect(counts).toBeNull();
  });

  it("tolerates a missing cache sub-object null-safely", () => {
    const counts = parseOpencodeUsage(
      busEvent({ tokens: { input: 500, output: 100 } }),
    );
    expect(counts).toMatchObject({
      input_tokens: 500,
      output_tokens: 100,
      cache_read_tokens: 0,
      cache_creation_tokens: 0,
    });
  });

  it("returns null for non-object / null payloads", () => {
    expect(parseOpencodeUsage(null)).toBeNull();
    expect(parseOpencodeUsage(undefined)).toBeNull();
    expect(parseOpencodeUsage("nope")).toBeNull();
    expect(parseOpencodeUsage(42)).toBeNull();
  });

  it("feeds buildAgentUsageEvent — native cost preferred over catalog, exact $", () => {
    const counts = parseOpencodeUsage(busEvent({ cost: 0.0123 }));
    expect(counts).not.toBeNull();
    const event = buildAgentUsageEvent(counts!);
    expect(event).not.toBeNull();
    expect(event?.type).toBe("agent_usage");
    expect(event?.category).toBe("cost");
    // native .cost wins over the pricing catalog (last-step token imprecision
    // therefore cannot corrupt the billed dollar amount).
    expect(event?.cost_usd).toBe(0.0123);
    expect(event?.input_tokens).toBe(1200);
    expect(event?.output_tokens).toBe(340);
    expect(event?.cache_read_tokens).toBe(4096);
    expect(event?.cache_creation_tokens).toBe(80);
    expect(event?.model_id).toBe("anthropic/claude-sonnet-4");
    expect(event?.data).toContain("cost_usd:");
  });
});

/**
 * parseOpencodeV2StepUsage — OpenCode v2 `session.step.ended` capture
 * (ported from mksglu/context-mode#1194).
 *
 * v2 usage lives under `data` (not `properties.info`), the model arrives
 * separately from the correlated `session.step.started`, and there is an
 * extra `reasoning` bucket folded into output. Native USD cost passes through
 * verbatim. These tests pin that mapping before it flows into
 * buildAgentUsageEvent.
 */
describe("parseOpencodeV2StepUsage", () => {
  function stepData(overrides: Record<string, unknown> = {}) {
    return {
      sessionID: "ses-1",
      assistantMessageID: "msg-1",
      tokens: { input: 100, output: 50, reasoning: 25, cache: { read: 10, write: 5 } },
      cost: 0.0042,
      ...overrides,
    };
  }

  it("maps buckets, folds reasoning into output, passes cost and model through", () => {
    const counts = parseOpencodeV2StepUsage(stepData(), "openai/gpt-4");
    expect(counts).toEqual({
      model_id: "openai/gpt-4",
      input_tokens: 100,
      output_tokens: 75,
      cache_read_tokens: 10,
      cache_creation_tokens: 5,
      native_cost_usd: 0.0042,
    });
  });

  it("tolerates missing model, cache, cost, and reasoning", () => {
    const counts = parseOpencodeV2StepUsage(
      stepData({ tokens: { input: 7, output: 3 }, cost: undefined }),
      "",
    );
    expect(counts).toEqual({
      model_id: "",
      input_tokens: 7,
      output_tokens: 3,
      cache_read_tokens: 0,
      cache_creation_tokens: 0,
      native_cost_usd: null,
    });
  });

  it("returns null when every bucket is zero/absent or tokens missing", () => {
    expect(parseOpencodeV2StepUsage(stepData({ tokens: { input: 0, output: 0 } }), "m")).toBeNull();
    expect(parseOpencodeV2StepUsage(stepData({ tokens: undefined }), "m")).toBeNull();
    expect(parseOpencodeV2StepUsage({ sessionID: "s" }, "m")).toBeNull();
  });

  it("returns null for non-object payloads and ignores non-numeric buckets", () => {
    expect(parseOpencodeV2StepUsage(null, "m")).toBeNull();
    expect(parseOpencodeV2StepUsage("nope", "m")).toBeNull();
    const counts = parseOpencodeV2StepUsage(
      stepData({ tokens: { input: "lots", output: NaN, reasoning: -5 } }),
      "m",
    );
    expect(counts).toBeNull();
  });

  it("feeds buildAgentUsageEvent with the native cost", () => {
    const counts = parseOpencodeV2StepUsage(stepData(), "openai/gpt-4");
    const event = buildAgentUsageEvent(counts!);
    expect(event?.type).toBe("agent_usage");
    expect(event?.cost_usd).toBe(0.0042);
    expect(event?.output_tokens).toBe(75);
    expect(event?.model_id).toBe("openai/gpt-4");
  });
});
