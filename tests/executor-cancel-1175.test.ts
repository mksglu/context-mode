import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PolyglotExecutor } from "../src/executor.js";
import { detectRuntimes } from "../src/runtime.js";

describe("PolyglotExecutor — abort signal kills the sandbox process tree (#1175)", () => {
  const scratch = join(tmpdir(), `ctx-exec-cancel-${process.pid}`);
  let markerPath: string;

  beforeAll(() => {
    markerPath = join(scratch, "natural-exit-marker");
  });

  afterAll(() => {
    rmSync(scratch, { recursive: true, force: true });
  });

  it("resolves promptly and the sandbox child is killed when the signal aborts", async () => {
    const executor = new PolyglotExecutor({
      runtimes: detectRuntimes(),
      projectRoot: process.cwd(),
    });
    const ac = new AbortController();
    const t0 = Date.now();
    const p = executor.execute({
      language: "shell",
      code: `sleep 30 && touch ${markerPath}`,
      signal: ac.signal,
    });
    setTimeout(() => ac.abort(), 1000);

    const result = await p;
    const elapsed = Date.now() - t0;

    expect(elapsed).toBeLessThan(10_000);
    expect(result.exitCode).not.toBe(0);
    expect(result.timedOut).toBe(false);
    expect(existsSync(markerPath)).toBe(false);
  });
});
