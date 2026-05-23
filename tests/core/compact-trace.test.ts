import { describe, expect, test } from "vitest";

import {
  CompactTraceCodec,
  compactTraceEnabled,
  estimateCompactTraceTokens,
  type CompactBatchTraceInput,
} from "../../src/compact-trace.js";

function buildBatch(index: number, events: number): CompactBatchTraceInput {
  const sections = Array.from({ length: events }, (_, i) => {
    const label = `scan-${(index + i) % 8}`;
    const repeated =
      `path=src/module/${label}.ts status=unchanged bytes=${2_000 + i} ` +
      "imports checked, tests mapped, risks indexed, retrieval source preserved. ";
    return {
      title: label,
      content: repeated.repeat(3),
    };
  });
  const queries = Array.from({ length: 5 }, (_, i) => {
    const query = `query-${i % 3}`;
    return {
      query,
      hits: [sections[(i * 3) % events], sections[(i * 3 + 1) % events], sections[(i * 3 + 2) % events]],
    };
  });
  const inventory = sections.map((section) => `- ${section.title} (${section.content.length}B)`);
  const queryText = queries.flatMap((query) => [
    `## ${query.query}`,
    "",
    ...query.hits.flatMap((hit) => [`### ${hit.title}`, hit.content, ""]),
  ]);

  return {
    commandLabels: ["git", "tests", "docs"],
    source: "batch:git,tests,docs",
    totalLines: events * 7,
    totalBytes: sections.reduce((sum, section) => sum + Buffer.byteLength(section.content), 0),
    indexedSections: sections,
    queries,
    plainText: [
      `Executed 3 commands (${events * 7} lines). Indexed ${events} sections. Searched 5 queries.`,
      "",
      "## Indexed Sections",
      "",
      ...inventory,
      "",
      ...queryText,
      "Searchable terms for follow-up: imports, checked, tests, mapped, risks, indexed",
    ].join("\n"),
  };
}

describe("compact trace codec", () => {
  test("round-trips a compact batch trace", () => {
    const codec = new CompactTraceCodec();
    const encoded = codec.encodeBatch(buildBatch(0, 6));
    const decoded = new CompactTraceCodec().decodeBatch(encoded.text);

    expect(encoded.text.startsWith("CM1\n")).toBe(true);
    expect(decoded.source).toBe("batch:git,tests,docs");
    expect(decoded.commandLabels).toEqual(["git", "tests", "docs"]);
    expect(decoded.indexedSections).toHaveLength(6);
    expect(decoded.indexedSections[0].hash).toMatch(/^[a-f0-9]{8}$/);
    expect(decoded.queries).toHaveLength(5);
    expect(decoded.queries[0].hits).toHaveLength(3);
  });

  test("amortizes the dictionary across traces", () => {
    const writer = new CompactTraceCodec();
    const reader = new CompactTraceCodec();

    const first = writer.encodeBatch(buildBatch(0, 12));
    const second = writer.encodeBatch(buildBatch(1, 12));

    reader.decodeBatch(first.text);
    const decodedSecond = reader.decodeBatch(second.text);

    expect(first.dictionaryAdds).toBeGreaterThan(0);
    expect(second.dictionaryAdds).toBe(0);
    expect(second.compactTokens).toBeLessThan(first.compactTokens);
    expect(decodedSecond.commandLabels).toEqual(["git", "tests", "docs"]);
    expect(decodedSecond.queries[0].query).toBe("query-0");
  });

  test("measures above 90 percent savings for repeated retrieval traces", () => {
    const codec = new CompactTraceCodec();
    let plain = "";
    let compact = "";

    for (let i = 0; i < 5; i++) {
      const input = buildBatch(i, 20);
      plain += `${input.plainText}\n`;
      compact += `${codec.encodeBatch(input).text}\n`;
    }

    const plainTokens = estimateCompactTraceTokens(plain);
    const compactTokens = estimateCompactTraceTokens(compact);
    const savedRatio = (plainTokens - compactTokens) / plainTokens;

    expect(savedRatio).toBeGreaterThan(0.9);
  });

  test("uses an explicit env gate for server integration", () => {
    expect(compactTraceEnabled("1")).toBe(true);
    expect(compactTraceEnabled("compact")).toBe(true);
    expect(compactTraceEnabled("0")).toBe(false);
    expect(compactTraceEnabled(undefined)).toBe(false);
  });
});
