// throwaway H5 profile: phases of the claude-code doctor hook sample, cold and loaded, bundle and src entry.
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, readFileSync, cpSync } from "node:fs";
import { tmpdir, cpus } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sampleText, hookSample, SAMPLE_FILE } from "../src/setup/hook-sample.ts";
const REPO = path.resolve(import.meta.dirname, "..");
const say = (m) => { console.log(m); console.log("::notice::H5P " + m); };
const root = mkdtempSync(path.join(tmpdir(), "h5p-"));
const home = path.join(root, "home"), proj = path.join(root, "proj");
mkdirSync(home); mkdirSync(proj);
const text = sampleText(); writeFileSync(path.join(proj, SAMPLE_FILE), text);
const payload = JSON.stringify(hookSample("claude-code", proj, text).payload);
const env = { ...process.env, HOME: home, USERPROFILE: home }; delete env.CLAUDE_PROJECT_DIR;
const pre = pathToFileURL(path.join(REPO, ".h5-prof", "pre.mjs")).href;
const bundleDir = path.join(root, "bundle"); cpSync(path.join(REPO, "release-out"), bundleDir, { recursive: true });
const srcHook = path.join(root, "srchook.mjs");
writeFileSync(srcHook, `import ${JSON.stringify(pathToFileURL(path.join(REPO, "src", "entries", "hook.ts")).href)};\n`);
const entries = { bundle: path.join(bundleDir, "hook.mjs"), src: srcHook };
function run(file, extra = [], label) {
  const t = performance.now();
  const r = spawnSync(process.execPath, [...extra, file, "--agent", "claude-code"], { env, cwd: proj, input: payload, encoding: "utf8", timeout: 30000, windowsHide: true });
  const ms = Math.round(performance.now() - t);
  const span = (r.stderr.split("\n").find((l) => l.startsWith("H5SPAN ")) ?? "").slice(7);
  say(`${label} wall=${ms}ms status=${r.status} span=${span} err=${r.stderr.split("\n").filter((l) => l && !l.startsWith("H5SPAN")).join("|").slice(0, 120)}`);
  return ms;
}
function bare() { const t = performance.now(); spawnSync(process.execPath, ["-e", ""], { env }); return Math.round(performance.now() - t); }
say(`node ${process.version} ${process.platform} cpus=${cpus().length}`);
say("bare node x3 " + [bare(), bare(), bare()].join(","));
for (const k of ["bundle", "src"]) {
  run(entries[k], ["--import", pre], `${k} cold`);
  for (let i = 0; i < 3; i++) run(entries[k], ["--import", pre], `${k} warm${i}`);
}
// cpu profile of one bundle run
const profDir = path.join(root, "cpu"); mkdirSync(profDir);
run(entries.bundle, ["--cpu-prof", "--cpu-prof-dir=" + profDir], "bundle cpuprof");
function top(file) {
  const p = JSON.parse(readFileSync(file, "utf8")); const byId = new Map(p.nodes.map((n) => [n.id, n])); const self = new Map();
  p.samples.forEach((s, i) => { const n = byId.get(s); const k = n.callFrame.functionName + "@" + n.callFrame.url.split(/[\\/]/).slice(-1)[0] + ":" + n.callFrame.lineNumber; self.set(k, (self.get(k) ?? 0) + p.timeDeltas[i]); });
  const total = p.timeDeltas.reduce((a, b) => a + b, 0);
  say(`cpuprof total=${Math.round(total / 1000)}ms top: ` + [...self].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => (v / 1000).toFixed(1) + "ms " + k).join(" ; "));
}
for (const f of readdirSync(profDir)) top(path.join(profDir, f));
// loaded: one busy child per cpu, hook runs in parallel with the others (the unit tests run in parallel on the runner)
const busy = [];
for (let i = 0; i < cpus().length * 2; i++) busy.push(spawn(process.execPath, ["-e", "for(;;);"], { stdio: "ignore" }));
await new Promise((r) => setTimeout(r, 500));
for (const k of ["bundle", "src"]) for (let i = 0; i < 3; i++) run(entries[k], ["--import", pre], `${k} loaded${i}`);
for (const b of busy) b.kill();
