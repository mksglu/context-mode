import { describe, test, expect } from "vitest";
import { composeFetchCacheKey } from "../src/fetch-cache.js";

describe("composeFetchCacheKey", () => {
  describe("with source defined", () => {
    test("composes source::url format", () => {
      expect(composeFetchCacheKey("Docs", "https://example.com/api")).toBe(
        "Docs::https://example.com/api"
      );
    });

    test("handles empty string source", () => {
      expect(composeFetchCacheKey("", "https://example.com")).toBe(
        "::https://example.com"
      );
    });

    test("handles source with special characters", () => {
      expect(composeFetchCacheKey("My::Source", "https://example.com")).toBe(
        "My::Source::https://example.com"
      );
    });

    test("handles URL with query parameters", () => {
      expect(
        composeFetchCacheKey("API", "https://api.example.com/v1?key=value&foo=bar")
      ).toBe("API::https://api.example.com/v1?key=value&foo=bar");
    });
  });

  describe("with undefined source", () => {
    test("returns URL as-is when source is undefined", () => {
      expect(composeFetchCacheKey(undefined, "https://example.com/api")).toBe(
        "https://example.com/api"
      );
    });

    test("handles complex URL", () => {
      const url = "https://docs.example.com/guide/getting-started?lang=en#section";
      expect(composeFetchCacheKey(undefined, url)).toBe(url);
    });

    test("handles non-HTTP URL", () => {
      expect(composeFetchCacheKey(undefined, "file:///tmp/data.json")).toBe(
        "file:///tmp/data.json"
      );
    });
  });

  describe("uniqueness guarantees", () => {
    test("different sources with same URL produce different keys", () => {
      const url = "https://example.com/data";
      const key1 = composeFetchCacheKey("SourceA", url);
      const key2 = composeFetchCacheKey("SourceB", url);
      expect(key1).not.toBe(key2);
    });

    test("same source with different URLs produce different keys", () => {
      const source = "Docs";
      const key1 = composeFetchCacheKey(source, "https://example.com/a");
      const key2 = composeFetchCacheKey(source, "https://example.com/b");
      expect(key1).not.toBe(key2);
    });

    test("undefined source and defined source with same URL produce different keys", () => {
      const url = "https://example.com/data";
      const key1 = composeFetchCacheKey(undefined, url);
      const key2 = composeFetchCacheKey("Docs", url);
      expect(key1).not.toBe(key2);
    });
  });

  describe("LIKE-mode source filtering compatibility", () => {
    // Per the module doc: ctx_search(source: "Docs") continues to work because
    // LIKE-mode source filtering matches on the substring "Docs" inside
    // "Docs::https://…".
    test("composed key contains source as substring for LIKE filtering", () => {
      const key = composeFetchCacheKey("Docs", "https://example.com/api");
      expect(key.includes("Docs")).toBe(true);
    });

    test("composed key contains URL as substring", () => {
      const url = "https://example.com/api";
      const key = composeFetchCacheKey("Source", url);
      expect(key.includes(url)).toBe(true);
    });
  });
});
