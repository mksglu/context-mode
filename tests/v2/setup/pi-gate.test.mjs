// D-NI-PI-GATE-1: pi 1.4.0 loads our extension (pi/index.js, the in-process hooks) only when the packages[] entry for
// context-mode does not filter it out. Live (temp HOME, fake OpenAI-compatible model, `pi list` showed the package in each
// case): extensions: [], "!pi/*", "!pi/index.js", "-pi/index.js", "pi/other.js" (include list without ours) and
// ["**","!pi/index.js"] made the real binary send the 208 KB file to the model. A project .pi/settings.json entry with such
// a filter does the same once the project is trusted (trust.json, or defaultProjectTrust "always"). Doctor and setup must
// FAIL with the file, the filter and a one-line fix; they never rewrite a user's filter.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { TOOL_ORDER } from "../../../src/core/contracts/constants.ts";
import { runDoctor, runSetup } from "../../../src/setup/index.ts";

const SKIP_SH = { skip: process.platform === "win32" && "fake agent binaries are sh scripts" };

function fakePkg(root) {
  const dir = path.join(root, "pkg");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "server.mjs"), `
import { createInterface } from "node:readline";
const tools = ${JSON.stringify([...TOOL_ORDER])};
createInterface({ input: process.stdin }).on("line", (l) => {
  const m = JSON.parse(l);
  if (m.id === undefined) return;
  const result = m.method === "initialize"
    ? { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "context-mode", version: "2.0.0" } }
    : { tools: tools.map((name) => ({ name, inputSchema: { type: "object" } })) };
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: m.id, result }) + "\\n");
});
`);
  writeFileSync(path.join(dir, "hook.mjs"), `let s = ""; process.stdin.on("data", (d) => { s += d; }); process.stdin.on("end", () => { const p = JSON.parse(s); if (!JSON.stringify(p).includes("context-mode-doctor-hook-runs")) return; const t = "deny: run ctx_execute; ctx_search( finds the rest"; process.stderr.write(t + "\\n"); process.stdout.write(JSON.stringify({ decision: "deny", reason: t })); });\n`);
  writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "context-mode", version: "2.0.0" }));
  const skills = path.join(import.meta.dirname, "..", "..", "..", "skills");
  for (const rel of ["skills", path.join("pi", "skills"), path.join("claude-code", "skills")]) cpSync(skills, path.join(dir, rel), { recursive: true });
  return dir;
}

function sandbox(t) {
  const root = mkdtempSync(path.join(tmpdir(), "cm-pigate-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, "home");
  const bin = path.join(root, "bin");
  mkdirSync(home, { recursive: true });
  mkdirSync(bin, { recursive: true });
  const file = path.join(bin, "pi");
  writeFileSync(file, `#!/bin/sh\ncase "$1" in\n  list) echo "User packages:"; echo "  context-mode" ;;\n  install) exit 7 ;;\nesac\nexit 0\n`);
  chmodSync(file, 0o755);
  const pkgDir = fakePkg(root);
  const agent = path.join(home, ".pi", "agent");
  const env = { PATH: [bin, "/usr/bin", "/bin"].join(path.delimiter), HOME: home, USERPROFILE: home, CM_HOOK_OVERHEAD_BUDGET_MS: "60000" };
  return { root, home, pkgDir, env, agent, user: path.join(agent, "settings.json"), trust: path.join(agent, "trust.json") };
}

function put(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value, null, 2));
  return file;
}

async function doctor(s) {
  const doc = await runDoctor({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: ["pi"] });
  return doc.agents[0];
}
const regDetail = (a) => a.checks.find((c) => c.name === "hook-registered")?.detail ?? "";

test("[D-NI-PI-GATE-1] baseline: the plain package entry, and entries that keep pi/index.js -> PASS", SKIP_SH, async (t) => {
  for (const entry of [null, { extensions: ["pi/index.js"] }, { skills: [] }, { extensions: ["!pi/other.js"] }, { extensions: ["+pi/index.js"] }]) {
    const s = sandbox(t);
    put(s.user, { packages: [entry === null ? s.pkgDir : { source: s.pkgDir, ...entry }] });
    const a = await doctor(s);
    assert.equal(a.status, "PASS", `${JSON.stringify(entry)} ${JSON.stringify(a, null, 2)}`);
  }
});

for (const extensions of [[], ["!pi/*"], ["!pi/index.js"], ["-pi/index.js"], ["pi/other.js"], ["**", "!pi/index.js"]]) {
  test(`[D-NI-PI-GATE-1] doctor: packages[] extensions ${JSON.stringify(extensions)} is a FAIL that names the file and the filter`, SKIP_SH, async (t) => {
    const s = sandbox(t);
    put(s.user, { packages: [{ source: s.pkgDir, extensions }] });
    const a = await doctor(s);
    assert.equal(a.status, "FAIL", JSON.stringify(a, null, 2));
    assert.ok(regDetail(a).includes(s.user) && regDetail(a).includes("extensions"), regDetail(a));
    assert.ok(regDetail(a).includes("pi/index.js"), regDetail(a));
  });
}

test("[D-NI-PI-GATE-1] doctor: a filter on another package is not ours -> PASS", SKIP_SH, async (t) => {
  const s = sandbox(t);
  put(s.user, { packages: [s.pkgDir, { source: "npm:other-pkg", extensions: [] }] });
  const a = await doctor(s);
  assert.equal(a.status, "PASS", JSON.stringify(a, null, 2));
});

test("[D-NI-PI-GATE-1] doctor: a project filter in a trusted project (trust.json) is a FAIL that names the project file", SKIP_SH, async (t) => {
  const s = sandbox(t);
  put(s.user, { packages: [s.pkgDir] });
  const ws = path.join(s.root, "project");
  put(path.join(ws, ".pi", "settings.json"), { packages: [{ source: s.pkgDir, extensions: [] }] });
  put(s.trust, { [ws]: true });
  const before = process.cwd();
  process.chdir(ws);
  try {
    const a = await doctor(s);
    assert.equal(a.status, "FAIL", JSON.stringify(a, null, 2));
    assert.ok(regDetail(a).includes(path.join(".pi", "settings.json")), regDetail(a));
  } finally { process.chdir(before); }
});

test("[D-NI-PI-GATE-1] doctor: the same project filter with defaultProjectTrust always is a FAIL; a distrusted project is a PASS", SKIP_SH, async (t) => {
  const ws = (s) => { const w = path.join(s.root, "project"); put(path.join(w, ".pi", "settings.json"), { packages: [{ source: s.pkgDir, extensions: [] }] }); return w; };
  const before = process.cwd();
  try {
    const a1 = sandbox(t);
    put(a1.user, { defaultProjectTrust: "always", packages: [a1.pkgDir] });
    process.chdir(ws(a1));
    const r1 = await doctor(a1);
    assert.equal(r1.status, "FAIL", JSON.stringify(r1, null, 2));
    const a2 = sandbox(t);
    put(a2.user, { defaultProjectTrust: "always", packages: [a2.pkgDir] });
    const w2 = ws(a2);
    put(a2.trust, { [w2]: false });
    process.chdir(w2);
    const r2 = await doctor(a2);
    assert.equal(r2.status, "PASS", JSON.stringify(r2, null, 2));
  } finally { process.chdir(before); }
});

test("[D-NI-PI-GATE-1] doctor: a project filter in a project nobody trusted is not reported (pi ignores it in print mode)", SKIP_SH, async (t) => {
  const s = sandbox(t);
  put(s.user, { packages: [s.pkgDir] });
  const ws = path.join(s.root, "project");
  put(path.join(ws, ".pi", "settings.json"), { packages: [{ source: s.pkgDir, extensions: [] }] });
  const before = process.cwd();
  process.chdir(ws);
  try {
    const a = await doctor(s);
    assert.equal(a.status, "PASS", JSON.stringify(a, null, 2));
  } finally { process.chdir(before); }
});

test("[D-NI-PI-GATE-1] setup: a filtered pi install is a FAIL with the same fix, and setup rewrites no user filter", SKIP_SH, async (t) => {
  const s = sandbox(t);
  const text = JSON.stringify({ packages: [{ source: s.pkgDir, extensions: ["!pi/index.js"] }] });
  put(s.user, text);
  const res = await runSetup({ home: s.home, pkgDir: s.pkgDir, env: s.env, agents: ["pi"], runId: "p1" });
  const a = res.agents[0];
  assert.equal(a.status, "FAIL", JSON.stringify(a, null, 2));
  assert.ok((a.reason ?? "").includes("extensions"), a.reason);
  assert.equal(readFileSync(s.user, "utf8"), text);
});
