---
name: agent-loop
description: Plantrail 可审计工作流：计划、审查、批准、执行、证据、总结。用于任何需要先批准计划再执行的非简单任务。
---

# Agent Loop (plantrail)

所有实质性任务都遵循以下工作流：

1. `plantrail init-run --goal "..."` — 在 `.agent-loop/runs/` 下创建 run
2. 编辑 `plan.md`（目标、带稳定 `step_id` 的步骤、验证方式、风险、回滚）
3. 先运行 `plantrail validate-plan <run>`，再运行 `plantrail review-plan <run>`
4. reviewer 只能写 `review.md`，结论为 `approved_recommendation` 或 `changes_requested`
5. 用户运行 `plantrail approve <run> --by user`；只有用户可以批准
6. 执行已批准步骤；用 `plantrail log --kind doing|decision|evidence --step-id ...` 记录日志
7. 运行 `plantrail verify <run>`，再运行 `plantrail close <run> --status done`

## 每次动作前

运行 `plantrail status` 并确认 hooks 处于活动状态。如果 hooks 缺失或未信任，停止操作并请用户安装或信任 plantrail。

## 规则

- 未批准时：只能读/搜，以及编辑 `plan.md`/`review.md`；除只读白名单外不得使用 shell
- reviewer 不得运行 `approve`，也不得修改权威审批状态
- 每个重要动作都必须映射到已批准的 `step_id`
- close 前必须把验证输出记录到 `evidence.md`
