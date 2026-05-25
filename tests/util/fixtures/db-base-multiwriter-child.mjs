// Child fixture for the cross-process multi-writer test in
// tests/util/db-base-platform-gate.test.ts.
//
// Reads dbPath, sessionId, and iteration count from argv, opens the
// built SessionDB at that path, and writes `iterations` events under
// `sessionId`. On success prints `OK <count>` to stdout and exits 0;
// on any error prints `ERR <message>` to stderr and exits 1.
//
// Imports from build/ (not src/) so the child runs under plain Node
// without a TypeScript loader. The parent test ensures `build/` is
// populated via `tsc` before spawning.

import { SessionDB } from "../../../build/session/db.js";

const [, , dbPath, sessionId, iterStr] = process.argv;
const iterations = Number.parseInt(iterStr || "0", 10);

if (!dbPath || !sessionId || !Number.isFinite(iterations) || iterations <= 0) {
  process.stderr.write(
    `ERR usage: db-base-multiwriter-child.mjs <dbPath> <sessionId> <iterations>\n`,
  );
  process.exit(2);
}

let db;
try {
  db = new SessionDB({ dbPath });
  // Tight write loop with no artificial delay. This is the workload
  // shape that exercises the cross-process WAL writer-lock contention
  // path #642 surfaced on. Each insertEvent goes through withRetry +
  // busy_timeout, so a regression to busy_timeout = 0 or a re-introduced
  // EXCLUSIVE pragma surfaces here as a thrown error.
  for (let i = 0; i < iterations; i++) {
    db.insertEvent(sessionId, {
      type: "PreToolUse",
      category: "tool",
      data: JSON.stringify({ child: sessionId, i }),
      priority: 0,
    });
  }
  process.stdout.write(`OK ${iterations}\n`);
  process.exit(0);
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`ERR ${msg}\n`);
  process.exit(1);
} finally {
  try { db?.close(); } catch { /* best effort */ }
}
