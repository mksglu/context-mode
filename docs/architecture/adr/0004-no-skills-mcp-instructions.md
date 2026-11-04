# ADR-0004: No routing skills and no per-agent instruction files; prompts ship as MCP server instructions + tool descriptions

- Status: Accepted (2026-10-15). Owner asked on 2026-10-14 for no skill file per adapter, and accepted the r3/r4 fixes in `DECISIONS-r3.md`/`DECISIONS-r4.md`. TECH-SPEC §10 Q2 and Q10 are now decided; Q11 (all 10 agents release-gated by GP-LIVE-ROUTING) stays open, pending the S-CODEX spike. Q7, Pi's plugin mechanism, is resolved: `before_agent_start`.
- Related: TECH-SPEC §3 · ADR-0005 · ADR-0006

## Context

v1 (`origin/main` @ `5869f4fa`) ships prompt text in three places:

| Place | Files | Size |
|---|---|---|
| `SKILL.md` | 11: `skills/` ×8, `configs/copilot-cli/skills/context-mode`, `configs/antigravity-cli/skills/context-mode`, `.claude/skills/context-mode-ops` (maintainer only) | the routing skill alone is 16,683 B; its 3 copies are 300, 38 and 77 lines |
| Per-agent routing files in `configs/` | 13: `CLAUDE.md`, `AGENTS.md` ×6, `GEMINI.md` ×2, `QWEN.md`, `SYSTEM.md`, `copilot-instructions.md` ×2 | 55,870 B |
| Tool descriptions | 11 tools | 17,075 chars of descriptions + 9,749 chars of input schemas. 5 descriptions are longer than Claude Code's 2,048-char cut |

- Manifests that ship skills:
  - `.claude-plugin/plugin.json:30`
  - `.codex-plugin/plugin.json:24`
  - `.cursor-plugin/plugin.json:25`
  - `configs/antigravity-cli/plugin.json:11`
  - `configs/copilot-cli/.github/plugin/plugin.json:20`
  - `package.json:34` (`pi.skills`) and `package.json:68` (`files`)
- Adapters that write routing files into user space: Codex (`ROUTING_INSTRUCTIONS_PATH = "configs/codex/AGENTS.md"`), Kimi, OpenClaw, Qwen (`targetPath: "QWEN.md"`).
- The v1 server sends **no** `instructions`. `new McpServer({name, version})` at `src/server.ts:143`, and a live `initialize` returned `instructions: null`.

MCP defines one portable channel for this: `InitializeResult.instructions`.
- Schema 2025-11-25: "this information MAY be added to the system prompt".
- Schema 2026-07-28: instructions "should not duplicate information already in tool descriptions".

Which agents pass `instructions` to the model is in TECH-SPEC §3.1. Summary:
- **Confirmed** in source or by a live probe: Claude Code, Gemini CLI, Qwen Code, OpenCode 2, VS Code Copilot.
- **Pi:** does not receive `instructions` over MCP in v2. v2 runs Pi as an in-process plugin, not over MCP (TECH-SPEC §3.1, §3.9; matches Decision 5 below), so it gets the same `instructions.md` bytes through its `before_agent_start` plugin hook instead.
- **Codex:** the instructions are wired to the tool namespace, but a live probe saw nothing at session start. S-CODEX (closed 2026-10-17, `https://github.com/mksglu/context-mode/blob/274600e2ffab843e89c1dfa09b0d649e650c962f/tickets/spikes-r5/S-CODEX.md`) confirms by live probe (3/3, ChatGPT login, `gpt-6-astra`) that this is deferred loading: the model sees no namespace marker and no tool description before it calls a tool, and sees the full description only once it looks up / calls the tool.
- **Copilot CLI:** verified by live probe (`copilot plugin install` on Copilot CLI 1.0.60, same method v1 used in 9f34c6f1): a plugin can register MCP servers and hooks, and `InitializeResult.instructions` reaches the model. This replaces the earlier "probable; no source check" line.
- **Not supported:** Kiro (kirodotdev/Kiro#11096 is still open).
- **No evidence:** ZCode.
- **This project's own routing-block style.** This repo's maintainer-facing `CLAUDE.md` uses a MANDATORY/BLOCKED caps-heavy routing block. That pattern is named in #946 as one that can trip AI safety classifiers. `CLAUDE.md` is in this ADR's delete scope for Claude Code (it is one of the 13 per-agent routing files in the Context table above) and must be rewritten in plain style, not caps-heavy MANDATORY/BLOCKED blocks, when decision 4 is carried out.

## Decision

1. **One prompt source in the repo:** `src/prompt/instructions.md` and `src/prompt/tools/<tool>.md`. The build inlines them into the bundle. No other file in the repo or in user space carries routing text.
2. **Two channels, split by job, with no duplication:**
   - **Server `instructions`:** what the server is for, when to search for and use its tools, and when not to.
   - **Tool descriptions:** what each tool does and how to call it. Each one is self-contained, because it is the only channel on agents that ignore `instructions`.
3. **Exception (2026-10-14):** three user-command skills stay, `/ctx-stats`, `/ctx-doctor`, `/ctx-upgrade`. They hold no routing text; each only calls its tool (TECH-SPEC §3.9). One `skills/` source dir.
4. **Deleted:**
   - the routing skill and the other v1 `SKILL.md` files (11), replaced by the 3 command skills
   - all 13 routing files
   - the `skills` keys in every manifest and in `package.json`
   - every adapter code path that writes `AGENTS.md`, `QWEN.md`, `GEMINI.md`, `CLAUDE.md` or `copilot-instructions.md`

   The maintainer skill `.claude/skills/context-mode-ops` is removed from the repo too (Q4, decided 2026-10-14).
4. Agents that ignore `instructions` (Kiro, possibly ZCode) get routing from tool descriptions only. No steering file is added for them.
5. Pi runs as an in-process plugin, not over MCP. It gets the same `instructions.md` bytes through its `before_agent_start` plugin hook (TECH-SPEC §3.1, §3.9).

## Consequences

- One text to review, lint (ADR-0005) and golden-test (GP2).
- On Claude Code with tool search on, `instructions` is the **only** context-mode text the model sees before it searches for a tool. This is verified by a live probe (TECH-SPEC §3.1). It makes ADR-0006 necessary.
- On Codex, the live probe showed neither instructions nor tool descriptions at session start. Routing quality on Codex has to be measured in E2E-live before release.
- User-owned instruction files are never touched again. This removes a v1 bug class: install and upgrade overwrote user hooks and config (#1235, #1239, #1160).
- On OpenCode 2, the 3 command skills have no slash-command path: OpenCode 2 only lets the model call a `skill` tool with a matching id (`packages/core/src/tool/plugin/skill.ts`, pinned `1438073`). A user cannot type `/ctx-stats` there and be guaranteed it runs; the model has to decide to call `skill` with that id. This gap is accepted, named here, and detailed in TECH-SPEC §3.9 (S-SKILLS), the same pattern as GS5's other per-agent carve-outs.

## Alternatives considered

- **Per-agent instruction files (AGENTS.md etc.).** Rejected: 13 diverging copies, written into user-owned files.
- **Skills.** Rejected: each agent packages them differently, MCP-only agents never load them, and they need one copy per agent.
- **MCP prompts.** Rejected for routing: the user has to invoke them. One prompt is kept as a user command: `ctx-stats` (TECH-SPEC §3.9).

## Changes

- r4: scoped this project's own `CLAUDE.md` into the delete/rewrite list (A56); verified Copilot CLI's `instructions` support by live probe instead of "probable" (B9); resolved Pi's plugin mechanism as `before_agent_start`, closing Q7 (B19); named the OpenCode 2 command-skill gap explicitly (B16).
