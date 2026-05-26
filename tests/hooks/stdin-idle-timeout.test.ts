import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", "..");

function readWithOpenStdin(modulePath: string): Promise<{ code: number | null; elapsedMs: number; stdout: string; stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    const started = Date.now();
    const child = spawn(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        [
          "import { pathToFileURL } from 'node:url';",
          "const mod = await import(pathToFileURL(process.env.HOOK_STDIN_MODULE).href);",
          "const data = await mod.readStdin();",
          "console.log(JSON.stringify({ length: data.length }));",
        ].join("\n"),
      ],
      {
        env: {
          ...process.env,
          CONTEXT_MODE_HOOK_STDIN_IDLE_MS: "50",
          HOOK_STDIN_MODULE: modulePath,
        },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("child did not exit while stdin pipe stayed open"));
    }, 1000);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", reject);
    child.on("exit", code => {
      clearTimeout(timeout);
      resolvePromise({ code, elapsedMs: Date.now() - started, stdout, stderr });
    });

    // Intentionally keep stdin open. This reproduces clients that spawn hook
    // commands without promptly closing the pipe.
    child.stdin.write("");
  });
}

describe("hook readStdin idle timeout", () => {
  it("session helper readStdin exits when stdin remains open but idle", async () => {
    const result = await readWithOpenStdin(resolve(ROOT, "hooks", "session-helpers.mjs"));

    expect(result.code).toBe(0);
    expect(result.elapsedMs).toBeLessThan(900);
    expect(JSON.parse(result.stdout)).toEqual({ length: 0 });
  });

  it("core readStdin exits when stdin remains open but idle", async () => {
    const result = await readWithOpenStdin(resolve(ROOT, "hooks", "core", "stdin.mjs"));

    expect(result.code).toBe(0);
    expect(result.elapsedMs).toBeLessThan(900);
    expect(JSON.parse(result.stdout)).toEqual({ length: 0 });
  });
});
