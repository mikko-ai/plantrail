import { describe, expect, it } from "vitest";
import { canTransition, isPreApproval, invalidateOnPlanChange } from "../../src/core/state-machine.js";

describe("state-machine", () => {
  it("allows draft -> review_required", () => {
    expect(canTransition("draft", "review_required")).toBe(true);
  });

  it("rejects done -> draft", () => {
    expect(canTransition("done", "draft")).toBe(false);
  });

  it("invalidates approved on plan change", () => {
    expect(invalidateOnPlanChange("approved")).toBe("changes_requested");
    expect(invalidateOnPlanChange("draft")).toBeNull();
  });

  it("pre-approval states", () => {
    expect(isPreApproval("review_required")).toBe(true);
    expect(isPreApproval("doing")).toBe(false);
  });
});
