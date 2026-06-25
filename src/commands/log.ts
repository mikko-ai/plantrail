import { appendJsonl, appendMarkdownSection } from "../core/fs-safe.js";
import { appendEvent, requireRun } from "../core/run-store.js";
import { runFile } from "../paths.js";
import type { LogKind } from "../types.js";
import { validateEvent } from "../core/schema-validator.js";

export interface StopCheckOptions {
  command: string;
  exitCode: number;
  outputHash?: string;
  cwd?: string;
}

export function logRun(
  projectRoot: string,
  runId: string,
  kind: LogKind,
  message: string,
  stepId?: string,
  stopCheck?: StopCheckOptions,
): void {
  requireRun(projectRoot, runId);

  if (kind === "stop-check") {
    if (!stopCheck) {
      throw new Error("--command and --exit-code are required for --kind stop-check");
    }
    const observedAt = new Date().toISOString();
    const meta: Record<string, unknown> = {
      command: stopCheck.command,
      exit_code: stopCheck.exitCode,
      observed_at: observedAt,
    };
    if (stopCheck.outputHash) meta.output_hash = stopCheck.outputHash;
    if (stopCheck.cwd) meta.cwd = stopCheck.cwd;

    const stopCheckMsg = message || `stop-check: ${stopCheck.command} → exit ${stopCheck.exitCode}`;
    const event = {
      ts: observedAt,
      kind: "loop_stop_check",
      run_id: runId,
      message: stopCheckMsg,
      meta,
    };
    validateEvent(event);
    appendJsonl(runFile(projectRoot, runId, "events.jsonl"), event);
    appendMarkdownSection(
      runFile(projectRoot, runId, "evidence.md"),
      "Stop Check",
      `Command: \`${stopCheck.command}\`  exit: ${stopCheck.exitCode}  ${observedAt}`,
    );
    appendEvent(projectRoot, runId, { kind: "log:stop-check", message: stopCheckMsg });
    return;
  }

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
