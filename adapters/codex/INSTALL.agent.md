# Plantrail install guide (Codex)

You are installing **plantrail** for OpenAI Codex CLI.

## Questions (ask user)

1. **Scope**: project (`.codex/` in repo) or global (`~/.codex/`)? Default: **project**.
2. Confirm they can run **`/hooks`** in Codex to trust hooks (required — no programmatic trust API).

## Install

```bash
npx plantrail install --agent codex --scope project
```

## Manual trust (required)

After install, instruct the user:

1. Open Codex CLI in this project
2. Run `/hooks`
3. Review and **trust** plantrail hooks

Until trusted, enforcement is **fail-open**.

## Verify

```bash
npx plantrail status
```

Check warnings for Codex trust status.

## Uninstall

```bash
npx plantrail uninstall --agent codex --scope project
```
