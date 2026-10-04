/**
 * Cluster C2 — session-resume leg-boundary + Data-References sizing.
 *
 * #780 — Session resume re-injects stale events from previous `--continue` legs
 *        as if they were current (phantom subagent / tool calls). A volatile
 *        `subagent` event written in a PRIOR leg must NOT be rendered under the
 *        current "## Subagent Tasks"; it must be reframed as prior-leg history.
 *
 * #840 — `## Data References` inlines EVERY captured tool-output verbatim into
 *        the SessionStart directive (~10K tokens on long sessions), defeating
 *        context-mode's own raw-bytes-stay-out principle. Large outputs must be
 *        REFERENCED (size + ctx_search pointer), not inlined; only a small
 *        recent window of small captures stays inline.
 *
 * The leg boundary is the most recent `session_start` lifecycle event in the
 * events array (emitted by the prior leg's SessionStart, before the directive
 * for the current leg is built — see hooks/sessionstart.mjs:206/258, 277/293).
 */

import { describe, test, expect } from "vitest";
import {
  buildSessionDirective,
  writeSessionEventsFile,
  groupEvents,
} from "../../hooks/session-directive.mjs";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function ev(
  category: string,
  data: string,
  createdAt: string,
  type: string = category,
) {
  return { type, category, data, priority: 1, created_at: createdAt };
}

const T = (n: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString();

describe("#780 — leg boundary: prior-leg volatile events are not re-injected as current", () => {
  test("buildSessionDirective does NOT present a prior-leg [completed] subagent as a current Subagent Task", () => {
    // Leg 1: an agent completed. Leg 2 starts (session_start boundary). Nothing
    // happened in leg 2 yet. The stale [completed] must not surface as current.
    const events = [
      ev("subagent", "[completed] build the widget → done", T(1), "subagent_completed"),
      ev("session_start", JSON.stringify({ source: "resume" }), T(5), "session_start"),
    ];
    const meta = groupEvents(events);
    const block = buildSessionDirective("resume", meta, (n: string) => n);

    // The CURRENT "## Subagent Tasks" header must not appear at all (the only
    // subagent event is prior-leg). The stale entry may only appear under an
    // explicit "(earlier session — not current)" framing.
    expect(block).not.toMatch(/## Subagent Tasks\n/);
    const priorSection = block.split("(earlier session — not current)")[1] ?? "";
    expect(priorSection).toContain("[completed] build the widget");
  });

  test("a current-leg subagent event (after the boundary) IS rendered as current", () => {
    const events = [
      ev("session_start", JSON.stringify({ source: "resume" }), T(5), "session_start"),
      ev("subagent", "[launched] analyze logs", T(8), "subagent_launched"),
    ];
    const meta = groupEvents(events);
    const block = buildSessionDirective("resume", meta, (n: string) => n);
    const subagentSection = block.split("## Subagent Tasks")[1]?.split("\n##")[0] ?? "";
    expect(subagentSection).toContain("analyze logs");
  });

  test("no boundary (first leg) → all subagent events render as current (no regression)", () => {
    const events = [
      ev("subagent", "[launched] first agent", T(1), "subagent_launched"),
    ];
    const meta = groupEvents(events);
    const block = buildSessionDirective("resume", meta, (n: string) => n);
    expect(block).toContain("first agent");
  });
});

describe("#840 — Data References: reference (not inline) large tool-outputs", () => {
  const big = (label: string) =>
    JSON.stringify({ stdout: `${label} `.repeat(400), stderr: "", interrupted: false });

  test("buildSessionDirective: large captures are referenced, not inlined verbatim", () => {
    const events = Array.from({ length: 30 }, (_, i) =>
      ev("data", big(`blob${i}`), T(i)),
    );
    const meta = groupEvents(events);
    const block = buildSessionDirective("resume", meta, (n: string) => n);

    const dataSection = block.split("## Data References")[1] ?? "";
    // Whole-blob inlining is the bug. The section must stay bounded (a small
    // recent window) and carry a pointer to ctx_search for the rest — not grow
    // with the number/size of captures (full dump here would be ~25KB).
    expect(dataSection.length).toBeLessThan(2500);
    expect(dataSection).toMatch(/ctx_search|older captures|querie/i);
    // None of the giant stdout blobs should be inlined in full.
    expect(dataSection).not.toContain("blob0 blob0 blob0 blob0");
    // Only the recent window is inlined; the bulk is referenced.
    expect(dataSection).toContain("older captures");
  });

  test("writeSessionEventsFile: Data References section is capped, not a full dump", () => {
    const events = Array.from({ length: 30 }, (_, i) =>
      ev("data", big(`blob${i}`), T(i)),
    );
    const dir = mkdtempSync(join(tmpdir(), "ctx-dataref-"));
    const path = join(dir, "events.md");
    try {
      writeSessionEventsFile(events, path);
      const md = readFileSync(path, "utf-8");
      const section = md.split("## Data References")[1]?.split("\n## ")[0] ?? "";
      // The full raw dump of 30 multi-KB blobs would be tens of KB. Capped
      // rendering keeps it small and points to the sandbox for the rest.
      expect(section.length).toBeLessThan(3000);
      expect(section).toMatch(/ctx_search|older captures|querie/i);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("small recent captures are still inlined (recall preserved)", () => {
    const events = [ev("data", "indexed 12 rows from build.log", T(1))];
    const meta = groupEvents(events);
    const block = buildSessionDirective("resume", meta, (n: string) => n);
    expect(block).toContain("indexed 12 rows from build.log");
  });
});
