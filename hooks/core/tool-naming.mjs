/**
 * Platform-aware MCP tool naming.
 * Each platform has its own convention for how MCP tool names appear to the LLM.
 *
 * Evidence-based naming conventions (from official docs):
 * | Platform           | Pattern                                                    |
 * |--------------------|------------------------------------------------------------|
 * | Claude Code (plugin) | mcp__plugin_context-mode_context-mode__<tool>             |
 * | Claude Code (standalone / MacPorts) | mcp__context-mode__<tool>              |
 * | Gemini CLI         | mcp__context-mode__<tool>                                  |
 * | Antigravity        | mcp__context-mode__<tool>                                  |
 * | Antigravity CLI    | context-mode/<tool>                                        |
 * | OpenCode           | context-mode_<tool>                                        |
 * | VS Code Copilot    | context-mode_<tool>                                        |
 * | Kiro               | @context-mode/<tool>                                       |
 * | Zed                | mcp:context-mode:<tool>                                    |
 * | Cursor / Codex / OpenClaw / Pi | bare <tool>                                    |
 */

const TOOL_PREFIXES = {
  // CLAUDE_PLUGIN_ROOT is set only when Claude Code manages hooks via its plugin system.
  // Standalone installs (MacPorts, npm global) write absolute-path hooks to settings.json
  // and register the MCP server as "context-mode" → prefix is mcp__context-mode__.
  "claude-code":    (tool) => process.env.CLAUDE_PLUGIN_ROOT
    ? `mcp__plugin_context-mode_context-mode__${tool}`
    : `mcp__context-mode__${tool}`,
  "gemini-cli":     (tool) => `mcp__context-mode__${tool}`,
  "antigravity":    (tool) => `mcp__context-mode__${tool}`,
  "antigravity-cli": (tool) => `context-mode/${tool}`,
  "opencode":       (tool) => `context-mode_${tool}`,
  "kilo":           (tool) => `context-mode_${tool}`,
  "vscode-copilot": (tool) => `context-mode_${tool}`,
  "jetbrains-copilot": (tool) => `context-mode_${tool}`,
  "copilot-cli":    (tool) => `context-mode_${tool}`,
  "kiro":           (tool) => `@context-mode/${tool}`,
  "zed":            (tool) => `mcp:context-mode:${tool}`,
  "cursor":         (tool) => tool,
  "codex":          (tool) => tool,
  "kimi":           (tool) => `mcp__context-mode__${tool}`,
  "openclaw":       (tool) => tool,
  "pi":             (tool) => tool,
  "qwen-code":      (tool) => `mcp__context-mode__${tool}`,
};

/**
 * Get the platform-specific MCP tool name for a bare tool name.
 * Falls back to claude-code convention if platform is unknown.
 */
export function getToolName(platform, bareTool) {
  const fn = TOOL_PREFIXES[platform] || TOOL_PREFIXES["claude-code"];
  return fn(bareTool);
}

/**
 * Create a namer function bound to a specific platform.
 * Returns (bareTool) => platformSpecificToolName.
 */
export function createToolNamer(platform) {
  return (bareTool) => getToolName(platform, bareTool);
}

/** List of all known platform IDs. */
export const KNOWN_PLATFORMS = Object.keys(TOOL_PREFIXES);
