// throwaway: run a command, print failing test lines as grouped notices
import { spawnSync } from "node:child_process";
const [, , pat, ...cmd] = process.argv;
const r = spawnSync(cmd[0], cmd.slice(1), { encoding: "utf8", maxBuffer: 1 << 28, shell: false });
const all = (r.stdout ?? "") + "\n" + (r.stderr ?? "");
const lines = all.split("\n");
const hit = [];
lines.forEach((l, i) => { if (l.includes(pat)) hit.push(lines.slice(i, i + 1).concat(lines.slice(i + 1, i + 14).filter((x) => /error|expected|actual|message|hook|ms/i.test(x))).join(" / ")); });
for (let i = 0; i < hit.length && i < 40; i += 3) console.log("::notice::H5F " + hit.slice(i, i + 3).map((l) => l.slice(0, 900)).join("%0A"));
console.log("::notice::H5F exit=" + r.status + " matched=" + hit.length);
