// Group A: tool output processed in the sandbox (ctx_execute with `file`). The 14 v1 scenarios keep their v1 code
// byte for byte (bench/fixtures/scenarios.json); 4 v2 scenarios (large JSON, npm log, big source, long git log) are new.
import { readFileSync } from "node:fs";
import path from "node:path";
import { USECASES } from "./usecases.mjs";
import { BENCH, bytes, read, postToolUse, runHook, seenAfterHook, pct, kb, med, rng3 } from "../suite/lib.mjs";

const scen = JSON.parse(readFileSync(path.join(BENCH, "fixtures", "scenarios.json"), "utf8"));
const v1 = JSON.parse(readFileSync(path.join(BENCH, "fixtures", "v1-baseline.json"), "utf8"));
const v1Row = (name) => v1.rows.find((r) => r.part === 1 && r.scenario === name);

// v2 ctx_execute with `file` sets CTX_FILE; this prelude defines FILE_CONTENT as v1 ctx_execute_file did.
const PRELUDE = {
  javascript: 'const FILE_CONTENT = require("fs").readFileSync(process.env.CTX_FILE, "utf-8");\n',
  python: 'import os\nwith open(os.environ["CTX_FILE"], "r", encoding="utf-8") as _f:\n    FILE_CONTENT = _f.read()\n',
};

const NEW = [
  { tool: "GitHub API", name: "Large JSON payload (Next.js issues, 30 items)", fixture: "github-api-issues-large.json", language: "javascript", code: `
    const a = JSON.parse(FILE_CONTENT);
    const labels = {}; for (const i of a) for (const l of i.labels || []) labels[l.name] = (labels[l.name] || 0) + 1;
    console.log("issues:", a.length, "| keys per item:", Object.keys(a[0]).length);
    console.log("top labels:", Object.entries(labels).sort((x, y) => y[1] - x[1]).slice(0, 5).map(([k, v]) => k + " x" + v).join(", "));
    for (const i of a.slice(0, 8)) console.log("#" + i.number, i.state, "comments=" + i.comments, i.title.slice(0, 80));` },
  { tool: "npm", name: "npm install log (--loglevel http)", fixture: "npm-install-log.txt", language: "javascript", code: `
    const L = FILE_CONTENT.split("\\n").filter(Boolean);
    const get = L.filter((l) => / GET /.test(l));
    const ms = get.map((l) => ({ ms: +(l.match(/ (\\d+)ms/) || [0, 0])[1], url: (l.match(/https:\\S+/) || [""])[0] }));
    console.log("lines:", L.length, "| GET:", get.length, "| cache miss:", get.filter((l) => /cache miss/.test(l)).length, "| non-200:", get.filter((l) => !/ 200 /.test(l)).length);
    console.log("slowest:"); for (const r of ms.sort((x, y) => y.ms - x.ms).slice(0, 5)) console.log("  " + r.ms + "ms " + r.url);` },
  { tool: "Read", name: "Big source file (constants.ts, 61 KB)", fixture: "source-big.ts", language: "javascript", code: `
    const ex = [...FILE_CONTENT.matchAll(/^export (?:const|function|type|interface) (\\w+)/gm)].map((m) => m[1]);
    console.log("lines:", FILE_CONTENT.split("\\n").length, "| exports:", ex.length);
    console.log("first 25:", ex.slice(0, 25).join(", "));` },
  { tool: "git", name: "Git log (2000 commits)", fixture: "git-log-large.txt", language: "javascript", code: `
    const L = FILE_CONTENT.split("\\n").filter(Boolean);
    const months = {}; for (const l of L) { const m = l.split(" ")[1].slice(0, 7); months[m] = (months[m] || 0) + 1; }
    const kinds = {}; for (const l of L) { const k = (l.split(" ")[2] || "").replace(/[(:].*/, ""); kinds[k] = (kinds[k] || 0) + 1; }
    console.log("commits:", L.length, "| by month:", JSON.stringify(months));
    console.log("top prefixes:", Object.entries(kinds).sort((x, y) => y[1] - x[1]).slice(0, 8).map(([k, v]) => k + " " + v).join(", "));` },
];

const all = [...scen.part1.map((s) => ({ ...s, v1: true })), ...NEW.map((s) => ({ ...s, v1: false })), ...USECASES.map((s) => ({ ...s, v1: false }))];
const idOf = (s) => "a-" + s.fixture.replace(/\.[a-z]+$/, "").replace(/[^a-z0-9]+/g, "-");

export default {
  id: "a-sandbox",
  title: "A. Tool output processed in the sandbox (ctx_execute with `file`)",
  blurb: "The agent runs a small script over the output; only the script's printed summary enters the context. Compared with the raw output entering the context (native) and with what the PostToolUse hook leaves of the same raw output. The summary script is the v1 benchmark script, so the summary shows what that script prints, not the answer to your question.",
  scenarios: all.map((s) => ({
    id: idOf(s), title: s.name, tool: s.tool, inputs: [s.fixture], v1: s.v1,
    command: `node run.mjs ${idOf(s)}`,
    async run({ bundle, sb, client, n }) {
      const raw = read(s.fixture);
      const r = await client.call("ctx_execute", { language: s.language, file: "data/" + s.fixture, code: PRELUDE[s.language] + s.code });
      if (r.error || r.isError) return { error: r.error ?? r.text.slice(0, 200) };
      const hp = postToolUse(sb, raw, { command: "cat data/" + s.fixture, n });
      const h = runHook(bundle, sb, "claude-code", hp);
      const seen = seenAfterHook(raw, h);
      if (seen.error) return { error: seen.error };
      return { metrics: { raw_bytes: bytes(raw), ctx_bytes: bytes(r.text), hook_bytes: bytes(seen.seen), exec_ms: r.ms, hook_ms: h.ms, v1_bytes: v1Row(s.name)?.v1_context_bytes ?? null }, reply: r.text, ok: true, note: seen.replaced ? "" : "hook allowed (below its threshold)" };
    },
  })),
  table(rows) {
    const out = ["| Scenario | Raw KB | v1 saved | v2 ctx_execute KB | v2 saved | v2 hook KB | hook saved | exec ms |", "|---|---:|---:|---:|---:|---:|---:|---:|"];
    for (const r of rows) {
      const m = r.metrics;
      out.push(`| [${r.title}](${r.link}) | ${kb(m.raw_bytes.median)} | ${pct(m.raw_bytes.median, m.v1_bytes?.median)} | ${kb(m.ctx_bytes.median)} | ${pct(m.raw_bytes.median, m.ctx_bytes.median)} | ${kb(m.hook_bytes.median)} | ${pct(m.raw_bytes.median, m.hook_bytes.median)} | ${rng3(m.exec_ms)} |`);
    }
    return out;
  },
};
