/**
 * star-nudge — one-time, consent-gated GitHub-star prompt.
 *
 * Shown at most once per `surface` ("postinstall" | "doctor"), only when the
 * GitHub CLI (`gh`) is available and the repo is not already starred. The repo
 * is starred ONLY on an explicit "Y" at the interactive prompt; with no TTY
 * (e.g. postinstall during `npm install`) it just prints the message and never
 * touches the user's account. Opt out entirely with CONTEXT_MODE_NO_STAR_NUDGE=1.
 * Everything here is best-effort — a nudge must never break install or `doctor`.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline";

const REPO = "mksglu/context-mode";
const STAR_URL = `https://github.com/${REPO}`;

export type StarNudgeSurface = "postinstall" | "doctor";

function markerDir(): string {
  return join(homedir(), ".context-mode");
}
function markerPath(surface: StarNudgeSurface): string {
  return join(markerDir(), `.star-nudge.${surface}`);
}
function alreadyShown(surface: StarNudgeSurface): boolean {
  try {
    return existsSync(markerPath(surface));
  } catch {
    return false;
  }
}
function markShown(surface: StarNudgeSurface): void {
  try {
    mkdirSync(markerDir(), { recursive: true });
    writeFileSync(markerPath(surface), "");
  } catch {
    /* best effort */
  }
}
function suppressed(): boolean {
  // Never nudge in CI/automation, and honour an explicit opt-out.
  return Boolean(
    process.env.CI ||
      process.env.GITHUB_ACTIONS ||
      process.env.CONTEXT_MODE_NO_STAR_NUDGE,
  );
}
function ghReady(): boolean {
  try {
    return spawnSync("gh", ["--version"], { stdio: "ignore", timeout: 4000 }).status === 0;
  } catch {
    return false;
  }
}
function alreadyStarred(): boolean {
  try {
    // `gh api user/starred/<repo>` → 204 (exit 0) when starred, 404 otherwise.
    return (
      spawnSync("gh", ["api", `user/starred/${REPO}`], { stdio: "ignore", timeout: 5000 }).status === 0
    );
  } catch {
    return false;
  }
}
function star(): boolean {
  try {
    return (
      spawnSync("gh", ["api", "-X", "PUT", `user/starred/${REPO}`], { stdio: "ignore", timeout: 8000 }).status === 0
    );
  } catch {
    return false;
  }
}
function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    try {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer);
      });
    } catch {
      resolve("");
    }
  });
}
function printNudge(): void {
  process.stdout.write(
    "\n" +
      "  ❤️  If context-mode has been helpful to you, would you mind starring the repo?\n" +
      "     It really helps the project grow!\n" +
      `     → ${STAR_URL}\n` +
      "\n",
  );
}

/**
 * Show the one-time star nudge for `surface`. Returns silently in every
 * not-applicable case (suppressed, already shown, no `gh`, already starred).
 */
export async function maybeStarNudge(surface: StarNudgeSurface): Promise<void> {
  try {
    if (suppressed() || alreadyShown(surface)) return;
    if (!ghReady()) return; // can't check or star — leave the one-shot for later
    if (alreadyStarred()) {
      markShown(surface);
      return;
    }

    printNudge();

    // Interactive consent only when attached to a TTY. postinstall (npm install)
    // is not a TTY, so it shows the message and stops — never stars silently.
    if (process.stdin.isTTY && process.stdout.isTTY) {
      const choice = (await ask("  Star now? (Y/n/skip): ")).trim().toLowerCase();
      if (choice === "y" || choice === "yes") {
        process.stdout.write(
          star()
            ? "  Thank you! ⭐\n\n"
            : `  Couldn't star automatically — please star manually: ${STAR_URL}\n\n`,
        );
      } else if (choice === "s" || choice === "skip") {
        process.stdout.write("  Skipped. You can star later anytime.\n\n");
      } else {
        process.stdout.write("  Maybe later. Thank you anyway!\n\n");
      }
    }

    markShown(surface);
  } catch {
    /* a star nudge must never break install or doctor */
  }
}
