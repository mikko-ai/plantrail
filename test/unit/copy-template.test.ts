import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { copyTemplate, ensureAgentLoop, updateAgentLoopConfig } from "../../src/core/run-store.js";

describe("copyTemplate", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "plantrail-copy-template-"));
    ensureAgentLoop(root);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("uses zh-CN templates by default", () => {
    const dest = join(root, "plan.md");
    copyTemplate(root, "plan.md", dest);
    expect(readFileSync(dest, "utf8")).toContain("# 目标");
  });

  it("uses en templates when configured", () => {
    updateAgentLoopConfig(root, (config) => ({ ...config, language: "en" }));
    const dest = join(root, "plan.md");
    copyTemplate(root, "plan.md", dest);
    expect(readFileSync(dest, "utf8")).toContain("# Goal");
  });
});
