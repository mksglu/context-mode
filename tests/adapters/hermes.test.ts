import "../setup-home";
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { delimiter, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const pluginDir = resolve(__dirname, "../../.hermes-plugin");
const configDir = resolve(__dirname, "../../configs/hermes");
const probe = resolve(__dirname, "hermes_probe.py");

function findPython(): string {
  const candidates = process.env.PYTHON
    ? [process.env.PYTHON]
    : process.platform === "win32"
      ? ["python", "py"]
      : ["python3", "python"];
  for (const candidate of candidates) {
    const args = candidate === "py" ? ["-3", "--version"] : ["--version"];
    const result = spawnSync(candidate, args, { encoding: "utf8" });
    if (!result.error && result.status === 0) return candidate;
  }
  throw new Error(
    `Hermes adapter tests require Python. PATH entries: ${process.env.PATH?.split(delimiter).length ?? 0}`,
  );
}

function runProbe(input: Record<string, unknown>): unknown {
  const python = findPython();
  const args = python === "py" ? ["-3", probe] : [probe];
  const result = spawnSync(python, args, {
    input: JSON.stringify(input),
    encoding: "utf8",
    timeout: 15_000,
  });
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout.trim());
}

describe("Hermes plugin package", () => {
  it("ships a manifest, register function, docs, and fallback instructions", () => {
    const manifest = readFileSync(resolve(pluginDir, "plugin.yaml"), "utf8");
    const implementation = readFileSync(resolve(pluginDir, "__init__.py"), "utf8");
    const packageJson = JSON.parse(
      readFileSync(resolve(__dirname, "../../package.json"), "utf8"),
    ) as { files: string[] };
    expect(manifest).toMatch(/^name:\s*hermes-context-mode$/m);
    expect(manifest).toContain("on_session_finalize");
    expect(implementation).toContain("def register(ctx:");
    expect(packageJson.files).toContain(".hermes-plugin");
    expect(existsSync(resolve(pluginDir, "README.md"))).toBe(true);
    expect(existsSync(resolve(configDir, "AGENTS.md"))).toBe(true);
  });
});

describe("Hermes hook behavior", () => {
  it("blocks a disallowed high-output command with Hermes' block schema", () => {
    expect(runProbe({ operation: "pre_tool_call", command: "curl https://example.com" }))
      .toMatchObject({ action: "block", message: expect.any(String) });
  });

  it("allows a bounded command", () => {
    expect(runProbe({ operation: "pre_tool_call", command: "git status" })).toBeNull();
  });

  it("injects current MCP guidance on the first turn", () => {
    const result = runProbe({ operation: "guidance_sequence" }) as {
      first: { context: string } | null;
    };
    expect(result.first?.context).toContain("mcp__context_mode__ctx_execute");
  });

  it("does not reinject guidance on later or repeated turns", () => {
    const result = runProbe({ operation: "guidance_sequence" }) as {
      later: unknown;
      repeated: unknown;
    };
    expect(result.later).toBeNull();
    expect(result.repeated).toBeNull();
  });
});
