/**
 * Pi MCP bridge — live call preview for ctx_* tools.
 *
 * Bug: the Pi TUI renders a tool row from the tool's renderCall, and Pi
 * re-runs it on every partial-argument update while the model streams the
 * call. The previous Pi call renderer only printed the bold tool name, so
 * while ctx_execute / ctx_batch_execute were running the TUI showed no
 * command at all — the session looked hung and the executed code only
 * became visible after the call finished.
 *
 * These tests pin the fix:
 *
 *   1. formatCtxCallPreview() produces a compact per-tool preview of the
 *      arguments (code, commands, queries, urls, path/source).
 *   2. The preview is width- and line-capped so long payloads never flood
 *      the tool row.
 *   3. The preview is safe on partial (mid-stream) and non-object args.
 *   4. createContextModeCallRenderer() renders the tool title plus the
 *      indented preview lines and reuses the row-local component.
 */
import { describe, it, expect } from "vitest";

const mod = await import("../../src/adapters/pi/mcp-bridge.js");
const { formatCtxCallPreview, createContextModeCallRenderer, formatCtxResultPreview, createContextModeResultRenderer, PiTextComponent } =
  mod as unknown as {
    formatCtxCallPreview: (toolName: string, args: unknown) => string[];
    createContextModeCallRenderer: (
      toolName: string,
    ) => (args: unknown, theme: unknown, context: unknown) => {
      text: string;
    };
    formatCtxResultPreview: (toolName: string, output: string) => string;
    createContextModeResultRenderer: (
      toolName: string,
    ) => (
      result: unknown,
      options: { expanded: boolean; isPartial: boolean },
      theme: unknown,
      context: unknown,
    ) => { text: string };
    PiTextComponent: new (text?: string) => { text: string; setText(t: string): void };
  };

const theme = { bold: (s: string) => s, fg: (_c: string, s: string) => s };

describe("formatCtxCallPreview — ctx_execute shows the code being executed", () => {
  it("renders language plus up to 8 code lines with a more-lines marker", () => {
    const code = ["console.log('a')", "console.log('b')", ...Array.from({ length: 10 }, () => "x")].join("\n");
    const preview = formatCtxCallPreview("ctx_execute", { language: "javascript", code });
    expect(preview[0]).toBe("language: javascript");
    expect(preview[1]).toBe("console.log('a')");
    expect(preview).toHaveLength(1 + 8 + 1);
    expect(preview.at(-1)).toMatch(/more lines/);
  });

  it("renders nothing when no code is provided yet (empty streaming args)", () => {
    expect(formatCtxCallPreview("ctx_execute", {})).toEqual([]);
    expect(formatCtxCallPreview("ctx_execute", { code: "partial" })).toEqual(["partial"]);
  });
});

describe("formatCtxCallPreview — ctx_batch_execute shows each command", () => {
  it("renders [label] command lines capped at 10 with a marker", () => {
    const commands = Array.from({ length: 12 }, (_, i) => ({
      label: `c${i}`,
      command: `echo ${i}`,
    }));
    const preview = formatCtxCallPreview("ctx_batch_execute", { commands });
    expect(preview[0]).toBe("[c0] echo 0");
    expect(preview).toHaveLength(11);
    expect(preview.at(-1)).toBe("… 2 more commands");
  });

  it("skips malformed entries and shows unlabeled commands bare", () => {
    const preview = formatCtxCallPreview("ctx_batch_execute", {
      commands: [null, { command: "ls -la" }, { label: "x" }],
    });
    expect(preview).toEqual(["ls -la"]);
  });
});

describe("formatCtxCallPreview — search/fetch/index previews", () => {
  it("joins queries for ctx_search", () => {
    expect(formatCtxCallPreview("ctx_search", { queries: ["root cause", "fix"] })).toEqual([
      "queries: root cause | fix",
    ]);
    expect(formatCtxCallPreview("ctx_search", { queries: [] })).toEqual([]);
    expect(formatCtxCallPreview("ctx_search", { queries: [1, "ok", 2] })).toEqual(["queries: ok"]);
  });

  it("lists urls for ctx_fetch_and_index (single url and requests array)", () => {
    expect(formatCtxCallPreview("ctx_fetch_and_index", { url: "https://a.example" })).toEqual([
      "https://a.example",
    ]);
    const urls = formatCtxCallPreview("ctx_fetch_and_index", {
      requests: Array.from({ length: 7 }, (_, i) => ({ url: `https://example.com/${i}` })),
    });
    expect(urls[0]).toBe("https://example.com/0");
    expect(urls).toHaveLength(7);
    expect(urls.at(-1)).toBe("… 1 more urls");
  });

  it("renders path, source, and content preview for ctx_index", () => {
    expect(formatCtxCallPreview("ctx_index", { path: "/tmp/docs", source: "spec", content: "l1\nl2" })).toEqual([
      "path: /tmp/docs",
      "source: spec",
      "l1",
      "l2",
    ]);
  });
});

describe("formatCtxCallPreview — generic fallback and safety", () => {
  it("shows a flat one-line JSON fallback for unknown tools with args", () => {
    expect(formatCtxCallPreview("ctx_purge", { confirm: true, scope: "project" })).toEqual([
      '{"confirm":true,"scope":"project"}',
    ]);
    expect(formatCtxCallPreview("ctx_stats", {})).toEqual([]);
  });

  it("caps preview line width with an ellipsis", () => {
    const [line] = formatCtxCallPreview("ctx_execute", { code: "y".repeat(300) });
    expect(line.length).toBeLessThanOrEqual(110);
    expect(line.endsWith("…")).toBe(true);
  });

  it("never throws on non-object or partial streaming args", () => {
    expect(formatCtxCallPreview("ctx_execute", "not-an-object")).toEqual([]);
    expect(formatCtxCallPreview("ctx_execute", null)).toEqual([]);
    expect(formatCtxCallPreview("ctx_execute", undefined)).toEqual([]);
    expect(
      formatCtxCallPreview("ctx_batch_execute", {
        commands: [{ command: "echo ok" }, { command: 42 }],
      }),
    ).toEqual(["echo ok"]);
  });
});

describe("createContextModeCallRenderer — live call row", () => {
  it("renders the tool title plus indented preview lines", () => {
    const renderer = createContextModeCallRenderer("ctx_execute");
    const component = renderer({ language: "python", code: "print('hi')" }, theme, {});
    expect(component.text).toBe("ctx_execute\n  language: python\n  print('hi')");
  });

  it("renders the title only when there is nothing to preview", () => {
    const renderer = createContextModeCallRenderer("ctx_stats");
    const component = renderer({}, theme, {});
    expect(component.text).toBe("ctx_stats");
  });

  it("reuses the row-local component passed via context.lastComponent", () => {
    const renderer = createContextModeCallRenderer("ctx_search");
    const stub = new PiTextComponent("stale");
    const component = renderer({ queries: ["a"] }, theme, { lastComponent: stub });
    expect(component).toBe(stub);
    expect(stub.text).toBe("ctx_search\n  queries: a");
  });
});

describe("formatCtxResultPreview — collapsed result shows the useful tail, not one line", () => {
  it("shows the last 5 lines when the output is longer", () => {
    const output = Array.from({ length: 12 }, (_, i) => `line ${i + 1}`).join("\n");
    expect(formatCtxResultPreview("ctx_execute", output)).toBe(
      "... (7 earlier lines, ctrl+o to expand)\nline 8\nline 9\nline 10\nline 11\nline 12",
    );
  });

  it("shows short output as-is without a skip hint (blank lines filtered)", () => {
    expect(formatCtxResultPreview("ctx_execute", "only line")).toBe("only line");
    expect(formatCtxResultPreview("ctx_execute", "a\n\nb\nc\nd\ne")).toBe("a\nb\nc\nd\ne");
  });

  it("reports completion when there is no output", () => {
    expect(formatCtxResultPreview("ctx_stats", "   \n\t\n")).toBe("ctx_stats completed");
    expect(formatCtxResultPreview("ctx_stats", "")).toBe("ctx_stats completed");
  });

  it("singular marker for exactly one skipped line", () => {
    expect(formatCtxResultPreview("ctx_search", "a\nb\nc\nd\ne\nf")).toBe(
      "... (1 earlier line, ctrl+o to expand)\nb\nc\nd\ne\nf",
    );
  });
});

describe("createContextModeResultRenderer — phases", () => {
  const renderer = createContextModeResultRenderer("ctx_execute");
  const result = (text: string) => ({ content: [{ type: "text", text }] });

  it("shows the in-progress indicator for partial results", () => {
    expect(renderer(result("ignored"), { expanded: false, isPartial: true }, theme, {}).text).toBe(
      "indexing/searching...",
    );
  });

  it("shows the tail preview when collapsed and the full output when expanded", () => {
    const output = Array.from({ length: 8 }, (_, i) => `out ${i + 1}`).join("\n");
    expect(renderer(result(output), { expanded: false, isPartial: false }, theme, {}).text).toBe(
      "... (3 earlier lines, ctrl+o to expand)\nout 4\nout 5\nout 6\nout 7\nout 8",
    );
    expect(renderer(result(output), { expanded: true, isPartial: false }, theme, {}).text).toBe(output);
  });
});
