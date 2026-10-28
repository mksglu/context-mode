// throwaway preload: per-phase spans and per-statement sqlite timing of one hook process, printed on exit to stderr
import { performance } from "node:perf_hooks";
import { DatabaseSync } from "node:sqlite";
const t0 = performance.now();
const stm = [];
const wrap = (name) => {
  const orig = DatabaseSync.prototype[name];
  DatabaseSync.prototype[name] = function (...a) {
    const t = performance.now();
    try { return orig.apply(this, a); } finally { stm.push([name + ":" + String(a[0]).replace(/\s+/g, " ").slice(0, 28), performance.now() - t]); }
  };
};
wrap("exec");
process.on("exit", () => {
  const n = performance.nodeTiming;
  const sum = stm.reduce((a, b) => a + b[1], 0);
  const top = [...stm].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => Math.round(v) + "ms " + k).join(" ; ");
  process.stderr.write("H5SPAN " + JSON.stringify({ loopStart: Math.round(n.loopStart), exitAt: Math.round(performance.now()), sqliteExecMs: Math.round(sum), execCalls: stm.length, top }) + "\n");
});
