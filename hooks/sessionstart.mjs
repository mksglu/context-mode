#!/usr/bin/env node
/**
 * SessionStart hook for context-mode
 *
 * Provides the agent with XML-structured "Rules of Engagement"
 * at the beginning of each session, encouraging autonomous use
 * of context-mode MCP tools over raw Bash/Read/WebFetch.
 */

import { ROUTING_BLOCK } from "./routing-block.mjs";

// Event-based flowing mode avoids two platform bugs:
// - `for await (process.stdin)` hangs on macOS when piped via spawnSync
// - `readFileSync(0)` throws EOF/EISDIR on Windows, EAGAIN on Linux
const raw = await new Promise((resolve, reject) => {
  let data = "";
  process.stdin.setEncoding("utf-8");
  process.stdin.on("data", (chunk) => { data += chunk; });
  process.stdin.on("end", () => resolve(data));
  process.stdin.on("error", reject);
  process.stdin.resume();
});

// Output the routing block as additionalContext
console.log(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext: ROUTING_BLOCK,
  },
}));
