import "../setup-home";
import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import {
  HOOK_SCRIPTS as CLAUDE_HOOK_SCRIPTS,
  buildHookCommand as buildClaudeHookCommand,
  type HookType as ClaudeHookType,
} from "../../src/adapters/claude-code/hooks.js";

import {
  HOOK_SCRIPTS as GEMINI_HOOK_SCRIPTS,
  buildHookCommand as buildGeminiHookCommand,
  type HookType as GeminiHookType,
} from "../../src/adapters/gemini-cli/hooks.js";

import {
  HOOK_SCRIPTS as KIRO_HOOK_SCRIPTS,
  buildHookCommand as buildKiroHookCommand,
} from "../../src/adapters/kiro/hooks.js";

/**
 * Cross-adapter parity test for issue #712.
 *
 * For every adapter whose `buildHookCommand` emits an absolute filesystem
 * path (i.e. NOT a CLI-dispatcher Tier C adapter — vscode-copilot,
 * jetbrains-copilot, cursor, codex deliberately emit
 * `context-mode hook <platform> <event>` strings and are excluded), the
 * emitted command MUST resolve to a script that exists in the published
 * tree under the same relative layout HOOK_MAP in src/cli.ts uses.
 *
 * Why this test exists: issue #712 — gemini-cli's `buildHookCommand`
 * carried claude-code's flat `hooks/<script>` shape across without
 * accounting for the `gemini-cli/` platform subdir. HOOK_MAP knew the
 * correct layout, `setHookPermissions` knew the correct layout, but the
 * command emit didn't — and the gemini-cli doctor's regex round-trip
 * (`getHookScriptPaths` -> parse command -> check existsSync on parsed
 * path) silently failed on every install.
 *
 * This test trips at the emit layer: the script path embedded in the
 * command must existsSync in the actual tree being tested. No regex,
 * no parsing, no fragile string scraping — just "does the file the
 * command points at actually exist?".
 *
 * Adapters NOT covered here (CLI-dispatcher Tier C):
 *   - vscode-copilot  (PR #620, .github/hooks/context-mode.json is
 *                      workspace-committed; absolute paths leak PII)
 *   - jetbrains-copilot (same as above; .jetbrains/copilot/hooks.json)
 *   - cursor           (CLI dispatcher in .cursor/hooks.json)
 *   - codex            (CLI dispatcher in ~/.codex/hooks.json)
 */

interface AdapterParityCase {
  platform: string;
  scripts: Record<string, string>;
  build: (hookType: string, pluginRoot: string) => string;
  /** Relative path component between `hooks/` and `<scriptName>`. */
  subdir: string;
}

const repoRoot = resolve(__dirname, "..", "..");

const adapters: AdapterParityCase[] = [
  {
    platform: "claude-code",
    scripts: CLAUDE_HOOK_SCRIPTS,
    build: (h, p) => buildClaudeHookCommand(h as ClaudeHookType, p),
    subdir: "",
  },
  {
    platform: "gemini-cli",
    scripts: GEMINI_HOOK_SCRIPTS,
    build: (h, p) => buildGeminiHookCommand(h as GeminiHookType, p),
    subdir: "gemini-cli",
  },
  {
    platform: "kiro",
    scripts: KIRO_HOOK_SCRIPTS,
    build: (h, p) => buildKiroHookCommand(h, p),
    subdir: "kiro",
  },
];

describe("hook path parity across adapters (issue #712)", () => {
  for (const adapter of adapters) {
    describe(`${adapter.platform}`, () => {
      it("every emitted hook command points at an existing script in the tree", () => {
        for (const [hookType, scriptName] of Object.entries(adapter.scripts)) {
          const cmd = adapter.build(hookType, repoRoot);
          const expectedRel = adapter.subdir
            ? `hooks/${adapter.subdir}/${scriptName}`
            : `hooks/${scriptName}`;
          const expectedAbs = resolve(repoRoot, expectedRel);
          // buildHookRuntimeCommand emits forward-slash paths on every OS
          // (MSYS / Git Bash on Windows uses forward slashes; node accepts
          // both). path.resolve on Windows returns backslashes, so we
          // normalize before substring-matching the emitted command.
          const expectedAbsForwardSlash = expectedAbs.replace(/\\/g, "/");
          // The command must literally contain the absolute path the
          // doctor will probe; existsSync must succeed against that path.
          expect(
            cmd,
            `${adapter.platform}/${hookType}: command does not embed ${expectedAbsForwardSlash}`,
          ).toContain(expectedAbsForwardSlash);
          expect(
            existsSync(expectedAbs),
            `${adapter.platform}/${hookType}: ${expectedAbs} missing on disk`,
          ).toBe(true);
        }
      });

      it("never emits the wrong subdir (regression guard for issue #712)", () => {
        const otherSubdirs = [
          "gemini-cli",
          "kiro",
          "vscode-copilot",
          "cursor",
          "codex",
          "jetbrains-copilot",
          "copilot-cli",
        ].filter((s) => s !== adapter.subdir);
        for (const [hookType, scriptName] of Object.entries(adapter.scripts)) {
          const cmd = adapter.build(hookType, "/fixed/plugin/root");
          for (const wrong of otherSubdirs) {
            expect(
              cmd,
              `${adapter.platform}/${hookType} leaked into /hooks/${wrong}/${scriptName}`,
            ).not.toContain(`/hooks/${wrong}/${scriptName}`);
          }
        }
      });
    });
  }
});
