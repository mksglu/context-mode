#!/usr/bin/env node
import "./suppress-stderr.mjs";
/**
 * Unified PreToolUse hook for context-mode (Claude Code)
 * Redirects data-fetching tools to context-mode MCP tools
 *
 * Cross-platform (Windows/macOS/Linux) — no bash/jq dependency.
 *
 * Routing is delegated to core/routing.mjs (shared across platforms).
 * This file retains the Claude Code-specific self-heal block and
 * uses core/formatters.mjs for Claude Code output format.
 */

import { readFileSync, writeFileSync, existsSync, rmSync, mkdirSync, copyFileSync, readdirSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir, tmpdir } from "node:os";
import { readStdin } from "./core/stdin.mjs";
import { routePreToolUse, initSecurity } from "./core/routing.mjs";
import { formatDecision } from "./core/formatters.mjs";

// ─── Manual recursive copy (avoids cpSync libuv crash on non-ASCII paths, Windows + Node 24) ───
function copyDirSync(src, dest) {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const srcPath = resolve(src, entry.name);
    const destPath = resolve(dest, entry.name);
    if (entry.isDirectory()) copyDirSync(srcPath, destPath);
    else copyFileSync(srcPath, destPath);
  }
}

// ─── Self-heal: rename dir to correct version, fix registry + hooks ───
try {
  const hookDir = dirname(fileURLToPath(import.meta.url));
  const myRoot = resolve(hookDir, "..");
  const myPkg = JSON.parse(readFileSync(resolve(myRoot, "package.json"), "utf-8"));
  const myVersion = myPkg.version ?? "unknown";
  const myDirName = basename(myRoot);
  const cacheParent = dirname(myRoot);
  const marker = resolve(tmpdir(), `context-mode-healed-${myVersion}`);

  if (myVersion !== "unknown" && !existsSync(marker)) {
    // 1. If dir name doesn't match version (e.g. "0.7.0" but code is "0.9.12"),
    //    create correct dir, copy files, update registry + hooks
    const correctDir = resolve(cacheParent, myVersion);
    if (myDirName !== myVersion && !existsSync(correctDir)) {
      copyDirSync(myRoot, correctDir);

      // Create start.mjs in new dir if missing
      const startMjs = resolve(correctDir, "start.mjs");
      if (!existsSync(startMjs)) {
        writeFileSync(startMjs, [
          '#!/usr/bin/env node',
          'import { existsSync } from "node:fs";',
          'import { dirname, resolve } from "node:path";',
          'import { fileURLToPath } from "node:url";',
          'const __dirname = dirname(fileURLToPath(import.meta.url));',
          'process.chdir(__dirname);',
          'if (!process.env.CLAUDE_PROJECT_DIR) process.env.CLAUDE_PROJECT_DIR = process.cwd();',
          'if (existsSync(resolve(__dirname, "server.bundle.mjs"))) {',
          '  await import("./server.bundle.mjs");',
          '} else if (existsSync(resolve(__dirname, "build", "server.js"))) {',
          '  await import("./build/server.js");',
          '}',
        ].join("\n"), "utf-8");
      }
    }

    const targetDir = existsSync(correctDir) ? correctDir : myRoot;

    // 2. Update installed_plugins.json → point to correct version dir
    //    Skip if not present (e.g. CI / non-Claude-Code environments)
    const ipPath = resolve(homedir(), ".claude", "plugins", "installed_plugins.json");
    if (existsSync(ipPath)) {
      const ip = JSON.parse(readFileSync(ipPath, "utf-8"));
      for (const [key, entries] of Object.entries(ip.plugins || {})) {
        if (!key.toLowerCase().includes("context-mode")) continue;
        for (const entry of entries) {
          entry.installPath = targetDir;
          entry.version = myVersion;
          entry.lastUpdated = new Date().toISOString();
        }
      }
      writeFileSync(ipPath, JSON.stringify(ip, null, 2) + "\n", "utf-8");
    }

    // 3. Update hook path + matcher in settings.json
    const settingsPath = resolve(homedir(), ".claude", "settings.json");
    try {
      const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
      const hooks = settings.hooks?.PreToolUse;
      if (Array.isArray(hooks)) {
        let changed = false;
        for (const entry of hooks) {
          // Fix deprecated Task-only matcher → Agent|Task
          if (entry.matcher && entry.matcher.includes("Task") && !entry.matcher.includes("Agent")) {
            entry.matcher = entry.matcher.replace("Task", "Agent|Task");
            changed = true;
          }
          for (const h of (entry.hooks || [])) {
            if (h.command?.includes("pretooluse.mjs") && !h.command.includes(targetDir)) {
              h.command = "node " + resolve(targetDir, "hooks", "pretooluse.mjs");
              changed = true;
            }
          }
        }
        if (changed) writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf-8");
      }
    } catch { /* skip settings update */ }

    // 4. Nuke stale version dirs (keep only targetDir and current running dir)
    try {
      const keepDirs = new Set([basename(targetDir), myDirName]);
      for (const d of readdirSync(cacheParent)) {
        if (!keepDirs.has(d)) {
          try { rmSync(resolve(cacheParent, d), { recursive: true, force: true }); } catch { /* skip */ }
        }
      }
    } catch { /* skip */ }

    writeFileSync(marker, Date.now().toString(), "utf-8");
  }
} catch { /* best effort — don't block hook */ }

// ─── Init security from compiled build ───
const __hookDir = dirname(fileURLToPath(import.meta.url));
await initSecurity(resolve(__hookDir, "..", "build"));

// ─── Read stdin ───
const raw = await readStdin();
const input = JSON.parse(raw);
const tool = input.tool_name ?? "";
const toolInput = input.tool_input ?? {};

// ─── Route and format response ───
const decision = routePreToolUse(tool, toolInput, process.env.CLAUDE_PROJECT_DIR);
const response = formatDecision("claude-code", decision);
if (response !== null) {
  process.stdout.write(JSON.stringify(response) + "\n");
}
