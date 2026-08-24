import { describe, test, expect } from "vitest";
import {
  parseContextModeToolsAllowlist,
  isContextModeToolEnabled,
} from "../src/util/tools-allowlist.js";

// CONTEXT_MODE_TOOLS allow-list (issue #1031).
// Tests import the REAL implementation from the pure util module (no side
// effects), so a broken implementation fails these tests rather than passing.

describe("parseContextModeToolsAllowlist", () => {
  test("unset env => empty allowlist (register everything)", () => {
    expect(parseContextModeToolsAllowlist(undefined)).toEqual([]);
  });

  test("empty string => empty allowlist", () => {
    expect(parseContextModeToolsAllowlist("")).toEqual([]);
  });

  test("whitespace-only => empty allowlist", () => {
    expect(parseContextModeToolsAllowlist("  ")).toEqual([]);
  });

  test("single tool", () => {
    expect(parseContextModeToolsAllowlist("ctx_execute")).toEqual(["ctx_execute"]);
  });

  test("comma-separated with whitespace is trimmed", () => {
    expect(parseContextModeToolsAllowlist(" ctx_execute , ctx_search ,"))
      .toEqual(["ctx_execute", "ctx_search"]);
  });
});

describe("isContextModeToolEnabled", () => {
  test("empty allowlist enables everything (status quo)", () => {
    expect(isContextModeToolEnabled("ctx_execute", [])).toBe(true);
    expect(isContextModeToolEnabled("ctx_stats", [])).toBe(true);
  });

  test("listed tool is enabled", () => {
    const list = ["ctx_execute", "ctx_execute_file"];
    expect(isContextModeToolEnabled("ctx_execute", list)).toBe(true);
    expect(isContextModeToolEnabled("ctx_execute_file", list)).toBe(true);
  });

  test("non-listed tool is disabled", () => {
    const list = ["ctx_execute", "ctx_execute_file"];
    expect(isContextModeToolEnabled("ctx_search", list)).toBe(false);
    expect(isContextModeToolEnabled("ctx_stats", list)).toBe(false);
  });

  test("unknown tool name is disabled", () => {
    expect(isContextModeToolEnabled("ctx_does_not_exist", ["ctx_execute"])).toBe(false);
  });
});

// Registration-wrapper skip contract (mirrors the guard in src/server.ts).
describe("registration wrapper skip contract", () => {
  test("non-listed tool is skipped before registration", () => {
    const registered: string[] = [];
    const original = (name: string) => registered.push(name);
    const wrapper = (name: string, allowlist: string[]) => {
      if (!isContextModeToolEnabled(name, allowlist)) return undefined;
      return original(name);
    };
    wrapper("ctx_execute", ["ctx_execute", "ctx_search"]);
    wrapper("ctx_doctor", ["ctx_execute", "ctx_search"]);
    wrapper("ctx_search", ["ctx_execute", "ctx_search"]);
    expect(registered).toEqual(["ctx_execute", "ctx_search"]);
    expect(registered).not.toContain("ctx_doctor");
  });

  test("unset allowlist registers all through the wrapper", () => {
    const registered: string[] = [];
    const wrapper = (name: string, allowlist: string[]) => {
      if (!isContextModeToolEnabled(name, allowlist)) return undefined;
      registered.push(name);
      return name;
    };
    const all11 = [
      "ctx_execute", "ctx_execute_file", "ctx_index", "ctx_search",
      "ctx_fetch_and_index", "ctx_batch_execute", "ctx_stats", "ctx_doctor",
      "ctx_upgrade", "ctx_purge", "ctx_insight",
    ];
    for (const t of all11) wrapper(t, []);
    expect(registered).toHaveLength(11);
    expect(registered).toEqual(all11);
  });
});
