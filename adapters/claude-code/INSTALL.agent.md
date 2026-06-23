# Plantrail install guide (Claude Code)

You are installing **plantrail** for Claude Code.

## Questions (ask user)

1. **Scope**: project (`.claude/settings.json`) or global (`~/.claude/settings.json`)? Default: **project**.
2. Keep default user-only approval? Default: **yes**.

## Install

```bash
npx plantrail install --agent claude --scope project
```

## Verify

```bash
npx plantrail status
```

Confirm `hook_probe.claude` is true. Use `/hooks` in Claude Code if hooks do not fire.

## Uninstall

```bash
npx plantrail uninstall --agent claude --scope project
```
