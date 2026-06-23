import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { installAgent, uninstallAgent } from "../../src/adapters/install.js";

describe("install adapter", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "plantrail-install-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("installs cursor hooks.json with plantrail marker", () => {
    installAgent({ agent: "cursor", scope: "project", projectRoot: root });
    const hooksPath = join(root, ".cursor", "hooks.json");
    expect(existsSync(hooksPath)).toBe(true);
    const hooks = JSON.parse(readFileSync(hooksPath, "utf8"));
    expect(hooks.hooks.preToolUse.some((h: { plantrail?: string }) => h.plantrail)).toBe(true);
    uninstallAgent({ agent: "cursor", scope: "project", projectRoot: root });
    const after = JSON.parse(readFileSync(hooksPath, "utf8"));
    expect(after.hooks.preToolUse?.length ?? 0).toBe(0);
  });
});
