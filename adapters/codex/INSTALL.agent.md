# Plantrail 安装指南（Codex）

你正在为 OpenAI Codex CLI 安装 **plantrail**。

## 需要询问用户

1. **安装范围**：项目级（仓库内 `.codex/`）还是全局（`~/.codex/`）？默认：**项目级**。
2. 确认用户可以在 Codex 中运行 **`/hooks`** 来信任 hooks（必需；没有程序化 trust API）。

## 安装

```bash
npx plantrail install --agent codex --scope project
```

## 手动信任（必需）

安装后，提醒用户：

1. 在本项目中打开 Codex CLI
2. 运行 `/hooks`
3. 检查并 **trust** plantrail hooks

在完成信任前，门禁会 **fail-open**。

## 验证

```bash
npx plantrail status
```

检查输出中的 Codex trust 状态警告。

## 卸载

```bash
npx plantrail uninstall --agent codex --scope project
```
