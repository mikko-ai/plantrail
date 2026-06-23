# plantrail

跨 agent 的可审计工作流工具包：**计划 → 审查 → 批准 → 执行 → 证据 → 总结**。

plantrail 通过共享的核心 CLI 与各 agent hook，支持 **Cursor**、**Codex** 和 **Claude Code**。

## 定位

plantrail 提供 **尽力拦截 + 强审计 + 完整性保护**。它不是硬沙箱；当 hook 缺失、未信任或未触发时可能 fail-open（尤其是 Codex 文件编辑）。

完整设计见 [SPEC.md](./SPEC.md)。

## 快速开始

```bash
npm install
npm run build
npx plantrail init-run --goal "Add feature X"
# 编辑 .agent-loop/runs/<run>/plan.md
npx plantrail validate-plan <run>
npx plantrail review-plan <run>
# 仅用户执行：
npx plantrail approve <run> --by user
npx plantrail log <run> --kind doing --step-id step-1 --message "Implemented"
npx plantrail verify <run>
npx plantrail close <run> --status done
```

## 安装到 agent

```bash
npx plantrail install --agent cursor,codex,claude --scope project
npx plantrail status
```

面向不同 agent 的引导式安装说明见 [adapters/*/INSTALL.agent.md](./adapters/)。

**Codex**：安装后需要在 Codex CLI 中运行 `/hooks`，并手动信任 hooks。

## CLI 命令

| 命令 | 用途 |
|---------|---------|
| `init-run --goal` | 创建 run |
| `validate-plan <run>` | 校验 plan schema |
| `review-plan <run>` | 流转到 review_required |
| `request-changes <run> --reason` | 审查方要求修改计划 |
| `approve <run> --by user` | 用户批准，并绑定 plan 哈希 |
| `gate` | 内部 hook 门禁 |
| `log` | 追加 doing/decision/evidence 日志 |
| `verify` / `close` | 检查证据并完成 |
| `list` / `show` / `use` / `status` | run 管理 |
| `install` / `uninstall` | agent 接入 |

## Agent 能力说明

| Agent | 优势 | 弱点 |
|-------|-----------|------------|
| **Cursor** | `preToolUse`、`beforeShellExecution` 可 deny | `ask` 会被忽略；需要验证所有路径上的 deny |
| **Claude Code** | 完整的 PreToolUse/Stop 阻断 | — |
| **Codex** | Bash PreToolUse 稳定 | 需要手动 `/hooks` 信任；`apply_patch` 不可靠 |

## 威胁模型摘要

- Hook 缺失或未信任 → fail-open；用 `plantrail status` 自检
- 批准后篡改 plan → HMAC + 哈希会让批准失效
- Shell 旁路（`echo>`、`python -c`）→ 未批准态 deny 所有非只读白名单 shell
- HMAC 密钥在 `~/.plantrail/key`，与 agent 同 uid；不抵抗 `doing` 阶段已放行的 shell

## 开发

```bash
npm test
npm run typecheck
```

## 许可证

MIT
