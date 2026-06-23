import { describe, expect, it } from "vitest";
import { evaluateGate } from "../../src/core/gate-policy.js";
import type { ApprovalRecord, GateInput } from "../../src/types.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function makeRun(root: string, runId: string, plan: string): void {
  const dir = join(root, ".agent-loop", "runs", runId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "plan.md"), plan);
}

describe("gate-policy", () => {
  const runId = "20260101-120000-test";
  const plan = `# Goal
goal

# Non-goals
- none

# Affected modules
- src

# Steps
## [step-1] Read
**Description:** read
**Action types:** read
**Verification:** manual
**Risks:** low
**Rollback:** none
`;

  it("denies shell before approval", () => {
    const root = join(tmpdir(), `plantrail-gate-${Date.now()}`);
    makeRun(root, runId, plan);
    const approval: ApprovalRecord = {
      run_id: runId,
      status: "draft",
      updated_at: new Date().toISOString(),
    };
    const input: GateInput = {
      run_id: runId,
      event: "PreToolUse",
      tool: "Bash",
      payload: { command: "npm install" },
      project_root: root,
    };
    const result = evaluateGate(input, approval);
    expect(result.decision).toBe("deny");
  });

  it("allows read-only shell before approval", () => {
    const root = join(tmpdir(), `plantrail-gate-ro-${Date.now()}`);
    makeRun(root, runId, plan);
    const approval: ApprovalRecord = {
      run_id: runId,
      status: "review_required",
      updated_at: new Date().toISOString(),
    };
    const input: GateInput = {
      run_id: runId,
      event: "beforeShellExecution",
      tool: "beforeShellExecution",
      payload: { command: "git status" },
      project_root: root,
    };
    expect(evaluateGate(input, approval).decision).toBe("allow");
  });
});
