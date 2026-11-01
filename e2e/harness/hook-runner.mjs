// e2e/harness/hook-runner.mjs
// Spawns a hook entry bundle with argv --agent <id> --event <name>,
// writes the payload to stdin, and returns stdout/stderr/exitCode/ms.
// Spec: docs/architecture/modules/14-tests.md §1, 00-architecture.md e2e table.
import { spawn } from "node:child_process";

/**
 * @param {string} bundlePath
 * @param {{agent:string, event:string, payload:unknown, env?:Record<string,string>}} opts
 * @returns {Promise<{stdout:string, stderr:string, exitCode:number|null, ms:number}>}
 */
export function runHook(bundlePath, opts) {
  const { agent, event, payload, env } = opts;
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const child = spawn(
      process.execPath,
      [bundlePath, "--agent", agent, "--event", event],
      { stdio: ["pipe", "pipe", "pipe"], env: env ?? process.env }
    );

    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));

    child.on("error", reject);
    child.on("exit", (code) => {
      const ms = Date.now() - start;
      resolve({ stdout, stderr, exitCode: code, ms });
    });

    const body = typeof payload === "string" ? payload : JSON.stringify(payload);
    child.stdin.write(body);
    child.stdin.end();
  });
}

/**
 * runHookFixture(bundlePath, agent, payload) -> same result as runHook.
 * Thin wrapper for GP3 fixture replay (e2e/cases/GP3-hooks.e2e.mjs): the hook
 * entry (src/entries/hook.ts) only reads --agent off argv, so no event name
 * is needed to run the bundle.
 */
export function runHookFixture(bundlePath, agent, payload, env) {
  return runHook(bundlePath, { agent, event: undefined, payload, env });
}
