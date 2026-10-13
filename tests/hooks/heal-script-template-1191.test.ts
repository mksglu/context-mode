/**
 * Issue #1191 — the auto-deployed cache-heal template in start.mjs must not
 * treat `<version>.bak-*` backup dirs as installed versions, and must not
 * silently leave a missing installPath unhealed.
 *
 * Defect 1: the version-dir filter `/^\d+\.\d+/` is not end-anchored, so
 * `1.0.169.bak-noop` qualifies, sorts level with the real `1.0.169`, and can
 * be selected for the repair symlink.
 * Defect 2: when the installPath is missing and no valid version dir can be
 * selected, the hook silently continues; it must log to hook-errors.log.
 *
 * These tests execute the real embedded `healScript` template (sliced out of
 * start.mjs the way start-mjs-self-heal.test.ts does) under a controlled
 * CLAUDE_CONFIG_DIR, so they fail against the old template and pass fixed.
 */
import { describe, expect, test, afterEach } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
const startSrc = readFileSync(resolve(ROOT, "start.mjs"), "utf-8");

const cleanups: string[] = [];
afterEach(() => {
  while (cleanups.length) {
    try {
      rmSync(cleanups.pop()!, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
});

function makeTmp(prefix = "ctx-heal-tpl-"): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  cleanups.push(dir);
  return dir;
}

/** The embedded healScript template, evaluated and written to a runnable file.
 *
 * The slice is the template literal *source* (escapes doubled, as authored in
 * start.mjs). Re-exporting it through a wrapper module evaluates those escapes
 * exactly the way start.mjs does when it deploys the hook — importing the raw
 * source would test doubled backslashes the real hook never contains.
 */
async function writeTemplate(): Promise<string> {
  const dir = makeTmp();
  const startOfTpl = startSrc.indexOf("const healScript = `");
  expect(startOfTpl).toBeGreaterThan(-1);
  const endMarker = "writeFileSync(healHookPath, healScript";
  const endIdx = startSrc.indexOf(endMarker, startOfTpl);
  expect(endIdx).toBeGreaterThan(startOfTpl);
  const tpl = startSrc.slice(startOfTpl, endIdx);
  const raw = tpl.slice(tpl.indexOf("`") + 1, tpl.lastIndexOf("`"));
  expect(raw).not.toContain("${");
  const wrapperPath = join(dir, "template.mjs");
  // No literal backticks here: BT keeps this source free of escapes that a
  // writer could decode, mirroring start.mjs byte-for-byte.
  const BT = String.fromCharCode(96);
  writeFileSync(wrapperPath, "export default " + BT + raw + BT + ";", "utf-8");
  const { default: script } = (await import(
    pathToFileURL(wrapperPath).href
  )) as { default: string };
  const path = join(dir, "heal.mjs");
  writeFileSync(path, script, "utf-8");
  return path;
}

interface HealWorld {
  cfg: string;
  cacheParent: string;
  installPath: string;
  logPath: string;
}

/** A fake Claude config dir: plugin registry + versioned cache parent. */
function makeWorld(dirs: string[], installLeaf: string): HealWorld {
  const cfg = makeTmp("ctx-heal-cfg-");
  const cacheParent = join(cfg, "plugins", "cache", "owner", "plugin");
  mkdirSync(cacheParent, { recursive: true });
  for (const d of dirs) mkdirSync(join(cacheParent, d), { recursive: true });
  const installPath = join(cacheParent, installLeaf);
  writeFileSync(
    join(cfg, "plugins", "installed_plugins.json"),
    JSON.stringify({
      plugins: { "context-mode@context-mode": [{ installPath }] },
    }),
    "utf-8",
  );
  return {
    cfg,
    cacheParent,
    installPath,
    logPath: join(cfg, "context-mode", "hook-errors.log"),
  };
}

function runHeal(scriptPath: string, cfg: string): void {
  const res = spawnSync(process.execPath, [scriptPath], {
    env: { ...process.env, CLAUDE_CONFIG_DIR: cfg },
    encoding: "utf-8",
  });
  expect(res.error).toBeUndefined();
  expect(res.status).toBe(0);
}

describe("healScript template — Issue #1191 version filter", () => {
  test("template end-anchors the version-directory pattern", () => {
    const startOfTpl = startSrc.indexOf("const healScript = `");
    const tpl = startSrc.slice(startOfTpl);
    // The deployed script must see /^\d+\.\d+(\.\d+)?$/ — i.e. the start.mjs
    // source carries the doubled backslashes of the template literal.
    expect(tpl).toContain(String.raw`/^\\d+\\.\\d+(\\.\\d+)?$/`);
  });

  test("a lone <version>.bak-* dir is not symlinked; the miss is logged", async () => {
    const script = await writeTemplate();
    const w = makeWorld(["1.0.169.bak-noop"], "1.0.169");
    runHeal(script, w.cfg);
    expect(
      existsSync(w.installPath),
      "missing installPath must not be symlinked to a backup dir",
    ).toBe(false);
    expect(existsSync(w.logPath)).toBe(true);
    const log = readFileSync(w.logPath, "utf-8");
    expect(log).toContain("no version directory");
    expect(log).toContain(w.installPath);
  });

  test("a real version dir still heals a missing installPath", async () => {
    const script = await writeTemplate();
    // installPath 1.0.169 is missing; the only version dir is 1.0.168.
    const w = makeWorld(["1.0.168"], "1.0.169");
    runHeal(script, w.cfg);
    // Junction on Windows, symlink elsewhere — either way it must resolve
    // to the real version dir.
    expect(existsSync(w.installPath)).toBe(true);
    expect(readlinkSync(w.installPath)).toBe(join(w.cacheParent, "1.0.168"));
  });
});
