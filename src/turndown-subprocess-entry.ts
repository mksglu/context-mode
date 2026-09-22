// Bundle entry for the ctx_fetch_and_index subprocess's HTML→markdown step.
//
// turndown, turndown-plugin-gfm, and @mixmark-io/domino are pure JS but were
// previously loaded at runtime via require.resolve("turndown") against the
// installing machine's node_modules (src/server.ts buildFetchCode). Plugin
// marketplace installs copy the package's shipped files without running
// `npm install`, so node_modules/turndown never exists there and the
// subprocess fails with "Cannot find module 'turndown'" (Windows report:
// rabbitholedotdev/rabbitos#826).
//
// This file is esbuild-bundled (platform=node, format=cjs) into
// turndown-subprocess.bundle.cjs, shipped alongside server.bundle.mjs. The
// subprocess requires that single self-contained file by an absolute path
// derived from the running server's own package root — no node_modules
// lookup needed at runtime.
import TurndownService from "turndown";
// turndown-plugin-gfm ships no types (see ./turndown-plugin-gfm.d.ts).
import { gfm } from "turndown-plugin-gfm";

export { TurndownService, gfm };
