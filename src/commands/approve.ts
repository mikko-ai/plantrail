import { readText } from "../core/fs-safe.js";
import { sha256, signPlanHash } from "../core/integrity.js";
import { updateApproval } from "../core/run-store.js";
import { requireRun } from "../core/run-store.js";
import { runFile } from "../paths.js";
import { parsePlanMarkdown, planToAllowedSteps, planToLoopPolicy } from "../core/schema-validator.js";
import { validatePlan } from "./validate-plan.js";
import { MAX_LOOP_ITERATIONS } from "../core/loop.js";

export function approveRun(projectRoot: string, runId: string, by: string): void {
  requireRun(projectRoot, runId);
  validatePlan(projectRoot, runId);
  const planContent = readText(runFile(projectRoot, runId, "plan.md"));
  const plan = parsePlanMarkdown(planContent);
  const plan_hash = sha256(planContent);
  const signature = signPlanHash(plan_hash);
  const allowed_steps = planToAllowedSteps(plan);
  const loop_policy = planToLoopPolicy(plan);

  if (loop_policy) {
    if (loop_policy.max_iterations < 1 || loop_policy.max_iterations > MAX_LOOP_ITERATIONS) {
      throw new Error(
        `max_iterations must be between 1 and ${MAX_LOOP_ITERATIONS}, got ${loop_policy.max_iterations}`,
      );
    }
  }

  updateApproval(projectRoot, runId, (record) => {
    if (record.status !== "review_required") {
      throw new Error(`Approve only allowed from review_required, got ${record.status}`);
    }
    // Rebuild explicitly so a re-approval of a plan that no longer declares a loop
    // does NOT retain a stale loop_policy from a previous approval.
    const { loop_policy: _previousLoopPolicy, ...rest } = record;
    void _previousLoopPolicy;
    return {
      ...rest,
      status: "approved",
      plan_hash,
      signature,
      allowed_steps,
      approved_by: by,
      approved_at: new Date().toISOString(),
      ...(loop_policy ? { loop_policy } : {}),
    };
  });
}
