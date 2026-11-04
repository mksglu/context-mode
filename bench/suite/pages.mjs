// Group README pages (D-BENCH-PAGES-1): one plain-language section per case, built only from stored data: the results
// file (numbers), its -replies.json twin (the reply text the agent got back) and the input files (sample, sha256).
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { DATA, bytes } from "./lib.mjs";

const fmt = (n) => Math.round(n).toLocaleString("en-US");
const ms1 = (n) => n.toFixed(1);
export const keptOut = (raw, after) => (Math.round((1 - after / raw) * 1000) / 10).toFixed(1);
export const docsLink = (id) => `https://contextmode.ai/docs/engine/tools?utm_source=github&utm_medium=bench&utm_content=${id}`;

/** A fenced block whose fence is longer than any backtick run inside the text. */
export function fence(text, lang = "text") {
  const run = Math.max(2, ...(text.match(/`+/g) ?? []).map((s) => s.length));
  const f = "`".repeat(run + 1);
  return [f + lang, text.replace(/\s+$/, ""), f];
}

/** The first lines of a text, long lines cut; a one-line file shows its first characters instead. */
export function head(text, { lines = 8, width = 160, chars = 480 } = {}) {
  const all = text.replace(/\n$/, "").split("\n");
  if (all.length === 1) {
    const cut = text.length > chars;
    return { body: cut ? text.slice(0, chars) + " ..." : text, note: cut ? `The output is one line of ${fmt(bytes(text))} B. These are its first ${chars} characters.` : "" };
  }
  const pick = all.slice(0, lines);
  const cut = pick.some((l) => l.length > width);
  const body = pick.map((l) => (l.length > width ? l.slice(0, width) + " ..." : l)).join("\n");
  const notes = [];
  if (all.length > lines) notes.push(`First ${lines} of ${fmt(all.length)} lines.`);
  if (cut) notes.push(`Lines over ${width} characters are cut.`);
  return { body, note: notes.join(" ") };
}

export const INTRO = {
  "a-sandbox": [
    "Each case here is one tool output an agent reads every day: docs, test runs, logs, API replies.",
    "Without Context Mode the whole output goes into the chat. With Context Mode a short script reads it in a sandbox.",
    "The agent gets only the lines the script prints, and the raw output stays out of the chat.",
  ],
  "b-retrieval": [
    "Each case here is a document the agent needs a few answers from: library docs, a skill file, a tool list, a docs page.",
    "Without Context Mode the whole document goes into the chat. With Context Mode it goes into a local search index.",
    "The agent asks its questions and gets back only the parts that match.",
  ],
  "c-batch": [
    "Each case here runs a few commands to check the state of a project.",
    "Without Context Mode each command is its own call, and all output goes into the chat.",
    "With Context Mode one ctx_batch call runs them all and answers the questions in one short reply.",
  ],
  "d-externalize": [
    "Each case here prints a very large output, more than 100 KB.",
    "Without Context Mode all of it goes into the chat. With Context Mode the full output goes into a local search index.",
    "The agent gets the start and a pointer, and a search finds any line later: here the first, middle and last line.",
  ],
  "e-continuity": [
    "Each case here is a work session that grows until the agent compacts the chat.",
    "Without Context Mode the agent needs the old tool outputs back to pick up the work.",
    "With Context Mode the hooks keep a journal of the session, and ctx_resume gives back a short summary.",
  ],
  "f-hook-redirect": [
    "Each case here is a tool call that would put a large file, page or output into the chat.",
    "Without Context Mode the whole thing goes in. With Context Mode a hook steps in first.",
    "It sends the call to a context-mode tool, or it swaps the output for a short summary.",
  ],
  "g-overhead": [
    "Each case here shows what Context Mode costs: the time a hook adds to each tool call, search time and index time.",
    "The hook cases compare a hook process with a bare Node start, for each of the 10 agents.",
    "The last case adds up a full debugging session: what went into the chat and what stayed out.",
  ],
};

const WHAT = {
  "a-context7-react-docs": "Look up the React useEffect docs through Context7.",
  "a-context7-nextjs-docs": "Look up the Next.js App Router docs through Context7.",
  "a-context7-tailwind-docs": "Look up the Tailwind CSS docs through Context7.",
  "a-playwright-snapshot": "Take a Playwright snapshot of the Hacker News front page.",
  "a-playwright-network": "List the network requests of a page in Playwright.",
  "a-github-prs": "List the open pull requests of vercel/next.js.",
  "a-github-issues": "List the open issues of facebook/react.",
  "a-test-output": "Run a test suite of 30 test files.",
  "a-tsc-errors": "Type-check a project that has 50 TypeScript errors.",
  "a-build-output": "Build a Next.js app.",
  "a-mcp-tools": "Read the list of 40 tools that an MCP server offers.",
  "a-access": "Read 500 lines of an nginx access log.",
  "a-git-log": "Read 150 commits of a git log.",
  "a-analytics": "Read an analytics CSV file with 500 rows.",
  "a-github-api-issues-large": "Fetch 30 open issues of vercel/next.js from the GitHub API.",
  "a-npm-install-log": "Install packages with npm and read the log.",
  "a-source-big": "Read a 61 KB TypeScript source file.",
  "a-git-log-large": "Read 2,000 commits of a git log.",
  "a-devtools-mcp-snapshot": "Take a snapshot of the Wikipedia SQLite page with Chrome DevTools MCP.",
  "a-gh-issue-list-vite": "List 40 open issues of vitejs/vite with gh.",
  "a-gh-pr-list-vite": "List 25 open pull requests of vitejs/vite with their CI checks.",
  "a-context7-query-docs-vite": "Look up the Vite build and proxy docs through Context7.",
  "a-vitest-run-vite": "Run the 1,106 Vitest tests of vitejs/vite (25 of them fail).",
  "a-biome-lint-vite": "Lint the vitejs/vite source with Biome.",
  "a-pnpm-install-vite": "Install the vitejs/vite workspace with pnpm.",
  "a-docker-logs-mongo": "Read the logs of a MongoDB container.",
  "a-terraform-plan": "Plan 72 new resources with Terraform.",
  "a-git-log-stat-vite": "Read 300 commits of vitejs/vite with file stats.",
  "b-supabase-edge-functions-5-examples": "Find answers in 5 Supabase Edge Functions examples.",
  "b-react-useeffect-docs": "Find answers in the React useEffect docs.",
  "b-next-js-app-router-docs": "Find answers in the Next.js App Router docs.",
  "b-tailwind-css-docs": "Find answers in the Tailwind CSS docs.",
  "b-skill-context-mode-main-prompt": "Find answers in the context-mode skill prompt.",
  "b-skill-references-4-files-combined": "Find answers in 4 skill reference files.",
  "b-mcp-tools-list-40-tools": "Find the right tool in a list of 40 MCP tools.",
  "b-html-docs-page-sqlite-org-fts5-215-kb": "Find answers in the 215 KB SQLite FTS5 docs page.",
  "c-triage": "Check tests, type errors, the build, a server log and the git log in one step.",
  "c-install-log": "Check an install log and a long git log in one step.",
  "c-small": "Run 3 tiny commands in one step.",
  "d-synth-120k": "Print a 120 KB log from a script.",
  "d-synth-1m": "Print a 1 MB log from a script.",
  "d-real-github-json": "Print a 219 KB GitHub API reply from a script.",
  "d-real-git-log": "Print a 191 KB git log from a script.",
  "e-debug-session": "Debug with 6 tool outputs, then compact the chat.",
  "e-long-session": "Work through 40 tool outputs, then compact the chat.",
  "f-read-large-file": "Open a 46 KB log file with Read.",
  "f-read-big-source": "Open a 61 KB source file with Read.",
  "f-read-small-file": "Open a small file with Read.",
  "f-webfetch": "Fetch the SQLite FTS5 docs page with WebFetch.",
  "f-bash-dump-post": "Print a 191 KB git log with Bash.",
  "f-bash-curl-post": "Fetch a 219 KB GitHub API reply with curl in Bash.",
  "f-read-vite-config": "Open the 89 KB vite config source with Read.",
  "f-webfetch-vite-docs": "Fetch the 265 KB Vite features guide with WebFetch.",
  "g-search-latency": "Search 8 indexed tool outputs 20 times.",
  "g-index-per-mb": "Put 0.6 MB of real files into the search index.",
  "g-session-total": "Debug for a full session: 8 tool outputs, then 3 searches.",
};

const HOST = { "claude-code": "Claude Code", codex: "Codex", gemini: "Gemini CLI", qwen: "Qwen Code", "copilot-cli": "Copilot CLI", vscode: "VS Code", kiro: "Kiro", zcode: "ZCode", pi: "Pi", opencode: "OpenCode" };
const hostOf = (id) => id.slice("g-hook-".length);

/** One-line job of a case, in plain words. */
export function whatYouDo(id) {
  if (id.startsWith("g-hook-")) return `Run any tool call in ${HOST[hostOf(id)] ?? hostOf(id)}. Its hook runs each time.`;
  return WHAT[id] ?? null;
}

const m = (row, k) => row.metrics[k]?.median;
const fRead = (id) => id.startsWith("f-read") || id.startsWith("f-webfetch");

/** The before and after bytes a case page shows, from the results row. `after` names the metric it came from. */
export function beforeAfter(row) {
  if (row.group === "e-continuity") return { before: m(row, "raw_bytes"), after: m(row, "resume_bytes"), afterKey: "resume_bytes" };
  if (row.id.startsWith("g-hook-") || row.id === "g-search-latency" || row.id === "g-index-per-mb") return null;
  return { before: m(row, "raw_bytes"), after: m(row, "ctx_bytes"), afterKey: "ctx_bytes" };
}

function toolOf(row) {
  const g = row.group, id = row.id;
  if (g === "a-sandbox") return "ctx_execute";
  if (g === "b-retrieval") return "ctx_index + ctx_search";
  if (g === "c-batch") return "ctx_batch";
  if (g === "d-externalize") return "ctx_execute + ctx_search";
  if (g === "e-continuity") return "hooks + ctx_resume";
  if (g === "f-hook-redirect") return fRead(id) ? "hook redirect (PreToolUse)" : "hook redirect (PostToolUse)";
  if (id.startsWith("g-hook-")) return `hook (${(row.title.match(/\((\S+),/) ?? [])[1] ?? "hook"})`;
  if (id === "g-search-latency") return "ctx_search";
  if (id === "g-index-per-mb") return "ctx_index";
  return "hooks + ctx_search";
}

function withoutLine(row, n) {
  const id = row.id, g = row.group;
  const size = `${fmt(n)} B, about ${fmt(n / 4)} tokens`;
  if (g === "a-sandbox") return `The whole tool output goes into the chat: ${size}.`;
  if (g === "b-retrieval") return `The whole document goes into the chat: ${size}.`;
  if (g === "c-batch") return `Each command runs as its own call, and all output goes into the chat: ${size}.`;
  if (g === "d-externalize") return `The whole printed output goes into the chat: ${size}.`;
  if (g === "e-continuity") return `To pick up the work, the agent needs the old tool outputs back in the chat: ${size}.`;
  if (id.startsWith("f-read")) return `Read puts the whole file into the chat: ${size}.`;
  if (id.startsWith("f-webfetch")) return `WebFetch puts the whole page into the chat: ${size}.`;
  if (g === "f-hook-redirect") return `The whole command output goes into the chat: ${size}.`;
  return `All outputs go into the chat: ${size}.`;
}

function withLine(row) {
  const id = row.id, g = row.group;
  if (g === "a-sandbox") return "A short script reads the output in a sandbox. The agent gets only what the script prints.";
  if (g === "b-retrieval") return `The document goes into a local search index. The agent asks ${m(row, "queries")} questions and gets back only the parts that match (${m(row, "queries_hit")} of ${m(row, "queries")} questions got a hit).`;
  if (g === "c-batch") return `One ctx_batch call runs all ${m(row, "commands")} commands, keeps the output in a local search index and answers the questions.`;
  if (g === "d-externalize") return `The full output goes into a local search index. The agent gets the start and a pointer. A search later finds the first, middle and last line (${m(row, "markers_found")} of ${m(row, "markers")}).`;
  if (g === "e-continuity") return "The hooks keep a journal of the session. After compaction, ctx_resume gives the agent a short summary.";
  if (id === "f-read-small-file") return "The file is small, so the hook lets Read run as usual. The agent gets the file.";
  if (fRead(id)) return "The hook stops the call and tells the agent which context-mode tool to use. This is the whole reply.";
  if (g === "f-hook-redirect") return "The command runs, then the hook swaps its output for a short summary.";
  return `The hooks swap each output for a short summary (${fmt(m(row, "hook_left_bytes"))} B in total). 3 searches bring back what the agent needs (${fmt(m(row, "follow_up_bytes"))} B). Below are the 3 search replies.`;
}

function sample(row, rep) {
  if (rep?.sample) return { ...head(rep.sample), what: row.synthetic ? "It starts like this (the scenario makes this text with a fixed seed):" : "The command output looks like this:" };
  const f = row.inputs[0];
  if (!f || !existsSync(path.join(DATA, f))) return null;
  const h = head(readFileSync(path.join(DATA, f), "utf8"));
  const what = row.inputs.length > 1 ? `The first of the ${row.inputs.length} inputs starts like this:` : "It starts like this:";
  return { ...h, what };
}

/** The markdown of one case section. */
export function caseSection(row, rep, ctx) {
  const id = row.id;
  const l = [`## ${id}`, "", `**${row.title}**`, ""];
  l.push(`**What you do:** ${whatYouDo(id) ?? row.title + "."}`, "");
  const ba = beforeAfter(row);
  const showReply = () => {
    if (!rep?.reply) return;
    const h = head(rep.reply, { lines: 12, width: 200, chars: 1200 });
    l.push(...fence(h.body), "");
    if (h.note) l.push(h.note, "");
    if (ba && bytes(rep.reply) !== ba.after && id !== "g-session-total") l.push(`This reply text comes from a rerun on ${ctx.repliesDate} (${fmt(bytes(rep.reply))} B). The numbers above are the median of the committed run.`, "");
  };
  if (ba) {
    l.push(`**Without Context Mode:** ${withoutLine(row, ba.before)}`, "");
    const s = sample(row, rep);
    if (s) { l.push(s.what, "", ...fence(s.body), ""); if (s.note) l.push(s.note, ""); }
    const saved = ba.after < ba.before
      ? `That keeps ${keptOut(ba.before, ba.after)}% of it out of the chat.`
      : `Here the reply is a bit larger than the raw output: small outputs are cheap to read as they are.`;
    l.push(`**With Context Mode:** ${withLine(row)} The agent gets ${fmt(ba.after)} B, about ${fmt(ba.after / 4)} tokens. ${saved}`, "");
    showReply();
  } else if (id.startsWith("g-hook-")) {
    const name = HOST[hostOf(id)] ?? hostOf(id);
    l.push(`**Without Context Mode:** a bare Node start takes ${ms1(m(row, "bare_node_ms"))} ms.`, "");
    l.push(`**With Context Mode:** the ${name} hook takes ${ms1(m(row, "hook_ms"))} ms, so it adds about ${ms1(m(row, "overhead_ms"))} ms to each tool call. Each number is the median of 5 hook runs.`, "");
  } else if (id === "g-search-latency") {
    const total = row.inputs.reduce((a, f) => a + (ctx.manifest[f]?.bytes ?? 0), 0);
    l.push(`**Without Context Mode:** the agent reads the 8 outputs in full: ${fmt(total)} B, about ${fmt(total / 4)} tokens.`, "");
    l.push(`**With Context Mode:** the 8 outputs go into a local search index. A search takes ${ms1(m(row, "search_ms_median"))} ms (the slowest ${ms1(m(row, "search_ms_max"))} ms), and a reply is about ${fmt(m(row, "reply_bytes_median"))} B. The last reply:`, "");
    showReply();
  } else if (id === "g-index-per-mb") {
    l.push(`**Without Context Mode:** the agent reads the 3 files in full: ${fmt(m(row, "total_bytes"))} B, about ${fmt(m(row, "total_bytes") / 4)} tokens.`, "");
    l.push(`**With Context Mode:** the files go into a local search index once. That takes ${fmt(m(row, "index_ms"))} ms, or ${fmt(m(row, "index_ms_per_mb"))} ms per MB.`, "");
  }
  l.push(`**Tool:** ${toolOf(row)}. [How it works](${docsLink(id)})`, "");
  l.push("**Rerun it yourself:**", "", ...fence(`cd bench && node run.mjs ${id}`, "sh"), "");
  const proof = row.inputs.length
    ? row.inputs.map((f) => `input [fixtures/data/${f}](../fixtures/data/${f})${ctx.manifest[f] ? `, ${fmt(ctx.manifest[f].bytes)} B, sha256 ${ctx.manifest[f].sha256}` : ""}`).join("; ")
    : row.synthetic ? "input made in the scenario with a fixed seed (20261031)" : "input: small payloads built in the scenario";
  l.push(`<sub>Proof: ${proof}. Numbers: median of ${ctx.runs} runs in [results/${ctx.resultsFile}](../results/${ctx.resultsFile}).</sub>`, "");
  return l;
}

/** The whole README of one group folder. */
export function groupPage(g, ctx) {
  const rows = ctx.results.filter((r) => r.group === g.dir);
  const l = [`# ${g.title}`, "", ...INTRO[g.dir].map((s, i, a) => (i < a.length - 1 ? s + "  " : s)), "",
    `Run this group: \`cd bench && node run.mjs ${g.dir}\`. All tables: [results/${ctx.resultsFile.replace(/\.json$/, ".md")}](../results/${ctx.resultsFile.replace(/\.json$/, ".md")}).`, ""];
  for (const row of rows) l.push(...caseSection(row, ctx.replies[row.id], ctx));
  return l.join("\n");
}
