import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const moduleDir = dirname(fileURLToPath(import.meta.url));

export function packageRoot(): string {
  return resolve(moduleDir, "..");
}

export function assetsRoot(): string {
  return join(packageRoot(), "assets");
}

export function adaptersRoot(): string {
  return join(packageRoot(), "adapters");
}

export function plantrailHome(): string {
  return join(homedir(), ".plantrail");
}

export function plantrailKeyPath(): string {
  return join(plantrailHome(), "key");
}

export function authorityApprovalPath(runId: string): string {
  return join(plantrailHome(), "state", runId, "approval.json");
}

export function agentLoopRoot(projectRoot: string): string {
  return join(resolve(projectRoot), ".agent-loop");
}

export function agentLoopConfigPath(projectRoot: string): string {
  return join(agentLoopRoot(projectRoot), "config.json");
}

export function currentRunPointerPath(projectRoot: string): string {
  return join(agentLoopRoot(projectRoot), "current-run");
}

export function runsRoot(projectRoot: string): string {
  return join(agentLoopRoot(projectRoot), "runs");
}

export function runDir(projectRoot: string, runId: string): string {
  return join(runsRoot(projectRoot), runId);
}

export function runLockPath(projectRoot: string, runId: string): string {
  return join(runDir(projectRoot, runId), ".lock");
}

export function runFile(projectRoot: string, runId: string, name: string): string {
  return join(runDir(projectRoot, runId), name);
}

export function loopStatePath(projectRoot: string, runId: string): string {
  return runFile(projectRoot, runId, "loop.json");
}
