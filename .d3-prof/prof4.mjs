// THROWAWAY (D3 windows profile 4): is the gap hook code or node's own script load? Interleaved like the gate.
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
const home = mkdtempSync(path.join(tmpdir(), "d3p4-"));
const dir = path.join(home, "rel"); cpSync("release-out", dir, { recursive: true });
writeFileSync(path.join(dir, "empty.mjs"), ""); writeFileSync(path.join(dir, "empty.cjs"), "");
writeFileSync(path.join(dir, "pad.mjs"), "export {};\n" + Array.from({ length: 1500 }, (_, i) => `function f${i}(a,b){if(a>b){return a*${i}+b}return [a,b,${i}].map((x)=>x+1).join("-")}\n`).join(""));
const env = { ...process.env, HOME: home, USERPROFILE: home };
const input = JSON.stringify({ hook_event_name: "PreToolUse", session_id: "d3", cwd: home, tool_name: "Bash", tool_input: { command: "true" } });
const V = { bare: ["-e", ""], empty_mjs: [path.join(dir, "empty.mjs")], empty_cjs: [path.join(dir, "empty.cjs")], pad_mjs: [path.join(dir, "pad.mjs")], hook: [path.join(dir, "hook.mjs"), "--agent", "claude-code"] };
const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.max(0, Math.min(s.length - 1, Math.ceil(s.length * p) - 1))]; };
const w = Object.fromEntries(Object.keys(V).map((k) => [k, []]));
for (let i = 0; i < 203; i++) for (const [k, a] of Object.entries(V)) {
  const t = performance.now(); spawnSync(process.execPath, a, { env, input, encoding: "utf8", timeout: 10000 }); const d = performance.now() - t;
  if (i >= 3) w[k].push(d);
}
const out = {};
for (const k of Object.keys(V)) out[k] = { p50: +q(w[k], 0.5).toFixed(1), p95: +q(w[k], 0.95).toFixed(1) };
console.log("[D3S] wall " + JSON.stringify(out));
console.log("[D3S] size " + JSON.stringify({ pad: 0, hook: 0 }));
console.log("[D3S] minus_bare " + JSON.stringify(Object.fromEntries(Object.keys(V).map((k) => [k, { p50: +(out[k].p50 - out.bare.p50).toFixed(1), p95: +(out[k].p95 - out.bare.p95).toFixed(1) }]))));
