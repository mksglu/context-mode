// Step 1 of the v1 case miner. Usage: node scripts/v1-cases/instrument.mjs <v1-tree>
// Wraps routePreToolUse in <v1-tree>/hooks/core/routing.mjs so every call (from a vitest worker or from a hook
// subprocess) appends one JSON line to $CM_V1_LOG: input, v1 result, the v1 test file:line (from the stack).
// The v1 test suite then runs unchanged; the log is what the real v1 router did on each test input.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const p = join(process.argv[2], "hooks/core/routing.mjs");
let s = readFileSync(p, "utf8");
const head = "export function routePreToolUse(toolName, toolInput, projectDir, platform, sessionId, options = {}) {";
if (!s.includes(head)) throw new Error("v1 routePreToolUse signature not found");
if (s.includes("__routePreToolUse")) { console.log("already instrumented"); process.exit(0); }
const wrapper = `export function routePreToolUse(toolName, toolInput, projectDir, platform, sessionId, options = {}) {
  const __r = __routePreToolUse(toolName, toolInput, projectDir, platform, sessionId, options);
  try {
    const frames = (new Error().stack || "").split("\\n");
    let src = "subprocess";
    for (const f of frames) {
      const at = f.indexOf(".test.ts:");
      if (at < 0) continue;
      const start = f.lastIndexOf("tests/", at);
      const rest = f.slice(at + ".test.ts:".length).split(":")[0];
      if (start >= 0) { src = f.slice(start, at + ".test.ts".length) + ":" + rest; break; }
    }
    __cmAppend(process.env.CM_V1_LOG || "/tmp/cm-v1-log.jsonl", JSON.stringify({ src, tool: toolName, input: toolInput, projectDir, platform, sessionId, options, mcpReady: isMCPReady(), settings: __cmSettings(projectDir), res: __r }) + "\\n");
  } catch {}
  return __r;
}
import { appendFileSync as __cmAppend, readFileSync as __cmRead } from "node:fs";
function __cmSettings(projectDir) {
  const out = {};
  const dir = projectDir || process.env.CLAUDE_PROJECT_DIR;
  const cfg = process.env.CLAUDE_CONFIG_DIR || (process.env.HOME ? process.env.HOME + "/.claude" : null);
  const files = { projectLocal: dir && dir + "/.claude/settings.local.json", project: dir && dir + "/.claude/settings.json", user: cfg && cfg + "/settings.json" };
  for (const k of Object.keys(files)) { try { const d = JSON.parse(__cmRead(files[k], "utf8")); if (d && d.permissions) out[k] = { permissions: d.permissions }; } catch {} }
  return Object.keys(out).length ? out : null;
}
function __routePreToolUse(toolName, toolInput, projectDir, platform, sessionId, options = {}) {`;
writeFileSync(p, s.replace(head, wrapper));
console.log("instrumented", p);
