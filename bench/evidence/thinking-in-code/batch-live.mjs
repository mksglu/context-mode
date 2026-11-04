// Live ctx_batch call over stdio MCP against release-out/server.mjs, in a temp HOME.
import { spawn } from "node:child_process";
import { mkdtempSync, copyFileSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
const repo = process.argv[2];
const out = process.argv[3];
const home = mkdtempSync("/private/tmp/r19-batchhome-");
const work = path.join(home, "work");
await import("node:fs").then((fs) => fs.mkdirSync(work));
const files = ["bench/fixtures/data/npm-install-log.txt", "bench/fixtures/data/git-log-large.txt"];
for (const f of files) copyFileSync(path.join(repo, f), path.join(work, path.basename(f)));
const input = { commands: ["cat npm-install-log.txt", "cat git-log-large.txt"], queries: ["cache miss", "feat commit"] };
const child = spawn(process.execPath, [path.join(repo, "release-out/server.mjs")], { cwd: work, env: { ...process.env, HOME: home, CLAUDE_PROJECT_DIR: work }, stdio: ["pipe", "pipe", "inherit"] });
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
const init = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "r19-live", version: "0" } });
child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
const r = await rpc("tools/call", { name: "ctx_batch", arguments: input });
child.kill();
const text = r.result.content.map((c) => c.text).join("");
const version = JSON.parse(readFileSync(path.join(repo, "package.json"), "utf8")).version;
writeFileSync(out, JSON.stringify({
  date: new Date().toISOString().slice(0, 10),
  version,
  server: init.result.serverInfo,
  how: "node release-out/server.mjs over stdio MCP (initialize, then tools/call ctx_batch), HOME and the project folder in a new temp folder that holds copies of the two files; script: bench/evidence/thinking-in-code/batch-live.mjs",
  files,
  produced_bytes: files.reduce((s, f) => s + readFileSync(path.join(repo, f)).length, 0),
  returned_bytes: Buffer.byteLength(text),
  shown_lines: 6,
  input,
  result: text,
}, null, 2) + "\n");
console.log("ok", Buffer.byteLength(text), text.split("\n").length);
