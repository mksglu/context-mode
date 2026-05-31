import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", "..");

type SpawnResult = { code: number | null; elapsedMs: number; stdout: string; stderr: string };

function runReadStdin(modulePath: string, opts: { write?: string } = {}): Promise<SpawnResult> {
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
          "try {",
          "  const data = await mod.readStdin();",
          "  console.log(JSON.stringify({ ok: true, length: data.length }));",
          "} catch (err) {",
          "  console.error(err && err.message ? err.message : String(err));",
          "  process.exit(1);",
          "}",
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
    }, 1500);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", reject);
    child.on("exit", code => {
      clearTimeout(timeout);
      resolvePromise({ code, elapsedMs: Date.now() - started, stdout, stderr });
    });

    if (typeof opts.write === "string" && opts.write.length > 0) {
      // Write partial data WITHOUT closing the pipe. This reproduces clients
      // that stream partial JSON and then stall (issue #242 — Gemini AfterTool
      // >1MB tool_response) — silently truncating the buffer would corrupt
      // downstream JSON.parse, so the idle path MUST reject instead.
      child.stdin.write(opts.write);
    } else {
      // Intentionally keep stdin open with zero bytes — reproduces issue #639
      // (Bun re-exec EOF) and the original PR target (no data ever arrives).
      child.stdin.write("");
    }
  });
}

describe("hook readStdin idle timeout", () => {
  it("session helper readStdin exits when stdin remains open but idle", async () => {
    const result = await runReadStdin(resolve(ROOT, "hooks", "session-helpers.mjs"));

    expect(result.code).toBe(0);
    expect(result.elapsedMs).toBeLessThan(900);
    expect(JSON.parse(result.stdout)).toEqual({ ok: true, length: 0 });
  });

  it("core readStdin exits when stdin remains open but idle", async () => {
    const result = await runReadStdin(resolve(ROOT, "hooks", "core", "stdin.mjs"));

    expect(result.code).toBe(0);
    expect(result.elapsedMs).toBeLessThan(900);
    expect(JSON.parse(result.stdout)).toEqual({ ok: true, length: 0 });
  });

  // Partial-buffer correctness — see issue #242 (Gemini AfterTool >1MB
  // tool_response that arrives in chunks then stalls). Resolving with a
  // truncated buffer would silently corrupt downstream JSON.parse; the
  // contract MUST be: idle + buffered bytes => reject so the host sees a
  // visible non-zero exit instead of a parser SyntaxError on garbage.
  it("session helper readStdin rejects when partial data arrives and pipe stalls", async () => {
    const partial = '{"tool_response":"partial-without-closing-brace';
    const result = await runReadStdin(resolve(ROOT, "hooks", "session-helpers.mjs"), { write: partial });

    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(/stdin idle/);
    expect(result.stderr).toMatch(new RegExp(`${partial.length} bytes`));
  });

  it("core readStdin rejects when partial data arrives and pipe stalls", async () => {
    const partial = '{"tool_response":"partial-without-closing-brace';
    const result = await runReadStdin(resolve(ROOT, "hooks", "core", "stdin.mjs"), { write: partial });

    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(/stdin idle/);
    expect(result.stderr).toMatch(new RegExp(`${partial.length} bytes`));
  });
});
