// Block concurrency for the merged area files (ADR-0024, D-TEST-LAYOUT-1).
// Before the merge, files ran in parallel and the tests inside a file ran in order. A merged file runs its independent blocks
// at the same time (own temp dirs, no env). On a 4-core Windows runner that, on top of the parallel files, starved timed
// tests (hook fuzz call limit, ctx_search 1 s limit), so on win32 the blocks run in order as before. No limit is raised.
export const CONC = process.platform === "win32" ? 1 : true;
