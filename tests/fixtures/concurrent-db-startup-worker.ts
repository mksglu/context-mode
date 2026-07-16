import { existsSync, writeFileSync } from "node:fs";

const [mode, dbPath, readyPath, startPath] = process.argv.slice(2);
if (!mode || !dbPath || !readyPath || !startPath) {
  throw new Error("usage: worker <session|store|pi> <dbPath> <readyPath> <startPath>");
}

let start: () => void;
if (mode === "session") {
  const { SessionDB } = await import("../../src/session/db.js");
  start = () => {
    const db = new SessionDB({ dbPath });
    db.close();
  };
} else if (mode === "store") {
  const { ContentStore } = await import("../../src/store.js");
  start = () => {
    const db = new ContentStore(dbPath);
    db.close();
  };
} else if (mode === "pi") {
  const { default: registerPiExtension } = await import("../../src/adapters/pi/extension.js");
  start = () => {
    registerPiExtension({
      on() {},
      registerCommand() {},
    });
  };
} else {
  throw new Error(`unknown mode: ${mode}`);
}

writeFileSync(readyPath, "ready");
while (!existsSync(startPath)) {
  await new Promise((resolve) => setTimeout(resolve, 5));
}

start();
