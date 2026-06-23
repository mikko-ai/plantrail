import { appendMarkdownSection, readText } from "../core/fs-safe.js";
import { requireRun, updateApproval } from "../core/run-store.js";
import { runFile } from "../paths.js";

export function writeFinal(projectRoot: string, runId: string, summary?: string): void {
  requireRun(projectRoot, runId);
  const path = runFile(projectRoot, runId, "final.md");
  const content = summary ?? readText(path);
  if (summary) {
    appendMarkdownSection(path, "Final summary", summary);
  }
}

export function verifyRun(projectRoot: string, runId: string): void {
  requireRun(projectRoot, runId);
  const evidence = readText(runFile(projectRoot, runId, "evidence.md")).trim();
  if (!evidence || evidence.length < 20) {
    throw new Error("evidence.md is missing or too short; add verification evidence before closing");
  }
  updateApproval(projectRoot, runId, (record) => {
    if (record.status === "doing") {
      return { ...record, status: "evidence_required" };
    }
    if (record.status === "evidence_required" || record.status === "approved") {
      return { ...record, status: "evidence_required" };
    }
    return record;
  });
}

export function closeRun(
  projectRoot: string,
  runId: string,
  status: "done" | "blocked",
): void {
  requireRun(projectRoot, runId);
  if (status === "done") {
    verifyRun(projectRoot, runId);
  }
  updateApproval(projectRoot, runId, (record) => {
    if (status === "done") {
      if (record.status !== "evidence_required") {
        throw new Error(`Close done requires evidence_required, got ${record.status}`);
      }
      return { ...record, status: "done" };
    }
    return { ...record, status: "blocked" };
  });
}
