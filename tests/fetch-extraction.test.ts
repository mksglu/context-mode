/**
 * The lossless invariant, in executable form.
 *
 * The whole "no data loss" claim rests on one property: splitting a converted
 * document into blocks is EXACTLY reversible. If `reassemble(splitBlocks(x))`
 * ever differs from `x` by a single byte, then labelling blocks silently
 * destroys bytes, and every downstream guarantee collapses.
 *
 * These are invariant checks, not the ship proof — per the standing rule the
 * real proof drives `claude -p` against the built bundle. They exist so a
 * future edit to the splitter cannot quietly break reversibility.
 *
 * RED/GREEN: making `splitBlocks` drop blank-line separators (attach them to
 * nothing instead of to the preceding block) fails `reassemble` byte equality
 * on the multi-paragraph and fenced-code cases.
 *
 * No regular expressions (repo-wide ban).
 */
import { describe, test } from "vitest";
import { strict as assert } from "node:assert";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { rmSync } from "node:fs";
import {
  splitBlocks,
  reassemble,
  classifyBlocks,
  contentText,
  templateText,
  hashBlockText,
  normalizeBlockText,
  type Block,
} from "../src/fetch/blocks.js";
import { extractAndStore } from "../src/fetch/extract.js";
import { PageStore, pageKeyFor, hostFor } from "../src/fetch/page-store.js";

const NAV = "* [Home](/)\n* [Docs](/docs)\n* [Pricing](/pricing)\n";
const FOOTER = "(c) 2026 Example Inc. All rights reserved.\n";

function page(article: string): string {
  return `# Example\n\n${NAV}\n${article}\n${FOOTER}`;
}

const SAMPLES: Array<[string, string]> = [
  ["empty", ""],
  ["single line no newline", "just one line"],
  ["single line trailing newline", "just one line\n"],
  ["multi paragraph", "# Title\n\nFirst para.\n\nSecond para.\n"],
  ["crlf", "# Title\r\n\r\nBody with CRLF.\r\n"],
  ["fenced code", "# T\n\n```js\nconst a = 1;\n\nconst b = 2;\n```\n\nAfter.\n"],
  ["tilde fence", "# T\n\n~~~py\nx = 1\n\ny = 2\n~~~\n\nAfter.\n"],
  ["leading blanks", "\n\n\n# After blanks\n\nBody.\n"],
  ["trailing blanks", "# T\n\nBody.\n\n\n\n"],
  ["only blanks", "\n\n\n"],
  ["consecutive headings", "# A\n## B\n### C\n\nBody.\n"],
  ["unicode", "# Başlık\n\nTürkçe içerik — em dash, 日本語, emoji 🚀\n"],
  ["no trailing newline after fence", "```\ncode\n```"],
  ["nav page", page("## Article\n\nThe answer is 42.\n")],
];

describe("splitBlocks / reassemble — the lossless invariant", () => {
  const fenceExamples = [
    ["shorter interior backticks", "````markdown\n```js\n\nfirst();\n```\n````\n"],
    ["mixed interior delimiter", "```js\nfirst();\n~~~\n\nsecond();\n```\n"],
    ["closing-looking line with text", "```js\nfirst();\n```literal\n\nsecond();\n```\n"],
    ["longer closing delimiter", "~~~js\nfirst();\n\nsecond();\n~~~~~ \t\n"],
    ["indented fence", "   ```js\nfirst();\n\nsecond();\n  ```\n"],
    ["over-indented interior delimiter", "```js\nfirst();\n    ```\n\nsecond();\n```\n"],
    ["CRLF fence", "~~~js\r\nfirst();\r\n\r\nsecond();\r\n~~~\r\n"],
  ];

  for (const [name, code] of fenceExamples) {
    test(`keeps a fenced example whole and resumes paragraph splitting: ${name}`, () => {
      const document = code + "\nAfter the example.\n";
      const blocks = splitBlocks(document);
      assert.equal(blocks.length, 2);
      assert.ok(blocks[0].raw.includes(code));
      assert.equal(blocks[1].text, "After the example.");
      assert.equal(reassemble(blocks), document);
    });
  }

  test("an unclosed fence keeps all following paragraphs in the code example", () => {
    const document = "````markdown\n```js\n\nfirst();\n\nsecond();\n";
    assert.equal(splitBlocks(document).length, 1);
    assert.equal(reassemble(splitBlocks(document)), document);
  });

  test("a backtick in the info string does not open a code fence", () => {
    const document = "```not`a-fence\n\nOrdinary paragraph.\n";
    assert.equal(splitBlocks(document).length, 2);
    assert.equal(reassemble(splitBlocks(document)), document);
  });

  test("a closing fence followed by a form feed stays inside the code example", () => {
    const document = "```js\nfirst();\n```\f\n\nsecond();\n```\n";
    assert.equal(splitBlocks(document).length, 1);
    assert.equal(reassemble(splitBlocks(document)), document);
  });

  test("nested fence examples stay searchable when one code line also appears on another page", () => {
    const dbPath = join(tmpdir(), `cm-fetch-nested-fence-${process.pid}-${Date.now()}.db`);
    const store = new PageStore(dbPath);
    const navigation = "* [Docs](/docs)\n";
    const code = "````markdown\n```js\n\nconsole.log('shared example');\n\nconsole.log('unique example');\n```\n````\n";
    const document = `# Nested examples\n\n${navigation}\n${code}`;
    try {
      extractAndStore({
        url: "https://fences.example/reference", sourceLabel: "reference",
        document: `# Reference\n\n${navigation}\nconsole.log('shared example');\n\nReference prose.\n`,
        route: "html", store,
      });
      const result = extractAndStore({
        url: "https://fences.example/nested", sourceLabel: "nested",
        document, route: "html", store,
      });
      assert.equal(result.kind, "index");
      if (result.kind !== "index") return;
      assert.ok(result.indexText.includes(code.trimEnd()), "a fenced example must remain intact in the search index");
      assert.ok(!result.indexText.includes(navigation), "ordinary shared navigation is still extracted");
      assert.equal(store.fullTextOf(pageKeyFor("https://fences.example/nested")), document);
      assert.equal(reassemble(splitBlocks(document)), document);
    } finally {
      store.close();
      for (const suffix of ["", "-wal", "-shm"]) rmSync(dbPath + suffix, { force: true });
    }
  });

  for (const [name, sample] of SAMPLES) {
    test(`reassemble(splitBlocks(x)) === x byte-for-byte: ${name}`, () => {
      const blocks = splitBlocks(sample);
      const round = reassemble(blocks);
      assert.equal(round, sample, `round trip differed for ${name}`);
      assert.equal(
        Buffer.byteLength(round, "utf-8"),
        Buffer.byteLength(sample, "utf-8"),
        `byte length differed for ${name}`,
      );
    });
  }

  test("ordinals are dense and ascending from zero", () => {
    const blocks = splitBlocks(page("## Article\n\nBody.\n"));
    blocks.forEach((b, i) => assert.equal(b.ordinal, i));
  });

  test("content + template partition covers every byte of the document", () => {
    const doc = page("## Article\n\nThe answer is 42.\n");
    const blocks = splitBlocks(doc);
    const navHash = hashBlockText(NAV);
    const res = classifyBlocks({
      blocks,
      otherPageCount: (h) => (h === navHash ? 3 : 0),
      hostPageCount: 3,
    });
    // Every block landed in exactly one bucket, and the two buckets
    // reassemble to the whole document — nothing dropped, nothing duplicated.
    const rejoined = reassemble(res.blocks);
    assert.equal(rejoined, doc);
    assert.equal(res.blocks.length, blocks.length);
  });
});

describe("normalisation and hashing", () => {
  test("whitespace and case differences hash identically", () => {
    assert.equal(
      hashBlockText("* [Home](/)\n  * [Docs](/docs)"),
      hashBlockText("*   [home](/)\n\t* [DOCS](/docs)"),
    );
  });

  test("different text does not collide", () => {
    assert.notEqual(hashBlockText("alpha"), hashBlockText("beta"));
  });

  test("normalisation keeps punctuation — it must not over-match", () => {
    assert.notEqual(normalizeBlockText("a.b"), normalizeBlockText("ab"));
  });

  test("hash is a full sha256 digest, never shortened", () => {
    assert.equal(hashBlockText("anything").length, 64);
  });
});

describe("cold start", () => {
  test("first page of a host admits every block and is marked provisional", () => {
    const blocks = splitBlocks(page("## Article\n\nBody.\n"));
    const res = classifyBlocks({ blocks, otherPageCount: () => 0, hostPageCount: 0 });
    assert.equal(res.provisional, true);
    assert.equal(res.templateBytes, 0);
    assert.ok(res.blocks.every((b) => b.kind === "content"));
  });

  test("site-authored markdown is never provisional and never classified", () => {
    const blocks = splitBlocks("# Authored\n\nBody.\n");
    const res = classifyBlocks({
      blocks,
      otherPageCount: () => 99,
      hostPageCount: 50,
      authored: true,
    });
    assert.equal(res.provisional, false);
    assert.equal(res.templateBytes, 0);
    assert.ok(res.blocks.every((b) => b.kind === "content"));
  });

  test("a page is never compared against itself", () => {
    // otherPageCount excludes the current page by contract; with a single page
    // recorded for the host (itself), nothing may be called template.
    const blocks = splitBlocks(page("## Article\n\nBody.\n"));
    const res = classifyBlocks({ blocks, otherPageCount: () => 0, hostPageCount: 0 });
    assert.ok(res.blocks.every((b) => b.kind === "content"));
  });
});

describe("template detection across pages of a host", () => {
  test("repeated chrome becomes template; the article stays content", () => {
    const doc = page("## Article\n\nThe answer is 42.\n");
    const blocks = splitBlocks(doc);
    const navHash = hashBlockText(NAV);
    const footHash = hashBlockText(FOOTER);
    const res = classifyBlocks({
      blocks,
      otherPageCount: (h) => (h === navHash || h === footHash ? 4 : 0),
      hostPageCount: 4,
    });
    const content = contentText(res.blocks);
    const template = templateText(res.blocks);
    assert.ok(content.indexOf("The answer is 42.") >= 0, "article must survive");
    assert.ok(content.indexOf("[Pricing](/pricing)") === -1, "nav must leave the index");
    assert.ok(template.indexOf("[Pricing](/pricing)") >= 0, "nav must remain retrievable");
    assert.equal(res.allTemplate, false);
  });

  test("a page that is entirely chrome is flagged allTemplate", () => {
    const shell = `${NAV}\n${FOOTER}`;
    const blocks = splitBlocks(shell);
    const seen = new Set(blocks.map((b) => b.hash));
    const res = classifyBlocks({
      blocks,
      otherPageCount: (h) => (seen.has(h) ? 2 : 0),
      hostPageCount: 2,
    });
    assert.equal(res.allTemplate, true);
  });
});

describe("page identity", () => {
  test("fragment does not create a second page row", () => {
    assert.equal(
      pageKeyFor("https://example.com/a/b?x=1#frag"),
      pageKeyFor("https://example.com/a/b?x=1"),
    );
  });

  test("host is lower-cased", () => {
    assert.equal(hostFor("https://Docs.Stripe.COM/api"), "docs.stripe.com");
  });

  test("an unparseable url degrades to itself rather than throwing", () => {
    assert.equal(pageKeyFor("not a url"), "not a url");
    assert.equal(hostFor("not a url"), "");
  });
});

describe("store round trip — nothing is dropped, only labelled", () => {
  const dbPath = join(tmpdir(), `cm-fetch-extract-${process.pid}-${Date.now()}.db`);

  test("second page of a host resolves the first page's cold start", () => {
    const store = new PageStore(dbPath);
    try {
      const one = page("## One\n\nFirst article body.\n");
      const two = page("## Two\n\nSecond article body.\n");

      const r1 = extractAndStore({
        url: "https://example.com/one", sourceLabel: "s1",
        document: one, route: "html", store,
      });
      assert.equal(r1.kind, "index");
      if (r1.kind !== "index") return;
      assert.equal(r1.provisional, true, "first page of a host is provisional");
      assert.equal(r1.templateBlocks, 0);

      const r2 = extractAndStore({
        url: "https://example.com/two", sourceLabel: "s2",
        document: two, route: "html", store,
      });
      assert.equal(r2.kind, "index");
      if (r2.kind !== "index") return;
      assert.equal(r2.provisional, false);
      assert.ok(r2.templateBlocks > 0, "shared nav/footer must be labelled template");
      assert.ok(r2.indexText.indexOf("Second article body.") >= 0);
      assert.ok(r2.indexText.indexOf("[Pricing](/pricing)") === -1);

      // The cold-start page was re-classified, not left wrong forever.
      assert.equal(r2.relabelled.length, 1, "page one must be re-classified");
      assert.ok(r2.relabelled[0].indexText.indexOf("First article body.") >= 0);
      assert.ok(r2.relabelled[0].indexText.indexOf("[Pricing](/pricing)") === -1);

      // And the full documents are still there, byte for byte.
      assert.equal(store.fullTextOf(pageKeyFor("https://example.com/one")), one);
      assert.equal(store.fullTextOf(pageKeyFor("https://example.com/two")), two);
    } finally {
      store.close();
      for (const s of ["", "-wal", "-shm"]) {
        try { rmSync(dbPath + s, { force: true }); } catch { /* best effort */ }
      }
    }
  });

  test("a site shell is refused, and its bytes are stored anyway", () => {
    const dbPath2 = join(tmpdir(), `cm-fetch-shell-${process.pid}-${Date.now()}.db`);
    const store = new PageStore(dbPath2);
    try {
      const one = page("## One\n\nFirst article body.\n");
      const two = page("## Two\n\nSecond article body.\n");
      extractAndStore({ url: "https://ex2.com/one", sourceLabel: "s1", document: one, route: "html", store });
      extractAndStore({ url: "https://ex2.com/two", sourceLabel: "s2", document: two, route: "html", store });

      // A third fetch returns only the shell — every block already seen.
      const shell = `# Example\n\n${NAV}\n${FOOTER}`;
      const r3 = extractAndStore({
        url: "https://ex2.com/three", sourceLabel: "s3", document: shell, route: "html", store,
      });
      assert.equal(r3.kind, "refuse");
      // Refusing to index is not a licence to discard bytes.
      assert.equal(store.fullTextOf(pageKeyFor("https://ex2.com/three")), shell);
    } finally {
      store.close();
      for (const s of ["", "-wal", "-shm"]) {
        try { rmSync(dbPath2 + s, { force: true }); } catch { /* best effort */ }
      }
    }
  });
});
