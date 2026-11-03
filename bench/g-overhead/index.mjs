// Group G: overhead. Hook milliseconds over a bare `node -e ""` for each host adapter, ctx_search latency, index time per MB,
// and a full debugging session total.
import { spawnSync } from "node:child_process";
import { bytes, read, HOSTS, hostPayload, postToolUse, runHook, seenAfterHook, stats, pct, kb, rng3 } from "../suite/lib.mjs";

const bare = () => { const t = performance.now(); spawnSync(process.execPath, ["-e", ""]); return performance.now() - t; };
const SESSION = ["test-output.txt", "tsc-errors.txt", "build-output.txt", "git-log.txt", "access.log", "github-issues.json", "analytics.csv", "playwright-snapshot.txt"];

const hostScenarios = Object.keys(HOSTS).map((id) => ({
  id: "g-hook-" + id, title: `Hook latency, ${id} adapter (${HOSTS[id].event}, small payload)`, inputs: [], command: `node run.mjs g-hook-${id}`,
  noServer: true,
  async run({ bundle, sb }) {
    const payload = hostPayload(id, sb.project, "git status", "On branch main\nnothing to commit");
    runHook(bundle, sb, id, payload); // warm file cache
    const hs = [], bs = [];
    for (let i = 0; i < 5; i++) { bs.push(bare()); const r = runHook(bundle, sb, id, payload); if (r.status !== 0) return { error: id + " hook exit " + r.status + ": " + r.stderr.slice(-200) }; hs.push(r.ms); }
    const h = stats(hs).median, b = stats(bs).median;
    return { metrics: { hook_ms: h, bare_node_ms: b, overhead_ms: h - b }, ok: true };
  },
}));

export default {
  id: "g-overhead",
  title: "G. Overhead (hook latency, search latency, index time, full session)",
  blurb: "Each hook row is the median of 5 hook processes inside one run, a fresh process each (no daemon), minus the median of 5 bare `node -e \"\"` starts. The small payload is an allowed command, so this is the fixed cost of every tool call.",
  scenarios: [
    ...hostScenarios,
    {
      id: "g-search-latency", title: "ctx_search latency (20 queries over 8 indexed fixtures)", inputs: SESSION, command: "node run.mjs g-search-latency",
      async run({ client }) {
        for (const f of SESSION) { const r = await client.call("ctx_index", { content: read(f), source: f }); if (r.error || r.isError) return { error: r.error ?? r.text }; }
        const qs = ["failed tests", "TS2339", "build warnings", "status 500", "revert", "label bug", "sessions", "button", "error", "cache", "timeout", "import", "commit", "page", "request", "login", "price", "user", "route", "export"];
        const ms = [], by = []; let last = "";
        for (const q of qs) { const r = await client.call("ctx_search", { queries: [q] }); if (r.error || r.isError) return { error: r.error ?? r.text }; ms.push(r.ms); by.push(bytes(r.text)); last = r.text; }
        const s = stats(ms);
        return { metrics: { search_ms_median: s.median, search_ms_max: s.max, reply_bytes_median: stats(by).median }, reply: last, ok: true };
      },
    },
    {
      id: "g-index-per-mb", title: "ctx_index time per MB (3 real files, 0.6 MB)", inputs: ["github-api-issues-large.json", "git-log-large.txt", "sqlite-fts5-docs.html"], command: "node run.mjs g-index-per-mb",
      async run({ client }) {
        let total = 0, ms = 0;
        for (const f of ["github-api-issues-large.json", "git-log-large.txt", "sqlite-fts5-docs.html"]) {
          const c = read(f); const r = await client.call("ctx_index", { content: c, source: f });
          if (r.error || r.isError) return { error: r.error ?? r.text }; total += bytes(c); ms += r.ms;
        }
        return { metrics: { total_bytes: total, index_ms: ms, index_ms_per_mb: ms / (total / 1048576) }, ok: true };
      },
    },
    {
      id: "g-session-total", title: "Full debugging session: 8 outputs through the hooks, 3 follow-up searches", inputs: SESSION, command: "node run.mjs g-session-total",
      async run({ bundle, sb, client }) {
        const session = "bench-total"; let raw = 0, seen = 0, hookMs = 0, n = 0;
        for (const f of SESSION) {
          const t = read(f); raw += bytes(t);
          const h = runHook(bundle, sb, "claude-code", postToolUse(sb, t, { command: "cat data/" + f, session, n: ++n }));
          const s = seenAfterHook(t, h); if (s.error) return { error: s.error };
          seen += bytes(s.seen); hookMs += h.ms;
        }
        let follow = 0; const replies = [];
        for (const q of ["failed tests", "TS2339 property", "status 500"]) { const r = await client.call("ctx_search", { queries: [q], scope: "session" }, session); if (r.error || r.isError) return { error: r.error ?? r.text }; follow += bytes(r.text); replies.push(r.text); }
        return { metrics: { raw_bytes: raw, ctx_bytes: seen + follow, hook_left_bytes: seen, follow_up_bytes: follow, hook_ms_total: hookMs }, reply: replies.join("\n"), ok: true };
      },
    },
  ],
  table(rows) {
    const hosts = rows.filter((r) => r.id.startsWith("g-hook-"));
    const out = ["| Hook (host adapter) | Hook ms | Bare node ms | Overhead ms |", "|---|---:|---:|---:|"];
    for (const r of hosts) out.push(`| [${r.id.slice(7)}](${r.link}) | ${rng3(r.metrics.hook_ms, 1)} | ${rng3(r.metrics.bare_node_ms, 1)} | ${rng3(r.metrics.overhead_ms, 1)} |`);
    out.push("", "| Scenario | Result |", "|---|---|");
    for (const r of rows.filter((x) => !x.id.startsWith("g-hook-"))) {
      const m = r.metrics;
      if (r.id === "g-search-latency") out.push(`| [${r.title}](${r.link}) | median ${rng3(m.search_ms_median, 1)} ms, worst ${rng3(m.search_ms_max, 1)} ms, reply ${kb(m.reply_bytes_median.median)} KB |`);
      else if (r.id === "g-index-per-mb") out.push(`| [${r.title}](${r.link}) | ${rng3(m.index_ms_per_mb)} ms per MB (${rng3(m.index_ms)} ms for ${kb(m.total_bytes.median)} KB) |`);
      else out.push(`| [${r.title}](${r.link}) | raw ${kb(m.raw_bytes.median)} KB, entered ${kb(m.ctx_bytes.median)} KB (hooks left ${kb(m.hook_left_bytes.median)} + searches ${kb(m.follow_up_bytes.median)}), saved ${pct(m.raw_bytes.median, m.ctx_bytes.median)}, hook time ${rng3(m.hook_ms_total)} ms |`);
    }
    return out;
  },
};
