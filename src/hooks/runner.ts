import { runGate } from "../commands/gate.js";
import { getActiveRunId, resolveProjectRoot } from "../core/run-resolver.js";
import { isStopEvent, runLoopHeartbeat } from "../core/loop.js";
import type { GateResult, LoopHeartbeatResult } from "../types.js";

export interface NormalizedHookInput {
  event: string;
  tool: string;
  payload: Record<string, unknown>;
  project_root: string;
  run_id?: string;
}

export function readStdinJson(): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => {
      try {
        resolve(data ? (JSON.parse(data) as Record<string, unknown>) : {});
      } catch (err) {
        reject(err);
      }
    });
    process.stdin.on("error", reject);
  });
}

/** Execute a gate hook (non-Stop events). */
export function executeHook(normalize: (raw: Record<string, unknown>) => NormalizedHookInput): Promise<GateResult> {
  return readStdinJson().then((raw) => {
    const input = normalize(raw);
    const projectRoot = input.project_root || resolveProjectRoot();
    const runId = input.run_id ?? getActiveRunId(projectRoot) ?? undefined;
    if (!runId) {
      return { decision: "deny", reason: "No active run for gate" };
    }
    return runGate(projectRoot, {
      event: input.event,
      tool: input.tool,
      payload: input.payload,
      project_root: projectRoot,
      run_id: runId,
    });
  });
}

/** Execute a Stop hook — dispatches to loop heartbeat. */
export function executeStopHook(normalize: (raw: Record<string, unknown>) => NormalizedHookInput): Promise<LoopHeartbeatResult> {
  return readStdinJson().then((raw) => {
    const input = normalize(raw);
    const projectRoot = input.project_root || resolveProjectRoot();
    const runId = input.run_id ?? getActiveRunId(projectRoot) ?? undefined;

    // No active run → noop (allow stop, no loop to manage)
    if (!runId) {
      return { action: "noop" as const, reason: "no active run" };
    }
    return runLoopHeartbeat(projectRoot, runId, input.payload);
  });
}

/** Dispatch: Stop events → executeStopHook, others → executeHook. */
export function executeAnyHook(
  normalize: (raw: Record<string, unknown>) => NormalizedHookInput,
): Promise<{ isStop: boolean; gate?: GateResult; heartbeat?: LoopHeartbeatResult }> {
  return readStdinJson().then((raw) => {
    const input = normalize(raw);
    if (isStopEvent(input.event)) {
      // Stop path must never throw out to the caller — a Stop hook must exit 0.
      // Any failure degrades to a safe "noop" (allow the agent to end).
      try {
        const projectRoot = input.project_root || resolveProjectRoot();
        const runId = input.run_id ?? getActiveRunId(projectRoot) ?? undefined;
        if (!runId) {
          return { isStop: true, heartbeat: { action: "noop" as const, reason: "no active run" } };
        }
        const heartbeat = runLoopHeartbeat(projectRoot, runId, input.payload);
        return { isStop: true, heartbeat };
      } catch (err) {
        return {
          isStop: true,
          heartbeat: { action: "noop" as const, reason: `heartbeat error: ${String(err)}` },
        };
      }
    }
    // Gate path
    const projectRoot = input.project_root || resolveProjectRoot();
    const runId = input.run_id ?? getActiveRunId(projectRoot) ?? undefined;
    if (!runId) {
      return { isStop: false, gate: { decision: "deny" as const, reason: "No active run for gate" } };
    }
    const gate = runGate(projectRoot, {
      event: input.event,
      tool: input.tool,
      payload: input.payload,
      project_root: projectRoot,
      run_id: runId,
    });
    return { isStop: false, gate };
  });
}

// ── Gate responses (for PreToolUse / shell events) ──────────────────────────

export function cursorResponse(result: GateResult): string {
  if (result.decision === "deny") {
    return JSON.stringify({
      permission: "deny",
      agentMessage: result.reason,
      userMessage: result.reason,
    });
  }
  return JSON.stringify({ permission: "allow" });
}

export function claudeResponse(result: GateResult): string {
  if (result.decision === "deny") {
    return JSON.stringify({
      hookSpecificOutput: {
        permissionDecision: "deny",
        permissionDecisionReason: result.reason,
      },
    });
  }
  return JSON.stringify({});
}

export function codexResponse(result: GateResult): string {
  if (result.decision === "deny") {
    return JSON.stringify({ decision: "block", reason: result.reason });
  }
  return JSON.stringify({});
}

// ── Stop responses (for stop/Stop events) ───────────────────────────────────

/**
 * Cursor Stop: continue = followup_message, finish/noop = {}
 * Ref: https://cursor.com/docs/hooks — StopHookOutput
 */
export function cursorStopResponse(result: LoopHeartbeatResult): string {
  if (result.action === "continue" && result.followup_message) {
    return JSON.stringify({ followup_message: result.followup_message });
  }
  return JSON.stringify({});
}

/**
 * Claude Stop: block = { decision: "block", reason }, finish/noop = { decision: "approve" }
 * Ref: Claude Code hooks docs — Stop event
 */
export function claudeStopResponse(result: LoopHeartbeatResult): string {
  if (result.action === "continue" && result.followup_message) {
    return JSON.stringify({ decision: "block", reason: result.followup_message });
  }
  return JSON.stringify({ decision: "approve" });
}

/**
 * Codex Stop: block = { decision: "block", reason }, finish/noop = {}
 */
export function codexStopResponse(result: LoopHeartbeatResult): string {
  if (result.action === "continue" && result.followup_message) {
    return JSON.stringify({ decision: "block", reason: result.followup_message });
  }
  return JSON.stringify({});
}

export function hookErrorResponse(agent: "cursor" | "claude" | "codex", message: string): string {
  const result = { decision: "deny" as const, reason: message };
  if (agent === "claude") return claudeResponse(result);
  if (agent === "codex") return codexResponse(result);
  return cursorResponse(result);
}
