import { afterEach, assert, describe, test, vi } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { maybeStarNudge } from "../src/star-nudge.js";

// These guards must hold WITHOUT touching the network, `gh`, or the filesystem:
// each returns before ghReady()/markShown(), so the user's account and CI runs
// are never affected.
describe("star-nudge — opt-out / CI guards", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
    vi.restoreAllMocks();
  });

  test("CONTEXT_MODE_NO_STAR_NUDGE makes it a silent no-op (opt-out)", async () => {
    delete process.env.CI;
    delete process.env.GITHUB_ACTIONS;
    process.env.CONTEXT_MODE_NO_STAR_NUDGE = "1";
    const write = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    await maybeStarNudge("doctor");
    assert.equal(write.mock.calls.length, 0, "opt-out must print nothing and never call gh");
  });

  test("never nudges or stars under CI (automated installs)", async () => {
    delete process.env.CONTEXT_MODE_NO_STAR_NUDGE;
    process.env.CI = "true";
    const write = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    await maybeStarNudge("postinstall");
    assert.equal(write.mock.calls.length, 0, "CI must print nothing");
  });

  test("shows at most once per surface (marker short-circuits before any gh call)", async () => {
    delete process.env.CI;
    delete process.env.GITHUB_ACTIONS;
    delete process.env.CONTEXT_MODE_NO_STAR_NUDGE;
    const home = mkdtempSync(join(tmpdir(), "cm-star-"));
    process.env.HOME = home; // os.homedir() honours $HOME on POSIX…
    process.env.USERPROFILE = home; // …and %USERPROFILE% on Windows
    mkdirSync(join(home, ".context-mode"), { recursive: true });
    writeFileSync(join(home, ".context-mode", ".star-nudge.doctor"), "");
    const write = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    await maybeStarNudge("doctor");
    assert.equal(write.mock.calls.length, 0, "an already-shown surface must never nudge again (the 1회 guarantee)");
  });
});
