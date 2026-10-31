#!/usr/bin/env node
// bench/run.mjs: the context-mode benchmark suite runner. Plain Node, no deps, no network, no API keys, no model calls.
//   cd bench && node run.mjs                 all scenarios, 3 runs each
//   node run.mjs a-sandbox                   one group (folder name) or one scenario id (prefix match)
//   node run.mjs --runs 5                    n runs per scenario (the median, min, max and sigma are over these)
//   node run.mjs --bundle <dir>              built bundle dir (default ../release-out; built if missing)
//   node run.mjs --no-write                  print the tables, write nothing
// Writes results/<date>-<os>-<arch>.json (raw samples) and results/<date>-<os>-<arch>.md (tables), and one README.md per
// group folder (inputs with sha256, commands). Exit 1 only when a scenario errors; numbers never fail a run.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { BENCH, REPO, DATA, sandbox, startServer, stats, sha256, tokens } from "./suite/lib.mjs";

const argv = process.argv.slice(2);
const opt = (name, d) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : d; };
const RUNS = Number(opt("--runs", "3"));
const BUNDLE = path.resolve(BENCH, opt("--bundle", "../release-out"));
const WRITE = !argv.includes("--no-write");
const skip = new Set(["--runs", "--bundle"].flatMap((f) => (argv.includes(f) ? [argv[argv.indexOf(f) + 1]] : [])));
const filters = argv.filter((a) => !a.startsWith("--") && !skip.has(a));
if (!Number.isInteger(RUNS) || RUNS < 1) { console.error("--runs needs a positive integer"); process.exit(2); }

if (!existsSync(path.join(BUNDLE, "server.mjs"))) {
  execFileSync(process.execPath, [path.join(REPO, "build", "build.mjs"), "--out", BUNDLE], { cwd: REPO, stdio: "inherit" });
}
const GROUPS = ["a-sandbox", "b-retrieval", "c-batch", "d-externalize", "e-continuity", "f-hook-redirect", "g-overhead"];
const groups = [];
for (const g of GROUPS) groups.push({ dir: g, ...(await import(`./${g}/index.mjs`)).default });

const git = (...a) => { try { return execFileSync("git", a, { cwd: REPO, encoding: "utf8" }).trim(); } catch { return null; } };
const commit = git("rev-parse", "HEAD");
const OWN = /^(\?\? |.. )(release-out\/?|bench\/results\/.*|bench\/[a-z-]+\/README\.md)$/; // files this run writes or builds do not make the tree dirty
const dirty = (git("status", "--porcelain", "--untracked-files=all") ?? "").split("\n").some((l) => l.trim() && !OWN.test(l.trim()));
const pkg = JSON.parse(readFileSync(path.join(REPO, "package.json"), "utf8"));
const date = new Date().toISOString().slice(0, 10);
const tag = `${date}-${process.platform}-${process.arch}`;
const env = {
  node: process.version, os: `${os.type()} ${os.release()}`, platform: process.platform, arch: process.arch,
  cpu: os.cpus()[0]?.model ?? "unknown", cores: os.cpus().length, ram_gb: Math.round(os.totalmem() / 2 ** 30),
};
const T0 = performance.now();
const matches = (g, s) => filters.length === 0 || filters.some((f) => g.dir === f || s.id === f || s.id.startsWith(f));

const results = [];
let errors = 0;
for (const g of groups) {
  for (const s of g.scenarios) {
    if (!matches(g, s)) continue;
    const samples = {};
    let ok = true, note = "", err = null;
    for (let i = 0; i < RUNS && !err; i++) {
      const sb = sandbox();
      let client;
      try {
        if (!s.noServer) client = await startServer(BUNDLE, sb);
        const r = await s.run({ bundle: BUNDLE, sb, client, n: 1 });
        if (r.error) { err = r.error; break; }
        for (const [k, v] of Object.entries(r.metrics)) if (v !== null && v !== undefined) (samples[k] ??= []).push(typeof v === "boolean" ? Number(v) : v);
        ok = ok && r.ok !== false; if (r.note) note = r.note;
      } catch (e) { err = String(e.message ?? e); }
      finally { try { await client?.close(); } catch { /* gone */ } sb.dispose(); }
    }
    const metrics = Object.fromEntries(Object.entries(samples).map(([k, v]) => [k, stats(v)]));
    const link = `../${g.dir}/README.md#${s.id}`;
    results.push({ group: g.dir, id: s.id, title: s.title, link, inputs: s.inputs ?? [], synthetic: !!s.synthetic, v1_scenario: s.v1 ?? null, command: s.command, ok: err ? false : ok, note, error: err, metrics });
    if (err) errors++;
    console.log(`${err ? "ERROR" : ok ? "ok   " : "WARN "} ${s.id}${err ? " " + err : note ? " (" + note + ")" : ""}`);
  }
}

// Fixture manifest: every input a run touched, with sha256 and size.
const manifest = {};
for (const r of results) for (const f of r.inputs) if (!manifest[f]) { const p = path.join(DATA, f); manifest[f] = existsSync(p) ? { sha256: sha256(readFileSync(p)), bytes: readFileSync(p).length } : null; }

const runMs = Math.round(performance.now() - T0);
const out = {
  schema: 1, date, runs: RUNS, run_ms: runMs, token_method: "bytes / 4, an estimate (no tokenizer is vendored)",
  context_mode: { version: pkg.version, commit, dirty }, env, fixtures: manifest, results,
};

const foot = `Hardware ${env.cpu} (${env.cores} cores, ${env.ram_gb} GB), ${env.os}. Node ${env.node}. context-mode ${pkg.version} at ${commit?.slice(0, 8)}${dirty ? " (dirty tree)" : ""}, built bundle, default settings, claude-code adapter unless a row names another. Median of ${RUNS} run${RUNS === 1 ? "" : "s"}, ranges as [min-max]. Tokens are bytes / 4, an estimate. Date ${date}. Reproduce: \`cd bench && node run.mjs --runs ${RUNS}\`.`;
const md = [`# context-mode benchmark tables (${tag})`, "", foot, ""];
for (const g of groups) {
  const rows = results.filter((r) => r.group === g.dir && !r.error);
  if (rows.length === 0) continue;
  md.push(`## ${g.title}`, "", g.blurb, "", ...g.table(rows), "");
  const synth = rows.filter((r) => r.synthetic).map((r) => r.id);
  const flagged = rows.filter((r) => !r.ok).map((r) => `${r.id}${r.note ? " (" + r.note + ")" : ""}`);
  md.push(`Footnote: ${foot}${synth.length ? ` Synthetic inputs (seeded, no real capture): ${synth.join(", ")}.` : ""}${flagged.length ? ` Rows that failed their own check: ${flagged.join("; ")}.` : ""}`, "");
}
console.log("\n" + md.join("\n"));

if (WRITE) {
  mkdirSync(path.join(BENCH, "results"), { recursive: true });
  writeFileSync(path.join(BENCH, "results", `${tag}.json`), JSON.stringify(out, null, 2) + "\n");
  writeFileSync(path.join(BENCH, "results", `${tag}.md`), md.join("\n") + "\n");
  for (const g of groups) {
    const rs = g.scenarios.filter((s) => filters.length === 0 || matches(g, s));
    if (filters.length) continue; // group READMEs are written only by a full run
    const l = [`# ${g.title}`, "", g.blurb, "", `Run this group: \`cd bench && node run.mjs ${g.dir}\`. Latest tables: [results/${tag}.md](../results/${tag}.md).`, ""];
    for (const s of rs) {
      l.push(`## ${s.id}`, "", s.title, "", `- Command: \`${s.command}\``);
      if ((s.inputs ?? []).length) for (const f of s.inputs) l.push(`- Input: \`fixtures/data/${f}\`${manifest[f] ? `, ${manifest[f].bytes} B, sha256 ${manifest[f].sha256}` : ""}`);
      else l.push(s.synthetic ? "- Input: synthetic, generated in the scenario with a fixed seed (20261031)" : "- Input: none (small payloads built in the scenario)");
      l.push("");
    }
    writeFileSync(path.join(BENCH, g.dir, "README.md"), l.join("\n"));
  }
}
console.log(`done in ${runMs} ms, ${results.length} scenarios, ${errors} error(s)`);
process.exit(errors ? 1 : 0);
