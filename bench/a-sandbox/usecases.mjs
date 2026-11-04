// Group A, daily-use rows (D-BENCH-USECASES-1). Each fixture is a real capture of a tool run on 2026-11-01 on a public
// project (see bench/fixtures/data/SOURCE.md for command, version and date). The summary scripts below use string
// methods only; each prints the facts an agent needs to decide the next step, not the raw output.
export const USECASES = [
  { tool: "Chrome DevTools MCP", name: "Browser snapshot (take_snapshot, Wikipedia SQLite page)", fixture: "devtools-mcp-snapshot.txt", language: "javascript", code: `
    const L = FILE_CONTENT.split("\\n").filter(Boolean);
    const roles = {}; let links = 0;
    for (const l of L) { const t = l.trim().split(" "); if (!t[0].startsWith("uid=")) continue; roles[t[1]] = (roles[t[1]] || 0) + 1; if (t[1] === "link") links++; }
    const head = L.filter((l) => l.trim().split(" ")[1] === "heading").slice(0, 6).map((l) => l.trim().slice(0, 70));
    console.log("lines:", L.length, "| links:", links, "| root:", L[1].slice(0, 90));
    console.log("roles:", Object.entries(roles).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => k + " " + v).join(", "));
    console.log("headings:", head.join(" | "));` },
  { tool: "gh", name: "GitHub issues (gh issue list --json, vitejs/vite, 40 items)", fixture: "gh-issue-list-vite.json", language: "javascript", code: `
    const a = JSON.parse(FILE_CONTENT); const labels = {}; const authors = {};
    for (const i of a) { for (const l of i.labels || []) labels[l.name] = (labels[l.name] || 0) + 1; authors[i.author.login] = (authors[i.author.login] || 0) + 1; }
    console.log("issues:", a.length, "| oldest:", a.map((i) => i.createdAt).sort()[0], "| body bytes:", a.reduce((n, i) => n + i.body.length, 0));
    console.log("top labels:", Object.entries(labels).sort((x, y) => y[1] - x[1]).slice(0, 5).map(([k, v]) => k + " x" + v).join(", "));
    for (const i of a.slice(0, 8)) console.log("#" + i.number, i.state, i.title.slice(0, 80));` },
  { tool: "gh", name: "GitHub pull requests with checks (gh pr list --json, vitejs/vite, 25 items)", fixture: "gh-pr-list-vite.json", language: "javascript", code: `
    const a = JSON.parse(FILE_CONTENT); const c = {};
    for (const p of a) for (const k of p.statusCheckRollup || []) { const s = k.conclusion || k.state || k.status || "none"; c[s] = (c[s] || 0) + 1; }
    console.log("prs:", a.length, "| additions:", a.reduce((n, p) => n + p.additions, 0), "| deletions:", a.reduce((n, p) => n + p.deletions, 0), "| files:", a.reduce((n, p) => n + p.changedFiles, 0));
    console.log("checks:", JSON.stringify(c));
    for (const p of a.slice(0, 8)) console.log("#" + p.number, "+" + p.additions + "/-" + p.deletions, p.title.slice(0, 80));` },
  { tool: "Context7", name: "Library docs (query-docs, vite build and proxy config)", fixture: "context7-query-docs-vite.txt", language: "javascript", code: `
    const L = FILE_CONTENT.split("\\n");
    const titles = L.filter((l) => l.startsWith("### ")).map((l) => l.slice(4));
    const src = L.filter((l) => l.startsWith("Source: ")).map((l) => l.slice(8));
    console.log("sections:", titles.length, "| code fences:", L.filter((l) => l.startsWith("\`\`\`")).length / 2);
    for (let i = 0; i < titles.length; i++) console.log("-", titles[i], "<-", (src[i] || "").replace("https://github.com/", ""));` },
  { tool: "Vitest", name: "Test run, 1106 tests, 25 failing (vitest run --reporter=verbose, vitejs/vite)", fixture: "vitest-run-vite.txt", language: "javascript", code: `
    const L = FILE_CONTENT.split("\\n");
    const fails = L.filter((l) => l.startsWith(" FAIL "));
    const files = {}; for (const f of fails) { const k = f.slice(6).split(" > ")[0]; files[k] = (files[k] || 0) + 1; }
    for (const l of L) if (l.includes("Test Files") || l.trim().startsWith("Tests ") || l.includes("Duration")) console.log(l.trim());
    console.log("failing files:", JSON.stringify(files));
    console.log("first failure:", (fails[0] || "").slice(0, 100));
    console.log("cause:", (L.find((l) => l.startsWith("ExecaSyncError")) || "").slice(0, 120));` },
  { tool: "Biome", name: "Lint report as JSON (biome lint --reporter=json, packages/vite/src)", fixture: "biome-lint-vite.json", language: "javascript", code: `
    const b = JSON.parse(FILE_CONTENT); const cat = {}; const file = {};
    for (const d of b.diagnostics) { cat[d.category] = (cat[d.category] || 0) + 1; const p = d.location && d.location.path; if (p) file[p] = (file[p] || 0) + 1; }
    console.log("summary:", JSON.stringify({ errors: b.summary.errors, warnings: b.summary.warnings, infos: b.summary.infos, files: b.summary.unchanged }), "| diagnostics:", b.diagnostics.length);
    console.log("top rules:", Object.entries(cat).sort((x, y) => y[1] - x[1]).slice(0, 8).map(([k, v]) => k + " " + v).join(", "));
    console.log("top files:", Object.entries(file).sort((x, y) => y[1] - x[1]).slice(0, 4).map(([k, v]) => k + " " + v).join(", "));` },
  { tool: "pnpm", name: "Workspace install log (pnpm install --frozen-lockfile, vitejs/vite)", fixture: "pnpm-install-vite.txt", language: "javascript", code: `
    const L = FILE_CONTENT.split("\\n").filter(Boolean);
    const prog = L.filter((l) => l.startsWith("Progress:"));
    console.log("lines:", L.length, "| progress lines:", prog.length, "| warnings:", L.filter((l) => l.startsWith("[WARN]") || l.includes("WARN")).length);
    console.log("last progress:", prog[prog.length - 1]);
    console.log("tail:", L.slice(-3).map((l) => l.slice(0, 100)).join(" | "));` },
  { tool: "Docker", name: "Container logs (docker logs, mongo:8.0 --verbose)", fixture: "docker-logs-mongo.txt", language: "javascript", code: `
    const L = FILE_CONTENT.split("\\n").filter(Boolean).map((l) => JSON.parse(l));
    const sev = {}, comp = {}; for (const r of L) { sev[r.s] = (sev[r.s] || 0) + 1; comp[r.c] = (comp[r.c] || 0) + 1; }
    console.log("entries:", L.length, "| severity:", JSON.stringify(sev));
    console.log("components:", Object.entries(comp).sort((x, y) => y[1] - x[1]).slice(0, 6).map(([k, v]) => k + " " + v).join(", "));
    for (const r of L.filter((x) => x.s === "W" || x.s === "E").slice(0, 5)) console.log(r.s, r.c, r.msg.slice(0, 90));` },
  { tool: "Terraform", name: "Plan output (terraform plan, 72 resources)", fixture: "terraform-plan.txt", language: "javascript", code: `
    const L = FILE_CONTENT.split("\\n"); const types = {};
    for (const l of L) if (l.startsWith("  # ") && l.endsWith("will be created")) { const t = l.slice(4).split(".")[0]; types[t] = (types[t] || 0) + 1; }
    console.log(L.find((l) => l.startsWith("Plan:")));
    console.log("to create by type:", JSON.stringify(types), "| unknown after apply:", L.filter((l) => l.includes("(known after apply)")).length);
    console.log("sensitive values:", L.filter((l) => l.includes("(sensitive value)")).length);` },
  { tool: "git", name: "Commit history with file stats (git log --stat, 300 commits, vitejs/vite)", fixture: "git-log-stat-vite.txt", language: "javascript", code: `
    const L = FILE_CONTENT.split("\\n"); const dirs = {}; const authors = new Set(); let commits = 0;
    for (const l of L) {
      if (l.startsWith("commit ")) commits++;
      else if (l.startsWith("Author: ")) authors.add(l.slice(8));
      else if (l.startsWith(" ") && l.includes(" | ")) { const p = l.trim().split(" | ")[0].split("/"); const k = p.slice(0, 3).join("/"); dirs[k] = (dirs[k] || 0) + 1; }
    }
    const dates = L.filter((l) => l.startsWith("Date: ")).map((l) => l.slice(6, 16)).sort();
    console.log("commits:", commits, "| authors:", authors.size, "| from", dates[0], "to", dates[dates.length - 1]);
    console.log("most touched:", Object.entries(dirs).sort((x, y) => y[1] - x[1]).slice(0, 6).map(([k, v]) => k + " " + v).join(", "));` },
];
