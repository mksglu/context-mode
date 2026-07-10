import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const WINDOWS_OVERLAY_PATH = fileURLToPath(
  new URL("../../configs/codex/AGENTS.windows.md", import.meta.url),
);

function hasLegacyWindowsGuidance(content) {
  if (typeof content !== "string") return false;

  return /^## Windows notes\s*$/m.test(content)
    && content.includes("**PowerShell cmdlets**")
    && content.includes("/mnt/<letter>/");
}

export function getCodexPlatformOverlay({
  platform = process.platform,
  existingInstructionContents = [],
  overlayPath = WINDOWS_OVERLAY_PATH,
} = {}) {
  if (platform !== "win32") return "";

  if (Array.isArray(existingInstructionContents)
    && existingInstructionContents.some(hasLegacyWindowsGuidance)) {
    return "";
  }

  try {
    return readFileSync(overlayPath, "utf8").trim();
  } catch {
    // Platform guidance is additive; never break SessionStart if it is unavailable.
    return "";
  }
}
