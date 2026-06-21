#!/usr/bin/env node
/**
 * SessionStart hook for context-mode
 *
 * Provides the agent with XML-structured "Rules of Engagement"
 * at the beginning of each session. Injects session knowledge on
 * both startup and compact to maintain continuity.
 *
 * Session Lifecycle Rules:
 * - "startup"  → Fresh session. Inject previous session knowledge. Cleanup old data.
 * - "compact"  → Auto-compact triggered. Inject resume snapshot + stats.
 * - "resume"   → User invoked --continue, --resume, or /resume. CC sends the
 *                ACTIVE session_id; for /resume this is typically a *fresh*
 *                id, so live events miss → fall back to snapshot (#413).
 * - "clear"    → User cleared context. No resume.
 *
 * Crash-resilience: wrapped via runHook (#414) — all module loads happen
 * dynamically inside the wrapper so a missing/poisoned dep can never hard-fail
 * the hook. Errors land in ~/.claude/context-mode/hook-errors.log.
 */

import { runHook } from "./run-hook.mjs";

await runHook(async () => {
  const { createRoutingBlock } = await import("./routing-block.mjs");
  const { createToolNamer } = await import("./core/tool-naming.mjs");
  const { detectPlatformFromEnv } = await import("./core/platform-detect.mjs");
  const { buildAutoInjection } = await import("./auto-injection.mjs");
  const {
    readStdin,
    parseStdin,
    getSessionId,
    getInputProjectDir,
    getSessionDBPath,
    getSessionEventsPath,
    getCleanupFlagPath,
    resolveConfigDir,
  } = await import("./session-helpers.mjs");
  const { writeSessionEventsFile, buildSessionDirective, getSessionEvents } = await import(
    "./session-directive.mjs"
  );
  const { createSessionLoaders, attributeAndInsertEvents } = await import("./session-loaders.mjs");
  const { join, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const { readFileSync, unlinkSync, readdirSync, rmSync, lstatSync, realpathSync, symlinkSync } = await import("node:fs");

  const detectedPlatform = detectPlatformFromEnv();
  const toolNamer = createToolNamer(detectedPlatform);
  const ROUTING_BLOCK = createRoutingBlock(toolNamer);

  // Resolve absolute path for imports (fileURLToPath for Windows compat)
  const HOOK_DIR = dirname(fileURLToPath(import.meta.url));
  const { loadSessionDB, loadProjectAttribution, loadExtract } = createSessionLoaders(HOOK_DIR);

  // Emit a `session_start` canonical event at the boundary of each session
  // lifecycle transition (startup / resume / compact). The platform's insight
  // engine joins on `category='session_start'` to compute per-session
  // aggregates (~60 of 180 patterns depend on this anchor row). Bridge
  // forwards via attributeAndInsertEvents which also stamps the rollup
  // snapshot — safe for the FIRST event of a fresh session.
  async function emitSessionStartLifecycle(db, sessionId, source, projectDir, input) {
    try {
      const { resolveProjectAttributions } = await loadProjectAttribution();
      const lifecycleEvent = {
        type: "session_start",
        category: "session_start",
        data: JSON.stringify({
          source,
          project_dir: projectDir,
          started_at: Math.floor(Date.now() / 1000),
        }),
        priority: 1,
      };

      // PRD #4 — emit session_settings_snapshot alongside lifecycle when
      // the SessionStart envelope carries any of mcp_servers / model /
      // permission_mode. Best-effort: missing fields → no snapshot.
      const eventsToEmit = [lifecycleEvent];
      try {
        const extract = await loadExtract();
        if (typeof extract.extractSessionSettings === "function") {
          eventsToEmit.push(...extract.extractSessionSettings(input));
        }
      } catch {
        // settings snapshot is opportunistic — never block lifecycle on it
      }

      attributeAndInsertEvents(
        db,
        sessionId,
        eventsToEmit,
        input,
        projectDir,
        "SessionStart",
        resolveProjectAttributions,
      );
    } catch {
      // Best-effort — lifecycle emission failure MUST NOT block session start.
    }
  }

  // Self-heal a partial plugin cache install before anything else
  // touches the cache dir. The Algo-D4 boot gate and the #604
  // normalize-hooks ratchet both fire from start.mjs, which is one of
  // the files that may be missing in the failure mode; sessionstart.mjs
  // fires from CC's hooks.json wiring regardless of MCP boot status, so
  // it is the reliably-available entry point. See
  // hooks/heal-partial-install.mjs for the full failure-mode description.
  try {
    const { healPartialInstallFromMarketplace } = await import("./heal-partial-install.mjs");
    healPartialInstallFromMarketplace();
  } catch { /* best effort, never block session start */ }

  // Issue #710 — Layer 2: self-heal Claude Code's per-session shell snapshots.
  //
  // Claude Code `source`s ~/.claude/shell-snapshots/snapshot-*.sh before every
  // Bash tool call (refs/platforms/claude-code/src/utils/bash/ShellSnapshot.ts:269-336,
  // sourced at bashProvider.ts:166). The snapshot bakes an `export PATH='…'`
  // line with the context-mode `bin/` of the version active at session boot.
  // After /ctx-upgrade deletes the old cache dir, the snapshot still points
  // at it — every Bash call fails with "Plugin directory does not exist"
  // until the session restarts.
  //
  // Layer 1 (cli.ts /ctx-upgrade) rewrites the active session's snapshot
  // mid-upgrade so the in-process session never sees the broken state.
  // Layer 2 (this) catches sessions that started after /ctx-upgrade but
  // whose snapshots somehow missed the rewrite (parallel sessions, killed
  // /ctx-upgrade run, manual cache surgery). Resolves currentVersion from
  // the plugin's own manifest — no env-var dependency, immune to PATH bugs.
  // Best-effort, never blocks session start.
  try {
    const { selfHealShellSnapshots } = await import("./cache-heal-utils.mjs");
    const { resolve } = await import("node:path");
    const { resolveConfigDir } = await import("./session-helpers.mjs");

    // Read the version this MCP boot is running under. PLUGIN_ROOT
    // points at ~/.claude/plugins/cache/context-mode/context-mode/<vX>/.
    let currentVersion = null;
    try {
      const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT
        ?? resolve(HOOK_DIR, "..");
      const manifestPath = resolve(pluginRoot, ".claude-plugin", "plugin.json");
      const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
      if (typeof manifest?.version === "string" && manifest.version) {
        currentVersion = manifest.version;
      }
    } catch { /* missing/malformed manifest — skip self-heal */ }

    if (currentVersion) {
      const snapshotsDir = resolve(resolveConfigDir(), "shell-snapshots");
      const pluginCacheRoot = resolve(
        resolveConfigDir(),
        "plugins",
        "cache",
        "context-mode",
        "context-mode",
      );
      selfHealShellSnapshots({
        snapshotsDir,
        pluginCacheRoot,
        currentVersion,
      });
    }
  } catch { /* best effort, never block session start */ }

  let additionalContext = ROUTING_BLOCK;

  // ─── #558: surface security init failure as agent-facing context ───
  //
  // Pre-558 the only signal of a fail-open security regression was a
  // stderr WARNING line (suppressed/discarded by most adapters). The
  // SessionStart additionalContext block is the in-band channel — the
  // agent reads it, the user sees it. Idempotent by virtue of
  // SessionStart's once-per-session lifecycle.
  try {
    const { initSecurity, isSecurityInitFailed, buildSecurityWarningContext } =
      await import("./core/routing.mjs");
    const { resolve: _resolve } = await import("node:path");
    await initSecurity(_resolve(HOOK_DIR, "..", "build"));
    if (isSecurityInitFailed()) {
      const warning = buildSecurityWarningContext();
      if (warning) additionalContext = warning + "\n\n" + additionalContext;
    }
  } catch { /* security probe is best-effort — never block session start */ }

  try {
    const raw = await readStdin();
    const input = parseStdin(raw);
    const source = input.source ?? "startup";

    if (source === "compact") {
      // Session was compacted — write events to file for auto-indexing, inject directive only
      const { SessionDB } = await loadSessionDB();
      const dbPath = getSessionDBPath();
      const db = new SessionDB({ dbPath });
      const sessionId = getSessionId(input);
      const resume = db.getResume(sessionId);

      if (resume && !resume.consumed) {
        db.markResumeConsumed(sessionId);
      }

      const events = getSessionEvents(db, sessionId);
      if (events.length > 0) {
        const eventMeta = writeSessionEventsFile(events, getSessionEventsPath());
        additionalContext += buildSessionDirective("compact", eventMeta, toolNamer);

        // Auto-inject behavioral state on compaction (role, decisions, skills, intent)
        const autoInjection = buildAutoInjection(events);
        if (autoInjection) {
          additionalContext += "\n\n" + autoInjection;
        }

        // D2 PRD Phase 6.2: emit snapshot-consumed with bytes_returned=snapshot.length.
        // The resumed snapshot bytes ARE returned to the model — that's the whole
        // point of resume — so account them on bytes_returned, not bytes_avoided.
        // v1.0.160: route through wire — resume metric on the platform reads
        // category='session-resume' rows. Both snapshot-consumed (bytes
        // returned) and resume_completed land here so the dashboard sees
        // every resume boundary.
        try {
          const resumeRow = (resume && resume.snapshot)
            ? resume
            : (db.getResume?.(sessionId) ?? null);
          const snapshotBytes = resumeRow?.snapshot?.length ?? 0;
          const { resolveProjectAttributions } = await loadProjectAttribution();
          const projectDirResumeMeta = getInputProjectDir(input);

          await attributeAndInsertEvents(
            db,
            sessionId,
            [{
              type: "snapshot-consumed",
              category: "session-resume",
              data: `Session resumed from ${source}. Snapshot ${snapshotBytes} bytes injected.`,
              priority: 1,
              bytes_returned: snapshotBytes,
            }, {
              type: "resume_completed",
              category: "session-resume",
              data: `Session resumed from ${source}. Prior events loaded.`,
              priority: 1,
            }],
            input,
            projectDirResumeMeta,
            "SessionStart",
            resolveProjectAttributions,
          );
        } catch { /* best-effort */ }
      }

      // Emit lifecycle anchor BEFORE close — engine joins on
      // category='session_start' to compute per-session aggregates.
      // Cross-platform projectDir via getInputProjectDir (covers cursor's
      // workspace_roots[], codex/gemini/qwen's *_PROJECT_DIR env vars,
      // CC's CLAUDE_PROJECT_DIR, falls back to input.cwd and process.cwd).
      const projectDirCompact = getInputProjectDir(input);
      await emitSessionStartLifecycle(db, sessionId, "compact", projectDirCompact, input);
      db.close();
    } else if (source === "resume") {
      // User invoked --continue, --resume, or /resume — clear cleanup flag so
      // startup doesn't wipe data on the next fresh boot.
      try { unlinkSync(getCleanupFlagPath()); } catch { /* no flag */ }

      const { SessionDB } = await loadSessionDB();
      const dbPath = getSessionDBPath();
      const db = new SessionDB({ dbPath });

      // 1) Try live events for the resumed session. Filter strictly to the
      //    incoming session_id — falling back to getLatestSessionEvents(db)
      //    leaks events from any other session whose session_meta.started_at
      //    is more recent (cross-worktree bleed observed in the wild).
      const sessionId = getSessionId(input);
      const events = sessionId ? getSessionEvents(db, sessionId) : [];
      if (events.length > 0) {
        const eventMeta = writeSessionEventsFile(events, getSessionEventsPath());
        additionalContext += buildSessionDirective("resume", eventMeta, toolNamer);
      } else if (sessionId) {
        // 2) Snapshot fallback (#413). /resume hands us a *new* active session
        //    id whose live event table is empty; the prior conversation lives
        //    in `session_resume.snapshot`. Mirrors the OpenCode/OpenClaw resume
        //    injection path (opencode-plugin.ts:454). claimLatestUnconsumedResume
        //    excludes the current id, so we surface the latest unconsumed
        //    snapshot from any prior session in this project.
        const row = db.claimLatestUnconsumedResume(sessionId);
        if (row?.snapshot) {
          additionalContext += "\n\n" + row.snapshot;
        }
      }

      const projectDirResume = getInputProjectDir(input);
      if (sessionId) {
        await emitSessionStartLifecycle(db, sessionId, "resume", projectDirResume, input);
      }
      db.close();
    } else if (source === "startup") {
      // Fresh session (no --continue) — clean slate, capture CLAUDE.md rules.
      const { SessionDB } = await loadSessionDB();
      const dbPath = getSessionDBPath();
      const db = new SessionDB({ dbPath });
      try { unlinkSync(getSessionEventsPath()); } catch { /* no stale file */ }

      // Detect true fresh start vs --continue (which fires startup→resume).
      // If cleanup flag exists from a PREVIOUS startup that was never followed by
      // resume, that was a true fresh start — aggressively wipe all data.
      db.cleanupOldSessions(7);
      // Bug fix: the unconditional DELETE below USED to wipe ALL orphan
      // events (any session_id missing from session_meta). On a power-outage
      // restart this destroyed 1000+ events of real Claude Code work whose
      // UUID session_ids hadn't yet had their session_meta row written
      // (timing window between insertEvent and ensureSession). See
      // tests/session/cleanup-preserves-live-uuid-events.test.ts.
      //
      // Now: protect anything that LOOKS like a real session UUID
      // (4 dashes per RFC 4122 8-4-4-4-12), unless it's already older than
      // the 7-day cleanup horizon. Detection-probe orphans like 'pid-12345'
      // (no UUID shape) are still wiped aggressively — they're noise.
      // Loose 4-dash shape `*-*-*-*-*`. Claude Code session_ids are UUIDs
      // (5 dash-separated segments) and match. `pid-XXXXX` probes have one
      // dash and don't match → wiped aggressively. We deliberately keep
      // this loose so adapters that may eventually share this DB (or reuse
      // this hook with hybrid `claude-code-...`-style IDs across 15
      // platforms) aren't accidentally classified as orphans. The 7-day
      // fallback still wipes truly abandoned UUIDs.
      db.db.exec(`
        DELETE FROM session_events
         WHERE session_id NOT IN (SELECT session_id FROM session_meta)
           AND (
             session_id NOT GLOB '*-*-*-*-*'              -- pid-XXX probes etc.
             OR created_at < datetime('now', '-7 day')    -- truly abandoned UUIDs
           )
      `);

      // Proactively capture CLAUDE.md files — Claude Code loads them as system
      // context at startup, invisible to PostToolUse hooks. We read them from
      // disk so they survive compact/resume via the session events pipeline.
      const sessionId = getSessionId(input);
      // v1.0.160: cross-adapter projectDir resolution (was hardcoded CC env).
      const projectDir = getInputProjectDir(input);
      db.ensureSession(sessionId, projectDir);
      const claudeMdPaths = [
        join(resolveConfigDir(), "CLAUDE.md"),
        join(projectDir, "CLAUDE.md"),
        join(projectDir, ".claude", "CLAUDE.md"),
      ];
      // v1.0.160: collect rule events into a batch and forward through wire.
      // Dashboard's "CLAUDE.md adoption" widget COUNTs category='rule' rows on
      // the platform — without this routing the widget reads 0 no matter how
      // many CLAUDE.md files actually loaded.
      const ruleEvents = [];
      for (const p of claudeMdPaths) {
        try {
          const content = readFileSync(p, "utf-8");
          if (content.trim()) {
            ruleEvents.push({ type: "rule", category: "rule", data: p, priority: 1 });
            ruleEvents.push({ type: "rule_content", category: "rule", data: content, priority: 1 });
          }
        } catch { /* file doesn't exist — skip */ }
      }
      if (ruleEvents.length > 0) {
        try {
          const { resolveProjectAttributions } = await loadProjectAttribution();
          attributeAndInsertEvents(
            db,
            sessionId,
            ruleEvents,
            input,
            projectDir,
            "SessionStart",
            resolveProjectAttributions,
          );
        } catch { /* best-effort — rule capture must never block start */ }
      }

      // Lifecycle anchor for a fresh session — emits BEFORE the CLAUDE.md
      // rule events have been forwarded so the `session_start` row lands
      // as the very first row the platform sees for this session.
      await emitSessionStartLifecycle(db, sessionId, "startup", projectDir, input);

      db.close();

      // Age-gated lazy cleanup of old plugin cache version dirs (#181).
      // Only delete dirs older than 1 hour to avoid breaking active sessions.
      // Use lstatSync (not statSync) so a fresh symlink whose target happens
      // to be old is evaluated against the symlink's own mtime, not the
      // target's — otherwise self-heal hooks that re-create breadcrumb
      // symlinks for previous cache versions would be wiped out and any
      // session pinned to one of those versions would lose its plugin root
      // mid-flight (#644).
      try {
        const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
        if (pluginRoot) {
          const cacheParentMatch = pluginRoot.match(/^(.*[\\/]plugins[\\/]cache[\\/][^\\/]+[\\/][^\\/]+[\\/])/);
          if (cacheParentMatch) {
            const cacheParent = cacheParentMatch[1];
            const myDir = pluginRoot.replace(cacheParent, "").replace(/[\\/]/g, "");
            const ONE_HOUR = 3600000;
            const now = Date.now();
            for (const d of readdirSync(cacheParent)) {
              if (d === myDir) continue;
              const oldDir = join(cacheParent, d);
              try {
                const st = lstatSync(oldDir);
                let danglingBreadcrumb = false;
                if (st.isSymbolicLink()) {
                  try {
                    realpathSync(oldDir);
                  } catch {
                    danglingBreadcrumb = true;
                  }
                }
                if (danglingBreadcrumb || now - st.mtimeMs > ONE_HOUR) {
                  rmSync(oldDir, { recursive: true, force: true });
                  // Leave a breadcrumb symlink (junction on Windows) in the
                  // removed version's place so sessions that loaded hooks
                  // from it before an auto-update keep resolving their
                  // scripts instead of erroring on every hook call until
                  // restart (#814, #807). Also fires when the entry was
                  // itself a stale breadcrumb, re-pointing it at the live
                  // root (a chain of updates would otherwise leave links
                  // targeting intermediate versions that no longer exist).
                  // The fresh mtime makes #644's lstat age gate protect it
                  // for the next hour, and the next sweep refreshes it
                  // again. Same pattern as healCacheMidSession (server.ts)
                  // and postinstall.mjs.
                  try {
                    symlinkSync(pluginRoot, oldDir, process.platform === "win32" ? "junction" : undefined);
                  } catch { /* best effort — plain delete is the pre-#814 behaviour */ }
                }
              } catch {
                // On Windows, a dangling junction can fail before we can read
                // its own mtime. Treat that as a stale breadcrumb and try to
                // repoint it at the live root; failures remain best-effort.
                try {
                  rmSync(oldDir, { recursive: true, force: true });
                  symlinkSync(pluginRoot, oldDir, process.platform === "win32" ? "junction" : undefined);
                } catch { /* skip */ }
              }
            }
          }
        }
      } catch { /* best effort — never block session start */ }
    }
    // "clear" — no reset needed; ctx_purge is the only wipe mechanism
  } catch (err) {
    // Session continuity is best-effort — never block session start
    try {
      const { appendFileSync } = await import("node:fs");
      const { join: pjoin } = await import("node:path");
      const { resolveConfigDir: _resolve } = await import("./session-helpers.mjs");
      appendFileSync(
        pjoin(_resolve(), "context-mode", "sessionstart-debug.log"),
        `[${new Date().toISOString()}] ${err?.message || err}\n${err?.stack || ""}\n`,
      );
    } catch { /* ignore logging failure */ }
  }

  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext,
    },
  }));
});
