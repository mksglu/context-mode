/**
 * adapters/client-map — MCP clientInfo.name → PlatformId mapping.
 *
 * Source: Apify MCP Client Capabilities Registry
 * https://github.com/apify/mcp-client-capabilities
 *
 * Only includes platforms we have adapters for.
 */

import type { PlatformId } from "./types.js";

export const CLIENT_NAME_TO_PLATFORM: Record<string, PlatformId> = {
  "claude-code": "claude-code",
  "gemini-cli-mcp-client": "gemini-cli",
  "antigravity-client": "antigravity",
  "antigravity-cli": "antigravity-cli",
  "agy": "antigravity-cli",
  "cursor-vscode": "cursor",
  "Visual-Studio-Code": "vscode-copilot",
  "copilot-cli": "copilot-cli",
  "GitHub Copilot CLI": "copilot-cli",
  "github-copilot-cli": "copilot-cli",
  "JetBrains Client": "jetbrains-copilot",
  "IntelliJ IDEA": "jetbrains-copilot",
  "PyCharm": "jetbrains-copilot",
  "Codex": "codex",
  "codex-mcp-client": "codex",
  "Kilo Code": "kilo",
  "Kiro CLI": "kiro",
  "Pi CLI": "pi",
  "Pi Coding Agent": "pi",
  // Issue #542 — Pi rebranded to OMP. Upstream
  // refs/platforms/oh-my-pi/packages/coding-agent/src/mcp/client.ts:46-49
  // ships clientInfo.name = "omp-coding-agent". Resolved to the OMP
  // adapter (~/.omp/, PI_CODING_AGENT_DIR). Legacy "Pi CLI" /
  // "Pi Coding Agent" entries above still resolve to the pi adapter.
  "omp-coding-agent": "omp",
  "Zed": "zed",
  "zed": "zed",
  "qwen-code": "qwen-code",
  "qwen-cli-mcp-client": "qwen-code",
  "kimi-code": "kimi",
  "kimi": "kimi",
  "Kimi Code": "kimi",
  // Mistral Vibe (https://github.com/mistralai/mistral-vibe) does not
  // override the MCP SDK's DEFAULT_CLIENT_INFO — its ClientSession is
  // created without a client_info argument (vibe/core/tools/mcp/tools.py),
  // so the wire clientInfo.name is the SDK's default "mcp". That name is
  // too generic to safely map to a platform, so Vibe detection relies on
  // $VIBE_HOME env var or ~/.vibe/ directory instead (see detect.ts).
  // These entries are placeholders that will match if Vibe ever ships a
  // proper client_info; harmless today because the wire value is "mcp".
  "mistral-vibe": "mistral-vibe",
  "Mistral Vibe": "mistral-vibe",
  "vibe": "mistral-vibe",
};
