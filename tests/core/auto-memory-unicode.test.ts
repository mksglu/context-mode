import { afterEach, expect, test } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { searchAutoMemory } from "../../src/search/auto-memory.js";
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function search(content: string, query: string) {
  const root = mkdtempSync(join(tmpdir(), "ctx-memory-language-"));
  roots.push(root);
  const config = join(root, "config"); mkdirSync(config);
  writeFileSync(join(root, "CLAUDE.md"), content);
  return searchAutoMemory([query], 5, root, config);
}
for (const [content, query] of [
  ["Решение: сохранять журнал.", "решение"],
  ["قرار: حفظ السجل.", "السجل"],
  ["निर्णय: रिकॉर्ड सुरक्षित रखें।", "निर्णय"],
  ["Préférer le café au thé.", "café"],
]) {
  test(`finds an instruction term in ${query}`, () => expect(search(content, query).map(result => result.source)).toEqual(["project/CLAUDE.md"]));
}
test("does not mistake an ASCII substring of a Unicode word for a whole term", () => expect(search("caféapi configuration", "api")).toEqual([]));
test("keeps ASCII identifier and apostrophe boundaries", () => {
  expect(search("Use foo-bar. We can't use builder.", "\tfoo-bar\n").length).toBe(1);
  expect(search("We can't use builder.", "can").length).toBe(1);
  expect(search("We can't use builder.", "build")).toEqual([]);
});
