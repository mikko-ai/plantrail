import { readJson, readText } from "../core/fs-safe.js";
import { listRuns, requireRun } from "../core/run-store.js";
import {
  getActiveRunId,
  loadRunApproval,
  setActiveRunId,
} from "../core/run-resolver.js";
import { agentLoopConfigPath, runFile } from "../paths.js";
import { readLoopState } from "../core/loop.js";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function listCommand(projectRoot: string): string[] {
  return listRuns(projectRoot);
}

export function showRun(projectRoot: string, runId: string): Record<string, unknown> {
  requireRun(projectRoot, runId);
  const approval = loadRunApproval(projectRoot, runId);
  const loopState = readLoopState(projectRoot, runId);
  const loop = approval.loop_policy
    ? {
        max_iterations: approval.loop_policy.max_iterations,
        stop_command: approval.loop_policy.stop_command,
        iteration: loopState.iteration,
        iteration_start_ts: loopState.iteration_start_ts,
        last_stop_check: loopState.last_stop_check,
        abort_requested: loopState.abort_requested,
        abort_reason: loopState.abort_reason,
      }
    : null;
  return {
    run_id: runId,
    active: getActiveRunId(projectRoot) === runId,
    approval,
    loop,
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

  let activeLoop: Record<string, unknown> | null = null;
  if (active) {
    try {
      const approval = loadRunApproval(projectRoot, active);
      if (approval.loop_policy) {
        const loopState = readLoopState(projectRoot, active);
        activeLoop = {
          iteration: loopState.iteration,
          max_iterations: approval.loop_policy.max_iterations,
          stop_command: approval.loop_policy.stop_command,
          last_stop_check: loopState.last_stop_check,
          abort_requested: loopState.abort_requested,
        };
      }
    } catch { /* no approval yet */ }
  }

  return {
    active_run: active,
    run_count: runs.length,
    config,
    active_loop: activeLoop,
    hook_probe: hookProbe,
    warnings: hookProbe.issues,
  };
}

function probeHooks(projectRoot: string): {
  cursor: boolean;
  claude: boolean;
  codex: boolean;
  hook_bundles: Record<string, boolean>;
  plantrail_registered: Record<string, boolean>;
  issues: string[];
} {
  const issues: string[] = [];
  const cursorHooks = `${projectRoot}/.cursor/hooks.json`;
  const claudeSettings = `${projectRoot}/.claude/settings.json`;
  const codexHooks = `${projectRoot}/.codex/hooks.json`;

  const cursor = existsSync(cursorHooks);
  const claude = existsSync(claudeSettings);
  const codex = existsSync(codexHooks);

  const hook_bundles = {
    cursor: existsSync(join(projectRoot, ".cursor/hooks/plantrail-gate.js")),
    claude: existsSync(join(projectRoot, ".claude/hooks/plantrail-gate.js")),
    codex: existsSync(join(projectRoot, ".codex/hooks/plantrail-gate.js")),
  };

  const plantrail_registered = {
    cursor: configHasPlantrail(cursorHooks),
    claude: configHasPlantrail(claudeSettings),
    codex: configHasPlantrail(codexHooks),
  };

  if (!cursor && !claude && !codex) {
    issues.push("No agent hooks detected; gate enforcement may fail-open");
  }
  for (const [agent, ok] of Object.entries(hook_bundles)) {
    if (plantrail_registered[agent as keyof typeof plantrail_registered] && !ok) {
      issues.push(`${agent} hooks.json references plantrail but bundle missing`);
    }
  }
  if (codex) {
    issues.push("Codex hooks require manual `/hooks` trust before enforcement");
  }
  return { cursor, claude, codex, hook_bundles, plantrail_registered, issues };
}

function configHasPlantrail(path: string): boolean {
  if (!existsSync(path)) return false;
  try {
    const raw = readFileSync(path, "utf8");
    return raw.includes("plantrail-gate") || raw.includes("plantrail");
  } catch {
    return false;
  }
}
