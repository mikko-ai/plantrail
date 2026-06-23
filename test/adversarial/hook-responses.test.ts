import { describe, expect, it } from "vitest";
import {
  claudeResponse,
  codexResponse,
  cursorResponse,
  hookErrorResponse,
} from "../../src/hooks/runner.js";

describe("hook responses", () => {
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
