// src/entries/run.ts — entry for the run.mjs and search.mjs bundles (impl/13 §2, impl/04 §4, D-M3-X1-2).
// One entry, two bundle names: the file name the subagent ran picks the job.
import { basename } from "node:path";
import { SEARCH_WRAPPER_FILE } from "../core/contracts/constants.ts";
import { runWrapperMain, searchWrapperMain } from "../core/tools/run-wrapper.ts";

const main = basename(process.argv[1] ?? "") === SEARCH_WRAPPER_FILE ? searchWrapperMain : runWrapperMain;
void main(process.argv, process.env);
