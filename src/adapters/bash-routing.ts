/** Remove quoted arguments and heredoc bodies before checking shell commands. */
export function stripQuotedContent(cmd: string): string {
  return cmd
    .replace(/<<-?\s*["']?(\w+)["']?[\s\S]*?\n\s*\1/g, "")
    .replace(/'[^']*'/g, "''")
    .replace(/"[^"]*"/g, '""');
}

/** Allow curl/wget only when their response body and progress stay out of tool output. */
export function isSafeCurlWget(segment: string): boolean {
  const s = segment.trim();
  const isCurl = /\bcurl\b/i.test(s);
  const isWget = /\bwget\b/i.test(s);
  if (!isCurl && !isWget) return true;

  const hasFileOutput = isCurl
    ? /\s(-o|--output)\s/.test(s) || /\s>\s*/.test(s) || /\s>>\s*/.test(s)
    : /\s(-O|--output-document)\s/.test(s) ||
      /\s>\s*/.test(s) ||
      /\s>>\s*/.test(s);
  if (!hasFileOutput) return false;

  if (isCurl && /\s(-o|--output)\s+(-|\/dev\/stdout)(\s|$)/.test(s))
    return false;
  if (isWget && /\s(-O|--output-document)\s+(-|\/dev\/stdout)(\s|$)/.test(s))
    return false;

  if (/\s(-v|--verbose|--trace)\b/.test(s)) return false;

  const isSilent = isCurl
    ? /\s-[a-zA-Z]*s|--silent/.test(s)
    : /\s-[a-zA-Z]*q|--quiet/.test(s);
  return isSilent;
}
