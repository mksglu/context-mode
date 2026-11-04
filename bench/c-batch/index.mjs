// Group C: ctx_batch (several commands + queries in one call) against separate raw Bash calls.
import { execSync } from "node:child_process";
import { bytes, read, pct, kb, rng3 } from "../suite/lib.mjs";

const CASES = [
  { id: "c-triage", title: "Triage: tests, tsc, build, nginx log, git log (5 commands, 5 queries)", files: ["test-output.txt", "tsc-errors.txt", "build-output.txt", "access.log", "git-log.txt"],
    queries: ["failed tests", "TS2339 property does not exist", "build warnings", "status 500 requests", "revert commit"], expect: ["failed"] },
  { id: "c-install-log", title: "Install log and big git log (2 commands, 3 queries)", files: ["npm-install-log.txt", "git-log-large.txt"],
    queries: ["cache miss", "registry.npmjs.org GET 200", "feat commit"], expect: ["npm http fetch"] },
  { id: "c-small", title: "Small outputs (3 tiny commands, 2 queries): batch has fixed overhead", cmds: ["node --version", "git rev-parse --is-inside-work-tree", "echo ready"],
    queries: ["node version", "ready"], expect: ["v"] },
];

const execOut = (cmd) => { try { return execSync(cmd, { encoding: "utf8" }); } catch { return ""; } };

export default {
  id: "c-batch",
  title: "C. Batch (ctx_batch_execute equivalent: ctx_batch)",
  blurb: "Native = the sum of the raw outputs of the same commands run as separate Bash calls. The last row has tiny outputs on purpose: the batch reply header is a fixed cost and there is nothing to save.",
  scenarios: CASES.map((c) => ({
    id: c.id, title: c.title, inputs: c.files ?? [], command: `node run.mjs ${c.id}`,
    async run({ client }) {
      const commands = c.cmds ?? c.files.map((f) => "cat data/" + f);
      const nativeBytes = c.files ? c.files.reduce((a, f) => a + bytes(read(f)), 0) : null;
      const r = await client.call("ctx_batch", { commands, queries: c.queries });
      if (r.error || r.isError) return { error: r.error ?? r.text.slice(0, 200) };
      let native = nativeBytes;
      if (native === null) { // tiny commands: their real stdout
        const { execSync } = await import("node:child_process");
        native = commands.reduce((a, cmd) => a + bytes(execSync(cmd, { encoding: "utf8", cwd: process.cwd() })), 0);
      }
      const found = c.expect.every((e) => r.text.includes(e));
      const sections = r.text.split(/^## /m).length - 1;
      return { metrics: { raw_bytes: native, ctx_bytes: bytes(r.text), batch_ms: r.ms, commands: commands.length, query_sections: sections }, reply: r.text, ...(c.cmds ? { sample: commands.map((cmd) => execOut(cmd)).join("") } : {}), ok: found, note: found ? "" : "expected string missing" };
    },
  })),
  table(rows) {
    const out = ["| Scenario | Separate raw calls KB | ctx_batch reply KB | Saved | Query sections | ms |", "|---|---:|---:|---:|---:|---:|"];
    for (const r of rows) {
      const m = r.metrics;
      out.push(`| [${r.title}](${r.link}) | ${kb(m.raw_bytes.median)} | ${kb(m.ctx_bytes.median)} | ${pct(m.raw_bytes.median, m.ctx_bytes.median)} | ${m.query_sections.median} | ${rng3(m.batch_ms)} |`);
    }
    return out;
  },
};
