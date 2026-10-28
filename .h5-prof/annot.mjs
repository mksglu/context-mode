// throwaway: run a command, print lines containing a marker as grouped notices
import { spawnSync } from "node:child_process";
const [, , pat, ...cmd] = process.argv;
const r = spawnSync(cmd[0], cmd.slice(1), { encoding: "utf8", maxBuffer: 1 << 28, shell: false });
const lines = ((r.stdout ?? "") + "\n" + (r.stderr ?? "")).split("\n").filter((l) => l.includes(pat));
for (let i = 0; i < lines.length && i < 40; i += 4) console.log("::notice::H5F " + lines.slice(i, i + 4).map((l) => l.slice(0, 700)).join("%0A"));
console.log("::notice::H5F exit=" + r.status + " matched=" + lines.length);
