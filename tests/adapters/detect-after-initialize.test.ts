/**
 * Detection after MCP initialize handshake.
 *
 * server.connect() returns before initialize completes, so
 * getClientVersion() is empty on that path. Detect MUST wait for
 * server.server.oninitialized so omp-coding-agent clientInfo wins
 * over ~/.claude config-dir fallback.
 *
 * Source-text inspection (same pattern as ctx-upgrade-platform-threading.test.ts).
 */
import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
const serverSrc = readFileSync(resolve(ROOT, "src", "server.ts"), "utf-8");

const mainIdx = serverSrc.indexOf("async function main()");
const mainBody = serverSrc.slice(mainIdx);

describe("main() defers adapter detect until initialize handshake", () => {
  test("does not call getClientVersion immediately after connect", () => {
    const connectIdx = mainBody.indexOf("await server.connect(transport)");
    expect(connectIdx).toBeGreaterThan(-1);
    const afterConnect = mainBody.slice(connectIdx, connectIdx + 2500);
    expect(afterConnect).not.toMatch(/getClientVersion\(\)/);
  });

  test("detects from oninitialized after handshake", () => {
    expect(mainBody).toMatch(/server\.server\.oninitialized\s*=/);
    expect(mainBody).toMatch(/oninitialized[\s\S]{0,800}getClientVersion\(\)/);
    expect(mainBody).toMatch(/oninitialized[\s\S]{0,1200}detectPlatform\(/);
  });
});
