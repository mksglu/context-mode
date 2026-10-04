/**
 * Auto-injection for compaction events.
 *
 * Builds a prioritized, budget-capped injection block from session events.
 * Only fires on source === "compact" (wired in sessionstart.mjs).
 *
 * Priority order:
 *   P1: Role (behavioral_directive) — always first, never truncated
 *   P2: Decisions (rules) — latest 5, overflow reduces to 3
 *   P3: Skills (active_skills) — unique names, latest 10
 *   P4: Intent (session_mode) — latest
 *
 * Hard cap: 500 tokens (~2000 chars at 4 chars/token).
 */

import { charSafePrefix } from "./safe-prefix.mjs";

/**
 * Rough token estimate: ~4 chars per token.
 * @param {string} text
 * @returns {number}
 */
export function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

/**
 * Build auto-injection block from session events.
 *
 * `source` is REQUIRED and has no default, so no caller can silently inherit a
 * label it did not earn. The block is injected on ordinary turns as well as
 * after a compaction, and the two mean different things to the model: only one
 * of them means history was summarized away. Labelling a routine per-turn
 * injection "compaction" tells the agent its transcript is gone when it is
 * intact, and it may go looking for state that never needed restoring.
 *
 * @param {Array<{category: string, data: string}>} events
 * @param {"compaction"|"active_memory"} source
 * @returns {string} XML block or empty string
 */
export function buildAutoInjection(events, source) {
  // Checked at runtime, not just by the JSDoc type: the callers under hooks/
  // are plain .mjs, where a missing argument arrives as `undefined` and would
  // otherwise be interpolated straight into the label. Failing here drops the
  // injection, which callers already treat as an expected outcome, and beats
  // shipping the model a source it cannot trust.
  if (source !== "compaction" && source !== "active_memory") {
    throw new Error(
      `buildAutoInjection: source must be "compaction" or "active_memory", got ${String(source)}`,
    );
  }

  // Single O(N) pass instead of 4× O(N) Array.filter() loops. UserPromptSubmit
  // fires this on every prompt; with N up to 100 events the prior implementation
  // walked the array 4 times per prompt — wasteful on macOS, painful on Windows
  // where V8 cold paths cost more.
  let role;
  const decisionsAll = [];
  const skillsSeen = new Set();
  const skillsOrdered = [];
  let intent;
  for (const e of events) {
    switch (e.category) {
      case "role":
        role = e;
        break;
      case "decision":
        decisionsAll.push(e);
        break;
      case "skill":
        if (!skillsSeen.has(e.data)) {
          skillsSeen.add(e.data);
          skillsOrdered.push(e.data);
        }
        break;
      case "intent":
        intent = e;
        break;
    }
  }

  const parts = [];
  let budget = 500; // hard cap in tokens

  // P1: Role (always first, never truncated from output)
  if (role) {
    const text = `<behavioral_directive>\n${charSafePrefix(role.data, 400)}\n</behavioral_directive>`;
    parts.push(text);
    budget -= estimateTokens(text);
  }

  // P2: Decisions (latest 5)
  const decisions = decisionsAll.slice(-5);
  if (decisions.length > 0) {
    const lines = decisions.map(d => `- ${charSafePrefix(d.data, 100)}`).join("\n");
    const text = `<rules>\nFollow these decisions:\n${lines}\n</rules>`;
    const cost = estimateTokens(text);
    if (cost <= budget) {
      parts.push(text);
      budget -= cost;
    } else {
      // Overflow: reduce to 3 decisions
      const reduced = decisions.slice(-3).map(d => `- ${charSafePrefix(d.data, 100)}`).join("\n");
      const fallback = `<rules>\nFollow these decisions:\n${reduced}\n</rules>`;
      parts.push(fallback);
      budget -= estimateTokens(fallback);
    }
  }

  // P3: Skills (unique names, latest 10)
  if (skillsOrdered.length > 0 && budget > 50) {
    const text = `<active_skills>\nRe-invoke if relevant: ${skillsOrdered.slice(-10).join(", ")}\nTo reload: call the Skill tool with the skill name.\n</active_skills>`;
    parts.push(text);
    budget -= estimateTokens(text);
  }

  // P4: Intent (latest)
  if (intent && budget > 20) {
    parts.push(`<session_mode>${intent.data}</session_mode>`);
  }

  if (parts.length === 0) return "";
  // The fidelity line earns its tokens only after a real compaction, where it
  // tells the model where its history actually lives. On a routine turn it is
  // noise, and the wrapper is outside the 500-token content budget, so an
  // always-on line would tax every turn to say nothing.
  const fidelity = source === "compaction"
    ? "Context was compacted; full history persists in the session transcript.\n\n"
    : "";
  return `<session_state source="${source}">\n\n${fidelity}${parts.join("\n\n")}\n\n</session_state>`;
}
