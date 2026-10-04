# context-mode

Language for the context-mode MCP plugin: what we call the things it manages.

## Language

**Dashboard**:
The local, read-only web view of the user's SQLite data, started from the CLI and alive only while that process runs.
_Avoid_: tablero, local insight, web UI

**Insight**:
The hosted analytics product at context-mode.com/insight. Distinct from the Dashboard, which never leaves the user's machine.
_Avoid_: dashboard (when meaning the hosted product)

**Report**:
The terminal-rendered narrative that `ctx_stats` returns. Text-only; the Dashboard is its visual sibling, not its replacement.

**Adapter**:
A supported agent platform (Claude Code, Codex, OpenCode…) whose hooks write context-mode data under its own config directory.
_Avoid_: platform (when meaning the integration), client

**Session event**:
One recorded fact about a conversation: a decision, an error, a file touched. The atomic unit of analytics.

**Capture**:
One command output indexed into the knowledge base instead of entering the context window.

**Rescue bytes**:
Conversation content recovered from a compaction via snapshot replay.
