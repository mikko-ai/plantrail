# Plantrail 安装指南（Claude Code）

你正在为 Claude Code 安装 **plantrail**。

## 需要询问用户

1. **安装范围**：项目级（`.claude/settings.json`）还是全局（`~/.claude/settings.json`）？默认：**项目级**。
2. 是否保留默认的仅用户可批准？默认：**是**。

## 安装

```bash
npx plantrail install --agent claude --scope project
```

## 验证

```bash
npx plantrail status
```

确认 `hook_probe.claude` 为 true。如果 hooks 未触发，在 Claude Code 中使用 `/hooks` 检查。

## 卸载

```bash
npx plantrail uninstall --agent claude --scope project
```
