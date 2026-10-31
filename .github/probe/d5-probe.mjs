// TEMPORARY D5 probe (removed after the run). Tag: [D5PROBE]
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
const N = Number(process.argv[2] ?? 50);
const label = process.argv[3] ?? "quiet";
const STUB = `let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{JSON.parse(s);process.stderr.write("x");process.stdout.write("{}");});`;
const run = (argv, cwd, stdin) => new Promise((res) => {
  const t = performance.now();
  const c = spawn(argv[0], argv.slice(1), { cwd, env: { PATH: process.env.PATH ?? "" }, stdio: ["pipe", "pipe", "pipe"], shell: false, detached: process.platform !== "win32", windowsHide: true });
  c.stdout.on("data", () => {}); c.stderr.on("data", () => {});
  c.on("close", () => res(performance.now() - t)); c.on("error", () => res(NaN));
  c.stdin.on("error", () => {});
  if (stdin !== undefined) c.stdin.write(stdin);
  c.stdin.end();
});
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const sum = (name, a) => console.log(`[D5PROBE] ${label} ${process.platform} node${process.versions.node} ${name} n=${a.length} p50=${pct(a, .5).toFixed(1)} p95=${pct(a, .95).toFixed(1)} max=${Math.max(...a).toFixed(1)}`);
const node = process.execPath;
const R = { bare: [], bareStdin: [], emptyMjs: [], emptyCjs: [], stubFirst: [], stubLater: [], stubLater2: [], d5pair: [], d5pairWarm: [] };
for (let i = 0; i < N; i++) {
  const dir = mkdtempSync(path.join(tmpdir(), "cm-d5probe-"));
  writeFileSync(path.join(dir, "hook.mjs"), STUB);
  writeFileSync(path.join(dir, "empty.mjs"), "");
  writeFileSync(path.join(dir, "empty.cjs"), "");
  const stub = path.join(dir, "hook.mjs");
  R.bare.push(await run([node, "-e", ""], dir));
  R.bareStdin.push(await run([node, "-e", ""], dir, "{}"));
  R.emptyMjs.push(await run([node, path.join(dir, "empty.mjs")], dir));
  R.emptyCjs.push(await run([node, path.join(dir, "empty.cjs")], dir));
  const first = await run([node, stub, "--agent", "claude-code"], dir, "{}");
  R.stubFirst.push(first);
  const later = await run([node, stub, "--agent", "claude-code"], dir, "{}");
  R.stubLater.push(later);
  R.stubLater2.push(await run([node, stub, "--agent", "claude-code"], dir, "{}"));
  // D5 as shipped: samples 2, interleaved hook, bare; fresh new file (first exec counted)
  const dir2 = mkdtempSync(path.join(tmpdir(), "cm-d5probe-"));
  writeFileSync(path.join(dir2, "hook.mjs"), STUB);
  const h = [], b = [];
  for (let k = 0; k < 2; k++) { h.push(await run([node, path.join(dir2, "hook.mjs"), "--agent", "claude-code"], dir2, "{}")); b.push(await run([node, "-e", ""], dir2)); }
  R.d5pair.push(Math.min(...h) - Math.min(...b));
  // same with one uncounted warm-up of the hook first
  await run([node, path.join(dir2, "hook.mjs"), "--agent", "claude-code"], dir2, "{}");
  const h2 = [], b2 = [];
  for (let k = 0; k < 2; k++) { h2.push(await run([node, path.join(dir2, "hook.mjs"), "--agent", "claude-code"], dir2, "{}")); b2.push(await run([node, "-e", ""], dir2)); }
  R.d5pairWarm.push(Math.min(...h2) - Math.min(...b2));
  rmSync(dir, { recursive: true, force: true }); rmSync(dir2, { recursive: true, force: true });
}
for (const [k, v] of Object.entries(R)) sum(k, v);
console.log(`[D5PROBE] ${label} d5pair over40=${R.d5pair.filter((x) => x > 40).length}/${N} d5pairWarm over40=${R.d5pairWarm.filter((x) => x > 40).length}/${N}`);
