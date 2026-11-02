#!/usr/bin/env node
// build/check-readme.mjs — ADR-0015 CI cap: README.md must have at most README_MAX_LINES lines.
// D-README-1: also fails when the README agent lines (one per install block) differ from build/readme-agents.mjs (adapter table + setup registry).
// D-README-THESIS-1: also fails when a relative link or image path in README.md does not exist, or the README figures pass 2 MB.
// Usage: node build/check-readme.mjs. Prints "PASS|FAIL readme-lines <n>/<max>", "PASS|FAIL readme-agents", "PASS|FAIL readme-links"
// and "PASS|FAIL readme-images <bytes>/<max>"; exit 1 on FAIL.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { README_MAX_LINES } from "../src/core/contracts/constants.ts";
import { checkAgentLines } from "./readme-agents.mjs";
import { README_IMAGES_MAX_BYTES, missingTargets, readmeImageBytes } from "./readme-links.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const text = readFileSync(path.join(REPO_ROOT, "README.md"), "utf8");
const lines = text.endsWith("\n") ? text.split("\n").length - 1 : text.split("\n").length;
const ok = lines <= README_MAX_LINES;
console.log(`${ok ? "PASS" : "FAIL"} readme-lines ${lines}/${README_MAX_LINES}`);
const agents = checkAgentLines(text);
for (const b of agents) console.log("  " + b);
console.log(`${agents.length ? "FAIL" : "PASS"} readme-agents`);
const missing = missingTargets(text, REPO_ROOT);
for (const m of missing) console.log("  missing " + m);
console.log(`${missing.length ? "FAIL" : "PASS"} readme-links`);
const bytes = readmeImageBytes(REPO_ROOT);
const imagesOk = bytes <= README_IMAGES_MAX_BYTES;
console.log(`${imagesOk ? "PASS" : "FAIL"} readme-images ${bytes}/${README_IMAGES_MAX_BYTES}`);
process.exit(ok && !agents.length && !missing.length && imagesOk ? 0 : 1);
