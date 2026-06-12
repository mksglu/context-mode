/**
 * Issue #6 repro — FileReadOutput size metadata.
 *
 * SDK FileReadOutput at sdk-tools.d.ts:107-160 has text variant
 * (numLines/startLine/totalLines around L119/122/125) and image variant
 * (originalSize/dimensions around L137/142). PRD's L122/126/130 citations
 * are off by ~3 lines but ALL fields are present and verified.
 *
 * Privacy: capture sizes and line counts only, never file content.
 */

import { describe, test, expect } from "vitest";
import { extractEvents } from "../../src/session/extract.js";

function metaEventsOf(toolResponse: unknown) {
  return extractEvents({
    tool_name: "Read",
    tool_input: { file_path: "/some/path/x" },
    tool_response: typeof toolResponse === "string"
      ? toolResponse
      : JSON.stringify(toolResponse),
  }).filter((e) => e.type === "file_read_metadata");
}

describe("extractFileReadMetadata — Issue #6 FileReadOutput metadata", () => {
  test("tracer: text variant emits with lines + totalLines", () => {
    const events = metaEventsOf({
      type: "text",
      numLines: 50,
      startLine: 1,
      totalLines: 120,
    });
    expect(events.length).toBe(1);
    expect(events[0].data).toMatch(/type:text/);
    expect(events[0].data).toMatch(/lines:50/);
    expect(events[0].data).toMatch(/totalLines:120/);
  });

  test("text variant with partial read records startLine", () => {
    const events = metaEventsOf({
      type: "text",
      numLines: 30,
      startLine: 100,
      totalLines: 5000,
    });
    expect(events.length).toBe(1);
    expect(events[0].data).toMatch(/start:100/);
  });

  test("image variant emits with originalSize + dimensions", () => {
    const events = metaEventsOf({
      type: "image",
      originalSize: 1048576,
      dimensions: { width: 1920, height: 1080 },
    });
    expect(events.length).toBe(1);
    expect(events[0].data).toMatch(/type:image/);
    expect(events[0].data).toMatch(/origSize:1048576/);
    expect(events[0].data).toMatch(/dims:1920x1080/);
  });

  test("image variant without dimensions still emits with origSize", () => {
    const events = metaEventsOf({
      type: "image",
      originalSize: 4096,
    });
    expect(events.length).toBe(1);
    expect(events[0].data).toMatch(/type:image/);
    expect(events[0].data).toMatch(/origSize:4096/);
  });

  test("non-Read tools do NOT emit file_read_metadata", () => {
    expect(extractEvents({
      tool_name: "Bash",
      tool_input: { command: "ls" },
      tool_response: '{"type":"text","numLines":1,"totalLines":1}',
    }).filter((e) => e.type === "file_read_metadata").length).toBe(0);
  });

  test("response without `type` field emits no event (defensive)", () => {
    const events = metaEventsOf({ numLines: 1, totalLines: 1 });
    expect(events.length).toBe(0);
  });

  test("plain string Read response (non-JSON) emits no event", () => {
    const events = metaEventsOf("file contents as plain text");
    expect(events.length).toBe(0);
  });

  test("malformed dimensions object handled gracefully", () => {
    const events = metaEventsOf({
      type: "image",
      originalSize: 100,
      dimensions: "not an object",
    });
    expect(events.length).toBe(1);
    expect(events[0].data).not.toMatch(/dims:/);
  });

  test("event carries category 'data' and priority 3", () => {
    const events = metaEventsOf({
      type: "text", numLines: 1, totalLines: 1,
    });
    expect(events[0].category).toBe("data");
    expect(events[0].priority).toBe(3);
  });
});
