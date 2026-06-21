import { describe, expect, test } from "vitest";
import {
  buildPowerShellScriptContent,
  PolyglotExecutor,
} from "../../src/executor.js";
import { detectRuntimes, type RuntimeMap } from "../../src/runtime.js";

describe("PowerShell script encoding", () => {
  test("prefixes a UTF-8 BOM ahead of the UTF-8 encoding prelude", () => {
    const script = buildPowerShellScriptContent("Write-Output 'ok'");

    // Windows PowerShell 5.1 only reliably detects a script as UTF-8 when the
    // file opens with a BOM; without it the body is read as the ANSI code page.
    expect(script.charCodeAt(0)).toBe(0xfeff);
    expect(script).toContain("[Console]::InputEncoding = [System.Text.UTF8Encoding]::new()");
    expect(script).toContain("[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()");
    expect(script).toContain("$OutputEncoding = [System.Text.UTF8Encoding]::new()");
    expect(script.endsWith("Write-Output 'ok'")).toBe(true);
  });

  test.skipIf(process.platform !== "win32")(
    "preserves non-ASCII stdout and cwd through Windows PowerShell",
    async () => {
      const text = "日本語 café 한글 عربي עבריت Ελληνικά हिन्दी ไทย";
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
