// DOCS-SYNC-2026-10-28: doc facts that can drift are read from the code, the package or the raw benchmark data.
// No regex: plain string checks only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DOCTOR_CHECK_ORDER, REPORT_CAP, REPORT_SOURCE_LABEL } from "../../../src/core/contracts/constants.ts";

const read = (p) => readFileSync(new URL("../../../" + p, import.meta.url), "utf8");
const json = (p) => JSON.parse(read(p));

test("docs/tools.md names the doctor check range from DOCTOR_CHECK_ORDER", () => {
  const md = read("docs/tools.md");
  const first = DOCTOR_CHECK_ORDER[0];
  const last = DOCTOR_CHECK_ORDER[DOCTOR_CHECK_ORDER.length - 1];
  assert.ok(md.includes(`(${first}–${last},`), `tools.md must say ${first}–${last}`);
});

test("docs/tools.md says where a doctor report over REPORT_CAP is stored (D-NO-LOSSY-CUT-1)", () => {
  const md = read("docs/tools.md");
  assert.ok(md.includes(REPORT_SOURCE_LABEL));
  assert.ok(md.includes(`${REPORT_CAP.toLocaleString("en-US")} B`));
});

test("the Node minimum in package.json engines is the one the README and install page state", () => {
  const min = json("package.json").engines.node.replace(">=", "");
  for (const f of ["README.md", "docs/install/README.md"]) assert.ok(read(f).includes(`Node ${min} or later`), f);
});

test("README and install page tell Windows users about Git for Windows (D-VT-WINBASH-1)", () => {
  for (const f of ["README.md", "docs/install/README.md"]) assert.ok(read(f).includes("Git for Windows"), f);
});

test("Gemini and Qwen pages say the update asks Y/n", () => {
  for (const f of ["docs/install/gemini.md", "docs/install/qwen.md"]) {
    assert.ok(read(f).includes(" extensions update` asks"), f);
    assert.ok(read(f).includes("[Y/n]"), f);
  }
});

test("docs/benchmarks/README.md try-it numbers equal try-it/ab.json", () => {
  const ab = json("docs/benchmarks/try-it/ab.json");
  const p = ab.pooled;
  const md = read("docs/benchmarks/README.md");
  const line = md.split("\n").find((l) => l.startsWith('The six "Try It" prompts'));
  assert.ok(line);
  assert.ok(line.includes(`v1 cost ${p.v1.pct}% more`));
  assert.ok(line.includes(`v2 cost ${p.v2.pct}% more`));
  assert.ok(line.includes(`gateway cost ${Math.abs(p.gateway.pct)}% less`));
  const ok = (s) => s.split("/")[0] + " of " + s.split("/")[1];
  assert.ok(line.includes(`Direct passed the task check in ${ok(p.plain_success)} sessions, v1 ${ok(p.v1.success)}, v2 ${ok(p.v2.success)} and the gateway ${ok(p.gateway.success)}`));
  const checks = ab.readme_claims.checks;
  const holds = checks.filter((c) => c.verdict === "HOLDS").length;
  assert.ok(line.includes(`Of ${checks.length} README numbers checked, ${holds} hold`));
});

test("MAIN-ONLY.md does not name a plugins/gemini folder: Gemini and Qwen point into plugins/claude-code (D-MO-1)", () => {
  const rows = read("docs/v2/release/MAIN-ONLY.md").split("\n").filter((l) => l.startsWith("|"));
  assert.ok(rows.every((l) => !l.includes("plugins/gemini/")));
});

test("both DEVIATIONS files say which file holds which rows", () => {
  assert.ok(read("docs/v2/DEVIATIONS.md").includes("docs/v2/impl/DEVIATIONS.md"));
  assert.ok(read("docs/v2/impl/DEVIATIONS.md").includes("docs/v2/DEVIATIONS.md"));
});
