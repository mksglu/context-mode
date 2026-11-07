// D-DU-DENY-1: the Read (or one-file shell dump) deny over OUTPUT_CAP, impl/08 §6.1 step 6.
// One line from src/prompt/hooks/read-deny.md (inlined by build/build.mjs, lint-covered by build/prompt-lint.mjs):
// the exact ctx_execute call for this file. A ranged Read stays allowed (decide.ts); the text no longer lists it.
import { READ_DENY_RANGE_TEMPLATE, READ_DENY_TEMPLATE } from "../../prompt/_generated.ts";
import { prefixToolNames } from "../contracts/constants.ts";

export { READ_DENY_RANGE_TEMPLATE, READ_DENY_TEMPLATE };
const SIZE = "{size}";
const PATH = "{path}";

/** Size first, path last: the path is never re-scanned for a placeholder. */
/** D-HL-NAMES-1: tool names take the host prefix before the path goes in, so the path is never rewritten. */
export function READ_DENY_MESSAGE(path: string, size: number | string, prefix = ""): string {
  return prefixToolNames(READ_DENY_TEMPLATE, prefix).split(SIZE).join(String(size)).split(PATH).join(path);
}

/** D-R48-DENY-ROUTE-1 (#1326): a file ctx_execute(file=) cannot open (outside the project) gets the route that works
 *  for it: the host's own ranged read, or a bounded sed range, both of which the hooks always allow. */
export function READ_DENY_RANGE_MESSAGE(path: string, size: number | string): string {
  return READ_DENY_RANGE_TEMPLATE.split(SIZE).join(String(size)).split(PATH).join(path);
}
