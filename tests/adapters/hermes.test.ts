import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { mkdtempSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { HermesAdapter } from "../../src/adapters/hermes/index.js";

const ROOT = resolve(__dirname, "../..");
describe("Hermes native adapter", () => {
  it("declares hooks with Hermes' public manifest field", () => {
    const manifest = readFileSync(resolve(ROOT, "plugin.yaml"), "utf8");
    expect(manifest).toContain("provides_hooks:");
    expect(manifest).not.toMatch(/^hooks:/m);
  });

  it("uses Hermes storage and normalizes public hook payloads", () => {
    const adapter = new HermesAdapter();
    expect(adapter.getSessionDir()).toBe(resolve(adapter.getConfigDir(), "context-mode", "sessions"));
    expect(adapter.parsePreToolUseInput({ tool_name: "terminal", args: { command: "pwd" }, session_id: "s" })).toMatchObject({ toolName: "terminal", toolInput: { command: "pwd" }, sessionId: "s" });
    expect(adapter.capabilities.canModifyOutput).toBe(true);
    expect(adapter.paradigm).toBe("python-plugin");
  });

  it("honors profile-scoped HERMES_HOME for MCP and hook storage", () => {
    const previous = process.env.HERMES_HOME;
    const home = mkdtempSync(resolve(tmpdir(), "hermes-home-"));
    process.env.HERMES_HOME = home;
    try {
      const adapter = new HermesAdapter();
      expect(adapter.getConfigDir()).toBe(home);
      expect(adapter.getSettingsPath()).toBe(resolve(home, "config.yaml"));
      expect(adapter.getSessionDir()).toBe(resolve(home, "context-mode", "sessions"));
    } finally {
      if (previous === undefined) delete process.env.HERMES_HOME;
      else process.env.HERMES_HOME = previous;
    }
  });

  it("loads as a real Python plugin, registers public hooks/commands, and fails open", () => {
    const binDir = mkdtempSync(resolve(tmpdir(), "context-mode-hermes-"));
    const stub = resolve(binDir, "context-mode");
    writeFileSync(stub, `#!/bin/sh
printf '%s' '{"hookSpecificOutput":{"additionalContext":"continuity"}}'
`);
    chmodSync(stub, 0o755);
    const harness = String.raw`
import importlib.util, json, pathlib, time
root=pathlib.Path(${JSON.stringify(ROOT)})
spec=importlib.util.spec_from_file_location("context_mode_hermes", root/"__init__.py")
m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
class C:
 def __init__(self): self.hooks={}; self.commands={}; self.calls=[]; self.delay=False
 def register_hook(self,n,f): self.hooks[n]=f
 def register_command(self,n,f,*a): self.commands[n]=f
 def dispatch_tool(self,n,a,**kw):
  self.calls.append((n,a,kw))
  if self.delay: time.sleep(0.2)
  return json.dumps({"success":True})
c=C(); m.register(c)
assert {"pre_tool_call","post_tool_call","pre_llm_call","on_session_end","on_session_finalize","on_session_reset","transform_tool_result"} <= set(c.hooks)
assert "post_llm_call" not in c.hooks and "on_session_start" not in c.hooks
assert {"ctx-stats","ctx-doctor","ctx-search"} == set(c.commands)
assert c.hooks["transform_tool_result"]("terminal", "small", session_id="s") is None
large="x"*17000
assert c.hooks["transform_tool_result"]("terminal", large, session_id="s") is None
marker=c.hooks["transform_tool_result"]("read_file", large, session_id="s", tool_call_id="call-a")
assert marker and "indexed 17000 bytes" in marker
marker2=c.hooks["transform_tool_result"]("read_file", large, session_id="s", tool_call_id="call-b")
assert marker2 and c.calls[-2][1]["source"] != c.calls[-1][1]["source"]
assert c.hooks["transform_tool_result"]("write_file", large, session_id="s") is None
c.delay=True; m._INDEX_TIMEOUT=0.01
started=time.monotonic()
assert c.hooks["transform_tool_result"]("read_file", large, session_id="s", tool_call_id="slow") is None
assert time.monotonic()-started < 0.1
r=c.hooks["pre_llm_call"](session_id="fresh", user_message="hello", is_first_turn=True, compaction_applied=False)
assert r == {"system_context":"continuity"}
r=c.hooks["pre_llm_call"](session_id="fresh", user_message="next", is_first_turn=False, compaction_applied=True)
assert r == {"system_context":"continuity"}
print("ok")
`;
    const run = spawnSync("python3", ["-c", harness], { encoding: "utf8", timeout: 10_000, env: { ...process.env, CONTEXT_MODE_EXECUTABLE: stub } });
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout.trim()).toBe("ok");
  });
});
