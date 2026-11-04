// Live calls of ctx_index, ctx_search, ctx_resume, ctx_stats, ctx_doctor and ctx_purge over stdio MCP
// against release-out/server.mjs, in a temp HOME and a temp project folder.
// Run: node build/build.mjs --out release-out --version <package.json version> --sha <commit> && node bench/evidence/terminal-calls-2026-11-03/calls-live.mjs . bench/evidence/terminal-calls-2026-11-03/calls.json
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
const repo = path.resolve(process.argv[2]);
const out = process.argv[3];
const home = mkdtempSync("/private/tmp/r20-callshome-");
const work = path.join(home, "work");
mkdirSync(work);
const file = "docs/how-it-works.md";
copyFileSync(path.join(repo, file), path.join(work, "how-it-works.md"));
writeFileSync(path.join(work, "AGENTS.md"), "# Agent rules\n\nBefore a compaction, save the state block with ctx_resume.\n");
const env = { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("CLAUDE"))), HOME: home, CLAUDE_PROJECT_DIR: work };
// Install first, the way a user does, so ctx_doctor checks a real install.
await new Promise((res) => spawn(process.execPath, [path.join(repo, "release-out/cli.mjs"), "setup", "--agents", "claude-code", "--yes"], { cwd: work, env, stdio: "ignore" }).on("exit", res));
const child = spawn(process.execPath, [path.join(repo, "release-out/server.mjs")], { cwd: work, env, stdio: ["pipe", "pipe", "inherit"] });
let buf = "";
const waiters = new Map();
child.stdout.on("data", (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    if (!line.trim()) continue;
    const m = JSON.parse(line);
    if (m.id != null && waiters.has(m.id)) { waiters.get(m.id)(m); waiters.delete(m.id); }
  }
});
let n = 0;
const rpc = (method, params) => new Promise((res) => { const id = ++n; waiters.set(id, res); child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"); });
const init = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "r20-live", version: "0" } });
child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
const plan = [
  { tool: "ctx_index", input: { path: "how-it-works.md" }, file, shown_lines: 1 },
  { tool: "ctx_search", input: { queries: ["compaction state block"] }, shown_lines: 5 },
  { tool: "ctx_resume", input: {}, shown_lines: 5 },
  { tool: "ctx_stats", input: {}, shown_lines: 1 },
  { tool: "ctx_doctor", input: {}, shown_lines: 6 },
  { tool: "ctx_purge", input: { source: "how-it-works.md" }, shown_lines: 1 },
];
const calls = [];
for (const p of plan) {
  const r = await rpc("tools/call", { name: p.tool, arguments: p.input });
  const result = r.result.content.map((c) => c.text).join("");
  calls.push({ tool: p.tool, input: p.input, ...(p.file ? { file: p.file, produced_bytes: statSync(path.join(repo, p.file)).size } : {}), returned_bytes: Buffer.byteLength(result), shown_lines: p.shown_lines, isError: !!r.result.isError, result });
}
child.kill();
writeFileSync(out, JSON.stringify({
  date: new Date().toISOString().slice(0, 10),
  version: JSON.parse(readFileSync(path.join(repo, "package.json"), "utf8")).version,
  server: init.result.serverInfo,
  how: "node release-out/server.mjs over stdio MCP (initialize, then one tools/call per tool in order), HOME and the project folder in a new temp folder that holds a copy of docs/how-it-works.md and a short AGENTS.md (memory file); script: bench/evidence/terminal-calls-2026-11-03/calls-live.mjs",
  calls,
}, null, 2) + "\n");
for (const c of calls) console.log("==", c.tool, c.returned_bytes, c.isError, "\n" + c.result.slice(0, 700));
