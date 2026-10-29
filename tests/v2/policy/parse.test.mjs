// Unit tests for src/core/policy/parse.ts (impl/08 §2, DECISIONS-r9 P1-P4, E1; DEVIATIONS D-M3-E1-1..5).
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseShell } from "../../../src/core/policy/parse.ts";
import { MAX_NEST_DEPTH, OUTPUT_CAP } from "../../../src/core/contracts/constants.ts";

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
