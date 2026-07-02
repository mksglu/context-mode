/**
 * Shared session directive builder for all platform adaptors.
 *
 * Contains: groupEvents, writeSessionEventsFile, buildSessionDirective, getSessionEvents, getLatestSessionEvents.
 * Each adaptor imports these instead of duplicating the logic.
 */

import { writeFileSync } from "node:fs";
import { charSafePrefix } from "./safe-prefix.mjs";

// ── Leg-boundary helpers (#780) ──
// The current Claude Code session_id persists across `--continue` legs, so the
// events array can carry rows written in a PRIOR leg. The last `session_start`
// lifecycle event (emitted by the prior leg's SessionStart, before this leg's
// directive is built — sessionstart.mjs:206/258, 277/293) is the boundary that
// opened the current leg. Rows with created_at < boundary are prior-leg.
function computeLegBoundary(events) {
  let boundary = null;
  for (const ev of events) {
    if (ev.category === "session_start" && ev.created_at) boundary = ev.created_at;
  }
  return boundary;
}

// True when an event was written in a leg strictly before the current one.
// No boundary (first leg) → nothing is prior-leg, so everything stays current.
function isPriorLeg(ev, boundary) {
  return boundary != null && ev.created_at != null && ev.created_at < boundary;
}

// ── Data References sizing (#840) ──
// Inlining every captured tool-output verbatim defeats context-mode's own
// raw-bytes-stay-out principle. Inline only a small recent window; reference
// large blobs with a one-line pointer. The full payloads stay queryable in
// FTS5 via ctx_search(source: "session-events").
const DATA_REF_INLINE_MAX = 8; // most-recent captures rendered inline
const DATA_REF_ENTRY_MAX = 150; // per-entry char cap before it is referenced

function charSafeSummary(str, maxChars) {
  return str.length > maxChars ? `${charSafePrefix(str, maxChars - 3)}...` : str;
}

function renderDataReferences(entries, push, searchHint) {
  const recent = entries.slice(-DATA_REF_INLINE_MAX);
  for (const ev of recent) {
    const raw = ev.data ?? "";
    const text = raw.length > DATA_REF_ENTRY_MAX
      ? `${charSafePrefix(raw, DATA_REF_ENTRY_MAX - 3)}… (${raw.length} bytes — query ${searchHint})`
      : raw;
    push(`- ${text}`);
  }
  const older = entries.length - recent.length;
  if (older > 0) {
    push(`- … ${older} older captures kept in the sandbox — query ${searchHint}.`);
  }
}

// ── Group events by category and extract metadata ──
export function groupEvents(events) {
  const grouped = {};
  let lastPrompt = "";
  const legBoundary = computeLegBoundary(events);
  for (const ev of events) {
    if (ev.category === "prompt") {
      lastPrompt = ev.data;
      continue;
    }
    if (!grouped[ev.category]) grouped[ev.category] = [];
    grouped[ev.category].push(ev);
  }
  const fileNames = new Set();
  for (const ev of (grouped.file || [])) {
    const path = ev.data.includes(" in ") ? ev.data.split(" in ").pop() : ev.data;
    const base = path?.split(/[/\\]/).pop()?.trim();
    if (base && !base.includes("*")) fileNames.add(base);
  }
  return { grouped, lastPrompt, fileNames, legBoundary };
}

// ── Write session events as markdown for FTS5 auto-indexing ──
// Structured with H2 headings per category — optimal for FTS5 chunking.
export function writeSessionEventsFile(events, eventsPath) {
  const { grouped, lastPrompt, fileNames, legBoundary } = groupEvents(events);

  const lines = [];
  lines.push("# Session Resume");
  lines.push("");
  lines.push(`Events: ${events.length} | Timestamp: ${new Date().toISOString()}`);
  lines.push("");

  if (fileNames.size > 0) {
    lines.push("## Active Files");
    lines.push("");
    for (const name of fileNames) lines.push(`- ${name}`);
    lines.push("");
  }

  if (grouped.rule?.length > 0) {
    lines.push("## Project Rules");
    lines.push("");
    for (const ev of grouped.rule) {
      if (ev.type === "rule_content") {
        const downgraded = ev.data.replace(/^(#{1,3}) /gm, (_, hashes) => "#".repeat(hashes.length + 3) + " ");
        lines.push(downgraded);
        lines.push("");
      } else {
        lines.push(`- ${ev.data}`);
      }
    }
    lines.push("");
  }

  if (grouped.task?.length > 0) {
    const creates = [];
    const updates = {};
    for (const ev of grouped.task) {
      try {
        const parsed = JSON.parse(ev.data);
        if (parsed.subject) {
          creates.push(parsed.subject);
        } else if (parsed.taskId && parsed.status) {
          updates[parsed.taskId] = parsed.status;
        }
      } catch { /* not JSON — dump as-is */
        creates.push(ev.data);
      }
    }
    const DONE = new Set(["completed", "deleted", "failed"]);
    const sortedIds = Object.keys(updates).sort((a, b) => Number(a) - Number(b));
    const pending = [];
    const completed = [];
    for (let i = 0; i < creates.length; i++) {
      const matchedId = sortedIds[i];
      const status = matchedId ? (updates[matchedId] || "pending") : "pending";
      if (DONE.has(status)) {
        completed.push(creates[i]);
      } else {
        pending.push(creates[i]);
      }
    }
    if (pending.length > 0) {
      lines.push("## Tasks In Progress");
      lines.push("");
      for (const task of pending) lines.push(`- ${task}`);
      lines.push("");
    }
    if (completed.length > 0) {
      lines.push("## Tasks Completed");
      lines.push("");
      for (const task of completed) lines.push(`- ${task}`);
      lines.push("");
    }
  }

  if (grouped.decision?.length > 0) {
    lines.push("## User Decisions");
    lines.push("");
    for (const ev of grouped.decision) lines.push(`- ${ev.data}`);
    lines.push("");
  }

  if (grouped.git?.length > 0) {
    lines.push("## Git Operations");
    lines.push("");
    for (const ev of grouped.git) lines.push(`- ${ev.data}`);
    lines.push("");
  }

  if (grouped.env?.length > 0 || grouped.cwd?.length > 0) {
    lines.push("## Environment");
    lines.push("");
    if (grouped.cwd?.length > 0) {
      lines.push(`- cwd: ${grouped.cwd[grouped.cwd.length - 1].data}`);
    }
    for (const ev of (grouped.env || [])) lines.push(`- ${ev.data}`);
    lines.push("");
  }

  if (grouped.error?.length > 0) {
    lines.push("## Errors Encountered");
    lines.push("");
    for (const ev of grouped.error) lines.push(`- ${ev.data}`);
    lines.push("");
  }

  if (grouped.mcp?.length > 0) {
    const toolCounts = {};
    for (const ev of grouped.mcp) {
      const tool = ev.data.split(":")[0].trim();
      toolCounts[tool] = (toolCounts[tool] || 0) + 1;
    }
    lines.push("## MCP Tool Usage");
    lines.push("");
    for (const [tool, count] of Object.entries(toolCounts)) {
      lines.push(`- ${tool}: ${count} calls`);
    }
    lines.push("");
  }

  if (grouped.subagent?.length > 0) {
    // #780 — only current-leg subagent events are "current". Prior-leg ones
    // are reframed as history so stale [completed]/[launched] labels are not
    // re-injected as if the agent ran in this conversation.
    const currentSub = grouped.subagent.filter(ev => !isPriorLeg(ev, legBoundary));
    const priorSub = grouped.subagent.filter(ev => isPriorLeg(ev, legBoundary));
    if (currentSub.length > 0) {
      lines.push("## Subagent Tasks");
      lines.push("");
      for (const ev of currentSub) lines.push(`- ${ev.data}`);
      lines.push("");
    }
    if (priorSub.length > 0) {
      lines.push("## Subagent Tasks (earlier session — not current)");
      lines.push("");
      for (const ev of priorSub) lines.push(`- ${ev.data}`);
      lines.push("");
    }
  }

  if (grouped.skill?.length > 0) {
    const uniqueSkills = new Set(grouped.skill.map(e => e.data));
    lines.push("## Active Skills");
    lines.push("");
    lines.push(`- ${[...uniqueSkills].join(", ")}`);
    lines.push("");
  }

  if (grouped.intent?.length > 0) {
    lines.push("## Session Intent");
    lines.push("");
    lines.push(`- ${grouped.intent[grouped.intent.length - 1].data}`);
    lines.push("");
  }

  if (grouped.role?.length > 0) {
    lines.push("## User Role");
    lines.push("");
    lines.push(`- ${grouped.role[grouped.role.length - 1].data}`);
    lines.push("");
  }

  if (grouped.data?.length > 0) {
    lines.push("## Data References");
    lines.push("");
    renderDataReferences(
      grouped.data,
      (l) => lines.push(l),
      'ctx_search(source: "session-events")',
    );
    lines.push("");
  }

  if (grouped.plan?.length > 0) {
    const hasApproved = grouped.plan.some(e => e.type === "plan_approved");
    const hasRejected = grouped.plan.some(e => e.type === "plan_rejected");
    const lastPlan = grouped.plan[grouped.plan.length - 1];
    const isActive = lastPlan.type === "plan_enter" || lastPlan.type === "plan_file_write";
    lines.push("## Plan Mode");
    lines.push("");
    if (hasApproved) lines.push("- Status: APPROVED AND EXECUTED");
    else if (hasRejected) lines.push("- Status: REJECTED BY USER");
    else if (isActive) lines.push("- Status: ACTIVE (in planning)");
    else lines.push("- Status: COMPLETED");
    for (const ev of grouped.plan) lines.push(`- ${ev.data}`);
    lines.push("");
  }

  if (lastPrompt) {
    lines.push("## Last User Prompt");
    lines.push("");
    lines.push(lastPrompt);
    lines.push("");
  }

  writeFileSync(eventsPath, lines.join("\n"), "utf-8");
  return { grouped, lastPrompt, fileNames };
}

// ── Build session guide — actionable narrative for LLM to continue from ──
export function buildSessionDirective(source, eventMeta, toolNamer) {
  const { grouped, lastPrompt, fileNames, legBoundary } = eventMeta;
  const isCompact = source === "compact";
  const searchTool = toolNamer ? toolNamer("ctx_search") : "ctx_search";
  const dataSearchHint = `${searchTool}(source: "session-events")`;

  let block = `\n<session_knowledge source="${isCompact ? "compact" : "continue"}">`;
  block += `\n<session_guide>`;

  // 1. Last request — most critical for continuation
  if (lastPrompt) {
    // Truncate overly long prompts — keep first 300 chars as summary
    const displayPrompt = charSafeSummary(lastPrompt, 300);
    block += `\n## Last Request`;
    block += `\n${displayPrompt}`;
    block += `\n`;
  }

  // 2. Tasks — parsed into readable format, only pending/in-progress shown
  // TaskCreate events have {subject} but no taskId.
  // TaskUpdate events have {taskId, status} but no subject.
  // Match by chronological order: creates[0] → lowest taskId from updates.
  // Completed tasks are excluded — the model should not re-work them.
  if (grouped.task?.length > 0) {
    const creates = [];
    const updates = {};

    for (const ev of grouped.task) {
      try {
        const parsed = JSON.parse(ev.data);
        if (parsed.subject) {
          creates.push(parsed.subject);
        } else if (parsed.taskId && parsed.status) {
          updates[parsed.taskId] = parsed.status;
        }
      } catch { /* not JSON */ }
    }

    if (creates.length > 0) {
      const DONE = new Set(["completed", "deleted", "failed"]);
      const sortedIds = Object.keys(updates).sort((a, b) => Number(a) - Number(b));
      const pending = [];
      for (let i = 0; i < creates.length; i++) {
        const matchedId = sortedIds[i];
        const status = matchedId ? (updates[matchedId] || "pending") : "pending";
        if (!DONE.has(status)) {
          pending.push(creates[i]);
        }
      }
      if (pending.length > 0) {
        block += `\n## Pending Tasks`;
        for (const task of pending) {
          block += `\n- ${task}`;
        }
        block += `\n`;
      }
    }
  }

  // 3. Key decisions
  if (grouped.decision?.length > 0) {
    block += `\n## Key Decisions`;
    for (const ev of grouped.decision) {
      block += `\n- ${charSafeSummary(ev.data, 150)}`;
    }
    block += `\n`;
  }

  // 4. Files modified
  if (fileNames.size > 0) {
    block += `\n## Files Modified`;
    block += `\n${[...fileNames].join(", ")}`;
    block += `\n`;
  }

  // 5. Errors
  if (grouped.error?.length > 0) {
    block += `\n## Unresolved Errors`;
    for (const ev of grouped.error) {
      block += `\n- ${charSafeSummary(ev.data, 150)}`;
    }
    block += `\n`;
  }

  // 6. Git state
  if (grouped.git?.length > 0) {
    const uniqueOps = [...new Set(grouped.git.map(e => e.data))];
    block += `\n## Git`;
    block += `\n${uniqueOps.join(", ")}`;
    block += `\n`;
  }

  // 7. Project rules (paths only)
  if (grouped.rule?.length > 0) {
    const rPaths = grouped.rule
      .filter(e => e.type !== "rule_content")
      .map(e => {
        const parts = e.data.split(/[/\\]/);
        return parts.slice(-2).join("/");
      });
    const uniquePaths = [...new Set(rPaths)];
    if (uniquePaths.length > 0) {
      block += `\n## Project Rules`;
      block += `\n${uniquePaths.join(", ")}`;
      block += `\n`;
    }
  }

  // 8. MCP tools used
  if (grouped.mcp?.length > 0) {
    const toolCounts = {};
    for (const ev of grouped.mcp) {
      const tool = ev.data.split(":")[0].trim();
      toolCounts[tool] = (toolCounts[tool] || 0) + 1;
    }
    block += `\n## MCP Tools Used`;
    block += `\n${Object.entries(toolCounts).map(([t, c]) => `${t}(${c})`).join(", ")}`;
    block += `\n`;
  }

  // 9. Subagent tasks — #780: prior-leg events are NOT current work. Render
  //    only current-leg subagents under "Subagent Tasks"; reframe prior-leg
  //    ones so stale [completed]/[launched] labels don't read as this leg's.
  if (grouped.subagent?.length > 0) {
    const fmt = (ev) => charSafeSummary(ev.data, 120);
    const currentSub = grouped.subagent.filter(ev => !isPriorLeg(ev, legBoundary));
    const priorSub = grouped.subagent.filter(ev => isPriorLeg(ev, legBoundary));
    if (currentSub.length > 0) {
      block += `\n## Subagent Tasks`;
      for (const ev of currentSub) block += `\n- ${fmt(ev)}`;
      block += `\n`;
    }
    if (priorSub.length > 0) {
      block += `\n## Subagent Tasks (earlier session — not current)`;
      for (const ev of priorSub) block += `\n- ${fmt(ev)}`;
      block += `\n`;
    }
  }

  // 10. Skills invoked
  if (grouped.skill?.length > 0) {
    const uniqueSkills = [...new Set(grouped.skill.map(e => e.data))];
    block += `\n## Skills Used`;
    block += `\n${uniqueSkills.join(", ")}`;
    block += `\n`;
  }

  // 11. Environment
  if (grouped.env?.length > 0 || grouped.cwd?.length > 0) {
    block += `\n## Environment`;
    if (grouped.cwd?.length > 0) {
      block += `\ncwd: ${grouped.cwd[grouped.cwd.length - 1].data}`;
    }
    for (const ev of (grouped.env || [])) {
      block += `\n${ev.data}`;
    }
    block += `\n`;
  }

  // 12. Data references — #840: reference (don't inline) large tool-outputs.
  if (grouped.data?.length > 0) {
    block += `\n## Data References`;
    renderDataReferences(grouped.data, (l) => { block += `\n${l}`; }, dataSearchHint);
    block += `\n`;
  }

  // 13. Intent / Role (if set)
  if (grouped.intent?.length > 0) {
    block += `\n## Session Intent`;
    block += `\n${grouped.intent[grouped.intent.length - 1].data}`;
    block += `\n`;
  }
  if (grouped.role?.length > 0) {
    block += `\n## User Role`;
    block += `\n${grouped.role[grouped.role.length - 1].data}`;
    block += `\n`;
  }

  // 14. Plan mode state — critical for preventing stale plan restoration
  if (grouped.plan?.length > 0) {
    const hasApproved = grouped.plan.some(e => e.type === "plan_approved");
    const hasRejected = grouped.plan.some(e => e.type === "plan_rejected");
    const hasFileWrite = grouped.plan.some(e => e.type === "plan_file_write");
    const lastPlan = grouped.plan[grouped.plan.length - 1];
    const isActive = lastPlan.type === "plan_enter" || lastPlan.type === "plan_file_write";

    block += `\n## Plan Mode`;
    if (hasApproved) {
      block += `\n- Status: APPROVED AND EXECUTED`;
      block += `\n- The plan was approved and executed. Do NOT re-enter plan mode or re-propose the same plan.`;
    } else if (hasRejected) {
      block += `\n- Status: REJECTED BY USER`;
      block += `\n- The user rejected the previous plan. Ask what they want changed before re-planning.`;
    } else if (isActive) {
      block += `\n- Status: ACTIVE (in planning phase)`;
      if (hasFileWrite) {
        block += `\n- Plan file has been written. Awaiting user approval via ExitPlanMode.`;
      }
    } else {
      block += `\n- Status: COMPLETED`;
      block += `\n- The plan has been executed. Do NOT re-enter plan mode or re-propose the same plan.`;
    }
    block += `\n`;
  }

  block += `\n</session_guide>`;

  // Search on demand — detailed data lives in FTS5
  block += `\n<session_search>`;
  block += `\nDetailed session data is indexed in context-mode FTS5 (source: "session-events").`;
  block += `\nUse ${searchTool}(queries: [...], source: "session-events") when you need specifics.`;
  block += `\nDo NOT call ctx_index() — data is already indexed.`;
  block += `\n</session_search>`;

  // Continue instruction
  if (lastPrompt && isCompact) {
    block += `\n<continue_from>Continue working on the last request. Do NOT ask the user to repeat themselves.</continue_from>`;
  }

  block += `\n</session_knowledge>`;
  return block;
}

// ── Get events for a specific session (used by compact) ──
export function getSessionEvents(db, sessionId) {
  return db.db.prepare(
    `SELECT session_id, type, category, priority, data, source_hook, created_at
     FROM session_events WHERE session_id = ? ORDER BY created_at ASC`
  ).all(sessionId);
}

// ── Get events from the most recent session that has events (used by resume) ──
export function getLatestSessionEvents(db) {
  const latest = db.db.prepare(
    `SELECT m.session_id FROM session_meta m
     JOIN session_events e ON m.session_id = e.session_id
     GROUP BY m.session_id
     ORDER BY m.started_at DESC LIMIT 1`
  ).get();
  if (!latest) return [];
  return getSessionEvents(db, latest.session_id);
}
