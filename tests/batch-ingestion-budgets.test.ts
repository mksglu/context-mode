import { describe, expect, test } from "vitest";
import {
  DEFAULT_BATCH_INGESTION_LIMITS,
  batchIngestionStructuredContent,
  formatBatchIngestionSummary,
  planBatchIngestion,
  resolveBatchIngestionPolicy,
  type BatchCapturedCommand,
  type BatchIngestionLimits,
} from "../src/batch-ingestion.js";
import { ContentStore } from "../src/store.js";
import { readFileSync } from "node:fs";

const KiB = 1024;
const MiB = 1024 * KiB;

function command(
  label: string,
  stdout: string,
  overrides: Partial<BatchCapturedCommand> = {},
): BatchCapturedCommand {
  return {
    label,
    command: `emit ${label}`,
    stdout,
    stderr: "",
    exitCode: 0,
    durationMs: 7,
    timedOut: false,
    ...overrides,
  };
}

function limits(overrides: Partial<BatchIngestionLimits> = {}): BatchIngestionLimits {
  return {
    maxBytesPerCommand: 10,
    maxTotalIndexedBytes: 100,
    maxGeneratedChunks: 100,
    maxChunkBytes: 256,
    ...overrides,
  };
}

describe("batch indexed byte and chunk budgets (#961)", () => {
  test("uses benchmark-selected default limits", () => {
    expect(DEFAULT_BATCH_INGESTION_LIMITS).toEqual({
      maxBytesPerCommand: 8 * MiB,
      maxTotalIndexedBytes: 16 * MiB,
      maxGeneratedChunks: 4_608,
      maxChunkBytes: 4 * KiB,
    });
  });

  test("partially indexes a command that exceeds its per-command byte budget", () => {
    const plan = planBatchIngestion([command("oversized", "x".repeat(11))], limits());

    expect(plan.status).toBe("partial");
    expect(plan.capturedBytes).toBe(11);
    expect(plan.indexedBytes).toBe(10);
    expect(plan.droppedBytes).toBe(1);
    expect(plan.triggeredBudgets).toContain("per_command_bytes");
    expect(plan.commands[0].status).toBe("partial");
  });

  test("enforces the total batch budget across individually small commands", () => {
    const plan = planBatchIngestion(
      [command("first", "a".repeat(8)), command("second", "b".repeat(8))],
      limits({ maxBytesPerCommand: 10, maxTotalIndexedBytes: 12 }),
    );

    expect(plan.indexedBytes).toBe(12);
    expect(plan.droppedBytes).toBe(4);
    expect(plan.triggeredBudgets).toContain("batch_bytes");
    expect(plan.commands[0].status).toBe("complete");
    expect(plan.commands[1].status).toBe("partial");
  });

  test("stops storing chunks at the generated chunk budget", () => {
    const plan = planBatchIngestion(
      [command("chunk-explosion", "line\n".repeat(400))],
      limits({
        maxBytesPerCommand: 10_000,
        maxTotalIndexedBytes: 10_000,
        maxGeneratedChunks: 2,
      }),
    );

    expect(plan.generatedChunks).toBe(2);
    expect(plan.generatedChunks).toBeLessThanOrEqual(plan.policy.maxGeneratedChunks);
    expect(plan.indexedChunks).toBe(2);
    expect(plan.droppedChunks).toBeGreaterThan(0);
    expect(plan.triggeredBudgets).toContain("max_generated_chunks");
    expect(plan.status).toBe("partial");
  });

  test("batch status reflects zero-byte commands rejected by the chunk budget", () => {
    const plan = planBatchIngestion(
      [command("empty-one", ""), command("empty-two", "")],
      limits({ maxGeneratedChunks: 1 }),
    );

    expect(plan.status).toBe("partial");
    expect(plan.commands[0].status).toBe("complete");
    expect(plan.commands[1].status).toBe("not_indexed");
    expect(plan.generatedChunks).toBe(1);
    expect(plan.generatedChunks).toBeLessThanOrEqual(plan.policy.maxGeneratedChunks);
    expect(plan.indexedChunks).toBe(1);
    expect(plan.droppedChunks).toBe(1);
    expect(plan.triggeredBudgets).toContain("max_generated_chunks");
  });

  test("never reports a partial payload as complete", () => {
    const plan = planBatchIngestion([command("partial", "abcdef")], limits({ maxBytesPerCommand: 5 }));
    const summary = formatBatchIngestionSummary(plan).join("\n");

    expect(plan.status).toBe("partial");
    expect(summary).toMatch(/partially indexed/i);
    expect(summary).not.toMatch(/indexing status:\s*complete/i);
  });

  test("requires explicit opt-in before accepting limits above defaults", () => {
    const defaults = limits({ maxBytesPerCommand: 8, maxTotalIndexedBytes: 16, maxGeneratedChunks: 4 });

    expect(() => resolveBatchIngestionPolicy(
      { maxBytesPerCommand: 32 },
      defaults,
    )).toThrow(/allow_large_ingestion/i);

    const policy = resolveBatchIngestionPolicy(
      {
        maxBytesPerCommand: 32,
        maxTotalIndexedBytes: 64,
        maxGeneratedChunks: 16,
        allowLargeIngestion: true,
      },
      defaults,
    );
    const plan = planBatchIngestion([command("opt-in", "x".repeat(24))], policy);

    expect(policy.optInApplied).toBe(true);
    expect(plan.status).toBe("complete");
    expect(plan.indexedBytes).toBe(24);
    expect(plan.droppedBytes).toBe(0);
  });

  test("keeps display Markdown separate from structured plain indexed input", () => {
    const plan = planBatchIngestion([command("alpha", "searchable body")], limits({ maxBytesPerCommand: 100 }));
    const display = formatBatchIngestionSummary(plan).join("\n");

    expect(display).toContain("## Indexing Budget");
    expect(display).toContain("alpha");
    expect(plan.chunks.length).toBeGreaterThan(0);
    expect(plan.chunks[0].content).toContain('command_label="alpha"');
    expect(plan.chunks[0].content).toContain("exit_status=0");
    expect(plan.chunks[0].content).toContain("duration_ms=7");
    expect(plan.chunks[0].content).toContain("stream=stdout");
    expect(plan.chunks[0].content).not.toContain("# alpha");
  });

  test("exposes budget decisions and byte/chunk counts as structured metrics", () => {
    const plan = planBatchIngestion([command("metrics", "x".repeat(11))], limits());
    const structured = batchIngestionStructuredContent(plan) as {
      indexing: Record<string, unknown>;
    };

    expect(structured.indexing.status).toBe("partial");
    expect(structured.indexing.indexed_bytes).toBe(10);
    expect(structured.indexing.dropped_bytes).toBe(1);
    expect(structured.indexing.generated_chunks).toBe(plan.generatedChunks);
    expect(structured.indexing.indexed_chunks).toBe(plan.indexedChunks);
    expect(structured.indexing.dropped_chunks).toBe(plan.droppedChunks);
    expect(structured.indexing.triggered_budgets).toEqual(["per_command_bytes"]);
  });

  test.each([
    { size: 9, expectedStatus: "complete", expectedIndexed: 9, expectedDropped: 0 },
    { size: 10, expectedStatus: "complete", expectedIndexed: 10, expectedDropped: 0 },
    { size: 11, expectedStatus: "partial", expectedIndexed: 10, expectedDropped: 1 },
  ])("uses inclusive byte-limit boundaries for $size bytes", ({ size, expectedStatus, expectedIndexed, expectedDropped }) => {
    const plan = planBatchIngestion([command("boundary", "x".repeat(size))], limits());
    expect(plan.status).toBe(expectedStatus);
    expect(plan.indexedBytes).toBe(expectedIndexed);
    expect(plan.droppedBytes).toBe(expectedDropped);
  });

  test("preserves stdout, stderr, non-zero status, duration, and command labels", () => {
    const plan = planBatchIngestion([
      command("ok-command", "normal output"),
      command("failed-command", "partial stdout", {
        stderr: "important error",
        exitCode: 7,
        durationMs: 42,
      }),
    ], limits({ maxBytesPerCommand: 100, maxTotalIndexedBytes: 200 }));

    const failedChunks = plan.chunks.filter((chunk) => chunk.commandLabel === "failed-command");
    expect(failedChunks[0].stream).toBe("stderr");
    expect(failedChunks.map((chunk) => chunk.body).join("")).toContain("important error");
    expect(failedChunks.map((chunk) => chunk.body).join("")).toContain("partial stdout");
    expect(failedChunks[0].content).toContain("exit_status=7");
    expect(failedChunks[0].content).toContain("duration_ms=42");
    expect(plan.commands.map((item) => item.label)).toEqual(["ok-command", "failed-command"]);
  });

  test("counts UTF-8 bytes without normalizing platform newline sequences", () => {
    const emoji = String.fromCodePoint(0x1f389);
    const body = `one\r\ntwo\n${emoji}`;
    const plan = planBatchIngestion(
      [command("portable", body)],
      limits({ maxBytesPerCommand: 1_000, maxTotalIndexedBytes: 1_000 }),
    );

    expect(plan.capturedBytes).toBe(Buffer.byteLength(body, "utf8"));
    expect(plan.indexedBytes).toBe(Buffer.byteLength(body, "utf8"));
    expect(plan.chunks.map((chunk) => chunk.body).join("")).toBe(body);
  });

  test("keeps the existing small-batch path complete", () => {
    const plan = planBatchIngestion(
      [command("one", "small one"), command("two", "small two")],
      limits({ maxBytesPerCommand: 100, maxTotalIndexedBytes: 200 }),
    );

    expect(plan.status).toBe("complete");
    expect(plan.droppedBytes).toBe(0);
    expect(plan.droppedChunks).toBe(0);
    expect(formatBatchIngestionSummary(plan).join("\n")).toMatch(/Indexing status: complete/i);
  });

  test("bounds planner intermediates for a large synthetic input", () => {
    const body = "z".repeat(4 * MiB);
    const plan = planBatchIngestion(
      [command("large", body)],
      limits({
        maxBytesPerCommand: MiB,
        maxTotalIndexedBytes: MiB,
        maxGeneratedChunks: 4_096,
        maxChunkBytes: 4 * KiB,
      }),
    );

    expect(plan.indexedBytes).toBe(MiB);
    expect(plan.droppedBytes).toBe(3 * MiB);
    expect(plan.maxBufferedChunkBytes).toBeLessThanOrEqual(4 * KiB);
    expect(plan.chunks.every((chunk) => Buffer.byteLength(chunk.content) <= 4 * KiB)).toBe(true);
  });

  test("stores prepared chunks without reassembling display Markdown", () => {
    const plan = planBatchIngestion([
      command("store-command", "database searchable stdout", {
        stderr: "database searchable stderr",
        exitCode: 2,
      }),
    ], limits({ maxBytesPerCommand: 200, maxTotalIndexedBytes: 200 }));
    const store = new ContentStore(":memory:");

    try {
      const indexed = store.indexPreparedChunks(
        plan.chunks,
        "batch:store-command",
      );
      const rows = store.getChunksBySource(indexed.sourceId);

      expect(indexed.totalChunks).toBe(plan.indexedChunks);
      expect(rows).toHaveLength(plan.indexedChunks);
      expect(rows.map((row) => row.content).join("\n")).toContain("database searchable stderr");
      expect(rows.map((row) => row.content).join("\n")).not.toContain("# store-command");
    } finally {
      store.close();
    }
  });
  test("runBatchCommands exposes structured capture without allocating display output", async () => {
    const { runBatchCommands } = await import("../src/server.js");
    const result = await runBatchCommands(
      [{ label: "capture", command: "synthetic" }],
      {
        timeout: 1_000,
        concurrency: 1,
        nodeOptsPrefix: "",
        includeDisplayOutputs: false,
      },
      {
        execute: async () => ({
          stdout: "captured stdout",
          stderr: "captured stderr",
          exitCode: 7,
          timedOut: false,
        }),
      },
    );

    expect(result.outputs).toEqual([]);
    expect(result.commands).toHaveLength(1);
    expect(result.commands[0]).toMatchObject({
      label: "capture",
      command: "synthetic",
      stdout: "captured stdout",
      stderr: "captured stderr",
      exitCode: 7,
      timedOut: false,
    });
    expect(result.commands[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  test("ctx_batch_execute schema exposes budget controls", () => {
    const serverSource = readFileSync(new URL("../src/server.ts", import.meta.url), "utf8");

    expect(serverSource).toContain("max_bytes_per_command");
    expect(serverSource).toContain("max_total_indexed_bytes");
    expect(serverSource).toContain("max_generated_chunks");
    expect(serverSource).toContain("allow_large_ingestion");
    expect(serverSource).toContain("includeDisplayOutputs: false");
    expect(serverSource).toContain("store.indexPreparedChunks(");
    expect(serverSource).toContain("structuredContent: batchIngestionStructuredContent(plan)");
    expect(serverSource).not.toContain('const stdout = perCommandOutputs.join("\n")');
  });

});
