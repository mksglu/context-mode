// THROWAWAY (D3 win profile 2): inclusive time per function, format variants. Deleted before done.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, rmSync, mkdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "esbuild";
const home = mkdtempSync(path.join(tmpdir(), "cm-d3q-"));
const env = { ...process.env, HOME: home, USERPROFILE: home };
const input = JSON.stringify({ hook_event_name: "PreToolUse", session_id: "d3q", cwd: home, tool_name: "Bash", tool_input: { command: "true" } });
const q = (x, p) => { const s = [...x].sort((a, b) => a - b); return +s[Math.max(0, Math.min(s.length - 1, Math.ceil(s.length * p) - 1))].toFixed(1); };
const line = (tag, o) => console.log(`[D3Q] ${tag} ${JSON.stringify(o)}`);
const common = { entryPoints: ["src/entries/hook.ts"], bundle: true, platform: "node", target: "node24", external: ["node:*"], logLevel: "silent" };
const dir = path.join(home, "v"); mkdirSync(dir);
await build({ ...common, format: "esm", minify: true, outfile: path.join(dir, "min.mjs") });
await build({ ...common, format: "esm", minify: false, outfile: path.join(dir, "unmin.mjs") });
await build({ ...common, format: "cjs", minify: true, outfile: path.join(dir, "min.cjs") });
await build({ ...common, format: "esm", minify: true, minifyIdentifiers: false, keepNames: false, outfile: path.join(dir, "noident.mjs") });
for (const f of readdirSync(dir)) line("size", { f, bytes: statSync(path.join(dir, f)).size });
const cases = { bare: ["-e", ""], min_mjs: [path.join(dir, "min.mjs"), "--agent", "claude-code"], min_cjs: [path.join(dir, "min.cjs"), "--agent", "claude-code"], unmin_mjs: [path.join(dir, "unmin.mjs"), "--agent", "claude-code"] };
const wall = Object.fromEntries(Object.keys(cases).map((k) => [k, []]));
for (let i = 0; i < 6 + 100; i++) for (const k of Object.keys(cases)) { const t = performance.now(); spawnSync(process.execPath, cases[k], { env, input, timeout: 20000 }); if (i >= 6) wall[k].push(performance.now() - t); }
for (const k of Object.keys(wall)) line("wall", { k, p50: q(wall[k], 0.5), p95: q(wall[k], 0.95) });
line("overhead", Object.fromEntries(Object.keys(wall).filter((k) => k !== "bare").map((k) => [k, { p50: +(q(wall[k], 0.5) - q(wall.bare, 0.5)).toFixed(1), p95: +(q(wall[k], 0.95) - q(wall.bare, 0.95)).toFixed(1) }])));
// inclusive profile of the unminified bundle
const prof = path.join(home, "prof"); const inc = new Map(); const RUNS = 10;
for (let i = 0; i < RUNS; i++) spawnSync(process.execPath, ["--cpu-prof", "--cpu-prof-interval", "100", "--cpu-prof-dir", prof, path.join(dir, "unmin.mjs"), "--agent", "claude-code"], { env, input, timeout: 20000 });
for (const f of readdirSync(prof)) {
  const p = JSON.parse(readFileSync(path.join(prof, f), "utf8")); const byId = new Map(p.nodes.map((n) => [n.id, n])); const self = new Map();
  p.samples.forEach((s, i) => self.set(s, (self.get(s) ?? 0) + p.timeDeltas[i] / 1000));
  const parent = new Map(); for (const n of p.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const tot = new Map(); for (const [id, t] of self) { const seen = new Set(); let cur = id; while (cur !== undefined) { const cf = byId.get(cur).callFrame; const k = `${cf.functionName || "(anon)"} ${path.basename(cf.url)}:${cf.lineNumber}`; if (!seen.has(k)) { seen.add(k); tot.set(k, (tot.get(k) ?? 0) + t); } cur = parent.get(cur); } }
  for (const [k, t] of tot) inc.set(k, (inc.get(k) ?? 0) + t);
}
[...inc].filter(([k]) => !k.includes("(root)")).sort((a, b) => b[1] - a[1]).slice(0, 45).forEach(([k, t]) => line("inc", { k, msPerRun: +(t / RUNS).toFixed(2) }));
rmSync(home, { recursive: true, force: true });
