# Platform Support Matrix

This document provides a comprehensive comparison of all platforms supported by context-mode, including their hook paradigms, capabilities, configuration, and known limitations.

## Overview

context-mode supports 17 client platforms, plus the OpenClaw gateway integration, across three hook paradigms:

| Paradigm | Platforms |
|----------|-----------|
| **JSON stdin/stdout** | Claude Code, Gemini CLI, VS Code Copilot, JetBrains Copilot, GitHub Copilot CLI, Cursor, Codex CLI, Qwen Code, Kimi Code, Antigravity CLI (`agy`), Kiro |
| **TS Plugin** | OpenCode, KiloCode, OpenClaw |
| **Extension (in-process hooks + MCP bridge)** | Pi, OMP (Oh My Pi) |
| **MCP-only** | Antigravity, Zed |

The MCP server layer is 100% portable and needs no adapter. Only the hook layer requires platform-specific adapters.

## Prerequisites

All platforms (except Claude Code plugin install) require a global install:

```bash
npm install -g context-mode
```

This puts the `context-mode` binary in PATH, which is required for:
- **MCP server:** `"command": "context-mode"` (replaces ephemeral `npx -y context-mode`)
- **Hook dispatcher:** `context-mode hook <platform> <event>` (replaces `node ./node_modules/...` paths)
- **Utility commands:** `context-mode doctor`, `context-mode upgrade`
- **Persistent upgrades:** `ctx-upgrade` updates the global binary in-place

---

## Main Comparison Table

| Feature | Claude Code | Qwen Code | Gemini CLI | VS Code Copilot | JetBrains Copilot | GitHub Copilot CLI | Cursor | OpenCode | KiloCode | OpenClaw | Codex CLI | Kimi Code | Antigravity | Antigravity CLI (`agy`) | Kiro | Zed | Pi | OMP |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Paradigm** | json-stdio | json-stdio | json-stdio | json-stdio | json-stdio | json-stdio | json-stdio | ts-plugin | ts-plugin | ts-plugin | json-stdio | json-stdio | mcp-only | json-stdio | json-stdio | mcp-only | extension | extension |
| **PreToolUse equivalent** | `PreToolUse` | `PreToolUse` | `BeforeTool` | `PreToolUse` | `PreToolUse` | `preToolUse` | `preToolUse` | `tool.execute.before` | `tool.execute.before` | `before_tool_call` | `PreToolUse` | `PreToolUse` | -- | `PreToolUse` (bounded) | `preToolUse` | -- | `tool_call` (extension) | `tool_call` (plugin) |
| **PostToolUse equivalent** | `PostToolUse` | `PostToolUse` | `AfterTool` | `PostToolUse` | `PostToolUse` | `postToolUse` | `postToolUse` | `tool.execute.after` | `tool.execute.after` | `after_tool_call` | `PostToolUse` | `PostToolUse` | -- | `PostToolUse` (capture-only) | `postToolUse` | -- | `tool_result` (extension) | `tool_result` (plugin) |
| **PreCompact equivalent** | `PreCompact` | `PreCompact` | `PreCompress` | `PreCompact` | `PreCompact` | `preCompact` | -- | `experimental.session.compacting` | `experimental.session.compacting` | `registerContextEngine` | -- | `PreCompact` | -- | -- | -- | -- | `session_before_compact` (extension) | `session_before_compact` (plugin) |
| **SessionStart** | `SessionStart` | `SessionStart` | `SessionStart` | `SessionStart` | `SessionStart` | `sessionStart` | `sessionStart` | -- | -- | `session_start` | `SessionStart` | `SessionStart` | -- | -- | `agentSpawn` | -- | `session_start` (extension) | `session_start` (plugin) |
| **Stop equivalent** | `Stop` | `Stop` | -- | `Stop` | `Stop` | `agentStop` | `stop` | -- | -- | -- | `Stop` | `Stop` | -- | `Stop` (best-effort, registered but not observed through agy 1.0.10) | -- | -- | `turn_end` (extension) | `turn_end` (plugin) |
| **Can modify args** | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Runtime (codex-cli >= 0.141.0) | Yes | -- | -- | -- | -- | -- | -- |
| **Can modify output** | Yes | Yes | Yes | Yes | Yes | No | No | Yes (caveat) | Yes (caveat) | No | No | Yes | -- | -- | -- | -- | -- | -- |
| **Can inject session context** | Yes | Yes | Yes | Yes | Yes | Yes | Yes | -- | -- | Yes | Yes | Yes | -- | -- | Yes | -- | -- | -- |
| **Can block tools** | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes (throw) | Yes (throw) | Yes | Yes | Yes | -- | Bounded | Yes | -- | Yes (extension) | Yes (plugin) |
| **Config location** | `~/.claude/settings.json` | `~/.qwen/settings.json` | `~/.gemini/settings.json` | `.github/hooks/*.json` | `.github/hooks/*.json` | `~/.copilot/hooks/context-mode.json` + `~/.copilot/mcp-config.json` | `.cursor/hooks.json` or `~/.cursor/hooks.json` | `opencode.json` | `kilo.json` / `kilo.jsonc` | `openclaw.json` | `~/.codex/hooks.json` + `~/.codex/config.toml` | `~/.kimi-code/config.toml` | `~/.gemini/antigravity/mcp_config.json` | `~/.gemini/config/mcp_config.json` + `~/.gemini/config/hooks.json` | `~/.kiro/settings/mcp.json` | `~/.config/zed/settings.json` | `~/.pi/extensions/context-mode/` (extension) | `~/.omp/agent/mcp.json` |
| **Session ID field** | `session_id` | `session_id` | `session_id` | `sessionId` (camelCase) | `sessionId` (camelCase) | `session_id` (snake_case; `sessionId` defensive fallback) | `conversation_id` | `sessionID` (camelCase) | `sessionID` (camelCase) | `pid-${ppid}` fallback | N/A | `session_id` | N/A | `conversationId` (unverified) | `pid-${ppid}` fallback | N/A | N/A | N/A |
| **Project dir env** | `CLAUDE_PROJECT_DIR` | `QWEN_PROJECT_DIR` | `GEMINI_PROJECT_DIR` | `CLAUDE_PROJECT_DIR` | `CLAUDE_PROJECT_DIR` | stdin `cwd` | stdin `workspace_roots` | `ctx.directory` (plugin init) | `ctx.directory` (plugin init) | `process.cwd()` | N/A | stdin `cwd` | N/A | stdin `workspace.current_dir` (refs-backed; `workspacePaths[0]` fallback) | stdin `cwd` | N/A | `PI_WORKSPACE_DIR` / `PI_PROJECT_DIR` (extension-set) | `PI_CODING_AGENT_DIR` |
| **MCP/tool naming** | `mcp__server__tool` | `mcp__server__tool` | `mcp__server__tool` | host-side naming | host-side naming | `mcp__server__tool` | `MCP:<tool>` in hook payloads | native `ctx_*` plugin tools | native `ctx_*` plugin tools | native `ctx_*` plugin tools | `mcp__server__tool` | `mcp__context-mode__tool` | `mcp__server__tool` | `context-mode/<tool>` | `mcp__server__tool` | `mcp__server__tool` | native `ctx_*` (bridged) | `mcp__server__tool` |
| **Hook command format** | `context-mode hook claude-code <event>` | `context-mode hook qwen-code <event>` | `context-mode hook gemini-cli <event>` | `context-mode hook vscode-copilot <event>` | `context-mode hook jetbrains-copilot <event>` | `context-mode hook copilot-cli <event>` | `context-mode hook cursor <event>` | TS plugin (no command) | TS plugin (no command) | TS plugin (no command) | `context-mode hook codex <event>` | `context-mode hook kimi <event>` | N/A | `context-mode hook antigravity-cli <event>` | `context-mode hook kiro <event>` | N/A | N/A | N/A |
| **Hook registration** | settings.json hooks object | settings.json hooks object | settings.json hooks object | `.github/hooks/*.json` | `.github/hooks/*.json` | `~/.copilot/hooks/context-mode.json` (`version: 1`) | `hooks.json` native hook arrays | opencode.json plugin array | kilo.json plugin array | openclaw.json `plugins.entries` | `~/.codex/hooks.json` | `config.toml` hooks array | N/A | plugin root `hooks.json` (`PreToolUse`, `PostToolUse`, `Stop`; bundle mirrors `hooks/hooks.json` for agy validate/install) | Kiro CLI hooks (JSON stdin) | N/A | N/A | N/A |
| **MCP server command** | `context-mode` (or plugin auto) | `context-mode` | `context-mode` | `context-mode` | `context-mode` | `context-mode` | `context-mode` | N/A (native plugin tools) | N/A (native plugin tools) | N/A (native plugin tools) | `context-mode` | `context-mode` | `context-mode` | `context-mode` | `context-mode` | `context-mode` | `context-mode` | `context-mode` |
| **Plugin distribution** | Claude plugin registry | npm global | npm global | npm global | npm global | npm global | npm global | npm global | npm global | npm global | npm global | npm global | npm global | agy plugin (npm global) | npm global | npm global | npm global | npm global |
| **Session dir** | `~/.claude/context-mode/sessions/` | `~/.qwen/context-mode/sessions/` | `~/.gemini/context-mode/sessions/` | `.github/context-mode/sessions/` or `~/.vscode/context-mode/sessions/` | `.github/context-mode/sessions/` | `~/.copilot/context-mode/sessions/` | `~/.cursor/context-mode/sessions/` | `~/.config/opencode/context-mode/sessions/` | `~/.config/kilo/context-mode/sessions/` | `~/.openclaw/context-mode/sessions/` | `~/.codex/context-mode/sessions/` | `~/.kimi-code/context-mode/sessions/` | `~/.gemini/context-mode/sessions/` | `~/.gemini/context-mode/sessions/` | `~/.kiro/context-mode/sessions/` | `~/.config/zed/context-mode/sessions/` | `~/.pi/context-mode/sessions/` | `~/.omp/context-mode/sessions/` |

### Legend

- Yes = Fully supported
- -- = Not supported
- (caveat) = Supported with known issues

---

## Platform Details

### Claude Code

**Status:** Fully supported (primary platform)

**Hook Paradigm:** JSON stdin/stdout

Claude Code is the primary platform for context-mode. All hooks communicate via JSON on stdin/stdout. The adapter reads raw JSON input, normalizes it into platform-agnostic events, and formats responses back into Claude Code's expected output format.

**Hook Names:**
- `PreToolUse` -- fires before a tool is executed
- `PostToolUse` -- fires after a tool completes
- `PreCompact` -- fires before context compaction
- `SessionStart` -- fires when a session starts, resumes, or compacts
- `UserPromptSubmit` -- fires when user submits a prompt
- `Stop` -- fires when the assistant turn is about to end

**Blocking:** `permissionDecision: "deny"` in response JSON

**Arg Modification:** `updatedInput` field at top level of response

**Output Modification:** `updatedMCPToolOutput` for MCP tools, `additionalContext` for appending

**Session ID Extraction Priority:**
1. UUID from `transcript_path` field
2. `session_id` field
3. `CLAUDE_SESSION_ID` environment variable
4. Parent process ID fallback

**Hook Commands:**
```
context-mode hook claude-code pretooluse
context-mode hook claude-code posttooluse
context-mode hook claude-code precompact
context-mode hook claude-code sessionstart
context-mode hook claude-code userpromptsubmit
context-mode hook claude-code stop
```

**Verify:** Run `/context-mode:ctx-doctor` (or `context-mode doctor`) to confirm hooks, the MCP server, and plugin registration are wired. Type `ctx stats` (or check the `context-mode statusline`) to confirm context-window savings for the session.

**Known Issues:** None significant.

---

### Gemini CLI

**Status:** Fully supported

**Hook Paradigm:** JSON stdin/stdout

Gemini CLI uses the same JSON stdin/stdout paradigm as Claude Code but with different hook names and response format.

**Hook Names:**
- `BeforeAgent` -- equivalent to UserPromptSubmit (fires when the user submits a prompt; used for session-continuity capture)
- `BeforeTool` -- equivalent to PreToolUse
- `AfterTool` -- equivalent to PostToolUse
- `AfterModel` -- per-turn token/cost capture hook. Shipped in `configs/gemini-cli/settings.json` and emitted by the adapter, but **not currently routed through the CLI dispatcher** (`HOOK_MAP['gemini-cli']` omits `aftermodel`), so `context-mode hook gemini-cli aftermodel` is a no-op until the dispatcher gains the key (tracked in [#882](https://github.com/mksglu/context-mode/issues/882)).
- `PreCompress` -- equivalent to PreCompact (advisory only, async, cannot block)
- `SessionStart` -- fires when a session starts

**Blocking:** `decision: "deny"` in response (NOT `permissionDecision`)

**Arg Modification:** `hookSpecificOutput.tool_input` (merged with original, not `updatedInput`)

**Output Modification:** `decision: "deny"` + `reason` replaces output; `hookSpecificOutput.additionalContext` appends

**Environment Variables:**
- `GEMINI_PROJECT_DIR` -- primary project directory
- `CLAUDE_PROJECT_DIR` -- alias (also works)

**Hook Commands:**
```
context-mode hook gemini-cli beforeagent
context-mode hook gemini-cli beforetool
context-mode hook gemini-cli aftertool
context-mode hook gemini-cli precompress
context-mode hook gemini-cli sessionstart
```

(`aftermodel` is intentionally omitted — it is not dispatchable via the CLI today; see the `AfterModel` note above.)

**Verify:** Run `context-mode doctor` (or `ctx doctor` in Gemini CLI) to confirm the BeforeTool/SessionStart hooks, FTS5, and plugin registration in `~/.gemini/settings.json`. A hook failure shows as a `fail` row with a `context-mode upgrade` fix. Type `ctx stats` in Gemini CLI to confirm context-window savings for the session.

**Known Issues / Caveats:**
- User prompts/decisions **are** captured via the `BeforeAgent` hook (the UserPromptSubmit equivalent on Gemini CLI).
- `AfterModel` is defined and shipped but **not** currently routed through the CLI dispatcher (`HOOK_MAP` omits `aftermodel`), so per-turn token/cost capture via the dispatcher is inactive until `HOOK_MAP` is updated ([#882](https://github.com/mksglu/context-mode/issues/882)).
- `PreCompress` is advisory only (async, cannot block)
- No `decision: "ask"` support
- Hooks don't fire for subagents yet

---

### OpenCode

**Status:** Fully supported

**Hook Paradigm:** TS Plugin

OpenCode uses a TypeScript plugin paradigm instead of JSON stdin/stdout. Hooks and the 11 `ctx_*` tools are registered via the `plugin` array in `opencode.json`; no separate `mcp` block or stdio MCP child is required.

**Hook Names:**
- `tool.execute.before` -- equivalent to PreToolUse
- `tool.execute.after` -- equivalent to PostToolUse
- `experimental.session.compacting` -- equivalent to PreCompact (experimental)
- `experimental.chat.system.transform` -- SessionStart-equivalent (cross-session resume injection)

**Blocking:** `throw Error` in `tool.execute.before` handler

**Arg Modification:** `output.args` mutation

**Output Modification:** `output.output` mutation (TUI bug for bash, see issue #13575)

**Session ID:** `input.sessionID` (camelCase, note the uppercase `ID`)

**Project Directory:** The live plugin uses `ctx.directory` from plugin init. The adapter's CLI/parse path additionally honors the `OPENCODE_PROJECT_DIR` environment variable, falling back to `process.cwd()`.

**Desktop markers:** OpenCode desktop shells also export `OPENCODE_CLIENT=desktop` and `OPENCODE_TERMINAL=1`; context-mode treats those as OpenCode identity signals when the CLI markers are absent.

**Configuration:**
- `opencode.json` or `.opencode/opencode.json`
- Plugin registered in the `plugin` array with npm package names
- `ctx_*` tools are native plugin tools, not `mcp__server__tool` calls
- KiloCode uses the same plugin path via `kilo.json`; `context-mode upgrade` removes stale `mcp.context-mode` entries for both hosts while preserving other MCP servers

**Cross-session resume:**
When OpenCode triggers `experimental.session.compacting` (auto on context overflow OR manual `/compact`), context-mode saves a snapshot to its per-project SQLite store. The NEXT new session in the same project — typically after `Ctrl+D` then re-running `opencode`, or starting a fresh chat — claims that snapshot via `experimental.chat.system.transform` and prepends it to `system[1]` (preserves OpenCode's `[header, body]` cache fold). The current session never claims its OWN snapshot back (self-injection guard, v1.0.106). To verify the injection landed, run with `OPENCODE_DEBUG=1` and grep for `<!-- context-mode v` in the system prompt — that's the visible marker.

**Known Issues / Caveats:**
- SessionStart is broken (issue #14808, no hook issue #5409) — we use `experimental.chat.system.transform` as a surrogate
- Output modification has TUI rendering bug for bash tool (issue #13575)
- `experimental.session.compacting` is marked experimental and may change
- No `canInjectSessionContext` capability
- Resume snapshots are scoped per-project (DB sharded by SHA-256 of `ctx.directory`); no cross-project bleed

**Verify:** Run `context-mode doctor` (or the doctor MCP tool) to confirm `context-mode` is present in the `plugin` array of `opencode.json`/`.jsonc` and that hooks are wired; the doctor warns on a legacy `mcp.context-mode` block and prints `context-mode upgrade` as the fix. Failure signature: the plugin is not in the array, so zero `ctx_*` tools appear. To confirm savings, type `ctx stats` — it shows the session's context-window savings ratio and per-tool token breakdown, so you can verify routing is actually saving context (not just that tools respond).

---

### KiloCode

**Status:** Fully supported

**Hook Paradigm:** TS Plugin

KiloCode is an OpenCode fork. context-mode routes the `kilo` platform through the **same `OpenCodeAdapter`** (`getAdapter("kilo")` returns `OpenCodeAdapter("kilo")`), so it inherits OpenCode's hook names, blocking, arg/output modification, and the 11 native `ctx_*` plugin tools registered via the `plugin` array. Hooks and tools are registered via the `plugin` array in `kilo.json`; no separate `mcp` block or stdio MCP child is required.

**Hook Names:** Same as OpenCode —
- `tool.execute.before` -- equivalent to PreToolUse
- `tool.execute.after` -- equivalent to PostToolUse
- `experimental.session.compacting` -- equivalent to PreCompact (experimental)
- `experimental.chat.system.transform` -- SessionStart-equivalent (cross-session resume injection)

**Blocking:** `throw Error` in `tool.execute.before` handler

**Arg Modification:** `output.args` mutation

**Output Modification:** `output.output` mutation (shares OpenCode's TUI bash-rendering caveat, issue #13575)

**Session ID:** `input.sessionID` (camelCase, note the uppercase `ID`)

**Configuration:**
- `kilo.json` or `kilo.jsonc` (the adapter discovers and writes both). The shipped config sets `"$schema": "https://app.kilo.ai/config.json"` and registers `context-mode` in the `plugin` array.
- Project config dirs: `.kilo/` and `.kilocode/` (each accepting `kilo.json`/`kilo.jsonc`), plus `~/.config/kilo/kilo.json(c)` — mirroring KiloCode runtime's accepted config dirs.
- `ctx_*` tools are native plugin tools, not `mcp__server__tool` calls.
- `context-mode upgrade` removes stale `mcp.context-mode` entries while preserving other MCP servers (same as OpenCode).

**Detection:**
- KiloCode runtime sets `KILO=1` + `KILO_PID=<pid>` — both are identification markers.
- `~/.config/kilo/` directory presence.
- `CONTEXT_MODE_PLATFORM=kilo` override.

**Session dir:** `~/.config/kilo/context-mode/sessions/`

**Verify:** Run `context-mode doctor` to confirm `context-mode` is in the `kilo.json`/`kilo.jsonc` `plugin` array and hooks are wired (doctor messages are parameterized to say "kilo.json or kilo.jsonc" for this platform); a failure prints `context-mode upgrade`. Failure signature: plugin not in the array ⇒ zero `ctx_*` tools. Type `ctx stats` to confirm the session's context-window savings ratio and per-tool token breakdown.

**Known Issues / Caveats:**
- Inherits OpenCode's caveats: `experimental.session.compacting` is experimental and may change; output modification has a TUI rendering bug for the bash tool (issue #13575); SessionStart relies on `experimental.chat.system.transform` as a surrogate.

---

### Codex CLI

**Status:** Supported (MCP active, hooks require `[features].hooks = true`)

**Hook Paradigm:** JSON stdin/stdout

Codex CLI's Rust backend (codex-rs) includes a hook system using the same JSON stdin/stdout wire protocol as Claude Code. Hooks are configured via `hooks.json`.

**Hook Names:**
- `PreToolUse` -- fires before a tool is executed
- `PostToolUse` -- fires after a tool completes
- `PreCompact` -- fires before context compaction on Codex builds that emit it
- `SessionStart` -- fires when a session starts, resumes, or clears
- `UserPromptSubmit` -- fires when user submits a prompt
- `Stop` -- fires when agent turn ends (can continue with followup)

**Blocking:** `permissionDecision: "deny"` in hookSpecificOutput, or exit code 2
**Arg Modification:** Runtime-gated. On codex-cli >= 0.141.0 ([#845](https://github.com/mksglu/context-mode/issues/845)) context-mode performs command rewrites by emitting `permissionDecision: "allow"` + `updatedInput`, detected at runtime via `codex --version`; older builds fail closed (the redirect becomes a deny). The adapter's static `canModifyArgs` is `false`.
**Output Modification:** NOT supported (updatedMCPToolOutput returns error)
**Context Injection:** `additionalContext` in hookSpecificOutput. On all builds it works via PostToolUse and SessionStart; on codex-cli >= 0.141.0 ([#845](https://github.com/mksglu/context-mode/issues/845)) PreToolUse `additionalContext` also reaches the model (runtime-detected). On older builds PreToolUse fails closed — deny works, but modify/context/ask responses are dropped by the codex formatter automatically.

**Configuration:**
- Hook config: `$CODEX_HOME/hooks.json` or `~/.codex/hooks.json` (JSON format, same structure as Claude Code)
- MCP config: `$CODEX_HOME/config.toml` or `~/.codex/config.toml` (TOML format, `[mcp_servers]` section)
- Feature flags: use `[features].hooks` (or `codex --enable hooks`) if you need
  to force hooks on. Prefer `[features].hooks`; `[features].codex_hooks` remains
  accepted as a legacy alias in current Codex builds.

**Hook Commands:**
```
context-mode hook codex pretooluse
context-mode hook codex posttooluse
context-mode hook codex precompact
context-mode hook codex sessionstart
context-mode hook codex userpromptsubmit
context-mode hook codex stop
```

**Known Issues / Caveats:**
- PreToolUse capability is **runtime-gated on the Codex build**: deny works on all builds; on codex-cli >= 0.141.0 ([#845](https://github.com/mksglu/context-mode/issues/845)) context-mode also performs command rewrites (`updatedInput`) and PreToolUse context injection (`additionalContext`), detected at runtime via `codex --version`. On older builds PreToolUse fails closed (the redirect becomes a deny; modify/context/ask are dropped by the codex formatter). Source: `codex-rs/hooks/src/engine/output_parser.rs:267`.
- The upstream `updatedInput` gap ([openai/codex#18491](https://github.com/openai/codex/issues/18491)) is resolved for modern builds — input rewriting works on codex-cli >= 0.141.0 and is no longer a hard blocker.
- PreCompact support is runtime-gated: context-mode configures it and treats a missing registration as a warning, because older Codex builds may not emit the event. The hook stores the resume snapshot out-of-band and SessionStart restores it.
- Codex emits structured tool names such as `Bash` and `apply_patch`; context-mode only normalizes legacy shell aliases.
- `updatedMCPToolOutput` is in the schema but NOT implemented (output modification is unsupported).
- Hook timeout: Codex host default (~600 seconds); context-mode sets no per-hook timeout in `configs/codex/hooks.json`.
- Older context-mode releases used a `plugins/context-mode -> ..` symlink shim
  because Codex rejects the repository root (`"./"`) as an empty local plugin
  source path. On native Windows, Git can check that symlink out as a regular
  file containing only `..`, which makes `codex plugin add context-mode@context-mode`
  fail with `missing plugin.json`. Current releases avoid this by declaring the
  Codex marketplace plugin as a relative Git source (`url: "./"`), so Codex
  materializes the installed marketplace root and finds `.codex-plugin/plugin.json`
  without any symlink or junction.

  After installation succeeds, verify that Codex hooks are enabled in
  `%USERPROFILE%\.codex\config.toml`:

  ```toml
  [features]
  hooks = true
  ```

  Some Codex builds may also require `plugin_hooks = true`. Without hook support,
  the MCP tools can still work, but automatic session capture and persistent
  memory may not record events.

**Verify:** Run `ctx doctor` (or `context-mode doctor`) to confirm the `codex` binary is on PATH, `[features].hooks=true`, MCP registration, and each hook event is configured. Run `ctx stats` to confirm the MCP server is reachable and to see how much context window context-mode has saved this session (savings ratio + per-tool token breakdown).

---

### Kimi Code

**Status:** Supported (JSON stdin/stdout hooks + MCP)

**Hook Paradigm:** JSON stdin/stdout

Kimi Code CLI uses the same JSON stdin/stdout wire protocol as Claude Code and Codex, configured via `~/.kimi-code/config.toml` with `[[hooks]]` array tables. PreToolUse is **deny-only** on Kimi: `updatedInput`, `additionalContext`, and `permissionDecision: "ask"` are silently dropped by Kimi's host runner (the same effective behavior as Codex's older builds). context-mode's `kimi` formatter may emit these fields, but the host strips them, so routing enforcement relies on deny.

**Hook Names:**
- `PreToolUse` — fires before a tool is executed
- `PostToolUse` — fires after a tool completes
- `PreCompact` — fires before context compaction
- `SessionStart` — fires when a session starts or resumes
- `UserPromptSubmit` — fires when user submits a prompt (payload is `ContentPart[]`)
- `Stop` — fires when the agent turn ends
- `SessionEnd` — fires when the session ends

**Blocking:** `permissionDecision: "deny"` in `hookSpecificOutput`, or exit code 2

**Arg Modification:** Not supported — `updatedInput` is emitted but silently dropped by Kimi's host runner (`canModifyArgs: false`).

**Output Modification:** Not supported — `additionalContext` is emitted but silently dropped by Kimi's host runner (`canModifyOutput: false`).

**Context Injection:** Not supported through the hook response — `additionalContext` is emitted in `hookSpecificOutput` but Kimi's host runner does not surface it to the model (`canInjectSessionContext: false`).

**Configuration:**
- Hooks: `~/.kimi-code/config.toml` (`[[hooks]]` array tables)
- MCP: `~/.kimi-code/mcp.json`
- Sessions: `~/.kimi-code/context-mode/sessions/`

**Hook Commands:**
```
context-mode hook kimi pretooluse
context-mode hook kimi posttooluse
context-mode hook kimi precompact
context-mode hook kimi sessionstart
context-mode hook kimi userpromptsubmit
context-mode hook kimi stop
context-mode hook kimi sessionend
```

**Verify:** Run `ctx doctor` (or `context-mode doctor`) to confirm the `kimi` binary is on PATH, the `[[hooks]]` entries are present in `~/.kimi-code/config.toml`, and context-mode is registered in `~/.kimi-code/mcp.json`. Run `ctx stats` to see how much context window context-mode saved this session (savings ratio + per-tool token breakdown).

**Known Issues / Caveats:**
- PreToolUse is deny-only: `updatedInput` / `additionalContext` / `permissionDecision: "ask"` are silently dropped by Kimi's host runner (same effective limit as Codex's older builds). Routing enforcement relies on deny.
- `UserPromptSubmit` sends `prompt` as a `ContentPart[]` array; the kimi hook normalizes this to a string for downstream extractors.
- SessionStart/PostToolUse `additionalContext` injection is emitted but Kimi's host runner does not surface it to the model (fails-open).

---

### Qwen Code

**Status:** Supported (MCP + hooks — identical wire protocol to Claude Code)

**Hook Paradigm:** JSON stdin/stdout (same as Claude Code)

Qwen Code (by Alibaba/Qwen team) uses the exact same hook wire protocol as Claude Code, verified from source (`hookRunner.ts`, `claude-converter.ts`). Hooks are configured inside `~/.qwen/settings.json` under the `hooks` key.

**Hook Names:** `PreToolUse`, `PostToolUse`, `SessionStart`, `PreCompact`, `UserPromptSubmit`, `Stop` (Qwen supports 12 events total; context-mode uses these 6). The `Stop` hook tails `~/.qwen/tmp/<hash>/chats/<sessionId>.jsonl` to capture per-turn token cost (token usage is unreachable through hook stdin). **Note:** `context-mode upgrade` wires `Stop` as a direct node-script command, which fires; the CLI dispatcher form `context-mode hook qwen-code stop` does **not** work today because `HOOK_MAP['qwen-code']` omits `stop` (it fails open / no-op). Use `context-mode upgrade` so the Stop hook is wired correctly.

**Blocking:** `permissionDecision: "deny"` or exit code 2
**Arg Modification:** `updatedInput` in response
**Output Modification:** `updatedMCPToolOutput` in response
**Context Injection:** `additionalContext` in response

**Configuration:**
- Settings + hooks: `~/.qwen/settings.json`
- MCP: `mcpServers` in settings.json
- Sessions: `~/.qwen/context-mode/sessions/`

**Detection:** MCP clientInfo (`qwen-cli-mcp-client-*` pattern), `QWEN_PROJECT_DIR` env var, or `~/.qwen/` config dir. Force with `CONTEXT_MODE_PLATFORM=qwen-code`.

**Hook Commands:**
```
context-mode hook qwen-code pretooluse
context-mode hook qwen-code posttooluse
context-mode hook qwen-code sessionstart
context-mode hook qwen-code precompact
context-mode hook qwen-code userpromptsubmit
```

(The `Stop` hook is wired by `context-mode upgrade` as a direct node-script command, not via the dispatcher — `context-mode hook qwen-code stop` is not mapped in `HOOK_MAP` today.)

**Verify:** Run `context-mode doctor` (or `ctx doctor`) to confirm all 6 hooks in `~/.qwen/settings.json` and that `context-mode` is in `mcpServers`; a missing hook reports a `fail`. Type `ctx stats` to confirm the context-window tokens saved this session (savings ratio + per-tool breakdown).

---

### Antigravity

**Status:** MCP-only (no hooks)

**Hook Paradigm:** MCP-only

Google Antigravity is an AI-powered IDE by Google/DeepMind. It shares the `~/.gemini/` directory structure with Gemini CLI but uses a separate config path for MCP servers. Antigravity does not expose a public hook API — only MCP integration is available.

**Configuration:**
- `~/.gemini/antigravity/mcp_config.json` (JSON format)
- MCP servers configured in `mcpServers` object

**Detection:**
- Auto-detected via MCP protocol handshake (`clientInfo.name: "antigravity-client"`)
- Env-var marker: `ANTIGRAVITY_CLI_ALIAS` (the canonical Antigravity marker, used for identification in `detect.ts`)
- Fallback: `CONTEXT_MODE_PLATFORM=antigravity` environment variable override
- Version detection reads `~/.gemini/extensions/context-mode/package.json`; a manual `mcp_config.json`-only install (no extension) may report version `not installed` even when the MCP server works correctly.

**Routing Instructions:**
- `GEMINI.md` must be **copied manually** to your project root (`cp node_modules/context-mode/configs/antigravity/GEMINI.md ./GEMINI.md`). Auto-write to project trees was disabled to avoid polluting git working trees ([#158](https://github.com/mksglu/context-mode/issues/158), [#164](https://github.com/mksglu/context-mode/issues/164)).
- Antigravity reads `GEMINI.md` natively (same filename as Gemini CLI, different content — no hook references)

**Capabilities:**
- PreToolUse: --
- PostToolUse: --
- PreCompact: --
- SessionStart: --
- Can modify args: --
- Can modify output: --
- Can inject session context: --

**Verify:** Run `context-mode doctor` to confirm context-mode is registered in `~/.gemini/antigravity/mcp_config.json` (the doctor reports MCP registration pass/fail and warns that Antigravity has no hook support). Failure signature: `ctx_*` tools absent ⇒ check the `mcp_config.json` path/command. Because Antigravity is MCP-only (no hooks, no status line), `ctx stats` is the primary way to confirm context-window savings — but savings depend on the agent honoring `GEMINI.md` routing (~60% compliance), so confirm `GEMINI.md` is present at the project root and re-check `ctx stats` after a few data-heavy operations.

**Known Issues / Caveats:**
- No hook support — only routing instruction files for enforcement (~60% compliance)
- Shares `~/.gemini/` directory with Gemini CLI — session DB uses project hash to prevent collision

**Sources:**
- Config path: [Gemini CLI Issue #16058](https://github.com/google-gemini/gemini-cli/issues/16058)
- MCP support: [Antigravity MCP docs](https://antigravity.google/docs/mcp)
- clientInfo: [Apify MCP Client Capabilities Registry](https://github.com/apify/mcp-client-capabilities)

---

### Antigravity CLI (`agy`)

**Status:** Plugin — MCP + routing rule + routing skill + bounded hooks

**Hook Paradigm:** MCP for tools + JSON stdin/stdout hooks

The standalone Antigravity CLI (`agy`) is the command-line companion to Google Antigravity. Unlike the Antigravity IDE, `agy` has a **native plugin system** (`agy plugin install|import`) and a hook surface (`~/.gemini/config/hooks.json`). context-mode ships as a first-class agy plugin (`configs/antigravity-cli/`) bundling the MCP server, a routing rule, a routing skill, and bounded `PreToolUse`/`PostToolUse`/`Stop` hooks. It shares the `~/.gemini/` session root with the rest of the Gemini family; `agy` reads its **global** MCP profile from `~/.gemini/config/mcp_config.json` (not the IDE's `~/.gemini/antigravity/mcp_config.json`).

**Verified:** agy 1.0.10 (Linux). The GitHub-subpath install requires **agy ≥ 1.0.7** (subpath + branch resolution landed in 1.0.7 — run `agy update` to upgrade). No agy hook event was added, removed, or renamed through 1.0.10, and the shared `~/.gemini/config/hooks.json` location has been canonical since agy 1.0.8, so the bundle's `PreToolUse`/`PostToolUse`/`Stop` wiring is current.

**Install:**
- `npm install -g context-mode` (the plugin's MCP server + hooks run the `context-mode` binary), then `agy plugin install https://github.com/mksglu/context-mode/tree/main/configs/antigravity-cli`. agy clones the repo, resolves the `configs/antigravity-cli` subpath (with branch resolution), and registers the bundle's native `plugin.json` + `mcp_config.json`, routing rule, routing skill, and hooks into its plugin profile under `~/.gemini/config/plugins/context-mode/`. If `ctx_*` tools don't appear after an upgrade, clear agy's stale tool-schema cache (`~/.gemini/antigravity-cli/mcp/context-mode/`) and restart agy (agy caches MCP schemas and doesn't refresh them).
- Already on Claude Code: `agy plugin import claude` can import that existing Claude setup, but the native context-mode agy bundle above is the supported path for agy hooks.
- MCP only: add context-mode to `~/.gemini/config/mcp_config.json` under `mcpServers` (`{"command":"context-mode"}`).

**Detection:**
- MCP protocol handshake (`clientInfo.name: "agy"` / `"antigravity-cli"`)
- Config-dir markers for a bare shell: `~/.local/bin/agy`, `~/.gemini/antigravity-cli/`, or `~/.gemini/config/mcp_config.json` — probed **before** the generic `~/.claude` / `~/.gemini` fallbacks so a gemini-cli→agy migrant is not mis-detected as Claude Code ([#774](https://github.com/mksglu/context-mode/issues/774))
- Fallback: `CONTEXT_MODE_PLATFORM=antigravity-cli` override

**Hook payload:** the only refs-backed field is the working directory, read from `workspace.current_dir` — an object field, per the upstream hook example (refs/platforms/antigravity-cli/examples/title/title.sh:10, examples/title/README.md:11). context-mode reads `workspace.current_dir` FIRST for the project dir, falling back to `workspacePaths[0]`. The remaining payload shape — `{ conversationId, stepIdx, toolCall: { name, args }, error, workspacePaths: [..], transcriptPath }` — is empirically-derived/**unverified** (no upstream agy doc confirms it) and is treated as best-effort. The event name arrives via argv (set in `hooks.json`), and the hook CWD is `~/.gemini/config`. context-mode maps these onto its routing/capture pipeline (`workspace.current_dir`/`workspacePaths[0]`→project dir, `conversationId`→session id [unverified], `run_command`→`Bash`, `view_file`→`Read`, `grep_search`→`Grep`, `list_dir`→`LS`, `read_url_content`→`WebFetch`, `search_web`→`WebSearch`).

**Capabilities:**
- PreToolUse: bounded blocking for mapped Bash/Read/Grep/WebFetch surfaces (`run_command`, `view_file`, `grep_search`, `web_fetch`, `read_url_content`)
- PostToolUse: capture-only (records executed tool calls into the session DB)
- Stop: best-effort capture-only session-end marker (registered, but not observed in agy `-p` probes)
- PreCompact / SessionStart / PreInvocation / PostInvocation: -- (not wired)
- Can modify args / output / inject context: -- (not verified/used)

**Known Issues / Caveats:**
- **Bounded hook enforcement.** context-mode registers PreToolUse only for mapped high-flood tools with existing routing branches. `list_dir` and `search_web` are normalized for PostToolUse capture but are not PreToolUse-routed.
- `PreInvocation` and `PostInvocation` are visible in agy's hook list but intentionally not registered; agy 1.0.6 `-p` probes did not emit them, and their payload/response semantics are not verified against context-mode's pipeline.
- agy's `PostToolUse` payload carries no tool-output text, so byte-accounting for tool output is unavailable on this surface; the tool call + project + error state are still captured.
- Shares `~/.gemini/` with Gemini CLI and Antigravity — session DB uses the project hash to prevent collisions.
- **Gemini function-calling tool exposure.** agy exposes MCP tools as Gemini function declarations, and Gemini's API rejects JSON Schema `const` / `additionalProperties` — a rejected schema makes agy **silently drop** that tool from the model's function list (the agent then hand-rolls the tool via shell scripts instead of calling it). context-mode emits Gemini-safe tool schemas (`const`→`enum`, `additionalProperties` stripped) so the `ctx_*` tools are exposed. agy also **caches** each server's tool schemas under `~/.gemini/antigravity-cli/mcp/<server>/` and does **not** refresh them on reconnect, so a cache captured by an older context-mode keeps the tools hidden — delete `~/.gemini/antigravity-cli/mcp/context-mode/` and restart agy to force a re-fetch.

**Verify:** Run `context-mode doctor` — it checks MCP registration and the PreToolUse/PostToolUse (best-effort Stop) hooks across both the plugin profile (`~/.gemini/config/plugins/context-mode/`) and the global manual profile, and prints `agy plugin install ...` / `context-mode upgrade` as the repair fix when degraded. In an agy session, type `ctx stats` (or call the `ctx_stats` MCP tool) to confirm the context-window savings for the session.

---

### Kiro

**Status:** Supported (MCP + native PreToolUse/PostToolUse hooks)

**Hook Paradigm:** JSON stdin/stdout

Kiro is an AWS agentic IDE and CLI. It supports MCP servers via `~/.kiro/settings/mcp.json` using the standard `mcpServers` JSON format. The Kiro CLI also fires `preToolUse`/`postToolUse` hooks over JSON stdin (exit code 2 blocking), which context-mode's `kiro` adapter implements for routing enforcement and tool-event capture. `agentSpawn` (the Kiro SessionStart equivalent) **is** wired — it returns `additionalContext` via JSON stdout for session-start context injection — alongside `userPromptSubmit`. The `stop` event is not wired.

**Detection:**
- Auto-detected via MCP protocol handshake (`clientInfo.name: "Kiro CLI"`)

**Configuration:**
- Hooks: `~/.kiro/agents/default.json` (top-level `hooks` key — this is where `context-mode upgrade` writes and where `context-mode doctor` validates the hook config; **not** `.kiro/hooks/`)
- MCP (global): `~/.kiro/settings/mcp.json` (JSON format, standard `mcpServers` object) — `context-mode doctor` validates this global path
- MCP (project): `.kiro/settings/mcp.json` — read by Kiro itself, but `context-mode doctor` validates only the global path, so prefer the global path (or both)

**Routing Instructions:**
- `KIRO.md` must be **copied manually** to the project root (`cp node_modules/context-mode/configs/kiro/KIRO.md ./KIRO.md`) — auto-write to project trees was disabled in [#158](https://github.com/mksglu/context-mode/issues/158)/[#164](https://github.com/mksglu/context-mode/issues/164). With `agentSpawn` wired, this copy is an optional belt-and-suspenders for session-start routing rather than a required workaround.

**Hook System:**
- `preToolUse`/`postToolUse` hooks via JSON stdin (implemented)
- Blocking: exit code 2 (similar to Gemini CLI pattern)
- `agentSpawn` (SessionStart equivalent) is wired — injects `additionalContext` on session start; `userPromptSubmit` is wired as well. `stop` is not wired.
- **Dispatcher note:** the CLI dispatcher maps only `pretooluse`/`posttooluse` for `kiro`. `agentSpawn` and `userPromptSubmit` are written into `~/.kiro/agents/default.json` by `context-mode upgrade` and fire via Kiro's runtime, but are not exposed as standalone `context-mode hook kiro <event>` dispatcher tokens today — so run `context-mode upgrade` to get the full hook set.

**Hook Commands:**
```
context-mode hook kiro pretooluse
context-mode hook kiro posttooluse
```
(Use `context-mode upgrade` to additionally wire `agentSpawn` and `userPromptSubmit` into `~/.kiro/agents/default.json`.)

**Built-in Tools:**
- `fs_read` / `read`, `fs_write` / `write`, `execute_bash` / `shell`, `use_aws` / `aws`

**Capabilities:**
- PreToolUse: Yes
- PostToolUse: Yes
- PreCompact: --
- SessionStart: Yes (via `agentSpawn`)
- Can modify args: --
- Can modify output: --
- Can inject session context: Yes (via `agentSpawn` `additionalContext`)
- Can block tools: Yes (exit code 2)

**Verify:** Run `context-mode doctor` to confirm both MCP registration (`~/.kiro/settings/mcp.json`) and the `preToolUse`/`postToolUse` hooks in `~/.kiro/agents/default.json`; a missing hook prints `Run: context-mode upgrade` as the fix. (This is the exact tool that catches a hook config placed in the wrong location.) Type `ctx stats` to confirm context-window savings for the session.

**Known Issues / Caveats:**
- `stop` is not wired. `agentSpawn` (SessionStart equivalent) and `userPromptSubmit` are written by `context-mode upgrade` into `~/.kiro/agents/default.json` but are not exposed as standalone CLI dispatcher tokens.
- Version detection is best-effort: `getInstalledVersion()` reads `~/.kiro/extensions/context-mode/package.json`, which a standard npm-global install does not create, so the doctor version line may report `not installed` even when Kiro is configured correctly.
- Kiro IDE hooks use a UI-based "Run Command" shell action; stdin format unverified

**Sources:**
- clientInfo.name: [Kiro GitHub Issue #5205](https://github.com/kirodotdev/Kiro/issues/5205)
- MCP config: [Kiro MCP Configuration docs](https://kiro.dev/docs/mcp/configuration/)
- CLI hooks: [Kiro CLI custom-agents configuration reference (hooks field)](https://kiro.dev/docs/cli/custom-agents/configuration-reference#hooks-field)

---

### VS Code Copilot

**Status:** Fully supported (preview)

**Hook Paradigm:** JSON stdin/stdout

VS Code Copilot uses the same JSON stdin/stdout paradigm as Claude Code with PascalCase hook names.

**Hook Names:**
- `PreToolUse` -- fires before a tool is executed
- `PostToolUse` -- fires after a tool completes
- `PreCompact` -- fires before context compaction
- `SessionStart` -- fires when a session starts

**Blocking:** `permissionDecision: "deny"` (same as Claude Code)

**Arg Modification:** `updatedInput` inside `hookSpecificOutput` wrapper (NOT flat like Claude Code)
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "updatedInput": { ... }
  }
}
```

**Output Modification:** `additionalContext` inside `hookSpecificOutput`, or `decision: "block"` + `reason`

**MCP Tool Naming:** MCP tools are surfaced under the host's own naming scheme (context-mode declares no tool-name prefix; tool naming is host-side).

**Session ID:** `sessionId` (camelCase, not `session_id`)

**Configuration:**
- Primary: `.github/hooks/*.json`
- Also reads: `.claude/settings.json`
- MCP config: `.vscode/mcp.json`

**Environment Detection:**
- `VSCODE_CWD` (workspace; also used as the project-dir source)
- `VSCODE_PID` (identification)
- `CONTEXT_MODE_PLATFORM=vscode-copilot` override

**Hook Commands:**
```
context-mode hook vscode-copilot pretooluse
context-mode hook vscode-copilot posttooluse
context-mode hook vscode-copilot precompact
context-mode hook vscode-copilot sessionstart
```

**Verify:** Run `context-mode doctor` (or `ctx doctor` in Copilot Chat) to confirm hooks in `.github/hooks/context-mode.json` and the MCP server in `.vscode/mcp.json` are registered; a missing entry reports a `fail` with the fix `context-mode upgrade`. Type `ctx stats` in Copilot Chat (or call the `ctx_stats` tool) to confirm context-window savings; the status line also shows live savings.

**Known Issues / Caveats:**
- Preview status -- API may change without notice
- Subagent-lifecycle hooks (Stop/SubagentStart/SubagentStop) are **not** wired for VS Code Copilot — only PreToolUse, PostToolUse, PreCompact, SessionStart ship.
- Matchers are parsed but IGNORED (all hooks fire on all tools)
- Tool input property names use camelCase (`filePath` not `file_path`)
- Response must be wrapped in `hookSpecificOutput` with `hookEventName`

---

### JetBrains Copilot

**Status:** Fully supported (preview)

**Hook Paradigm:** JSON stdin/stdout

JetBrains Copilot (GitHub Copilot plugin for JetBrains IDEs) uses the same JSON stdin/stdout paradigm and hook wire protocol as VS Code Copilot. It shares hook names, response format, and MCP tool naming conventions.

**Hook Names:**
- `PreToolUse` -- fires before a tool is executed
- `PostToolUse` -- fires after a tool completes
- `PreCompact` -- fires before context compaction
- `SessionStart` -- fires when a session starts

**Blocking:** `permissionDecision: "deny"` (same as VS Code Copilot)

**Arg Modification:** `updatedInput` inside `hookSpecificOutput` wrapper (same as VS Code Copilot)
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "updatedInput": { ... }
  }
}
```

**Output Modification:** `additionalContext` inside `hookSpecificOutput`, or `decision: "block"` + `reason`

**MCP Tool Naming:** MCP tools are surfaced under the host's own naming scheme (same as VS Code Copilot; context-mode declares no tool-name prefix).

**Session ID:** `sessionId` (camelCase)

**Configuration:**
- Hook config: `.github/hooks/*.json`
- MCP config: Settings UI (Settings > Tools > GitHub Copilot > MCP). Register the server as `context-mode` (no args) to match the shipped config; `npx -y context-mode` is the no-global-install alternative.

**Environment Detection:**
- `IDEA_INITIAL_DIRECTORY` (workspace; the primary JetBrains marker)
- `~/.config/JetBrains/` directory presence
- `CONTEXT_MODE_PLATFORM=jetbrains-copilot` override
- Note: `IDEA_HOME` and `JETBRAINS_CLIENT_ID` are **no longer** used for detection — don't rely on them.

**Hook Commands:**
```
context-mode hook jetbrains-copilot pretooluse
context-mode hook jetbrains-copilot posttooluse
context-mode hook jetbrains-copilot precompact
context-mode hook jetbrains-copilot sessionstart
```

**Verify:** Run `context-mode doctor` (or `ctx doctor` in Copilot Chat). The MCP-registration check intentionally reports **WARN** on JetBrains (MCP registration lives in the IDE Settings UI and is not CLI-inspectable), so confirm the context-mode server manually in Settings > Tools > GitHub Copilot > MCP. Type `ctx stats` in Copilot Chat (or call `ctx_stats`) to confirm context-window savings for the session.

**Known Issues / Caveats:**
- Preview status -- API may change without notice
- Subagent-lifecycle hooks (Stop/SubagentStart/SubagentStop) are **not** wired for JetBrains Copilot — only PreToolUse, PostToolUse, PreCompact, SessionStart ship.
- Shares the same hook wire protocol as VS Code Copilot
- MCP servers are configured via Settings UI, not a file (the doctor MCP check reports WARN by design)
- Requires GitHub Copilot plugin v1.5.57+

---

### GitHub Copilot CLI

**Status:** Supported (native hooks + MCP)

**Hook Paradigm:** JSON stdin/stdout

The standalone GitHub Copilot CLI (`copilot`) is user-home rooted under `~/.copilot` (override with `COPILOT_HOME`). Its hook config uses camelCase event keys, and its command output contract is **top-level** (`permissionDecision`, `modifiedArgs`, `additionalContext`) rather than the VS Code `hookSpecificOutput` wrapper — context-mode's `copilot-cli` adapter formats responses accordingly.

**Hook config keys:** (Copilot CLI 1.0.60 fires six events context-mode uses; verified against the `@github/copilot` binary)
- `preToolUse` -- fires before a tool is executed
- `postToolUse` -- fires after a tool completes
- `preCompact` -- fires before context compaction
- `sessionStart` -- fires when a session starts
- `userPromptSubmitted` -- fires when the user submits a prompt (user-prompt capture)
- `agentStop` -- fires when the agent stops (session-end capture)

**Hook config shape:** flat `{ "type": "command", "command": "..." }` entries (NOT the Claude-Code nested `{ matcher, hooks: [...] }` shape). context-mode also writes a top-level `"version": 1`, but this field is **optional** — the Copilot CLI accepts hook config files that omit it (copilot-cli changelog.md:1109). We pin it for self-documentation, not because the runtime requires it.

**Blocking:** top-level `permissionDecision: "deny"` + `permissionDecisionReason`

**Arg Modification:** top-level `modifiedArgs`

**Output Modification:** not supported (the posttooluse hook is capture-only)

**Context Injection:** top-level `additionalContext` — **SessionStart** is the confirmed channel (verified reaching the model). PreToolUse/PostToolUse `additionalContext` is best-effort/unverified; context-mode's `posttooluse` hook is capture-only and emits no context.

**Configuration:**
- **Plugin (recommended):** context-mode ships a Copilot CLI plugin bundle at `configs/copilot-cli/` — a root `.mcp.json` (MCP), `hooks.json` (the six capture hooks), a routing skill (`skills/context-mode/`), and a `.github/plugin/plugin.json` manifest. `copilot plugin install mksglu/context-mode:configs/copilot-cli` registers all of it in one command (no clone, no `context-mode upgrade`/agent call). The bundle's `.mcp.json` pins `CONTEXT_MODE_PLATFORM=copilot-cli`, so the server self-identifies as Copilot and `ctx_upgrade`/detection resolve `copilot-cli` even when Claude Code is co-installed (whose `~/.claude/` would otherwise win). Verified on Windows via `copilot --plugin-dir <bundle>`: `ctx_execute` resolves and the `PostToolUse` hook captures non-MCP tool I/O into the session DB. (This `.mcp.json` is the one committed instance in the repo — `.gitignore` un-ignores exactly this path, since a Copilot plugin has no other way to declare MCP.)
- MCP (manual, no plugin): register with Copilot CLI's own command — `copilot mcp add context-mode -- context-mode` — which writes `~/.copilot/mcp-config.json` (or `$COPILOT_HOME/mcp-config.json`). (Also `copilot mcp list` / `copilot mcp remove`.)
- Hook config (manual, no plugin): `$COPILOT_HOME/hooks/context-mode.json` or `~/.copilot/hooks/context-mode.json` (written by `context-mode upgrade`; standalone hooks fire — verified — independent of any plugin)
- Instruction files: `.github/copilot-instructions.md`, `AGENTS.md`

**Detection:**
- MCP protocol handshake (`clientInfo.name: "GitHub Copilot CLI"` / `"copilot-cli"`)
- Config-dir marker: a context-mode-written file under `~/.copilot/` (or `$COPILOT_HOME` — the marker check honors it) — `mcp-config.json` or `hooks/context-mode.json`, **not** a bare `~/.copilot/` directory, so a co-installed-but-unconfigured Copilot CLI is not mis-detected (probed before the generic `~/.claude` fallback)
- Fallback: `CONTEXT_MODE_PLATFORM=copilot-cli` override

**Hook Commands:**
```
context-mode hook copilot-cli pretooluse
context-mode hook copilot-cli posttooluse
context-mode hook copilot-cli precompact
context-mode hook copilot-cli sessionstart
context-mode hook copilot-cli userpromptsubmit
context-mode hook copilot-cli stop
```

**Known Issues / Caveats:**
- The top-level `"version": 1` is **optional**: the Copilot CLI accepts hook config files that omit the version field (copilot-cli changelog.md:1109). context-mode pins `"version": 1` for self-documentation; omitting it does not stop hooks from firing.
- Event names can be camelCase or PascalCase — the Copilot CLI accepts PascalCase event names alongside camelCase (copilot-cli changelog.md:1065). context-mode uses the native camelCase names; PascalCase is not silently ignored.
- `COPILOT_HOME` relocates the hook config, the MCP config, **and** the context-mode session-DB root (the adapter's `getSessionDir()` honors it, so the server reads sessions from the same place the hook runtime writes them).

**Sources:**
- Hooks schema: [GitHub Copilot CLI hooks configuration](https://docs.github.com/en/copilot/reference/hooks-configuration)
- Feature request: [#775](https://github.com/mksglu/context-mode/issues/775)

---

### Cursor

**Status:** Supported (native hooks, v1 scope)

**Hook Paradigm:** JSON stdin/stdout

Cursor uses native lower-camel hook names and flat hook entries in `.cursor/hooks.json` or `~/.cursor/hooks.json`. context-mode treats Cursor as a first-class adapter and does not rely on Claude-compat wrappers for official support.

**Hook Names:**
- `preToolUse` -- fires before a tool is executed
- `postToolUse` -- fires after a tool completes
- `stop` -- fires when agent turn ends (can send followup_message to continue loop)
- `afterAgentResponse` -- fires after assistant response (fire-and-forget, receives full response text)
- `sessionStart` -- Cursor v1 ships native `sessionStart`; context-mode wires the matching hook script (`hooks/cursor/sessionstart.mjs`) through the dispatcher, and every install path (plugin, `context-mode upgrade`) registers it.

**Blocking:** `{ "permission": "deny", "user_message": "..." }`

**Arg Modification:** supported — context-mode returns `{ "updated_input": ... }` from `preToolUse` (`canModifyArgs: true`).

**Output Modification:** not supported (`canModifyOutput: false` — `postToolUse` only ever emits `additional_context`).

**Session Context Injection:** `{ "additional_context": "..." }`

**Session ID Extraction Priority:**
1. `conversation_id` (stdin JSON)
2. `session_id` (stdin JSON)
3. `CURSOR_SESSION_ID` environment variable
4. `CURSOR_TRACE_ID` environment variable
5. Parent process ID fallback

**Platform Detection Env Vars:**
- `CURSOR_CWD` (workspace; also the project-dir source)
- `CURSOR_TRACE_ID` (MCP server context)
- `CURSOR_CLI` (integrated terminal context)
- `~/.cursor/` directory fallback (medium confidence)

**Configuration:**
- Project: `.cursor/hooks.json`
- User: `~/.cursor/hooks.json`
- MCP config: `.cursor/mcp.json` or `~/.cursor/mcp.json`
- **Marketplace plugin (recommended):** `.cursor-plugin/plugin.json` at the repo root auto-registers MCP, hooks, rules, and skills. Manifest explicitly points `hooks` at `./hooks/cursor/hooks.json` to avoid colliding with the Claude-format `./hooks/hooks.json`. Local install: `ln -s <repo> ~/.cursor/plugins/local/context-mode`. Plugin hook commands use `npx -y context-mode hook cursor <event>` so no global install is required.

**Plugin/native duplication:** `context-mode doctor` warns when both the plugin and `.cursor/hooks.json` register context-mode hooks (each event would otherwise fire twice). Remove one configuration to keep events single-fire.

**Hook Commands:**
```
context-mode hook cursor pretooluse
context-mode hook cursor posttooluse
context-mode hook cursor sessionstart
context-mode hook cursor stop
context-mode hook cursor afteragentresponse
```

> **npx vs bare command:** the Marketplace plugin (`hooks/cursor/hooks.json`) uses `npx -y context-mode hook cursor <event>`, so it needs **no** global install. The manual `.cursor/hooks.json` config and the config written by `context-mode upgrade` use the bare `context-mode hook cursor <event>` form, which **requires** `npm install -g context-mode` for the command to resolve.

**Verify:** Run `context-mode doctor`. It loads `.cursor/hooks.json` or `~/.cursor/hooks.json`, checks the required/optional hooks, flags **plugin/native duplicate firing** (each event firing twice when both the plugin and native hooks register context-mode — remove one), and warns about enterprise (`/Library/Application Support/Cursor/hooks.json`) and Claude-compat configs. Because Cursor cannot surface hook `additional_context` to the model (see below), `ctx stats` (or the `ctx_stats` MCP tool) is the primary way to confirm context savings — type it in agent chat to see the session's context-saved ratio.

**Known Issues / Caveats:**
- `preCompact` is intentionally not shipped in v1
- `stop` hook receives: `conversation_id`, `status`, `loop_count`, `transcript_path`; returns `followup_message` to continue
- `afterAgentResponse` is fire-and-forget (receives `text`, no return value expected)
- Hook payloads name MCP tools as `MCP:<tool>` and need adapter normalization
- Claude-compatible Cursor behavior exists, but native Cursor config is the supported path
- `additional_context` in postToolUse and sessionStart hooks is accepted but NOT surfaced to the model (Cursor upstream bug — [forum #155689](https://forum.cursor.com/t/native-posttooluse-hooks-accept-and-log-additional-context-successfully-but-the-injected-context-is-not-surfaced-to-the-model/155689), [forum #156157](https://forum.cursor.com/t/cursor-hooks-additional-context-not-injected-in-agent-context-in-posttooluse/156157)). Routing enforcement relies on `.mdc` rules file and MCP tool descriptions instead.

---

### OpenClaw

**Status:** Fully supported

**Hook Paradigm:** TS Plugin (gateway plugin via `api.registerHook()` / `api.on()`)

OpenClaw is an OpenAI-stack agent gateway. context-mode ships as a native gateway plugin that registers hooks through OpenClaw's plugin API rather than the JSON stdin/stdout wire protocol. The same plugin entry also registers context-mode as a context engine, owning compaction.

**Hook Names:** (the running plugin registers these via `api.on()`)
- `before_tool_call` -- equivalent to PreToolUse
- `after_tool_call` -- equivalent to PostToolUse
- `session_start` -- equivalent to SessionStart
- `before_compaction` / `after_compaction` + `registerContextEngine` (with `ownsCompaction`) -- equivalent to PreCompact
- `before_prompt_build` -- lifecycle hook for routing instruction injection
- `command:new` / `command:reset` / `command:stop` -- gateway command hooks registered via `api.registerHook()` (per-command session init/cleanup), distinct from the `api.on()` lifecycle hooks above

> Note: use the `api.on()` names (`before_tool_call`, `after_tool_call`, `session_start`) for tool/session lifecycle. The older `tool_call:before` / `tool_call:after` strings are **not** what the running plugin uses — `api.registerHook('before_tool_call')` registers silently but never fires.

**Blocking:** `return { block: true, blockReason: "..." }` from the `before_tool_call` handler

**Arg Modification:** mutate `event.params` in the `before_tool_call` handler (or return `{ params: ... }`)

**Output Modification:** not supported (the plugin paradigm exposes args/context, not the rendered tool output)

**Context Injection:** via `before_prompt_build` (session-level) and `registerContextEngine` (compaction-level)

**Path Resolution:**
- Detection root: `~/.openclaw/`
- Plugin install: `~/.openclaw/extensions/context-mode/`
- Project config: `openclaw.json` or `.openclaw/openclaw.json`
- Global config fallback: `~/.openclaw/openclaw.json`
- Project dir: `process.cwd()` (the gateway provides no dedicated env var)
- Memory dir: project-relative `./memory`
- Session dir: `~/.openclaw/context-mode/sessions/`
- Routing instructions: `AGENTS.md`

**Configuration:**
- `openclaw.json` registers context-mode under `plugins.entries["context-mode"]` (`{ "enabled": true }`)
- `plugins.slots.contextEngine = "context-mode"` enables ownership of compaction
- No CLI hook command; OpenClaw imports the plugin module directly

**Verify:** Run `context-mode doctor` to confirm the plugin is registered in `plugins.entries`, that it is enabled, and that `plugins.slots.contextEngine = context-mode` (owns compaction); a failed check prints the fix `context-mode upgrade`. Beyond loading, type `ctx stats` (maps to the `ctx_stats` MCP tool) to read the context-saved ratio — after a few routed tool calls it should climb toward ~98%, confirming routing is actually saving context.

**Notes / Caveats:**
- TS plugin paradigm — hooks run in-process, so there is no shell command to chmod and no platform-specific stdin/stdout quirks
- `ask` decisions are converted to `block` (with the original reason) since the gateway has no interactive confirmation path
- `context` decisions inside `before_tool_call` are dropped — context injection must be routed through `before_prompt_build` or the registered context engine
- Session ID falls back to `pid-${process.ppid}` when the gateway does not surface one

---

### Zed

**Status:** MCP-only (no hooks)

**Hook Paradigm:** MCP-only

Zed is a code editor with first-class MCP support but no hook pipeline. context-mode runs purely through Zed's `context_servers` configuration; routing enforcement falls back to the AGENTS.md instruction file (~60% compliance).

**Hook Support:**
- PreToolUse: --
- PostToolUse: --
- PreCompact: --
- SessionStart: --
- Stop: --
- Can modify args: --
- Can modify output: --
- Can inject session context: --

The hook adapter exists only to satisfy the interface contract — every parser throws `Error("Zed does not support hooks")` and every formatter returns `undefined`.

**Path Resolution:**
- Detection root: `~/.config/zed/`
- Settings file: `~/.config/zed/settings.json`
- MCP registration: `context_servers` object inside `settings.json`
- Session dir: `~/.config/zed/context-mode/sessions/`
- Routing instructions: `AGENTS.md` (sourced from `configs/zed/AGENTS.md` in the package, with an inline fallback if missing)

**Detection:**
- Auto-detected via the presence of `~/.config/zed/`
- Override via `CONTEXT_MODE_PLATFORM=zed`

**Verify:** Run `context-mode doctor` to confirm context-mode is registered under `context_servers` in `~/.config/zed/settings.json`; a fail prints the exact fix (add context-mode to `context_servers`). Expect one `warn` that Zed is MCP-only (no hooks) — that is normal. Because Zed has no hooks, routing is enforced only by `AGENTS.md` (~60% compliance), so run `ctx stats` to see the actual context-saved ratio for the session and confirm routing is happening.

**Notes / Caveats:**
- No hook adapter implies no automatic routing — the model must follow AGENTS.md voluntarily
- No marketplace or plugin registry for Zed; `getInstalledVersion()` always reports `not installed`
- `validateHooks` always returns a single `warn` row reminding the user that Zed exposes only MCP integration
- `configureAllHooks`, `setHookPermissions`, and `updatePluginRegistry` are intentional no-ops
- **Windows path divergence:** context-mode's doctor/detection only ever reads `~/.config/zed/settings.json`, even on Windows (there is no `%APPDATA%\Zed` branch in the adapter). If you edit `%APPDATA%\Zed\settings.json` the MCP server may still work for Zed-the-app, but `context-mode doctor` cannot verify it — the two paths are not interchangeable for context-mode tooling.

---

### Pi

**Status:** Fully supported via extension

**Hook Paradigm:** Extension (in-process hooks + MCP bridge)

[Pi](https://pi.dev) (Pi coding agent) has **no** JSON-stdio hooks and **no** native MCP support. context-mode ships as a Pi **extension** at `~/.pi/extensions/context-mode/`: the extension wires in-process hooks via Pi's JS-callback runtime API (`pi.on("session_start", fn)`, `pi.on("tool_call", fn)`, …) and bootstraps an MCP **bridge** that registers each `ctx_*` tool with Pi via `pi.registerTool()` — without that bridge the tools would be invisible (Pi 0.73.x has no native MCP). The dedicated adapter is mandatory: before it existed, `getAdapter("pi")` fell through to the Claude Code adapter and Pi sessions contaminated `~/.claude/context-mode/sessions/` (issue [#473](https://github.com/mksglu/context-mode/issues/473) follow-up).

**Install:** Install context-mode (`npm install -g context-mode`), then run `context-mode upgrade`, which syncs the extension into `~/.pi/extensions/context-mode/`. There is **no** `pi install npm:` / `packages[]` mechanism and **no** `mcp.json` to edit — the extension auto-bridges the MCP tools into Pi on `before_agent_start`; no manual MCP registration is needed or honored.

**Hook Names (wired in-process by the extension):**
- `session_start` -- SessionStart equivalent
- `tool_call` -- PreToolUse equivalent (blocks inline HTTP / curl / wget by returning `{ block: true }`)
- `tool_result` -- PostToolUse equivalent (event capture)
- `session_before_compact` -- PreCompact equivalent (resume snapshot)
- `turn_end` -- per-turn token/cost capture
- Plus `before_agent_start` (MCP bridge), `context`, `before_provider_response`, `session_compact`, `session_shutdown`.

> The **adapter-layer** `PlatformCapabilities` (`src/adapters/pi/index.ts`) are all-false by design (`mcp-only` adapter contract) because the integration lives in `extension.ts`, not the JSON-stdio path. The user-facing capabilities (PreToolUse/PostToolUse/PreCompact/SessionStart/Block Tools) are supported via the extension — see the Capability Matrix.

**Configuration / Path Resolution:**
- Config root: `~/.pi/`
- Settings file: `~/.pi/settings.json` (lightweight; Pi prescribes no canonical settings file, but this keeps parity with Claude Code)
- Extension: `~/.pi/extensions/context-mode/` (registration is by directory presence; the version-sync script writes its `package.json`)
- Session dir: `~/.pi/context-mode/sessions/`
- Routing instructions: `AGENTS.md`

**Detection:**
- Identification markers: `PI_CONFIG_DIR` (config dir override), `PI_SESSION_FILE` (active session path), `PI_COMPILED` (binary build marker), `PI_CODING_AGENT` (set in package-spawned MCP children, #760)
- `~/.pi/` directory presence (medium confidence)
- `CONTEXT_MODE_PLATFORM=pi` override
- Note: `PI_WORKSPACE_DIR` / `PI_PROJECT_DIR` are consumer-set workspace vars that do **not** auto-detect Pi (they set the workspace, not platform identity).

**Verify:** Run `context-mode doctor` — it detects Pi and validates the extension at `~/.pi/extensions/context-mode/` and the MCP bridge; the fix string is `context-mode upgrade`. Failure mode: if the MCP bridge fails to spawn the server, the `ctx_*` tools won't appear and stderr shows `[context-mode] WARNING: failed to bridge MCP tools to Pi`. To confirm savings, type `ctx stats` after a few tool calls to see tokens saved / savings ratio — it is backed by the per-session DB at `~/.pi/context-mode/sessions/`, so it reflects this Pi session's routing (the `turn_end` hook captures real per-turn tokens).

**Known Issues / Caveats:**
- Pi has no native MCP; the extension's MCP bridge is required for `ctx_*` tools to appear.
- If the project also has `CLAUDE.md`, Pi reads both `AGENTS.md` and `CLAUDE.md` and duplicates routing instructions in context — remove one.

---

### OMP (Oh My Pi)

**Status:** Fully supported via plugin (`omp plugin install context-mode`)

**Hook Paradigm:** Extension — TS plugin (in-process hooks) + native MCP self-registration

[Oh My Pi (OMP)](https://github.com/can1357/oh-my-pi) is a Pi-compatible harness that stores its agent state under `~/.omp/agent/` (overridable via the `PI_CODING_AGENT_DIR` env var). Before the dedicated adapter, OMP detection fell through to `pi` and storage rooted under another harness's directory (typically `~/.claude/`), per [issue #473](https://github.com/mksglu/context-mode/issues/473). The OMP adapter keeps `~/.omp/context-mode/` isolated; the OMP **plugin** (`src/adapters/omp/plugin.ts`) additionally wires real in-process hooks and self-registers the MCP server.

**Hook Support (via the OMP plugin):**
- `session_start` -- SessionStart equivalent (initializes the session row)
- `tool_call` -- PreToolUse equivalent; hard-blocks curl/wget/inline-HTTP by returning `{ block: true, reason }`
- `tool_result` -- PostToolUse equivalent (captures structured tool events into the session DB)
- `session_before_compact` -- PreCompact equivalent (persists a resume snapshot before compaction)
- `turn_end` -- per-turn token/cost capture (input/output/cache tokens + provider USD cost into the session DB)
- Can block tools: **Yes** (via `tool_call`)
- Can modify args / output / inject session context: -- (not wired)

> The **adapter-layer** `PlatformCapabilities` (`src/adapters/omp/index.ts`) are all-false by design because hooks are wired by the plugin, not the JSON-stdio adapter contract. The adapter's parse methods throw `Error("OMP hooks not wired by this adapter (MCP-only delivery)")` — this refers to the JSON-stdio path; the plugin hooks are what actually fire on the plugin install path.

**Path Resolution:**
- Agent root: `$PI_CODING_AGENT_DIR` if set, else `~/.omp/agent/`
- Settings file / MCP registration: `<agent root>/mcp.json` (the plugin self-registers context-mode under `mcpServers` in `~/.omp/agent/mcp.json`)
- Session dir: `~/.omp/context-mode/sessions/` (intentionally rooted at `~/.omp/`, not the agent dir, so multiple OMP instances on one host share an index without colliding session DBs)
- Routing instructions: `SYSTEM.md` (primary system-prompt file — project `.omp/SYSTEM.md` precedence, global `~/.omp/agent/SYSTEM.md` fallback); `AGENTS.md` is also auto-discovered. There is no `PI.md` loader upstream.

**Detection (priority order, listed BEFORE `pi` so OMP is never misclassified):**
- `PI_CODING_AGENT_DIR` env var (high confidence)
- `~/.omp/` directory presence (medium confidence)
- `CONTEXT_MODE_PLATFORM=omp` override

**Verify:** Run `omp plugin list` / `omp plugin doctor` (both show context-mode enabled), and `context-mode doctor` as a complementary check — it verifies the context-mode entry in `~/.omp/agent/mcp.json`. Failure mode: if `mcp.json` lacks the context-mode server, the `ctx_*` tools will not appear until OMP is restarted (the plugin self-registers on load). To confirm savings, run `ctx stats` after some work to see tokens-saved / savings ratio; OMP additionally records real per-turn token + provider cost via the `turn_end` hook, so the ~98% figure is user-verifiable.

**Notes / Caveats:**
- Routing compliance differs by install path: the **plugin** path enforces routing via in-process hooks (hard-block, ~98%); a bare **MCP-only** install (no plugin) depends on the model following `SYSTEM.md` voluntarily (~60%).
- `validateHooks` returns a `warn` row noting that **native OMP** pre/post tool-call hooks are not wired by the adapter — but the context-mode **plugin** hooks (above) are active on the plugin install path.
- No marketplace or plugin registry entry for OMP version detection; `getInstalledVersion()` reports `not installed` unless an `extensions/context-mode/package.json` exists under the agent dir.

---

## Capability Matrix (Quick Reference)

| Capability | Claude Code | Qwen Code | Gemini CLI | VS Code Copilot | JetBrains Copilot | GitHub Copilot CLI | Cursor | OpenCode | KiloCode | OpenClaw | Codex CLI | Kimi Code | Antigravity | Antigravity CLI (`agy`) | Kiro | Zed | Pi | OMP |
|-----------|:-----------:|:---------:|:----------:|:---------------:|:-----------------:|:------------------:|:------:|:--------:|:--------:|:--------:|:---------:|:---------:|:-----------:|:-----------------------:|:----:|:---:|:--:|:---:|
| PreToolUse | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes*** | Yes | -- | Bounded | Yes | -- | Yes (ext) | Yes (plugin) |
| PostToolUse | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | -- | Yes (capture-only) | Yes | -- | Yes (ext) | Yes (plugin) |
| PreCompact | Yes | Yes | Yes | Yes | Yes | Yes | -- | Yes* | Yes* | Yes | Yes**** | Yes | -- | -- | -- | -- | Yes (ext) | Yes (plugin) |
| SessionStart | Yes | Yes | Yes | Yes | Yes | Yes | Yes | -- | -- | Yes | Yes | Yes | -- | -- | Yes (agentSpawn) | -- | Yes (ext) | Yes (plugin) |
| Stop | Yes | -- | -- | Yes | Yes | Yes | Yes | -- | -- | -- | Yes | Yes | -- | Best-effort capture | -- | -- | Yes (ext) | Yes (plugin) |
| Modify Args | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Runtime***** | Yes | -- | -- | -- | -- | -- | -- |
| Modify Output | Yes | Yes | Yes | Yes | Yes | No | No | Yes** | Yes** | No | -- | Yes | -- | -- | -- | -- | -- | -- |
| Inject Context | Yes | Yes | Yes | Yes | Yes | Yes | Yes | -- | -- | Yes | Yes | Yes | -- | -- | Yes | -- | -- | -- |
| Block Tools | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | -- | Bounded | Yes | -- | Yes (ext) | Yes (plugin) |
| MCP/native tool support | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Native plugin | Native plugin | Native plugin | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |

\* OpenCode `experimental.session.compacting` is experimental
\*\* OpenCode has a TUI rendering bug for bash tool output (#13575)
\*\*\* Codex CLI PreToolUse deny works on all builds; on codex-cli >= 0.141.0 (#845) context-mode also performs PreToolUse context injection (`additionalContext`), detected at runtime via `codex --version`; older builds fail closed (redirect becomes deny). Context injection also works via PostToolUse and SessionStart.
\*\*\*\* Codex CLI PreCompact is runtime-gated on builds that emit the event
\*\*\*\*\* Codex CLI command rewriting (`updatedInput`) is runtime-gated on codex-cli >= 0.141.0 (#845); the adapter's static `canModifyArgs` is `false`, so older builds cannot modify args
- **(ext)** Pi wires hooks in-process via its extension runtime (`pi.on(...)`); **(plugin)** OMP wires hooks via its TS plugin `api`. In both, the adapter-layer `PlatformCapabilities` are all-false by design (mcp-only adapter contract) because the integration lives in the extension/plugin, not the JSON-stdio path.

---

## Hook Response Format Comparison

### Blocking a Tool

| Platform | Response Format |
|----------|----------------|
| Claude Code | `{ "permissionDecision": "deny", "reason": "..." }` |
| Gemini CLI | `{ "decision": "deny", "reason": "..." }` |
| VS Code Copilot | `{ "permissionDecision": "deny", "reason": "..." }` |
| JetBrains Copilot | `{ "permissionDecision": "deny", "reason": "..." }` |
| Cursor | `{ "permission": "deny", "user_message": "..." }` |
| OpenCode | `throw new Error("...")` |
| Codex CLI | `{ "hookSpecificOutput": { "permissionDecision": "deny" } }` or exit code 2 |
| Kimi Code | `{ "hookSpecificOutput": { "permissionDecision": "deny" } }` or exit code 2 |

### Modifying Tool Input

| Platform | Response Format |
|----------|----------------|
| Claude Code | `{ "updatedInput": { ... } }` |
| Gemini CLI | `{ "hookSpecificOutput": { "tool_input": { ... } } }` |
| VS Code Copilot | `{ "hookSpecificOutput": { "hookEventName": "PreToolUse", "updatedInput": { ... } } }` |
| JetBrains Copilot | `{ "hookSpecificOutput": { "hookEventName": "PreToolUse", "updatedInput": { ... } } }` |
| Cursor | `{ "updated_input": { ... } }` |
| OpenCode | `{ "args": { ... } }` (mutation) |
| Codex CLI | N/A (updatedInput in schema but not implemented) |
| Kimi Code | `{ "hookSpecificOutput": { "hookEventName": "PreToolUse", "permissionDecision": "allow", "updatedInput": { ... } } }` |

### Injecting Additional Context (PostToolUse)

| Platform | Response Format |
|----------|----------------|
| Claude Code | `{ "additionalContext": "..." }` |
| Gemini CLI | `{ "hookSpecificOutput": { "additionalContext": "..." } }` |
| VS Code Copilot | `{ "hookSpecificOutput": { "hookEventName": "PostToolUse", "additionalContext": "..." } }` |
| JetBrains Copilot | `{ "hookSpecificOutput": { "hookEventName": "PostToolUse", "additionalContext": "..." } }` |
| Cursor | `{ "additional_context": "..." }` |
| OpenCode | `{ "additionalContext": "..." }` |
| Codex CLI | `{ "hookSpecificOutput": { "additionalContext": "..." } }` |
| Kimi Code | `{ "hookSpecificOutput": { "hookEventName": "PostToolUse", "additionalContext": "..." } }` |

---

## CLI Hook Dispatcher

All hook-based platforms use the CLI dispatcher pattern instead of direct `node` paths:

```
context-mode hook <platform> <event>
```

The dispatcher resolves the hook script relative to the installed package and dynamically imports it. Stdin/stdout flow through naturally since it runs in the same process.

**Advantages over `node ./node_modules/...` paths:**
- Works from any directory (no per-project `npm install` needed)
- Single global install serves all projects
- `context-mode upgrade` updates hooks in-place
- Short, portable command strings in settings files

**Supported dispatches:**

| Platform | Events |
|----------|--------|
| `claude-code` | `pretooluse`, `posttooluse`, `precompact`, `sessionstart`, `userpromptsubmit`, `stop` |
| `gemini-cli` | `beforeagent`, `beforetool`, `aftertool`, `precompress`, `sessionstart` |
| `vscode-copilot` | `pretooluse`, `posttooluse`, `precompact`, `sessionstart` |
| `jetbrains-copilot` | `pretooluse`, `posttooluse`, `precompact`, `sessionstart` |
| `cursor` | `pretooluse`, `posttooluse`, `sessionstart`, `stop`, `afteragentresponse` |
| `codex` | `pretooluse`, `posttooluse`, `precompact`, `sessionstart`, `userpromptsubmit`, `stop` |
| `kimi` | `pretooluse`, `posttooluse`, `precompact`, `sessionstart`, `userpromptsubmit`, `stop`, `sessionend` |
| `qwen-code` | `pretooluse`, `posttooluse`, `precompact`, `sessionstart`, `userpromptsubmit` |
| `copilot-cli` | `pretooluse`, `posttooluse`, `precompact`, `sessionstart`, `userpromptsubmit`, `stop` |
| `antigravity-cli` | `pretooluse`, `posttooluse`, `stop` |
| `kiro` | `pretooluse`, `posttooluse` |

> **Gemini CLI `aftermodel`:** the shipped `configs/gemini-cli/settings.json` and the adapter's `generateHookConfig` emit an `AfterModel` hook for per-turn token/cost capture, but the CLI dispatcher's `HOOK_MAP['gemini-cli']` does **not** include `aftermodel` — so `context-mode hook gemini-cli aftermodel` currently fails open (no-op). The dispatcher table above reflects the events that actually route. AfterModel routing is inactive until `HOOK_MAP` gains the key.

> **Kiro:** the CLI dispatcher maps only `pretooluse`/`posttooluse` for `kiro`. The programmatic installer (`context-mode upgrade`) additionally writes `agentSpawn` (SessionStart-equivalent) and `userPromptSubmit` into `~/.kiro/agents/default.json`, so those events fire via Kiro's own runtime even though they are not exposed as standalone dispatcher tokens.

OpenCode, KiloCode, and OpenClaw use a TS plugin paradigm (no command dispatcher). Pi and OMP wire hooks in-process through their extension/plugin runtimes (`pi.on(...)` / OMP plugin `api`) rather than the CLI dispatcher; Antigravity IDE and Zed are MCP-only (no hooks).

---

## SQLite Backend Selection

context-mode automatically selects the best SQLite backend at runtime based on the environment:

| Priority | Condition | Backend | Why |
|----------|-----------|---------|-----|
| 1 | Bun runtime | `bun:sqlite` | Built-in, no native addon |
| 2 | Linux + Node.js >= 22.5 | `node:sqlite` | Built-in, avoids [SIGSEGV from V8 madvise bug](https://github.com/nodejs/node/issues/62515) |
| 3 | All other environments | `better-sqlite3` | Mature native addon, prebuilt binaries |

**Why node:sqlite on Linux?** Node.js's V8 garbage collector can call `madvise(MADV_DONTNEED)` on memory ranges that overlap `better-sqlite3`'s native addon `.got.plt` section, corrupting resolved symbol addresses and causing sporadic SIGSEGV crashes (1-4/hour on Node v22-v24). `node:sqlite` is compiled into the Node.js binary itself — no separate `.node` file, no `dlopen()`, no `.got.plt` to corrupt.

**Fallback:** If `node:sqlite` is unavailable (Node < 22.5), context-mode silently falls back to `better-sqlite3`. No user configuration needed.

**Override:** Not currently supported — backend selection is automatic. If you need to force a specific backend, open an issue.

---

## Utility Commands

All platforms support utility commands via MCP meta-tools:

| Command | What it does |
|---------|-------------|
| `ctx stats` | Show context savings, call counts, and session statistics |
| `ctx doctor` | Diagnose installation: runtimes, hooks, FTS5, versions |
| `ctx upgrade` | Update from GitHub, rebuild, reconfigure hooks |
| `ctx purge` | Permanently deletes all indexed content from the knowledge base |

**How they work:** The MCP server exposes `stats`, `doctor`, `upgrade`, and `purge` tools. The `<ctx_commands>` section in routing instructions (CLAUDE.md, GEMINI.md, AGENTS.md, copilot-instructions.md) maps natural language triggers to MCP tool calls. The `doctor` and `upgrade` tools return shell commands that the LLM executes and formats as a checklist. The `purge` tool permanently deletes all indexed content from the knowledge base and is the sole reset mechanism.
