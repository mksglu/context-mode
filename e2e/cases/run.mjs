#!/usr/bin/env node
// e2e/cases/run.mjs
// Runs the GP1..GP11 node:test suites in one process. Spec:
// docs/architecture/modules/14-tests.md §5. Milestone filter per DEVIATIONS D-M0-2.
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "node:test";
import { tap } from "node:test/reporters";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function gpNumber(filename) {
  const m = /^GP(\d+)-/.exec(filename);
  return m ? Number(m[1]) : Number.POSITIVE_INFINITY;
}

function parseMilestoneArg(argv) {
  const i = argv.indexOf("--milestone");
  return i >= 0 ? argv[i + 1] : undefined;
}

// [M0]..[Mn] tag prefix match: a test named "[M0] foo" is included for
// --milestone M0..Mn where n >= 0 (DEVIATIONS D-M0-2).
export function milestoneAtOrBelow(testName, milestone) {
  const m = /^\[M(\d+)\]/.exec(testName);
  if (!m) return false;
  const target = /^M(\d+)$/.exec(milestone);
  if (!target) return false;
  return Number(m[1]) <= Number(target[1]);
}

export async function runAll(opts = {}) {
  const dir = opts.dir ?? path.join(__dirname);
  const milestone = opts.milestone;

  let files;
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".e2e.mjs"));
  } catch {
    files = [];
  }
  files.sort((a, b) => gpNumber(a) - gpNumber(b) || a.localeCompare(b));

  if (files.length === 0) {
    console.log("run: no GP case files found in e2e/cases");
    return 1;
  }

  const testFiles = files.map((f) => path.join(dir, f));
  // --milestone Mn: only tests tagged [M0]..[Mn] run at all, so a lower milestone never waits on
  // a higher milestone's idle windows (D-M0-2, D-M1-F1-2). CI tool code: regex allowed.
  const target = milestone ? /^M(\d+)$/.exec(milestone) : null;
  const tags = target ? Array.from({ length: Number(target[1]) + 1 }, (_, k) => `M${k}`).join("|") : "";
  const stream = run({
    files: testFiles,
    concurrency: 1,
    testNamePatterns: target ? [new RegExp(`^\\[(${tags})\\]`)] : undefined,
  });

  const results = new Map(); // gp id -> { pass, fail }
  let anyFail = false;

  for await (const event of stream) {
    if (event.type === "test:pass" || event.type === "test:fail") {
      const name = event.data.name ?? "";
      if (milestone && !milestoneAtOrBelow(name, milestone)) continue;
      const gpMatch = /GP\d+/.exec(event.data.file ?? "") || /GP\d+/.exec(name);
      const gpId = gpMatch ? gpMatch[0] : "GP?";
      const bucket = results.get(gpId) ?? { pass: 0, fail: 0 };
      if (event.type === "test:pass") bucket.pass += 1;
      else {
        bucket.fail += 1;
        anyFail = true;
        // DX (review-M1 #4): name the failing case and its first error line, so a gate FAIL is
        // actionable without a rerun.
        const err = event.data.details?.error;
        const why = String(err?.cause?.message ?? err?.message ?? "no error detail").split("\n")[0];
        console.error(`FAIL ${name}: ${why}`);
      }
      results.set(gpId, bucket);
    }
  }

  // impl/14 §5 step 3: one pass/fail line per GP id, on stderr; stdout carries exactly one JSON
  // line { ok, gp } so the live harness's local branch can parse it (DEVIATIONS row for
  // e2e/live/cases kind "local", D-M1-F1-2). Exit code stays §5 step 4.
  const gp = {};
  for (const [gpId, { pass, fail }] of results) {
    console.error(`${gpId}: ${fail === 0 ? "PASS" : "FAIL"} (${pass} pass, ${fail} fail)`);
    gp[gpId] = { pass, fail };
  }
  console.log(JSON.stringify({ ok: !anyFail, gp }));

  return anyFail ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const milestone = parseMilestoneArg(process.argv);
  runAll({ milestone }).then((code) => process.exit(code));
}
