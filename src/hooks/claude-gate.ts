import { claudeResponse, claudeStopResponse, executeAnyHook, hookErrorResponse, type NormalizedHookInput } from "./runner.js";

function normalize(raw: Record<string, unknown>): NormalizedHookInput {
  const event = String(raw.hook_event_name ?? "PreToolUse");
  const tool = String(raw.tool_name ?? raw.tool ?? "unknown");
  return {
    event,
    tool,
    payload: raw,
    project_root: process.env.CLAUDE_PROJECT_DIR ?? process.cwd(),
  };
}

executeAnyHook(normalize)
  .then((result) => {
    if (result.isStop) {
      // Stop hook: always exit 0
      console.log(claudeStopResponse(result.heartbeat!));
      process.exit(0);
    } else {
      console.log(claudeResponse(result.gate!));
      if (result.gate!.decision === "deny") process.exit(2);
    }
  })
  .catch((err) => {
    console.log(hookErrorResponse("claude", String(err)));
    process.exit(2);
  });
