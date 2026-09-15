import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

export const CODEX_SANDBOX_STATE_META_CAPABILITY = "codex/sandbox-state-meta";
export const CODEX_MCP_CLIENT_NAME = "codex-mcp-client";

export type McpToolRequestExtra = {
  _meta?: Record<string, unknown>;
};

export type CodexFileReadDecision = "allow" | "deny" | "unavailable";

export interface CodexSandboxProbeResult {
  status: number | null;
  error?: Error;
}

export type CodexSandboxProbeRunner = (
  command: string,
  args: string[],
  options: {
    cwd: string;
    stdio: "ignore";
    timeout: number;
  },
) => CodexSandboxProbeResult;

const READ_PROBE =
  'const fs=require("node:fs");' +
  'const fd=fs.openSync(process.argv[1],"r");' +
  'fs.closeSync(fd);';

/**
 * Return the live SandboxState only when it came from the real Codex MCP
 * client. The metadata key alone is not an origin signal: another MCP
 * client can send arbitrary request `_meta`.
 */
export function getCodexSandboxStateFromRequest(
  extra: McpToolRequestExtra | undefined,
  clientName: string | undefined,
): Record<string, unknown> | undefined {
  if (clientName !== CODEX_MCP_CLIENT_NAME) return undefined;

  const meta = extra?._meta;
  if (!meta || typeof meta !== "object") return undefined;

  const state = meta[CODEX_SANDBOX_STATE_META_CAPABILITY];
  if (!state || typeof state !== "object" || Array.isArray(state)) return undefined;

  return state as Record<string, unknown>;
}

/**
 * Delegate one file-open permission decision to Codex's own sandbox engine.
 *
 * The probe opens the target read-only and immediately closes it; no source
 * bytes are consumed, copied, returned, indexed, or truncated.
 *
 * Managed and disabled profiles can be recreated locally. External profiles
 * rely on an outer sandbox that Context Mode cannot reproduce, so those fall
 * back to the existing #852 containment policy rather than guessing.
 */
export function probeCodexFileRead(opts: {
  sandboxState: Record<string, unknown>;
  filePath: string;
  projectDir: string;
  platform?: NodeJS.Platform;
  codexBinary?: string;
  nodeBinary?: string;
  runner?: CodexSandboxProbeRunner;
}): CodexFileReadDecision {
  const hostPlatform = opts.platform ?? process.platform;
  if (hostPlatform !== "darwin" && hostPlatform !== "linux" && hostPlatform !== "win32") {
    return "unavailable";
  }

  const permissionProfile = opts.sandboxState.permissionProfile;
  if (!permissionProfile || typeof permissionProfile !== "object" || Array.isArray(permissionProfile)) {
    return "unavailable";
  }

  const profileType = (permissionProfile as Record<string, unknown>).type;
  if (profileType !== "managed" && profileType !== "disabled") {
    return "unavailable";
  }

  let sandboxStateJson: string;
  try {
    sandboxStateJson = JSON.stringify(opts.sandboxState);
  } catch {
    return "unavailable";
  }

  const target = resolve(opts.projectDir, opts.filePath);
  const codexBinary = opts.codexBinary ?? "codex";
  const nodeBinary = opts.nodeBinary ?? process.execPath;
  const runner: CodexSandboxProbeRunner =
    opts.runner ??
    ((command, args, options) => spawnSync(command, args, options));

  try {
    const result = runner(
      codexBinary,
      [
        "sandbox",
        "--sandbox-state-json",
        sandboxStateJson,
        "--",
        nodeBinary,
        "-e",
        READ_PROBE,
        target,
      ],
      {
        cwd: opts.projectDir,
        stdio: "ignore",
        timeout: 10_000,
      },
    );

    if (result.error || result.status === null) return "unavailable";
    return result.status === 0 ? "allow" : "deny";
  } catch {
    return "unavailable";
  }
}
