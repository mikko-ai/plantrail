import { evaluateGate } from "../core/gate-policy.js";
import { appendEvent, getRunApprovalSafe } from "../core/run-store.js";
import { resolveGateRunId } from "../core/run-resolver.js";
import { invalidateOnPlanChange } from "../core/state-machine.js";
import { readText } from "../core/fs-safe.js";
import { verifyPlanIntegrity } from "../core/integrity.js";
import { runFile } from "../paths.js";
import { updateApproval } from "../core/run-store.js";
import type { GateInput, GateResult } from "../types.js";

export function runGate(
  projectRoot: string,
  input: Omit<GateInput, "run_id"> & { run_id?: string },
): GateResult {
  const runId = resolveGateRunId(projectRoot, input.run_id);
  let approval = getRunApprovalSafe(projectRoot, runId);

  const planContent = readText(runFile(projectRoot, runId, "plan.md"));
  if (approval.plan_hash && approval.signature) {
    const integrity = verifyPlanIntegrity(planContent, approval.plan_hash, approval.signature);
    if (!integrity.ok) {
      const nextStatus = invalidateOnPlanChange(approval.status);
      if (nextStatus) {
        approval = updateApproval(projectRoot, runId, (record) => ({
          ...record,
          status: nextStatus,
          plan_hash: undefined,
          signature: undefined,
          allowed_steps: undefined,
          approved_by: undefined,
          approved_at: undefined,
        }));
      }
    }
  }

  const gateInput: GateInput = {
    ...input,
    run_id: runId,
    project_root: projectRoot,
  };
  const result = evaluateGate(gateInput, approval);

  if (result.decision === "allow" && approval.status === "approved") {
    updateApproval(projectRoot, runId, (record) =>
      record.status === "approved" ? { ...record, status: "doing" } : record,
    );
  }

  appendEvent(projectRoot, runId, {
    kind: "gate",
    message: `${result.decision}: ${result.reason}`,
    meta: { tool: input.tool, event: input.event, step_id: result.step_id },
  });

  return result;
}
