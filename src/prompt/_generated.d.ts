// Types for the module build/build.mjs writes as src/prompt/_generated.ts and deletes after the
// build (impl/13 §2.2 step 3). It lets `tsc` check src/ when the generated file is absent;
// esbuild resolves the real .ts during build.mjs. No values here (DEVIATIONS D-M0-F1-2).
import type { TOOL_ORDER } from "../core/contracts/constants.js";

export declare const INSTRUCTIONS: string;
export declare const TOOL_DESCRIPTIONS: Readonly<Record<(typeof TOOL_ORDER)[number], string>>;
export declare const READ_DENY_TEMPLATE: string;
