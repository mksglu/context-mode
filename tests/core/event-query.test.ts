/**
 * Unit tests for the session_events tokenizer and SQL builder.
 * Covers all acceptance criteria from the #737 matcher-fix spec.
 */

import { describe, test, expect } from "vitest";
import {
  tokenizeSearchQuery,
  escapeLike,
  tokenWeight,
  buildEventMatch,
} from "../../src/search/event-query.js";

// ─────────────────────────────────────────────────────────
// tokenizeSearchQuery
// ─────────────────────────────────────────────────────────

describe("tokenizeSearchQuery", () => {
  test("empty string returns []", () => {
    expect(tokenizeSearchQuery("")).toEqual([]);
  });

  test("whitespace-only returns []", () => {
    expect(tokenizeSearchQuery("   \t\n")).toEqual([]);
  });

  test("all-stopword query returns []", () => {
    expect(tokenizeSearchQuery("how did we the to of is it")).toEqual([]);
  });

  test("drops English stopwords and keeps meaningful tokens", () => {
    const result = tokenizeSearchQuery("how did we customize narumitw/pi-statusline");
    expect(result).not.toContain("how");
    expect(result).not.toContain("did");
    expect(result).not.toContain("we");
    expect(result).toContain("customize");
    expect(result).toContain("narumitw/pi-statusline");
  });

  test("keeps 2-char tokens (pi, ai, db, js, ts)", () => {
    const result = tokenizeSearchQuery("pi ai db js ts extension");
    expect(result).toContain("pi");
    expect(result).toContain("ai");
    expect(result).toContain("db");
    expect(result).toContain("js");
    expect(result).toContain("ts");
    expect(result).toContain("extension");
  });

  test("drops single-char tokens", () => {
    const result = tokenizeSearchQuery("a i x feature");
    expect(result).not.toContain("a");
    expect(result).not.toContain("i");
    expect(result).toContain("feature");
    // 'x' is single char
    expect(result).not.toContain("x");
  });

  test("preserves LIKE wildcard % in token (100%)", () => {
    const result = tokenizeSearchQuery("100%");
    expect(result).toContain("100%");
  });

  test("preserves LIKE wildcard _ in token (_task)", () => {
    const result = tokenizeSearchQuery("_task");
    expect(result).toContain("_task");
  });

  test("preserves full package token including leading @ and internal slash/hyphen", () => {
    // '@' is in the safe-char set [A-Za-z0-9%_/@.\-], so @narumitw/pi-statusline
    // survives trim and is kept as a single token (not split on '/').
    expect(tokenizeSearchQuery("@narumitw/pi-statusline")).toEqual(["@narumitw/pi-statusline"]);
  });

  test("deduplicates case-insensitively, preserves first-seen", () => {
    const result = tokenizeSearchQuery("Foo foo FOO bar");
    const fooCount = result.filter(t => t.toLowerCase() === "foo").length;
    expect(fooCount).toBe(1);
    expect(result[0]).toBe("Foo"); // first-seen preserved
    expect(result).toContain("bar");
  });

  test("caps at 8 tokens", () => {
    const query = "alpha beta gamma delta epsilon zeta eta theta iota kappa";
    expect(tokenizeSearchQuery(query).length).toBeLessThanOrEqual(8);
  });

  test("strips trailing punctuation like ? . , !", () => {
    const result = tokenizeSearchQuery("feature? config. error,");
    expect(result).toContain("feature");
    expect(result).toContain("config");
    expect(result).toContain("error");
    expect(result).not.toContain("feature?");
  });

  test("real dogfood query produces useful tokens", () => {
    const result = tokenizeSearchQuery("how did we customize narumitw/pi-statusline");
    // Should contain the distinctive package token and customize
    expect(result).toContain("narumitw/pi-statusline");
    expect(result).toContain("customize");
    expect(result.length).toBeGreaterThanOrEqual(2);
  });
});

// ─────────────────────────────────────────────────────────
// escapeLike
// ─────────────────────────────────────────────────────────

describe("escapeLike", () => {
  test("escapes backslash first", () => {
    expect(escapeLike("a\\b")).toBe("a\\\\b");
  });

  test("escapes %", () => {
    expect(escapeLike("100%")).toBe("100\\%");
  });

  test("escapes _", () => {
    expect(escapeLike("_task")).toBe("\\_task");
  });

  test("backslash before % so % escape is not re-escaped", () => {
    expect(escapeLike("a\\%b")).toBe("a\\\\\\%b");
  });

  test("plain token untouched", () => {
    expect(escapeLike("narumitw/pi-statusline")).toBe("narumitw/pi-statusline");
  });
});

// ─────────────────────────────────────────────────────────
// tokenWeight
// ─────────────────────────────────────────────────────────

describe("tokenWeight", () => {
  test("distinctive token > generic word > 2-char token", () => {
    const distinctive = tokenWeight("narumitw/pi-statusline"); // 4 + 12 = 16
    const generic = tokenWeight("customize");                   // 0 + 9  = 9
    const twoChar = tokenWeight("pi");                          // 0 + 2  = 2
    expect(distinctive).toBeGreaterThan(generic);
    expect(generic).toBeGreaterThan(twoChar);
  });

  test("token with slash gets distinctiveness bonus", () => {
    expect(tokenWeight("narumitw/pi")).toBeGreaterThan(tokenWeight("narumitw"));
  });

  test("token with hyphen gets distinctiveness bonus", () => {
    expect(tokenWeight("pi-statusline")).toBeGreaterThan(tokenWeight("pistatusline"));
  });

  test("token with digit gets bonus", () => {
    expect(tokenWeight("node18")).toBeGreaterThan(tokenWeight("nodejs"));
  });

  test("caps length contribution at 12", () => {
    const veryLong = tokenWeight("abcdefghijklmnopqrst"); // len=20 → min(20,12)=12
    const twelve = tokenWeight("abcdefghijkl");           // len=12 → 12
    expect(veryLong).toBe(twelve);
  });

  test("2-char plain token weight is 2", () => {
    expect(tokenWeight("pi")).toBe(2);
    expect(tokenWeight("ai")).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────
// buildEventMatch
// ─────────────────────────────────────────────────────────

describe("buildEventMatch", () => {
  test("empty query: hasTerms=false, whole-phrase fallback", () => {
    const r = buildEventMatch("");
    expect(r.hasTerms).toBe(false);
    // data/category are COALESCE'd to '' so a NULL column can't poison 3-valued logic.
    expect(r.matchClause).toContain("COALESCE(data,'') LIKE");
    expect(r.matchClause).toContain("COALESCE(category,'') LIKE");
    expect(r.matchParams.length).toBe(2);
    expect(r.scoreExpr).toBe("1");
    expect(r.scoreParams.length).toBe(0);
  });

  test("all-stopword query: hasTerms=false, whole-phrase fallback", () => {
    const r = buildEventMatch("how did we");
    expect(r.hasTerms).toBe(false);
  });

  test("single meaningful term: hasTerms=true", () => {
    const r = buildEventMatch("narumitw");
    expect(r.hasTerms).toBe(true);
    expect(r.matchParams.length).toBe(2); // data+category for 1 term
    // scoreParams: 2 per term + 1 phrase = 3
    expect(r.scoreParams.length).toBe(3);
  });

  test("multi-term query: correct param counts", () => {
    const r = buildEventMatch("customize narumitw/pi-statusline");
    expect(r.hasTerms).toBe(true);
    // 2 terms → matchParams = 4, scoreParams = 2*2+1 = 5
    const terms = r.matchParams.length / 2;
    expect(terms).toBeGreaterThanOrEqual(2);
    expect(r.scoreParams.length).toBe(terms * 2 + 1); // +1 for phrase boost
  });

  test("phrase boost param is escapeLike(query)", () => {
    const query = "pi extension";
    const r = buildEventMatch(query);
    // Last scoreParam is the escaped whole query
    expect(r.scoreParams[r.scoreParams.length - 1]).toBe("pi extension");
  });

  test("scoreExpr contains phrase boost * 100", () => {
    const r = buildEventMatch("customize pi");
    expect(r.scoreExpr).toContain("100 *");
  });

  test("token-path: literal wildcard % is preserved in matchParams (not the fallback path)", () => {
    // '100%' tokenizes to ['100%'] (hasTerms=true — TOKEN path, not fallback).
    // The wildcard char is preserved so literal '100%' is searchable.
    const r = buildEventMatch("100%");
    expect(r.hasTerms).toBe(true);
    // escapeLike('100%') = '100\\%'
    expect(r.matchParams).toContain("100\\%");
  });

  test("fallback path: bare % query uses whole-phrase LIKE with % escaped", () => {
    // Single '%' strips to '' (len<2 after trim) → tokenize returns [] → fallback.
    const r = buildEventMatch("%");
    expect(r.hasTerms).toBe(false);
    // escapeLike('%') = '\\%'; fallback wraps in %..%
    expect(r.matchParams[0]).toBe("\\%");
    expect(r.scoreExpr).toBe("1");
  });

  test("fallback path: bare _ query uses whole-phrase LIKE with _ escaped", () => {
    // Single '_' strips to '' (len<2) → fallback.
    const r = buildEventMatch("_");
    expect(r.hasTerms).toBe(false);
    expect(r.matchParams[0]).toBe("\\_");
  });

  test("fallback path: punctuation-only / all-stopword query uses whole-phrase LIKE", () => {
    // All stopwords → tokenize returns [] → fallback preserves exact phrase.
    const r = buildEventMatch("how did we");
    expect(r.hasTerms).toBe(false);
    expect(r.matchParams[0]).toBe("how did we"); // no LIKE metacharacters to escape
    expect(r.scoreExpr).toBe("1");
  });

  test("literal _task is preserved", () => {
    const r = buildEventMatch("_task");
    expect(r.hasTerms).toBe(true);
    // escapeLike('_task') = '\\_task'
    expect(r.matchParams).toContain("\\_task");
  });

  test("matchClause uses OR (any-term match)", () => {
    const r = buildEventMatch("alpha beta");
    expect(r.matchClause).toContain("OR");
  });

  test("scoreExpr uses + (additive scoring)", () => {
    const r = buildEventMatch("alpha beta");
    expect(r.scoreExpr).toContain("+");
  });
});
