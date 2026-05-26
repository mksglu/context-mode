/**
 * Shared stdin reader for all hook scripts.
 * Cross-platform (Windows/macOS/Linux) — no bash/jq dependency.
 *
 * Uses event-based flowing mode to avoid two platform bugs:
 * - `for await (process.stdin)` hangs on macOS when piped via spawnSync
 * - `readFileSync(0)` throws EOF/EISDIR on Windows, EAGAIN on Linux
 */

export function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    const idleMs = Number(process.env.CONTEXT_MODE_HOOK_STDIN_IDLE_MS || 1500);
    let done = false;
    let timer;

    const cleanup = () => {
      clearTimeout(timer);
      process.stdin.removeListener("data", onData);
      process.stdin.removeListener("end", onEnd);
      process.stdin.removeListener("error", onError);
      try { process.stdin.pause(); } catch {}
      try { process.stdin.destroy?.(); } catch {}
    };
    const finish = () => {
      if (done) return;
      done = true;
      cleanup();
      resolve(data.replace(/^\uFEFF/, ""));
    };
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(finish, idleMs);
      timer.unref?.();
    };
    const onData = (chunk) => {
      data += chunk;
      arm();
    };
    const onEnd = () => finish();
    const onError = (error) => {
      if (done) return;
      done = true;
      cleanup();
      reject(error);
    };

    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", onData);
    process.stdin.on("end", onEnd);
    process.stdin.on("error", onError);
    process.stdin.resume();
    arm();
  });
}
