/**
 * ctx_delegate — Distributed analysis via `claude --print` sub-agents.
 *
 * Spawns parallel Claude CLI subprocesses with pre-read file contents
 * embedded in prompts. Each sub-agent performs single-turn analysis and
 * returns a compressed summary. Results are indexed into FTS5 for follow-up search.
 *
 * Zero dependencies — uses `claude --print` (installed with Claude Code).
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { cpus } from "node:os";
import { spawn } from "node:child_process";

// ── Types ──────────────────────────────────────────────────────────────

export interface DelegateTask {
  /** Human-readable label for this sub-agent's work */
  name: string;
  /** What the sub-agent should do — the analysis prompt */
  prompt: string;
  /** File paths to pre-read and embed. Directories are read recursively (.ts files). */
  files?: string[];
}

export interface DelegateOptions {
  tasks: DelegateTask[];
  /** Model to use for sub-agents. Default: claude-sonnet-4-6 */
  model?: string;
  /** Per-task timeout in ms. Default: 90_000 (90s) */
  timeout?: number;
  /** Max concurrent sub-agents. Default: CPU count, max: 10 */
  concurrency?: number;
}

export interface DelegateTaskResult {
  name: string;
  summary: string;
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  promptChars: number;
  fileCount: number;
  missingPaths: string[];
  error?: string;
}

export interface DelegateResult {
  results: DelegateTaskResult[];
  wallTimeMs: number;
  sequentialTimeMs: number;
  speedup: number;
  totalPromptTokens: number;
  totalSummaryTokens: number;
  compressionPct: number;
}

// ── File Reading ───────────────────────────────────────────────────────

const CODE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".rb", ".go", ".rs", ".java", ".c", ".cpp", ".h",
  ".php", ".pl", ".r", ".ex", ".exs", ".sh", ".bash", ".zsh",
  ".css", ".scss", ".html", ".json", ".yaml", ".yml", ".toml",
  ".md", ".txt", ".sql", ".graphql", ".proto",
]);

function isCodeFile(path: string): boolean {
  const dot = path.lastIndexOf(".");
  if (dot === -1) return false;
  return CODE_EXTENSIONS.has(path.slice(dot).toLowerCase());
}

/**
 * Read a file or directory, returning file contents keyed by relative path.
 * Directories are read recursively for code files.
 */
function readFilesForTask(
  paths: string[],
  projectRoot: string,
): { content: string; fileCount: number; totalChars: number; missingPaths: string[] } {
  const files = new Map<string, string>();
  const missingPaths: string[] = [];

  for (const p of paths) {
    const abs = p.startsWith("/") ? p : join(projectRoot, p);

    try {
      const stat = statSync(abs);

      if (stat.isDirectory()) {
        // Recursive directory read
        const entries = readdirSync(abs, { recursive: true }) as string[];
        for (const entry of entries) {
          const entryAbs = join(abs, entry);
          try {
            if (!statSync(entryAbs).isFile()) continue;
            if (!isCodeFile(entry)) continue;
            const rel = relative(projectRoot, entryAbs);
            files.set(rel, readFileSync(entryAbs, "utf-8"));
          } catch { /* skip unreadable files */ }
        }
      } else if (stat.isFile()) {
        const rel = relative(projectRoot, abs);
        files.set(rel, readFileSync(abs, "utf-8"));
      }
    } catch {
      missingPaths.push(p);
    }
  }

  let content = "";
  let totalChars = 0;
  for (const [path, text] of files) {
    content += `\n--- ${path} ---\n${text}\n`;
    totalChars += text.length;
  }

  return { content, fileCount: files.size, totalChars, missingPaths };
}

// ── Sub-Agent Runner ───────────────────────────────────────────────────

async function runSubAgent(
  task: DelegateTask,
  projectRoot: string,
  model: string,
  timeout: number,
): Promise<DelegateTaskResult> {
  // Pre-read files and embed in prompt
  let fileContent = "";
  let fileCount = 0;
  let missingPaths: string[] = [];
  if (task.files && task.files.length > 0) {
    const read = readFilesForTask(task.files, projectRoot);
    fileContent = read.content;
    fileCount = read.fileCount;
    missingPaths = read.missingPaths;

    // Fail fast: if files were requested but NONE found, don't spawn sub-agent
    if (fileCount === 0 && missingPaths.length > 0) {
      return {
        name: task.name,
        summary: `ERROR: No files found. Missing paths: ${missingPaths.join(", ")}`,
        durationMs: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        promptChars: 0,
        fileCount: 0,
        missingPaths,
        error: "FILES_NOT_FOUND",
      };
    }
  }

  const fullPrompt = fileContent
    ? `${task.prompt}\n\n${fileContent}`
    : task.prompt;

  // Strip CLAUDECODE env to prevent recursion detection
  const cleanEnv = { ...process.env };
  delete cleanEnv.CLAUDECODE;
  // Propagate depth guard
  const currentDepth = parseInt(process.env.CTX_DELEGATE_DEPTH ?? "0", 10);
  cleanEnv.CTX_DELEGATE_DEPTH = String(currentDepth + 1);

  const startTime = Date.now();

  // Spawn `claude --print` — single-turn, no tools, inherits OAuth session
  const args = ["--print", "--model", model, "--max-turns", "1", fullPrompt];

  return new Promise<DelegateTaskResult>((resolve) => {
    const child = spawn("claude", args, {
      env: cleanEnv,
      cwd: projectRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

    // Timeout guard
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      setTimeout(() => { if (!child.killed) child.kill("SIGKILL"); }, 5000);
    }, timeout);

    child.on("close", (code) => {
      clearTimeout(timer);
      const durationMs = Date.now() - startTime;
      const summary = stdout.trim();

      if (code !== 0 && !summary) {
        resolve({
          name: task.name,
          summary: `ERROR: claude --print exited with code ${code}. ${stderr.trim().slice(0, 200)}`,
          durationMs,
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          promptChars: fullPrompt.length,
          fileCount,
          missingPaths,
          error: `EXIT_CODE_${code}`,
        });
        return;
      }

      resolve({
        name: task.name,
        summary: summary || "ERROR: Empty response from claude --print",
        durationMs,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        promptChars: fullPrompt.length,
        fileCount,
        missingPaths,
        error: summary ? undefined : "EMPTY_RESPONSE",
      });
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        name: task.name,
        summary: `ERROR: Failed to spawn claude CLI: ${err.message}. Is Claude Code installed?`,
        durationMs: Date.now() - startTime,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        promptChars: fullPrompt.length,
        fileCount: 0,
        missingPaths,
        error: "SPAWN_FAILED",
      });
    });
  });
}

// ── Concurrency Limiter ────────────────────────────────────────────────

async function runWithConcurrency(
  tasks: DelegateTask[],
  projectRoot: string,
  model: string,
  timeout: number,
  limit: number,
): Promise<DelegateTaskResult[]> {
  const results: DelegateTaskResult[] = [];
  const queue = [...tasks];
  const running = new Set<Promise<void>>();

  while (queue.length > 0 || running.size > 0) {
    while (running.size < limit && queue.length > 0) {
      const task = queue.shift()!;
      const p = runSubAgent(task, projectRoot, model, timeout).then((r) => {
        results.push(r);
        running.delete(p);
      });
      running.add(p);
    }
    if (running.size > 0) await Promise.race(running);
  }

  return results;
}

// ── Public API ─────────────────────────────────────────────────────────

const MAX_CONCURRENCY = 10;
const MAX_TASKS = 20;
const MAX_DEPTH = 1;
const DEFAULT_TIMEOUT = 90_000;
const DEFAULT_MODEL = "claude-sonnet-4-6";

export async function delegate(
  opts: DelegateOptions,
  projectRoot: string,
): Promise<DelegateResult> {
  // Depth guard — prevent infinite delegation loops
  const depth = parseInt(process.env.CTX_DELEGATE_DEPTH ?? "0", 10);
  if (depth >= MAX_DEPTH) {
    return {
      results: [{
        name: "depth-guard",
        summary: "ERROR: Delegation depth limit reached. Sub-agents cannot delegate further.",
        durationMs: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        promptChars: 0,
        fileCount: 0,
        missingPaths: [],
        error: "DEPTH_LIMIT",
      }],
      wallTimeMs: 0,
      sequentialTimeMs: 0,
      speedup: 0,
      totalPromptTokens: 0,
      totalSummaryTokens: 0,
      compressionPct: 0,
    };
  }

  // Validate tasks
  const tasks = opts.tasks.slice(0, MAX_TASKS);
  if (tasks.length === 0) {
    return {
      results: [],
      wallTimeMs: 0,
      sequentialTimeMs: 0,
      speedup: 0,
      totalPromptTokens: 0,
      totalSummaryTokens: 0,
      compressionPct: 0,
    };
  }

  const model = opts.model ?? DEFAULT_MODEL;
  const timeout = Math.min(opts.timeout ?? DEFAULT_TIMEOUT, 300_000);
  const concurrency = Math.min(
    opts.concurrency ?? cpus().length,
    MAX_CONCURRENCY,
  );

  const wallStart = Date.now();
  const results = await runWithConcurrency(tasks, projectRoot, model, timeout, concurrency);
  const wallTimeMs = Date.now() - wallStart;

  // Reorder results to match input task order
  const ordered = tasks.map(
    (t) => results.find((r) => r.name === t.name) ?? results[0],
  );

  // Compute metrics
  const sequentialTimeMs = ordered.reduce((s, r) => s + r.durationMs, 0);
  const totalPromptChars = ordered.reduce((s, r) => s + r.promptChars, 0);
  const totalSummaryChars = ordered.reduce((s, r) => s + r.summary.length, 0);
  const totalPromptTokens = Math.ceil(totalPromptChars / 4);
  const totalSummaryTokens = Math.ceil(totalSummaryChars / 4);
  const compressionPct = totalPromptTokens > 0
    ? (1 - totalSummaryTokens / totalPromptTokens) * 100
    : 0;

  return {
    results: ordered,
    wallTimeMs,
    sequentialTimeMs,
    speedup: wallTimeMs > 0 ? sequentialTimeMs / wallTimeMs : 0,
    totalPromptTokens,
    totalSummaryTokens,
    compressionPct,
  };
}
