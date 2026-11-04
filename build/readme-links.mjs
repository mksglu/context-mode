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

// D-README-LINKS-2 (owner 2026-11-02: "bu kadar link olmasin"): the README carries at most README_MAX_LINKS links a reader
// clicks to leave the page, and each docs link goes to the published guides on contextmode.ai, so none points to docs/*.md.
// D-README-DWELL-1 (owner 2026-11-03: "use case lerde linkler vardi ... o linklere tiklayip daha da derine gidebilirdi"):
// 30 -> 80. The 20 use-case rows link their bench case again, and each section ends with one next step.
export const README_MAX_LINKS = 91; // D-README-HOW-2: one source link per How it works step (80 -> 90); D-UNIFIED-MEMORY-1: the Gateway Memory link in the search step (90 -> 91)

/** Links a reader clicks, in order: markdown [text](target) and <a href="target">. Image links (a badge, a figure, a
 * screenshot that opens its full size) and the images themselves stay out: the reader clicks those to see the image. */
export function readmeLinks(text) {
  const out = [];
  let i = 0;
  while ((i = text.indexOf("](", i)) !== -1) {
    const end = text.indexOf(")", i + 2);
    if (end === -1) break;
    const open = text.lastIndexOf("[", i);
    const image = text[i - 1] === ")" || (open > 0 && text[open - 1] === "!");
    if (!image) out.push(text.slice(i + 2, end));
    i = end;
  }
  const key = '<a href="';
  let j = 0;
  while ((j = text.indexOf(key, j)) !== -1) {
    const start = j + key.length;
    const end = text.indexOf('"', start);
    if (end === -1) break;
    const body = text.slice(text.indexOf(">", end) + 1).trimStart();
    if (!body.startsWith("<img") && !body.startsWith("<picture")) out.push(text.slice(start, end));
    j = end;
  }
  return out;
}

/** The links that leave the page: readmeLinks minus the #anchors of the page itself. */
export function outboundLinks(text) {
  return readmeLinks(text).filter((t) => !t.startsWith("#"));
}

/** Links to a repo docs page: any target under docs/ outside the README asset folder. */
export function repoDocLinks(text) {
  return readmeLinks(text).filter((t) => {
    const p = localPath(t);
    return p.startsWith("docs/") && !p.startsWith(README_ASSET_DIR + "/");
  });
}
