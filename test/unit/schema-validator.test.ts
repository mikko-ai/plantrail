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

const validChinesePlan = `# 目标
实现功能

# 非目标
- 范围外事项

# 受影响模块
- src/core

# 步骤
## [s1] 准备
**描述：** 准备文件
**动作类型：** write_file, shell
**路径模式：** src/**
**命令模式：** npm test
**验证：** npm test
**风险：** low
**回滚：** git checkout
**需要用户确认：** false
`;

describe("schema-validator", () => {
  it("parses valid plan", () => {
    const plan = parsePlanMarkdown(validPlan);
    expect(plan.steps[0].step_id).toBe("s1");
    expect(plan.steps[0].verification).toBe("npm test");
  });

  it("parses valid Chinese plan templates", () => {
    const plan = parsePlanMarkdown(validChinesePlan);
    expect(plan.goal).toBe("实现功能");
    expect(plan.affected_modules).toEqual(["src/core"]);
    expect(plan.steps[0].step_id).toBe("s1");
    expect(plan.steps[0].description).toBe("准备文件");
    expect(plan.steps[0].action_types).toEqual(["write_file", "shell"]);
    expect(plan.steps[0].verification).toBe("npm test");
    expect(plan.steps[0].requires_user_confirm).toBe(false);
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
