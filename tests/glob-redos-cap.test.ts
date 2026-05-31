/**
 * glob-redos-cap.test.ts — the three glob->regex compilers all expand `*`/`**`
 * into `.*`-style groups whose `.test()` backtracks catastrophically on a
 * non-matching `/`-segmented input. Each runs in the long-lived MCP server on
 * attacker-influenceable patterns: store-directory's `globToRegExp` compiles
 * ctx_index include/exclude (unvalidated tool args), and security's
 * `fileGlobToRegex`/`globToRegex` compile deny globs sourced from project-local
 * `.claude/settings*.json` (which a hostile clone controls). So each caps the
 * wildcard count and compiles an over-cap pattern to a never-match regex.
 *
 * Safety: these tests assert the compiled regex SOURCE -- compiling a regex
 * never backtracks, only `.test()` does. The only `.test()` calls run against
 * the never-match form (proven by the preceding `.source` check, so it can't
 * backtrack) or against short legit inputs. We never run an unbounded `.test()`
 * of a hostile pattern, since a synchronous catastrophic regex pegs the event
 * loop and hangs the runner outright.
 */
import { describe, test, expect } from "vitest";
import { globToRegExp } from "../src/store-directory.js";
import { fileGlobToRegex, globToRegex } from "../build/security.js";

// 40 `**` groups -> 40 `.*` groups once compiled, uncapped.
const HOSTILE = "**/".repeat(40) + "Z";

describe("store-directory globToRegExp wildcard cap", () => {
  test("an over-cap pattern compiles to a never-match regex", () => {
    const re = globToRegExp(HOSTILE);
    expect(re.source).toBe("(?!)");
    // Safe: the assertion above proved `re` is the never-match form, which
    // can't backtrack.
    expect(re.test("a/".repeat(80))).toBe(false);
  });

  test("legit globs still compile and match", () => {
    expect(globToRegExp("**/*.ts").test("src/a/b.ts")).toBe(true);
    expect(globToRegExp("node_modules/**").test("node_modules/pkg/x.js")).toBe(true);
    expect(globToRegExp("**/secrets/**").test("a/secrets/b")).toBe(true);
  });
});

describe("security fileGlobToRegex wildcard cap", () => {
  test("an over-cap deny glob compiles to a never-match regex", () => {
    const re = fileGlobToRegex(HOSTILE);
    expect(re.source).toBe("(?!)");
    expect(re.test("a/".repeat(80))).toBe(false);
  });

  test("legit deny globs still match", () => {
    expect(fileGlobToRegex("**/.env").test("a/b/.env")).toBe(true);
    expect(fileGlobToRegex("**/*.key").test("certs/server.key")).toBe(true);
  });
});

describe("security globToRegex command wildcard cap", () => {
  test("an over-cap command glob compiles to a never-match regex", () => {
    const re = globToRegex("x:" + "*".repeat(40));
    expect(re.source).toBe("(?!)");
  });

  test("legit command globs still match", () => {
    expect(globToRegex("tree:*").test("tree")).toBe(true);
    expect(globToRegex("rm:*").test("rm -rf /")).toBe(true);
  });
});
