import { appendEvent, requireRun } from "../core/run-store.js";
import { readLoopState, writeLoopState } from "../core/loop.js";
import { withRunLockRetry } from "../core/lock.js";

export function abortRun(
  projectRoot: string,
  runId: string,
  by: string,
  reason: string,
): void {
  // actor check is intentionally enforced here in core (not only in the CLI layer):
  // only the user may abort a run.
  if (by !== "user") {
    throw new Error("Only --by user can abort a run");
  }
  requireRun(projectRoot, runId);

  // Share the run lock with the heartbeat so a concurrent heartbeat cannot overwrite
  // the abort flag with a stale snapshot of loop.json (read-modify-write race).
  withRunLockRetry(
    projectRoot,
    runId,
    () => {
      const state = readLoopState(projectRoot, runId);
      writeLoopState(projectRoot, runId, {
        ...state,
        abort_requested: true,
        abort_reason: reason,
        abort_by: by,
        abort_at: new Date().toISOString(),
      });
      appendEvent(projectRoot, runId, {
        kind: "loop_abort_requested",
        message: `Abort requested by ${by}: ${reason}`,
      });
    },
    () => {
      throw new Error(
        "Could not acquire run lock to abort (a heartbeat may be in progress). Retry shortly.",
      );
    },
    5000,
  );
}
