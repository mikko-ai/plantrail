import { readText } from "../core/fs-safe.js";
import { parsePlanMarkdown } from "../core/schema-validator.js";
import { requireRun } from "../core/run-store.js";
import { runFile } from "../paths.js";

export function validatePlan(projectRoot: string, runId: string): void {
  requireRun(projectRoot, runId);
  const content = readText(runFile(projectRoot, runId, "plan.md"));
  parsePlanMarkdown(content);
}
