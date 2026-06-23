import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  agentLoopConfigPath,
  agentLoopRoot,
  runDir,
  runFile,
  runsRoot,
} from "../paths.js";
import { appendJsonl, readJson, readText, writeJson, writeText } from "./fs-safe.js";
import {
  getActiveRunId,
  loadRunApproval,
  readAuthorityApproval,
  setActiveRunId,
  syncApprovalMirror,
  writeAuthorityApproval,
} from "./run-resolver.js";
import { assertTransition, isExecutionAllowed } from "./state-machine.js";
import type { AgentLoopConfig, ApprovalRecord, WorkflowEvent } from "../types.js";
import { validateApproval } from "./schema-validator.js";
import {
  normalizeLanguage,
  resolveTemplatePath,
} from "./i18n.js";

export function ensureAgentLoop(projectRoot: string): void {
  mkdirSync(agentLoopRoot(projectRoot), { recursive: true });
  mkdirSync(runsRoot(projectRoot), { recursive: true });
  const configPath = agentLoopConfigPath(projectRoot);
  if (!existsSync(configPath)) {
    const defaultConfig: AgentLoopConfig = {
      scope: "project",
      approval_policy: "user",
      language: "zh-CN",
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
  if (next.status !== current.status) {
    assertTransition(current.status, next.status);
  }
  validateApproval(next);
  writeAuthorityApproval(next);
  syncApprovalMirror(projectRoot, runId, next);
  return next;
}

export function loadAgentLoopConfig(projectRoot: string): AgentLoopConfig {
  ensureAgentLoop(projectRoot);
  return readJson<AgentLoopConfig>(agentLoopConfigPath(projectRoot));
}

export function updateAgentLoopConfig(
  projectRoot: string,
  mutate: (config: AgentLoopConfig) => AgentLoopConfig,
): AgentLoopConfig {
  const current = loadAgentLoopConfig(projectRoot);
  const next = mutate(current);
  writeJson(agentLoopConfigPath(projectRoot), next);
  return next;
}

export function assertCanStartNewRun(projectRoot: string): void {
  const activeId = getActiveRunId(projectRoot);
  if (!activeId) return;
  try {
    const approval = readAuthorityApproval(activeId);
    if (isExecutionAllowed(approval.status)) {
      throw new Error(
        `Active run ${activeId} is in status=${approval.status}. Close it with 'plantrail close' before starting a new run.`,
      );
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes("Authority approval not found")) {
      return;
    }
    throw err;
  }
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

export function copyTemplate(projectRoot: string, name: string, dest: string): void {
  const config = loadAgentLoopConfig(projectRoot);
  const lang = normalizeLanguage(config.language);
  const src = resolveTemplatePath(name, lang);
  if (!src) {
    throw new Error(`Template not found: ${name} (language=${lang})`);
  }
  writeText(dest, readText(src));
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
