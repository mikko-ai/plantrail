import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parsePlanMarkdown } from "../../src/core/schema-validator.js";
import {
  isStopEvent,
  runLoopHeartbeat,
  readLoopState,
  writeLoopState,
} from "../../src/core/loop.js";
import {
  cursorStopResponse,
  claudeStopResponse,
  codexStopResponse,
} from "../../src/hooks/runner.js";
import { initRun } from "../../src/commands/init-run.js";
import { reviewPlan } from "../../src/commands/review-plan.js";
import { approveRun } from "../../src/commands/approve.js";
import { logRun } from "../../src/commands/log.js";
import { updateApproval } from "../../src/core/run-store.js";
import { loadRunApproval } from "../../src/core/run-resolver.js";

// ── Minimal plan builder ──────────────────────────────────────────────────────

let testSeq = 0; // per-process unique counter to avoid run ID collision

function basePlan(extra = "") {
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
${extra}`;
}

function planWithLoop(cmd = "npm test", maxIter = 5, extra = "") {
  return basePlan(`
# Stop condition
**Command:** ${cmd}
**Max iterations:** ${maxIter}
${extra}`);
}

// ── Setup helpers ─────────────────────────────────────────────────────────────

let root: string;
const originalCwd = process.cwd();

function setup() {
  root = mkdtempSync(join(tmpdir(), "plantrail-loop-"));
  process.chdir(root);
}

function teardown() {
  process.chdir(originalCwd);
  rmSync(root, { recursive: true, force: true });
}

function writePlan(runId: string, content: string) {
  writeFileSync(join(root, ".agent-loop", "runs", runId, "plan.md"), content);
}

/** Unique goal string to prevent run ID collision across tests */
function uniqueGoal(prefix = "loop") {
  testSeq++;
  return `${prefix}-unit-${process.pid}-${testSeq}`;
}

// ── isStopEvent ───────────────────────────────────────────────────────────────

describe("isStopEvent", () => {
  it('returns true for cursor "stop"', () => {
    expect(isStopEvent("stop")).toBe(true);
  });
  it('returns true for claude/codex "Stop"', () => {
    expect(isStopEvent("Stop")).toBe(true);
  });
  it("returns false for other events", () => {
    expect(isStopEvent("preToolUse")).toBe(false);
    expect(isStopEvent("PreToolUse")).toBe(false);
    expect(isStopEvent("beforeShellExecution")).toBe(false);
  });
});

// ── Stop response helpers ─────────────────────────────────────────────────────

describe("cursorStopResponse", () => {
  it("continue → followup_message field", () => {
    const r = JSON.parse(cursorStopResponse({ action: "continue", reason: "x", followup_message: "go on" }));
    expect(r.followup_message).toBe("go on");
  });
  it("finish → empty object", () => {
    const r = JSON.parse(cursorStopResponse({ action: "finish", reason: "done" }));
    expect(Object.keys(r)).toHaveLength(0);
  });
  it("noop → empty object", () => {
    const r = JSON.parse(cursorStopResponse({ action: "noop", reason: "no loop" }));
    expect(Object.keys(r)).toHaveLength(0);
  });
});

describe("claudeStopResponse", () => {
  it("continue → decision:block with reason", () => {
    const r = JSON.parse(claudeStopResponse({ action: "continue", reason: "x", followup_message: "keep going" }));
    expect(r.decision).toBe("block");
    expect(r.reason).toBe("keep going");
  });
  it("finish → decision:approve", () => {
    const r = JSON.parse(claudeStopResponse({ action: "finish", reason: "done" }));
    expect(r.decision).toBe("approve");
  });
  it("noop → decision:approve", () => {
    const r = JSON.parse(claudeStopResponse({ action: "noop", reason: "no loop" }));
    expect(r.decision).toBe("approve");
  });
});

describe("codexStopResponse", () => {
  it("continue → decision:block with reason", () => {
    const r = JSON.parse(codexStopResponse({ action: "continue", reason: "x", followup_message: "keep going" }));
    expect(r.decision).toBe("block");
  });
  it("finish → empty object", () => {
    const r = JSON.parse(codexStopResponse({ action: "finish", reason: "done" }));
    expect(Object.keys(r)).toHaveLength(0);
  });
});

// ── heartbeat: no active run ──────────────────────────────────────────────────

describe("heartbeat — no active run", () => {
  beforeEach(setup);
  afterEach(teardown);

  it("returns noop when no run exists in temp dir", () => {
    const result = runLoopHeartbeat(root, "nonexistent-run-id", {});
    expect(result.action).toBe("noop");
  });
});

// ── heartbeat: host abort signal ──────────────────────────────────────────────

describe("heartbeat — host abort signal", () => {
  beforeEach(setup);
  afterEach(teardown);

  it("returns finish+blocked for status:aborted", () => {
    const runId = initRun(root, uniqueGoal());
    writePlan(runId, planWithLoop());
    reviewPlan(root, runId);
    approveRun(root, runId, "user");
    updateApproval(root, runId, (r) => ({ ...r, status: "doing" }));

    const result = runLoopHeartbeat(root, runId, { status: "aborted" });
    expect(result.action).toBe("finish");
    expect(result.next_status).toBe("blocked");
  });

  it("returns finish+blocked for status:error", () => {
    const runId = initRun(root, uniqueGoal());
    writePlan(runId, planWithLoop());
    reviewPlan(root, runId);
    approveRun(root, runId, "user");
    updateApproval(root, runId, (r) => ({ ...r, status: "doing" }));

    const result = runLoopHeartbeat(root, runId, { status: "error" });
    expect(result.action).toBe("finish");
    expect(result.next_status).toBe("blocked");
  });
});

// ── heartbeat: no loop policy ─────────────────────────────────────────────────

describe("heartbeat — no loop policy (backward compat)", () => {
  beforeEach(setup);
  afterEach(teardown);

  it("returns noop when neither plan nor approval has loop", () => {
    const runId = initRun(root, uniqueGoal());
    writePlan(runId, basePlan());
    reviewPlan(root, runId);
    approveRun(root, runId, "user");
    updateApproval(root, runId, (r) => ({ ...r, status: "doing" }));

    const result = runLoopHeartbeat(root, runId, {});
    expect(result.action).toBe("noop");
  });
});

// ── heartbeat: approved state → continue without evaluating stop ──────────────

describe("heartbeat — approved state", () => {
  beforeEach(setup);
  afterEach(teardown);

  it("continues without evaluating stop when status=approved", () => {
    const runId = initRun(root, uniqueGoal());
    writePlan(runId, planWithLoop("npm test", 5));
    reviewPlan(root, runId);
    approveRun(root, runId, "user");
    // status is now "approved" — do NOT transition to doing

    const result = runLoopHeartbeat(root, runId, {});
    expect(result.action).toBe("continue");
    expect(result.followup_message).toMatch(/step-1/);
  });
});

// ── heartbeat: stop condition not met → continue ──────────────────────────────

describe("heartbeat — stop condition not met", () => {
  beforeEach(setup);
  afterEach(teardown);

  it("returns continue with followup_message when no stop-check event", () => {
    const runId = initRun(root, uniqueGoal());
    writePlan(runId, planWithLoop("npm test", 5));
    reviewPlan(root, runId);
    approveRun(root, runId, "user");
    updateApproval(root, runId, (r) => ({ ...r, status: "doing" }));

    const result = runLoopHeartbeat(root, runId, {});
    expect(result.action).toBe("continue");
    expect(result.followup_message).toMatch(/npm test/);
    expect(result.followup_message).toMatch(/1\/5/);
  });

  it("increments iteration on each heartbeat", () => {
    const runId = initRun(root, uniqueGoal());
    writePlan(runId, planWithLoop("npm test", 5));
    reviewPlan(root, runId);
    approveRun(root, runId, "user");
    updateApproval(root, runId, (r) => ({ ...r, status: "doing" }));

    runLoopHeartbeat(root, runId, {});
    runLoopHeartbeat(root, runId, {});
    const state = readLoopState(root, runId);
    expect(state.iteration).toBe(2);
  });
});

// ── heartbeat: stop condition met → finish+evidence_required ─────────────────

describe("heartbeat — stop condition met", () => {
  beforeEach(setup);
  afterEach(teardown);

  it("returns finish+evidence_required when fresh stop-check event exists", () => {
    const runId = initRun(root, uniqueGoal());
    writePlan(runId, planWithLoop("npm test", 5));
    reviewPlan(root, runId);
    approveRun(root, runId, "user");
    updateApproval(root, runId, (r) => ({ ...r, status: "doing" }));

    // First heartbeat → continue (sets iteration_start_ts)
    const r1 = runLoopHeartbeat(root, runId, {});
    expect(r1.action).toBe("continue");

    // Log fresh stop-check evidence AFTER iteration start
    logRun(root, runId, "stop-check", "", undefined, {
      command: "npm test",
      exitCode: 0,
      outputHash: "abc123",
    });

    // Second heartbeat → stop condition met
    const r2 = runLoopHeartbeat(root, runId, {});
    expect(r2.action).toBe("finish");
    expect(r2.next_status).toBe("evidence_required");
  });

  it("does not count evidence with non-zero exit code", () => {
    const runId = initRun(root, uniqueGoal());
    writePlan(runId, planWithLoop("npm test", 5));
    reviewPlan(root, runId);
    approveRun(root, runId, "user");
    updateApproval(root, runId, (r) => ({ ...r, status: "doing" }));

    runLoopHeartbeat(root, runId, {});
    logRun(root, runId, "stop-check", "", undefined, {
      command: "npm test",
      exitCode: 1, // failure
      outputHash: "abc123",
    });

    const result = runLoopHeartbeat(root, runId, {});
    expect(result.action).toBe("continue"); // not finished
  });

  it("does not count evidence with different command", () => {
    const runId = initRun(root, uniqueGoal());
    writePlan(runId, planWithLoop("npm test", 5));
    reviewPlan(root, runId);
    approveRun(root, runId, "user");
    updateApproval(root, runId, (r) => ({ ...r, status: "doing" }));

    runLoopHeartbeat(root, runId, {});
    logRun(root, runId, "stop-check", "", undefined, {
      command: "npm run build", // different command
      exitCode: 0,
      outputHash: "abc123",
    });

    const result = runLoopHeartbeat(root, runId, {});
    expect(result.action).toBe("continue");
  });

  it("max_iterations=1: success on the final iteration is NOT swallowed by max guard", () => {
    const runId = initRun(root, uniqueGoal());
    writePlan(runId, planWithLoop("npm test", 1));
    reviewPlan(root, runId);
    approveRun(root, runId, "user");
    updateApproval(root, runId, (r) => ({ ...r, status: "doing" }));

    // First heartbeat → continue (iteration becomes 1)
    const r1 = runLoopHeartbeat(root, runId, {});
    expect(r1.action).toBe("continue");

    // Agent runs the stop command successfully
    logRun(root, runId, "stop-check", "", undefined, {
      command: "npm test",
      exitCode: 0,
      outputHash: "ok",
    });

    // Second heartbeat: iteration(1) >= max(1), but stop is checked FIRST → must finish, not block
    const r2 = runLoopHeartbeat(root, runId, {});
    expect(r2.action).toBe("finish");
    expect(r2.next_status).toBe("evidence_required");
    expect(loadRunApproval(root, runId).status).toBe("evidence_required");
  });

  it("counts evidence recorded before the first heartbeat (anchored to approved_at)", () => {
    const runId = initRun(root, uniqueGoal());
    writePlan(runId, planWithLoop("npm test", 5));
    reviewPlan(root, runId);
    approveRun(root, runId, "user");
    updateApproval(root, runId, (r) => ({ ...r, status: "doing" }));

    // Record stop-check BEFORE any heartbeat (no loop.json yet).
    logRun(root, runId, "stop-check", "", undefined, {
      command: "npm test",
      exitCode: 0,
      outputHash: "ok",
    });

    // First heartbeat anchors freshness to approved_at, so this evidence counts → finish.
    const r = runLoopHeartbeat(root, runId, {});
    expect(r.action).toBe("finish");
    expect(r.next_status).toBe("evidence_required");
  });
});

// ── heartbeat: max_iterations exhausted ──────────────────────────────────────

describe("heartbeat — max_iterations exhausted", () => {
  beforeEach(setup);
  afterEach(teardown);

  it("returns finish+blocked when iteration >= max_iterations", () => {
    const runId = initRun(root, uniqueGoal());
    writePlan(runId, planWithLoop("npm test", 3));
    reviewPlan(root, runId);
    approveRun(root, runId, "user");
    updateApproval(root, runId, (r) => ({ ...r, status: "doing" }));

    // Force iteration to max
    writeLoopState(root, runId, {
      run_id: runId,
      iteration: 3,
      iteration_start_ts: new Date(0).toISOString(),
      abort_requested: false,
    });

    const result = runLoopHeartbeat(root, runId, {});
    expect(result.action).toBe("finish");
    expect(result.next_status).toBe("blocked");
  });
});

// ── heartbeat: abort requested ───────────────────────────────────────────────

describe("heartbeat — abort requested", () => {
  beforeEach(setup);
  afterEach(teardown);

  it("returns finish+blocked when abort_requested=true", () => {
    const runId = initRun(root, uniqueGoal());
    writePlan(runId, planWithLoop("npm test", 10));
    reviewPlan(root, runId);
    approveRun(root, runId, "user");
    updateApproval(root, runId, (r) => ({ ...r, status: "doing" }));

    writeLoopState(root, runId, {
      run_id: runId,
      iteration: 1,
      iteration_start_ts: new Date().toISOString(),
      abort_requested: true,
      abort_reason: "cancelled",
      abort_by: "user",
    });

    const result = runLoopHeartbeat(root, runId, {});
    expect(result.action).toBe("finish");
    expect(result.next_status).toBe("blocked");
    expect(result.reason).toMatch(/abort/i);
  });
});

// ── max_iterations approve-time validation ────────────────────────────────────

describe("approve — loop_policy validation", () => {
  beforeEach(setup);
  afterEach(teardown);

  it("accepts valid max_iterations", () => {
    const runId = initRun(root, uniqueGoal());
    writePlan(runId, planWithLoop("npm test", 10));
    reviewPlan(root, runId);
    expect(() => approveRun(root, runId, "user")).not.toThrow();
  });

  it("rejects max_iterations > 100 at plan validation", () => {
    const runId = initRun(root, uniqueGoal());
    writePlan(runId, planWithLoop("npm test", 101));
    // Schema validation kicks in at reviewPlan (which calls validatePlan → parsePlanMarkdown)
    expect(() => reviewPlan(root, runId)).toThrow(/max_iterations/i);
  });

  it("stores loop_policy in approval record", () => {
    const runId = initRun(root, uniqueGoal());
    writePlan(runId, planWithLoop("npm test", 7));
    reviewPlan(root, runId);
    approveRun(root, runId, "user");

    const approval = loadRunApproval(root, runId);
    expect(approval.loop_policy).toBeDefined();
    expect(approval.loop_policy!.stop_command).toBe("npm test");
    expect(approval.loop_policy!.max_iterations).toBe(7);
  });

  it("re-approving a plan without loop removes a stale loop_policy", () => {
    const runId = initRun(root, uniqueGoal());
    writePlan(runId, planWithLoop("npm test", 5));
    reviewPlan(root, runId);
    approveRun(root, runId, "user");
    expect(loadRunApproval(root, runId).loop_policy).toBeDefined();

    // Plan is revised to drop the loop section, then re-reviewed & re-approved.
    updateApproval(root, runId, (r) => ({ ...r, status: "changes_requested" }));
    writePlan(runId, basePlan());
    reviewPlan(root, runId);
    approveRun(root, runId, "user");

    expect(loadRunApproval(root, runId).loop_policy).toBeUndefined();
  });
});

// ── default template does not auto-enable loop ───────────────────────────────

describe("default template", () => {
  beforeEach(setup);
  afterEach(teardown);

  it("default plan.md (zh-CN) stop-condition section does not enable loop", () => {
    // The default template's steps are placeholders, so the whole plan is intentionally
    // not approvable as-is. We assert specifically that its stop-condition section (which
    // uses commented-out placeholders) never produces a loop policy: inject valid steps
    // while keeping the template's stop-condition section verbatim.
    const runId = initRun(root, uniqueGoal());
    const tmpl = readFileSync(join(root, ".agent-loop", "runs", runId, "plan.md"), "utf8");
    const stopIdx = tmpl.indexOf("# 停止条件");
    expect(stopIdx).toBeGreaterThan(-1);
    const stopSection = tmpl.slice(stopIdx);
    const plan = parsePlanMarkdown(basePlan(`\n${stopSection}`));
    expect(plan.loop).toBeUndefined();
  });

  it("commented-out stop condition placeholder is ignored", () => {
    const planWithCommentedLoop = basePlan(`
# Stop condition
<!--
**Command:** npm test
**Max iterations:** 10
-->
`);
    const plan = parsePlanMarkdown(planWithCommentedLoop);
    expect(plan.loop).toBeUndefined();
  });
});

// ── log stop-check requires structured options ───────────────────────────────

describe("log stop-check", () => {
  beforeEach(setup);
  afterEach(teardown);

  it("throws when stop-check is logged without structured options", () => {
    const runId = initRun(root, uniqueGoal());
    writePlan(runId, planWithLoop());
    reviewPlan(root, runId);
    approveRun(root, runId, "user");
    expect(() => logRun(root, runId, "stop-check", "", undefined, undefined)).toThrow(/required/i);
  });
});
