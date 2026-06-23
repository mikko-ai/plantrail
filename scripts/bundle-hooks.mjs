import * as esbuild from "esbuild";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const entries = [
  { in: "src/hooks/cursor-gate.ts", out: "assets/hooks/cursor/gate.js" },
  { in: "src/hooks/codex-gate.ts", out: "assets/hooks/codex/gate.js" },
  { in: "src/hooks/claude-gate.ts", out: "assets/hooks/claude/gate.js" },
];

for (const { in: entry, out } of entries) {
  const outfile = join(root, out);
  mkdirSync(dirname(outfile), { recursive: true });
  await esbuild.build({
    entryPoints: [join(root, entry)],
    bundle: true,
    platform: "node",
    target: "node18",
    format: "esm",
    outfile,
  });
}

console.log("Hook bundles written.");
