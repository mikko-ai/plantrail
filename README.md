# plantrail

跨 agent 的可审计工作流工具包：**计划 → 审查 → 批准 → 执行 → 证据 → 总结**。

plantrail 通过共享的核心 CLI 与各 agent hook，支持 **Cursor**、**Codex** 和 **Claude Code**。工具包名为 `plantrail`，运行目录与主 skill 沿用历史命名 `agent-loop`（`.agent-loop/`、`skills/agent-loop`），二者指同一系统。

## 设计思路

plantrail 不是操作系统级硬沙箱，而是 **尽力拦截 + 强审计 + 完整性保护** 的工作流门禁。Cursor / Codex / Claude Code 的 hook 都存在覆盖盲区与 fail-open 情况，因此核心策略是：

1. **固定流程落地为文件**：每次任务走同一套阶段文档（`plan.md`、`review.md`、`evidence.md` 等），可读、可 diff、可复盘。
2. **批准与 plan 内容绑定**：用户 `approve` 时计算 `plan_hash` 并 HMAC 签名；批准后改动 plan 会使批准自动失效。
3. **权威状态在项目树外**：`~/.plantrail/state/<run>/approval.json` 为权威；项目内 `approval.json` 仅为只读副本，降低直接提权篡改风险。
4. **归一化 gate + 各 agent 适配**：三个 agent 的 hook 只做 payload 归一化与响应格式翻译，裁决逻辑集中在 core。
5. **hook 自检**：`plantrail status` 探测 hook 是否生效；SKILL 要求 agent 动作前自检，缺失或未信任则停止。

核心原则：**没有被批准且未被篡改的计划，agent 不能进入执行阶段**。reviewer agent 只能写 `review.md` 给建议，只有用户通过 `plantrail approve <run> --by user` 能放行。

完整威胁模型与状态机见 [SPEC.md](./SPEC.md)。

```text
需求(request) → 计划(plan) → 审查(review) → 审批(approval) → 执行(doing) → 证据(evidence) → 总结(final)
```

## 使用引导

### 1. 安装与接入

**开发本仓库**（本地调试 CLI 与 hook）：

```bash
npm install
npm run build
```

**接入到你的项目**（让 agent 受门禁约束）：

```bash
npx plantrail install --agent cursor,codex,claude --scope project
npx plantrail status
```

- 面向不同 agent 的引导式安装说明见 [adapters/*/INSTALL.agent.md](./adapters/)。
- **Codex**：安装后需在 Codex CLI 中运行 `/hooks` 并手动信任 hooks，否则门禁 fail-open。
- 安装后 agent 会获得 `skills/agent-loop/SKILL.md` 与对应 rules/fragments。

### 2. 配置语言（可选）

在 `.agent-loop/config.json` 中设置生成 Markdown 的语言（默认 `zh-CN`）：

```json
{
  "language": "zh-CN"
}
```

支持 `zh-CN` 与 `en`。影响 `init-run` 生成的 `request.md`、run 模板（`plan.md` 等）以及 `review-plan` 追加的审查清单。内部状态值、schema 字段、`step_id` 等机器契约仍为英文。

### 3. 人类用户：一次完整任务

```bash
# 1. 创建 run
npx plantrail init-run --goal "添加用户登录功能"

# 2. 编辑计划（run id 为 init-run 输出的时间戳-slug）
#    路径：.agent-loop/runs/<run>/plan.md
#    填写目标、步骤（step_id）、验证方式、风险、回滚等

npx plantrail validate-plan <run>
npx plantrail review-plan <run>

# 3. 让 reviewer agent 填写 review.md（或人工审查）

# 4. 仅用户可批准
npx plantrail approve <run> --by user

# 5. agent 按 plan 执行，并记录日志
npx plantrail log <run> --kind doing --step-id step-1 --message "已实现登录 API"

# 6. 填写 evidence.md 后验证并关闭
npx plantrail verify <run>
npx plantrail close <run> --status done
```

常用管理命令：

```bash
npx plantrail list          # 列出所有 run
npx plantrail show <run>    # 查看 run 摘要
npx plantrail use <run>     # 切换当前 active run
npx plantrail status        # hook 存活自检
```

### 4. Agent 使用约定

agent 执行实质性任务前应遵循：

1. `plantrail init-run --goal "..."` 创建 run。
2. 编辑 `plan.md`，再 `validate-plan` → `review-plan`。
3. reviewer 只写 `review.md`，**不得**运行 `approve`。
4. 等待用户 `approve <run> --by user`。
5. 每次动作前运行 `plantrail status`；hooks 缺失或未信任则停止并请用户处理。
6. 重要动作映射到已批准的 `step_id`，用 `log` 记录；close 前在 `evidence.md` 写入验证输出。

仓库内协作者另见 [AGENTS.md](./AGENTS.md)。

## 项目结构

### 仓库目录

```text
plantrail/
  src/
    cli.ts                 # CLI 入口
    commands/              # init-run、approve、gate、install 等命令
    core/                  # 状态机、完整性、门禁策略、schema 校验、i18n
    hooks/                 # 各 agent hook 源码（构建后打入 assets/hooks）
    adapters/              # install / uninstall 逻辑
    paths.ts               # 路径常量
    types.ts               # 共享类型
  assets/
    templates/zh-CN|en/    # 多语言 run 模板
    schemas/               # approval、plan、event JSON Schema
    hooks/cursor|codex|claude/  # esbuild 单文件 hook bundle
    skills/agent-loop/     # 主 workflow skill
    fragments/             # 写入各 agent 的 rules 片段
  adapters/
    cursor|codex|claude-code/INSTALL.agent.md  # agent 自助安装说明
  test/
    unit/ integration/ adversarial/
  dist/                    # tsc 输出 + CLI bin
  SPEC.md                  # 完整设计规格
  AGENTS.md                # 仓库内 agent 协作约定
```

### 运行时目录

**项目内**（可提交、可审计）：

```text
<project>/.agent-loop/
  config.json              # scope、审批策略、language、高危动作、已装 agent
  current-run              # 便利指针（不单独授权）
  runs/<YYYY-MM-DD-HHMMSS-slug>/
    request.md plan.md review.md
    approval.json          # 只读副本
    doing.md evidence.md final.md
    events.jsonl           # 审计事件流
    .lock
```

**用户目录**（权威状态，不入项目树）：

```text
~/.plantrail/
  key                      # HMAC 密钥（chmod 600）
  state/<run>/approval.json  # 权威 approval（签名 + plan_hash）
```

### 架构分层

```text
Agent hooks (Cursor / Codex / Claude)
        ↓ 归一化 payload
plantrail gate (core)
        ↓ 完整性校验 + 状态机 + allowed_steps
allow / deny → events.jsonl
```

## CLI 命令

| 命令 | 用途 |
|------|------|
| `init-run --goal` | 创建 run |
| `validate-plan <run>` | 校验 plan schema |
| `review-plan <run>` | 流转到 `review_required` |
| `request-changes <run> --reason` | 审查方要求修改计划 |
| `approve <run> --by user` | 用户批准，并绑定 plan 哈希 |
| `gate` | 内部 hook 门禁（不面向人） |
| `log` | 追加 `doing` / `decision` / `evidence` 日志 |
| `verify` / `close` | 检查证据并完成 |
| `list` / `show` / `use` / `status` | run 管理 |
| `install` / `uninstall` | agent 接入 |

## Agent 能力说明

| Agent | 优势 | 弱点 |
|-------|------|------|
| **Cursor** | `preToolUse`、`beforeShellExecution` 可 deny | `ask` 会被忽略；需验证各路径 deny |
| **Claude Code** | 完整的 PreToolUse / Stop 阻断 | — |
| **Codex** | Bash PreToolUse 稳定 | 需手动 `/hooks` 信任；`apply_patch` 不可靠 |

## 威胁模型摘要

- Hook 缺失或未信任 → fail-open；用 `plantrail status` 自检
- 批准后篡改 plan → HMAC + 哈希会让批准失效
- Shell 旁路（`echo>`、`python -c`）→ 未批准态 deny 非只读白名单 shell
- HMAC 密钥在 `~/.plantrail/key`，与 agent 同 uid；不抵抗 `doing` 阶段已放行的 shell

## 开发

```bash
npm test
npm run typecheck
npm run build   # 修改 hook 相关源码后必须执行，同步 assets/hooks bundle
```

## 许可证

MIT
