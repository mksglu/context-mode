/**
 * The resume snapshot tells the agent which tool to call to recover detail.
 * That name is platform-specific (`mcp__plugin_context-mode_context-mode__ctx_search`
 * on Claude Code, `context-mode_ctx_search` on VS Code Copilot, bare `ctx_search`
 * on Codex), so every precompact hook must pass its OWN platform's namer.
 *
 * A missing argument is silent: `buildResumeSnapshot` falls back to `"ctx_search"`,
 * which is a tool that does not exist in those sessions. The snapshot then hands
 * the model a search call it cannot make, right after a compaction — exactly when
 * it has no other way to recover the session.
 *
 * Two halves:
 *   1. behaviour: the name handed in is the name that reaches the output.
 *   2. pairing: each hook declares the platform its own path implies, so a hook
 *      copied/renamed cannot keep another platform's prefix.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildResumeSnapshot,
  type StoredEvent,
} from "../../src/session/snapshot.js";
import { createToolNamer } from "../../hooks/core/tool-naming.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const hooksDir = join(here, "..", "..", "hooks");

/** Hook file (relative to hooks/) → the platform its path implies. */
const HOOK_PLATFORM: Record<string, string> = {
  "precompact.mjs": "claude-code",
  "codex/precompact.mjs": "codex",
  "copilot-cli/precompact.mjs": "copilot-cli",
  "gemini-cli/precompress.mjs": "gemini-cli",
  "jetbrains-copilot/precompact.mjs": "jetbrains-copilot",
  "kimi/precompact.mjs": "kimi",
  "vscode-copilot/precompact.mjs": "vscode-copilot",
};

const events: StoredEvent[] = [
  { type: "file_edit", category: "file", data: "src/app.ts", priority: 1 },
  {
    type: "error",
    category: "error",
    data: "TypeError: x is not a function",
    priority: 1,
  },
];

describe("resume snapshot names the platform's real search tool", () => {
  it("emits the caller's tool name, not the bare fallback", () => {
    const named = buildResumeSnapshot(events, {
      searchTool: "context-mode_ctx_search",
    });
    expect(named).toContain("context-mode_ctx_search");

    const bare = buildResumeSnapshot(events, { searchTool: "ctx_search" });
    expect(bare).toContain("ctx_search");
    // The prefixed name must not be reachable from the bare one, otherwise the
    // override is not reaching the renderer at all.
    expect(bare).not.toContain("context-mode_ctx_search");
  });

  it("still falls back to ctx_search when no name is given", () => {
    expect(buildResumeSnapshot(events)).toContain("ctx_search");
  });
});

describe("every precompact hook passes its own platform's namer", () => {
  for (const [rel, platform] of Object.entries(HOOK_PLATFORM)) {
    it(`${rel} → ${platform}`, () => {
      const src = readFileSync(join(hooksDir, rel), "utf8");

      const namer = new RegExp(`createToolNamer\\(\\s*"([^"]+)"\\s*\\)`).exec(
        src,
      );
      expect(namer, `${rel} must build a tool namer`).not.toBeNull();
      expect(namer![1], `${rel} is under ${platform}`).toBe(platform);

      // The namer is only useful if it reaches the snapshot call.
      const call = /buildResumeSnapshot\(\s*\w+\s*,\s*\{[\s\S]*?\}\s*\)/.exec(
        src,
      );
      expect(call, `${rel} must pass an options object`).not.toBeNull();
      expect(call![0], `${rel} must pass searchTool`).toMatch(/searchTool/);

      // And the name that namer produces is the one the snapshot must carry.
      const named = createToolNamer(platform)("ctx_search");
      expect(buildResumeSnapshot(events, { searchTool: named })).toContain(
        named,
      );
    });
  }
});
