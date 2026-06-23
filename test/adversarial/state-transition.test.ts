import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { updateApproval } from "../../src/core/run-store.js";
import { initRun } from "../../src/commands/init-run.js";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("state transition enforcement", () => {
  let root: string;
  const originalCwd = process.cwd();

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "plantrail-st-"));
    process.chdir(root);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(root, { recursive: true, force: true });
  });

  it("rejects illegal draft -> approved transition", () => {
    const runId = initRun(root, "test");
    expect(() =>
      updateApproval(root, runId, (record) => ({ ...record, status: "approved" })),
    ).toThrow(/Invalid state transition/);
  });
});
