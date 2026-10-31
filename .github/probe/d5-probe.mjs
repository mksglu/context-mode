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
async function trial(src) {
  const dir = mkdtempSync(path.join(tmpdir(), "cm-d5probe-"));
  writeFileSync(path.join(dir, "hook.mjs"), src);
  const h = [], b = [];
  for (let k = 0; k < Math.max(...KS); k++) {
    h.push(await run([process.execPath, path.join(dir, "hook.mjs"), "--agent", "claude-code"], dir, "{}"));
    b.push(await run([process.execPath, "-e", ""], dir));
  }
  rmSync(dir, { recursive: true, force: true });
  return Object.fromEntries(KS.map((k) => [k, Math.min(...h.slice(0, k)) - Math.min(...b.slice(0, k))]));
}
const fast = Object.fromEntries(KS.map((k) => [k, []])), slow = Object.fromEntries(KS.map((k) => [k, []]));
for (let i = 0; i < N; i++) { const r = await trial(FAST); for (const k of KS) fast[k].push(r[k]); }
for (let i = 0; i < Math.min(N, 15); i++) { const r = await trial(SLOW); for (const k of KS) slow[k].push(r[k]); }
for (const k of KS) {
  const f = fast[k], s = slow[k];
  console.log(`[D5PROBE] ${label} ${process.platform} node${process.versions.node} pairs=${k} fastOver40=${f.filter((x) => x > 40).length}/${f.length} fastMax=${Math.max(...f).toFixed(1)} slowFail=${s.filter((x) => x > 40).length}/${s.length} slowMin=${Math.min(...s).toFixed(1)}`);
}
