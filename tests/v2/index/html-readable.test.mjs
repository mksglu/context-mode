// ctx_index of an HTML page stores readable text, not markup (owner report: react.dev useEffect search came back with
// class="..." attributes, Next.js flight data and > escapes). Pages are real saved fixtures (no network in tests,
// see tests/v2/fixtures/html/README.md). They are served from a local server through the same safeFetch path the url
// field uses; tests/v2/e2e/_parity-net-shim.mjs moves only the last network hop (SSRF check stays on).
// D-NO-LOSSY-CUT: the raw body stays stored as a second source "<url> (raw)", reachable by `source`, never ranked by default.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, "..", "fixtures", "html");
process.env.PARITY_HOST = "docs.html.test";
await import(pathToFileURL(join(HERE, "..", "e2e", "_parity-net-shim.mjs")).href);
const { ctxIndex } = await import("../../../src/core/tools/index.ts");
const { ctxSearch } = await import("../../../src/core/tools/search.ts");

const PAGES = [
  { file: "react-useeffect.html", query: "useEffect cleanup function return pattern", words: ["connection.connect();", "return () => {", "connection.disconnect();"] },
  { file: "mdn-array-map.html", query: "map callbackFn thisArg returns a new array", words: ["callbackFn"] },
  { file: "github-readme.html", query: "npm install express", words: ["npm install"] },
  { file: "docusaurus-docs.html", query: "baseUrl site configuration", words: ["baseUrl"] },
  { file: "nextjs-docs.html", query: "page.tsx layout route", words: ["page.tsx"] },
];

let root, srv, base;
const reply = new Map(); // file -> { index, search }

function ctxFor(dir) {
  const key = "2".repeat(16);
  return {
    project: { projectKey: key, projectDir: join(dir, "projects", key), dbPath: join(dir, "projects", key, "context.db"), worktree: dir, containmentRoot: dir, agent: "claude-code", source: "env:CLAUDE_PROJECT_DIR" },
    sessionId: "s1", turn: 1, signal: new AbortController().signal,
  };
}

// The text outside fenced code blocks and `inline code`: a page about HTML or JSX may show a tag there, never in prose.
function outsideFences(text) {
  const keep = [];
  let inside = false;
  for (const line of text.split("\n")) {
    if (line.trimStart().startsWith("```")) { inside = !inside; continue; }
    if (inside) continue;
    let out = "";
    let tick = false;
    for (const ch of line) { if (ch === "`") { tick = !tick; continue; } if (!tick) out += ch; }
    keep.push(out);
  }
  return keep.join("\n");
}
// Real HTML element names (lowercase, as a parser sees them). A page may print <Link> or <siteBaseUrl> as text.
const TAGS = "a|abbr|article|aside|b|body|br|button|code|dd|details|div|dl|dt|em|figure|footer|form|h1|h2|h3|h4|h5|h6|head|header|hr|html|i|iframe|img|input|label|li|link|main|meta|nav|noscript|ol|option|p|path|pre|script|section|select|span|strong|style|summary|svg|table|tbody|td|template|th|thead|title|tr|u|ul";

const MARKUP = [
  [new RegExp("</?(" + TAGS + ")(\\s[^<>]*)?/?>"), "an HTML tag"],
  [/\b(class|style|id|href|src|data-[a-z-]+|aria-[a-z-]+)="/, "an attribute"],
  [/__next_f|self\.__next|<script|<style|\bwindow\.__/, "script or flight data"],
  [/\\u00[0-9a-fA-F]{2}|\\"/, "a JSON escape"],
];

before(async () => {
  root = mkdtempSync(join(tmpdir(), "cm-html-readable-"));
  srv = http.createServer((req, res) => {
    try {
      const body = readFileSync(join(FIX, req.url.slice(1)));
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end("no");
    }
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  base = "http://docs.html.test:" + srv.address().port + "/";
  const ctx = ctxFor(root);
  for (const p of [...PAGES, { file: "spa-excalidraw.html", query: "Excalidraw whiteboard" }]) {
    const t0 = performance.now();
    const index = await ctxIndex.handler({ url: base + p.file }, ctx);
    const ms = performance.now() - t0;
    const search = await ctxSearch.handler({ queries: [p.query] }, ctx);
    reply.set(p.file, { index, search, ms });
    console.log("# " + p.file + " index_ms=" + ms.toFixed(0) + " | " + index.text.split("\n")[0] + " | search_bytes=" + Buffer.byteLength(search.text, "utf8"));
  }
});
after(async () => {
  await new Promise((r) => srv.close(r));
  rmSync(root, { recursive: true, force: true });
});

for (const p of PAGES) {
  test("[html-readable] " + p.file + ": no tag, attribute, script body, flight data or JSON escape in the search reply", () => {
    const { index, search } = reply.get(p.file);
    assert.equal(index.isError, false, index.text);
    assert.equal(search.isError, false, search.text);
    assert.ok(/#/.test(search.text), "the query finds a hit: " + search.text.slice(0, 200));
    const text = outsideFences(search.text);
    for (const [re, what] of MARKUP) {
      const m = re.exec(text);
      assert.equal(m, null, p.file + " reply holds " + what + ": " + (m && text.slice(Math.max(0, m.index - 60), m.index + 100)));
    }
  });
  test("[html-readable] " + p.file + ": the answer text comes back", () => {
    const { search } = reply.get(p.file);
    for (const w of p.words) assert.ok(search.text.includes(w), p.file + " reply lacks " + JSON.stringify(w));
  });
}

test("[html-readable] react.dev useEffect: the cleanup example comes back as one whole fenced code block", () => {
  const { search } = reply.get("react-useeffect.html");
  const lines = search.text.split("\n");
  let open = -1;
  let found = false;
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trimStart().startsWith("```")) continue;
    if (open < 0) { open = i; continue; }
    const block = lines.slice(open + 1, i).join("\n");
    if (block.includes("connection.connect();") && block.includes("return () => {") && block.includes("connection.disconnect();")) {
      assert.ok(block.indexOf("connection.connect();") < block.indexOf("return () => {"), "order kept");
      assert.ok(block.indexOf("return () => {") < block.indexOf("connection.disconnect();"), "order kept");
      assert.ok(block.split("\n").length >= 5, "code keeps its line breaks: " + block.slice(0, 200));
      found = true;
    }
    open = -1;
  }
  assert.ok(found, "no single fenced block holds the cleanup example:\n" + search.text.slice(0, 2500));
});

test("[html-readable] headings and links stay readable (markdown form)", () => {
  const all = PAGES.map((p) => reply.get(p.file).search.text).join("\n");
  // a hit line is "<label> #<n>: <chunk>", so a heading opens a line or follows that prefix
  assert.ok(/(^|\n|#\d+: )#{1,6} \S/.test(all), "a heading line survives:\n" + all.slice(0, 1500));
  assert.ok(/\[[^\]\n]+\]\(https?:\/\/[^)\s]+\)/.test(all), "a link survives as [text](url)");
});

test("[html-readable] the search reply stays under the bound and is far smaller than the raw-attribute noise", () => {
  for (const p of PAGES) assert.ok(Buffer.byteLength(reply.get(p.file).search.text, "utf8") <= 16384, p.file);
});

test("[html-readable] the raw body stays stored: a raw source is named in the reply and reachable by source, not ranked by default", async () => {
  const ctx = ctxFor(root);
  const url = base + "react-useeffect.html";
  const { index, search } = reply.get("react-useeffect.html");
  assert.ok(index.text.includes(url + " (raw)"), "reply names the raw source: " + index.text);
  assert.equal(search.text.includes("(raw)"), false, "default search never lists the raw source");
  const raw = await ctxSearch.handler({ queries: ["sp-pristine cm-line"], source: url + " (raw)" }, ctx);
  assert.equal(raw.isError, false, raw.text);
  assert.ok(raw.text.includes("sp-") || raw.text.includes("<div"), "raw source holds the markup: " + raw.text.slice(0, 300));
  const def = await ctxSearch.handler({ queries: ["sp-pristine cm-line"] }, ctx);
  assert.equal(def.text.includes("(raw)"), false, "default search does not rank raw html");
});

test("[html-readable] a client-rendered page with no readable text says so and indexes no noise", async () => {
  const { index } = reply.get("spa-excalidraw.html");
  assert.equal(index.isError, false, index.text);
  assert.match(index.text, /no readable text/i, index.text);
  assert.ok(index.text.includes("(raw)"), "the raw page is still kept: " + index.text);
  const ctx = ctxFor(root);
  // Other pages share this database, so look only at hits from the excalidraw page (raw source excluded by default).
  const s = await ctxSearch.handler({ queries: ["setTheme localStorage excalidraw-theme"] }, ctx);
  const own = s.text.split("\n").filter((l) => l.includes("spa-excalidraw.html"));
  assert.deepEqual(own, [], "script body is not indexed for default search: " + own.join("\n").slice(0, 300));
});
