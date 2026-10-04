/**
 * The `source` attribute on <session_state> is read by the model, so it has to
 * be true. The block is injected on ordinary turns as well as after a
 * compaction, and a routine turn that claims `source="compaction"` tells the
 * agent its transcript was summarized away when it is intact — it then goes
 * looking for state that never needed restoring, and burns turns on it.
 *
 * `source` is therefore a required parameter with no default: a caller cannot
 * inherit a label it did not earn. These tests pin both halves — the label
 * tracks the argument, and every call site passes one.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildAutoInjection } from "../../hooks/auto-injection.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");

const events = [
  { category: "decision", data: "adopt bun over npm for scripts" },
  { category: "skill", data: "dataviz" },
];

describe("buildAutoInjection labels the block honestly", () => {
  it("emits the source it was given", () => {
    expect(buildAutoInjection(events, "compaction")).toContain(
      'source="compaction"',
    );
    expect(buildAutoInjection(events, "active_memory")).toContain(
      'source="active_memory"',
    );
  });

  it("a routine turn does not claim a compaction", () => {
    const block = buildAutoInjection(events, "active_memory");
    expect(block).not.toContain('source="compaction"');
  });

  it("only a real compaction carries the fidelity line", () => {
    // The line says where the history went. On a routine turn it would be noise
    // outside the 500-token content budget, taxing every turn to say nothing.
    expect(buildAutoInjection(events, "compaction")).toContain(
      "full history persists in the session transcript",
    );
    expect(buildAutoInjection(events, "active_memory")).not.toContain(
      "full history persists",
    );
  });

  it("refuses to guess: no source is a thrown error, not a default", () => {
    // A default here is exactly the bug — any new caller would silently ship
    // whichever label happened to be written down. The callers under hooks/
    // are plain .mjs, so a JSDoc type alone would not stop them: a missing
    // argument arrives as `undefined` and lands in the label verbatim.
    expect(() =>
      (buildAutoInjection as (e: unknown) => string)(events),
    ).toThrow(/source must be/);
    expect(() =>
      (buildAutoInjection as (e: unknown, s: unknown) => string)(
        events,
        "guess",
      ),
    ).toThrow(/source must be/);
  });

  it("returns empty when there is nothing to say", () => {
    expect(buildAutoInjection([], "active_memory")).toBe("");
  });
});

describe("every call site declares which kind of injection it is", () => {
  // Pi reaches the helper through the cached `buildAuto` alias, so its
  // contract is covered by the dedicated Pi test below rather than this regex.
  const CALLERS = ["hooks/sessionstart.mjs", "src/adapters/opencode/plugin.ts"];

  it.each(CALLERS)("%s passes an explicit source", (rel) => {
    const src = readFileSync(join(root, rel), "utf8");
    const calls = [...src.matchAll(/buildAutoInjection\(\s*[\w.]+/g)];
    expect(
      calls.length,
      `${rel} should call buildAutoInjection`,
    ).toBeGreaterThan(0);
    for (const call of calls) {
      const tail = src.slice(call.index, call.index + 400);
      // Reach the closing paren of THIS call before the next statement.
      const end = tail.indexOf(");");
      expect(end, `${rel}: unterminated call`).toBeGreaterThan(0);
      const args = tail.slice(0, end);
      expect(
        args,
        `${rel} calls buildAutoInjection with no source — the label would be inherited, not earned`,
      ).toMatch(/,\s*(?:"compaction"|"active_memory"|injectSource)\s*,?\s*$/);
    }
  });

  it("Pi arms the compaction label on compact and clears it at shutdown", () => {
    const src = readFileSync(
      join(root, "src/adapters/pi/extension.ts"),
      "utf8",
    );
    // Armed only where a real compaction is counted...
    expect(src).toMatch(
      /incrementCompactCount\(_sessionId\);[\s\S]{0,200}_pendingCompactLabel = true/,
    );
    // ...and consumed on the very next turn, read before it is cleared.
    expect(src).toMatch(
      /const injectSource:[^=]+=\s*_pendingCompactLabel[\s\S]{0,120}_pendingCompactLabel = false/,
    );
    // A shutdown must not leave it armed for the next session.
    expect(src).toMatch(
      /session_shutdown[\s\S]{0,300}_pendingCompactLabel = false/,
    );
  });
});

describe("no other module quietly reuses the helper", () => {
  it("scans hooks/ and src/ for buildAutoInjection callers", () => {
    // A caller added later without a source would throw at runtime inside a
    // hook; this keeps the blast radius visible at test time instead.
    const found: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "node_modules" || entry.name.endsWith(".bundle.mjs"))
          continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (
          /\.(mjs|ts)$/.test(entry.name) &&
          !/\.test\./.test(entry.name)
        ) {
          if (readFileSync(full, "utf8").includes("buildAutoInjection")) {
            found.push(full.slice(root.length + 1));
          }
        }
      }
    };
    walk(join(root, "hooks"));
    walk(join(root, "src"));
    // The definition and the three callers, nothing else.
    expect(found.sort()).toEqual([
      "hooks/auto-injection.mjs",
      "hooks/sessionstart.mjs",
      "src/adapters/opencode/plugin.ts",
      "src/adapters/pi/extension.ts",
    ]);
  });
});
