/**
 * Production-level integration test.
 *
 * Imports the BUILT .js files (not TypeScript source) and simulates the
 * EXACT path OpenCode takes when loading context-mode as an in-process plugin:
 *
 *   1. plugin.ts imports server.js → gets REGISTERED_CTX_TOOLS with Zod v3 schemas
 *   2. plugin.ts calls zod3ShapeToV4() on each tool's args shape
 *   3. OpenCode's registry.ts wraps in z.object() (Zod v4) and validates args
 *   4. LLM output goes through this Zod v4 validation first
 *
 * This test runs against the actual build/ output, verifying the fix
 * works in the compiled JavaScript that OpenCode will load.
 */
import { describe, it, expect } from "vitest";
import { z } from "zod";
import z4 from "zod/v4";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Import the BUILT zod3tov4 module (same file OpenCode loads)
const { zod3ShapeToV4 } = await import(
  resolve(__dirname, "../../build/adapters/opencode/zod3tov4.js")
);

// Replicate server.ts coerce functions
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

function coerceBool(val: unknown): unknown {
  if (typeof val === "string") {
    const t = val.trim().toLowerCase();
    if (t === "true") return true;
    if (t === "false") return false;
  }
  return val;
}

// Exact schema from server.ts ctx_fetch_and_index (line 3223-3272)
const fetchAndIndexSchema = z.object({
  url: z.string().optional().describe("Single URL to fetch and index"),
  source: z.string().optional().describe("Label for indexed content"),
  requests: z
    .preprocess(
      coerceJsonArray,
      z.array(
        z.object({
          url: z.string().describe("URL to fetch"),
          source: z.string().optional().describe("Label for this URL's indexed content"),
        }),
      ).min(1),
    )
    .optional()
    .describe("Batch shape: array of {url, source?} entries"),
  concurrency: z.coerce.number().int().min(1).max(8).optional().default(1)
    .describe("Max URLs to fetch in parallel"),
  force: z
    .preprocess(coerceBool, z.boolean())
    .optional()
    .describe("Skip cache and re-fetch"),
  ttl: z.coerce.number().int().min(0).optional()
    .describe("Override cache freshness window in ms"),
});

const batchRequests = [
  { url: "https://example.com", source: "test1" },
  { url: "https://httpbin.org/html", source: "test2" },
];

describe("production: built zod3tov4 + OpenCode plugin validation chain", () => {
  // Simulate EXACT production flow:
  // plugin.ts → zod3ShapeToV4 → registry.ts z.object() wrap
  const z3Shape = fetchAndIndexSchema._def.shape() as Record<string, unknown>;
  const v4ShapeFromBuilt = zod3ShapeToV4(z3Shape);
  const v4Validator = z4.object(v4ShapeFromBuilt as Record<string, z4.ZodType>);

  it("P1: stringified requests array → accepted via built module", () => {
    const r = v4Validator.safeParse({
      requests: JSON.stringify(batchRequests),
      concurrency: "2",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.requests).toHaveLength(2);
      expect(r.data.requests[0].url).toBe("https://example.com");
      expect(r.data.concurrency).toBe(2);
    }
  });

  it("P2: force: 'true'/'false' strings → coerced via built module", () => {
    expect(v4Validator.safeParse({ url: "x", force: "true" }).data?.force).toBe(true);
    expect(v4Validator.safeParse({ url: "x", force: "false" }).data?.force).toBe(false);
    expect(v4Validator.safeParse({ url: "x", force: true }).data?.force).toBe(true);
  });

  it("P3: native array passes through", () => {
    const r = v4Validator.safeParse({
      requests: batchRequests,
      concurrency: 2,
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.requests).toHaveLength(2);
  });

  it("P4: single URL mode (no requests)", () => {
    const r = v4Validator.safeParse({ url: "https://example.com", source: "test" });
    expect(r.success).toBe(true);
  });

  it("P5: concurrency string '5' → number 5 via built coerce", () => {
    const r = v4Validator.safeParse({
      requests: batchRequests,
      concurrency: "5",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.concurrency).toBe(5);
  });

  it("P6: ttl string '60000' → number 60000 via built coerce", () => {
    const r = v4Validator.safeParse({
      url: "https://example.com",
      ttl: "60000",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.ttl).toBe(60000);
  });

  it("P7: all fields together with stringified args (end-to-end)", () => {
    const r = v4Validator.safeParse({
      requests: JSON.stringify(batchRequests),
      concurrency: "3",
      force: "true",
      ttl: "0",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.requests).toHaveLength(2);
      expect(r.data.concurrency).toBe(3);
      expect(r.data.force).toBe(true);
      expect(r.data.ttl).toBe(0);
    }
  });

  it("P8: no coercion regressions — plain number 'abc' rejected", () => {
    const r = v4Validator.safeParse({
      url: "https://example.com",
      concurrency: "abc",
    });
    expect(r.success).toBe(false);
  });
});
