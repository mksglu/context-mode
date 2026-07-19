import "../setup-home";
import { describe, it, expect } from "vitest";
import { extractAssistantDecisions } from "../../src/session/extract.js";

describe("extractAssistantDecisions", () => {
  // ── Basic extraction ──────────────────────────────────────

  it("extracts a simple commitment statement", () => {
    const message = "I've reviewed the options, and I'll use the async pattern for the API client.";
    const events = extractAssistantDecisions(message);
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].category).toBe("decision");
    expect(events[0].type).toBe("decision_assistant");
    expect(events[0].priority).toBe(2);
    expect(events[0].data).toContain("async pattern");
  });

  it("extracts 'let's go with' decisions", () => {
    const message = "Let's go with PostgreSQL for the database, it has better JSON support.";
    const events = extractAssistantDecisions(message);
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].data).toContain("PostgreSQL");
  });

  it("extracts 'we should' decisions", () => {
    const message = "We should refactor the parser first, then add the new features.";
    const events = extractAssistantDecisions(message);
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].data).toContain("refactor");
  });

  it("extracts 'decided' statements", () => {
    const message = "I've decided to use the strategy pattern, it fits this use case better.";
    const events = extractAssistantDecisions(message);
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].data).toContain("strategy pattern");
  });

  // ── Multiple decisions in one message ─────────────────────

  it("extracts multiple decisions from a single message", () => {
    const message = [
      "I'll use the async pattern for the API client, it's more efficient.",
      "Let's go with PostgreSQL for the database, it has better JSON support.",
      "We should add retry logic to the HTTP layer, it will improve reliability.",
    ].join(" ");
    const events = extractAssistantDecisions(message);
    expect(events.length).toBe(3);
    expect(events.every(e => e.category === "decision")).toBe(true);
  });

  // ── Filtering ─────────────────────────────────────────────

  it("returns empty for non-decision text", () => {
    const message = "The function returns a promise that resolves to an array of strings.";
    const events = extractAssistantDecisions(message);
    expect(events).toHaveLength(0);
  });

  it("returns empty for empty string", () => {
    const events = extractAssistantDecisions("");
    expect(events).toHaveLength(0);
  });

  it("returns empty for null/undefined", () => {
    expect(extractAssistantDecisions(null as unknown as string)).toHaveLength(0);
    expect(extractAssistantDecisions(undefined as unknown as string)).toHaveLength(0);
  });

  it("ignores decisions inside code blocks", () => {
    const message = [
      "Here's the code:",
      "```python",
      "I'll use this approach, it's cleaner",
      "```",
      "The implementation is straightforward.",
    ].join("\n");
    const events = extractAssistantDecisions(message);
    // The code block content should be stripped, so no decisions extracted
    // unless the prose part also has a decision (it doesn't here)
    expect(events).toHaveLength(0);
  });

  it("does not extract questions as decisions", () => {
    const message = "I'll use the async pattern, but should we also add caching?";
    const events = extractAssistantDecisions(message);
    // The question mark should cause looksLikeDecision to reject it
    // (the sentence contains a ? which fails the QUESTION_MARK_PATTERN gate)
    expect(events).toHaveLength(0);
  });

  // ── Cap ───────────────────────────────────────────────────

  it("caps at 10 decisions per message", () => {
    const sentences: string[] = [];
    for (let i = 0; i < 15; i++) {
      sentences.push(`I'll use approach ${i} for module ${i}, it's the best fit.`);
    }
    const message = sentences.join(" ");
    const events = extractAssistantDecisions(message);
    expect(events.length).toBeLessThanOrEqual(10);
  });

  // ── Deduplication ─────────────────────────────────────────

  it("deduplicates identical decision sentences", () => {
    const message = "I'll use the async pattern, it's more efficient. I'll use the async pattern, it's more efficient.";
    const events = extractAssistantDecisions(message);
    expect(events.length).toBe(1);
  });

  // ── Edge cases ────────────────────────────────────────────

  it("handles very long messages", () => {
    const parts: string[] = [];
    for (let i = 0; i < 100; i++) {
      parts.push("This is a line of explanation about the code.");
    }
    parts.push("I'll use the factory pattern for object creation, it's more flexible.");
    const message = parts.join(" ");
    const events = extractAssistantDecisions(message);
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].data).toContain("factory pattern");
  });

  it("handles messages with only code blocks", () => {
    const message = "```js\nconst x = 1;\n```";
    const events = extractAssistantDecisions(message);
    expect(events).toHaveLength(0);
  });

  it("never throws on malformed input", () => {
    expect(() => extractAssistantDecisions("   ")).not.toThrow();
    expect(() => extractAssistantDecisions("\n\n\n")).not.toThrow();
    expect(() => extractAssistantDecisions("。！。！")).not.toThrow();
  });
});
