export type ApprovalStatus =
  | "draft"
  | "review_required"
  | "changes_requested"
  | "approved"
  | "doing"
  | "evidence_required"
  | "done"
  | "blocked";

export type ActionType =
  | "read"
  | "search"
  | "write_file"
  | "shell"
  | "install_deps"
  | "delete_file"
  | "git_commit"
  | "git_push"
  | "deploy"
  | "credentials";

export interface AllowedStep {
  step_id: string;
  action_types: ActionType[];
  path_patterns?: string[];
  command_patterns?: string[];
}

export interface ApprovalRecord {
  run_id: string;
  status: ApprovalStatus;
  plan_hash?: string;
  signature?: string;
  allowed_steps?: AllowedStep[];
  approved_by?: string;
  approved_at?: string;
  updated_at: string;
}

export interface PlanStep {
  step_id: string;
  title: string;
  description: string;
  action_types: ActionType[];
  path_patterns?: string[];
  command_patterns?: string[];
  verification: string;
  risks: string;
  rollback: string;
  requires_user_confirm?: boolean;
}

export interface PlanDocument {
  goal: string;
  non_goals: string[];
  affected_modules: string[];
  steps: PlanStep[];
  high_risk_actions?: string[];
}

export interface GateInput {
  run_id: string;
  event: string;
  tool: string;
  payload: Record<string, unknown>;
  project_root: string;
}

export type GateDecision = "allow" | "deny";

export interface GateResult {
  decision: GateDecision;
  reason: string;
  step_id?: string;
}

export interface AgentLoopConfig {
  scope: "project" | "global";
  approval_policy: "user";
  high_risk_actions: ActionType[];
  installed_agents: string[];
  language?: "zh-CN" | "en";
}

export type LogKind = "doing" | "decision" | "evidence";

export interface WorkflowEvent {
  ts: string;
  kind: string;
  run_id: string;
  step_id?: string;
  message: string;
  meta?: Record<string, unknown>;
}
