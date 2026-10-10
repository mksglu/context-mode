/**
 * #1028 — PreCompact resume snapshots must use platform-specific ctx_search
 * tool names, not the bare default.
 */

import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createToolNamer, KNOWN_PLATFORMS } from "../../hooks/core/tool-naming.mjs";
import { buildResumeSnapshot, type StoredEvent } from "../../src/session/snapshot.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");

const HOOKS: Array<{ path: string; platform: string }> = [
  { path: "hooks/precompact.mjs", platform: "claude-code" },
  { path: "hooks/codex/precompact.mjs", platform: "codex" },
  { path: "hooks/kimi/precompact.mjs", platform: "kimi" },
  { path: "hooks/vscode-copilot/precompact.mjs", platform: "vscode-copilot" },
  { path: "hooks/gemini-cli/precompress.mjs", platform: "gemini-cli" },
  { path: "hooks/jetbrains-copilot/precompact.mjs", platform: "jetbrains-copilot" },
  { path: "hooks/copilot-cli/precompact.mjs", platform: "copilot-cli" },
];

const sampleEvents: StoredEvent[] = [
  {
    type: "file_edit",
    category: "file",
    data: "src/server.ts",
    priority: 1,
    created_at: "2026-07-27T00:00:00Z",
  },
  {
    type: "decision",
    category: "decision",
    data: "use FTS5 for retrieval",
    priority: 1,
    created_at: "2026-07-27T00:00:01Z",
  },
];

describe("PreCompact searchTool wiring (#1028)", () => {
  test("hook sources pass searchTool into buildResumeSnapshot", () => {
    for (const { path } of HOOKS) {
      const src = readFileSync(join(ROOT, path), "utf-8");
      expect(src, path).toMatch(/createToolNamer/);
      expect(src, path).toMatch(/searchTool/);
      expect(src, path).toMatch(/buildResumeSnapshot\([\s\S]*searchTool/s);
    }
  });

  test("opencode plugin passes platform searchTool into buildResumeSnapshot", () => {
    const src = readFileSync(
      join(ROOT, "src/adapters/opencode/plugin.ts"),
      "utf-8",
    );
    expect(src).toMatch(/searchTool:\s*toolNamer\("ctx_search"\)/);
  });

  test("platform-prefixed snapshot omits bare ctx_search when prefixed", () => {
    const opencodeTool = createToolNamer("opencode")("ctx_search");
    expect(opencodeTool).toBe("context-mode_ctx_search");

    const snap = buildResumeSnapshot(sampleEvents, {
      compactCount: 1,
      searchTool: opencodeTool,
    });

    expect(snap).toContain("context-mode_ctx_search(");
    expect(snap).not.toMatch(/\bctx_search\(/);
  });

  test("13 of 17 known platforms differ from bare ctx_search", () => {
    const differ = KNOWN_PLATFORMS.filter(
      (p) => createToolNamer(p)("ctx_search") !== "ctx_search",
    );
    expect(differ.length).toBe(13);
  });
});
