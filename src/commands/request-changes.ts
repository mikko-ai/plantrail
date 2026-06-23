import { appendMarkdownSection } from "../core/fs-safe.js";
import { updateApproval } from "../core/run-store.js";
import { requireRun } from "../core/run-store.js";
import { runFile } from "../paths.js";

export function requestChanges(projectRoot: string, runId: string, reason: string): void {
  requireRun(projectRoot, runId);
  appendMarkdownSection(runFile(projectRoot, runId, "review.md"), "Changes requested", reason);
  updateApproval(projectRoot, runId, (record) => {
    if (record.status === "review_required" || record.status === "approved") {
      return {
        ...record,
        status: "changes_requested",
        plan_hash: undefined,
        signature: undefined,
        allowed_steps: undefined,
        approved_by: undefined,
        approved_at: undefined,
      };
    }
    throw new Error(`Cannot request changes from status=${record.status}`);
  });
}
