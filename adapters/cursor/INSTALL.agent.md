# Plantrail install guide (Cursor)

You are installing **plantrail** for Cursor. Follow these steps and ask the user when choices are required.

## Questions (ask user)

1. **Scope**: project (`.cursor/` in repo) or global (`~/.cursor/`)? Default: **project**.
2. **Approval policy**: keep default user-only approval? Default: **yes**.
3. **High-risk actions**: use defaults (install deps, delete, git push, deploy, credentials)? Default: **yes**.

## Install

From the project root (or target workspace):

```bash
npx plantrail install --agent cursor --scope project
```

Use `--scope global` if the user chose global.

## Verify

```bash
npx plantrail status
```

Confirm `hook_probe.cursor` is true. If false, re-run install or check `.cursor/hooks.json`.

## Usage reminder

Tell the user:

- Run `plantrail init-run --goal "..."` to start a task
- Only the user may run `plantrail approve <run> --by user`
- Reviewer agents write `review.md` only

## Uninstall

```bash
npx plantrail uninstall --agent cursor --scope project
```
