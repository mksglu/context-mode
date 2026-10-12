/**
 * adapters/mistral-vibe/config — Thin re-exports from MistralVibeAdapter.
 *
 * This module exists for parity with sibling adapters (kimi, codex, etc.).
 * All logic lives in the adapter class (index.ts). New code should use
 * getAdapter() from detect.ts.
 */

export { MistralVibeAdapter } from "./index.js";
export {
  HOOK_TYPES,
  PRE_TOOL_MATCHER,
  VIBE_HOOK_COMMANDS,
  ROUTING_INSTRUCTIONS_PATH,
} from "./hooks.js";
