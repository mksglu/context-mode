// THROWAWAY (D3 windows profile 3): cold single-shot cost of each fs op the hook runs, one fresh process per sample.
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
const home = mkdtempSync(path.join(tmpdir(), "d3p3-"));
mkdirSync(path.join(home, ".context-mode"), { recursive: true });
const OPS = {
  empty: "",
  stat_throw: `try{fs.statSync(P+'/a/.git')}catch{}`,
  stat_nothrow: `fs.statSync(P+'/a/.git',{throwIfNoEntry:false})`,
  exists: `fs.existsSync(P+'/a/.git')`,
  stat6_throw: `let c=P;for(let i=0;i<6;i++){try{fs.statSync(c+'/.git')}catch{}c=require('path').dirname(c)}`,
  stat6_nothrow: `let c=P;for(let i=0;i<6;i++){fs.statSync(c+'/.git',{throwIfNoEntry:false});c=require('path').dirname(c)}`,
  read3_throw: `for(let i=0;i<3;i++){try{fs.readFileSync(P+'/x'+i+'/s.json','utf8')}catch{}}`,
  read3_exists: `for(let i=0;i<3;i++){if(fs.existsSync(P+'/x'+i+'/s.json'))fs.readFileSync(P+'/x'+i+'/s.json','utf8')}`,
  realnative: `fs.realpathSync.native(P)`,
  realnative2: `fs.realpathSync.native(P);fs.realpathSync.native(P+'/.context-mode')`,
  mkdir: `fs.mkdirSync(P+'/.context-mode',{recursive:true})`,
  mkdir_exists: `if(!fs.existsSync(P+'/.context-mode'))fs.mkdirSync(P+'/.context-mode',{recursive:true})`,
  readfd0: `try{fs.readSync(0,Buffer.alloc(65536))}catch{}`,
};
const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.max(0, Math.min(s.length - 1, Math.ceil(s.length * p) - 1))]; };
for (const [k, body] of Object.entries(OPS)) {
  const code = `const fs=require('node:fs');const P=${JSON.stringify(home)};const t=process.hrtime.bigint();${body};console.log(Number(process.hrtime.bigint()-t)/1e6)`;
  const xs = [];
  for (let i = 0; i < 30; i++) {
    const r = spawnSync(process.execPath, ["-e", code], { encoding: "utf8", input: "" });
    xs.push(Number(r.stdout.trim()));
  }
  console.log("[D3R] op " + JSON.stringify({ k, p50: +q(xs, 0.5).toFixed(3), p95: +q(xs, 0.95).toFixed(3) }));
}
