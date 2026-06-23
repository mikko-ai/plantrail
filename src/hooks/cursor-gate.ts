import { cursorResponse, executeHook, hookErrorResponse, type NormalizedHookInput } from "./runner.js";

function normalize(raw: Record<string, unknown>): NormalizedHookInput {
  const event = String(raw.hook_event_name ?? raw.event ?? "preToolUse");
  const tool = event.includes("Shell")
    ? "beforeShellExecution"
    : String(raw.tool_name ?? raw.tool ?? event);
  const roots = (raw.workspace_roots as string[]) ?? [];
  return {
    event,
    tool,
    payload: raw,
    project_root: roots[0] ?? process.cwd(),
  };
}

executeHook(normalize)
  .then((result) => {
    console.log(cursorResponse(result));
    if (result.decision === "deny") process.exit(2);
  })
  .catch((err) => {
    console.log(hookErrorResponse("cursor", String(err)));
    process.exit(2);
  });
