#!/usr/bin/env node
// e2e/checks/repo-github-files.mjs — local check for live case repo-github-files
// (13-build-release.md §6, ADR-0014 §5). Text checks over .github files (CI/test script —
// regex allowed, 00-architecture.md). Never imports src/. Prints one JSON line, never throws.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const GH = path.join(REPO, ".github");
const TPL = path.join(GH, "ISSUE_TEMPLATE");
// Mirror of src/core/contracts/agents.ts AGENT_IDS (e2e/ never imports src/).
const AGENT_IDS = ["claude-code", "codex", "gemini", "qwen", "copilot-cli", "vscode", "kiro", "zcode", "pi", "opencode"];

const read = (p) => readFileSync(p, "utf8");

// Split a GitHub issue-form body into its list items (each starts with "  - type:").
function items(src) {
  const body = src.slice(src.indexOf("\nbody:"));
  return body.split(/\n  - type: /).slice(1).map((s) => ({ type: s.split("\n")[0].trim(), text: s }));
}

export function check() {
  const errors = [];
  const need = (cond, msg) => { if (!cond) errors.push(msg); };

  for (const gone of ["PULL_REQUEST_TEMPLATE.md", "ISSUE_TEMPLATE/bug_report.yml", "ISSUE_TEMPLATE/feature_request.yml"]) {
    need(!existsSync(path.join(GH, gone)), `${gone} must be removed`);
  }
  for (const f of readdirSync(path.join(GH, "workflows"))) {
    const src = read(path.join(GH, "workflows", f));
    need(!/^\s*pull_request(_target)?\s*:/m.test(src), `workflows/${f} must have no pull_request trigger`);
  }

  // bug.yml (§6.1)
  const bugP = path.join(TPL, "bug.yml");
  if (!existsSync(bugP)) errors.push("bug.yml missing");
  else {
    const src = read(bugP);
    const it = items(src);
    need(/^name: Bug report\s*$/m.test(src), "bug.yml name: Bug report");
    need(/^labels: \[\s*"?bug"?\s*\]\s*$/m.test(src), "bug.yml labels: [bug]");
    need(src.includes("/ctx-doctor") && src.includes("call the ctx_doctor tool"), "bug.yml doctor instruction");
    need(src.includes("Only v2 gets fixes"), "bug.yml v2-only line");
    const dd = it.find((i) => i.type === "dropdown" && i.text.includes("/ctx-doctor"));
    need(dd && /- "?No/.test(dd.text) && /required: true/.test(dd.text), "bug.yml doctor dropdown with No reasons, required");
    const rep = it.find((i) => i.type === "textarea" && /\n\s+id: report\s*\n/.test(i.text));
    need(rep && /render: text\s*$/m.test(rep.text) && rep.text.includes("Paste the full ctx_doctor report here"), "bug.yml report textarea render: text");
    const node = it.find((i) => i.type === "input" && /\n\s+id: node_version\s*\n/.test(i.text));
    need(node && node.text.includes("node --version") && /required: true/.test(node.text), "bug.yml node_version required input");
    for (const label of ["What happened", "Expected", "Steps"]) {
      need(it.some((i) => i.type === "textarea" && new RegExp(`label: "?${label}`).test(i.text)), `bug.yml textarea ${label}`);
    }
    const steps = it.find((i) => i.type === "textarea" && /label: "?Steps/.test(i.text));
    need(steps && steps.text.includes("denied tool") && steps.text.includes("alternative"), "bug.yml Steps names denied tool + alternative");
    const cb = it.find((i) => i.type === "checkboxes");
    need(cb && (cb.text.match(/required: true/g) || []).length >= 2, "bug.yml two required checkboxes");
    need(cb && cb.text.includes("I ran `/ctx-doctor` or asked the agent to call the `ctx_doctor` tool"), "bug.yml checkbox 1");
    need(cb && cb.text.includes("I am an AI agent filing this on behalf of a user, or I pasted the full agent transcript"), "bug.yml checkbox 2");
  }

  // config.yml (§6.2)
  const cfgP = path.join(TPL, "config.yml");
  if (!existsSync(cfgP)) errors.push("config.yml missing");
  else {
    const src = read(cfgP);
    need(/^blank_issues_enabled: false\s*$/m.test(src), "config.yml blank_issues_enabled: false");
    need(src.includes("/security/advisories"), "config.yml security advisories link");
    need(src.includes("README.md#install"), "config.yml README#install link");
    // D-DOCTOR-ISSUE-1: security, doctor docs (UTM), Discord, install guide.
    need((src.match(/^\s+- name:/gm) || []).length === 4, "config.yml exactly four contact_links");
    need(src.includes("https://discord.gg/DCN9jUgN5v"), "config.yml Discord link");
    need(src.includes("https://contextmode.ai/docs/engine/doctor?utm_source=github"), "config.yml doctor docs link with UTM");
  }

  // agent-report.yml (D-DOCTOR-ISSUE-1): the form ctx_doctor's report file fills.
  const arP = path.join(TPL, "agent-report.yml");
  if (!existsSync(arP)) errors.push("agent-report.yml missing");
  else {
    const src = read(arP);
    need(/^labels: \[\s*"?bug"?\s*\]\s*$/m.test(src), "agent-report.yml labels: [bug]");
    need(src.includes("AGENT_ISSUE.md") && src.includes("~/.context-mode/reports/doctor-"), "agent-report.yml names AGENT_ISSUE.md and the report file");
  }

  // feature.yml (§6.3)
  const featP = path.join(TPL, "feature.yml");
  if (!existsSync(featP)) errors.push("feature.yml missing");
  else {
    const src = read(featP);
    const it = items(src);
    need(/^name: Feature request\s*$/m.test(src), "feature.yml name: Feature request");
    need(!/^labels:/m.test(src), "feature.yml no labels default");
    const dd = it.find((i) => i.type === "dropdown");
    const opts = dd ? [...dd.text.matchAll(/^\s+- "?([a-z-]+)"?\s*$/gm)].map((m) => m[1]) : [];
    need(JSON.stringify(opts) === JSON.stringify(AGENT_IDS), `feature.yml agent dropdown = AGENT_IDS (got ${opts.join(",")})`);
    for (const label of ["Problem", "Evidence links"]) {
      need(it.some((i) => i.type === "textarea" && new RegExp(`label: "?${label}`).test(i.text)), `feature.yml textarea ${label}`);
    }
    need(it.some((i) => i.type === "markdown" && i.text.includes("context-mode does not accept pull requests. File the idea; the owner implements it.")), "feature.yml no-PR markdown");
  }
  return { ok: errors.length === 0, errors };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(check())); }
  catch (e) { console.log(JSON.stringify({ ok: false, reason: String(e && e.message) })); }
}
