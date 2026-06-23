---
name: agent-loop
description: Plantrail auditable workflow — Plan, Review, Approve, Doing, Evidence, Final. Use for any non-trivial task requiring plan approval before execution.
---

# Agent Loop (plantrail)

Follow this workflow for every substantial task:

1. `plantrail init-run --goal "..."` — create run under `.agent-loop/runs/`
2. Edit `plan.md` (goal, steps with stable `step_id`, verification, risks, rollback)
3. `plantrail validate-plan <run>` then `plantrail review-plan <run>`
4. Reviewer writes `review.md` only — conclusion `approved_recommendation` or `changes_requested`
5. User runs `plantrail approve <run> --by user` — only users may approve
6. Execute approved steps; log with `plantrail log --kind doing|decision|evidence --step-id ...`
7. `plantrail verify <run>` then `plantrail close <run> --status done`

## Before each action

Run `plantrail status` and confirm hooks are active. If hooks are missing or untrusted, stop and ask the user to install/trust plantrail.

## Rules

- Without approval: read/search and edit `plan.md`/`review.md` only; no shell except read-only whitelist
- Reviewer must not run `approve` or modify authority approval state
- Every significant action must map to an approved `step_id`
- Record verification output in `evidence.md` before closing
