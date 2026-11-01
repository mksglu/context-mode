// D-DU-DENY-1: the Read (or one-file shell dump) deny over OUTPUT_CAP, impl/08 §6.1 step 6.
// One line from src/prompt/hooks/read-deny.md (inlined by build/build.mjs, lint-covered by build/prompt-lint.mjs):
// the exact ctx_execute call for this file. A ranged Read stays allowed (decide.ts); the text no longer lists it.
import { READ_DENY_TEMPLATE } from "../../prompt/_generated.ts";
import { prefixToolNames } from "../contracts/constants.ts";

export { READ_DENY_TEMPLATE };
const SIZE = "{size}";
const PATH = "{path}";

/** Size first, path last: the path is never re-scanned for a placeholder. */
/** D-HL-NAMES-1: tool names take the host prefix before the path goes in, so the path is never rewritten. */
export function READ_DENY_MESSAGE(path: string, size: number | string, prefix = ""): string {
  return prefixToolNames(READ_DENY_TEMPLATE, prefix).split(SIZE).join(String(size)).split(PATH).join(path);
}
