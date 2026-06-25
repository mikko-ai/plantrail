---
name: agent-loop
description: Plantrail 可审计工作流：计划、审查、批准、执行、证据、总结。用于任何需要先批准计划再执行的非简单任务。支持自驱动 loop：声明停止条件后 agent 反复执行直到条件满足。
---

## 自驱动 Loop 工作流

当计划中包含「停止条件」章节时，批准后 agent 进入自驱动模式：

1. **声明停止条件**：在 `plan.md` 的 `# 停止条件` 章节写入：
   ```markdown
   **命令:** npm test
   **循环上限:** 10
   ```
2. **批准**：`plantrail approve <run> --by user` — 生成 `loop_policy`，同时完成 `plan_hash` 签名。
3. **自驱动执行**：每轮执行结束时，Stop hook 作为"心跳"触发：
   - 运行停止命令并记录证据：`plantrail log <run> --kind stop-check --command "npm test" --exit-code <code> --output-hash <hash>`
   - 停止条件满足（exit 0 且新鲜证据存在）→ 自动转入 `evidence_required`
   - 未满足 → 回灌"继续执行"指令，进入下一迭代
4. **手动终止**：`plantrail abort <run> --by user --reason "..."` — 下一次 Stop hook 触发时会立即停止并转为 `blocked`
5. **触顶**：达到 `max_iterations` 后自动转为 `blocked`

**关键规则：**
- 停止条件仅靠结构化 `loop_stop_check` 事件判定，agent 不应手工修改证据
- 心跳不执行 shell 命令，仅读取结构化证据
- 各端 Stop hook 响应：Cursor `followup_message`、Claude/Codex `decision: "block"`
- Cursor 云端 agent 暂不支持 Stop hook，需使用 Cursor SDK 外部 driver

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
