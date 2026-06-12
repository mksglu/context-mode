/**
 * Issue #5 repro — Bash outcome signals.
 *
 * SDK BashOutput at sdk-tools.d.ts:2160-2200 exposes stderr (string),
 * interrupted (boolean), returnCodeInterpretation (semantic non-zero
 * exit hint). NO `exit_code` field exists — anti-hallucination warning
 * #1 in the PRD covers this.
 *
 * When the Bash tool emits a structured response (JSON), we capture
 * the three available signals. Capture stderr LENGTH only (privacy),
 * never content.
 */

import { describe, test, expect } from "vitest";
import { extractEvents } from "../../src/session/extract.js";

function outcomeEventsOf(toolResponse: unknown) {
  return extractEvents({
    tool_name: "Bash",
    tool_input: { command: "true" },
    tool_response: typeof toolResponse === "string"
      ? toolResponse
      : JSON.stringify(toolResponse),
  }).filter((e) => e.type === "bash_outcome");
}

describe("extractBashOutcome — Issue #5 Bash outcome signals", () => {
  test("tracer: clean run emits one bash_outcome with interrupted:false", () => {
    const events = outcomeEventsOf({
      stdout: "ok",
      stderr: "",
      interrupted: false,
    });
    expect(events.length).toBe(1);
    expect(events[0].data).toMatch(/interrupted:false/);
  });

  test("interrupted run emits with interrupted:true", () => {
    const events = outcomeEventsOf({
      stdout: "",
      stderr: "user cancelled",
      interrupted: true,
    });
    expect(events.length).toBe(1);
    expect(events[0].data).toMatch(/interrupted:true/);
  });

  test("returnCodeInterpretation is included when present", () => {
    const events = outcomeEventsOf({
      stdout: "",
      stderr: "command not found",
      interrupted: false,
      returnCodeInterpretation: "ENOENT",
    });
    expect(events.length).toBe(1);
    expect(events[0].data).toMatch(/rcInterp:ENOENT/);
  });

  test("stderr LENGTH is captured (privacy — no content)", () => {
    const stderrText = "secret-token-abc123 in error message";
    const events = outcomeEventsOf({
      stdout: "",
      stderr: stderrText,
      interrupted: false,
    });
    expect(events.length).toBe(1);
    expect(events[0].data).toMatch(/stderrBytes:\d+/);
    expect(events[0].data).not.toContain("secret-token");
    expect(events[0].data).not.toContain(stderrText);
  });

  test("non-Bash tools do NOT emit bash_outcome", () => {
    expect(extractEvents({
      tool_name: "Read",
      tool_input: { file_path: "/x" },
      tool_response: '{"interrupted":false,"stderr":""}',
    }).filter((e) => e.type === "bash_outcome").length).toBe(0);
  });

  test("plain string Bash response (non-JSON) emits no bash_outcome event", () => {
    const events = outcomeEventsOf("just plain stdout output");
    expect(events.length).toBe(0);
  });

  test("JSON without any of the 3 signals emits no event", () => {
    const events = outcomeEventsOf({ stdout: "only this" });
    expect(events.length).toBe(0);
  });

  test("rcInterp longer than 80 chars is truncated", () => {
    const longInterp = "X".repeat(200);
    const events = outcomeEventsOf({
      stderr: "",
      interrupted: false,
      returnCodeInterpretation: longInterp,
    });
    expect(events.length).toBe(1);
    expect(events[0].data.length).toBeLessThan(300);
  });
});
