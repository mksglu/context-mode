// D-WIN-VSCODE-MCP-1: where VS Code keeps the user-profile mcp.json, for e2e checks (no src/ import, GS4).
// Rule of microsoft/vscode userDataPath.ts: win32 %APPDATA% (else <home>\AppData\Roaming), darwin
// <home>/Library/Application Support, other $XDG_CONFIG_HOME (else <home>/.config); then Code/User.
import path from "node:path";

export function vscodeMcpFile(home, env = process.env, platform = process.platform) {
  const base = platform === "win32" ? (env.APPDATA || path.join(home, "AppData", "Roaming"))
    : platform === "darwin" ? path.join(home, "Library", "Application Support")
    : (env.XDG_CONFIG_HOME || path.join(home, ".config"));
  return path.join(base, "Code", "User", "mcp.json");
}
