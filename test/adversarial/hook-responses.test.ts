import { describe, expect, it } from "vitest";
import {
  claudeResponse,
  codexResponse,
  cursorResponse,
  hookErrorResponse,
  cursorStopResponse,
  claudeStopResponse,
  codexStopResponse,
} from "../../src/hooks/runner.js";

describe("gate hook responses", () => {
  it("cursor deny format", () => {
    const out = JSON.parse(cursorResponse({ decision: "deny", reason: "blocked" }));
    expect(out.permission).toBe("deny");
  });

  it("claude deny format", () => {
    const out = JSON.parse(claudeResponse({ decision: "deny", reason: "blocked" }));
    expect(out.hookSpecificOutput.permissionDecision).toBe("deny");
  });

  it("claude hookErrorResponse uses permissionDecision", () => {
    const out = JSON.parse(hookErrorResponse("claude", "fail-closed"));
    expect(out.hookSpecificOutput.permissionDecision).toBe("deny");
  });

  it("codex deny format", () => {
    const out = JSON.parse(codexResponse({ decision: "deny", reason: "blocked" }));
    expect(out.decision).toBe("block");
  });
});

describe("stop hook responses (loop heartbeat)", () => {
  it("cursor stop: continue → followup_message", () => {
    const out = JSON.parse(cursorStopResponse({ action: "continue", reason: "x", followup_message: "keep going" }));
    expect(out.followup_message).toBe("keep going");
  });

  it("cursor stop: finish → {} (allow ending)", () => {
    const out = JSON.parse(cursorStopResponse({ action: "finish", reason: "done" }));
    expect(Object.keys(out)).toHaveLength(0);
  });

  it("cursor stop: noop → {} (allow ending)", () => {
    const out = JSON.parse(cursorStopResponse({ action: "noop", reason: "no loop" }));
    expect(Object.keys(out)).toHaveLength(0);
  });

  it("claude stop: continue → decision:block", () => {
    const out = JSON.parse(claudeStopResponse({ action: "continue", reason: "x", followup_message: "continue msg" }));
    expect(out.decision).toBe("block");
    expect(out.reason).toBe("continue msg");
  });

  it("claude stop: finish → decision:approve", () => {
    const out = JSON.parse(claudeStopResponse({ action: "finish", reason: "done" }));
    expect(out.decision).toBe("approve");
  });

  it("codex stop: continue → decision:block", () => {
    const out = JSON.parse(codexStopResponse({ action: "continue", reason: "x", followup_message: "go" }));
    expect(out.decision).toBe("block");
  });

  it("codex stop: finish → {}", () => {
    const out = JSON.parse(codexStopResponse({ action: "finish", reason: "done" }));
    expect(Object.keys(out)).toHaveLength(0);
  });
});
