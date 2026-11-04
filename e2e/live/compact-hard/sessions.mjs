// compact-hard main set: 4 sessions x 3 questions. Held-out questions live in heldout/ (not imported here).
// A session: the generator output (one data file), one pre-compaction turn that prints it, then /compact,
// then one turn per question. The pre-compaction turn asks for a short verdict and no values, so the
// host compact summary has no reason to keep the exact values.
import { deployConfig, distManifest, serverLog, testRun } from "./gen.mjs";

export const ANSWER_RULE = "End your reply with one last line in exactly this form: ANSWER: <value>";

export function printTurn(d) {
  return `Run \`${d.command}\` with the Bash tool and read the whole output. Then tell me in one short sentence whether anything looks wrong. Do not quote any ids, hashes, numbers or names from the output.`;
}

export function mainSessions() {
  const log = serverLog(101), cfg = deployConfig(202), dist = distManifest(303), tr = testRun(404);
  return [
    { id: "log", data: log, questions: [
      { id: "log-fatal-req", q: "Earlier you printed logs/server.log. What was the req id on the only FATAL line?", answer: log.values.fatalReq },
      { id: "log-e4471-line", q: "In that server log output, on which line number (as printed by cat -n) did error code E4471 first appear?", answer: log.values.firstE4471Line },
      { id: "log-slow-host", q: "In that server log, which upstream host served the request with latency 9873ms?", answer: log.values.slowHost },
    ] },
    { id: "cfg", data: cfg, questions: [
      { id: "cfg-ledger-tag", q: "Earlier you printed config/deploy.json. What is the image tag of the ledger service in region ap-south-2?", answer: cfg.values.ledgerApSouth2Tag },
      { id: "cfg-billing-backoff", q: "In that deploy config, what is retry.backoff_ms of the billing service in region eu-west-3?", answer: cfg.values.billingEuWest3Backoff },
      { id: "cfg-zero-replicas", q: "In that deploy config, exactly one service in one region has replicas set to 0. Which one? Give it as service@region.", answer: cfg.values.zeroReplicas, derived: true },
    ] },
    { id: "dist", data: dist, questions: [
      { id: "dist-hash-0417", q: `Earlier you printed dist/MANIFEST.txt. What is the full sha256 of ${dist.values.path0417}?`, answer: dist.values.hash0417 },
      { id: "dist-path-by-size", q: `In that manifest, which path has a size of exactly ${dist.values.sizeTarget} bytes?`, answer: dist.values.pathBySize },
      { id: "dist-size-0733", q: `In that manifest, what is the size in bytes of ${dist.values.path0733}?`, answer: dist.values.size0733 },
    ] },
    { id: "tests", data: tr, questions: [
      { id: "tests-seed", q: "Earlier you printed test-output.txt. What random seed did the test run print at the top?", answer: tr.values.runSeed },
      { id: "tests-fail1-got", q: `In that test output, the test "${tr.values.fail1Name}" failed with "expected X got Y". What was Y?`, answer: tr.values.fail1Got },
      { id: "tests-fail2-loc", q: `In that test output, at which location (file:line:col) did the test "${tr.values.fail2Name}" fail?`, answer: tr.values.fail2Loc },
    ] },
  ];
}
