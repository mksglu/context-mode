// throwaway preload: per-phase spans of one hook process, printed on exit to stderr as one JSON line
import { performance } from "node:perf_hooks";
const t0 = performance.now();
process.on("exit", () => {
  const n = performance.nodeTiming;
  process.stderr.write("H5SPAN " + JSON.stringify({ bootstrap: Math.round(n.bootstrapComplete), env: Math.round(n.environment), loopStart: Math.round(n.loopStart), preloadAt: Math.round(t0), exitAt: Math.round(performance.now()), loopExit: Math.round(n.loopExit) }) + "\n");
});
