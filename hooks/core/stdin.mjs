/**
 * Shared stdin reader for all hook scripts.
 * Cross-platform (Windows/macOS/Linux) — no bash/jq dependency.
 *
 * Uses event-based flowing mode to avoid two platform bugs:
 * - `for await (process.stdin)` hangs on macOS when piped via spawnSync
 * - `readFileSync(0)` throws EOF/EISDIR on Windows, EAGAIN on Linux
 *
 * Idle-timeout semantics (override via env `CONTEXT_MODE_HOOK_STDIN_IDLE_MS`,
 * default 1500 ms):
 * - EOF before any data → resolve("")  — the original well-behaved path.
 * - EOF after data       → resolve(buffer) with BOM strip (#139 — Cursor on
 *                          Windows can emit a leading U+FEFF that crashes
 *                          downstream JSON.parse).
 * - Idle with 0 bytes    → resolve("")  — covers hosts that hold the pipe open
 *                          without ever closing it (issue #639 — Bun re-exec
 *                          EOF path) so the hook still terminates.
 * - Idle with > 0 bytes  → reject(Error) — partial data after a stall MUST NOT
 *                          be silently truncated, otherwise downstream
 *                          JSON.parse corrupts on large `tool_response`
 *                          payloads (issue #242 — Gemini AfterTool >1MB).
 *                          Visible non-zero exit is correct here; the host
 *                          surfaces the failure in its hook diagnostics.
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
    const resolveBuffer = () => {
      if (done) return;
      done = true;
      cleanup();
      // Preserves #139 BOM strip \u2014 applies on both EOF and idle-empty paths.
      resolve(data.replace(/^\uFEFF/, ""));
    };
    const rejectIdle = () => {
      if (done) return;
      done = true;
      cleanup();
      reject(new Error(
        `stdin idle for ${idleMs}ms with ${data.length} bytes buffered`,
      ));
    };
    const onIdle = () => {
      // Zero-buffer idle = host never wrote anything (issue #639). Resolve
      // empty so the hook can no-op. Non-zero buffer = partial data, which
      // must reject to avoid silent JSON.parse corruption (issue #242).
      if (data.length === 0) {
        resolveBuffer();
      } else {
        rejectIdle();
      }
    };
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(onIdle, idleMs);
      timer.unref?.();
    };
    const onData = (chunk) => {
      data += chunk;
      arm();
    };
    const onEnd = () => resolveBuffer();
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
