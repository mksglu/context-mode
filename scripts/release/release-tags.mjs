// scripts/release/release-tags.mjs — which v2 releases are tagged on the remote (DEVIATIONS D-FU-RF-1),
// and the release version format (D-RN-TAG-1).
// A "tagged release" is an annotated tag v<major>.<minor>.<patch> with major >= 2 that is pushed to the
// remote. A release or release-staging commit with no such tag is a rehearsal. v1 tags (v0.x, v1.x) and
// lightweight tags are not releases. With { prerelease: true } a v<x.y.z>-<pre> tag counts too (release-next).
// Plain string ops, no regex (TECH-SPEC §11).
import { LS_REMOTE_FIELD_SEP } from "../../src/core/contracts/constants.ts";

const TAG_REF_PREFIX = "refs/tags/";
const PEELED_SUFFIX = "^{}";
const TAG_PREFIX = "v";
const FIRST_RELEASE_MAJOR = 2;
const CORE_PARTS = 3;
const PART_SEP = ".";
const PRE_SEP = "-";
const DIGITS = "0123456789";
const PRE_CHARS = DIGITS + "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-";

const allIn = (s, chars) => [...s].every((c) => chars.includes(c));

// "x.y.z" or "x.y.z-<pre>" (semver 2.0.0 §2, §9; no "+build") -> { core: [x, y, z], pre: [ids] | null }, else null.
// A prerelease identifier is non-empty [0-9A-Za-z-]; a numeric one has no leading zero.
export function parseReleaseVersion(text) {
  if (typeof text !== "string") return null;
  const dash = text.indexOf(PRE_SEP);
  const core = (dash < 0 ? text : text.slice(0, dash)).split(PART_SEP);
  if (core.length !== CORE_PARTS || !core.every((p) => p.length > 0 && allIn(p, DIGITS))) return null;
  if (dash < 0) return { core: core.map(Number), pre: null };
  const pre = text.slice(dash + 1).split(PART_SEP);
  for (const id of pre) {
    if (id.length === 0 || !allIn(id, PRE_CHARS)) return null;
    if (id.length > 1 && id[0] === "0" && allIn(id, DIGITS)) return null;
  }
  return { core: core.map(Number), pre };
}

export const isReleaseVersion = (text) => parseReleaseVersion(text) !== null;
export const isPrerelease = (text) => parseReleaseVersion(text)?.pre != null;

// Semver precedence (§11): core numbers, then a version without prerelease ranks above one with it;
// prerelease ids compare numeric < alphanumeric, numbers by value, text by code unit, fewer ids lower.
function compareIds(a, b) {
  const an = allIn(a, DIGITS);
  const bn = allIn(b, DIGITS);
  if (an && bn) return Number(a) - Number(b);
  if (an !== bn) return an ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

export function compareReleaseVersions(a, b) {
  for (let i = 0; i < CORE_PARTS; i++) if (a.core[i] !== b.core[i]) return a.core[i] - b.core[i];
  if (a.pre === null || b.pre === null) return (a.pre === null ? 1 : 0) - (b.pre === null ? 1 : 0);
  for (let i = 0; i < Math.min(a.pre.length, b.pre.length); i++) {
    const c = compareIds(a.pre[i], b.pre[i]);
    if (c !== 0) return c;
  }
  return a.pre.length - b.pre.length;
}

// "v<version>" with major >= 2 -> the parsed version; prerelease only when allowed.
export function parseReleaseTag(name, { prerelease = false } = {}) {
  if (typeof name !== "string" || !name.startsWith(TAG_PREFIX)) return null;
  const v = parseReleaseVersion(name.slice(TAG_PREFIX.length));
  if (!v || v.core[0] < FIRST_RELEASE_MAJOR) return null;
  if (v.pre !== null && !prerelease) return null;
  return v;
}

function lines(lsRemoteOutput) {
  return lsRemoteOutput.split("\n").map((line) => line.split(LS_REMOTE_FIELD_SEP)).filter(([, ref]) => ref && ref.startsWith(TAG_REF_PREFIX));
}

// The commit a tag names in `git ls-remote --tags` output: the peeled line of an annotated tag, else the
// plain line of a lightweight tag; "" when the tag is not there.
export function tagCommit(lsRemoteOutput, tag) {
  const all = lines(lsRemoteOutput);
  const peeled = all.find(([, ref]) => ref === TAG_REF_PREFIX + tag + PEELED_SUFFIX);
  if (peeled) return peeled[0];
  const plain = all.find(([, ref]) => ref === TAG_REF_PREFIX + tag);
  return plain ? plain[0] : "";
}

// `git ls-remote --tags <remote>` output -> [{ tag, commit }] newest version first.
// An annotated tag has a second, peeled line "<commit>\trefs/tags/<tag>^{}"; a lightweight tag has none.
export function parseTaggedReleases(lsRemoteOutput, { prerelease = false } = {}) {
  const out = [];
  for (const [commit, ref] of lines(lsRemoteOutput)) {
    if (!ref.endsWith(PEELED_SUFFIX)) continue;
    const tag = ref.slice(TAG_REF_PREFIX.length, -PEELED_SUFFIX.length);
    const version = parseReleaseTag(tag, { prerelease });
    if (version) out.push({ tag, commit, version });
  }
  out.sort((a, b) => compareReleaseVersions(b.version, a.version));
  return out.map(({ tag, commit }) => ({ tag, commit }));
}
