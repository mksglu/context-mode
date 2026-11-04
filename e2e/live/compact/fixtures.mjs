// T-CMP fixtures (DECISIONS-r9 T-CMP, plan.md §2 E3): synthetic multi-turn sessions.
// Each session holds 3 earlier facts (option, path, errorfix); exactly one is > 640 B,
// so the ADR-0009 §4 pointer rule turns it into `#<seq> (<bytes> B) ctx_resume(seq:<seq>)`.
// `answer.exact` is the answer key: the exact string the checker looks for in the reply.
// Synthetic text only: no transcript text, no project names, no owner paths.
import { readFileSync } from "node:fs";

const IDS = ["session-01", "session-02", "session-03"];

function load(id) {
  return JSON.parse(readFileSync(new URL(`./fixtures/${id}.json`, import.meta.url), "utf8"));
}

export const FIXTURES = Object.freeze(IDS.map(load));
