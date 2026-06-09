#!/usr/bin/env node
import "../suppress-stderr.mjs";
/**
 * Qoder Stop hook for context-mode.
 * Fires when agent completes response.
 */

import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readStdin, parseStdin } from "../session-helpers.mjs";

const __hookDir = dirname(fileURLToPath(import.meta.url));

const raw = await readStdin();
const input = parseStdin(raw);

// Stop hook: passthrough — context-mode uses Stop for session tracking only.
process.exit(0);
