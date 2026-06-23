import { readJson, readText } from "../core/fs-safe.js";
import { listRuns, requireRun } from "../core/run-store.js";
import {
  getActiveRunId,
  loadRunApproval,
  setActiveRunId,
} from "../core/run-resolver.js";
import { agentLoopConfigPath, runFile } from "../paths.js";
import { existsSync } from "node:fs";

export function listCommand(projectRoot: string): string[] {
  return listRuns(projectRoot);
}

export function showRun(projectRoot: string, runId: string): Record<string, unknown> {
  requireRun(projectRoot, runId);
  const approval = loadRunApproval(projectRoot, runId);
  return {
    run_id: runId,
    active: getActiveRunId(projectRoot) === runId,
    approval,
    request_excerpt: readText(runFile(projectRoot, runId, "request.md")).slice(0, 200),
  };
}

export function useRun(projectRoot: string, runId: string): void {
  requireRun(projectRoot, runId);
  setActiveRunId(projectRoot, runId);
}

export function statusCommand(projectRoot: string): Record<string, unknown> {
  const active = getActiveRunId(projectRoot);
  const runs = listRuns(projectRoot);
  const config = existsSync(agentLoopConfigPath(projectRoot))
    ? readJson(agentLoopConfigPath(projectRoot))
    : null;
  const hookProbe = probeHooks(projectRoot);
  return {
    active_run: active,
    run_count: runs.length,
    config,
    hook_probe: hookProbe,
    warnings: hookProbe.issues,
  };
}

function probeHooks(projectRoot: string): {
  cursor: boolean;
  claude: boolean;
  codex: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  const cursor = existsSync(`${projectRoot}/.cursor/hooks.json`);
  const claude = existsSync(`${projectRoot}/.claude/settings.json`);
  const codex = existsSync(`${projectRoot}/.codex/hooks.json`);
  if (!cursor && !claude && !codex) {
    issues.push("No agent hooks detected; gate enforcement may fail-open");
  }
  if (codex) {
    issues.push("Codex hooks require manual `/hooks` trust before enforcement");
  }
  return { cursor, claude, codex, issues };
}
