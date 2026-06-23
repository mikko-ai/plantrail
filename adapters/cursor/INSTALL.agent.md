# Plantrail 安装指南（Cursor）

你正在为 Cursor 安装 **plantrail**。按以下步骤执行；遇到需要选择的地方，先询问用户。

## 需要询问用户

1. **安装范围**：项目级（仓库内 `.cursor/`）还是全局（`~/.cursor/`）？默认：**项目级**。
2. **审批策略**：是否保留默认的仅用户可批准？默认：**是**。
3. **高危动作**：是否使用默认清单（安装依赖、删除、`git push`、部署、凭据）？默认：**是**。

## 安装

在项目根目录（或目标工作区）运行：

```bash
npx plantrail install --agent cursor --scope project
```

如果用户选择全局安装，改用 `--scope global`。

## 验证

```bash
npx plantrail status
```

确认 `hook_probe.cursor` 为 true。若为 false，重新运行安装命令或检查 `.cursor/hooks.json`。

## 使用提醒

告诉用户：

- 运行 `plantrail init-run --goal "..."` 开始任务
- 只有用户可以运行 `plantrail approve <run> --by user`
- reviewer agent 只能写 `review.md`

## 卸载

```bash
npx plantrail uninstall --agent cursor --scope project
```
