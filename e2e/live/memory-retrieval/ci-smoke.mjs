#!/usr/bin/env node
// CI gate for e2e/live/cases/memory-retrieval-local.json.
// Runs run.mjs on the synthetic fixtures and fails if R2 recall@5 < 1.0.
import os from "node:os";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const r = spawnSync(
  process.execPath,
  [
    path.join(HERE, "run.mjs"),
    "--queries", path.join(HERE, "fixtures/queries"),
    "--journals", path.join(HERE, "fixtures/journals"),
    "--variants", "R0,R1,R2,R3,R4,R5",
    "--out", path.join(os.tmpdir(), "memory-retrieval-ci-results.md"),
    "--privout", "/tmp/memory-retrieval-private/results-ci",
  ],
  { encoding: "utf8" },
);

const line = (r.stdout || "").trim().split("\n").pop() || "";
const m = /R2\.recallAt5=([0-9.]+)/.exec(line);
const r2RecallAt5 = m ? Number(m[1]) : 0;
const pass = r.status === 0 && r2RecallAt5 >= 1.0;

if (!pass) process.stderr.write((r.stderr || "") + "\n" + line + "\n");
console.log(JSON.stringify({ pass, r2RecallAt5, smokeLine: line }));
process.exit(pass ? 0 : 1);
