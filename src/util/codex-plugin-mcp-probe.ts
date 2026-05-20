import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

interface CodexMcpManifest {
  mcpServers?: Record<string, {
    command?: string;
    args?: string[];
    cwd?: string;
  }>;
}

interface JsonRpcResponse {
  id?: number;
  result?: unknown;
  error?: { message?: string };
}

interface ToolListResult {
  tools?: Array<{ name?: string }>;
}

export interface CodexPluginMcpProbeResult {
  ok: boolean;
  command: string;
  cwd: string;
  toolNames: string[];
  message: string;
  stderr?: string;
}

function stderrTail(stderr: string): string {
  return stderr.trim().slice(-2_000);
}

function readManifestCommand(pluginRoot: string): {
  command: string;
  args: string[];
  cwd: string;
} {
  const manifestPath = resolve(pluginRoot, ".codex-plugin", "mcp.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`Missing ${manifestPath}`);
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as CodexMcpManifest;
  const entry = manifest.mcpServers?.["context-mode"];
  if (!entry?.command) {
    throw new Error(`Missing mcpServers.context-mode.command in ${manifestPath}`);
  }

  return {
    command: entry.command,
    args: entry.args ?? [],
    cwd: resolve(pluginRoot, entry.cwd ?? "."),
  };
}

function sendRpc(proc: ChildProcessWithoutNullStreams, message: Record<string, unknown>): void {
  proc.stdin.write(`${JSON.stringify(message)}\n`);
}

function waitForResponse(
  proc: ChildProcessWithoutNullStreams,
  id: number,
  stderrRef: { value: string },
  timeoutMs: number,
): Promise<JsonRpcResponse> {
  let stdout = "";

  return new Promise<JsonRpcResponse>((resolvePromise, reject) => {
    const cleanup = (): void => {
      clearTimeout(timer);
      proc.stdout.off("data", onStdout);
      proc.off("exit", onExit);
      proc.off("error", onError);
    };

    const onStdout = (chunk: Buffer): void => {
      stdout += chunk.toString("utf8");
      const lines = stdout.split(/\r?\n/);
      stdout = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        let parsed: JsonRpcResponse;
        try {
          parsed = JSON.parse(line) as JsonRpcResponse;
        } catch {
          continue;
        }
        if (parsed.id === id) {
          cleanup();
          resolvePromise(parsed);
          return;
        }
      }
    };

    const onExit = (code: number | null): void => {
      cleanup();
      reject(new Error(`process exited before response ${id}: ${code}`));
    };

    const onError = (err: Error): void => {
      cleanup();
      reject(err);
    };

    const timer = setTimeout(() => {
      cleanup();
      proc.kill("SIGKILL");
      reject(new Error(`timed out waiting for response ${id}`));
    }, timeoutMs);

    proc.stdout.on("data", onStdout);
    proc.once("exit", onExit);
    proc.once("error", onError);
  }).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    const stderr = stderrTail(stderrRef.value);
    throw new Error(stderr ? `${message}: ${stderr}` : message);
  });
}

export async function probeCodexPluginMcp(
  pluginRoot: string,
  timeoutMs = 10_000,
): Promise<CodexPluginMcpProbeResult> {
  let manifestCommand: { command: string; args: string[]; cwd: string };
  try {
    manifestCommand = readManifestCommand(pluginRoot);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, command: "", cwd: pluginRoot, toolNames: [], message };
  }

  const tempHome = mkdtempSync(resolve(tmpdir(), "context-mode-codex-doctor-home-"));
  const tempStorage = mkdtempSync(resolve(tmpdir(), "context-mode-codex-doctor-storage-"));
  const stderrRef = { value: "" };
  const proc = spawn(manifestCommand.command, manifestCommand.args, {
    cwd: manifestCommand.cwd,
    env: {
      ...process.env,
      HOME: tempHome,
      USERPROFILE: tempHome,
      CONTEXT_MODE_DIR: tempStorage,
      CONTEXT_MODE_PROJECT_DIR: manifestCommand.cwd,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });

  proc.stderr.on("data", (chunk: Buffer) => {
    stderrRef.value += chunk.toString("utf8");
  });

  try {
    sendRpc(proc, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "context-mode-doctor", version: "0.0.0" },
      },
    });
    const init = await waitForResponse(proc, 1, stderrRef, timeoutMs);
    if (init.error) {
      throw new Error(init.error.message ?? "initialize failed");
    }

    sendRpc(proc, { jsonrpc: "2.0", method: "notifications/initialized", params: {} });
    sendRpc(proc, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    const list = await waitForResponse(proc, 2, stderrRef, timeoutMs);
    if (list.error) {
      throw new Error(list.error.message ?? "tools/list failed");
    }

    const result = list.result as ToolListResult;
    const toolNames = (result.tools ?? [])
      .map((tool) => tool.name)
      .filter((name): name is string => typeof name === "string");
    const ctxTools = toolNames.filter((name) => name.startsWith("ctx_"));
    if (ctxTools.length === 0) {
      throw new Error("tools/list returned no ctx_* tools");
    }

    return {
      ok: true,
      command: [manifestCommand.command, ...manifestCommand.args].join(" "),
      cwd: manifestCommand.cwd,
      toolNames,
      message: `tools/list returned ${ctxTools.length} ctx_* tools`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      command: [manifestCommand.command, ...manifestCommand.args].join(" "),
      cwd: manifestCommand.cwd,
      toolNames: [],
      message,
      stderr: stderrTail(stderrRef.value),
    };
  } finally {
    proc.kill("SIGKILL");
    rmSync(tempHome, { recursive: true, force: true });
    rmSync(tempStorage, { recursive: true, force: true });
  }
}
