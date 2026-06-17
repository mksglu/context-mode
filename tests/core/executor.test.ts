import { describe, expect, test } from "vitest";
import {
  buildShellScriptContent,
  encodeShellScriptContent,
  PolyglotExecutor,
} from "../../src/executor.js";
import { detectRuntimes, type RuntimeMap } from "../../src/runtime.js";

describe("PowerShell script encoding", () => {
  test("writes PowerShell scripts as UTF-8 with BOM and UTF-8 output prelude", () => {
    const script = buildShellScriptContent("Write-Output 'ok'", undefined, "win32", "powershell.exe");
    const encoded = encodeShellScriptContent(script, "powershell.exe");

    expect(encoded.charCodeAt(0)).toBe(0xfeff);
    expect(encoded).toContain("$OutputEncoding = [System.Text.UTF8Encoding]::new($false)");
    expect(encoded).toContain("[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)");
  });

  test("leaves non-PowerShell Windows shells unchanged", () => {
    const script = "echo ok";

    expect(buildShellScriptContent(script, undefined, "win32", "cmd.exe")).toBe(script);
    expect(encodeShellScriptContent(script, "cmd.exe")).toBe(script);
  });

  test.skipIf(process.platform !== "win32")(
    "preserves non-ASCII stdout and cwd through Windows PowerShell",
    async () => {
      const text = "\u65E5\u672C\u8A9E caf\u00E9 \uD55C\uAE00 \u0639\u0631\u0628\u064A \u05E2\u05D1\u05E8\u05D9\u062A \u0395\u03BB\u03BB\u03B7\u03BD\u03B9\u03BA\u03AC \u0939\u093F\u0928\u094D\u0926\u0940 \u0E44\u0E17\u0E22";
      const cwd = process.cwd();
      const runtimes: RuntimeMap = { ...detectRuntimes(), shell: "powershell.exe" };
      const executor = new PolyglotExecutor({ runtimes });

      const result = await executor.execute({
        language: "shell",
        code: `$text = '${text}'\nWrite-Output $text\n(Get-Location).Path`,
        cwd,
        timeout: 10_000,
      });

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain(text);
      expect(result.stdout).toContain(cwd);
    },
  );
});
