# AGENTS.md

本文件为在本仓库中工作的 AI agent 提供项目级指导。

## 基本约定

- 默认使用简体中文交流与编写说明性 Markdown。
- 保留命令、路径、状态值、schema 字段、API 名称等字面量的原始英文。
- 遵循现有 TypeScript、测试和文档风格，避免无关重构。
- 不要回退用户或其他 agent 已做的改动，除非用户明确要求。

## Plantrail 工作流

使用 `plantrail` CLI 执行计划 → 审查 → 批准 → 执行 → 证据 → 总结流程。

- 初始化：`plantrail init-run --goal "..."`
- 批准：只能由用户通过 `plantrail approve <run> --by user` 完成
- 动作前：运行 `plantrail status`；如果 hooks 缺失或未信任则停止
- reviewer agents 只能写 `review.md`，不得批准

## 开发验证

- 修改 TypeScript 后运行 `npm run typecheck`。
- 修改行为或工作流后运行相关测试，必要时运行 `npm test`。
- 修改 hook 相关源码后运行 `npm run build`，确保生成的 hook bundle 同步。
