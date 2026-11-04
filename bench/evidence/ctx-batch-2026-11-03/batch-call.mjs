// One live ctx_batch call over MCP (stdio) to server.mjs of the release branch. Writes the request and the reply.
// Usage: INPUT=batch-input.json CM_HOME=<empty dir> node batch-call.mjs <server.mjs> <cwd> <out.json>
import { spawn } from "node:child_process";
import { writeFileSync, readFileSync } from "node:fs";
const [server, cwd, out] = process.argv.slice(2);
const input = JSON.parse(readFileSync(process.env.INPUT, "utf8"));
const p = spawn("node", [server], { cwd, env: { ...process.env, HOME: process.env.CM_HOME, CLAUDE_PROJECT_DIR: cwd } });
let buf = "", init = null; const send = (o) => p.stdin.write(JSON.stringify(o) + "\n");
p.stderr.on("data", () => {});
p.stdout.on("data", (d) => {
  buf += d; const lines = buf.split("\n"); buf = lines.pop();
  for (const l of lines) { let m; try { m = JSON.parse(l); } catch { continue; }
    if (m.id === 1) { init = m.result.serverInfo; send({ jsonrpc: "2.0", method: "notifications/initialized" }); send({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "ctx_batch", arguments: input } }); }
    if (m.id === 2) { writeFileSync(out, JSON.stringify({ date: new Date().toISOString(), serverInfo: init, input, result: m.result }, null, 2)); p.kill(); process.exit(0); }
  }
});
send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "node-mcp-client", version: process.version } } });
setTimeout(() => { p.kill(); process.exit(1); }, 60000);
