/**
 * Return a UTF-16-code-unit prefix without splitting surrogate pairs.
 *
 * Hook files run directly from marketplace/plugin installs, so keep this tiny
 * helper in hooks/ instead of depending on build/ artifacts.
 */
export function charSafePrefix(str, maxChars) {
  if (maxChars <= 0) return "";
  if (str.length <= maxChars) return str;

  let end = maxChars;
  const code = str.charCodeAt(end - 1);
  if (code >= 0xd800 && code <= 0xdbff) end -= 1;
  return str.slice(0, end);
}
