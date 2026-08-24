/**
 * CONTEXT_MODE_TOOLS allow-list (issue #1031).
 *
 * When set (comma-separated tool names), only the listed ctx_* tools are
 * registered - skipping registration removes the tool schema + description
 * from the injected surface entirely (filtering a tools/list response would
 * not reclaim the bytes). Empty/unset => full registration (status quo).
 *
 * Pure module (no side effects) so tests can import the real implementation.
 */

export function parseContextModeToolsAllowlist(envValue: string | undefined): string[] {
  return (envValue ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isContextModeToolEnabled(name: string, allowlist: string[]): boolean {
  return allowlist.length === 0 || allowlist.includes(name);
}

export function readContextModeToolsAllowlist(): string[] {
  return parseContextModeToolsAllowlist(process.env.CONTEXT_MODE_TOOLS);
}
