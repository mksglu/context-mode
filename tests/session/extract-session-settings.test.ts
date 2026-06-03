/**
 * Issue #4 (new PRD) — SessionStart settings + MCP servers snapshot.
 *
 * At SessionStart, Claude Code (and sister adapters) expose installed
 * MCP plugins via Object.keys(config.mcp_servers) and a small set of
 * user-configured permission / model defaults. This snapshot lets the
 * platform compute "# of MCP integrations per user" and "primary model
 * per org" — feeds the CTO shop-maturity score.
 *
 * The bridge exposes extractSessionSettings(input) → SessionEvent[]:
 *   - When ≥1 setting is available, emits ONE session_settings_snapshot
 *     event with category="env", priority=2
 *   - data: "mcp_count:N mcp_servers:a,b,c... model:X permission_mode:Y"
 *     (mcp_servers truncated to first 8)
 *   - When no setting available, emits no event (avoid noisy fire)
 */

import { describe, test, expect } from "vitest";
import { extractSessionSettings } from "../../src/session/extract.js";

describe("extractSessionSettings — Issue #4 (new PRD)", () => {
  test("tracer: full input → one session_settings_snapshot event", () => {
    const events = extractSessionSettings({
      mcp_servers: { filesystem: {}, github: {}, slack: {} },
      model: "claude-sonnet-4",
      permission_mode: "default",
    });
    expect(events.length).toBe(1);
    expect(events[0].type).toBe("session_settings_snapshot");
    expect(events[0].category).toBe("env");
  });

  test("mcp_count reflects number of server keys", () => {
    const events = extractSessionSettings({
      mcp_servers: { a: {}, b: {}, c: {}, d: {}, e: {} },
    });
    expect(events[0].data).toMatch(/mcp_count:5/);
  });

  test("mcp_servers list truncated to first 8", () => {
    const servers: Record<string, unknown> = {};
    for (let i = 0; i < 12; i++) servers[`server${i}`] = {};
    const events = extractSessionSettings({ mcp_servers: servers });
    const match = events[0].data.match(/mcp_servers:([^ ]+)/);
    expect(match).not.toBeNull();
    const names = match![1].split(",");
    expect(names.length).toBe(8);
  });

  test("model field appears as model:NAME", () => {
    const events = extractSessionSettings({ model: "claude-opus-4-7" });
    expect(events[0].data).toMatch(/model:claude-opus-4-7/);
  });

  test("permission_mode field appears as permission_mode:NAME", () => {
    const events = extractSessionSettings({ permission_mode: "acceptEdits" });
    expect(events[0].data).toMatch(/permission_mode:acceptEdits/);
  });

  test("empty mcp_servers map still emits event when other fields present", () => {
    const events = extractSessionSettings({ mcp_servers: {}, model: "x" });
    expect(events.length).toBe(1);
    expect(events[0].data).toMatch(/mcp_count:0/);
    expect(events[0].data).toMatch(/model:x/);
  });

  test("no settings at all → emits no event (defensive)", () => {
    const events = extractSessionSettings({});
    expect(events.length).toBe(0);
  });

  test("non-object input tolerated (no throw)", () => {
    expect(extractSessionSettings(null).length).toBe(0);
    expect(extractSessionSettings(undefined).length).toBe(0);
    // @ts-expect-error — defensive boundary
    expect(extractSessionSettings("garbage").length).toBe(0);
  });

  test("only mcp present → event still fires", () => {
    const events = extractSessionSettings({
      mcp_servers: { gh: {} },
    });
    expect(events.length).toBe(1);
    expect(events[0].data).toMatch(/mcp_count:1/);
  });

  test("non-string model / non-string permission_mode safely skipped", () => {
    const events = extractSessionSettings({
      mcp_servers: { a: {} },
      model: 42 as unknown as string,
      permission_mode: { } as unknown as string,
    });
    expect(events.length).toBe(1);
    expect(events[0].data).not.toMatch(/model:/);
    expect(events[0].data).not.toMatch(/permission_mode:/);
  });

  test("priority is 2 (snapshot is high-signal but not blocker)", () => {
    const events = extractSessionSettings({ mcp_servers: { x: {} } });
    expect(events[0].priority).toBe(2);
  });
});
