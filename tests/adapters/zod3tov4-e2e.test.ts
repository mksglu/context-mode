/**
 * End-to-end validation: reproduces the full OpenCode in-process plugin
 * validation chain for ctx_fetch_and_index-like tool schemas.
 *
 * OpenCode bundles Zod v4 internally. context-mode provides Zod v3 schemas,
 * which plugin.ts converts to v4 via zod3ShapeToV4. OpenCode then wraps
 * the v4 shape in z.object() (registry.ts:132) and validates the LLM's
 * tool-call arguments.
 *
 * This test verifies that string→array and string→boolean coercions in
 * z.preprocess() survive the Zod v3→v4 conversion.
 */
import { describe, it, expect } from "vitest";
import { z } from "zod";
import z4 from "zod/v4";
import { zod3ShapeToV4 } from "../../src/adapters/opencode/zod3tov4.js";

// Mirror coerceJsonArray from server.ts:2293
function coerceJsonArray(val: unknown): unknown {
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (trimmed.length === 0) return val;
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
    return [val];
  }
  return val;
}

// Mirror coerceBoolean from server.ts:2320
function coerceBool(val: unknown): unknown {
  if (typeof val === "string") {
    const t = val.trim().toLowerCase();
    if (t === "true") return true;
    if (t === "false") return false;
  }
  return val;
}

// Mirror ctx_fetch_and_index inputSchema (server.ts:3223-3272)
const fetchAndIndexSchema = z.object({
  url: z.string().optional(),
  source: z.string().optional(),
  requests: z
    .preprocess(
      coerceJsonArray,
      z.array(
        z.object({
          url: z.string(),
          source: z.string().optional(),
        }),
      ).min(1),
    )
    .optional(),
  concurrency: z.coerce.number().int().min(1).max(8).optional().default(1),
  force: z.preprocess(coerceBool, z.boolean()).optional(),
});

const batchRequests = [
  { url: "https://example.com", source: "test1" },
  { url: "https://httpbin.org/html", source: "test2" },
];

describe("e2e: OpenCode plugin validation chain", () => {
  // Build the schema exactly as plugin.ts → registry.ts would
  const z3Shape = fetchAndIndexSchema._def.shape() as Record<string, unknown>;
  const v4Shape = zod3ShapeToV4(z3Shape);
  const v4Validator = z4.object(v4Shape as Record<string, z4.ZodType>);

  it("accepts requests as native array", () => {
    const r = v4Validator.safeParse({ requests: batchRequests, concurrency: 2 });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.requests).toHaveLength(2);
  });

  it("accepts requests as JSON-stringified array (LLM bridge case)", () => {
    // This was the original bug: coerceJsonArray was stripped by zod3ShapeToV4,
    // causing OpenCode to reject stringified array parameters.
    const r = v4Validator.safeParse({
      requests: JSON.stringify(batchRequests),
      concurrency: "2",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(Array.isArray(r.data.requests)).toBe(true);
      expect(r.data.requests).toHaveLength(2);
      expect(r.data.requests[0].url).toBe("https://example.com");
    }
  });

  it("accepts empty requests as string '[]' (min constraint not retained by converter)", () => {
    // coerceJsonArray converts "[]" → []. The v3→v4 converter does not
    // preserve .min(1), so the empty array passes z.array() validation.
    // The real validation (v3 inputSchema.parse() inside plugin.ts) still
    // enforces .min(1) and the handler catches empty batches separately.
    const r = v4Validator.safeParse({ requests: "[]", concurrency: 1 });
    expect(r.success).toBe(true);
  });

  it("accepts not sending requests at all (optional)", () => {
    const r = v4Validator.safeParse({ url: "https://example.com" });
    expect(r.success).toBe(true);
  });

  it("accepts force as 'true' string", () => {
    const r = v4Validator.safeParse({ url: "https://x.com", force: "true" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.force).toBe(true);
  });

  it("accepts force as 'false' string", () => {
    const r = v4Validator.safeParse({ url: "https://x.com", force: "false" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.force).toBe(false);
  });

  it("accepts force as native boolean", () => {
    const r = v4Validator.safeParse({ url: "https://x.com", force: true });
    expect(r.success).toBe(true);
  });

  it("handles single-URL mode (no requests field)", () => {
    const r = v4Validator.safeParse({ url: "https://example.com", source: "test" });
    expect(r.success).toBe(true);
  });

  it("concurrency '2' string is coerced to number 2", () => {
    // z.coerce.number() converts strings to numbers; must survive conversion.
    const r = v4Validator.safeParse({
      requests: batchRequests,
      concurrency: "2",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.concurrency).toBe(2);
  });
});
