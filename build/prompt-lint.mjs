#!/usr/bin/env node
// build/prompt-lint.mjs — ADR-0005 prompt lint (PR1-PR12), plus GS5 (byte half) and GS9.
// Spec: docs/architecture/modules/13-build-release.md §7, impl/00 §4 (lintPromptText), TECH-SPEC §3.4-§3.5.
// CI tool, not runtime code: regex is allowed here (ADR-0005 Q17 carve-out, impl/00 line 9).
//
// Modes:
//   node build/prompt-lint.mjs --out <dir>             bundle mode (gate >= M2, ci.yml): spawn
//       <dir>/server.mjs, read the live initialize, server/discover and tools/list replies, check
//       them. Any failure prints "FAIL <rule>: <mismatch>" on stderr and exits 1. All pass prints
//       "lint: PR1-12, GS5, GS9 OK" and exits 0.
//   node build/prompt-lint.mjs drafts <drafts.md>      draft mode (gate < M2, live case doc-lint):
//       one JSON report on stdout, the "fail" array names every failing text.
//   node build/prompt-lint.mjs files <file...>         per-file counts, for ADR-0005 tables.
//
// It reads src/ files as text (prompt sources, constants) and never imports src/ (impl/13 §7 step 2).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnBundle } from "../e2e/harness/mcp-client.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONSTANTS_FILE = path.join(REPO_ROOT, "src", "core", "contracts", "constants.ts");
const PROMPT_DIR = path.join(REPO_ROOT, "src", "prompt");
// GS5: the only SKILL.md files a release tree may carry (impl/13 §5).
// D-HQ-SKILLS-1: the same 3 skills, rendered for Pi, also ship under pi/skills/ (package.json pi.skills).
const SHIPPED_SKILLS = [
  "skills/ctx-stats/SKILL.md", "skills/ctx-doctor/SKILL.md", "skills/ctx-upgrade/SKILL.md",
  "pi/skills/ctx-stats/SKILL.md", "pi/skills/ctx-doctor/SKILL.md", "pi/skills/ctx-upgrade/SKILL.md",
  // D-R33-CC-SKILLS-1: claude-code reads skills/ with Gemini and Qwen (no claude-code/skills copy).
  // D-NI-CODEX-1: the codex plugin (.codex-plugin/plugin.json skills) reads its own rendered copy.
  "codex/skills/ctx-stats/SKILL.md", "codex/skills/ctx-doctor/SKILL.md", "codex/skills/ctx-upgrade/SKILL.md",
];
const REPO_ONLY_PREFIX = ".claude/"; // .claude/skills/release/ stays in the repo (impl/13 §7 step 5)
const LEGACY_PROTOCOL = "2025-11-25";
const MODERN_PROTOCOL = "2026-07-28";
const CLIENT_INFO = { name: "context-mode-lint", version: "0.0.0" };
const MODERN_META = {
  "io.modelcontextprotocol/protocolVersion": MODERN_PROTOCOL,
  "io.modelcontextprotocol/clientCapabilities": {},
  "io.modelcontextprotocol/clientInfo": CLIENT_INFO,
};

// ADR-0005 decision table. Exact patterns live here and nowhere else.
const RULES = {
  caps: /\b(MUST|NEVER|ALWAYS|CRITICAL|MANDATORY|IMPORTANT|REQUIRED|DO NOT|ONLY|ALL|ANY)\b/g, // PR1, case-sensitive
  doubt: /\b(if in doubt|when (in doubt|uncertain|unsure)|default to)\b/gi, // PR2
  tags: /<[a-z_]+[ >]/g, // PR5
  quoted: /"[^"\n]{2,60}"/g, // PR6: at most 2 per text
  prefixed: /\b(mcp__?|plugin_)[A-Za-z0-9_-]*ctx_|context[-_]mode__?ctx_/g, // PR12
  toolRef: /ctx_[a-z_]+/g, // PR11
};
const QUOTED_MAX = 2;
const matches = (t, re) => t.match(re) || [];
const count = (t, re) => matches(t, re).length;

/**
 * impl/00 §4: one LintResult per ADR-0005 regex rule (A14).
 * @param {string} text
 * @returns {{ rule: "PR1" | "PR2", ok: boolean, matches: string[] }[]}
 */
export function lintPromptText(text) {
  const caps = matches(text, RULES.caps);
  const doubt = matches(text, RULES.doubt);
  return [
    { rule: "PR1", ok: caps.length === 0, matches: caps },
    { rule: "PR2", ok: doubt.length === 0, matches: doubt },
  ];
}

// ---- constants.ts read as text (the single source of every constant) ----
function readConstants() {
  const src = fs.readFileSync(CONSTANTS_FILE, "utf8");
  const num = (name) => {
    const m = src.match(new RegExp(`export const ${name} = (\\d+);`));
    if (!m) throw new Error(`constants.ts: ${name} not found`);
    return Number(m[1]);
  };
  const order = src.match(/export const TOOL_ORDER = Object\.freeze\((\[[^\]]*\])/);
  if (!order) throw new Error("constants.ts: TOOL_ORDER not found");
  return {
    TOOL_ORDER: JSON.parse(order[1]),
    INSTRUCTIONS_CAP: num("INSTRUCTIONS_CAP"),
    DESCRIPTION_CAP: num("DESCRIPTION_CAP"),
    SURFACE_CAP: num("SURFACE_CAP"),
  };
}

// ---- live capture over stdio (impl/13 §7 steps 2-3) ----
async function withBundle(bundle, fn) {
  const client = spawnBundle(bundle, process.env, ["--agent", "claude-code"]);
  try {
    const out = await fn(client);
    await client.close();
    return out;
  } finally {
    client.kill();
  }
}

const legacySession = (bundle) =>
  withBundle(bundle, async (c) => {
    const init = await c.request("initialize", { protocolVersion: LEGACY_PROTOCOL, capabilities: {}, clientInfo: CLIENT_INFO });
    c.notify("notifications/initialized", {});
    const list = await c.request("tools/list", {});
    return { init, list };
  });

const modernSession = (bundle) =>
  withBundle(bundle, async (c) => {
    const discover = await c.request("server/discover", { _meta: MODERN_META });
    const list = await c.request("tools/list", { _meta: MODERN_META });
    return { discover, list };
  });

function walk(dir, base = dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full, base));
    else out.push(path.relative(base, full).split(path.sep).join("/"));
  }
  return out;
}

async function bundleMode(outArg) {
  const outDir = path.resolve(process.cwd(), outArg);
  const bundle = path.join(outDir, "server.mjs");
  const failures = [];
  const fail = (rule, msg) => failures.push(`${rule}: ${msg}`);
  if (!fs.existsSync(bundle)) {
    console.error(`FAIL setup: ${bundle} missing; run node build/build.mjs --out ${outArg} first`);
    process.exit(1);
  }
  const k = readConstants();

  const a = await legacySession(bundle);
  const b = await legacySession(bundle);
  const m = await modernSession(bundle);

  const instructions = a.init.instructions;
  const tools = a.list.tools ?? [];
  if (typeof instructions !== "string") fail("PR9", "initialize carries no instructions string");
  const texts = [["instructions", instructions ?? ""], ...tools.map((t) => [t.name, t.description ?? ""])];
  const names = tools.map((t) => t.name);

  for (const [id, text] of texts) {
    for (const r of lintPromptText(text)) if (!r.ok) fail(r.rule, `${id}: ${JSON.stringify(r.matches)}`);
    // PR3, PR4, PR10 are review rules (ADR-0005): the reviewed source is src/prompt/, so the shipped
    // text must equal it byte for byte (PR9 check below), and must not be empty.
    if (!text.length) fail("PR3", `${id}: empty text`);
    const tags = matches(text, RULES.tags);
    if (tags.length) fail("PR5", `${id}: ${JSON.stringify(tags)}`);
    const quoted = count(text, RULES.quoted);
    if (quoted > QUOTED_MAX) fail("PR6", `${id}: ${quoted} quoted phrases, max ${QUOTED_MAX}`);
    const unknown = [...new Set(matches(text, RULES.toolRef))].filter((n) => !names.includes(n));
    if (unknown.length) fail("PR11", `${id}: names not in tools/list ${JSON.stringify(unknown)}`);
    const prefixed = matches(text, RULES.prefixed);
    if (prefixed.length) fail("PR12", `${id}: host-prefixed names ${JSON.stringify(prefixed)}`);
  }

  // D-DU-DENY-1: hook text templates (src/prompt/hooks/*.md) get the same text rules.
  const hookDir = path.join(PROMPT_DIR, "hooks");
  for (const f of fs.existsSync(hookDir) ? fs.readdirSync(hookDir).sort() : []) {
    if (!f.endsWith(".md")) continue;
    for (const x of lintHookText(`hooks/${f}`, fs.readFileSync(path.join(hookDir, f), "utf8"), names)) failures.push(x);
  }

  // PR4: the instructions say when to use the normal tools (review + golden: byte equality below).
  // PR8: line 1 of the instructions stands alone (Pi shows only that line).
  const lines = (instructions ?? "").split("\n");
  if (!lines[0] || (lines.length > 1 && lines[1] !== "")) fail("PR8", "instructions line 1 must be non-empty and followed by a blank line");

  // PR7: budgets (Q5, Q13).
  if ((instructions ?? "").length > k.INSTRUCTIONS_CAP) fail("PR7", `instructions ${instructions.length} chars > INSTRUCTIONS_CAP ${k.INSTRUCTIONS_CAP}`);
  let surface = 0;
  for (const t of tools) {
    if (t.description.length > k.DESCRIPTION_CAP) fail("PR7", `${t.name} description ${t.description.length} chars > DESCRIPTION_CAP ${k.DESCRIPTION_CAP}`);
    surface += t.description.length + JSON.stringify(t.inputSchema ?? {}).length;
  }
  if (surface > k.SURFACE_CAP) fail("PR7", `descriptions + input schemas ${surface} chars > SURFACE_CAP ${k.SURFACE_CAP}`);

  // PR9: deterministic bytes: equal to src/prompt/ sources, equal across two separate connections.
  const srcInstructions = fs.readFileSync(path.join(PROMPT_DIR, "instructions.md"), "utf8");
  if (instructions !== srcInstructions) fail("PR9", "initialize instructions differ from src/prompt/instructions.md");
  for (const t of tools) {
    const file = path.join(PROMPT_DIR, "tools", `${t.name}.md`);
    if (!fs.existsSync(file)) { fail("PR9", `src/prompt/tools/${t.name}.md missing`); continue; }
    if (t.description !== fs.readFileSync(file, "utf8")) fail("PR9", `${t.name} description differs from src/prompt/tools/${t.name}.md`);
  }
  if (b.init.instructions !== instructions) fail("PR9", "instructions differ between two connections");
  if (JSON.stringify(b.list.tools) !== JSON.stringify(tools)) fail("PR9", "tools/list differs between two connections");

  // PR11: tools/list is exactly TOOL_ORDER, in order (impl/13 §7 step 4).
  if (JSON.stringify(names) !== JSON.stringify(k.TOOL_ORDER)) fail("PR11", `tools/list order ${JSON.stringify(names)} != TOOL_ORDER ${JSON.stringify(k.TOOL_ORDER)}`);

  // GS9: initialize (2025 era) and server/discover (2026-07-28) agree on every shared field.
  const d = m.discover;
  if (d?.error) fail("GS9", `server/discover error ${JSON.stringify(d.error)}`);
  else {
    if (d.instructions !== instructions) fail("GS9", "server/discover instructions differ from initialize");
    if (JSON.stringify(d.capabilities) !== JSON.stringify(a.init.capabilities)) fail("GS9", `capabilities differ: ${JSON.stringify(d.capabilities)} vs ${JSON.stringify(a.init.capabilities)}`);
  }
  if (m.list?.error) fail("GS9", `2026-07-28 tools/list error ${JSON.stringify(m.list.error)}`);
  else if (JSON.stringify(m.list.tools) !== JSON.stringify(tools)) fail("GS9", "2026-07-28 tools/list tools differ from 2025-era tools/list");

  // GS5 (byte half; the file-existence half is build/check-removed.mjs, impl/13 A13).
  for (const f of walk(outDir)) {
    if (f.startsWith(REPO_ONLY_PREFIX)) fail("GS5", `repo-only path shipped: ${f}`);
    else if (f.endsWith("SKILL.md") && !SHIPPED_SKILLS.includes(f)) fail("GS5", `SKILL.md outside the 3 command skills: ${f}`);
  }

  if (failures.length) {
    for (const f of failures) console.error(`FAIL ${f}`);
    process.exit(1);
  }
  console.log("lint: PR1-12, GS5, GS9 OK");
}

/**
 * D-DU-DENY-1: a hook text template in src/prompt/hooks/ (the Read deny). PR1, PR2, PR5, PR6, PR11, PR12,
 * plus: one line, not empty. Returns the failures as "rule: message" strings ([] = pass).
 * @param {string} id @param {string} text @param {string[]} names tools/list names
 */
export function lintHookText(id, text, names) {
  const out = [];
  for (const r of lintPromptText(text)) if (!r.ok) out.push(`${r.rule}: ${id}: ${JSON.stringify(r.matches)}`);
  if (!text.length) out.push(`PR3: ${id}: empty text`);
  if (text.includes("\n")) out.push(`HOOK1: ${id}: more than one line`);
  const tags = matches(text, RULES.tags);
  if (tags.length) out.push(`PR5: ${id}: ${JSON.stringify(tags)}`);
  const quoted = count(text, RULES.quoted);
  if (quoted > QUOTED_MAX) out.push(`PR6: ${id}: ${quoted} quoted phrases, max ${QUOTED_MAX}`);
  const unknown = [...new Set(matches(text, RULES.toolRef))].filter((n) => !names.includes(n));
  if (unknown.length) out.push(`PR11: ${id}: names not in tools/list ${JSON.stringify(unknown)}`);
  const prefixed = matches(text, RULES.prefixed);
  if (prefixed.length) out.push(`PR12: ${id}: host-prefixed names ${JSON.stringify(prefixed)}`);
  return out;
}

// ---- draft mode: drafts.md before the bundle exists (gate < M2, live case doc-lint) ----
const row = (id, t) => ({ id, chars: t.length, caps: count(t, RULES.caps), doubt: count(t, RULES.doubt), tags: count(t, RULES.tags), quoted: count(t, RULES.quoted), prefixed: count(t, RULES.prefixed) });

function draftsMode(file) {
  const t = fs.readFileSync(file, "utf8"), o = {};
  for (const m of t.matchAll(/<!-- id: ([a-z_]+) -->\n```text\n([\s\S]*?)\n```/g)) o[m[1]] = m[2];
  const tools = Object.keys(o).filter((k) => k !== "instructions" && !k.startsWith("skill_"));
  const rows = Object.entries(o).map(([k, v]) => ({ ...row(k, v), unknownRefs: [...new Set(matches(v, RULES.toolRef))].filter((n) => !tools.includes(n)) }));
  const fail = rows.filter((r) => r.caps || r.doubt || r.tags || r.quoted > QUOTED_MAX || r.prefixed || r.unknownRefs.length
    || (r.id === "instructions" ? r.chars > 2048 : r.chars > 1024));
  console.log(JSON.stringify({ rows, toolDescChars: rows.filter((r) => tools.includes(r.id)).reduce((a, r) => a + r.chars, 0), fail: fail.map((r) => r.id) }, null, 1));
  if (fail.length) process.exitCode = 1;
}

function filesMode(files) {
  const rows = files.map((f) => row(f, fs.readFileSync(f, "utf8")));
  const tot = rows.reduce((a, r) => ({ files: a.files + 1, chars: a.chars + r.chars, caps: a.caps + r.caps, doubt: a.doubt + r.doubt, tags: a.tags + r.tags }), { files: 0, chars: 0, caps: 0, doubt: 0, tags: 0 });
  for (const r of rows) console.log(`${r.id} | ${r.chars} | caps ${r.caps} | doubt ${r.doubt} | tags ${r.tags} | quoted ${r.quoted}`);
  console.log("TOTAL", JSON.stringify(tot));
}

async function main() {
  const argv = process.argv.slice(2);
  const outAt = argv.indexOf("--out");
  if (outAt >= 0) {
    if (!argv[outAt + 1]) { console.error("usage: node build/prompt-lint.mjs --out <dir>"); process.exit(2); }
    return bundleMode(argv[outAt + 1]);
  }
  const [mode, ...args] = argv;
  if (mode === "drafts") return draftsMode(args[0]);
  if (mode === "files") return filesMode(args);
  console.error("usage: node build/prompt-lint.mjs --out <dir> | drafts <drafts.md> | files <file...>");
  process.exit(2);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
