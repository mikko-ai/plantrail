import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  agentLoopConfigPath,
  agentLoopRoot,
  assetsRoot,
  runDir,
  runFile,
  runsRoot,
} from "../paths.js";
import { appendJsonl, readText, writeJson, writeText } from "./fs-safe.js";
import {
  getActiveRunId,
  loadRunApproval,
  readAuthorityApproval,
  setActiveRunId,
  syncApprovalMirror,
  writeAuthorityApproval,
} from "./run-resolver.js";
import { assertTransition } from "./state-machine.js";
import type { AgentLoopConfig, ApprovalRecord, WorkflowEvent } from "../types.js";
import { validateApproval } from "./schema-validator.js";

export function ensureAgentLoop(projectRoot: string): void {
  mkdirSync(agentLoopRoot(projectRoot), { recursive: true });
  mkdirSync(runsRoot(projectRoot), { recursive: true });
  const configPath = agentLoopConfigPath(projectRoot);
  if (!existsSync(configPath)) {
    const defaultConfig: AgentLoopConfig = {
      scope: "project",
      approval_policy: "user",
      high_risk_actions: [
        "install_deps",
        "delete_file",
        "git_commit",
        "git_push",
        "deploy",
        "credentials",
      ],
      installed_agents: [],
    };
    writeJson(configPath, defaultConfig);
  }
}

export function listRuns(projectRoot: string): string[] {
  const root = runsRoot(projectRoot);
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((name: string) => existsSync(join(root, name, "request.md")))
    .sort();
}

export function updateApproval(
  projectRoot: string,
  runId: string,
  mutate: (record: ApprovalRecord) => ApprovalRecord,
): ApprovalRecord {
  const current = readAuthorityApproval(runId);
  const next = mutate({ ...current, updated_at: new Date().toISOString() });
  validateApproval(next);
  writeAuthorityApproval(next);
  syncApprovalMirror(projectRoot, runId, next);
  return next;
}

export function appendEvent(
  projectRoot: string,
  runId: string,
  event: Omit<WorkflowEvent, "ts" | "run_id">,
): void {
  const full: WorkflowEvent = {
    ts: new Date().toISOString(),
    run_id: runId,
    ...event,
  };
  appendJsonl(runFile(projectRoot, runId, "events.jsonl"), full);
}

export function requireRun(projectRoot: string, runId: string): void {
  if (!existsSync(runDir(projectRoot, runId))) {
    throw new Error(`Run not found: ${runId}`);
  }
}

export function copyTemplate(name: string, dest: string): void {
  const src = join(assetsRoot(), "templates", name);
  if (existsSync(src)) {
    writeText(dest, readText(src));
  }
}

export function getRunApprovalSafe(projectRoot: string, runId: string): ApprovalRecord {
  requireRun(projectRoot, runId);
  return loadRunApproval(projectRoot, runId);
}

export function assertActiveRun(projectRoot: string, runId: string): void {
  const active = getActiveRunId(projectRoot);
  if (active !== runId) {
    throw new Error(`Run ${runId} is not the active run (active=${active ?? "none"})`);
  }
}

export { assertTransition, setActiveRunId };
