import "../setup-home";
/**
 * Integration — Pi non-agent CLI paths leave no orphan MCP child (#534/#809).
 *
 * End-to-end harness: simulates the conditions of `pi --help`, `pi install`,
 * and `pi list` by importing the Pi extension with matching `process.argv` and
 * observing that no MCP child gets spawned. The companion contract is that,
 * even if a child had been spawned by an earlier code path, the bridge-child
 * lifecycle guard (slice 2) catches a dead parent within ~1 s and the stdin-EOF
 * assist (slice 3) collapses the window further.
 *
 * Mechanism under test:
 *   - `piExtension(pi)` is import-time-invoked by Pi's extension loader.
 *   - For help/version/list-models and package/config commands, Pi does not
 *     start a real agent session; `bootstrapMCPTools()` MUST NOT have been called.
 *   - Therefore: zero `MCPStdioClient` instances are constructed, zero
 *     server.bundle.mjs spawns, zero orphan candidates exist.
 *
 * Note: we don't actually exec a real Pi binary here (slow, platform-coupled,
 * not in CI). The "no orphan" claim is enforced by asserting no child spawn
 * happened, which is the precondition for an orphan to exist.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let scratch: string;
let originalArgv: string[];

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "ctx-pi-orphan-"));
  originalArgv = process.argv;
  vi.resetModules();
});

afterEach(() => {
  process.argv = originalArgv;
  try {
    rmSync(scratch, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
  delete process.env.PI_PROJECT_DIR;
  delete process.env.CLAUDE_PROJECT_DIR;
});

function createMockPi() {
  return {
    on: vi.fn(),
    registerCommand: vi.fn(),
    registerTool: vi.fn(),
    sendMessage: vi.fn(),
  };
}

describe("Integration — Pi non-agent argv leaves zero orphan candidates (#534/#809)", () => {
  async function runExtension(argv: string[]) {
    process.argv = ["/usr/bin/pi", "pi-coding-agent", ...argv];
    process.env.PI_PROJECT_DIR = scratch;
    process.env.CLAUDE_PROJECT_DIR = scratch;

    const bridgeMod = await import("../../src/adapters/pi/mcp-bridge.js");
    // Spy on `start()` — that's where `spawn()` happens. Mock bootstrap so a
    // regression fails without starting a real bridge child in CI.
    const startSpy = vi.spyOn(bridgeMod.MCPStdioClient.prototype, "start");
    const bootstrapSpy = vi
      .spyOn(bridgeMod, "bootstrapMCPTools")
      .mockResolvedValue({
        tools: [],
        shutdown: () => {},
        client: { _spawnEnv: null } as unknown as InstanceType<
          typeof bridgeMod.MCPStdioClient
        >,
      });

    const extMod = await import("../../src/adapters/pi/extension.js");
    const pi = createMockPi();
    extMod.default(pi);
    await extMod._mcpBridgeReady;

    return { startSpy, bootstrapSpy };
  }

  it.each([
    ["--help"],
    ["--version"],
    ["help"],
    ["--list-models"],
    ["install", "npm:context-mode"],
    ["install", "--help"],
    ["list"],
    ["remove", "npm:context-mode"],
    ["uninstall", "npm:context-mode"],
    ["update"],
    ["config"],
  ])("no MCPStdioClient is constructed under `pi %s`", async (...argv) => {
    const { startSpy, bootstrapSpy } = await runExtension(argv);

    expect(bootstrapSpy).not.toHaveBeenCalled();
    expect(startSpy).not.toHaveBeenCalled();

    startSpy.mockRestore();
    bootstrapSpy.mockRestore();
  });
});
