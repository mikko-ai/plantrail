import type { ActionType, AllowedStep, GateInput, GateResult } from "../types.js";
import { isExecutionAllowed, isPreApproval } from "./state-machine.js";
import { readText } from "./fs-safe.js";
import { runFile } from "../paths.js";
import { verifyPlanIntegrity } from "./integrity.js";
import type { ApprovalRecord } from "../types.js";

const READ_ONLY_SHELL = [
  /^ls(\s|$)/,
  /^cat(\s|$)/,
  /^grep(\s|$)/,
  /^rg(\s|$)/,
  /^find(\s|$)/,
  /^git\s+status(\s|$)/,
  /^git\s+diff(\s|$)/,
  /^git\s+log(\s|$)/,
  /^pwd(\s|$)/,
  /^head(\s|$)/,
  /^tail(\s|$)/,
];

const HIGH_RISK: ActionType[] = [
  "install_deps",
  "delete_file",
  "git_commit",
  "git_push",
  "deploy",
  "credentials",
];

function relativeTarget(projectRoot: string, target: string): string {
  const root = projectRoot.replace(/\/$/, "");
  if (target.startsWith(root)) {
    return target.slice(root.length).replace(/^\//, "");
  }
  return target;
}

function matchesPattern(value: string, patterns?: string[]): boolean {
  if (!patterns || patterns.length === 0) return true;
  return patterns.some((p) => {
    if (p.startsWith("/") && p.endsWith("/")) {
      return new RegExp(p.slice(1, -1)).test(value);
    }
    if (p.includes("*")) {
      const re = new RegExp(`^${p.replace(/\*/g, ".*")}$`);
      return re.test(value);
    }
    return value.includes(p);
  });
}

function classifyTool(input: GateInput): ActionType {
  const tool = input.tool.toLowerCase();
  const payload = input.payload;
  if (tool.includes("bash") || tool.includes("shell") || tool === "beforeshellexecution") {
    return "shell";
  }
  if (tool.includes("write") || tool.includes("edit") || tool.includes("apply_patch")) {
    return "write_file";
  }
  if (tool.includes("read") || tool.includes("grep") || tool.includes("search")) {
    return "read";
  }
  const cmd = String(payload.command ?? payload.file_path ?? "");
  if (/npm\s+install|pnpm\s+add|yarn\s+add|pip\s+install/.test(cmd)) return "install_deps";
  if (/git\s+commit/.test(cmd)) return "git_commit";
  if (/git\s+push/.test(cmd)) return "git_push";
  if (/rm\s+-rf|rm\s+/.test(cmd)) return "delete_file";
  return "write_file";
}

function extractTarget(input: GateInput): string {
  const p = input.payload;
  return String(p.command ?? p.file_path ?? p.path ?? "");
}

function isReadOnlyShell(command: string): boolean {
  return READ_ONLY_SHELL.some((re) => re.test(command.trim()));
}

function findMatchingStep(
  actionType: ActionType,
  target: string,
  steps: AllowedStep[] | undefined,
): AllowedStep | undefined {
  if (!steps) return undefined;
  return steps.find((step) => {
    if (!step.action_types.includes(actionType)) return false;
    if (actionType === "shell") {
      return matchesPattern(target, step.command_patterns);
    }
    return matchesPattern(target, step.path_patterns);
  });
}

function isRunArtifactPath(projectRoot: string, runId: string, target: string): boolean {
  const rel = relativeTarget(projectRoot, target);
  return (
    rel.includes(`.agent-loop/runs/${runId}/plan.md`) ||
    rel.includes(`.agent-loop/runs/${runId}/review.md`)
  );
}

export function evaluateGate(
  input: GateInput,
  approval: ApprovalRecord,
): GateResult {
  const { project_root, run_id } = input;
  const actionType = classifyTool(input);
  const target = relativeTarget(project_root, extractTarget(input));
  const status = approval.status;

  if (approval.run_id !== run_id) {
    return { decision: "deny", reason: `Run ID mismatch: expected ${approval.run_id}, got ${run_id}` };
  }

  const planPath = runFile(project_root, run_id, "plan.md");
  let planContent = "";
  try {
    planContent = readText(planPath);
  } catch {
    return { decision: "deny", reason: "Plan file missing" };
  }

  if (approval.plan_hash && approval.signature) {
    const integrity = verifyPlanIntegrity(planContent, approval.plan_hash, approval.signature);
    if (!integrity.ok) {
      return { decision: "deny", reason: integrity.reason };
    }
  }

  if (isPreApproval(status)) {
    if (actionType === "read" || actionType === "search") {
      return { decision: "allow", reason: "Read/search allowed before approval" };
    }
    if (
      (actionType === "write_file") &&
      isRunArtifactPath(project_root, run_id, target)
    ) {
      return { decision: "allow", reason: "Plan/review edits allowed before approval" };
    }
    if (actionType === "shell" && isReadOnlyShell(target)) {
      return { decision: "allow", reason: "Read-only shell allowed before approval" };
    }
    return {
      decision: "deny",
      reason: `Action blocked: status=${status}. Complete plan/review and obtain user approval.`,
    };
  }

  if (!isExecutionAllowed(status)) {
    return { decision: "deny", reason: `Execution not allowed in status=${status}` };
  }

  if (HIGH_RISK.includes(actionType)) {
    const step = findMatchingStep(actionType, target, approval.allowed_steps);
    if (!step) {
      return {
        decision: "deny",
        reason: `High-risk action ${actionType} not declared in approved plan`,
      };
    }
  }

  const matched = findMatchingStep(actionType, target, approval.allowed_steps);
  if (!matched) {
    return {
      decision: "deny",
      reason: `Action not in allowed_steps: ${actionType} target=${target}`,
    };
  }

  return {
    decision: "allow",
    reason: "Allowed by approved plan",
    step_id: matched.step_id,
  };
}
