import { writeAuthorityApproval, setActiveRunId, syncApprovalMirror } from "../core/run-resolver.js";
import { withRunLock } from "../core/lock.js";
import {
  appendEvent,
  assertCanStartNewRun,
  copyTemplate,
  ensureAgentLoop,
} from "../core/run-store.js";
import { writeText } from "../core/fs-safe.js";
import { runFile } from "../paths.js";
import type { ApprovalRecord } from "../types.js";
import { validateApproval } from "../core/schema-validator.js";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "run";
}

function makeRunId(goal: string): string {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    "-",
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("");
  return `${stamp}-${slugify(goal)}`;
}

export function initRun(projectRoot: string, goal: string): string {
  ensureAgentLoop(projectRoot);
  assertCanStartNewRun(projectRoot);
  const runId = makeRunId(goal);
  return withRunLock(projectRoot, runId, () => {
    writeText(runFile(projectRoot, runId, "request.md"), `# 请求\n\n${goal.trim()}\n`);
    copyTemplate("plan.md", runFile(projectRoot, runId, "plan.md"));
    copyTemplate("review.md", runFile(projectRoot, runId, "review.md"));
    copyTemplate("doing.md", runFile(projectRoot, runId, "doing.md"));
    copyTemplate("evidence.md", runFile(projectRoot, runId, "evidence.md"));
    copyTemplate("final.md", runFile(projectRoot, runId, "final.md"));
    writeText(runFile(projectRoot, runId, "events.jsonl"), "");

    const record: ApprovalRecord = {
      run_id: runId,
      status: "draft",
      updated_at: new Date().toISOString(),
    };
    validateApproval(record);
    writeAuthorityApproval(record);
    syncApprovalMirror(projectRoot, runId, record);

    setActiveRunId(projectRoot, runId);
    appendEvent(projectRoot, runId, { kind: "init", message: `Run created: ${goal}` });
    return runId;
  });
}
