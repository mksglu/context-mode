/**
 * MCP-stdio bridge for the Pi Coding Agent extension.
 *
 * Pi 0.73.x has no native MCP support — its README is explicit:
 *   > "No MCP. Build CLI tools with READMEs (see Skills), or build an
 *   >  extension that adds MCP support."
 *
 * Without this bridge, the routing block tells the LLM to call
 * `ctx_execute`, `ctx_search`, etc. — but those tools never enter Pi's
 * tool list, so the LLM cannot reach them. context-mode then becomes a
 * pure cost on Pi (~2.5K tokens of system-prompt overhead with 0
 * actual ctx_* calls). Reported in mksglu/context-mode#426.
 *
 * The bridge spawns `server.bundle.mjs` as a long-lived child via stdio
 * JSON-RPC, performs the MCP handshake, calls `tools/list` once, and
 * registers each returned tool through `pi.registerTool({ … })`. Each
 * tool's `execute()` forwards into the child via `tools/call` — same
 * code path Claude Code, Gemini CLI, and the other adapters use, so
 * Pi behavior matches the rest of the platform suite.
 *
 * No external dependencies — pure node:child_process + JSON line frames.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawn, execSync, type ChildProcess } from "node:child_process";
import { detectRuntimes } from "../../runtime.js";
import { foreignWorkspaceEnv, foreignIdentificationEnv } from "../detect.js";

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

// ── Fork-bomb prevention (#516) ──────────────────────────────────────
//
// Original bug: `spawn(process.execPath, [serverScript])` recursively
// re-executed the Pi binary on Bun-only systems where `process.execPath`
// IS pi itself. Each spawn re-loaded context-mode → spawned again →
// took the box down.
//
// Defence in depth:
//   1. resolveJsRuntimeForBridge() refuses pi-named binaries even when
//      detectRuntimes() returns one, falling back to PATH-resolved
//      node/bun.
//   2. Spawn passes CONTEXT_MODE_BRIDGE_DEPTH=1 in child env so any
//      transitive bridge load can detect the recursion via env counter.
//   3. bootstrapMCPTools() aborts if CONTEXT_MODE_BRIDGE_DEPTH > 0 in
//      its own env — catches recursion that bypasses the binary-name
//      check (e.g. a `node` shim that re-execs Pi).

const PI_BINARY_BASENAME = /^pi(\.exe)?$/i;
const BRIDGE_DEPTH_ENV = "CONTEXT_MODE_BRIDGE_DEPTH";
const isWindows = process.platform === "win32";

function basename(p: string): string {
  const segs = p.split(/[\\/]/);
  return segs[segs.length - 1] ?? "";
}

function whichOnPath(cmd: string): string | null {
  try {
    const probe = isWindows ? `where ${cmd}` : `command -v ${cmd}`;
    const out = execSync(probe, { encoding: "utf-8", stdio: "pipe" })
      .trim()
      .split(/\r?\n/)[0]
      ?.trim();
    return out && out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

export interface ResolveDeps {
  detect?: () => { javascript: string | null };
  which?: (cmd: string) => string | null;
  execPath?: string;
}

/**
 * Resolve a JS runtime safe to spawn the MCP server with.
 *
 * Returns `null` when no real runtime is reachable (caller must skip
 * the bridge gracefully — see bootstrapMCPTools). Pi-named binaries are
 * explicitly rejected at every step to prevent the #516 fork bomb.
 */
export function resolveJsRuntimeForBridge(deps: ResolveDeps = {}): string | null {
  const detect = deps.detect ?? (() => detectRuntimes());
  const which = deps.which ?? whichOnPath;
  const execPath = deps.execPath ?? process.execPath;

  const isPi = (p: string | null | undefined): boolean =>
    !!p && PI_BINARY_BASENAME.test(basename(p));

  // 1. Prefer detectRuntimes().javascript when it is NOT pi.
  let candidate: string | null = null;
  try {
    candidate = detect().javascript ?? null;
  } catch {
    candidate = null;
  }
  if (candidate && !isPi(candidate)) return candidate;

  // 2. Fall back to PATH-resolved node, then bun.
  for (const cmd of ["node", "bun"]) {
    const resolved = which(cmd);
    if (resolved && !isPi(resolved)) return resolved;
  }

  // 3. Last resort: process.execPath only if it is not pi.
  if (execPath && !isPi(execPath)) return execPath;

  return null;
}

export interface MCPTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface MCPCallResult {
  content?: Array<{ type?: string; text?: string }>;
  isError?: boolean;
}

// Bridge-imposed timeout for protocol-handshake methods (initialize,
// tools/list). These MUST be bounded: a server that never replies to
// initialize would otherwise block Pi's bridge bootstrap indefinitely.
// `tools/call` deliberately has NO bridge ceiling (#643) — long-running
// ctx_execute (test suites, builds, cargo test) was rejected by a 120s
// hardcoded bound even though the executor child would have finished.
// Responsibility for bounding a tool call belongs to the executor
// layer (per-tool timeout / background mode / Pi-level cancel), not
// to the transport.
const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;

// Retry budget for the bridge bootstrap `initialize` handshake (#647).
//
// On cold NFS home dirs, first JIT compile of server.bundle.mjs, or
// constrained CI runners, the first `initialize` can exceed the 60s
// ceiling above. Before this fix, bootstrapMCPTools propagated the
// rejection up to extension.ts, which logged once and continued with
// NO ctx_* tools registered — silently degrading the session for its
// entire lifetime while the routing block kept emitting ~2.5K tokens
// of dead instructions per turn.
//
// Retry pattern mirrors the existing #583 single-flight respawn shape:
// on failure, shut the prior child cleanly, sleep a short backoff so
// the OS reclaims fds, then start + initialize again. After the budget
// is exhausted we re-throw and the existing extension.ts handler runs
// the degrade-and-log path — preserving the contract for genuinely
// broken servers (binary missing, runtime crash, etc.) while
// self-healing the transient warm-up case.
const MAX_INIT_RETRIES = 2;
const INIT_RETRY_DELAY_MS = 1_000;

export class PiTextComponent {
  private text: string;

  constructor(text = "") {
    this.text = text;
  }

  setText(text: string): void {
    this.text = text;
  }

  invalidate(): void {
    // Stateless renderer: no cached layout to invalidate.
  }

  render(width: number): string[] {
    if (!this.text || this.text.trim() === "") return [];
    return this.text
      .replace(/\t/g, "   ")
      .split(/\r?\n/)
      .map((line) => truncateAnsiLine(line, Math.max(1, width)));
  }
}

const GRAPHEME_SEGMENTER = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function extractTerminalEscape(str: string, pos: number): { code: string; length: number } | null {
  if (pos >= str.length || str[pos] !== "\x1b") return null;
  const next = str[pos + 1];

  // CSI sequence: ESC [ ... final-byte. Covers SGR plus cursor/control codes.
  if (next === "[") {
    let j = pos + 2;
    while (j < str.length) {
      const code = str.charCodeAt(j);
      if (code >= 0x40 && code <= 0x7e) {
        return { code: str.slice(pos, j + 1), length: j + 1 - pos };
      }
      j++;
    }
    return null;
  }

  // OSC/APC sequence: ESC ]/_ ... BEL or ST (ESC \). Stop at the FIRST
  // terminator so OSC 8 hyperlinks don't swallow visible link text.
  if (next === "]" || next === "_") {
    let j = pos + 2;
    while (j < str.length) {
      if (str[j] === "\x07") return { code: str.slice(pos, j + 1), length: j + 1 - pos };
      if (str[j] === "\x1b" && str[j + 1] === "\\") {
        return { code: str.slice(pos, j + 2), length: j + 2 - pos };
      }
      j++;
    }
    return null;
  }

  return null;
}

function couldBeEmoji(segment: string): boolean {
  const cp = segment.codePointAt(0) ?? 0;
  return (
    (cp >= 0x1f000 && cp <= 0x1fbff) ||
    (cp >= 0x2300 && cp <= 0x23ff) ||
    (cp >= 0x2600 && cp <= 0x27bf) ||
    (cp >= 0x2b50 && cp <= 0x2b55) ||
    segment.includes("\uFE0F") ||
    segment.includes("\u200D")
  );
}

function isZeroWidthCodePoint(cp: number): boolean {
  return (
    cp < 0x20 ||
    (cp >= 0x7f && cp <= 0x9f) ||
    (cp >= 0x300 && cp <= 0x36f) ||     // Combining Diacritical Marks
    (cp >= 0x1ab0 && cp <= 0x1aff) ||   // Combining Diacritical Marks Extended
    (cp >= 0x1dc0 && cp <= 0x1dff) ||   // Combining Diacritical Marks Supplement
    (cp >= 0x20d0 && cp <= 0x20ff) ||   // Combining Diacritical Marks for Symbols
    (cp >= 0xfe00 && cp <= 0xfe0f) ||   // Variation Selectors
    (cp >= 0xfe20 && cp <= 0xfe2f) ||   // Combining Half Marks
    cp === 0x200b ||
    cp === 0x200c ||
    cp === 0x200d ||
    cp === 0xfeff
  );
}

function isZeroWidthGrapheme(segment: string): boolean {
  if (segment.length === 0) return true;
  for (const char of segment) {
    if (!isZeroWidthCodePoint(char.codePointAt(0) ?? 0)) return false;
  }
  return true;
}

/**
 * Returns the terminal display width of a code point.
 * CJK ideographs, Hangul, fullwidth forms, etc. → 2; everything else → 1.
 * Mirrors the Unicode east-asian-width "W"/"F" categories.
 */
function charWidth(cp: number): number {
  return cp >= 0x1100 && (
    cp <= 0x115f ||   // Hangul Jamo
    (cp >= 0xa960 && cp <= 0xa97c) ||   // Hangul Jamo Extended-A
    cp === 0x2329 || cp === 0x232a ||
    (cp >= 0x2e80 && cp <= 0xa4cf && cp !== 0x303f) ||  // CJK
    (cp >= 0xac00 && cp <= 0xd7a3) ||   // Hangul syllables
    (cp >= 0xd7b0 && cp <= 0xd7fb) ||   // Hangul Jamo Extended-B
    (cp >= 0xf900 && cp <= 0xfaff) ||   // CJK compat
    (cp >= 0xfe10 && cp <= 0xfe19) ||   // Vertical forms
    (cp >= 0xfe30 && cp <= 0xfe6f) ||   // CJK compat forms
    (cp >= 0xff01 && cp <= 0xff60) ||   // Fullwidth forms
    (cp >= 0xffe0 && cp <= 0xffe6) ||   // Fullwidth signs
    (cp >= 0x20000 && cp <= 0x2fffd) || // CJK extensions
    (cp >= 0x30000 && cp <= 0x3fffd)    // CJK extensions B+
  ) ? 2 : 1;
}

function graphemeWidth(segment: string): number {
  const cp = segment.codePointAt(0);
  if (cp === undefined) return 0;
  if (isZeroWidthGrapheme(segment)) return 0;
  if (couldBeEmoji(segment)) return 2;
  // Regional indicator symbols render as wide emoji flags in Pi's TUI.
  if (cp >= 0x1f1e6 && cp <= 0x1f1ff) return 2;
  return charWidth(cp);
}

export function truncateAnsiLine(line: string, maxWidth: number): string {
  if (maxWidth <= 0) return "";
  let output = "";
  let visible = 0;
  let index = 0;
  while (index < line.length) {
    const escape = extractTerminalEscape(line, index);
    if (escape) {
      output += escape.code;
      index += escape.length;
      continue;
    }

    let end = index + 1;
    while (end < line.length && !extractTerminalEscape(line, end)) end++;
    const chunk = line.slice(index, end);
    for (const { segment } of GRAPHEME_SEGMENTER.segment(chunk)) {
      const w = graphemeWidth(segment);
      if (visible + w > maxWidth) return output;
      output += segment;
      visible += w;
    }
    index = end;
  }
  return output;
}

interface PiRenderTheme {
  bold(text: string): string;
  fg(color: string, text: string): string;
}

interface PiRenderContext {
  lastComponent?: unknown;
}

function createContextModeCallRenderer(toolName: string) {
  return (_args: unknown, theme: PiRenderTheme, context: PiRenderContext) => {
    const text =
      context.lastComponent instanceof PiTextComponent
        ? context.lastComponent
        : new PiTextComponent();
    text.setText(theme.fg("toolTitle", theme.bold(toolName)));
    return text;
  };
}

function createContextModeResultRenderer(toolName: string) {
  return (
    result: MCPCallResult,
    { expanded, isPartial }: { expanded: boolean; isPartial: boolean },
    theme: PiRenderTheme,
    context: PiRenderContext,
  ) => {
    const text =
      context.lastComponent instanceof PiTextComponent
        ? context.lastComponent
        : new PiTextComponent();
    if (isPartial) {
      text.setText(theme.fg("warning", "indexing/searching..."));
      return text;
    }
    const output = (result.content ?? [])
      .filter((c) => c?.type === "text" && typeof c.text === "string")
      .map((c) => c.text as string)
      .join("\n");
    if (expanded) {
      text.setText(theme.fg("toolOutput", output));
      return text;
    }
    const firstLine = output
      .split(/\r?\n/)
      .find((line) => line.trim().length > 0)
      ?.trim();
    const status =
      firstLine && firstLine.length <= 180
        ? firstLine
        : `${toolName} completed`;
    text.setText(theme.fg("toolOutput", status));
    return text;
  };
}

/**
 * Minimal stdio JSON-RPC client targeting the context-mode MCP server.
 *
 * Implementation notes:
 *   - One outstanding ID per request; results matched by `id` from the
 *     returned envelope. Notifications (no id) are sent fire-and-forget.
 *   - Buffer is split on `\n` because the MCP server writes one
 *     newline-delimited JSON message per `console.log` / `stdout.write`
 *     invocation — this is the standard MCP stdio transport framing.
 *   - On child exit / error, every in-flight request is rejected so
 *     callers do not hang forever.
 */
export class MCPStdioClient {
  private child: ChildProcess | null = null;
  private requestId = 0;
  private readonly pending = new Map<number, PendingRequest>();
  private buffer = "";
  private initialized = false;
  private exited = false;
  /**
   * In-flight respawn promise — set while {@link respawn} runs so
   * concurrent callers awaiting `request()` after an idle exit observe
   * the SAME respawn, not N parallel ones. Without this guard, two
   * simultaneous `callTool` calls would each see `this.exited === true`,
   * each fire their own `respawn()`, and the loser leaks an orphaned
   * child process the GC cannot reach (no `.kill()` reference).
   */
  private respawnPromise: Promise<void> | null = null;
  /**
   * Live env passed to the spawned child — exposed (read-only intent)
   * so tests can pin the fork-bomb-prevention env counter (#516)
   * without needing to attach a process-tree probe.
   */
  _spawnEnv: NodeJS.ProcessEnv | null = null;

  constructor(
    private readonly serverScript: string,
    private readonly env: NodeJS.ProcessEnv = process.env,
    private readonly runtimeOverride: string | null = null,
  ) {}

  /** Spawn the MCP child. Idempotent. */
  start(): void {
    if (this.child) return;
    this.exited = false;
    // Pick a JS runtime that is NOT the host process (#516). When Pi
    // is the host binary, process.execPath would re-exec Pi and fork
    // bomb the box. resolveJsRuntimeForBridge prefers bun/node and
    // explicitly rejects pi-named binaries.
    const runtime =
      this.runtimeOverride ?? resolveJsRuntimeForBridge() ?? process.execPath;
    // Increment the depth counter so any transitive bridge load inside
    // the child can short-circuit before spawning yet another server.
    const depth = Number.parseInt(this.env[BRIDGE_DEPTH_ENV] ?? "0", 10);
    const childEnv: NodeJS.ProcessEnv = {
      ...this.env,
      [BRIDGE_DEPTH_ENV]: String(Number.isFinite(depth) ? depth + 1 : 1),
    };
    // Issue #545 — scrub foreign workspace env vars before spawn.
    //
    // Pi's MCP bridge inherits the host shell env (including a prior
    // `claude` invocation's CLAUDE_PROJECT_DIR). Without this scrub, the
    // spawned MCP server resolves getProjectDir() to the foreign workspace
    // and Pi's sessions write into the wrong project. The ban list is
    // derived ALGORITHMICALLY from PLATFORM_ENV_VARS (every other adapter's
    // workspace-role vars), so adding adapter #16 grows the scrub
    // automatically — no edit to this file. Pi's own workspace vars and
    // the universal escape hatch (CONTEXT_MODE_PROJECT_DIR) are NEVER
    // scrubbed.
    for (const banned of foreignWorkspaceEnv("pi")) {
      delete childEnv[banned];
    }
    // Issue #561 — scrub foreign IDENTIFICATION env vars before spawn.
    //
    // Foreign identification vars hijack detectPlatform() — must scrub
    // when spawning child under a different host (#561). When Pi runs
    // co-resident with Claude Code, the inherited shell env carries
    // CLAUDE_CODE_ENTRYPOINT and CLAUDE_PLUGIN_ROOT; the spawned MCP
    // child's detectPlatform() then walks PLATFORM_ENV_VARS in priority
    // order (claude-code first), returns claude-code, and Pi's session
    // data lands in ~/.claude/context-mode/ instead of Pi's own dir.
    // Pi's OWN identification vars (PI_CONFIG_DIR / PI_SESSION_FILE /
    // PI_COMPILED) are excluded from the ban set so the child still
    // detects pi correctly.
    for (const banned of foreignIdentificationEnv("pi")) {
      delete childEnv[banned];
    }
    // Issue #561 regression fix: Pi detection vars are empty after
    // foreign env scrubbing (CLAUDE_CODE_ENTRYPOINT / CLAUDE_PLUGIN_ROOT
    // are deleted by the ban above). Without PI_CONFIG_DIR,
    // detectPlatform() finds zero Pi identification vars and falls
    // through to Claude Code default — stats land in ~/.claude/ instead
    // of ~/.pi/. Set PI_CONFIG_DIR from the child's HOME env var so the
    // child resolves to Pi correctly. (Use childEnv.HOME, not homedir(),
    // because homedir() reads getpwent() which ignores our HOME override
    // in test environments.)
    const home = childEnv.HOME ?? childEnv.USERPROFILE ?? childEnv.HOMEPATH;
    if (home) {
      const piConfig = join(home, ".pi");
      if (existsSync(piConfig)) {
        childEnv.PI_CONFIG_DIR = piConfig;
      }
    }
    this._spawnEnv = childEnv;
    this.child = spawn(runtime, [this.serverScript], {
      // Pipe stderr (#472 round-3): swallowing it via "ignore" hides
      // server crash diagnostics — the user only saw "ctx_* tools will
      // not be callable" with no clue WHY. Forwarding to process.stderr
      // with a [mcp-bridge] prefix lets ops grep across session noise.
      stdio: ["pipe", "pipe", "pipe"],
      env: childEnv,
    });
    this.child.stdout?.on("data", (chunk) => this.onData(chunk));
    this.child.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf-8");
      // Preserve original line breaks; prefix every non-empty line so
      // multi-line traces stay grep-friendly.
      const prefixed = text
        .split(/\r?\n/)
        .map((line, i, arr) =>
          i === arr.length - 1 && line === "" ? "" : `[mcp-bridge] ${line}`,
        )
        .join("\n");
      process.stderr.write(prefixed);
    });
    this.child.on("exit", () => this.onExit());
    this.child.on("error", () => this.onExit());
  }

  private onExit(): void {
    if (this.exited) return;
    this.exited = true;
    const err = new Error("MCP server exited");
    for (const [, p] of this.pending) p.reject(err);
    this.pending.clear();
  }

  private onData(chunk: Buffer): void {
    this.buffer += chunk.toString("utf-8");
    let idx;
    while ((idx = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (!line) continue;
      let msg: { id?: number; result?: unknown; error?: unknown };
      try {
        msg = JSON.parse(line);
      } catch {
        continue; // skip non-JSON noise (e.g. stray log lines)
      }
      if (typeof msg.id !== "number" || !this.pending.has(msg.id)) continue;
      const handler = this.pending.get(msg.id)!;
      this.pending.delete(msg.id);
      if (msg.error) handler.reject(msg.error);
      else handler.resolve(msg.result);
    }
  }

  async request<T = unknown>(
    method: string,
    params: unknown,
    timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS,
  ): Promise<T> {
    // Respawn-on-idle-exit (#583, #583-followup).
    //
    // Initial #583 fix patched callTool() only. The structural location is
    // here: `request()` is the single chokepoint for `initialize`,
    // `tools/list`, `tools/call`, and any future method. Patching at this
    // layer means listTools / re-initialize paths after an idle exit also
    // self-heal, not just the registered-tool happy path.
    //
    // Sequencing is critical: respawn() resets `exited`, `child`, and
    // `buffer` BEFORE start() + initialize(). The initialize() call inside
    // respawn() goes through this same request() — recursion is safe
    // because by the time we re-enter, `exited` is false again. We use a
    // single-flight `respawnPromise` so concurrent callers share the same
    // respawn (orphan-child guard, see field comment).
    if (this.exited) {
      if (!this.respawnPromise) {
        this.respawnPromise = this.respawn().finally(() => {
          this.respawnPromise = null;
        });
      }
      await this.respawnPromise;
    }
    if (!this.child) throw new Error("MCP client not started");
    const id = ++this.requestId;
    return new Promise<T>((resolve, reject) => {
      // Gate the timer on a finite ms value so callers can pass
      // `Number.POSITIVE_INFINITY` to mean "no bridge ceiling" (#643).
      // Node coerces both `undefined` and `Infinity` to a 1ms delay
      // (TimeoutOverflowWarning), so we can't just pass them through —
      // we must skip the setTimeout entirely. tools/call uses this path
      // because long-running ctx_execute must not be bounded here.
      const timer = Number.isFinite(timeoutMs)
        ? setTimeout(() => {
            if (!this.pending.has(id)) return;
            this.pending.delete(id);
            reject(new Error(`MCP request timeout after ${timeoutMs}ms: ${method}`));
          }, timeoutMs)
        : null;
      this.pending.set(id, {
        resolve: (v) => {
          if (timer) clearTimeout(timer);
          resolve(v as T);
        },
        reject: (e) => {
          if (timer) clearTimeout(timer);
          reject(e);
        },
      });
      const frame = JSON.stringify({ jsonrpc: "2.0", id, method, params });
      const rejectWrite = (err: Error) => {
        const handler = this.pending.get(id);
        if (handler) {
          this.pending.delete(id);
          handler.reject(err);
          return;
        }
        reject(err);
      };
      this.writeFrame(frame, rejectWrite);
    });
  }

  private writeFrame(frame: string, onError?: (err: Error) => void): boolean {
    if (!this.child || this.exited) {
      onError?.(new Error("MCP server exited"));
      return false;
    }

    const stdin = this.child.stdin;
    if (!stdin || stdin.destroyed || stdin.writableEnded || stdin.closed) {
      this.onExit();
      onError?.(new Error("MCP server stdin unavailable"));
      return false;
    }

    try {
      stdin.write(frame + "\n", (err) => {
        if (!err) return;
        const code = (err as NodeJS.ErrnoException).code;
        if (code === "EPIPE" || code === "ERR_STREAM_DESTROYED") {
          this.onExit();
          onError?.(err);
          return;
        }
        onError?.(err);
      });
      return true;
    } catch (err) {
      const code =
        err && typeof err === "object" && "code" in err
          ? (err as NodeJS.ErrnoException).code
          : undefined;
      if (err instanceof Error && (code === "EPIPE" || code === "ERR_STREAM_DESTROYED")) {
        this.onExit();
        onError?.(err);
        return false;
      }
      throw err;
    }
  }

  notify(method: string, params: unknown): void {
    if (!this.child) return;
    const frame = JSON.stringify({ jsonrpc: "2.0", method, params });
    this.writeFrame(frame);
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.request("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: { tools: {} },
      clientInfo: {
        name: "pi-coding-agent-context-mode-bridge",
        version: "1.0",
      },
    });
    this.notify("notifications/initialized", {});
    this.initialized = true;
  }

  async listTools(): Promise<MCPTool[]> {
    const result = await this.request<{ tools?: MCPTool[] }>("tools/list", {});
    return Array.isArray(result.tools) ? result.tools : [];
  }

  async callTool(name: string, args: unknown): Promise<MCPCallResult> {
    // Respawn-on-idle-exit is now handled centrally in `request()`
    // (#583 follow-up). Originally patched here in #583 — moving it up
    // one layer covers `listTools` / `initialize` paths too, with a
    // single-flight guard against orphan child processes from
    // concurrent callers.
    //
    // No bridge-imposed timeout for tools/call (#643). The previous
    // 120s ceiling rejected legitimate long-running ctx_execute calls
    // (test suites, builds, large `cargo test`) even though the
    // executor child would have finished. Bounding belongs to the
    // executor layer (per-tool timeout / background mode / Pi cancel),
    // not the transport. `Number.POSITIVE_INFINITY` instructs
    // `request()` to skip the setTimeout entirely — see the gate there.
    return this.request<MCPCallResult>(
      "tools/call",
      { name, arguments: args ?? {} },
      Number.POSITIVE_INFINITY,
    );
  }

  /**
   * Respawn the MCP child after an exit (clean shutdown or crash).
   * Resets state so a fresh `start()` + `initialize()` cycle runs, then
   * the caller's pending request flows through the new child.
   *
   * Single-flight — concurrent callers share one in-flight respawn via
   * {@link respawnPromise}. Internal — only entered via {@link request}.
   *
   * Sequencing pinned (do not reorder without updating the regression
   * test in tests/adapters/pi-mcp-bridge.test.ts):
   *   1. `this.child = null`     — drop stale handle
   *   2. `this.buffer = ""`       — discard leftover bytes from old child
   *   3. `this.exited = false`    — must precede `start()` + `initialize()`,
   *                                 because `request("initialize", …)`
   *                                 inside `initialize()` re-checks this
   *                                 flag and would otherwise re-enter
   *                                 respawn in an infinite loop
   *   4. `this.initialized = false`
   *   5. `this.start()`
   *   6. `await this.initialize()` — flows through `request()` recursively
   */
  private async respawn(): Promise<void> {
    this.child = null;
    this.buffer = "";
    this.exited = false;
    this.initialized = false;
    this.start();
    await this.initialize();
  }

  shutdown(): void {
    if (!this.child) return;
    const child = this.child;
    try {
      child.kill("SIGTERM");
    } catch {
      // best effort
    }
    // SIGKILL fallback (#472 round-3): a child that ignores SIGTERM
    // (e.g. installed handler that swallows the signal, or stuck in
    // an uninterruptible syscall) becomes a zombie because we null
    // the handle immediately. Schedule a hard kill bounded at 5s; the
    // .unref() prevents this timer from keeping the parent alive after
    // legitimate work is done.
    setTimeout(() => {
      try {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill("SIGKILL");
        }
      } catch {
        // best effort
      }
    }, 5000).unref();
    this.child = null;
    this.initialized = false;
    this.exited = true;
  }
}

/**
 * Subset of the Pi ExtensionAPI we touch. Typed structurally so we don't
 * pull `@earendil-works/pi-coding-agent` as a build dependency — keeps
 * the bundle size unchanged and matches the existing pi-extension.ts
 * style (which also types `pi` as `any`).
 */
export interface PiToolRegistration {
  name: string;
  label: string;
  description: string;
  parameters: unknown;
  renderCall?: (
    args: unknown,
    theme: PiRenderTheme,
    context: PiRenderContext,
  ) => unknown;
  renderResult?: (
    result: MCPCallResult,
    options: { expanded: boolean; isPartial: boolean },
    theme: PiRenderTheme,
    context: PiRenderContext,
  ) => unknown;
  execute: (
    toolCallId: string,
    params: Record<string, unknown>,
  ) => Promise<{
    content: Array<{ type: "text"; text: string }>;
    details: Record<string, unknown>;
    isError?: boolean;
  }>;
}

export interface PiLikeAPI {
  registerTool: (tool: PiToolRegistration) => void;
}

/** Result of bootstrapping the bridge. */
export interface BridgeHandle {
  /** Names of tools registered with Pi (for diagnostics / tests). */
  tools: string[];
  /** Idempotent shutdown — terminates the MCP child. */
  shutdown: () => void;
  /** Underlying client, exposed for tests / advanced callers. */
  client: MCPStdioClient;
}

/**
 * Spawn the MCP server and register each of its tools with Pi via
 * `pi.registerTool()`. The same JSON Schema returned by `tools/list` is
 * passed straight through as `parameters` — TypeBox emits JSON-Schema
 * compatible objects, so any Pi runtime that validates JSON Schema
 * accepts this shape (verified against pi 0.73.x).
 *
 * Errors during MCP `tools/call` are translated to a `throw` from the
 * `execute()` callback — Pi's contract is "throw to mark the tool call
 * failed", which lets the LLM see and adapt.
 */
export interface BootstrapOptions {
  env?: NodeJS.ProcessEnv;
  /** DI hook for tests: override the runtime resolver entirely. */
  _resolveJsRuntime?: () => string | null;
}

/**
 * Empty-but-valid handle returned when bootstrap is skipped (#516).
 * Keeps the shutdown contract intact so callers do not need null checks.
 */
function skippedBridge(): BridgeHandle {
  return {
    tools: [],
    shutdown: () => {
      /* nothing to shut down */
    },
    client: new MCPStdioClient("/dev/null"),
  };
}

export async function bootstrapMCPTools(
  pi: PiLikeAPI,
  serverScript: string,
  options: BootstrapOptions = {},
): Promise<BridgeHandle> {
  const env = options.env ?? process.env;

  // Recursion guard (#516): if an ancestor bridge already incremented
  // the depth counter, refuse to spawn another child — even if the
  // binary-name check would let us through. Catches `node` shims that
  // re-exec Pi and other host swaps that bypass basename detection.
  const depth = Number.parseInt(env[BRIDGE_DEPTH_ENV] ?? "0", 10);
  if (Number.isFinite(depth) && depth > 0) {
    process.stderr.write(
      `[context-mode] WARNING: skipping MCP bridge — ${BRIDGE_DEPTH_ENV}=${depth} ` +
        `indicates recursion (fork-bomb guard, #516). ctx_* tools will not be callable.\n`,
    );
    return skippedBridge();
  }

  // Runtime guard (#516): when neither node nor bun is on PATH and the
  // host process is pi, there is no safe binary to spawn. Log once and
  // return an empty handle — the rest of the extension keeps working.
  const runtime = (options._resolveJsRuntime ?? resolveJsRuntimeForBridge)();
  if (runtime === null) {
    process.stderr.write(
      `[context-mode] WARNING: no JS runtime found (need node or bun on PATH). ` +
        `Skipping MCP bridge to avoid fork bomb (#516). ctx_* tools will not be callable.\n`,
    );
    return skippedBridge();
  }

  const client = new MCPStdioClient(serverScript, env, runtime);

  // Retry-on-slow-initialize (#647).
  //
  // Each attempt is independently bounded by DEFAULT_REQUEST_TIMEOUT_MS
  // (60s) inside request(). On failure we shutdown the child to release
  // its fds before respawning — this is the same sequencing the #583
  // respawn path uses, just hoisted into the bootstrap layer where the
  // failure happens before any tool was registered. Final attempt's
  // rejection is re-thrown so extension.ts's existing then/onRejected
  // handler runs the degrade-and-log path for genuinely broken servers.
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_INIT_RETRIES; attempt++) {
    try {
      client.start();
      await client.initialize();
      lastError = undefined;
      break;
    } catch (err) {
      lastError = err;
      if (attempt === MAX_INIT_RETRIES) break;
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(
        `[context-mode] WARNING: MCP bridge initialize failed ` +
          `(attempt ${attempt + 1}/${MAX_INIT_RETRIES + 1}): ${msg}. Retrying…\n`,
      );
      // Reclaim the failed child's fds before respawning. shutdown() is
      // idempotent and bounded by a 5s SIGKILL fallback (#472 round-3),
      // so a child stuck in an uninterruptible syscall cannot block the
      // retry loop indefinitely.
      try {
        client.shutdown();
      } catch {
        // best effort — we are already on the failure path
      }
      await new Promise((resolve) => setTimeout(resolve, INIT_RETRY_DELAY_MS));
    }
  }
  if (lastError !== undefined) throw lastError;

  const tools = await client.listTools();
  const registered: string[] = [];

  for (const tool of tools) {
    pi.registerTool({
      name: tool.name,
      label: tool.name,
      description: tool.description ?? "",
      // MCP tools/list returns JSON Schema; Pi validates against JSON
      // Schema (TypeBox is just JSON Schema with extra Symbol metadata
      // for type inference). Empty-object fallback keeps tools that
      // declare no parameters callable.
      parameters: tool.inputSchema ?? { type: "object", properties: {} },
      renderCall: createContextModeCallRenderer(tool.name),
      renderResult: createContextModeResultRenderer(tool.name),
      async execute(_toolCallId, params) {
        const result = await client.callTool(tool.name, params ?? {});
        const text = (result.content ?? [])
          .filter((c) => c?.type === "text" && typeof c.text === "string")
          .map((c) => c.text as string)
          .join("\n");
        if (result.isError) {
          // Throw is the Pi contract for "tool failed". The text body
          // becomes the error message visible to the LLM, so it sees
          // the same diagnostic the MCP server emitted.
          throw new Error(text || `${tool.name} returned an error`);
        }
        return {
          content: [{ type: "text", text }],
          details: {},
        };
      },
    });
    registered.push(tool.name);
  }

  return {
    tools: registered,
    shutdown: () => client.shutdown(),
    client,
  };
}
