import { describe, expect, it } from "vitest";
import { evaluateGate } from "../../src/core/gate-policy.js";
import type { ApprovalRecord, GateInput } from "../../src/types.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("shell bypass", () => {
  it("denies echo redirect before approval", () => {
    const root = join(tmpdir(), `plantrail-shell-${Date.now()}`);
    const runId = "run-shell";
    const dir = join(root, ".agent-loop", "runs", runId);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "plan.md"),
      `# Goal
g

# Non-goals
- n

# Affected modules
- src

# Steps
## [s1] X
**Description:** x
**Action types:** shell
**Command patterns:** npm test
**Verification:** t
**Risks:** l
**Rollback:** r
`,
    );
    const approval: ApprovalRecord = {
      run_id: runId,
      status: "draft",
      updated_at: new Date().toISOString(),
    };
    const input: GateInput = {
      run_id: runId,
      event: "beforeShellExecution",
      tool: "beforeShellExecution",
      payload: { command: "echo pwned > src/hack.txt" },
      project_root: root,
    };
    expect(evaluateGate(input, approval).decision).toBe("deny");
  });
});
