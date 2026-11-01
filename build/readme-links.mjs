// build/readme-links.mjs — D-README-THESIS-1: every relative link and image path in README.md must exist,
// and the README figures must stay small. Literal scans only (no regex): markdown "](target)" and the
// HTML attributes src="...", srcset="..." and href="...".
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

export const README_ASSET_DIR = "docs/assets/readme";
export const README_IMAGES_MAX_BYTES = 2 * 1024 * 1024;

/** Every link or image target in the text, in order of first appearance. */
export function readmeTargets(text) {
  const out = [];
  let i = 0;
  while ((i = text.indexOf("](", i)) !== -1) {
    const end = text.indexOf(")", i + 2);
    if (end === -1) break;
    out.push(text.slice(i + 2, end));
    i = end;
  }
  for (const key of [' src="', ' srcset="', ' href="']) {
    let j = 0;
    while ((j = text.indexOf(key, j)) !== -1) {
      const start = j + key.length;
      const end = text.indexOf('"', start);
      if (end === -1) break;
      out.push(text.slice(start, end));
      j = end;
    }
  }
  return out;
}

function isExternal(target) {
  return target.startsWith("http://") || target.startsWith("https://") || target.startsWith("mailto:") || target.startsWith("#");
}

/** The repo-relative file path of a local target: no title, no #anchor, no ?query, no leading "./". */
export function localPath(target) {
  let p = target.trim();
  for (const cut of [" ", "#", "?"]) {
    const at = p.indexOf(cut);
    if (at !== -1) p = p.slice(0, at);
  }
  return p.startsWith("./") ? p.slice(2) : p;
}

/** Local targets in the text whose file or folder does not exist under root. */
export function missingTargets(text, root) {
  const bad = [];
  for (const t of readmeTargets(text)) {
    if (isExternal(t)) continue;
    const p = localPath(t);
    if (p && !existsSync(path.join(root, p)) && !bad.includes(t)) bad.push(t);
  }
  return bad;
}

/** Total bytes of the PNG files in the README asset folder (the rendered figures). */
export function readmeImageBytes(root) {
  const dir = path.join(root, README_ASSET_DIR);
  if (!existsSync(dir)) return 0;
  let total = 0;
  for (const name of readdirSync(dir)) if (name.endsWith(".png")) total += statSync(path.join(dir, name)).size;
  return total;
}
