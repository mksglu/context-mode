import { basename, extname } from "node:path";

export type AstroLanguage = "astro" | "javascript" | "typescript" | "jsx" | "tsx";
export type AstroSymbolKind = "class" | "function" | "type" | "constant";

export interface AstroSymbol {
  name: string;
  kind: AstroSymbolKind;
  language: AstroLanguage;
  line: number;
  endLine: number;
  signature: string;
  parent?: string;
}

export interface AstroImportEdge {
  specifier: string;
  names: string[];
  synthetic?: boolean;
  reason?: "template_component_usage";
}

export interface AstroFrontmatterSplit {
  frontmatter: string | null;
  template: string;
  frontmatterStartLine: number;
  templateStartLine: number;
  normalized: string;
}

interface ScriptBlock {
  attrs: string;
  body: string;
  full: string;
  startOffset: number;
  bodyStartOffset: number;
  line: number;
  language: Exclude<AstroLanguage, "astro">;
  src: string | null;
  isJson: boolean;
}

const ASTRO_SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
const ASTRO_STYLE_RE = /<style\b([^>]*)>([\s\S]*?)<\/style>/gi;
const ASTRO_ID_RE = /\bid\s*=\s*["']([^"'<>]+)["']/gi;
const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g;
const TEMPLATE_COMPONENT_RE = /<([A-Z][\w]*|[a-z]+-[\w-]+)(?=[\s/>])/g;
const ATTR_LANG_RE = /\blang\s*=\s*["']([^"'<>]+)["']/i;
const ATTR_TYPE_RE = /\btype\s*=\s*["']([^"'<>]+)["']/i;
const ATTR_SRC_RE = /\bsrc\s*=\s*["']([^"'<>]+)["']/i;

const JS_SYMBOL_PATTERNS: Array<{ kind: AstroSymbolKind; re: RegExp }> = [
  { kind: "type", re: /^\s*(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/gm },
  { kind: "type", re: /^\s*(?:export\s+)?type\s+([A-Za-z_$][\w$]*)/gm },
  { kind: "class", re: /^\s*(?:export\s+)?(?:default\s+)?class\s+([A-Za-z_$][\w$]*)/gm },
  {
    kind: "function",
    re: /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm,
  },
  { kind: "constant", re: /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm },
];

const HTML_STANDARD_ELEMENTS = new Set([
  "a", "abbr", "address", "area", "article", "aside", "audio",
  "b", "base", "bdi", "bdo", "blockquote", "body", "br", "button",
  "canvas", "caption", "cite", "code", "col", "colgroup",
  "data", "datalist", "dd", "del", "details", "dfn", "dialog", "div", "dl", "dt",
  "em", "embed",
  "fieldset", "figcaption", "figure", "footer", "form",
  "h1", "h2", "h3", "h4", "h5", "h6", "head", "header", "hgroup", "hr", "html",
  "i", "iframe", "img", "input", "ins",
  "kbd",
  "label", "legend", "li", "link",
  "main", "map", "mark", "menu", "meta", "meter",
  "nav", "noscript",
  "object", "ol", "optgroup", "option", "output",
  "p", "param", "picture", "pre", "progress",
  "q",
  "rp", "rt", "ruby",
  "s", "samp", "script", "search", "section", "select", "slot", "small", "source", "span",
  "strong", "style", "sub", "summary", "sup",
  "table", "tbody", "td", "template", "textarea", "tfoot", "th", "thead", "time", "title", "tr", "track",
  "u", "ul",
  "var", "video",
  "wbr",
  "svg", "path", "circle", "rect", "line", "g", "defs", "use", "text",
  "polygon", "polyline", "ellipse", "image", "mask", "pattern",
  "transition", "transition-group", "keep-alive", "teleport", "suspense", "component",
]);

export function getLanguageForPath(filePath: string): "astro" | null {
  return extname(filePath).toLowerCase() === ".astro" ? "astro" : null;
}

export function normalizeAstroSource(text: string): string {
  const normalized = text.replace(/\r\n?/g, "\n");
  return normalized.startsWith("\ufeff") ? normalized.slice(1) : normalized;
}

export function splitAstroFrontmatter(text: string): AstroFrontmatterSplit {
  const src = normalizeAstroSource(text);
  const lines = src.split("\n");

  let i = 0;
  while (i < lines.length && lines[i].trim() === "") i++;

  if (i >= lines.length || lines[i].trim() !== "---") {
    return {
      frontmatter: null,
      template: src,
      frontmatterStartLine: 1,
      templateStartLine: 1,
      normalized: src,
    };
  }

  const start = i + 1;
  let end = start;
  while (end < lines.length) {
    if (lines[end].trim() === "---") {
      return {
        frontmatter: lines.slice(start, end).join("\n"),
        template: lines.slice(end + 1).join("\n"),
        frontmatterStartLine: start + 1,
        templateStartLine: end + 2,
        normalized: src,
      };
    }
    end++;
  }

  return {
    frontmatter: null,
    template: src,
    frontmatterStartLine: 1,
    templateStartLine: 1,
    normalized: src,
  };
}

export function extractAstroSymbols(content: string, filePath: string): AstroSymbol[] {
  const split = splitAstroFrontmatter(content);
  const source = split.normalized;
  const componentName = componentNameForPath(filePath);
  const symbols: AstroSymbol[] = [{
    name: componentName,
    kind: "class",
    language: "astro",
    line: 1,
    endLine: lineForOffset(source, source.length),
    signature: `component ${componentName}`,
  }];

  if (split.frontmatter !== null) {
    symbols.push(
      ...extractJavaScriptSymbols(
        split.frontmatter,
        split.frontmatterStartLine - 1,
        "typescript",
        componentName,
      ),
    );
  }

  const maskedTemplate = maskHtmlCommentsKeepOffsets(split.template);
  const seenIds = new Set<string>();
  for (const match of maskedTemplate.matchAll(ASTRO_ID_RE)) {
    const name = match[1];
    if (!name || seenIds.has(name)) continue;
    seenIds.add(name);
    const line = split.templateStartLine + lineForOffset(maskedTemplate, match.index ?? 0) - 1;
    symbols.push({
      name,
      kind: "constant",
      language: "astro",
      line,
      endLine: line,
      signature: match[0],
      parent: componentName,
    });
  }

  let scriptIndex = 0;
  for (const script of collectScriptBlocks(source)) {
    scriptIndex++;
    if (script.src) {
      const endLine = lineForOffset(source, script.startOffset + script.full.length - 1);
      symbols.push({
        name: script.src,
        kind: "function",
        language: "astro",
        line: script.line,
        endLine,
        signature: `<script src="${script.src}">`,
        parent: componentName,
      });
      continue;
    }
    if (script.isJson) continue;
    symbols.push(
      ...extractJavaScriptSymbols(
        script.body,
        lineForOffset(source, script.bodyStartOffset) - 1,
        script.language,
        `${componentName}.script${scriptIndex}`,
      ),
    );
  }

  for (const style of source.matchAll(ASTRO_STYLE_RE)) {
    const line = lineForOffset(source, style.index ?? 0);
    const endLine = lineForOffset(source, (style.index ?? 0) + style[0].length - 1);
    symbols.push({
      name: `style:${line}`,
      kind: "constant",
      language: "astro",
      line,
      endLine,
      signature: `<style> at line ${line}`,
      parent: componentName,
    });
  }

  return dedupeSymbols(symbols).sort((a, b) => (
    a.line - b.line || a.name.localeCompare(b.name) || a.kind.localeCompare(b.kind)
  ));
}

export function extractAstroImports(content: string): AstroImportEdge[] {
  const split = splitAstroFrontmatter(content);
  const edges = split.frontmatter === null ? [] : extractJavaScriptImports(split.frontmatter);
  const importedNames = new Set(edges.flatMap((edge) => edge.names));

  for (const component of extractAstroTemplateComponents(split.template)) {
    if (importedNames.has(component)) continue;
    edges.push({
      specifier: component,
      names: [component],
      synthetic: true,
      reason: "template_component_usage",
    });
  }

  return dedupeImports(edges);
}

export function formatAstroForIndex(content: string, filePath: string): string {
  const split = splitAstroFrontmatter(content);
  const source = split.normalized;
  const componentName = componentNameForPath(filePath);
  const symbols = extractAstroSymbols(source, filePath);
  const imports = extractAstroImports(source);
  const sections: string[] = [
    `# Astro Component: ${componentName}\n\nPath: ${filePath}\nLanguage: astro`,
  ];

  if (symbols.length > 0) {
    sections.push([
      "## Symbols",
      ...symbols.map((symbol) => (
        `- ${symbol.kind} ${symbol.name} (line ${symbol.line}, ${symbol.language})`
      )),
    ].join("\n"));
  }

  if (imports.length > 0) {
    sections.push([
      "## Imports",
      ...imports.map((edge) => {
        const names = edge.names.length > 0 ? `: ${edge.names.join(", ")}` : "";
        const synthetic = edge.synthetic ? " [synthetic template_component_usage]" : "";
        return `- ${edge.specifier}${names}${synthetic}`;
      }),
    ].join("\n"));
  }

  if (split.frontmatter !== null && split.frontmatter.trim().length > 0) {
    sections.push(`## Frontmatter\n\n\`\`\`typescript\n${split.frontmatter.trim()}\n\`\`\``);
  }

  const template = stripAstroExecutableBlocks(stripHtmlComments(split.template)).trim();
  if (template.length > 0) {
    sections.push(`## Template\n\n\`\`\`astro\n${template}\n\`\`\``);
  }

  let scriptIndex = 0;
  for (const script of collectScriptBlocks(source)) {
    scriptIndex++;
    if (script.isJson) continue;
    if (script.src) {
      sections.push(`## Script ${scriptIndex}\n\nExternal script: ${script.src}`);
      continue;
    }
    if (script.body.trim().length === 0) continue;
    sections.push(`## Script ${scriptIndex} (${script.language}, line ${lineForOffset(source, script.bodyStartOffset)})\n\n\`\`\`${script.language}\n${script.body.trim()}\n\`\`\``);
  }

  let styleIndex = 0;
  for (const style of source.matchAll(ASTRO_STYLE_RE)) {
    styleIndex++;
    const body = style[2]?.trim() ?? "";
    if (body.length === 0) continue;
    sections.push(`## Style ${styleIndex} (line ${lineForOffset(source, style.index ?? 0)})\n\n\`\`\`css\n${body}\n\`\`\``);
  }

  return `${sections.join("\n\n")}\n`;
}

function extractJavaScriptSymbols(
  source: string,
  lineOffset: number,
  language: Exclude<AstroLanguage, "astro">,
  parent: string,
): AstroSymbol[] {
  const symbols: AstroSymbol[] = [];
  for (const { kind, re } of JS_SYMBOL_PATTERNS) {
    for (const match of source.matchAll(re)) {
      const name = match[1];
      if (!name) continue;
      const line = lineOffset + lineForOffset(source, match.index ?? 0);
      symbols.push({
        name,
        kind,
        language,
        line,
        endLine: line,
        signature: lineTextAt(source, match.index ?? 0),
        parent,
      });
    }
  }
  return symbols;
}

function extractJavaScriptImports(source: string): AstroImportEdge[] {
  const edges: AstroImportEdge[] = [];
  const importFromRe = /^\s*import\s+(?:type\s+)?(.+?)\s+from\s+["']([^"']+)["'];?/gm;
  const sideEffectRe = /^\s*import\s+["']([^"']+)["'];?/gm;

  for (const match of source.matchAll(importFromRe)) {
    const clause = match[1]?.trim() ?? "";
    const specifier = match[2];
    if (!specifier) continue;
    edges.push({ specifier, names: parseImportNames(clause) });
  }

  for (const match of source.matchAll(sideEffectRe)) {
    const specifier = match[1];
    if (!specifier) continue;
    edges.push({ specifier, names: [] });
  }

  return dedupeImports(edges);
}

function parseImportNames(clause: string): string[] {
  const names: string[] = [];
  const trimmed = clause.trim();
  if (!trimmed) return names;

  const defaultMatch = trimmed.match(/^([A-Za-z_$][\w$]*)\s*(?:,|$)/);
  if (defaultMatch) names.push(defaultMatch[1]);

  const namespaceMatch = trimmed.match(/\*\s+as\s+([A-Za-z_$][\w$]*)/);
  if (namespaceMatch) names.push(namespaceMatch[1]);

  const namedMatch = trimmed.match(/\{([^}]*)\}/);
  if (namedMatch) {
    for (const rawPart of namedMatch[1].split(",")) {
      const part = rawPart.trim();
      if (!part) continue;
      const alias = part.match(/\bas\s+([A-Za-z_$][\w$]*)$/);
      names.push(alias?.[1] ?? part.replace(/^type\s+/, "").trim().split(/\s+/)[0]);
    }
  }

  return [...new Set(names.filter(Boolean))];
}

function extractAstroTemplateComponents(template: string): string[] {
  const masked = maskHtmlCommentsKeepOffsets(template);
  const components = new Set<string>();
  for (const match of masked.matchAll(TEMPLATE_COMPONENT_RE)) {
    const tag = match[1];
    if (!tag || HTML_STANDARD_ELEMENTS.has(tag.toLowerCase())) continue;
    components.add(tag.includes("-") ? kebabToPascal(tag) : tag);
  }
  return [...components].sort((a, b) => a.localeCompare(b));
}

function collectScriptBlocks(content: string): ScriptBlock[] {
  const scripts: ScriptBlock[] = [];
  for (const match of content.matchAll(ASTRO_SCRIPT_RE)) {
    const full = match[0];
    const attrs = match[1] ?? "";
    const body = match[2] ?? "";
    const startOffset = match.index ?? 0;
    const bodyStartOffset = startOffset + full.indexOf(">") + 1;
    const type = attrs.match(ATTR_TYPE_RE)?.[1]?.toLowerCase() ?? "";
    scripts.push({
      attrs,
      body,
      full,
      startOffset,
      bodyStartOffset,
      line: lineForOffset(content, startOffset),
      language: scriptLanguage(attrs),
      src: attrs.match(ATTR_SRC_RE)?.[1] ?? null,
      isJson: type.includes("json"),
    });
  }
  return scripts;
}

function scriptLanguage(attrs: string): Exclude<AstroLanguage, "astro"> {
  const lang = attrs.match(ATTR_LANG_RE)?.[1]?.toLowerCase();
  if (lang === "ts" || lang === "typescript") return "typescript";
  if (lang === "tsx") return "tsx";
  if (lang === "jsx") return "jsx";
  return "javascript";
}

function maskHtmlCommentsKeepOffsets(text: string): string {
  return text.replace(HTML_COMMENT_RE, (block) => block.replace(/[^\n]/g, " "));
}

function stripHtmlComments(text: string): string {
  return text.replace(HTML_COMMENT_RE, "");
}

function stripAstroExecutableBlocks(text: string): string {
  return text
    .replace(ASTRO_SCRIPT_RE, "")
    .replace(ASTRO_STYLE_RE, "");
}

function componentNameForPath(filePath: string): string {
  return basename(filePath).replace(/\.astro$/i, "") || "Component";
}

function lineForOffset(text: string, offset: number): number {
  let line = 1;
  const stop = Math.max(0, Math.min(offset, text.length));
  for (let i = 0; i < stop; i++) {
    if (text.charCodeAt(i) === 10) line++;
  }
  return line;
}

function lineTextAt(text: string, offset: number): string {
  const start = text.lastIndexOf("\n", Math.max(0, offset - 1)) + 1;
  const end = text.indexOf("\n", offset);
  return text.slice(start, end === -1 ? undefined : end).trim();
}

function kebabToPascal(name: string): string {
  return name
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function dedupeSymbols(symbols: AstroSymbol[]): AstroSymbol[] {
  const seen = new Set<string>();
  const deduped: AstroSymbol[] = [];
  for (const symbol of symbols) {
    const key = `${symbol.kind}:${symbol.name}:${symbol.line}:${symbol.parent ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(symbol);
  }
  return deduped;
}

function dedupeImports(edges: AstroImportEdge[]): AstroImportEdge[] {
  const seen = new Set<string>();
  const deduped: AstroImportEdge[] = [];
  for (const edge of edges) {
    const key = `${edge.specifier}:${edge.names.join(",")}:${edge.synthetic ? "synthetic" : "real"}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(edge);
  }
  return deduped;
}
