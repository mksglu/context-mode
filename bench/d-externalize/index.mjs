// Group D: large output externalization. An output over the cap stays whole in FTS5; the reply is a head plus a pointer.
// Proof nothing is lost: a query finds the first, a middle and the last line.
import { execFileSync } from "node:child_process";
import { bytes, read, rng, pct, kb, rng3 } from "../suite/lib.mjs";

// Deterministic synthetic output (seed 20261031): `lines` log lines with unique markers on the first, middle and last line.
const synth = (lines) => `const s=${20261031};let a=s>>>0;const r=()=>{a=(a+0x6d2b79f5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296};
const N=${lines};const out=[];for(let i=0;i<N;i++){let m="req "+Math.floor(r()*1e9).toString(16)+" latency="+Math.floor(r()*900)+"ms upstream=api-"+Math.floor(r()*40)+" status="+(r()<0.05?500:200);
if(i===0)m="FIRSTMARK-7c1e "+m;if(i===Math.floor(N/2))m="MIDMARK-52ab "+m;if(i===N-1)m="LASTMARK-9f3a "+m;out.push(m)}console.log(out.join("\\n"))`;

// The first lines of the synthetic output, for the case page (the same seeded script, run once here).
const sampleOf = (code) => execFileSync(process.execPath, ["-e", code], { encoding: "utf8", maxBuffer: 1 << 26 }).split("\n").slice(0, 8).join("\n");

const CASES = [
  { id: "d-synth-120k", title: "Synthetic log, about 120 KB (seeded)", synthetic: true, lines: 1500, marks: ["FIRSTMARK-7c1e", "MIDMARK-52ab", "LASTMARK-9f3a"] },
  { id: "d-synth-1m", title: "Synthetic log, about 1 MB (seeded)", synthetic: true, lines: 12500, marks: ["FIRSTMARK-7c1e", "MIDMARK-52ab", "LASTMARK-9f3a"] },
  { id: "d-real-github-json", title: "Real GitHub API payload printed whole (219 KB)", file: "github-api-issues-large.json", marks: [] },
  { id: "d-real-git-log", title: "Real git log printed whole (191 KB)", file: "git-log-large.txt", marks: [] },
];

export default {
  id: "d-externalize",
  title: "D. Large output externalization (>100 KB kept whole in FTS5)",
  blurb: "The script prints everything; the agent gets a capped reply with a pointer, and the full output is searchable. 'Found' counts the first, middle and last line markers returned by ctx_search. For the real files the markers are the first, middle and last line of the file.",
  scenarios: CASES.map((c) => ({
    id: c.id, title: c.title, inputs: c.file ? [c.file] : [], synthetic: !!c.synthetic, command: `node run.mjs ${c.id}`,
    async run({ client }) {
      let code, raw, marks = c.marks;
      if (c.synthetic) code = synth(c.lines);
      else {
        raw = read(c.file);
        const lines = raw.split("\n").map((l) => l.trim());
        const bad = (i) => lines[i].length < 24 || lines.filter((x) => x === lines[i]).length > 1;
        const fwd = (i) => { while (i < lines.length - 1 && bad(i)) i++; return lines[i].slice(0, 90); };
        const back = (i) => { while (i > 0 && bad(i)) i--; return lines[i].slice(0, 90); };
        marks = [fwd(0), back(Math.floor(lines.length / 2)), back(lines.length - 1)];
        code = 'process.stdout.write(require("fs").readFileSync(process.env.CTX_FILE,"utf8"))';
      }
      const r = await client.call("ctx_execute", c.synthetic ? { language: "javascript", code } : { language: "javascript", code, file: "data/" + c.file });
      if (r.error || r.isError) return { error: r.error ?? r.text.slice(0, 200) };
      const full = (r.text.match(/(\d+) B/) ?? [])[1];
      // the printed size is in the reply header ("exit 0 · 234912 B"); fall back to the raw size
      const fullBytes = c.synthetic ? Number(full) : bytes(raw);
      let found = 0, searchBytes = 0, searchMs = 0;
      for (const m of marks) {
        const s = await client.call("ctx_search", { queries: [m] });
        searchBytes += bytes(s.text ?? ""); searchMs += s.ms ?? 0;
        if ((s.text ?? "").includes(m.split(" ")[0]) || (s.text ?? "").includes(m)) found++;
      }
      return { metrics: { raw_bytes: fullBytes, ctx_bytes: bytes(r.text), exec_ms: r.ms, markers: marks.length, markers_found: found, search_bytes_per_query: Math.round(searchBytes / marks.length), search_ms_per_query: searchMs / marks.length }, reply: r.text, ...(c.synthetic ? { sample: sampleOf(code) } : {}), ok: found === marks.length };
    },
  })),
  table(rows) {
    const out = ["| Scenario | Full output KB | Reply to the agent KB | Saved | Markers found | One search reply KB | exec ms | search ms |", "|---|---:|---:|---:|---:|---:|---:|---:|"];
    for (const r of rows) {
      const m = r.metrics;
      out.push(`| [${r.title}](${r.link}) | ${kb(m.raw_bytes.median)} | ${kb(m.ctx_bytes.median)} | ${pct(m.raw_bytes.median, m.ctx_bytes.median)} | ${m.markers_found.median}/${m.markers.median} | ${kb(m.search_bytes_per_query.median)} | ${rng3(m.exec_ms)} | ${rng3(m.search_ms_per_query)} |`);
    }
    return out;
  },
};
