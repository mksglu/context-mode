// Group E: session continuity. Hooks journal each tool output into the session; after a compaction the agent gets a
// small state block (SessionStart(compact) hook, or ctx_resume) instead of the transcript. Native = replaying the raw outputs.
import { bytes, read, rng, postToolUse, runHook, pct, kb, rng3 } from "../suite/lib.mjs";

const DEBUG = ["test-output.txt", "tsc-errors.txt", "build-output.txt", "git-log.txt", "access.log", "github-issues.json"];

// 40 deterministic synthetic tool outputs of about 20 KB (seed 20261031): a long session.
function synthOutputs(count) {
  const r = rng(20261031), out = [];
  for (let i = 0; i < count; i++) {
    const lines = [];
    for (let j = 0; j < 260; j++) lines.push(`step ${i} line ${j} id=${Math.floor(r() * 1e9).toString(16)} took=${Math.floor(r() * 900)}ms ${r() < 0.04 ? "WARN slow upstream" : "ok"}`);
    out.push(lines.join("\n"));
  }
  return out;
}

async function feed(bundle, sb, session, texts, cmds) {
  let n = 0, hookBytes = 0;
  for (const [i, t] of texts.entries()) {
    const h = runHook(bundle, sb, "claude-code", postToolUse(sb, t, { command: cmds[i], session, n: ++n }));
    if (h.status !== 0) throw new Error("hook exit " + h.status + ": " + h.stderr.slice(-200));
    hookBytes += bytes(h.stdout);
  }
  return hookBytes;
}

const CASES = [
  { id: "e-debug-session", title: "Debugging session: 6 real outputs, then compaction", texts: () => DEBUG.map(read), cmds: () => DEBUG.map((f) => "cat data/" + f), question: "what failed in the tests", expect: "4 failed" },
  { id: "e-long-session", title: "Long session: 40 synthetic outputs (seeded), then compaction", synthetic: true, texts: () => synthOutputs(40), cmds: () => synthOutputs(40).map((_, i) => "run step " + i), question: "which step was slow upstream", expect: "WARN slow upstream" },
];

export default {
  id: "e-continuity",
  title: "E. Session continuity (compaction and resume)",
  blurb: "Native = the raw tool outputs that a transcript replay would carry. context-mode = the SessionStart(compact) state block, ctx_resume, and the UserPromptSubmit recall block. 'Recall found' means the recall block for a prompt holds a line that answers it. This measures bytes and presence of the answer, not whether a model keeps working well after compaction.",
  scenarios: CASES.map((c) => ({
    id: c.id, title: c.title, inputs: c.synthetic ? [] : DEBUG, synthetic: !!c.synthetic, command: `node run.mjs ${c.id}`,
    async run({ bundle, sb, client }) {
      const session = "bench-" + c.id, texts = c.texts(), cmds = c.cmds();
      const raw = texts.reduce((a, t) => a + bytes(t), 0);
      const hookBytes = await feed(bundle, sb, session, texts, cmds);
      const resume = await client.call("ctx_resume", {}, session);
      const ss = runHook(bundle, sb, "claude-code", { hook_event_name: "SessionStart", source: "compact", session_id: session, cwd: sb.project });
      const up = runHook(bundle, sb, "claude-code", { hook_event_name: "UserPromptSubmit", prompt: c.question, session_id: session, cwd: sb.project });
      if (resume.error || resume.isError || ss.status !== 0 || up.status !== 0) return { error: resume.error ?? resume.text ?? "hook exit " + ss.status + "/" + up.status };
      const found = up.stdout.includes(c.expect) ? 1 : 0;
      return { metrics: { raw_bytes: raw, hook_bytes_total: hookBytes, resume_bytes: bytes(resume.text), compact_block_bytes: bytes(ss.stdout), recall_bytes: bytes(up.stdout), recall_found: found, resume_ms: resume.ms, events: texts.length }, reply: resume.text, ...(c.synthetic ? { sample: texts[0] } : {}), ok: found === 1, note: found ? "" : "recall block does not hold the expected line" };
    },
  })),
  table(rows) {
    const out = ["| Scenario | Events | Transcript replay KB | PostToolUse hooks left KB | SessionStart(compact) block KB | ctx_resume KB | Resume saved | Recall block KB | Recall found | resume ms |", "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|"];
    for (const r of rows) {
      const m = r.metrics;
      out.push(`| [${r.title}](${r.link}) | ${m.events.median} | ${kb(m.raw_bytes.median)} | ${kb(m.hook_bytes_total.median)} | ${kb(m.compact_block_bytes.median)} | ${kb(m.resume_bytes.median)} | ${pct(m.raw_bytes.median, m.resume_bytes.median)} | ${kb(m.recall_bytes.median)} | ${m.recall_found.median === 1 ? "yes" : "no"} | ${rng3(m.resume_ms)} |`);
    }
    return out;
  },
};
