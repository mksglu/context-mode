// Group B: knowledge retrieval, ctx_index then ctx_search with fixed queries. Reports search reply bytes, queries with a hit,
// whether code blocks of the source come back whole, and for the HTML page whether the expected answer string is in the hits.
import { readFileSync } from "node:fs";
import path from "node:path";
import { BENCH, bytes, read, fences, queriesWithHits, pct, kb, rng3, indexedLabel, savedCell } from "../suite/lib.mjs";

const scen = JSON.parse(readFileSync(path.join(BENCH, "fixtures", "scenarios.json"), "utf8"));
const v1 = JSON.parse(readFileSync(path.join(BENCH, "fixtures", "v1-baseline.json"), "utf8"));
const v1Row = (name) => v1.rows.find((r) => r.part === 2 && r.scenario === name);

function content(s) {
  if (s.fixture) return read(s.fixture);
  if (s.concat) return s.concat.map((f) => read(f) + s.sep).join("");
  return JSON.parse(read(s.mcpTools)).map((t) => `### ${t.name}\n\n${t.description}`).join("\n\n---\n\n");
}
const slug = (t) => "b-" + t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// v2 scenario: a real HTML docs page (sqlite.org FTS5), indexed by path; htmlparser2 readable text. `expect` = a string the
// answer to that query must contain (taken from the page, not from our output).
const HTML = {
  scenario: "HTML docs page (sqlite.org FTS5, 215 KB)", source: "sqlite-fts5", fixture: "sqlite-fts5-docs.html", html: true,
  qa: [
    { q: "bm25 ranking function weights", expect: "ORDER BY bm25(ft, 10.0, 5.0)" },
    { q: "unicode61 tokenizer remove_diacritics", expect: "remove_diacritics" },
    { q: "contentless table delete", expect: "contentless_delete" },
  ],
};

const items = [...scen.part2.map((s) => ({ ...s, qa: s.queries.map((q) => ({ q })) })), HTML];

export default {
  id: "b-retrieval",
  title: "B. Knowledge retrieval (ctx_index + ctx_search)",
  blurb: "The document goes into the FTS5 store; the agent asks fixed queries and gets the best chunks back. Native = the whole document entering the context. ctx_fetch_and_index is not run: it needs the network and the suite is offline. The same index path serves it (the page body is indexed the same way).",
  scenarios: items.map((s) => ({
    id: slug(s.scenario), title: s.scenario, inputs: s.fixture ? [s.fixture] : s.concat ?? [s.mcpTools], v1: !s.html,
    command: `node run.mjs ${slug(s.scenario)}`,
    async run({ client }) {
      const text = s.html ? null : content(s);
      const raw = s.html ? read(s.fixture) : text;
      const queries = s.qa.map((x) => x.q);
      const ix = await client.call("ctx_index", s.html ? { path: "data/" + s.fixture } : { content: text, source: s.source });
      // The search uses the label ctx_index returned (D-PATH-LABEL-1), not a label the harness spelled itself.
      const label = s.html ? indexedLabel(ix.text) ?? "data/" + s.fixture : s.source;
      const se = await client.call("ctx_search", { queries, source: label });
      if (ix.error || se.error || ix.isError || se.isError) return { error: ix.error ?? se.error ?? (ix.isError ? ix.text : se.text) };
      const blocks = fences(s.html ? raw : text);
      const whole = blocks.filter((b) => se.text.includes(b)).length;
      const expect = s.qa.filter((x) => x.expect);
      const metrics = {
        raw_bytes: bytes(raw), ctx_bytes: bytes(se.text), index_ms: ix.ms, search_ms: se.ms,
        queries: queries.length, queries_hit: queriesWithHits(se.text, queries), blocks_in_source: blocks.length, blocks_whole: whole,
        v1_bytes: v1Row(s.scenario)?.v1_context_bytes ?? null,
      };
      let ok = true; // honest numbers: a v1 scenario with fewer hits is shown in the table, it does not fail the row
      let note = "";
      if (expect.length) {
        const parts = se.text.split(/^Query ".*":$/m).slice(1);
        const found = expect.filter((x) => parts[s.qa.indexOf(x)]?.includes(x.expect)).length;
        metrics.answers_found = found; metrics.answers_expected = expect.length;
        const markup = /<(div|span|table|script|style|a href)\b/i.test(se.text);
        metrics.markup_in_reply = markup ? 1 : 0;
        ok = metrics.queries_hit === queries.length && found === expect.length && !markup;
        if (found < expect.length) note = `answer string missing for ${expect.length - found} query(ies)`;
      }
      return { metrics, ok, note, reply: se.text };
    },
  })),
  table(rows) {
    const out = ["| Scenario | Raw KB | v1 saved | v2 search reply KB | v2 saved | Queries hit | Code blocks whole | Answer string in hits | index+search ms |", "|---|---:|---:|---:|---:|---:|---:|---:|---:|"];
    for (const r of rows) {
      const m = r.metrics;
      const ans = m.answers_expected ? `${m.answers_found.median}/${m.answers_expected.median}` : "n/a";
      out.push(`| [${r.title}](${r.link}) | ${kb(m.raw_bytes.median)} | ${pct(m.raw_bytes.median, m.v1_bytes?.median)} | ${kb(m.ctx_bytes.median)} | ${savedCell(r, m.raw_bytes.median, m.ctx_bytes.median)} | ${m.queries_hit.median}/${m.queries.median} | ${m.blocks_whole.median}/${m.blocks_in_source.median} | ${ans} | ${rng3({ median: m.index_ms.median + m.search_ms.median, min: m.index_ms.min + m.search_ms.min, max: m.index_ms.max + m.search_ms.max })} |`);
    }
    return out;
  },
};
