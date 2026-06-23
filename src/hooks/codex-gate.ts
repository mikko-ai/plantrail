import { codexResponse, executeHook, hookErrorResponse, type NormalizedHookInput } from "./runner.js";

function normalize(raw: Record<string, unknown>): NormalizedHookInput {
  const event = String(raw.hook_event_name ?? raw.event ?? "PreToolUse");
  const tool = String(raw.tool_name ?? raw.tool ?? "Bash");
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
    console.log(codexResponse(result));
    if (result.decision === "deny") process.exit(2);
  })
  .catch((err) => {
    console.log(hookErrorResponse("codex", String(err)));
    process.exit(2);
  });
