import { appendJsonl, appendMarkdownSection } from "../core/fs-safe.js";
import { appendEvent, requireRun } from "../core/run-store.js";
import { runFile } from "../paths.js";
import type { LogKind } from "../types.js";
import { validateEvent } from "../core/schema-validator.js";

export function logRun(
  projectRoot: string,
  runId: string,
  kind: LogKind,
  message: string,
  stepId?: string,
): void {
  requireRun(projectRoot, runId);
  const heading = kind === "decision" ? "Decision" : kind === "evidence" ? "Evidence" : "Doing";
  const target =
    kind === "evidence"
      ? runFile(projectRoot, runId, "evidence.md")
      : runFile(projectRoot, runId, "doing.md");

  const body = stepId ? `[${stepId}] ${message}` : message;
  appendMarkdownSection(target, heading, body);

  const event = {
    ts: new Date().toISOString(),
    kind,
    run_id: runId,
    step_id: stepId,
    message,
  };
  validateEvent(event);
  appendJsonl(runFile(projectRoot, runId, "events.jsonl"), event);
  appendEvent(projectRoot, runId, { kind: `log:${kind}`, message, step_id: stepId });
}
