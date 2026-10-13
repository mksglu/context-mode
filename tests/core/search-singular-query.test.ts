/**
 * Issue #1200: ctx_search accepts the singular `query` parameter.
 *
 * The server.ts handler has normalised `query: "..."` into the query list
 * since 43667c0 ("accept both query (string) and queries (array)"), but the
 * Zod input schema never declared the field. The MCP SDK validates tool
 * arguments with the schema before the handler runs, and a Zod object parse
 * strips unknown keys, so `query` was removed from the payload and every
 * schema-conforming host answered the singular form with
 * "Error: provide query or queries."
 *
 * These tests pin the schema layer: the alias must be declared in both DB
 * modes and must survive validation, without loosening the rest of the
 * contract (plural form, coercions, defaults).
 */

import { describe, test, expect } from "vitest";
import { buildCtxSearchInputSchema } from "../../src/search/ctx-search-schema.js";

describe("Issue #1200: ctx_search singular `query` survives input validation", () => {
  test("schema declares `query` in both shared-DB modes", () => {
    for (const isSharedMode of [false, true]) {
      const schema = buildCtxSearchInputSchema(isSharedMode);
      expect(Object.keys(schema.shape)).toContain("query");
    }
  });

  test("parse keeps a singular query instead of stripping it", () => {
    const schema = buildCtxSearchInputSchema(false);
    const parsed = schema.parse({ query: "useEffect cleanup pattern", limit: "4" });
    expect(parsed).toMatchObject({ query: "useEffect cleanup pattern", limit: 4 });
  });

  test("plural form, coercions and defaults are unchanged", () => {
    const schema = buildCtxSearchInputSchema(false);
    expect(schema.parse({ queries: ["a", "b"] })).toEqual({
      queries: ["a", "b"],
      limit: 3,
      sort: "relevance",
    });
    expect(schema.parse({})).toEqual({ limit: 3, sort: "relevance" });
    // Bare-string lift for providers that stringify the array (#627) stays intact.
    expect(schema.parse({ queries: "bare term" })).toMatchObject({ queries: ["bare term"] });
  });
});
