import { describe, test, expect } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  extractAstroImports,
  extractAstroSymbols,
  formatAstroForIndex,
  getLanguageForPath,
} from "../src/astro.js";
import { ContentStore } from "../src/store.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(__dirname, "fixtures", "astro");

function readFixture(name: string): string {
  return readFileSync(join(fixtureDir, name), "utf-8");
}

describe("Astro v6 language support", () => {
  test("detects .astro paths", () => {
    expect(getLanguageForPath("src/pages/home.astro")).toBe("astro");
    expect(getLanguageForPath("src/pages/home.ts")).toBeNull();
  });

  test("creates a synthetic component symbol from the filename", () => {
    const symbols = extractAstroSymbols("---\nconst x = 1;\n---\n<div />", "src/Button.astro");
    expect(symbols).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "class", name: "Button", line: 1 }),
      ]),
    );
  });

  test("handles BOM and CRLF frontmatter with stable line offsets", () => {
    const content = `\ufeff${readFixture("sample_bom_crlf.astro").replace(/\n/g, "\r\n")}`;
    const symbols = extractAstroSymbols(content, "src/BomCase.astro");
    const byName = new Map(symbols.map((symbol) => [symbol.name, symbol]));

    expect(byName.get("Props")).toMatchObject({ kind: "type" });
    expect(byName.get("frontmatterHelper")).toMatchObject({ kind: "function", line: 5 });
    expect(byName.get("hero-banner")).toMatchObject({ kind: "constant" });
  });

  test("extracts template ids while ignoring HTML comments", () => {
    const symbols = extractAstroSymbols(readFixture("sample_malformed_frontmatter.astro"), "src/Malformed.astro");
    const names = new Set(symbols.map((symbol) => symbol.name));

    expect(names.has("Malformed")).toBe(true);
    expect(names.has("content-root")).toBe(true);
    expect(names.has("comment-should-not-extract")).toBe(false);
  });

  test("parses multiple script blocks and skips JSON script payloads", () => {
    const symbols = extractAstroSymbols(readFixture("sample_multi_script.astro"), "src/Multi.astro");
    const byName = new Map(symbols.map((symbol) => [symbol.name, symbol]));

    expect(byName.get("CounterState")).toMatchObject({ kind: "type" });
    expect(byName.has("increment")).toBe(true);
    expect(byName.has("hydrate")).toBe(true);
    expect(byName.has("shouldSkip")).toBe(false);
  });

  test("extracts frontmatter imports and synthetic template component edges", () => {
    const imports = extractAstroImports(readFixture("sample_multi_script.astro"));
    const specifiers = new Set(imports.map((edge) => edge.specifier));

    expect(specifiers.has("./UserCard.astro")).toBe(true);
    expect(specifiers.has("NavBar")).toBe(true);

    const navBar = imports.filter((edge) => edge.specifier === "NavBar");
    expect(navBar).toHaveLength(1);
    expect(navBar[0]).toMatchObject({
      synthetic: true,
      reason: "template_component_usage",
    });
  });

  test("deduplicates synthetic component edges", () => {
    const imports = extractAstroImports("<main><NavBar /><nav-bar /><NavBar /></main>");
    expect(imports.filter((edge) => edge.specifier === "NavBar")).toHaveLength(1);
  });

  test("does not crash on no-frontmatter or malformed-frontmatter files", () => {
    const noFrontmatter = "<section id='simple'><h1>Hello</h1></section>";
    const malformed = readFixture("sample_malformed_frontmatter.astro");

    expect(extractAstroSymbols(noFrontmatter, "src/NoFrontmatter.astro")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "class", name: "NoFrontmatter" }),
      ]),
    );
    expect(extractAstroSymbols(malformed, "src/Malformed.astro")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "class", name: "Malformed" }),
      ]),
    );
  });

  test("formats Astro files into searchable markdown without indexing JSON scripts as code", () => {
    const formatted = formatAstroForIndex(readFixture("sample_multi_script.astro"), "src/Multi.astro");

    expect(formatted).toContain("# Astro Component: Multi");
    expect(formatted).toContain("- type CounterState");
    expect(formatted).toContain("- NavBar: NavBar [synthetic template_component_usage]");
    expect(formatted).not.toContain("shouldSkip");
  });

  test("ContentStore indexes .astro paths through the Astro formatter", () => {
    const dir = mkdtempSync(join(tmpdir(), "context-mode-astro-"));
    const dbPath = join(dir, "astro.db");
    const astroPath = join(dir, "Multi.astro");
    writeFileSync(astroPath, readFixture("sample_multi_script.astro"), "utf-8");

    const store = new ContentStore(dbPath);
    try {
      const result = store.index({ path: astroPath, source: "src/Multi.astro" });
      expect(result.codeChunks).toBeGreaterThan(0);

      const symbolResults = store.search("CounterState increment", 3, "src/Multi.astro");
      expect(symbolResults.length).toBeGreaterThan(0);
      expect(symbolResults.some((r) => r.content.includes("CounterState"))).toBe(true);

      const navResults = store.search("template_component_usage NavBar", 3, "src/Multi.astro");
      expect(navResults.length).toBeGreaterThan(0);

      expect(store.search("shouldSkip", 3, "src/Multi.astro")).toHaveLength(0);
    } finally {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
