/** #1255: exercise the real stdio handshake, not just detectPlatform(). */
import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { once } from "node:events";

type RpcResponse = {
  id?: number;
  error?: unknown;
  result?: { content?: Array<{ type: string; text?: string }> };
};

async function probe(clientName: string | null, delayed: boolean) {
  const root = mkdtempSync(join(tmpdir(), "context-mode-handshake-"));
  const home = join(root, "home");
  const project = join(root, "project");
  for (const dir of [
    project, join(home, ".claude"), join(home, ".gemini", "antigravity-cli"),
    join(home, ".gemini", "config"), join(home, ".local", "bin"),
    join(home, ".config", "opencode"),
  ]) mkdirSync(dir, { recursive: true });
  writeFileSync(join(home, ".local", "bin", "agy"), "");
  writeFileSync(join(home, ".gemini", "config", "mcp_config.json"), "{}");
  const child = spawn(process.execPath, [resolve("build/server.js")], {
    cwd: project,
    // Do not inherit agent identity/storage overrides from the test runner.
    env: {
      HOME: home, USERPROFILE: home, PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      APPDATA: join(home, ".config"), LOCALAPPDATA: join(home, ".local"),
      XDG_CONFIG_HOME: join(home, ".config"),
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const closed = once(child, "close");
  let stderr = "";
  let buffer = "";
  const responses = new Map<number, (msg: RpcResponse) => void>();
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      try {
        const msg = JSON.parse(line) as RpcResponse;
        if (msg.id !== undefined) {
          responses.get(msg.id)?.(msg);
          responses.delete(msg.id);
        }
      } catch { /* stderr is the only supported diagnostics channel */ }
    }
  });
  const request = (id: number, method: string, params: unknown) =>
    new Promise<RpcResponse>((resolveResponse, reject) => {
      const timer = setTimeout(() => reject(new Error(`RPC ${method} timed out: ${stderr}`)), 10_000);
      responses.set(id, (msg) => { clearTimeout(timer); resolveResponse(msg); });
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  try {
    if (delayed || clientName === null) {
      // The readiness sentinel proves connect() has completed. Wait a little
      // longer to catch the old post-connect adapter-selection/restore path.
      const sentinel = join(process.platform === "win32" ? tmpdir() : "/tmp", `context-mode-mcp-ready-${child.pid}`);
      const deadline = Date.now() + 10_000;
      while (!existsSync(sentinel) && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 20));
      }
      expect(existsSync(sentinel), stderr).toBe(true);
      await new Promise((r) => setTimeout(r, 250));
      expect(existsSync(join(home, ".gemini", "context-mode"))).toBe(false);
      expect(existsSync(join(home, ".config", "opencode", "context-mode"))).toBe(false);
    }
    if (clientName !== null) {
      const init = await request(1, "initialize", {
        protocolVersion: "2024-11-05", capabilities: {},
        clientInfo: { name: clientName, version: "test" },
      });
      expect(init.error).toBeUndefined();
      // Send notification and tool request back-to-back: the SDK does not
      // serialize them with async oninitialized work (adapter import).
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }) + "\n");
      const doctor = await request(2, "tools/call", { name: "ctx_doctor", arguments: {} });
      expect(doctor.error).toBeUndefined();
      const text = doctor.result?.content?.map((c) => c.text ?? "").join("\n") ?? "";
      const config = clientName === "opencode" ? join(home, ".config", "opencode") : join(home, ".gemini");
      for (const kind of ["sessions", "content", "stats"]) {
        const subdir = kind === "content" ? "content" : "sessions";
        expect(text).toContain(`Storage ${kind}: ${join(config, "context-mode", subdir)} (default)`);
      }
      if (clientName === "opencode") {
        expect(text).not.toContain("Antigravity CLI hooks");
        expect(stderr).toContain("MCP client: opencode vtest → opencode");
      }
    }
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
    const killTimer = setTimeout(() => child.kill("SIGKILL"), 5_000);
    await closed;
    clearTimeout(killTimer);
    try {
      // Stats flush on shutdown must also use the handshake-selected store,
      // and exiting before initialization must not write to a guessed store.
      if (clientName === "opencode" || clientName === null) {
        expect(existsSync(join(home, ".gemini", "context-mode"))).toBe(false);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
}

describe("MCP platform selection waits for clientInfo (#1255)", () => {
  it.each([false, true])("uses OpenCode storage with delayed=%s despite foreign home markers", async (delayed) => {
    await probe("opencode", delayed);
  });
  it("preserves the filesystem fallback for an unknown client", async () => {
    await probe("unknown-xyz", true);
  });
  it("does not write guessed-platform stats when stopped before initialize", async () => {
    await probe(null, true);
  });
});
