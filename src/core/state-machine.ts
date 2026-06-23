import type { ApprovalStatus } from "../types.js";

const TRANSITIONS: Record<ApprovalStatus, ApprovalStatus[]> = {
  draft: ["review_required", "blocked"],
  review_required: ["changes_requested", "approved", "blocked"],
  changes_requested: ["review_required", "blocked"],
  approved: ["doing", "changes_requested", "blocked"],
  doing: ["evidence_required", "changes_requested", "blocked"],
  evidence_required: ["done", "blocked"],
  done: [],
  blocked: ["draft"],
};

export function canTransition(from: ApprovalStatus, to: ApprovalStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: ApprovalStatus, to: ApprovalStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid state transition: ${from} -> ${to}`);
  }
}

export function isPreApproval(status: ApprovalStatus): boolean {
  return status === "draft" || status === "review_required" || status === "changes_requested";
}

export function isExecutionAllowed(status: ApprovalStatus): boolean {
  return status === "approved" || status === "doing" || status === "evidence_required";
}

export function invalidateOnPlanChange(status: ApprovalStatus): ApprovalStatus | null {
  if (status === "approved" || status === "doing") {
    return "changes_requested";
  }
  return null;
}
