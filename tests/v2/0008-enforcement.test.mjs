// ADR-0001 / ADR-0008 / PRD-v2 section 10 / GP3: the enforcement rewrite, deny policy and routing.
// Area: 0008-enforcement (docs/v2/TEST-LAYOUT.md).
// Merged by ADR-0024 from 9 files (see docs/v2/TEST-LAYOUT.md). One describe block per old file; test names are unchanged.
// Serial blocks (decide, user-deny, routing) set process.env; the pure blocks run concurrently.

import { after, before, describe, test } from "node:test";
import { CONC } from "./_lib/concurrency.mjs";
import assert from "node:assert/strict";
import { dequote, isAssignment, lex, scan, substitutions } from "../../src/core/policy/lexer.ts";
import { parseShell } from "../../src/core/policy/parse.ts";
import { MAX_NEST_DEPTH, OUTPUT_CAP, PARSE_ERROR_DENY_LINE, POLICY_UNREADABLE_LINE, READ_DENY_FIXED_CAP, REQUIRE_SECURITY_ENV, USER_DENY_REASON_PREFIX, prefixToolNames } from "../../src/core/contracts/constants.ts";
import { unwrap } from "../../src/core/policy/unwrap.ts";
import { psDump, psWords } from "../../src/core/policy/powershell.ts";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { READ_DENY_MESSAGE, READ_DENY_TEMPLATE } from "../../src/core/policy/read-deny.ts";
import { lintHookText } from "../../docs/v2/prompt/lint.mjs";
import { buildMatcher } from "../../build/manifests.ts";
import { getAdapter } from "../../src/adapters/table.ts";
import { decide, denyMessage } from "../../src/core/policy/decide.ts";
import { decode as decodeCodex } from "../../src/adapters/codex.ts";
import { decode as decodeQwen } from "../../src/adapters/qwen.ts";
import { decode as decodeKiro } from "../../src/adapters/kiro.ts";
import { decode as decodeGemini } from "../../src/adapters/gemini.ts";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { matchesAnyDenyPattern, readUserDeny } from "../../src/core/policy/user-deny.ts";
import { AGENT_IDS } from "../../src/core/contracts/agents.ts";

describe("ADR-0008 lexer", { concurrency: CONC }, () => {
  // Unit tests for src/core/policy/lexer.ts (impl/08 §1, DECISIONS-r9 P1, P3, E1).

  const kinds = (cmd) => lex(cmd).map((t) => `${t.kind}:${t.text}`);

  test("plain words and flags are word tokens with source offsets", () => {
    const t = lex("curl -sL https://x.io/f");
    assert.deepEqual(t.map((x) => x.text), ["curl", "-sL", "https://x.io/f"]);
    assert.ok(t.every((x) => x.kind === "word"));
    assert.deepEqual([t[1].start, t[1].end], [5, 8]);
  });

  test("ops: && || ; | ( ) longest match first", () => {
    assert.deepEqual(kinds("a&&b||c;d|e"), ["word:a", "op:&&", "word:b", "op:||", "word:c", "op:;", "word:d", "op:|", "word:e"]);
    assert.deepEqual(kinds("( a )"), ["op:(", "word:a", "op:)"]);
    assert.deepEqual(kinds("a & b"), ["word:a", "op:&", "word:b"]);
  });

  test("io: > >> < 2> 2>&1 &> << <<- <<<", () => {
    assert.deepEqual(kinds("a > f >> g < h 2> e 2>&1 &> x"),
      ["word:a", "io:>", "word:f", "io:>>", "word:g", "io:<", "word:h", "io:2>", "word:e", "io:2>&1", "io:&>", "word:x"]);
    assert.deepEqual(kinds("grep x <<< hi"), ["word:grep", "word:x", "io:<<<", "word:hi"]);
  });

  test("quotes: quoted text stays one word, never ops (P3)", () => {
    assert.deepEqual(kinds(`git log --grep="curl && wget"`), [`word:git`, `word:log`, `word:--grep="curl && wget"`]);
    assert.deepEqual(kinds(`echo 'a; [[ b'`), [`word:echo`, `word:'a; [[ b'`]);
    assert.deepEqual(kinds(`echo "curl \\"https://x.io/a.json\\""`), [`word:echo`, `word:"curl \\"https://x.io/a.json\\""`]);
  });

  test("nested quote stack: $( ) inside double quotes pops back to the double quote", () => {
    assert.deepEqual(kinds(`echo "$(echo "a b")" c`), [`word:echo`, `word:"$(echo "a b")"`, `word:c`]);
  });

  test("$( ) and backticks alone are one unhandled token", () => {
    assert.deepEqual(kinds("echo $(curl -s x | wc) `id`"), ["word:echo", "unhandled:$(curl -s x | wc)", "unhandled:`id`"]);
    assert.deepEqual(kinds("echo $((1+1))"), ["word:echo", "unhandled:$((1+1))"]);
  });

  test("[[ ]] and (( )) are unhandled spans (P1)", () => {
    assert.deepEqual(kinds("[[ -f a.txt && -n $x ]] && echo ok"), ["unhandled:[[ -f a.txt && -n $x ]]", "op:&&", "word:echo", "word:ok"]);
    assert.deepEqual(kinds("(( i > 3 )); echo"), ["unhandled:(( i > 3 ))", "op:;", "word:echo"]);
  });

  test("process substitution is an unhandled span", () => {
    assert.deepEqual(kinds("diff <(curl -s x) >(cat)"), ["word:diff", "unhandled:<(curl -s x)", "unhandled:>(cat)"]);
  });

  test("case and function words stay plain words; coproc and select too", () => {
    assert.deepEqual(kinds("f() { a; }"), ["word:f", "op:(", "op:)", "word:{", "word:a", "op:;", "word:}"]);
    assert.deepEqual(kinds("case $1 in x) a;; esac"), ["word:case", "word:$1", "word:in", "word:x", "op:)", "word:a", "op:;;", "word:esac"]);
    assert.deepEqual(kinds("coproc x"), ["word:coproc", "word:x"]);
  });

  test("E1: unquoted LF / CR / CRLF is an op ;", () => {
    assert.deepEqual(kinds("pwd\nrm -rf /tmp/x"), ["word:pwd", "op:;", "word:rm", "word:-rf", "word:/tmp/x"]);
    assert.deepEqual(kinds("a\rb\r\nc"), ["word:a", "op:;", "word:b", "op:;", "word:c"]);
    assert.deepEqual(kinds(`echo "a\nb"`), [`word:echo`, `word:"a\nb"`]);
  });

  test("E1: backslash-LF is a line continuation, no token", () => {
    assert.deepEqual(kinds("npm run build \\\n  --silent"), ["word:npm", "word:run", "word:build", "word:--silent"]);
  });

  test("heredoc body is one unhandled token after the newline op", () => {
    const s = scan("cat <<EOF\ncurl -s https://x.io\nEOF\necho done");
    assert.deepEqual(s.tokens.map((t) => `${t.kind}:${t.text}`),
      ["word:cat", "io:<<", "word:EOF", "op:;", "unhandled:curl -s https://x.io\nEOF\n", "word:echo", "word:done"]);
    assert.deepEqual(s.heredocBodies, [4]);
    assert.equal(s.end, "complete");
  });

  test("heredoc <<- strips whitespace around the tag; quoted tag", () => {
    assert.equal(scan("cat <<-'END'\n\tx\n\tEND\n").end, "complete");
    assert.equal(scan("cat <<\"END\"\nx\nEND").end, "complete");
  });

  test("unterminated quote / heredoc consume to end, never throw", () => {
    const q = scan(`echo "unterminated`);
    assert.equal(q.end, "unterminated-quote");
    assert.deepEqual(q.tokens.map((t) => t.text), ["echo", `"unterminated`]);
    assert.equal(scan("echo 'x").end, "unterminated-quote");
    assert.equal(scan("cat <<EOF\nbody").end, "unterminated-heredoc");
    assert.equal(scan("cat <<EOF").end, "unterminated-heredoc");
  });

  test("heredoc inside $( ) inside double quotes: apostrophes in the body are not quotes", () => {
    const s = scan(`git commit -m "$(cat <<'EOF'\nit's done\nEOF\n)"`);
    assert.equal(s.end, "complete");
    assert.equal(s.tokens.length, 4);
  });

  test("comments are skipped at word start only", () => {
    assert.deepEqual(kinds("echo a # curl don't\nls"), ["word:echo", "word:a", "op:;", "word:ls"]);
    assert.deepEqual(kinds("echo a#b"), ["word:echo", "word:a#b"]);
  });

  test("lexer never throws on odd input", () => {
    for (const s of ["", "\\", "$(", "`", "[[", "((", "<<", "'", '"', "a\\", ")(", "<(", "<<-", "&>", "${a b}"]) lex(s);
  });

  test("dequote strips quote characters and escapes", () => {
    assert.equal(dequote(`"curl"`), "curl");
    assert.equal(dequote(`'a b'c\\ d`), "a bc d");
    assert.equal(dequote(`"a \\"b\\" \\$x"`), `a "b" $x`);
  });

  test("substitutions finds $( ), backticks, <( ) outside single quotes; skips $(( ))", () => {
    assert.deepEqual(substitutions(`echo "$(curl -s x)" '$(no)' \`id\` $((1+1)) <(a) >(b)`), [
      { wrapper: "$()", body: "curl -s x" },
      { wrapper: "`", body: "id" },
      { wrapper: "<()", body: "a" },
      { wrapper: ">()", body: "b" },
    ]);
    assert.deepEqual(substitutions(`echo "<(x)"`), []);
  });

  test("isAssignment: NAME=val only", () => {
    assert.equal(isAssignment("FOO=1"), true);
    assert.equal(isAssignment("_a1=x y"), true);
    assert.equal(isAssignment("1A=x"), false);
    assert.equal(isAssignment("--a=b"), false);
    assert.equal(isAssignment("curl"), false);
  });
});

describe("ADR-0008 command parse", { concurrency: CONC }, () => {
  // Unit tests for src/core/policy/parse.ts (impl/08 §2, DECISIONS-r9 P1-P4, E1; DEVIATIONS D-M3-E1-1..5).

  function cmds(cmd) {
    const r = parseShell(cmd);
    assert.equal(r.ok, true, `parse failed: ${JSON.stringify(r)}`);
    return r.commands;
  }
  const names = (cmd) => cmds(cmd).map((c) => c.argv0);
  const one = (cmd) => {
    const c = cmds(cmd);
    assert.equal(c.length, 1, JSON.stringify(c));
    return c[0];
  };
  const err = (cmd) => {
    const r = parseShell(cmd);
    assert.equal(r.ok, false, JSON.stringify(r));
    return r.construct;
  };

  test("simple command: argv0, args, raw, flags", () => {
    assert.deepEqual(one("curl -s https://x.io/a.json"), {
      argv0: "curl", args: ["-s", "https://x.io/a.json"], redirectsToFile: false, endsInBoundedSink: false,
      raw: "curl -s https://x.io/a.json",
    });
  });

  test("chain split on && || ; & and newline", () => {
    assert.deepEqual(names("npm ci && curl -s https://x.io/a.json && npm test"), ["npm", "curl", "npm"]);
    assert.deepEqual(names("a || b; c & d"), ["a", "b", "c", "d"]);
    assert.deepEqual(names("pwd\nrm -rf /tmp/x"), ["pwd", "rm"]);
    assert.deepEqual(cmds("pwd\ncurl -s https://x.io/a.json").map((c) => c.raw), ["pwd", "curl -s https://x.io/a.json"]);
  });

  test("E1: backslash-newline joins one command", () => {
    assert.deepEqual(one("npm run build \\\n  --silent").args, ["run", "build", "--silent"]);
  });

  test("argv0 strips quotes and the directory part", () => {
    assert.equal(one(`"curl" -s x`).argv0, "curl");
    assert.equal(one("/usr/bin/curl -s x").argv0, "curl");
    assert.equal(one("./gradlew build").argv0, "gradlew");
    assert.deepEqual(one(`git log --grep="curl"`).args, ["log", "--grep=curl"]);
  });

  test("redirectsToFile: > >> &> to a real file; not to stdout aliases or 2>", () => {
    assert.equal(one("curl -s x > out.json").redirectsToFile, true);
    assert.equal(one("curl -s x >> out.json").redirectsToFile, true);
    assert.equal(one("curl -s x &> log").redirectsToFile, true);
    assert.equal(one("curl -s x 1> f").redirectsToFile, true);
    assert.equal(one("curl -s x > /dev/null").redirectsToFile, true);
    assert.equal(one("curl -s x > /dev/stdout").redirectsToFile, false);
    assert.equal(one("curl -s x > -").redirectsToFile, false);
    assert.equal(one("curl -s x 2> err.log").redirectsToFile, false);
    assert.equal(one("curl -s x 2>&1").redirectsToFile, false);
  });

  test("redirectsToFile: curl -o / wget -O, incl. clusters and --opt=value", () => {
    assert.equal(one("curl -sL -o out.bin https://x.io/f").redirectsToFile, true);
    assert.equal(one("curl -sLo out.bin https://x.io/f").redirectsToFile, true);
    assert.equal(one("curl --output out.bin x").redirectsToFile, true);
    assert.equal(one("curl --output=out.bin x").redirectsToFile, true);
    assert.equal(one("curl -o - x").redirectsToFile, false);
    assert.equal(one("curl -o /dev/stdout x").redirectsToFile, false);
    assert.equal(one("wget -qO f.zip x").redirectsToFile, true);
    assert.equal(one("wget --output-document f x").redirectsToFile, true);
    assert.equal(one("wget -O - x").redirectsToFile, false);
    assert.equal(one("echo -o f").redirectsToFile, false);
  });

  test("group / subshell redirect marks every command inside", () => {
    assert.deepEqual(cmds("{ curl -s x; echo; } > f").map((c) => c.redirectsToFile), [true, true]);
    assert.deepEqual(cmds("( curl -s x ) 2> f").map((c) => c.redirectsToFile), [false]);
  });

  test("endsInBoundedSink: head -c N (N <= OUTPUT_CAP), wc, grep -c, jq whitelist", () => {
    const sink = (cmd) => cmds(cmd).map((c) => c.endsInBoundedSink);
    assert.deepEqual(sink("curl -s https://x.io | head -c 200"), [true, true]);
    assert.deepEqual(sink("curl -s x | head -c200"), [true, true]);
    assert.deepEqual(sink(`curl -s x | head -c ${OUTPUT_CAP + 1}`), [false, false]);
    assert.deepEqual(sink("curl -s x | head -n 5"), [false, false]);
    assert.deepEqual(sink("curl -s x | wc -l"), [true, true]);
    assert.deepEqual(sink("curl -s x | grep -c foo"), [true, true]);
    assert.deepEqual(sink("curl -s x | grep -ic foo"), [true, true]);
    assert.deepEqual(sink("curl -s x | grep foo"), [false, false]);
    assert.deepEqual(sink("curl -s x | wc -l | cat"), [false, false, false]);
    assert.deepEqual(sink("curl -s x | wc; curl -s y"), [true, true, false]);
    assert.deepEqual(sink("( curl -s x ) | wc"), [true, true]);
  });

  test("jq filter whitelist (§2.4)", () => {
    const ok = (f) => cmds(`curl -s x | jq ${f}`)[0].endsInBoundedSink;
    assert.equal(ok("'.data'"), true);
    assert.equal(ok("."), true);
    assert.equal(ok("-r .a.b_c.d1"), true);
    assert.equal(ok("'length'"), true);
    assert.equal(ok("'.items | length'"), true);
    assert.equal(ok("'.items|length'"), true);
    assert.equal(ok("'map(.x)'"), false);
    assert.equal(ok("'.[]'"), false);
    assert.equal(ok("'.a | keys'"), false);
    assert.equal(ok("'.a | length | length'"), false);
    assert.equal(ok("--arg a b .x"), false);
    assert.equal(ok(".x file.json"), false);
  });

  test("heredoc body is never a command (#1221)", () => {
    assert.deepEqual(names("cat <<EOF\nsome curl text\nEOF"), ["cat"]);
    assert.deepEqual(names("cat <<'EOF' > f.txt\ncurl -s x\nEOF\nls"), ["cat", "ls"]);
    assert.equal(one("cat <<EOF > f.txt\nx\nEOF").redirectsToFile, true);
  });

  test("quoted text is never a command (P3)", () => {
    assert.deepEqual(names(`echo "curl \\"https://x.io/a.json\\""`), ["echo"]);
    assert.deepEqual(names(`echo 'a && curl x; [[ b'`), ["echo"]);
  });

  test("P4: [[ ]] and (( )) are skipped dividers, no ParseError", () => {
    assert.deepEqual(names("[[ -f a.txt ]] && echo ok"), ["echo"]);
    assert.deepEqual(names("(( i > 3 )) || ls"), ["ls"]);
    assert.deepEqual(names("echo $((1+1))"), ["echo"]);
  });

  test("P4: function bodies flatten with insideConstruct = name", () => {
    const c = cmds("deploy() { curl -s https://x.io/a.json; }; deploy");
    assert.deepEqual(c.map((x) => [x.argv0, x.insideConstruct]), [["curl", "deploy"], ["deploy", undefined]]);
    assert.deepEqual(cmds("function up { curl -s x; }").map((x) => [x.argv0, x.insideConstruct]), [["curl", "up"]]);
    assert.deepEqual(cmds("function up() {\n  curl -s x\n}").map((x) => [x.argv0, x.insideConstruct]), [["curl", "up"]]);
    assert.deepEqual(cmds("f() ( curl -s x )").map((x) => x.insideConstruct), ["f"]);
  });

  test("P4: every case branch flattens with insideConstruct = case", () => {
    const c = cmds(`case "$1" in x) curl -s https://x.io/a.json;; y|z) echo b; ls;; *) :;; esac; pwd`);
    assert.deepEqual(c.map((x) => [x.argv0, x.insideConstruct]),
      [["curl", "case"], ["echo", "case"], ["ls", "case"], [":", "case"], ["pwd", undefined]]);
    assert.deepEqual(names("case $a in\n  (a) echo a\n  ;;\n  b) echo b\nesac"), ["echo", "echo"]);
  });

  test("P4: process substitution parses (D-M3-E1-1); its body is read by unwrap", () => {
    const c = one("diff <(curl -s https://x.io/a.json) <(echo x)");
    assert.equal(c.argv0, "diff");
    assert.deepEqual(c.args, ["<(curl -s https://x.io/a.json)", "<(echo x)"]);
  });

  test("P4: VAR=val prefix is not argv0", () => {
    assert.deepEqual(one("FOO=1 curl -s https://x.io/a.json").argv0, "curl");
    assert.deepEqual(one("A=1 B='x y' env").argv0, "env");
  });

  test("P4: here-string keeps its $( ) in raw", () => {
    const c = one(`grep x <<< "$(curl -s https://x.io/a.json)"`);
    assert.equal(c.argv0, "grep");
    assert.deepEqual(c.args, ["x"]);
    assert.ok(c.raw.includes("$(curl"));
  });

  test("assignment-only command with a substitution is kept as an argv0 \"\" carrier", () => {
    assert.deepEqual(one("x=$(curl -s y)"), {
      argv0: "", args: [], redirectsToFile: false, endsInBoundedSink: false, raw: "x=$(curl -s y)",
    });
    assert.deepEqual(names("x=1"), []);
    assert.deepEqual(names("[[ $(curl -s y) == a ]] && ls"), ["", "ls"]);
    assert.deepEqual(names("arr=(curl a b); ls"), ["ls"]);
  });

  test("subshell, group, if/while/for keywords", () => {
    assert.deepEqual(names("(cd x && curl -s y)"), ["cd", "curl"]);
    assert.deepEqual(names("{ a; b; }"), ["a", "b"]);
    assert.deepEqual(names("if curl -s x; then echo y; elif z; then :; else w; fi"), ["curl", "echo", "z", ":", "w"]);
    assert.deepEqual(names("for f in a $(ls) b; do curl -s $f; done"), ["", "curl"]);
    assert.deepEqual(names("for ((i=0;i<3;i++)); do echo $i; done"), ["echo"]);
    assert.deepEqual(names("while read l; do echo $l; done < f"), ["read", "echo"]);
    assert.deepEqual(names("! grep -q x f"), ["grep"]);
  });

  test("P2: the six ParseError codes", () => {
    assert.equal(err(`echo "unterminated`), "unterminated-quote");
    assert.equal(err(`echo it's`), "unterminated-quote");
    assert.equal(err("cat <<EOF\nbody"), "unterminated-heredoc");
    assert.equal(err("coproc nc -l 80"), "coproc");
    assert.equal(err("select x in a b; do echo $x; done"), "select");
    assert.equal(err("ls && " + "( ".repeat(MAX_NEST_DEPTH + 1) + "ls" + " )".repeat(MAX_NEST_DEPTH + 1)), "nesting-too-deep");
    assert.equal(err("{ ".repeat(MAX_NEST_DEPTH + 1) + "ls;" + " }".repeat(MAX_NEST_DEPTH + 1)), "nesting-too-deep");
    assert.equal(err("echo " + "$(".repeat(MAX_NEST_DEPTH + 1) + "x" + ")".repeat(MAX_NEST_DEPTH + 1)), "nesting-too-deep");
  });

  test("nesting at exactly MAX_NEST_DEPTH parses", () => {
    assert.deepEqual(names("( ".repeat(MAX_NEST_DEPTH) + "ls" + " )".repeat(MAX_NEST_DEPTH)), ["ls"]);
  });

  test("ParseError is never [[, ((, case, function, $( ) or backticks", () => {
    for (const s of ["[[ a ]]", "(( 1 ))", "case a in esac", "f() { :; }", "echo $(ls)", "echo `ls`", "diff <(a) >(b)"]) {
      assert.equal(parseShell(s).ok, true, s);
    }
  });

  test("parseShell never throws on odd input", () => {
    for (const s of ["", ";", "|", "&&", ")", "}", "esac", ";;", "(", "{", "case", "case x", "case x in", "f()", "function",
      "> f", "2>&1", "<<", "a |", "if", "for", "for x in", "$(", "`", "[[", "((", "a\\", "\n\n", "f() {", "x=(",
      "echo $(case x in a) b;; esac)", "a; ) b"]) {
      parseShell(s);
    }
  });

  test("D-CDX-CAT-1: pipesOut marks a command whose stdout feeds the next pipeline command", () => {
    const out = (cmd) => cmds(cmd).map((c) => c.pipesOut === true);
    assert.deepEqual(out("cat a | grep x"), [true, false]);
    assert.deepEqual(out("cat a | grep x | wc -l"), [true, true, false]);
    assert.deepEqual(out("cat a; grep x b"), [false, false]);
    assert.deepEqual(out("cat a && ls | wc"), [false, true, false]);
    assert.equal("pipesOut" in cmds("cat a")[0], false);
  });
});

describe("ADR-0008 shell unwrap", { concurrency: CONC }, () => {
  // Unit tests for src/core/policy/unwrap.ts (impl/08 §3, ADR-0008 GP3 wrapper rows, DECISIONS-r9 P1/P4).

  function run(cmd) {
    const r = parseShell(cmd);
    assert.equal(r.ok, true, `parse failed: ${JSON.stringify(r)}`);
    return unwrap(r.commands);
  }
  const view = (cmd) => run(cmd).map((c) => [c.argv0, c.wrappedBy]);
  const curlOf = (cmd) => run(cmd).find((c) => c.argv0 === "curl");

  test("GP3 wrapper rows unwrap to curl, wrapper recorded", () => {
    const rows = [
      ["sudo curl -s https://x.io/a.json", ["sudo"]],
      ["env FOO=1 curl -s https://x.io/a.json", ["env"]],
      ["time curl -s https://x.io/a.json", ["time"]],
      ["nice -n 10 curl -s https://x.io/a.json", ["nice"]],
      ["timeout 5 curl -s https://x.io/a.json", ["timeout"]],
      ["echo url | xargs curl -s", ["xargs"]],
      ["command curl -s https://x.io/a.json", ["command"]],
      ['bash -c "curl -s https://x.io/a.json"', ["bash -c"]],
      ['sh -c "curl -s https://x.io/a.json"', ["sh -c"]],
      ['echo "$(curl -s https://x.io/a.json)"', ["$()"]],
      ["echo `curl -s https://x.io/a.json`", ["`"]],
    ];
    for (const [cmd, by] of rows) {
      const c = curlOf(cmd);
      assert.ok(c, cmd);
      assert.deepEqual(c.wrappedBy, by, cmd);
      assert.equal(c.redirectsToFile, false, cmd);
    }
    assert.deepEqual(curlOf("sudo curl -s https://x.io/a.json").args, ["-s", "https://x.io/a.json"]);
  });

  test("a plain command gets wrappedBy []", () => {
    assert.deepEqual(view("ls -la"), [["ls", []]]);
    assert.deepEqual(view("FOO=1 curl -s x"), [["curl", []]]);
  });

  test("wrapper options are skipped", () => {
    assert.deepEqual(curlOf("sudo -u bob -E curl -s x").args, ["-s", "x"]);
    assert.deepEqual(curlOf("env -i -u HOME A=1 B=2 curl -s x").args, ["-s", "x"]);
    assert.ok(curlOf("nice curl x"));
    assert.ok(curlOf("nice -5 curl x"));
    assert.ok(curlOf("timeout -s KILL 2.5m curl x"));
    assert.ok(curlOf("timeout --preserve-status 10 curl x"));
    assert.ok(curlOf("time -p curl x"));
    assert.ok(curlOf("ls | xargs -n 1 -I {} curl -s {}"));
    assert.ok(curlOf("command -p curl x"));
  });

  test("unrecognized wrapper shapes stay as-is", () => {
    assert.deepEqual(view("timeout curl x"), [["timeout", []]]);
    assert.deepEqual(view("command -v curl"), [["command", []]]);
    assert.deepEqual(view("ls | xargs"), [["ls", []], ["xargs", []]]);
    assert.deepEqual(view("sudo"), [["sudo", []]]);
    assert.deepEqual(view("bash script.sh"), [["bash", []]]);
    assert.deepEqual(view(`bash -c "echo 'oops"`), [["bash", []]]);
  });

  test("nested wrappers unwrap fully, outermost first", () => {
    assert.deepEqual(curlOf(`sudo env FOO=1 bash -c "timeout 5 curl -s x"`).wrappedBy, ["sudo", "env", "bash -c", "timeout"]);
    assert.deepEqual(curlOf(`bash -lc 'sh -c "curl -s x"'`).wrappedBy, ["bash -c", "sh -c"]);
  });

  test("bash -c splices every inner command", () => {
    assert.deepEqual(view(`sh -c 'npm ci && curl -s x'`), [["npm", ["sh -c"]], ["curl", ["sh -c"]]]);
    assert.deepEqual(view(`bash -o pipefail -c "a | b"`), [["a", ["bash -c"]], ["b", ["bash -c"]]]);
  });

  test("$( ), backticks and process substitution splice after the outer command", () => {
    assert.deepEqual(view("diff <(curl -s https://x.io/a.json) <(echo x)"),
      [["diff", []], ["curl", ["<()"]], ["echo", ["<()"]]]);
    assert.deepEqual(view(`grep x <<< "$(curl -s https://x.io/a.json)"`), [["grep", []], ["curl", ["$()"]]]);
    assert.deepEqual(view("x=$(curl -s y)"), [["", []], ["curl", ["$()"]]]);
    assert.deepEqual(view(`echo "$(echo "$(curl -s y)")"`), [["echo", []], ["echo", ["$()"]], ["curl", ["$()", "$()"]]]);
    assert.deepEqual(view("echo '$(curl -s y)'"), [["echo", []]]);
    assert.deepEqual(view("echo $((1+1))"), [["echo", []]]);
  });

  test("bash -c with a $( ) inside double quotes is not counted twice", () => {
    assert.deepEqual(view(`bash -c "echo $(curl -s x)"`), [["echo", ["bash -c"]], ["curl", ["bash -c", "$()"]]]);
  });

  test("file output and bounded sinks survive unwrapping", () => {
    assert.equal(curlOf("sudo curl -o out.bin x").redirectsToFile, true);
    assert.equal(curlOf("timeout 5 wget -O f x") ?? true, true);
    assert.equal(run("timeout 5 wget -O f x")[0].redirectsToFile, true);
    assert.equal(curlOf(`bash -c "curl -s x" > out.json`).redirectsToFile, true);
    assert.equal(curlOf(`bash -c "curl -s x" | wc -c`).endsInBoundedSink, true);
    assert.equal(curlOf("sudo curl -s x | head -c 100").endsInBoundedSink, true);
    assert.equal(curlOf("echo u | xargs curl -s > f").redirectsToFile, true);
  });

  test("insideConstruct survives unwrapping", () => {
    const c = curlOf("deploy() { sudo curl -s https://x.io/a.json; }; deploy");
    assert.equal(c.insideConstruct, "deploy");
    assert.deepEqual(c.wrappedBy, ["sudo"]);
    assert.equal(curlOf(`case $1 in x) echo "$(curl -s y)";; esac`).insideConstruct, "case");
  });

  test("GP3 / P4 parser rows: what decide.ts will see", () => {
    const curlDeny = (cmd) => run(cmd).some((c) => c.argv0 === "curl" && !c.redirectsToFile && !c.endsInBoundedSink);
    for (const cmd of [
      "curl -s https://x.io/a.json",
      "npm ci && curl -s https://x.io/a.json && npm test",
      "deploy() { curl -s https://x.io/a.json; }; deploy",
      `case "$1" in x) curl -s https://x.io/a.json;; esac`,
      "diff <(curl -s https://x.io/a.json) <(echo x)",
      "FOO=1 curl -s https://x.io/a.json",
      `grep x <<< "$(curl -s https://x.io/a.json)"`,
      "pwd\ncurl -s https://x.io/a.json",
    ]) assert.equal(curlDeny(cmd), true, cmd);
    for (const cmd of [
      "curl -sL -o out.bin https://x.io/f",
      "curl -s https://x.io | head -c 200",
      `git log --grep="curl"`,
      "cat <<EOF\nsome curl text\nEOF",
      "[[ -f a.txt ]] && echo ok",
      "echo $((1+1))",
      `echo "curl \\"https://x.io/a.json\\""`,
    ]) assert.equal(curlDeny(cmd), false, cmd);
    assert.equal(parseShell(`echo "unterminated`).ok, false);
  });

  test("unwrap never throws and terminates on deep self-wrapping", () => {
    run("sudo ".repeat(200) + "curl x");
    let s = "curl -s x";
    for (let i = 0; i < 20; i++) s = `bash -c ${JSON.stringify(s)}`;
    run(s);
  });
});

describe("ADR-0008 read-deny hook text", { concurrency: CONC }, () => {
  // D-DU-DENY-1: the Read deny is one line built from the src/prompt/hooks/read-deny.md template:
  // the exact ctx_execute call for this file, no prose from the tool descriptions. Golden text + byte cap.

  const SRC = new URL("../../src/prompt/hooks/read-deny.md", import.meta.url);

  test("D-DU-DENY-1: golden Read deny text", () => {
    assert.equal(READ_DENY_MESSAGE("/repo/big.log", 307200),
      'context-mode: 307200-byte file, over the one-read limit. Run ctx_execute(language, code, file="/repo/big.log") ' +
      "and print only the answer.");
  });

  test("D-DU-DENY-1: the template is src/prompt/hooks/read-deny.md, one line, path once", () => {
    assert.equal(READ_DENY_TEMPLATE, readFileSync(SRC, "utf8"));
    const m = READ_DENY_MESSAGE("a b.txt", 16385);
    assert.equal(m.includes("\n"), false);
    assert.equal(m.split("a b.txt").length, 2);
    assert.ok(m.includes('file="a b.txt"'));
    assert.ok(m.includes("16385"));
  });

  test("D-DU-DENY-1: byte cap on the fixed text (placeholders removed)", () => {
    const fixed = READ_DENY_TEMPLATE.split("{path}").join("").split("{size}").join("");
    assert.ok(Buffer.byteLength(fixed) <= READ_DENY_FIXED_CAP, `${Buffer.byteLength(fixed)} > ${READ_DENY_FIXED_CAP}`);
    assert.ok(READ_DENY_FIXED_CAP <= 120);
    // json-1 shape: 90-byte path, 6-digit size; the old text was 465 B here.
    const json1 = READ_DENY_MESSAGE("/" + "p".repeat(89), 501233);
    assert.ok(Buffer.byteLength(json1) <= 220, String(Buffer.byteLength(json1)));
  });

  test("D-DU-DENY-1: the prompt lint covers the hook template, and fails a bad one", () => {
    const names = ["ctx_execute", "ctx_search"];
    assert.deepEqual(lintHookText("read-deny", READ_DENY_TEMPLATE, names), []);
    assert.ok(lintHookText("x", "You MUST run ctx_nope", names).length >= 2);
    assert.ok(lintHookText("x", "two\nlines", names).length >= 1);
    assert.ok(lintHookText("x", "run mcp__plugin_context-mode_context-mode__ctx_execute", names).length >= 1);
  });
});

describe("ADR-0001 external MCP tool names (ported from v1)", { concurrency: CONC }, () => {
  // PORT of tests/adapters/{codex,gemini-cli,kiro,qwen-code}-external-mcp-routing.test.ts (#529), cleanup-plan W1-adapters.
  // v1 asserted an EXTERNAL_MCP_MATCHER_PATTERN in each hook config so another server's large output was routed.
  // v2 (ADR-0008 table row "other MCP servers", D-M7-RR-2): the host matcher lists only the agent's native tools and
  // its own ctx_* tools; another server's tool is decoded to mcp:<server>:<tool> and decide() allows it with no hint.


  const cwd = "/tmp/proj";
  const claudeShape = { session_id: "s-1", transcript_path: null, cwd, model: "m", permission_mode: "default" };

  test("#529 codex: another server's tool decodes to mcp:<server>:<tool>; decide allows, no hint", () => {
    const ev = decodeCodex({ ...claudeShape, turn_id: "t1", hook_event_name: "PreToolUse", tool_name: "mcp__slack__list_channels", tool_input: {} });
    assert.equal(ev.tool.canonicalName, "mcp:slack:list_channels");
    assert.deepEqual(decide(ev, getAdapter("codex"), []), { kind: "allow" });
  });

  test("#529 qwen: another server's tool decodes to mcp:<server>:<tool>; decide allows, no hint", () => {
    const ev = decodeQwen({ ...claudeShape, hook_event_name: "PreToolUse", tool_name: "mcp__notion__query_database", tool_input: {} });
    assert.equal(ev.tool.canonicalName, "mcp:notion:query_database");
    assert.deepEqual(decide(ev, getAdapter("qwen"), []), { kind: "allow" });
  });

  test("#529 kiro: another server's tool decodes to mcp:<server>:<tool>; decide allows, no hint", () => {
    const ev = decodeKiro({ session_id: "k-1", cwd, hook_event_name: "PreToolUse", tool_name: "mcp_gdrive_search", tool_input: {} });
    assert.equal(ev.tool.canonicalName, "mcp:gdrive:search");
    assert.deepEqual(decide(ev, getAdapter("kiro"), []), { kind: "allow" });
  });

  test("#529 gemini: another server's tool is read from mcp_context; decide allows, no hint", () => {
    const ev = decodeGemini({
      session_id: "g-1", cwd, hook_event_name: "BeforeTool", tool_name: "mcp_telegram_list_messages", tool_input: {},
      mcp_context: { server_name: "telegram", tool_name: "list_messages" },
    });
    assert.equal(ev.tool.canonicalName, "mcp:telegram:list_messages");
    assert.deepEqual(decide(ev, getAdapter("gemini"), []), { kind: "allow" });
  });

  test("#529 host matcher: own ctx_* tools and native tools match; another server's tool does not (no v1 mcp__ catch-all)", () => {
    for (const [id, own, external] of [
      ["codex", "mcp__context_mode__ctx_execute", "mcp__slack__list_channels"],
      ["qwen", "mcp__context-mode__ctx_execute", "mcp__telegram__list_messages"],
      ["claude-code", "mcp__plugin_context-mode_context-mode__ctx_execute", "mcp__gdrive__search"],
    ]) {
      const re = new RegExp(buildMatcher(getAdapter(id)));
      assert.equal(re.test(own), true, id + " own");
      assert.equal(re.test(external), false, id + " external");
      assert.equal(re.test("Bash") || re.test("run_shell_command"), true, id + " native shell");
    }
  });
});

describe("ADR-0008 security rules (ported from v1)", { concurrency: CONC }, () => {
  // W1-core PORT of tests/security.test.ts, tests/core/deny-policy.test.ts, tests/security/project-boundary-852.test.ts
  // to the v2 decide() surface (ADR-0008, impl/08 §4, §6). Same inputs as v1; v2 verdict shape ({kind}).

  const CC = getAdapter("claude-code");
  const RULES = ["Bash(sudo *)", "Bash(rm -rf /*)"];
  const ev = (name, input, cwd = "/tmp") => ({ event: "PreToolUse", agent: "claude-code", sessionId: "s", cwd, tool: { name, canonicalName: name, input } });
  const bash = (command, deny = RULES) => decide(ev("Bash", { command }), CC, deny);

  // security.test.ts "Chained Command Evaluation" + "Chained Command Splitting" + "extractSubshellCommands"
  for (const c of [
    "echo ok && sudo rm -rf /", "cd /tmp; sudo apt install vim", "cat file | rm -rf /etc",
    "git status\nsudo rm -rf /", "echo a & sudo ls", "git status $(sudo rm -rf /)", "git status `sudo rm -rf /`",
    "git status $(sudo rm -rf / | cat)", "echo \"$(sudo rm -rf /)\"", "echo $(printf '(x)' | cat) && sudo ls",
    "git checkout $(echo $(sudo ls))", "git status \\\\$(sudo rm -rf /)", "echo $(( $(sudo rm -rf /) + 1 ))",
    "echo $(( `sudo ls` + 1 ))", "SUDO rm -rf /",
  ]) {
    test(`[W1-core] deny rule holds across chain/subshell/quote forms: ${JSON.stringify(c)}`, () => {
      assert.equal(bash(c).kind, "deny");
    });
  }
  for (const c of [
    "echo hello && git status", "echo hello \"&& sudo ls\"", "echo 'test; sudo ls'", "echo '$(sudo rm -rf /)'",
    "echo $((1 + 2))", "echo hello \\& sudo ls", "sudoedit x", "git status",
  ]) {
    test(`[W1-core] safe forms are not denied: ${JSON.stringify(c)}`, () => {
      assert.equal(bash(c).kind, "allow");
    });
  }
  test("[W1-core] deny reason names the matched user pattern", () => {
    const d = bash("echo ok && sudo ls");
    assert.equal(d.kind, "deny");
    assert.ok(d.reason.includes("Bash(sudo *)"));
  });
  test("[W1-core] colon format Bash(tree:*) is a prefix rule (parseBashPattern parity)", () => {
    assert.notEqual(matchesAnyDenyPattern("tree -L 2", ["Bash(tree:*)"]), null);
    assert.equal(matchesAnyDenyPattern("treetop", ["Bash(tree:*)"]), null);
    assert.equal(matchesAnyDenyPattern("x", ["Read(.env)", "notapattern", "Bash("]), null);
  });

  // security.test.ts "evaluateFilePath" + deny-policy.test.ts Windows glob rows
  const readHit = (path, glob, projectDir = "/tmp/p") => matchesAnyDenyPattern(path, ["Read(" + glob + ")"], { tool: "Read", projectDir });
  test("[W1-core] Read(**/.env) matches nested and top-level .env", () => {
    assert.notEqual(readHit("/tmp/p/deep/nested/.env", "**/.env"), null);
    assert.notEqual(readHit("/tmp/p/.env", "**/.env"), null);
  });
  test("[W1-core] Read(**/*credentials*) matches secrets/credentials.json, not readme.md", () => {
    assert.notEqual(readHit("/tmp/p/secrets/credentials.json", "**/*credentials*"), null);
    assert.equal(readHit("/tmp/p/readme.md", "**/*credentials*"), null);
  });
  test("[W1-core] Windows backslash glob matches a backslash candidate", () => {
    assert.notEqual(readHit("C:\\Users\\runner\\proj\\secret.env", "C:\\Users\\runner\\proj\\secret.env"), null);
  });
  test("[W1-core] a ../ traversal into a denied absolute dir is resolved before the match (v1 projectRoot fix)", () => {
    const d = decide(ev("Read", { file_path: "../.ssh/id_rsa" }, "/tmp/p"), CC, ["Read(//tmp/.ssh/**)"]);
    assert.equal(d.kind, "deny");
    assert.equal(decide(ev("Read", { file_path: "/tmp/p/x" }, "/tmp/p"), CC, ["Read(//tmp/.ssh/**)"]).kind, "allow");
  });

  // project-boundary-852: v2 containment is src/core/project/contain.ts isInside (tests/v2/store/contain.test.mjs
  // covers it); the ctx_execute file argument boundary is checked here end to end.
  test("[W1-core] #852: ctx_execute file outside the project is refused, inside is allowed (symlink escape too)", async () => {
    const { ctxExecute } = await import("../../src/core/tools/execute.ts");
    const root = realpathSync(mkdtempSync(join(tmpdir(), "cm-852-")));
    const outside = realpathSync(mkdtempSync(join(tmpdir(), "cm-852o-")));
    try {
      writeFileSync(join(root, "in.txt"), "x");
      writeFileSync(join(outside, "out.txt"), "y");
      symlinkSync(outside, join(root, "link"));
      const k = "1".repeat(16);
      const ctx = { project: { projectKey: k, projectDir: join(root, "p"), dbPath: join(root, "p", "c.db"), worktree: root, containmentRoot: root, agent: "claude-code", source: "env:CLAUDE_PROJECT_DIR" }, sessionId: "s", turn: 1, signal: new AbortController().signal };
      const run = (file) => ctxExecute.handler({ language: "shell", code: "echo ok", file }, ctx);
      assert.equal((await run("in.txt")).isError, false);
      assert.equal((await run(join(outside, "out.txt"))).isError, true);
      assert.equal((await run("../" + outside.split("/").pop() + "/out.txt")).isError, true);
      assert.equal((await run("link/out.txt")).isError, true);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });
});

describe("ADR-0008 decide rule table and golden rows", () => {
  // serial: one test sets the require-security env var and restores it.
  // impl/08 §6: decide() rule table, §6.3 golden table (30 rows), V8 25/25 deny, DECISIONS-r8 Read-deny 4 cases,
  // GP3/webfetch-allow-claude-ai-artifacts, GP3/powershell-same-hint-as-bash, drafts.md hook text blocks (B2).

  const CC = getAdapter("claude-code");
  const CODEX = getAdapter("codex"); // no Read tool: shell dumps are checked (6a); no replace: size-guess denies stay
  let dir, big, small;

  before(() => {
    dir = mkdtempSync(join(tmpdir(), "cm-decide-"));
    big = join(dir, "big.log");
    small = join(dir, "small.txt");
    writeFileSync(big, "x".repeat(300 * 1024));
    writeFileSync(small, "hello\n");
  });
  after(() => rmSync(dir, { recursive: true, force: true }));

  function ev(canonicalName, input, extra = {}) {
    return { event: "PreToolUse", agent: "claude-code", sessionId: "s1", cwd: dir, tool: { name: canonicalName, canonicalName, input }, ...extra };
  }
  const bash = (command, row = CC, deny = []) => decide(ev("Bash", { command }), row, deny);
  // Owner decision 2026-10-20 (D-M7-RR-1): size-guess denies run only on rows with no replace (CODEX here).
  const bashNoReplace = (command, deny = []) => bash(command, CODEX, deny);

  // §6.3: [command, expected kind, deny kind or null]
  const CURL = "curl -s https://x.io/a.json";
  const GOLDEN = [
    [CURL, "deny", "curl"],
    ["curl -sL -o out.bin https://x.io/f", "allow-or-hint", null],
    ["curl -s https://x.io | head -c 200", "allow-or-hint", null],
    ['git log --grep="curl"', "allow-or-hint", null],
    ["cat <<EOF\ncurl -s https://x.io/a.json\nEOF", "allow-or-hint", null],
    [`npm ci && ${CURL} && npm test`, "deny", "curl"],
    ["./gradlew build", "deny", "build"],
    [`sudo ${CURL}`, "deny", "curl"],
    [`env FOO=1 ${CURL}`, "deny", "curl"],
    [`time ${CURL}`, "deny", "curl"],
    [`nice -n 10 ${CURL}`, "deny", "curl"],
    [`timeout 5 ${CURL}`, "deny", "curl"],
    ["echo url | xargs curl -s", "deny", "curl"],
    [`command ${CURL}`, "deny", "curl"],
    [`bash -c "${CURL}"`, "deny", "curl"],
    [`sh -c "${CURL}"`, "deny", "curl"],
    [`echo "$(${CURL})"`, "deny", "curl"],
    ["echo `" + CURL + "`", "deny", "curl"],
    ["curl -s https://x.io/a.json | jq '.data'", "allow-or-hint", null],
    ["curl -s https://x.io/a.json | jq 'length'", "allow-or-hint", null],
    ["[[ -f a.txt ]] && echo ok", "allow-or-hint", null],
    ["echo $((1+1))", "allow-or-hint", null],
    [`deploy() { ${CURL}; }; deploy`, "deny", "curl"],
    [`case "$1" in x) ${CURL};; esac`, "deny", "curl"],
  ];

  for (const [cmd, want, kind] of GOLDEN) {
    test(`§6.3 golden: ${JSON.stringify(cmd)}`, () => {
      const d = bashNoReplace(cmd);
      if (want === "deny") {
        assert.equal(d.kind, "deny");
        assert.equal(d.reason, denyMessage(kind, cmd, CODEX));
      } else assert.notEqual(d.kind, "deny", JSON.stringify(d));
    });
  }

  test("§6.3 golden: WebFetch of a claude.ai artifact URL is allowed (GP3/webfetch-allow-claude-ai-artifacts)", () => {
    for (const url of ["https://claude.ai/public/artifacts/abc", "https://x.claude.site/a", "https://a.claudeusercontent.com/b"]) {
      assert.deepEqual(decide(ev("WebFetch", { url }), CC, []), { kind: "allow" });
    }
    for (const url of ["https://example.com/a", "https://claude.ai.evil.io/x", "https://notclaude.ai/x"]) {
      const d = decide(ev("WebFetch", { url }), CC, []);
      assert.equal(d.kind, "deny");
      assert.equal(d.reason, denyMessage("webfetch", url, CC));
      assert.ok(d.reason.includes(CC.toolNamePrefix + "ctx_index, then " + CC.toolNamePrefix + "ctx_search"));
    }
  });

  test("§6.3 / DECISIONS-r8 Read-deny case 1: unranged Read over OUTPUT_CAP is denied", () => {
    const d = decide(ev("Read", { file_path: big }), CC, []);
    assert.deepEqual(d, { kind: "deny", reason: READ_DENY_MESSAGE(big, 300 * 1024, CC.toolNamePrefix) });
  });
  test("Read-deny case 2: ranged Read over OUTPUT_CAP is never denied", () => {
    for (const input of [{ file_path: big, offset: 1 }, { file_path: big, limit: 200 }, { file_path: big, offset: 0, limit: 10 }]) {
      assert.deepEqual(decide(ev("Read", input), CC, []), { kind: "allow" }); // D-M7-RR-2: no Read hint
    }
  });
  test("Read-deny case 3: unbounded one-file shell dump over OUTPUT_CAP is denied (no Read tool host)", () => {
    const p = big.split(sep).join("/"); // shell spelling of the path; "\\" is an escape in Bash
    for (const cmd of [`cat ${p}`, `head ${p}`, `tail ${p}`, `sed -n p ${p}`, `less ${p}`, `jq . ${p}`, `bat ${p}`, `more ${p}`, "cat big.log"]) {
      const d = bash(cmd, CODEX);
      assert.deepEqual(d, { kind: "deny", reason: READ_DENY_MESSAGE(big, 300 * 1024, CODEX.toolNamePrefix) }, cmd);
    }
  });
  test("Read-deny case 4: bounded shell dump is never denied", () => {
    for (const cmd of ["tail -c 200 big.log", "head -n 20 big.log", "tail -n 20 big.log", "head -20 big.log", "sed -n '1,20p' big.log", "cat small.txt"]) {
      assert.notEqual(bash(cmd, CODEX).kind, "deny", cmd);
    }
    assert.notEqual(bash("cat big.log", CC).kind, "deny"); // host with a Read tool: no shell-dump rule
    assert.notEqual(decide(ev("Read", { file_path: small }), CC, []).kind, "deny");
  });
  test("Read path keys: Gemini/Qwen absolute_path", () => {
    assert.equal(decide(ev("Read", { absolute_path: big }), getAdapter("qwen"), []).kind, "deny");
  });

  test("§6.3 golden: echo \"unterminated -> ParseError, Q4 verdict", () => {
    assert.notEqual(bash('echo "unterminated').kind, "deny"); // no user rule could match
    // step 3 sees the whole text first: a rule on the first command is a plain user deny
    assert.deepEqual(bash('echo "unterminated', CC, ["Bash(echo:*)"]), { kind: "deny", reason: USER_DENY_REASON_PREFIX + "Bash(echo:*)" });
    assert.deepEqual(bash('ls; rm -rf / "x', CC, ["Bash(rm -rf:*)"]), { kind: "deny", reason: prefixToolNames(PARSE_ERROR_DENY_LINE, CC.toolNamePrefix) });
  });

  test("V8: 10 curl, 10 wget, 5 build commands -> 25/25 deny", () => {
    const cmds = [];
    for (let i = 0; i < 10; i++) cmds.push(`curl -s https://api.example.com/v1/items?page=${i}`);
    for (let i = 0; i < 10; i++) cmds.push(`wget -qO- https://data.example.com/dump-${i}.json`);
    cmds.push("./gradlew build", "gradle test", "mvn package", "./mvnw verify", "sbt compile");
    let denied = 0;
    for (const c of cmds) if (bashNoReplace(c).kind === "deny") denied++;
    assert.equal(denied, 25);
  });

  test("inline HTTP is denied with kind http", () => {
    const cmd = `node -e "fetch('https://x.io').then(r=>r.text()).then(console.log)"`;
    assert.deepEqual(bashNoReplace(cmd), { kind: "deny", reason: denyMessage("http", cmd, CODEX) });
    const py = `python3 -c "import requests; print(requests.get('https://x.io').text)"`;
    assert.equal(bashNoReplace(py).reason, denyMessage("http", py, CODEX));
  });

  test("#166: curl to a file that is not silent, or is verbose, is denied", () => {
    assert.equal(bashNoReplace("curl -o out.bin https://x.io/f").kind, "deny");
    assert.equal(bashNoReplace("curl -s -v -o out.bin https://x.io/f").kind, "deny");
    assert.notEqual(bashNoReplace("curl -s -o out.bin https://x.io/f").kind, "deny");
  });

  test("deny message: intent from description, tool prefix from the row", () => {
    const d = decide(ev("Bash", { command: CURL, description: "get items" }), CODEX, []);
    assert.equal(d.reason, denyMessage("curl", CURL, CODEX, "get items"));
    const lines = d.reason.split("\n");
    assert.equal(lines[2], "Tool: " + CODEX.toolNamePrefix + "ctx_execute");
    assert.deepEqual(JSON.parse(lines[3]), { language: "shell", code: CURL, intent: "get items" });
  });

  test("user deny is first, for Bash segments, Read and ctx_execute", () => {
    assert.deepEqual(bash("ls && rm -rf /tmp/x", CC, ["Bash(rm -rf:*)"]), { kind: "deny", reason: USER_DENY_REASON_PREFIX + "Bash(rm -rf:*)" });
    assert.deepEqual(bash("sudo rm -rf /tmp/x", CC, ["Bash(rm -rf:*)"]), { kind: "deny", reason: USER_DENY_REASON_PREFIX + "Bash(rm -rf:*)" });
    assert.equal(bash(CURL, CC, ["Bash(curl:*)"]).reason, USER_DENY_REASON_PREFIX + "Bash(curl:*)"); // before the curl rule
    const r = decide(ev("ctx_execute", { language: "shell", code: "rm -rf /tmp/x" }), CC, ["Bash(rm -rf:*)"]);
    assert.equal(r.kind, "deny");
    // E1: newline/CR does not bypass a rule
    assert.equal(bash("ls\nrm -rf /tmp/x", CC, ["Bash(rm -rf:*)"]).kind, "deny");
    assert.equal(bash("ls\rrm -rf /tmp/x", CC, ["Bash(rm -rf:*)"]).kind, "deny");
  });

  test("E2: unreadable policy fails closed only with the env flag", () => {
    const saved = process.env[REQUIRE_SECURITY_ENV];
    const savedWrite = process.stderr.write;
    process.stderr.write = () => true;
    try {
      process.env[REQUIRE_SECURITY_ENV] = "1";
      assert.deepEqual(bash("ls", CC, null), { kind: "deny", reason: prefixToolNames(POLICY_UNREADABLE_LINE, CC.toolNamePrefix) });
      delete process.env[REQUIRE_SECURITY_ENV];
      assert.notEqual(bash("ls", CC, null).kind, "deny");
    } finally {
      process.stderr.write = savedWrite;
      if (saved === undefined) delete process.env[REQUIRE_SECURITY_ENV]; else process.env[REQUIRE_SECURITY_ENV] = saved;
    }
  });

  test("D-M7-RR-2: no hint on any PreToolUse: bounded and unbounded Bash, PowerShell, Grep, Read, other MCP", () => {
    for (const row of [CC, CODEX]) {
      for (const c of ["pwd", "whoami", "git status", "node --version", "rm a.txt", "mv a b", "cp a b", "ls -la", "rm -v a.txt", "pwd > out.txt", "git log", "npm test"]) {
        assert.deepEqual(bash(c, row), { kind: "allow" }, row.id + " " + c);
      }
    }
  });

  test("GP3/powershell-same-decision-as-bash", () => {
    const ps = decide(ev("PowerShell", { command: "Get-ChildItem -Recurse" }), CC, []);
    const sh = bash("ls -R");
    assert.deepEqual(ps, sh);
    assert.deepEqual(ps, { kind: "allow" });
  });

  test("Grep, other MCP, own MCP tools and unknown tools are allowed with no hint (D-M7-RR-2)", () => {
    assert.deepEqual(decide(ev("Grep", { pattern: "x" }), CC, []), { kind: "allow" });
    assert.deepEqual(decide(ev("mcp:github:get_file", {}), CODEX, []), { kind: "allow" });
    assert.deepEqual(decide(ev("mcp:github:get_file", {}), CC, []), { kind: "allow" });
    assert.deepEqual(decide(ev("mcp:context-mode:ctx_stats", {}), CC, []), { kind: "allow" });
    assert.deepEqual(decide(ev("Edit", { file_path: big }), CC, []), { kind: "allow" });
    assert.deepEqual(decide(ev("Read", { file_path: small }), CC, []), { kind: "allow" });
  });

  test("D-M7-RR-1: a replace row (claude-code, pi) drops the Bash size-guess denies on the main agent", () => {
    const sizeGuess = [CURL, "wget -qO- https://data.example.com/d.json", "./gradlew build", "mvn package",
      `node -e "fetch('https://x.io').then(r=>r.text()).then(console.log)"`];
    for (const cmd of sizeGuess) {
      assert.deepEqual(bash(cmd, CC), { kind: "allow" }, cmd);
      assert.equal(bash(cmd, CODEX).kind, "deny", "no replace: one path, unchanged (ADR-0001) " + cmd);
    }
    const PI = getAdapter("pi");
    assert.deepEqual(decide({ ...ev("Bash", { command: CURL }), agent: "pi" }, PI, []), { kind: "allow" });
  });

  test("D-M7-RR-1: subagent calls keep the size-guess denies (ADR-0016 case A/B/C)", () => {
    const d = decide(ev("Bash", { command: CURL }, { agentId: "sub-1", agentType: "sheller" }), CC, []);
    assert.deepEqual(d, { kind: "deny", reason: denyMessage("curl", CURL, CC) });
  });

  test("D-M7-RR-1: kept on a replace row: user deny, parse-error deny, Read deny, WebFetch deny", () => {
    assert.deepEqual(bash(CURL, CC, ["Bash(curl:*)"]), { kind: "deny", reason: USER_DENY_REASON_PREFIX + "Bash(curl:*)" });
    assert.deepEqual(bash('ls; rm -rf / "x', CC, ["Bash(rm -rf:*)"]), { kind: "deny", reason: prefixToolNames(PARSE_ERROR_DENY_LINE, CC.toolNamePrefix) });
    assert.deepEqual(decide(ev("Read", { file_path: big }), CC, []), { kind: "deny", reason: READ_DENY_MESSAGE(big, 300 * 1024, CC.toolNamePrefix) });
    assert.equal(decide(ev("WebFetch", { url: "https://example.com/a" }), CC, []).kind, "deny");
  });

  test("rule order (T-ROUTE): user deny beats the Read deny", () => {
    const rule = `Read(${big.split(sep).join("/")})`; // deny globs use "/" on every OS
    const r = decide(ev("Read", { file_path: big }), CC, [rule]);
    assert.equal(r.reason, USER_DENY_REASON_PREFIX + rule);
  });

  test("decide never returns replace", () => {
    for (const [cmd] of GOLDEN) assert.notEqual(bash(cmd).kind, "replace");
  });

  test("B2: drafts.md deny-* blocks equal the code's text (hint-* blocks retired, D-M7-RR-2)", () => {
    const md = readFileSync(new URL("../../docs/v2/prompt/drafts.md", import.meta.url), "utf8");
    const block = (id) => {
      const at = md.indexOf(`<!-- id: ${id} -->`);
      assert.ok(at >= 0, id);
      const open = md.indexOf("```text\n", at) + "```text\n".length;
      return md.slice(open, md.indexOf("\n```", open));
    };
    const row = { toolNamePrefix: "{prefix}" };
    for (const k of ["curl", "http", "build"]) assert.equal(block("deny-" + k), denyMessage(k, "{command}", row, "{intent}"));
    assert.equal(block("deny-webfetch"), denyMessage("webfetch", "{url}", row));
    assert.equal(block("deny-read"), READ_DENY_MESSAGE("{path}", "{size}"));
    assert.ok(OUTPUT_CAP > 0);
  });

  // D-CDX-CAT-1: live Codex 0.156.1 (codex exec + fake provider) sends exec_command as tool_name "Bash"; the model
  // wraps the cat in a chain or a zsh -lc. Each unbounded one-file dump that reaches stdout is denied, as for one command.
  test("D-CDX-CAT-1: a chained or zsh-wrapped unbounded dump over OUTPUT_CAP is denied on a no-Read host", () => {
    const p = big.split(sep).join("/");
    const want = { kind: "deny", reason: READ_DENY_MESSAGE(big, 300 * 1024, CODEX.toolNamePrefix) };
    for (const cmd of [`cd ${dir.split(sep).join("/")} && cat big.log`, "cat big.log; echo done", "ls && cat big.log", "echo ---; cat big.log",
      `zsh -lc "cat ${p}"`, `/bin/zsh -lc 'cat big.log'`, "true || cat big.log"]) {
      assert.deepEqual(bash(cmd, CODEX), want, cmd);
    }
  });
  test("D-CDX-CAT-1: a dump that feeds a pipe, a file or a bound is not denied; claude-code (Read tool) is unchanged", () => {
    for (const cmd of ["cat big.log | grep x", "cat big.log | head -n 5", "cat big.log > /dev/null", "cat big.log | wc -l; ls", "ls && head -n 3 big.log", "cat small.txt && ls"]) {
      assert.notEqual(bash(cmd, CODEX).kind, "deny", cmd);
    }
    assert.notEqual(bash("ls && cat big.log", CC).kind, "deny");
  });

  // D-PWSH-DUMP-1: Codex 0.166 runs commands in PowerShell on Windows. The tester's `Get-Content application.log`
  // (371,243 bytes) ran with no deny while the plain and chained cat were denied. Same deny text and redirect as cat.
  const psWant = () => ({ kind: "deny", reason: READ_DENY_MESSAGE(big, 300 * 1024, CODEX.toolNamePrefix) });
  let bigq;
  before(() => { bigq = big.split(sep).join("/"); });
  test("D-PWSH-DUMP-1: an unbounded Get-Content / gc / type / cat of a large file is denied (tester repro)", () => {
    for (const cmd of ["cat big.log", "Get-Content big.log", "get-content big.log", "GET-CONTENT big.log", "gc big.log", "type big.log",
      "Get-Content -Path big.log", "Get-Content -LiteralPath big.log", "Get-Content -Path:big.log", "Get-Content -Pa big.log", "gc big.log -Raw", "Get-Content big.log -Encoding UTF8",
      "Get-Content -Raw -Encoding utf8 -Path big.log", "Get-Content 'big.log'", 'Get-Content "big.log"', "Get-Content big.log -ReadCount 100",
      `Get-Content '${bigq}'`, `Get-Content -LiteralPath "${bigq}" -Raw`, "Get-Content big.log 2>&1", "Get-Content big.log | Out-String",
      "Get-Content big.log | Write-Output", "Get-Content big.log | Out-Host", "ls; Get-Content big.log", "ls && Get-Content big.log",
      `cd ${dir.split(sep).join("/")}; Get-Content big.log`, "cat -Raw big.log", "cat -Path big.log", "type -Path big.log"]) {
      assert.deepEqual(bash(cmd, CODEX), psWant(), cmd);
    }
  });
  test("D-PWSH-DUMP-1: a bounded, filtered, redirected or small PowerShell read is not denied", () => {
    for (const cmd of ["Get-Content big.log -TotalCount 3", "Get-Content big.log -Head 5", "gc big.log -First 5", "Get-Content big.log -Tail 20", "Get-Content -Path big.log -Last 7",
      "Get-Content big.log -Tail:20", "Get-Content big.log -TotalCount:3 -Raw", "Get-Content -TotalCount 3 big.log", "gc -Tail 3 -Path big.log", "cat big.log -TotalCount 3", "type big.log -Head 3",
      "Get-Content big.log | Select-Object -First 5", "Get-Content big.log | Select-String error", "gc big.log | Select-Object -Last 5",
      "Get-Content big.log | Measure-Object -Line", "Get-Content big.log > out.txt", "Get-Content big.log | Out-File out.txt",
      "Get-Content small.txt", "gc small.txt -Raw", "type small.txt", "Get-Content small.txt | Out-String", "Get-Content missing.log", "Get-Content",
      "Get-Content big.log, small.txt", "Get-Content *.log", "Get-ChildItem big.log", "Get-Item big.log"]) {
      assert.notEqual(bash(cmd, CODEX).kind, "deny", cmd);
    }
  });
  test("D-PWSH-DUMP-1: [IO.File]::ReadAllText / ReadAllLines / ReadAllBytes of a large file is denied, a small or bounded one is not", () => {
    for (const cmd of ["[IO.File]::ReadAllText('big.log')", "[System.IO.File]::ReadAllText('big.log')", '[System.IO.File]::ReadAllText("big.log")', "[io.file]::readalltext('big.log')",
      "[IO.File]::ReadAllLines('big.log')", "[IO.File]::ReadAllBytes('big.log')", `[IO.File]::ReadAllText('${bigq}')`, "ls; [IO.File]::ReadAllText('big.log')"]) {
      assert.deepEqual(bash(cmd, CODEX), psWant(), cmd);
    }
    for (const cmd of ["[IO.File]::ReadAllText('small.txt')", "[IO.File]::ReadAllText('big.log') | Select-Object -First 5", "[IO.File]::ReadAllLines('big.log') | Select-Object -First 5",
      "[IO.File]::ReadAllText('big.log').Substring(0,100)", "[IO.File]::ReadAllLines('big.log')[0..9]", "[IO.File]::ReadLines('big.log') | Select-Object -First 5", "[IO.File]::Exists('big.log')"]) {
      assert.notEqual(bash(cmd, CODEX).kind, "deny", cmd);
    }
  });
  test("D-PWSH-DUMP-1: a PowerShell or cmd script string is unwrapped, as bash -c is", () => {
    for (const cmd of [`powershell -NoProfile -Command "Get-Content '${bigq}'"`, `pwsh -c "Get-Content big.log"`, `powershell.exe -NoProfile -NonInteractive -Command "gc big.log -Raw"`,
      `pwsh -Command "ls; Get-Content big.log"`, "cmd /c type big.log", "cmd.exe /d /s /c \"type big.log\"", "cmd /c cat big.log"]) {
      assert.deepEqual(bash(cmd, CODEX), psWant(), cmd);
    }
    for (const cmd of [`pwsh -Command "Get-Content big.log -TotalCount 3"`, `powershell -Command "Get-Content big.log | Select-Object -First 5"`, "cmd /c type small.txt", `pwsh -Command "Get-Content small.txt"`]) {
      assert.notEqual(bash(cmd, CODEX).kind, "deny", cmd);
    }
  });
  test("D-PWSH-DUMP-1: a PowerShell dump on a Read-tool replace row (claude-code) still runs and PostToolUse replaces it", () => {
    assert.notEqual(bash("Get-Content big.log", CC).kind, "deny");
    assert.notEqual(bash("ls; Get-Content big.log", CC).kind, "deny");
  });
  test("D-PWSH-DUMP-1: the PowerShell word reader keeps backslashes, honours quotes and the backtick, and stops at a pipe or redirect", () => {
    assert.deepEqual(psWords("Get-Content C:\\logs\\app.log -Raw"), ["Get-Content", "C:\\logs\\app.log", "-Raw"]);
    assert.deepEqual(psWords("Get-Content 'C:\\a b\\x.log' -TotalCount 3"), ["Get-Content", "C:\\a b\\x.log", "-TotalCount", "3"]);
    assert.deepEqual(psWords('Get-Content "C:\\a b\\x.log"'), ["Get-Content", "C:\\a b\\x.log"]);
    assert.deepEqual(psWords("Get-Content C:\\a` b\\x.log"), ["Get-Content", "C:\\a b\\x.log"]);
    assert.deepEqual(psWords("Get-Content 'it''s.log'"), ["Get-Content", "it's.log"]);
    assert.deepEqual(psWords("Get-Content a.log 2>&1"), ["Get-Content", "a.log"]);
    assert.deepEqual(psWords("Get-Content a.log > out.txt"), ["Get-Content", "a.log"]);
    assert.deepEqual(psWords("gc a.log | Select-Object -First 5"), ["gc", "a.log"]);
    assert.deepEqual(psWords("[IO.File]::ReadAllText('C:\\a b.log')"), ["[IO.File]::ReadAllText", "C:\\a b.log"]);
  });
  test("D-PWSH-DUMP-1: Windows paths with a drive letter and backslashes are read whole, not as escapes", () => {
    assert.deepEqual(psDump(psWords("Get-Content C:\\logs\\app.log")), { file: "C:\\logs\\app.log", bounded: false });
    assert.deepEqual(psDump(psWords("Get-Content 'C:\\a b\\x.log' -TotalCount 3")), { file: "C:\\a b\\x.log", bounded: true });
    assert.equal(psDump(psWords("Get-Content a.log, b.log")), null);
  });
});

describe("ADR-0008 user deny rules from settings", () => {
  // serial: tests set process.env HOME and CLAUDE_CONFIG_DIR.
  // Unit tests for src/core/policy/user-deny.ts (impl/08 §4.1, §4.2; DECISIONS-r9 E2, V17).
  // readUserDeny(projectDir, agent): string[] | null — null only for a present but unreadable/unparsable file.
  // matchesAnyDenyPattern(text, patterns, subject): first matching raw pattern or null.

  let root, home, proj;
  const saved = { HOME: process.env.HOME, CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR };

  before(() => {
    root = mkdtempSync(join(tmpdir(), "cm-user-deny-"));
    home = join(root, "home");
    proj = join(root, "proj");
    mkdirSync(home);
    mkdirSync(proj);
    process.env.HOME = home; process.env.USERPROFILE = home;
    delete process.env.CLAUDE_CONFIG_DIR;
  });
  after(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    rmSync(root, { recursive: true, force: true });
  });

  function fresh(name) {
    const h = join(root, name, "home");
    const p = join(root, name, "proj");
    mkdirSync(h, { recursive: true });
    mkdirSync(p, { recursive: true });
    process.env.HOME = h; process.env.USERPROFILE = h;
    return { h, p };
  }
  function writeSettings(dir, file, body) {
    mkdirSync(join(dir, ".claude"), { recursive: true });
    writeFileSync(join(dir, ".claude", file), typeof body === "string" ? body : JSON.stringify(body));
  }

  // ---- readUserDeny (§4.1) ----

  test("[M3] readUserDeny: no deny config file at all -> [] (missing is never an error)", () => {
    const { p } = fresh("none");
    assert.deepEqual(readUserDeny(p, "claude-code"), []);
  });

  test("[M3] readUserDeny: project entries first, then user; raw strings unchanged", () => {
    const { h, p } = fresh("merge");
    writeSettings(p, "settings.local.json", { permissions: { deny: ["Bash(git push:*)"] } });
    writeSettings(p, "settings.json", { permissions: { deny: ["Bash(rm -rf *)", "Read(./x/**)"] } });
    writeSettings(h, "settings.json", { permissions: { deny: ["Read(~/secret/**)", "Bash(rm -rf *)"] } });
    assert.deepEqual(readUserDeny(p, "claude-code"),
      ["Bash(git push:*)", "Bash(rm -rf *)", "Read(./x/**)", "Read(~/secret/**)", "Bash(rm -rf *)"]);
  });

  test("[M3] readUserDeny: a file with no permissions.deny contributes nothing", () => {
    const { h, p } = fresh("nodeny");
    writeSettings(p, "settings.json", { permissions: { allow: ["Bash(ls)"] } });
    writeSettings(h, "settings.json", { model: "x" });
    assert.deepEqual(readUserDeny(p, "claude-code"), []);
  });

  test("[M3] readUserDeny: user settings honour CLAUDE_CONFIG_DIR", () => {
    const { p } = fresh("cfgdir");
    const cfg = join(root, "cfgdir", "cfg");
    mkdirSync(cfg);
    writeFileSync(join(cfg, "settings.json"), JSON.stringify({ permissions: { deny: ["Bash(sudo *)"] } }));
    process.env.CLAUDE_CONFIG_DIR = cfg;
    try {
      assert.deepEqual(readUserDeny(p, "claude-code"), ["Bash(sudo *)"]);
    } finally {
      delete process.env.CLAUDE_CONFIG_DIR;
    }
  });

  test("[M3] GP3 E2 malformed-policy fail-closed: present but unparsable project file -> null, not []", () => {
    const { p } = fresh("bad-json");
    writeSettings(p, "settings.json", "{ \"permissions\": { \"deny\": [\"Bash(rm *)\" ");
    assert.equal(readUserDeny(p, "claude-code"), null);
  });

  test("[M3] GP3 E2 malformed-policy fail-closed: present but unparsable user file -> null", () => {
    const { h, p } = fresh("bad-user");
    writeSettings(h, "settings.json", "not json");
    assert.equal(readUserDeny(p, "claude-code"), null);
  });

  test("[M3] GP3 E2 malformed-policy fail-closed: deny of the wrong shape -> null", () => {
    for (const body of [{ permissions: { deny: "Bash(rm *)" } }, { permissions: { deny: [1] } }, { permissions: "x" }, ["x"]]) {
      const { p } = fresh("shape-" + JSON.stringify(body).length + Math.random().toString(36).slice(2));
      writeSettings(p, "settings.json", body);
      assert.equal(readUserDeny(p, "claude-code"), null, JSON.stringify(body));
    }
  });

  test("[M3] GP3 E2 malformed-policy fail-closed: present but unreadable file -> null", { skip: process.platform === "win32" || process.getuid?.() === 0 }, () => {
    const { p } = fresh("unreadable");
    writeSettings(p, "settings.json", { permissions: { deny: [] } });
    const f = join(p, ".claude", "settings.json");
    chmodSync(f, 0o000);
    try {
      assert.equal(readUserDeny(p, "claude-code"), null);
    } finally {
      chmodSync(f, 0o644);
    }
  });

  test("[M3] GP3 E2: valid policy -> normal list (flag has no effect on reading)", () => {
    const { p } = fresh("valid");
    writeSettings(p, "settings.json", { permissions: { deny: ["Bash(rm -rf *)"] } });
    process.env.CONTEXT_MODE_REQUIRE_SECURITY = "1";
    try {
      assert.deepEqual(readUserDeny(p, "claude-code"), ["Bash(rm -rf *)"]);
    } finally {
      delete process.env.CONTEXT_MODE_REQUIRE_SECURITY;
    }
  });

  test("[M3] readUserDeny: an agent with no deny-config file in the docs -> []", () => {
    const { h, p } = fresh("codex");
    writeSettings(h, "settings.json", { permissions: { deny: ["Bash(rm *)"] } });
    assert.deepEqual(readUserDeny(p, "codex"), []);
  });

  // ---- matchesAnyDenyPattern, Bash (§4.2) ----

  const BASH = { tool: "Bash" };

  test("[M3] matchesAnyDenyPattern Bash: * glob, first match wins, null on no match", () => {
    const pats = ["Bash(git push *)", "Bash(rm -rf *)", "Bash(rm *)"];
    assert.equal(matchesAnyDenyPattern("rm -rf /", pats, BASH), "Bash(rm -rf *)");
    assert.equal(matchesAnyDenyPattern("ls -la", pats, BASH), null);
    assert.equal(matchesAnyDenyPattern("echo rm -rf /", pats, BASH), null, "glob is anchored at both ends");
  });

  test("[M3] matchesAnyDenyPattern Bash: ? is one char; literal otherwise", () => {
    assert.equal(matchesAnyDenyPattern("cat a.txt", ["Bash(cat ?.txt)"], BASH), "Bash(cat ?.txt)");
    assert.equal(matchesAnyDenyPattern("cat ab.txt", ["Bash(cat ?.txt)"], BASH), null);
    assert.equal(matchesAnyDenyPattern("npm test", ["Bash(npm test)"], BASH), "Bash(npm test)");
  });

  test("[M3] matchesAnyDenyPattern Bash: trailing :* is a prefix rule (command alone or command + space + args)", () => {
    const p = ["Bash(git push:*)"];
    assert.equal(matchesAnyDenyPattern("git push", p, BASH), "Bash(git push:*)");
    assert.equal(matchesAnyDenyPattern("git push origin main", p, BASH), "Bash(git push:*)");
    assert.equal(matchesAnyDenyPattern("git pushx", p, BASH), null);
  });

  test("[M3] matchesAnyDenyPattern Bash: * spans newlines (E1: a newline does not hide the tail)", () => {
    assert.equal(matchesAnyDenyPattern("rm -rf /tmp/x\necho done", ["Bash(rm -rf *)"], BASH), "Bash(rm -rf *)");
  });

  test("[M3] matchesAnyDenyPattern: other tools' patterns and non-pattern entries are skipped", () => {
    const pats = ["Read(//etc/**)", "WebFetch", "Bash", "garbage(", "Bash(curl *)"];
    assert.equal(matchesAnyDenyPattern("curl -s x", pats, BASH), "Bash(curl *)");
    assert.equal(matchesAnyDenyPattern("/etc/hosts", ["Bash(/etc/*)"], { tool: "Read", projectDir: "/p" }), null);
  });

  // ---- matchesAnyDenyPattern, Read anchors (DECISIONS-r9 V17) ----

  test("[M3] GP3/v17-read-glob-deny-anchors: Read(//etc/**) matches /etc/hosts -> deny", () => {
    const r = { tool: "Read", projectDir: proj };
    assert.equal(matchesAnyDenyPattern("/etc/hosts", ["Read(//etc/**)"], r), "Read(//etc/**)");
    assert.equal(matchesAnyDenyPattern("/etcx/hosts", ["Read(//etc/**)"], r), null);
  });

  test("[M3] GP3/v17-read-glob-deny-anchors: Read(~/secret/**) matches $HOME/secret/a -> deny", () => {
    process.env.HOME = home; process.env.USERPROFILE = home;
    const r = { tool: "Read", projectDir: proj };
    assert.equal(matchesAnyDenyPattern(join(home, "secret", "a"), ["Read(~/secret/**)"], r), "Read(~/secret/**)");
    assert.equal(matchesAnyDenyPattern(join(home, "public", "a"), ["Read(~/secret/**)"], r), null);
    assert.equal(matchesAnyDenyPattern("/secret/a", ["Read(~/secret/**)"], r), null);
  });

  test("[M3] GP3/v17-read-glob-deny-anchors: Read(./x/**) does not match /x/a -> allow; matches <projectDir>/x/a", () => {
    const r = { tool: "Read", projectDir: proj };
    assert.equal(matchesAnyDenyPattern("/x/a", ["Read(./x/**)"], r), null);
    assert.equal(matchesAnyDenyPattern(join(proj, "x", "a"), ["Read(./x/**)"], r), "Read(./x/**)");
    assert.equal(matchesAnyDenyPattern(join(proj, "y", "a"), ["Read(./x/**)"], r), null);
  });

  test("[M3] matchesAnyDenyPattern Read: path globs (** spans dirs, * and ? stay in one segment)", () => {
    const r = { tool: "Read", projectDir: proj };
    assert.equal(matchesAnyDenyPattern("/a/b/c/.env", ["Read(**/.env)"], r), "Read(**/.env)");
    assert.equal(matchesAnyDenyPattern("/a/b/c.txt", ["Read(/a/*.txt)"], r), null, "* does not cross /");
    assert.equal(matchesAnyDenyPattern("/a/c.txt", ["Read(/a/*.txt)"], r), "Read(/a/*.txt)");
    assert.equal(matchesAnyDenyPattern("/a/c.txt", ["Read(/a/?.txt)"], r), "Read(/a/?.txt)");
    assert.equal(matchesAnyDenyPattern("/a/x/c.txt", ["Read(/a/**/c.txt)"], r), "Read(/a/**/c.txt)");
    assert.equal(matchesAnyDenyPattern("/a/c.txt", ["Read(/a/**/c.txt)"], r), "Read(/a/**/c.txt)", "**/ also matches zero dirs");
  });

  test("[M3] matchesAnyDenyPattern: many stars stay fast (memoized walk)", () => {
    const text = "a".repeat(4000);
    const t0 = Date.now();
    assert.equal(matchesAnyDenyPattern(text, ["Bash(*a*a*a*a*a*a*a*a*b)"], BASH), null);
    assert.ok(Date.now() - t0 < 2000);
  });
});

describe("ADR-0001 PreToolUse routing (ported from v1)", () => {
  // serial: tests set the require-security env var.
  // PORT of tests/hooks/{core-routing,integration,require-security,tool-naming}.test.ts (cleanup-plan W1-hooks).
  // v1 asserted modify/updatedInput and nudge text; v2 decides deny or allow with no hint (ADR-0008 amendment
  // 2026-10-20, D-M7-RR-1/RR-2). Each case keeps the v1 input and the v1 allow/block verdict; the v1 issue is in the name.

  const CODEX = getAdapter("codex"); // no replace row: the size-guess denies stay (ADR-0001)
  const CC = getAdapter("claude-code");
  const ev = (name, input, extra = {}) => ({ event: "PreToolUse", agent: "codex", sessionId: "s1", cwd: process.cwd(), tool: { name, canonicalName: name, input }, ...extra });
  const bash = (command, deny = [], row = CODEX) => decide(ev("Bash", { command }), row, deny);
  const kind = (command) => bash(command).kind;

  test("core-routing: curl and wget are denied; the reason names the original command", () => {
    for (const c of ["curl https://example.com", "wget https://example.com/file.tar.gz"]) {
      const d = bash(c);
      assert.equal(d.kind, "deny", c);
      assert.ok(d.reason.includes(c), "reason carries the original command: " + c);
    }
  });

  test("core-routing #166: silent file output is allowed, stdout or non-silent output is denied", () => {
    for (const c of ["curl -sLo out.tar https://x.io/f", "curl -s --output out.tar https://x.io/f",
      "wget -q -O out.tar https://x.io/f", "curl -s https://x.io/f > out.tar",
      "curl -sLo out.tar https://x.io/f && tar xzf out.tar"]) assert.notEqual(kind(c), "deny", c);
    for (const c of ["curl -o - https://x.io/f", "curl -o out.tar https://x.io/f", "curl -s -v -o out.tar https://x.io/f",
      "curl -sLo out.tar https://x.io/f && curl https://x.io/g"]) assert.equal(kind(c), "deny", c);
  });

  test("core-routing: inline HTTP is denied (node fetch, python requests)", () => {
    assert.equal(kind(`node -e "fetch('https://x.io').then(r=>r.text()).then(console.log)"`), "deny");
    assert.equal(kind(`python3 -c "import requests; print(requests.get('https://x.io').text)"`), "deny");
  });

  test("core-routing #38 #406: gradle, mvn, sbt build commands are denied (tail-free alternative is ctx_execute)", () => {
    for (const c of ["./gradlew build", "gradle test", "mvn package", "./mvnw verify", "sbt compile", "./sbt test"]) assert.equal(kind(c), "deny", c);
  });

  test("core-routing: build-tool names inside quotes or longer words are not builds", () => {
    for (const c of ['echo "run gradle build later"', "ls gradle-wrapper-config", "echo mvnDocker"]) assert.notEqual(kind(c), "deny", c);
  });

  test("core-routing #463: bounded commands and npm install pass with no hint", () => {
    for (const c of ["git status", "mkdir -p out/dir", "npm install", "find / -name x"]) assert.deepEqual(bash(c), { kind: "allow" }, c);
  });

  test("core-routing/integration #241: Task, TaskCreate, TaskUpdate, Glob, WebSearch, Edit pass through", () => {
    for (const t of ["Task", "TaskCreate", "TaskUpdate", "Glob", "WebSearch", "Edit"]) assert.deepEqual(decide(ev(t, {}), CODEX, []), { kind: "allow" }, t);
  });

  test("integration WebFetch: denied, and the reason carries the URL", () => {
    const url = "https://example.com/some/page";
    const d = decide(ev("WebFetch", { url }), CODEX, []);
    assert.equal(d.kind, "deny");
    assert.equal(d.reason, denyMessage("webfetch", url, CODEX));
    assert.ok(d.reason.includes(url));
  });

  test("integration Security: user deny rule on sudo denies Bash and a ctx_execute shell body", () => {
    const rules = ["Bash(sudo:*)"];
    assert.equal(bash("sudo rm -rf /tmp/x", rules).reason, USER_DENY_REASON_PREFIX + "Bash(sudo:*)");
    assert.equal(bash("git status", rules).kind, "allow");
    assert.equal(decide(ev("ctx_execute", { language: "shell", code: "sudo ls" }), CODEX, rules).kind, "deny");
    assert.equal(decide(ev("ctx_execute", { language: "python", code: "print('sudo')" }), CODEX, rules).kind, "allow");
  });

  test("integration Security: ctx_execute file under a Read deny rule (.env) is denied, a safe path is not", () => {
    const rules = ["Read(.env)", "Read(**/.env)"];
    assert.equal(decide(ev("ctx_execute", { language: "python", code: "x", file: ".env" }), CODEX, rules).kind, "deny");
    assert.equal(decide(ev("ctx_execute", { language: "python", code: "x", file: "src/a.ts" }), CODEX, rules).kind, "allow");
  });

  test("integration Security: ctx_batch with one denied command is denied, all-allowed passes", () => {
    const rules = ["Bash(sudo:*)"];
    assert.equal(decide(ev("ctx_batch", { commands: ["ls", "sudo id"] }), CODEX, rules).kind, "deny");
    assert.equal(decide(ev("ctx_batch", { commands: ["ls", "pwd"] }), CODEX, rules).kind, "allow");
  });

  test("require-security #468: env=1 and unreadable policy denies every tool, Read included; env unset fails open", () => {
    const saved = process.env[REQUIRE_SECURITY_ENV];
    const savedWrite = process.stderr.write;
    process.stderr.write = () => true;
    try {
      process.env[REQUIRE_SECURITY_ENV] = "1";
      for (const t of ["Bash", "Read", "Grep"]) assert.deepEqual(decide(ev(t, { command: "ls", file_path: "a" }), CODEX, null), { kind: "deny", reason: prefixToolNames(POLICY_UNREADABLE_LINE, CODEX.toolNamePrefix) }, t);
      delete process.env[REQUIRE_SECURITY_ENV];
      assert.notEqual(decide(ev("Bash", { command: "ls" }), CODEX, null).kind, "deny");
      process.env[REQUIRE_SECURITY_ENV] = "1";
      assert.notEqual(decide(ev("Bash", { command: "ls" }), CODEX, []).kind, "deny"); // readable policy: normal
    } finally {
      process.stderr.write = savedWrite;
      if (saved === undefined) delete process.env[REQUIRE_SECURITY_ENV]; else process.env[REQUIRE_SECURITY_ENV] = saved;
    }
  });

  test("tool-naming #529 #683: every agent has a prefix; deny text names ctx_execute with that prefix", () => {
    const want = { "claude-code": "mcp__plugin_context-mode_context-mode__", codex: "mcp__context_mode__", gemini: "mcp_context-mode_",
      kiro: "mcp_context-mode_", vscode: "mcp_context-mode_", pi: "", opencode: "" };
    for (const id of AGENT_IDS) {
      const row = getAdapter(id);
      assert.equal(typeof row.toolNamePrefix, "string", id);
      if (id in want) assert.equal(row.toolNamePrefix, want[id], id);
      const msg = denyMessage("curl", "curl https://x.io", row);
      assert.ok(msg.includes("Tool: " + row.toolNamePrefix + "ctx_execute"), id);
    }
    assert.ok(denyMessage("webfetch", "https://x.io", CC).includes(CC.toolNamePrefix + "ctx_index"));
  });
});
