import { readText } from "../core/fs-safe.js";
import { sha256, signPlanHash } from "../core/integrity.js";
import { updateApproval } from "../core/run-store.js";
import { requireRun } from "../core/run-store.js";
import { runFile } from "../paths.js";
import { parsePlanMarkdown, planToAllowedSteps } from "../core/schema-validator.js";
import { validatePlan } from "./validate-plan.js";

export function approveRun(projectRoot: string, runId: string, by: string): void {
  requireRun(projectRoot, runId);
  validatePlan(projectRoot, runId);
  const planContent = readText(runFile(projectRoot, runId, "plan.md"));
  const plan = parsePlanMarkdown(planContent);
  const plan_hash = sha256(planContent);
  const signature = signPlanHash(plan_hash);
  const allowed_steps = planToAllowedSteps(plan);

  updateApproval(projectRoot, runId, (record) => {
    if (record.status !== "review_required") {
      throw new Error(`Approve only allowed from review_required, got ${record.status}`);
    }
    return {
      ...record,
      status: "approved",
      plan_hash,
      signature,
      allowed_steps,
      approved_by: by,
      approved_at: new Date().toISOString(),
    };
  });
}
