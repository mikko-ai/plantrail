import { describe, expect, it } from "vitest";
import { parsePlanMarkdown, validateApproval } from "../../src/core/schema-validator.js";

const validPlan = `# Goal
Implement feature

# Non-goals
- Out of scope

# Affected modules
- src/core

# Steps
## [s1] Setup
**Description:** setup files
**Action types:** write_file, shell
**Path patterns:** src/**
**Command patterns:** npm test
**Verification:** npm test
**Risks:** low
**Rollback:** git checkout
`;

describe("schema-validator", () => {
  it("parses valid plan", () => {
    const plan = parsePlanMarkdown(validPlan);
    expect(plan.steps[0].step_id).toBe("s1");
    expect(plan.steps[0].verification).toBe("npm test");
  });

  it("rejects plan missing verification", () => {
    const bad = validPlan.replace("**Verification:** npm test", "**Verification:** ");
    expect(() => parsePlanMarkdown(bad)).toThrow();
  });

  it("validates approval record", () => {
    expect(() =>
      validateApproval({
        run_id: "r1",
        status: "draft",
        updated_at: new Date().toISOString(),
      }),
    ).not.toThrow();
  });
});
