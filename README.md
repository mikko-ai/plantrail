# plantrail

跨 agent 的可审计工作流工具包：**计划 → 审查 → 批准 → 执行 → 证据 → 总结**。

plantrail 通过共享的核心 CLI 与各 agent hook，支持 **Cursor**、**Codex** 和 **Claude Code**。npm 包名为 `@mikko/plantrail`，全局安装后 CLI 命令为 `plantrail`；运行目录与主 skill 沿用历史命名 `agent-loop`（`.agent-loop/`、`skills/agent-loop`），二者指同一系统。

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

## Hook 支持与设计

plantrail 的门禁完全建立在各 agent 的 hook 机制之上：在 agent 真正执行动作（跑命令、调用工具、改文件）之前，hook 把请求交给 core 裁决，未批准则阻断。下面说明**目前支持哪些 hook、它们如何设计、以及规划中的扩展**。

### 设计原则

1. **归一化 gate + 各 agent 适配**：每个 agent 的 hook 模型不同（事件名、配置格式、信任机制各异）。plantrail 的 hook 只做两件事——把各 agent 的 payload **归一化**成统一 `HookSpec`，再把 core 的裁决**翻译**回该 agent 要求的响应格式。所有裁决逻辑集中在 core，agent 适配层不含策略。
2. **scope 与 agent 正交**：项目级（`project`）还是全局级（`global`）只影响 hook 配置文件的**根目录**，不影响结构与逻辑。新增 scope 或新 agent 不会引发散弹式改动。
3. **幂等可重入**：当同一事件在多个 scope（如项目级 + 全局级）都注册了 gate 时，hook 会被触发多次。gate 裁决保证幂等——多次执行给出一致结果、不产生重复副作用。
4. **fail-closed 默认**：核心裁决倾向拒绝；只有显式 `approved` 且 `plan_hash` 匹配才放行。
5. **分层自检**：`plantrail status` 分别探测各 scope 的 hook 是否生效，明确告诉用户门禁实际从哪一层生效，避免 fail-open 盲区。

### 目前支持的 agent 与 hook 事件

| Agent | 拦截执行（命令/工具） | 记录证据（文件编辑） | 收尾检查 | 信任机制 |
|---|---|---|---|---|
| **Cursor** | `beforeShellExecution`、`beforeMCPExecution` | `afterFileEdit` | `stop` | 默认生效，无独立信任步骤 |
| **Codex** | 命令执行前拦截（归一化自 Codex tool/exec 钩子） | — | 停止时收尾 | **需手动信任**：在 Codex CLI 运行 `/hooks` 并确认，否则 fail-open |
| **Claude Code** | `PreToolUse`（command/edit） | `PostToolUse` | `Stop` | 默认生效，建议核对 `settings.json` |

- **拦截执行**是门禁核心：未批准的计划尝试进入执行阶段时，hook 返回拒绝（Cursor 形如 `{"permission":"deny"}`）并阻断。
- **记录证据**用于在文件被修改后留痕，落到 `.agent-loop/runs/<run-id>/evidence.md`。
- **收尾检查**在 agent 停止时做一致性校验。

### scope：项目级与全局级

```bash
plantrail install --agent cursor,codex,claude --scope project   # 仅当前项目（默认）
plantrail install --agent cursor --scope global                 # 当前用户的所有项目
```

- **项目级**写入项目内的 agent 配置目录（如 Cursor 的 `.cursor/hooks/hooks.json`），随项目生效。
- **全局级**写入用户主目录（如 `~/.cursor/hooks.json`），对该用户所有项目生效。
- 多 scope 同时存在时，多数 agent 会**加性合并**——同一事件的所有 hook 都会执行，因此 gate 设计为幂等可重入（见上）。

### 规划中的扩展（Roadmap）

- **更多 Cursor 事件**：接入 `beforeReadFile`（敏感文件/密钥扫描）与 `beforeSubmitPrompt`（prompt 审计），把门禁从“执行前”前移到“读取/提问前”。
- **统一证据钩子**：让 Codex 也具备等价于 `afterFileEdit` / `PostToolUse` 的证据记录能力，三端证据格式对齐。
- **更多 agent 适配**：在现有 adapter 接口下扩展到其它支持 hook 的 agent。
- **scope 策略增强**：完善 `--scope global` 与 `both` 的安装、校验与冲突提示。

> 各 agent 的引导式安装细节见 [adapters/*/INSTALL.agent.md](./adapters/)。

## 使用引导

### 1. 安装与接入

**开发本仓库**（本地调试 CLI 与 hook）：

```bash
npm install
npm run build
```

**接入到你的项目**（让 agent 受门禁约束）：

```bash
npx @mikko/plantrail install --agent cursor,codex,claude --scope project
npx @mikko/plantrail status
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
npx @mikko/plantrail init-run --goal "添加用户登录功能"

# 2. 编辑计划（run id 为 init-run 输出的时间戳-slug）
#    路径：.agent-loop/runs/<run>/plan.md
#    填写目标、步骤（step_id）、验证方式、风险、回滚等

npx @mikko/plantrail validate-plan <run>
npx @mikko/plantrail review-plan <run>

# 3. 让 reviewer agent 填写 review.md（或人工审查）

# 4. 仅用户可批准
npx @mikko/plantrail approve <run> --by user

# 5. agent 按 plan 执行，并记录日志
npx @mikko/plantrail log <run> --kind doing --step-id step-1 --message "已实现登录 API"

# 6. 填写 evidence.md 后验证并关闭
npx @mikko/plantrail verify <run>
npx @mikko/plantrail close <run> --status done
```

常用管理命令：

```bash
npx @mikko/plantrail list          # 列出所有 run
npx @mikko/plantrail show <run>    # 查看 run 摘要
npx @mikko/plantrail use <run>     # 切换当前 active run
npx @mikko/plantrail status        # hook 存活自检
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
