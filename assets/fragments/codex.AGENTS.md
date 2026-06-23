## Plantrail workflow

使用 `plantrail` CLI 执行计划 → 审查 → 批准 → 执行 → 证据 → 总结流程。

- 初始化：`plantrail init-run --goal "..."`
- 批准：只能由用户通过 `plantrail approve <run> --by user` 完成
- 动作前：运行 `plantrail status`；如果 hooks 缺失或未信任则停止（Codex 需要通过 `/hooks` 信任）

reviewer agents 只能写 `review.md`，不得批准。
