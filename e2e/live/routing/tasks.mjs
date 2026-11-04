// GP-LIVE-ROUTING task set (TECH-SPEC 6.5): 10 small + 10 large, deterministic fixtures, machine-checkable answers.
// Never imports src/. Each task: {id, size, prompt, files: {name: text}, answer: string (substring of final reply)}.
function rng(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
const pick = (r, a) => a[Math.floor(r() * a.length)];
export function buildTasks() {
  const T = [];
  const small = (id, prompt, files, answer) => T.push({ id, size: "small", prompt, files, answer, git: id === "S3" || id === "S9" });
  small("S1", "In config.txt, what is the port number? Reply with the number only.", { "config.txt": "host=localhost\nport=8472\nmode=dev\n" }, "8472");
  small("S2", "How many files are in the current directory (not counting hidden ones)? Reply with the number only.", { "a.txt": "a", "b.txt": "b", "c.txt": "c", "d.txt": "d" }, "4");
  small("S3", "Which git branch is checked out here? Reply with the branch name only.", { "x.txt": "x" }, "main");
  small("S4", "What name is written in note.txt? Reply with the name only.", { "note.txt": "Owner: Zephyrine\n" }, "Zephyrine");
  small("S5", "What is in the VERSION file? Reply with the version only.", { "VERSION": "3.14.7\n" }, "3.14.7");
  small("S6", "What is the name field in package.json? Reply with the name only.", { "package.json": '{"name":"tiny-widget","version":"1.0.0"}\n' }, "tiny-widget");
  small("S7", "How many lines does small.txt have? Reply with the number only.", { "small.txt": "one\ntwo\nthree\nfour\nfive\nsix\nseven\n" }, "7");
  small("S8", "What does hello.py print? Reply with the printed text only.", { "hello.py": 'print("kumquat-42")\n' }, "kumquat-42");
  small("S9", "What is the subject of the last git commit here? Reply with the subject only.", { "y.txt": "y" }, "initial fixture commit");
  small("S10", "In colors.txt, which color is on line 3? Reply with the color only.", { "colors.txt": "red\nblue\nteal\ngreen\nblack\n" }, "teal");

  const large = (id, prompt, files, answer) => T.push({ id, size: "large", prompt, files, answer });
  let r = rng(11);
  // L1 count ERROR lines in a 3000 line log
  { let n = 0; const lines = []; for (let i = 0; i < 3000; i++) { const lv = pick(r, ["INFO", "INFO", "INFO", "DEBUG", "WARN", "ERROR"]); if (lv === "ERROR") n++; lines.push(`2026-10-01T10:${String(i % 60).padStart(2, "0")}:00Z ${lv} worker-${i % 7} request ${i} handled in ${(r() * 90 | 0)}ms`); }
    large("L1", "How many lines in app.log have level ERROR? Reply with the number only.", { "app.log": lines.join("\n") + "\n" }, String(n)); }
  // L2 sum amount of failed payments in JSON
  { r = rng(12); let sum = 0; const rec = []; for (let i = 0; i < 1500; i++) { const st = pick(r, ["ok", "ok", "failed", "pending"]); const amt = (r() * 500 | 0); if (st === "failed") sum += amt; rec.push({ id: i, status: st, amount: amt, customer: "cust-" + (i % 97) }); }
    large("L2", "In payments.json, what is the sum of amount over records whose status is failed? Reply with the number only.", { "payments.json": JSON.stringify(rec, null, 1) }, String(sum)); }
  // L3 most frequent exception
  { r = rng(13); const ex = ["TimeoutError", "ValueError", "KeyError", "ConnectionResetError"]; const cnt = {}; const out = [];
    for (let i = 0; i < 400; i++) { const e = r() < 0.4 ? "ConnectionResetError" : pick(r, ex); cnt[e] = (cnt[e] || 0) + 1; out.push(`Traceback (most recent call last):\n  File "svc.py", line ${10 + i % 30}, in handle\n    do_work(${i})\n  File "lib.py", line ${i % 50}, in do_work\n    raise ${e}("fail ${i}")\n${e}: fail ${i}`); }
    const top = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0][0];
    large("L3", "Which exception type occurs most often in traces.log? Reply with the type name only.", { "traces.log": out.join("\n") + "\n" }, top); }
  // L4 TODO total across 40 files
  { r = rng(14); let n = 0; const files = {}; for (let f = 0; f < 40; f++) { const ls = []; for (let i = 0; i < 60; i++) { if (r() < 0.07) { n++; ls.push(`// TODO: fix item ${i}`); } else ls.push(`const v${i} = ${i * f};`); } files[`src/mod${f}.js`] = ls.join("\n") + "\n"; }
    large("L4", "How many lines containing TODO are there in total across all files under src/? Reply with the number only.", files, String(n)); }
  // L5 city with most rows
  { r = rng(15); const cnt = {}; const rows = ["id,city,score"]; const cities = ["Oslo", "Lima", "Kyoto", "Cairo", "Perth", "Quito"]; for (let i = 0; i < 5000; i++) { const c = r() < 0.25 ? "Kyoto" : pick(r, cities); cnt[c] = (cnt[c] || 0) + 1; rows.push(`${i},${c},${r() * 100 | 0}`); }
    large("L5", "Which city has the most rows in people.csv? Reply with the city only.", { "people.csv": rows.join("\n") + "\n" }, Object.entries(cnt).sort((a, b) => b[1] - a[1])[0][0]); }
  // L6 top IP
  { r = rng(16); const cnt = {}; const ls = []; for (let i = 0; i < 4000; i++) { const ip = r() < 0.2 ? "10.9.8.7" : `10.0.${r() * 40 | 0}.${r() * 250 | 0}`; cnt[ip] = (cnt[ip] || 0) + 1; ls.push(`${ip} - - [01/Oct/2026:10:00:${i % 60}] "GET /p/${i % 300} HTTP/1.1" 200 ${r() * 9000 | 0}`); }
    large("L6", "Which client IP appears most often in access.log? Reply with the IP only.", { "access.log": ls.join("\n") + "\n" }, Object.entries(cnt).sort((a, b) => b[1] - a[1])[0][0]); }
  // L7 failed tests count
  { r = rng(17); let n = 0; const ls = []; for (let i = 0; i < 900; i++) { const f = r() < 0.04; if (f) n++; ls.push(`${f ? "FAIL" : "PASS"} suite/case-${i} (${r() * 50 | 0}ms)`); }
    large("L7", "How many tests failed in test-output.txt (lines starting with FAIL)? Reply with the number only.", { "test-output.txt": ls.join("\n") + "\n" }, String(n)); }
  // L8 needle line number
  { r = rng(18); const ls = []; for (let i = 0; i < 2500; i++) ls.push(`filler line ${i} ${r().toString(36).slice(2, 10)}`); ls[1733] = "marker NEEDLE-7731 here"; 
    large("L8", "On which line number (1-based) does NEEDLE-7731 appear in big.txt? Reply with the number only.", { "big.txt": ls.join("\n") + "\n" }, "1734"); }
  // L9 deps with version starting 2.
  { r = rng(19); let n = 0; const deps = {}; for (let i = 0; i < 1200; i++) { const maj = r() * 5 | 0; if (maj === 2) n++; deps["pkg-" + i] = { version: `${maj}.${r() * 20 | 0}.${r() * 20 | 0}`, resolved: "https://registry.example/pkg-" + i + ".tgz", integrity: "sha512-" + r().toString(36).slice(2, 20) }; }
    large("L9", "In lock.json, how many packages have a version starting with 2.? Reply with the number only.", { "lock.json": JSON.stringify({ packages: deps }, null, 2) }, String(n)); }
  // L10 FATAL code
  { r = rng(20); const ls = []; for (let i = 0; i < 2500; i++) ls.push(`[build] step ${i} ok ${r().toString(36).slice(2, 8)}`); ls[2101] = "[build] FATAL code=E-5519 linker exploded"; 
    large("L10", "build.log has one FATAL line. What is its code= value? Reply with the code only.", { "build.log": ls.join("\n") + "\n" }, "E-5519"); }
  // T4 (DECISIONS-r9 V1): forced Read of a large file; success = answer reached after the deny (ranged Read, ctx_execute(file) or bounded shell search).
  const L = T.filter((t) => t.size === "large");
  for (const t of L) {
    const f = Object.keys(t.files)[0];
    if (t.id === "L4") continue;
    T.push({ id: "T4-" + t.id, size: "t4", files: t.files, answer: t.answer, prompt: "Use the Read tool to open " + f + " in full, then answer. " + t.prompt });
  }
  return T;
}
