// Group F: hook redirect. A flooding Read, WebFetch or shell dump is denied (PreToolUse) or replaced (PostToolUse) and routed to the sandbox.
// "Would have entered" = what the tool would put into the context with no hook. "Did" = the deny text or replaced output.
import { bytes, read, postToolUse, runHook, seenAfterHook, pct, kb, rng3 } from "../suite/lib.mjs";

const pre = (sb, tool, input, session = "bench-f") => ({ hook_event_name: "PreToolUse", session_id: session, cwd: sb.project, tool_name: tool, tool_input: input });

const CASES = [
  { id: "f-read-large-file", title: "Read of a 46 KB log (denied, routed to ctx_execute)", file: "access.log", kind: "read" },
  { id: "f-read-big-source", title: "Read of a 61 KB source file (denied, routed to ctx_execute)", file: "source-big.ts", kind: "read" },
  { id: "f-read-small-file", title: "Read of a small file (allowed: nothing to save)", file: "SOURCE.md", kind: "read" },
  { id: "f-webfetch", title: "WebFetch of a docs page (denied, routed to ctx_index + ctx_search)", file: "sqlite-fts5-docs.html", kind: "webfetch", url: "https://www.sqlite.org/fts5.html" },
  { id: "f-bash-dump-post", title: "Bash dump of a 191 KB git log (PostToolUse replace)", file: "git-log-large.txt", kind: "post" },
  { id: "f-bash-curl-post", title: "Bash curl of a 219 KB API payload (allowed before, replaced after)", file: "github-api-issues-large.json", kind: "post", command: "curl -s https://api.github.com/repos/vercel/next.js/issues?per_page=30" },
  { id: "f-read-vite-config", title: "Read of the 89 KB vite config source (denied, routed to ctx_execute)", file: "vite-config.ts", kind: "read" },
  { id: "f-webfetch-vite-docs", title: "WebFetch of the 265 KB Vite features guide (denied, routed to ctx_index + ctx_search)", file: "vite-docs-features.html", kind: "webfetch", url: "https://vite.dev/guide/features.html" },
];

export default {
  id: "f-hook-redirect",
  title: "F. Hook redirect (flooding calls denied or replaced)",
  blurb: "Hooks run as the claude-code adapter. For WebFetch the body size is the size of the captured page the URL serves (the fixture); the real network is not used. The deny text is all the model gets; the follow-up call in the sandbox costs what group A or B shows for the same input.",
  scenarios: CASES.map((c) => ({
    id: c.id, title: c.title, inputs: [c.file], command: `node run.mjs ${c.id}`,
    async run({ bundle, sb }) {
      const raw = read(c.file);
      let h, ctxBytes, decision, reply, note = "";
      if (c.kind === "read") { h = runHook(bundle, sb, "claude-code", pre(sb, "Read", { file_path: sb.project + "/data/" + c.file })); }
      else if (c.kind === "webfetch") { h = runHook(bundle, sb, "claude-code", pre(sb, "WebFetch", { url: c.url, prompt: "summarize" })); }
      else { h = runHook(bundle, sb, "claude-code", postToolUse(sb, raw, { command: c.command ?? "cat data/" + c.file })); }
      if (h.status !== 0) return { error: "hook exit " + h.status + ": " + h.stderr.slice(-200) };
      if (c.kind === "post") {
        const s = seenAfterHook(raw, h);
        if (s.error) return { error: s.error };
        ctxBytes = bytes(s.seen); reply = s.seen; decision = s.replaced ? 1 : 0;
        const pre2 = runHook(bundle, sb, "claude-code", pre(sb, "Bash", { command: c.command ?? "cat data/" + c.file }));
        note = "PreToolUse " + (pre2.stdout.trim() === "" ? "allowed" : "answered");
      } else {
        const denied = h.stdout.includes('"deny"');
        ctxBytes = denied ? bytes(h.stdout) : bytes(raw); reply = denied ? h.stdout : raw; decision = denied ? 1 : 0;
      }
      const expectDecision = c.id === "f-read-small-file" ? 0 : 1;
      return { metrics: { raw_bytes: bytes(raw), ctx_bytes: ctxBytes, decision, hook_ms: h.ms }, reply, ok: decision === expectDecision, note };
    },
  })),
  table(rows) {
    const out = ["| Scenario | Would have entered KB | Entered KB | Saved | Hook acted | hook ms |", "|---|---:|---:|---:|---:|---:|"];
    for (const r of rows) {
      const m = r.metrics;
      out.push(`| [${r.title}](${r.link}) | ${kb(m.raw_bytes.median)} | ${kb(m.ctx_bytes.median)} | ${pct(m.raw_bytes.median, m.ctx_bytes.median)} | ${m.decision.median === 1 ? "yes" : "no"} | ${rng3(m.hook_ms)} |`);
    }
    return out;
  },
};
