// compact-hard oracle. The reply must end with a line "ANSWER: <value>". The value is the text after the
// prefix on the LAST line that starts with it, trimmed (and with one pair of surrounding backticks removed,
// a Markdown habit, not a content change). Compare with === against the fixture value. No regex.
export const PREFIX = "ANSWER:";

export function parseAnswer(text) {
  const lines = String(text ?? "").split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    let line = lines[i].trim();
    if (line.startsWith("**") && line.endsWith("**") && line.length > 4) line = line.slice(2, -2).trim();
    if (!line.startsWith(PREFIX)) continue;
    let v = line.slice(PREFIX.length).trim();
    if (v.length >= 2 && v.startsWith("`") && v.endsWith("`")) v = v.slice(1, -1).trim();
    return v;
  }
  return null;
}

export function isCorrect(text, expected) {
  return parseAnswer(text) === expected;
}
