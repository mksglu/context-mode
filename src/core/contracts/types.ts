// impl/01 §2, impl/00 §3.1 verbatim. Pure types: no runtime code.
import type { AgentId } from "./agents.js";
import type { DatabaseSync } from "node:sqlite";
export type { AgentId } from "./agents.js";

export type CanonicalEventName = "SessionStart" | "UserPromptSubmit" | "PreToolUse" | "PostToolUse"; // ADR-0001, PRD §10.1
export type AuxEventName = "PreCompact" | "Usage"; // PreCompact: pending_compact on gemini, copilot-cli, vscode (ADR-0009 §6); Usage: OpenCode step-finish cost row (D-M5-arch-2)

export interface CanonicalHookEvent {
  event: CanonicalEventName | AuxEventName;
  agent: AgentId;
  sessionId: string;
  cwd: string;
  agentId?: string;        // subagent marker; presence = subagent (Q23)
  agentType?: string;      // selects tool-set row only
  source?: "startup" | "resume" | "clear" | "compact"; // SessionStart
  prompt?: string;         // UserPromptSubmit
  tool?: ToolCall;         // Pre/PostToolUse
  result?: ToolResultInfo; // PostToolUse
  turn?: number;
}

export interface ToolCall {
  name: string;            // host name as received, e.g. mcp__context-mode__ctx_execute
  canonicalName: string;   // "Bash" | "Read" | "Grep" | "WebFetch" | "ctx_execute" | ... | "mcp:<server>:<tool>"
  input: Record<string, unknown>;
  callId?: string;
}

// persistedPath (D-M2-SHAPE-2): the host kept the whole output in this file and `text` is only its head.
// blocks (D-M2-MCP-1): the host gave an MCP content-block array; a replace must be one text block.
// keep: a block is not text (image, resource), so the original result stays.
export interface ToolResultInfo { isError: boolean; bytes: number; text?: string; exitCode?: number; persistedPath?: string; blocks?: boolean; keep?: boolean; shape?: Record<string, unknown>; }
// shape (D-M2-MCP-1): the Grep content response as the host gave it; a replace keeps its fields and swaps content.

export type Decision =
  | { kind: "allow" }
  | { kind: "hint"; text: string; onceKey: string }
  | { kind: "deny"; reason: string; rewritten?: string }       // ADR-0008: reason carries the rewrite; never allow+updatedInput (Q3)
  | { kind: "replace"; output: string };                        // case C, PostToolUse updatedToolOutput (ADR-0016)

// native shape produced by adapter.encode; stderr is set only by the kiro encode (exit 2 returns STDERR to the agent,
// Kiro CLI 2.x reference; D-HF-KIRO-SHELL-1).
export interface HookOutput { stdout: string; stderr?: string; exitCode: 0 | 2; }

export type EventKind = "prompt" | "edit" | "cmd" | "toolerr" | "index" | "cost" | "decision"; // ADR-0009 §1 + GP10 + DECISIONS-r6 D3
export interface JournalRow {
  seq: number; session_id: string; worktree: string; agent: AgentId;
  kind: EventKind; tool: string | null; key: string | null; path: string | null;
  ok: 0 | 1; exit_code: number | null; bytes: number; body: string; turn: number;
  sandbox_bytes: number; returned_bytes: number; created_at: number; accessed_at: number;
}
export type NewJournalRow = Omit<JournalRow, "seq" | "created_at" | "accessed_at">;

export interface ProjectContext {
  projectKey: string;      // sha256(git common dir realpath) hex, first 16 chars
  projectDir: string;      // ~/.context-mode/projects/<projectKey>
  dbPath: string;          // <projectDir>/context.db
  worktree: string;        // realpath of this worktree root
  containmentRoot: string; // git common dir parent; all worktrees inside (#954, #1294)
  agent: AgentId;
  source: ProjectSourceKind;
}
export type ProjectSourceKind = "env:CLAUDE_PROJECT_DIR" | "arg:--agent+cwd" | "arg:workspaceFolder" | "spawn-cwd" | "pi:ctx.cwd";

export interface ToolContext { project: ProjectContext; sessionId: string; turn: number; signal: AbortSignal; clientInfo?: { name: string; version: string }; protocolVersion: string; }
// DEVIATIONS D-M2-2: the handler supplies the journal facts only it knows; the server stays the one
// write path and uses the D-M1-T10-1 defaults when `journal` is absent.
export interface JournalFacts { kind: EventKind; key: string | null; path: string | null; exit_code: number | null; }
export interface ToolReply { text: string; isError: boolean; sandboxBytes: number; journal?: JournalFacts; }
export interface ToolDef<I> { name: string; description: string; schema: import("zod").ZodType<I>; readOnly: boolean; alwaysLoad: boolean; handler(input: I, ctx: ToolContext): Promise<ToolReply>; }

// ADR-0020: "package" = file inside the installed package dir; "home-file"/"home-dir" = path under HOME;
// "in-process" = plugin entry the host loads from the package dir.
export interface HookChannel { kind: "package" | "home-file" | "in-process"; path: string; }
export interface SkillChannel { kind: "package" | "home-dir"; path: string; }

export interface AdapterRow {
  id: AgentId;
  installMode: "marketplace" | "config-mcp" | "extension" | "plugin" | "mcp-entry" | "hooks+mcp" | "in-process";
  projectSource: ProjectSourceKind;
  toolNamePrefix: string;  // e.g. claude-code/vscode/kiro "mcp__context-mode__", codex "mcp__context_mode__" (underscore — DECISIONS-r9 R1), gemini "mcp_context-mode_", opencode "context-mode_"
  nativeTools: { shell: string[]; read?: string[]; grep?: string[]; webfetch?: string[]; edit?: string[] }; // DECISIONS-r9 R4; feeds the PreToolUse/PostToolUse matcher and in-body filters
  execReadOnlyHint: boolean; // DECISIONS-r9 R5; true only for codex, sets annotations.readOnlyHint on ctx_execute
  eventMap: Partial<Record<CanonicalEventName | AuxEventName, string>>; // canonical → native name
  compactDelivery: "sessionstart" | "pending-flag" | "pi-flag" | "opencode-cache" | "none";
  compactSummary: "host" | "none";  // "host": host writes its own compact summary (verified by LV-COMPACT, M3); "none": inject the 2,048 B D1 block via the ADR-0009 §6 path. DECISIONS-r6 D6.
  hookTimeoutMs: number;
  denyChannel: "deny-reason" | "hint-only";
  hookChannel: HookChannel;   // ADR-0020: the one hook channel setup writes (required, no exception rows)
  skillChannel: SkillChannel; // ADR-0020: the one skill channel setup writes (required)
  decode(raw: unknown): CanonicalHookEvent;
  encode(ev: CanonicalHookEvent, d: Decision, extra?: string): HookOutput;
}

// Store handle (impl/02 §6; signatures per impl/00 §4, DEVIATIONS D-M1-1).
export interface DbHandle {
  raw: DatabaseSync;
  projectKey: string;
  path: string;
  readOnly?: boolean; // D-CKPT-LAT-1: a read-only handle writes nothing, closeDb skips the checkpoint
}

// ContentStore types (impl/05 §0 verbatim).
export type SourceKind = "path" | "content" | "url";
export interface SourceRow {
  id: number; projectKey: string; sessionId: string; worktree: string; agent: AgentId;
  kind: SourceKind; label: string;   // label = path, "content", or final URL
  bytes: number; chunkCount: number; createdAt: number;
}
export interface Chunk { ord: number; text: string; bytes: number; title?: string; }
export type SearchScope = "session" | "worktree" | "project";
export interface Hit { sourceId: number; label: string; ord: number; snippet: string; score: number; }

// ctx_search sort:"timeline" rows (ADR-0009 §8.1, DECISIONS-r9 M14-M18, DEVIATIONS D-M2-3).
// One row shape for the three sources the timeline merges: ContentStore ("content"), SessionDB
// ("session", journal rows) and the host's auto-memory files ("memory").
export type SearchSort = "relevance" | "timeline";
export type TimelineOrigin = "content" | "session" | "memory";
export interface TimelineRow {
  origin: TimelineOrigin;
  ts: number;               // epoch ms UTC (M16: events created_at, sources created_at, memory file mtime)
  seq: number | null;       // journal seq; null for content and memory rows (M17)
  sourceId: number | null;  // content rows only; tie-break after seq (M17)
  path: string | null;      // memory rows: file path; tie-break after seq (rule 5)
  label: string;            // "<source>" field of the output line (rule 8)
  text: string;             // row body; the reply shows its first line (rule 8)
}

// M2 tool inputs: the TS shapes of the zod schemas in src/core/tools/registry.ts
// (impl/04 §2.1, §3.1; impl/05 §3, §6, DECISIONS-r9 V23). The schema is the runtime check.
export interface ExecuteInput {
  language: string;         // "shell" | "powershell" | "javascript" | "typescript" | "python" (EXEC_LANGUAGES) or any PATH runtime (A9)
  code: string;
  file?: string;
  intent?: string;
  timeoutMs?: number;       // positive integer, at most EXEC_TIMEOUT_MS (Q8)
  background?: boolean;
  summary?: boolean;
}
export interface BatchInput { commands: string[]; queries: string[]; }
export interface CtxIndexInput { path?: string; content?: string; url?: string; source?: string; } // exactly one of path/content/url (ONE_OF_INPUT)
export interface CtxSearchInput {
  queries: string[];
  scope?: SearchScope;
  source?: string;
  offset?: number;          // relevance only; with "timeline" -> INVALID_ARGS (M23)
  sort?: SearchSort;
  after?: number;           // timeline only, epoch-ms cursor (M18); with "relevance" -> INVALID_ARGS (M23)
}

// M3 enforcement parser types (impl/08 §1.1, §2.1, §2.2, §2.3 step 2a, §3.1, §6.2).
// "op": && || ; | ( )   "io": > >> < 2> 2>&1 &> << <<-
// "unhandled": a span the lexer does not read as a command: [[ ]] (( )) $( ) ` ` and a heredoc body.
export type TokenKind = "word" | "op" | "io" | "unhandled";
export interface Token { kind: TokenKind; text: string; start: number; end: number; }

export interface SimpleCommand {
  argv0: string;               // first word, quote characters stripped
  args: string[];
  redirectsToFile: boolean;    // > / >> to a real file, curl -o / wget -O to a real file
  endsInBoundedSink: boolean;  // last pipeline segment is head -c N, wc, grep -c, or a whitelisted jq
  raw: string;                 // original substring for this segment
  insideConstruct?: string;    // DECISIONS-r9 P1: "case", or the function's name
  wrappedBy?: string[];        // impl/08 §3.1: unwrapped wrappers, outermost first
}

// DECISIONS-r9 P2: the only six ParseError codes.
export type ParseErrorConstruct =
  | "process-substitution" | "unterminated-quote" | "unterminated-heredoc" | "coproc" | "select" | "nesting-too-deep";
export type ParseResult =
  | { ok: true; commands: SimpleCommand[] }        // one per pipeline segment, chain-split
  | { ok: false; construct: ParseErrorConstruct };

export type DenyKind = "curl" | "http" | "build" | "webfetch"; // impl/08 §6.2 denyMessage kind

// M4 tools-session (impl/06 "Shared types"; DEVIATIONS D-M4-arch-2: compaction reads JournalRow, so no EventRow).
export type CandidateSection =
  | "last_request"
  | "open_errors"
  | "changed_files"
  | "decisions"
  | "earlier_requests"
  | "indexed_sources";

export interface Candidate {
  section: CandidateSection;
  seq: number;
  turn: number;
  text: string;         // whole line, never pre-cut
  bytes: number;        // UTF-8 byte length of `text`
  repeatCount: number;  // how many journal rows this candidate folds (same key)
  pinned: boolean;      // true only for the single "last_request" row
}

export interface ScoredCandidate extends Candidate {
  score: number; // integer
}

// M4 tool inputs (impl/06 §4-§6; zod schemas in src/core/tools/registry.ts). Handlers take (input, ctx: ToolContext), D-M4-arch-3.
export interface CtxResumeInput { session?: string; seq?: number; }
export interface CtxStatsInput {} // no fields; any key is STATS_UNKNOWN_FIELD_LINE
export interface CtxPurgeInput { session?: string; source?: string; project?: boolean; } // exactly one (impl/06 §6 step 1)

// tools-ops (impl/07 §0, A-T1; ADR-0010, ADR-0011)
export type DoctorCheckId = "D1" | "D2" | "D3" | "D4" | "D5" | "D5b" | "D6" | "D7" | "D8" | "D9" | "D10" | "D11";
export interface DoctorRow {
  id: DoctorCheckId;
  label: string;                 // e.g. "version", "context.db"
  status: "PASS" | "FAIL" | "UNKNOWN";
  detail: string;                // the <cause>, plain English, one line
  fixCommand?: string;           // the <command>; omitted when status is PASS
}
export interface V1Finding { file: string; path: string; reason: string; } // ADR-0011 §"v1 cleanup"
export type UpgradeMode = "upgrade" | "uninstall";
export interface UpgradeChangeRow { area: string; before: string; after: string; }
export interface HostConfigEdit { path: string; before: unknown; after: unknown; } // one key changed
// impl/07 §2 and §5-§6 exports, named here so ops/ and tools/ share one shape (DEVIATIONS D-M5-C2-2).
export type HostConfigFormat = "json" | "jsonc" | "toml";
export interface HostConfigResult { text: string; format: HostConfigFormat; edits: HostConfigEdit[]; }
export interface CtxUpgradeInput { mode?: UpgradeMode; confirmDelete?: boolean; } // A-T4
export interface CtxDoctorInput {} // A-T3: no fields; any key is UNKNOWN_FIELD

/** r3-ledger: one line unit of a stored output, as queryUnits returns it; the MMR pool of recall. */
export interface UnitCandidate { sourceId: number; ord: number; label: string; body: string; score: number }
