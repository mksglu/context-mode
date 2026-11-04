// compact-hard held-out set: 2 sessions x 3 questions, other seeds and other targets than the main set.
// Written before any candidate fix; a candidate is tuned on the main set only and scored here once.
import { deployConfig, distManifest } from "../gen.mjs";
import { serverLog } from "../gen.mjs";

export function heldoutSessions() {
  const log = serverLog(9001), cfg = deployConfig(9002), dist = distManifest(9003);
  return [
    { id: "h-log", data: log, questions: [
      { id: "h-log-lasterr-req", q: `Earlier you printed logs/server.log. What was the req id on the line with error code ${log.values.lastErrCode}?`, answer: log.values.lastErrReq },
      { id: "h-log-fatal-line", q: "In that server log output, on which line number (as printed by cat -n) was the only FATAL line?", answer: log.values.fatalLine },
    ] },
    { id: "h-cfg", data: cfg, questions: [
      { id: "h-cfg-mailer-digest", q: "Earlier you printed config/deploy.json. What is the image digest of the mailer service in region us-west-1?", answer: cfg.values.mailerUsWest1Digest },
      { id: "h-cfg-audit-mem", q: "In that deploy config, what is limits.mem_mi of the audit service in region eu-central-1?", answer: cfg.values.auditEuCentral1Mem },
    ] },
    { id: "h-dist", data: dist, questions: [
      { id: "h-dist-hash-0088", q: `Earlier you printed dist/MANIFEST.txt. What is the full sha256 of ${dist.values.path0088}?`, answer: dist.values.hash0088 },
      { id: "h-dist-size-0612", q: `In that manifest, what is the size in bytes of ${dist.values.path0612}?`, answer: dist.values.size0612 },
    ] },
  ];
}
