import { resolveSessionDbPath } from "../../session/db.js";
import {
  getLifetimeStats,
  getConversationStats,
  categoryLabels,
} from "../../session/analytics.js";
import { OpenCodeAdapter } from "./index.js";
import fs from "fs";

// ponytail: loadDatabase factory that works in both Bun (TUI) and Node (MCP)
function makeDatabaseLoader() {
  if (typeof (globalThis as any).Bun !== "undefined") {
    return () => {
      const { Database } = require("bun:sqlite");
      return Database;
    };
  }
  return undefined;
}

const BAR_W = 20;
const CAT_W = 14;
const MAX_CATS = 4;
const TOKENS_PER_EVENT = 256;
const USD_PER_TOKEN = 3 / 1_000_000;

// Override for categories with no label or unclear label in categoryLabels
const LABEL_OVERRIDES: Record<string, string> = {
  cost: "API Cost",
};

function bar(ratio: number): string {
  const filled = Math.round(Math.min(1, Math.max(0, ratio)) * BAR_W);
  return "█".repeat(filled) + "░".repeat(BAR_W - filled);
}

function fmtUsd(tokens: number): string {
  const usd = tokens * USD_PER_TOKEN;
  if (usd < 0.01) return "$0.00";
  return `$${usd.toFixed(2)}`;
}

function catLines(cats: Array<{ category: string; n: number }>, maxN: number): string[] {
  return cats.slice(0, MAX_CATS).map(({ category, n }) => {
    const raw = LABEL_OVERRIDES[category] ?? categoryLabels[category] ?? category;
    const label = raw.padEnd(CAT_W).slice(0, CAT_W);
    const count = String(n).padStart(4);
    // ponytail: DialogAlert strips \x1b but leaves [0m, so use plain text
    return `  ${label} [${bar(maxN > 0 ? n / maxN : 0)}]${count}`;
  });
}

// ponytail: compact stats display — visual bars + savings summary
// @ts-ignore
export const tui = async (api: any) => {
  api.keymap.registerLayer({
    commands: [
      {
        name: "context-mode.stats",
        title: "Context Stats",
        desc: "Display context-mode usage statistics",
        category: "Context",
        namespace: "palette",
        slashName: "ctx",
        slashAliases: ["ctx-stats", "context-mode"],
        run: async () => {
          let text = "";
          try {
            const projectDir = process.env.OPENCODE_PROJECT_DIR || process.cwd();
            const adapter = new OpenCodeAdapter("opencode");
            const sessionsDir = adapter.getSessionDir();
            const sessionDbPath = resolveSessionDbPath({ projectDir, sessionsDir });

            const loadDb = makeDatabaseLoader();
            const lines: string[] = [];

            // ── CURRENT SESSION ───────────────────────────────────────────
            lines.push("Current Session");
            lines.push("───────────────");

            let currentSessionId: string | null = process.env.OPENCODE_SESSION_ID || null;

            if (!currentSessionId && fs.existsSync(sessionDbPath)) {
              try {
                if (typeof (globalThis as any).Bun !== "undefined") {
                  const { Database } = await import("bun:sqlite" as any);
                  const db = new Database(sessionDbPath, { readonly: true });
                  try {
                    const row = db.prepare(
                      "SELECT session_id FROM session_events ORDER BY created_at DESC LIMIT 1"
                    ).get() as { session_id: string } | undefined;
                    currentSessionId = row?.session_id ?? null;
                  } finally { db.close(); }
                } else {
                  const mod = await import("better-sqlite3");
                  const db = new (mod.default as any)(sessionDbPath, { readonly: true });
                  try {
                    const row = (db.prepare(
                      "SELECT session_id FROM session_events ORDER BY created_at DESC LIMIT 1"
                    ).get()) as { session_id: string } | undefined;
                    currentSessionId = row?.session_id ?? null;
                  } finally { db.close(); }
                }
              } catch { /* ignore */ }
            }

            if (currentSessionId) {
              const conv = getConversationStats({
                sessionId: currentSessionId,
                sessionsDir,
                loadDatabase: loadDb,
              });

              const sesTokens = conv.events * TOKENS_PER_EVENT;
              lines.push(`Events: ${conv.events}`);
              lines.push(`Saved:  ${fmtUsd(sesTokens)}`);

              if (conv.byCategory && conv.byCategory.length > 0) {
                lines.push("");
                const maxN = conv.byCategory[0]?.count ?? 1;
                const mapped = conv.byCategory.map((r: any) => ({ category: r.category, n: r.count }));
                lines.push(...catLines(mapped, maxN));
              }
            } else {
              lines.push("No events in this session yet.");
            }

            lines.push("");

            // ── ALL TIME ──────────────────────────────────────────────────
            lines.push("All Time");
            lines.push("────────");

            const lifetime = getLifetimeStats({ sessionsDir, loadDatabase: loadDb });
            const ltTokens = lifetime.totalEvents * TOKENS_PER_EVENT;

            lines.push(`Events: ${lifetime.totalEvents}`);
            lines.push(`Saved:  ${fmtUsd(ltTokens)}`);

            const ltCats = Object.entries(lifetime.categoryCounts ?? {})
              .map(([category, n]) => ({ category, n }))
              .sort((a, b) => b.n - a.n);

            if (ltCats.length > 0) {
              lines.push("");
              const maxN = ltCats[0].n;
              lines.push(...catLines(ltCats, maxN));
            }

            text = lines.join("\n");
          } catch (err: any) {
            text = "Error loading stats: " + err.message;
          }

          api.ui.dialog.replace(() =>
            api.ui.DialogAlert({
              title: "Context Mode Stats",
              message: text,
            })
          );
        },
      },
    ],
  });
};

export default { id: "context-mode-tui", tui };
