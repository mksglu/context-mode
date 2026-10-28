// throwaway: run a command, print FAIL-looking lines as grouped notices (annotations are the only log channel without a token)
import { spawnSync } from "node:child_process";
const [, , pat, ...cmd] = process.argv;
const r = spawnSync(cmd[0], cmd.slice(1), { encoding: "utf8", maxBuffer: 1 << 28, shell: false });
const all = (r.stdout ?? "") + "\n" + (r.stderr ?? "");
const lines = all.split("\n").filter((l) => l.includes(pat));
for (let i = 0; i < lines.length && i < 60; i += 6) console.log("::notice::H5F " + lines.slice(i, i + 6).map((l) => l.slice(0, 500)).join("%0A"));
console.log("::notice::H5F exit=" + r.status + " matched=" + lines.length);
