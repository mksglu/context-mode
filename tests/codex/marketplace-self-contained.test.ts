import { strict as assert } from "node:assert";
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, test } from "vitest";

const REPO_ROOT = resolve(__dirname, "..", "..");

interface JsonRpcResponse {
  id?: number;
  result?: unknown;
  error?: { message?: string };
}

interface ToolListResult {
  tools?: Array<{ name?: string }>;
}

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function buildNpmPackDryRunInvocation(
  cacheDir: string,
  platform: NodeJS.Platform = process.platform,
): {
  command: string;
  args: string[];
  options: {
    cwd: string;
    encoding: BufferEncoding;
    env: NodeJS.ProcessEnv;
  };
} {
  const options = {
    cwd: REPO_ROOT,
    encoding: "utf8" as BufferEncoding,
    env: {
      ...process.env,
      npm_config_cache: cacheDir,
    },
  };

  if (platform === "win32") {
    return {
      command: "cmd.exe",
      args: ["/d", "/s", "/c", "npm pack --dry-run --json"],
      options,
    };
  }

  return {
    command: "npm",
    args: ["pack", "--dry-run", "--json"],
    options,
  };
}

function npmPackDryRunJson(cacheDir: string) {
  const invocation = buildNpmPackDryRunInvocation(cacheDir);
  return spawnSync(invocation.command, invocation.args, invocation.options);
}

function copyPackageArtifact(targetRoot: string): void {
  const pkg = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as {
    files?: string[];
  };

  cpSync(join(REPO_ROOT, "package.json"), join(targetRoot, "package.json"));

  for (const rel of pkg.files ?? []) {
    if (rel === "node_modules" || rel.startsWith("node_modules/")) continue;
    const source = join(REPO_ROOT, rel);
    if (!existsSync(source)) continue;
    const dest = join(targetRoot, rel);
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(source, dest, {
      recursive: true,
      dereference: false,
      filter: (candidate) => !candidate.split(/[\\/]/).includes("node_modules"),
    });
  }
}

function readCodexMcpCommand(pluginRoot: string): {
  command: string;
  args: string[];
  cwd: string;
} {
  const raw = JSON.parse(
    readFileSync(join(pluginRoot, ".codex-plugin", "mcp.json"), "utf8"),
  ) as {
    mcpServers?: Record<string, { command?: string; args?: string[]; cwd?: string }>;
  };
  const entry = raw.mcpServers?.["context-mode"];
  assert.ok(entry, "missing context-mode MCP entry");
  assert.equal(entry.command, "node");
  assert.deepEqual(entry.args, ["./.codex-plugin/plugin-start.mjs"]);
  assert.equal(entry.cwd, ".");
  return {
    command: entry.command,
    args: entry.args ?? [],
    cwd: resolve(pluginRoot, entry.cwd),
  };
}

function startMcpProcess(pluginRoot: string): ChildProcessWithoutNullStreams {
  const manifestCommand = readCodexMcpCommand(pluginRoot);
  const nodeDir = dirname(process.execPath);
  const storageDir = makeTempDir("context-mode-marketplace-storage-");
  return spawn(manifestCommand.command, manifestCommand.args, {
    cwd: manifestCommand.cwd,
    env: {
      PATH: nodeDir,
      CONTEXT_MODE_DIR: storageDir,
      CONTEXT_MODE_PROJECT_DIR: makeTempDir("context-mode-marketplace-project-"),
      HOME: makeTempDir("context-mode-marketplace-home-"),
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
}

function sendRpc(proc: ChildProcessWithoutNullStreams, message: Record<string, unknown>): void {
  proc.stdin.write(`${JSON.stringify(message)}\n`);
}

async function waitForResponse(
  proc: ChildProcessWithoutNullStreams,
  id: number,
  timeoutMs = 8_000,
): Promise<JsonRpcResponse> {
  let buffer = "";
  let stderr = "";

  return new Promise((resolvePromise, reject) => {
    const cleanup = (): void => {
      clearTimeout(timer);
      proc.stdout.off("data", onStdout);
      proc.stderr.off("data", onStderr);
      proc.off("exit", onExit);
    };

    const onStderr = (chunk: Buffer): void => {
      stderr += chunk.toString("utf8");
    };

    const onStdout = (chunk: Buffer): void => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        const parsed = JSON.parse(line) as JsonRpcResponse;
        if (parsed.id === id) {
          cleanup();
          resolvePromise(parsed);
          return;
        }
      }
    };

    const onExit = (code: number | null): void => {
      cleanup();
      reject(new Error(`MCP process exited before response ${id}: ${code}\n${stderr}`));
    };

    const timer = setTimeout(() => {
      cleanup();
      proc.kill("SIGKILL");
      reject(new Error(`Timed out waiting for response ${id}\n${stderr}`));
    }, timeoutMs);

    proc.stdout.on("data", onStdout);
    proc.stderr.on("data", onStderr);
    proc.on("exit", onExit);
  });
}

describe("Codex marketplace plugin startup", () => {
  test("uses a Windows-safe npm pack invocation", () => {
    const cacheDir = "C:\\Temp\\context mode npm cache";
    const invocation = buildNpmPackDryRunInvocation(cacheDir, "win32");

    assert.equal(invocation.command, "cmd.exe");
    assert.deepEqual(invocation.args, ["/d", "/s", "/c", "npm pack --dry-run --json"]);
    assert.equal(invocation.options.env?.npm_config_cache, cacheDir);
  });

  test("npm package includes the Codex bootstrap and vendor runtime files", () => {
    const cacheDir = makeTempDir("context-mode-npm-cache-");
    const result = npmPackDryRunJson(cacheDir);

    const spawnErr = result.error
      ? `${result.error.name}: ${result.error.message}`
      : "(none)";
    assert.equal(
      result.status,
      0,
      `npm pack failed: status=${String(result.status)} signal=${String(result.signal)} error=${spawnErr} stderr=${String(result.stderr)} stdout=${String(result.stdout)}`,
    );
    const [pack] = JSON.parse(result.stdout) as Array<{
      files: Array<{ path: string }>;
    }>;
    const files = new Set(pack.files.map((file) => file.path));

    assert.ok(files.has(".codex-plugin/plugin-start.mjs"));
    assert.ok(files.has(".codex-plugin/vendor/turndown.cjs"));
    assert.ok(files.has(".codex-plugin/vendor/turndown-plugin-gfm.cjs"));
    assert.ok(files.has("server.bundle.mjs"));
  });

  test("starts from .codex-plugin/mcp.json without node_modules or global context-mode", async () => {
    const pluginRoot = makeTempDir("context-mode-marketplace-plugin-");
    copyPackageArtifact(pluginRoot);

    assert.equal(existsSync(join(pluginRoot, "node_modules")), false);
    const proc = startMcpProcess(pluginRoot);
    try {
      sendRpc(proc, {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "codex-marketplace-self-contained-test", version: "0.0.0" },
        },
      });
      const init = await waitForResponse(proc, 1);
      assert.equal(init.error, undefined);

      sendRpc(proc, { jsonrpc: "2.0", method: "notifications/initialized", params: {} });
      sendRpc(proc, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
      const list = await waitForResponse(proc, 2);
      assert.equal(list.error, undefined);
      const result = list.result as ToolListResult;
      const toolNames = (result.tools ?? []).map((tool) => tool.name).filter(Boolean);
      assert.ok(toolNames.some((name) => name?.startsWith("ctx_")), "expected ctx_* tools");
    } finally {
      proc.kill("SIGKILL");
    }
  });

  test("fails fast with clear stderr when required bundle is missing", async () => {
    const pluginRoot = makeTempDir("context-mode-marketplace-plugin-missing-");
    copyPackageArtifact(pluginRoot);
    rmSync(join(pluginRoot, "server.bundle.mjs"), { force: true });

    const proc = startMcpProcess(pluginRoot);
    let stderr = "";
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    const exitCode = await new Promise<number | null>((resolveExit, reject) => {
      const timer = setTimeout(() => {
        proc.kill("SIGKILL");
        reject(new Error(`missing bundle probe timed out\n${stderr}`));
      }, 8_000);
      proc.on("exit", (code) => {
        clearTimeout(timer);
        resolveExit(code);
      });
    });

    assert.notEqual(exitCode, 0);
    assert.match(stderr, /CONTEXT_MODE_PARTIAL_INSTALL|server\.bundle\.mjs/);
  });
});
