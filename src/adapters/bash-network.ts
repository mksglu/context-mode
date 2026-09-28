/**
 * Bash network-flood classifier — the single owner of "does this shell command
 * push raw network payload into the model's context window?".
 *
 * Adapters used to each carry their own copy of the rule. The OMP plugin's copy
 * was a bare `/\bcurl\s/` match, which blocked `curl --version`, `which curl`,
 * and even a `grep` whose *search string* contained the word — none of which
 * transfer a single byte. This module replaces those copies.
 *
 * The rule is about the transfer, not about the program name. Three questions,
 * answered by parsing rather than by matching:
 *
 *   1. **Which program runs?** Only the word in command position invokes
 *      anything. `printf curl URL` prints; `"curl" URL` fetches, because
 *      quoting an executable does not stop it from executing. Leading
 *      assignments (`HTTPS_PROXY=… curl`) and wrappers (`sudo`, `env`, `xargs`,
 *      `timeout N`) are stepped over to find it.
 *   2. **Does it transfer?** Every non-flag operand of curl/wget is a URL —
 *      including a bare single-label host (`curl intranet`). No operand, no
 *      transfer: `curl --version`, `curl --help`, a bare `curl`.
 *   3. **Where does each body land?** In context (stdout, `-o -`, `/dev/stdout`,
 *      `/dev/stderr`, `/dev/fd/N`, `>&2`) or quietly in a file (`-o path`,
 *      `-O`, `> path`, wget's `-O path`). A stderr-only redirect such as
 *      `2>/dev/null` moves nothing, and one `-o` does not cover two URLs.
 *
 * Chained, substituted and nested commands are judged per shell segment, so a
 * permitted segment never licenses the rest of the line. Language-level HTTP
 * calls (fetch, requests, urllib, Invoke-WebRequest) have no quiet-to-file form
 * worth modelling and stay routed whenever a runtime executes them.
 */

/** What a bash command would do to the context window, if anything. */
export type BashNetworkVerdict = "inline-http" | "context-flood" | null;

// Language-level HTTP clients. Only consulted when the segment actually runs
// code, so `grep -n "fetch(" src/app.ts` reads a file instead of being routed.
const BLOCKED_HTTP_PATTERNS: RegExp[] = [
  /\bfetch\s*\(/,
  /\brequests\.(get|post|put|patch|delete)\s*\(/,
  /\bhttp\.(get|request)\s*\(/,
  /\burllib\.request/,
  /\bInvoke-WebRequest\b/,
];

// Runtimes that execute their argument as code.
const CODE_INTERPRETERS = {
  node: true, nodejs: true, bun: true, deno: true, tsx: true, "ts-node": true,
  python: true, python3: true, py: true, ruby: true, perl: true, php: true,
  pwsh: true, powershell: true, osascript: true, rscript: true,
} satisfies Record<string, true>;

// Shells that execute their argument as another shell command — recursed into
// so `bash -c "curl URL"` is judged as the command it really runs.
const SHELL_INTERPRETERS = {
  sh: true, bash: true, zsh: true, dash: true, ksh: true, fish: true,
} satisfies Record<string, true>;

// Programs that run the command that follows them, each mapped to the options
// that take a *separate* value. Those values matter: `nice -n 10 curl URL` puts
// `10` where the command word would otherwise sit, and reading `10` as the
// command hides the curl behind it. This list is finite, so a wrapper or option
// form that is not modelled here can still put the walker on the wrong word and
// misroute the segment in either direction — including allowing a transfer that
// should have been routed, which is how `nice -n 10 curl URL` slipped through
// the first cut. Add the form rather than assuming the default is conservative.
const COMMAND_WRAPPERS = {
  env: { "-u": true, "--unset": true, "-C": true, "--chdir": true, "-S": true, "--split-string": true },
  sudo: {
    "-u": true, "--user": true, "-g": true, "--group": true, "-U": true, "--other-user": true,
    "-C": true, "--close-from": true, "-p": true, "--prompt": true, "-h": true, "--host": true,
    "-R": true, "--chroot": true, "-D": true, "--chdir": true, "-r": true, "--role": true,
    "-t": true, "--type": true,
  },
  doas: { "-u": true, "-C": true },
  command: {},
  builtin: {},
  exec: { "-a": true },
  nohup: {},
  time: { "-o": true, "--output": true, "-f": true, "--format": true },
  timeout: { "-s": true, "--signal": true, "-k": true, "--kill-after": true },
  stdbuf: { "-i": true, "--input": true, "-o": true, "--output": true, "-e": true, "--error": true },
  nice: { "-n": true, "--adjustment": true },
  ionice: { "-c": true, "--class": true, "-n": true, "--classdata": true, "-p": true, "--pid": true },
  xargs: {
    "-n": true, "--max-args": true, "-I": true, "-i": true, "--replace": true,
    "-L": true, "--max-lines": true, "-P": true, "--max-procs": true,
    "-d": true, "--delimiter": true, "-E": true, "-e": true, "--eof": true,
    "-s": true, "--max-chars": true, "-a": true, "--arg-file": true,
  },
  setsid: {},
  script: { "-c": true, "--command": true },
} satisfies Record<string, Record<string, true>>;

/**
 * Drop heredoc bodies.
 *
 * Known ceiling: a heredoc fed to an interpreter (`bash <<EOF … EOF`) is treated
 * as data, matching the long-standing behaviour of hooks/core/routing.mjs.
 * ponytail: revisit only if a real bypass shows up in the wild.
 */
function stripHeredocs(cmd: string): string {
  return cmd.replace(/<<-?\s*["']?(\w+)["']?[\s\S]*?\n\s*\1/g, "");
}

type Token = { text: string; quoted: boolean };

// Operators that end a segment. `>` and `>>` are deliberately absent: a
// redirect belongs to the command it follows and decides where the body lands.
const SEGMENT_BREAKS = { ";": true, "&": true, "|": true, "\n": true, "(": true, ")": true, "`": true } satisfies Record<string, true>;

/**
 * Split a command into shell segments, quote-aware, tokenizing as it goes.
 *
 * Adjacent quoted and unquoted runs merge into one token (`"curl"` → `curl`,
 * POSIX word rules), and a token remembers whether any part of it was quoted.
 * That flag decides two things and nothing else: a quoted word is never a
 * redirect operator, and a quoted word is what a shell interpreter runs as
 * code. It does not decide what executes — `"curl" URL` executes curl.
 *
 * src/session/extract.ts has an argv tokenizer for commit-message parsing; it
 * flattens quoting and does not split segments, so it cannot answer either
 * question here.
 */
function tokenizeSegments(command: string): Token[][] {
  const segments: Token[][] = [];
  let segment: Token[] = [];
  let text = "";
  let started = false;
  let quoted = false;
  let quote: '"' | "'" | null = null;

  const endToken = () => {
    if (started) segment.push({ text, quoted });
    text = "";
    started = false;
    quoted = false;
  };
  const endSegment = () => {
    endToken();
    if (segment.length > 0) segments.push(segment);
    segment = [];
  };

  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (quote) {
      if (ch === quote && command[i - 1] !== "\\") quote = null;
      else text += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      quoted = true;
      started = true;
      continue;
    }
    if (Object.hasOwn(SEGMENT_BREAKS, ch)) {
      endSegment();
      continue;
    }
    if (ch === " " || ch === "\t") {
      endToken();
      continue;
    }
    text += ch;
    started = true;
  }
  endSegment();
  return segments;
}

const CURL_WGET = /^(?:.*\/)?(curl|wget)$/i;
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

// A redirect token: optional fd or `&`, the operator, and an attached target.
// `2>/dev/null` → fd 2; `>out` → fd 1; `&>out` → both; `>&2` → target `&2`.
const REDIRECT = /^(\d+|&)?(>>?|>\|)(.*)$/;

// Output targets whose bytes reach the conversation anyway.
const CONTEXT_SINK = /^(?:-|&\d+|\/dev\/(?:stdout|stderr|tty|console|fd\/\d+)|\/proc\/self\/fd\/\d+)$/;

// Long options whose value is a separate token. Only options whose value could
// otherwise read as a transfer target need to be here. For the flags listed, an
// unmodelled value reads as an operand and costs a needless route; the list is
// finite, so a flag missing from it can be classified either way.
const LONG_VALUE_FLAGS = {
  "--user-agent": true,
  "--header": true,
  "--referer": true,
  "--cookie": true,
  "--cookie-jar": true,
  "--data": true,
  "--data-raw": true,
  "--data-binary": true,
  "--data-urlencode": true,
  "--form": true,
  "--user": true,
  "--write-out": true,
  "--request": true,
  "--proxy": true,
  "--upload-file": true,
  "--output": true,
  "--output-document": true,
  "--output-dir": true,
  "--config": true,
  "--url": true,
  "--connect-to": true,
  "--resolve": true,
  "--input-file": true,
  "--max-time": true,
  "--connect-timeout": true,
  "--retry": true,
} satisfies Record<string, true>;

// Short options whose value is the rest of the bundle or the next token. The
// two tools disagree: `-i` is curl's include-headers switch but wget's
// input-file option, and `-c`, `-b`, `-d`, `-E`, `-m` split the same way. One
// shared table made `curl -si -o out.json URL` swallow `-o` as `-i`'s value.
const CURL_SHORT_VALUE_FLAGS = {
  A: true, b: true, c: true, C: true, d: true, D: true, e: true, E: true,
  F: true, H: true, K: true, m: true, o: true, P: true, Q: true, r: true,
  t: true, T: true, u: true, U: true, w: true, x: true, X: true, y: true,
  Y: true, z: true,
} satisfies Record<string, true>;

const WGET_SHORT_VALUE_FLAGS = {
  a: true, A: true, B: true, C: true, D: true, e: true, i: true, I: true,
  l: true, o: true, O: true, P: true, Q: true, R: true, t: true, T: true,
  U: true, w: true, X: true,
} satisfies Record<string, true>;

type Transfer = {
  /** URL operands — each one produces a body that has to land somewhere. */
  operands: number;
  /** Per-URL file sinks: `-o path`, `-O`. */
  fileSlots: number;
  /** A sink that swallows the whole stdout stream: `> path`, wget's `-O path`. */
  capturesAll: boolean;
  /** A named sink whose bytes still reach the conversation. */
  contextSink: boolean;
  silent: boolean;
  verbose: boolean;
};

/** Read one curl/wget invocation's argument list into a transfer description. */
function readInvocation(args: Token[], tool: "curl" | "wget"): Transfer {
  const t: Transfer = {
    operands: 0,
    fileSlots: 0,
    capturesAll: false,
    contextSink: false,
    silent: false,
    verbose: false,
  };

  /** `perUrl`: a sink that takes one body (`-o`). Otherwise it takes the stream. */
  const recordSink = (value: string, perUrl: boolean) => {
    if (!value) return;
    if (CONTEXT_SINK.test(value)) t.contextSink = true;
    else if (perUrl) t.fileSlots += 1;
    else t.capturesAll = true;
  };

  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    const text = token.text;

    if (!token.quoted) {
      const redirect = REDIRECT.exec(text);
      if (redirect) {
        const fd = redirect[1] ?? "1";
        let target = redirect[3];
        if (!target) {
          target = args[i + 1]?.text ?? "";
          i++;
        }
        // Only stdout (fd 1) and `&>` carry the body. `2>/dev/null` discards
        // progress noise and leaves the body exactly where it was.
        if (fd === "1" || fd === "&") recordSink(target, false);
        continue;
      }
    }

    if (token.quoted || !text.startsWith("-") || text === "-") {
      // Every non-flag operand of curl/wget is a URL, whatever it looks like:
      // `curl intranet` and `curl example.com/api` both fetch.
      if (text !== "-") t.operands += 1;
      continue;
    }

    if (text.startsWith("--")) {
      const eq = text.indexOf("=");
      const name = eq === -1 ? text : text.slice(0, eq);
      let value = eq === -1 ? "" : text.slice(eq + 1);
      if (eq === -1 && Object.hasOwn(LONG_VALUE_FLAGS, name)) {
        value = args[i + 1]?.text ?? "";
        i++;
      }
      if (name === "--url" || name === "--config" || name === "--input-file") t.operands += 1;
      else if (name === "--output" && tool === "curl") recordSink(value, true);
      else if (name === "--output-document" && tool === "wget") recordSink(value, false);
      else if (name === "--remote-name" && tool === "curl") t.fileSlots += 1;
      else if (name === "--remote-name-all" && tool === "curl") t.capturesAll = true;
      else if (name === "--silent" && tool === "curl") t.silent = true;
      else if (name === "--quiet" && tool === "wget") t.silent = true;
      else if (name === "--verbose" || name.startsWith("--trace")) t.verbose = true;
      continue;
    }

    // Short bundle: -sSL, -o, -qO, …
    for (let c = 1; c < text.length; c++) {
      const letter = text[c];
      if (letter === "O" && tool === "curl") {
        t.fileSlots += 1;
        continue;
      }
      if (letter === "s" && tool === "curl") t.silent = true;
      else if (letter === "q" && tool === "wget") t.silent = true;
      else if (letter === "v") t.verbose = true;

      const table = tool === "curl" ? CURL_SHORT_VALUE_FLAGS : WGET_SHORT_VALUE_FLAGS;
      const takesValue = Object.hasOwn(table, letter);
      if (!takesValue) continue;

      let value = text.slice(c + 1);
      if (!value) {
        value = args[i + 1]?.text ?? "";
        i++;
      }
      if (letter === "o" && tool === "curl") recordSink(value, true);
      // wget's -O is one file for the whole run, not one per URL; its -o names
      // a log file, and its body lands on disk regardless.
      else if (letter === "O" && tool === "wget") recordSink(value, false);
      else if (letter === "K" && tool === "curl") t.operands += 1;
      else if (letter === "i" && tool === "wget") t.operands += 1;
      break; // the rest of the bundle was this flag's value
    }
  }
  return t;
}

/** Where the segment's real command word sits, and how its operands arrive. */
type CommandPosition = {
  /** Index of the command word, or -1 when the segment runs nothing. */
  index: number;
  /** `xargs`: operands come from stdin, so a transfer has to be assumed. */
  stdinOperands: boolean;
};

type WrapperName = keyof typeof COMMAND_WRAPPERS;

function isWrapper(word: string): word is WrapperName {
  return Object.hasOwn(COMMAND_WRAPPERS, word);
}

/**
 * Find the word in command position, stepping over leading assignments
 * (`HTTPS_PROXY=… curl`) and wrapper programs (`sudo`, `env`, `timeout 10`).
 *
 * A wrapper's options are skipped, and so is the value an option owns: after
 * `nice -n 10` the command word is what follows `10`, not `10` itself.
 */
function commandIndex(tokens: Token[]): CommandPosition {
  let stdinOperands = false;
  let wrapperOptions: Record<string, true> | null = null;
  for (let i = 0; i < tokens.length; i++) {
    const text = tokens[i].text;
    if (!tokens[i].quoted && ASSIGNMENT.test(text)) continue;
    if (text === "--") continue;
    if (text.startsWith("-")) {
      // A wrapper's own flag. `--user=root` and `-n10` carry their value inside
      // the token; `-u www-data` and `-n 10` take the next one.
      const long = text.startsWith("--");
      const name = long ? text.split("=")[0] : text.slice(0, 2);
      const attached = long ? text.includes("=") : text.length > 2;
      if (!attached && wrapperOptions && Object.hasOwn(wrapperOptions, name)) i++;
      continue;
    }
    const word = text.replace(/^.*\//, "").toLowerCase();
    if (!isWrapper(word)) return { index: i, stdinOperands };
    wrapperOptions = COMMAND_WRAPPERS[word];
    if (word === "xargs") stdinOperands = true;
    if (word === "timeout" && /^\d/.test(tokens[i + 1]?.text ?? "")) i++; // the duration
  }
  return { index: -1, stdinOperands };
}

/**
 * True when a segment cannot push network payload into context: it does not run
 * curl/wget, or it transfers nothing, or every body lands quietly in a file.
 *
 * Known ceiling: a curl launched from another program's exec argument
 * (`find . -exec curl {} \;`) is not modelled; the wrapper list covers the
 * forms that show up in agent commands.
 */
function isSafeSegment(tokens: Token[]): boolean {
  const { index, stdinOperands } = commandIndex(tokens);
  if (index === -1) return true;

  const command = tokens[index].text;
  if (!CURL_WGET.test(command)) return true;

  const tool = /wget$/i.test(command) ? "wget" : "curl";
  const t = readInvocation(tokens.slice(index + 1), tool);
  if (stdinOperands) t.operands += 1;

  // Nothing fetched: `curl --version`, `curl --help`, a bare `curl`.
  if (t.operands === 0) return true;

  if (t.contextSink) return false;
  if (t.verbose || !t.silent) return false;
  if (t.capturesAll) return true;
  return t.fileSlots >= t.operands;
}

function classifySegment(tokens: Token[], depth: number): BashNetworkVerdict {
  const { index } = commandIndex(tokens);
  const lead = index === -1 ? "" : tokens[index].text.replace(/^.*\//, "").toLowerCase();

  if (lead === "invoke-webrequest" || lead === "iwr") return "inline-http";

  if (Object.hasOwn(CODE_INTERPRETERS, lead)) {
    const code = tokens.map((tok) => tok.text).join(" ");
    if (BLOCKED_HTTP_PATTERNS.some((p) => p.test(code))) return "inline-http";
  }

  // `bash -c "curl URL"` runs the quoted string; judge it as a command.
  if (Object.hasOwn(SHELL_INTERPRETERS, lead) && depth < 2) {
    for (const tok of tokens) {
      if (!tok.quoted) continue;
      const nested = classifyCommand(tok.text, depth + 1);
      if (nested) return nested;
    }
  }

  return isSafeSegment(tokens) ? null : "context-flood";
}

function classifyCommand(command: string, depth: number): BashNetworkVerdict {
  for (const tokens of tokenizeSegments(stripHeredocs(command))) {
    const verdict = classifySegment(tokens, depth);
    if (verdict) return verdict;
  }
  return null;
}

/**
 * Classify a bash command for context-flooding network I/O.
 *
 * Returns `"inline-http"` for a runtime invoked to make an HTTP call,
 * `"context-flood"` for a curl/wget transfer whose body would land in context,
 * and `null` when the command is free to run.
 */
export function classifyBashNetwork(command: string): BashNetworkVerdict {
  return command ? classifyCommand(command, 0) : null;
}
