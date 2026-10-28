// THROWAWAY (D3 win profile). Prints per-phase numbers for the hook path; deleted before the fix lands.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
const OUT = path.resolve(process.argv[2] ?? "release-out");
const HOOK = path.join(OUT, "hook.mjs");
const home = mkdtempSync(path.join(tmpdir(), "cm-d3p-"));
const env = { ...process.env, HOME: home, USERPROFILE: home };
const input = JSON.stringify({ hook_event_name: "PreToolUse", session_id: "d3p", cwd: home, tool_name: "Bash", tool_input: { command: "true" } });
const q = (x, p) => { const s = [...x].sort((a, b) => a - b); return +s[Math.max(0, Math.min(s.length - 1, Math.ceil(s.length * p) - 1))].toFixed(1); };
const run = (args, extra = {}) => { const t = performance.now(); const r = spawnSync(process.execPath, args, { env, input, encoding: "utf8", timeout: 20000, ...extra }); return { ms: performance.now() - t, r }; };
const line = (tag, o) => console.log(`[D3P] ${tag} ${JSON.stringify(o)}`);
line("env", { platform: process.platform, node: process.version, arch: process.arch });

// 1. interleaved wall: bare, empty file, hook, hook through compile cache
const dir = path.join(home, "v"); mkdirSync(dir);
writeFileSync(path.join(dir, "empty.mjs"), "");
copyFileSync(HOOK, path.join(dir, "core.mjs"));
writeFileSync(path.join(dir, "cc.mjs"), 'process.getBuiltinModule("node:module").enableCompileCache(process.env.CM_CC);\nawait import("./core.mjs");\n');
const env2 = { ...env, CM_CC: path.join(home, "cc-cache") };
const cases = { bare: [["-e", ""], env], empty_mjs: [[path.join(dir, "empty.mjs")], env], hook: [[HOOK, "--agent", "claude-code"], env], hook_cc: [[path.join(dir, "cc.mjs"), "--agent", "claude-code"], env2] };
const wall = Object.fromEntries(Object.keys(cases).map((k) => [k, []]));
for (let i = 0; i < 6 + 100; i++) for (const k of Object.keys(cases)) { const [a, e] = cases[k]; const t = performance.now(); spawnSync(process.execPath, a, { env: e, input, timeout: 20000 }); if (i >= 6) wall[k].push(performance.now() - t); }
for (const k of Object.keys(wall)) line("wall", { k, p50: q(wall[k], 0.5), p95: q(wall[k], 0.95), min: q(wall[k], 0) });
line("overhead_p95", { hook: q(wall.hook, 0.95) - q(wall.bare, 0.95), hook_cc: q(wall.hook_cc, 0.95) - q(wall.bare, 0.95), hook_p50: q(wall.hook, 0.5) - q(wall.bare, 0.5), hook_cc_p50: q(wall.hook_cc, 0.5) - q(wall.bare, 0.5), empty_p50: q(wall.empty_mjs, 0.5) - q(wall.bare, 0.5) });

// 2. phase spans in process: bootstrap end, hook module first line, exit
const src = readFileSync(HOOK, "utf8");
const spanFile = path.join(dir, "span.mjs");
writeFileSync(spanFile, 'const __t0=performance.now();process.on("exit",()=>{const n=performance.nodeTiming;process.getBuiltinModule("node:fs").writeSync(2,"[D3S] "+JSON.stringify({boot:n.bootstrapComplete,modStart:__t0,body:performance.now()-__t0,exit:performance.now()})+"\\n")});\n' + src);
const spans = [];
for (let i = 0; i < 30; i++) { const { r } = run([spanFile, "--agent", "claude-code"]); const m = /\[D3S\] (\{.*\})/.exec(r.stderr); if (m) spans.push(JSON.parse(m[1])); }
for (const f of ["boot", "modStart", "body", "exit"]) line("span", { f, p50: q(spans.map((s) => s[f]), 0.5), p95: q(spans.map((s) => s[f]), 0.95) });
line("span", { f: "load(modStart-boot)", p50: q(spans.map((s) => s.modStart - s.boot), 0.5), p95: q(spans.map((s) => s.modStart - s.boot), 0.95) });
const sb = [];
for (let i = 0; i < 30; i++) { const { r } = run(["-e", 'const n=performance.nodeTiming;process.getBuiltinModule("node:fs").writeSync(2,"[D3B] "+JSON.stringify({boot:n.bootstrapComplete,exit:performance.now()})+"\\n")']); const m = /\[D3B\] (\{.*\})/.exec(r.stderr); if (m) sb.push(JSON.parse(m[1])); }
line("span_bare", { boot_p50: q(sb.map((s) => s.boot), 0.5), exit_p50: q(sb.map((s) => s.exit), 0.5) });

// 3. fs call counts and time (no fs.promises touch)
const pre = path.join(dir, "fs.cjs");
writeFileSync(pre, `const fs=require("node:fs");const names=["realpathSync","statSync","lstatSync","readFileSync","mkdirSync","existsSync","openSync","readSync","closeSync","writeSync","read","readdirSync","accessSync"];const calls=[];
for(const k of names){const o=fs[k];const w=function(...a){const t=process.hrtime.bigint();try{return o.apply(this,a)}finally{calls.push([k,String(a[0]).slice(-34),Number(process.hrtime.bigint()-t)/1e3])}};if(k==="realpathSync")w.native=o.native;fs[k]=w}
const nat=fs.realpathSync.native;
process.on("exit",()=>{const tot=calls.reduce((s,c)=>s+c[2],0);fs.writeSync(2,"[D3F] "+JSON.stringify({n:calls.length,totalUs:Math.round(tot),calls:calls.map(c=>c[0]+" "+c[1]+" "+Math.round(c[2])+"us")})+"\\n")});`);
for (let i = 0; i < 3; i++) { const { r } = run(["--require", pre, HOOK, "--agent", "claude-code"]); const m = /\[D3F\] (\{.*\})/.exec(r.stderr); if (m && i === 2) line("fs", JSON.parse(m[1])); }

// 4. cpu profile (self time by function), 5 runs merged
const prof = path.join(home, "prof"); const byFn = new Map(); let idle = 0, total = 0;
for (let i = 0; i < 8; i++) run(["--cpu-prof", "--cpu-prof-interval", "100", "--cpu-prof-dir", prof, HOOK, "--agent", "claude-code"]);
for (const f of readdirSync(prof)) { const p = JSON.parse(readFileSync(path.join(prof, f), "utf8")); const idx = new Map(p.nodes.map((n) => [n.id, n])); p.samples.forEach((s, i) => { const n = idx.get(s).callFrame; const t = p.timeDeltas[i] / 1000; total += t; if (n.functionName === "(idle)") { idle += t; return; } const k = `${n.functionName || "(anon)"} ${path.basename(n.url)}:${n.lineNumber}`; byFn.set(k, (byFn.get(k) ?? 0) + t); }); }
line("prof", { runs: 8, totalMsPerRun: +(total / 8).toFixed(1), idleMsPerRun: +(idle / 8).toFixed(1) });
[...byFn].sort((a, b) => b[1] - a[1]).slice(0, 18).forEach(([k, t]) => line("prof_fn", { k, msPerRun: +(t / 8).toFixed(2) }));
rmSync(home, { recursive: true, force: true });
