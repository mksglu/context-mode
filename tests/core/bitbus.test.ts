import { describe, expect, test } from "vitest";

import { formatBitbusRecord, normalizeBitbusRecord } from "../../src/bitbus.js";

describe("bitbus records", () => {
  test("normalizes pattern failure events", () => {
    const record = normalizeBitbusRecord({
      type: "Pattern Failed!",
      actor: "codex",
      file: "src/server.ts",
      pattern: "compact trace",
      reason: "threshold missed",
    });

    expect(record.type).toBe("pattern_failed");
    expect(record.actor).toBe("codex");
    expect(record.file).toBe("src/server.ts");
  });

  test("formats searchable event text with stable data ordering", () => {
    const text = formatBitbusRecord(normalizeBitbusRecord({
      type: "pattern_failed",
      actor: "codex",
      file: "src/server.ts",
      pattern: "compact trace",
      reason: "threshold missed",
      data: { z: 1, a: "first" },
    }));

    expect(text).toContain("# bitbus:pattern_failed");
    expect(text).toContain("actor: codex");
    expect(text.indexOf("a: first")).toBeLessThan(text.indexOf("z: 1"));
  });
});
