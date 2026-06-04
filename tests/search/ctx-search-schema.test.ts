import { describe, test, expect } from "vitest";
import {
  buildCtxSearchInputSchema,
  resolveProjectScope,
} from "../src/search/ctx-search-schema.js";

describe("buildCtxSearchInputSchema", () => {
  describe("non-shared mode (default)", () => {
    test("schema does not include project field", () => {
      const schema = buildCtxSearchInputSchema(false);
      const shape = schema.shape;
      expect(shape).not.toHaveProperty("project");
    });

    test("parses queries array", () => {
      const schema = buildCtxSearchInputSchema(false);
      const result = schema.parse({
        queries: ["search term"],
        limit: 5,
      });
      expect(result.queries).toEqual(["search term"]);
      expect(result.limit).toBe(5);
    });

    test("applies default values", () => {
      const schema = buildCtxSearchInputSchema(false);
      const result = schema.parse({});
      expect(result.limit).toBe(3);
      expect(result.sort).toBe("relevance");
    });

    test("accepts valid sort values", () => {
      const schema = buildCtxSearchInputSchema(false);
      expect(schema.parse({ sort: "relevance" }).sort).toBe("relevance");
      expect(schema.parse({ sort: "timeline" }).sort).toBe("timeline");
    });

    test("rejects invalid sort value", () => {
      const schema = buildCtxSearchInputSchema(false);
      expect(() => schema.parse({ sort: "invalid" })).toThrow();
    });

    test("accepts valid contentType values", () => {
      const schema = buildCtxSearchInputSchema(false);
      expect(schema.parse({ contentType: "code" }).contentType).toBe("code");
      expect(schema.parse({ contentType: "prose" }).contentType).toBe("prose");
    });

    test("accepts optional source filter", () => {
      const schema = buildCtxSearchInputSchema(false);
      expect(schema.parse({ source: "Docs" }).source).toBe("Docs");
      expect(schema.parse({}).source).toBeUndefined();
    });
  });

  describe("shared mode", () => {
    test("schema includes project field", () => {
      const schema = buildCtxSearchInputSchema(true);
      const shape = schema.shape;
      expect(shape).toHaveProperty("project");
    });

    test("accepts project as string", () => {
      const schema = buildCtxSearchInputSchema(true);
      const result = schema.parse({ project: "/home/user/my-project" });
      expect(result.project).toBe("/home/user/my-project");
    });

    test("accepts project as 'global'", () => {
      const schema = buildCtxSearchInputSchema(true);
      const result = schema.parse({ project: "global" });
      expect(result.project).toBe("global");
    });

    test("project is optional in shared mode", () => {
      const schema = buildCtxSearchInputSchema(true);
      const result = schema.parse({});
      expect(result.project).toBeUndefined();
    });
  });

  describe("coerceJsonArray preprocessing for queries", () => {
    test("lifts bare string to single-element array", () => {
      const schema = buildCtxSearchInputSchema(false);
      // OpenCode plugin path may deliver queries as a bare string
      const result = schema.parse({ queries: "search term" });
      expect(result.queries).toEqual(["search term"]);
    });

    test("parses JSON array string", () => {
      const schema = buildCtxSearchInputSchema(false);
      const result = schema.parse({ queries: '["query1", "query2"]' });
      expect(result.queries).toEqual(["query1", "query2"]);
    });

    test("passes through empty string for validation to catch", () => {
      const schema = buildCtxSearchInputSchema(false);
      // Empty string should be passed through so Zod surfaces the "non-empty" error
      expect(() => schema.parse({ queries: "" })).toThrow();
    });

    test("passes through whitespace-only string for validation to catch", () => {
      const schema = buildCtxSearchInputSchema(false);
      expect(() => schema.parse({ queries: "   " })).toThrow();
    });

    test("handles array input directly", () => {
      const schema = buildCtxSearchInputSchema(false);
      const result = schema.parse({ queries: ["a", "b", "c"] });
      expect(result.queries).toEqual(["a", "b", "c"]);
    });
  });

  describe("limit coercion (OpenCode plugin path)", () => {
    test("coerces string limit to number", () => {
      const schema = buildCtxSearchInputSchema(false);
      // OpenCode plugin path may deliver limit as string
      const result = schema.parse({ limit: "5" });
      expect(result.limit).toBe(5);
    });

    test("accepts numeric limit", () => {
      const schema = buildCtxSearchInputSchema(false);
      const result = schema.parse({ limit: 10 });
      expect(result.limit).toBe(10);
    });
  });
});

describe("resolveProjectScope", () => {
  const mockGetProjectDir = () => "/home/user/current-project";

  describe("non-shared mode", () => {
    test("always returns undefined regardless of input", () => {
      expect(resolveProjectScope(undefined, false, mockGetProjectDir)).toBeUndefined();
      expect(resolveProjectScope("global", false, mockGetProjectDir)).toBeUndefined();
      expect(resolveProjectScope("/some/path", false, mockGetProjectDir)).toBeUndefined();
    });
  });

  describe("shared mode", () => {
    test("undefined raw → current project (from getProjectDirFn)", () => {
      expect(resolveProjectScope(undefined, true, mockGetProjectDir)).toBe(
        "/home/user/current-project"
      );
    });

    test("'global' raw → null (cross-project recall)", () => {
      expect(resolveProjectScope("global", true, mockGetProjectDir)).toBeNull();
    });

    test("string raw → that string verbatim", () => {
      expect(
        resolveProjectScope("/other/project", true, mockGetProjectDir)
      ).toBe("/other/project");
    });

    test("empty string raw → empty string verbatim", () => {
      expect(resolveProjectScope("", true, mockGetProjectDir)).toBe("");
    });
  });

  describe("purity", () => {
    test("does not modify the getProjectDirFn argument", () => {
      let called = false;
      const getDir = () => {
        called = true;
        return "/test";
      };

      // In non-shared mode, getProjectDirFn should NOT be called
      resolveProjectScope(undefined, false, getDir);
      expect(called).toBe(false);
    });

    test("calls getProjectDirFn only in shared mode with undefined raw", () => {
      let called = false;
      const getDir = () => {
        called = true;
        return "/test";
      };

      resolveProjectScope(undefined, true, getDir);
      expect(called).toBe(true);
    });
  });
});
