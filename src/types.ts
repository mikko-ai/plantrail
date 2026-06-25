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
  loop_policy?: LoopPolicy;
}

/** Runtime loop state stored in .agent-loop/runs/<id>/loop.json (not signed). */
export interface LoopState {
  run_id: string;
  /** Number of "continue" responses sent so far (0 = loop not yet started). */
  iteration: number;
  /** ISO timestamp when the current iteration started (used to determine evidence freshness). */
  iteration_start_ts: string;
  /** ISO timestamp of the last stop-check event seen by heartbeat. */
  last_stop_check?: string;
  abort_requested: boolean;
  abort_reason?: string;
  abort_by?: string;
  abort_at?: string;
}

/** Result of the loop heartbeat evaluation. */
export interface LoopHeartbeatResult {
  /** continue = block agent stop and send followup; finish = allow agent to stop; noop = no loop, pass through. */
  action: "continue" | "finish" | "noop";
  reason: string;
  /** The follow-up message injected into the agent when action=continue. */
  followup_message?: string;
  /** Target status when action=finish. */
  next_status?: "evidence_required" | "blocked" | "changes_requested";
  /** True when a terminal status could NOT be persisted (state may be inconsistent). */
  persist_failed?: boolean;
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

export interface LoopPolicy {
  stop_command: string;
  max_iterations: number;
}

export interface PlanDocument {
  goal: string;
  non_goals: string[];
  affected_modules: string[];
  steps: PlanStep[];
  high_risk_actions?: string[];
  loop?: LoopPolicy;
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

export type LogKind = "doing" | "decision" | "evidence" | "stop-check";

export interface WorkflowEvent {
  ts: string;
  kind: string;
  run_id: string;
  step_id?: string;
  message: string;
  meta?: Record<string, unknown>;
}
