#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const name of ["__init__.py", "plugin.yaml"]) {
  const canonical = readFileSync(path.join(root, name));
  const packageCopy = readFileSync(path.join(root, "integrations", "hermes-plugin", name));
  if (!canonical.equals(packageCopy)) {
    console.error(`Hermes plugin package drift: integrations/hermes-plugin/${name} must match ${name}`);
    process.exit(1);
  }
}
console.log("hermes-plugin-copy: OK");
