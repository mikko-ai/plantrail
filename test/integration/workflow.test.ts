import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { initRun } from "../../src/commands/init-run.js";
import { reviewPlan } from "../../src/commands/review-plan.js";
import { approveRun } from "../../src/commands/approve.js";
import { runGate } from "../../src/commands/gate.js";
import { logRun } from "../../src/commands/log.js";
import { verifyRun, closeRun } from "../../src/commands/close.js";
import { getActiveRunId } from "../../src/core/run-resolver.js";

describe("happy path", () => {
  let root: string;
  const originalCwd = process.cwd();

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "plantrail-happy-"));
    process.chdir(root);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(root, { recursive: true, force: true });
  });

  it("runs full workflow", () => {
    const runId = initRun(root, "Test feature");
    expect(getActiveRunId(root)).toBe(runId);

    const plan = `# Goal
Test

# Non-goals
- n/a

# Affected modules
- src

# Steps
## [step-1] Edit
**Description:** edit file
**Action types:** write_file
**Path patterns:** src/**
**Verification:** npm test
**Risks:** low
**Rollback:** revert
`;
    writeFileSync(join(root, ".agent-loop", "runs", runId, "plan.md"), plan);

    reviewPlan(root, runId);
    approveRun(root, runId, "user");

    const allow = runGate(root, {
      event: "preToolUse",
      tool: "Write",
      payload: { file_path: join(root, "src/foo.ts") },
      project_root: root,
      run_id: runId,
    });
    expect(allow.decision).toBe("allow");

    logRun(root, runId, "evidence", "npm test passed", "step-1");
    writeFileSync(
      join(root, ".agent-loop", "runs", runId, "evidence.md"),
      "# Evidence\n\nnpm test passed with 10 tests OK\n",
    );
    verifyRun(root, runId);
    closeRun(root, runId, "done");

    const approval = JSON.parse(
      readFileSync(join(root, ".agent-loop", "runs", runId, "approval.json"), "utf8"),
    );
    expect(approval.status).toBe("done");
  });
});

describe("adversarial", () => {
  let root: string;
  const originalCwd = process.cwd();

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "plantrail-adv-"));
    process.chdir(root);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(root, { recursive: true, force: true });
  });

  it("denies after plan tampering post-approve", () => {
    const runId = initRun(root, "Tamper test");
    const planPath = join(root, ".agent-loop", "runs", runId, "plan.md");
    const plan = `# Goal
T

# Non-goals
- n

# Affected modules
- src

# Steps
## [s1] X
**Description:** x
**Action types:** write_file
**Path patterns:** src/**
**Verification:** t
**Risks:** l
**Rollback:** r
`;
    writeFileSync(planPath, plan);
    reviewPlan(root, runId);
    approveRun(root, runId, "user");
    writeFileSync(planPath, plan + "\n# tampered\n");

    const result = runGate(root, {
      event: "preToolUse",
      tool: "Write",
      payload: { file_path: join(root, "src/x.ts") },
      project_root: root,
      run_id: runId,
    });
    expect(result.decision).toBe("deny");
  });
});
