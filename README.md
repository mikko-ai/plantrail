# plantrail

Cross-agent auditable workflow toolkit: **Plan → Review → Approve → Doing → Evidence → Final**.

Works with **Cursor**, **Codex**, and **Claude Code** via a shared core CLI and per-agent hooks.

## Positioning

plantrail provides **best-effort interception + strong audit + integrity protection**. It is not a hard sandbox. Hooks may fail-open when missing, untrusted, or not triggered (especially Codex file edits).

See [SPEC.md](./SPEC.md) for the full design.

## Quick start

```bash
npm install
npm run build
npx plantrail init-run --goal "Add feature X"
# edit .agent-loop/runs/<run>/plan.md
npx plantrail validate-plan <run>
npx plantrail review-plan <run>
# user only:
npx plantrail approve <run> --by user
npx plantrail log <run> --kind doing --step-id step-1 --message "Implemented"
npx plantrail verify <run>
npx plantrail close <run> --status done
```

## Install into agents

```bash
npx plantrail install --agent cursor,codex,claude --scope project
npx plantrail status
```

Agent-specific guided install: see [adapters/*/INSTALL.agent.md](./adapters/).

**Codex**: after install, run `/hooks` in Codex CLI and trust hooks manually.

## CLI commands

| Command | Purpose |
|---------|---------|
| `init-run --goal` | Create run |
| `validate-plan <run>` | Validate plan schema |
| `review-plan <run>` | Move to review_required |
| `request-changes <run> --reason` | Reviewer requests plan changes |
| `approve <run> --by user` | User approves (binds plan hash) |
| `gate` | Internal hook gate |
| `log` | Append doing/decision/evidence |
| `verify` / `close` | Evidence check and finish |
| `list` / `show` / `use` / `status` | Run management |
| `install` / `uninstall` | Agent integration |

## Agent capability notes

| Agent | Strengths | Weaknesses |
|-------|-----------|------------|
| **Cursor** | `preToolUse`, `beforeShellExecution` deny | `ask` ignored; verify deny on all paths |
| **Claude Code** | Full PreToolUse/Stop block | — |
| **Codex** | Bash PreToolUse stable | Manual `/hooks` trust; `apply_patch` unreliable |

## Threat model (summary)

- Hook missing/untrusted → fail-open; use `plantrail status`
- Plan tampering after approve → HMAC + hash invalidates approval
- Shell bypass (echo>, python -c) → unapproved state denies all shell except read-only whitelist
- HMAC key in `~/.plantrail/key` — same uid as agent; not resistant to shell during `doing`

## Development

```bash
npm test
npm run typecheck
```

## License

MIT
