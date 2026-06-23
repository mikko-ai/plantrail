import { existsSync } from "node:fs";
import {
  agentLoopRoot,
  authorityApprovalPath,
  currentRunPointerPath,
  runDir,
  runFile,
} from "../paths.js";
import { readText, writeText } from "./fs-safe.js";
import type { ApprovalRecord } from "../types.js";
import { readJson, writeJson, writeJsonAtomic } from "./fs-safe.js";
import { mkdirSync } from "node:fs";

export function resolveProjectRoot(cwd = process.cwd()): string {
  return cwd;
}

export function getActiveRunId(projectRoot: string): string | null {
  const pointer = currentRunPointerPath(projectRoot);
  if (!existsSync(pointer)) return null;
  const runId = readText(pointer).trim();
  if (!runId) return null;
  if (!existsSync(runDir(projectRoot, runId))) return null;
  return runId;
}

export function setActiveRunId(projectRoot: string, runId: string): void {
  mkdirSync(agentLoopRoot(projectRoot), { recursive: true });
  writeText(currentRunPointerPath(projectRoot), `${runId}\n`);
}

export function readAuthorityApproval(runId: string): ApprovalRecord {
  const path = authorityApprovalPath(runId);
  if (!existsSync(path)) {
    throw new Error(`Authority approval not found for run: ${runId}`);
  }
  return readJson<ApprovalRecord>(path);
}

export function writeAuthorityApproval(record: ApprovalRecord): void {
  const path = authorityApprovalPath(record.run_id);
  mkdirSync(path.replace(/\/approval\.json$/, ""), { recursive: true, mode: 0o700 });
  writeJsonAtomic(path, record);
}

export function syncApprovalMirror(projectRoot: string, runId: string, record: ApprovalRecord): void {
  const mirror = runFile(projectRoot, runId, "approval.json");
  writeJson(mirror, record);
}

export function loadRunApproval(projectRoot: string, runId: string): ApprovalRecord {
  return readAuthorityApproval(runId);
}

export function resolveGateRunId(projectRoot: string, explicitRunId?: string): string {
  const active = getActiveRunId(projectRoot);
  const runId = explicitRunId ?? active;
  if (!runId) {
    throw new Error("No active run. Use `plantrail use <run>` or `plantrail init-run`.");
  }
  if (active && explicitRunId && active !== explicitRunId) {
    throw new Error(`Run mismatch: active=${active}, event=${explicitRunId}`);
  }
  if (active && !explicitRunId && runId !== active) {
    throw new Error(`current-run pointer invalid for active run ${runId}`);
  }
  return runId;
}
