import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { initRun } from "../../src/commands/init-run.js";
import { reviewPlan } from "../../src/commands/review-plan.js";
import { approveRun } from "../../src/commands/approve.js";
import { abortRun } from "../../src/commands/abort.js";
import { logRun } from "../../src/commands/log.js";
import { runLoopHeartbeat, writeLoopState } from "../../src/core/loop.js";
import { updateApproval } from "../../src/core/run-store.js";
import { loadRunApproval } from "../../src/core/run-resolver.js";

let testSeq = 0;
function uniqueGoal(prefix = "adv") { testSeq++; return `${prefix}-${process.pid}-${testSeq}`; }

function planWithLoop(cmd = "npm test", maxIter = 5) {
  return `# Goal
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

# Stop condition
**Command:** ${cmd}
**Max iterations:** ${maxIter}
`;
}

let root: string;
const originalCwd = process.cwd();

function setup() {
  root = mkdtempSync(join(tmpdir(), "plantrail-loop-adv-"));
  process.chdir(root);
}

function teardown() {
  process.chdir(originalCwd);
  rmSync(root, { recursive: true, force: true });
}

// ── Tampered plan ─────────────────────────────────────────────────────────────

describe("adversarial: plan tampered after approve", () => {
  beforeEach(setup);
  afterEach(teardown);

  it("heartbeat finishes with blocked when plan is tampered", () => {
    const runId = initRun(root, uniqueGoal("tamper"));
    const planPath = join(root, ".agent-loop", "runs", runId, "plan.md");
    writeFileSync(planPath, planWithLoop("npm test", 5));
    reviewPlan(root, runId);
    approveRun(root, runId, "user");
    updateApproval(root, runId, (r) => ({ ...r, status: "doing" }));

    // Tamper plan after approval
    writeFileSync(planPath, planWithLoop("npm test", 5) + "\n# tampered\n");

    const result = runLoopHeartbeat(root, runId, {});
    expect(result.action).toBe("finish");
    // Tamper → changes_requested (per design §7), persisted to approval (not fail-open)
    expect(result.next_status).toBe("changes_requested");
    expect(result.persist_failed).toBeFalsy();
    const approval = loadRunApproval(root, runId);
    expect(approval.status).toBe("changes_requested");
  });
});

// ── loop_policy mismatch (plan has loop, approval doesn't) ───────────────────

describe("adversarial: loop_policy mismatch treated as tamper", () => {
  beforeEach(setup);
  afterEach(teardown);

  it("finishes when plan has loop but approval has no loop_policy", () => {
    const runId = initRun(root, uniqueGoal());
    const planPath = join(root, ".agent-loop", "runs", runId, "plan.md");
    writeFileSync(planPath, planWithLoop("npm test", 5));
    reviewPlan(root, runId);
    approveRun(root, runId, "user");
    updateApproval(root, runId, (r) => ({ ...r, status: "doing" }));

    // Manually strip loop_policy from approval
    updateApproval(root, runId, (r) => {
      const { loop_policy, ...rest } = r as Record<string, unknown>;
      void loop_policy;
      return rest as typeof r;
    });

    const result = runLoopHeartbeat(root, runId, {});
    expect(result.action).toBe("finish");
    expect(result.next_status).toBe("changes_requested");
    expect(loadRunApproval(root, runId).status).toBe("changes_requested");
  });

  it("finishes when approval has loop_policy but plan has no loop section", () => {
    // Use a separate fresh run (need no-loop plan with injected loop_policy)
    const basePlanContent = `# Goal
No loop plan

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
    const runId = initRun(root, uniqueGoal("noloop"));
    const planPath = join(root, ".agent-loop", "runs", runId, "plan.md");
    writeFileSync(planPath, basePlanContent);
    reviewPlan(root, runId);
    approveRun(root, runId, "user");
    updateApproval(root, runId, (r) => ({ ...r, status: "doing" }));

    // Inject loop_policy into approval (simulating attacker adding it)
    updateApproval(root, runId, (r) => ({
      ...r,
      loop_policy: { stop_command: "npm test", max_iterations: 5 },
    }));

    // Plan has no loop, approval has loop_policy → mismatch → finish + persisted changes_requested
    const result = runLoopHeartbeat(root, runId, {});
    expect(result.action).toBe("finish");
    expect(result.next_status).toBe("changes_requested");
    const approval = loadRunApproval(root, runId);
    expect(approval.status).toBe("changes_requested");
  });
});

// ── Forged/stale evidence ─────────────────────────────────────────────────────

describe("adversarial: forged or stale evidence", () => {
  beforeEach(setup);
  afterEach(teardown);

  it("does not finish on stop-check evidence older than iteration_start_ts", () => {
    const runId = initRun(root, uniqueGoal());
    const planPath = join(root, ".agent-loop", "runs", runId, "plan.md");
    writeFileSync(planPath, planWithLoop("npm test", 5));
    reviewPlan(root, runId);
    approveRun(root, runId, "user");
    updateApproval(root, runId, (r) => ({ ...r, status: "doing" }));

    // Log a stop-check BEFORE calling heartbeat (so its ts < iteration_start_ts of the loop state)
    // We force an old iteration_start_ts in the loop state
    const farFuture = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    writeLoopState(root, runId, {
      run_id: runId,
      iteration: 1,
      iteration_start_ts: farFuture, // future timestamp: all existing events are "stale"
      abort_requested: false,
    });

    logRun(root, runId, "stop-check", "", undefined, {
      command: "npm test",
      exitCode: 0,
      outputHash: "abc",
    });

    // Evidence ts < iteration_start_ts (future) → stale → should not finish
    const result = runLoopHeartbeat(root, runId, {});
    // iteration is already at 1 which is < max_iterations(5), so should continue
    expect(result.action).toBe("continue");
  });
});

// ── User abort prevents further continuation ──────────────────────────────────

describe("adversarial: user abort", () => {
  beforeEach(setup);
  afterEach(teardown);

  it("heartbeat honors abort_requested after plantrail abort", () => {
    const runId = initRun(root, uniqueGoal());
    const planPath = join(root, ".agent-loop", "runs", runId, "plan.md");
    writeFileSync(planPath, planWithLoop("npm test", 10));
    reviewPlan(root, runId);
    approveRun(root, runId, "user");
    updateApproval(root, runId, (r) => ({ ...r, status: "doing" }));

    // First heartbeat → continue
    const r1 = runLoopHeartbeat(root, runId, {});
    expect(r1.action).toBe("continue");

    // User aborts
    abortRun(root, runId, "user", "pivot needed");

    // Next heartbeat → blocked
    const r2 = runLoopHeartbeat(root, runId, {});
    expect(r2.action).toBe("finish");
    expect(r2.next_status).toBe("blocked");
  });

  it("only user can abort (non-user actor throws)", () => {
    const runId = initRun(root, uniqueGoal());
    const planPath = join(root, ".agent-loop", "runs", runId, "plan.md");
    writeFileSync(planPath, planWithLoop("npm test", 10));
    reviewPlan(root, runId);
    approveRun(root, runId, "user");

    expect(() => abortRun(root, runId, "agent", "agent wants to stop")).toThrow(/Only.*user/);
  });
});

// ── Concurrent Stop hook — lock contention ────────────────────────────────────

describe("adversarial: lock contention", () => {
  beforeEach(setup);
  afterEach(teardown);

  it("does not crash when called concurrently (at least one call succeeds)", () => {
    const runId = initRun(root, uniqueGoal());
    const planPath = join(root, ".agent-loop", "runs", runId, "plan.md");
    writeFileSync(planPath, planWithLoop("npm test", 5));
    reviewPlan(root, runId);
    approveRun(root, runId, "user");
    updateApproval(root, runId, (r) => ({ ...r, status: "doing" }));

    // Simulate two concurrent heartbeats (synchronous, so second will contend the lock file)
    let r1: ReturnType<typeof runLoopHeartbeat> | undefined;
    let r2: ReturnType<typeof runLoopHeartbeat> | undefined;

    // Since both are synchronous in same process, they won't actually contend,
    // but we verify both calls succeed without throwing
    expect(() => {
      r1 = runLoopHeartbeat(root, runId, {});
      r2 = runLoopHeartbeat(root, runId, {});
    }).not.toThrow();

    expect(r1?.action).toMatch(/continue|finish|noop/);
    expect(r2?.action).toMatch(/continue|finish|noop/);
  });
});

// ── max_iterations exceeded at approve time ───────────────────────────────────

describe("adversarial: max_iterations > 100 rejected at approve", () => {
  beforeEach(setup);
  afterEach(teardown);

  it("rejects max_iterations > 100 at plan validation", () => {
    const runId = initRun(root, uniqueGoal());
    const planPath = join(root, ".agent-loop", "runs", runId, "plan.md");
    writeFileSync(planPath, planWithLoop("npm test", 101));
    // Schema validator catches this at reviewPlan (parsePlanMarkdown → validatePlan)
    expect(() => reviewPlan(root, runId)).toThrow(/max_iterations/i);
  });
});

// ── stop_command does not do → evidence_required without done status ──────────

describe("adversarial: stop condition only transitions doing → evidence_required", () => {
  beforeEach(setup);
  afterEach(teardown);

  it("does NOT transition approved → evidence_required directly (approved state stays)", () => {
    const runId = initRun(root, uniqueGoal());
    const planPath = join(root, ".agent-loop", "runs", runId, "plan.md");
    writeFileSync(planPath, planWithLoop("npm test", 5));
    reviewPlan(root, runId);
    approveRun(root, runId, "user");
    // Still in "approved" status

    // Even if there's a fresh stop-check event, approved state just prompts to start
    logRun(root, runId, "stop-check", "", undefined, {
      command: "npm test",
      exitCode: 0,
      outputHash: "abc",
    });

    const result = runLoopHeartbeat(root, runId, {});
    expect(result.action).toBe("continue");
    // Should NOT have moved to evidence_required
    const approval = loadRunApproval(root, runId);
    expect(approval.status).toBe("approved"); // still approved
  });
});
