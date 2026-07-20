import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, test } from "vitest";

const MiB = 1024 * 1024;
const originalContextModeDir = process.env.CONTEXT_MODE_DIR;
const originalEmbeddedTools = process.env.CONTEXT_MODE_EMBEDDED_PLUGIN_TOOLS;
const originalVersionCheck = process.env.CONTEXT_MODE_DISABLE_VERSION_CHECK;
const storageRoot = mkdtempSync(join(tmpdir(), "ctx-batch-handler-budget-"));

beforeAll(() => {
  process.env.CONTEXT_MODE_DIR = storageRoot;
  process.env.CONTEXT_MODE_EMBEDDED_PLUGIN_TOOLS = "1";
  process.env.CONTEXT_MODE_DISABLE_VERSION_CHECK = "1";
});

afterAll(() => {
  if (originalContextModeDir === undefined) delete process.env.CONTEXT_MODE_DIR;
  else process.env.CONTEXT_MODE_DIR = originalContextModeDir;
  if (originalEmbeddedTools === undefined) delete process.env.CONTEXT_MODE_EMBEDDED_PLUGIN_TOOLS;
  else process.env.CONTEXT_MODE_EMBEDDED_PLUGIN_TOOLS = originalEmbeddedTools;
  if (originalVersionCheck === undefined) delete process.env.CONTEXT_MODE_DISABLE_VERSION_CHECK;
  else process.env.CONTEXT_MODE_DISABLE_VERSION_CHECK = originalVersionCheck;
  try { rmSync(storageRoot, { recursive: true, force: true }); } catch { /* open DB on Windows */ }
});

test("ctx_batch_execute bounds its real MCP response for a multi-thousand-chunk partial ingestion", async () => {
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { InMemoryTransport } = await import("@modelcontextprotocol/sdk/inMemory.js");
  const { server } = await import("../src/server.js");
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "stage-1-batch-budget-probe", version: "0.0.0" }, { capabilities: {} });

  await Promise.all([
    server.server.connect(serverTransport),
    client.connect(clientTransport),
  ]);

  try {
    const marker = "stage1-handler-query-marker";
    const response = await client.callTool({
      name: "ctx_batch_execute",
      arguments: {
        commands: [{
          label: "oversized-command",
          command: "node -e \"process.stdout.write('" + marker + "\\n' + 'x'.repeat(" + (9 * MiB) + "))\"",
        }],
        queries: [marker],
        concurrency: 1,
      },
    }) as {
      content?: Array<{ type: string; text?: string }>;
      structuredContent?: { indexing?: Record<string, unknown> };
    };

    const text = (response.content ?? [])
      .filter((item) => item.type === "text")
      .map((item) => item.text ?? "")
      .join("\n");
    const indexing = response.structuredContent?.indexing as {
      status?: string;
      indexed_bytes?: number;
      dropped_bytes?: number;
      generated_chunks?: number;
      indexed_chunks?: number;
      dropped_chunks?: number;
    } | undefined;

    assert(indexing, "expected structuredContent.indexing");
    expect(indexing.status).toBe("partial");
    expect(indexing.indexed_bytes).toBe(8 * MiB);
    expect(indexing.dropped_bytes).toBeGreaterThan(0);
    expect(indexing.indexed_chunks).toBeGreaterThan(1_000);
    expect(indexing.generated_chunks).toBeGreaterThanOrEqual(indexing.indexed_chunks ?? 0);
    expect(indexing.dropped_chunks).toBeGreaterThan(0);

    expect(text).toMatch(/Indexing status: partially indexed/i);
    expect(text).toContain(marker);
    expect(text).toMatch(/Showing 50 of [\d,]+ sections; [\d,]+ omitted\./);

    const indexedSections = text.split("## Indexed Sections")[1]?.split(/\n## /)[0] ?? "";
    const displayedRows = indexedSections
      .split("\n")
      .filter((line) => /^- .+ \(\d+\.\dKB\)$/.test(line));
    expect(displayedRows).toHaveLength(50);
    expect(Buffer.byteLength(text, "utf8")).toBeLessThan(64 * 1024);
  } finally {
    await client.close();
    await server.server.close();
  }
}, 60_000);
