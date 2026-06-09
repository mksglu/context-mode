#!/usr/bin/env node
import "../suppress-stderr.mjs";
/**
 * Qoder UserPromptSubmit hook for context-mode.
 * Injects routing context when user submits a prompt.
 */

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readStdin, parseStdin } from "../session-helpers.mjs";
import { initSecurity } from "../core/routing.mjs";

const __hookDir = dirname(fileURLToPath(import.meta.url));
await initSecurity(resolve(__hookDir, "..", "..", "build"));

const raw = await readStdin();
// parseStdin consumes stdin to prevent pipe blocking; result intentionally unused.
parseStdin(raw);

// UserPromptSubmit: passthrough for now.
// Future: inject routing instructions on first prompt.
process.exit(0);
