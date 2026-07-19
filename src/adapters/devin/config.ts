/**
 * adapters/devin/config — Thin re-exports from DevinAdapter.
 *
 * This module exists for backward compatibility. All logic lives in the
 * adapter class (index.ts). New code should use getAdapter() from detect.ts.
 */

export { DevinAdapter } from "./index.js";
export { HOOK_TYPES, HOOK_SCRIPTS, ROUTING_INSTRUCTIONS_PATH, PRE_TOOL_USE_MATCHER_PATTERN } from "./hooks.js";
