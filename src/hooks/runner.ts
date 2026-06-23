import { runGate } from "../commands/gate.js";
import { getActiveRunId, resolveProjectRoot } from "../core/run-resolver.js";
import type { GateResult } from "../types.js";

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

export function hookErrorResponse(agent: "cursor" | "claude" | "codex", message: string): string {
  const result = { decision: "deny" as const, reason: message };
  if (agent === "claude") return claudeResponse(result);
  if (agent === "codex") return codexResponse(result);
  return cursorResponse(result);
}
