import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Dynamic import for .mjs modules
let claudeCodeFormat: (decision: unknown) => unknown;
let geminiCliFormat: (decision: unknown) => unknown;
let vscodeCopilotFormat: (decision: unknown) => unknown;
let cursorFormat: (decision: unknown) => unknown;
// Kimi has no standalone formatter — same convention as codex; the only
// source of truth is the central registry in hooks/core/formatters.mjs.
let kimiFormat: (decision: unknown) => unknown;
// agy has no standalone formatter either — same central-registry convention.
let agyFormat: (decision: unknown) => unknown;
// codex has no standalone formatter — central registry only. It takes an
// optional capability hint ({ codexSupportsRewrite }) threaded by the hook (#845).
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose test seams over .mjs
let codexFormat: (decision: unknown, opts?: any) => unknown;
// devin has no standalone formatter — central registry only (same as codex/kimi/agy).
let devinFormat: (decision: unknown) => unknown;
// codex capability detection helpers (#845, hooks/core/codex-caps.mjs).
let parseCodexVersion: (raw: unknown) => number[] | null;
let versionGte: (a: number[], b: number[]) => boolean;
let codexSupportsUpdatedInput: (io?: any) => boolean;
let MIN_REWRITE_VERSION: number[];

beforeAll(async () => {
  const ccMod = await import("../../hooks/formatters/claude-code.mjs");
  claudeCodeFormat = ccMod.formatDecision;

  const gemMod = await import("../../hooks/formatters/gemini-cli.mjs");
  geminiCliFormat = gemMod.formatDecision;

  const vscMod = await import("../../hooks/formatters/vscode-copilot.mjs");
  vscodeCopilotFormat = vscMod.formatDecision;

  const cursorMod = await import("../../hooks/formatters/cursor.mjs");
  cursorFormat = cursorMod.formatDecision;

  const coreMod = await import("../../hooks/core/formatters.mjs");
  kimiFormat = (decision: unknown) =>
    coreMod.formatDecision("kimi", decision as { action: string } | null);
  agyFormat = (decision: unknown) =>
    coreMod.formatDecision("antigravity-cli", decision as { action: string } | null);
  codexFormat = (decision: unknown, opts?: Record<string, unknown>) =>
    coreMod.formatDecision("codex", decision as { action: string } | null, opts);
  devinFormat = (decision: unknown) =>
    coreMod.formatDecision("devin", decision as { action: string } | null);

  const capsMod = await import("../../hooks/core/codex-caps.mjs");
  parseCodexVersion = capsMod.parseCodexVersion;
  versionGte = capsMod.versionGte;
  codexSupportsUpdatedInput = capsMod.codexSupportsUpdatedInput;
  MIN_REWRITE_VERSION = capsMod.MIN_REWRITE_VERSION;
});

// ─── Shared test decisions ───────────────────────────────

const denyDecision = {
  action: "deny",
  reason: "WebFetch blocked. Use fetch_and_index instead.",
};

const askDecision = {
  action: "ask",
};

const modifyDecision = {
  action: "modify",
  updatedInput: {
    command: 'echo "context-mode: curl/wget blocked."',
  },
};

const contextDecision = {
  action: "context",
  additionalContext: "<context_guidance>Use execute_file instead</context_guidance>",
};

// ─────────────────────────────────────────────────────────

describe("formatDecision", () => {
  // ─── Claude Code formatter ─────────────────────────────

  describe("claude-code formatter", () => {
    it("formats deny with hookSpecificOutput.permissionDecision", () => {
      const result = claudeCodeFormat(denyDecision) as Record<string, unknown>;
      expect(result).not.toBeNull();

      const output = result.hookSpecificOutput as Record<string, unknown>;
      expect(output.hookEventName).toBe("PreToolUse");
      expect(output.permissionDecision).toBe("deny");
      expect(output.reason).toBe(denyDecision.reason);
    });

    it("formats ask with hookSpecificOutput.permissionDecision:'ask'", () => {
      const result = claudeCodeFormat(askDecision) as Record<string, unknown>;
      expect(result).not.toBeNull();

      const output = result.hookSpecificOutput as Record<string, unknown>;
      expect(output.hookEventName).toBe("PreToolUse");
      expect(output.permissionDecision).toBe("ask");
    });

    // CC v2.1.x Bash tool ignores `updatedInput.command` substitution under
    // `permissionDecision: "allow"` — original command runs unchanged. Verified
    // via /diagnose Phase 4 forced-deny probe: only `permissionDecision: "deny"`
    // is honored for Bash tool. Therefore the claude-code formatter MUST emit a
    // deny shape for modify intent, extracting the echo-payload message into
    // `permissionDecisionReason` so the user still sees the actionable guidance.
    it("formats modify as deny shape (CC Bash ignores updatedInput.command — #-cc-updatedinput-regression)", () => {
      const result = claudeCodeFormat(modifyDecision) as Record<string, unknown>;
      expect(result).not.toBeNull();

      const output = result.hookSpecificOutput as Record<string, unknown>;
      expect(output.hookEventName).toBe("PreToolUse");
      // MUST be deny — CC honors this and actually blocks the command.
      expect(output.permissionDecision).toBe("deny");
      // Reason extracted from `echo "..."` payload so the user sees the
      // redirect guidance verbatim.
      expect(output.permissionDecisionReason).toContain("context-mode: curl/wget blocked");
      // updatedInput MUST NOT appear — CC ignores it for Bash and emitting it
      // alongside deny is a contradictory shape.
      expect(output.updatedInput).toBeUndefined();
    });

    // Fallback fires only when updatedInput.command does not match the
    // `echo "..."` wrapper shape routing.mjs always produces. Even in this
    // rare path the message MUST follow ADR-0003 CASE A voice:
    //   - opens with "Redirected to <ctx_tool>" (affirmative, no "blocked")
    //   - names the alternative tool via an imperative call
    //   - affirms capability ("has full network access")
    //   - ends with the canonical transient-DNS retry hint
    //   - contains NO bare-NOT negations, no "blocked" / "BLOCKED"
    it("falls back to ADR-0003 CASE A voice when echo payload cannot be extracted", () => {
      const unparseable = { action: "modify", updatedInput: { command: "weird shape" } };
      const result = claudeCodeFormat(unparseable) as Record<string, unknown>;
      const output = result.hookSpecificOutput as Record<string, unknown>;
      const reason = String(output.permissionDecisionReason);

      // CASE A voice — REQUIRED affirmations.
      expect(reason).toMatch(/^Redirected to /); // affirmative opening verb
      expect(reason).toMatch(/Call ctx_execute\(/); // imperative call (alt 1)
      expect(reason).toMatch(/ctx_fetch_and_index\(/); // alternative tool name
      expect(reason).toContain("full network access"); // capability affirmation
      expect(reason).toContain("Retry the same call on a transient DNS error"); // canonical retry hint

      // CASE A voice — FORBIDDEN tokens (ADR-0003).
      expect(reason).not.toMatch(/\bblocked\b/i); // reserved for CASE B
      expect(reason).not.toMatch(/\bBLOCKED\b/); // bare-caps forbidden
      expect(reason).not.toMatch(/\bDo NOT\b/); // bare-NOT negation forbidden
      expect(reason).not.toMatch(/\bNOT a /); // bare-NOT negation forbidden
      expect(reason).not.toMatch(/for context-window efficiency|for performance/); // org-rationale preface forbidden
    });

    it("formats context with hookSpecificOutput.additionalContext", () => {
      const result = claudeCodeFormat(contextDecision) as Record<string, unknown>;
      expect(result).not.toBeNull();

      const output = result.hookSpecificOutput as Record<string, unknown>;
      expect(output.hookEventName).toBe("PreToolUse");
      expect(output.additionalContext).toBe(contextDecision.additionalContext);
    });

    it("returns null for null decision", () => {
      const result = claudeCodeFormat(null);
      expect(result).toBeNull();
    });

    // ─── Headless mode (--print, no TTY) — passthrough on ask ───
    describe("when CLAUDE_CODE_HEADLESS=1 (headless --print mode)", () => {
      let saved: string | undefined;
      beforeEach(() => {
        saved = process.env.CLAUDE_CODE_HEADLESS;
        process.env.CLAUDE_CODE_HEADLESS = "1";
      });
      afterEach(() => {
        if (saved === undefined) delete process.env.CLAUDE_CODE_HEADLESS;
        else process.env.CLAUDE_CODE_HEADLESS = saved;
      });

      it("returns null for ask (passthrough — no TTY to surface prompt, prevents --print hang)", () => {
        const result = claudeCodeFormat(askDecision);
        expect(result).toBeNull();
      });

      it("returns null for deny (passthrough — headless agents have no UI to reconsider)", () => {
        const result = claudeCodeFormat(denyDecision);
        expect(result).toBeNull();
      });

      it("returns null for modify (passthrough — modify rewrites silently break headless tool calls)", () => {
        const result = claudeCodeFormat(modifyDecision);
        expect(result).toBeNull();
      });

      it("still formats context normally (informational, doesn't block the tool)", () => {
        const result = claudeCodeFormat(contextDecision) as Record<string, unknown>;
        expect(result).not.toBeNull();
        const output = result.hookSpecificOutput as Record<string, unknown>;
        expect(output.additionalContext).toBe(contextDecision.additionalContext);
      });
    });
  });

  // ─── Gemini CLI formatter ──────────────────────────────

  describe("gemini-cli formatter", () => {
    it("formats deny with decision:'deny' (NOT permissionDecision)", () => {
      const result = geminiCliFormat(denyDecision) as Record<string, unknown>;
      expect(result).not.toBeNull();

      const output = result.hookSpecificOutput as Record<string, unknown>;
      expect(output.decision).toBe("deny");
      expect(output.reason).toBe(denyDecision.reason);
      // Should NOT have permissionDecision
      expect(output).not.toHaveProperty("permissionDecision");
    });

    it("returns null for ask (no ask concept)", () => {
      const result = geminiCliFormat(askDecision);
      expect(result).toBeNull();
    });

    it("formats modify with hookSpecificOutput.tool_input", () => {
      const result = geminiCliFormat(modifyDecision) as Record<string, unknown>;
      expect(result).not.toBeNull();

      const output = result.hookSpecificOutput as Record<string, unknown>;
      expect(output.tool_input).toEqual(modifyDecision.updatedInput);
      // Should NOT have updatedInput
      expect(output).not.toHaveProperty("updatedInput");
    });

    it("formats context with hookSpecificOutput.additionalContext", () => {
      const result = geminiCliFormat(contextDecision) as Record<string, unknown>;
      expect(result).not.toBeNull();

      const output = result.hookSpecificOutput as Record<string, unknown>;
      expect(output.additionalContext).toBe(contextDecision.additionalContext);
    });
  });

  // ─── VS Code Copilot formatter ─────────────────────────

  describe("vscode-copilot formatter", () => {
    it("formats deny with permissionDecision (flat, not wrapped)", () => {
      const result = vscodeCopilotFormat(denyDecision) as Record<string, unknown>;
      expect(result).not.toBeNull();

      // Flat — NOT nested inside hookSpecificOutput
      expect(result.permissionDecision).toBe("deny");
      expect(result.reason).toBe(denyDecision.reason);
      expect(result).not.toHaveProperty("hookSpecificOutput");
    });

    it("formats ask with permissionDecision:'ask'", () => {
      const result = vscodeCopilotFormat(askDecision) as Record<string, unknown>;
      expect(result).not.toBeNull();

      expect(result.permissionDecision).toBe("ask");
      expect(result).not.toHaveProperty("hookSpecificOutput");
    });

    it("formats modify with hookSpecificOutput + hookEventName", () => {
      const result = vscodeCopilotFormat(modifyDecision) as Record<string, unknown>;
      expect(result).not.toBeNull();

      expect(result.hookEventName).toBe("PreToolUse");
      expect(result.hookSpecificOutput).toEqual(modifyDecision.updatedInput);
      // Should NOT have permissionDecision
      expect(result).not.toHaveProperty("permissionDecision");
    });

    it("formats context with hookSpecificOutput + hookEventName", () => {
      const result = vscodeCopilotFormat(contextDecision) as Record<string, unknown>;
      expect(result).not.toBeNull();

      expect(result.hookEventName).toBe("PreToolUse");
      const output = result.hookSpecificOutput as Record<string, unknown>;
      expect(output.additionalContext).toBe(contextDecision.additionalContext);
    });
  });

  describe("cursor formatter", () => {
    it("formats deny with permission and user_message", () => {
      const result = cursorFormat(denyDecision) as Record<string, unknown>;
      expect(result.permission).toBe("deny");
      expect(result.user_message).toBe(denyDecision.reason);
    });

    it("formats ask with permission:'ask'", () => {
      const result = cursorFormat(askDecision) as Record<string, unknown>;
      expect(result.permission).toBe("ask");
    });

    it("formats modify with updated_input", () => {
      const result = cursorFormat(modifyDecision) as Record<string, unknown>;
      expect(result.updated_input).toEqual(modifyDecision.updatedInput);
    });

    it("formats context with agent_message", () => {
      const result = cursorFormat(contextDecision) as Record<string, unknown>;
      expect(result.agent_message).toBe(contextDecision.additionalContext);
    });
  });

  // ─── Kimi formatter (deny-only — mirrors codex precedent #225 / 607dc70) ──

  describe("kimi formatter", () => {
    it("formats deny with hookSpecificOutput.permissionDecision", () => {
      const result = kimiFormat(denyDecision) as Record<string, unknown>;
      expect(result).not.toBeNull();

      const output = result.hookSpecificOutput as Record<string, unknown>;
      expect(output.hookEventName).toBe("PreToolUse");
      expect(output.permissionDecision).toBe("deny");
      expect(output.permissionDecisionReason).toBe(denyDecision.reason);
    });

    // Kimi's hook runner parses ONLY permissionDecision === "deny".
    // Emitting ask / allow+updatedInput / additionalContext would create
    // capability overclaims the host silently drops — return null instead.
    // Evidence: refs/platforms/kimi-code/packages/agent-core/src/session/
    //   hooks/runner.ts:36-39,162-178 and types.ts:28-37
    //   refs/platforms/kimi-cli/src/kimi_cli/hooks/runner.py:62-89
    it("returns null for ask (Kimi runner ignores permissionDecision !== 'deny')", () => {
      const result = kimiFormat(askDecision);
      expect(result).toBeNull();
    });

    it("returns null for modify (Kimi runner has no updatedInput channel)", () => {
      const result = kimiFormat(modifyDecision);
      expect(result).toBeNull();
    });

    it("returns null for context (Kimi HookResult has no additionalContext field)", () => {
      const result = kimiFormat(contextDecision);
      expect(result).toBeNull();
    });

    it("returns null for null decision", () => {
      const result = kimiFormat(null);
      expect(result).toBeNull();
    });
  });

  // ─── Antigravity CLI (agy) formatter ───────────────────
  // agy honors a NATIVE top-level decision contract {decision:"deny"|"ask",reason}
  // (not Claude's hookSpecificOutput) and ignores PreToolUse additionalContext —
  // so context/modify collapse to an enforceable deny.
  describe("antigravity-cli formatter", () => {
    it("formats deny as a top-level {decision:'deny',reason}", () => {
      expect(agyFormat(denyDecision)).toEqual({ decision: "deny", reason: denyDecision.reason });
    });

    it("formats ask with a fallback reason when the decision carries none", () => {
      expect(agyFormat(askDecision)).toEqual({ decision: "ask", reason: "Action requires user confirmation" });
    });

    it("formats ask with its own reason when present", () => {
      expect(agyFormat({ action: "ask", reason: "confirm first" })).toEqual({ decision: "ask", reason: "confirm first" });
    });

    it("collapses modify to a deny that surfaces the routing guidance from the echo payload", () => {
      const result = agyFormat(modifyDecision) as Record<string, unknown>;
      expect(result.decision).toBe("deny");
      // Per-tool guidance surfaced verbatim, not a generic line.
      expect(String(result.reason)).toContain("context-mode: curl/wget blocked");
    });

    it("falls back to a generic redirect when the modify command is not an echo payload", () => {
      const result = agyFormat({ action: "modify", updatedInput: { command: "weird shape" } }) as Record<string, unknown>;
      expect(result.decision).toBe("deny");
      expect(String(result.reason)).toContain("context-mode: redirected");
    });

    it("collapses context to a deny (agy ignores PreToolUse additionalContext)", () => {
      const result = agyFormat(contextDecision) as Record<string, unknown>;
      expect(result.decision).toBe("deny");
      expect(String(result.reason)).toContain("execute_file");
    });

    it("returns null for a null decision", () => {
      expect(agyFormat(null)).toBeNull();
    });
  });
});

// ─── Codex formatter (#845) ──────────────────────────────
// hooks/core/formatters.mjs owns Codex PreToolUse formatting → "Hook formatting"
// maps here per CONTRIBUTING.md. Capability detection (codex-caps.mjs) is part of
// the same #845 feature, so its unit tests live here too rather than a new file.
describe("codex formatter (#845)", () => {
  describe("modify", () => {
    it("capable Codex: emits permissionDecision:allow + updatedInput (command rewrite)", () => {
      const out = codexFormat(modifyDecision, { codexSupportsRewrite: true }) as {
        hookSpecificOutput: Record<string, unknown>;
      };
      expect(out.hookSpecificOutput).toEqual({
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
        updatedInput: { command: 'echo "context-mode: curl/wget blocked."' },
      });
    });

    it("incapable Codex: FAILS CLOSED as a deny carrying the extracted guidance", () => {
      const out = codexFormat(modifyDecision, { codexSupportsRewrite: false }) as {
        hookSpecificOutput: Record<string, unknown>;
      };
      expect(out.hookSpecificOutput.permissionDecision).toBe("deny");
      expect(out.hookSpecificOutput.permissionDecisionReason).toBe("context-mode: curl/wget blocked.");
      expect(out.hookSpecificOutput).not.toHaveProperty("updatedInput");
    });

    it("incapable Codex: never silently passes a command redirect through", () => {
      expect(codexFormat(modifyDecision, { codexSupportsRewrite: false })).not.toBeNull();
    });

    it("incapable Codex: non-command rewrite (Agent prompt) is dropped, not denied", () => {
      const promptModify = { action: "modify", updatedInput: { prompt: "routing block" } };
      expect(codexFormat(promptModify, { codexSupportsRewrite: false })).toBeNull();
    });

    it("defaults to fail-closed when no capability hint is given", () => {
      const out = codexFormat(modifyDecision) as { hookSpecificOutput: Record<string, unknown> };
      expect(out.hookSpecificOutput.permissionDecision).toBe("deny");
    });
  });

  describe("context", () => {
    it("capable Codex: surfaces additionalContext", () => {
      const out = codexFormat(contextDecision, { codexSupportsRewrite: true });
      expect(out).toEqual({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          additionalContext: contextDecision.additionalContext,
        },
      });
    });

    it("incapable Codex: drops the advisory nudge (no rejected shape emitted)", () => {
      expect(codexFormat(contextDecision, { codexSupportsRewrite: false })).toBeNull();
    });
  });

  describe("deny / ask", () => {
    it("deny still emits permissionDecision:deny with the reason", () => {
      const out = codexFormat(denyDecision) as { hookSpecificOutput: Record<string, unknown> };
      expect(out.hookSpecificOutput.permissionDecision).toBe("deny");
      expect(out.hookSpecificOutput.permissionDecisionReason).toBe(denyDecision.reason);
    });

    it("ask is dropped — Codex rejects permissionDecision:ask", () => {
      expect(codexFormat(askDecision)).toBeNull();
      expect(codexFormat(askDecision, { codexSupportsRewrite: true })).toBeNull();
    });
  });
});

// ─── Codex capability detection (#845) ───────────────────
describe("codexSupportsUpdatedInput (#845)", () => {
  let dir: string;
  let cachePath: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "cm-codex-caps-"));
    cachePath = join(dir, "caps.json");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("parseCodexVersion parses the version line, null on garbage", () => {
    expect(parseCodexVersion("codex-cli 0.141.0")).toEqual([0, 141, 0]);
    expect(parseCodexVersion("codex 0.139.2\n")).toEqual([0, 139, 2]);
    expect(parseCodexVersion("no version")).toBeNull();
  });

  it("versionGte compares major/minor/patch (equal → true)", () => {
    expect(versionGte([0, 141, 0], MIN_REWRITE_VERSION)).toBe(true);
    expect(versionGte([0, 140, 9], [0, 141, 0])).toBe(false);
    expect(versionGte([1, 0, 0], [0, 141, 0])).toBe(true);
  });

  it("true for a supported version, false (fail closed) for older", () => {
    expect(codexSupportsUpdatedInput({ runVersion: () => "codex-cli 0.141.0", now: () => 1000, cachePath })).toBe(true);
    rmSync(cachePath, { force: true });
    expect(codexSupportsUpdatedInput({ runVersion: () => "codex-cli 0.140.0", now: () => 1000, cachePath })).toBe(false);
  });

  it("fails closed when codex is absent / probe throws", () => {
    expect(
      codexSupportsUpdatedInput({ runVersion: () => { throw new Error("ENOENT"); }, now: () => 1000, cachePath }),
    ).toBe(false);
  });

  it("serves a fresh cached result without re-probing, re-probes after TTL", () => {
    codexSupportsUpdatedInput({ runVersion: () => "codex-cli 0.141.0", now: () => 1000, cachePath });
    expect(
      codexSupportsUpdatedInput({ runVersion: () => { throw new Error("must not run within TTL"); }, now: () => 1000 + 60_000, cachePath }),
    ).toBe(true);
    expect(
      codexSupportsUpdatedInput({ runVersion: () => "codex-cli 0.140.0", now: () => 1000 + 2 * 60 * 60 * 1000, cachePath }),
    ).toBe(false);
  });
});

// ─── Devin CLI formatter ───────────────────────────────────
//
// Devin uses Claude-Code-compatible hookSpecificOutput format.
// updatedInput (modify) is not documented — convert modify→deny
// carrying the redirect guidance (same as Codex <0.141.0).

describe("Devin formatter", () => {
  it("null decision → null (passthrough)", () => {
    expect(devinFormat(null)).toBeNull();
  });

  it("deny → hookSpecificOutput with permissionDecision:deny", () => {
    const result = devinFormat(denyDecision) as Record<string, unknown>;
    const hso = result.hookSpecificOutput as Record<string, unknown>;
    expect(hso.hookEventName).toBe("PreToolUse");
    expect(hso.permissionDecision).toBe("deny");
    expect(hso.permissionDecisionReason).toBe(denyDecision.reason);
  });

  it("ask → null (Devin has no ask concept)", () => {
    expect(devinFormat(askDecision)).toBeNull();
  });

  it("modify with command → deny carrying redirect guidance (fail-closed)", () => {
    const result = devinFormat(modifyDecision) as Record<string, unknown>;
    const hso = result.hookSpecificOutput as Record<string, unknown>;
    expect(hso.hookEventName).toBe("PreToolUse");
    expect(hso.permissionDecision).toBe("deny");
    expect(typeof hso.permissionDecisionReason).toBe("string");
    expect((hso.permissionDecisionReason as string).length).toBeGreaterThan(0);
  });

  it("modify without command → null (advisory, not blocked)", () => {
    const result = devinFormat({ action: "modify", updatedInput: { prompt: "injection" } });
    expect(result).toBeNull();
  });

  it("context → hookSpecificOutput with additionalContext", () => {
    const result = devinFormat(contextDecision) as Record<string, unknown>;
    const hso = result.hookSpecificOutput as Record<string, unknown>;
    expect(hso.hookEventName).toBe("PreToolUse");
    expect(hso.additionalContext).toBe(contextDecision.additionalContext);
  });
});
