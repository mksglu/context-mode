// D-NPM-README-1: the README that ships in the npm tarball. npmjs.com renders it away from the repo, so every
// relative link and image target must be absolute. The repo README is not changed; only the copy in release-out is.
// D-NPM-README-2: targets point at the release tag v<version>, not at main, so the npm page works before the merge to main.
// Markdown links go to github.com/<repo>/blob/v<version>/, images to raw.githubusercontent.com/<repo>/v<version>/ (the PNGs
// stay out of the tarball). Targets that are already absolute, anchors, mailto: and data: stay. Fenced code stays. No regex:
// plain index scans over one line at a time.
import { isReleaseVersion } from "../scripts/release/release-tags.mjs";
export const REPO_SLUG = "mksglu/context-mode";
export const blobBase = (version) => `https://github.com/${REPO_SLUG}/blob/v${version}/`;
export const rawBase = (version) => `https://raw.githubusercontent.com/${REPO_SLUG}/v${version}/`;

const KEEP_PREFIXES = ["https://", "http://", "#", "mailto:", "data:"];
// [attribute text, kind]: the attribute must follow a space or a tag start.
const HTML_ATTRS = [['src="', "image"], ['srcset="', "image"], ['href="', "link"]];

function isAbsolute(target) {
  return target === "" || KEEP_PREFIXES.some((p) => target.startsWith(p));
}

function absolute(target, kind, version) {
  if (isAbsolute(target)) return target;
  let rest = target;
  while (rest.startsWith("./")) rest = rest.slice(2);
  if (rest.startsWith("/")) rest = rest.slice(1);
  return (kind === "image" ? rawBase(version) : blobBase(version)) + rest;
}

/** Index of the "[" that opens the "]" at closeAt, counting nested brackets; -1 when there is none. */
function openingBracket(line, closeAt) {
  let depth = 1;
  for (let i = closeAt - 1; i >= 0; i--) {
    if (line[i] === "]") depth++;
    else if (line[i] === "[") { depth--; if (depth === 0) return i; }
  }
  return -1;
}

/** Calls map(target, kind) for each `](target)` of one line and returns the line with the results. */
function mapMarkdown(line, map) {
  let out = "";
  let pos = 0;
  for (;;) {
    const at = line.indexOf("](", pos);
    if (at < 0) break;
    const end = line.indexOf(")", at + 2);
    if (end < 0) break;
    const inner = line.slice(at + 2, end);
    const space = inner.indexOf(" "); // `(target "title")`: only the target is mapped
    const target = space < 0 ? inner : inner.slice(0, space);
    const open = openingBracket(line, at);
    const kind = open > 0 && line[open - 1] === "!" ? "image" : "link";
    out += line.slice(pos, at + 2) + map(target, kind) + (space < 0 ? "" : inner.slice(space));
    pos = end;
  }
  return out + line.slice(pos);
}

/** Calls map(value, kind) for each src=, srcset= and href= attribute of one line. */
function mapHtml(line, map) {
  let text = line;
  for (const [attr, kind] of HTML_ATTRS) {
    let out = "";
    let pos = 0;
    for (;;) {
      const at = text.indexOf(attr, pos);
      if (at < 0) break;
      const valueStart = at + attr.length;
      const prev = at === 0 ? " " : text[at - 1];
      const end = text.indexOf('"', valueStart);
      if (end < 0) break;
      if (prev !== " " && prev !== "<" && prev !== "\t") { out += text.slice(pos, valueStart); pos = valueStart; continue; }
      out += text.slice(pos, valueStart) + map(text.slice(valueStart, end), kind);
      pos = end;
    }
    text = out + text.slice(pos);
  }
  return text;
}

function mapTargets(text, map) {
  let fenced = false;
  return text.split("\n").map((line) => {
    if (line.trimStart().startsWith("```")) { fenced = !fenced; return line; }
    return fenced ? line : mapHtml(mapMarkdown(line, map), map);
  }).join("\n");
}

/** README text for the npm tarball: every relative target made absolute, at the tag v<version>. */
export function rewriteReadmeLinks(text, version) {
  if (!isReleaseVersion(version)) throw new Error(`rewriteReadmeLinks needs a release version x.y.z[-pre], got ${String(version)}`);
  return mapTargets(text, (target, kind) => absolute(target, kind, version));
}

/** Every link and image target outside fenced code, in order of the scan (markdown first, then HTML attributes per line). */
export function targetsOf(text) {
  const found = [];
  mapTargets(text, (target) => { found.push(target); return target; });
  return found;
}
