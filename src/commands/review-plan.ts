import { appendMarkdownSection, readText } from "../core/fs-safe.js";
import { updateApproval } from "../core/run-store.js";
import { requireRun } from "../core/run-store.js";
import { runFile } from "../paths.js";
import { validatePlan } from "./validate-plan.js";

export function reviewPlan(projectRoot: string, runId: string): void {
  requireRun(projectRoot, runId);
  validatePlan(projectRoot, runId);
  const reviewPath = runFile(projectRoot, runId, "review.md");
  const content = readText(reviewPath);
  if (!content.includes("## Review checklist")) {
    appendMarkdownSection(reviewPath, "Review checklist", [
      "- Plan is executable",
      "- No obvious omissions or circular dependencies",
      "- No dangerous commands without verification",
      "- Can be executed step-by-step safely",
      "- User approval required for high-risk actions",
      "",
      "**Conclusion**: `approved_recommendation` | `changes_requested`",
    ].join("\n"));
  }
  updateApproval(projectRoot, runId, (record) => {
    if (record.status === "draft" || record.status === "changes_requested") {
      return { ...record, status: "review_required" };
    }
    if (record.status === "review_required") return record;
    throw new Error(`Cannot move to review_required from status=${record.status}`);
  });
}
