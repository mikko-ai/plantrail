## Plantrail workflow

Use `plantrail` CLI for Plan → Review → Approve → Doing → Evidence → Final.

- Init: `plantrail init-run --goal "..."`
- Approve: only user via `plantrail approve <run> --by user`
- Before acting: `plantrail status` — stop if hooks missing/untrusted (Codex: `/hooks` trust required)

Reviewer agents write `review.md` only; they must not approve.
