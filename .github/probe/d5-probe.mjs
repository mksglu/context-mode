// TEMPORARY D5 probe 2 (removed after the run). Tag: [D5PROBE]
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
const N = Number(process.argv[2] ?? 50);
const label = process.argv[3] ?? "load";
const KS = [2, 3, 5, 8, 12];
const FAST = `let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{JSON.parse(s);process.stdout.write("{}");});`;
const SLOW = `setTimeout(()=>process.stdout.write("{}"),100);process.stdin.resume();process.stdin.on("end",()=>{});`;
const run = (argv, cwd, stdin) => new Promise((res) => {
  const t = performance.now();
  const c = spawn(argv[0], argv.slice(1), { cwd, env: { PATH: process.env.PATH ?? "" }, stdio: ["pipe", "pipe", "pipe"], shell: false, detached: process.platform !== "win32", windowsHide: true });
  c.stdout.on("data", () => {}); c.stderr.on("data", () => {});
  c.on("close", () => res(performance.now() - t)); c.on("error", () => res(NaN));
  c.stdin.on("error", () => {});
  if (stdin !== undefined) c.stdin.write(stdin);
  c.stdin.end();
});
const K = 9;
async function trial(src) {
  const dir = mkdtempSync(path.join(tmpdir(), "cm-d5probe-"));
  writeFileSync(path.join(dir, "hook.mjs"), src);
  const h = [], b = [];
  for (let k = 0; k < K; k++) {
    h.push(await run([process.execPath, path.join(dir, "hook.mjs"), "--agent", "claude-code"], dir, "{}"));
    b.push(await run([process.execPath, "-e", ""], dir));
  }
  rmSync(dir, { recursive: true, force: true });
  return { h, b };
}
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const EST = {
  minmin: (h, b, k) => Math.min(...h.slice(0, k)) - Math.min(...b.slice(0, k)),
  minpaired: (h, b, k) => Math.min(...h.slice(0, k).map((x, i) => x - b[i])),
  medpaired: (h, b, k) => med(h.slice(0, k).map((x, i) => x - b[i])),
  medmed: (h, b, k) => med(h.slice(0, k)) - med(b.slice(0, k)),
};
const fast = [], slow = [];
for (let i = 0; i < N; i++) fast.push(await trial(FAST));
for (let i = 0; i < 25; i++) slow.push(await trial(SLOW));
for (const [name, f] of Object.entries(EST)) for (const k of [2, 3, 5, 7, 9]) {
  const fv = fast.map((t) => f(t.h, t.b, k)), sv = slow.map((t) => f(t.h, t.b, k));
  console.log(`[D5PROBE] ${label} ${process.platform} node${process.versions.node} ${name} k=${k} fastOver40=${fv.filter((x) => x > 40).length}/${fv.length} fastMax=${Math.max(...fv).toFixed(0)} slowPass=${sv.filter((x) => x <= 40).length}/${sv.length} slowMin=${Math.min(...sv).toFixed(0)}`);
}
