import { existsSync, readFileSync } from "node:fs";
import { loopStatePath, runFile } from "../paths.js";
import { readAuthorityApproval } from "./run-resolver.js";
import { verifyPlanIntegrity } from "./integrity.js";
import { readText, readJson, writeJson } from "./fs-safe.js";
import { withRunLockRetry } from "./lock.js";
import { updateApproval } from "./run-store.js";
import { appendEvent } from "./run-store.js";
import { canTransition } from "./state-machine.js";
import { parsePlanMarkdown, planToLoopPolicy } from "./schema-validator.js";
import type { ApprovalStatus, LoopHeartbeatResult, LoopPolicy, LoopState, WorkflowEvent } from "../types.js";

/** Maximum max_iterations accepted at approve time. */
export const MAX_LOOP_ITERATIONS = 100;

/**
 * Names of hook events that indicate the agent is stopping.
 * Cursor uses lowercase "stop"; Claude/Codex use "Stop".
 */
export const STOP_EVENT_NAMES = new Set(["stop", "Stop"]);

export function isStopEvent(event: string): boolean {
  return STOP_EVENT_NAMES.has(event);
}

/** Normalize a shell command string for comparison (trim, collapse whitespace). */
function normalizeCommand(cmd: string): string {
  return cmd.trim().replace(/\s+/g, " ");
}

function makeEmptyLoopState(runId: string): LoopState {
  return {
    run_id: runId,
    iteration: 0,
    iteration_start_ts: new Date().toISOString(),
    abort_requested: false,
  };
}

export function readLoopState(projectRoot: string, runId: string): LoopState {
  const path = loopStatePath(projectRoot, runId);
  if (!existsSync(path)) return makeEmptyLoopState(runId);
  try {
    return readJson<LoopState>(path);
  } catch {
    return makeEmptyLoopState(runId);
  }
}

export function writeLoopState(projectRoot: string, runId: string, state: LoopState): void {
  writeJson(loopStatePath(projectRoot, runId), state);
}

/** Read events.jsonl and return all loop_stop_check events for this run. */
function readStopCheckEvents(projectRoot: string, runId: string): WorkflowEvent[] {
  const eventsPath = runFile(projectRoot, runId, "events.jsonl");
  if (!existsSync(eventsPath)) return [];
  const lines = readFileSync(eventsPath, "utf8").split("\n").filter(Boolean);
  const events: WorkflowEvent[] = [];
  for (const line of lines) {
    try {
      const ev = JSON.parse(line) as WorkflowEvent;
      if (ev.kind === "loop_stop_check") events.push(ev);
    } catch { /* skip malformed lines */ }
  }
  return events;
}

/**
 * Check if a fresh (post-iteration-start) stop-check event exists in events.jsonl
 * with the given command and exit_code === 0.
 */
function hasSuccessfulStopCheck(
  projectRoot: string,
  runId: string,
  stopCommand: string,
  iterationStartTs: string,
): boolean {
  const events = readStopCheckEvents(projectRoot, runId);
  const norm = normalizeCommand(stopCommand);
  for (const ev of events) {
    const meta = ev.meta ?? {};
    if (
      typeof meta.exit_code === "number" &&
      meta.exit_code === 0 &&
      typeof meta.command === "string" &&
      normalizeCommand(meta.command) === norm &&
      typeof ev.ts === "string" &&
      ev.ts >= iterationStartTs
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Detect whether the Stop payload indicates user abort or error (should not continue).
 * Cursor sends status:"aborted"|"error"; we also check for a plantrail abort_requested flag.
 */
export function isHostAbortSignal(payload: Record<string, unknown>): boolean {
  const status = payload.status;
  return status === "aborted" || status === "error";
}

/**
 * Persist a terminal status transition from the current approval status.
 * Returns true if the target status is now in effect (either freshly written or
 * already equal), false if the write failed or the transition was illegal.
 * Never throws — the caller decides how to react to a failed persist.
 */
function persistStatus(
  projectRoot: string,
  runId: string,
  target: ApprovalStatus,
): boolean {
  try {
    let applied = false;
    updateApproval(projectRoot, runId, (r) => {
      if (r.status === target) {
        applied = true;
        return r;
      }
      if (canTransition(r.status, target)) {
        applied = true;
        return { ...r, status: target };
      }
      // Illegal transition from current status — leave unchanged.
      return r;
    });
    return applied;
  } catch {
    return false;
  }
}

/**
 * Core heartbeat logic.  Must be called inside withRunLockRetry so state is consistent.
 */
function evaluateHeartbeatLocked(
  projectRoot: string,
  runId: string,
  payload: Record<string, unknown>,
): LoopHeartbeatResult {
  // 1. Detect host abort/error signal — never continue
  if (isHostAbortSignal(payload)) {
    appendEvent(projectRoot, runId, {
      kind: "loop_host_abort",
      message: `Host abort/error signal: status=${String(payload.status)}`,
    });
    const persisted = persistStatus(projectRoot, runId, "blocked");
    return {
      action: "finish",
      reason: "host abort/error signal",
      next_status: "blocked",
      persist_failed: !persisted,
    };
  }

  // 2. Load and verify approval integrity
  let approval;
  try {
    approval = readAuthorityApproval(runId);
  } catch {
    return { action: "noop", reason: "no approval found for run" };
  }

  const planPath = runFile(projectRoot, runId, "plan.md");
  let planContent: string;
  try {
    planContent = readText(planPath);
  } catch {
    return { action: "noop", reason: "plan.md not found" };
  }

  if (approval.plan_hash && approval.signature) {
    const integrity = verifyPlanIntegrity(planContent, approval.plan_hash, approval.signature);
    if (!integrity.ok) {
      appendEvent(projectRoot, runId, {
        kind: "loop_tamper_detected",
        message: `Plan tampered: ${integrity.reason}`,
      });
      const persisted = persistStatus(projectRoot, runId, "changes_requested");
      return {
        action: "finish",
        reason: `plan tampered: ${integrity.reason}`,
        next_status: "changes_requested",
        persist_failed: !persisted,
      };
    }
  }

  // 3. Derive loop_policy from the verified plan and compare with approval
  let derivedPolicy: LoopPolicy | undefined;
  try {
    const plan = parsePlanMarkdown(planContent);
    derivedPolicy = planToLoopPolicy(plan);
  } catch {
    derivedPolicy = undefined;
  }

  const approvalPolicy = approval.loop_policy;

  // Mismatch check: plan has loop but approval doesn't (or vice versa) → treat as tamper
  if ((derivedPolicy == null) !== (approvalPolicy == null)) {
    appendEvent(projectRoot, runId, {
      kind: "loop_policy_mismatch",
      message: "loop_policy mismatch between plan and approval — treating as tamper",
    });
    const persisted = persistStatus(projectRoot, runId, "changes_requested");
    return {
      action: "finish",
      reason: "loop_policy mismatch between plan and approval",
      next_status: "changes_requested",
      persist_failed: !persisted,
    };
  }

  // 4. No loop policy → noop (allow stop, backward compatible)
  if (!derivedPolicy || !approvalPolicy) {
    return { action: "noop", reason: "no loop policy — pass through" };
  }

  // Verify derived policy matches approval policy
  if (
    normalizeCommand(derivedPolicy.stop_command) !== normalizeCommand(approvalPolicy.stop_command) ||
    derivedPolicy.max_iterations !== approvalPolicy.max_iterations
  ) {
    appendEvent(projectRoot, runId, {
      kind: "loop_policy_mismatch",
      message: "loop_policy fields changed after approval — treating as tamper",
    });
    const persisted = persistStatus(projectRoot, runId, "changes_requested");
    return {
      action: "finish",
      reason: "loop_policy changed after approval",
      next_status: "changes_requested",
      persist_failed: !persisted,
    };
  }

  const policy = approvalPolicy;

  // 5. Load loop runtime state. On the first heartbeat (no loop.json yet) anchor the
  // freshness baseline to approval time, so a stop-check recorded after approval but
  // before the first Stop heartbeat is still counted as fresh.
  const loopStateExists = existsSync(loopStatePath(projectRoot, runId));
  const loopState = readLoopState(projectRoot, runId);
  if (!loopStateExists) {
    loopState.iteration_start_ts =
      approval.approved_at ?? approval.updated_at ?? loopState.iteration_start_ts;
  }

  // Check plantrail-level abort
  if (loopState.abort_requested) {
    appendEvent(projectRoot, runId, {
      kind: "loop_abort_honored",
      message: `Abort honored: ${loopState.abort_reason ?? "no reason"}`,
    });
    const persisted = persistStatus(projectRoot, runId, "blocked");
    return {
      action: "finish",
      reason: `abort requested: ${loopState.abort_reason ?? ""}`,
      next_status: "blocked",
      persist_failed: !persisted,
    };
  }

  // 6. If still in "approved" state (no gated action has happened yet), just continue
  if (approval.status === "approved") {
    const nextState: LoopState = {
      ...loopState,
      iteration: loopState.iteration === 0 ? 0 : loopState.iteration,
    };
    writeLoopState(projectRoot, runId, nextState);
    appendEvent(projectRoot, runId, {
      kind: "loop_heartbeat",
      message: "status=approved, agent has not started yet — prompting to begin",
    });
    return {
      action: "continue",
      reason: "run not yet started",
      followup_message: `plantrail loop: run is approved but execution has not started. Begin executing step-1 of the plan now. (iteration 0/${policy.max_iterations})`,
    };
  }

  // 7. Check stop condition FIRST (before the max-iterations guard) so the final
  // successful iteration is never swallowed by max-iterations (off-by-one fix).
  const stopMet = hasSuccessfulStopCheck(
    projectRoot,
    runId,
    policy.stop_command,
    loopState.iteration_start_ts,
  );

  if (stopMet) {
    const persisted = persistStatus(projectRoot, runId, "evidence_required");
    if (!persisted) {
      // fail-closed: do not claim completion if we could not record it.
      appendEvent(projectRoot, runId, {
        kind: "loop_stop_persist_failed",
        message: "stop condition met but evidence_required transition failed",
      });
      return {
        action: "continue",
        reason: "stop met but persist failed — retry",
        followup_message:
          "plantrail loop: stop condition appears met but the run state could not be updated. Please verify run state before continuing.",
      };
    }
    appendEvent(projectRoot, runId, {
      kind: "loop_stop_met",
      message: `Stop condition met: ${policy.stop_command}`,
    });
    return {
      action: "finish",
      reason: `stop condition met: ${policy.stop_command}`,
      next_status: "evidence_required",
    };
  }

  // 8. Check max_iterations exhaustion (only after stop condition was not met).
  if (loopState.iteration >= policy.max_iterations) {
    appendEvent(projectRoot, runId, {
      kind: "loop_max_iterations",
      message: `Max iterations reached: ${loopState.iteration}/${policy.max_iterations}`,
    });
    const persisted = persistStatus(projectRoot, runId, "blocked");
    return {
      action: "finish",
      reason: `max_iterations (${policy.max_iterations}) exhausted`,
      next_status: "blocked",
      persist_failed: !persisted,
    };
  }

  // 9. Continue — increment iteration and update iteration_start_ts
  const nextIteration = loopState.iteration + 1;
  const nextStartTs = new Date().toISOString();
  const nextState: LoopState = {
    ...loopState,
    iteration: nextIteration,
    iteration_start_ts: nextStartTs,
    last_stop_check: new Date().toISOString(),
  };
  writeLoopState(projectRoot, runId, nextState);

  appendEvent(projectRoot, runId, {
    kind: "loop_heartbeat",
    message: `Continuing loop: iteration ${nextIteration}/${policy.max_iterations}`,
    meta: { iteration: nextIteration, max_iterations: policy.max_iterations },
  });

  return {
    action: "continue",
    reason: `stop condition not yet met — iteration ${nextIteration}/${policy.max_iterations}`,
    followup_message:
      `plantrail loop — iteration ${nextIteration}/${policy.max_iterations}: ` +
      `stop condition "${policy.stop_command}" not yet satisfied. ` +
      `Continue working through the plan steps. When done, run the stop command and log the result with: ` +
      `plantrail log <run> --kind stop-check --command "${policy.stop_command}" --exit-code <code> --output-hash <hash>`,
  };
}

/**
 * Public entry point: run the loop heartbeat with retry-safe locking.
 * Safe to call from a Stop hook process.
 */
export function runLoopHeartbeat(
  projectRoot: string,
  runId: string,
  payload: Record<string, unknown>,
): LoopHeartbeatResult {
  return withRunLockRetry(
    projectRoot,
    runId,
    () => evaluateHeartbeatLocked(projectRoot, runId, payload),
    () => ({
      action: "continue" as const,
      reason: "lock contention — safe continue fallback",
      followup_message: "plantrail loop: could not acquire lock, retrying. Continue working.",
    }),
  );
}
