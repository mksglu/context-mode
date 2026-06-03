/**
 * Issue #8 repro — ExitWorktree extractor coverage.
 *
 * SDK exposes ExitWorktreeInput (sdk-tools.d.ts:2150) with `discard_changes`
 * at :2158 and ExitWorktreeOutput at :2710. Current extractWorktree at
 * src/session/extract.ts:1096 only handles EnterWorktree; programmatic exit
 * via the dedicated tool is invisible to telemetry.
 *
 * RED→GREEN tracers below add coverage without disturbing EnterWorktree.
 */

import { describe, test, expect } from "vitest";
import { extractEvents } from "../../src/session/extract.js";

function worktreeEventsOf(toolName: string, toolInput: Record<string, unknown>) {
  return extractEvents({
    tool_name: toolName,
    tool_input: toolInput,
    tool_response: "",
  }).filter((e) => e.category === "env" && String(e.type).includes("worktree"));
}

describe("extractWorktree — Issue #8 ExitWorktree coverage", () => {
  test("tracer: ExitWorktree with discard_changes:true emits worktree_exit", () => {
    const events = worktreeEventsOf("ExitWorktree", { discard_changes: true });
    expect(events.length).toBe(1);
    expect(events[0].type).toBe("worktree_exit");
  });

  test("ExitWorktree discard_changes:true is reflected in data field", () => {
    const events = worktreeEventsOf("ExitWorktree", { discard_changes: true });
    expect(events[0].data).toMatch(/discard.*true|discard_changes:true/i);
  });

  test("ExitWorktree discard_changes:false is reflected in data field", () => {
    const events = worktreeEventsOf("ExitWorktree", { discard_changes: false });
    expect(events.length).toBe(1);
    expect(events[0].data).toMatch(/discard.*false|discard_changes:false/i);
  });

  test("ExitWorktree without discard_changes field still emits an event", () => {
    const events = worktreeEventsOf("ExitWorktree", {});
    expect(events.length).toBe(1);
    expect(events[0].type).toBe("worktree_exit");
  });

  test("EnterWorktree regression — original behaviour unchanged", () => {
    const events = worktreeEventsOf("EnterWorktree", { name: "feature-x" });
    expect(events.length).toBe(1);
    expect(events[0].type).toBe("worktree");
    expect(events[0].data).toMatch(/feature-x/);
  });

  test("unrelated tool name does NOT emit worktree events", () => {
    expect(worktreeEventsOf("Bash", { command: "git worktree list" }).length).toBe(0);
    expect(worktreeEventsOf("Read", { file_path: "/x" }).length).toBe(0);
  });

  test("worktree_exit priority matches EnterWorktree priority (2)", () => {
    const events = worktreeEventsOf("ExitWorktree", { discard_changes: false });
    expect(events[0].priority).toBe(2);
  });
});
