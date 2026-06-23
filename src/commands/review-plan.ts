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
  if (!content.includes("## 审查清单") && !content.includes("## Review checklist")) {
    appendMarkdownSection(reviewPath, "审查清单", [
      "- 计划可执行",
      "- 没有明显遗漏或循环依赖",
      "- 没有没有验证措施的危险命令",
      "- 可以安全地逐步执行",
      "- 高危动作需要用户批准",
      "",
      "**结论**：`approved_recommendation` | `changes_requested`",
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
