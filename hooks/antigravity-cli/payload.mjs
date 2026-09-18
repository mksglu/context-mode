/**
 * Shared Antigravity CLI (`agy`) hook payload normalization.
 *
 * The only refs-backed field is the working directory: the upstream hook example
 * (refs/platforms/antigravity-cli/examples/title/title.sh:10, README.md:11)
 * reads it from `workspace.current_dir` (an OBJECT field). We read that FIRST.
 *
 * The remaining fields below are empirically-derived/UNVERIFIED — no upstream
 * agy doc or example confirms this shape; they are best-effort assumptions:
 *   { conversationId, stepIdx, toolCall: { name, args }, error,
 *     workspacePaths: [..], transcriptPath, artifactDirectoryPath }
 *
 * The shared context-mode capture/routing code expects Claude-shaped fields, so
 * keep this mapping in one place for PreToolUse/PostToolUse/Stop.
 */

import { existsSync, statSync, readFileSync, openSync, readSync, closeSync } from "node:fs";

export function parseAgyPayload(raw) {
  try {
    const cleaned = String(raw ?? "").replace(/^\uFEFF/, "").trim();
    return cleaned ? JSON.parse(cleaned) : {};
  } catch {
    return {};
  }
}

export function getAgyProjectDir(payload) {
  // Refs-backed FIRST: workspace.current_dir is the only upstream-documented
  // field (examples/title/title.sh:10). `workspacePaths[0]` is an unverified
  // fallback kept defensively.
  const workspace = payload?.workspace;
  if (workspace && typeof workspace === "object" && typeof workspace.current_dir === "string" && workspace.current_dir) {
    return workspace.current_dir;
  }
  return Array.isArray(payload?.workspacePaths) && payload.workspacePaths.length > 0
    ? String(payload.workspacePaths[0])
    : undefined;
}

// agy native tool-name -> canonical map. Keep in sync with the two other copies:
// hooks/core/routing.mjs (TOOL_ALIASES) and src/session/extract.ts
// (TOOL_NAME_NORMALIZE). Three layers normalize independently; adding a new agy
// tool means updating all three (a single shared table is a follow-up cleanup).
function normalizeAgyToolName(name) {
  switch (name) {
    case "run_command":
      return "Bash";
    case "view_file":
      return "Read";
    case "grep_search":
      return "Grep";
    case "list_dir":
      return "LS";
    case "web_fetch":
    case "read_url_content":
      return "WebFetch";
    case "search_web":
      return "WebSearch";
    default:
      return name;
  }
}

function normalizeAgyToolInput(toolName, args) {
  const input = args && typeof args === "object" ? { ...args } : {};
  const canonical = normalizeAgyToolName(toolName);
  if (canonical === "Bash" && typeof input.CommandLine === "string" && typeof input.command !== "string") {
    input.command = input.CommandLine;
  }
  if (canonical === "WebFetch") {
    const url = input.url ?? input.URL ?? input.Url;
    if (typeof url === "string" && typeof input.url !== "string") input.url = url;
  }
  if (canonical === "Read") {
    const filePath = input.file_path ?? input.path ?? input.AbsolutePath ?? input.FilePath;
    if (typeof filePath === "string" && typeof input.file_path !== "string") input.file_path = filePath;
  }
  if (canonical === "Grep") {
    const pattern = input.pattern ?? input.Pattern ?? input.query ?? input.Query;
    if (typeof pattern === "string" && typeof input.pattern !== "string") input.pattern = pattern;
  }
  return input;
}

export function fromAgy(payload) {
  const toolCall = payload?.toolCall ?? {};
  const rawToolName = toolCall?.name ?? "";
  return {
    session_id: payload?.conversationId,
    transcript_path: payload?.transcriptPath,
    cwd: getAgyProjectDir(payload),
    tool_name: normalizeAgyToolName(rawToolName),
    tool_input: normalizeAgyToolInput(rawToolName, toolCall?.args),
    tool_response: typeof payload?.error === "string" ? payload.error : "",
    tool_output: {
      isError: typeof payload?.error === "string" && payload.error.length > 0,
    },
  };
}

/**
 * Strips Antigravity UI wrapper tags (<USER_REQUEST>, <ADDITIONAL_METADATA>, etc.)
 * to extract the genuine user prompt text.
 */
export function extractUserRequest(content) {
  if (!content || typeof content !== "string") return "";
  const match = content.match(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/);
  if (match && match[1]) {
    return match[1].trim();
  }
  return content.trim();
}

/**
 * Extracts the most recent USER_INPUT step from an Antigravity transcript.jsonl file.
 * Returns { prompt, stepIndex, createdAt } or null if not found.
 */
export function getLatestUserPromptFromTranscript(transcriptPath) {
  if (!transcriptPath || typeof transcriptPath !== "string") return null;
  if (!existsSync(transcriptPath)) return null;

  try {
    const stat = statSync(transcriptPath);
    if (stat.size === 0) return null;

    // Read trailing window (up to 256KB) to quickly locate the latest user prompt
    const CHUNK_SIZE = 256 * 1024;
    let content = "";

    if (stat.size <= CHUNK_SIZE) {
      content = readFileSync(transcriptPath, "utf-8");
    } else {
      const fd = openSync(transcriptPath, "r");
      const buffer = Buffer.alloc(CHUNK_SIZE);
      const position = stat.size - CHUNK_SIZE;
      readSync(fd, buffer, 0, CHUNK_SIZE, position);
      closeSync(fd);
      content = buffer.toString("utf-8");
    }

    const lines = content.split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line) continue;
      try {
        const item = JSON.parse(line);
        if (item && item.type === "USER_INPUT") {
          const prompt = extractUserRequest(item.content);
          return {
            prompt,
            stepIndex: typeof item.step_index === "number" ? item.step_index : -1,
            createdAt: typeof item.created_at === "string" ? item.created_at : null,
          };
        }
      } catch {
        // Line may be truncated at buffer boundary; continue scanning backward
      }
    }
  } catch {
    return null;
  }
  return null;
}

