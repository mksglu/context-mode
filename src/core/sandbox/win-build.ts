// #782 (v1 src/executor.ts rewriteWindowsBuildTools, 1ab5d2e-era fix; DEVIATIONS D-M7-CLN-4).
// On Windows the shell runtime is Git Bash. A bare `mvn` runs Maven's POSIX script, whose mingw branch leaves
// CLASSWORLDS_JAR as a POSIX path that native java.exe cannot open. `mvn.cmd` is the native launcher.
// Only a `mvn` token that starts a command is rewritten; `mvnw`, `mvnd`, `mymvn`, `./mvnw`, `mvn.cmd` stay.
// Global MSYS path-conversion env is NOT touched (native git needs it, #826/#791).
const SEPARATORS = ";&|(\n";
const BLANKS = " \t\n";
const MVN = "mvn";
const MVN_CMD = "mvn.cmd";

export function rewriteWindowsBuildTools(code: string, platform: NodeJS.Platform): string {
  if (platform !== "win32") return code;
  let out = "";
  let atStart = true;
  let i = 0;
  while (i < code.length) {
    const ch = code.charAt(i);
    if (atStart && (ch === " " || ch === "\t")) { out += ch; i++; continue; }
    if (atStart && code.startsWith(MVN, i)) {
      const after = code.charAt(i + MVN.length);
      if (after === "" || BLANKS.includes(after)) {
        out += MVN_CMD;
        i += MVN.length;
        atStart = false;
        continue;
      }
    }
    out += ch;
    atStart = SEPARATORS.includes(ch);
    i++;
  }
  return out;
}
