/**
 * Issue #7 repro — WebFetchOutput metadata capture.
 *
 * SDK WebFetchOutput at sdk-tools.d.ts:2456-2481 exposes bytes/code/codeText/
 * durationMs/url. None captured today. NO redirect_url field exists —
 * redirect-loop detection must come from temporal correlation, not from
 * a single field.
 *
 * Privacy: capture host only, never full URL or query string.
 */

import { describe, test, expect } from "vitest";
import { extractEvents } from "../../src/session/extract.js";

function webfetchEventsOf(toolResponse: unknown) {
  return extractEvents({
    tool_name: "WebFetch",
    tool_input: { url: "https://example.com/path" },
    tool_response: typeof toolResponse === "string"
      ? toolResponse
      : JSON.stringify(toolResponse),
  }).filter((e) => e.type === "webfetch_metadata");
}

describe("extractWebFetchMetadata — Issue #7 WebFetch response metadata", () => {
  test("tracer: 200 OK with all 5 fields emits one webfetch_metadata event", () => {
    const events = webfetchEventsOf({
      code: 200,
      codeText: "OK",
      bytes: 14823,
      durationMs: 412,
      url: "https://example.com/path",
    });
    expect(events.length).toBe(1);
    expect(events[0].data).toMatch(/code:200/);
    expect(events[0].data).toMatch(/bytes:14823/);
    expect(events[0].data).toMatch(/durMs:412/);
  });

  test("host extraction strips path and query string (privacy)", () => {
    const events = webfetchEventsOf({
      code: 200,
      bytes: 100,
      durationMs: 50,
      url: "https://api.example.com/v1/users?token=secret&q=email",
    });
    expect(events.length).toBe(1);
    expect(events[0].data).toMatch(/host:api\.example\.com/);
    expect(events[0].data).not.toMatch(/token=secret/);
    expect(events[0].data).not.toMatch(/v1\/users/);
  });

  test("404 NotFound still emits with code field", () => {
    const events = webfetchEventsOf({
      code: 404,
      codeText: "Not Found",
      bytes: 142,
      durationMs: 88,
      url: "https://example.com/missing",
    });
    expect(events.length).toBe(1);
    expect(events[0].data).toMatch(/code:404/);
  });

  test("503 service unavailable also captured", () => {
    const events = webfetchEventsOf({
      code: 503,
      bytes: 0,
      durationMs: 2000,
      url: "https://flaky.example.com/",
    });
    expect(events.length).toBe(1);
    expect(events[0].data).toMatch(/code:503/);
  });

  test("non-WebFetch tools do NOT emit webfetch_metadata", () => {
    expect(extractEvents({
      tool_name: "Bash",
      tool_input: { command: "echo x" },
      tool_response: '{"code":200,"bytes":1,"durationMs":1,"url":"http://x"}',
    }).filter((e) => e.type === "webfetch_metadata").length).toBe(0);
  });

  test("non-JSON tool_response is tolerated (no throw, no event)", () => {
    const events = webfetchEventsOf("not json");
    expect(events.length).toBe(0);
  });

  test("missing url field still emits event without host (graceful)", () => {
    const events = webfetchEventsOf({
      code: 200,
      bytes: 10,
      durationMs: 5,
    });
    expect(events.length).toBe(1);
    expect(events[0].data).toMatch(/code:200/);
  });

  test("port in URL is preserved as part of host signature", () => {
    const events = webfetchEventsOf({
      code: 200,
      bytes: 10,
      durationMs: 5,
      url: "http://localhost:8080/api",
    });
    expect(events.length).toBe(1);
    expect(events[0].data).toMatch(/host:localhost/);
  });
});
