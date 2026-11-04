#!/usr/bin/env node
// e2e/checks/gate-layers.mjs — local check for live case gate-layers (14-tests.md §8,
// scripts/gate.mjs, DEVIATIONS D-M0-1, D-M1-13). Runs `node scripts/gate.mjs --milestone Mn
// --quick` for M0 and M1 and checks the output has one "PASS|FAIL|SKIP <layer> ..." line per
// layer, in order: v2-unit, ci-checks, gp-cases, prompt-lint, check-removed, live.
// M0: v2-unit prints "SKIP v2-unit starts at M1". M1: v2-unit runs (PASS or FAIL, never SKIP
// unless an earlier layer failed). Prints one JSON line, never throws.
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const GATE_PATH = path.join(REPO_ROOT, "scripts", "gate.mjs");
const LAYER_ORDER = ["v2-unit", "ci-checks", "gp-cases", "prompt-lint", "check-removed", "live"];
const STATUSES = ["PASS", "FAIL", "SKIP"];

function fail(reason, extra) {
  console.log(JSON.stringify({ ok: false, reason, ...extra }));
  process.exit(0);
}

// Returns [{status, layer, detail}] or a string reason.
function runGate(milestone) {
  const r = spawnSync(process.execPath, [GATE_PATH, "--milestone", milestone, "--quick"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  const stdout = r.stdout ?? "";
  const rows = stdout.split("\n").filter(Boolean).map((l) => {
    const [status, layer, ...rest] = l.split(" ");
    return { status, layer, detail: rest.join(" "), line: l };
  });
  if (rows.length !== LAYER_ORDER.length) {
    return { reason: `${milestone}: expected ${LAYER_ORDER.length} lines, found ${rows.length}`, stdout };
  }
  for (let i = 0; i < LAYER_ORDER.length; i++) {
    if (!STATUSES.includes(rows[i].status) || rows[i].layer !== LAYER_ORDER[i]) {
      return { reason: `${milestone}: line ${i} must be "PASS|FAIL|SKIP ${LAYER_ORDER[i]} ...", got "${rows[i].line}"`, stdout };
    }
  }
  return { rows };
}

function main() {
  if (!existsSync(GATE_PATH)) return fail("missing scripts/gate.mjs");

  const m0 = runGate("M0");
  if (m0.reason) return fail(m0.reason, { stdout: m0.stdout });
  const m0Unit = m0.rows[0];
  if (m0Unit.status !== "SKIP" || !m0Unit.detail.startsWith("starts at M1")) {
    return fail(`M0: v2-unit must print "SKIP v2-unit starts at M1 ...", got "${m0Unit.line}"`);
  }

  const m1 = runGate("M1");
  if (m1.reason) return fail(m1.reason, { stdout: m1.stdout });
  const m1Unit = m1.rows[0];
  if (m1Unit.status === "SKIP") {
    return fail(`M1: v2-unit must run (PASS or FAIL), got "${m1Unit.line}"`);
  }

  console.log(JSON.stringify({ ok: true, layers: LAYER_ORDER, m1V2Unit: m1Unit.line }));
}

main();
