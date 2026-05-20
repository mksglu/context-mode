import { strict as assert } from "node:assert";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, test } from "vitest";
import { probeCodexPluginMcp } from "../../src/util/codex-plugin-mcp-probe.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tempPluginRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "context-mode-codex-probe-"));
  tempDirs.push(root);
  mkdirSync(join(root, ".codex-plugin"), { recursive: true });
  return root;
}

function writeManifest(root: string, scriptName: string): void {
  writeFileSync(
    join(root, ".codex-plugin", "mcp.json"),
    JSON.stringify(
      {
        mcpServers: {
          "context-mode": {
            command: process.execPath,
            args: [`./${scriptName}`],
            cwd: ".",
          },
        },
      },
      null,
      2,
    ),
  );
}

function writeFakeMcp(root: string, scriptName: string, tools: string[]): void {
  writeFileSync(
    join(root, scriptName),
    `
let buffer = "";
process.stdin.on("data", (chunk) => {
  buffer += chunk.toString("utf8");
  const lines = buffer.split(/\\r?\\n/);
  buffer = lines.pop() ?? "";
  for (const line of lines) {
    if (!line.trim()) continue;
    const message = JSON.parse(line);
    if (message.method === "initialize") {
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: message.id, result: { protocolVersion: "2024-11-05", capabilities: {}, serverInfo: { name: "fake", version: "0.0.0" } } }) + "\\n");
    }
    if (message.method === "tools/list") {
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: message.id, result: { tools: ${JSON.stringify(
        tools.map((name) => ({ name })),
      )} } }) + "\\n");
    }
  }
});
`,
  );
}

describe("probeCodexPluginMcp", () => {
  test("passes when manifest command returns ctx tools", async () => {
    const root = tempPluginRoot();
    writeManifest(root, "fake-mcp.mjs");
    writeFakeMcp(root, "fake-mcp.mjs", ["ctx_search", "ctx_execute"]);

    const result = await probeCodexPluginMcp(root, 3_000);

    assert.equal(result.ok, true);
    assert.match(result.message, /ctx_\* tools/);
    assert.deepEqual(result.toolNames, ["ctx_search", "ctx_execute"]);
  });

  test("fails when tools/list returns no ctx tools", async () => {
    const root = tempPluginRoot();
    writeManifest(root, "fake-mcp.mjs");
    writeFakeMcp(root, "fake-mcp.mjs", ["other_tool"]);

    const result = await probeCodexPluginMcp(root, 3_000);

    assert.equal(result.ok, false);
    assert.match(result.message, /no ctx_\* tools/);
  });
});
