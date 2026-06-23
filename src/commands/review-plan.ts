import { appendMarkdownSection, readText } from "../core/fs-safe.js";
import { loadAgentLoopConfig, updateApproval, requireRun } from "../core/run-store.js";
import { getMessagesForLanguage, REVIEW_CHECKLIST_MARKERS } from "../core/i18n.js";
import { runFile } from "../paths.js";
import { validatePlan } from "./validate-plan.js";

export function reviewPlan(projectRoot: string, runId: string): void {
  requireRun(projectRoot, runId);
  validatePlan(projectRoot, runId);
  const reviewPath = runFile(projectRoot, runId, "review.md");
  const content = readText(reviewPath);
  const hasChecklist = REVIEW_CHECKLIST_MARKERS.some((marker) => content.includes(marker));
  if (!hasChecklist) {
    const config = loadAgentLoopConfig(projectRoot);
    const messages = getMessagesForLanguage(config.language);
    appendMarkdownSection(reviewPath, messages.reviewChecklistTitle, [
      ...messages.reviewChecklistItems,
      "",
      messages.reviewConclusion,
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
